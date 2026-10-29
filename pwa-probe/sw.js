// Service worker for the PWA probe (MS-255). It lives in /pwa-probe/ and is registered with scope './',
// so it can only ever see requests for pages inside /pwa-probe/: never the real app at the site's root.
// Strategy: cache first. The page and its files are stored on install, so the probe opens with no internet.
// A changed copy of this file is a new version: it installs, then waits until the page asks it to take over
// ("New version: reload"), so the stale-version risk of MS-163 is exercised too.
// Bump VERSION here AND in index.html for every change to any probe file.
const VERSION = 'probe 1';
const CACHE = 'pwaProbe.cache.' + VERSION.replace(/\s+/g, '-');
const FILES = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
    // cache: 'reload' skips the browser's own HTTP cache, so a new version stores the new files
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
    // Remove only this probe's older caches (names start with pwaProbe.cache.)
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k.startsWith('pwaProbe.cache.') && k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') self.skipWaiting();
    else if (event.data === 'version' && event.source) event.source.postMessage({ version: VERSION });
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (!url.href.startsWith(self.registration.scope)) return;
    if (url.searchParams.has('pwaProbePing')) return; // the page's internet check always goes to the network
    // Any page address inside the folder (./, ./index.html, with or without ?…) opens the stored page
    if (req.mode === 'navigate') {
        event.respondWith(caches.open(CACHE).then(cache => cache.match('index.html')).then(r => r || fetch(req)));
        return;
    }
    event.respondWith(caches.open(CACHE).then(cache => cache.match(req, { ignoreSearch: true })).then(r => r || fetch(req)));
});
