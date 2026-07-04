/* Ernos Zdravstvena Njega - Croatian UI cleanup */
(() => {
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
    ['User', 'Korisnik'],
    ['Settings', 'Administracija'],
    ['Reports', 'Izvještaji'],
    ['Locations', 'Lokacije'],
    ['Location', 'Lokacija'],
    ['QR Codes', 'QR/NFC kodovi'],
    ['Check-in', 'Početak njege'],
    ['Check-out', 'Završetak njege'],
    ['Login', 'Prijava'],
    ['Log in', 'Prijava'],
    ['Log out', 'Odjava'],
    ['Logout', 'Odjava'],
    ['Username', 'Korisničko ime'],
    ['Password', 'Lozinka'],
    ['Remember me', 'Zapamti me'],
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

  function routeTitle() {
    const r = route();
    if (r === '#patients') return 'Pacijenti';
    if (r === '#staff') return 'Djelatnici';
    if (r === '#settings') return 'Administracija';
    return 'Nadzorna ploča';
  }

  function setHeader(title) {
    document.documentElement.lang = 'hr';
    document.title = `${BRAND} - ${title || routeTitle()}`;
    const t = document.querySelector('title');
    if (t) t.textContent = document.title;
    const c = document.querySelector('#crumbs');
    if (c) c.textContent = title || routeTitle();
    const logo = document.querySelector('.brand img');
    if (logo) logo.alt = BRAND;
  }

  function applyNav() {
    const nav = document.querySelector('#nav');
    if (!nav) return;
    const r = route();
    nav.innerHTML = MENU.map(([hash, label]) =>
      `<a href="${hash}" class="${r === hash ? 'active' : ''}">${label}</a>`
    ).join('');
  }

  try {
    window.renderNav = applyNav;
    window.preferredHome = () => '#dashboard';
  } catch (_) {}

  function authHeaders() {
    let token = '';
    try { token = window.state?.token || ''; } catch (_) {}
    try { token = token || sessionStorage.getItem('ernosToken') || localStorage.getItem('ernosToken') || ''; } catch (_) {}
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  async function apiJson(path, opts = {}) {
    const base = (() => {
      try { return (window.state?.api || location.origin).replace(/\/+$/, ''); } catch (_) { return location.origin; }
    })();
    const res = await fetch(base + path, {
      method: opts.method || 'GET',
      headers: authHeaders(),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    if (!res.ok) throw new Error(json?.error || json?.detail || text || ('HTTP ' + res.status));
    return json || {};
  }

  function translateVisibleText() {
    const root = document.body;
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
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

  function patientRow(p) {
    const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    return `
      <tr data-patient-id="${esc(p.id)}">
        <td>${esc(full)}</td>
        <td>${esc(p.date_of_birth ? String(p.date_of_birth).slice(0,10) : '')}</td>
        <td>${esc(p.address || '')}</td>
        <td>${esc(p.phone || '')}</td>
        <td>${esc(p.family_contact_name || '')}<br><span class="muted">${esc(p.family_contact_phone || '')}</span></td>
        <td><button class="btn ghost small" data-delete-patient="${esc(p.id)}" type="button">Deaktiviraj</button></td>
      </tr>`;
  }

  async function loadPatients() {
    const wrap = document.querySelector('#znjPatientsList');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty">Učitavanje pacijenata...</div>';
    try {
      const data = await apiJson('/api/patients');
      const items = data.items || [];
      if (!items.length) {
        wrap.innerHTML = '<div class="empty">Još nema pacijenata. Dodaj prvog pacijenta iz forme iznad.</div>';
        return;
      }
      wrap.innerHTML = `
        <div class="table-wrap pretty">
          <table class="table pretty">
            <thead>
              <tr>
                <th>Pacijent</th>
                <th>Datum rođenja</th>
                <th>Adresa</th>
                <th>Telefon</th>
                <th>Kontakt obitelji</th>
                <th>Radnje</th>
              </tr>
            </thead>
            <tbody>${items.map(patientRow).join('')}</tbody>
          </table>
        </div>`;
    } catch (e) {
      wrap.innerHTML = `<div class="alert err">Greška kod učitavanja pacijenata: ${esc(e.message || e)}</div>`;
    }
  }

  function renderPatientsPage() {
    const view = document.querySelector('#view');
    if (!view) return;
    setHeader('Pacijenti');

    if (!view.querySelector('[data-patients-page]')) {
      view.innerHTML = `
        <div data-patients-page="1">
          <div class="card">
            <h2>Pacijenti</h2>
            <p class="muted">Osnovni modul za Ernos Zdravstvena Njega. Ovo je prvi pravi korak prema QR/NFC profilu pacijenta.</p>
          </div>

          <div class="card">
            <h3>Dodaj pacijenta</h3>
            <form id="znjPatientForm" class="grid cols-3" autocomplete="off">
              <div><label>Ime</label><input name="first_name" required></div>
              <div><label>Prezime</label><input name="last_name" required></div>
              <div><label>Datum rođenja</label><input name="date_of_birth" type="date"></div>
              <div><label>Adresa</label><input name="address"></div>
              <div><label>Telefon</label><input name="phone"></div>
              <div><label>Kontakt obitelji</label><input name="family_contact_name"></div>
              <div><label>Telefon obitelji</label><input name="family_contact_phone"></div>
              <div style="grid-column:1/-1"><label>Napomena</label><textarea name="notes" rows="3"></textarea></div>
              <div style="grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button class="btn" type="submit">Spremi pacijenta</button>
                <button class="btn ghost" type="button" id="znjPatientsRefresh">Osvježi</button>
                <span id="znjPatientMsg" class="muted"></span>
              </div>
            </form>
          </div>

          <div class="card">
            <h3>Popis pacijenata</h3>
            <div id="znjPatientsList"><div class="empty">Učitavanje pacijenata...</div></div>
          </div>
        </div>`;

      const form = view.querySelector('#znjPatientForm');
      const msg = view.querySelector('#znjPatientMsg');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const fd = new FormData(form);
        const body = Object.fromEntries(fd.entries());
        try {
          if (btn) { btn.disabled = true; btn.textContent = 'Spremam...'; }
          if (msg) msg.textContent = '';
          await apiJson('/api/patients', { method: 'POST', body });
          form.reset();
          if (msg) msg.textContent = 'Pacijent spremljen.';
          await loadPatients();
        } catch (err) {
          if (msg) msg.textContent = 'Greška: ' + (err.message || err);
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'Spremi pacijenta'; }
        }
      });

      view.querySelector('#znjPatientsRefresh')?.addEventListener('click', () => loadPatients());
      view.addEventListener('click', async (e) => {
        const del = e.target.closest('[data-delete-patient]');
        if (!del) return;
        const id = del.getAttribute('data-delete-patient');
        if (!id) return;
        if (!confirm('Deaktivirati ovog pacijenta?')) return;
        try {
          del.disabled = true;
          await apiJson('/api/patients/' + encodeURIComponent(id), { method: 'DELETE' });
          await loadPatients();
        } catch (err) {
          alert('Greška: ' + (err.message || err));
          del.disabled = false;
        }
      });

      loadPatients();
    }
  }

  function cleanDashboard() {
    if (route() !== '#dashboard') return;
    setHeader('Nadzorna ploča');
    const view = document.querySelector('#view');
    if (!view) return;

    const oldWords = ['Visitors','Residents Out','Fridge','Fire','Maintenance','Housekeeping','Environmental','Nursing Checks','Nursing Alerts','Family Touchpoint','Reception','Audit','Issues','QR Codes','Locations'];
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
    applyNav();
    const r = route();
    if (r === '#patients') renderPatientsPage();
    else {
      setHeader(routeTitle());
      cleanDashboard();
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
  setInterval(run, 1000);
  try { new MutationObserver(() => later()).observe(document.documentElement, {childList:true, subtree:true}); } catch (_) {}
  later(0);
})();
