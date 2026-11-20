/* Offline support: app files are cached; the QR reader library is cached on first use. */
const CACHE = 'qra-mobile-v1.0';
const SHELL = ['./', 'index.html', 'app.js', 'core.js', 'qr.js', 'xlsx.js', 'config.js', 'jszip.min.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    try { await c.add(new Request(JSQR, { mode: 'cors' })); } catch (err) { /* cached later on first use */ }
  }));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isLib = /jsqr@/.test(url.href);
  if (url.origin !== location.origin && !isLib) return;
  // cache first, then refresh in background (stale-while-revalidate)
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; })
      .catch(() => hit);
    return hit || net;
  }));
});
