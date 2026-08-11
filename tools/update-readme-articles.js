'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { loadArticles } = require('./lib/article-onchain');

const ROOT = path.join(__dirname, '..');
const README_PATH = path.join(ROOT, 'README.md');
const ARTICLE_START_MARKER = '<!-- articles:start -->';
const ARTICLE_END_MARKER = '<!-- articles:end -->';
const FRIEND_START_MARKER = '<!-- friends:start -->';
const FRIEND_END_MARKER = '<!-- friends:end -->';

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
    const original = article.originalUrl ? `[Original](${article.originalUrl})` : '—';
    return `| ${article.slug} | [${markdownText(article.title)}](${articleUrl}) | ${original} | ${article.date.slice(0, 10)} |`;
  });

  return [
    '| # | Article | Original | Published |',
    '| ---: | --- | --- | --- |',
    ...rows
  ].join('\n');
}

function renderFriendList(root) {
  const snapshotPath = path.join(root, '.onchain', 'friend-links.json');
  if (!fs.existsSync(snapshotPath)) return null;
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const links = Array.isArray(snapshot.data) ? snapshot.data : [];
  const rows = links.map((link) => (
    `| [${markdownText(link.name)}](${String(link.url).replace(/\)/g, '%29')}) | ${markdownText(link.description || '—')} |`
  ));
  return [
    '| Friend | Description |',
    '| --- | --- |',
    ...rows
  ].join('\n');
}

function updateMarkedSection(readme, content, startMarker, endMarker, label) {
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md must contain ${startMarker} and ${endMarker}.`);
  }
  if (readme.indexOf(startMarker, start + startMarker.length) !== -1 ||
      readme.indexOf(endMarker, end + endMarker.length) !== -1) {
    throw new Error(`README.md ${label} markers must appear exactly once.`);
  }

  const before = readme.slice(0, start + startMarker.length);
  const after = readme.slice(end);
  return `${before}\n${content}\n${after}`.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
}

function updateReadmeContent(readme, articleList) {
  return updateMarkedSection(
    readme,
    articleList,
    ARTICLE_START_MARKER,
    ARTICLE_END_MARKER,
    'article'
  );
}

function updateFriendReadmeContent(readme, friendList) {
  return updateMarkedSection(
    readme,
    friendList,
    FRIEND_START_MARKER,
    FRIEND_END_MARKER,
    'friend'
  );
}

function expectedReadme(root = ROOT) {
  const readmePath = path.join(root, 'README.md');
  const current = fs.readFileSync(readmePath, 'utf8');
  const withArticles = updateReadmeContent(current, renderArticleList(root));
  const friendList = renderFriendList(root);
  return friendList === null ? withArticles : updateFriendReadmeContent(withArticles, friendList);
}

function main() {
  const current = fs.readFileSync(README_PATH, 'utf8').replace(/\r\n/g, '\n');
  const expected = expectedReadme();
  if (process.argv.includes('--check')) {
    if (current !== expected) {
      throw new Error('README.md content lists are outdated. Run pnpm readme:update.');
    }
    console.log('README.md content lists are current.');
    return;
  }

  if (current === expected) {
    console.log('README.md content lists are already current.');
    return;
  }
  fs.writeFileSync(README_PATH, expected, 'utf8');
  console.log('Updated README.md content lists.');
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
  renderFriendList,
  updateFriendReadmeContent,
  updateReadmeContent
};
