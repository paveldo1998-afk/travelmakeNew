/* TravelOrganizer project-scoped public shell only. Personal records and Blob
 * files live in IndexedDB and are never placed in these public caches. */
const VERSION = '2026-10-31-reference-4';
const PREFIX = 'travelorganizer-pwa-travelmakeNew-';
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const IMAGE_CACHE = `${PREFIX}images-${VERSION}`;
const ROOT = new URL('./', self.location.href);
const INDEX = new URL('index.html', ROOT).href;
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'favicon.svg',
  'js/controller.js', 'js/shared.js', 'js/views.js', 'js/forms.js', 'js/gestures.js', 'js/domain.js', 'js/storage.js', 'js/pwa.js',
  'assets/fonts/golos-text.woff2', 'assets/fonts/lora.ttf',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
  'assets/icons/maskable-192.png', 'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png', 'assets/photos/credits.html'
].map(path => new URL(path, ROOT).href);
const IMAGES = [
  'kyoto.jpg', 'amalfi.jpg', 'barcelona.jpg', 'kyoto-alley.jpg', 'temple.jpg', 'breakfast.jpg',
  'candidate-36664010.jpg', 'positano-coast.jpg', 'barcelona-guell.jpg',
  'kiyomizu-dera.jpg', 'japanese-breakfast.jpg', 'kyoto-sunset.jpg', 'kyoto-lanterns.jpg'
].map(path => new URL(`assets/photos/${path}`, ROOT).href);
const ALLOWED_SHELL = new Set(SHELL);
const ALLOWED_IMAGES = new Set(IMAGES);
const MAX_IMAGES = 14;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Refuse a developer release that changed this worker without bumping
    // VERSION. Updating shared cache names in place could otherwise damage
    // the still-active shell if installation then failed.
    const existing = await caches.keys();
    if (self.registration.active && (existing.includes(SHELL_CACHE) || existing.includes(IMAGE_CACHE))) {
      throw new Error('TravelOrganizer: bump service worker VERSION for a new release.');
    }
    try {
      const [shell, images] = await Promise.all([caches.open(SHELL_CACHE), caches.open(IMAGE_CACHE)]);
      // A version is installable only after all required assets are present.
      // A failed install leaves the previous active worker untouched.
      await Promise.all([
        shell.addAll(SHELL.map(url => new Request(url, {cache: 'reload'}))),
        images.addAll(IMAGES.map(url => new Request(url, {cache: 'reload'})))
      ]);
    } catch (error) {
      await Promise.all([caches.delete(SHELL_CACHE), caches.delete(IMAGE_CACHE)]);
      throw error;
    }
    // Activation waits for explicit SKIP_WAITING from the guarded interface.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const current = new Set([SHELL_CACHE, IMAGE_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && !current.has(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function shellStatus() {
  const [shell, images] = await Promise.all([caches.open(SHELL_CACHE), caches.open(IMAGE_CACHE)]);
  const results = await Promise.all([...SHELL.map(url => shell.match(url)), ...IMAGES.map(url => images.match(url))]);
  return {version: VERSION, offlineReady: results.every(Boolean), scope: ROOT.href};
}

self.addEventListener('message', event => {
  if (!event.data || typeof event.data.type !== 'string') return;
  if (event.data.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  else if (event.data.type === 'GET_STATUS' && event.ports[0]) {
    event.waitUntil(shellStatus().then(status => event.ports[0].postMessage(status)));
  }
});

async function trimImages(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_IMAGES)).map(key => cache.delete(key)));
}

async function publicResource(request, cacheName, image = false) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
    if (image) await trimImages(cache);
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  // Hash routing only. Unknown paths are not treated as app routes.
  // Queries on public modules/assets are never cached.
  const isAppNavigation = request.mode === 'navigate' &&
    (url.pathname === ROOT.pathname || url.pathname === new URL('index.html', ROOT).pathname);
  if (isAppNavigation) {
    event.respondWith((async () => {
      try { const response = await fetch(request); if (response.ok) return response; }
      catch { /* Offline: use the completely installed shell. */ }
      const shell = await caches.open(SHELL_CACHE);
      return await shell.match(INDEX) || new Response(
        '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TravelOrganizer — нет сети</title><h1>Нет сети</h1><p>Офлайн-оболочка пока недоступна. Подключитесь к интернету и откройте приложение снова.</p></html>',
        {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8'}}
      );
    })());
  } else if (!url.search && ALLOWED_SHELL.has(url.href)) {
    event.respondWith(publicResource(request, SHELL_CACHE));
  } else if (!url.search && ALLOWED_IMAGES.has(url.href)) {
    event.respondWith(publicResource(request, IMAGE_CACHE, true));
  }
  // API traffic, unknown images, uploads and private files pass through.
});
