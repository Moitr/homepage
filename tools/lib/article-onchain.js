'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const frontMatter = require('hexo-front-matter');
const yaml = require('js-yaml');
const { lexer, walkTokens } = require('marked');
const solc = require('solc');
const {
  AbiCoder,
  concat,
  getCreate2Address,
  keccak256,
  toUtf8Bytes
} = require('ethers');
const {
  DETERMINISTIC_DEPLOYER
} = require('./homepage-onchain');

const ARTICLE_DEPLOYMENT_SALT = keccak256(toUtf8Bytes('moitr.article.archive.polygon.v1'));
const MAX_ARTICLE_BYTES = 24_576;
const CONTRACT_PATH = path.join(__dirname, '..', '..', 'contracts', 'ArticleArchive.sol');

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function normalizeMarkdown(content) {
  return String(content || '').replace(/\r\n/g, '\n').trim() + '\n';
}

function normalizeDate(value) {
  const source = String(value || '').trim().replace(' ', 'T');
  if (!source) throw new Error('Article date is required.');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(source);
  const date = new Date(hasTimezone ? source : `${source}Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid article date: ${value}`);
  return date.toISOString().replace('.000Z', 'Z');
}

function imageName(href, index) {
  try {
    const pathname = new URL(href, 'https://local.invalid/').pathname;
    return decodeURIComponent(path.posix.basename(pathname)) || `image-${index + 1}`;
  } catch (error) {
    return path.basename(href) || `image-${index + 1}`;
  }
}

function localImagePath(root, postPath, href) {
  const cleanHref = href.split(/[?#]/, 1)[0];
  const candidates = cleanHref.startsWith('/')
    ? [path.join(root, 'source', cleanHref.replace(/^\/+/, ''))]
    : [path.resolve(path.dirname(postPath), cleanHref), path.join(root, 'source', cleanHref)];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function articleImages(root, postPath, markdown) {
  const references = [];
  walkTokens(lexer(markdown), (token) => {
    if (token.type === 'image' && token.href) references.push(String(token.href));
    if (token.type === 'html') {
      for (const match of token.raw.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
        references.push(match[1]);
      }
    }
  });

  return Array.from(new Set(references)).map((href, index) => {
    const localPath = !/^https?:\/\//i.test(href) && !/^data:/i.test(href)
      ? localImagePath(root, postPath, href)
      : null;
    const digestSource = localPath ? fs.readFileSync(localPath) : Buffer.from(href, 'utf8');
    return { name: imageName(href, index), hash: md5(digestSource) };
  });
}

function articlePayload(root, postPath) {
  const raw = fs.readFileSync(postPath, 'utf8').replace(/\r\n/g, '\n');
  const parsed = frontMatter.parse(raw, { schema: yaml.FAILSAFE_SCHEMA });
  const slug = String(parsed.slug || path.basename(postPath, path.extname(postPath))).trim();
  if (!/^[1-9]\d*$/.test(slug)) {
    throw new Error(`${path.relative(root, postPath)} must use a positive numeric slug.`);
  }
  if (path.basename(postPath, path.extname(postPath)) !== slug) {
    throw new Error(`${path.relative(root, postPath)} filename must match slug ${slug}.`);
  }
  const markdown = normalizeMarkdown(parsed._content);
  const payload = {
    title: String(parsed.title || '').trim(),
    slug,
    date: normalizeDate(parsed.date),
    content: zlib.gzipSync(Buffer.from(markdown, 'utf8'), { level: 9, mtime: 0 }).toString('base64'),
    images: articleImages(root, postPath, markdown)
  };
  if (!payload.title) throw new Error(`${path.relative(root, postPath)} must have a title.`);

  const json = JSON.stringify(payload);
  const bytes = toUtf8Bytes(json);
  const semanticJson = JSON.stringify({ ...payload, content: markdown });
  if (bytes.length > MAX_ARTICLE_BYTES) {
    throw new Error(`${payload.slug} payload is ${bytes.length} bytes; maximum is ${MAX_ARTICLE_BYTES}.`);
  }
  return {
    ...payload,
    originalUrl: String(parsed.original_url || '').trim(),
    markdown,
    json,
    bytes,
    contentHash: keccak256(toUtf8Bytes(semanticJson)),
    slugHash: keccak256(toUtf8Bytes(slug)),
    source: path.relative(root, postPath).replace(/\\/g, '/')
  };
}

function walkMarkdown(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkMarkdown(target);
    return /\.md$/i.test(entry.name) ? [target] : [];
  });
}

function loadArticles(root) {
  const articles = walkMarkdown(path.join(root, 'source', '_posts'))
    .map((postPath) => articlePayload(root, postPath))
    .sort((left, right) => Number(left.slug) - Number(right.slug));
  const seen = new Set();
  for (const article of articles) {
    if (seen.has(article.slug)) throw new Error(`Duplicate article slug: ${article.slug}`);
    seen.add(article.slug);
  }
  return articles;
}

function compileArticleArchive() {
  const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'ArticleArchive.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((item) => item.severity === 'error');
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
  const contract = output.contracts['ArticleArchive.sol'].ArticleArchive;
  return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}

function deterministicArticleContract(owner, bytecode) {
  const constructorArgs = AbiCoder.defaultAbiCoder().encode(['address'], [owner]);
  const initCode = concat([bytecode, constructorArgs]);
  return {
    address: getCreate2Address(
      DETERMINISTIC_DEPLOYER,
      ARTICLE_DEPLOYMENT_SALT,
      keccak256(initCode)
    ),
    initCode
  };
}

module.exports = {
  ARTICLE_DEPLOYMENT_SALT,
  MAX_ARTICLE_BYTES,
  articlePayload,
  compileArticleArchive,
  deterministicArticleContract,
  loadArticles,
  normalizeDate,
  normalizeMarkdown
};
