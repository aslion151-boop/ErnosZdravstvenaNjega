/* Ernos Zdravstvena Njega - visits and reports addon */
(function () {
  function $(s) { return document.querySelector(s); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch;
    });
  }

  function token() {
    try {
      return (window.state && window.state.token) ||
        sessionStorage.getItem('ernosToken') ||
        localStorage.getItem('ernosToken') || '';
    } catch (e) {
      return '';
    }
  }

  function authHeaders() {
    var headers = {};
    var t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    return headers;
  }

  function api(path) {
    return fetch(location.origin + path, { headers: authHeaders() }).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) {}
        if (!res.ok) {
          throw new Error((json && (json.error || json.detail || json.message)) || text || ('HTTP ' + res.status));
        }
        return json || {};
      });
    });
  }

  function fmt(v) {
    if (!v) return '-';
    try { return new Date(v).toLocaleString('hr-HR'); } catch (e) { return String(v); }
  }

  function setTitle(title) {
    var crumbs = $('#crumbs');
    if (crumbs) crumbs.textContent = title;
    document.title = 'Ernos Zdravstvena Njega - ' + title;
  }

  function route() {
    return (location.hash || '').split('?')[0];
  }

  function isVisitsRoute() {
    var r = route();
    return r === '#visits' || r === '#care-reports';
  }

  function setVisitsNavActive() {
    var links = document.querySelectorAll('#nav a');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href === '#visits') {
        if (isVisitsRoute()) links[i].classList.add('active');
      } else if (route() === '#care-reports') {
        links[i].classList.remove('active');
      }
    }

    var legacy = $('#careReportsNav');
    if (legacy) legacy.remove();
  }

  function duration(row) {
    if (row.duration_minutes !== '' && row.duration_minutes != null) {
      return String(row.duration_minutes) + ' min';
    }
    return row.finished_at ? '-' : 'u tijeku';
  }

  function statusTag(row) {
    var open = !row.finished_at;
    var background = open ? '#FEF3C7' : '#DCFCE7';
    var color = open ? '#92400E' : '#166534';
    var label = open ? 'U tijeku' : 'Završeno';
    return '<span class="tag" style="background:' + background + ';color:' + color + ';border:0;font-weight:800">' + label + '</span>';
  }

  function detailText(row) {
    var parts = [];
    if (row.performed_procedures) parts.push(row.performed_procedures);
    if (row.procedure_note) parts.push(row.procedure_note);
    if (row.care_plan_done) parts.push('Plan: ' + row.care_plan_done);
    if (row.finish_note) parts.push(row.finish_note);
    else if (row.start_note) parts.push(row.start_note);
    return parts.join(' · ') || '-';
  }

  function familyText(row) {
    if (!row.family_notification_status) return '-';
    var text = row.family_notification_status;
    if (row.family_notification_to) text += ' · ' + row.family_notification_to;
    return text;
  }

  function rowHtml(row) {
    var patient = row.patient_name || '-';
    var profile = row.patient_id
      ? '<a class="btn small ghost" href="#patient?id=' + encodeURIComponent(row.patient_id) + '">Profil</a>'
      : '';

    return '<tr>' +
      '<td>' + statusTag(row) + '</td>' +
      '<td><strong>' + esc(patient) + '</strong><br><span class="muted">' + esc(row.address || '') + '</span><div style="margin-top:7px">' + profile + '</div></td>' +
      '<td>' + esc(fmt(row.started_at)) + '<br><span class="muted">' + esc(row.started_by_name || '') + '</span></td>' +
      '<td>' + esc(row.finished_at ? fmt(row.finished_at) : '-') + '<br><span class="muted">' + esc(row.finished_by_name || '') + '</span></td>' +
      '<td>' + esc(duration(row)) + '</td>' +
      '<td style="min-width:240px">' + esc(detailText(row)) + '</td>' +
      '<td>' + esc(familyText(row)) + '</td>' +
    '</tr>';
  }

  function queryString() {
    var q = $('#visitSearch') ? $('#visitSearch').value.trim() : '';
    var openOnly = $('#visitOpenOnly') && $('#visitOpenOnly').checked;
    var params = ['limit=150'];
    if (q) params.push('q=' + encodeURIComponent(q));
    if (openOnly) params.push('open=1');
    return params.join('&');
  }

  function renderSummary(items) {
    var total = items.length;
    var open = 0;
    for (var i = 0; i < items.length; i++) {
      if (!items[i].finished_at) open++;
    }
    var finished = total - open;
    var summary = $('#visitSummary');
    if (!summary) return;
    summary.innerHTML = '' +
      '<div class="grid cols-3">' +
        '<div class="card" style="margin-bottom:0"><h3>Prikazano</h3><div style="font-size:30px;font-weight:900">' + total + '</div></div>' +
        '<div class="card" style="margin-bottom:0"><h3>U tijeku</h3><div style="font-size:30px;font-weight:900">' + open + '</div></div>' +
        '<div class="card" style="margin-bottom:0"><h3>Završeno</h3><div style="font-size:30px;font-weight:900">' + finished + '</div></div>' +
      '</div>';
  }

  function loadVisits() {
    var rowsNode = $('#visitRows');
    if (!rowsNode) return;
    rowsNode.innerHTML = '<div class="empty">Učitavanje posjeta...</div>';

    var refresh = $('#visitRefresh');
    if (refresh) {
      refresh.disabled = true;
      refresh.textContent = 'Učitavanje...';
    }

    api('/api/care/reports/visits?' + queryString()).then(function (data) {
      var items = data.items || [];
      renderSummary(items);

      if (!items.length) {
        rowsNode.innerHTML = '<div class="empty">Nema posjeta za odabrani prikaz.</div>';
        return;
      }

      var html = '<div class="table-wrap"><table><thead><tr>' +
        '<th>Status</th><th>Pacijent</th><th>Početak</th><th>Završetak</th><th>Trajanje</th><th>Postupci i napomene</th><th>Obitelj</th>' +
        '</tr></thead><tbody>';
      for (var i = 0; i < items.length; i++) html += rowHtml(items[i]);
      html += '</tbody></table></div>';
      rowsNode.innerHTML = html;
    }).catch(function (err) {
      rowsNode.innerHTML = '<div class="alert err">Greška: ' + esc(err.message || err) + '</div>';
      var summary = $('#visitSummary');
      if (summary) summary.innerHTML = '';
    }).then(function () {
      if (refresh) {
        refresh.disabled = false;
        refresh.textContent = 'Osvježi';
      }
    });
  }

  function downloadCsv() {
    var button = $('#visitCsv');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Pripremam CSV...';

    fetch(location.origin + '/api/care/reports/visits.csv?' + queryString(), {
      headers: authHeaders()
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error(text || ('HTTP ' + res.status));
        });
      }
      return res.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'ernos-posjete.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }).catch(function (err) {
      alert('CSV nije moguće preuzeti: ' + (err.message || err));
    }).then(function () {
      button.disabled = false;
      button.textContent = 'Preuzmi CSV';
    });
  }

  function renderVisits() {
    if (!isVisitsRoute()) return false;
    var view = $('#view');
    if (!view) return true;

    setTitle('Posjete');
    setVisitsNavActive();
    view.innerHTML = '' +
      '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
          '<div><h2>Posjete</h2><p class="muted">Pregled terenskih posjeta, trajanja, postupaka i obavijesti obitelji.</p></div>' +
          '<a class="btn ghost" href="#today">Danas</a>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:14px">' +
          '<div style="flex:1 1 260px;max-width:420px"><label for="visitSearch">Pretraži pacijenta ili adresu</label><input id="visitSearch" placeholder="Ime, prezime ili adresa"></div>' +
          '<label style="display:flex;gap:8px;align-items:center;margin:0 4px 10px 0"><input id="visitOpenOnly" type="checkbox" style="width:auto;min-height:auto"> Samo posjete u tijeku</label>' +
          '<button class="btn" id="visitRefresh" type="button">Osvježi</button>' +
          '<button class="btn ghost" id="visitCsv" type="button">Preuzmi CSV</button>' +
        '</div>' +
      '</div>' +
      '<div id="visitSummary" style="margin-bottom:16px"></div>' +
      '<div class="card"><div id="visitRows"><div class="empty">Učitavanje posjeta...</div></div></div>';

    var refresh = $('#visitRefresh');
    if (refresh) refresh.onclick = loadVisits;

    var input = $('#visitSearch');
    if (input) input.onkeydown = function (event) {
      if (event.key === 'Enter') loadVisits();
    };

    var openOnly = $('#visitOpenOnly');
    if (openOnly) openOnly.onchange = loadVisits;

    var csv = $('#visitCsv');
    if (csv) csv.onclick = downloadCsv;

    loadVisits();
    return true;
  }

  function run() {
    setVisitsNavActive();
    renderVisits();
  }

  window.addEventListener('hashchange', function () { setTimeout(run, 60); });
  window.addEventListener('load', function () { setTimeout(run, 120); });
  document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 120); });
  if (document.readyState !== 'loading') setTimeout(run, 120);
})();
