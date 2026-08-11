'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { shuffledForBuild } = require('../tools/lib/friend-links-page');

const snapshotPath = path.join(hexo.base_dir, '.onchain', 'friend-links.json');
const metadataPath = path.join(hexo.base_dir, '.onchain', 'friend-links-meta.json');
const buildNumber = process.env.GITHUB_RUN_NUMBER || process.env.GITHUB_RUN_ID || Date.now();

function readJson(file, fallback, label) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    hexo.log.warn(`Unable to read ${label}: ${error.message}`);
    return fallback;
  }
}

hexo.extend.helper.register('friend_links_randomized', () => {
  const snapshot = readJson(snapshotPath, { data: [] }, 'friend links snapshot');
  return shuffledForBuild(snapshot.data, buildNumber);
});

hexo.extend.helper.register('friend_links_onchain_meta', () => (
  readJson(metadataPath, {}, 'friend links on-chain metadata')
));
