/* Ernos Zdravstvena Njega - Croatian UI cleanup */
(() => {
  if (window.__ERNOS_ZNJ_UI__) return;
  window.__ERNOS_ZNJ_UI__ = true;

  const BRAND = 'Ernos Zdravstvena Njega';
  const MENU = [
    ['#dashboard', 'Nadzorna ploča'],
    ['#patients', 'Pacijenti'],
    ['#staff', 'Djelatnici'],
    ['#settings', 'Administracija']
  ];

  const replacements = [
    ['Ernos Nursing Home', BRAND],
    ['Nursing Home', 'Zdravstvena njega u kući'],
    ['Dashboard', 'Nadzorna ploča'],
    ['Residents Out', 'Izlasci pacijenata'],
    ['Residents', 'Pacijenti'],
    ['Resident', 'Pacijent'],
    ['Staff & Roles', 'Djelatnici i uloge'],
    ['Staff', 'Djelatnici'],
    ['Users', 'Korisnici'],
    ['Settings', 'Administracija'],
    ['Reports', 'Izvještaji'],
    ['Locations', 'Lokacije'],
    ['QR Codes', 'QR/NFC kodovi'],
    ['Check-in', 'Početak njege'],
    ['Check-out', 'Završetak njege'],
    ['Login', 'Prijava'],
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
    ['Role', 'Uloga'],
    ['Category', 'Kategorija'],
    ['Status', 'Status'],
    ['Actions', 'Radnje'],
    ['View', 'Pregled'],
    ['Open', 'Otvori'],
    ['Close', 'Zatvori']
  ];

  function route() {
    return (location.hash || '#dashboard').split('?')[0] || '#dashboard';
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s]));
  }

  function translateText(s) {
    let out = String(s ?? '');
    for (const [from, to] of replacements) out = out.split(from).join(to);
    return out;
  }

  function setHeader(title) {
    document.documentElement.lang = 'hr';
    document.title = title ? `${BRAND} - ${title}` : BRAND;
    const t = document.querySelector('title');
    if (t) t.textContent = document.title;
    const c = document.querySelector('#crumbs');
    if (c) c.textContent = title || 'Nadzorna ploča';
    const logo = document.querySelector('.brand img');
    if (logo) logo.alt = BRAND;
  }

  function renderNav() {
    const nav = document.querySelector('#nav');
    if (!nav) return;
    const r = route();
    nav.innerHTML = MENU.map(([hash, label]) =>
      `<a href="${hash}" class="${r === hash ? 'active' : ''}">${label}</a>`
    ).join('');
  }

  function translateVisibleText() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || ['SCRIPT','STYLE','NOSCRIPT'].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const next = translateText(n.nodeValue);
      if (next !== n.nodeValue) n.nodeValue = next;
    }

    for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],input[value],button[value]')) {
      for (const attr of ['placeholder','title','aria-label','value']) {
        if (!el.hasAttribute(attr)) continue;
        const next = translateText(el.getAttribute(attr));
        el.setAttribute(attr, next);
      }
    }
  }

  function renderPatientsPage() {
    const view = document.querySelector('#view');
    if (!view) return;
    setHeader('Pacijenti');
    view.innerHTML = `
      <div class="card">
        <h2>Pacijenti</h2>
        <p>Prvi pravi modul za Ernos Zdravstvena Njega. Sljedeći korak je spajanje na novu tablicu patients u bazi.</p>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <h3>Funkcije koje ostaju za ovaj modul</h3>
          <ul>
            <li>Dodaj pacijenta</li>
            <li>Pregled pacijenata</li>
            <li>Uredi pacijenta</li>
            <li>Deaktiviraj pacijenta</li>
            <li>Profil pacijenta za QR/NFC</li>
          </ul>
        </div>
        <div class="card">
          <h3>Podaci pacijenta</h3>
          <ul>
            <li>Ime i prezime</li>
            <li>Datum rođenja</li>
            <li>Adresa</li>
            <li>Kontakt obitelji</li>
            <li>Napomena</li>
          </ul>
        </div>
      </div>`;
  }

  function cleanDashboard() {
    if (route() !== '#dashboard') return;
    setHeader('Nadzorna ploča');
    const view = document.querySelector('#view');
    if (!view) return;

    const oldWords = ['Visitors','Residents Out','Fridge','Fire','Maintenance','Housekeeping','Environmental','Nursing Checks','Nursing Alerts','Family Touchpoint','Reception','Audit','Issues'];
    for (const card of Array.from(view.querySelectorAll('.card, [data-kpi]'))) {
      const text = card.textContent || '';
      if (oldWords.some(w => text.includes(w))) card.style.display = 'none';
    }

    if (!view.querySelector('[data-znj-intro]')) {
      const intro = document.createElement('div');
      intro.className = 'card';
      intro.setAttribute('data-znj-intro', '1');
      intro.innerHTML = `<h2>${BRAND}</h2><p>Radna verzija hrvatskog proizvoda za zdravstvenu njegu u kući.</p>`;
      view.prepend(intro);
    }
  }

  function run() {
    renderNav();
    const r = route();
    if (r === '#patients') renderPatientsPage();
    else {
      if (r === '#dashboard') cleanDashboard();
      else if (r === '#staff') setHeader('Djelatnici');
      else if (r === '#settings') setHeader('Administracija');
      translateVisibleText();
    }
    const logout = document.querySelector('#logoutBtn');
    if (logout) logout.textContent = 'Odjava';
  }

  function later(ms=80) {
    clearTimeout(window.__ERNOS_ZNJ_TIMER__);
    window.__ERNOS_ZNJ_TIMER__ = setTimeout(run, ms);
  }

  document.addEventListener('DOMContentLoaded', () => later(0));
  window.addEventListener('load', () => later(100));
  window.addEventListener('hashchange', () => later(50));
  setInterval(run, 1500);
  try { new MutationObserver(() => later()).observe(document.documentElement, {childList:true, subtree:true}); } catch (_) {}
})();
