/* Ernos Zdravstvena Njega - friendly stable frontend */
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
    if (r === '#dashboard') return 'Početna';
    if (r === '#today') return 'Danas';
    if (r === '#patients') return 'Pacijenti';
    if (r === '#patient-new') return 'Dodaj pacijenta';
    if (r === '#patient') return 'Profil pacijenta';
    if (r === '#visits') return 'Posjete';
    if (r === '#qr') return 'QR / NFC';
    if (r === '#staff') return 'Djelatnici';
    if (r === '#settings') return 'Administracija';
    if (r === '#login') return 'Prijava';
    return 'Početna';
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
    var logout = $('#logoutBtn');
    if (logout) logout.textContent = 'Odjava';
  }

  function tag(text, tone) {
    var bg = tone === 'warn' ? '#FEF3C7' : tone === 'ok' ? '#DCFCE7' : tone === 'danger' ? '#FEE2E2' : '#EEF2FF';
    var color = tone === 'warn' ? '#92400E' : tone === 'ok' ? '#166534' : tone === 'danger' ? '#991B1B' : '#3730A3';
    return '<span class="tag" style="background:' + bg + ';color:' + color + ';border:0;font-weight:800">' + esc(text) + '</span>';
  }

  function softCard(title, body, actionHtml) {
    return '<div class="card" style="min-height:150px">' +
      '<h3 style="margin-bottom:6px">' + esc(title) + '</h3>' +
      '<p class="muted" style="margin-top:0">' + esc(body) + '</p>' +
      (actionHtml || '') +
    '</div>';
  }

  function renderUserBadge() {
    var b = $('#userBadge');
    if (!b) return;
    if (!state.me) { b.innerHTML = ''; return; }
    var name = state.me.name || state.me.username || 'Korisnik';
    var role = state.me.role || '';
    var parts = [];
    parts.push('<span class="tag">' + esc(name) + '</span>');
    if (role) parts.push('<span class="tag">' + esc(role) + '</span>');
    b.innerHTML = parts.join('');
  }

  function renderNav() {
    var nav = $('#nav');
    if (!nav) return;
    if (!state.token) { nav.innerHTML = '<a href="#login" class="active">Prijava</a>'; return; }
    var r = route();
    var items = [
      ['#dashboard', 'Početna'],
      ['#today', 'Danas'],
      ['#patients', 'Pacijenti'],
      ['#patient-new', '+ Dodaj pacijenta'],
      ['#visits', 'Posjete'],
      ['#qr', 'QR / NFC'],
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
      '<div class="card" style="max-width:520px;margin:auto">' +
        '<h2>Prijava</h2>' +
        '<p class="muted">Prijavi se za rad s pacijentima, posjetama i QR/NFC evidencijom.</p>' +
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
    setCrumbs('Početna');
    var view = $('#view');
    if (!view) return;
    var hello = state.me && (state.me.name || state.me.username) ? ', ' + (state.me.name || state.me.username) : '';
    view.innerHTML = '' +
      '<div class="card" style="padding:24px">' +
        '<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center">' +
          '<div><h2 style="margin-bottom:6px">Dobrodošli' + esc(hello) + '</h2><p class="muted" style="max-width:680px">Jednostavna radna ploča za kućnu zdravstvenu njegu. Pacijenti su odmah dostupni kao lista, a dodavanje pacijenta je odvojeno.</p></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="#patient-new">+ Dodaj pacijenta</a><a class="btn ghost" href="#patients">Lista pacijenata</a><a class="btn ghost" href="#today">Danas</a></div>' +
        '</div>' +
      '</div>' +
      '<div class="grid cols-3">' +
        softCard('Pacijenti', 'Odmah dostupna lista svih pacijenata i brzi ulaz u profil.', '<a class="btn" href="#patients">Otvori listu</a>') +
        softCard('Dodaj pacijenta', 'Zaseban ekran za unos novog pacijenta, bez miješanja s listom.', '<a class="btn ghost" href="#patient-new">Dodaj novog</a>') +
        softCard('Danas', 'Planirane posjete, njega u tijeku i završene posjete za današnji dan.', '<a class="btn ghost" href="#today">Otvori danas</a>') +
      '</div>' +
      '<div class="card"><h3>Preporučeni red rada</h3>' +
        '<div class="grid cols-3">' +
          '<div>' + tag('1', 'ok') + '<p><strong>Otvori listu pacijenata</strong><br><span class="muted">Pacijenti su sada odvojeni od unosa.</span></p></div>' +
          '<div>' + tag('2', 'warn') + '<p><strong>Dodaj novog po potrebi</strong><br><span class="muted">Nova forma je zasebna stavka u sidebaru.</span></p></div>' +
          '<div>' + tag('3', 'ok') + '<p><strong>Scan QR/NFC</strong><br><span class="muted">Workflow ostaje isti: scan/tap za početak i završetak.</span></p></div>' +
        '</div>' +
      '</div>';
  }

  function fmt(v) { if (!v) return '-'; try { return new Date(v).toLocaleString('hr-HR'); } catch(e) { return String(v); } }
  function patientFullName(p) { return String((p.first_name || '') + ' ' + (p.last_name || '')).trim(); }

  function patientRow(p) {
    var full = patientFullName(p);
    var dob = p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '';
    return '' +
      '<tr>' +
        '<td><strong>' + esc(full) + '</strong><br><span class="muted">' + esc(p.address || '') + '</span></td>' +
        '<td>' + esc(dob || '-') + '</td>' +
        '<td>' + esc(p.phone || '-') + '</td>' +
        '<td>' + esc(p.family_contact_name || '-') + '<br><span class="muted">' + esc(p.family_contact_phone || '') + '</span></td>' +
        '<td style="white-space:nowrap"><a class="btn small" href="#patient?id=' + esc(p.id) + '">Profil</a> <button class="btn ghost small" data-delete-patient="' + esc(p.id) + '" type="button">Deaktiviraj</button></td>' +
      '</tr>';
  }

  function loadPatients() {
    var wrap = $('#patientsList');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty">Učitavanje...</div>';
    api('/api/patients').then(function (data) {
      var items = data.items || [];
      if (!items.length) { wrap.innerHTML = '<div class="empty">Još nema pacijenata. Klikni “Dodaj pacijenta” u sidebaru.</div>'; return; }
      var rows = '';
      for (var i = 0; i < items.length; i++) rows += patientRow(items[i]);
      wrap.innerHTML = '' +
        '<div class="table-wrap pretty"><table class="table pretty">' +
          '<thead><tr><th>Pacijent</th><th>Rođen</th><th>Telefon</th><th>Obitelj</th><th>Radnje</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>';
    }).catch(function (err) {
      wrap.innerHTML = '<div class="alert err">Greška: ' + esc(err.message || err) + '</div>';
    });
  }

  function bindPatientDelete(view) {
    if (!view || view.dataset.deleteBound === '1') return;
    view.dataset.deleteBound = '1';
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
  }

  function viewPatients() {
    setCrumbs('Pacijenti');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '' +
      '<div class="card" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><h2>Pacijenti</h2><p class="muted">Lista pacijenata je odmah dostupna. Dodavanje je odvojeno u sidebaru.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="#patient-new">+ Dodaj pacijenta</a><button class="btn ghost" type="button" id="refreshPatients">Osvježi</button></div></div>' +
      '<div class="card"><h3>Popis pacijenata</h3><div id="patientsList"></div></div>';
    var refresh = $('#refreshPatients');
    if (refresh) refresh.addEventListener('click', loadPatients);
    bindPatientDelete(view);
    loadPatients();
  }

  function viewPatientNew() {
    setCrumbs('Dodaj pacijenta');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '' +
      '<div class="card" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><h2>Dodaj pacijenta</h2><p class="muted">Ovo je sada zaseban ekran. Upiši osnovno, ostalo možeš dopuniti kasnije.</p></div><a class="btn ghost" href="#patients">Natrag na listu</a></div>' +
      '<div class="card"><h3>Osnovni podaci</h3>' +
        '<form id="patientForm" class="grid cols-3" autocomplete="off">' +
          '<div><label>Ime</label><input name="first_name" required></div>' +
          '<div><label>Prezime</label><input name="last_name" required></div>' +
          '<div><label>Datum rođenja</label><input name="date_of_birth" type="date"></div>' +
          '<div><label>Adresa</label><input name="address"></div>' +
          '<div><label>Telefon</label><input name="phone"></div>' +
          '<div><label>Kontakt obitelji</label><input name="family_contact_name"></div>' +
          '<div><label>Telefon obitelji</label><input name="family_contact_phone"></div>' +
          '<div style="grid-column:1/-1"><label>Napomena</label><textarea name="notes" rows="3" placeholder="Npr. ulaz, kat, važna napomena za posjetu..."></textarea></div>' +
          '<div style="grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn" type="submit">Spremi pacijenta</button><a class="btn ghost" href="#patients">Odustani</a><span id="patientMsg" class="muted"></span></div>' +
        '</form></div>';
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
          if (out) out.textContent = 'Pacijent spremljen. Otvaram listu...';
          setTimeout(function () { location.hash = '#patients'; }, 500);
        }).catch(function (err) {
          if (out) out.textContent = 'Greška: ' + (err.message || err);
        }).then(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'Spremi pacijenta'; }
        });
      });
    }
  }

  function infoLine(label, value) {
    return '<p style="margin:8px 0"><strong>' + esc(label) + ':</strong><br>' + esc(value || '-') + '</p>';
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
      var safety = '';
      if (p.allergies) safety += infoLine('Alergije', p.allergies);
      if (p.diagnoses) safety += infoLine('Dijagnoze', p.diagnoses);
      if (p.risks) safety += infoLine('Rizici', p.risks);
      if (p.mobility_note) safety += infoLine('Mobilnost', p.mobility_note);
      if (p.access_note) safety += infoLine('Ulaz / pristup', p.access_note);
      if (!safety) safety = '<p class="muted">Nema upisanih sigurnosnih napomena.</p>';
      view.innerHTML = '' +
        '<div class="card" style="padding:22px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2 style="margin-bottom:4px">' + esc(full) + '</h2><p class="muted">' + esc(p.address || 'Adresa nije upisana') + '</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' + tag(p.phone || 'Bez telefona', 'info') + tag(p.family_contact_name || 'Bez kontakta obitelji', 'warn') + '</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn ghost" href="#patients">Natrag</a><button class="btn" id="copyScanLink" type="button">Kopiraj QR/NFC link</button></div></div></div>' +
        '<div class="grid cols-3">' +
          '<div class="card"><h3>Osnovno</h3>' + infoLine('Datum rođenja', p.date_of_birth ? String(p.date_of_birth).slice(0,10) : '-') + infoLine('Telefon', p.phone || '-') + '</div>' +
          '<div class="card"><h3>Adresa</h3><p>' + esc(p.address || '-') + '</p></div>' +
          '<div class="card"><h3>Obitelj</h3>' + infoLine(p.family_contact_name || 'Kontakt', p.family_contact_phone || '-') + '</div>' +
        '</div>' +
        '<div class="card"><h3>Važno prije posjete</h3>' + safety + '</div>' +
        '<div class="card"><h3>Napomena</h3><p>' + esc(p.notes || 'Nema napomene.') + '</p></div>' +
        '<div class="card"><h3>QR/NFC</h3><p class="muted">Workflow za QR/NFC ne mijenjam u ovom UI cleanupu. Ovo je postojeći link za kopiranje.</p><input id="scanLink" readonly value="' + esc(scanLink) + '"></div>';
      var copy = $('#copyScanLink');
      if (copy) copy.onclick = function () {
        var input = $('#scanLink');
        if (input) { input.select(); document.execCommand('copy'); copy.textContent = 'Kopirano'; setTimeout(function(){ copy.textContent = 'Kopiraj QR/NFC link'; }, 1200); }
      };
    }).catch(function (err) {
      view.innerHTML = '<div class="alert err">Greška: ' + esc(err.message || err) + '</div>';
    });
  }

  function patientNameFromVisit(x) {
    return x.patient_name || String((x.first_name || '') + ' ' + (x.last_name || '')).trim() || 'Pacijent';
  }

  function visitCard(x, status) {
    var tone = status === 'open' ? 'warn' : status === 'finished' ? 'ok' : 'info';
    var label = status === 'open' ? 'U tijeku' : status === 'finished' ? 'Završeno' : 'Planirano';
    var time = status === 'open' ? x.started_at : status === 'finished' ? x.finished_at : x.planned_for;
    return '<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:#fff">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>' + esc(patientNameFromVisit(x)) + '</strong>' + tag(label, tone) + '</div>' +
      '<div class="muted">' + esc(x.address || '') + '</div>' +
      '<div class="muted" style="margin-top:6px">Vrijeme: ' + esc(fmt(time)) + (x.window_text ? ' · okvir: ' + esc(x.window_text) : '') + '</div>' +
      (x.instructions ? '<div class="muted" style="margin-top:6px">' + esc(x.instructions) + '</div>' : '') +
      (x.patient_id ? '<div style="margin-top:10px"><a class="btn small ghost" href="#patient?id=' + esc(x.patient_id) + '">Profil</a></div>' : '') +
    '</div>';
  }

  function visitList(items, status, empty) {
    if (!items || !items.length) return '<div class="empty">' + esc(empty) + '</div>';
    var html = '<div style="display:grid;gap:10px">';
    for (var i = 0; i < items.length; i++) html += visitCard(items[i], status);
    return html + '</div>';
  }

  function viewToday() {
    setCrumbs('Danas');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '<div class="card"><h2>Danas</h2><p class="muted">Učitavanje današnjeg pregleda...</p></div>';
    api('/api/care/dashboard/today').then(function (data) {
      var counts = data.counts || {};
      view.innerHTML = '' +
        '<div class="card" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><h2>Danas</h2><p class="muted">Pregled rada za današnji dan bez dodatnih modula.</p></div><button class="btn ghost" id="refreshToday" type="button">Osvježi</button></div>' +
        '<div class="grid cols-3">' +
          '<div class="card"><h3>Planirano</h3><div style="font-size:32px;font-weight:900">' + esc(counts.planned || 0) + '</div></div>' +
          '<div class="card"><h3>U tijeku</h3><div style="font-size:32px;font-weight:900">' + esc(counts.open || 0) + '</div></div>' +
          '<div class="card"><h3>Završeno</h3><div style="font-size:32px;font-weight:900">' + esc(counts.finished || 0) + '</div></div>' +
        '</div>' +
        '<div class="card"><h3>Planirano danas / uskoro</h3>' + visitList(data.planned || [], 'planned', 'Nema planiranih posjeta za danas.') + '</div>' +
        '<div class="card"><h3>Njega u tijeku</h3>' + visitList(data.open || [], 'open', 'Nema otvorenih posjeta.') + '</div>' +
        '<div class="card"><h3>Završeno danas</h3>' + visitList(data.finished || [], 'finished', 'Još nema završenih posjeta danas.') + '</div>';
      var b = $('#refreshToday');
      if (b) b.onclick = viewToday;
    }).catch(function (err) {
      view.innerHTML = '<div class="alert err">Greška: ' + esc(err.message || err) + '</div>';
    });
  }

  function viewVisits() {
    setCrumbs('Posjete');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '<div class="card"><h2>Posjete</h2><p class="muted">Za sada koristi ekran Danas i profil pacijenta. Detaljni modul posjeta vraćamo tek nakon stabilnog UI testa.</p><a class="btn" href="#today">Otvori Danas</a></div>';
  }

  function viewQr() {
    setCrumbs('QR / NFC');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '<div class="card"><h2>QR / NFC</h2><p class="muted">QR/NFC workflow ne mijenjam u ovom koraku. Cilj je prvo stabilno i pregledno sučelje.</p><div class="grid cols-3"><div>' + tag('1', 'ok') + '<p><strong>Otvori pacijenta</strong><br><span class="muted">Nađi pacijenta u popisu.</span></p></div><div>' + tag('2', 'warn') + '<p><strong>Kopiraj link</strong><br><span class="muted">QR/NFC link je u profilu pacijenta.</span></p></div><div>' + tag('3', 'ok') + '<p><strong>Testiraj na mobitelu</strong><br><span class="muted">Za mobitel koristi LAN IP, ne localhost.</span></p></div></div></div>';
  }

  function viewStaff() {
    setCrumbs('Djelatnici');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '<div class="card"><h2>Djelatnici</h2><p class="muted">Modul djelatnika ostaje za kasnije. Trenutno fokus: stabilan rad, pacijenti i posjete.</p></div>';
  }

  function viewSettings() {
    setCrumbs('Administracija');
    var view = $('#view');
    if (!view) return;
    view.innerHTML = '<div class="card"><h2>Administracija</h2><p class="muted">Postavke i napredni moduli vraćaju se nakon što osnovni UI bude stabilan.</p></div><div class="card"><button class="btn ghost" id="logoutInline" type="button">Odjava</button></div>';
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
    if (r === '#today') return viewToday();
    if (r === '#patients') return viewPatients();
    if (r === '#patient-new') return viewPatientNew();
    if (r === '#patient') return viewPatientProfile();
    if (r === '#visits') return viewVisits();
    if (r === '#qr') return viewQr();
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