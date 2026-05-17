// plugins/fridge_fire.cjs
module.exports = function setupFridgeFire(opts){
  const {
    app, pool, auth,
    PUBLIC_API_URL = "",
    // Optional helpers from your server; we polyfill if missing:
    nowISO      = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    tenantIdOf  = (req) => Number(req.user?.tenant_id || 0),
    roleOf      = (req) => String(req.user?.role||"").toUpperCase(),
    catOf       = (req)  => String(req.user?.category||"").toUpperCase(),
  } = opts || {};
  // One global lock key to serialize ALL Ernos migrations across plugins/processes
  const MIG_LOCK_KEY = 881531; // any 32-bit int, keep the SAME in every plugin

  if (!app || !pool || !auth) {
    throw new Error("[fridge_fire] Missing required { app, pool, auth }");
  }

    /* ---------- Migrations (idempotent, serialized) ---------- */
  async function migrate(){
    const client = await pool.connect();
    try {
      // Keep DDL from waiting forever and serialize across all processes
      await client.query(`SET lock_timeout = '3s'`);
      await client.query(`SELECT pg_advisory_lock($1)`, [MIG_LOCK_KEY]);

      // Run DDL deterministically in a single transaction
      await client.query('BEGIN');

      // 1) fridge_logs (existing, plus who did the check)
      await client.query(`
        CREATE TABLE IF NOT EXISTS fridge_logs (
          id SERIAL PRIMARY KEY,
          location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
          taken_at TIMESTAMPTZ,
          temp_c NUMERIC,
          staff_role TEXT,
          tenant_id INTEGER REFERENCES tenants(id)
        );
      `);
      await client.query(`
        ALTER TABLE fridge_logs
          ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
      `);
      await client.query(`
        ALTER TABLE fridge_logs
          ADD COLUMN IF NOT EXISTS staff_name TEXT;
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fridge_loc_time
          ON fridge_logs(location_id, taken_at DESC);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fridge_tenant
          ON fridge_logs(tenant_id);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_fridge_user
          ON fridge_logs(user_id);
      `);

      // 2) checkins (existing)
      await client.query(`
        CREATE TABLE IF NOT EXISTS checkins (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
          checkin_at TIMESTAMPTZ NOT NULL,
          checkout_at TIMESTAMPTZ,
          note TEXT,
          user_name TEXT,
          user_category TEXT,
          location_name TEXT,
          tenant_id INTEGER REFERENCES tenants(id)
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_checkins_user_open
          ON checkins(user_id, location_id)
          WHERE checkout_at IS NULL;
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_checkins_tenant ON checkins(tenant_id);`);

      // 3) fire_checks (existing)
      await client.query(`
        CREATE TABLE IF NOT EXISTS fire_checks (
          id SERIAL PRIMARY KEY,
          location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
          check_at TIMESTAMPTZ,
          kind TEXT,              -- PANEL | EXTINGUISHER | DRILL
          staff_role TEXT,
          note TEXT,
          tenant_id INTEGER REFERENCES tenants(id)
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fire_loc_time ON fire_checks(location_id, check_at DESC);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fire_tenant   ON fire_checks(tenant_id);`);

      // 4) room_checks (new)
      await client.query(`
        CREATE TABLE IF NOT EXISTS room_checks (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES tenants(id),
          qrcode_token TEXT NOT NULL,
          location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
          location_name TEXT,
          checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          actor_name TEXT
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_room_checks_tenant_ts ON room_checks(tenant_id, checked_at DESC);`);

      // 5) asset_checks (new)
      await client.query(`
        CREATE TABLE IF NOT EXISTS asset_checks (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES tenants(id),
          qrcode_token TEXT NOT NULL,
          location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
          asset_name TEXT,
          note TEXT,
          checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          actor_name TEXT
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_asset_checks_tenant_ts ON asset_checks(tenant_id, checked_at DESC);`);

      // 6) fire_audits (new)
      await client.query(`
        CREATE TABLE IF NOT EXISTS fire_audits (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES tenants(id),
          qrcode_token TEXT NOT NULL,
          location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
          equipment_name TEXT,
          working BOOLEAN NOT NULL,
          last_service DATE,
          next_service DATE,
          note TEXT,
          checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          actor_name TEXT
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fire_audits_tenant_ts ON fire_audits(tenant_id, checked_at DESC);`);

      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch(_) {}
      throw e;
    } finally {
      try { await client.query(`SELECT pg_advisory_unlock($1)`, [MIG_LOCK_KEY]); } catch(_){}
      client.release();
    }
  }

  // --- helper: compute public base URL on server ---
  function publicBase(req) {
    const conf = process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || '';
    if (conf) return conf.replace(/\/+$/, '');
    const xfProto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || '';
    const proto = xfProto || req.protocol || 'http';
    const host  = req.headers['x-forwarded-host'] || req.get('host');
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  /* ---------- Small helper ---------- */
  function normalizeToken(raw){
    let t = String(raw || "").trim();
    try { t = decodeURIComponent(t); } catch {}
    if (t.startsWith("#")) t = t.slice(1);
    if (/^https?:\/\//i.test(t)) { const parts = t.split("#"); t = parts[1] || t.split("/").pop(); }
    if (t.includes("/")) t = t.split("/").pop();
    return t;
  }
  // Resolve a QR token into a tenant-scoped object (for new endpoints)
async function resolveQr(req, token){
  const norm = normalizeToken(token || "");
  if (!norm) throw new Error('no token');

  // Get referenced location
  const { rows: qrRows } = await pool.query(
    "SELECT location_id, token FROM qrcodes WHERE token=$1",
    [norm]
  );
  if (!qrRows.length) throw new Error('invalid token (qr)');

  const { rows: locRows } = await pool.query(
    "SELECT id, name, TRIM(UPPER(COALESCE(type,''))) AS type, tenant_id FROM locations WHERE id=$1",
    [qrRows[0].location_id]
  );
  if (!locRows.length) throw new Error('invalid token (loc)');

  // Enforce tenant
  const tid = Number(req.user?.tenant_id || 0);
  if (!tid || tid !== Number(locRows[0].tenant_id)) throw new Error('forbidden tenant');

  return {
    token: norm,
    tenant_id: Number(locRows[0].tenant_id),
    location_id: Number(locRows[0].id),
    name: String(locRows[0].name || ''),
    type: String(locRows[0].type || '').toUpperCase()
  };
}

// Resolve token -> { id, name, type (UPPER), tenant_id }
async function resolveLocationByToken(token){
  const norm = normalizeToken(token || "");
  const { rows: qrRows } = await pool.query("SELECT location_id FROM qrcodes WHERE token=$1", [norm]);
  if (!qrRows.length) return null;
  const { rows: locRows } = await pool.query(
    "SELECT id, name, TRIM(UPPER(COALESCE(type,''))) AS type, tenant_id FROM locations WHERE id=$1",


    [qrRows[0].location_id]
  );
  return locRows[0] || null;
}
/* ---------- Resolve token → location info (id/name/type) ---------- */
app.get("/tap/locinfo/:token", auth, async (req, res) => {
  try{
    const loc = await resolveLocationByToken(req.params.token || "");
    if (!loc) return res.status(404).json({ error: "bad token" });
    res.json({ id: loc.id, name: loc.name || "", type: String(loc.type || "").toUpperCase().trim() });

  }catch(e){
    console.error("[tap/locinfo]", e);
    res.status(500).json({ error: "server error" });
  }
});
  /* ---------- Minimal self /me just for role/category checks ---------- */
  app.get("/ff/me", auth, (req, res) => {
    res.json({ role: req.user?.role || "", category: req.user?.category || "" });
  });

  /* ---------- Shared light theme + SPA index redirect for TAP pages ---------- */
  const TAP_CSS = `
  :root{ --bg:#4E6E81; --panel:#FFFFFF; --text:#EAF1F4; --muted:#D7E3E8; --accent:#7BA297; --border:#3E5967; }
  body{
    font:15px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    max-width:640px; margin:24px auto; padding:0 12px; background:var(--bg); color:var(--text)
  }
  .card{
    background:var(--panel); border:1px solid var(--border); border-radius:16px;
    padding:16px; box-shadow:0 6px 20px rgba(20,31,50,.06); color:#2E2E2E;
  }
  button{
    padding:10px 14px; border-radius:10px; border:0; background:var(--accent); color:#fff;
    font-weight:700; cursor:pointer
  }
  #msg{ margin:10px 0 }
  header { display:flex;align-items:center;gap:8px;margin:12px 0 10px }
  header img{ height:56px }
  `;
  const toAppUrl = (api) => "/index.html?v=20251112b&api=" + encodeURIComponent(api || "");


  /* ---------- Fridge: tap page ---------- */
  app.get("/tap/fridge/:token", (req, res) => {
    const token = String(req.params.token||"").trim();
    const apiBase = (PUBLIC_API_URL || "").replace(/\/+$/,"") || publicBase(req);
    const appUrl  = toAppUrl(apiBase);
    // ⬅️ put this just before .status(200)...
res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
res.set('Pragma','no-cache');
res.set('Expires','0');

    res.status(200).type("html").send(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Ernos • Fridge Temp</title>
<style>${TAP_CSS}
  input{width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:#fff;color:#2E2E2E}
  .muted{ color:#606060 }
</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" onerror="this.src='/skin/icons/icon.svg'"></header>
   <div id="msg" class="card">Loading…</div>
  <div class="card">
    <label class="muted">Enter temperature (°C)</label>
    <input id="t" type="number" step="0.1" inputmode="decimal" placeholder="e.g. 5.0">
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button id="save">Save</button>
    </div>
  </div>
  <div id="issueBox" class="card" style="display:none;margin-top:10px">
    <div style="margin-bottom:6px;font-weight:700">Report maintenance issue</div>
    <textarea id="issueText" placeholder="Describe the problem…"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button id="btnSendIssue">Send</button>
    </div>
  </div>

<script>(function(){
  var TOKEN=${JSON.stringify(token)};
  var API=${JSON.stringify(apiBase)};
  var JWT=''; try{ JWT=(sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||''); }catch(_){}
  var appUrl=${JSON.stringify(appUrl)};
  function setMsg(t){ var el=document.getElementById('msg'); el.textContent=t; }
  try{ history.pushState({ernosTap:1},""); addEventListener("popstate", function(){ location.replace(appUrl); }); }catch(_){}
  if(!JWT){ try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){ } location.replace(appUrl); return; }
  fetch(API+"/ff/me",{headers:{'Authorization':"Bearer "+JWT}})
   .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
   .then(me=>{
      var r=String(me.role||"").toUpperCase(), c=String(me.category||"").toUpperCase();
      if(!(r==="ADMIN"||r==="ADMIN_GLOBAL"||c==="NURSING")){ setMsg("Access denied: fridge logging is for Nursing."); return; }
      document.getElementById('save').onclick=function(){
        var v=parseFloat(document.getElementById('t').value);
        if(!isFinite(v)){ setMsg("Enter a valid number"); return; }
        fetch(API+"/ff/fridge/log",{method:"POST",headers:{'Content-Type':"application/json",'Authorization':"Bearer "+JWT},body:JSON.stringify({token:TOKEN,temp_c:v})})
         .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
         .then(j=> setMsg("Saved " + v.toFixed(1) + "°C at " + (j.locationName||'fridge') + "."))
         .catch(e=> setMsg(e.message||String(e)));
      };
      // Show maintenance box for allowed roles
try{
  var role = String(me.role||"").toUpperCase();
  var cat  = String(me.category||"").toUpperCase();
  if (role==='ADMIN' || role==='ADMIN_GLOBAL' || cat==='NURSING') {
    var box = document.getElementById('issueBox'); if (box) box.style.display='';
    var btnI = document.getElementById('btnSendIssue');
    if (btnI) btnI.onclick = function(){
      var txt=(document.getElementById('issueText').value||'').trim();
      if(!txt){ setMsg('No issue text entered.'); return; }
      fetch(API + '/issues',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},
        body: JSON.stringify({ token: TOKEN, text: txt })
      })
      .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
      .then(()=>{ setMsg('Issue sent. Thank you!'); document.getElementById('issueText').value=''; })
      .catch(e=> setMsg(e.message||String(e)));
    };
  }
}catch(_){}

   })
   .catch(e=> setMsg(e.message||String(e)));
})();</script></body></html>`);
  });

  /* ---------- Fire: tap page ---------- */
  app.get("/tap/fire/:token", (req, res) => {
    const token = String(req.params.token||"").trim();
    const apiBase = (PUBLIC_API_URL || "").replace(/\/+$/,"") || publicBase(req);
    const appUrl  = toAppUrl(apiBase);
    // ⬅️ put this just before .status(200)...
res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
res.set('Pragma','no-cache');
res.set('Expires','0');

    res.status(200).type("html").send(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Ernos • Fire Check</title>
<style>${TAP_CSS}
  textarea,select{width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:#fff;color:#2E2E2E}
  textarea{min-height:88px}
  .muted{ color:#606060 }
</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" onerror="this.src='/skin/icons/icon.svg'"></header>
  <div id="msg" class="card">Loading…</div>
    <div class="card">
    <label class="muted">What did you check?</label>
    <select id="kind">
      <option value="PANEL">Fire panel</option>
      <option value="EXTINGUISHER">Extinguisher</option>
      <option value="DRILL">Emergency drill completed</option>
    </select>

    <div id="miniAudit" style="margin-top:10px">
      <label class="muted">Working?</label>
      <select id="ok">
        <option value="YES">Yes</option>
        <option value="NO">No</option>
      </select>

      <label class="muted" style="margin-top:10px">Last serviced</label>
      <input id="lastServiced" type="date">

      <label class="muted" style="margin-top:10px">Next service due</label>
      <input id="nextDue" type="date">

      <label class="muted" style="margin-top:10px">Note (optional)</label>
      <textarea id="note" placeholder="e.g. Weekly panel check OK"></textarea>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button id="save">Save</button>
    </div>
  </div>

  <div id="issueBox" class="card" style="display:none; margin-top:10px">
    <div style="margin-bottom:6px;font-weight:700">Report maintenance issue</div>
    <textarea id="issueText" placeholder="Describe the problem…"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button id="btnSendIssue">Send</button>
    </div>
  </div>

<script>(function(){
  var TOKEN=${JSON.stringify(token)};
  var API=${JSON.stringify(apiBase)};
  var JWT=''; try{ JWT=(sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||''); }catch(_){}
  var appUrl=${JSON.stringify(appUrl)};
  function setMsg(t){ var el=document.getElementById('msg'); el.textContent=t; }
  try{ history.pushState({ernosTap:1},""); addEventListener("popstate", function(){ location.replace(appUrl); }); }catch(_){}
  if(!JWT){ try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){ } location.replace(appUrl); return; }
 document.getElementById('save').onclick = function () {
  var kind = String(document.getElementById('kind').value || 'PANEL');

  // Read mini-audit fields if present; stay compatible if they don’t exist yet
  var okEl  = document.getElementById('ok');
  var lsEl  = document.getElementById('lastServiced');
  var ndEl  = document.getElementById('nextDue');
  var exEl  = document.getElementById('note');

  var ok    = okEl ? String(okEl.value || '') : '';
  var ls    = lsEl ? String(lsEl.value || '') : '';
  var due   = ndEl ? String(ndEl.value || '') : '';
  var extra = exEl ? String(exEl.value || '') : '';

  // Structured note payload (simple, HIQA-friendly summary)
  var note = [
    ok ? ('OK=' + ok) : '',
    ls ? ('LAST=' + ls) : '',
    due ? ('NEXT=' + due) : '',
    extra ? ('NOTE=' + extra) : ''
  ].filter(Boolean).join(' | ');

  fetch(API + "/ff/fire/check", {
    method: "POST",
    headers: { 'Content-Type': "application/json", 'Authorization': "Bearer " + JWT },
    body: JSON.stringify({ token: TOKEN, kind: kind, note: note })
  })
    .then(r => r.json().then(j => { if (!r.ok) throw new Error(j && j.error || ('HTTP ' + r.status)); return j; }))
    .then(j => setMsg("Saved " + kind + " at " + (j.locationName || 'fire location') + "."))
    .catch(e => setMsg(e.message || String(e)));
};
try{
  // Show the maintenance box if present
  var box = document.getElementById('issueBox');
  if (box) box.style.display = '';

  // Wire the Send button
  var btnI = document.getElementById('btnSendIssue');
  if (btnI) btnI.onclick = function(){
    var txt = (document.getElementById('issueText').value || '').trim();
    if (!txt) { setMsg('No issue text entered.'); return; }
    fetch(API + '/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + JWT },
      body: JSON.stringify({ token: TOKEN, text: txt })
    })
    .then(r => r.json().then(j => { if (!r.ok) throw new Error(j && j.error || ('HTTP ' + r.status)); return j; }))
    .then(() => { setMsg('Issue sent. Thank you!'); document.getElementById('issueText').value = ''; })
    .catch(e => setMsg(e.message || String(e)));
  };
}catch(_){}

})();</script></body></html>`);
  });



  /* ---------- Housekeeping / Maintenance TAP page ---------- */
  app.get("/tap/ci/:token", (req, res) => {
    const token = req.params.token || "";
    const apiBase = (PUBLIC_API_URL || "").replace(/\/+$/,"") || publicBase(req);
    const appUrl  = toAppUrl(apiBase);
    // ⬅️ put this just before .status(200)...
res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
res.set('Pragma','no-cache');
res.set('Expires','0');

    res
      .status(200)
      .type("html")
      .send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1,viewport-fit=cover">
<title>Ernos • Housekeeping</title>
<style>${TAP_CSS}
  .row{ display:flex; gap:8px; justify-content:flex-end }
  textarea{
    width:100%; min-height:84px; border-radius:10px; border:1px solid var(--border);
    background:#fff; color:#2E2E2E; padding:8px;
  }
</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" onerror="this.src='/skin/icons/icon.svg'"></header>
  <div id="msg" class="card">Contacting server…</div>
  <div id="issueBox" class="card" style="display:none;margin-top:10px">
    <div style="margin-bottom:6px;font-weight:700">Report maintenance issue</div>
    <textarea id="issueText" placeholder="Describe the problem…"></textarea>
    <div class="row" style="margin-top:8px">
      <button id="btnSendIssue">Send</button>
    </div>
  </div>
<script>(function(){
  function show(el){ if(el) el.style.display=''; }
  function setMsg(t){ var el=document.getElementById('msg'); el.textContent=t; }
  var API=${JSON.stringify(apiBase)};
  var TOKEN=${JSON.stringify(token)};
  var JWT=''; try{ JWT=(sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||''); }catch(_){}
  var appUrl=${JSON.stringify(appUrl)};
  try{ history.pushState({ernosTap:1},""); addEventListener("popstate", function(){ location.replace(appUrl); }); }catch(_){}
  if(!JWT){ try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){ } location.replace(appUrl); return; }

  fetch(API + '/tap/ci/perform',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},
    body:JSON.stringify({token:TOKEN})
  })
  .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
  .then(j=>{
  var kind = String(j.locationType||'').toUpperCase();
  if (kind === 'ASSET') {
    setMsg('✅ Asset ' + (j.locationName||'') + ' checked and cleaned.');
  } else {
    var role=String(j.role||'').toUpperCase();
    var text = j.action==='checkin'
      ? (role==='HOUSEKEEPING'?'Cleaning started in ': role==='NURSING'?'Visit started in ': role==='MAINTENANCE'?'Maintenance started in ':'Checked in at ')
      : (role==='HOUSEKEEPING'?'Cleaning finished in ': role==='NURSING'?'Visit finished in ': role==='MAINTENANCE'?'Maintenance finished in ':'Checked out from ');
    var dur = (j.durationMin!=null && j.action==='checkout') ? (' — duration '+j.durationMin+' min') : '';
    setMsg('✅ '+text+(j.locationName||'this location')+dur);
  }
  show(document.getElementById('issueBox'));
  var btn=document.getElementById('btnSendIssue');
  if(btn) btn.onclick=function(){
    var txt=(document.getElementById('issueText').value||'').trim();
    if(!txt){ setMsg('No issue text entered.'); return; }
    fetch(API + '/issues',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},
      body:JSON.stringify({token:TOKEN,text:txt})
    })
    .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
    .then(()=>{ setMsg('Issue sent. Thank you!'); document.getElementById('issueText').value='';})
    .catch(e=>setMsg(e.message||String(e)));
  };
})

  .catch(e=> setMsg('Failed: '+(e&&e.message?e.message:e)));
})();</script></body></html>`);
  });

  /* ---------- Nursing TAP page (logs, then jumps to SPA with context) ---------- */
app.get("/tap/nursing/:token", (req, res) => {
  const token = req.params.token || "";
  const apiBase = (PUBLIC_API_URL || "").replace(/\/+$/,"") || publicBase(req);
  const appUrl  = toAppUrl(apiBase);
  // ⬅️ put this just before .status(200)...
res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
res.set('Pragma','no-cache');
res.set('Expires','0');

  res 
    .status(200)
    .type("html")
    .send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1,viewport-fit=cover">
<title>Ernos • Nursing</title>
<style>${TAP_CSS}</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" onerror="this.src='/skin/icons/icon.svg'"></header>
  <div id="msg" class="card">Logging nursing check…</div>
<script>(function(){
  function setMsg(t){ var el=document.getElementById('msg'); el.textContent=t; }
  var API=${JSON.stringify(apiBase)}; var TOKEN=${JSON.stringify(token)};
  var JWT=''; try{ JWT=(sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||''); }catch(_){}
  var appUrl=${JSON.stringify(appUrl)};
  try{ history.pushState({ernosTap:1},""); addEventListener("popstate", function(){ location.replace(appUrl); }); }catch(_){}
  if(!JWT){ try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){ } location.replace(appUrl); return; }

  fetch(API + '/tap/nursing/check',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},
    body:JSON.stringify({token:TOKEN})
  })
  .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
  .then(j=>{
    setMsg('✅ Resident checked at '+(j.locationName||'this location')+'. Opening…');
    var loc = j.locationId ? String(j.locationId) : '';
    var nm  = j.locationName ? String(j.locationName) : '';
    var hash = '#nursing' + (loc||nm ? ('?'+ new URLSearchParams({loc:loc,name:nm}).toString()) : '');
    try{ setTimeout(function(){ location.replace(appUrl + hash); }, 450); }catch(_){}
  })
  .catch(e=> setMsg('Failed: '+(e&&e.message?e.message:e)));
})();</script></body></html>`);
});

