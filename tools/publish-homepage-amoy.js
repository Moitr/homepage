'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  Contract,
  JsonRpcProvider,
  Wallet,
  concat,
  formatEther,
  getAddress,
  toUtf8Bytes
} = require('ethers');
const {
  AMOY_CHAIN_ID,
  AMOY_EXPLORER_URL,
  AMOY_RPC_URL,
  DEPLOYMENT_SALT,
  DETERMINISTIC_DEPLOYER,
  MAX_HTML_BYTES,
  compileHomepageArchive,
  deterministicContract,
  homepageContentHash
} = require('./lib/homepage-onchain');

const ROOT = path.join(__dirname, '..');
const HOMEPAGE_PATH = path.join(ROOT, 'public', 'index.html');
const CHECK_ONLY = process.argv.includes('--check');
const CHECK_ADDRESS = '0x000000000000000000000000000000000000dEaD';

function requiredPrivateKey() {
  const value = String(process.env.POLYGON_PRIVATE_KEY || '').trim();
  if (!value) {
    throw new Error('POLYGON_PRIVATE_KEY is required. Use a dedicated Amoy testnet wallet.');
  }
  return value.startsWith('0x') ? value : `0x${value}`;
}

function bufferedGas(value) {
  return (value * 120n) / 100n;
}

async function assertAffordable(provider, wallet, transaction) {
  const [balance, gas, fees] = await Promise.all([
    provider.getBalance(wallet.address),
    wallet.estimateGas(transaction),
    provider.getFeeData()
  ]);
  const gasPrice = fees.maxFeePerGas || fees.gasPrice;
  if (!gasPrice) throw new Error('The Amoy RPC did not return a gas price.');
  const estimatedCost = bufferedGas(gas) * gasPrice;
  if (balance < estimatedCost) {
    throw new Error(
      `Insufficient Amoy POL in ${wallet.address}. ` +
      `Balance: ${formatEther(balance)} POL; estimated requirement: ${formatEther(estimatedCost)} POL.`
    );
  }
  return bufferedGas(gas);
}

function appendEnvironment(metadata) {
  const values = {
    ONCHAIN_WALLET_ADDRESS: metadata.walletAddress,
    ONCHAIN_BLOCK_HEIGHT: metadata.blockHeight,
    ONCHAIN_LATEST_BLOCK_HEIGHT: metadata.latestBlockHeight,
    ONCHAIN_TRANSACTION_HASH: metadata.transactionHash,
    ONCHAIN_CONTRACT_ADDRESS: metadata.contractAddress
  };
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';

  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, lines, 'utf8');
  if (process.env.GITHUB_OUTPUT) {
    const outputs = [
      `uploaded=${metadata.uploaded}`,
      `content_hash=${metadata.contentHash}`,
      `contract_address=${metadata.contractAddress}`,
      `transaction_hash=${metadata.transactionHash}`
    ].join('\n') + '\n';
    fs.appendFileSync(process.env.GITHUB_OUTPUT, outputs, 'utf8');
  }
}

async function latestPublicationTransaction(contract, blockHeight) {
  if (!blockHeight) return '';
  const events = await contract.queryFilter(
    contract.filters.HomepagePublished(),
    blockHeight,
    blockHeight
  );
  return events.length ? events[events.length - 1].transactionHash : '';
}

