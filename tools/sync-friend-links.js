'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  FRIEND_LINKS_ENDPOINT,
  friendLinksPayload
} = require('./lib/friend-links-onchain');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_PATH = path.join(ROOT, '.onchain', 'friend-links.json');

async function fetchAttempt() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(FRIEND_LINKS_ENDPOINT, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFriendLinks() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetchAttempt();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error(`Unable to synchronize friend links: ${lastError.message}`);
}

async function main() {
  const payload = friendLinksPayload(await fetchFriendLinks());
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(payload.snapshot, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    source: FRIEND_LINKS_ENDPOINT,
    links: payload.snapshot.data.length,
    contentHash: payload.contentHash,
    payloadBytes: payload.bytes.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
