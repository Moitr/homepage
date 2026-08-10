'use strict';

const path = require('node:path');
const zlib = require('node:zlib');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compileArticleArchive,
  deterministicArticleContract,
  loadArticles,
  normalizeDate,
  normalizeMarkdown
} = require('../tools/lib/article-onchain');

const ROOT = path.join(__dirname, '..');

test('article payload follows the canonical JSON format', () => {
  const articles = loadArticles(ROOT);
  assert.ok(articles.length > 0);

  for (const article of articles) {
    const payload = JSON.parse(article.json);
    assert.deepEqual(Object.keys(payload), ['title', 'slug', 'date', 'content', 'images']);
    assert.ok(payload.title);
    assert.match(payload.slug, /^[1-9]\d*$/);
    assert.match(payload.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.match(article.contentHash, /^0x[0-9a-f]{64}$/);
    assert.ok(payload.images.every((image) => (
      typeof image.name === 'string' && image.name.length > 0 && /^[0-9a-f]{32}$/.test(image.hash)
    )));

    const markdown = zlib.gunzipSync(Buffer.from(payload.content, 'base64')).toString('utf8');
    assert.equal(markdown, article.markdown);
    assert.equal(markdown, normalizeMarkdown(markdown));
  }
});

test('article dates are deterministic UTC values', () => {
  assert.equal(normalizeDate('2026-08-10 12:00:00'), '2026-08-10T12:00:00Z');
  assert.equal(normalizeDate('2026-08-10T12:00:00+08:00'), '2026-08-10T04:00:00Z');
});

test('article contract compiles with a stable deterministic address', () => {
  const compiled = compileArticleArchive();
  const owner = '0x0000000000000000000000000000000000001234';
  const first = deterministicArticleContract(owner, compiled.bytecode);
  const second = deterministicArticleContract(owner, compiled.bytecode);
  const functions = compiled.abi.filter((item) => item.type === 'function').map((item) => item.name);

  assert.equal(first.address, second.address);
  assert.match(compiled.bytecode, /^0x[0-9a-f]+$/i);
  assert.ok(functions.includes('publish'));
  assert.ok(functions.includes('article'));
  assert.ok(functions.includes('publication'));
});
