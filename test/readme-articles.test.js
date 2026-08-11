'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadArticles } = require('../tools/lib/article-onchain');
const {
  expectedReadme,
  renderArticleList,
  renderFriendList,
  updateFriendReadmeContent,
  updateReadmeContent
} = require('../tools/update-readme-articles');

const ROOT = path.join(__dirname, '..');

test('README article list matches the current posts', () => {
  const current = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(current, expectedReadme(ROOT));

  const list = renderArticleList(ROOT);
  for (const article of loadArticles(ROOT)) {
    assert.ok(list.includes(`https://moitr.cc/archives/${article.slug}/`));
    if (article.originalUrl) {
      assert.ok(list.includes(`[Original](${article.originalUrl})`));
    }
  }
});

test('README friend list matches the synchronized snapshot', () => {
  const list = renderFriendList(ROOT);
  assert.ok(list);
  assert.match(list, /\[星灯\]\(https:\/\/eruchitand\.top\/\)/);
  assert.match(list, /传颂之物/);
});

test('README generator changes only the marked article section', () => {
  const source = [
    '# Header',
    '',
    '<!-- articles:start -->',
    'stale list',
    '<!-- articles:end -->',
    '',
    'Footer',
    ''
  ].join('\n');
  const updated = updateReadmeContent(source, 'fresh list');

  assert.equal(updated, [
    '# Header',
    '',
    '<!-- articles:start -->',
    'fresh list',
    '<!-- articles:end -->',
    '',
    'Footer',
    ''
  ].join('\n'));
});

test('README generator changes only the marked friend section', () => {
  const source = [
    '# Header',
    '',
    '<!-- friends:start -->',
    'stale list',
    '<!-- friends:end -->',
    '',
    'Footer',
    ''
  ].join('\n');
  const updated = updateFriendReadmeContent(source, 'fresh list');

  assert.equal(updated, [
    '# Header',
    '',
    '<!-- friends:start -->',
    'fresh list',
    '<!-- friends:end -->',
    '',
    'Footer',
    ''
  ].join('\n'));
});
