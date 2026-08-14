'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compileHomepageArchive,
  deterministicContract,
  homepageContentHash,
  normalizeHomepage
} = require('../tools/lib/homepage-onchain');

function page({ body = 'Hello', build = 'abc12345', time = '2026-01-01 00:00:00', wallet = '--' } = {}) {
  return `<!doctype html>
<html><body>
<main>${body}</main>
<!-- onchain-metadata:start --><div>${wallet}</div><!-- onchain-metadata:end -->
<footer class="site-footer"><code>${build}</code><time>${time}</time></footer>
</body></html>`;
}

test('normalization ignores build metadata and on-chain display values', () => {
  const first = page();
  const second = page({
    build: 'def67890',
    time: '2026-08-10 15:00:00',
    wallet: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
  });

  assert.equal(normalizeHomepage(first), normalizeHomepage(second));
  assert.equal(homepageContentHash(first), homepageContentHash(second));
});

test('normalization supports metadata inside the site footer', () => {
  const first = `<!doctype html><html><body><main>Hello</main>
    <footer class="site-footer"><!-- onchain-metadata:start --><div>first</div><!-- onchain-metadata:end --><code>abc</code></footer>
  </body></html>`;
  const second = first.replace('first', 'second').replace('abc', 'def');

  assert.equal(homepageContentHash(first), homepageContentHash(second));
});

test('normalization detects substantive homepage changes', () => {
  assert.notEqual(
    homepageContentHash(page({ body: 'Before' })),
    homepageContentHash(page({ body: 'After' }))
  );
});

test('normalization fails closed when dynamic regions are missing', () => {
  assert.throws(() => normalizeHomepage('<html></html>'), /site footer/);
});

test('contract compiles and has a stable deterministic address', () => {
  const compiled = compileHomepageArchive();
  const owner = '0x0000000000000000000000000000000000001234';
  const first = deterministicContract(owner, compiled.bytecode);
  const second = deterministicContract(owner, compiled.bytecode);
  const functions = compiled.abi.filter((item) => item.type === 'function').map((item) => item.name);

  assert.match(compiled.bytecode, /^0x[0-9a-f]+$/i);
  assert.equal(first.address, second.address);
  assert.ok(functions.includes('publish'));
  assert.ok(functions.includes('html'));
});
