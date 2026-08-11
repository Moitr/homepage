'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { marked } = require('marked');
const { renderCoreMarkdown } = require('../tools/lib/core-markdown');

test('Core masonry containers become the existing article gallery markup', () => {
  const source = [
    '::: masonry {gap=3}',
    '![First](https://img.example/1.jpg)',
    '![](https://img.example/2.jpg)',
    ':::'
  ].join('\n');
  const output = renderCoreMarkdown(source);

  assert.match(output, /^<div class="article-gallery">/);
  assert.match(output, /<img src="https:\/\/img\.example\/1\.jpg" alt="First">/);
  assert.doesNotMatch(output, /:::/);
});

test('Core success containers become Markdown blockquotes', () => {
  const output = renderCoreMarkdown('::: success\nRead **this** first.\n:::');

  assert.equal(output, '> Read **this** first.');
});

test('Markdown after a Core container remains outside the generated HTML block', () => {
  const source = [
    '::: masonry {gap=3}',
    '![](https://img.example/1.jpg)',
    ':::',
    '',
    '## Planning',
    'Text with **bold emphasis**.'
  ].join('\n');
  const html = marked(renderCoreMarkdown(source));

  assert.match(html, /<\/div>\n\n<h2>Planning<\/h2>/);
  assert.match(html, /<strong>bold emphasis<\/strong>/);
  assert.doesNotMatch(html, /## Planning|\*\*bold emphasis\*\*/);
});

test('unknown Core containers remain unchanged', () => {
  const source = '::: custom\nBody\n:::';
  assert.equal(renderCoreMarkdown(source), source);
});
