'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  Contract,
  JsonRpcProvider,
  Wallet,
  concat,
  formatEther,
  getAddress
} = require('ethers');
const {
  POLYGON_CHAIN_ID,
  POLYGON_EXPLORER_URL,
  POLYGON_RPC_URL,
  DETERMINISTIC_DEPLOYER
} = require('./lib/polygon');
const {
  FRIEND_LINKS_DEPLOYMENT_SALT,
  FRIEND_LINKS_ENDPOINT,
  compileFriendLinksArchive,
  deterministicFriendLinksContract,
  loadFriendLinksPayload
} = require('./lib/friend-links-onchain');

const ROOT = path.join(__dirname, '..');
const METADATA_PATH = path.join(ROOT, '.onchain', 'friend-links-meta.json');
const CHECK_ONLY = process.argv.includes('--check');
const CHECK_ADDRESS = '0x000000000000000000000000000000000000dEaD';

function requiredPrivateKey() {
  const value = String(process.env.POLYGON_PRIVATE_KEY || '').trim();
  if (!value) throw new Error('POLYGON_PRIVATE_KEY is required.');
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
  if (!gasPrice) throw new Error('The Polygon RPC did not return a gas price.');
  const estimatedCost = bufferedGas(gas) * gasPrice;
  if (balance < estimatedCost) {
    throw new Error(
      `Insufficient Polygon POL in ${wallet.address}. ` +
      `Balance: ${formatEther(balance)} POL; estimated requirement: ${formatEther(estimatedCost)} POL.`
    );
  }
  return bufferedGas(gas);
}

function writeMetadata(metadata) {
  fs.mkdirSync(path.dirname(METADATA_PATH), { recursive: true });
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
}

async function latestPublicationTransaction(contract, blockHeight) {
  if (!blockHeight) return '';
  const events = await contract.queryFilter(
    contract.filters.FriendLinksPublished(),
    blockHeight,
    blockHeight
  );
  return events.length ? events[events.length - 1].transactionHash : '';
}

async function main() {
  const payload = loadFriendLinksPayload(ROOT);
  const rpcUrl = String(process.env.POLYGON_RPC_URL || '').trim() || POLYGON_RPC_URL;
  const provider = new JsonRpcProvider(rpcUrl, Number(POLYGON_CHAIN_ID), { batchMaxCount: 1 });
  const network = await provider.getNetwork();
  if (network.chainId !== POLYGON_CHAIN_ID) {
    throw new Error(`Expected Polygon mainnet chain ID ${POLYGON_CHAIN_ID}, received ${network.chainId}.`);
  }
  if ((await provider.getCode(DETERMINISTIC_DEPLOYER)) === '0x') {
    throw new Error(`Deterministic deployer ${DETERMINISTIC_DEPLOYER} is unavailable.`);
  }

  const compiled = compileFriendLinksArchive();
  const owner = CHECK_ONLY
    ? getAddress(String(process.env.POLYGON_WALLET_ADDRESS || CHECK_ADDRESS))
    : new Wallet(requiredPrivateKey(), provider).address;
  const deployment = deterministicFriendLinksContract(owner, compiled.bytecode);

  if (CHECK_ONLY) {
    const contractDeployed = (await provider.getCode(deployment.address)) !== '0x';
    if (!contractDeployed) {
      const result = await provider.call({
        to: DETERMINISTIC_DEPLOYER,
        data: concat([FRIEND_LINKS_DEPLOYMENT_SALT, deployment.initCode])
      });
      const simulatedAddress = getAddress(`0x${result.slice(-40)}`);
      if (simulatedAddress !== deployment.address) {
        throw new Error(`Deployment simulation returned ${simulatedAddress}, expected ${deployment.address}.`);
      }
    }
    console.log(JSON.stringify({
      chainId: network.chainId.toString(),
      walletAddress: owner,
      contractAddress: deployment.address,
      contractDeployed,
      deploymentSimulation: contractDeployed ? 'already deployed' : 'passed',
      source: FRIEND_LINKS_ENDPOINT,
      links: payload.snapshot.data.length,
      contentHash: payload.contentHash,
      payloadBytes: payload.bytes.length
    }, null, 2));
    return;
  }

  const wallet = new Wallet(requiredPrivateKey(), provider);
  let contractCode = await provider.getCode(deployment.address);
  if (contractCode === '0x') {
    const transaction = {
      to: DETERMINISTIC_DEPLOYER,
      data: concat([FRIEND_LINKS_DEPLOYMENT_SALT, deployment.initCode])
    };
    const gasLimit = await assertAffordable(provider, wallet, transaction);
    console.log(`Deploying FriendLinksArchive to ${deployment.address}...`);
    const sent = await wallet.sendTransaction({ ...transaction, gasLimit });
    const receipt = await sent.wait();
    if (!receipt || receipt.status !== 1) throw new Error('FriendLinksArchive deployment failed.');
    contractCode = await provider.getCode(deployment.address);
    if (contractCode === '0x') throw new Error('FriendLinksArchive contract code is missing.');
  }

  const contract = new Contract(deployment.address, compiled.abi, wallet);
  const contractOwner = getAddress(await contract.owner());
  if (contractOwner !== wallet.address) {
    throw new Error(`Contract owner ${contractOwner} does not match publisher ${wallet.address}.`);
  }

  const previousHash = await contract.contentHash();
  let receipt = null;
  let uploaded = false;
  if (previousHash === payload.contentHash) {
    console.log(`Friend links are unchanged (${payload.contentHash}); no Polygon transaction sent.`);
  } else {
    const transaction = await contract.publish.populateTransaction(payload.bytes, payload.contentHash);
    const gasLimit = await assertAffordable(provider, wallet, transaction);
    console.log(`Publishing ${payload.snapshot.data.length} friend links (${payload.bytes.length} bytes)...`);
    const sent = await contract.publish(payload.bytes, payload.contentHash, { gasLimit });
    receipt = await sent.wait();
    if (!receipt || receipt.status !== 1) throw new Error('Friend links publication failed.');
    uploaded = true;
  }

  const [blockHeightValue, latestBlockHeight, version] = await Promise.all([
    contract.publishedAtBlock(),
    provider.getBlockNumber(),
    contract.version()
  ]);
  const blockHeight = Number(blockHeightValue);
  const transactionHash = receipt
    ? receipt.hash
    : await latestPublicationTransaction(contract, blockHeight);
  const metadata = {
    network: 'Polygon PoS',
    chain_id: POLYGON_CHAIN_ID.toString(),
    block_height: String(blockHeight),
    latest_block_height: String(latestBlockHeight),
    transaction_hash: transactionHash,
    contract_address: deployment.address,
    content_hash: payload.contentHash,
    version: version.toString(),
    count: payload.snapshot.data.length,
    source: FRIEND_LINKS_ENDPOINT,
    uploaded
  };
  writeMetadata(metadata);
  console.log(JSON.stringify({
    ...metadata,
    explorer: `${POLYGON_EXPLORER_URL}/address/${deployment.address}`
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
