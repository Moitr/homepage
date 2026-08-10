'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { loadArticles } = require('./lib/article-onchain');

const ROOT = path.join(__dirname, '..');
const README_PATH = path.join(ROOT, 'README.md');
const START_MARKER = '<!-- articles:start -->';
const END_MARKER = '<!-- articles:end -->';

function markdownText(value) {
  return String(value).replace(/([\\\[\]|])/g, '\\$1').replace(/\s+/g, ' ').trim();
}

function articleBaseUrl(root) {
  const config = yaml.load(fs.readFileSync(path.join(root, '_config.yml'), 'utf8')) || {};
  const siteUrl = String(config.url || '').trim();
  if (!siteUrl) throw new Error('_config.yml must define url.');

  const configuredRoot = String(config.root || new URL(siteUrl).pathname || '/');
  const rootPath = `/${configuredRoot.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
  return new URL(rootPath, `${siteUrl.replace(/\/+$/, '')}/`);
}

function renderArticleList(root) {
  const baseUrl = articleBaseUrl(root);
  const articles = loadArticles(root).sort((left, right) => (
    right.date.localeCompare(left.date) || Number(right.slug) - Number(left.slug)
  ));
  const rows = articles.map((article) => {
    const articleUrl = new URL(`archives/${article.slug}/`, baseUrl).toString();
    return `| ${article.slug} | [${markdownText(article.title)}](${articleUrl}) | ${article.date.slice(0, 10)} |`;
  });

  return [
    '| # | Article | Published |',
    '| ---: | --- | --- |',
    ...rows
  ].join('\n');
}

function updateReadmeContent(readme, articleList) {
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md must contain ${START_MARKER} and ${END_MARKER}.`);
  }
  if (readme.indexOf(START_MARKER, start + START_MARKER.length) !== -1 ||
      readme.indexOf(END_MARKER, end + END_MARKER.length) !== -1) {
    throw new Error('README.md article markers must appear exactly once.');
  }

  const before = readme.slice(0, start + START_MARKER.length);
  const after = readme.slice(end);
  return `${before}\n${articleList}\n${after}`.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
}

function expectedReadme(root = ROOT) {
  const readmePath = path.join(root, 'README.md');
  const current = fs.readFileSync(readmePath, 'utf8');
  return updateReadmeContent(current, renderArticleList(root));
}

function main() {
  const current = fs.readFileSync(README_PATH, 'utf8').replace(/\r\n/g, '\n');
  const expected = expectedReadme();
  if (process.argv.includes('--check')) {
    if (current !== expected) {
      throw new Error('README.md article list is outdated. Run pnpm readme:update.');
    }
    console.log('README.md article list is current.');
    return;
  }

  if (current === expected) {
    console.log('README.md article list is already current.');
    return;
  }
  fs.writeFileSync(README_PATH, expected, 'utf8');
  console.log('Updated README.md article list.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  expectedReadme,
  renderArticleList,
  updateReadmeContent
};
