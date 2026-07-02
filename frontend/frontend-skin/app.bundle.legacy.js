
// 1) Unify theme color (some Android bars use the FIRST meta tag)
(() => {
  const desired = '#4E6E81';
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length === 0) {
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = desired;
    document.head.prepend(m);
  } else {
    metas.forEach((m, i) => { m.setAttribute('content', desired); if (i > 0) m.remove(); });
  }
})();

// 2) Make iOS status bar translucent so our color shows in the notch area
(() => {
  let m = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (!m) { m = document.createElement('meta'); m.name = 'apple-mobile-web-app-status-bar-style'; document.head.appendChild(m); }
  m.setAttribute('content', 'black-translucent');
})();

// 3) Inject ultra-specific mobile fixes (override old /skin/styles.css)
(() => {
  const css = `
    :root{ --header-h:56px !important; } /* phone header height */

    /* Remove any pushed-down content on phones */
    @media (max-width: 900px) {
      body, main, #app-main, .app-main, .page, #root, #container, #view {
        padding-top: 0 !important;
        margin-top: 0 !important;
      }
    }

    /* Force header color/position on phones */
    @media (max-width: 900px) {
      header.skin-header {
        position: sticky !important;
        top: 0 !important;
        z-index: 1200 !important;
        background: #4E6E81 !important;
        border-bottom: 1px solid #3E5967 !important;
        min-height: 56px !important;
        padding-top: calc(6px + env(safe-area-inset-top, 0px)) !important;
      }
      header.skin-header img {
        height: calc(var(--header-h) - 8px) !important;
      }
    } 
   
  `;
  const s = document.createElement('style');
  s.setAttribute('data-mobile-hotfix', '1');
  s.textContent = css;
  document.head.appendChild(s);
})();
// 3) Inject desktop + mobile overrides (wins over old /skin/styles.css)
(() => {
  const css = `
    /* Base header height var; will be updated by JS to real height */
    :root{ --header-h:56px !important; }

    /* DESKTOP: allow sidebar to scroll */
    @media (min-width: 900px){
      .sidebar{
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
      }
    }

    /* MOBILE: fixed header + proper content offset + scrollable sidebar */
    @media (max-width: 900px){
      header.skin-header{
        position: fixed !important;
        top: 0 !important; left: 0 !important; right: 0 !important;
        z-index: 1200 !important;
        background: #4E6E81 !important;
        border-bottom: 1px solid #3E5967 !important;
        /* keep your existing padding so the logo has room; safe-area added via content offset below */
      }
      header.skin-header img{
        height: calc(var(--header-h) - 8px) !important;
      }

      /* Make sure the content starts **below** the fixed header (incl. notch) */
     body, main, #app-main, .app-main, .page, #root, #container, #view{
  /* header height already includes the safe-area, so don't add it again */
  padding-top: var(--header-h, 56px) !important;
  margin-top: 0 !important;
}


      /* Mobile sidebar must scroll and respect header height */
      .sidebar{
        max-height: calc(100dvh - calc(var(--header-h, 56px) + env(safe-area-inset-top, 0px))) !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
        overscroll-behavior: contain !important;
        padding-bottom: env(safe-area-inset-bottom, 0) !important;
      }
    }
  `;
  const s = document.createElement('style');
  s.setAttribute('data-mobile-hotfix', '1');
  s.textContent = css;
  document.head.appendChild(s);
})();
// === FIX: Residents Out (now) table full width (no shrink) ===
(() => {
  const css = `
    /* Dashboard → Residents Out (now) table – use normal full-width layout */
    #resOutBody .table-wrap {
      display: block !important;
      width: 100% !important;
    }
    #resOutBody .table-wrap table {
      width: 100% !important;
    }
    /* Do NOT override td/th alignment here,
       so .t-num / .t-dt / .t-text from the global CSS still work */
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})()

// Dynamically measure the header and update --header-h so offsets are exact
function updateHeaderOffset(){
  try{
    const h = document.querySelector('header.skin-header');
    if(!h) return;
    // Measure actual height (logo size, fonts, safe-area can change it)
    const hh = Math.max(48, Math.round(h.getBoundingClientRect().height));
    document.documentElement.style.setProperty('--header-h', hh + 'px');
  }catch(_){}
}
window.addEventListener('resize', updateHeaderOffset);
window.addEventListener('orientationchange', updateHeaderOffset);
document.addEventListener('DOMContentLoaded', updateHeaderOffset);
window.addEventListener('load', updateHeaderOffset);
setTimeout(updateHeaderOffset, 50);   // catch late font/logo loads
// Re-scrub when navigating to #issues or on initial load at #issues
function maybeScrubIssues(){
  if ((location.hash || '').split('?')[0] === '#issues') {
    setTimeout(scrubIssuePhotoLinks, 0); // run after view renders
  }
}
window.addEventListener('hashchange', maybeScrubIssues);
document.addEventListener('DOMContentLoaded', maybeScrubIssues);
window.addEventListener('load', maybeScrubIssues);

  // ===== Utilities
  const $  = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
// --- Force one theme-color (phones use the first one) ---
(() => {
  const desired = '#4E6E81';
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m, i) => {
    m.setAttribute('content', desired);
    if (i > 0) m.remove();
  });
})();

// iOS PWA: ensure translucent status bar (no filler)
(() => {
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (!(isIOS && isStandalone)) return;

  let m = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (!m) {
    m = document.createElement('meta');
    m.name = 'apple-mobile-web-app-status-bar-style';
    document.head.appendChild(m);
  }
  m.setAttribute('content', 'black-translucent');
})();

  // Date/time + table helpers (once)
  (() => {
    if (window.__ERNOS_FMT_DEFINED__) return;
    window.__ERNOS_FMT_DEFINED__ = true;

    const pad2 = n => String(n).padStart(2, "0");
    const toD  = v => (v instanceof Date ? v : new Date(v));

    function fmtDT(v){                       // HH:mm dd/MM/yy
      const d = toD(v); if(!d || Number.isNaN(d.getTime())) return "";
      return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)}`;
    }
    function headLabel(c){ return String(c).replace(/_/g," ").toUpperCase() }
    function escapeHtml(v){ if(v==null) return ""; return String(v).replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s]) ) }
    function formatCell(col,val){
      if(val==null) return "";
      if (/_at$/.test(col)) return fmtDT(val);
      if (typeof val==="string" && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) return fmtDT(val);
      return val;
    }

    window.fmtDT = fmtDT;
    window.headLabel = headLabel;
    window.escapeHtml = escapeHtml;
    window.formatCell = formatCell;
  })();

  // Add "°C" nicely to fridge temps
  function formatTempC(v){
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v) + ' °C';
    const s = (n % 1 === 0) ? n.toFixed(0) : n.toFixed(1);
    return s + ' °C';
  }
// ===== Issues attachments helpers =====
async function fetchIssueAttachments(issueId){
  try {
    const j = await api(`/issues/${encodeURIComponent(issueId)}/attachments`);
    return j.items || [];
  } catch {
    return [];
  }
}

function photoCellHtml(atts){
  if (!atts || !atts.length) return '';
  const a = atts[0];
  const url = a.url || '';
  if (!url) return '';
  return `
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn small" data-viewbtn="${escapeHtml(url)}" type="button">View</button>
      <a class="btn ghost small" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open</a>
    </div>`;
}



  // API + auth state
const PUBLIC_API_FALLBACK=(window.ERNOS_PUBLIC_API_URL||"").replace(/\/+$/,'');
// --- Category normalizer (handles variations/typos) ---
function normCat(v){
  const s = String(v||'').trim().toUpperCase();
  // quick wins
  if (!s) return '';
  if (s.includes('NURS')) return 'NURSING';                      // NURSING, NURSING STAFF, NURSE, etc.
  if (s.includes('RECEP')) return 'RECEPTION';                   // RECEPTION, RECEPTIONIST
  if (s.includes('HOUSE')) return 'HOUSEKEEPING';                // HOUSEKEEPING, HK
  if (s.startsWith('MAINT') || s.includes('MAINT')) return 'MAINTENANCE'; // MAINTENANCE, MAINTANENCE, MAINTAINANCE
  if (s.includes('AUDIT')) return 'AUDITOR';                     // AUDITOR, AUDIT
  if (s.includes('MANAG')) return 'MANAGER';                     // MANAGER, MANAGEMENT
  return s;
}
function catIs(userCat, wanted){
  return normCat(userCat) === String(wanted||'').toUpperCase();
}
function anyCat(userCat, arr){
  const n = normCat(userCat);
  return arr.some(w => n === String(w).toUpperCase());
}

const state={
  api: localStorage.getItem('ernosApi')||PUBLIC_API_FALLBACK||location.origin,
  token: (sessionStorage.getItem('ernosToken') || localStorage.getItem('ernosToken') || ""),
  me: null
};
// === Push / Notifications helpers (Web Push + in-app fallback) ===
let PUSH_PUBLIC_KEY = '';
async function getVapidKey(){
  if (PUSH_PUBLIC_KEY) return PUSH_PUBLIC_KEY;
  const j = await api('/push/vapid').catch(()=>null);
  if (!j?.publicKey) throw new Error('Push not configured');
  PUSH_PUBLIC_KEY = j.publicKey;
  return PUSH_PUBLIC_KEY;
}

function urlB64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function registerSW(){
  const reg = await navigator.serviceWorker.register('/sw.js').catch(e => { throw e });
  return reg;
}

async function ensurePushSubscription(prefsOrTopics){
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push not supported on this device/browser');
  }

  const permission = (Notification.permission === 'granted')
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications permission was not granted');

  const reg = await window.registerSW();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = await getVapidKey();
sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlB64ToUint8Array(key)
});

  }

  // send with topics (wrapper) and fall back to raw sub if needed
  const topics = Array.isArray(prefsOrTopics)
    ? prefsOrTopics
    : (prefsOrTopics ? topicsFromPrefs(prefsOrTopics) : topicsFromPrefs(loadPushPrefs()));

  await sendSubscription(sub, topics);

  try { localStorage.setItem('ernosPush', '1'); } catch {}
  return sub;
}


function pushEnabled(){
  return ('serviceWorker' in navigator) && ('PushManager' in window) && (Notification.permission === 'granted');
}

// In-app visible notification (when app is open) using Service Worker if granted
function notifyIfAllowed(title, options={}){
  if (Notification.permission !== 'granted') return;
  try {
    navigator.serviceWorker.getRegistration().then(reg => reg?.showNotification(title, options));
  } catch(_) {}
}
// -- expose for DevTools testing --
window.ensurePushSubscription = ensurePushSubscription;
window.notifyIfAllowed        = notifyIfAllowed;

// Pretty-print current push state from DevTools
window.debugPush = async function(){
  const supported = ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);
  const reg  = await navigator.serviceWorker.getRegistration().catch(()=>null);
  const sub  = await reg?.pushManager.getSubscription();
  const prefs = (typeof loadPushPrefs === 'function') ? loadPushPrefs() : null;
  console.log({
    supported,
    permission: Notification.permission,
    hasServiceWorker: !!reg,
    subscribed: !!sub,
    endpoint: sub?.endpoint || null,
    topics: prefs ? Object.entries(prefs).filter(([k,v])=>v).map(([k])=>k) : []
  });
  if (Notification.permission === 'granted') {
    try { await reg?.showNotification('Local test', { body: 'SW showNotification works' }); } catch(e){ console.warn('SW notify failed:', e); }
  }
  return sub;
};


// Role-aware home route
function preferredHome(){
  const me = state.me || {};
  const r = String(me.role||'').toUpperCase();
  const c = String(me.category||'').toUpperCase();

  if (c === 'HOUSEKEEPING' && r !== 'ADMIN' && r !== 'ADMIN_GLOBAL') return '#hk';
  if (c === 'MAINTENANCE'  && r !== 'ADMIN' && r !== 'ADMIN_GLOBAL') return '#maint';
  return '#dashboard';
}



  function clearStoredTokenEverywhere(){
  try { sessionStorage.removeItem('ernosToken'); } catch {}
  try { localStorage.removeItem('ernosToken'); } catch {}
}

function armSessionTimeout(){
  try {
    if (window.__ernosLogoutTimer) {
      clearTimeout(window.__ernosLogoutTimer);
      window.__ernosLogoutTimer = null;
    }

    if (!state.token) {
      try { localStorage.removeItem('ernosLoginAt'); } catch {}
      return;
    }

    let loginAt = Number(localStorage.getItem('ernosLoginAt') || 0);
    if (!loginAt) {
      loginAt = Date.now();
      localStorage.setItem('ernosLoginAt', String(loginAt));
    }

    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    const expiresAt = loginAt + TWELVE_HOURS;
    const msLeft = Math.max(0, expiresAt - Date.now());

    window.__ernosLogoutTimer = setTimeout(() => {
      setToken('');
      state.me = null;
      try { localStorage.removeItem('ernosLoginAt'); } catch {}
      try { renderUserBadge(); } catch {}
      try { renderNav(); } catch {}
      if (location.hash !== '#login') {
        navTo('#login');
        showMsg('You have been logged out after 12 hours. Please sign in again.', 'warn');
      }
    }, msLeft);
  } catch (_) {}
}

function setToken(t){
  state.token = t || "";
  try {
    const remember = localStorage.getItem('ernosRemember') === '1';
    if (state.token) {
      if (remember) {
        localStorage.setItem('ernosToken', state.token);
        sessionStorage.removeItem('ernosToken');
      } else {
        sessionStorage.setItem('ernosToken', state.token);
        localStorage.removeItem('ernosToken');
      }

      if (!localStorage.getItem('ernosLoginAt')) {
        localStorage.setItem('ernosLoginAt', String(Date.now()));
      }
    } else {
      clearStoredTokenEverywhere();
      localStorage.removeItem('ernosLoginAt');
    }
  } catch {}

  armSessionTimeout();
}

  function setApi(a){ state.api=(a||"").replace(/\/+$/,'')||location.origin; try{ localStorage.setItem('ernosApi',state.api) }catch{} }


//* ====== IMAGE/ATTACHMENT HELPERS (HK/Maint upload) ====== */

