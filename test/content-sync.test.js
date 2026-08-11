'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fetchRemoteContent,
  getNotePath,
  getPostPath,
  originalContentUrl,
  renderPost,
  synchronize,
  updateMapping
} = require('../tools/sync-content');

function remote(overrides) {
  return {
    key: 'post:100',
    type: 'post',
    id: '100',
    title: 'Example',
    text: '# Body',
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: '2026-01-02T00:00:00Z',
    contentFormat: 'markdown',
    tags: ['Hexo'],
    category: 'Engineering',
    remoteSlug: 'example',
    originalUrl: 'https://moitr.ren/posts/categories/example',
    ...overrides
  };
}

test('mapping reuses existing slugs and never reuses inactive slugs', () => {
  const mapping = {
    version: 1,
    next_slug: 3,
    items: {
      'post:100': { slug: 1, active: true, source_type: 'post', source_id: '100' },
      'note:200': { slug: 2, active: true, source_type: 'note', source_id: '200', source_nid: 7 }
    }
  };
  const next = updateMapping(mapping, [
    remote({ title: 'Updated' }),
    remote({ key: 'note:300', type: 'note', id: '300', nid: 8, createdAt: '2026-02-01T00:00:00Z' })
  ]);

  assert.equal(next.items['post:100'].slug, 1);
  assert.equal(next.items['note:200'].active, false);
  assert.equal(next.items['note:300'].slug, 3);
  assert.equal(next.next_slug, 4);
});

test('new slugs are allocated deterministically by publication date', () => {
  const mapping = { version: 1, next_slug: 1, items: {} };
  const later = remote({ key: 'post:200', id: '200', createdAt: '2026-02-01T00:00:00Z' });
  const earlier = remote({ key: 'post:100', id: '100', createdAt: '2026-01-01T00:00:00Z' });
  const next = updateMapping(mapping, [later, earlier]);

  assert.equal(next.items['post:100'].slug, 1);
  assert.equal(next.items['post:200'].slug, 2);
});

test('generated front matter retains source identity and numeric permalink slug', () => {
  const output = renderPost(remote({ id: '123', key: 'post:123' }), { slug: 9 });

  assert.match(output, /^---\n/);
  assert.match(output, /slug: 9/);
  assert.match(output, /source_type: post/);
  assert.match(output, /source_id: '123'/);
  assert.match(output, /original_url: https:\/\/moitr\.ren\/posts\/categories\/example/);
  assert.match(output, /\n---\n\n# Body\n$/);
});

test('original URLs are calculated from Core routing fields and the fixed domain', () => {
  assert.equal(
    originalContentUrl(getPostPath({
      id: '100',
      slug: 'hello world',
      category: { slug: 'daily notes' }
    })),
    'https://moitr.ren/posts/daily%20notes/hello%20world'
  );
  assert.equal(
    originalContentUrl(getNotePath({ id: '200', nid: 7 })),
    'https://moitr.ren/notes/7'
  );
});

test('remote fetch follows pagination and then requests every detail', async () => {
  const requested = [];
  const responses = new Map([
    ['/posts?page=1&size=50&truncate=1', { data: [{ id: '100' }], meta: { pagination: { page: 1, total_pages: 2 } } }],
    ['/posts?page=2&size=50&truncate=1', { data: [{ id: '101' }], meta: { pagination: { page: 2, total_pages: 2 } } }],
    ['/notes?page=1&size=50&withSummary=1', { data: [{ id: '200', nid: 7 }], meta: { pagination: { page: 1, total_pages: 1 } } }],
    ['/posts/100', { data: detailPost('100', 'first') }],
    ['/posts/101', { data: detailPost('101', 'second') }],
    ['/notes/nid/7?single=1', { data: {
      id: '200', nid: 7, title: 'Note', text: 'Note body', content_format: 'markdown',
      created_at: '2026-01-03T00:00:00Z', modified_at: '2026-01-03T01:00:00Z'
    } }]
  ]);
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname.replace('/api/v3', '') + new URL(url).search;
    requested.push(path);
    const body = responses.get(path);
    return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body };
  };

  const result = await fetchRemoteContent({
    apiBaseUrl: 'https://example.test/api/v3', fetchImpl, attempts: 1, timeoutMs: 1000
  });

  assert.equal(result.length, 3);
  assert.ok(requested.includes('/posts?page=2&size=50&truncate=1'));
  assert.ok(requested.includes('/notes/nid/7?single=1'));
});

test('an unavailable API leaves posts and permanent mappings untouched', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homepage-content-sync-'));
  const postsDirectory = path.join(root, 'source', '_posts');
  const mappingPath = path.join(root, '.content-sync-map.json');
  const originalPost = '---\ntitle: Existing\nslug: 1\ndate: 2026-01-01\n---\n\nExisting body\n';
  const originalMapping = JSON.stringify({
    version: 1,
    next_slug: 2,
    items: {
      'post:100': { slug: 1, active: true, source_type: 'post', source_id: '100' }
    }
  }, null, 2) + '\n';

  try {
    fs.mkdirSync(postsDirectory, { recursive: true });
    fs.writeFileSync(path.join(postsDirectory, '1.md'), originalPost, 'utf8');
    fs.writeFileSync(mappingPath, originalMapping, 'utf8');
    const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });

    await assert.rejects(
      synchronize({
        root,
        apiBaseUrl: 'https://unavailable.example/api/v3',
        fetchImpl,
        attempts: 1,
        timeoutMs: 1000
      }),
      /Content synchronization failed/
    );
    assert.equal(fs.readFileSync(path.join(postsDirectory, '1.md'), 'utf8'), originalPost);
    assert.equal(fs.readFileSync(mappingPath, 'utf8'), originalMapping);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function detailPost(id, slug) {
  return {
    id,
    title: `Post ${id}`,
    slug,
    text: `Body ${id}`,
    content_format: 'markdown',
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    modified_at: '2026-01-02T00:00:00Z',
    category: { name: 'Category', slug: 'categories' }
  };
}
