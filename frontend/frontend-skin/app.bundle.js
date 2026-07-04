/* Ernos Zdravstvena Njega - stable standalone frontend */
(function () {
  var BRAND = 'Ernos Zdravstvena Njega';
  var state = { api: location.origin, token: '', me: null };
  window.state = state;

  function $(sel) { return document.querySelector(sel); }

  function esc(v) {
    var s = String(v == null ? '' : v);
    return s.replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch;
    });
  }

  function readStoredToken() {
    var t = '';
    try { t = sessionStorage.getItem('ernosToken') || ''; } catch (e) {}
    try { if (!t) t = localStorage.getItem('ernosToken') || ''; } catch (e2) {}
    return t;
  }

  function setToken(t, remember) {
    state.token = t || '';
    try { sessionStorage.removeItem('ernosToken'); } catch (e) {}
    try { localStorage.removeItem('ernosToken'); } catch (e2) {}
    if (!state.token) return;
    if (remember) {
      try { localStorage.setItem('ernosToken', state.token); } catch (e3) {}
    } else {
      try { sessionStorage.setItem('ernosToken', state.token); } catch (e4) {}
    }
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    headers['Content-Type'] = 'application/json';
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(state.api.replace(/\/+$/, '') + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) {}
        if (!res.ok) {
          if (res.status === 401) { setToken('', false); state.me = null; }
          throw new Error((json && (json.error || json.detail || json.message)) || text || ('HTTP ' + res.status));
        }
        return json || {};
      });
    });
  }

  function route() {
    var h = (location.hash || '#dashboard').split('?')[0];
    return h || '#dashboard';
  }

  function params() {
    var raw = (location.hash.split('?')[1] || '');
    return new URLSearchParams(raw);
  }

  function routeTitle(r) {
    r = r || route();
    if (r === '#patients') return 'Pacijenti';
    if (r === '#patient') return 'Profil pacijenta';
    if (r === '#staff') return 'Djelatnici';
    if (r === '#settings') return 'Administracija';
    if (r === '#login') return 'Prijava';
    return 'Nadzorna ploča';
  }

  function setCrumbs(title) {
    title = title || routeTitle();
    var c = $('#crumbs');
    if (c) c.textContent = title;
    document.title = BRAND + ' - ' + title;
    try { document.body.setAttribute('data-crumbs', title); } catch (e) {}
  }
  window.setCrumbs = setCrumbs;

  function ensureShell() {
    document.documentElement.lang = 'hr';
    var logo = document.querySelector('.brand img');
    if (logo) logo.alt = BRAND;
    var fallback = document.querySelector('.brand-fallback');
    if (fallback) fallback.textContent = 'E';
    var logout = $('#logoutBtn');
    if (logout) logout.textContent = 'Odjava';
  }

  function renderUserBadge() {
    var b = $('#userBadge');
    if (!b) return;
    if (!state.me) { b.innerHTML = ''; return; }
    var name = state.me.name || state.me.username || 'Korisnik';
    var role = state.me.role || '';
    var site = state.me.tenant_name || state.me.site || '';
    var parts = [];
    parts.push('<span class="tag">' + esc(name) + '</span>');
    if (role) parts.push('<span class="tag">' + esc(role) + '</span>');
    if (site) parts.push('<span class="tag">' + esc(site) + '</span>');
    b.innerHTML = parts.join('');
  }

  function renderNav() {
    var nav = $('#nav');
    if (!nav) return;
    if (!state.token) { nav.innerHTML = '<a href="#login" class="active">Prijava</a>'; return; }
    var r = route();
    var items = [
      ['#dashboard', 'Nadzorna ploča'],
      ['#patients', 'Pacijenti'],
      ['#staff', 'Djelatnici'],
      ['#settings', 'Administracija']
    ];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var active = (r === items[i][0] || (r === '#patient' && items[i][0] === '#patients')) ? 'active' : '';
      html += '<a href="' + items[i][0] + '" class="' + active + '">' + items[i][1] + '</a>';
    }
    nav.innerHTML = html;
  }
  window.renderNav = renderNav;

  function viewLogin() {
    setCrumbs('Prijava');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '' +
      '<div class="card" style="max-width:520px">' +
        '<h2>Prijava</h2>' +
        '<p class="muted">Ernos Zdravstvena Njega</p>' +
        '<form id="loginForm" autocomplete="on">' +
          '<div style="margin-bottom:10px"><label>Korisničko ime</label><input name="username" autocomplete="username" required></div>' +
          '<div style="margin-bottom:10px"><label>Lozinka</label><input name="password" type="password" autocomplete="current-password" required></div>' +
          '<label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input name="remember" type="checkbox" style="width:auto"> Zapamti me</label>' +
          '<button class="btn" type="submit">Prijava</button>' +
          '<span id="loginMsg" class="muted" style="margin-left:10px"></span>' +
        '</form>' +
      '</div>';

    var form = $('#loginForm');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fd = new FormData(form);
      var body = { username: String(fd.get('username') || ''), password: String(fd.get('password') || '') };
      var remember = !!fd.get('remember');
      var m = $('#loginMsg');
      var btn = form.querySelector('button');
      if (btn) { btn.disabled = true; btn.textContent = 'Prijava...'; }
      if (m) m.textContent = '';
      api('/auth/login', { method: 'POST', body: body }).then(function (data) {
        setToken(data.token || '', remember);
        state.me = data.user || null;
        location.hash = '#dashboard';
        renderAll();
      }).catch(function (err) {
        if (m) m.textContent = 'Greška: ' + (err.message || err);
      }).then(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Prijava'; }
      });
    });
  }

  function viewDashboard() {
    setCrumbs('Nadzorna ploča');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '' +
      '<div class="card"><h2>' + BRAND + '</h2><p class="muted">Stabilna radna verzija za zdravstvenu njegu u kući.</p></div>' +
      '<div class="grid cols-3">' +
        '<div class="card"><h3>Pacijenti</h3><p>Osnovna evidencija pacijenata.</p><a class="btn" href="#patients">Otvori pacijente</a></div>' +
        '<div class="card"><h3>Posjete</h3><p class="muted">Sljedeći korak: početak i završetak njege preko QR/NFC.</p></div>' +
        '<div class="card"><h3>Obitelj</h3><p class="muted">Kasnije: obavijest obitelji nakon završene njege.</p></div>' +
      '</div>';
  }

  function patientFullName(p) { return String((p.first_name || '') + ' ' + (p.last_name || '')).trim(); }

  function patientRow(p) {
    var full = patientFullName(p);
    var dob = p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '';
    return '' +
      '<tr>' +
        '<td><strong>' + esc(full) + '</strong></td>' +
        '<td>' + esc(dob) + '</td>' +
        '<td>' + esc(p.address || '') + '</td>' +
        '<td>' + esc(p.phone || '') + '</td>' +
        '<td>' + esc(p.family_contact_name || '') + '<br><span class="muted">' + esc(p.family_contact_phone || '') + '</span></td>' +
        '<td style="white-space:nowrap"><a class="btn small" href="#patient?id=' + esc(p.id) + '">Profil</a> <button class="btn ghost small" data-delete-patient="' + esc(p.id) + '" type="button">Deaktiviraj</button></td>' +
      '</tr>';
  }

  function loadPatients() {
    var wrap = $('#patientsList');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty">Učitavanje...</div>';
    api('/api/patients').then(function (data) {
      var items = data.items || [];
      if (!items.length) { wrap.innerHTML = '<div class="empty">Još nema pacijenata.</div>'; return; }
      var rows = '';
      for (var i = 0; i < items.length; i++) rows += patientRow(items[i]);
      wrap.innerHTML = '' +
        '<div class="table-wrap pretty"><table class="table pretty">' +
          '<thead><tr><th>Pacijent</th><th>Rođen</th><th>Adresa</th><th>Telefon</th><th>Obitelj</th><th>Radnje</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>';
    }).catch(function (err) {
      wrap.innerHTML = '<div class="alert err">Greška: ' + esc(err.message || err) + '</div>';
    });
  }

  function viewPatients() {
    setCrumbs('Pacijenti');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '' +
      '<div class="card"><h2>Pacijenti</h2><p class="muted">Osnovna evidencija pacijenata za zdravstvenu njegu u kući.</p></div>' +
      '<div class="card"><h3>Dodaj pacijenta</h3>' +
        '<form id="patientForm" class="grid cols-3" autocomplete="off">' +
          '<div><label>Ime</label><input name="first_name" required></div>' +
          '<div><label>Prezime</label><input name="last_name" required></div>' +
          '<div><label>Datum rođenja</label><input name="date_of_birth" type="date"></div>' +
          '<div><label>Adresa</label><input name="address"></div>' +
          '<div><label>Telefon</label><input name="phone"></div>' +
          '<div><label>Kontakt obitelji</label><input name="family_contact_name"></div>' +
          '<div><label>Telefon obitelji</label><input name="family_contact_phone"></div>' +
          '<div style="grid-column:1/-1"><label>Napomena</label><textarea name="notes" rows="3"></textarea></div>' +
          '<div style="grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn" type="submit">Spremi pacijenta</button><button class="btn ghost" type="button" id="refreshPatients">Osvježi</button><span id="patientMsg" class="muted"></span></div>' +
        '</form></div>' +
      '<div class="card"><h3>Popis pacijenata</h3><div id="patientsList"></div></div>';

    var form = $('#patientForm');
    var out = $('#patientMsg');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var fd = new FormData(form);
        var body = {};
        fd.forEach(function (v, k) { body[k] = v; });
        var btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Spremam...'; }
        if (out) out.textContent = '';
        api('/api/patients', { method: 'POST', body: body }).then(function () {
          form.reset();
          if (out) out.textContent = 'Pacijent spremljen.';
          loadPatients();
        }).catch(function (err) {
          if (out) out.textContent = 'Greška: ' + (err.message || err);
        }).then(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'Spremi pacijenta'; }
        });
      });
    }
    var refresh = $('#refreshPatients');
    if (refresh) refresh.addEventListener('click', loadPatients);
    view.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-delete-patient]') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-delete-patient');
      if (!id) return;
      if (!confirm('Deaktivirati ovog pacijenta?')) return;
      btn.disabled = true;
      api('/api/patients/' + encodeURIComponent(id), { method: 'DELETE' }).then(loadPatients).catch(function (err) {
        alert('Greška: ' + (err.message || err));
        btn.disabled = false;
      });
    });
    loadPatients();
  }

  function viewPatientProfile() {
    var id = params().get('id');
    setCrumbs('Profil pacijenta');
    var view = $('#view');
    if (!view) return;
    if (!id) { view.innerHTML = '<div class="alert err">Nedostaje ID pacijenta.</div>'; return; }
    view.innerHTML = '<div class="card"><h2>Profil pacijenta</h2><p class="muted">Učitavanje...</p></div>';
    api('/api/patients').then(function (data) {
      var items = data.items || [];
      var p = null;
      for (var i = 0; i < items.length; i++) { if (String(items[i].id) === String(id)) { p = items[i]; break; } }
      if (!p) { view.innerHTML = '<div class="alert err">Pacijent nije pronađen.</div><a class="btn ghost" href="#patients">Natrag</a>'; return; }
      var full = patientFullName(p);
      var scanLink = location.origin + '/#patient?id=' + encodeURIComponent(p.id);
      view.innerHTML = '' +
        '<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h2>' + esc(full) + '</h2><p class="muted">Profil pacijenta</p></div><a class="btn ghost" href="#patients">Natrag na pacijente</a></div></div>' +
        '<div class="grid cols-3">' +
          '<div class="card"><h3>Osnovno</h3><p><strong>Datum rođenja:</strong><br>' + esc(p.date_of_birth ? String(p.date_of_birth).slice(0,10) : '-') + '</p><p><strong>Telefon:</strong><br>' + esc(p.phone || '-') + '</p></div>' +
          '<div class="card"><h3>Adresa</h3><p>' + esc(p.address || '-') + '</p></div>' +
          '<div class="card"><h3>Obitelj</h3><p><strong>' + esc(p.family_contact_name || '-') + '</strong><br>' + esc(p.family_contact_phone || '') + '</p></div>' +
        '</div>' +
        '<div class="card"><h3>Napomena</h3><p>' + esc(p.notes || 'Nema napomene.') + '</p></div>' +
        '<div class="card"><h3>QR/NFC link</h3><p class="muted">Za sada je ovo privremeni link na profil. Sljedeći korak je pravi sigurni scan token i početak/završetak njege.</p><input id="scanLink" readonly value="' + esc(scanLink) + '"><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="copyScanLink" type="button">Kopiraj link</button><button class="btn ghost" type="button" disabled>Početak njege - sljedeći korak</button></div></div>';
      var copy = $('#copyScanLink');
      if (copy) copy.onclick = function () {
        var input = $('#scanLink');
        if (input) { input.select(); document.execCommand('copy'); copy.textContent = 'Kopirano'; setTimeout(function(){ copy.textContent = 'Kopiraj link'; }, 1200); }
      };
    }).catch(function (err) {
      view.innerHTML = '<div class="alert err">Greška: ' + esc(err.message || err) + '</div>';
    });
  }

  function viewStaff() {
    setCrumbs('Djelatnici');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '<div class="card"><h2>Djelatnici</h2><p class="muted">Modul djelatnika ostaje za kasnije. Trenutno fokus: pacijenti i posjete.</p></div>';
  }

  function viewSettings() {
    setCrumbs('Administracija');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '<div class="card"><h2>Administracija</h2><p class="muted">Postavke i izvještaji dolaze nakon što stabiliziramo pacijente i QR/NFC posjete.</p></div><div class="card"><button class="btn ghost" id="logoutInline" type="button">Odjava</button></div>';
    var b = $('#logoutInline');
    if (b) b.onclick = logout;
  }

  function logout() {
    setToken('', false);
    state.me = null;
    location.hash = '#login';
    renderAll();
  }

  function renderAll() {
    ensureShell();
    if (!state.token && route() !== '#login') { location.hash = '#login'; }
    renderUserBadge();
    renderNav();
    var r = route();
    if (r === '#login') return viewLogin();
    if (r === '#patients') return viewPatients();
    if (r === '#patient') return viewPatientProfile();
    if (r === '#staff') return viewStaff();
    if (r === '#settings') return viewSettings();
    return viewDashboard();
  }

  function boot() {
    ensureShell();
    state.token = readStoredToken();
    var logoutBtn = $('#logoutBtn');
    if (logoutBtn) logoutBtn.onclick = logout;
    var menuBtn = $('#menuBtn');
    if (menuBtn) {
      menuBtn.onclick = function () {
        var sb = document.querySelector('.sidebar');
        if (sb) sb.classList.toggle('open');
        document.body.classList.toggle('nav-open');
      };
    }
    if (state.token) {
      api('/me').then(function (me) { state.me = me; renderAll(); }).catch(function () { setToken('', false); state.me = null; renderAll(); });
    } else {
      renderAll();
    }
  }

  window.addEventListener('hashchange', renderAll);
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
