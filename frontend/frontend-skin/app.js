/* Ernos SPA (no-build). Uses hash routing and fetches your existing API.
   Stores token as localStorage.ernosToken and API base as localStorage.ernosApi. */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

/* === 24h date/time helpers & header prettifier (guarded) === */
(() => {
  if (window.__ERNOS_FMT_DEFINED__) return;
  window.__ERNOS_FMT_DEFINED__ = true;

  const pad2 = (n) => String(n).padStart(2, "0");
  const toD  = (v) => (v instanceof Date ? v : new Date(v));

  function fmtDT(v) {                       // HH:mm dd/MM/yy
    const d = toD(v); if (!d || Number.isNaN(d.getTime())) return "";
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)}`;
  }
  function fmtDate(v) {                     // dd/MM/yy
    const d = toD(v); if (!d || Number.isNaN(d.getTime())) return "";
    return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)}`;
  }
  function fmtTime(v) {                     // HH:mm
    const d = toD(v); if (!d || Number.isNaN(d.getTime())) return "";
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  // Any column ending with "_at" is a datetime
  function formatCell(col, val){
    if (val == null) return "";
    if (/_at$/.test(col)) return fmtDT(val);
    if (typeof val === "string" && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) return fmtDT(val);
    return val;
  }

  // "primary_name" -> "PRIMARY NAME"
  function headLabel(col){
    return String(col).replace(/_/g, " ").toUpperCase();
  }

  // expose for other code to call
  window.fmtDT = fmtDT;
  window.fmtDate = fmtDate;
  window.fmtTime = fmtTime;
  window.formatCell = formatCell;
  window.headLabel = headLabel;
})();

// === General helpers (global) ===
function escapeHtml(v){
  if (v == null) return "";
  return String(v).replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s]) );
}

