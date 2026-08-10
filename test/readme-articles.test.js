'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  expectedReadme,
  renderArticleList,
  updateReadmeContent
} = require('../tools/update-readme-articles');

const ROOT = path.join(__dirname, '..');

test('README article list matches the current posts', () => {
  const current = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(current, expectedReadme(ROOT));

  const list = renderArticleList(ROOT);
  assert.match(list, /https:\/\/moitr\.cc\/archives\/1\//);
  assert.match(list, /https:\/\/moitr\.cc\/archives\/2\//);
  assert.match(list, /https:\/\/moitr\.cc\/archives\/3\//);
  assert.match(list, /\[Original\]\(https:\/\/moitr\.ren\/posts\/categories\/new-beginning\)/);
  assert.match(list, /\[Original\]\(https:\/\/moitr\.ren\/posts\/categories\/build-permanent-blockchain-blog-polygon-hexo-github-actions\)/);
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
