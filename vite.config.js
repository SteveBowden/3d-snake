import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'offline-cache',
    generateBundle(_, bundle) {
      const files = ['./', './index.html', './icon.svg', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', ...Object.keys(bundle).map(f => `./${f}`)];
      const version = Object.keys(bundle).join('-');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'verdant-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('verdant-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match(new URL('./index.html', self.registration.scope)).then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request, { ignoreVary: true }).then(cached => cached || fetch(event.request).catch(error => {
    if (event.request.mode === 'navigate') return caches.match(new URL('./index.html', self.registration.scope));
    throw error;
  })));
});` });
    }
  }]
});