function renderTable(wrap, items, cols){
  if(!items || items.length===0){
    wrap.innerHTML = `<div class="empty">No data.</div>`;
    return;
  }
  const th = cols.map(c=>`<th>${headLabel(c)}</th>`).join("");
  const rows = items.map(o =>
    `<tr>${cols.map(c => `<td>${escapeHtml(formatCell(c, o[c]))}</td>`).join("")}</tr>`
  ).join("");
  wrap.innerHTML = `
    <div style="overflow:auto">
      <table class="table nolines">
        <thead><tr>${th}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

const PUBLIC_API_FALLBACK = (window.ERNOS_PUBLIC_API_URL || "").replace(/\/+$/,"");
const state = {
  api: localStorage.getItem("ernosApi") || PUBLIC_API_FALLBACK || location.origin,
  token: (sessionStorage.getItem("ernosToken") || localStorage.getItem("ernosToken") || ""),
  me: null,
};

try { localStorage.setItem('ernosRemember','1'); } catch {}

function setToken(t){
  state.token = t || "";
  try {
    const remember = localStorage.getItem('ernosRemember') === '1';
    if (remember) {
      localStorage.setItem('ernosToken', state.token);
      sessionStorage.removeItem('ernosToken');
    } else {
      sessionStorage.setItem('ernosToken', state.token);
      localStorage.removeItem('ernosToken');
    }
  } catch {}
}

function setApi(a) {
  state.api = (a || "").replace(/\/+$/,"") || location.origin;
  try { localStorage.setItem("ernosApi", state.api); } catch {}
}

async function api(path, opts = {}) {
  const headers = Object.assign({"Content-Type":"application/json"}, opts.headers || {});
  if (state.token) headers.Authorization = "Bearer " + state.token;
  const r = await fetch(state.api + path, Object.assign({}, opts, { headers }));
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error((j && j.error) || (j && j.message) || ("HTTP " + r.status));
  return j;
}

function navTo(hash) { location.hash = hash; }

function renderNav(){
  const nav = $("#nav");
  if (!nav) return;
  const r = (state.me?.role||"").toUpperCase();
  const c = (state.me?.category||"").toUpperCase();
  const isAdmin = (r==="ADMIN" || r==="ADMIN_GLOBAL");
  const items = [
    ["#dashboard","Dashboard"],
    ...( isAdmin ? [["#staff","Staff"]] : []),
    ...((c==="NURSING" || isAdmin) ? [["#fridge","Fridge Logs"]] : []),
    ...( isAdmin ? [["#fire","Fire Logs"]] : []),
    ["#visitors","Visitors"],
    ["#issues","Issues"],
    ...( isAdmin ? [["#locations","Locations"]] : []),
    ...( isAdmin ? [["#qrcodes","QR Codes"]] : []),
    ["#settings","Settings"],
  ];
  nav.innerHTML = items.map(([href,label]) => `<a href="${href}" data-link>${label}</a>`).join("");
  $$('a[data-link]', nav).forEach(a => {
    if (location.hash === a.getAttribute('href')) a.classList.add('active');
    a.onclick = (e) => { e.preventDefault(); navTo(a.getAttribute('href')); };
  });
}

function renderUserBadge(){
  const el = $("#userBadge");
  if (!el) return;
  if (!state.me){
    el.innerHTML = `<span class="tag">Not signed in</span>`;
  } else {
    const r = (state.me.role||"").toUpperCase();
    const c = (state.me.category||"").toUpperCase();
    el.innerHTML = `<span class="tag">${state.me.name||state.me.email||"User"}</span>
                    <span class="tag">${r}${c && r!==c? " · "+c : ""}</span>
                    ${state.me.tenant_name ? `<span class="tag">${state.me.tenant_name}</span>`: ""}`;
  }
}

function setCrumbs(text){ $("#crumbs").textContent = text || ""; }

async function ensureMe(){
  if (!state.token) { state.me = null; renderUserBadge(); return; }
  try { state.me = await api("/me"); } catch { state.me = null; }
  renderUserBadge();
}

function showMsg(text, cls = ""){
  const el = document.createElement("div");
  el.className = "alert " + (cls||"");
  el.innerHTML = `<div>${text}</div>`;
  $("#view").prepend(el);
  setTimeout(()=>el.remove(), 4000);
}

function val(el){ return (el.value||"").trim(); }
// === PUSH (Web Push) =========================================
async function getVapidKey(){
  const api = window.ernosApi || state.api || '';
  const r = await fetch((api||'') + '/push/public-key');
  const j = await r.json();
  if (!r.ok) throw new Error(j && j.error || ('HTTP ' + r.status));
  return j.key;
}

async function ensureServiceWorker(){
  if (!('serviceWorker' in navigator)) throw new Error('No ServiceWorker support');
  // Your /sw.js is already in the skin root
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function subscribePush(){
  const api = window.ernosApi || state.api || '';
  const token = state.token || localStorage.getItem('ernosToken') || '';
  if (!token) throw new Error('Sign in first');

  const key = await getVapidKey();
  const reg = await ensureServiceWorker();
  if (!reg.pushManager) throw new Error('Push not supported in this browser');

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  });

  // IMPORTANT: send the subscription RAW (not wrapped in {subscription: ...})
  const r = await fetch((api||'') + '/push/subscribe', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sub)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j && j.error || ('HTTP ' + r.status));
  return true;
}

function initPushButton(){
  const btn = document.getElementById('btnPush');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { alert('Notifications blocked. Enable in the browser.'); return; }
      btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Enabling…';
      await subscribePush();
      btn.textContent = 'Push Enabled';
      setTimeout(()=>{ btn.disabled = false; }, 400);
    } catch (e) {
      console.error(e);
      btn.disabled = false; btn.textContent = 'Enable Push Alerts';
      alert(e.message || String(e));
    }
  });
}

/* -------- Views -------- */

function viewLogin(){
  setCrumbs("Sign in");
  $("#view").innerHTML = `
    <div class="card">
      <h2>Sign in</h2>
      <div class="grid cols-2" style="margin-top:10px">
        <div>
          <label>API base</label>
          <input id="api" class="input" placeholder="${location.origin}" value="${state.api}"/>
        </div>
        <div>
          <label>Email</label>
          <input id="email" class="input" placeholder="admin@example.com" />
        </div>
      </div>
      <div class="grid cols-2" style="margin-top:10px">
        <div>
          <label>Password</label>
          <input id="password" type="password" class="input" placeholder="Password123" />
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end">
          <button id="loginBtn" class="btn">Sign in</button>
        </div>
      </div>
    </div>
  `;
  $("#loginBtn").onclick = async () => {
    try{
      setApi(val($("#api")));
      const j = await api("/auth/login", { method:"POST", body: JSON.stringify({ email: val($("#email")), password: val($("#password")) }) });
      setToken(j.token);
      await ensureMe();
      renderNav();
      // Force change on first login
      try{
        const m = await api('/me/mcp');
        if (m && m.must_change_password) {
          navTo('#settings');
          showMsg('Please set a new password to continue.', 'warn');
          return;
        }
      }catch(_){}
      navTo("#dashboard");
      showMsg("Signed in.", "ok");
    }catch(e){ showMsg(e.message||String(e), "err"); }
  };
}

async function viewDashboard(){
  setCrumbs("Dashboard");
  $("#view").innerHTML = `
    <div class="card">
      <div class="row" style="align-items:center; justify-content:space-between; gap:8px">
        <h2 style="margin:0">Today</h2>
        <button id="btnPush" class="btn small">Enable Push Alerts</button>
      </div>
      <div class="grid cols-3" id="kpis" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <h2>Alerts</h2>
      <div class="muted">Site alerts</div>
      <div id="alertsWrap" class="grid cols-3" style="margin-top:12px"></div>
    </div>
    <div class="card">
      <div class="row">
        <div class="grid" style="flex:1">
          <label>NFC/QR token</label>
          <input id="token" class="input" placeholder="paste token to open tap page" />
        </div>
        <button id="openFridge" class="btn">Open Fridge Tap</button>
        <button id="openFire" class="btn">Open Fire Tap</button>
      </div>
    </div>
  `;

  // role-gated quick open
  {
    const r = (state.me?.role||"").toUpperCase();
    const c = (state.me?.category||"").toUpperCase();
    const isAdmin = (r === "ADMIN" || r === "ADMIN_GLOBAL");
    if (!(isAdmin || c === "NURSING")) $("#openFridge").style.display = "none";
    if (!isAdmin) $("#openFire").style.display = "none";
  }
  $("#openFridge").onclick = ()=>{
    const t = val($("#token")); if(!t) return showMsg("Enter a token", "err");
    window.open(state.api.replace(/\/+$/,"") + "/tap/fridge/" + encodeURIComponent(t), "_blank");
  };
  $("#openFire").onclick = ()=>{
    const t = val($("#token")); if(!t) return showMsg("Enter a token", "err");
    window.open(state.api.replace(/\/+$/,"") + "/tap/fire/" + encodeURIComponent(t), "_blank");
  };

  // KPIs
  const kpis = $("#kpis");
  try {
    const [vj, ij] = await Promise.all([ api("/visitors"), api("/issues") ]);
    const onSite = (vj.items||[]).filter(x => !x.checkout_at).length;
    const openIssues = (ij.items||[]).filter(x => String(x.status||"").toUpperCase() !== "RESOLVED").length;

    let residentsHtml = "";
    try {
      const rj = await api("/residents/outside");
      const outsideCount = Array.isArray(rj.items) ? rj.items.length : (rj.count ?? 0);
      residentsHtml = cardKpi("Residents Outside", outsideCount);
    } catch {}

    kpis.innerHTML =
      cardKpi("Visitors On Site", onSite) +
      (residentsHtml || "") +
      cardKpi("Open Issues", openIssues);
  } catch (e) {
    kpis.innerHTML = `<div class="empty">Could not load KPIs: ${escapeHtml(e.message||String(e))}</div>`;
  }

  // Residents Out card (only once)
  (function addResidentsOutCard(){
    const root = document.getElementById("view");
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="title">Residents Out (now)</div><div id="resOutBody"></div>`;
    root.appendChild(card);

    async function load(){
      try{
        const r = await api("/residents/outside");
        const items = (r.items||[]);
        const body = card.querySelector("#resOutBody");
        if (!items.length) {
          body.innerHTML = `<div class="empty">No residents currently out.</div>`;
          return;
        }
                        body.innerHTML = `
          <div class="table-wrap" style="display:inline-block">
            <table class="table nolines" style="width:auto">
              <thead>
                <tr>
                  <th>${escapeHtml(headLabel("resident"))}</th>
                  <th>${escapeHtml(headLabel("escort"))}</th>
                  <th>${escapeHtml(headLabel("out_at"))}</th>
                  <th>${escapeHtml(headLabel("minutes_out"))}</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(x=>`
                  <tr>
                    <td>${escapeHtml(x.resident||"")}</td>
                    <td>${escapeHtml(x.escort||"")}</td>
                    <td>${escapeHtml(fmtDT(x.out_at))}</td>
                    <td>${escapeHtml(x.minutes_out ?? "")}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`;


      }catch(e){ console.error(e); }
    }
    load();
    try {
      if (state.token) {
        const esUrl = state.api.replace(/\/+$/,'') + "/events?token=" + encodeURIComponent(state.token);
        const es = (window.__ernosES ||= new EventSource(esUrl));
        es.addEventListener("residents", load);
        es.onerror = (e) => {
          try { if (!window.__ernosPoll) window.__ernosPoll = setInterval(load, 30000); } catch {}
        };
      } else {
        try { if (!window.__ernosPoll) window.__ernosPoll = setInterval(load, 30000); } catch {}
      }
    } catch (_) {
      try { if (!window.__ernosPoll) window.__ernosPoll = setInterval(load, 30000); } catch {}
    }
  })();

  // Alerts
  const wrap = $("#alertsWrap");
  try {
    const a = await api("/ff/alerts");
    renderAlerts(wrap, a);
  } catch {
    try { renderAlerts(wrap, await api("/alerts")); }
    catch(e){ showMsg("No alerts available: " + (e.message||e), "warn"); }
  }
}

function cardKpi(title, value){
  return `<div class="card">
    <div class="title">${escapeHtml(title)}</div>
    <div style="font-size:2.2rem;font-weight:800;line-height:1">${escapeHtml(String(value))}</div>
  </div>`;
}

function renderAlerts(wrap, a){
  wrap.innerHTML = "";
  const r = (state.me?.role||"").toUpperCase();
  const c = (state.me?.category||"").toUpperCase();
  const isAdmin    = (r === "ADMIN" || r === "ADMIN_GLOBAL");
  const showFridge = isAdmin || c === "NURSING"; // Nurses + Admin
  const showFire   = isAdmin;                    // Admin only

  const add = (title, items) => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `<div class="title">${title}</div>`;
    if (!items || (Array.isArray(items) && items.length === 0)) {
      el.innerHTML += `<div class="empty">No items</div>`;
    } else if (Array.isArray(items)) {
      el.innerHTML += `<ul style="margin:8px 0 0 16px">${
        items.slice(0,10).map(x => `<li>${escapeHtml(JSON.stringify(x))}</li>`).join("")
      }</ul>`;
    } else {
      el.innerHTML += `<div class="kv">${
        Object.entries(items).map(([k,v]) =>
          `<div class="muted">${escapeHtml(k)}</div><div>${escapeHtml(String(v))}</div>`
        ).join("")
      }</div>`;
    }
    wrap.appendChild(el);
  };

  if (showFridge) {
    add("Fridge Due", a.fridge_due || []);
    add("Fridge Out of Range", a.fridge_out_of_range || []);
  }
  if (showFire) {
    add("Fire Due", a.fire_due || []);
    add("Fire Drill", a.fire_drill_due || {});
  }
}
// Wire the dashboard “Enable Push” button
initPushButton();

// == Force "no lines" style in all data tables inside #view (runtime-injected, max priority)
function ensureNoLinesStyle() {
  if (document.getElementById('ernos-nolines-style')) return;
  const s = document.createElement('style');
  s.id = 'ernos-nolines-style';
  s.textContent = `
    /* collapse + remove everything with very high specificity */
    #view .card table.table,
    #view .card table.table thead,
    #view .card table.table tbody,
    #view .card table.table tr,
    #view .card table.table th,
    #view .card table.table td {
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
      text-decoration: none !important;
      background-image: none !important;
    }
    #view .card table.table { border-collapse: collapse !important; border-spacing: 0 !important; }
  `;
  document.head.appendChild(s);
}
// == Globally hide any signature widgets and remove "required" on them
function ensureNoSignatureStyle() {
  if (!document.getElementById('ernos-kill-signature')) {
    const s = document.createElement('style');
    s.id = 'ernos-kill-signature';
    s.textContent = `
      /* hide common signature widgets everywhere */
      [id*="sign"], [name*="sign"], [placeholder*="sign"], 
      .signature, .sigpad, .sig-pad, .sigcanvas, .sig-canvas, 
      canvas[id*="sign"], label[for*="sign"] {
        display: none !important;
        visibility: hidden !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
      }
    `;
    document.head.appendChild(s);
  }
  // strip "required" just in case any form still enforces it
  document.querySelectorAll('[required]').forEach(el => {
    const id = el.id || '', nm = el.name || '', ph = el.placeholder || '', cls = el.className || '';
    if (/(sign|signature)/i.test(id) || /(sign|signature)/i.test(nm) || /(sign|signature)/i.test(ph) || /(sign|signature)/i.test(cls)) {
      el.removeAttribute('required');
    }
  });
}

async function viewFridge(){
  setCrumbs("Fridge Logs");
  $("#view").innerHTML = `<div class="card"><h2>Fridge Logs</h2><div id="tableWrap"></div></div>`;
  try{
    const j = await api("/ff/fridge/logs");
    renderTable($("#tableWrap"), j.items || [], ["id","location_name","taken_at","temp_c","staff_role"]);
  }catch(e){ showMsg(e.message||String(e), "err"); }
}

async function viewFire(){
  setCrumbs("Fire Logs");
  $("#view").innerHTML = `<div class="card"><h2>Fire Logs</h2><div id="tableWrap"></div></div>`;
  try{
    const j = await api("/ff/fire/logs");
    renderTable($("#tableWrap"), j.items || [], ["id","location_name","check_at","kind","staff_role","note"]);
  }catch(e){ showMsg(e.message||String(e), "err"); }
}

async function viewVisitors(){
  setCrumbs("Visitors");
  $("#view").innerHTML = `<div class="card"><h2>Visitors</h2>
    <div class="row" style="margin-bottom:10px">
      <button id="refresh" class="btn ghost small">Refresh</button>
      <a class="btn small" target="_blank" href="${state.api}/visitors?csv=1">Download CSV</a>
    </div>
    <div id="tableWrap"></div>
  </div>`;

  // --- begin: nuke any signature UI/validation injected by other code ---
  (function killSignatureUI(scope){
    const root = scope || document;
    const SIG = /sign(ature)?|sigpad|sigcanvas/i;

    function strip(rootEl){
      rootEl.querySelectorAll('canvas,input,textarea,div,label,.form-group,.field').forEach(el=>{
        const id = el.id||'', nm = el.name||'', ph = el.placeholder||'', cls = el.className||'';
        const txt = (el.textContent||'').trim();
        if (SIG.test(id) || SIG.test(nm) || SIG.test(ph) || SIG.test(cls) || SIG.test(txt)) {
          el.remove();
        }
      });
      rootEl.querySelectorAll('[required]').forEach(el=>{
        const id = el.id||'', nm = el.name||'';
        if (SIG.test(id) || SIG.test(nm)) el.removeAttribute('required');
      });
    }

    // run now
    strip(document);

    // guard form submissions in case anything slips through
    document.querySelectorAll('form').forEach(f=>{
      if (f.__sigNuked) return; f.__sigNuked = true;
      f.addEventListener('submit', ev=>{
        try{
          Array.from(f.elements||[]).forEach(el=>{
            const id = el.id||'', nm = el.name||'';
            if (SIG.test(id) || SIG.test(nm)) {
              el.removeAttribute?.('required');
              try { el.value = ''; } catch(_){}
            }
          });
        }catch(_){}
      }, true);
    });

    // keep stripping if something injects late
    const mo = new MutationObserver(muts=>{
      if ((location.hash||'').toLowerCase() !== '#visitors') return;
      muts.forEach(m=>{
        m.addedNodes && m.addedNodes.forEach(n=>{
          if (n.nodeType === 1) strip(n);
        });
      });
    });
    try { mo.observe(document.getElementById('view')||document.body, { childList:true, subtree:true }); } catch(_){}
  })();
  // --- end: nuke signature UI ---

  async function load(){
    try{
      const j = await api("/visitors");
      renderTable($("#tableWrap"), j.items || [], ["id","primary_name","resident","checkin_at","checkout_at"]);
    }catch(e){ showMsg(e.message||String(e), "err"); }
  }
  $("#refresh").onclick = load;
  load();
}


async function viewIssues(){
  setCrumbs("Issues");
  $("#view").innerHTML = `<div class="card"><h2>Maintenance Issues</h2>
    <div class="row" style="margin-bottom:10px">
      <button id="refresh" class="btn ghost small">Refresh</button>
    </div>
    <div id="tableWrap"></div>
  </div>`;
  async function load(){
    try{
      const j = await api("/issues");
      renderTable($("#tableWrap"), j.items || [], ["id","status","location_name","category","text","user_name","created_at","accepted_by_name","maintenance_comment"]);
    }catch(e){ showMsg(e.message||String(e), "err"); }
  }
  $("#refresh").onclick = load;
  load();
}

async function viewLocations(){
  setCrumbs("Locations");
  $("#view").innerHTML = `<div class="card">
    <h2>Locations</h2>
    <div class="grid cols-3" style="margin-top:10px">
      <div><label>Name</label><input id="locName" class="input" placeholder="e.g. Reception A"/></div>
      <div>
        <label>Type</label>
        <select id="locType" class="input">
          <option>ROOM</option>
          <option>ASSET</option>
          <option>RECEPTION</option>
          <option>FRIDGE</option>
          <option>FIRE</option>
        </select>
      </div>
      <div style="display:flex;align-items:flex-end"><button id="addLoc" class="btn">Add</button></div>
    </div>
    <div id="locMsg" class="muted" style="margin-top:6px"></div>
    <div id="tableWrap" style="margin-top:10px"></div>
  </div>`;

  $("#addLoc").onclick = async () => {
    try{
      const name = val($("#locName"));
      const type = val($("#locType")).toUpperCase();
      if(!name) return showMsg("Enter a location name", "err");
      await api("/locations", { method:"POST", body: JSON.stringify({ name, type, active: 1 }) });
      $("#locName").value = "";
      showMsg("Location added.", "ok");
      load();
    }catch(e){ showMsg(e.message||String(e), "err"); }
  };

  async function load(){
    try{
      const j = await api("/locations");
      const items = j.items || [];
      if (!items.length) { $("#tableWrap").innerHTML = `<div class="empty">No locations.</div>`; return; }
      const rows = items.map(x => `
        <tr>
          <td>${escapeHtml(x.name)}</td>
          <td>${escapeHtml(x.type)}</td>
          <td>${x.active ? "Yes" : "No"}</td>
          <td>
            <button class="btn ghost small" data-act="toggle" data-id="${x.id}">Toggle</button>
            <button class="btn ghost small" data-act="delete" data-id="${x.id}">Delete</button>
          </td>
        </tr>`).join("");
      $("#tableWrap").innerHTML = `
        <div style="overflow:auto">
          <table class="table nolines">
            <thead><tr><th>Name</th><th>Type</th><th>Active</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      $("#tableWrap").querySelectorAll("[data-act='toggle']").forEach(b=>{
        b.onclick = async () => {
          const id = b.getAttribute("data-id");
          const x = items.find(i=>String(i.id)===String(id));
          if(!x) return;
          try{
            await api("/locations/" + id, { method:"PATCH", body: JSON.stringify({ active: x.active ? 0 : 1 }) });
            load();
          }catch(e){ showMsg(e.message||String(e), "err"); }
        };
      });
      $("#tableWrap").querySelectorAll("[data-act='delete']").forEach(b=>{
        b.onclick = async () => {
          const id = b.getAttribute("data-id");
          if(!confirm("Delete this location and its QR?")) return;
          try{
            await api("/locations/" + id, { method:"DELETE" });
            load();
          }catch(e){ showMsg(e.message||String(e), "err"); }
        };
      });
    }catch(e){ showMsg(e.message||String(e), "err"); }
  }

  load();
}

