'use strict';

const { execFileSync } = require('node:child_process');

const root = hexo.base_dir;

function normalizeCommitHash(value) {
  const hash = String(value || '').trim();
  return /^[0-9a-f]{7,40}$/i.test(hash) ? hash.slice(0, 8).toLowerCase() : '';
}

function getCommitHash() {
  const githubHash = normalizeCommitHash(process.env.GITHUB_SHA);
  if (githubHash) return githubHash;

  try {
    const localHash = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return normalizeCommitHash(localHash) || 'unknown';
  } catch (error) {
    return 'unknown';
  }
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
  hash: getCommitHash(),
  datetime: buildStartedAt.toISOString(),
  time: formatBuildTime(buildStartedAt)
});

hexo.extend.helper.register('build_meta', () => buildMeta);
