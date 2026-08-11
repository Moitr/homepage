'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { articlePayload } = require('./lib/article-onchain');

const ROOT = path.join(__dirname, '..');
const DEFAULT_API_BASE_URL = 'https://mx-server.moitr.ren/api/v3';
const ORIGINAL_SITE_URL = 'https://moitr.ren';
const MAPPING_FILENAME = '.content-sync-map.json';
const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_ATTEMPTS = 5;
const DETAIL_CONCURRENCY = 4;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorDetails(error) {
  const details = [];
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const code = current.code ? ` ${current.code}` : '';
    const message = current.message || String(current);
    details.push(`${current.name || 'Error'}${code}: ${message}`);
    current = current.cause;
  }
  return details.join(' -> ');
}

function apiError(message, cause, transient = false) {
  const suffix = cause ? `: ${errorDetails(cause)}` : '';
  const error = new Error(`Content synchronization failed: ${message}${suffix}`, { cause });
  error.name = 'ContentSyncError';
  error.transient = Boolean(transient);
  return error;
}

function transientHttpStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function transientRequestError(error) {
  if (typeof error.transient === 'boolean') return error.transient;
  if (error.name === 'AbortError' || error instanceof TypeError) return true;
  const code = error.code || error.cause && error.cause.code;
  return [
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENETUNREACH',
    'ENOTFOUND',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET'
  ].includes(code);
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const attempts = options.attempts || REQUEST_ATTEMPTS;
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs === undefined ? 1_500 : options.retryDelayMs;
  const logger = options.logger || console;
  let lastError;
  let lastTransient = false;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'moitr-homepage-content-sync/1.0'
        },
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.transient = transientHttpStatus(response.status);
        throw error;
      }
      try {
        return await response.json();
      } catch (error) {
        error.transient = false;
        throw error;
      }
    } catch (error) {
      lastError = error;
      lastTransient = transientRequestError(error);
      if (!lastTransient || attempt === attempts) break;
      const delay = Math.min(retryDelayMs * (2 ** (attempt - 1)), 12_000);
      logger.warn(
        `Content sync request ${attempt}/${attempts} failed for ${url}: ` +
        `${errorDetails(error)}. Retrying in ${delay}ms.`
      );
      await sleep(delay);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw apiError(`unable to request ${url}`, lastError, lastTransient);
}

function responseData(body, label) {
  if (!body || typeof body !== 'object' || !body.data) {
    throw apiError(`${label} returned an invalid response`);
  }
  return body.data;
}

