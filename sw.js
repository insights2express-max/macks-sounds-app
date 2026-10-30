// Service worker for the installed app (MS-163, v336): the app opens with no internet.
// build.ps1 stamps the version in place of v336 and writes this file beside the published index.html.
// Published at …/macks-sounds-app/sw.js, so its scope is the whole site folder, including previous/, sound-prep/ and
// pwa-probe/. It answers ONLY for the app's own files listed below; every other request (those pages, DEVBOARD.md,
// tools/, anything else) goes to the network exactly as if there were no service worker.
// Strategy: cache first. The files are stored on install; a new version installs beside the old one, then waits
// until the page's "New version: reload" button asks it to take over.
const APP_VERSION = 'v336';
const CACHE_PREFIX = 'appShell.';           // the probe's caches start with pwaProbe., so neither deletes the other's
const CACHE = CACHE_PREFIX + APP_VERSION;
const PAGE = 'index.html';
const FILES = [PAGE, 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
    // Each file is fetched with ?v=<version> (and past the browser's own cache), so the GitHub Pages server can't hand back
    // a copy of the old version it still remembers. The page must be the version this worker belongs to; otherwise the
    // install fails and is simply tried again on the next visit, rather than storing a mismatched copy.
    event.waitUntil(caches.open(CACHE).then(cache => Promise.all(FILES.map(async file => {
        const response = await fetch(`${file}?v=${encodeURIComponent(APP_VERSION)}`, { cache: 'reload' });
        if (!response.ok) throw new Error(`${file}: ${response.status}`);
        if (file === PAGE && !(await response.clone().text()).includes(`const APP_VERSION = '${APP_VERSION}'`)) {
            throw new Error(`${file} is not ${APP_VERSION} yet`);
        }
        await cache.put(file, response);
    }))).catch(err => caches.delete(CACHE).then(() => { throw err; }))); // no half-filled copy is left behind
});

self.addEventListener('activate', event => {
    // Delete this app's older versions only (names start with appShell.)
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const scope = self.registration.scope;
    if (!req.url.startsWith(scope)) return;
    const path = new URL(req.url).pathname.slice(new URL(scope).pathname.length); // e.g. '', 'index.html', 'previous/'
    const file = req.mode === 'navigate' ? (path === '' || path === PAGE ? PAGE : null) : (FILES.includes(path) ? path : null);
    if (!file) return; // not the app's own file: the network handles it, untouched
    event.respondWith(caches.open(CACHE).then(cache => cache.match(file)).then(r => r || fetch(req)));
});
