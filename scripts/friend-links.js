'use strict';

const fs = require('node:fs');
const path = require('node:path');

const snapshotPath = path.join(hexo.base_dir, '.onchain', 'friend-links.json');
const metadataPath = path.join(hexo.base_dir, '.onchain', 'friend-links-meta.json');

function readJson(file, fallback, label) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    hexo.log.warn(`Unable to read ${label}: ${error.message}`);
    return fallback;
  }
}

hexo.extend.helper.register('friend_links', () => {
  const snapshot = readJson(snapshotPath, { data: [] }, 'friend links snapshot');
  return Array.isArray(snapshot.data) ? snapshot.data : [];
});

hexo.extend.helper.register('friend_links_onchain_meta', () => (
  readJson(metadataPath, {}, 'friend links on-chain metadata')
));