function integer(value, label, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw apiError(`${label} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

async function fetchListPages(type, apiBaseUrl, options = {}) {
  const endpoint = type === 'post' ? 'posts' : 'notes';
  const extra = type === 'post' ? '&truncate=1' : '&withSummary=1';
  const items = [];
  let expectedTotalPages = null;

  for (let page = 1; ; page += 1) {
    const url = `${apiBaseUrl}/${endpoint}?page=${page}&size=50${extra}`;
    const body = await fetchJson(url, options);
    const data = responseData(body, `${type} list page ${page}`);
    const pagination = body.meta && body.meta.pagination;
    if (!Array.isArray(data) || !pagination) {
      throw apiError(`${type} list page ${page} is missing data or pagination metadata`);
    }

    const responsePage = integer(pagination.page, `${type} pagination.page`, 1);
    const totalPages = integer(pagination.total_pages, `${type} pagination.total_pages`);
    if (responsePage !== page) {
      throw apiError(`${type} list returned page ${responsePage} while page ${page} was requested`);
    }
    if (expectedTotalPages !== null && totalPages !== expectedTotalPages) {
      throw apiError(`${type} pagination changed during synchronization`);
    }
    expectedTotalPages = totalPages;
    items.push(...data);
    if (totalPages === 0 || page === totalPages) break;
    if (page > totalPages) throw apiError(`${type} pagination ended unexpectedly`);
  }

  const unique = new Map();
  for (const item of items) {
    const id = String(item && item.id || '').trim();
    if (!id) throw apiError(`${type} list contains an item without an immutable id`);
    if (!unique.has(id)) unique.set(id, item);
  }
  return Array.from(unique.values());
}

async function concurrentMap(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker()
  ));
  return results;
}

function validTimestamp(value, label) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) throw apiError(`${label} is not a valid timestamp`);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function getPostPath(post) {
  const id = String(post && post.id || '').trim() || 'unknown';
  const remoteSlug = String(post && post.slug || '').trim();
  const categorySlug = String(post && post.category && post.category.slug || '').trim();
  if (!remoteSlug || !categorySlug) {
    throw apiError(`post:${id} is missing its slug or category slug`);
  }
  return `/posts/${encodeURIComponent(categorySlug)}/${encodeURIComponent(remoteSlug)}`;
}

function getNotePath(note) {
  const id = String(note && note.id || '').trim() || 'unknown';
  return `/notes/${integer(note && note.nid, `note:${id} nid`, 1)}`;
}

function originalContentUrl(pathname) {
  return new URL(pathname, `${ORIGINAL_SITE_URL}/`).toString();
}

function normalizedRemoteItem(type, listItem, detail) {
  const id = String(detail && detail.id || '').trim();
  const expectedId = String(listItem && listItem.id || '').trim();
  if (!id || id !== expectedId) throw apiError(`${type} detail id does not match its list item`);

  const title = String(detail.title || '').trim();
  const text = String(detail.text || '').replace(/\r\n?/g, '\n').trim();
  if (!title) throw apiError(`${type}:${id} has no title`);
  if (!text) throw apiError(`${type}:${id} has no public Markdown text`);

  const normalized = {
    key: `${type}:${id}`,
    type,
    id,
    title,
    text,
    createdAt: validTimestamp(detail.created_at, `${type}:${id} created_at`),
    modifiedAt: validTimestamp(
      detail.modified_at || detail.created_at,
      `${type}:${id} modified_at`
    ),
    contentFormat: String(detail.content_format || 'markdown').trim() || 'markdown',
    tags: Array.isArray(detail.tags)
      ? Array.from(new Set(detail.tags.map((tag) => String(tag).trim()).filter(Boolean)))
      : []
  };

  if (type === 'post') {
    const remoteSlug = String(detail.slug || '').trim();
    normalized.remoteSlug = remoteSlug;
    normalized.category = String(detail.category.name || '').trim();
    normalized.originalUrl = originalContentUrl(getPostPath(detail));
  } else {
    normalized.nid = integer(detail.nid, `note:${id} nid`, 1);
    normalized.originalUrl = originalContentUrl(getNotePath(detail));
  }

  return normalized;
}

async function fetchRemoteContent(options = {}) {
  const apiBaseUrl = String(options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const requestOptions = {
    fetchImpl: options.fetchImpl,
    attempts: options.attempts,
    timeoutMs: options.timeoutMs,
    retryDelayMs: options.retryDelayMs,
    logger: options.logger
  };
  const posts = await fetchListPages('post', apiBaseUrl, requestOptions);
  const notes = await fetchListPages('note', apiBaseUrl, requestOptions);
  const references = [
    ...posts.map((item) => ({ type: 'post', item })),
    ...notes.map((item) => ({ type: 'note', item }))
  ];

  return concurrentMap(references, DETAIL_CONCURRENCY, async ({ type, item }) => {
    const detailPath = type === 'post'
      ? `posts/${encodeURIComponent(String(item.id))}`
      : `notes/nid/${encodeURIComponent(String(item.nid))}?single=1`;
    const body = await fetchJson(`${apiBaseUrl}/${detailPath}`, requestOptions);
    return normalizedRemoteItem(type, item, responseData(body, `${type} detail`));
  });
}

function loadMapping(root) {
  const mappingPath = path.join(root, MAPPING_FILENAME);
  let mapping;
  try {
    mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  } catch (error) {
    throw apiError(`unable to read ${MAPPING_FILENAME}`, error);
  }
  if (!mapping || mapping.version !== 1 || !mapping.items || typeof mapping.items !== 'object') {
    throw apiError(`${MAPPING_FILENAME} has an unsupported structure`);
  }

  const seenSlugs = new Set();
  let highestSlug = 0;
  for (const [key, item] of Object.entries(mapping.items)) {
    if (!/^(?:post|note):\d+$/.test(key)) throw apiError(`invalid mapping key ${key}`);
    const slug = integer(item.slug, `${key} slug`, 1);
    if (seenSlugs.has(slug)) throw apiError(`numeric slug ${slug} is assigned more than once`);
    seenSlugs.add(slug);
    highestSlug = Math.max(highestSlug, slug);
  }
  const nextSlug = integer(mapping.next_slug, 'next_slug', 1);
  if (nextSlug <= highestSlug) throw apiError('next_slug must be greater than every assigned slug');

  return JSON.parse(JSON.stringify(mapping));
}

function updateMapping(mapping, remoteItems) {
  const next = JSON.parse(JSON.stringify(mapping));
  const remoteKeys = new Set(remoteItems.map((item) => item.key));
  if (remoteKeys.size !== remoteItems.length) throw apiError('the API returned duplicate content identities');

  for (const item of Object.values(next.items)) item.active = false;
  const newItems = remoteItems
    .filter((item) => !next.items[item.key])
    .sort((left, right) => (
      left.createdAt.localeCompare(right.createdAt) ||
      left.type.localeCompare(right.type) ||
      left.id.localeCompare(right.id)
    ));

  for (const item of newItems) {
    next.items[item.key] = {
      slug: next.next_slug,
      active: true,
      source_type: item.type,
      source_id: item.id
    };
    next.next_slug += 1;
  }

  for (const item of remoteItems) {
    const entry = next.items[item.key];
    entry.active = true;
    entry.source_type = item.type;
    entry.source_id = item.id;
    if (item.type === 'note') entry.source_nid = item.nid;
    else delete entry.source_nid;
  }

  return next;
}

function renderPost(item, mappingEntry) {
  const frontMatter = {
    title: item.title,
    slug: mappingEntry.slug,
    date: item.createdAt,
    updated: item.modifiedAt,
    tags: item.tags,
    original_url: item.originalUrl,
    source_type: item.type,
    source_id: item.id
  };
  if (item.category) frontMatter.categories = [item.category];
  if (item.type === 'note') frontMatter.source_nid = item.nid;
  if (item.type === 'post') frontMatter.source_slug = item.remoteSlug;
  frontMatter.content_format = item.contentFormat;
  frontMatter.managed = true;

  const header = yaml.dump(frontMatter, {
    noRefs: true,
    lineWidth: -1,
    sortKeys: false
  }).trimEnd();
  return `---\n${header}\n---\n\n${item.text}\n`;
}

function currentPostContents(postsDirectory) {
  if (!fs.existsSync(postsDirectory)) return new Map();
  return new Map(fs.readdirSync(postsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[1-9]\d*\.md$/i.test(entry.name))
    .map((entry) => [entry.name, fs.readFileSync(path.join(postsDirectory, entry.name), 'utf8')])
  );
}

function replaceGeneratedContent(root, remoteItems, mapping) {
  const sourceDirectory = path.join(root, 'source');
  const postsDirectory = path.join(sourceDirectory, '_posts');
  const mappingPath = path.join(root, MAPPING_FILENAME);
  const stageDirectory = fs.mkdtempSync(path.join(sourceDirectory, '.posts-sync-'));
  const mappingTemp = `${mappingPath}.tmp-${process.pid}`;
  const postsBackup = `${postsDirectory}.backup-${process.pid}`;
  const mappingBackup = `${mappingPath}.backup-${process.pid}`;
  const previous = currentPostContents(postsDirectory);

  try {
    for (const item of remoteItems) {
      const entry = mapping.items[item.key];
      const filename = `${entry.slug}.md`;
      fs.writeFileSync(path.join(stageDirectory, filename), renderPost(item, entry), 'utf8');
    }

    const stagedFiles = fs.readdirSync(stageDirectory).sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
    if (stagedFiles.length !== remoteItems.length) throw apiError('staged article count is incomplete');
    for (const filename of stagedFiles) articlePayload(root, path.join(stageDirectory, filename));
    fs.writeFileSync(mappingTemp, `${JSON.stringify(mapping, null, 2)}\n`, 'utf8');

    fs.renameSync(postsDirectory, postsBackup);
    fs.renameSync(stageDirectory, postsDirectory);
    fs.renameSync(mappingPath, mappingBackup);
    fs.renameSync(mappingTemp, mappingPath);
    fs.rmSync(postsBackup, { recursive: true, force: true });
    fs.rmSync(mappingBackup, { force: true });
  } catch (error) {
    if (fs.existsSync(postsBackup)) {
      if (fs.existsSync(postsDirectory)) fs.rmSync(postsDirectory, { recursive: true, force: true });
      fs.renameSync(postsBackup, postsDirectory);
    }
    if (fs.existsSync(mappingBackup)) {
      if (fs.existsSync(mappingPath)) fs.rmSync(mappingPath, { force: true });
      fs.renameSync(mappingBackup, mappingPath);
    }
    throw error;
  } finally {
    fs.rmSync(stageDirectory, { recursive: true, force: true });
    fs.rmSync(mappingTemp, { force: true });
  }

  const next = currentPostContents(postsDirectory);
  const changed = Array.from(next).filter(([name, content]) => previous.get(name) !== content).length;
  const removed = Array.from(previous.keys()).filter((name) => !next.has(name)).length;
  return { changed, removed, total: next.size };
}

async function synchronize(options = {}) {
  const root = options.root || ROOT;
  const mapping = loadMapping(root);
  const remoteItems = await fetchRemoteContent(options);
  const nextMapping = updateMapping(mapping, remoteItems);
  const result = replaceGeneratedContent(root, remoteItems, nextMapping);
  const inactive = Object.values(nextMapping.items).filter((item) => !item.active).length;
  return { ...result, inactive, nextSlug: nextMapping.next_slug };
}

async function runContentSync(options = {}) {
  const logger = options.logger || console;
  let result;
  try {
    result = await synchronize(options);
  } catch (error) {
    if (options.allowUnavailable && error.transient) {
      logger.warn(
        `${error.message}. Existing generated posts and slug mappings were retained; ` +
        'this build will continue without fresh content.'
      );
      return { skipped: true, reason: error.message };
    }
    throw error;
  }
  logger.log(
    `Synchronized ${result.total} items from Core API ` +
    `(${result.changed} changed, ${result.removed} removed, ${result.inactive} inactive mappings).`
  );
  return { ...result, skipped: false };
}

async function main() {
  await runContentSync({
    apiBaseUrl: process.env.CORE_API_BASE_URL || DEFAULT_API_BASE_URL,
    allowUnavailable: process.argv.includes('--allow-unavailable')
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchRemoteContent,
  getNotePath,
  getPostPath,
  loadMapping,
  normalizedRemoteItem,
  originalContentUrl,
  renderPost,
  runContentSync,
  synchronize,
  updateMapping,
  validTimestamp
};
