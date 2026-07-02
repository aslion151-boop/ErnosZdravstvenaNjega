/* Ernos Zdravstvena Njega /sw.js — push + UI rebrand overlay */

self.addEventListener('install', (event) => {
  console.log('[SW] install');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] activate');
  event.waitUntil(self.clients.claim());
});

function croatianHomeCareOverlay() {
  return `
;(() => {
  if (window.__ERNOS_HR_REBRAND__) return;
  window.__ERNOS_HR_REBRAND__ = true;

  const BRAND = 'Ernos Zdravstvena Njega';

  const exact = new Map([
    ['Ernos', BRAND],
    ['Ernos Nursing Home', BRAND],
    ['Nursing Home', 'Zdravstvena njega u kući'],
    ['Dashboard', 'Nadzorna ploča'],
    ['Residents', 'Pacijenti'],
    ['Resident', 'Pacijent'],
    ['Rooms', 'Lokacije'],
    ['Room', 'Lokacija'],
    ['Locations', 'Lokacije'],
    ['Location', 'Lokacija'],
    ['Staff', 'Djelatnici'],
    ['Users', 'Korisnici'],
    ['User', 'Korisnik'],
    ['Admin', 'Administracija'],
    ['Reports', 'Izvještaji'],
    ['QR Codes', 'QR/NFC kodovi'],
    ['QR codes', 'QR/NFC kodovi'],
    ['Check-in', 'Početak njege'],
    ['Check in', 'Početak njege'],
    ['Check-out', 'Završetak njege'],
    ['Check out', 'Završetak njege'],
    ['Open visits', 'Aktivne posjete'],
    ['Open Visits', 'Aktivne posjete'],
    ['Login', 'Prijava'],
    ['Log in', 'Prijava'],
    ['Log out', 'Odjava'],
    ['Logout', 'Odjava'],
    ['Username', 'Korisničko ime'],
    ['Password', 'Lozinka'],
    ['Save', 'Spremi'],
    ['Cancel', 'Odustani'],
    ['Delete', 'Obriši'],
    ['Edit', 'Uredi'],
    ['Add', 'Dodaj'],
    ['Create', 'Kreiraj'],
    ['Search', 'Pretraži'],
    ['Refresh', 'Osvježi'],
    ['Name', 'Ime'],
    ['Status', 'Status'],
    ['Actions', 'Radnje'],
    ['Created', 'Kreirano'],
    ['Updated', 'Ažurirano'],
    ['Active', 'Aktivno'],
    ['Inactive', 'Neaktivno'],
    ['View', 'Pregled'],
    ['Open', 'Otvori']
  ]);

  const phrase = [
    [/Ernos Nursing Home/g, BRAND],
    [/Nursing Home/g, 'Zdravstvena njega u kući'],
    [/Residents Out/g, 'Izlasci pacijenata'],
    [/Residents/g, 'Pacijenti'],
    [/Resident/g, 'Pacijent'],
    [/Rooms/g, 'Lokacije'],
    [/Room/g, 'Lokacija'],
    [/Locations/g, 'Lokacije'],
    [/Location/g, 'Lokacija'],
    [/Staff/g, 'Djelatnici'],
    [/Users/g, 'Korisnici'],
    [/Reports/g, 'Izvještaji'],
    [/QR Codes/g, 'QR\/NFC kodovi'],
    [/Check-in/g, 'Početak njege'],
    [/Check-out/g, 'Završetak njege'],
    [/Open visits/gi, 'Aktivne posjete'],
    [/Log out/g, 'Odjava'],
    [/Logout/g, 'Odjava'],
    [/Login/g, 'Prijava'],
    [/Username/g, 'Korisničko ime'],
    [/Password/g, 'Lozinka']
  ];

  const hiddenNavKeywords = [
    'visitor', 'visitors', 'fridge', 'fire', 'maintenance', 'environment', 'audit',
    'residents out', 'family', 'touchpoint', 'issues', 'alerts', 'reception',
    'qr print', 'locations', 'rooms', 'checkins', 'check-ins'
  ];

  const allowedNavKeywords = [
    'dashboard', 'residents', 'staff', 'users', 'admin', 'settings',
    'nadzorna ploča', 'pacijenti', 'djelatnici', 'korisnici', 'administracija', 'postavke'
  ];

  function translateText(value) {
    if (!value) return value;
    const trimmed = String(value).trim();
    if (exact.has(trimmed)) return String(value).replace(trimmed, exact.get(trimmed));
    let out = String(value);
    for (const [re, repl] of phrase) out = out.replace(re, repl);
    return out;
  }

  function translateNodeText(root) {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const next = translateText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }

  function translateAttributes(root) {
    const attrs = ['placeholder', 'title', 'aria-label', 'alt', 'value'];
    const all = [root || document.body, ...Array.from((root || document.body).querySelectorAll('*'))];
    for (const el of all) {
      for (const attr of attrs) {
        if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
        const oldValue = el.getAttribute(attr);
        const newValue = translateText(oldValue);
        if (newValue !== oldValue) el.setAttribute(attr, newValue);
      }
    }
  }

  function rebrandBasics() {
    document.documentElement.lang = 'hr';
    document.title = BRAND;
    const title = document.querySelector('title');
    if (title) title.textContent = BRAND;
    const crumbs = document.querySelector('#crumbs');
    if (crumbs && crumbs.textContent.trim() === 'Dashboard') crumbs.textContent = 'Nadzorna ploča';
  }

  function hideLegacyNav() {
    const nav = document.querySelector('#nav');
    if (!nav) return;

    const links = Array.from(nav.querySelectorAll('a, button, [role="button"]'));
    for (const item of links) {
      const txt = (item.textContent || '').trim().toLowerCase();
      const href = String(item.getAttribute('href') || item.dataset.route || '').toLowerCase();
      const hay = (txt + ' ' + href).trim();
      if (!hay) continue;

      const allowed = allowedNavKeywords.some(k => hay.includes(k));
      const hidden = hiddenNavKeywords.some(k => hay.includes(k));

      if (hidden && !allowed) {
        item.style.display = 'none';
        item.setAttribute('data-hr-hidden', '1');
      }
    }
  }

  function run() {
    try {
      rebrandBasics();
      translateNodeText(document.body);
      translateAttributes(document.body);
      hideLegacyNav();
    } catch (e) {
      console.warn('[Ernos HR rebrand] skipped:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  window.addEventListener('hashchange', () => setTimeout(run, 50));
  window.addEventListener('load', () => setTimeout(run, 100));
  setInterval(run, 1500);

  try {
    const mo = new MutationObserver(() => {
      clearTimeout(window.__ERNOS_HR_REBRAND_TIMER__);
      window.__ERNOS_HR_REBRAND_TIMER__ = setTimeout(run, 80);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
})();
`;
}

