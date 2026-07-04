/* Ernos Zdravstvena Njega - Croatian UI cleanup */
(function () {
  window.__ERNOS_ZNJ_UI__ = true;

  var BRAND = 'Ernos Zdravstvena Njega';
  var MENU = [
    ['#dashboard', 'Nadzorna ploča'],
    ['#patients', 'Pacijenti'],
    ['#staff', 'Djelatnici'],
    ['#settings', 'Administracija']
  ];

  var replacements = [
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
    var s = String(v == null ? '' : v);
    return s.replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch;
    });
  }

  function translateText(s) {
    var out = String(s == null ? '' : s);
    for (var i = 0; i < replacements.length; i++) {
      out = out.split(replacements[i][0]).join(replacements[i][1]);
    }
    return out;
  }

  function routeTitle() {
    var r = route();
    if (r === '#patients') return 'Pacijenti';
    if (r === '#staff') return 'Djelatnici';
    if (r === '#settings') return 'Administracija';
    return 'Nadzorna ploča';
  }

  function setHeader(title) {
    var safeTitle = title || routeTitle();
    document.documentElement.lang = 'hr';
    document.title = BRAND + ' - ' + safeTitle;
    var t = document.querySelector('title');
    if (t) t.textContent = document.title;
    var c = document.querySelector('#crumbs');
    if (c) c.textContent = safeTitle;
    var logo = document.querySelector('.brand img');
    if (logo) logo.alt = BRAND;
  }

  function applyNav() {
    var nav = document.querySelector('#nav');
    if (!nav) return;
    var r = route();
    var html = '';
    for (var i = 0; i < MENU.length; i++) {
      html += '<a href="' + MENU[i][0] + '" class="' + (r === MENU[i][0] ? 'active' : '') + '">' + MENU[i][1] + '</a>';
    }
    nav.innerHTML = html;
  }

  try {
    window.renderNav = applyNav;
    window.preferredHome = function () { return '#dashboard'; };
  } catch (e) {}

  function getToken() {
    var token = '';
    try { if (window.state && window.state.token) token = window.state.token; } catch (e) {}
    try { if (!token) token = sessionStorage.getItem('ernosToken') || localStorage.getItem('ernosToken') || ''; } catch (e) {}
    return token;
  }

  function apiJson(path, opts) {
    opts = opts || {};
    var base = location.origin;
    try {
      if (window.state && window.state.api) base = String(window.state.api).replace(/\/+$/, '');
    } catch (e) {}

    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    return fetch(base + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) {}
        if (!res.ok) {
          throw new Error((json && (json.error || json.detail)) || text || ('HTTP ' + res.status));
        }
        return json || {};
      });
    });
  }

  function translateVisibleText() {
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentElement;
        if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].indexOf(p.tagName) >= 0) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var i = 0; i < nodes.length; i++) {
      var next = translateText(nodes[i].nodeValue);
      if (next !== nodes[i].nodeValue) nodes[i].nodeValue = next;
    }
  }

  function patientRow(p) {
    var full = String((p.first_name || '') + ' ' + (p.last_name || '')).trim();
    var dob = p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '';
    return '' +
      '<tr data-patient-id="' + esc(p.id) + '">' +
        '<td>' + esc(full) + '</td>' +
        '<td>' + esc(dob) + '</td>' +
        '<td>' + esc(p.address || '') + '</td>' +
        '<td>' + esc(p.phone || '') + '</td>' +
        '<td>' + esc(p.family_contact_name || '') + '<br><span class="muted">' + esc(p.family_contact_phone || '') + '</span></td>' +
        '<td><button class="btn ghost small" data-delete-patient="' + esc(p.id) + '" type="button">Deaktiviraj</button></td>' +
      '</tr>';
  }

  function loadPatients() {
    var wrap = document.querySelector('#znjPatientsList');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty">Učitavanje pacijenata...</div>';

    apiJson('/api/patients').then(function (data) {
      var items = data.items || [];
      if (!items.length) {
        wrap.innerHTML = '<div class="empty">Još nema pacijenata. Dodaj prvog pacijenta iz forme iznad.</div>';
        return;
      }
      var rows = '';
      for (var i = 0; i < items.length; i++) rows += patientRow(items[i]);
      wrap.innerHTML = '' +
        '<div class="table-wrap pretty">' +
          '<table class="table pretty">' +
            '<thead><tr>' +
              '<th>Pacijent</th><th>Datum rođenja</th><th>Adresa</th><th>Telefon</th><th>Kontakt obitelji</th><th>Radnje</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>';
    }).catch(function (e) {
      wrap.innerHTML = '<div class="alert err">Greška kod učitavanja pacijenata: ' + esc(e.message || e) + '</div>';
    });
  }

  function renderPatientsPage() {
    var view = document.querySelector('#view');
    if (!view) return;
    setHeader('Pacijenti');

    if (view.querySelector('[data-patients-page]')) return;

    view.innerHTML = '' +
      '<div data-patients-page="1">' +
        '<div class="card">' +
          '<h2>Pacijenti</h2>' +
          '<p class="muted">Osnovni modul za Ernos Zdravstvena Njega. Ovo je prvi pravi korak prema QR/NFC profilu pacijenta.</p>' +
        '</div>' +
        '<div class="card">' +
          '<h3>Dodaj pacijenta</h3>' +
          '<form id="znjPatientForm" class="grid cols-3" autocomplete="off">' +
            '<div><label>Ime</label><input name="first_name" required></div>' +
            '<div><label>Prezime</label><input name="last_name" required></div>' +
            '<div><label>Datum rođenja</label><input name="date_of_birth" type="date"></div>' +
            '<div><label>Adresa</label><input name="address"></div>' +
            '<div><label>Telefon</label><input name="phone"></div>' +
            '<div><label>Kontakt obitelji</label><input name="family_contact_name"></div>' +
            '<div><label>Telefon obitelji</label><input name="family_contact_phone"></div>' +
            '<div style="grid-column:1/-1"><label>Napomena</label><textarea name="notes" rows="3"></textarea></div>' +
            '<div style="grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
              '<button class="btn" type="submit">Spremi pacijenta</button>' +
              '<button class="btn ghost" type="button" id="znjPatientsRefresh">Osvježi</button>' +
              '<span id="znjPatientMsg" class="muted"></span>' +
            '</div>' +
          '</form>' +
        '</div>' +
        '<div class="card">' +
          '<h3>Popis pacijenata</h3>' +
          '<div id="znjPatientsList"><div class="empty">Učitavanje pacijenata...</div></div>' +
        '</div>' +
      '</div>';

    var form = view.querySelector('#znjPatientForm');
    var msg = view.querySelector('#znjPatientMsg');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var btn = form.querySelector('button[type="submit"]');
        var fd = new FormData(form);
        var body = {};
        fd.forEach(function (v, k) { body[k] = v; });
        if (btn) { btn.disabled = true; btn.textContent = 'Spremam...'; }
        if (msg) msg.textContent = '';
        apiJson('/api/patients', { method: 'POST', body: body }).then(function () {
          form.reset();
          if (msg) msg.textContent = 'Pacijent spremljen.';
          loadPatients();
        }).catch(function (err) {
          if (msg) msg.textContent = 'Greška: ' + (err.message || err);
        }).then(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'Spremi pacijenta'; }
        });
      });
    }

    var refresh = view.querySelector('#znjPatientsRefresh');
    if (refresh) refresh.addEventListener('click', loadPatients);

    view.addEventListener('click', function (ev) {
      var del = ev.target && ev.target.closest ? ev.target.closest('[data-delete-patient]') : null;
      if (!del) return;
      var id = del.getAttribute('data-delete-patient');
      if (!id) return;
      if (!confirm('Deaktivirati ovog pacijenta?')) return;
      del.disabled = true;
      apiJson('/api/patients/' + encodeURIComponent(id), { method: 'DELETE' }).then(loadPatients).catch(function (err) {
        alert('Greška: ' + (err.message || err));
        del.disabled = false;
      });
    });

    loadPatients();
  }

  function cleanDashboard() {
    if (route() !== '#dashboard') return;
    setHeader('Nadzorna ploča');
    var view = document.querySelector('#view');
    if (!view) return;

    var oldWords = ['Visitors','Residents Out','Fridge','Fire','Maintenance','Housekeeping','Environmental','Nursing Checks','Nursing Alerts','Family Touchpoint','Reception','Audit','Issues','QR Codes','Locations'];
    var cards = view.querySelectorAll('.card, [data-kpi]');
    for (var i = 0; i < cards.length; i++) {
      var text = cards[i].textContent || '';
      for (var j = 0; j < oldWords.length; j++) {
        if (text.indexOf(oldWords[j]) >= 0) { cards[i].style.display = 'none'; break; }
      }
    }

    if (!view.querySelector('[data-znj-intro]')) {
      var intro = document.createElement('div');
      intro.className = 'card';
      intro.setAttribute('data-znj-intro', '1');
      intro.innerHTML = '<h2>' + BRAND + '</h2><p>Radna verzija hrvatskog proizvoda za zdravstvenu njegu u kući.</p>';
      view.insertBefore(intro, view.firstChild);
    }
  }

  function run() {
    applyNav();
    var r = route();
    if (r === '#patients') renderPatientsPage();
    else {
      setHeader(routeTitle());
      cleanDashboard();
      translateVisibleText();
    }
    var logout = document.querySelector('#logoutBtn');
    if (logout) logout.textContent = 'Odjava';
  }

  function later(ms) {
    clearTimeout(window.__ERNOS_ZNJ_TIMER__);
    window.__ERNOS_ZNJ_TIMER__ = setTimeout(run, typeof ms === 'number' ? ms : 80);
  }

  document.addEventListener('DOMContentLoaded', function () { later(0); });
  window.addEventListener('load', function () { later(100); });
  window.addEventListener('hashchange', function () { later(50); });
  setInterval(run, 1000);
  try { new MutationObserver(function () { later(80); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  later(0);
})();