/* ---------- Nursing TAP: ROOM -> message + maintenance box + open Nursing ---------- */
app.get("/tap/nursing/room/:token", (req, res) => {
  const token   = req.params.token || "";
  const apiBase = (PUBLIC_API_URL || "").replace(/\/+$/,"") || publicBase(req);
  const appUrl  = ("/index.html?v=20251113b&api=" + encodeURIComponent(apiBase)).replace(/\/+$/,"");

  res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma','no-cache');
  res.set('Expires','0');

  res
    .status(200)
    .type("html")
    .send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1,viewport-fit=cover">
<title>Ernos • Nursing (Room)</title>
<style>
  :root{ --bg:#4E6E81; --panel:#FFFFFF; --text:#EAF1F4; --muted:#D7E3E8; --accent:#7BA297; --border:#3E5967; }
  body{font:15px system-ui;max-width:640px;margin:24px auto;padding:0 12px;background:var(--bg);color:var(--text)}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:16px;box-shadow:0 6px 20px rgba(20,31,50,.06);color:#2E2E2E}
  .row{display:flex;gap:8px;justify-content:flex-end}
  textarea{width:100%;min-height:84px;border-radius:10px;border:1px solid var(--border);background:#fff;color:#2E2E2E;padding:8px}
  button{padding:10px 14px;border-radius:10px;border:0;background:var(--accent);color:#fff;font-weight:700;cursor:pointer}
  #msg{margin:10px 0}
</style>
<body>
  <div id="msg" class="card">Logging resident check…</div>

  <div id="issueBox" class="card" style="display:none;margin-top:10px">
    <div style="margin-bottom:6px;font-weight:700">Report maintenance issue</div>
    <textarea id="issueText" placeholder="Describe the problem…"></textarea>
    <div class="row" style="margin-top:8px">
      <button id="btnSendIssue">Send</button>
    </div>
  </div>

  <div id="navBox" class="card" style="display:none;margin-top:10px">
    <div style="margin-bottom:6px;font-weight:700">Next step</div>
    <div class="row">
      <button id="btnOpen">Open Nursing View</button>
    </div>
  </div>

<script>(function(){
  var TOKEN=${JSON.stringify(token)};
  var API=${JSON.stringify(apiBase)};
  var APP=${JSON.stringify(appUrl)};

  function setMsg(t){ var el=document.getElementById('msg'); if (el) el.textContent=t; }
  function show(id){ var el=document.getElementById(id); if(el) el.style.display=''; }

  // auth gate
  var JWT=""; try{ JWT=(sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||""); }catch(_){}
  if(!JWT){
    try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){}
    location.replace(APP);
    return;
  }

  // 1) Log the nursing ROOM check (server stores it in room_checks)
  fetch(API + '/ff/room/check', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},
    body: JSON.stringify({ token: TOKEN })
  })
  .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
  .then(j=>{
    // 2) Show confirmation + reveal maintenance box and "Open Nursing View" button
    setMsg('✅ Resident checked at ' + (j.locationName || 'this room') + '.');
    show('issueBox'); 
    show('navBox');

    // wire "Send issue"
    var btnI = document.getElementById('btnSendIssue');
    if (btnI) btnI.onclick = function(){
      var txt = (document.getElementById('issueText').value || '').trim();
      if (!txt){ setMsg('No issue text entered.'); return; }
      fetch(API + '/issues', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},
        body: JSON.stringify({ token: TOKEN, text: txt })
      })
      .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
      .then(()=>{ setMsg('Issue sent. Thank you!'); document.getElementById('issueText').value=''; })
      .catch(e=> setMsg(e.message||String(e)));
    };

    // wire "Open Nursing View"
    var btnOpen = document.getElementById('btnOpen');
    if (btnOpen) btnOpen.onclick = function(){
      var hash = '#report?kind=' + encodeURIComponent('room') + '&token=' + encodeURIComponent(TOKEN);
      location.replace(APP + hash);
    };
  })
  .catch(e=> setMsg('Failed: ' + (e && e.message ? e.message : e)));
})();</script>
</body></html>`);
});



/* ---------- Nursing TAP: ASSET -> message + issue box ---------- */
app.get("/tap/nursing/asset/:token", (req, res) => {
  const token   = req.params.token || "";
  const apiBase = (PUBLIC_API_URL || "").replace(/\/+$/,"") || publicBase(req);
  const appUrl  = ("/index.html?v=20251113b&api=" + encodeURIComponent(apiBase)).replace(/\/+$/,"");

  res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma','no-cache');
  res.set('Expires','0');

  res
    .status(200)
    .type("html")
    .send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1,viewport-fit=cover">
<title>Ernos • Nursing (Asset)</title>
<style>
  :root{ --bg:#4E6E81; --panel:#FFFFFF; --text:#EAF1F4; --muted:#6C7A86; --accent:#7BA297; --border:#3E5967; }
  body{font:15px system-ui;max-width:640px;margin:24px auto;padding:0 12px;background:var(--bg);color:var(--text)}
  .card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px;box-shadow:0 6px 20px rgba(20,31,50,.06);color:#2E2E2E}
  .muted{color:#606060}
  button{padding:10px 14px;border-radius:10px;border:0;background:var(--accent);color:#fff;font-weight:700;cursor:pointer}
  textarea{width:100%;min-height:84px;border-radius:10px;border:1px solid var(--border);background:#fff;color:#2E2E2E;padding:8px}
  header{display:flex;align-items:center;gap:8px;margin:12px 0 10px}
  header img{height:56px}
</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" onerror="this.src='/skin/icons/icon.svg'"></header>
  <div id="msg" class="card">Contacting server…</div>
  <div id="issueBox" class="card" style="display:none;margin-top:10px">
    <div style="margin-bottom:6px;font-weight:700">Report maintenance issue</div>
    <textarea id="issueText" placeholder="Describe the problem…"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button id="btnSendIssue">Send</button>
    </div>
  </div>

<script>(function(){
  var TOKEN=${JSON.stringify(token)};
  var API=${JSON.stringify(apiBase)};
  var APP=${JSON.stringify(appUrl)};
  var JWT=""; try{ JWT=(sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||""); }catch(_){}
  function setMsg(t){ var el=document.getElementById('msg'); el.textContent=t; }
  try{ history.pushState({ernosTap:1},""); addEventListener("popstate", function(){ location.replace(APP); }); }catch(_){}

  if(!JWT){
    try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){}
    location.replace(APP);
    return;
  }

  // 1) Perform the asset check
  fetch(API + '/ff/asset/check', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},
    body: JSON.stringify({ token: TOKEN })
  })
  .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status)); return j; }))
  .then(j=>{
    setMsg('✅ Asset ' + (j.locationName || '') + ' checked and cleaned.');
    // 2) Show maintenance issue box
    var box=document.getElementById('issueBox'); if (box) box.style.display='';
    var btn=document.getElementById('btnSendIssue');
    if (btn) btn.onclick=function(){
      var txt=(document.getElementById('issueText').value||'').trim();
      if(!txt){ setMsg('No issue text entered.'); return; }
      fetch(API + '/issues', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},
        body: JSON.stringify({ token: TOKEN, text: txt })
      })
      .then(r=>r.json().then(j2=>{ if(!r.ok) throw new Error(j2 && j2.error || ('HTTP '+r.status)); return j2; }))
      .then(()=>{ setMsg('Issue sent. Thank you!'); document.getElementById('issueText').value=''; })
      .catch(e=> setMsg(e.message||String(e)));
    };
  })
  .catch(e=> setMsg('Failed: ' + (e && e.message ? e.message : e)));
})();</script>
</body>`);
});



  /* ---------- Admin/Auditor TAP page ---------- */
  app.get("/tap/env/:token", (req, res) => {
    const tok = String(req.params.token || "").trim();
    // For env tap, we still allow localStorage override on client, but provide server fallback literal.
    const apiFallback = publicBase(req);
    const appUrl = toAppUrl(apiFallback);
    res
      .type("html")
      .send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Ernos • Auditor Tap</title>
<style>${TAP_CSS}</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" onerror="this.src='/skin/icons/icon.svg'"></header>
  <div id="msg" class="card">Contacting server…</div>
<script>(function(){
  var TOKEN=${JSON.stringify(tok)};
  var API = ""; try{ API=(localStorage.getItem("ernosApi")||${JSON.stringify(apiFallback)}).replace(/\\/+$/,''); }catch(_){}
  var JWT = ""; try{ JWT=(sessionStorage.getItem("ernosToken")||localStorage.getItem("ernosToken")||""); }catch(_){}
  var appUrl=${JSON.stringify(appUrl)};
  try{ history.pushState({ernosTap:1},""); addEventListener("popstate", function(){ location.replace(appUrl); }); }catch(_){}
  function setMsg(t){ var el=document.getElementById('msg'); el.textContent=t; }
  if(!JWT){
    setMsg("You are not signed in. Opening the app…");
    try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){}
    location.replace(appUrl);
    return;
  }
  setMsg("Checking permissions…");
  fetch(API + "/me",{headers:{'Authorization':"Bearer "+JWT}})
   .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
   .then(me=>{
      var role=String(me.role||"").toUpperCase(); var cat=String(me.category||"").toUpperCase();
      if(!(role==="ADMIN"||cat==="AUDITOR")){ location.replace("/tap/u/"+TOKEN); return; }
      var audId=parseInt(localStorage.getItem("ernos_current_audit_id")||"0",10);
      if(!audId){ setMsg("Auditor signed in, but no open audit in this browser. Open the app, click an audit, then tap again."); return; }
      return fetch(API+"/env/tap",{
        method:"POST",
        headers:{'Content-Type':"application/json",'Authorization':"Bearer "+JWT},
        body: JSON.stringify({token:TOKEN,auditId:audId})
      })
      .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
      .then(j=> setMsg("Location added to audit: "+(j.locationName||"")+".")); 
   })
   .catch(e=> setMsg(e.message||String(e)));
})();</script></body></html>`);
  });

  /* ---------- Nursing check API (one-shot) ---------- */
  app.post("/tap/nursing/check", auth, async (req, res) => {
    try{
      const { token } = req.body || {};
      const norm = normalizeToken(token || "");
      const { rows: qrRows } = await pool.query("SELECT location_id FROM qrcodes WHERE token=$1", [norm]);
      if (!qrRows.length) return res.status(404).json({ error: "bad token" });

      const { rows: locRows } = await pool.query("SELECT id,name,tenant_id FROM locations WHERE id=$1", [qrRows[0].location_id]);
      if (!locRows.length) return res.status(404).json({ error: "no location" });
      const loc = locRows[0];

      const userId = Number(req.user?.id || req.user?.user_id || 0);
      const { rows: userRows } = await pool.query("SELECT * FROM users WHERE id=$1", [userId]);
      if (!userRows.length) return res.status(401).json({ error: "no user" });
      const u = userRows[0];

            const tid = loc.tenant_id || tenantIdOf(req);
      const ts = nowISO();
      await pool.query(
        `INSERT INTO checkins(user_id,location_id,checkin_at,checkout_at,note,user_name,user_category,location_name,tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [u.id, loc.id, ts, ts, "", u.name, "NURSING", loc.name, tid]
      );
      res.json({ ok: true, locationName: loc.name, locationId: loc.id, checked_at: ts });



    }catch(e){
      console.error("[tap/nursing/check]", e);
      res.status(500).json({ error: "server error" });
    }
  });
    /* ---------- Housekeeping TAP: toggle cleaning (start / finish) ---------- */
  app.post("/tap/hk/toggle", auth, async (req, res) => {
    try{
      const { token } = req.body || {};
      const norm = normalizeToken(token || "");

      // 1) Resolve token → location
      const { rows: qrRows } = await pool.query(
        "SELECT location_id FROM qrcodes WHERE token=$1",
        [norm]
      );
      if (!qrRows.length){
        return res.status(404).json({ error: "bad token" });
      }

      const { rows: locRows } = await pool.query(
        "SELECT id,name,tenant_id FROM locations WHERE id=$1",
        [qrRows[0].location_id]
      );
      if (!locRows.length){
        return res.status(404).json({ error: "no location" });
      }
      const loc = locRows[0];

      // 2) Current user
      const userId = Number(req.user?.id || req.user?.user_id || 0);
      const { rows: userRows } = await pool.query(
        "SELECT * FROM users WHERE id=$1",
        [userId]
      );
      if (!userRows.length){
        return res.status(401).json({ error: "no user" });
      }
      const u = userRows[0];

      const role = String(u.role || "").toUpperCase();
      const cat  = String(u.category || "").toUpperCase();

      // Only housekeeping + admins
      if (!(cat === "HOUSEKEEPING" || role === "ADMIN" || role === "ADMIN_GLOBAL")){
        return res.status(403).json({ error: "forbidden" });
      }

      const tid = loc.tenant_id || tenantIdOf(req);
      const ts  = nowISO();

      // 3) Check if there is an open HK checkin for this ROOM
      const { rows: openRows } = await pool.query(
        `SELECT id
           FROM checkins
          WHERE location_id = $1
            AND tenant_id   = $2
            AND UPPER(COALESCE(user_category,'')) = 'HOUSEKEEPING'
            AND checkout_at IS NULL
          ORDER BY checkin_at DESC
          LIMIT 1`,
        [loc.id, tid]
      );

      let mode = "started";

      if (openRows.length){
        // Second tap → finish cleaning
        await pool.query(
          `UPDATE checkins
              SET checkout_at = $1
            WHERE id = $2`,
          [ts, openRows[0].id]
        );
        mode = "finished";
      } else {
        // First tap → start cleaning
        await pool.query(
          `INSERT INTO checkins(
             user_id, location_id, checkin_at, checkout_at,
             note, user_name, user_category, location_name, tenant_id
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
           [u.id, loc.id, ts, null, "", u.name, "HOUSEKEEPING", loc.name, tid]
        );
      }

      return res.json({
        ok: true,
        mode,
        locationName: loc.name,
        locationId: loc.id,
        at: ts
      });
    }catch(e){
      console.error("[tap/hk/toggle]", e);
      return res.status(500).json({ error: "server error" });
    }
  });

 
app.get("/hk/rooms", auth, async (req, res) => {
  try{
    const tid = tenantIdOf(req);
    const role = String(req.user?.role || "").toUpperCase();
    const cat  = String(req.user?.category || "").toUpperCase();

    if (!(cat === "HOUSEKEEPING" || cat === "MANAGER" || role === "ADMIN" || role === "ADMIN_GLOBAL")) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { rows } = await pool.query(
      `SELECT
         l.id,
         l.name,

         /* most recent finished housekeeping start time */
         (
           SELECT c.checkin_at
           FROM checkins c
           WHERE c.location_id = l.id
             AND c.tenant_id = l.tenant_id
             AND UPPER(COALESCE(c.user_category,'')) = 'HOUSEKEEPING'
             AND c.checkout_at IS NOT NULL
           ORDER BY c.checkout_at DESC
           LIMIT 1
         ) AS last_checkin,

         /* most recent finished housekeeping finish time */
         (
           SELECT c.checkout_at
           FROM checkins c
           WHERE c.location_id = l.id
             AND c.tenant_id = l.tenant_id
             AND UPPER(COALESCE(c.user_category,'')) = 'HOUSEKEEPING'
             AND c.checkout_at IS NOT NULL
           ORDER BY c.checkout_at DESC
           LIMIT 1
         ) AS last_checkout,

         /* who finished the last cleaning */
         (
           SELECT c.user_name
           FROM checkins c
           WHERE c.location_id = l.id
             AND c.tenant_id = l.tenant_id
             AND UPPER(COALESCE(c.user_category,'')) = 'HOUSEKEEPING'
             AND c.checkout_at IS NOT NULL
           ORDER BY c.checkout_at DESC
           LIMIT 1
         ) AS last_cleaner_name,

         /* is there an open housekeeping session right now */
         EXISTS(
           SELECT 1
           FROM checkins c
           WHERE c.location_id = l.id
             AND c.tenant_id = l.tenant_id
             AND UPPER(COALESCE(c.user_category,'')) = 'HOUSEKEEPING'
             AND c.checkout_at IS NULL
         ) AS in_progress,

         /* current cleaning start time */
         (
           SELECT c.checkin_at
           FROM checkins c
           WHERE c.location_id = l.id
             AND c.tenant_id = l.tenant_id
             AND UPPER(COALESCE(c.user_category,'')) = 'HOUSEKEEPING'
             AND c.checkout_at IS NULL
           ORDER BY c.checkin_at DESC
           LIMIT 1
         ) AS in_progress_checkin_at,

         /* who is currently cleaning */
         (
           SELECT c.user_name
           FROM checkins c
           WHERE c.location_id = l.id
             AND c.tenant_id = l.tenant_id
             AND UPPER(COALESCE(c.user_category,'')) = 'HOUSEKEEPING'
             AND c.checkout_at IS NULL
           ORDER BY c.checkin_at DESC
           LIMIT 1
         ) AS in_progress_by_name

       FROM locations l
       WHERE l.tenant_id = $1
         AND UPPER(COALESCE(l.type,'')) = 'ROOM'
       ORDER BY l.name`,
      [tid]
    );

    res.json({ items: rows });
  } catch (e) {
    console.error("[hk/rooms]", e);
    res.status(500).json({ error: "server error" });
  }
});
// Lightweight resolver for client bootstrap
app.post("/qrcodes/resolve", auth, async (req, res) => {
  try{
    const { token } = req.body || {};
    const loc = await resolveLocationByToken(token);
    if (!loc) return res.status(404).json({ error: "bad token" });
    res.json({ id: loc.id, name: loc.name, type: loc.type });
  }catch(e){
    res.status(500).json({ error: "server error" });
  }
});

  /* ---------- Fridge API ---------- */
  app.post("/ff/fridge/log", auth, async (req, res) => {
    try{
      const { token, temp_c } = req.body || {};
      const norm = normalizeToken(token || "");
      const t = Number(temp_c);
      if (!norm || !Number.isFinite(t)) return res.status(400).json({ error: "token and temp_c required" });

      const { rows: qrRows } = await pool.query("SELECT location_id FROM qrcodes WHERE token=$1",[norm]);
      if (!qrRows.length) return res.status(404).json({ error: "bad token" });

      const { rows: locRows } = await pool.query("SELECT id,name,type,tenant_id FROM locations WHERE id=$1",[qrRows[0].location_id]);
      if (!locRows.length) return res.status(404).json({ error: "no location" });
      const loc = locRows[0];
      if (String(loc.type||"").toUpperCase()!=="FRIDGE") return res.status(400).json({ error: "not a FRIDGE tag" });

      const tid = loc.tenant_id || tenantIdOf(req);
      const role = String(req.user?.category || req.user?.role || "").toUpperCase();

      const r = roleOf(req), c = catOf(req);
      if (!(r === "ADMIN" || r === "ADMIN_GLOBAL" || c === "NURSING")) {
        return res.status(403).json({ error: "forbidden" });
      }

      const userId = Number(req.user?.id || req.user?.user_id || 0) || null;
      const staffName =
        String(req.user?.name || req.user?.username || req.user?.email || "")
          .trim() || null;

      await pool.query(
        `INSERT INTO fridge_logs(
           location_id, taken_at, temp_c, staff_role, tenant_id, user_id, staff_name
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [loc.id, nowISO(), t, role, tid, userId, staffName]
      );
      res.json({ ok:true, locationName: loc.name, temp_c: t });
    }catch(e){
      console.error("[ff fridge/log]", e);
      res.status(500).json({ error: "server error" });
    }
  });

  app.get("/ff/fridge/logs", auth, async (req, res) => {
    const r = roleOf(req); const c = catOf(req);
    if (!(r === "ADMIN" || r === "ADMIN_GLOBAL" || c === "NURSING")) {
      return res.status(403).json({ error: "forbidden" });
    }
    const tid = tenantIdOf(req);
    const { rows } = await pool.query(
      `SELECT
         fl.id,
         fl.location_id,
         COALESCE(l.name, 'Location #' || fl.location_id) AS location_name,
         fl.taken_at,
         fl.temp_c,
         fl.staff_role,
         COALESCE(fl.staff_name, u.name, '') AS staff_name
       FROM fridge_logs fl
       LEFT JOIN locations l ON l.id = fl.location_id
       LEFT JOIN users     u ON u.id = fl.user_id
       WHERE fl.tenant_id = $1
       ORDER BY fl.taken_at DESC
       LIMIT 1000`,
      [tid]
    );
    res.json({ items: rows });
  });

  /* ---------- Fire API ---------- */
  app.post("/ff/fire/check", auth, async (req, res) => {
    try{
      const { token, kind, note } = req.body || {};
      const norm = normalizeToken(token || "");
      const K = String(kind||"PANEL").toUpperCase();
      if (!["PANEL","EXTINGUISHER","DRILL"].includes(K)) return res.status(400).json({ error: "bad kind" });

      const { rows: qrRows } = await pool.query("SELECT location_id FROM qrcodes WHERE token=$1",[norm]);
      if (!qrRows.length) return res.status(404).json({ error: "bad token" });

      const { rows: locRows } = await pool.query("SELECT id,name,type,tenant_id FROM locations WHERE id=$1",[qrRows[0].location_id]);
      if (!locRows.length) return res.status(404).json({ error: "no location" });
      const loc = locRows[0];
      if (String(loc.type||"").toUpperCase()!=="FIRE") return res.status(400).json({ error: "not a FIRE tag" });

      const tid = loc.tenant_id || tenantIdOf(req);
      const role = String(req.user?.category || req.user?.role || "").toUpperCase();

      await pool.query(
        "INSERT INTO fire_checks(location_id,check_at,kind,staff_role,note,tenant_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [loc.id, nowISO(), K, role, String(note||"").trim(), tid]
      );
      res.json({ ok:true, locationName: loc.name, kind: K });
    }catch(e){ console.error("[ff fire/check]", e); res.status(500).json({ error: "server error" }); }
  });

  app.get("/ff/fire/logs", auth, async (req, res) => {
    const r = roleOf(req);
    if (!(r === "ADMIN" || r === "ADMIN_GLOBAL")) {
      return res.status(403).json({ error: "forbidden" });
    }
    const tid = tenantIdOf(req);
    const { rows } = await pool.query(
      `SELECT
         fc.id,
         fc.location_id,
         COALESCE(l.name, 'Location #' || fc.location_id) AS location_name,
         fc.check_at,
         fc.kind,
         fc.staff_role,
         fc.note
       FROM fire_checks fc
       LEFT JOIN locations l ON l.id = fc.location_id
       WHERE fc.tenant_id = $1
       ORDER BY fc.check_at DESC
       LIMIT 1000`,
      [tid]
    );
    res.json({ items: rows });
  });
     // --- NEW: ROOM check (Nursing) ---
  app.post('/ff/room/check', auth, async (req, res)=>{
    try{
      // Safety: ensure room_checks table exists in case migrate() never ran
      await pool.query(`
        CREATE TABLE IF NOT EXISTS room_checks (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER REFERENCES tenants(id),
          qrcode_token TEXT NOT NULL,
          location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
          location_name TEXT,
          checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          actor_name TEXT
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_room_checks_tenant_ts
          ON room_checks(tenant_id, checked_at DESC);
      `);

      const { token } = req.body || {};
      const qr = await resolveQr(req, token);
      const me = req.user || {};
      const ts = nowISO();

      // 1) Log into room_checks
      await pool.query(
        `INSERT INTO room_checks(
           tenant_id, qrcode_token, location_id, location_name, checked_at, actor_id, actor_name
         )
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          qr.tenant_id,
          qr.token,
          qr.location_id,
          qr.name,
          ts,
          (me.id || me.user_id || null),
          (me.name || me.email || null)
        ]
      );

            // 2) Also log into generic checkins so the existing Nursing widget sees it
      await pool.query(
        `INSERT INTO checkins(
           user_id, location_id, checkin_at, checkout_at, note,
           user_name, user_category, location_name, tenant_id
         )
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          (me.id || me.user_id || null),
          qr.location_id,
          ts,   // checkin_at
          ts,   // checkout_at (instant completion)
          '',
          (me.name || me.email || null),
          'NURSING',
          qr.name,
          qr.tenant_id
        ]
      );


      res.json({ ok:true, locationName: qr.name });
    }catch(e){
      console.error('[ff/room/check]', e);
      res.status(400).json({ error: String(e.message||e) });
    }
  });


// --- NEW: ASSET "checked & cleaned" ---
app.post('/ff/asset/check', auth, async (req, res)=>{
  try{
    const { token, note } = req.body || {};
    const qr = await resolveQr(req, token);
    const me = req.user || {};
    await pool.query(
      `INSERT INTO asset_checks(tenant_id,qrcode_token,location_id,asset_name,note,actor_id,actor_name)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [qr.tenant_id, qr.token, qr.location_id, qr.name, (note||null), (me.id||me.user_id||null), (me.name||me.email||null)]
    );
    res.json({ ok:true, locationName: qr.name });
  }catch(e){ res.status(400).json({ error: String(e.message||e) }); }
});

// --- NEW: FRIDGE temp alias (/ff/fridge/temp) -> insert using your existing fridge_logs schema ---
app.post('/ff/fridge/temp', auth, async (req, res)=>{
  try{
    const { token, celsius, note } = req.body || {};
    const qr = await resolveQr(req, token);
    const val = Number(celsius);
    if (!Number.isFinite(val)) throw new Error('invalid temperature');

    // role gate consistent with /ff/fridge/log
    const r = String(req.user?.role||'').toUpperCase();
    const c = String(req.user?.category||'').toUpperCase();
    if (!(r==='ADMIN' || r==='ADMIN_GLOBAL' || c==='NURSING')) throw new Error('forbidden');

    const userId = Number(req.user?.id || req.user?.user_id || 0) || null;
    const staffName =
      String(req.user?.name || req.user?.username || req.user?.email || "")
        .trim() || null;

    // Insert into fridge_logs with user info
    const { rows } = await pool.query(
      `INSERT INTO fridge_logs(
         location_id, taken_at, temp_c, staff_role, tenant_id, user_id, staff_name
       )
       VALUES($1, now(), $2, $3, $4, $5, $6)
       RETURNING id`,
      [qr.location_id, val, (c || r), qr.tenant_id, userId, staffName]
    );

    const lastId = rows[0]?.id;

    // Optionally stash a note alongside last reading (ignore if no note column)
    if (note && String(note).trim() && lastId) {
      try{
        await pool.query(
          "UPDATE fridge_logs SET note = $1 WHERE id = $2",
          [String(note).trim(), lastId]
        );
      }catch(_){}
    }

    res.json({ ok:true, locationName: qr.name, celsius: val });
  }catch(e){
    res.status(400).json({ error: String(e.message||e) });
  }
});

// --- NEW: FIRE equipment mini-audit (separate table) ---
app.post('/ff/fire/audit', auth, async (req, res)=>{
  try{
    const { token, working, last_service, next_service, note } = req.body || {};
    const qr = await resolveQr(req, token);
    const me = req.user || {};

    await pool.query(
      `INSERT INTO fire_audits(tenant_id,qrcode_token,location_id,equipment_name,working,last_service,next_service,note,actor_id,actor_name)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        qr.tenant_id, qr.token, qr.location_id, qr.name,
        !!working, (last_service||null), (next_service||null), (note||null),
        (me.id||me.user_id||null), (me.name||me.email||null)
      ]
    );
    res.json({ ok:true, locationName: qr.name });
  }catch(e){ res.status(400).json({ error: String(e.message||e) }); }
});

