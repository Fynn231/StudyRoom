// Public, non-personalized app shell only. Build injects exact emitted JS/CSS paths.
const VERSION = 'studyroom-v2';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const BUILD_ASSETS = {};
const PUBLIC = {
  '/': 'text/html',
  '/index.html': 'text/html',
  '/manifest.webmanifest': 'application/manifest+json',
  '/icon-192.png': 'image/png',
  '/icon-512.png': 'image/png',
  '/icon-maskable-512.png': 'image/png',
  ...BUILD_ASSETS,
};
const PRECACHE = Object.keys(PUBLIC).filter(path => path !== '/');
function valid(response, path) {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return response.ok && response.status === 200 && !response.redirected && response.type === 'basic' && type === PUBLIC[path];
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Validate the entire set before writing anything. Never precache a login/error page.
    const entries = await Promise.all(PRECACHE.map(async path => {
      const response = await fetch(path, { credentials: 'omit', redirect: 'error', cache: 'reload' });
      if (!valid(response, path)) throw new Error('Invalid public shell response.');
      return [path, response];
    }));
    const shell = await caches.open(SHELL);
    const assets = await caches.open(ASSETS);
    await Promise.all(entries.map(([path, response]) => (path === '/index.html' ? shell : assets).put(path, response)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => /^studyroom-v\d+-(?:shell|assets)$/.test(key) && key !== SHELL && key !== ASSETS)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.search || !Object.hasOwn(PUBLIC, url.pathname)) return;
  const shell = url.pathname === '/' || url.pathname === '/index.html';
  if (request.mode === 'navigate' && !shell) return;
  const path = shell ? '/index.html' : url.pathname;
  event.respondWith((async () => {
    const cache = await caches.open(shell ? SHELL : ASSETS);
    if (!shell) {
      const cached = await cache.match(path);
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      if (valid(response, path)) {
        const write = cache.put(path, response.clone()).catch(() => {});
        event.waitUntil(write);
      }
      return response;
    } catch (error) {
      const cached = await cache.match(path);
      if (cached) return cached;
      throw error;
    }
  })());
});
