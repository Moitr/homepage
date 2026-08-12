'use strict';

const { execFileSync } = require('node:child_process');

function buildId() {
  const githubHash = String(process.env.GITHUB_SHA || '').trim();
  if (/^[0-9a-f]{7,40}$/i.test(githubHash)) return githubHash.slice(0, 12).toLowerCase();
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: hexo.base_dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim().toLowerCase();
  } catch (error) {
    return 'development';
  }
}

const source = `'use strict';

const CACHE_NAME = 'between-static-${buildId()}';
const CACHE_DESTINATIONS = new Set(['font', 'script', 'style']);

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('between-static-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !CACHE_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()));
      return response;
    })
  );
});
`;

hexo.extend.generator.register('service-worker', () => ({
  path: 'sw.js',
  data: source
}));
