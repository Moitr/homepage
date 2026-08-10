'use strict';

const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
const {
  AbiCoder,
  concat,
  getAddress,
  getCreate2Address,
  keccak256,
  toUtf8Bytes
} = require('ethers');

const AMOY_CHAIN_ID = 80002n;
const AMOY_RPC_URL = 'https://polygon-amoy.drpc.org';
const AMOY_EXPLORER_URL = 'https://amoy.polygonscan.com';
const DETERMINISTIC_DEPLOYER = getAddress('0x4e59b44847b379578588920cA78FbF26c0B4956C');
const DEPLOYMENT_SALT = keccak256(toUtf8Bytes('moitr.homepage.archive.amoy.v1'));
const MAX_HTML_BYTES = 24_576;
const CONTRACT_PATH = path.join(__dirname, '..', '..', 'contracts', 'HomepageArchive.sol');

function replaceExactlyOnce(value, pattern, replacement, label) {
  const matches = Array.from(value.matchAll(pattern));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${matches.length}.`);
  }
  return value.replace(pattern, replacement);
}

function normalizeHomepage(html) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('Homepage HTML is empty. Run the Hexo build first.');
  }

  let normalized = html.replace(/\r\n/g, '\n');
  normalized = replaceExactlyOnce(
    normalized,
    /<footer class="site-footer">[\s\S]*?<\/footer>/g,
    '<footer class="site-footer"></footer>',
    'site footer'
  );
  normalized = replaceExactlyOnce(
    normalized,
    /<!-- onchain-metadata:start -->[\s\S]*?<!-- onchain-metadata:end -->/g,
    '<!-- onchain-metadata -->',
    'on-chain metadata region'
  );
  return normalized;
}

function homepageContentHash(html) {
  return keccak256(toUtf8Bytes(normalizeHomepage(html)));
}

function compileHomepageArchive() {
  const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      'HomepageArchive.sol': { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((item) => item.severity === 'error');
  if (errors.length) {
    throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
  }

  const contract = output.contracts['HomepageArchive.sol'].HomepageArchive;
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`
  };
}

function deterministicContract(owner, bytecode) {
  const initialOwner = getAddress(owner);
  const constructorArgs = AbiCoder.defaultAbiCoder().encode(['address'], [initialOwner]);
  const initCode = concat([bytecode, constructorArgs]);
  const address = getCreate2Address(
    DETERMINISTIC_DEPLOYER,
    DEPLOYMENT_SALT,
    keccak256(initCode)
  );
  return { address, initCode };
}

module.exports = {
  AMOY_CHAIN_ID,
  AMOY_EXPLORER_URL,
  AMOY_RPC_URL,
  DEPLOYMENT_SALT,
  DETERMINISTIC_DEPLOYER,
  MAX_HTML_BYTES,
  compileHomepageArchive,
  deterministicContract,
  homepageContentHash,
  normalizeHomepage
};
