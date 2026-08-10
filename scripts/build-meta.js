'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = hexo.base_dir;
const inputs = [
  '_config.yml',
  'package.json',
  'pnpm-lock.yaml',
  'scripts',
  'source',
  path.join('themes', 'hong-minimal')
];

function collectFiles(target) {
  if (!fs.existsSync(target)) return [];

  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  if (!stat.isDirectory()) return [];

  return fs.readdirSync(target, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => collectFiles(path.join(target, entry.name)));
}

function createBuildHash() {
  const hash = crypto.createHash('sha256');
  const files = inputs
    .flatMap((input) => collectFiles(path.join(root, input)))
    .sort((left, right) => left.localeCompare(right));

  files.forEach((file) => {
    hash.update(path.relative(root, file).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  });

  return hash.digest('hex').slice(0, 8);
}

function formatBuildTime(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: hexo.config.timezone || 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

const buildStartedAt = new Date();
const buildMeta = Object.freeze({
  hash: createBuildHash(),
  datetime: buildStartedAt.toISOString(),
  time: formatBuildTime(buildStartedAt)
});

hexo.extend.helper.register('build_meta', () => buildMeta);
