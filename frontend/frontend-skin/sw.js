/* Ernos Zdravstvena Njega /sw.js */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/tap/')) {
      event.respondWith(fetch(event.request, { cache: 'no-store' }));
      return;
    }

    if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
      event.respondWith((async () => {
        const res = await fetch(event.request, { cache: 'no-store' });
        const html = await res.text();
        const tag = '<script src="/hr-rebrand.js?v=20260702-1"></script>';
        const bodyClose = '</body>';
        const out = html.includes('/hr-rebrand.js')
          ? html
          : (html.includes(bodyClose) ? html.replace(bodyClose, tag + bodyClose) : html + tag);
        return new Response(out, {
          status: res.status,
          statusText: res.statusText,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      })());
      return;
    }
  } catch (_) {}
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch (_) {}
  const title = data.title || 'Ernos Zdravstvena Njega';
  const body = data.body || 'Imate novu obavijest';
  const url = data.url || '/';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    data: { url },
    tag: 'ernos-' + Date.now(),
    badge: '/skin/icons/favicon-32.png',
    icon: '/skin/icons/logo.png'
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification?.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const origin = self.location.origin;
    const existing = all.find(c => (c.url || '').startsWith(origin));
    if (existing) {
      await existing.focus();
      try { existing.postMessage({ type: 'NAV', url }); } catch (_) {}
      try { if ('navigate' in existing) await existing.navigate(url); } catch (_) {}
      return;
    }
    await clients.openWindow(url);
  })());
});
