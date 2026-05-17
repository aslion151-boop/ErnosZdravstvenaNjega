/* Ernos /sw.js — push + click handlers (debug verbose) */
self.addEventListener('install', (e) => {
  console.log('[SW] install');
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  console.log('[SW] activate');
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('[SW] push event raw:', event);
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (e) {
    console.warn('[SW] push payload not JSON:', e);
    data = {};
  }

  console.log('[SW] push payload parsed:', data);

  const kind = String(data.kind || '').toLowerCase();
  const defaults = (() => {
    switch (kind) {
      case 'maintenance': return { title: 'Maintenance', body: 'New maintenance issue', url: '/#maint' };
      case 'visitor':
      case 'visitors':    return { title: 'Visitor arrived', body: 'A visitor has checked in', url: '/#visitors?onsite=1' };
      default:            return { title: 'Ernos', body: 'You have a new notification', url: '/' };
    }
  })();

  const title = data.title || defaults.title;
  const body  = data.body  || defaults.body;
  const url   = data.url   || defaults.url;

  const tag = (kind || 'ernos') + '-' + Date.now();
  const options = {
    body,
    data: { url, kind },
    tag,
    renotify: false,
    badge: '/skin/icons/favicon-32.png',
    icon:  '/skin/icons/logo.png',
    requireInteraction: false
  };

  console.log('[SW] showNotification:', { title, options });
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] notificationclick:', event.notification?.data);
  event.notification.close();
  const url = (event.notification?.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const origin = self.location.origin;
    const existing = all.find(c => (c.url || '').startsWith(origin));

    if (existing) {
      console.log('[SW] focusing existing client and navigating to', url);
      await existing.focus();
      try { existing.postMessage({ type: 'NAV', url }); } catch (_) {}
      try { if ('navigate' in existing) await existing.navigate(url); } catch (_) {}
      return;
    }
    console.log('[SW] opening new window to', url);
    await clients.openWindow(url);
  })());
  /* BYPASS TAP PAGES: always fetch fresh HTML for /tap/* */
self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);

    // 1) Never cache tap pages (prevents stale tap HTML)
    if (url.pathname.startsWith('/tap/')) {
      event.respondWith(fetch(event.request, { cache: 'no-store' }));
      return;
    }

    // (optional safety) for SPA navigations you can keep default network
    // behavior. If you don't have any other caching logic, you can drop this.
    // If you DO cache elsewhere, leave navigations to network first:
    // if (event.request.mode === 'navigate') {
    //   event.respondWith(fetch(event.request));
    //   return;
    // }

  } catch (_) {
    // fall through to default
  }
});

});
