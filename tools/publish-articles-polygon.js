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
  ARTICLE_DEPLOYMENT_SALT,
  compileArticleArchive,
  deterministicArticleContract,
  loadArticles
} = require('./lib/article-onchain');

const ROOT = path.join(__dirname, '..');
const METADATA_PATH = path.join(ROOT, '.onchain', 'articles.json');
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

async function latestPublicationTransaction(contract, slugHash, blockHeight) {
  if (!blockHeight) return '';
  const events = await contract.queryFilter(
    contract.filters.ArticlePublished(slugHash),
    blockHeight,
    blockHeight
  );
  return events.length ? events[events.length - 1].transactionHash : '';
}

async function main() {
  const articles = loadArticles(ROOT);
  const rpcUrl = String(process.env.POLYGON_RPC_URL || '').trim() || POLYGON_RPC_URL;
  const provider = new JsonRpcProvider(rpcUrl, Number(POLYGON_CHAIN_ID), { batchMaxCount: 1 });
  const network = await provider.getNetwork();
  if (network.chainId !== POLYGON_CHAIN_ID) {
    throw new Error(`Expected Polygon mainnet chain ID ${POLYGON_CHAIN_ID}, received ${network.chainId}.`);
  }
  if ((await provider.getCode(DETERMINISTIC_DEPLOYER)) === '0x') {
    throw new Error(`Deterministic deployer ${DETERMINISTIC_DEPLOYER} is unavailable.`);
  }

  const compiled = compileArticleArchive();
  const owner = CHECK_ONLY
    ? getAddress(String(process.env.POLYGON_WALLET_ADDRESS || CHECK_ADDRESS))
    : new Wallet(requiredPrivateKey(), provider).address;
  const deployment = deterministicArticleContract(owner, compiled.bytecode);

  if (CHECK_ONLY) {
    const contractDeployed = (await provider.getCode(deployment.address)) !== '0x';
    if (!contractDeployed) {
      const result = await provider.call({
        to: DETERMINISTIC_DEPLOYER,
        data: concat([ARTICLE_DEPLOYMENT_SALT, deployment.initCode])
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
      articles: articles.map((article) => ({
        title: article.title,
        slug: article.slug,
        date: article.date,
        contentHash: article.contentHash,
        payloadBytes: article.bytes.length,
        images: article.images
      }))
    }, null, 2));
    return;
  }

  const wallet = new Wallet(requiredPrivateKey(), provider);
  let contractCode = await provider.getCode(deployment.address);
  if (contractCode === '0x') {
    const transaction = {
      to: DETERMINISTIC_DEPLOYER,
      data: concat([ARTICLE_DEPLOYMENT_SALT, deployment.initCode])
    };
    const gasLimit = await assertAffordable(provider, wallet, transaction);
    console.log(`Deploying ArticleArchive to ${deployment.address}...`);
    const sent = await wallet.sendTransaction({ ...transaction, gasLimit });
    const receipt = await sent.wait();
    if (!receipt || receipt.status !== 1) throw new Error('ArticleArchive deployment failed.');
    contractCode = await provider.getCode(deployment.address);
    if (contractCode === '0x') throw new Error('ArticleArchive contract code is missing.');
  }

  const contract = new Contract(deployment.address, compiled.abi, wallet);
  const contractOwner = getAddress(await contract.owner());
  if (contractOwner !== wallet.address) {
    throw new Error(`Contract owner ${contractOwner} does not match publisher ${wallet.address}.`);
  }

  const results = [];
  for (const article of articles) {
    const previous = await contract.publication(article.slugHash);
    let receipt = null;
    let uploaded = false;

    if (previous.contentHash === article.contentHash) {
      console.log(`Article ${article.slug} is unchanged; no Polygon transaction sent.`);
    } else {
      const transaction = await contract.publish.populateTransaction(
        article.slugHash,
        article.bytes,
        article.contentHash
      );
      const gasLimit = await assertAffordable(provider, wallet, transaction);
      console.log(`Publishing article ${article.slug} (${article.bytes.length} bytes)...`);
      const sent = await contract.publish(
        article.slugHash,
        article.bytes,
        article.contentHash,
        { gasLimit }
      );
      receipt = await sent.wait();
      if (!receipt || receipt.status !== 1) throw new Error(`Article ${article.slug} publication failed.`);
      uploaded = true;
    }

    const publication = await contract.publication(article.slugHash);
    const blockHeight = Number(publication.publishedAtBlock);
    const transactionHash = receipt
      ? receipt.hash
      : await latestPublicationTransaction(contract, article.slugHash, blockHeight);
    results.push({ article, publication, blockHeight, transactionHash, uploaded });
  }

  const latestBlockHeight = await provider.getBlockNumber();
  const metadata = Object.fromEntries(results.map((result) => [result.article.slug, {
    block_height: String(result.blockHeight),
    latest_block_height: String(latestBlockHeight),
    transaction_hash: result.transactionHash,
    contract_address: deployment.address,
    content_hash: result.article.contentHash,
    version: result.publication.version.toString()
  }]));
  writeMetadata(metadata);

  console.log(JSON.stringify({
    network: 'Polygon PoS',
    chainId: POLYGON_CHAIN_ID.toString(),
    contractAddress: deployment.address,
    explorer: `${POLYGON_EXPLORER_URL}/address/${deployment.address}`,
    articles: results.map((result) => ({
      slug: result.article.slug,
      contentHash: result.article.contentHash,
      version: result.publication.version.toString(),
      blockHeight: String(result.blockHeight),
      transactionHash: result.transactionHash,
      uploaded: result.uploaded
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