self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);

    // Never cache tap pages; QR/NFC pages must always be fresh.
    if (url.pathname.startsWith('/tap/')) {
      event.respondWith(fetch(event.request, { cache: 'no-store' }));
      return;
    }

    // Append Croatian UI overlay to the existing legacy bundle without editing the huge bundle file.
    if (url.pathname === '/app.bundle.js') {
      event.respondWith((async () => {
        const res = await fetch(event.request, { cache: 'no-store' });
        const code = await res.text();
        return new Response(code + '\n\n' + croatianHomeCareOverlay(), {
          status: res.status,
          statusText: res.statusText,
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        });
      })());
      return;
    }
  } catch (e) {
    console.warn('[SW] fetch handler skipped:', e);
  }
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

  const kind = String(data.kind || '').toLowerCase();
  const defaults = (() => {
    switch (kind) {
      case 'maintenance': return { title: 'Održavanje', body: 'Novi zadatak održavanja', url: '/#maint' };
      case 'visitor':
      case 'visitors':    return { title: 'Posjetitelj stigao', body: 'Posjetitelj se prijavio', url: '/#visitors?onsite=1' };
      default:            return { title: 'Ernos Zdravstvena Njega', body: 'Imate novu obavijest', url: '/' };
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
      await existing.focus();
      try { existing.postMessage({ type: 'NAV', url }); } catch (_) {}
      try { if ('navigate' in existing) await existing.navigate(url); } catch (_) {}
      return;
    }

    await clients.openWindow(url);
  })());
});