async function main() {
  const html = fs.readFileSync(HOMEPAGE_PATH, 'utf8');
  const htmlBytes = toUtf8Bytes(html);
  if (htmlBytes.length > MAX_HTML_BYTES) {
    throw new Error(`Homepage is ${htmlBytes.length} bytes; contract maximum is ${MAX_HTML_BYTES} bytes.`);
  }

  const rpcUrl = String(process.env.POLYGON_RPC_URL || '').trim() || AMOY_RPC_URL;
  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== AMOY_CHAIN_ID) {
    throw new Error(`Expected Polygon Amoy chain ID ${AMOY_CHAIN_ID}, received ${network.chainId}.`);
  }

  const deployerCode = await provider.getCode(DETERMINISTIC_DEPLOYER);
  if (deployerCode === '0x') {
    throw new Error(`Deterministic deployer ${DETERMINISTIC_DEPLOYER} is not available on Amoy.`);
  }

  const compiled = compileHomepageArchive();
  const owner = CHECK_ONLY
    ? getAddress(String(process.env.POLYGON_WALLET_ADDRESS || CHECK_ADDRESS))
    : new Wallet(requiredPrivateKey(), provider).address;
  const deployment = deterministicContract(owner, compiled.bytecode);
  const contentHash = homepageContentHash(html);

  if (CHECK_ONLY) {
    const contractDeployed = (await provider.getCode(deployment.address)) !== '0x';
    if (!contractDeployed) {
      const deploymentResult = await provider.call({
        to: DETERMINISTIC_DEPLOYER,
        data: concat([DEPLOYMENT_SALT, deployment.initCode])
      });
      const simulatedAddress = getAddress(`0x${deploymentResult.slice(-40)}`);
      if (simulatedAddress !== deployment.address) {
        throw new Error(
          `Deployment simulation returned ${simulatedAddress}, expected ${deployment.address}.`
        );
      }
    }
    console.log(JSON.stringify({
      chainId: network.chainId.toString(),
      walletAddress: owner,
      contractAddress: deployment.address,
      contentHash,
      htmlBytes: htmlBytes.length,
      contractDeployed,
      deploymentSimulation: contractDeployed ? 'already deployed' : 'passed'
    }, null, 2));
    return;
  }

  const wallet = new Wallet(requiredPrivateKey(), provider);
  let contractCode = await provider.getCode(deployment.address);

  if (contractCode === '0x') {
    const deploymentData = concat([DEPLOYMENT_SALT, deployment.initCode]);
    const transaction = { to: DETERMINISTIC_DEPLOYER, data: deploymentData };
    const gasLimit = await assertAffordable(provider, wallet, transaction);
    console.log(`Deploying HomepageArchive to ${deployment.address}...`);
    const deploymentTransaction = await wallet.sendTransaction({ ...transaction, gasLimit });
    const receipt = await deploymentTransaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error('HomepageArchive deployment failed.');
    contractCode = await provider.getCode(deployment.address);
    if (contractCode === '0x') throw new Error('Deployment transaction succeeded but contract code is missing.');
  }

  const contract = new Contract(deployment.address, compiled.abi, wallet);
  const contractOwner = getAddress(await contract.owner());
  if (contractOwner !== wallet.address) {
    throw new Error(`Contract owner ${contractOwner} does not match publisher ${wallet.address}.`);
  }

  const previousHash = await contract.contentHash();
  let receipt = null;
  let uploaded = false;

  if (previousHash === contentHash) {
    console.log(`Homepage content is unchanged (${contentHash}); no Amoy transaction sent.`);
  } else {
    const transaction = await contract.publish.populateTransaction(htmlBytes, contentHash);
    const gasLimit = await assertAffordable(provider, wallet, transaction);
    console.log(`Publishing ${htmlBytes.length} bytes to ${deployment.address}...`);
    const publishTransaction = await contract.publish(htmlBytes, contentHash, { gasLimit });
    receipt = await publishTransaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error('Homepage publication failed.');
    uploaded = true;
  }

  const [blockHeightValue, latestBlockHeight] = await Promise.all([
    contract.publishedAtBlock(),
    provider.getBlockNumber()
  ]);
  const blockHeight = Number(blockHeightValue);
  const transactionHash = receipt
    ? receipt.hash
    : await latestPublicationTransaction(contract, blockHeight);

  const metadata = {
    network: 'Polygon Amoy',
    chainId: AMOY_CHAIN_ID.toString(),
    walletAddress: wallet.address,
    blockHeight: String(blockHeight),
    latestBlockHeight: String(latestBlockHeight),
    transactionHash,
    contractAddress: deployment.address,
    contentHash,
    uploaded,
    explorer: `${AMOY_EXPLORER_URL}/address/${deployment.address}`
  };
  appendEnvironment(metadata);
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