// Read a File as a data: URL (fallback if no server upload endpoint)
async function readFileAsDataUrl(file){
  if (!file) return '';
  await new Promise((r) => setTimeout(r, 0)); // yield
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error || new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

// Post a comment to an issue, trying multiple API shapes
async function postIssueComment(issueId, text){
  const id = encodeURIComponent(String(issueId));
  const name = state?.me?.name || state?.me?.email || 'User';
  const when = new Date().toLocaleString();

  // Try modern endpoint: POST /issues/:id/comment { text }
  try{
    await api(`/issues/${id}/comment`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    return;
  }catch(_){}

  // Fallback: legacy PATCH /issues/:id maintenance_comment += "\n[date] name: text"
  try{
    // Fetch current issue to get current notes if your API supports GET /issues/:id
    let prev = '';
    try{
      const j = await api(`/issues/${id}`);
      prev = (j?.maintenance_comment || j?.item?.maintenance_comment || '');
    }catch(_){}

    const line = `[${when}] ${name}: ${text}`;
    const merged = prev ? (prev + '\n' + line) : line;

    await api(`/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ maintenance_comment: merged })
    });
    return;
  }catch(e){
    throw e;
  }
}

// Upload an image; prefer issue-scoped endpoint, then generic /uploads
// Returns a URL string (or '' if all server uploads fail)
async function uploadImage(file, issueId){
  const base = (state.api || location.origin).replace(/\/+$/,'');
  const headersAuth = state.token ? { 'Authorization': 'Bearer '+state.token } : {};
  const id = encodeURIComponent(String(issueId));

  // 1) Try: POST /issues/:id/attachments (file|attachment|photo)
  for (const field of ['file','attachment','photo']){
    try{
      const fd = new FormData();
      fd.append(field, file);
      const r = await fetch(`${base}/issues/${id}/attachments`, {
        method: 'POST',
        headers: headersAuth,
        body: fd
      });
      let j=null; try{ j = await r.json(); }catch(_){}
      if (r.ok && j){
        const u = j.url || j.path || j.location || j.file || '';
        if (u) return u;
      }
    }catch(_){}
  }

  // 2) Try: POST /uploads (file|attachment|photo)
  for (const field of ['file','attachment','photo']){
    try{
      const fd = new FormData();
      fd.append(field, file);
      const r = await fetch(`${base}/uploads`, {
        method: 'POST',
        headers: headersAuth,
        body: fd
      });
      let j=null; try{ j = await r.json(); }catch(_){}
      if (r.ok && j){
        const u = j.url || j.path || j.location || j.file || '';
        if (u){
          // optionally link it back to the issue via comment
          try{ await postIssueComment(issueId, `Photo: ${u}`); }catch(_){}
          return u;
        }
      }
    }catch(_){}
  }

  // 3) All server uploads failed — caller can decide to embed data: URL
  return '';
}
  // UI helpers
  function navTo(hash){ location.hash = hash }
  function setCrumbs(title) {
  const txt = title || 'Dashboard';

  // LEFT: section title
  const left = document.getElementById('crumbs');
  if (left) left.textContent = txt;

  // RIGHT: Name · Role(· Category) · Site — only if we actually have state.me
  try {
    const badge = document.getElementById('userBadge');
    const me = (typeof state === 'object' && state && state.me) ? state.me : null;

    if (badge && me) {
      // Helper to pretty-case labels, e.g. "ADMIN_GLOBAL" -> "Admin Global"
      const pretty = (v) => {
        const s = String(v || '').trim();
        if (!s) return '';
        return s
          .toLowerCase()
          .split(/[_\s]+/)
          .map(w => w ? w[0].toUpperCase() + w.slice(1) : '')
          .join(' ');
      };

      const name = me.name || me.email || '';
      const role = pretty(me.role);
      const cat  = pretty(me.category);
      const site = me.tenant_name || me.tenant_slug || '';

      // keep your pill/tag style
      const parts = [];
      if (name) parts.push(`<span class="tag">${escapeHtml(name)}</span>`);
      if (role || cat) {
        const rc = role && cat && role !== cat ? `${role} · ${cat}` : (role || cat);
        parts.push(`<span class="tag">${escapeHtml(rc)}</span>`);
      }
      if (site) parts.push(`<span class="tag">${escapeHtml(site)}</span>`);

      if (parts.length) badge.innerHTML = parts.join('');
    }
  } catch(_) {}

  // BODY data attr + tab title
  try { document.body.setAttribute('data-crumbs', txt); } catch(_){}
  try { document.title = `Ernos – ${txt}`; } catch(_){}
}


  // === NEW: query + safe helpers (REPORT) ==========================
function _qs() {
  const raw = (location.hash.split("?")[1] || "");
  return new URLSearchParams(raw);
}
function _qsGet(name, def=""){ const v = _qs().get(name); return v==null?def:v; }

// resolves token-> {location_id, location_name, location_type}
async function _resolveToken(token){
  try{
    return await api(`/tap/resolve?token=${encodeURIComponent(token)}`);
  }catch(_){ return { item:null }; }
}

// button UX sugar
function _busy(btn, on){
  if(!btn) return;
  btn.disabled = !!on;
  btn.dataset.originalText ??= btn.textContent;
  btn.textContent = on ? 'Saving…' : btn.dataset.originalText;
}

// toast-ish
function toast(t, ok = true){
  try { alert(t); } catch (_){}
  // (hook into your real toast if you have one)
}

// Cross-view flash helper (to show a message AFTER navTo)
let __flashMsg = null;
function queueFlash(text, cls = ""){
  __flashMsg = {
    text: String(text ?? ''),
    cls: cls || ''
  };
}

function consumeFlash(){
  if (!__flashMsg) return;
  const { text, cls } = __flashMsg;
  __flashMsg = null;
  showMsg(text, cls);
}

function showMsg(text, cls = "") {
  const el = document.createElement('div');
  el.className = 'alert ' + (cls || '');
  const inner = document.createElement('div');
  inner.textContent = String(text ?? '');
  el.appendChild(inner);
  $('#view').prepend(el);
  setTimeout(() => el.remove(), 3500);
}


   async function renderTable(wrap, items, cols, options = {}){
  const htmlCols = new Set((options.htmlCols || []).map(String));

  if(!items || !items.length){
    wrap.innerHTML = `<div class="empty">No data.</div>`;
    return;
  }

  const classFor = (c) => {
    if (/_at$/.test(c)) return 't-dt';
    if (/^(id|minutes_out|days_since|duration|min|qty|count|total)$/i.test(c)) return 't-num';
    if (c === 'temp_c') return 't-temp';
    return 't-text';
  };

 const renderVal = (c, o) => {
  let raw = o[c];

  // ---- Universal URL handling (prevents overflow in ALL columns) ----
  if (typeof raw === "string" && /https?:\/\//i.test(raw)) {
    const urlRx = /\bhttps?:\/\/[^\s)]+/gi;
    const urls = Array.from(raw.matchAll(urlRx)).map(m => m[0]);
    const photoUrls = urls.filter(u => /\.(png|jpe?g|webp|gif|bmp|heic|heif)(\?|#|$)/i.test(u));

    // Strip ALL URLs from the visible text
    raw = raw.replace(urlRx, "").replace(/\s{2,}/g, " ").trim();

    // If this looks like a text-ish column OR we found a photo URL,
    // show the cleaned text + tidy buttons for the first photo.
    if (/(text|note|description|comment|maintenance_comment|details|issue|message)/i.test(c) || photoUrls.length) {
      let html = `<span class="truncate" title="${escapeHtml(raw)}">${escapeHtml(raw)}</span>`;
      if (photoUrls.length) {
        if (typeof photoButtonsHTML === "function") {
          html += " " + photoButtonsHTML(photoUrls[0]);
        } else {
          const u = escapeHtml(photoUrls[0]);
          html += ` <a class="btn ghost small" href="${u}" target="_blank" rel="noopener">Open</a>`;
        }
      }
      return html;
    }
    // else: non-text columns – we already stripped URLs from raw; continue below
  }

  // Temperature pretty format
  if (c === 'temp_c') return formatTempC(raw);

  // Date-ish
  if (/_at$/.test(c)) return fmtDT(raw);
  if (typeof raw === "string" && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return fmtDT(raw);

  // Status badge
  if (String(c).toLowerCase() === 'status') {
    const s = String(raw || '').toUpperCase();
    return `<span class="badge status-badge" data-status="${escapeHtml(s)}">${escapeHtml(s||'—')}</span>`;
  }

  // Category chip
  if (String(c).toLowerCase() === 'category') {
    const cat = String(raw || '').toUpperCase();
    return `<span class="chip" data-cat="${escapeHtml(cat)}">${escapeHtml(cat||'—')}</span>`;
  }

  // Texty columns → truncated span (URLs already stripped above if any)
  if (/(text|note|description|comment|maintenance_comment|details|location_name|user_name|resident|accepted_by_name)/i.test(c)) {
    const s = String(raw ?? '');
    return `<span class="truncate" title="${escapeHtml(s)}">${escapeHtml(s)}</span>`;
  }

  // Default
  return escapeHtml(String(raw ?? ''));
};


  const th = cols.map(c => `<th class="${classFor(c)}">${headLabel(c)}</th>`).join('');
  const rowsHtml = items.map(o => `
  <tr>
    ${cols.map(c => {
      return `<td class="${classFor(c)}">${renderVal(c, o)}</td>`;
    }).join('')}
  </tr>
`).join('');

  wrap.innerHTML = `
    <div class="table-wrap pretty">
      <table class="table pretty">
        <thead><tr>${th}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

// === Scrub raw photo URLs in Maintenance Issues (mobile-friendly) ===
function scrubIssuePhotoLinks(){
  const root = document.querySelector('#view');
  if (!root) return;

  // Tag so CSS can scope to Issues only
  root.classList.add('issues-scrub');

  // 1) Remove any raw http(s)://... text nodes
  const urlRx = /\bhttps?:\/\/[^\s)]+/gi;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const v = n.nodeValue || '';
    if (urlRx.test(v)) {
      n.nodeValue = v.replace(urlRx, '').replace(/\s{2,}/g, ' ').trim();
    }
  });

  // 2) Hide <a> that are pure URLs or direct image links (buttons remain)
  root.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const txt  = (a.textContent || '').trim();
    const isImg = /\.(png|jpe?g|webp|gif|bmp|heic|heif)(\?|#|$)/i.test(href);
    const isRawUrlText = /^https?:\/\//i.test(txt);
    if (isImg || isRawUrlText) {
      a.style.display = 'none';
    }
  });
}


 
 
  // Manual checkout helper (uses data-name when present, falls back to API/DOM)
async function checkoutVisitor(id, preferName = '') {
  id = String(id);

  let vName = String(preferName || '').trim();

  async function resolveVisitorName(id) {
    const prefer = (v) => {
      if (!v) return '';
      const direct = v.primary_name || v.name || v.visitor_name;
      if (direct) return String(direct).trim();
      if (v.first_name || v.last_name) {
        return String(`${v.first_name || ''} ${v.last_name || ''}`).trim();
      }
      return '';
    };

    // 0) Cached map (if your visitors list set it)
    try {
      if (window.__visitorsById && window.__visitorsById[id]) {
        return String(window.__visitorsById[id]).trim();
      }
    } catch {}

    // 1) DOM row
    try {
      const sel = [
        `[data-visitor-id="${CSS.escape(id)}"]`,
        `tr[data-id="${CSS.escape(id)}"]`,
        `tr[data-visitor="${CSS.escape(id)}"]`
      ].join(',');
      const row = document.querySelector(sel);
      if (row) {
        const cell =
          row.querySelector('[data-col="primary_name"]') ||
          row.querySelector('.col-primary_name') ||
          row.querySelector('td:nth-child(2)');
        const t = cell?.textContent?.trim();
        if (t) return t;
      }
    } catch {}

    // 2) API: /visitors/:id
    try {
      const v = await api(`/visitors/${encodeURIComponent(id)}`);
      const n = prefer(v?.item || v);
      if (n) return n;
    } catch {}

    // 3) API: /visitors?id=...
    try {
      const q = await api(`/visitors?id=${encodeURIComponent(id)}`);
      const arr = q?.items || [];
      const v = arr.find(x => String(x.id) === id);
      const n = prefer(v);
      if (n) return n;
    } catch {}

    // 4) API: /visitors (last resort)
    try {
      const j = await api('/visitors');
      const arr = j?.items || [];
      const v = arr.find(x => String(x.id) === id);
      const n = prefer(v);
      if (n) return n;
    } catch {}

    return '';
  }

  if (!vName) {
    vName = await resolveVisitorName(id).catch(() => '');
  }

  const nowIso = new Date().toISOString();
  const attempts = [
    { path: `/visitors/${id}/checkout`, method: 'POST', body: null },
    { path: `/visitors/${id}`,          method: 'PATCH', body: { checkout_at: nowIso } },
    { path: `/visitors/checkout`,       method: 'POST',  body: { id } },
  ];

  let lastErr = null;
  for (const a of attempts) {
    try {
      const resp = await api(a.path, { method: a.method, body: a.body ? JSON.stringify(a.body) : undefined });

      // refine name from server response if available
      try {
        const payload = resp?.item || resp?.visitor || resp || null;
        const newName =
          (payload && (payload.primary_name || payload.name || payload.visitor_name)) ||
          (payload && payload.first_name ? `${payload.first_name} ${payload.last_name || ''}`.trim() : '');
        if (newName) vName = newName;
      } catch {}

      const msg = vName
        ? `Thank you for your visit, ${vName}. See you soon!`
        : 'Thank you for your visit. See you soon!';
      showMsg(msg, 'ok');
      return;
    } catch (e) {
      lastErr = e;
    }
  }

  throw (lastErr || new Error('Checkout failed'));
}



  // === Attachments (photos) helpers ===
  // --- Parse photo URLs from free text (issue text / maintenance_comment)
function findPhotoUrlsInStrings(...parts){
  const src = parts.filter(Boolean).join('\n');
  if (!src) return [];
  // find http(s) URLs and then filter to common image types
  const urls = Array.from(src.matchAll(/\bhttps?:\/\/[^\s)]+/gi)).map(m => m[0]);
  const exts = /\.(png|jpe?g|webp|gif|bmp|heic|heif)(\?|#|$)/i;
  return urls.filter(u => exts.test(u));
}

// --- Make a "View" (modal) + "Open" button for a single URL
function photoButtonsHTML(url){
  const u = escapeHtml(url||'');
  return `
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn small" data-viewbtn="${u}" type="button">View</button>
      <a class="btn ghost small" href="${u}" target="_blank" rel="noopener">Open</a>
    </div>`;
}

  function roleAllowsUpload(){
    const r = String(state.me?.role||'').toUpperCase();
    const c = String(state.me?.category||'').toUpperCase();
    return (
      r === 'ADMIN' || r === 'ADMIN_GLOBAL' ||
      c === 'MAINTENANCE' || c === 'HOUSEKEEPING' || c === 'NURSING' || c === 'AUDITOR'
    );
  }
// === Simple in-app photo viewer (modal) ===
(() => {
  let dlg;
  window.openPhotoViewer = function(url){
    if (!url) return;
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'ernosPhotoDlg';
      dlg.style.padding = '0';
      dlg.style.border = '0';
      dlg.style.background = 'transparent';
      dlg.innerHTML = `
        <div style="background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);padding:12px;max-width:92vw">
          <img id="ernosPhotoImg" alt="photo" style="max-width:90vw;max-height:82vh;border-radius:10px;display:block">
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
            <a id="ernosPhotoOpen" class="btn ghost small" href="#" target="_blank" rel="noopener">Open in new tab</a>
            <button id="ernosPhotoClose" class="btn small" type="button">Close</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);
      // close when clicking backdrop or button
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      dlg.querySelector('#ernosPhotoClose').addEventListener('click', () => dlg.close());
    }
    dlg.querySelector('#ernosPhotoImg').src = url;
    dlg.querySelector('#ernosPhotoOpen').href = url;
    if (!dlg.open) dlg.showModal();
  };

  // Global delegate: any element with [data-viewbtn] opens the viewer
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-viewbtn]');
    if (b) {
      e.preventDefault();
      const u = b.getAttribute('data-viewbtn');
      if (u) openPhotoViewer(u);
    }
  });
})();
// === BULLETPROOF checkout click (always gets the visitor's name) ===
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-checkout][data-id]');
  if (!btn) return;

  const id = String(btn.getAttribute('data-id') || '').trim();
  if (!id) return;

  // 🔥 Aggressively resolve the name BEFORE calling checkoutVisitor
  async function resolveNameNow() {
    // 1) data-name on the button
    let name = (btn.getAttribute('data-name') || '').trim();
    if (name) return name;

    // 2) From closest row data attrs
    try {
      const row = btn.closest('[data-visitor-id], [data-id], [data-visitor]');
      name =
        row?.dataset?.primaryName ||
        row?.dataset?.primary_name ||
        row?.dataset?.name ||
        row?.getAttribute?.('data-primary_name') ||
        row?.getAttribute?.('data-name') ||
        '';
      if (name) return name.trim();
    } catch {}

    // 3) From visible cells in the row (common: 2nd cell has name)
    try {
      const row =
        btn.closest('tr') ||
        btn.closest('[data-visitor-id], [data-id], [data-visitor]');
      const cell =
        row?.querySelector?.('[data-col="primary_name"]') ||
        row?.querySelector?.('.col-primary_name') ||
        row?.querySelector?.('[data-col="name"]') ||
        row?.querySelector?.('.col-name') ||
        (row?.cells && row.cells[1]); // often column #2 is the name

      name = (cell?.textContent || '').trim();
      if (name) return name;
    } catch {}

    // 4) Cached map from anywhere else
    try {
      if (window.__visitorsById && window.__visitorsById[id]) {
        return String(window.__visitorsById[id]).trim();
      }
    } catch {}

    // 5) API: /visitors/:id
    try {
      const v = await api(`/visitors/${encodeURIComponent(id)}`);
      const got =
        v?.item?.primary_name || v?.item?.name || v?.item?.visitor_name ||
        (v?.item?.first_name ? `${v.item.first_name} ${v.item.last_name||''}`.trim() : '');
      if (got) return got;
    } catch {}

    // 6) API: /visitors?id=...
    try {
      const q = await api(`/visitors?id=${encodeURIComponent(id)}`);
      const arr = q?.items || [];
      const v = arr.find(x => String(x.id) === id);
      const got =
        v?.primary_name || v?.name || v?.visitor_name ||
        (v?.first_name ? `${v.first_name} ${v.last_name||''}`.trim() : '');
      if (got) return got;
    } catch {}

    // 7) API: /visitors (worst-case)
    try {
      const q = await api('/visitors');
      const arr = q?.items || [];
      const v = arr.find(x => String(x.id) === id);
      const got =
        v?.primary_name || v?.name || v?.visitor_name ||
        (v?.first_name ? `${v.first_name} ${v.last_name||''}`.trim() : '');
      if (got) return got;
    } catch {}

    return '';
  }

  (async () => {
    try {
      btn.disabled = true;

      // Get the best name we can right now
      const name = await resolveNameNow();
      // Cache for future clicks
      try {
        window.__visitorsById = window.__visitorsById || {};
        if (name) window.__visitorsById[id] = name;
      } catch {}

      // Call your existing checkout (it will still try to refine the name)
      await checkoutVisitor(id, name);

      // Refresh current view after successful checkout
      const { path } = getHashQuery();
      if (path === '#visitors' && typeof viewVisitors === 'function') {
        await viewVisitors();
      } else {
        document.getElementById('refresh')?.click();
      }
    } catch (err) {
      showMsg(err.message || String(err), 'err');
    } finally {
      btn.disabled = false;
    }
  })();
});



  async function fetchAttachments(issueId){
    try{
      const j = await api(`/issues/${issueId}/attachments`);
      return j.items || [];
    }catch{ return []; }
  }

   async function uploadAttachment(issueId, file){
    const base = (state.api || location.origin).replace(/\/+$/,'');
    const headers = {};
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;

    const id = encodeURIComponent(String(issueId));

    // 1) Preferred: issue-specific upload.
    // This saves the file AND creates a DB row in issue_attachments,
    // so the Maintenance Issues table can show it later.
    try {
      const fd = new FormData();
      fd.append('file', file);

      const r = await fetch(`${base}/issues/${id}/attachments`, {
        method: 'POST',
        headers,
        body: fd
      });

      const text = await r.text();
      let j = null; try { j = text ? JSON.parse(text) : null; } catch {}

      if (r.ok && j) return j;

      throw new Error((j && (j.error || j.message)) || text || ('HTTP ' + r.status));
    } catch (firstErr) {
      // 2) Fallback: generic upload + add URL into issue note.
      // This still allows the table fallback parser to show View/Open buttons.
      const fd = new FormData();
      fd.append('file', file);

      const r = await fetch(`${base}/uploads`, {
        method: 'POST',
        headers,
        body: fd
      });

      const text = await r.text();
      let j = null; try { j = text ? JSON.parse(text) : null; } catch {}

      if (!r.ok) {
        throw new Error((j && (j.error || j.message)) || text || firstErr.message || ('HTTP ' + r.status));
      }

      const url = j?.url || j?.path || j?.location || j?.file || '';
      if (url) {
        try { await postIssueComment(issueId, `Photo: ${url}`); } catch(_){}
      }

      return j;
    }
  }

  function thumbnailsHTML(att){
  // No attachments → just return empty string; no "No photos." label
  if (!att || !att.length) return '';

  return `
    <div class="grid cols-3" style="margin-top:8px">
      ${att.map(a => {
        const url = escapeHtml(a.url || '');
        const name = escapeHtml(a.filename || 'photo');
        return `
          <div>
            <img
              src="${url}"
              alt="${name}"
              style="width:100%;height:auto;border-radius:10px;border:1px solid var(--border);cursor:pointer"
              data-viewbtn="${url}"
            >
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn small" type="button" data-viewbtn="${url}">View</button>
              <a class="btn ghost small" href="${url}" target="_blank" rel="noopener">Open</a>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

  function attachmentControlsHTML(issueId){
    // Two inputs: one opens camera (capture), one opens file picker
    return `
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        <input type="file" accept="image/*" capture="environment" style="display:none" id="cam_${issueId}">
        <input type="file" accept="image/*"                        style="display:none" id="pick_${issueId}">
        <button class="btn small" data-act="cam"  data-id="${issueId}">Use Camera</button>
        <button class="btn small" data-act="pick" data-id="${issueId}">Choose File</button>
      </div>`;
  }

  async function wireAttachmentControls(cardEl, issueId){
    // Load thumbs
    try{
      const att = await fetchAttachments(issueId);
      const wrap = cardEl.querySelector('.attThumbs');
      if (wrap) wrap.innerHTML = thumbnailsHTML(att);
    }catch{}

    // Wire buttons
    const btnCam  = cardEl.querySelector('[data-act="cam"]');
    const btnPick = cardEl.querySelector('[data-act="pick"]');
    const inCam   = cardEl.querySelector(`#cam_${issueId}`);
    const inPick  = cardEl.querySelector(`#pick_${issueId}`);

    if (btnCam && inCam)  btnCam.onclick  = ()=> inCam.click();
    if (btnPick && inPick) btnPick.onclick = ()=> inPick.click();

    async function onChosen(file, btn){
      if (!file) return;
      const orig = btn?.textContent;
      if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
      try{
        await uploadAttachment(issueId, file);
        showMsg('Photo uploaded.','ok');
        const att = await fetchAttachments(issueId);
        const wrap = cardEl.querySelector('.attThumbs');
        if (wrap) wrap.innerHTML = thumbnailsHTML(att);
      }catch(e){
        showMsg(e.message||String(e),'err');
      }finally{
        if (btn) { btn.disabled = false; btn.textContent = orig; }
      }
    }

    if (inCam)  inCam.onchange  = ()=> onChosen(inCam.files?.[0],  btnCam);
    if (inPick) inPick.onchange = ()=> onChosen(inPick.files?.[0], btnPick);
  }

      // Auth/me – keep state.me in sync and refresh badge + nav
  async function ensureMe(){
    // No token: treat as signed out
    if (!state.token) {
      state.me = null;
      try { renderUserBadge(); } catch(_) {}
      try { renderNav(); } catch(_) {}
      return;
    }

    try {
      // api('/me') attaches Authorization and handles 401
      const me = await api('/me');
      state.me = me;
    } catch (e) {
      // If /me fails (e.g. network error), consider user unknown
      state.me = null;
    }

    // Always refresh header + sidebar after /me
    try { renderUserBadge(); } catch(_) {}
    try { renderNav(); } catch(_) {}
  }

  // Small helper: normalise category from role/category text
  // IMPORTANT: looks at legacy fields too (staff_category, cat, staff_cat)
  function normCatFrom(me){
    const rawRole = String(me?.role || '').toUpperCase();

    // Prefer explicit staff/category fields; fall back to role
    const catSource =
      me?.category ||
      me?.staff_category ||
      me?.staff_cat ||
      me?.cat ||
      me?.staffCat ||
      rawRole;

    const rawCat = String(catSource || '').toUpperCase();

    if (rawCat.includes('NURS'))  return 'NURSING';
    if (rawCat.includes('RECEP')) return 'RECEPTION';
    if (rawCat.includes('HOUSE') || rawCat === 'HK') return 'HOUSEKEEPING';
    if (rawCat.includes('MAINT')) return 'MAINTENANCE';
    if (rawCat.includes('MANAG')) return 'MANAGER';
    if (rawCat.includes('AUDIT')) return 'AUDITOR';

    // Fallbacks
    if (rawRole.includes('ADMIN'))   return 'ADMIN';
    if (rawRole.includes('MANAG'))   return 'MANAGER';
    if (rawRole.includes('AUDIT'))   return 'AUDITOR';

    return rawCat || rawRole || 'USER';
  }

  // Nav + sidebar – FINAL role-aware menus
  function renderNav(){
    const nav = $('#nav'); if (!nav) return;

    const me   = state.me || {};
    const cat  = normCatFrom(me);                      // canonical category
    const role = String(me.role || '').toUpperCase();

    const isNursing   = (cat === 'NURSING');
    const isReception = (cat === 'RECEPTION');
    const isHK        = (cat === 'HOUSEKEEPING');
    const isMaint     = (cat === 'MAINTENANCE');

    const isAdmin   = (role === 'ADMIN' || role === 'ADMIN_GLOBAL');
    const isManager = (cat === 'MANAGER' || role === 'MANAGER');   // House manager
    const isAuditor = (cat === 'AUDITOR' || role === 'AUDITOR');
    const isAdminLike = isAdmin || isManager || isAuditor;

    let items;

    // 1) Maintenance staff → Maintenance Issues + Settings
    if (isMaint && !isAdminLike) {
      items = [
        ['#maint',    'Maintenance Issues'],
        ['#settings', 'Settings']
      ];
    }

    // 2) Housekeeping staff → Housekeeping + Maintenance Issues + Settings
    else if (isHK && !isAdminLike) {
      items = [
        ['#hk',       'Housekeeping'],
        ['#issues',   'Maintenance Issues'],
        ['#settings', 'Settings']
      ];
    }

    // 3) Reception staff → Visitors + Residents Out + Settings
    else if (isReception && !isAdminLike) {
      items = [
        ['#visitors', 'Visitors'],
        ['#resout',   'Residents Out'],
        ['#settings', 'Settings']
      ];
    }

    // 4) Nursing staff → full clinical + logs set
    else if (isNursing && !isAdminLike) {
      items = [
        ['#dashboard', 'Dashboard'],
        ['#visitors',  'Visitors'],
        ['#resout',    'Residents Out'],
        ['#nursing',   'Nursing Checks'],
        ['#issues',    'Maintenance Issues'],
        ['#env',       'Environmental Audit'],
        ['#fridge',    'Fridge Logs'],
        ['#fire',      'Fire Logs'],
        ['#ncalerts',  'Nursing Alerts'],
        ['#ffalerts',  'Alerts (Fridge & Fire)'],
        ['#settings',  'Settings']
      ];
    }

        // 5) Admin / House Manager / Auditor
    else if (isAdminLike) {
      // Base admin-like menu (NO QR codes yet)
      items = [
        ['#dashboard', 'Dashboard'],
        ['#visitors',  'Visitors'],
        ['#resout',    'Residents Out'],
        ['#nursing',   'Nursing Checks'],
        ['#hk',        'Housekeeping'],
        ['#issues',    'Maintenance Issues'],
        ['#env',       'Environmental Audit'],
        ['#fridge',    'Fridge Logs'],
        ['#fire',      'Fire Logs'],
        ['#ncalerts',  'Nursing Alerts'],
        ['#ffalerts',  'Alerts (Fridge & Fire)'],
        ['#locations', 'Locations'],
        ['#staff',     'Staff & Roles'],
        ['#settings',  'Settings']
      ];

      // ONLY real ADMIN gets QR Codes
      if (isAdmin) {
        // insert QR Codes before Staff & Roles
        items.splice(11, 0, ['#qrcodes', 'QR Codes']);
      }
      // House manager & Auditor: same as admin but WITHOUT QR codes
    }

    // 6) Fallback for any unknown category → simple staff menu
    else {
      items = [
        ['#dashboard', 'Dashboard'],
        ['#issues',    'Maintenance Issues'],
        ['#settings',  'Settings']
      ];
    }

    nav.innerHTML = items.map(([hash, label]) => {
      const active = (location.hash || '#dashboard').split('?')[0] === hash;
      return `<a href="${hash}" class="${active ? 'active' : ''}">${label}</a>`;
    }).join('');
  }

  // Preferred home per role/category
  function preferredHome(){
    const me   = state.me || {};
    const cat  = normCatFrom(me);
    const role = String(me.role || '').toUpperCase();

    const isNursing      = (cat === 'NURSING');
    const isHousekeeping = (cat === 'HOUSEKEEPING');
    const isReception    = (cat === 'RECEPTION');
    const isMaintenance  = (cat === 'MAINTENANCE');

    const isAdminLike =
      role === 'ADMIN' ||
      role === 'ADMIN_GLOBAL' ||
      role === 'MANAGER' ||
      cat  === 'MANAGER' ||
      role === 'AUDITOR' ||
      cat  === 'AUDITOR';

    // Admin / Manager / Auditor / Nursing → Dashboard
    if (isAdminLike || isNursing) return '#dashboard';
    if (isHousekeeping)           return '#hk';
    if (isReception)              return '#visitors';
    if (isMaintenance)            return '#maint';

    return '#dashboard';
  }

  window.preferredHome = preferredHome;


   const sidebar = $('#sidebar');
  const menuBtn = $('#menuBtn');
  function openSidebar(){ sidebar?.classList.add('open'); document.body.classList.add('nav-open') }
  function closeSidebar(){ sidebar?.classList.remove('open'); document.body.classList.remove('nav-open') }
  menuBtn?.addEventListener('click', ()=>{ sidebar?.classList.contains('open') ? closeSidebar() : openSidebar() });

  // KPI card helper
  function cardKpi(title, value, key){
  return `
    <button class="card" data-kpi="${encodeURIComponent(key||'')}" type="button" style="text-align:left; cursor:pointer">
      <div class="title">${escapeHtml(title)}</div>
      <div class="kpi-value">${escapeHtml(String(value))}</div>
    </button>`;
}


  // Hash router helpers
  function getHashQuery(){
    const raw = String(location.hash||'');
    const [path, qs] = raw.split('?');
    const params = {};
    if (qs){
      for (const part of qs.split('&')){
        const [k,v] = part.split('=');
        if (k) params[decodeURIComponent(k)] = v != null ? decodeURIComponent(v) : '';
      }
    }
    return { path, params };
  }

  // Alerts block
  function renderAlerts(wrap, a){
    wrap.innerHTML = '';
    if (!a) {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div class="title">Alerts</div><div class="empty">No alerts available.</div>`;
      wrap.appendChild(el);
      return;
    }
    const r=(state.me?.role||'').toUpperCase();
    const c=(state.me?.category||'').toUpperCase();
    const isAdmin=(r==='ADMIN'||r==='ADMIN_GLOBAL');
    const showFridge = isAdmin || c==='NURSING';
    const showFire   = isAdmin || c==='NURSING';

    const addTable = (title, items, cols, emptyText='No items') => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="title">${title}</div>`;
      if (!items || items.length === 0) {
        card.innerHTML += `<div class="empty">${emptyText}</div>`;
      } else {
        const th = cols.map(c=>`<th>${escapeHtml(headLabel(c))}</th>`).join('');
        const rows = items.map(o =>
          `<tr>${cols.map(c=>{
            let v = o[c];
            if (c==='last_at' || /_at$/.test(c)) v = v ? fmtDT(v) : 'Never';
            if (c==='days_since' && (v===null||v===undefined||v===Infinity)) v = '—';
            if (c==='last_temp_c' && v!=null) v = String(v);
            return `<td>${escapeHtml(String(v ?? ''))}</td>`;
          }).join('')}</tr>`
        ).join('');
        card.innerHTML += `<div class="table-wrap"><table class="table nolines"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      wrap.appendChild(card);
    };

    if (showFridge) {
      addTable('Fridge Due', a.fridge_due||[], ['location_name','last_at'], 'All fridges up to date');
      addTable('Fridge Out of Range', a.fridge_out_of_range||[], ['location_name','last_at','last_temp_c'], 'No temperature breaches');
    }
    if (showFire) {
      addTable('Fire Due', a.fire_due||[], ['location_name','kind','days_since'], 'All fire checks up to date');
      const drill = a.fire_drill_due || { last_at: null, days_since: null, overdue: true };
      const drillCard = document.createElement('div');
      drillCard.className = 'card';
      drillCard.innerHTML = `
        <div class="title">Fire Drill</div>
        <div class="kv" style="margin-top:6px">
          <div class="muted">Last Drill</div><div>${drill.last_at ? fmtDT(drill.last_at) : 'Never'}</div>
          <div class="muted">Days Since</div><div>${drill.days_since ?? '—'}</div>
          <div class="muted">Overdue</div><div><span class="badge">${drill.overdue ? 'Yes' : 'No'}</span></div>
        </div>`;
      wrap.appendChild(drillCard);
    }
  }

  
 /* -------- Views -------- */
function viewLogin(){
  setCrumbs('Sign in');
  $('#view').innerHTML = `
    <form id="loginForm" class="card" onsubmit="return false;">
      <h2>Sign in</h2>
      <div class="grid cols-2" style="margin-top:10px">
        <div>
          <label>Username</label>
          <input id="email" class="input" placeholder="e.g. mary.jane" />
        </div>
        <div>
          <label>Password</label>
          <div style="display:flex; gap:8px; align-items:center">
            <input id="password" type="password" class="input" placeholder="Password123" style="flex:1" />
            <button id="togglePw" class="btn ghost small" type="button" aria-pressed="false">Show</button>
          </div>
          <label style="display:flex; align-items:center; gap:6px; margin-top:8px">
            <input type="checkbox" id="remember" checked />
            Keep me signed in
          </label>
          <div class="muted" style="margin-top:6px">
            <a href="#" id="forgotLink">Forgot password?</a>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:12px; justify-content:flex-end">
        <button id="loginBtn" class="btn" type="submit">Sign in</button>
      </div>
    </form>`;

  // -- Remove any signature UI that older templates might inject
  (function removeVisitorSignatureUI(){
    const killers = [
      '#sigBlock',
      'canvas#sigPad',
      '.signature',
      '[data-role="signature"]',
      '[data-sig]',
      '[id*="sigPad"]',
      '[id*="signature"]'
    ];
    killers.forEach(sel => $$(sel).forEach(el => el.remove()));
  })();

  // ------- Login logic -------
  const form       = $('#loginForm');
  const emailIn    = $('#email');      // (kept as id="email" for compatibility)
  const pwIn       = $('#password');
  const btn        = $('#loginBtn');
  const togglePw   = $('#togglePw');
  const forgot     = $('#forgotLink');
  const rememberCb = $('#remember');

  // ✅ Initialize checkbox from stored preference
  // Default stays checked if nothing is stored (matches your current UI)
  try{
    const saved = localStorage.getItem('ernosRemember'); // '1' | '0' | null
    rememberCb.checked = (saved == null) ? true : (saved === '1');
  }catch(_){
    try { rememberCb.checked = true; } catch(_){}
  }

  // ✅ Persist remember preference (this is what setToken() uses)
  function persistRememberPref(){
    try{
      const v = (rememberCb && rememberCb.checked) ? '1' : '0';
      localStorage.setItem('ernosRemember', v);

      // If remember is turned OFF and a local token exists, move it to session
      if (v === '0') {
        const tok = localStorage.getItem('ernosToken');
        if (tok) {
          sessionStorage.setItem('ernosToken', tok);
          localStorage.removeItem('ernosToken');
        }
      }
    }catch(_){}
  }
  rememberCb?.addEventListener('change', persistRememberPref);

  // Show / hide password
  togglePw?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    const isText = pwIn.type === 'text';
    pwIn.type = isText ? 'password' : 'text';
    togglePw.textContent = isText ? 'Show' : 'Hide';
    togglePw.setAttribute('aria-pressed', String(!isText));
  });

  // Forgot password → send reset request (admin-managed)
  forgot?.addEventListener('click', async (ev)=>{
    ev.preventDefault();

    let ident = (emailIn?.value || '').trim();
    if (!ident) {
      ident = (prompt('Enter your username or email to reset your password:', '') || '').trim();
    }
    if (!ident) {
      showMsg('Enter your username or email to reset your password.', 'err');
      return;
    }

    try {
      await api('/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ident }) // backend can treat this as username/email
      });
      showMsg('If that account exists, your manager can reset your password.', 'ok');
    } catch (e) {
      showMsg(e?.message || String(e), 'err');
    }
  });

  // Submit on button / Enter
  form?.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    doLogin();
  });
  [emailIn, pwIn].forEach(inp=>{
    inp?.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter') {
        ev.preventDefault();
        doLogin();
      }
    });
  });

    async function doLogin(){
  const ident    = (emailIn?.value || '').trim();     // username OR email
  const password = (pwIn?.value || '').trim();

  if (!ident || !password){
    showMsg('Username and password required.', 'err');
    return;
  }

  // save remember-me BEFORE token write
  persistRememberPref();

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try{
    const j = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: ident, email: ident, password })
    });

    if (!j || !j.token) {
      throw new Error('Login failed');
    }

    // 1️⃣ set token FIRST
    setToken(j.token);

    // 2️⃣ HARD SYNC USER FROM BACKEND
    await ensureMe();

    // 3️⃣ restore redirect
    let ret = null;
    try {
      ret = localStorage.getItem('ernos_return_to');
      if (ret) localStorage.removeItem('ernos_return_to');
    } catch(_){}

    // 4️⃣ NOW render UI
    renderNav();
    try { renderUserBadge(); } catch(_){}

    // 5️⃣ navigate LAST
    if (ret) {
      location.href = ret;
    } else {
      navTo(preferredHome());
    }
  }catch(e){
    showMsg(e?.message || String(e), 'err');
  }finally{
    btn.disabled = false;
    btn.textContent = orig;
  }
}


}


 /* DROP-IN: replaces your entire viewDashboard() */
async function viewDashboard(){
  setCrumbs('Dashboard');

  // Dashboard layout: KPIs + Visitors-on-site; no alerts, no recent checks, no env-audit.
  $('#view').innerHTML = `
    <div class="dash-gap" aria-hidden="true" style="height:12px"></div>
    <div class="grid cols-3" id="kpis" style="margin-bottom:12px"></div>
    <div id="visitorsOnSiteCard"></div>
  `;

  const kpis = $('#kpis');

  // --------- Load data, but FAIL SOFTLY (no UI JSON error) ----------
  let vj = { items: [] };   // visitors
  let ij = { items: [] };   // issues

  try {
    vj = await api('/visitors');
  } catch (e) {
    console.warn('[dashboard] /visitors failed', e);
  }

  try {
    ij = await api('/issues');
  } catch (e) {
    console.warn('[dashboard] /issues failed', e);
  }

  // KPI numbers
  const onSite = (vj.items || []).filter(x => !x.checkout_at).length;
  const openIssues = (ij.items || []).filter(x => {
    const status = String(x.status || '').toUpperCase();
    const cat = (typeof normCat === 'function')
      ? normCat(x.category || '')
      : String(x.category || '').toUpperCase();

    return status !== 'RESOLVED';
  }).length;

    // Fire & fridge alerts (existing)
  let fridge_due = 0, fridge_oor = 0, fire_due = 0, drill_overdue = false;
  try {
    const a = await api('/ff/alerts');
    fridge_due     = (a.fridge_due && a.fridge_due.overdue || []).length;
    fridge_oor     = (a.fridge_oor && a.fridge_oor.over || []).length;
    fire_due       = (a.fire_checks_due && a.fire_checks_due.overdue || []).length;
    drill_overdue  = !!(a.fire_drill_due && a.fire_drill_due.overdue);
  } catch (e) {
    console.warn('[dashboard] /ff/alerts failed', e);
  }

  // Nursing alerts (overdue rooms)
  let nursing_overdue = 0;
  try {
    const nc = await api('/nc/alerts');
    nursing_overdue = (nc.overdue || []).length;
  } catch (e) {
    console.warn('[dashboard] /nc/alerts failed', e);
  }

  const role = String(state.me?.role || '').toUpperCase();
  const isAdmin = (role === 'ADMIN' || role === 'ADMIN_GLOBAL');

  // KPIs (clicks go to their dedicated sections)
  kpis.innerHTML = [
    cardKpi('Visitors On Site',       onSite,          'visitors-onsite'),
    cardKpi('Open Issues',            openIssues,      'issues-open'),
    cardKpi('Nursing Checks Overdue', nursing_overdue, 'nursing-overdue'),
    cardKpi('Fridges Overdue',        fridge_due,      'fridge-due'),
    cardKpi('Fridges Out of Range',   fridge_oor,      'fridge-oor'),
    isAdmin ? cardKpi('Fire Checks Overdue', fire_due, 'fire-due') : '',
    isAdmin ? cardKpi('Fire Drill Overdue',  drill_overdue ? 'Yes' : 'No', 'fire-drill') : ''
  ].filter(Boolean).join('');

  // KPI click-throughs -> open the separate pages (sidebar sections handle full lists)
  $('#kpis').querySelectorAll('[data-kpi]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.getAttribute('data-kpi');
      switch (key) {
        case 'visitors-onsite': navTo('#visitors?onsite=1'); break;
        case 'issues-open':     navTo('#issues'); break;
        case 'nursing-overdue': navTo('#ncalerts'); break;
        case 'fridge-due':
        case 'fridge-oor':
        case 'fire-due':
        case 'fire-drill':
          navTo('#ffalerts?tab=' + encodeURIComponent(key)); break;
      }
    });
  });


  // --------- Visitors (on site) card ----------
  (function renderVisitorsOnSite(){
    const wrap  = $('#visitorsOnSiteCard');
    const items = (vj.items || []).filter(x => !x.checkout_at);

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="title">Visitors (on site)</div><div id="vosBody"></div>`;
    wrap.appendChild(card);

    const body = card.querySelector('#vosBody');
    if (!items.length){
      body.innerHTML = `<div class="empty">No visitors currently on site.</div>`;
      return;
    }

    const rows = items.map(x => `
      <tr data-visitor-id="${escapeHtml(String(x.id))}"
          data-primary_name="${escapeHtml(String(x.primary_name || ''))}">
        <td class="t-num">${escapeHtml(String(x.id))}</td>
        <td>${escapeHtml(x.primary_name || '')}</td>
        <td>${escapeHtml(x.resident || '')}</td>
        <td class="t-dt">${escapeHtml(fmtDT(x.checkin_at))}</td>
      </tr>
    `).join('');

    body.innerHTML = `
      <div class="table-wrap">
        <table class="table nolines">
          <thead>
            <tr>
              <th class="t-num">${headLabel('id')}</th>
              <th>${headLabel('primary_name')}</th>
              <th>${headLabel('resident')}</th>
              <th class="t-dt">${headLabel('checkin_at')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn ghost small" href="#visitors?onsite=1">Open Visitors page</a>
      </div>
    `;
    try { enableSortableTable(body.querySelector('table')); } catch(_){}
  })();

    // Residents Out (now)
  (function(){
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="title">Residents Out (now)</div><div id="resOutBody"></div>`;
    $('#view').appendChild(card);

    async function load(){
      try{
        if (!state.token) {
          const body = card.querySelector('#resOutBody');
          if (body) body.innerHTML = `<div class="empty">Please log in.</div>`;
          return;
        }
        const r = await api('/residents/outside');
        const items = r.items || [];
        const body = card.querySelector('#resOutBody');
        if (!items.length){
          body.innerHTML = `<div class="empty">No residents currently out.</div>`;
          return;
        }
        body.innerHTML = `
          <div class="table-wrap">
            <table class="table nolines">
              <thead>
                <tr>
                  <th class="t-text">${headLabel('resident')}</th>
                  <th class="t-text">${headLabel('escort')}</th>
                  <th class="t-dt">${headLabel('out_at')}</th>
                  <th class="t-num">${headLabel('minutes_out')}</th>
                </tr>
              </thead>
              <tbody>${
                items.map(x=>`
                  <tr>
                    <td class="t-text">${escapeHtml(x.resident||'')}</td>
                    <td class="t-text">${escapeHtml(x.escort||'')}</td>
                    <td class="t-dt">${fmtDT(x.out_at)}</td>
                    <td class="t-num">${escapeHtml(x.minutes_out ?? '')}</td>
                  </tr>`).join('')
              }</tbody>
            </table>
          </div>`;
      }catch(e){
        console.warn('[dashboard] residents-out card failed', e);
        const body = card.querySelector('#resOutBody');
        if (body){
          body.innerHTML = `<div class="empty">Residents out data not available.</div>`;
        }
      }
    }
    load();

    // live updates
    try {
      if (!state.token) return;
      const esUrl = new URL('/events', (state.api || location.origin).replace(/\/+$/,''));
      if (esUrl.origin === location.origin) {
        esUrl.searchParams.set('token', state.token);
        const es = (window.__ernosES ||= new EventSource(esUrl.toString(), { withCredentials: true }));
        es.addEventListener('residents', load);
      }
    } catch {}
  })();


    // --------- Report maintenance issue ----------
  (function(){
    const role = String(state.me?.role || '').toUpperCase();
    const cat  = normCatFrom(state.me || {});
    const allowed = (
      role === 'ADMIN' || role === 'ADMIN_GLOBAL' ||
      ['NURSING','HOUSEKEEPING','MAINTENANCE','AUDITOR','MANAGER'].includes(cat)
    );
    if (!allowed) return;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">Report maintenance issue</div>
      <textarea id="dashIssue" class="input" placeholder="Describe the problem…"></textarea>

      <div style="margin-top:8px">
        <label class="muted">Attach photo (optional)</label>

        <input id="dashPhotoCam"  type="file" accept="image/*" capture="environment" style="display:none">
        <input id="dashPhotoFile" type="file" accept="image/*"                        style="display:none">

        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
          <button class="btn small" type="button" id="dashBtnCam">Use Camera</button>
          <button class="btn small ghost" type="button" id="dashBtnFile">Choose File</button>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button id="dashSend" class="btn">Send</button>
      </div>
    `;
    $('#view').appendChild(card);

    card.querySelector('#dashBtnCam')?.addEventListener('click', ()=> card.querySelector('#dashPhotoCam')?.click());
    card.querySelector('#dashBtnFile')?.addEventListener('click', ()=> card.querySelector('#dashPhotoFile')?.click());

    card.querySelector('#dashSend')?.addEventListener('click', async ()=>{
      const txt   = (card.querySelector('#dashIssue')?.value || '').trim();
      const fCam  = card.querySelector('#dashPhotoCam')?.files?.[0]  || null;
      const fFile = card.querySelector('#dashPhotoFile')?.files?.[0] || null;
      const file  = fCam || fFile;

      if (!txt) { showMsg('Please write the issue first.','err'); return; }

      const base = (state.api || location.origin).replace(/\/+$/,'');
      const headersAuth = state.token ? { 'Authorization':'Bearer '+state.token } : {};
      let photoUrl = '';

      try{
        if (file) {
          const fd = new FormData();
          fd.append('file', file);
          const r = await fetch(base + '/uploads', { method:'POST', headers: headersAuth, body: fd });
          const j = await r.json().catch(()=> ({}));
          if (!r.ok) throw new Error((j && (j.error||j.message)) || ('HTTP '+r.status));
          photoUrl = j.url || j.path || '';
        }

        const text = photoUrl ? (txt + '\nPhoto: ' + photoUrl) : txt;
        await api('/issues', { method:'POST', body: JSON.stringify({ text, category: 'MAINTENANCE' }) });

        card.querySelector('#dashIssue').value = '';
        try { card.querySelector('#dashPhotoCam').value  = ''; } catch(_){}
        try { card.querySelector('#dashPhotoFile').value = ''; } catch(_){}
        showMsg('Issue sent.','ok');
      }catch(e){
        showMsg(e.message || String(e),'err');
      }
    });
  })();

}

  async function viewFridge(){
    setCrumbs('Fridge Logs');
    $('#view').innerHTML = `<div class="card"><h2>Fridge Logs</h2><div id="tableWrap"></div></div>`;
    try{
      const [logs, locs] = await Promise.all([
        api('/ff/fridge/logs'),
        api('/locations').catch(()=>({ items: [] }))
      ]);
      const locMap = Object.fromEntries((locs.items||[]).map(x => [String(x.id), x.name]));
      const items = (logs.items||[]).map(x => ({
        ...x,
        location_name: x.location_name || x.location || locMap[String(x.location_id)] || `(Location #${x.location_id||''})`
      }));
      renderTable($('#tableWrap'), items, ['id','location_name','taken_at','temp_c','staff_role']);
    }catch(e){
      showMsg(e.message||String(e),'err');
    }
  }

  async function viewFire(){
    setCrumbs('Fire Logs');
    $('#view').innerHTML = `<div class="card"><h2>Fire Logs</h2><div id="tableWrap"></div></div>`;
    try{
      const [logs, locs] = await Promise.all([
        api('/ff/fire/logs'),
        api('/locations').catch(()=>({ items: [] }))
      ]);
      const locMap = Object.fromEntries((locs.items||[]).map(x => [String(x.id), x.name]));
      const items = (logs.items||[]).map(x => ({
        ...x,
        location_name: x.location_name || locMap[String(x.location_id)] || ''
      }));
      renderTable($('#tableWrap'), items, ['id','location_name','check_at','kind','staff_role','note']);
    }catch(e){
      showMsg(e.message||String(e),'err');
    }
  }
// --- On initial load, if hash is #visitors, show visitors page ---
(function () {
  try {
    var h = (window.location.hash || '').toLowerCase();
    if (h === '#visitors' || h.indexOf('#visitors?') === 0) {
      if (typeof window.viewVisitors === 'function') {
        window.viewVisitors();
      }
    }
  } catch (_) {}
})();

// --- Basic router hook: show Visitors page when hash is #visitors ---
(function () {
  function handleHashRoute() {
    try {
      var h = (window.location.hash || '').toLowerCase();
      if (h === '#visitors' || h.indexOf('#visitors?') === 0) {
        if (typeof window.viewVisitors === 'function') {
          window.viewVisitors();
        }
      }
    } catch (_) {}
  }

  // Expose the function globally in case router wants to reuse it
  window.handleVisitorsHashRoute = handleHashRoute;

  // Run once on load
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    handleHashRoute();
  } else {
    document.addEventListener('DOMContentLoaded', handleHashRoute);
  }

  // Also react if hash changes later
  window.addEventListener('hashchange', handleHashRoute);
})();

async function viewVisitors(){
  const state = window.state || {};
  const me    = state.me || {};

  setCrumbs('Visitors');

  // Skeleton card: title + toolbar row + table container + manual row
  $('#view').innerHTML = `
    <div class="card">
      <h2>Visitors</h2>

      <div class="row vis-toolbar" style="
        margin-bottom:10px;
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        align-items:flex-end;
      ">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
          <!-- From / To filters -->
          <input type="date" id="visFrom" class="input" style="
            display:inline-block;
            width:auto;
            min-width:120px;
            padding:6px;
            border-radius:8px;
            border:1px solid var(--border,#d6dee5);
          ">
          <input type="date" id="visTo" class="input" style="
            display:inline-block;
            width:auto;
            min-width:120px;
            padding:6px;
            border-radius:8px;
            border:1px solid var(--border,#d6dee5);
          ">

          <!-- Buttons directly next to the boxes -->
          <div style="display:flex;gap:8px;">
            <button id="btnVisitorsCsv" class="btn small">CSV</button>
            <button id="visRefresh" class="btn refresh small">Refresh</button>
          </div>
        </div>
      </div>

      <div id="visManualRow"
           class="row"
           style="margin:10px 0;display:none;flex-wrap:wrap;gap:8px;align-items:flex-end;">
        <div class="field" style="min-width:160px;flex:1 1 160px;">
          <label>Visitor name</label>
          <input id="visManualName"
                 class="input"
                 type="text"
                 placeholder="Visitor name">
        </div>
        <div class="field" style="min-width:160px;flex:1 1 160px;">
          <label>Resident (optional)</label>
          <input id="visManualResident"
                 class="input"
                 type="text"
                 placeholder="Resident">
        </div>
        <button id="visManualAdd"
                class="btn small"
                style="margin-top:22px;">
          Add visitor
        </button>
      </div>

      <div id="tableWrap"></div>
    </div>
  `;

  // --- Role / category logic: who sees manual row (Reception + Admin-like only) ---
  (function setupManualRow(){
    try{
      const manualRowEl = document.getElementById('visManualRow');
      const nameEl      = document.getElementById('visManualName');
      const resEl       = document.getElementById('visManualResident');
      const addBtn      = document.getElementById('visManualAdd');

      const role = String(me.role || '').toUpperCase();
      const cat  = (typeof normCatFrom === 'function')
        ? normCatFrom(me)
        : String(
            me.category ||
            me.staff_category ||
            me.staff_cat ||
            me.cat ||
            ''
          ).toUpperCase();

      const isReception = (cat === 'RECEPTION');
      const isAdminLike =
        role === 'ADMIN' ||
        role === 'ADMIN_GLOBAL' ||
        role === 'MANAGER' ||
        cat  === 'MANAGER' ||
        role === 'AUDITOR' ||
        cat  === 'AUDITOR';

      if (!(isReception || isAdminLike) || !manualRowEl || !addBtn || !nameEl || !resEl) {
        if (manualRowEl) manualRowEl.style.display = 'none';
        return;
      }

      manualRowEl.style.display = 'flex';

      addBtn.addEventListener('click', async () => {
        const primary_name = nameEl.value.trim();
        const resident     = resEl.value.trim();

        if (!primary_name) {
          showMsg('Enter visitor name', 'warn');
          try { nameEl.focus(); } catch(_){}
          return;
        }

        addBtn.disabled = true;
        const origText  = addBtn.textContent;
        addBtn.textContent = 'Saving…';

        try {
          await api('/visitors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ primary_name, resident })
          });
          showMsg('Visitor added.', 'ok');
          nameEl.value = '';
          resEl.value  = '';
          await load();
        } catch (err) {
          showMsg(err?.message || String(err), 'err');
        } finally {
          addBtn.disabled  = false;
          addBtn.textContent = origText;
        }
      });
    } catch(e){
      console.error('visitors manual row setup failed', e);
    }
  })();

  let lastItems = [];

  // --- Loader using backend /visitors?from=&to= ---
  async function load(){
    const wrap = document.getElementById('tableWrap');
    if (!wrap) return;

    wrap.innerHTML = '<div class="empty">Loading…</div>';

    try{
      const fromVal = (document.getElementById('visFrom')?.value || '').trim();
      const toVal   = (document.getElementById('visTo')?.value   || '').trim();

      const qs = new URLSearchParams();
      if (fromVal) qs.set('from', fromVal);
      if (toVal)   qs.set('to',   toVal);

      const url = '/visitors' + (qs.toString() ? ('?' + qs.toString()) : '');
      const j   = await api(url);

      let items;
      if (Array.isArray(j)) {
        items = j;
      } else if (j && Array.isArray(j.items)) {
        items = j.items;
      } else {
        items = [];
      }

      lastItems = items;

      if (!items.length){
        wrap.innerHTML = '<div class="empty">No visitors for this range.</div>';
        return;
      }

      const rows = items.map(x => {
        const checkIn  = x.checkin_at;
        const checkOut = x.checkout_at;

        let dur = '';
        try{
          if (checkIn){
            const t1 = new Date(checkIn).getTime();
            const t2 = checkOut ? new Date(checkOut).getTime() : Date.now();
            if (Number.isFinite(t1) && Number.isFinite(t2) && t2 >= t1){
              dur = Math.round((t2 - t1) / 60000); // minutes
            }
          }
        }catch(_){}

        const inStr  = checkIn  ? fmtDT(checkIn)  : '';
        const outStr = checkOut ? fmtDT(checkOut) : '';

        const actionHtml = !checkOut
          ? '<button class="btn small" data-checkout="' + String(x.id) + '">Check-out</button>'
          : '';

        return `
          <tr>
            <td class="t-num">${escapeHtml(String(x.id || ''))}</td>
            <td class="t-text">${escapeHtml(String(x.primary_name || x.name || ''))}</td>
            <td class="t-text">${escapeHtml(String(x.resident || x.resident_name || ''))}</td>
            <td class="t-dt">${escapeHtml(inStr)}</td>
            <td class="t-dt">${escapeHtml(outStr)}</td>
            <td class="t-num">${dur !== '' ? escapeHtml(String(dur)) : ''}</td>
            <td class="t-text">${actionHtml}</td>
          </tr>`;
      }).join('');

      wrap.innerHTML = `
        <div class="table-wrap pretty">
          <table class="table pretty">
            <thead>
              <tr>
                <th class="t-num">ID</th>
                <th class="t-text">Visitor</th>
                <th class="t-text">Resident</th>
                <th class="t-dt">Check-in</th>
                <th class="t-dt">Check-out</th>
                <th class="t-num">Minutes</th>
                <th class="t-text">Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      try {
        const tbl = wrap.querySelector('table');
        if (tbl && window.enableSortableTable) enableSortableTable(tbl);
      } catch(_){}

      // checkout handlers
      wrap.querySelectorAll('[data-checkout]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-checkout');
          if (!id) return;

          const orig = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Working…';

          try{
            await checkoutVisitor(id);
            showMsg('Visitor checked out.', 'ok');
            await load();
          } catch(e){
            showMsg(e?.message || String(e), 'err');
          } finally {
            btn.disabled = false;
            btn.textContent = orig;
          }
        });
      });

    } catch(e){
      console.error('Failed to load visitors', e);
      if (wrap){
        wrap.innerHTML = '<div class="empty">Failed to load: ' + escapeHtml(e.message || String(e)) + '</div>';
      }
    }
  }

  // --- CSV export (client-side, same idea as Residents Out) ---
  function exportCsv(){
    if (!lastItems || !lastItems.length){
      showMsg('Nothing to export for this range.', 'warn');
      return;
    }

    const headers = ['ID','Visitor','Resident','Check-in','Check-out','Minutes'];
    const lines   = [headers];

    lastItems.forEach(x => {
      const checkIn  = x.checkin_at;
      const checkOut = x.checkout_at;

      let dur = '';
      try{
        if (checkIn){
          const t1 = new Date(checkIn).getTime();
          const t2 = checkOut ? new Date(checkOut).getTime() : Date.now();
          if (Number.isFinite(t1) && Number.isFinite(t2) && t2 >= t1){
            dur = Math.round((t2 - t1) / 60000); // minutes
          }
        }
      }catch(_){}

      const row = [
        x.id || '',
        x.primary_name || x.name || '',
        x.resident || x.resident_name || '',
        checkIn  ? fmtDT(checkIn)  : '',
        checkOut ? fmtDT(checkOut) : '',
        dur !== '' ? String(dur) : ''
      ];
      lines.push(row);
    });

    function esc(v){
      const s = (v == null ? '' : String(v));
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
      return s;
    }

    const csv = lines.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const iso = new Date().toISOString().slice(0,10);
    a.href = URL.createObjectURL(blob);
    a.download = 'visitors_' + iso + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 600);
  }

  // --- checkout helper ---
  async function checkoutVisitor(id){
    try {
      await api('/visitors/' + encodeURIComponent(id) + '/checkout', { method: 'POST' });
    } catch(e1){
      try {
        await api('/visitors/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
      } catch(e2){
        throw (e1 || e2);
      }
    }
  }

  // --- wire events + initial load ---
  const btnRefresh = document.getElementById('visRefresh');
  const btnCsv     = document.getElementById('btnVisitorsCsv');
  const fromEl     = document.getElementById('visFrom');
  const toEl       = document.getElementById('visTo');

  if (btnRefresh) btnRefresh.addEventListener('click', load);
  if (btnCsv)     btnCsv.addEventListener('click', exportCsv);
  if (fromEl)     fromEl.addEventListener('change', load);
  if (toEl)       toEl.addEventListener('change', load);

  await load();
}


// === Nursing Checks (adds maintenance quick box when arriving from ROOM TAP) ===
async function viewNursing(){
  setCrumbs('Nursing Checks');

  const role = String(state.me?.role||'').toUpperCase();
  const cat  = String(state.me?.category||'').toUpperCase();
  const isAdmin = (role === 'ADMIN' || role === 'ADMIN_GLOBAL');
  const allowed = isAdmin || ['NURSING','MANAGER','AUDITOR'].includes(cat);
  if (!allowed){
    $('#view').innerHTML = `<div class="alert err">Nursing only.</div>`;
    return;
  }

  const { params } = getHashQuery();
  const tappedLoc  = params.loc  ? String(params.loc)  : '';
  const tappedName = params.name ? String(params.name) : '';

  $('#view').innerHTML = `
    <div class="card">
      <h2>Nursing Checks</h2>
      ${ (tappedLoc || tappedName)
        ? `<div class="alert">From tag: ${tappedName ? escapeHtml(tappedName) + ' · ' : ''}${tappedLoc ? ('Location #'+escapeHtml(tappedLoc)) : ''}</div>`
        : ''
      }

      <!-- Toolbar: From / To / CSV / Refresh (same style idea as visitors) -->
      <div id="nursingToolbar"
     style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap">


        <input type="date" id="ncFrom" class="input"
       style="display:inline-block;width:auto;min-width:120px;
              padding:6px;border-radius:8px;border:1px solid var(--border,#d6dee5);flex:0 0 auto">
<input type="date" id="ncTo" class="input"
       style="display:inline-block;width:auto;min-width:120px;
              padding:6px;border-radius:8px;border:1px solid var(--border,#d6dee5);flex:0 0 auto">


        <button id="btnNursingCsv" class="btn"
                style="padding:4px 8px;border-radius:8px;font-weight:700;
                       font-size:12px;line-height:1.2;">
          CSV
        </button>

        <button id="ncRefresh" class="btn refresh small">Refresh</button>
      </div>

      <div id="ncBody"></div>
    </div>
  `;

  // Maintenance quick box only when we have TAP context
  (function renderMaintQuickBoxForNursing(){
    if (!tappedLoc && !tappedName) return;     // show only if redirected from ROOM
    const LOC_ID   = tappedLoc || '';
    const LOC_NAME = tappedName || (LOC_ID ? `Location #${LOC_ID}` : 'Location');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">Report maintenance issue</div>
      <div class="muted" style="margin-bottom:6px">
        Context: ${escapeHtml(LOC_NAME)}${LOC_ID?` (#${escapeHtml(LOC_ID)})`:''} · ROOM
      </div>
      <textarea id="tapIssue" class="input" placeholder="Describe the problem… (optional)"></textarea>
      <div style="margin-top:8px">
        <label class="muted">Attach photo (optional)</label>
        <input id="tapPhoto" type="file" class="input" accept="image/*" capture="environment">
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px;gap:8px;flex-wrap:wrap">
        <button id="tapSend" class="btn">Send</button>
      </div>
    `;
    $('#view').appendChild(card);

    card.querySelector('#tapSend')?.addEventListener('click', async ()=>{
      const txt  = (card.querySelector('#tapIssue')?.value || '').trim();
      const file = card.querySelector('#tapPhoto')?.files?.[0] || null;
      const base = (state.api || location.origin).replace(/\/+$/,'');
      const headersAuth = state.token ? { 'Authorization':'Bearer '+state.token } : {};
      let photoUrl = '';

      try{
        if (file) {
          const fd = new FormData();
          fd.append('file', file);
          const r = await fetch(base + '/uploads', { method:'POST', headers: headersAuth, body: fd });
          const j = await r.json().catch(()=> ({}));
          if (!r.ok) throw new Error((j && (j.error||j.message)) || ('HTTP '+r.status));
          photoUrl = j.url || j.path || '';
        }

        const ctxLine = `[From TAP @ ${LOC_NAME}${LOC_ID?` (#${LOC_ID})`:''} · ROOM]`;
        await api('/issues', {
          method:'POST',
          body: JSON.stringify({
            text: [ctxLine, txt || ''].filter(Boolean).join('\n') + (photoUrl ? `\nPhoto: ${photoUrl}` : ''),
            category: 'MAINTENANCE'
          })
        });

        if (card.querySelector('#tapIssue')) card.querySelector('#tapIssue').value = '';
        if (card.querySelector('#tapPhoto')) card.querySelector('#tapPhoto').value = '';
        showMsg('Issue sent.','ok');
      }catch(e){
        showMsg(e.message || String(e), 'err');
      }
    });
  })();

  // 🔄 Load table: only NURSING room_checks (id >= 1,000,000,000)
  async function load(){
    const wrap = document.getElementById('ncBody');
    if (!wrap) return;
    wrap.innerHTML = `<div class="empty">Loading…</div>`;

    try{
      const data = await api('/ff/checkins/recent');
      const raw  = data.items || data.checkins || data.rows || data.recent || [];

      const items = raw.filter(r => {
        const cat = String(r.user_category || '').toUpperCase();
        const id  = Number(r.id || 0);
        return cat === 'NURSING' && id >= 1000000000;
      });

      if (!items.length){
        wrap.innerHTML = `
          <div class="table-wrap pretty">
            <table class="table pretty">
              <thead>
                <tr>
                  <th class="t-text">Room / Location</th>
                  <th class="t-dt">Date &amp; Time</th>
                  <th class="t-text">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="t-text">—</td>
                  <td class="t-dt">—</td>
                  <td class="t-text"><span class="muted">No nursing checks recorded yet.</span></td>
                </tr>
              </tbody>
            </table>
          </div>`;
        return;
      }

      const rows = items.map(r => {
        const loc = (r.location_name || '').trim() || '—';
        const t   = r.checkin_at ? fmtDT(r.checkin_at) : '';
        const status = 'Checked';
        return `
          <tr>
            <td class="t-text">${escapeHtml(loc)}</td>
            <td class="t-dt">${escapeHtml(t || '—')}</td>
            <td class="t-text">${escapeHtml(status)}</td>
          </tr>`;
      }).join('');

      wrap.innerHTML = `
        <div class="table-wrap pretty">
          <table class="table pretty">
            <thead>
              <tr>
                <th class="t-text">Room / Location</th>
                <th class="t-dt">Date &amp; Time</th>
                <th class="t-text">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }catch(e){
      wrap.innerHTML = `<div class="alert err">Failed to load: ${escapeHtml(e.message || String(e))}</div>`;
    }
  }

  // 📄 CSV export (same filter as table, with optional date range)
  async function exportNursingCsv(){
    try{
      const data = await api('/ff/checkins/recent');
      const raw  = data.items || data.checkins || data.rows || data.recent || [];

      const baseItems = raw.filter(r => {
        const cat = String(r.user_category || '').toUpperCase();
        const id  = Number(r.id || 0);
        return cat === 'NURSING' && id >= 1000000000;
      });

      // Date filters (like visitors, client-side)
      const fromVal = $('#ncFrom')?.value || '';
      const toVal   = $('#ncTo')?.value   || '';

      let fromDate = null, toDate = null;
      if (fromVal) fromDate = new Date(fromVal + 'T00:00:00');
      if (toVal)   toDate   = new Date(toVal + 'T23:59:59');

      const items = baseItems.filter(r => {
        if (!fromDate && !toDate) return true;
        if (!r.checkin_at) return false;
        const dt = new Date(r.checkin_at);
        if (fromDate && dt < fromDate) return false;
        if (toDate   && dt > toDate)   return false;
        return true;
      });

      if (!items.length){
        showMsg('No nursing checks to export for the selected range.','info');
        return;
      }

      const header = ['Room / Location','Date & Time','Status'];
      const lines  = [header.join(',')];

      for (const r of items){
        const loc = (r.location_name || '').trim() || '—';
        const t   = r.checkin_at ? fmtDT(r.checkin_at) : '';
        const status = 'Checked';
        const cells = [loc, t, status].map(v => `"${String(v).replace(/"/g,'""')}"`);
        lines.push(cells.join(','));
      }

      const blob = new Blob([lines.join('\r\n')], { type:'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = 'nursing-checks.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }catch(e){
      showMsg(e.message || String(e),'err');
    }
  }

  const btnRefresh = document.getElementById('ncRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', load);

  const btnCsv2 = document.getElementById('btnNursingCsv');
  if (btnCsv2) btnCsv2.addEventListener('click', exportNursingCsv);

  // Clear any previous auto-refresh timer for this view (even though we no longer set it)
  if (window.__ernosNcTimer){
    clearInterval(window.__ernosNcTimer);
    window.__ernosNcTimer = null;
  }

  await load();

  // When tab becomes visible again and we are still on #nursing, refresh once (no flicker loop)
  document.addEventListener('visibilitychange', function onVis(){
    if (!document.hidden && location.hash.startsWith('#nursing')) {
      load();
    }
  });

  // ⚠️ NO SSE auto-refresh here to avoid flicker
  // (If you ever re-enable SSE, be careful not to spam load() every few seconds.)
}




// === Residents Out view — mirror Visitors layout (dates + CSV + table) ===
async function viewResidentsOut(){
  setCrumbs('Residents Out');

  // Skeleton card: title + toolbar row + table container
  $('#view').innerHTML = `
    <div class="card">
      <h2>Residents Out</h2>

      <div class="row ro-toolbar" style="
        margin-bottom:10px;
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        align-items:flex-end;
      ">
        <!-- Filters + buttons together (no huge gap to the right) -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
          <!-- From / To filters -->
          <input type="date" id="roFrom" class="input" style="
            display:inline-block;
            width:auto;
            min-width:120px;
            padding:6px;
            border-radius:8px;
            border:1px solid var(--border,#d6dee5);
          ">
          <input type="date" id="roTo" class="input" style="
            display:inline-block;
            width:auto;
            min-width:120px;
            padding:6px;
            border-radius:8px;
            border:1px solid var(--border,#d6dee5);
          ">

          <!-- Buttons directly next to the boxes -->
          <div style="display:flex;gap:8px;">
            <button id="btnResOutCsv" class="btn small">CSV</button>
            <button id="roRefresh" class="btn refresh small">Refresh</button>
          </div>
        </div>
      </div>

      <div id="roManualRow" class="row" style="
        margin:10px 0;
        display:none;
        flex-wrap:wrap;
        gap:8px;
        align-items:flex-end;
      ">
        <div class="field" style="min-width:160px;flex:1 1 160px;">
          <label>Resident</label>
          <input id="roManualResident" class="input" type="text" placeholder="Resident name">
        </div>
        <div class="field" style="min-width:160px;flex:1 1 160px;">
          <label>Escort (optional)</label>
          <input id="roManualEscort" class="input" type="text" placeholder="Escort">
        </div>
        <button id="roManualToggle" class="btn small" style="margin-top:22px;">
          Toggle out / in
        </button>
      </div>

      <div id="roTableWrap"></div>
    </div>
  `;
  // Reception/Admin: manual OUT/IN toggle for residents (no QR)
  (function addResidentsOutManualRow(){
    try{
      const me   = window.state?.me || {};
      const role = String(me.role || '').toUpperCase();
      const cat  = (typeof normCatFrom === 'function')
        ? normCatFrom(me)
        : String(
            me.category ||
            me.staff_category ||
            me.staff_cat ||
            me.cat ||
            ''
          ).toUpperCase();

      const isAdminLike =
        role === 'ADMIN' ||
        role === 'ADMIN_GLOBAL' ||
        role === 'MANAGER' ||
        cat  === 'MANAGER' ||
        role === 'AUDITOR' ||
        cat  === 'AUDITOR';

      const isReception = (cat === 'RECEPTION');

      if (!(isReception || isAdminLike)) return;

      const card = document.querySelector('#view .card');
      if (!card) return;

      const toolbar   = card.querySelector('.ro-toolbar');
      const tableWrap = document.getElementById('roTableWrap');

      const row = document.createElement('div');
      row.id = 'roManualRow';
      row.className = 'row ro-manual';
      row.style.cssText = [
        'margin-bottom:10px',
        'display:flex',
        'flex-wrap:wrap',
        'gap:8px',
        'align-items:flex-end'
      ].join(';');

      row.innerHTML = `
        <div class="field" style="min-width:160px;flex:1 1 160px;">
          <label>Resident</label>
          <input id="roManualResident" class="input" type="text" placeholder="Resident name">
        </div>
        <div class="field" style="min-width:160px;flex:1 1 160px;">
          <label>Escort (optional)</label>
          <input id="roManualEscort" class="input" type="text" placeholder="Escort">
        </div>
        <button id="roManualToggle" class="btn small" style="margin-top:22px;">
          Toggle out / in
        </button>
      `;

      if (toolbar && toolbar.parentElement === card) {
        card.insertBefore(row, toolbar.nextSibling);
      } else if (toolbar && toolbar.parentElement) {
        toolbar.parentElement.insertBefore(row, toolbar.nextSibling);
      } else if (tableWrap && tableWrap.parentElement) {
        tableWrap.parentElement.insertBefore(row, tableWrap);
      } else {
        card.appendChild(row);
      }

      const residentEl = row.querySelector('#roManualResident');
      const escortEl   = row.querySelector('#roManualEscort');
      const btn        = row.querySelector('#roManualToggle');
      if (!btn) return;

      btn.addEventListener('click', async ()=>{
        const resident = (residentEl?.value || '').trim();
        const escort   = (escortEl?.value   || '').trim();

        if (!resident){
          showMsg('Please enter resident name.', 'warn');
          try { residentEl?.focus(); } catch(_){}
          return;
        }

        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving…';

        try{
          const payload = { resident, escort };
          const j = await api('/residents/out/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const action = String(j?.action || '').toLowerCase();
          if (action === 'in'){
            showMsg(`Marked ${resident} as back in.`, 'ok');
          } else {
            showMsg(`Marked ${resident} as out.`, 'ok');
          }
          try { await load(); } catch(_){}
        }catch(e){
          showMsg(e?.message || String(e), 'err');
        }finally{
          btn.disabled = false;
          btn.textContent = orig;
        }
      });

    }catch(_){}
  })();

  // Who can use the manual Residents Out toggle
  const me   = state.me || {};
  const cat  = normCatFrom(me);
  const role = String(me.role || '').toUpperCase();

  const isReception = (cat === 'RECEPTION');
  const isAdminLike =
    role === 'ADMIN' ||
    role === 'ADMIN_GLOBAL' ||
    role === 'MANAGER' ||
    cat  === 'MANAGER' ||
    role === 'AUDITOR' ||
    cat  === 'AUDITOR';

  // --- helpers ---
  function isIso(t){
    if (!t) return false;
    const d = new Date(t);
    return !isNaN(d.getTime());
  }

  function minsBetween(a, b){
    const s = isIso(a) ? new Date(a).getTime() : NaN;
    const e = b && isIso(b) ? new Date(b).getTime() : Date.now();
    if (!Number.isFinite(s) || !Number.isFinite(e)) return '';
    // round to whole minutes (no decimals)
    return Math.max(0, Math.round((e - s) / 60000));
  }

  let lastItems = [];   // what we’re currently showing (for CSV)

  // --- main loader (backend: /residents/out/log?from=YYYY-MM-DD&to=YYYY-MM-DD) ---
  async function load(){
    try{
      const wrap = document.getElementById('roTableWrap');
      if (!wrap) return; // navigated away

      const fromVal = (document.getElementById('roFrom')?.value || '').trim();
      const toVal   = (document.getElementById('roTo')?.value   || '').trim();

      const qs = new URLSearchParams();
      if (fromVal) qs.set('from', fromVal);
      if (toVal)   qs.set('to',   toVal);

      const url = '/residents/out/log' + (qs.toString() ? ('?' + qs.toString()) : '');
      const j   = await api(url);

      let items;
      if (Array.isArray(j)) {
        items = j;
      } else if (j && Array.isArray(j.items)) {
        items = j.items;
      } else {
        items = [];
      }

      lastItems = items;

      if (!items.length){
        wrap.innerHTML = `<div class="empty">No residents out for this range.</div>`;
        return;
      }

      const rows = items.map(x => {
        const outAt = x.out_at ? fmtDT(x.out_at) : '';
        const inAt  = x.in_at  ? fmtDT(x.in_at)  : '';
        const dur   = minsBetween(x.out_at, x.in_at || null);

        return `
          <tr>
            <td class="t-text">${escapeHtml(x.resident || '')}</td>
            <td class="t-text">${escapeHtml(x.escort   || '')}</td>
            <td class="t-dt">${escapeHtml(outAt)}</td>
            <td class="t-dt">${escapeHtml(inAt)}</td>
            <td class="t-num">${dur !== '' ? escapeHtml(String(dur)) : ''}</td>
            <td class="t-text">${escapeHtml(x.note || '')}</td>
          </tr>`;
      }).join('');

      wrap.innerHTML = `
        <div class="table-wrap pretty">
          <table class="table pretty">
            <thead>
              <tr>
                <th class="t-text">Resident</th>
                <th class="t-text">Escort</th>
                <th class="t-dt">Out at</th>
                <th class="t-dt">Back at</th>
                <th class="t-num">Minutes out</th>
                <th class="t-text">Note</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      // make sortable like Visitors
      try {
        const tbl = wrap.querySelector('table');
        if (tbl && window.enableSortableTable) enableSortableTable(tbl);
      } catch(_){}
    }catch(e){
      const wrap = document.getElementById('roTableWrap');
      if (wrap){
        wrap.innerHTML = `<div class="empty">Failed to load: ${escapeHtml(e.message||String(e))}</div>`;
      }
    }
  }

  // --- CSV export (client-side) ---
  function exportCsv(){
    if (!lastItems.length){
      showMsg('Nothing to export for this range.', 'warn');
      return;
    }

    const headers = ['Resident','Escort','Out at','Back at','Minutes out','Note'];
    const lines = [headers];

    lastItems.forEach(x => {
      const outAt = x.out_at ? fmtDT(x.out_at) : '';
      const inAt  = x.in_at  ? fmtDT(x.in_at)  : '';
      const dur   = minsBetween(x.out_at, x.in_at || null);

      const row = [
        x.resident || '',
        x.escort   || '',
        outAt,
        inAt,
        dur != null ? String(dur) : '',
        x.note     || ''
      ];
      lines.push(row);
    });

    function esc(v){
      const s = (v == null ? '' : String(v));
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
      return s;
    }

    const csv = lines.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const iso = new Date().toISOString().slice(0,10);
    a.href = URL.createObjectURL(blob);
    a.download = 'residents_out_' + iso + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 600);
  }

  // --- wire events + initial load ---
  const btnRefresh     = document.getElementById('roRefresh');
  const btnCsv         = document.getElementById('btnResOutCsv');
  const fromEl         = document.getElementById('roFrom');
  const toEl           = document.getElementById('roTo');
  const manualRow      = document.getElementById('roManualRow');
  const manualResident = document.getElementById('roManualResident');
  const manualEscort   = document.getElementById('roManualEscort');
  const manualBtn      = document.getElementById('roManualToggle');

  if (btnRefresh) btnRefresh.addEventListener('click', load);
  if (btnCsv)     btnCsv.addEventListener('click', exportCsv);
  if (fromEl)     fromEl.addEventListener('change', load);
  if (toEl)       toEl.addEventListener('change', load);

  // Reception / Admin-like: enable manual OUT/IN toggle
  if (manualRow && (isReception || isAdminLike) && manualBtn) {
    manualRow.style.display = 'flex';

    manualBtn.addEventListener('click', async () => {
      const resident = (manualResident?.value || '').trim();
      const escort   = (manualEscort?.value   || '').trim();

      if (!resident) {
        showMsg('Please enter resident name.', 'warn');
        try { manualResident?.focus(); } catch(_){}
        return;
      }

      const origText = manualBtn.textContent;
      manualBtn.disabled = true;
      manualBtn.textContent = 'Saving…';

      try {
        const payload = { resident, escort };
        const resp = await api('/residents/out/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const action = String(resp?.action || '').toLowerCase();
        if (action === 'out') {
          showMsg(`Marked ${resident} as out.`, 'ok');
        } else if (action === 'in') {
          showMsg(`Marked ${resident} as back in.`, 'ok');
        } else {
          showMsg('Saved.', 'ok');
        }
        await load();
      } catch (e) {
        showMsg(e?.message || String(e), 'err');
      } finally {
        manualBtn.disabled = false;
        manualBtn.textContent = origText;
      }
    });

  }

  await load();

  // --- live updates via SSE (same channel as before: 'residents') ---
try {
    if (!state.token) return;
    const base = (state.api || location.origin).replace(/\/+$/,'');
    const esUrl = new URL('/events', base);
    esUrl.searchParams.set('token', state.token);

    const es = (window.__ernosES ||= new EventSource(esUrl.toString(), { withCredentials:true }));

    let _t = null;
    const kick = () => { clearTimeout(_t); _t = setTimeout(load, 50); };
    es.addEventListener('residents', kick);
  } catch(_){
}
}




// --- Maintenance Issues (CLEAN TABLE VIEW: filters + actions) ---
async function viewIssues(){
  setCrumbs('Maintenance Issues');

  const me   = state.me || {};
  const role = String(me.role || '').toUpperCase();
  const cat  = (typeof normCatFrom === 'function')
    ? normCatFrom(me)
    : (typeof normCat === 'function'
        ? normCat(me.category || me.staff_category || me.staff_cat || me.cat || '')
        : String(me.category || '').toUpperCase());

  const canWriteMaint =
    role === 'ADMIN' ||
    role === 'ADMIN_GLOBAL' ||
    role === 'MANAGER' ||
    cat === 'MANAGER' ||
    cat === 'MAINTENANCE';

  const meId   = String(me.id ?? me.user_id ?? '');
  const meName = me.name || me.email || 'Me';

  // Helper: clean “Photo: …” links & raw URLs from text
  function cleanIssueText(t){
    if (!t) return '';
    let s = String(t);
    s = s.replace(/photo:\s*https?:\/\/\S+/ig, ' ');
    s = s.replace(/https?:\/\/\S+/ig, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function parseDateOnly(v){
    if (!v) return null;
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function statusBadge(s){
    const st = String(s || 'OPEN').toUpperCase();
    if (st === 'RESOLVED') {
      return `<span class="badge status-badge" data-status="RESOLVED">RESOLVED</span>`;
    }
    if (st === 'IN_PROGRESS') {
      return `<span class="badge status-badge" data-status="IN_PROGRESS">IN PROGRESS</span>`;
    }
    return `<span class="badge status-badge" data-status="OPEN">OPEN</span>`;
  }

  async function tryMany(attempts){
    let lastErr = null;
    for (const a of attempts){
      try{
        await api(a.path, {
          method: a.method,
          body: a.body ? JSON.stringify(a.body) : undefined
        });
        return;
      }catch(e){
        lastErr = e;
      }
    }
    throw (lastErr || new Error('Action failed'));
  }

  async function acceptIssue(id){
    const nowIso = new Date().toISOString();
    await tryMany([
      { path:`/issues/${id}/accept`, method:'POST' },
      { path:`/issues/accept`, method:'POST', body:{ id } },
      { path:`/issues/${id}`, method:'PATCH', body:{
        status:'IN_PROGRESS',
        accepted_by_id: meId,
        accepted_by_name: meName,
        accepted_at: nowIso
      }}
    ]);
  }

  async function resolveIssue(id){
    const nowIso = new Date().toISOString();
    await tryMany([
      { path:`/issues/${id}/resolve`, method:'POST' },
      { path:`/issues/resolve`, method:'POST', body:{ id } },
      { path:`/issues/${id}`, method:'PATCH', body:{
        status:'RESOLVED',
        resolved_at: nowIso
      }}
    ]);
  }

  async function reopenIssue(id){
    await api(`/issues/${id}`, {
      method:'PATCH',
      body: JSON.stringify({
        status:'OPEN',
        resolved_at:null,
        resolved_by_id:null,
        resolved_by_name:null
      })
    });
  }

  async function saveNote(id, text, prevText){
    const note = String(text || '').trim();
    if (!note) return;

    const line = `[${new Date().toLocaleString()}] ${meName}: ${note}`;
    const merged = prevText ? (prevText + '\n' + line) : line;

    await tryMany([
      { path:`/issues/${id}/comment`, method:'POST', body:{ text: note } },
      { path:`/issues/${id}`, method:'PATCH', body:{ maintenance_comment: merged } }
    ]);
  }

  $('#view').innerHTML = `
    <div class="card">
      <h2>Maintenance Issues</h2>

      <div id="issuesToolbar"
           style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap">

        <button id="issFilterAll" class="btn small">All</button>
        <button id="issFilterOpen" class="btn small">Open</button>
        <button id="issFilterProgress" class="btn small">In Progress</button>
        <button id="issFilterResolved" class="btn small">Resolved</button>

        <span style="flex:1"></span>

        <input type="date" id="issFrom" class="input"
               style="display:inline-block;width:auto;min-width:120px;
                      padding:6px;border-radius:8px;
                      border:1px solid var(--border,#d6dee5);flex:0 0 auto">

        <input type="date" id="issTo" class="input"
               style="display:inline-block;width:auto;min-width:120px;
                      padding:6px;border-radius:8px;
                      border:1px solid var(--border,#d6dee5);flex:0 0 auto">

        <button id="issCsv" class="btn small">CSV</button>
        <button id="issRefresh" class="btn refresh small">Refresh</button>
      </div>

      <div id="issuesTable"></div>
    </div>
  `;

  const fromEl = $('#issFrom');
  const toEl   = $('#issTo');
  const btnCsv = $('#issCsv');
  const btnRef = $('#issRefresh');

  let allItems = [];
  let statusFilter = 'ALL';

  function filteredItems(){
    const fromVal = fromEl?.value || '';
    const toVal   = toEl?.value   || '';

    const dFrom = parseDateOnly(fromVal);
    const dTo   = parseDateOnly(toVal);
    const endTo = dTo ? new Date(dTo.getTime() + 24*60*60*1000 - 1) : null;

    let items = allItems.slice();

    // maintenance only, but tolerate old typo/variant categories
    items = items.filter(x => {
      const c = (typeof normCat === 'function')
        ? normCat(x.category || '')
        : String(x.category || '').toUpperCase();

      return (
  c === 'MAINTENANCE' ||
  c === 'HOUSEKEEPING' ||
  c === 'NURSING' ||
  c === 'RECEPTION' ||
  !c
);
    });

    // status filter
    if (statusFilter !== 'ALL'){
      items = items.filter(x => {
        const st = String(x.status || 'OPEN').toUpperCase();
        return st === statusFilter;
      });
    }

    // date filter
    if (dFrom || endTo){
      items = items.filter(it => {
        if (!it.created_at) return true;
        const t = new Date(it.created_at).getTime();
        if (!Number.isFinite(t)) return false;
        if (dFrom && t < dFrom.getTime()) return false;
        if (endTo && t > endTo.getTime()) return false;
        return true;
      });
    }

    return items;
  }

  function applyFilterButtonStyle(){
    const map = {
      ALL: '#issFilterAll',
      OPEN: '#issFilterOpen',
      IN_PROGRESS: '#issFilterProgress',
      RESOLVED: '#issFilterResolved'
    };

    Object.entries(map).forEach(([key, sel]) => {
      const b = $(sel);
      if (!b) return;
      if (key === statusFilter) {
        b.classList.remove('ghost');
      } else {
        b.classList.add('ghost');
      }
    });
  }

    async function render(){
    applyFilterButtonStyle();

    const items = filteredItems();
    const wrap = $('#issuesTable');

    if (!items.length){
      wrap.innerHTML = `<div class="empty">No issues found.</div>`;
      return;
    }

    const attMap = {};
    await Promise.all(items.map(async (it) => {
      try {
        attMap[it.id] = await fetchIssueAttachments(it.id);
      } catch (_) {
        attMap[it.id] = [];
      }
    }));

    const cards = items.map(o => {
      const id    = o.id;
      const st    = String(o.status || 'OPEN').toUpperCase();
      const when  = o.created_at ? fmtDT(o.created_at) : '';
      const who   = o.user_name || o.created_by_name || '';
      const loc   = o.location_name || o.location || 'General';
      const txt = cleanIssueText(
        String(o.text || '')
          .replace(/Photo:\s*https?:\/\/\S+/ig, '')
          .replace(/https?:\/\/\S+/ig, '')
      );
      const accBy = o.accepted_by_name || '';
      const notes = o.maintenance_comment || '';
      const dbAtts = attMap[id] || [];

      // Older issues may have photos saved as "Photo: https://..."
      // inside text or maintenance_comment instead of DB attachments.
      const fallbackUrls = (typeof findPhotoUrlsInStrings === 'function')
        ? findPhotoUrlsInStrings(o.text, o.maintenance_comment)
        : [];

      const fallbackAtts = fallbackUrls.map((url, idx) => ({
        url,
        filename: 'photo-' + (idx + 1)
      }));

      const atts = [
        ...dbAtts,
        ...fallbackAtts.filter(f => !dbAtts.some(a => String(a.url || '') === String(f.url || '')))
      ];

      const canAccept  = canWriteMaint && st !== 'RESOLVED' && !(o.accepted_by_name || o.accepted_by_id);
      const canResolve = canWriteMaint && st !== 'RESOLVED';
      const canReopen  = canWriteMaint && st === 'RESOLVED';
      const canNote    = canWriteMaint;
      const canUpload  = canWriteMaint || (typeof roleAllowsUpload === 'function' && roleAllowsUpload());

      return `
        <div class="card issue-card" data-id="${escapeHtml(String(id))}" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
            <div style="min-width:220px;flex:1">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
                ${statusBadge(st)}
                <strong>${escapeHtml(loc || 'General')}</strong>
                <span class="muted">#${escapeHtml(String(id))}</span>
              </div>

              <div style="font-size:15px;line-height:1.35">
                ${escapeHtml(txt || 'No issue text')}
              </div>

              ${notes ? `
                <div class="muted" style="margin-top:6px;white-space:pre-wrap">
                  ${escapeHtml(
                    String(notes || '')
                      .replace(/Photo:\s*https?:\/\/\S+/ig, '')
                      .replace(/https?:\/\/\S+/ig, '')
                      .trim()
                  )}
                </div>
              ` : ''}

              <div class="muted" style="margin-top:8px;font-size:12px">
                Reported: ${escapeHtml(when || '—')}
                ${who ? ` • By: ${escapeHtml(who)}` : ''}
                ${accBy ? ` • Assigned to: ${escapeHtml(accBy)}` : ''}
              </div>
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
              ${atts.length ? `
                <button class="btn small" data-act="photos" data-id="${id}" type="button">
                  View photos (${atts.length})
                </button>
              ` : `
                <span class="muted" style="align-self:center">No photos</span>
              `}

              ${canUpload ? `
                <button class="btn ghost small" data-act="pick" data-id="${id}" type="button">
                  Add photo
                </button>
                <input type="file" accept="image/*" style="display:none" id="pick_${id}">
              ` : ''}

              ${canAccept  ? `<button class="btn small" data-act="accept" data-id="${id}" type="button">Accept</button>` : ''}
              ${canResolve ? `<button class="btn small destructive" data-act="resolve" data-id="${id}" type="button">Resolve</button>` : ''}
              ${canReopen  ? `<button class="btn small" data-act="reopen" data-id="${id}" type="button">Reopen</button>` : ''}
              ${canNote    ? `<button class="btn ghost small" data-act="note" data-id="${id}" type="button">Add note</button>` : ''}
            </div>
          </div>

          <div id="issuePhotos_${escapeHtml(String(id))}" class="issue-photos" style="display:none;margin-top:10px">
            ${atts.length ? thumbnailsHTML(atts) : '<div class="muted">No photos attached.</div>'}
          </div>
        </div>
      `;
    }).join('');

    wrap.innerHTML = `
      <div style="display:grid;gap:10px">
        ${cards}
      </div>
    `;
  }
  async function loadIssues(){
    try{
      const j = await api('/issues');
      allItems = j.items || j || [];
      await render();
    }catch(e){
      $('#issuesTable').innerHTML =
        `<div class="empty">Failed to load: ${escapeHtml(e.message||String(e))}</div>`;
    }
  }

  function exportCsv(){
    const items = filteredItems();

    if (!items.length){
      showMsg('No issues to export for this range.','info');
      return;
    }

    const header = ['Reported','Status','Location','Issue','Reported By','Assigned To','Notes'];
    const lines  = [header.join(',')];

    items.forEach(o => {
      const cells = [
        o.created_at ? fmtDT(o.created_at) : '',
        String(o.status || 'OPEN').toUpperCase(),
        o.location_name || o.location || '',
        cleanIssueText(o.text || ''),
        o.user_name || o.created_by_name || '',
        o.accepted_by_name || '',
        o.maintenance_comment || ''
      ].map(v => `"${String(v).replace(/"/g,'""')}"`);

      lines.push(cells.join(','));
    });

    const blob = new Blob([lines.join('\r\n')], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const iso  = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = 'maintenance-issues_' + iso + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  $('#issFilterAll')?.addEventListener('click', () => { statusFilter = 'ALL'; render(); });
  $('#issFilterOpen')?.addEventListener('click', () => { statusFilter = 'OPEN'; render(); });
  $('#issFilterProgress')?.addEventListener('click', () => { statusFilter = 'IN_PROGRESS'; render(); });
  $('#issFilterResolved')?.addEventListener('click', () => { statusFilter = 'RESOLVED'; render(); });

  fromEl?.addEventListener('change', () => { render(); });
  toEl?.addEventListener('change', () => { render(); });
  btnRef?.addEventListener('click', loadIssues);
  btnCsv?.addEventListener('click', exportCsv);

    $('#issuesTable')?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-act][data-id]');
    if (!btn) return;

    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');
    const rowItem = allItems.find(x => String(x.id) === String(id));

    if (act === 'photos') {
      const box = document.getElementById('issuePhotos_' + id);
      if (box) box.style.display = (box.style.display === 'none' || !box.style.display) ? '' : 'none';
      return;
    }

    if (act === 'pick') {
      const input = document.getElementById('pick_' + id);
      if (!input) return;

      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;

        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Uploading…';

        try {
          await uploadAttachment(id, file);
          showMsg('Photo uploaded.','ok');
          await loadIssues();
        } catch(e) {
          showMsg(e.message || String(e), 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = orig;
          input.value = '';
        }
      };

      input.click();
      return;
    }

    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try{
      if (act === 'accept') {
        await acceptIssue(id);
        showMsg('Issue accepted.','ok');
      } else if (act === 'resolve') {
        await resolveIssue(id);
        showMsg('Issue resolved.','ok');
      } else if (act === 'reopen') {
        await reopenIssue(id);
        showMsg('Issue reopened.','ok');
      } else if (act === 'note') {
        const txt = prompt('Add maintenance note:', '');
        if (txt && txt.trim()) {
          await saveNote(id, txt, rowItem?.maintenance_comment || '');
          showMsg('Note saved.','ok');
        }
      }

      await loadIssues();
    }catch(e){
      showMsg(e.message || String(e), 'err');
    }finally{
      btn.disabled = false;
      btn.textContent = orig;
    }
  });

  await loadIssues();
}

async function viewMaint(){
  setCrumbs('My Maintenance');

  // UI skeleton (+ push button)
  $('#view').innerHTML = `
    <div class="card">
      <h2>My Maintenance</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
  <button id="mFilterUnassigned" class="btn small">Unassigned</button>
  <button id="mFilterMine" class="btn small">Assigned to me</button>
  <button id="mFilterAll" class="btn small">All issues</button>
  <span style="flex:1"></span>
  <button id="mPush" class="btn small">Enable Push Alerts</button>
  <button id="mRefresh" class="btn small">Refresh</button>
</div>
      <div class="muted" id="mPushHint" style="margin:-6px 0 10px 0">Allow notifications to get alerts even when the app isn’t open.</div>
      <div id="mList"></div>
    </div>`;

  // Hide the push button if already granted/supported
  if (!('Notification' in window)) {
    $('#mPush')?.remove(); $('#mPushHint')?.remove();
  } else if (Notification.permission === 'granted') {
    $('#mPush')?.remove(); $('#mPushHint')?.remove();
  }

  // Enable push button
  $('#mPush')?.addEventListener('click', async ()=>{
    const btn = $('#mPush');
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Enabling…';
    try {
      await ensurePushSubscription();
      showMsg('Push alerts enabled.','ok');
      btn.remove(); $('#mPushHint')?.remove();
    } catch(e){
      showMsg(e.message || String(e), 'err');
      btn.disabled = false; btn.textContent = orig;
    }
  });

  const meId = String(state.me?.id ?? state.me?.user_id ?? '');
  const meName = state.me?.name || state.me?.email || 'Me';

  // Role/category gate: only Admin + Maintenance can update issues.
  // Everyone else can view, but will NOT see Accept/Resolve/Save buttons.
  const role = String(state.me?.role || '').toUpperCase();
  const cat  = (typeof normCat === 'function')
    ? normCat(state.me?.category || state.me?.staff_category || state.me?.cat || '')
    : String(state.me?.category || '').toUpperCase();

  const canWriteMaint =
    role === 'ADMIN' ||
    role === 'ADMIN_GLOBAL' ||
    role === 'MANAGER' ||
    cat === 'MANAGER' ||
    cat === 'MAINTENANCE';

  let filter = 'all'; // unassigned | mine | all

  async function tryMany(attempts){
    let lastErr=null;
    for (const a of attempts){
      try{
        await api(a.path, { method:a.method, body: a.body ? JSON.stringify(a.body) : undefined });
        return;
      }catch(e){ lastErr = e }
    }
    throw (lastErr || new Error('Action failed'));
  }

  async function acceptIssue(id){
    const nowIso=new Date().toISOString();
    await tryMany([
      { path:`/issues/${id}/accept`, method:'POST' },
      { path:`/issues/accept`, method:'POST', body:{ id } },
      { path:`/issues/${id}`, method:'PATCH', body:{ status:'IN_PROGRESS', accepted_by_id: meId, accepted_by_name: meName, accepted_at: nowIso } }
    ]);
  }

  async function resolveIssue(id){
    const nowIso=new Date().toISOString();
    await tryMany([
      { path:`/issues/${id}/resolve`, method:'POST' },
      { path:`/issues/resolve`, method:'POST', body:{ id } },
      { path:`/issues/${id}`, method:'PATCH', body:{ status:'RESOLVED', resolved_at: nowIso } }
    ]);
  }

  async function saveComment(id, text, prevText){
    const line = `[${new Date().toLocaleString()}] ${meName}: ${text}`;
    const merged = (prevText ? (prevText + '\n' + line) : line);
    await tryMany([
      { path:`/issues/${id}/comment`, method:'POST', body:{ text } },     // optional if you add it later
      { path:`/issues/${id}`, method:'PATCH', body:{ maintenance_comment: merged } }
    ]);
  }

  async function load(){
    try{
      const j = await api('/issues');
      const all = (j.items||[]).filter(x => String(x.category||'').toUpperCase()==='MAINTENANCE' || !x.category);

      // “open” = not resolved, but Maintenance "All issues" must show OPEN + IN_PROGRESS + RESOLVED
      const open = all.filter(x => String(x.status||'').toUpperCase() !== 'RESOLVED');

      let items = all;
      if (filter === 'unassigned'){
        items = open.filter(x => !x.accepted_by_name && !x.accepted_by_id);
      } else if (filter === 'mine'){
        items = all.filter(x =>
          String(x.accepted_by_id||'') === meId ||
          String(x.accepted_by_name||'').toLowerCase() === meName.toLowerCase()
        );
      } else if (filter === 'all'){
        items = all;
      }

      const wrap = $('#mList');
      if (!items.length){
        wrap.innerHTML = `<div class="empty">No issues.</div>`;
        return;
      }

      // attachments → thumbnails
      const attMap = {};
      await Promise.all(items.map(async (it) => {
        attMap[it.id] = await fetchIssueAttachments(it.id);
      }));

      wrap.innerHTML = items.map(o => {
        const id = o.id;
        const status = String(o.status||'').toUpperCase() || 'OPEN';
        const accepted = !!(o.accepted_by_name || o.accepted_by_id);
        const mine = (String(o.accepted_by_id||'')===meId) ||
                     (String(o.accepted_by_name||'').toLowerCase()===meName.toLowerCase());
        const dt = o.created_at ? fmtDT(o.created_at) : '';
        const loc = o.location_name || o.location || '';
        const who = o.user_name || '';
        const comm = o.maintenance_comment || '';
        const photo = photoCellHtml(attMap[id]);

        // Only Admin + Maintenance may change maintenance issues
        // Save Notes remains available even after RESOLVED so maintenance/admin can edit afterwards.
                const canAccept  = canWriteMaint && status !== 'RESOLVED' && !accepted;
        const canResolve = canWriteMaint && status !== 'RESOLVED';
        const canComment = canWriteMaint;

        const allowUpload = (typeof roleAllowsUpload === 'function') ? roleAllowsUpload() : false;
        const noteReadonly = canWriteMaint ? '' : 'readonly';

        return `
          <div class="card" data-id="${id}">
            <div class="title">#${id} · ${escapeHtml(loc || 'Maintenance')}</div>
            <div class="kv" style="margin:6px 0">
              <div class="muted">Status</div><div>${escapeHtml(status)}</div>
              <div class="muted">Reported</div><div>${escapeHtml(dt)}</div>
              <div class="muted">By</div><div>${escapeHtml(who)}</div>
              <div class="muted">Accepted By</div><div>${escapeHtml(o.accepted_by_name || '—')}</div>
            </div>

            <div style="margin:8px 0">${escapeHtml(o.text || '')}</div>

            <div style="margin-top:8px">
              <label class="muted">Maintenance Notes</label>
                            <textarea class="input mNote" ${noteReadonly} placeholder="e.g., To be fixed; plumber required.">${escapeHtml(comm)}</textarea>

            </div>

           <div style="margin-top:12px">
  <label class="muted">Photos</label>
  <div class="attThumbs" style="margin-top:6px"><div class="muted">Loading…</div></div>
  <div class="attFallback" style="margin-top:6px"></div>
  ${allowUpload ? attachmentControlsHTML(id) : ''}
</div>


            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">
              ${canAccept  ? `<button class="btn small" data-act="accept">Accept</button>` : ''}
              ${canComment ? `<button class="btn ghost small" data-act="save">Save Notes</button>` : ''}
              ${canResolve ? `<button class="btn ghost small" data-act="resolve">Resolve</button>` : ''}
            </div>
          </div>`;
      }).join('');

      // Wire actions
      $('#mList').querySelectorAll('.card').forEach(card=>{
        const id = card.getAttribute('data-id');

        const btnAccept = card.querySelector('[data-act="accept"]');
        if (btnAccept) btnAccept.onclick = async ()=>{
          const orig = btnAccept.textContent; btnAccept.disabled=true; btnAccept.textContent='Accepting…';
          try{ await acceptIssue(id); showMsg('Issue accepted.','ok'); await load(); }
          catch(e){ showMsg(e.message||String(e),'err'); btnAccept.disabled=false; btnAccept.textContent=orig; }
        };

        const btnSave = card.querySelector('[data-act="save"]');
        if (btnSave) btnSave.onclick = async ()=>{
          const ta = card.querySelector('.mNote');
          const txt = (ta?.value||'').trim();
          const prev = (ta?.defaultValue||'').trim();
          if (!txt){ showMsg('Write a note first.','err'); return; }
          btnSave.disabled=true; const orig=btnSave.textContent; btnSave.textContent='Saving…';
          try{ await saveComment(id, txt, prev); showMsg('Notes saved.','ok'); await load(); }
          catch(e){ showMsg(e.message||String(e),'err'); btnSave.disabled=false; btnSave.textContent=orig; }
        };

        const btnResolve = card.querySelector('[data-act="resolve"]');
        if (btnResolve) btnResolve.onclick = async ()=>{
          if (!confirm('Mark this issue as resolved?')) return;
          const orig=btnResolve.textContent; btnResolve.disabled=true; btnResolve.textContent='Resolving…';
          try{ await resolveIssue(id); showMsg('Issue resolved.','ok'); await load(); }
          catch(e){ showMsg(e.message||String(e),'err'); btnResolve.disabled=false; btnResolve.textContent=orig; }
        };
      });
          // Wire photos (thumbs + camera/file)
      $('#mList').querySelectorAll('.card').forEach(card=>{
        const id = card.getAttribute('data-id');
        if (id) wireAttachmentControls(card, id);
        /* ANCHOR: MAINT_FALLBACK_PHOTOS (inside the forEach card loop) */
try {
  const item = items.find(x => String(x.id) === String(id));
  if (item) {
    const urls = findPhotoUrlsInStrings(item.text, item.maintenance_comment);
    if (urls.length) {
      const wrap = card.querySelector('.attFallback');
      if (wrap) wrap.innerHTML = photoButtonsHTML(urls[0]);
    }
  }
} catch (_) {}

      });


    }catch(e){
      $('#mList').innerHTML = `<div class="empty">Failed to load: ${escapeHtml(e.message||String(e))}</div>`;
    }
  }

  // Filters + Refresh
  $('#mFilterUnassigned').onclick = ()=>{ filter='unassigned'; load(); };
  $('#mFilterMine').onclick       = ()=>{ filter='mine';       load(); };
  $('#mFilterAll').onclick        = ()=>{ filter='all';        load(); };
  $('#mRefresh').onclick          = load;

  // Initial load
  await load();

  // Live updates via SSE
  // Live updates via SSE
try {
  if (!state.token) return;
  const esUrl = new URL('/events', (state.api || location.origin).replace(/\/+$/,''));
  if (esUrl.origin === location.origin) {
    esUrl.searchParams.set('token', state.token);
    const es = (window.__ernosES ||= new EventSource(esUrl.toString(), { withCredentials: true }));
    es.addEventListener('issues', () => { showMsg('New maintenance issue reported.', 'warn'); load(); });
  }
} catch {}
}

// --- Staff & Roles (keep ONLY ONE copy in the file)
// If you already have a full viewStaff() elsewhere, DELETE this stub entirely.
// async function viewStaff(){ /* ... your existing full implementation ... */ }

// --- Housekeeping view ---
async function viewHK(){
  setCrumbs('Housekeeping');

  // Skeleton with toolbar + cards
  $('#view').innerHTML = `
    <!-- Toolbar: From / To / CSV / Refresh all in one row (close together) -->
    <div id="hkToolbar"
         style="display:flex;gap:8px;align-items:center;margin:8px 0;
                flex-wrap:wrap">
      <input type="date" id="hkFrom" class="input"
             style="display:inline-block;width:auto;min-width:120px;
                    padding:6px;border-radius:8px;
                    border:1px solid var(--border,#d6dee5);flex:0 0 auto">
      <input type="date" id="hkTo" class="input"
             style="display:inline-block;width:auto;min-width:120px;
                    padding:6px;border-radius:8px;
                    border:1px solid var(--border,#d6dee5);flex:0 0 auto">

      <button id="btnHkCsv" class="btn"
              style="padding:4px 8px;border-radius:8px;font-weight:700;
                     font-size:12px;line-height:1.2;">
        CSV
      </button>
      <button id="hkRefresh" class="btn refresh small">Refresh</button>
    </div>

    <div class="card">
      <!-- NO 'Rooms' HEADER HERE ANYMORE -->
      <div id="hkRooms"></div>
    </div>

    <div class="card">
      <h2>Report maintenance issue</h2>
      <textarea id="hkIssue" class="input" placeholder="Describe the problem…"></textarea>
      <div style="margin-top:8px">
        <label class="muted">Add Photo (optional)</label>
        <input type="file" id="hkPhoto" class="input" accept="image/*" capture="environment" />
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button id="hkSend" class="btn">Send</button>
      </div>
    </div>

    <div class="card">
      <h2>Open maintenance issues</h2>
      <div id="hkIssues"></div>
    </div>
  `;
  // Show message coming from TAP (e.g. "Cleaning started")
  if (typeof consumeFlash === 'function') {
    consumeFlash();
  }

  // ---------- helpers ----------
  function isToday(d){
    if(!d) return false;
    const x = new Date(d); if (isNaN(+x)) return false;
    const now = new Date();
    return x.getFullYear()===now.getFullYear() &&
           x.getMonth()===now.getMonth() &&
           x.getDate()===now.getDate();
  }

  function statusBadge(cleanedToday, inprog){
    if (inprog) return `<span class="tag" style="background:#FFF5E6;border:1px solid #F3E0BD;color:#7A5A05">In progress</span>`;
    if (cleanedToday) return `<span class="tag" style="background:#E9F5EF;border:1px solid #CFE8DB;color:#1D5C45">Cleaned</span>`;
    return `<span class="tag" style="background:#FDEEEE;border:1px solid #F1C9C9;color:#7A2A2A">Not cleaned</span>`;
  }

  // Text version of status (for CSV)
  function statusText(cleanedToday, inprog){
    if (inprog) return 'In progress';
    if (cleanedToday) return 'Cleaned';
    return 'Not cleaned';
  }

  function parseDateOnly(v){
    if (!v) return null;
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  let lastRooms = [];   // keep currently displayed rooms for CSV

     function renderRooms(items){
    // Apply date range filter on last_checkout
    const fromVal = $('#hkFrom')?.value || '';
    const toVal   = $('#hkTo')?.value   || '';

    const dFrom = parseDateOnly(fromVal);
    const dTo   = parseDateOnly(toVal);
    const endTo = dTo ? new Date(dTo.getTime() + 24*60*60*1000 - 1) : null;

    const filtered = (items || []).filter(r => {
      if (!dFrom && !endTo) return true;

      const dateForFilter = r.last_checkout || r.checkout_at || r.checkin_at || r.last_checkin;
      if (!dateForFilter) return true;

      const t = new Date(dateForFilter).getTime();
      if (!Number.isFinite(t)) return true;
      if (dFrom && t < dFrom.getTime()) return false;
      if (endTo && t > endTo.getTime()) return false;
      return true;
    });

    lastRooms = filtered;

    if (!filtered.length){
      $('#hkRooms').innerHTML = `<div class="empty">No rooms found for this range.</div>`;
      return;
    }

    const rows = filtered.map(r=>{
  const inprog = !!r.in_progress;

  const finishAt =
    r.last_checkout ||
    r.checkout_at ||
    r.finished_at ||
    '';

  const cleanedToday = !inprog && !!finishAt && isToday(finishAt);

  const cleaner =
    r.in_progress_by_name ||
    r.in_progress_by ||
    r.last_cleaner_name ||
    r.last_cleaner ||
    r.staff_name ||
    r.user_name ||
    '';

  const startAt =
    r.in_progress_checkin_at ||
    r.last_checkin ||
    r.checkin_at ||
    '';

      return `<tr>
        <td class="t-text">${escapeHtml(r.name||'')}</td>
        <td class="t-dt">${startAt ? escapeHtml(fmtDT(startAt)) : '—'}</td>
        <td class="t-dt">${finishAt ? escapeHtml(fmtDT(finishAt)) : '—'}</td>
        <td class="t-text">${cleaner ? escapeHtml(cleaner) : '—'}</td>
        <td class="t-text">${statusBadge(cleanedToday, inprog)}</td>
      </tr>`;
    }).join('');

    $('#hkRooms').innerHTML = `
      <div class="table-wrap pretty">
        <table class="table pretty">
          <thead>
            <tr>
              <th class="t-text">Room</th>
              <th class="t-dt">Started</th>
              <th class="t-dt">Finished</th>
              <th class="t-text">Cleaner</th>
              <th class="t-text">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    try {
      const tbl = document.querySelector('#hkRooms table');
      if (tbl && window.enableSortableTable) enableSortableTable(tbl);
    } catch(_){}
  }

  // ---------- Open issues ----------
async function renderOpenIssues(items){
  const open = (items||[]).filter(x => String(x.status||'').toUpperCase() !== 'RESOLVED');
  if (!open.length){
    $('#hkIssues').innerHTML = `<div class="empty">No open issues.</div>`;
    return;
  }

  // For each issue: prefer DB attachments; if missing, parse URLs from text/notes
  const withPhotos = await Promise.all(open.map(async it => {
    let url = '';
    try {
      const atts = await fetchIssueAttachments(it.id);
      url = (atts && atts[0] && atts[0].url) || '';
    } catch {}

    if (!url) {
      const urls = findPhotoUrlsInStrings(it.text, it.maintenance_comment);
      url = urls[0] || '';
    }

    return {
      ...it,
      photo: url ? photoButtonsHTML(url) : '<span class="muted">No photo</span>'
    };
  }));

  renderTable(
    $('#hkIssues'),
    withPhotos,
    ['id','location_name','category','text','status','created_at','photo'],
    { htmlCols: ['photo'] }
  );
}

// ---------- Loaders ----------
async function loadRooms(){
  try{
    const j = await api('/hk/rooms');        // backend HK endpoint
    renderRooms(j.items||[]);
  }catch(e){
    $('#hkRooms').innerHTML = `<div class="empty">Failed to load: ${escapeHtml(e.message||String(e))}</div>`;
  }
}

// NOTE: HK-specific loader – renamed so it does NOT clash with main Issues view.
async function loadHkIssues(){
  try{
    const j = await api('/issues/open');
    await renderOpenIssues(j.items||[]);
  }catch(e){
    $('#hkIssues').innerHTML = `<div class="empty">Failed to load: ${escapeHtml(e.message||String(e))}</div>`;
  }
}



    function exportHkCsv(){
    if (!lastRooms.length){
      showMsg('No housekeeping data to export for this range.','info');
      return;
    }

    const header = ['Room','Started','Finished','Cleaner','Status'];
    const lines  = [header.join(',')];

    lastRooms.forEach(r => {
  const inprog = !!r.in_progress;

  const finishAt =
    r.last_checkout ||
    r.checkout_at ||
    r.finished_at ||
    '';

  const cleanedToday = !inprog && !!finishAt;
const st = statusText(cleanedToday, inprog);

  const startAt =
    r.in_progress_checkin_at ||
    r.last_checkin ||
    r.checkin_at ||
    '';

      const cleaner =
        r.in_progress_by_name ||
        r.in_progress_by ||
        r.last_cleaner_name ||
        r.last_cleaner ||
        r.staff_name ||
        r.user_name ||
        '';

      const cells = [
        r.name || '',
        startAt ? fmtDT(startAt) : '',
        finishAt ? fmtDT(finishAt) : '',
        cleaner,
        st
      ].map(v => `"${String(v).replace(/"/g,'""')}"`);

      lines.push(cells.join(','));
    });

    const blob = new Blob([lines.join('\r\n')], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const iso  = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = 'housekeeping-rooms_' + iso + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }


  // ---------- Wire UI ----------
  const btnRefresh = document.getElementById('hkRefresh');
  const btnCsv     = document.getElementById('btnHkCsv');
  const fromEl     = document.getElementById('hkFrom');
  const toEl       = document.getElementById('hkTo');

  if (btnRefresh) btnRefresh.addEventListener('click', () => { loadRooms(); loadHkIssues(); });

  if (btnCsv)     btnCsv.addEventListener('click', exportHkCsv);
  if (fromEl)     fromEl.addEventListener('change', loadRooms);
  if (toEl)       toEl.addEventListener('change', loadRooms);
// Initial load
loadRooms();
loadHkIssues();

  // Report issue send
  $('#hkSend').onclick = async ()=>{
    const txt  = ($('#hkIssue').value||'').trim();
    const file = ($('#hkPhoto')?.files && $('#hkPhoto').files[0]) ? $('#hkPhoto').files[0] : null;
    if(!txt && !file){
      showMsg('Please write the issue or attach a photo.','err');
      return;
    }

    try{
      // 1) Create the issue
      const j = await api('/issues',{
        method:'POST',
        body: JSON.stringify({ text: txt || ' ', category: 'HOUSEKEEPING' })
      });
      const newId = j?.id || j?.issue_id || j?.item?.id;
      if (!newId){ showMsg('Issue created but no ID returned.', 'warn'); }

      // 2) If photo attached, upload and comment the URL (or inline data URL)
      if (file && newId){
        const url = await uploadImage(file, newId);
        const line = url ? `Photo: ${url}` : `Photo (inline): ${await readFileAsDataUrl(file)}`;
        await postIssueComment(newId, (txt ? (txt + '\n') : '') + line);
      }

      // Reset UI
      $('#hkIssue').value = '';
      if ($('#hkPhoto')) $('#hkPhoto').value = '';
      showMsg('Issue sent.', 'ok');
      loadHkIssues();
    }catch(e){
      showMsg(e.message||String(e),'err');
    }
  };

  // initial load
  loadRooms();
  loadHkIssues();
}


// ⬇️ REPLACE your entire viewStaff() with this version
async function viewStaff(){
  setCrumbs('Staff & Roles');  // ← ensures the header shows the section name

  const myRole = String(state.me?.role||'').toUpperCase();
  const isGlobal = (myRole === 'ADMIN_GLOBAL');
  const isAdmin  = (isGlobal || myRole === 'ADMIN');
  if (!isAdmin){ $('#view').innerHTML = `<div class="alert err">Admins only.</div>`; return; }

  $('#view').innerHTML = `
    <div class="card">
      <h2>Staff & Roles</h2>
      <div id="addForm" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:10px; margin:10px 0">
        <div><label>Name</label><input id="add_name" class="input" placeholder="Jane Doe"/></div>
        <div><label>Username</label><input id="add_username" class="input" placeholder="jane.doe or email"/></div>
        <div>
          <label>Role</label>
          <select id="add_role" class="input"></select>
        </div>
        <div>
          <label>Category</label>
          <select id="add_cat" class="input"></select>
        </div>
        <div>
          <label>Password (required)</label>
          <input id="add_password" type="password" class="input" placeholder="At least 5 characters"/>
        </div>
        <div style="display:flex; align-items:flex-end; gap:8px; flex-wrap:wrap">
          <label style="display:flex; align-items:center; gap:6px">
            <input type="checkbox" id="add_active" checked /> Active
          </label>
            <button id="btnCreate" class="btn small" type="button">Create</button>
          <button id="btnRefreshUsers" class="btn refresh small" type="button">Refresh</button>
        </div>
      </div>
      <div id="usersTable" style="margin-top:10px"></div>
    </div>`;

  const ROLE_OPTS = isGlobal ? ['USER','ADMIN','ADMIN_GLOBAL'] : ['USER','ADMIN'];
  const CAT_OPTS  = ['NURSING','RECEPTION','HOUSEKEEPING','MAINTENANCE','AUDITOR','MANAGER','NONE'];
  $('#add_role').innerHTML = ROLE_OPTS.map(r=>`<option value="${r}">${r}</option>`).join('');
  $('#add_cat').innerHTML  = CAT_OPTS.map(c=>`<option value="${c}">${c}</option>`).join('');

  // ---------- Endpoint discovery (GET shape) ----------
  async function ensureUsersBase(){
    if (state.__usersBase) return state.__usersBase;
    const candidates = ['/users','/staff','/admin/users'];
    let lastErr=null;
    for (const base of candidates){
      try {
        const j = await api(base);
        const items = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : null);
        if (items) { state.__usersBase = base; return base; }
      } catch(e){ lastErr = e; }
    }
    throw (lastErr || new Error('No users endpoint found'));
  }

  // ---------- Helpers ----------
  function mkTempPassword(){ return (Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)).slice(0,16); }
  function mkEmailFromUsername(username){
    const base = String(username||'').trim();
    if (!base) return '';
    if (base.includes('@')) return base;
    const tenantSuffix = String(state.me?.tenant_id||'0');
    return `${base}+t${tenantSuffix}@local.invalid`;
  }

  async function fetchUsers(){
    const base = await ensureUsersBase();
    const j = await api(base);
    return Array.isArray(j) ? j : (j.items||[]);
  }

  // Try one base with two shapes
  async function createAtBase(base, { name, username, role, category, active }){
    const nm = String(name||'').trim();
    const un = String(username||'').trim();
    if (!nm || !un) throw new Error('Name and username are required');
    const wantedRole = String(role||'USER').toUpperCase();
    const suppliedPassword = (document.getElementById('add_password')?.value || '').trim();

    if (wantedRole === 'ADMIN_GLOBAL' && !isGlobal) {
      throw new Error('Only the Global Admin can assign ADMIN_GLOBAL');
    }

    const payloadA = {
      name: nm,
      username: un,
      role: wantedRole,
      category: String(category||'NONE').toUpperCase(),
      active: !!active,
      password: suppliedPassword
    };

    // Legacy email+password shape
    const email = mkEmailFromUsername(un);
    const tmp = mkTempPassword();
    const payloadB = {
      name: nm,
      email,
      password: suppliedPassword || tmp,
      role: wantedRole,
      category: String(category||'NONE').toUpperCase(),
      title: '',
      active: !!active
    };

    try {
      const res = await api(base, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payloadA) });
      showMsg('User created.', 'ok');
      return res;
    } catch (eA) {
      const msg = String(eA?.message||'');
      if (/email|password|missing.*password|must include/i.test(msg) || /400|422/.test(msg)) {
        const resB = await api(base, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payloadB) });
        showMsg('User created. They’ll be prompted to set a new password on first login.', 'ok');
        return resB;
      }
      throw eA;
    }
  }

  async function createUserSmart(args){
    const tried = new Set();
    const order = ['/users','/staff','/admin/users'];
    let firstBase;
    try { firstBase = await ensureUsersBase(); } catch { firstBase = null; }
    const candidates = firstBase ? [firstBase, ...order.filter(x=>x!==firstBase)] : order;

    let lastErr;
    for (const base of candidates){
      if (tried.has(base)) continue;
      tried.add(base);
      try {
        const res = await createAtBase(base, args);
        state.__usersBase = base; // cache the working base
        return res;
      } catch(e) {
        const m = String(e?.message||'');
        if (/404|not\s*found|405|method\s*not\s*allowed/i.test(m)) { lastErr = e; continue; }
        throw e;
      }
    }
    throw (lastErr || new Error('No working users endpoint'));
  }

  async function updateUser(id, data){
    const base = await ensureUsersBase();
    await api(`${base}/${encodeURIComponent(id)}`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
  }
  async function deleteUser(id){
    const base = await ensureUsersBase();
    await api(`${base}/${encodeURIComponent(id)}`, { method:'DELETE' });
  }

  function selectHtml(options, current, disabled){
    const cur = String(current||'').toUpperCase();
    return disabled
      ? `<span class="tag">${cur||options[0]}</span>`
      : `<select class="input">${options.map(o=>`<option value="${o}" ${cur===o?'selected':''}>${o}</option>`).join('')}</select>`;
  }

  async function load(){
    try{
      const users = await fetchUsers();
      if (!users.length){ $('#usersTable').innerHTML = `<div class="empty">No users.</div>`; return; }

      const myId = String(state.me?.id ?? state.me?.user_id ?? '');
      const rows = users.map(u=>{
        const id    = String(u.id ?? u.user_id ?? u.uid ?? '');
        const name  = u.name || u.full_name || '';
        const uname = u.username || u.email || '';
        const roleU = String(u.role||'USER').toUpperCase();
        const catU  = String(u.category||'NONE').toUpperCase();
        const active = (u.active==null ? true : !!u.active);

        const isRowGlobal = (roleU === 'ADMIN_GLOBAL');
        const isSelf = (id === myId);

        const canEdit   = isGlobal || !isRowGlobal;
        const canDelete = !isSelf && (isGlobal || (roleU !== 'ADMIN' && roleU !== 'ADMIN_GLOBAL'));

        const roleCell   = canEdit ? selectHtml(ROLE_OPTS, roleU, false) : selectHtml(ROLE_OPTS, roleU, true);
        const catCell    = canEdit ? selectHtml(CAT_OPTS,  catU,  false) : selectHtml(CAT_OPTS,  catU,  true);
        const activeCell = canEdit ? `<input type="checkbox" ${active?'checked':''}/>` : `<input type="checkbox" ${active?'checked':''} disabled />`;

        const actions = [];
        if (canEdit)   actions.push(`<button class="btn small" data-act="save" type="button">Save</button>`);      // green (primary)
if (canDelete) actions.push(`<button class="btn destructive small" data-act="delete" type="button">Delete</button>`); // red (destructive)

        return `<tr data-id="${id}">
          <td class="t-num">${id}</td>
          <td>${escapeHtml(name || uname)}</td>
          <td>${escapeHtml(uname)}</td>
          <td>${roleCell}</td>
          <td>${catCell}</td>
          <td>${activeCell}</td>
          <td style="display:flex; gap:6px; flex-wrap:wrap">${actions.join(' ') || '<span class="muted">—</span>'}</td>
        </tr>`;
      }).join('');

      $('#usersTable').innerHTML = `
        <div class="table-wrap">
          <table class="table nolines">
            <thead>
              <tr><th class="t-num">ID</th><th>Name</th><th>Username</th><th>Role</th><th>Category</th><th>Active</th><th>Actions</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      $('#usersTable').querySelectorAll('[data-act="save"]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const tr = btn.closest('tr');
          const id = tr.getAttribute('data-id');
          const [roleSel, catSel] = tr.querySelectorAll('select');
          const role = roleSel?.value || 'USER';
          const category = catSel?.value || 'NONE';
          const active = tr.querySelector('input[type="checkbox"]')?.checked ?? true;

          if (!isGlobal && String(role).toUpperCase()==='ADMIN_GLOBAL'){
            showMsg('Only the Global Admin can assign ADMIN_GLOBAL.', 'err'); return;
          }

          btn.disabled = true; const orig=btn.textContent; btn.textContent='Saving…';
          try{ await updateUser(id, { role, category, active }); showMsg('Saved.','ok'); }
          catch(e){ showMsg(e.message||String(e),'err'); }
          finally{ btn.disabled=false; btn.textContent=orig; }
        });
      });

      $('#usersTable').querySelectorAll('[data-act="delete"]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const tr = btn.closest('tr');
          const id = tr.getAttribute('data-id');
          if (!confirm('Delete this user?')) return;
          btn.disabled=true; const orig=btn.textContent; btn.textContent='Deleting…';
          try{ await deleteUser(id); showMsg('Deleted.','ok'); await load(); }
          catch(e){ showMsg(e.message||String(e),'err'); btn.disabled=false; btn.textContent=orig; }
        });
      });

    }catch(e){
      $('#usersTable').innerHTML = `<div class="empty">Failed to load users: ${escapeHtml(e.message||String(e))}</div>`;
    }
  }

  $('#btnCreate').addEventListener('click', async ()=>{
    const name     = $('#add_name').value.trim();
    const username = $('#add_username').value.trim();
    const role     = $('#add_role').value;
    const category = $('#add_cat').value;
    const active   = !!$('#add_active').checked;
    const password = ($('#add_password')?.value || '').trim();

    if (!name || !username){ showMsg('Name and username are required.','err'); return; }
    if (password.length < 5){
      showMsg('Password must be at least 5 characters.','err');
      return;
    }
    if (!isGlobal && role.toUpperCase()==='ADMIN_GLOBAL'){ showMsg('Only Global Admin can assign ADMIN_GLOBAL.','err'); return; }

    const btn = $('#btnCreate'); btn.disabled=true; const orig=btn.textContent; btn.textContent='Creating…';
    try{
      await createUserSmart({ name, username, role, category, active, ...(password ? { password } : {}) });
      $('#add_name').value=''; $('#add_username').value='';
      $('#add_password').value='';
      $('#add_role').value=ROLE_OPTS[0]; $('#add_cat').value='NONE'; $('#add_active').checked=true;
      await load();
    }catch(e){
      showMsg(e.message||String(e),'err');
    }finally{
      btn.disabled=false; btn.textContent=orig;
    }
  });

  $('#btnRefreshUsers').addEventListener('click', load);
  load();
}
/* ANCHOR: LOC_TYPE_ENSURE (BEGIN) */
function ensureReceptionResidentsTypeInSelects(){
  try{
    document.querySelectorAll('select#locType, select[name="type"]').forEach(sel => {
      const exists = Array.from(sel.options).some(o => String(o.value).toUpperCase() === 'RECEPTION_RESIDENTS');
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = 'RECEPTION_RESIDENTS';
        opt.textContent = 'RECEPTION RESIDENTS';
        sel.appendChild(opt);
      }
    });
  }catch(_){}
}
/* ANCHOR: API_HELPER_UNIFIED (BEGIN) */
// Unified API helper: sends token in header AND as ?token= (bridge for old backend)
async function api(path, options = {}) {
  const pathRaw    = String(path || '');
  const isAbsolute = /^https?:\/\//i.test(pathRaw);

  // Base = state.api or current origin, without trailing slash
  const baseRaw   = String(state.api || '') || location.origin;
  const baseClean = baseRaw.replace(/\/+$/,'');

  // Build final URL
  let url = isAbsolute ? pathRaw : (baseClean + (pathRaw.startsWith('/') ? '' : '/') + pathRaw);

  // Clone options and normalise headers
  const opts = { ...options };
  opts.headers = { ...(options.headers || {}) };

  // Auto JSON stringify for plain object bodies (unless already string/FormData)
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
  }
  if (opts.body != null && typeof opts.body === 'string') {
    if (!opts.headers['Content-Type'] && !opts.headers['content-type']) {
      opts.headers['Content-Type'] = 'application/json';
    }
  }

  // Resolve token from state (or helper, if present)
  const token =
    state.token ||
    (typeof getToken === 'function' ? getToken() : '');

  // Always attach Authorization if we have a token
  if (token && !opts.headers['Authorization'] && !opts.headers['authorization']) {
    opts.headers['Authorization'] = 'Bearer ' + token;
  }

  // Also append ?token= for same-origin URLs (old backend expects it)
  if (token && !url.includes('token=')) {
    try {
      const u = new URL(url, baseClean + '/');
      const baseURL = new URL(baseClean, baseClean + '/');

      if (u.origin === baseURL.origin) {
        if (!u.searchParams.get('token')) {
          u.searchParams.set('token', token);
        }
        url = u.toString();
      }
    } catch (_) {
      // If URL parsing fails, just skip adding ?token=
    }
  }

  const res = await fetch(url, opts);

  // Centralised 401 handling
  if (res.status === 401) {
    // IMPORTANT:
    // Some endpoints may return 401 while the session token is still valid.
    // Do NOT force-log-out for every 401 (or you get "thrown out" after login).
    //
    // Only force logout when the auth identity itself is invalid (e.g. /me, /auth/*)
    const pathBase = (() => {
      try {
        return isAbsolute ? (new URL(pathRaw).pathname || '') : pathRaw.split('?')[0];
      } catch (_) {
        return pathRaw.split('?')[0];
      }
    })();

    const forceLogout =
      pathBase === '/me' ||
      pathBase.startsWith('/auth/') ||
      pathBase.startsWith('/me/');

    if (forceLogout) {
      try { setToken(''); } catch (_) {}
      try { state.me = null; } catch (_) {}

      if (location.hash !== '#login') {
        navTo('#login');
        showMsg('Session expired or invalid. Please sign in again.', 'warn');
      }

      throw new Error('401 Unauthorized');
    }

    // Non-auth endpoints (like /nc/alerts) should NOT kill the session
    // Return an empty object so dashboards/widgets can fail softly.
    return {};
  }

  // For other non-2xx responses, throw a readable error
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try {
      const t = await res.text();
      if (t) msg = t;
    } catch (_) {}
    throw new Error(msg);
  }

  // Try to parse JSON; if no body, just return {}
  try {
    return await res.json();
  } catch (_) {
    return {};
  }
}
/* ANCHOR: API_HELPER_UNIFIED (END) */


  async function viewLocations(){
  setCrumbs('Locations');

  // NOTE: for now we show the add-form to everyone (so you 100% see the dropdown).
  const r = (state.me?.role || '').toUpperCase();
  const isAdmin = (r === 'ADMIN' || r === 'ADMIN_GLOBAL');

  // Allowed location types for dropdown
  const LOC_TYPES = [
    'ROOM',
    'FRIDGE',
    'FIRE',
    'FIRE_EQUIPMENT',
    'ASSET',
    'RECEPTION',
    'RECEPTION_RESIDENTS'
  ];
  const typeOptionsHtml = LOC_TYPES
    .map(t => `<option value="${t}">${t}</option>`)
    .join('');

  $('#view').innerHTML = `
    <div class="card">
      <h2>Locations</h2>

      <div class="row" style="margin-bottom:10px;gap:10px;flex-wrap:wrap">
        <div class="grid cols-3" style="flex:1;min-width:260px;gap:8px">
          <div>
            <label>Name</label>
            <input id="locNameNew" class="input" placeholder="e.g. SHU Room 1">
          </div>
          <div>
            <label>Type</label>
            <select id="locTypeNew" class="input">
              ${typeOptionsHtml}
            </select>
          </div>
          <div style="display:flex;align-items:flex-end">
            <button id="btnNewLoc" class="btn">Add Location</button>
          </div>
        </div>

        <button id="btnRefreshLoc" class="btn refresh small">Refresh</button>
      </div>

      <div id="locTable" style="margin-top:10px"></div>
    </div>
  `;

  async function load(){
    try{
      const j = await api('/locations');
      const items = j.items || j || [];
      if (!items.length){
        $('#locTable').innerHTML = `<div class="empty">No locations defined yet.</div>`;
        return;
      }

      const rows = items.map(loc => {
        const id     = loc.id;
        const name   = loc.name || '';
        const type   = (loc.type || '').toUpperCase();
        const active = !!loc.active;

        return `
          <tr data-id="${escapeHtml(String(id))}">
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(type)}</td>
            <td style="text-align:center">
              <label class="switch">
                <input type="checkbox" data-act="active" ${active ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </td>
            <td class="t-right">
              <div style="display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap">
                <button class="btn ghost small" data-act="edit">Edit</button>
                ${isAdmin ? `<button class="btn destructive small" data-act="delete">Delete</button>` : ''}
              </div>
            </td>
          </tr>`;
      }).join('');

      $('#locTable').innerHTML = `
        <div class="table-wrap">
          <table class="table nolines">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Active</th>
                <th class="t-right">Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      const tbody = $('#locTable').querySelector('tbody');

      // Toggle "active"
      tbody.querySelectorAll('input[data-act="active"]').forEach(chk => {
        chk.addEventListener('change', async () => {
          const tr = chk.closest('tr');
          const id = tr.getAttribute('data-id');
          try{
            await api('/locations/' + encodeURIComponent(id), {
              method: 'PATCH',
              body: JSON.stringify({ active: !!chk.checked })
            });
            showMsg('Location updated.','ok');
          }catch(e){
            showMsg(e?.message || String(e), 'err');
            chk.checked = !chk.checked;
          }
        });
      });

      // Delete
      tbody.querySelectorAll('button[data-act="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr');
          const id = tr.getAttribute('data-id');
          if (!confirm('Delete this location?')) return;
          try{
            await api('/locations/' + encodeURIComponent(id), { method:'DELETE' });
            tr.remove();
          }catch(e){
            showMsg(e?.message || String(e), 'err');
          }
        });
      });

      // Simple inline edit (name only)
      tbody.querySelectorAll('button[data-act="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const tr = btn.closest('tr');
          const id = tr.getAttribute('data-id');
          const currName = (tr.children[0]?.textContent || '').trim();
          const newName = prompt('Location name:', currName);
          if (!newName || newName === currName) return;

          (async () => {
            try{
              await api('/locations/' + encodeURIComponent(id), {
                method: 'PATCH',
                body: JSON.stringify({ name: newName })
              });

              tr.children[0].textContent = newName;
              showMsg('Location updated.','ok');
            }catch(e){
              showMsg(e?.message || String(e), 'err');
            }
          })();
        });
      });

    }catch(e){
      $('#locTable').innerHTML = `<div class="empty">Failed to load locations: ${escapeHtml(e.message || String(e))}</div>`;
    }
  }

  $('#btnRefreshLoc')?.addEventListener('click', load);

  $('#btnNewLoc')?.addEventListener('click', async () => {
    try{
      const nameEl = $('#locNameNew');
      const typeEl = $('#locTypeNew');
      const name = (nameEl?.value || '').trim();
      const type = (typeEl?.value || 'ROOM').trim().toUpperCase();

      if (!name) {
        showMsg('Enter a location name.','err');
        return;
      }

      await api('/locations', {
        method: 'POST',
        body: JSON.stringify({ name, type })
      });

      if (nameEl) nameEl.value = '';
      showMsg('Location created.','ok');
      load();
    }catch(e){
      showMsg(e?.message || String(e), 'err');
    }
  });

  load();
}



  async function viewQRCodes(){
    setCrumbs('QR Codes');
    $('#view').innerHTML = `<div class="card"><h2>Generate QR / NFC</h2>
      <div class="grid cols-3">
        <div><label>Location</label><select id="locSel" class="input"><option value="">Loading…</option></select></div>
        <div style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap">
          <button id="create" class="btn">Create</button>
          <button id="copyTap" class="btn ghost">Copy Tap URL</button>
        </div>
      </div>
      <div id="qrOut" style="margin-top:10px"></div></div>`;

    let LOCS=[]; try{
      const j=await api('/locations'); LOCS=j.items||[];
      const sel=$('#locSel');
      sel.innerHTML = `<option value="">(select)</option>`+LOCS.map(x=>`<option value="${x.id}">${escapeHtml(x.name)} (${escapeHtml(x.type||'')})</option>`).join('');
    }catch(e){ showMsg('Failed to load locations: '+(e.message||e),'err') }

    let lastTapUrl=''; let lastQrDataUrl='';

    $('#create').onclick = async ()=>{
      try{
        const id=parseInt($('#locSel').value,10);
        if(!id) return showMsg('Choose a location','err');

        const j=await api('/qrcodes',{method:'POST', body:JSON.stringify({ locationId:id })});
        const loc = LOCS.find(x => String(x.id) === String(id));
// SPA route MUST include the token so #report can resolve the exact tag
const base  = location.origin.replace(/\/+$/, '');
const token = String(j.token || '').trim();    // returned by POST /qrcodes
const type  = (loc?.type || '').toUpperCase(); // FIRE / FRIDGE / ROOM / RECEPTION / ASSET

// Reception kiosk URL (server-rendered visitor page)
const receptionUrl =
  (String(j.urlTapReception || '').trim()) ||
  `${base}/tap/reception/${encodeURIComponent(token)}`;

// Default SPA auto URL for everything else
const appAuto = `${base}/#report?token=${encodeURIComponent(token)}`
  + (id         ? `&loc=${encodeURIComponent(id)}`   : '')
  + (loc?.name  ? `&name=${encodeURIComponent(loc.name)}` : '')
  + (type       ? `&type=${encodeURIComponent(type)}` : '');

// For RECEPTION locations, Auto must be the kiosk.
// For all other types, Auto is the SPA #report URL.
let urlAuto = appAuto;
if (type === 'RECEPTION') {
  urlAuto = receptionUrl;
}

lastTapUrl = urlAuto;


        // enable copy button
        $('#copyTap').onclick = async ()=>{
          try{
            if(!lastTapUrl){ showMsg('Create a QR first.','warn'); return }
            await navigator.clipboard.writeText(lastTapUrl);
            showMsg('Tap URL copied.', 'ok');
          }catch(e){ showMsg('Copy failed: '+(e.message||e),'err') }
        };

        $('#qrOut').innerHTML = `
          <div class="kv" style="margin-top:8px">
            <div class="muted">Token</div><div><code>${escapeHtml(j.token)}</code></div>
            <div class="muted">Auto</div><div><a href="${urlAuto}" target="_blank">${urlAuto}</a></div>
            <div class="muted">Fridge</div><div><a href="${j.urlTapFridge||''}" target="_blank">${j.urlTapFridge||'-'}</a></div>
            <div class="muted">Fire</div><div><a href="${j.urlTapFire||''}" target="_blank">${j.urlTapFire||'-'}</a></div>
            <div class="muted">Reception</div><div><a href="${j.urlTapReception||''}" target="_blank">${j.urlTapReception||'-'}</a></div>
          </div>
          <div style="margin-top:12px">
            <label class="muted">QR / NFC target</label>
            <select id="qrTarget" class="input">
  <option value="${urlAuto}">Auto</option>
  ${type==='FRIDGE'
    ? `<option value="${base}/#report?token=${encodeURIComponent(token)}&type=FRIDGE&loc=${encodeURIComponent(id)}${loc?.name?`&name=${encodeURIComponent(loc.name)}`:''}">Fridge</option>`
    : ''}
  ${type==='FIRE'
    ? `<option value="${base}/#report?token=${encodeURIComponent(token)}&type=FIRE&loc=${encodeURIComponent(id)}${loc?.name?`&name=${encodeURIComponent(loc.name)}`:''}">Fire</option>`
    : ''}
  ${type==='RECEPTION'
    ? `<option value="${receptionUrl}">Reception kiosk</option>`
    : ''}
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
              <div class="muted" style="margin-top:8px">Web NFC works on recent Android Chrome over HTTPS.</div>
            </div>
          </div>`;

        const tgtSel=$('#qrTarget'); const qrLink=$('#qrLink'); const qrCanvas=$('#qrCanvas');

        function renderQR(url){
          qrCanvas.innerHTML='';
          if(!window.QRCode){ qrLink.replaceChildren(Object.assign(document.createElement('a'), {
  href: url, target: '_blank', rel: 'noopener', textContent: url
}));
 return }
          new QRCode(qrCanvas,{ text:url, width:240, height:240, correctLevel:QRCode.CorrectLevel.M });
          qrLink.innerHTML=`<a href="${url}" target="_blank">${url}</a>`;
          setTimeout(()=>{
            const img=qrCanvas.querySelector('img,canvas');
            if(img && img.tagName==='IMG') lastQrDataUrl=img.src;
            else if(img && img.tagName==='CANVAS') lastQrDataUrl=img.toDataURL('image/png');
          }, 100);
        }

        renderQR($('#qrTarget').value);
        tgtSel.onchange=()=>{ lastTapUrl=tgtSel.value; renderQR(tgtSel.value) };

        $('#dlPng').onclick = ()=>{ const img=$('#qrCanvas').querySelector('img,canvas'); if(!img) return; let dataUrl=''; if(img.tagName==='CANVAS') dataUrl=img.toDataURL('image/png'); else if(img.tagName==='IMG') dataUrl=img.src; if(dataUrl){ const a=document.createElement('a'); a.href=dataUrl; a.download='ernos-qr.png'; document.body.appendChild(a); a.click(); a.remove() } };
        $('#printQR').onclick = () => {
  if (!lastQrDataUrl) {
    showMsg('Generate a QR first.', 'err');
    return;
  }

  const targetUrl = $('#qrTarget').value;

  // 🔹 Use the selected LOCATION (LOCS + #locSel), NOT the QR target dropdown
  let titleText = 'Location QR';
  try {
    const locSel = $('#locSel');
    const selectedId = locSel && locSel.value ? parseInt(locSel.value, 10) : 0;

    if (selectedId) {
      const locObj = LOCS.find(x => Number(x.id) === selectedId);
      if (locObj) {
        let nm = (locObj.name || '').trim();
        const t  = (locObj.type || '').trim();
        if (!nm) nm = 'Location';
        titleText = nm + (t ? ` (${t})` : '');
      }
    }
  } catch (_) {
    // fall back to "Location QR"
  }

  try {
    let iframe = document.getElementById('ernos-print-frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'ernos-print-frame';
      Object.assign(iframe.style, {
        position: 'fixed',
        right: '0',
        bottom: '0',
        width: '0',
        height: '0',
        border: '0',
        visibility: 'hidden'
      });
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(
      `<!doctype html><meta charset='utf-8'><title>QR</title>` +
      `<style>
        @page{size:auto;margin:12mm}
        body{font-family:system-ui,sans-serif;padding:0;margin:0}
        .wrap{
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          padding:16px;
          text-align:center;
        }
        .title{
          font-size:16px;
          font-weight:700;
          margin-bottom:10px;
        }
        img.qr{
          width:260px;
          height:260px;
          image-rendering:pixelated;
        }
        .url{
          margin-top:8px;
          font-size:11px;
          color:#000;
          word-break:break-all;
          text-align:center;
        }
      </style>
      <div class='wrap'>
        <div class='title'>${escapeHtml(titleText)}</div>
        <img class='qr' src='${lastQrDataUrl}' alt='QR Code'>
        <div class='url'>${escapeHtml(targetUrl)}</div>
      </div>
      <script>
        window.onload = () => {
          try{ window.focus(); window.print(); }catch(_){}
          setTimeout(() => { document.body.innerHTML = ''; }, 500);
        }
      <\/script>`
    );
    doc.close();

    setTimeout(() => {
      try { iframe.remove(); } catch (_) {}
    }, 2000);
  } catch (e) {
    showMsg('Print failed: ' + (e.message || e), 'err');
  }
};

        $('#writeNfc').onclick = async () => {
          try{
            let url = $('#qrTarget').value;
            const u = new URL(url, state.api.replace(/\/+$/,'') + '/');
            url = u.href;
            if (!('NDEFReader' in window)) { showMsg('Web NFC not supported on this device/browser.', 'warn'); return; }
            const ndef = new NDEFReader();
            await ndef.write({ records: [{ recordType: 'url', data: url }] });
            showMsg(`NFC tag written: ${url}`, 'ok');
            if (!/^https:\/\//i.test(url)) { showMsg('Tip: use HTTPS so all phones open it automatically.', 'warn'); }
          }catch(e){
            showMsg(`NFC write failed: ${e?.message || String(e)}`, 'err');
          }
        };
      }catch(e){ showMsg(e.message||String(e),'err') }
    };
  }
// === TAP / Report hub — v2 (no maint box for Reception/Visitors) ===
async function viewReport(){
  // Temporary title until we resolve a location
  setCrumbs('Report');

  // Parse #report?token=...&type=...&loc=...&name=...
  const { params } = getHashQuery();
  const token = String(params.token || '').trim();
  const qType = String(params.type || params.kind || '').trim().toUpperCase();
  const qLoc  = params.loc ? String(params.loc) : '';
  const qName = params.name ? String(params.name) : '';
  const TOKEN = token;              // <-- ADD THIS
  window.__TAP_TOKEN__ = token;    // <-- ADD THIS (keeps /issues/quick working)

  // Resolve token if backend supports it
  let resolved = { type: qType, location_id: qLoc, location_name: qName };
  try{
    if (token){
      const j = await api(`/tap/resolve?token=${encodeURIComponent(token)}`);
      // expected: { type, location_id, location_name, ... }
      if (j && (j.type || j.location_id || j.location_name)) resolved = { ...resolved, ...j };
    }
  }catch(_){ /* fall back to query hints */ }

  const TYPE     = String(resolved.type || '').toUpperCase();
  const LOC_ID   = resolved.location_id ? String(resolved.location_id) : (qLoc || '');
  const LOC_NAME = resolved.location_name || qName || (LOC_ID ? `Location #${LOC_ID}` : 'Location');

  // Finalize header
  setCrumbs(LOC_NAME);

  // Role/category (for Nursing-only actions on ROOM)
  const role = String(state.me?.role || '').toUpperCase();
  const cat  = String(state.me?.category || '').toUpperCase();

  const isAdmin     = (role === 'ADMIN' || role === 'ADMIN_GLOBAL');
  const isNursing   = (cat === 'NURSING');
  const isHK        = (cat === 'HOUSEKEEPING');
  const isMaint     = (cat === 'MAINTENANCE');
  const isReception = (cat === 'RECEPTION');

  // === Page skeleton
  $('#view').innerHTML = '';
  const root = document.createElement('div');
  root.className = 'card';
  root.innerHTML = `
    <div class="title">${escapeHtml(LOC_NAME)}</div>
    <div id="tapBody"></div>
  `;
  $('#view').appendChild(root);
  const body = root.querySelector('#tapBody');

  /* -------- Universal Maintenance Quick Box (excluded for RECEPTION/VISITORS) -------- */
function maybeRenderMaintQuickBox(ctxLabel){
  const t = TYPE;
    const skip = (t === 'RECEPTION' || t === 'VISITORS' || t === 'RECEPTION_RESIDENTS');

  if (skip) return;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="title">Report maintenance issue</div>
    <div class="muted" style="margin-bottom:6px">
      Context: ${escapeHtml(ctxLabel || (LOC_NAME + (LOC_ID?` (#${LOC_ID})`:'')))}${TYPE?` · ${escapeHtml(TYPE)}`:''}
    </div>

    <textarea id="tapIssue" class="input" placeholder="Describe the problem… (optional)"></textarea>

    <div style="margin-top:8px; display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:10px">
      <div>
        <label class="muted">Take Photo (camera)</label>
        <input id="tapPhotoCam" type="file" class="input" accept="image/*" capture="environment">
      </div>
      <div>
        <label class="muted">Choose from Files</label>
        <input id="tapPhotoFile" type="file" class="input" accept="image/*">
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:8px;gap:8px;flex-wrap:wrap">
      <button id="tapSend" class="btn">Send</button>
    </div>
  `;
  body.appendChild(card);

  card.querySelector('#tapSend')?.addEventListener('click', async ()=>{
    const txt   = (card.querySelector('#tapIssue')?.value || '').trim();
    const fCam  = card.querySelector('#tapPhotoCam')?.files?.[0]  || null;
    const fFile = card.querySelector('#tapPhotoFile')?.files?.[0] || null;

    // Collect up to two photos (camera + file)
    const files = [fCam, fFile].filter(Boolean);

    const base = (state.api || location.origin).replace(/\/+$/,'');
    const headersAuth = state.token ? { 'Authorization':'Bearer '+state.token } : {};
    const photoUrls = [];

    try{
      // (1) upload each selected photo (if any)
      for (const file of files){
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(base + '/uploads', {
          method: 'POST',
          headers: headersAuth,          // do NOT set Content-Type manually
          body: fd
        });
        const j = await r.json().catch(()=> ({}));
        if (!r.ok) throw new Error((j && (j.error||j.message)) || ('HTTP '+r.status));
        photoUrls.push(j.url || j.path || '');
      }

      // (2) create the maintenance issue with TAP context
      const ctxLine = `[From TAP @ ${LOC_NAME}${LOC_ID?` (#${LOC_ID})`:''}${TYPE?` · ${TYPE}`:''}]`;
      const photoLines = photoUrls.filter(Boolean).map(u => `Photo: ${u}`);
      const text = [ctxLine, txt, ...photoLines].filter(Boolean).join('\n');

      await api('/issues', {
        method: 'POST',
        body: JSON.stringify({ text: text || 'From TAP', category: 'MAINTENANCE' })
      });

      // (3) reset UI
      if (card.querySelector('#tapIssue')) card.querySelector('#tapIssue').value = '';
      try { card.querySelector('#tapPhotoCam').value  = ''; } catch(_){}
      try { card.querySelector('#tapPhotoFile').value = ''; } catch(_){}

      showMsg('Issue sent.','ok');
    }catch(e){
      showMsg(e.message || String(e), 'err');
    }
  });
}

  // FIRE → “Checked OK” (+ optional note) (uses backend /ff/fire/check)
if (TYPE === 'FIRE') {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="title">Fire Check</div>
    <div class="grid cols-3" style="margin-top:6px">
      <div>
        <label>Kind</label>
        <select id="fiKind" class="input">
          <option value="PANEL">Fire panel</option>
          <option value="EXTINGUISHER">Extinguisher</option>
          <option value="DRILL">Emergency drill completed</option>
        </select>
      </div>
      <div><label>Note (optional)</label><input id="fiNote" class="input" placeholder="e.g., Pressure OK"></div>
      <div style="display:flex;align-items:flex-end;justify-content:flex-end">
        <button id="fiMark" class="btn">Mark Checked OK</button>
      </div>
    </div>
    <div class="muted" style="margin-top:6px">This records a fire check log entry.</div>
  `;
  body.appendChild(card);

  card.querySelector('#fiMark')?.addEventListener('click', async ()=>{
    const note = (card.querySelector('#fiNote')?.value || '').trim();
    const kind = String(card.querySelector('#fiKind')?.value || 'PANEL').toUpperCase();
    try{
      // Call your plugin route:
      await api('/ff/fire/check', {
        method:'POST',
        body: JSON.stringify({
          token: TOKEN,       // from the TAP context earlier in viewReport()
          kind,
          note
        })
      });

      showMsg('Fire check recorded.', 'ok');
      card.querySelector('#fiNote').value = '';
    }catch(e){
      showMsg(e.message || String(e), 'err');
    }
  });

  // Maintenance quick box also available for FIRE
  maybeRenderMaintQuickBox('Fire');
}
  

// ASSET → “checked and cleaned” + maintenance (uses backend /ff/asset/check)
if (TYPE === 'ASSET') {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="title">Asset Check</div>
    <div class="grid cols-3" style="margin-top:6px">
      <div><label>Note (optional)</label><input id="asNote" class="input" placeholder="e.g., Wiped & disinfected"></div>
      <div style="display:flex;align-items:flex-end;justify-content:flex-end">
        <button id="asMark" class="btn">Mark Checked & Cleaned</button>
      </div>
    </div>`;
  body.appendChild(card);

  card.querySelector('#asMark')?.addEventListener('click', async ()=>{
    const note = (card.querySelector('#asNote')?.value || '').trim();
    try{
      await api('/ff/asset/check', {
        method:'POST',
        body: JSON.stringify({ token: TOKEN, note })
      });
      const nm = LOC_NAME ? ` ${LOC_NAME}` : '';
      showMsg(`Asset${nm} checked and cleaned.`, 'ok');
      card.querySelector('#asNote').value = '';
    }catch(e){
      showMsg(e?.message || String(e),'err');
    }
  });

  maybeRenderMaintQuickBox('Maintenance');
}


// FRIDGE → record °C + maintenance (uses backend /ff/fridge/temp)
if (TYPE === 'FRIDGE') {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="title">Fridge Temperature</div>
    <div class="grid cols-3" style="margin-top:6px">
      <div>
        <label>Temperature (°C)</label>
        <input id="frC" type="number" step="0.1" class="input" placeholder="e.g., 3.8">
      </div>
      <div>
        <label>Note (optional)</label>
        <input id="frNote" class="input" placeholder="e.g., Door opened briefly">
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:flex-end">
        <button id="frSave" class="btn">Save Reading</button>
      </div>
    </div>
    <div class="muted" style="margin-top:6px">Acceptable range is typically 2–8°C (configure in backend if needed).</div>
  `;
  body.appendChild(card);

  card.querySelector('#frSave')?.addEventListener('click', async ()=>{
    const celsius = parseFloat(card.querySelector('#frC')?.value || 'NaN');
    const note    = (card.querySelector('#frNote')?.value || '').trim();
    if (!Number.isFinite(celsius)) { showMsg('Enter a valid temperature in °C.','err'); return; }
    try{
      await api('/ff/fridge/temp', {
        method:'POST',
        body: JSON.stringify({ token: TOKEN, celsius, note })
      });
      showMsg('Fridge temperature saved.', 'ok');
      card.querySelector('#frC').value = '';
      card.querySelector('#frNote').value = '';
    }catch(e){ showMsg(e?.message||String(e),'err'); }
  });

  maybeRenderMaintQuickBox('Maintenance');
}

// FIRE_EQUIPMENT → mini-audit (HIQA-light) + optional maintenance (uses backend /ff/fire/audit)
if (TYPE === 'FIRE_EQUIPMENT' || TYPE === 'FIRE-EQUIPMENT' || TYPE === 'FIRE_EQUIP') {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="title">Fire Equipment Check</div>
    <div class="grid cols-3" style="margin-top:6px">
      <div>
        <label>Working</label>
        <select id="faWorking" class="input">
          <option value="YES">Yes</option>
          <option value="NO">No</option>
        </select>
      </div>
      <div>
        <label>Last serviced (date)</label>
        <input id="faLast" type="date" class="input">
      </div>
      <div>
        <label>Next service due (date)</label>
        <input id="faNext" type="date" class="input">
      </div>
      <div style="grid-column:1 / span 2">
        <label>Note (optional)</label>
        <input id="faNote" class="input" placeholder="e.g., Pressure gauge in green; signage OK">
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:flex-end">
        <button id="faSave" class="btn">Save Check</button>
      </div>
    </div>
    <div class="muted" style="margin-top:6px">
      Checklist (HIQA-light): device present & unobstructed; indicator/gauge OK; signage present & legible; service labels present; dates valid; mounting secure; access clear.
    </div>
  `;
  body.appendChild(card);

  card.querySelector('#faSave')?.addEventListener('click', async ()=>{
    const working = (card.querySelector('#faWorking')?.value || 'YES') === 'YES';
    const last_service = (card.querySelector('#faLast')?.value || '').trim() || null;
    const next_service = (card.querySelector('#faNext')?.value || '').trim() || null;
    const note = (card.querySelector('#faNote')?.value || '').trim() || null;

    try{
      await api('/ff/fire/audit', {
        method:'POST',
        body: JSON.stringify({ token: TOKEN, working, last_service, next_service, note })
      });
      showMsg('Fire equipment check saved.', 'ok');
      card.querySelector('#faNote').value = '';
    }catch(e){ showMsg(e?.message||String(e),'err'); }
  });

  // Quick maintenance still available here
  maybeRenderMaintQuickBox('Maintenance');
}

  // RECEPTION_RESIDENTS → residents-only reception tap (no maintenance box)
  if (TYPE === 'RECEPTION_RESIDENTS') {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">Reception · Residents</div>
      <div class="grid cols-3" style="margin-top:6px">
        <div><label>Resident name</label><input id="rrName" class="input" placeholder="e.g., Sr Teresa"></div>
        <div><label>Escort (optional)</label><input id="rrEscort" class="input" placeholder="e.g., Family"></div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end">
          <button id="rrToggle" class="btn">Toggle OUT / IN</button>
        </div>
      </div>
      <div class="muted" style="margin-top:6px">Checks a resident OUT (first tap) or IN (second tap) at reception.</div>
    `;
    body.appendChild(card);

    card.querySelector('#rrToggle')?.addEventListener('click', async ()=>{
      const resident = (card.querySelector('#rrName')?.value || '').trim();
      const escort   = (card.querySelector('#rrEscort')?.value || '').trim();
      if (!resident) { showMsg('Enter resident name to continue.','err'); return; }
      try{
        const base = (state.api || location.origin).replace(/\/+$/, '');
        const headers = { 'Content-Type': 'application/json' };
        if (state.token) headers['Authorization'] = 'Bearer ' + state.token;

        // We already have TOKEN from the TAP context earlier in viewReport()
        const r = await fetch(base + '/resident/tap', {
          method: 'POST',
          headers,
          body: JSON.stringify({ token: TOKEN, resident, escort })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));

        // Server returns a friendly string already:
        // OUT:  "Enjoy your outing, see you soon <name>!"
        // IN:   "Nice to see you back, <name>! We hope you enjoyed your outing."
        showMsg(j.msg || 'Saved.', 'ok');

        // Keep a cached name to use in other farewell toasts if needed
        try { localStorage.setItem('ernos_last_visitor_name', resident); } catch(_){}

        // Clear inputs
        card.querySelector('#rrName').value   = '';
        card.querySelector('#rrEscort').value = '';
      }catch(e){
        showMsg(e.message || String(e), 'err');
      }
    });

    // IMPORTANT: No maintenance quick box for this type
  }




  
  // RECEPTION / VISITORS → explicitly no maintenance box
if (TYPE === 'RECEPTION' || TYPE === 'VISITORS') {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="title">${escapeHtml(TYPE)}</div>
    <div class="muted">No maintenance actions here. Use Visitors module for check-in/out.</div>
  `;
  body.appendChild(card);
}

}
// === TAP / Report hub — HK-aware wrapper ===
async function viewReportHK() {
  // Temporary title until we resolve a location
  setCrumbs('Report');

  // Parse #report?token=...&type=...&loc=...&name=...
  const { params } = getHashQuery();
  const token = String(params.token || '').trim();
  const qType = String(params.type || params.kind || '').trim().toUpperCase();
  const qLoc  = params.loc ? String(params.loc) : '';
  const qName = params.name ? String(params.name) : '';

  const TOKEN = token;
  window.__TAP_TOKEN__ = token;    // keeps /issues/quick etc. working

  // Resolve token via backend if available
  let resolved = { type: qType, location_id: qLoc, location_name: qName };
  try {
    if (token) {
      const j = await api(`/tap/resolve?token=${encodeURIComponent(token)}`);
      // expected: { type, location_id, location_name, ... }
      if (j && (j.type || j.location_id || j.location_name)) {
        resolved = { ...resolved, ...j };
      }
    }
  } catch (_) {
    // fall back to hints from query string
  }

  const TYPE     = String(resolved.type || '').toUpperCase();
  const LOC_ID   = resolved.location_id ? String(resolved.location_id) : (qLoc || '');
  const LOC_NAME = resolved.location_name || qName || (LOC_ID ? `Location #${LOC_ID}` : 'Location');

  // Finalize header (crumbs)
  setCrumbs(LOC_NAME);

  // Normalised role/category – same logic as the rest of the app
  const me   = state.me || {};
  const role = String(me.role || '').toUpperCase();
  const cat  = normCatFrom(me);   // e.g. 'NURSING', 'HOUSEKEEPING', 'MAINTENANCE', 'RECEPTION'

  const isAdmin     = (role === 'ADMIN' || role === 'ADMIN_GLOBAL');
  const isNursing   = (cat === 'NURSING');
  const isHK        = (cat === 'HOUSEKEEPING');
  const isMaint     = (cat === 'MAINTENANCE');
  const isReception = (cat === 'RECEPTION');

  // === Page skeleton
  $('#view').innerHTML = '';
  const root = document.createElement('div');
  root.className = 'card';
  root.innerHTML = `
    <div class="title">${escapeHtml(LOC_NAME)}</div>
    <div id="tapBody"></div>
  `;
  $('#view').appendChild(root);
  const body = root.querySelector('#tapBody') || root;

  function maybeRenderMaintQuickBox(ctxLabel) {
  const allowed =
    isAdmin ||
    ['NURSING', 'HOUSEKEEPING', 'MAINTENANCE', 'AUDITOR', 'MANAGER'].includes(cat);

  if (!allowed) return;

  const card = document.createElement('div');
  card.className = 'card';

  const ctxLine =
    `[From TAP @ ${LOC_NAME}${LOC_ID ? ` (#${LOC_ID})` : ''}${TYPE ? ` · ${TYPE}` : ''}]`;

  card.innerHTML = `
    <div class="title">Report maintenance issue</div>
    <div class="muted" style="margin-bottom:6px">
      Context: ${escapeHtml(LOC_NAME)}${LOC_ID ? ` (#${escapeHtml(LOC_ID)})` : ''}${TYPE ? ` · ${escapeHtml(TYPE)}` : ''}${ctxLabel ? ` · ${escapeHtml(ctxLabel)}` : ''}
    </div>

    <textarea id="tapIssue" class="input" placeholder="Describe the problem… (optional)"></textarea>

    <div style="margin-top:8px">
      <label class="muted">Attach photo (optional)</label>

      <input id="tapPhotoCam"  type="file" accept="image/*" capture="environment" style="display:none">
      <input id="tapPhotoFile" type="file" accept="image/*"                        style="display:none">

      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
        <button class="btn small" type="button" id="tapBtnCam">Use Camera</button>
        <button class="btn small ghost" type="button" id="tapBtnFile">Choose File</button>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:8px;gap:8px;flex-wrap:wrap">
      <button id="tapSend" class="btn">Send</button>
    </div>
  `;
  body.appendChild(card);

  card.querySelector('#tapBtnCam')?.addEventListener('click', () => {
    card.querySelector('#tapPhotoCam')?.click();
  });
  card.querySelector('#tapBtnFile')?.addEventListener('click', () => {
    card.querySelector('#tapPhotoFile')?.click();
  });

  card.querySelector('#tapSend')?.addEventListener('click', async () => {
    const txt   = (card.querySelector('#tapIssue')?.value || '').trim();
    const fCam  = card.querySelector('#tapPhotoCam')?.files?.[0]  || null;
    const fFile = card.querySelector('#tapPhotoFile')?.files?.[0] || null;

    if (!txt && !fCam && !fFile) {
      showMsg('Please describe the issue or attach a photo first.','err');
      return;
    }

    const base = (state.api || location.origin).replace(/\/+$/, '');
    const headersAuth = state.token ? { 'Authorization': 'Bearer ' + state.token } : {};
    const photoFiles = [fCam, fFile].filter(Boolean);
    const photoUrls  = [];

    try {
      for (const file of photoFiles) {
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(base + '/uploads', { method: 'POST', headers: headersAuth, body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j && (j.error || j.message)) || ('HTTP ' + r.status));
        photoUrls.push(j.url || j.path || '');
      }

      const photoLines = photoUrls.filter(Boolean).map(u => `Photo: ${u}`);
      const text = [ctxLine, txt, ...photoLines].filter(Boolean).join('\n');

      await api('/issues', {
        method: 'POST',
        body: JSON.stringify({ text: text || 'From TAP', category: 'MAINTENANCE' })
      });

      if (card.querySelector('#tapIssue')) card.querySelector('#tapIssue').value = '';
      try { card.querySelector('#tapPhotoCam').value  = ''; } catch(_) {}
      try { card.querySelector('#tapPhotoFile').value = ''; } catch(_) {}

      showMsg('Issue sent.','ok');
    } catch (e) {
      showMsg(e.message || String(e), 'err');
    }
  });
}


      // === TYPE-specific behaviour ===

  // FIRE → Fire check + maintenance
  if (TYPE === 'FIRE') {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">Fire Check</div>
      <div class="grid cols-3" style="margin-top:6px">
        <div>
          <label>Kind</label>
          <select id="fiKind" class="input">
            <option value="PANEL">Fire panel</option>
            <option value="EXTINGUISHER">Extinguisher</option>
            <option value="DRILL">Emergency drill completed</option>
          </select>
        </div>
        <div>
          <label>Note (optional)</label>
          <input id="fiNote" class="input" placeholder="e.g. Pressure OK">
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end">
          <button id="fiMark" class="btn">Mark Checked OK</button>
        </div>
      </div>
      <div class="muted" style="margin-top:6px">
        This records a fire check log entry.
      </div>
    `;
    body.appendChild(card);

    card.querySelector('#fiMark')?.addEventListener('click', async () => {
      const note = (card.querySelector('#fiNote')?.value || '').trim();
      const kind = String(card.querySelector('#fiKind')?.value || 'PANEL').toUpperCase();
      try {
        await api('/ff/fire/check', {
          method: 'POST',
          body: JSON.stringify({ token: TOKEN, kind, note })
        });
        showMsg('Fire check recorded.', 'ok');
        card.querySelector('#fiNote').value = '';
      } catch (e) {
        showMsg(e.message || String(e), 'err');
      }
    });

    // Maintenance quick box also available for FIRE
    maybeRenderMaintQuickBox('Fire');
    return;
  }

  // ROOM → Nursing/Admin auto-check; HK toggles cleaning + goes to HK
  if (TYPE === 'ROOM') {
  // 1) Nursing/Admin: immediately log room check
  if (isNursing || isAdmin) {
    (async () => {
      try {
        await api('/ff/room/check', {
          method: 'POST',
          body: JSON.stringify({ token: TOKEN })
        });

        const label = /corridor|toilet|bathroom|store|sluice|day room|dining|lounge|office/i.test(String(LOC_NAME || ''))
          ? 'Location checked'
          : 'Resident checked';

        showMsg(`${label} at ${LOC_NAME}.`, 'ok');
      } catch (e) {
        showMsg(e?.message || String(e), 'err');
      }
    })();
  }

    // 2) Housekeeping: toggle cleaning (start/finish) and go to HK screen
    if (isHK) {
      (async () => {
        try {
          const res = await api('/tap/hk/toggle', {
            method: 'POST',
            body: JSON.stringify({ token: TOKEN })
          });

          const mode = String(res?.mode || '').toLowerCase();
          const baseRoomName = LOC_NAME || 'room';

          const msg =
            mode === 'finished'
              ? `Housekeeping for ${baseRoomName} – cleaning finished.`
              : `Housekeeping for ${baseRoomName} – cleaning started.`;

          // Show this AFTER nav, on the Housekeeping page
          if (typeof queueFlash === 'function') {
            queueFlash(msg, 'ok');
          }

          navTo('#hk');
        } catch (e) {
          showMsg(e?.message || String(e), 'err');
        }
      })();

      // HK does not stay on the Report screen
      return;
    }

    // 3) Maintenance quick box only for non-HK roles
    maybeRenderMaintQuickBox('Room');
    return;
  }

  // ASSET → Asset maintenance + maintenance quick box
  if (TYPE === 'ASSET') {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">Asset Check</div>
      <div class="muted" style="margin-bottom:6px">
        You are checking an asset at ${escapeHtml(LOC_NAME)}.
      </div>
      <textarea id="assetNote" class="input"
        placeholder="Describe issue or action taken… (optional)"></textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button id="assetSave" class="btn">Save</button>
      </div>
    `;
    body.appendChild(card);

    card.querySelector('#assetSave')?.addEventListener('click', async () => {
      const note = (card.querySelector('#assetNote')?.value || '').trim();
      try {
        await api('/ff/asset/check', {
          method: 'POST',
          body: JSON.stringify({ token: TOKEN, note })
        });
        showMsg('Asset check recorded.', 'ok');
        card.querySelector('#assetNote').value = '';
      } catch (e) {
        showMsg(e.message || String(e), 'err');
      }
    });

    maybeRenderMaintQuickBox('Asset');
    return;
  }

  // FRIDGE → record °C + maintenance (uses backend /ff/fridge/temp)
  if (TYPE === 'FRIDGE') {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">Fridge Temperature</div>
      <div class="grid cols-3" style="margin-top:6px">
        <div>
          <label>Temperature (°C)</label>
          <input id="frC" type="number" step="0.1" class="input"
                 placeholder="e.g. 4.0">
        </div>
        <div>
          <label>Note (optional)</label>
          <input id="frNote" class="input"
                 placeholder="e.g. Fridge OK, within range">
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end">
          <button id="frSave" class="btn">Save</button>
        </div>
      </div>
      <div class="muted" style="margin-top:6px">
        Use this to record fridge temperatures during your checks.
      </div>
    `;
    body.appendChild(card);

    card.querySelector('#frSave')?.addEventListener('click', async () => {
      const temp = parseFloat(card.querySelector('#frC')?.value || '');
      const note = (card.querySelector('#frNote')?.value || '').trim();
      if (Number.isNaN(temp)) {
        showMsg('Enter a valid temperature in °C.', 'err');
        return;
      }
      try {
        await api('/ff/fridge/temp', {
          method: 'POST',
          body: JSON.stringify({ token: TOKEN, temp_c: temp, note })
        });
        showMsg('Fridge temperature recorded.', 'ok');
        card.querySelector('#frC').value = '';
        card.querySelector('#frNote').value = '';
      } catch (e) {
        showMsg(e?.message || String(e), 'err');
      }
    });

    maybeRenderMaintQuickBox('Fridge');
    return;
  }

  // RECEPTION / VISITORS → explicitly no maintenance box
  if (TYPE === 'RECEPTION' || TYPE === 'VISITORS') {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title">${escapeHtml(TYPE)}</div>
      <div class="muted">
        No maintenance actions here. Use Visitors module for check-in/out.
      </div>
    `;
    body.appendChild(card);
    return;
  }

  // Fallback: if we don't know the type, at least show maintenance if allowed
  maybeRenderMaintQuickBox('');
}


  async function viewEnvAudit(){
    setCrumbs('Environmental Audit');
    const r=(state.me?.role||'').toUpperCase();
    const c=(state.me?.category||'').toUpperCase();
    const canCreate = (r==='ADMIN' || r==='ADMIN_GLOBAL' || c==='AUDITOR');

    $('#view').innerHTML = `
      <div class="card">
        <h2>Environmental Audit</h2>
        <div class="row" style="margin-bottom:10px; gap:10px">
          ${canCreate ? `<button id="btnNewAudit" class="btn">Start New Audit</button>` : ''}
          <button id="btnRefresh" class="btn refresh small">Refresh</button>
        </div>
        <div class="muted">Pick an audit to run. The “Runner” opens a mobile-friendly page; tap location tags (Auditor TAP) to add locations to the <em>active</em> audit.</div>
        <div id="envTable" style="margin-top:10px"></div>
      </div>`;

    function activeId(){
      try { return parseInt(localStorage.getItem('ernos_current_audit_id')||'0',10) } catch{ return 0 }
    }
    function setActive(id){
      try { localStorage.setItem('ernos_current_audit_id', String(id)); } catch{}
      showMsg('Active audit set to #' + id, 'ok');
      load();
    }
    async function downloadCsv(id){
      try{
        const url = state.api.replace(/\/+$/,'') + '/env/audits/' + encodeURIComponent(id) + '/csv';
        const r = await fetch(url, { headers: { 'Authorization':'Bearer '+state.token } });
        if(!r.ok){ const j = await r.text(); throw new Error(j || ('HTTP '+r.status)); }
        const b = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'audit_' + id + '.csv';
        document.body.appendChild(a); a.click();
        setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 600);
      }catch(e){ showMsg(e.message||String(e), 'err'); }
    }

    async function load(){
      try{
        const j = await api('/env/audits');
        const items = j.items || [];
        if(!items.length){
          $('#envTable').innerHTML = `<div class="empty">No audits yet.</div>`;
          return;
        }
        const aid = activeId();
        const rows = items.map(a=>{
          const isActive = (aid && Number(a.id)===Number(aid));
          const badge = isActive ? `<span class="tag">Active</span>` : '';
          const started = a.started_at ? fmtDT(a.started_at) : '';
          const submitted = a.submitted_at ? fmtDT(a.submitted_at) : '';
          const score = (a.overall_score!=null ? (a.overall_score+'%') : '—');
          return `<tr>
            <td>#${a.id} ${badge}</td>
            <td>${escapeHtml(a.name||('Audit '+a.id))}</td>
            <td>${escapeHtml(String(a.status||'').toUpperCase())}</td>
            <td>${escapeHtml(started)}</td>
            <td>${escapeHtml(submitted)}</td>
            <td>${escapeHtml(a.auditor_name||'')}</td>
            <td>${escapeHtml(score)}</td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <a class="btn ghost small" target="_blank" href="/audit/${a.id}">Runner</a>
                <button class="btn ghost small" data-act="active" data-id="${a.id}">Set active</button>
                <button class="btn ghost small" data-act="csv" data-id="${a.id}">CSV</button>
              </div>
            </td>
          </tr>`;
        }).join('');
        $('#envTable').innerHTML = `
          <div class="table-wrap"><table class="table nolines">
            <thead><tr>
              <th>ID</th><th>Name</th><th>Status</th><th>Started</th><th>Submitted</th><th>Auditor</th><th>Score</th><th>Actions</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`;

        $('#envTable').querySelectorAll('[data-act="active"]').forEach(b=>{
          b.onclick = ()=> setActive(b.getAttribute('data-id'));
        });
        $('#envTable').querySelectorAll('[data-act="csv"]').forEach(b=>{
          b.onclick = ()=> downloadCsv(b.getAttribute('data-id'));
        });

      }catch(e){
        $('#envTable').innerHTML = `<div class="empty">Failed to load audits: ${escapeHtml(e.message||String(e))}</div>`;
      }
    }

    $('#btnRefresh')?.addEventListener('click', load);
    $('#btnNewAudit')?.addEventListener('click', async ()=>{
      try{
        const name = prompt('Audit name (optional):','');
        const j = await api('/env/audits',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name || undefined })});
        try{ localStorage.setItem('ernos_current_audit_id', String(j.id)); }catch{}
        showMsg('Audit created (#'+j.id+'). Open Runner to start answering.', 'ok');
        load();
      }catch(e){ showMsg(e.message||String(e), 'err'); }
    });

    load();
  }

async function viewSettings(){
  setCrumbs('Settings');

  // Ensure we always have a sensible API default (fallback to page origin)
  if (!state.api) {
    try {
      state.api = location.origin;
    } catch(_) {
      state.api = '';
    }
  }

  const prefs = loadPushPrefs();
  const r=(state.me?.role||'').toUpperCase();
  const c=(state.me?.category||'').toUpperCase();
  const canSeeVisitors = (r==='ADMIN' || r==='ADMIN_GLOBAL' || c==='RECEPTION' || c==='NURSING');


  $('#view').innerHTML = `
      <div class="card"><h2>API & Token</h2>
      <div class="grid cols-3">
        <div><label>API base</label><input id="api" class="input" value="${state.api || location.origin}" /></div>
        <div><label>Token</label><input id="tok" class="input" value="${state.token}" /></div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end"><button id="save" class="btn">Save</button></div>
      </div>
    </div>

    <div class="card"><h2>Change Password</h2>
      <div class="grid cols-3">
        <div><label>Current password</label><input id="pw_current" type="password" class="input" placeholder="Current password"/></div>
        <div><label>New password</label><input id="pw_new" type="password" class="input" placeholder="At least 5 characters"/></div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end"><button id="pw_save" class="btn">Change password</button></div>
      </div>
      <div class="muted" style="margin-top:6px">After changing, your password takes effect immediately.</div>
    </div>

    <div class="card">
      <h2>Push Alerts</h2>

      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
  <button id="pushToggle" class="btn">…</button>
  <button id="pushTest" class="btn ghost">Send test push</button>
  <span id="pushStatus" class="muted"></span>
</div>
<div id="pushDebug" class="muted" style="margin-top:6px"></div>


      <div style="margin-top:10px">
        <label style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" id="pushIssues">
          Maintenance Issues
        </label>
        ${canSeeVisitors ? `
          <label style="display:flex;gap:8px;align-items:center;margin-top:6px">
            <input type="checkbox" id="pushVisitors">
            Visitor Arrivals (Reception)
          </label>` : ``}
        <label style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <input type="checkbox" id="pushNc">
          Nursing Checks (Overdue rooms)
        </label>
      </div>

      <div class="muted" style="margin-top:6px">
        Requires HTTPS and a supported browser.
      </div>
    </div>
  `;

const btnTest     = $('#pushTest');
const btn         = $('#pushToggle');
const tip         = $('#pushStatus');
const chkIssues   = $('#pushIssues');
const chkVisitors = $('#pushVisitors');
const chkNc       = $('#pushNc');
const dbg         = $('#pushDebug');


  // API/token save
  $('#save').onclick = ()=>{ setApi($('#api').value.trim()); setToken($('#tok').value.trim()); showMsg('Saved.','ok') };

  // Password change
  $('#pw_save').onclick = async ()=>{
    try{
      const current_password = ($('#pw_current').value||'');
      const new_password     = ($('#pw_new').value||'');
      if (!new_password || new_password.length < 5) return showMsg('New password must be at least 5 characters.', 'err');
      await api('/me/password', { method:'POST', body: JSON.stringify({ current_password, new_password }) });
      $('#pw_current').value=''; $('#pw_new').value='';
      showMsg('Password updated.', 'ok');
    }catch(e){ showMsg(e.message||String(e), 'err'); }
  };
btnTest?.addEventListener('click', async () => {
  try {
    // 1) Ask permission if needed
    if (!('Notification' in window)) {
      showMsg('Notifications not supported on this device/browser.', 'err');
      return;
    }
    if (Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') {
        showMsg('Notifications permission not granted.', 'err');
        return;
      }
    }

    // 2) Ensure a service worker is registered
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      try { reg = await registerSW(); } catch (e) {
        showMsg('Could not register Service Worker: ' + (e?.message || e), 'err');
        return;
      }
    }

    // 3) Ensure we have a push subscription (auto-create if missing)
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        const prefs = loadPushPrefs();
        sub = await ensurePushSubscription(prefs);   // creates + sends to backend
      } catch (e) {
        showMsg('Enable push first: ' + (e?.message || e), 'err');
        return;
      }
    }

    // 4) Local SW notification (should appear immediately)
    try { await reg.showNotification('Test push', { body: 'Local SW notification' }); } catch (_) {}

    // 5) Optional server round-trip (if your backend implements /push/test)
    try {
      await api('/push/test', {
        method: 'POST',
        body: JSON.stringify({
          subscription: sub,
          topics: topicsFromPrefs(loadPushPrefs())
        })
      });
      showMsg('Sent test push from server (if supported).', 'ok');
    } catch (e) {
      console.warn('/push/test not available:', e?.message || e);
      showMsg('Local test shown. (Server /push/test not available.)', 'warn');
    }
  } catch (e) {
    showMsg(e?.message || String(e), 'err');
  }
});

  // Determine if a push subscription actually exists
async function hasSubscription(){
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}

  // initialize checkboxes
  if (chkIssues)   chkIssues.checked   = !!prefs.issues;
  if (chkVisitors) chkVisitors.checked = !!prefs.visitors;
  if (chkNc)       chkNc.checked       = !!prefs.ncalerts;

  async function refreshPushUI(){
  const supported = ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);
  if (!supported){
    btn.disabled = true;
    btn.textContent = 'Not supported';
    tip.textContent = 'This device/browser does not support Web Push.';
    return;
  }

  if (Notification.permission === 'denied'){
    btn.disabled = true;
    btn.textContent = 'Notifications blocked';
    tip.textContent = 'Allow notifications in browser site settings to enable.';
    return;
  }

  const subscribed = await hasSubscription();
  if (subscribed){
    btn.disabled = false;
    btn.textContent = 'Disable Push Alerts';
    tip.textContent = 'Notifications are enabled.';
  } else {
    btn.disabled = false;
    btn.textContent = 'Enable Push Alerts';
    tip.textContent = 'Click to enable push notifications.';
  }
}

  await refreshPushUI();


  // toggle push on/off
  btn.addEventListener('click', async ()=>{
  const subscribed = await hasSubscription();
  const enabling = !subscribed;

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = enabling ? 'Enabling…' : 'Disabling…';

  try{
    if (enabling){
      // keep prefs in sync with checkboxes
      const p = loadPushPrefs();
      p.issues   = !!(chkIssues?.checked);
      if (chkVisitors) p.visitors = !!chkVisitors.checked;
      if (chkNc)       p.ncalerts = !!chkNc.checked;
      await savePushPrefs(p);

      await ensurePushSubscription(p);
      showMsg('Push alerts enabled.','ok');
    } else {
      await disablePush();
      showMsg('Push alerts disabled.','ok');
    }
  } catch(e){
    showMsg(e?.message || String(e), 'err');
  } finally {
    btn.disabled = false;
    await refreshPushUI();
  }
  try{
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint || '';
    const tail = endpoint ? '…' + endpoint.slice(-24) : '(none)';
    const topics = Object.entries(loadPushPrefs()).filter(([k,v])=>v).map(([k])=>k).join(', ') || 'none';
    dbg.textContent = `Subscribed: ${!!sub}  |  Topics: ${topics}  |  Endpoint: ${tail}`;
  } catch(_){}

});


  // changing topic checkboxes updates prefs (and sends new topics if already granted)
  async function onPrefChange(){
    const p = loadPushPrefs();
    p.issues   = !!(chkIssues?.checked);
    if (chkVisitors) p.visitors = !!chkVisitors.checked;
    if (chkNc)       p.ncalerts = !!chkNc.checked;
    await savePushPrefs(p);
    if (Notification.permission === 'granted') {
      try { await ensurePushSubscription(p); } catch {}
    }
  }
  chkIssues?.addEventListener('change', onPrefChange);
  chkVisitors?.addEventListener('change', onPrefChange);
  chkNc?.addEventListener('change', onPrefChange);
}

async function viewResetPw(){
  setCrumbs('Reset Password');

  // read token from hash: #resetpw?token=...
  const { params } = getHashQuery();
  const token = String(params.token || params.t || '').trim();

  // If there is NO token, show a clear message + back button
  if (!token){
    $('#view').innerHTML = `
      <div class="card">
        <h2>Reset Password</h2>
        <p class="muted" style="margin-top:6px">
          Missing or invalid reset link.
          Please use the reset link from your email,
          or ask your administrator to reset your password.
        </p>
        <div class="row" style="margin-top:12px; justify-content:flex-end">
          <button id="rp_back" class="btn">Back to sign in</button>
        </div>
      </div>`;
    $('#rp_back')?.addEventListener('click', ()=> navTo('#login'));
    return;
  }

  // If we DO have a token, show the real reset form
  $('#view').innerHTML = `
    <div class="card">
      <h2>Reset Password</h2>
      <div class="grid cols-3" style="margin-top:10px">
        <div>
          <label>New password</label>
          <input id="rp_new" type="password" class="input"
                 placeholder="At least 5 characters"/>
        </div>
        <div>
          <label>Confirm</label>
          <input id="rp_confirm" type="password" class="input"
                 placeholder="Repeat new password"/>
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end">
          <button id="rp_save" class="btn">Set new password</button>
        </div>
      </div>
      <div class="muted" style="margin-top:6px">
        Enter your new password and click “Set new password”.
      </div>
    </div>`;

  $('#rp_save')?.addEventListener('click', async ()=>{
    const pw  = ($('#rp_new')?.value || '').trim();
    const pw2 = ($('#rp_confirm')?.value || '').trim();

    if (pw.length < 5) {
      showMsg('Password must be at least 5 characters.', 'err');
      return;
    }
    if (pw !== pw2) {
      showMsg('Passwords do not match.', 'err');
      return;
    }

    const btn  = $('#rp_save');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      await api('/auth/reset', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ token, new_password: pw })
      });
      showMsg('Password updated. Please sign in with your new password.', 'ok');
      navTo('#login');
    } catch (e) {
      showMsg(e?.message || String(e), 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}


/* ANCHOR: SW_REGISTER_HELPER (JS-ONLY) */

if (typeof window.registerSW !== 'function') {
  window.registerSW = async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported');
    }

    // Use an absolute URL to avoid subpath issues
    const swUrl = new URL('/sw.js', location.origin).href;

    // HTTPS is required for push (except on localhost)
    const isLocal = /^localhost$|^127\.0\.0\.1$|^\[::1\]$/.test(location.hostname);
    if (location.protocol !== 'https:' && !isLocal) {
      throw new Error('Service Worker requires HTTPS (or localhost)');
    }

    const reg = await navigator.serviceWorker.register(swUrl, { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  };
}


// ---- Push prefs + topics ----
function defaultPushPrefs(){
  const r=(state.me?.role||'').toUpperCase();
  const c=(state.me?.category||'').toUpperCase();

  const allowVisitors = (r==='ADMIN' || r==='ADMIN_GLOBAL' || c==='RECEPTION' || c==='NURSING');
  const allowNcAlerts = (r==='ADMIN' || r==='ADMIN_GLOBAL' || c==='NURSING' || c==='MANAGER');

  return {
    issues:   true,
    visitors: allowVisitors,
    ncalerts: allowNcAlerts
  };
}

function loadPushPrefs(){
  try {
    return {
      ...defaultPushPrefs(),
      ...(JSON.parse(localStorage.getItem('ernosPushPrefs')||'{}'))
    };
  } catch {
    return defaultPushPrefs();
  }
}

function topicsFromPrefs(p){
  const t = [];

  // Maintenance
  if (p?.issues) {
    t.push('issues');
  }

  // Visitors / reception arrivals – be generous with aliases so we match old + new backends
  if (p?.visitors) {
    t.push(
      'visitors',        // new/clean topic
      'VISITORS',        // legacy uppercase
      'reception',       // some backends used this
      'reception_visitors'
    );
  }

  // Nursing checks alerts (overdue / never-checked rooms)
  if (p?.ncalerts) {
    t.push(
      'nc_alerts',
      'nursing_alerts'
    );
  }

  // De-dupe
  return Array.from(new Set(t));
}

async function savePushPrefs(prefs){
  try { localStorage.setItem('ernosPushPrefs', JSON.stringify(prefs)); } catch {}

  // Skip if we already learned the endpoint doesn't exist
  try {
    if (localStorage.getItem('ernosNoPushPrefs') === '1') return;
 await api('/push/prefs', { method:'POST', body: JSON.stringify({ prefs }) });
  } catch (e) {
    if (/404/.test(String(e?.message||''))) {
      try { localStorage.setItem('ernosNoPushPrefs', '1'); } catch {}
    }
  }
}



async function sendSubscription(sub, topics){
  const body = { subscription: sub, topics: topics || topicsFromPrefs(loadPushPrefs()) };
  try {
    // modern shape
    await api('/push/subscribe', { method:'POST', body: JSON.stringify(body) });
    return;
  } catch (e) {
    // fall back to legacy: raw subscription object
    await api('/push/subscribe', { method:'POST', body: JSON.stringify(sub) });
  }
}


async function disablePush(){
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      // Tell backend to stop sending to this endpoint (if supported)
      try { await api('/push/unsubscribe', { method:'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); } catch {}
      await sub.unsubscribe();
    }
  } finally {
    try { localStorage.removeItem('ernosPush'); } catch {}
  }
}

  async function viewFFAlerts(){
    setCrumbs('Fridge & Fire Alerts');
    $('#view').innerHTML = `
      <div class="card"><h2>Fridge & Fire Alerts</h2>
        <div id="alertsWrap" class="grid cols-3" style="margin-top:12px"></div>
      </div>`;
    try{
      const a = await api('/ff/alerts');
      renderAlerts($('#alertsWrap'), a);
      const { params } = getHashQuery();
      const tab = String(params.tab||'');
      const map = {
        'fridge-due': 'Fridge Due',
        'fridge-oor': 'Fridge Out of Range',
        'fire-due':   'Fire Due',
        'fire-drill': 'Fire Drill'
      };
      const title = map[tab];
      if (title){
        const cards = Array.from($('#alertsWrap').querySelectorAll('.card .title'));
        const target = cards.find(h => h.textContent.trim() === title);
        if (target) target.scrollIntoView({ behavior:'smooth', block:'start' });
      }
    }catch(e){
      $('#alertsWrap').innerHTML = `<div class="empty">Failed to load alerts: ${escapeHtml(e.message||String(e))}</div>`;
    }
  }


window.preferredHome = function preferredHome(){
  const me   = state.me || {};
  const rawRole = String(me.role || '').toUpperCase();
  const rawCat  = String(me.category || '').toUpperCase() || rawRole;

  const cat = (() => {
    if (rawCat.includes('NURS')) return 'NURSING';
    if (rawCat.includes('RECEP')) return 'RECEPTION';
    if (rawCat.includes('HOUSE') || rawCat === 'HK') return 'HOUSEKEEPING';
    if (rawCat.includes('MAINT')) return 'MAINTENANCE';
    if (rawCat.includes('MANAG')) return 'MANAGER';
    if (rawCat.includes('AUDIT')) return 'AUDITOR';
    return rawCat;
  })();

  const role = rawRole;

  const isAdminLike =
    role === 'ADMIN' ||
    role === 'ADMIN_GLOBAL' ||
    role === 'MANAGER' ||
    cat  === 'MANAGER' ||
    role === 'AUDITOR' ||
    cat  === 'AUDITOR';

  const isNursing      = (cat === 'NURSING');
  const isHousekeeping = (cat === 'HOUSEKEEPING');
  const isReception    = (cat === 'RECEPTION');
  const isMaintenance  = (cat === 'MAINTENANCE');

  if (isAdminLike)      return '#dashboard';
  if (isNursing)        return '#dashboard';  // Nursing home = Dashboard
  if (isHousekeeping)   return '#hk';
  if (isReception)      return '#visitors';
  if (isMaintenance)    return '#maint';

  return '#dashboard';
};

   // === Nursing Alerts (overdue / due soon / OK + CSV export) ===
async function viewNcAlerts() {
  setCrumbs('Nursing Alerts');

  const me = state.me || {};
  const r  = String(me.role || '').toUpperCase();
  const c  = String(me.category || '').toUpperCase();

  const isAdminLike =
    r === 'ADMIN' ||
    r === 'ADMIN_GLOBAL' ||
    r === 'MANAGER' ||
    c === 'MANAGER' ||
    r === 'AUDITOR' ||
    c === 'AUDITOR';

  const isNursing = (c === 'NURSING');

  if (!isAdminLike && !isNursing) {
    $('#view').innerHTML =
      `<div class="card"><h2>Nursing Alerts</h2>` +
      `<div class="alert err">Only Nursing / Management can view nursing alerts.</div></div>`;
    return;
  }

  $('#view').innerHTML = `
    <div class="card">
      <h2>Nursing Alerts</h2>

      <div id="ncConfig" style="margin:8px 0 10px 0"></div>

      <div class="row" style="gap:8px;align-items:center;margin:4px 0 10px 0">
        <button id="ncPush" class="btn small">Enable Push Alerts</button>
        <span id="ncPushHint" class="muted">
          Get notifications when rooms are overdue or never checked.
        </span>
      </div>

      <div id="ncAlertsWrap" class="grid cols-2" style="margin-top:12px"></div>
    </div>
  `;

  const cfgEl  = $('#ncConfig');
  const wrapEl = $('#ncAlertsWrap');

  // --- CONFIG RENDERER (interval input + Save) ---
  function renderNcConfig(el, cfg) {
    if (!el) return;

    const raw = cfg || {};
    let m = raw.interval_min ?? raw.interval ?? raw.minutes ?? raw.value ?? 60;

    m = parseInt(String(m ?? ''), 10);
    if (!Number.isFinite(m) || m <= 0) m = 60;

    const hours    = m / 60;
    const hoursStr = (Math.round(hours * 10) / 10).toString();

    el.innerHTML = `
      <div class="card" style="background:#fafafa;border-radius:12px;padding:10px 12px;">
        <div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="min-width:180px;">
            <div class="muted" style="font-size:0.9rem;">Required nursing check interval</div>
            <div class="row" style="align-items:baseline;gap:6px;margin-top:4px;">
              <input
                id="ncInterval"
                type="number"
                class="input"
                min="5"
                max="720"
                step="5"
                value="${m}"
                style="max-width:90px;text-align:right;"
              >
              <span class="muted">minutes</span>
              <span class="badge" style="opacity:0.85;">≈ ${hoursStr} h</span>
            </div>
          </div>
          <div>
            <button id="ncSave" class="btn small">Save interval</button>
          </div>
        </div>
        <div class="muted" style="margin-top:6px;font-size:0.8rem;">
          Overdue: last check &gt; interval. &nbsp; Due soon: &gt;= 80% of interval.
        </div>
      </div>
    `;

    const input = document.getElementById('ncInterval');
    const btn   = document.getElementById('ncSave');

    if (!btn || !input) return;

    btn.addEventListener('click', async () => {
      const val = parseInt(String(input.value || ''), 10);
      if (!Number.isFinite(val) || val <= 0) {
        showMsg('Please enter a valid number of minutes (min 5).', 'err');
        input.focus();
        return;
      }

      // Clamp 5–720 on client side too
      let sendVal = val;
      if (sendVal < 5) sendVal = 5;
      if (sendVal > 12 * 60) sendVal = 12 * 60;

      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const resp = await api('/nc/config', {
          method: 'POST',
          body: { interval_min: sendVal }
        });

        if (resp && typeof resp.interval_min !== 'undefined') {
          showMsg('Nursing alerts interval updated.', 'ok');
        } else {
          showMsg('Saved, but server did not return interval. Refresh page to confirm.', 'warn');
        }
      } catch (e) {
        showMsg(e?.message || String(e), 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }

  // --- ALERT CARDS RENDERER (rooms grouped by status + CSV card) ---
  function renderNcAlerts(wrap, a) {
    if (!wrap) return;
    wrap.innerHTML = '';

    const rooms    = (a && a.rooms)    || [];
    const overdue  = (a && a.overdue)  || [];
    const due_soon = (a && a.due_soon) || [];
    const ok       = (a && a.ok)       || [];

    if (!rooms.length) {
      wrap.innerHTML =
        `<div class="card"><div class="title">Nursing Alerts</div>` +
        `<div class="empty">No rooms configured for nursing checks.</div></div>`;
      return;
    }

    function tableCard(title, items, emptyText) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="title">${escapeHtml(title)}</div>`;

      if (!items || !items.length) {
        card.innerHTML += `<div class="empty">${escapeHtml(emptyText)}</div>`;
      } else {
        const rows = items.map(r => {
          const last = r.last_at ? fmtDT(r.last_at) : 'Never';
          let mins   = r.minutes_since;
          if (mins === null || mins === undefined || mins === Infinity) {
            mins = '—';
          } else {
            mins = String(mins) + ' min';
          }

          const rawStatus = r.status || (r.last_at ? 'OK' : 'NEVER');
          const status = String(rawStatus || '').toUpperCase();

          let label = status;
          if (status === 'OK')            label = 'OK';
          else if (status === 'DUE_SOON') label = 'Due soon';
          else if (status === 'OVERDUE')  label = 'Overdue';
          else if (status === 'NEVER')    label = 'Never';

          return `
            <tr data-status="${escapeHtml(status)}">
              <td class="t-text">${escapeHtml(r.location_name || '')}</td>
              <td class="t-dt">${escapeHtml(last)}</td>
              <td class="t-num">${escapeHtml(String(mins))}</td>
              <td class="t-text">
                <span class="badge status-badge" data-status="${escapeHtml(status)}">
                  ${escapeHtml(label)}
                </span>
              </td>
            </tr>`;
        }).join('');

        card.innerHTML += `
          <div class="table-wrap">
            <table class="table nolines">
              <thead>
                <tr>
                  <th class="t-text">Room</th>
                  <th class="t-dt">Last check</th>
                  <th class="t-num">Minutes since</th>
                  <th class="t-text">Status</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      }

      wrap.appendChild(card);
    }

    // Status cards
    tableCard(
      'Overdue / Never Checked',
      overdue,
      'No overdue rooms – all up to date 🎉'
    );
    tableCard(
      'Due Soon',
      due_soon,
      'No rooms are currently approaching overdue.'
    );
    tableCard(
      'Recently Checked',
      ok,
      'No recent nursing checks.'
    );

    // CSV REPORT CARD
    const reportCard = document.createElement('div');
    reportCard.className = 'card';

    const today    = new Date();
    const toDate   = today.toISOString().slice(0, 10);
    const weekAgo  = new Date(today.getTime() - 6 * 86400000);
    const fromDate = weekAgo.toISOString().slice(0, 10);

    reportCard.innerHTML = `
      <div class="title">CSV Report</div>
      <div class="muted" style="margin-bottom:8px">
        Export nursing checks compliance by room and day (for Excel / printing).
      </div>
      <div class="grid cols-3" style="align-items:flex-end;gap:10px">
        <div>
          <label>From</label>
          <input id="ncCsvFrom" type="date" class="input" value="${fromDate}">
        </div>
        <div>
          <label>To</label>
          <input id="ncCsvTo" type="date" class="input" value="${toDate}">
        </div>
        <div style="display:flex;align-items:flex-end">
          <button id="ncCsvBtn" class="btn small">Download CSV</button>
        </div>
      </div>
    `;
    wrap.appendChild(reportCard);

    const csvBtn = document.getElementById('ncCsvBtn');
    if (csvBtn) {
      csvBtn.addEventListener('click', () => {
        const from = (document.getElementById('ncCsvFrom').value || '').trim();
        const to   = (document.getElementById('ncCsvTo').value   || '').trim();

        if (!from || !to) {
          showMsg('Please choose both From and To dates for the report.', 'err');
          return;
        }

        const base  = (state.api || location.origin || '').replace(/\/+$/, '');
        const token = (state.token || '').trim();

        let url = `${base}/nc/trend.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        if (token) url += `&token=${encodeURIComponent(token)}`;

        window.open(url, '_blank');
      });
    }
  }

  // --- PUSH ALERTS BUTTON (with nicer permission handling) ---
  const pushBtn  = $('#ncPush');
  const pushHint = $('#ncPushHint');

  if (!('Notification' in window)) {
    if (pushBtn)  pushBtn.remove();
    if (pushHint) pushHint.textContent = 'Browser does not support notifications.';
  } else if (Notification.permission === 'denied') {
    if (pushBtn) {
      pushBtn.disabled = true;
      pushBtn.textContent = 'Notifications blocked';
    }
    if (pushHint) {
      pushHint.textContent = 'Notifications are blocked in your browser. Allow them in site settings to enable push alerts.';
    }
  } else if (Notification.permission === 'granted' && localStorage.getItem('ernosPush')) {
    if (pushBtn)  pushBtn.remove();
    if (pushHint) pushHint.textContent = 'Push alerts for nursing checks are enabled.';
  } else if (pushBtn) {
    pushBtn.addEventListener('click', async () => {
      const orig = pushBtn.textContent;
      pushBtn.disabled = true;
      pushBtn.textContent = 'Enabling…';
      try {
        // If permission is still "default", ask first
        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            showMsg('Notification permission was not granted. Please allow notifications in your browser settings.', 'warn');
            pushBtn.disabled = false;
            pushBtn.textContent = orig;
            return;
          }
        }

        await ensurePushSubscription({ ncalerts: true });
        showMsg('Push alerts for nursing checks enabled.', 'ok');
        pushBtn.remove();
        if (pushHint) pushHint.textContent = 'Push alerts for nursing checks are enabled.';
      } catch (e) {
        showMsg(e?.message || String(e), 'err');
        pushBtn.disabled = false;
        pushBtn.textContent = orig;
      }
    });
  }

  // --- Load config + alerts ---
  try {
    const [cfg, alerts] = await Promise.all([
      api('/nc/config').catch(() => null),
      api('/nc/alerts')
    ]);

    renderNcConfig(cfgEl, cfg || alerts || {});
    renderNcAlerts(wrapEl, alerts);
  } catch (e) {
    wrapEl.innerHTML =
      `<div class="empty">Failed to load nursing alerts: ` +
      `${escapeHtml(e?.message || String(e))}</div>`;
  }
}




/* === [Ernos] FINAL role-aware me + nav override (single source of truth) === */

// Always keep state.me in sync with /me AND re-render nav + badge
async function ensureMe() {
  // No token → clear user and render minimal UI
  if (!state.token) {
    state.me = null;
    try { renderUserBadge(); } catch (_) {}
    try { renderNav(); } catch (_) {}
    return;
  }

  try {
    const me = await api('/me');
    state.me = me;
  } catch (_) {
    // Network / 401 → treat as signed-out
    state.me = null;
  }

  // After we know who the user is, refresh header + sidebar
  try { renderUserBadge(); } catch (_) {}
  try { renderNav(); } catch (_) {}
}

/**
 * FINAL sidebar renderer – exactly as requested:
 *
 * Nursing:
 *   Dashboard, Visitors, Residents Out, Nursing Checks,
 *   Maintenance Issues, Environmental Audit, Fridge Logs,
 *   Fire Logs, Alerts (Fridge & Fire), Settings
 *
 * Reception:
 *   Visitors, Residents Out, Settings
 *
 * Housekeeping:
 *   Housekeeping, Maintenance Issues, Settings
 *
 * Maintenance:
 *   Maintenance Issues, Settings
 *
 * House Manager:
 *   Same as Admin but WITHOUT QR Codes
 *
 * Auditor:
 *   Same as Admin but WITHOUT QR Codes
 *
 * Admin:
 *   Full menu incl. QR Codes
 */
function renderNav() {
  const nav = document.querySelector('#nav');
  if (!nav) return;

  const me      = state.me || {};
  const rawRole = String(me.role || '').toUpperCase();
  const rawCat  = String(me.category || '').toUpperCase();

  // Normalised category (NURSING, RECEPTION, HOUSEKEEPING, MAINTENANCE, MANAGER, AUDITOR, etc.)
  const cat = (typeof normCat === 'function')
    ? normCat(rawCat || rawRole || '')
    : (rawCat || rawRole || '');

  const role = rawRole || cat;

  // Staff vs admin-like split
  const isStaffCat = ['NURSING', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE'].includes(cat);

  const isAdmin   = (role === 'ADMIN' || role === 'ADMIN_GLOBAL');
  const isManager = (role === 'MANAGER' || cat === 'MANAGER');
  const isAuditor = (role === 'AUDITOR' || cat === 'AUDITOR');

  // IMPORTANT:
  // Admin / Manager / Auditor are ALWAYS treated as admin-like,
  // even if their category is a staff cat (e.g. ADMIN + NURSING).
  const isAdminLike = (isAdmin || isManager || isAuditor);

  const isNursing    = (!isAdminLike && cat === 'NURSING');
  const isHK         = (!isAdminLike && cat === 'HOUSEKEEPING');
  const isReception  = (!isAdminLike && cat === 'RECEPTION');
  const isMaint      = (!isAdminLike && cat === 'MAINTENANCE');

  let items = [];

  // 1) Maintenance staff → Maintenance Issues + Settings
  if (isMaint && !isAdminLike) {
    items = [
      ['#issues',   'Maintenance Issues'],
      ['#settings', 'Settings']
    ];
  }

  // 2) Housekeeping staff → Housekeeping + Maintenance Issues + Settings
  else if (isHK && !isAdminLike) {
    items = [
      ['#hk',       'Housekeeping'],
      ['#issues',   'Maintenance Issues'],
      ['#settings', 'Settings']
    ];
  }

  // 3) Reception staff → Visitors + Residents Out + Settings
  else if (isReception && !isAdminLike) {
    items = [
      ['#visitors', 'Visitors'],
      ['#resout',   'Residents Out'],
      ['#settings', 'Settings']
    ];
  }

    // 4) Nursing staff → full clinical + logs set
  else if (isNursing && !isAdminLike) {
    items = [
      ['#dashboard', 'Dashboard'],
      ['#visitors',  'Visitors'],
      ['#resout',    'Residents Out'],
      ['#nursing',   'Nursing Checks'],
      ['#issues',    'Maintenance Issues'],
      ['#env',       'Environmental Audit'],
      ['#fridge',    'Fridge Logs'],
      ['#fire',      'Fire Logs'],
      ['#ncalerts',  'Nursing Alerts'],
      ['#ffalerts',  'Alerts (Fridge & Fire)'],
      ['#settings',  'Settings']
    ];
  }

  // 5) Admin / House Manager / Auditor / everyone else
  else if (isAdminLike) {
    let base = [
      ['#dashboard', 'Dashboard'],
      ['#visitors',  'Visitors'],
      ['#resout',    'Residents Out'],
      ['#nursing',   'Nursing Checks'],
      ['#hk',        'Housekeeping'],
      ['#issues',    'Maintenance Issues'],
      ['#env',       'Environmental Audit'],
      ['#fridge',    'Fridge Logs'],
      ['#fire',      'Fire Logs'],
      ['#ncalerts',  'Nursing Alerts'],
      ['#ffalerts',  'Alerts (Fridge & Fire)'],
      ['#locations', 'Locations'],
      ['#qrcodes',   'QR Codes'],
      ['#staff',     'Staff & Roles'],
      ['#settings',  'Settings']
    ];

    // House Manager / Auditor → same as Admin but WITHOUT QR Codes
    if (!isAdmin && isAdminLike) {
      base = base.filter(([href]) => href !== '#qrcodes');
    }

    items = base;
  }

  nav.innerHTML = items
    .map(([href, label]) => `<a href="${href}" data-link>${label}</a>`)
    .join('');

  // Wire links
  document.querySelectorAll('#nav a[data-link]').forEach(a => {
    a.classList.toggle('active', location.hash === a.getAttribute('href'));
    a.onclick = (e) => {
      e.preventDefault();
      navTo(a.getAttribute('href'));
      try { closeSidebar(); } catch (_) {}
    };
  });
}


/**
 * FINAL home route:
 * - Admin / Manager / Auditor: Dashboard
 * - Nursing: Dashboard
 * - Housekeeping: Housekeeping
 * - Reception: Visitors
 * - Maintenance: Maintenance
 * - Fallback: Dashboard
 */
window.preferredHome = function preferredHome() {
  const me      = state.me || {};
  const rawRole = String(me.role || '').toUpperCase();
  const rawCat  = String(me.category || '').toUpperCase();

  const cat = (typeof normCat === 'function')
    ? normCat(rawCat || rawRole || '')
    : (rawCat || rawRole || '');

  const role = rawRole || cat;

  const isStaffCat = ['NURSING', 'RECEPTION', 'HOUSEKEEPING', 'MAINTENANCE'].includes(cat);
  const isAdmin    = !isStaffCat && (role === 'ADMIN' || role === 'ADMIN_GLOBAL');
  const isManager  = !isStaffCat && (role === 'MANAGER' || cat === 'MANAGER');
  const isAuditor  = !isStaffCat && (role === 'AUDITOR' || cat === 'AUDITOR');
  const isAdminLike = isAdmin || isManager || isAuditor;

  if (isAdminLike || cat === 'NURSING') return '#dashboard';
  if (cat === 'HOUSEKEEPING')           return '#hk';
  if (cat === 'RECEPTION')              return '#visitors';
  if (cat === 'MAINTENANCE')            return '#maint';

  return '#dashboard';
};


// === Visitors view tweaks: hide CSV + filters + safety card on phones for Nursing ===
function postVisitorsRoleTweaks(){
  try{
    const r = String(state.me?.role || '').toUpperCase();
    const c = String(state.me?.category || '').toUpperCase();
    const isMobile =
      (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
      (window.innerWidth && window.innerWidth <= 768);

    const root = document.querySelector('#view');
    if (!root) return;

    // 1) On phones: hide ANY "CSV" export buttons/links
    if (isMobile) {
      root.querySelectorAll('button, a').forEach(el => {
        const txt = (el.textContent || '').trim().toLowerCase();
        if (txt === 'export csv' || txt === 'csv' || txt.includes('csv')) {
          el.style.display = 'none';
        }
      });
    }

    // 2) Extra tweaks for Nursing on mobile only
    if (isMobile && c === 'NURSING') {
      // (a) Hide the two date filter boxes row at the top
      try{
        const dateInputs = Array.from(root.querySelectorAll('input')).filter(el => {
          const type = (el.type || '').toLowerCase();
          const ph   = (el.placeholder || '').toLowerCase();
          return type === 'date' ||
                 ph.includes('dd/mm/yyyy') ||
                 /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(ph);
        });

        // if we have at least two date-like inputs, hide their container row
        if (dateInputs.length >= 2) {
          const container =
            dateInputs[0].closest('.row') ||
            dateInputs[0].closest('.grid') ||
            dateInputs[0].parentElement;
          if (container) container.style.display = 'none';
        }
      }catch(_){}

      // (b) Hide the "Latest safety activity ..." card / box under the visitors table
      root.querySelectorAll('.card').forEach(card => {
        const txt = (card.textContent || '').toLowerCase();
        if (
          txt.includes('security alert') ||
          txt.includes('latest safety activity') ||
          (txt.includes('safety') && txt.includes('failed to load'))
        ) {
          card.style.display = 'none';
        }
      });
    }
  }catch(_){}
}

// === Route scheduler: coalesce rapid hash changes & repaint after ===
(function(){
  if (window.scheduleRoute) return;
  let scheduled = false;

  window.scheduleRoute = function scheduleRoute(){
    if (scheduled) return;
    scheduled = true;
    try { document.body.setAttribute('data-painting','1'); } catch(_){}
    requestAnimationFrame(async ()=>{
      scheduled = false;
      try {
        await route();
      } finally {
        try { document.body.removeAttribute('data-painting'); } catch(_){}
        try { updateHeaderOffset(); } catch(_){}
      }
    });
  };
})();

  // Router
async function route(){
  const raw = location.hash || '#login';
  let [hashOnly] = raw.split('?');   // ← make it mutable


  // normalize once (trim + lowercase) to avoid case/space mismatches
const H = '#' + String(hashOnly || '').replace(/^#/, '').trim().toLowerCase();
// Ensure header matches this route (unless a view sets a custom title)
try { window.__ernosUpdateCrumbsFromHash(H); } catch(_){}

  // --- Visitors auto-refresh guard: prevent its timers overwriting other views ---
  try {
    // previous route (if any)
    const prev = window.__lastRoute || null;

    // 1) If we are leaving #visitors → clear its tracked intervals & restore setInterval
    if (prev === '#visitors' && H !== '#visitors') {
      try {
        (window.__visIntervals || []).forEach(id => clearInterval(id));
      } catch(_){}
      window.__visIntervals = [];
      if (window.__origSetInterval) {
        window.setInterval = window.__origSetInterval;
      }
    }

    // 2) If we are entering #visitors → monkey-patch setInterval to track timers
    if (H === '#visitors') {
      if (!window.__origSetInterval) window.__origSetInterval = window.setInterval;
      window.__visIntervals = [];
      if (window.setInterval === window.__origSetInterval) {
        window.setInterval = function(fn, ms){
          const id = window.__origSetInterval(fn, ms);
          (window.__visIntervals || (window.__visIntervals = [])).push(id);
          return id;
        };
      }
    }

    // remember current route for next time
    window.__lastRoute = H;
  } catch(_){}

// overwrite hashOnly so the rest of the function uses the normalized form
// IMPORTANT: strip querystring so "#login?token=..." still counts as "#login"
hashOnly = String(H || '').split('?')[0];

// expose route to CSS WITHOUT the '#'
try { document.body.setAttribute('data-route', hashOnly.slice(1)); } catch {}


/* ANCHOR: SET_CRUMBS_EARLY */
(function(){
  // Single source of truth for header label based on hash
  window.__ernosUpdateCrumbsFromHash = function __ernosUpdateCrumbsFromHash(rawHash){
    const h = String(rawHash || location.hash || '').trim().toLowerCase().split('?')[0];
    if (!h || h === '#report') return; // #report sets its own title dynamically
    const MAP = {
      '#dashboard': 'Dashboard',
      '#resetpw':  'Reset Password',
      '#locations': 'Locations',
      '#visitors':  'Visitors',
      '#resout':    'Residents Out',
      '#issues':    'Maintenance Issues',
      '#maint':     'My Maintenance',
      '#nursing':   'Residents',
      '#housekeeping': 'Housekeeping',
      '#ncalerts':  'Nursing Alerts',
      '#ffalerts':  'Fridge & Fire Alerts',
      '#env':       'Environmental Audit',
      '#fridge':    'Fridge Logs',
      '#fire':      'Fire Logs',
      '#qrcodes':   'QR Codes',
      '#staff':     'Staff & Roles',
      '#hk':        'Housekeeping',
      '#settings':  'Settings'
    };

    const label = MAP[h] || h
      .replace(/^#/, '')
      .replace(/[-_/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    try { setCrumbs(label); } catch(_) {}
  };
  // Run once right now for the current hash
  try { window.__ernosUpdateCrumbsFromHash(location.hash); } catch(_){}
})();


  // If not authenticated and trying to access a protected view,
  // remember where we wanted to go, then send to login.
  if (!state.token && !['#login', '#resetpw'].includes(hashOnly)) {
    try {
      // store the full URL (including hash) so we can return after login
      localStorage.setItem('ernos_return_to', location.href);
    } catch(_) {}
    navTo('#login');
    return;
  }

  if (hashOnly === '#login' && state.token) {
    const next = preferredHome();
    if (next !== '#login') { navTo(next); return; }
  }

  // Only load /me on protected views (not on login/reset)
  if (hashOnly !== '#login' && hashOnly !== '#resetpw') {
    await ensureMe();
  }

  renderNav();
  try { renderUserBadge(); } catch(_) {}


    // Force password change on first login
    // Only call /me/mcp when we actually HAVE a token
    // and we're not on the login or reset password views.
    try {
      const hasToken   = !!(state && state.token);
      const isAuthView = (H === '#login' || H === '#resetpw');

      if (hasToken && !isAuthView) {
        const m = await api('/me/mcp');
        if (m && m.must_change_password && H !== '#settings') {
          navTo('#settings');
          setTimeout(
            () => showMsg('Please set a new password to continue.', 'warn'),
            50
          );
          return;
        }
      }
    } catch (_){}



  // Redirect ALL users away from #dashboard to their correct home
  // Admin / Manager / DON / ADON will usually resolve to #dashboard anyway via preferredHome()
  if (H === '#dashboard') {
    const next = preferredHome();
    if (next && next !== '#dashboard') {
      navTo(next);
      return;
    }
  }

  // === Bridge removed: handle ROOM inside #report (unified TAP UI) ===
  /* (intentionally empty) */

  // expose current route to CSS (e.g., login -> data-route="login")
  try {
    document.body.setAttribute('data-route', H.slice(1));
  } catch (_){}

  switch (H) {
    case '#login':     return viewLogin();
    case '#resetpw':   return viewResetPw();
    case '#dashboard': return viewDashboard();
    case '#staff':     return viewStaff();
    case '#locations': return viewLocations();
    case '#qrcodes':   return viewQRCodes();
        case '#report':    return viewReportHK();   
    case '#visitors':
      await viewVisitors();
      try { postVisitorsRoleTweaks(); } catch(_){}
      return;

    case '#resout':      return viewResidentsOut();
    case '#nursing':     return viewNursing();
    case '#issues':      return viewIssues();
    case '#ncalerts':    return viewNcAlerts();
    case '#ffalerts':    return viewFFAlerts();
    case '#env':         return viewEnvAudit();
    case '#fire':        return viewFire();
    case '#fridge':      return viewFridge();
    case '#settings':    return viewSettings();
    case '#hk':          return viewHK();
    case '#housekeeping':return viewHK();
    case '#maint':       return viewMaint();

    default:
      return navTo(preferredHome());
  }


  }
// Keep content correctly offset below fixed header
window.updateHeaderOffset = function updateHeaderOffset(){
  try{
    const hdr = document.querySelector('header.skin-header');
    const h = hdr ? hdr.getBoundingClientRect().height : 56;
    document.documentElement.style.setProperty('--header-h', Math.round(h) + 'px');
  }catch(_){}
};
window.addEventListener('resize', ()=> setTimeout(updateHeaderOffset, 0));

  // Boot
window.addEventListener('hashchange', ()=>{
  scheduleRoute();
  closeSidebar();
  try{
    const m = (location.hash || '').match(/[?&]name=([^&#]+)/);
    if (m) localStorage.setItem('ernos_last_visitor_name', decodeURIComponent(m[1].replace(/\+/g,' ')));
  }catch(_){}
  // do not call updateHeaderOffset() here; scheduler handles it
});


window.addEventListener('DOMContentLoaded', ()=>{
  try{
    // if TAP sent us here and we already have a token, go right back
    try{
      const ret = localStorage.getItem('ernos_return_to');   // ← define it
      const hasTok = (sessionStorage.getItem('ernosToken') || localStorage.getItem('ernosToken'));
      if (ret && hasTok) {
        localStorage.removeItem('ernos_return_to');
        location.href = ret;
        return;
      }
    }catch{}
    // --- Reset-password boot redirect: /reset?token=... -> SPA #resetpw
try {
  const url = new URL(location.href);
  const pathLooksReset = /^\/reset\/?$/i.test(url.pathname);
  const qToken = url.searchParams.get('token') || url.searchParams.get('t') || '';
  const hashHasToken = /[?#&](token|t)=/.test(location.hash);

  if ((pathLooksReset && qToken) || (!location.hash && qToken)) {
    history.replaceState(null, '', '/');                // normalize URL
    location.hash = '#resetpw?token=' + encodeURIComponent(qToken);
  } else if (/^#\s*reset(pw)?/i.test(location.hash) && !hashHasToken) {
    // #reset but no token -> keep showing the view; it will complain nicely
  }
} catch (_) {}

// --- TAP boot redirect: server paths -> SPA #report (unify Nursing/Fridge/Fire/etc.)
try {
  const p = location.pathname;

  // 1) Hard guard: keep native server pages for Resident TAP *and* Reception Visitor TAP
  if (/^\/tap\/(resident|reception)\//i.test(p)) {
    // Native kiosk pages (Resident TAP, Reception Visitor TAP) must stay server-rendered.
    // Do NOT redirect these into the SPA.
  } else {
    // 2) Handle Nursing multi-segment routes → normalize to #report
    //    /tap/nursing/room/<token>
    //    /tap/nursing/asset/<token>
    let kind = '';
    let token = '';
    let matched = false;

    // Nursing (room|asset)
    {
      const mN = p.match(/^\/tap\/nursing\/(room|asset)\/([^/?#]+)$/i);
      if (mN) {
        kind   = mN[1].toLowerCase();  // 'room' | 'asset'
        token  = mN[2];
        matched = true;
      }
    }

    // 3) Generic two-segment taps still supported: /tap/<kind>/<token>
    if (!matched) {
      const m2 = p.match(/^\/tap\/([^/]+)\/([^/?#]+)$/i);
      if (m2) {
        kind   = (m2[1] || '').toLowerCase();
        token  = m2[2];
        matched = true;
      }
    }

    if (matched) {
      // Unified report for all *except* resident and reception
      if (kind === 'resident' || kind === 'reception') return;

      // Remember return-to when unauthenticated
      if (!state.token) {
        try { localStorage.setItem('ernos_return_to', location.href); } catch {}
      }

      // Optional name passthrough
      const qs   = new URLSearchParams(location.search);
      const name = qs.get('name') || '';
      if (name) { try { localStorage.setItem('ernos_last_visitor_name', name); } catch(_){} }

      // Build SPA hash
      const hash = '#report'
        + '?token=' + encodeURIComponent(token)
        + (kind ? '&kind=' + encodeURIComponent(kind) : '')
        + (name ? '&name=' + encodeURIComponent(name) : '');

      history.replaceState(null, '', '/');
      location.hash = hash;

      scheduleRoute();
      try { window.__ernosUpdateCrumbsFromHash(location.hash); } catch(_){}
      try { renderUserBadge(); } catch(_){}

      return;
    }
  }
} catch (_) {}




    // === Inject RECEPTION_RESIDENTS option into Locations type selectors (non-invasive) ===
    (function(){
      const TYPE_VALUE = 'RECEPTION_RESIDENTS';
      const TYPE_LABEL = 'RECEPTION_RESIDENTS';

      function addTypeOptionIntoSelect(sel){
        if (!sel) return;
        // only once per select
        const has = Array.from(sel.options || []).some(o => String(o.value).toUpperCase() === TYPE_VALUE);
        if (!has) {
          const opt = document.createElement('option');
          opt.value = TYPE_VALUE;
          opt.textContent = TYPE_LABEL;
          sel.appendChild(opt);
        }
      }

      function patchLocationsSelectors(root){
        const scope = root || document;
        // common ids/names your builder might use
        const candidates = [
          '#locType',
          'select[name="type"]',
          'select[id*="type"]',
          'select[name*="type"]'
        ];
        candidates.forEach(sel => {
          scope.querySelectorAll(sel).forEach(addTypeOptionIntoSelect);
        });
      }

      // run once now
      try { patchLocationsSelectors(document); } catch(_){}

      // re-run whenever we navigate to #locations
      window.addEventListener('hashchange', ()=>{
        const h = (location.hash || '').toLowerCase();
        if (h === '#locations') {
          setTimeout(()=> patchLocationsSelectors(document), 0);
          setTimeout(()=> patchLocationsSelectors(document), 150);   // in case builder is async
        }
      });

      // also observe DOM mutations while on #locations
      const mo = new MutationObserver(muts=>{
        const h = (location.hash || '').toLowerCase();
        if (h === '#locations') patchLocationsSelectors(document);
      });
      try {
        mo.observe(document.body, { childList:true, subtree:true });
      } catch(_){}
    })();

    $('#logoutBtn')?.addEventListener('click', ()=>{
      setToken('');
      state.me = null;
      renderUserBadge();
      renderNav();
      navTo('#login');
    });
try { armSessionTimeout(); } catch (_) {}
    if (!location.hash) {
      // No hash yet -> set it, and let the hashchange listener call scheduleRoute()
      navTo(state.token ? preferredHome() : '#login');
    } else {
      // Already have a hash (deep link / resetpw / tap redirect) -> route once now
      scheduleRoute();
    }

    // --- Auto-register Service Worker on boot (safe no-op if already registered) ---
    try { window.registerSW().catch(()=>{}); } catch (_){}

  }catch(e){
    console.error('Boot error:', e);
    const v=$('#view');
    if(v) v.innerHTML = `<div class="alert err">Boot error: ${escapeHtml((e && e.message)||String(e))}</div>`;
  }
});

  /* ANCHOR: TABLE_SORT_HELPER (BEGIN) */
/* === [Ernos] Click-to-sort tables (auto-wired) === */
(function(){
  if (window.enableSortableTable) return;

  function parseCell(td){
    const txt = (td?.textContent || '').trim();
    const num = Number(txt.replace(/,/g,''));
    if (Number.isFinite(num)) return { v:num, t:'n' };
    const ts = Date.parse(txt);
    if (!Number.isNaN(ts))    return { v:ts,  t:'d' };
    return { v:txt.toLowerCase(), t:'s' };
  }
  function compare(a, b){
    if (a.t === b.t){
      if (a.v < b.v) return -1;
      if (a.v > b.v) return 1;
      return 0;
    }
    const rank = { d:2, n:1, s:0 };      // dates > numbers > text
    return rank[b.t] - rank[a.t];
  }

  window.enableSortableTable = function(tbl){
    try{
      if (!tbl || tbl.__ernosSortable) return;
      const thead = tbl.querySelector('thead');
      const tbody = tbl.querySelector('tbody');
      if (!thead || !tbody) return;
      tbl.__ernosSortable = true;

      const ths = Array.from(thead.querySelectorAll('th'));
      ths.forEach((th, colIdx) => {
        th.style.cursor = 'pointer';
        th.setAttribute('role','button');
        th.title = 'Click to sort';
        th.addEventListener('click', () => {
          const rows = Array.from(tbody.querySelectorAll('tr'));
          const dir = (th.__ernosDir = th.__ernosDir === 'asc' ? 'desc' : 'asc');
          ths.forEach(x => { if (x !== th) x.__ernosDir = undefined; });

          const withKeys = rows.map(tr => ({ tr, key: parseCell(tr.children[colIdx]) }));
          withKeys.sort((A,B) => (dir === 'asc' ? compare(A.key,B.key) : -compare(A.key,B.key)));

          const frag = document.createDocumentFragment();
          withKeys.forEach(x => frag.appendChild(x.tr));
          tbody.appendChild(frag);
        });
      });
    }catch(_){}
  };

  // Auto-wire: any table with class "table" or "pretty" gets sortable headers
  (function autoWire(){
    const seen = new WeakSet();
    const scan = (root) => {
      root.querySelectorAll('table.table, table.pretty').forEach(t => {
        if (!seen.has(t)) { enableSortableTable(t); seen.add(t); }
      });
    };
    // initial + DOMContentLoaded
    try { scan(document); } catch(_){}
    document.addEventListener('DOMContentLoaded', () => { try { scan(document); } catch(_){} });
    // watch for tables injected later
    new MutationObserver(muts => {
      for (const m of muts){
        m.addedNodes && m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'TABLE') scan(node.parentNode || node);
          else scan(node);
        });
      }
    }).observe(document.body, { childList:true, subtree:true });
  })();
})();
/* ANCHOR: TABLE_SORT_HELPER (END) */