async function viewQRCodes(){
  setCrumbs("QR Codes");
  $("#view").innerHTML = `<div class="card">
    <h2>Generate QR / NFC</h2>
    <div class="grid cols-3">
      <div>
        <label>Location</label>
        <select id="locSel" class="input"><option value="">Loading…</option></select>
      </div>
      <div style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap">
        <button id="create" class="btn">Create</button>
        <button id="copyTap" class="btn ghost">Copy Tap URL</button>
      </div>
    </div>
    <div id="qrOut" style="margin-top:10px"></div>
  </div>`;

  // Load locations
  let LOCS = [];
  try{
    const j = await api("/locations");
    LOCS = j.items || [];
    const sel = $("#locSel");
    sel.innerHTML = `<option value="">(select)</option>` +
      LOCS.map(x => `<option value="${x.id}">${escapeHtml(x.name)} (${escapeHtml(x.type||"")})</option>`).join("");
  }catch(e){ showMsg("Failed to load locations: " + (e.message||e), "err"); }

  let lastTapUrl = "";
  let lastQrDataUrl = "";

  $("#create").onclick = async () => {
    try{
      const id = parseInt($("#locSel").value,10);
      if(!id) return showMsg("Choose a location", "err");

      const j = await api("/qrcodes", { method:"POST", body: JSON.stringify({ locationId: id }) });

      const base = state.api.replace(/\/+$/,"");
      const urlAuto = `${base}/tap/u/${j.token}`;
      lastTapUrl = j.urlTapFridge || j.urlTapFire || j.urlTapReception || urlAuto;

      $("#qrOut").innerHTML = `
        <div class="kv" style="margin-top:8px">
          <div class="muted">Token</div><div><code>${escapeHtml(j.token)}</code></div>
          <div class="muted">Auto</div><div><a href="${urlAuto}" target="_blank">${urlAuto}</a></div>
          <div class="muted">Fridge</div><div><a href="${j.urlTapFridge||""}" target="_blank">${j.urlTapFridge||"-"}</a></div>
          <div class="muted">Fire</div><div><a href="${j.urlTapFire||""}" target="_blank">${j.urlTapFire||"-"}</a></div>
          <div class="muted">Reception</div><div><a href="${j.urlTapReception||""}" target="_blank">${j.urlTapReception||"-"}</a></div>
        </div>

        <div style="margin-top:12px">
          <label class="muted">QR / NFC target</label>
          <select id="qrTarget" class="input">
            <option value="${urlAuto}">Auto</option>
            ${j.urlTapFridge ? `<option value="${j.urlTapFridge}">Fridge</option>` : ``}
            ${j.urlTapFire ? `<option value="${j.urlTapFire}">Fire</option>` : ``}
            ${j.urlTapReception ? `<option value="${j.urlTapReception}">Reception</option>` : ``}
          </select>
        </div>

        <div id="qrBox" style="margin-top:12px; display:flex; gap:16px; align-items:center; flex-wrap:wrap">
          <div id="qrCanvas" style="width:240px;height:240px;background:#fff;border-radius:10px"></div>
          <div style="flex:1; min-width:260px">
            <div class="muted">Scan with phone camera</div>
            <div id="qrLink" style="margin-top:6px"></div>
            <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
              <button id="dlPng" class="btn ghost small">Download PNG</button>
              <button id="printQR" class="btn ghost small">Print QR</button>
              <button id="writeNfc" class="btn small">Write NFC tag</button>
            </div>
            <div class="muted" style="margin-top:8px">
              Web NFC write works on recent Android Chrome over HTTPS. Keep the phone near an empty tag.
            </div>
          </div>
        </div>
      `;

      const tgtSel = $("#qrTarget");
      const qrLink = $("#qrLink");
      const qrCanvas = $("#qrCanvas");

      function renderQR(url){
        qrCanvas.innerHTML = "";
        if (!window.QRCode) {
          qrLink.innerHTML = `<a href="${url}" target="_blank">${url}</a>`;
          return;
        }
        new QRCode(qrCanvas, { text: url, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
        qrLink.innerHTML = `<a href="${url}" target="_blank">${url}</a>`;
        setTimeout(()=>{
          const img = qrCanvas.querySelector("img,canvas");
          if (img && img.tagName === "IMG") lastQrDataUrl = img.src;
          else if (img && img.tagName === "CANVAS") lastQrDataUrl = img.toDataURL("image/png");
        }, 100);
      }

      renderQR($("#qrTarget").value);
      tgtSel.onchange = ()=> { lastTapUrl = tgtSel.value; renderQR(tgtSel.value); };

      $("#dlPng").onclick = () => {
        const img = qrCanvas.querySelector("img,canvas");
        if (!img) return;
        let dataUrl = "";
        if (img.tagName === "CANVAS") dataUrl = img.toDataURL("image/png");
        else if (img.tagName === "IMG") dataUrl = img.src;
        if (dataUrl) {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = "ernos-qr.png";
          document.body.appendChild(a); a.click(); a.remove();
        }
      };

      $("#printQR").onclick = () => {
        if (!lastQrDataUrl) { showMsg("Generate a QR first.", "err"); return; }
        const targetUrl = $("#qrTarget").value;
        try {
          let iframe = document.getElementById("ernos-print-frame");
          if (!iframe) {
            iframe = document.createElement("iframe");
            iframe.id = "ernos-print-frame";
            Object.assign(iframe.style, { position:"fixed", right:"0", bottom:"0", width:"0", height:"0", border:"0", visibility:"hidden" });
            document.body.appendChild(iframe);
          }
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          doc.open();
          doc.write(`
            <!doctype html>
            <meta charset="utf-8">
            <title>QR</title>
            <style>
              @page { size: auto; margin: 12mm; }
              body { font-family: system-ui, sans-serif; padding: 0; margin: 0; }
              .wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; }
              img { width: 260px; height: 260px; image-rendering: pixelated; }
              .url { margin-top: 8px; font-size: 12px; color: #000; word-break: break-all; text-align:center; }
            </style>
            <div class="wrap">
              <img src="${lastQrDataUrl}" alt="QR Code">
              <div class="url">${escapeHtml(targetUrl)}</div>
            </div>
            <script>
              window.onload = function(){
                try { window.focus(); window.print(); } catch(_) {}
                setTimeout(function(){ document.body.innerHTML = ""; }, 500);
              };
            <\/script>
          `);
          doc.close();
          setTimeout(() => { try { iframe.remove(); } catch(_) {} }, 2000);
        } catch (e) {
          showMsg("Print failed: " + (e.message || e), "err");
        }
      };

      $("#writeNfc").onclick = async () => {
        try{
          // 1) Read selected target
          let url = $("#qrTarget").value;

          // 2) Normalize to absolute URL (defensive)
          try{
            const u = new URL(url, state.api.replace(/\/+$/,'') + '/');
            url = u.href;
          }catch(_){
            return showMsg('Invalid URL for NFC tag.', 'err');
          }

          // 3) Require Web NFC
          if (!("NDEFReader" in window)) {
            return showMsg("Web NFC not supported on this device/browser.", "warn");
          }

          // 4) Write a *URL* record (not plain text)
          const ndef = new NDEFReader();
          await ndef.write({
            records: [
              { recordType: "url", data: url }
            ]
          });

          // 5) Helpful messages
          showMsg(`NFC tag written: ${url}`, "ok");
          if (!/^https:\/\//i.test(url)) {
            showMsg("Tip: use HTTPS so all phones open it automatically.", "warn");
          }
        } catch (e) {
          showMsg(`NFC write failed: ${e?.message || String(e)}`, "err");
        }
      };

      const copyBtn = $("#copyTap");
      if (copyBtn) {
        copyBtn.onclick = async () => {
          try{
            const toCopy = $("#qrTarget").value || lastTapUrl;
            if(!toCopy) return showMsg("Create a QR first", "err");
            await navigator.clipboard.writeText(toCopy);
            showMsg("Tap URL copied.", "ok");
          }catch{ showMsg(lastTapUrl, "ok"); }
        };
      }

    }catch(e){ showMsg(e.message||String(e), "err"); }
  };
}

/* -------- Staff (Admin) -------- */
async function viewStaff(){
  setCrumbs("Staff");
  const r = (state.me?.role||"").toUpperCase();
  const isGlobal = (r === "ADMIN_GLOBAL");

  $("#view").innerHTML = `
    <div class="card">
      <h2>Create Staff User</h2>
      <div class="grid cols-3" style="margin-top:10px">
        <div><label>Name</label><input id="add_name" class="input" placeholder="Jane Doe"/></div>
        <div><label>Username</label><input id="add_username" class="input" placeholder="jane.doe or email"/></div>
        <div><label>Password</label><input id="add_password" type="password" class="input" placeholder="min 8 chars"/></div>
        <div>
          <label>Role</label>
          <select id="add_role" class="input">
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
            ${isGlobal ? `<option value="ADMIN_GLOBAL">ADMIN_GLOBAL</option>` : ``}
          </select>
        </div>
        <div>
          <label>Category</label>
          <select id="add_cat" class="input">
            <option value="NONE">NONE</option>
            <option value="NURSING">NURSING</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
            <option value="ADMINISTRATION">ADMINISTRATION</option>
          </select>
        </div>
        <div style="display:flex; align-items:flex-end; gap:8px; flex-wrap:wrap">
          <label style="display:flex; align-items:center; gap:6px">
            <input type="checkbox" id="add_active" checked /> Active
          </label>
          <button id="btnCreate" class="btn" type="button">Create</button>
          <button id="btnRefreshUsers" class="btn ghost small" type="button">Refresh</button>
        </div>
      </div>
    </div>
    <div class="card">
      <h2>Users</h2>
      <div id="usersWrap" class="table-wrap"></div>
    </div>
  `;

  async function loadUsers(){
    try{
      const j = await api('/users');
      const items = j.items || [];
      if (!items.length){
        $('#usersWrap').innerHTML = `<div class="empty">No users</div>`;
        return;
      }
      const rows = items.map(u => `
        <tr>
          <td>${escapeHtml(u.id)}</td>
          <td>${escapeHtml(u.name||'')}</td>
          <td>${escapeHtml(u.username||'')}</td>
          <td>${escapeHtml((u.role||'').toUpperCase())}</td>
          <td>${escapeHtml((u.category||'').toUpperCase())}</td>
          <td>${u.active ? 'Yes' : 'No'}</td>
          <td>
            <button class="btn ghost small" data-act="del" data-id="${u.id}">Delete</button>
          </td>
        </tr>
      `).join('');
      $('#usersWrap').innerHTML = `
        <div style="overflow:auto">
          <table class="table nolines">
            <thead><tr>
              <th>ID</th><th>Name</th><th>Username</th><th>Role</th><th>Category</th><th>Active</th><th>Actions</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      // Hook delete buttons
      $('#usersWrap').querySelectorAll("[data-act='del']").forEach(b=>{
        b.onclick = async ()=>{
          const id = b.getAttribute('data-id');
          if (!confirm('Delete this user?')) return;
          try {
            await api(`/users/${encodeURIComponent(id)}`, { method:'DELETE' });
            showMsg('User deleted.','ok');
            await loadUsers();
          } catch(e){
            showMsg(e.message||String(e),'err');
          }
        };
      });

    }catch(e){
      $('#usersWrap').innerHTML = `<div class="empty">Failed to load users: ${escapeHtml(e.message||String(e))}</div>`;
    }
  }

  $('#btnCreate').addEventListener('click', async ()=>{
    const name      = $('#add_name').value.trim();
    const username  = $('#add_username').value.trim();
    const password  = $('#add_password').value;
    const role      = $('#add_role').value;
    const category  = $('#add_cat').value;
    const active    = !!$('#add_active').checked;

    if (!name || !username){ showMsg('Name and username are required.','err'); return; }
    if (!password || password.length < 8){ showMsg('Password must be at least 8 characters.','err'); return; }
    if (!isGlobal && role.toUpperCase()==='ADMIN_GLOBAL'){ showMsg('Only Global Admin can assign ADMIN_GLOBAL.','err'); return; }

    const btn = $('#btnCreate'); btn.disabled=true; const orig=btn.textContent; btn.textContent='Creating…';
    try{
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ name, username, role, category, active, password })
      });
      $('#add_name').value=''; $('#add_username').value=''; $('#add_password').value='';
      $('#add_role').value='USER'; $('#add_cat').value='NONE'; $('#add_active').checked=true;
      showMsg('User created. First login requires password change.', 'ok');
      await loadUsers();
    }catch(e){
      showMsg(e.message||String(e),'err');
    }finally{
      btn.disabled=false; btn.textContent=orig;
    }
  });

  $('#btnRefreshUsers').onclick = loadUsers;
  loadUsers();
}

async function viewSettings(){
  setCrumbs("Settings");
  $("#view").innerHTML = `
    <div class="card">
      <h2>API & Token</h2>
      <div class="grid cols-3">
        <div>
          <label>API base</label>
          <input id="api" class="input" value="${state.api}" />
        </div>
        <div>
          <label>Token</label>
          <input id="tok" class="input" value="${state.token}" />
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end">
          <button id="save" class="btn">Save</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Change Password</h2>
      <div class="grid cols-3">
        <div><label>Current password</label><input id="pw_current" type="password" class="input" placeholder="Current password"/></div>
        <div><label>New password</label><input id="pw_new" type="password" class="input" placeholder="At least 8 characters"/></div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end"><button id="pw_save" class="btn">Change password</button></div>
      </div>
      <div class="muted" style="margin-top:6px">After changing, your password takes effect immediately.</div>
    </div>

    <div class="card" id="pushCard">
      <h2>Push Alerts</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button id="btnPush"     class="btn">Enable Push Alerts</button>
        <button id="btnUnpush"   class="btn ghost">Disable</button>
        <button id="btnTestPush" class="btn ghost">Send Test Push</button>
      </div>
      <div id="pushStatus" class="muted" style="margin-top:6px"></div>
      <div class="muted" style="margin-top:6px">
        Requires HTTPS and a supported browser.
      </div>
    </div>
  `;

  // --- Save API & token
  $("#save").onclick = () => {
    setApi(($("#api").value||"").trim());
    setToken(($("#tok").value||"").trim());
    showMsg("Saved.", "ok");
  };

  // --- Change password
  $("#pw_save").onclick = async () => {
    try{
      const current_password = ($("#pw_current").value||'');
      const new_password     = ($("#pw_new").value||'');
      if (!new_password || new_password.length < 8) return showMsg('New password must be at least 8 characters.', 'err');
      await api('/me/password', { method:'POST', body: JSON.stringify({ current_password, new_password }) });
      $("#pw_current").value=''; $("#pw_new").value='';
      showMsg('Password updated.', 'ok');
    }catch(e){ showMsg(e.message||String(e), "err"); }
  };

  // --- push helpers (local to this view)
  async function currentSubscription(){
    try{
      const reg = await ensureServiceWorker();
      return await reg.pushManager.getSubscription();
    }catch(_){ return null; }
  }

  async function updatePushUI(){
    const enableBtn  = $("#btnPush");
    const disableBtn = $("#btnUnpush");
    const sub = await currentSubscription();

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      if (enableBtn)  { enableBtn.textContent = "Push not supported"; enableBtn.disabled = true; }
      if (disableBtn) { disableBtn.disabled = true; }
      return;
    }

    if (sub) {
      if (enableBtn)  { enableBtn.textContent = "Push Enabled"; enableBtn.disabled = false; }
      if (disableBtn) { disableBtn.disabled = false; disableBtn.style.display = ""; }
    } else {
      if (enableBtn)  { enableBtn.textContent = "Enable Push Alerts"; enableBtn.disabled = false; }
      if (disableBtn) { disableBtn.disabled = false; disableBtn.style.display = ""; }
    }
  }

  async function enablePush(){
    try{
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { showMsg("Notifications blocked in the browser.", "err"); return; }
      const btn = $("#btnPush"); if (btn) { btn.disabled = true; btn.textContent = "Enabling…"; }
      await subscribePush();
      showMsg("Push enabled.", "ok");
    }catch(e){
      showMsg(e.message || String(e), "err");
    }finally{
      updatePushUI();
    }
  }

  async function disablePush(){
    try{
      const btn = $("#btnUnpush"); if (btn) { btn.disabled = true; btn.textContent = "Disabling…"; }
      const reg = await ensureServiceWorker();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        try{
          const apiBase = state.api || "";
          if (state.token) {
            await fetch(apiBase.replace(/\/+$/,"") + "/push/unsubscribe", {
              method: "POST",
              headers: {
                "Authorization": "Bearer " + state.token,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ endpoint })
            });
          }
        }catch(_){}
      }
      showMsg("Push disabled.", "ok");
    }catch(e){
      showMsg(e.message || String(e), "err");
    }finally{
      updatePushUI();
    }
  }

  // --- wire buttons (declare THEN use)
  const btnEnable   = $("#btnPush");
  const btnDisable  = $("#btnUnpush");
  const btnTestPush = $("#btnTestPush");

  if (btnEnable)  btnEnable.onclick  = enablePush;
  if (btnDisable) btnDisable.onclick = disablePush;

  if (btnTestPush) {
    btnTestPush.onclick = async () => {
      try {
        btnTestPush.disabled = true; const orig = btnTestPush.textContent;
        btnTestPush.textContent = "Sending…";
        await api('/push/test', { method: 'POST' });
        showMsg('Test push sent. Check your notification tray.', 'ok');
      } catch (e) {
        showMsg(e.message || String(e), 'err');
      } finally {
        btnTestPush.disabled = false; btnTestPush.textContent = "Send Test Push";
      }
    };
  }

  // set initial state
  updatePushUI();
}


/* -------- Router -------- */
async function route(){
  const hash = location.hash || "#login";
  if (!state.token && hash !== "#login") return navTo("#login");
  await ensureMe();
  renderNav();
  // Always remove/hide signature UI if some external page injected it
  try { ensureNoSignatureStyle(); } catch(_){}

  // Hard-block everything except login/settings while must_change_password is true
  try{
    const m = await api('/me/mcp');
    if (m && m.must_change_password && location.hash !== '#settings' && location.hash !== '#login') {
      navTo('#settings');
      setTimeout(()=> showMsg('Please set a new password to continue.', 'warn'), 50);
      return;
    }
  }catch(_){}

  switch(hash){
    case "#login": return viewLogin();
    case "#dashboard": return viewDashboard();
    case "#staff": return viewStaff();          // NEW
    case "#fridge": return viewFridge();
    case "#fire": return viewFire();
    case "#visitors": return viewVisitors();
    case "#issues": return viewIssues();
    case "#locations": return viewLocations();
    case "#qrcodes": return viewQRCodes();
    case "#settings": return viewSettings();
    default: return navTo("#dashboard");
  }
}

// Router events
window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
  try {
    const mb = $("#menuBtn");
    if (mb) mb.onclick = () => { const sb = $(".sidebar"); if (sb) sb.classList.toggle("open"); };
    const lb = $("#logoutBtn");
    if (lb) lb.onclick = () => { setToken(""); state.me=null; renderUserBadge(); renderNav(); navTo("#login"); };
    if (!location.hash) navTo("#login");
    ensureNoLinesStyle();
    ensureNoSignatureStyle();
    route();
  
        // Listen for NAV messages from the Service Worker (notification clicks)
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e && e.data && e.data.type === 'NAV' && e.data.url) {
          const u = String(e.data.url || '');
          // If URL has a hash, route within the SPA; otherwise do a full navigate
          if (u.includes('#')) {
            navTo(u.replace(/^.*#/, '#'));
          } else {
            location.href = u;
          }
        }
      });
    }


  } catch (e) {
    console.error("Boot error:", e);
    const v = document.getElementById("view");
    if (v) v.innerHTML = `<div class="alert err">Boot error: ${escapeHtml((e && e.message) || String(e))}</div>`;
  }
});

/* === Mobile header + sidebar helper (phones only) === */
(function mobileEnhancer(){
  var DOC = document.documentElement;

  function pick(sel){ return document.querySelector(sel); }
  function headerEl(){ return pick('header, .app-header, header#topbar, header.site-header, #topbar'); }
  function sidebarEl(){ return pick('.sidebar, #sidebar, nav.sidebar, [data-role="sidebar"], aside[role="complementary"], .drawer, .drawer-content, .side, .menu'); }

  // Inject CSS once
  if (!document.getElementById('ernos-mobile-css')) {
    var s = document.createElement('style');
    s.id = 'ernos-mobile-css';
    s.textContent = `
html.mobile-enhance { --header-h: 56px; }

/* FIX: Solid dark header, centered logo, readable text */
html.mobile-enhance header,
html.mobile-enhance .app-header,
html.mobile-enhance header#topbar,
html.mobile-enhance header.site-header,
html.mobile-enhance #topbar{
  position: fixed !important;
  top: env(safe-area-inset-top, 0) !important;
  left: 0 !important; right: 0 !important;
  z-index: 10000 !important;
  display:flex !important; align-items:center !important; justify-content:center !important;
  height: var(--header-h) !important; padding: 6px 12px !important;
  background-color: var(--bg, #0c1e3d) !important;
  color: #f0f4fb !important;
  border-bottom: 1px solid var(--border, #173060) !important;
  background-image: none !important;
}

html.mobile-enhance header a, 
html.mobile-enhance header .title, 
html.mobile-enhance header span, 
html.mobile-enhance header h1, 
html.mobile-enhance header h2, 
html.mobile-enhance header h3 {
  color: #f0f4fb !important;
}

html.mobile-enhance header .left, 
html.mobile-enhance .app-header .left, 
html.mobile-enhance #topbar .left{
  position:absolute !important; left:8px !important; inset-block:0 !important; display:flex !important; align-items:center !important;
}
html.mobile-enhance header .right, 
html.mobile-enhance .app-header .right, 
html.mobile-enhance #topbar .right{
  position:absolute !important; right:8px !important; inset-block:0 !important; display:flex !important; align-items:center !important;
}

/* Keep logo visible (center) */
html.mobile-enhance header .logo,
html.mobile-enhance header img[src*="logo"],
html.mobile-enhance .app-header img[src*="logo"]{
  max-height: calc(var(--header-h) - 14px) !important; width:auto !important; object-fit:contain !important;
}

/* IMPORTANT: push ONLY the app content, to avoid double spacing */
html.mobile-enhance #view{
  padding-top: calc(var(--header-h) + env(safe-area-inset-top, 0)) !important;
}
/* If your app uses another main container, include it here too */
html.mobile-enhance main.app-main,
html.mobile-enhance .app-main{
  padding-top: calc(var(--header-h) + env(safe-area-inset-top, 0)) !important;
}

/* Sidebar scroll with momentum; height accounts for header */
html.mobile-enhance .sidebar,
html.mobile-enhance #sidebar,
html.mobile-enhance nav.sidebar,
html.mobile-enhance [data-role="sidebar"],
html.mobile-enhance aside[role="complementary"],
html.mobile-enhance .drawer,
html.mobile-enhance .drawer-content,
html.mobile-enhance .side,
html.mobile-enhance .menu{
  max-height: calc(100dvh - (var(--header-h) + env(safe-area-inset-top,0))) !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch !important;
  overscroll-behavior: contain !important;
  padding-bottom: env(safe-area-inset-bottom, 0) !important;
  background: var(--panel, #fff);
}

/* Sticky logo row in sidebar */
html.mobile-enhance .sidebar-brand{
  position: sticky; top: 0; z-index: 2;
  background: var(--panel, #fff); border-bottom: 1px solid var(--border, #173060);
  padding: 10px; display:flex; justify-content:center;
}
html.mobile-enhance .sidebar-brand img{
  height: 40px; width:auto; max-width:80%; object-fit:contain;
}
`;
    document.head.appendChild(s);
  }

  function setHeaderH(){
    var h = 56, el = headerEl();
    if (el) {
      var r = el.getBoundingClientRect();
      if (r && r.height) h = Math.round(r.height);
    }
    document.documentElement.style.setProperty('--header-h', h + 'px');
  }

  function ensureSidebarBrand(){
    var sb = sidebarEl();
    if (!sb) return;
    var brand = sb.querySelector('.sidebar-brand');
    if (!brand) {
      brand = document.createElement('div');
      brand.className = 'sidebar-brand';
      var img = document.createElement('img');
      img.alt = 'Logo';
      img.className = 'logo';
      img.src = '/skin/icons/logo.png';
      img.onerror = function(){ this.src = '/icons/icon.svg'; };
      brand.appendChild(img);
      sb.insertBefore(brand, sb.firstChild);
    }
  }

  function apply(){
    var mobile = window.matchMedia && window.matchMedia('(max-width:768px)').matches;
    document.documentElement.classList.toggle('mobile-enhance', mobile);
    if (mobile) { setHeaderH(); ensureSidebarBrand(); }
  }

  // boot
  if (document.readyState !== 'loading') apply();
  else document.addEventListener('DOMContentLoaded', apply);

  window.addEventListener('resize', function(){ setHeaderH(); apply(); }, { passive:true });
  // catch async logo load
  setTimeout(function(){ setHeaderH(); }, 200);
  setTimeout(function(){ setHeaderH(); }, 600);
})();
 