// --- NEW: Dashboard summary for today ---
app.get('/ff/summary', auth, async (req, res)=>{
  try{
    const tid = Number(req.user?.tenant_id || 0);
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM room_checks  WHERE tenant_id=$1 AND checked_at::date = CURRENT_DATE)  AS room_checks,
         (SELECT COUNT(*) FROM asset_checks WHERE tenant_id=$1 AND checked_at::date = CURRENT_DATE)  AS asset_checks,
         (SELECT COUNT(*) FROM fridge_logs  WHERE tenant_id=$1 AND taken_at::date  = CURRENT_DATE)  AS fridge_logs,
         (SELECT COUNT(*) FROM fire_audits  WHERE tenant_id=$1 AND checked_at::date = CURRENT_DATE)  AS fire_audits`,
      [tid]
    );
    res.json({ today: rows[0] || { room_checks:0, asset_checks:0, fridge_logs:0, fire_audits:0 } });
  }catch(e){ res.status(400).json({ error: String(e.message||e) }); }
});



  // Recent checkins (nursing/housekeeping/maintenance) for dashboard
  app.get("/ff/checkins/recent", auth, async (req, res) => {
    try{
      const tid = tenantIdOf(req);

      const { rows } = await pool.query(
        `
        SELECT
          id,
          location_name,
          user_category,
          checkin_at,
          checkout_at,
          staff_name
        FROM (
          -- Legacy checkins table (housekeeping / maintenance / older nursing flow)
          SELECT
            c.id::bigint                          AS id,
            COALESCE(c.location_name, '')         AS location_name,
            UPPER(COALESCE(c.user_category, ''))  AS user_category,
            c.checkin_at                          AS checkin_at,
            c.checkout_at                         AS checkout_at,
            COALESCE(c.user_name, '')             AS staff_name
          FROM checkins c
          WHERE c.tenant_id = $1

          UNION ALL

          -- New nursing ROOM taps stored in room_checks
          SELECT
            (rc.id + 1000000000)::bigint          AS id,  -- offset to avoid clashes
            COALESCE(rc.location_name, '')        AS location_name,
            'NURSING'                             AS user_category,
            rc.checked_at                         AS checkin_at,
            rc.checked_at                         AS checkout_at,
            COALESCE(rc.actor_name, '')           AS staff_name
          FROM room_checks rc
          WHERE rc.tenant_id = $1
        ) AS merged
        ORDER BY COALESCE(checkout_at, checkin_at) DESC
        LIMIT 50
        `,
        [tid]
      );

      res.json({
        items: rows,    // what we expect now
        checkins: rows, // if old frontend used data.checkins
        rows: rows,     // if old frontend used data.rows
        recent: rows    // if old frontend used data.recent
      });
    }catch(e){
      console.error("[ff checkins/recent]", e);
      res.status(500).json({ error: "server error" });
    }
  });


   /* ---------- Alerts ---------- */
  app.get("/ff/alerts", auth, async (req, res) => {
    try {
      const r = roleOf(req);
      const c = catOf(req);
      const tid = tenantIdOf(req);

      const fridgeCfg = { min_c: 2, max_c: 8, due_hours: 24 };
      const fireCfg   = { panel_days: 7, extinguisher_days: 30, drill_days: 90 };

      const minutesSince = (d) => {
        if (!d) return Infinity;
        const t = +new Date(d);
        if (Number.isNaN(t)) return Infinity;
        return Math.max(0, Math.round((Date.now() - t) / 60000));
      };

      const daysSince = (d) => {
        if (!d) return Infinity;
        const t = +new Date(d);
        if (Number.isNaN(t)) return Infinity;
        return Math.max(0, Math.floor((Date.now() - t) / 86400000));
      };

      let fridge_due = [];
      let fridge_out_of_range = [];

      if (r === "ADMIN" || r === "ADMIN_GLOBAL" || c === "NURSING") {
        const { rows: fridges } = await pool.query(
          `SELECT
             l.id,
             l.name,
             (
               SELECT fl.temp_c
               FROM fridge_logs fl
               WHERE fl.location_id = l.id
                 AND fl.tenant_id = l.tenant_id
               ORDER BY fl.taken_at DESC
               LIMIT 1
             ) AS last_temp,
             (
               SELECT fl.taken_at
               FROM fridge_logs fl
               WHERE fl.location_id = l.id
                 AND fl.tenant_id = l.tenant_id
               ORDER BY fl.taken_at DESC
               LIMIT 1
             ) AS last_at
           FROM locations l
           WHERE l.tenant_id = $1
             AND UPPER(COALESCE(l.type,'')) = 'FRIDGE'
           ORDER BY l.name`,
          [tid]
        );

        for (const x of fridges) {
          const mins = minutesSince(x.last_at);

          if (!x.last_at || mins > fridgeCfg.due_hours * 60) {
            fridge_due.push({
              location_id: x.id,
              location_name: x.name,
              last_at: x.last_at || null
            });
          }

          if (x.last_temp != null) {
            const t = Number(x.last_temp);
            if (Number.isFinite(t) && (t < fridgeCfg.min_c || t > fridgeCfg.max_c)) {
              fridge_out_of_range.push({
                location_id: x.id,
                location_name: x.name,
                last_at: x.last_at || null,
                last_temp_c: t,
                range: [fridgeCfg.min_c, fridgeCfg.max_c]
              });
            }
          }
        }
      }

      let fire_due = [];
      let fire_drill_due = {
        last_at: null,
        days_since: null,
        overdue: false
      };

      if (r === "ADMIN" || r === "ADMIN_GLOBAL") {
        const { rows: fires } = await pool.query(
          `SELECT
             l.id,
             l.name,
             (
               SELECT fc.check_at
               FROM fire_checks fc
               WHERE fc.location_id = l.id
                 AND fc.tenant_id = l.tenant_id
                 AND UPPER(COALESCE(fc.kind,'')) = 'PANEL'
               ORDER BY fc.check_at DESC
               LIMIT 1
             ) AS panel_at,
             (
               SELECT fc.check_at
               FROM fire_checks fc
               WHERE fc.location_id = l.id
                 AND fc.tenant_id = l.tenant_id
                 AND UPPER(COALESCE(fc.kind,'')) = 'EXTINGUISHER'
               ORDER BY fc.check_at DESC
               LIMIT 1
             ) AS ext_at
           FROM locations l
           WHERE l.tenant_id = $1
             AND UPPER(COALESCE(l.type,'')) = 'FIRE'
           ORDER BY l.name`,
          [tid]
        );

        for (const x of fires) {
          const dp = daysSince(x.panel_at);
          const de = daysSince(x.ext_at);

          if (!x.panel_at || dp > fireCfg.panel_days) {
            fire_due.push({
              location_id: x.id,
              location_name: x.name,
              kind: "PANEL",
              days_since: Number.isFinite(dp) ? dp : null,
              last_at: x.panel_at || null
            });
          }

          if (!x.ext_at || de > fireCfg.extinguisher_days) {
            fire_due.push({
              location_id: x.id,
              location_name: x.name,
              kind: "EXTINGUISHER",
              days_since: Number.isFinite(de) ? de : null,
              last_at: x.ext_at || null
            });
          }
        }

        const { rows: lastDrill } = await pool.query(
          `SELECT MAX(check_at) AS last
           FROM fire_checks
           WHERE tenant_id = $1
             AND UPPER(COALESCE(kind,'')) = 'DRILL'`,
          [tid]
        );

        const last = lastDrill[0]?.last || null;
        const ds = last ? daysSince(last) : null;

        fire_drill_due = {
          last_at: last,
          days_since: ds,
          overdue: ds == null ? true : ds > fireCfg.drill_days
        };
      }

      res.json({
        fridge_due,
        fridge_out_of_range,
        fire_due,
        fire_drill_due
      });
    } catch (e) {
      console.error("[ff/alerts]", e);
      res.status(500).json({ error: "server error" });
    }
  });

};
