'use strict';

const fs = require('node:fs');
const path = require('node:path');

const metadataPath = path.join(hexo.base_dir, '.onchain', 'articles.json');

hexo.extend.helper.register('article_onchain_meta', (slug) => {
  if (!fs.existsSync(metadataPath)) return {};
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return metadata[String(slug)] || {};
  } catch (error) {
    hexo.log.warn(`Unable to read article on-chain metadata: ${error.message}`);
    return {};
  }
});
