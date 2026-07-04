/* Ernos Zdravstvena Njega service worker - cache/injection disabled */
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil((async function(){
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function(k){ return caches.delete(k); }));
    } catch (e) {}
    try { await self.clients.claim(); } catch (e2) {}
  })());
});

self.addEventListener('fetch', function(event) {
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});
