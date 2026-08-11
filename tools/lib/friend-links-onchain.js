'use strict';

const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
const {
  AbiCoder,
  concat,
  getCreate2Address,
  keccak256,
  toUtf8Bytes
} = require('ethers');
const { DETERMINISTIC_DEPLOYER } = require('./homepage-onchain');

const FRIEND_LINKS_ENDPOINT = 'https://mx-server.moitr.ren/api/v3/links/all';
const FRIEND_LINKS_DEPLOYMENT_SALT = keccak256(toUtf8Bytes('moitr.friend-links.archive.polygon.v1'));
const MAX_FRIEND_LINKS_BYTES = 24_576;
const CONTRACT_PATH = path.join(__dirname, '..', '..', 'contracts', 'FriendLinksArchive.sol');

function requiredText(value, field) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized) throw new Error(`Friend link ${field} is required.`);
  return normalized;
}

function httpUrl(value, field, optional = false) {
  const normalized = String(value == null ? '' : value).trim();
  if (!normalized && optional) return '';
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw new Error(`Friend link ${field} must be a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Friend link ${field} must use HTTP or HTTPS.`);
  }
  return parsed.toString();
}

function normalizedDate(value) {
  const source = String(value == null ? '' : value).trim();
  if (!source) return '';
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid friend link created_at: ${source}`);
  return date.toISOString();
}

function isHidden(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function compareIds(left, right) {
  if (/^\d+$/.test(left.id) && /^\d+$/.test(right.id)) {
    const leftId = BigInt(left.id);
    const rightId = BigInt(right.id);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  }
  return left.id.localeCompare(right.id, 'en');
}

function normalizeFriendLinks(response) {
  const candidates = Array.isArray(response)
    ? response
    : response && Array.isArray(response.data)
      ? response.data
      : null;
  if (!candidates) throw new Error('Friend links API response must contain a data array.');

  const links = candidates
    .filter((item) => item && Number(item.type) === 0 && Number(item.state) === 0 && !isHidden(item.hide))
    .map((item) => ({
      id: requiredText(item.id, 'id'),
      name: requiredText(item.name, 'name'),
      url: httpUrl(item.url, 'url'),
      avatar: httpUrl(item.avatar, 'avatar', true),
      description: String(item.description == null ? '' : item.description).trim(),
      type: 0,
      state: 0,
      email: item.email == null || String(item.email).trim() === '' ? null : String(item.email).trim(),
      hide: false,
      created_at: normalizedDate(item.created_at)
    }))
    .sort(compareIds);

  const ids = new Set();
  for (const link of links) {
    if (ids.has(link.id)) throw new Error(`Duplicate friend link id: ${link.id}`);
    ids.add(link.id);
  }
  return links;
}

function friendLinksPayload(response) {
  const snapshot = {
    source: FRIEND_LINKS_ENDPOINT,
    data: normalizeFriendLinks(response)
  };
  const json = JSON.stringify(snapshot);
  const bytes = toUtf8Bytes(json);
  if (bytes.length > MAX_FRIEND_LINKS_BYTES) {
    throw new Error(`Friend links payload is ${bytes.length} bytes; maximum is ${MAX_FRIEND_LINKS_BYTES}.`);
  }
  return {
    snapshot,
    json,
    bytes,
    contentHash: keccak256(bytes)
  };
}

function loadFriendLinksPayload(root) {
  const snapshotPath = path.join(root, '.onchain', 'friend-links.json');
  if (!fs.existsSync(snapshotPath)) {
    throw new Error('Friend links snapshot is missing. Run pnpm links:sync first.');
  }
  return friendLinksPayload(JSON.parse(fs.readFileSync(snapshotPath, 'utf8')));
}

function compileFriendLinksArchive() {
  const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'FriendLinksArchive.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((item) => item.severity === 'error');
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
  const contract = output.contracts['FriendLinksArchive.sol'].FriendLinksArchive;
  return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}

function deterministicFriendLinksContract(owner, bytecode) {
  const constructorArgs = AbiCoder.defaultAbiCoder().encode(['address'], [owner]);
  const initCode = concat([bytecode, constructorArgs]);
  return {
    address: getCreate2Address(
      DETERMINISTIC_DEPLOYER,
      FRIEND_LINKS_DEPLOYMENT_SALT,
      keccak256(initCode)
    ),
    initCode
  };
}

module.exports = {
  FRIEND_LINKS_DEPLOYMENT_SALT,
  FRIEND_LINKS_ENDPOINT,
  MAX_FRIEND_LINKS_BYTES,
  compileFriendLinksArchive,
  deterministicFriendLinksContract,
  friendLinksPayload,
  loadFriendLinksPayload,
  normalizeFriendLinks
};
