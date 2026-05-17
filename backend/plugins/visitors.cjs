// plugins/visitors.cjs
module.exports = function setupVisitors(opts = {}) {
  const {
    app, pool, auth,
    tenantIdOf = (req) => Number(req.user?.tenant_id || 0),
  } = opts;
  if (!app || !pool || !auth) throw new Error('[visitors] Missing { app, pool, auth }');

  // -------- DB (idempotent) --------
  (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS visitors(
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        primary_name TEXT NOT NULL,
        resident TEXT, 
        checkin_at TIMESTAMPTZ DEFAULT NOW(),
        checkout_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_visitors_tenant ON visitors(tenant_id, checkin_at DESC);
    `);
  })().catch(e => console.error('[visitors migrate]', e));

  // -------- helpers --------
  function sendSSE(event, data) {
    try { app.locals?.sendEvent?.(event, data); } catch(_) {}
  }
    // High-level helper from push.cjs: app.locals.pushNotify.notifyRoles(...)
  function getPushNotifyRoles() {
    try {
      const helper = app.locals?.pushNotify;
      if (helper && typeof helper.notifyRoles === 'function') return helper.notifyRoles;
      return null;
    } catch (_) {
      return null;
    }
  }

  // direct low-level sender from push.cjs (broad, currently ignores topic prefs)
  function getSendPushToRoles() {
    try {
      return typeof app.get === 'function' ? app.get('sendPushToRoles') : null;
    } catch (_) {
      return null;
    }
  }


  function getCookie(req, name){
    try{
      const raw = req.headers.cookie || '';
      const parts = raw.split(/;\s*/);
      const pref = name + '=';
      for (const p of parts){
        if (p.startsWith(pref)) return decodeURIComponent(p.slice(pref.length));
      }
    }catch{}
    return '';
  }

  function tokenFromReq(req){
    let tok = (req.query?.token || req.body?.token || req.body?.tap_token || req.body?.qrcode_token || req.headers['x-tap-token'] || '').toString().trim();
    if (tok) return tok;

    tok = getCookie(req, 'tap_token');
    if (tok) return tok;

    try {
      const ref = req.get?.('referer') || '';
      const m = ref.match(/\/tap\/reception\/([A-Za-z0-9._~-]+)/i);
      if (m) return m[1];
    } catch {}

    return '';
  }

  // Try multiple ways to derive tenant id for TAP (DB first if no logged-in user)
  async function resolveTenantForTapAsync(req){
    // 1) logged in user
    const byUser = tenantIdOf(req);
    if (byUser) return byUser;

    // 2) token-present? try app hook → DB → JWT
    const tok = tokenFromReq(req);
    if (tok) {
      try {
        if (typeof app.locals?.tapTenantOf === 'function') {
          const t = Number(await app.locals.tapTenantOf(tok));
          if (t) return t;
        }
      } catch {}

      try {
        const { rows } = await pool.query(
          `SELECT tenant_id FROM qrcodes WHERE token=$1 LIMIT 1`,
          [tok]
        );
        const t = Number(rows?.[0]?.tenant_id || 0);
        if (t) return t;
      } catch (e) {
        console.warn('[visitors] qrcodes lookup failed:', e?.message || e);
      }

      try {
        if (tok.split('.').length === 3) {
          const payload = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString('utf8'));
          const t = Number(payload?.tenant_id || payload?.tid || 0);
          if (t) return t;
        }
      } catch {}
    }

    // 3) fallback
    return Number(process.env.DEFAULT_TENANT_ID || 0) || 0;
  }

  // Avoid double-registering (dev hot-reload)
  function hasRoute(method, path) {
    try {
      return app._router?.stack?.some(l =>
        l.route && l.route.path === path && l.route.methods?.[method]
      ) || false;
    } catch { return false; }
  }

  // Drop the TAP token cookie when opening /tap/reception/:token (best-effort; order-safe)
  app.use((req, res, next) => {
    try {
      const m = req.path && req.path.match(/^\/tap\/reception\/([A-Za-z0-9._~-]+)/i);
      if (m && m[1]) {
        const cookie = `tap_token=${encodeURIComponent(m[1])}; Path=/; Max-Age=3600; SameSite=Lax`;
        const prev = res.getHeader('Set-Cookie');
        if (Array.isArray(prev)) res.setHeader('Set-Cookie', [...prev, cookie]);
        else if (prev)          res.setHeader('Set-Cookie', [prev, cookie]);
        else                    res.setHeader('Set-Cookie', cookie);
      }
    } catch {}
    next();
  });

   // --- Reception TAP page (classic UX, standalone HTML) ---
  if (!hasRoute('get', '/tap/reception/:token')) {
    app.get('/tap/reception/:token', (req, res) => {
      const token = String(req.params.token || '').trim();
      const api = process.env.PUBLIC_API_URL || '';

      res
        .status(200)
        .type('html')
        .send(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Ernos • Visitor</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{ box-sizing:border-box; }
  /* Match main app sidebar/header palette */
  :root{
    --bg:#4E6E81;              /* sidebar/header gray-blue */
    --panel:#FFFFFF;           /* white cards like main app */
    --text:#EAF1F4;            /* light text on the page background */
    --text-panel:#2E2E2E;      /* dark text inside white cards */
    --muted:#D7E3E8;           /* muted on bg */
    --muted-panel:#606060;     /* muted inside cards */
    --accent:#7BA297;          /* same accent as main */
    --border:#3E5967;          /* header border gray-blue */
  }

  body{
    font:15px system-ui,sans-serif;
    max-width:640px;
    margin:0 auto;
    background:var(--bg);
    color:var(--text);
    padding:24px
  }

  .card{
    background:var(--panel);
    border:1px solid var(--border);
    border-radius:16px;
    padding:16px;
    color:var(--text-panel);
  }

  .row{display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap}

  label{display:block;font-size:13px;color:var(--muted-panel);margin-bottom:6px}

  input{
    width:100%;
    border:1px solid var(--border);
    background:#fff;
    color:var(--text-panel);
    padding:10px;
    border-radius:10px
  }

  button{
    padding:10px 14px;
    border-radius:10px;
    border:0;
    background:var(--accent);
    color:#fff;
    font-weight:700;
    cursor:pointer
  }

  .btn-outline{
    background:#fff;
    border:1px solid var(--border);
    color:var(--text-panel)
  }

  .stack > *{margin-top:10px}

  #msg{
    margin:10px 0;
    padding:12px;
    border-radius:12px;
    border:1px solid var(--border);
    background:#fff;
    color:var(--text-panel);
    display:none
  }

  .ok{border-color:#CFE8DB;background:#E9F5EF;color:#1D5C45}
  .err{border-color:#F1C9C9;background:#FDEEEE;color:#7A2A2A}

  .muted{color:var(--muted)}
  .tiny{font-size:12px;color:var(--muted-panel)}

  .list{display:grid;gap:8px}
  .pill{
    display:flex;align-items:center;gap:8px;
    background:#fff;border:1px solid var(--border);
    padding:8px 10px;border-radius:999px
  }
  .pill span{flex:1}

  .center{text-align:center;}
</style>
<body>
  <header style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <img src="/skin/icons/logo.png" alt="Ernos" style="height:84px" onerror="this.src='/icons/icon.svg'">
    <h2 style="margin:0">Visitor</h2>
  </header>

  <div id="msg"></div>

  <div class="card stack" id="promptCard" style="display:none">
    <div id="promptText" class="center" style="font-size:18px"></div>
    <div class="row" style="justify-content:center">
      <button id="btnYes">Yes, check me in</button>
      <button id="btnNo" class="btn-outline">No, someone else</button>
    </div>
  </div>

  <div class="card stack" id="formCard" style="display:none">
    <div>
      <label for="primaryName">Your name (required)</label>
      <input id="primaryName" autocomplete="name" placeholder="e.g. Jane Smith">
    </div>

    <div>
      <label for="resident">Resident you're visiting</label>
      <input id="resident" placeholder="e.g. Teresa">
    </div>

    <div>
      <label>Additional visitors</label>
      <div class="row">
        <input id="newVisitor" placeholder="Add another visitor name">
        <button id="btnAdd" type="button" class="btn-outline">Add</button>
      </div>
      <div id="visitorsList" class="list"></div>
    </div>

    <div class="row" style="justify-content:flex-end">
      <button id="btnCheckin" type="button">Check in</button>
    </div>
    <div class="tiny">By checking in you agree to follow the facility's safety rules.</div>
  </div>

  <div class="card center" id="messageCard" style="display:none">
    <div id="bigMessage" style="font-size:18px"></div>
  </div>

<script>
(function(){
  const TOKEN = ${JSON.stringify(token)};
  let API = ${JSON.stringify(api)}; if(!API) API = location.origin;

  const $ = (id)=>document.getElementById(id);
  const show = (id)=>{ ['promptCard','formCard','messageCard'].forEach(x=>$(x).style.display='none'); $(id).style.display=''; };
  const showMsg = (t, cls='')=>{ const el=$('msg'); el.textContent=t; el.className=cls?cls:''; el.style.display=t?'':'none'; };

  const K_VISIT = 'ernos_visit_id_'+TOKEN;
  const K_NAME  = 'ernos_last_name_'+TOKEN;
  const K_RES   = 'ernos_last_resident_'+TOKEN;

  const names = [];
  function renderNames(){
    const box = $('visitorsList'); box.innerHTML = '';
    names.forEach((n, i)=>{
      const row = document.createElement('div');
      row.className = 'pill';
      const span = document.createElement('span'); span.textContent = n;
      const btn = document.createElement('button'); btn.textContent='Remove'; btn.className='btn-outline';
      btn.onclick = ()=>{ names.splice(i,1); renderNames(); };
      row.appendChild(span); row.appendChild(btn); box.appendChild(row);
    });
  }
  $('btnAdd')?.addEventListener('click', ()=>{
    const v = ($('newVisitor').value||'').trim(); if(!v) return;
    names.push(v); $('newVisitor').value=''; renderNames();
  });

  function post(url, data){
    return fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data||{}) })
      .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status)); return j; }));
  }

  function welcomeMessage(nameOrNames){
    const txt = Array.isArray(nameOrNames) ? nameOrNames.join(', ') : nameOrNames;
    return '✅ Welcome ' + (txt || 'visitor') + '. Enjoy your visit!';
  }

  try{
    const existing = localStorage.getItem(K_VISIT);
    if(existing){
      show('messageCard');
      $('bigMessage').textContent = 'Checking out…';
      post((API||location.origin) + '/reception/checkout', { id: Number(existing) })
        .then(j=>{
          $('bigMessage').textContent = j && j.message ? j.message : 'Thank you for your visit. See you soon!';
          try{ localStorage.removeItem(K_VISIT); }catch(_){}
        })
        .catch(e=>{
          $('bigMessage').textContent = 'Thank you for your visit!';
          showMsg(e.message||String(e), 'err');
          try{ localStorage.removeItem(K_VISIT); }catch(_){}
        });
      return;
    }
  }catch(_){}

  let lastName='', lastResident='';
  try{
    lastName = localStorage.getItem(K_NAME) || '';
    lastResident = localStorage.getItem(K_RES) || '';
  }catch(_){}
  if(lastName){
    $('promptText').textContent = 'Welcome again, ' + lastName + '. Are you here to visit ' + (lastResident || 'the same resident') + ' again?';
    show('promptCard');

    $('btnYes').onclick = ()=>{
      show('messageCard'); $('bigMessage').textContent = 'Checking you in…';
      post((API||location.origin) + '/reception/checkin', {
        token: TOKEN, primaryName: lastName, names: [], resident: lastResident
      })
      .then(j=>{
        $('bigMessage').textContent = welcomeMessage(lastName);
        try{ localStorage.setItem(K_VISIT, String(j.id)); }catch(_){}
      })
      .catch(e=>{ showMsg(e.message||String(e), 'err'); $('bigMessage').textContent=''; show('promptCard'); });
    };

    $('btnNo').onclick = ()=>{ show('formCard'); };
  } else {
    show('formCard');
  }

  $('btnCheckin').onclick = function(){
    const primaryName = ($('primaryName').value||'').trim();
    const resident    = ($('resident').value||'').trim();
    if(!primaryName){ showMsg('Please enter your name.', 'err'); return; }
    showMsg('Contacting server…','muted');
    post((API||location.origin) + '/reception/checkin', {
      token: TOKEN, primaryName, names, resident
    })
    .then(j=>{
      show('messageCard');
      $('bigMessage').textContent = welcomeMessage([primaryName].concat(names));
      try{
        localStorage.setItem(K_VISIT, String(j.id));
        localStorage.setItem(K_NAME, primaryName);
        localStorage.setItem(K_RES, resident);
      }catch(_){}
      showMsg('', '');
    })
    .catch(e=> showMsg(e.message||String(e), 'err'));
  };
})();
</script>
</body></html>`);
    });
  }



  // Auth for reception TAP: allow if we can resolve tenant by token
  async function authReception(req, res, next){
    if (req.user && tenantIdOf(req)) return next();
    const tid = await resolveTenantForTapAsync(req);
    if (tid) {
      req.user = { tenant_id: tid, role: 'RECEPTION', category: 'RECEPTION', name: 'TAP' };
      return next();
    }
    return res.status(401).json({ error: 'unauthorized' });
  }

  // ---- normalization helpers for incoming TAP payloads ----
  function joinNonEmpty(parts){
    return parts.filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(' ');
  }
  function getVisitorNameFromBody(b){
    // accept many shapes; fall back to "Visitor"
    const first = b.first_name || b.firstname || b.given_name || '';
    const last  = b.last_name  || b.lastname  || b.family_name || '';
    const composed = joinNonEmpty([first, last]);
    const direct =
      b.primary_name || b.primaryName || b.visitor_name || b.visitorName ||
      b.full_name || b.fullName || b.name || composed;

    const v = String(direct || '').trim();
    return v || 'Visitor';
  }
  function getResidentFromBody(b){
    const first = b.resident_first || b.residentFirst || '';
    const last  = b.resident_last  || b.residentLast  || '';
    const composed = joinNonEmpty([first, last]);
    const direct =
      b.resident || b.resident_name || b.residentName || b.to_resident || b.toResident || composed;
    return String(direct || '').trim();
  }
  function isVisitForResident(b, residentStr){
    const U = (s) => String(s || '').trim().toUpperCase();
    if (residentStr) return true;
    if (b.resident_id || b.resident || b.resident_name) return true;
    if (b.for_resident === true || b.is_resident_visit === true) return true;
    if (['RESIDENT','RESIDENT_VISIT'].includes(U(b.purpose || b.visit_for || b.kind))) return true;
    return false;
  }
  function staffRoleToSee(b){
    const U = (s) => String(s || '').trim().toUpperCase();
    return U(b.staff_to_see_role || b.to_role || b.staff_role || b.see_role || '');
  }

  async function notifyVisitorArrival(req, { id, primary_name, resident }) {
    try {
      const b   = req.body || {};
      const who = String(primary_name || getVisitorNameFromBody(b) || "Visitor").trim();
      const residentName = String(resident || getResidentFromBody(b) || "").trim();

      const msg = residentName
        ? `${who} is here to see ${residentName}`
        : (isVisitForResident(b, resident)
            ? `${who} is here to see a resident`
            : `${who} has arrived`);

      // Resolve tenant for both logged-in and TAP flows
      const tid = req.user?.tenant_id || await resolveTenantForTapAsync(req);

      const payload = {
        title: "Visitor arrived",
        body:  msg,
        url:   "/#visitors?onsite=1",
        kind:  "visitors",
        visitor_id: id,
      };

      const notifyRolesFn   = getPushNotifyRoles();   // app.locals.pushNotify.notifyRoles
      const sendPushToRoles = getSendPushToRoles();   // low-level broad sender

      console.log("[visitors notify] tid =", tid,
        "notifyRolesFn type =", typeof notifyRolesFn,
        "sendPushToRoles type =", typeof sendPushToRoles);

      // Build target role/category set once
      const roles = new Set(["RECEPTION"]); // Reception always
      if (isVisitForResident(b, resident)) roles.add("NURSING");
      if (staffRoleToSee(b) === "MANAGER") roles.add("MANAGER");
      roles.add("ADMIN");
      roles.add("ADMIN_GLOBAL");

      const upperRoles = Array.from(roles).map((s) =>
        String(s || "").toUpperCase()
      );

      // ---- 1) Preferred: high-level notifyRoles API (honours topic "visitors") ----
      if (typeof notifyRolesFn === "function" && tid) {
        console.log("[visitors notify] using pushNotify.notifyRoles()");
        await notifyRolesFn({
          tenantId:    tid,
          rolesOrCats: upperRoles,
          title:       payload.title,
          body:        payload.body,
          data:        payload,    // contains url, kind, visitor_id
        });
      }

      // ---- 2) Fallback: sendToRoles (broad; currently ignores topic prefs) ----
      else if (typeof sendPushToRoles === "function" && tid) {
        console.log("[visitors notify] using sendPushToRoles() fallback");
        await sendPushToRoles({
          tenantId:   tid,
          wantRoles:  upperRoles,
          wantCats:   upperRoles,
          payloadObj: payload,
          topicKey:   null,
        });
      } else {
        console.warn("[visitors notify] no push backend configured");
      }

      // ---- 3) In-app toast via SSE "push" event (for open dashboards) ----
      sendSSE("push", {
        tenant_id:  tid || null,
        created_at: new Date().toISOString(),
        ...payload,
      });
    } catch (e) {
      console.warn("[visitors push notify]", e?.message || e);
    }
  }


  // -------- Routes (normal app) --------

    // Visitors list + CSV export (with optional date filters ?from=YYYY-MM-DD&to=YYYY-MM-DD)
  app.get('/visitors', auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      const { from, to, csv } = req.query || {};

      // Build WHERE with optional date filters
      const where = ['tenant_id = $1'];
      const params = [tid];
      let p = 2;

      if (from) { where.push(`checkin_at >= $${p++}`); params.push(from); }
      if (to)   { where.push(`checkin_at < ($${p++}::date + INTERVAL '1 day')`); params.push(to); }

      // Keep LIMIT 1000 for JSON (no limit for CSV so exports can be complete)
      const limitClause = (csv === '1') ? '' : 'LIMIT 1000';

      const { rows } = await pool.query(
        `
        SELECT
          v.id,
          v.primary_name,
          COALESCE(v.resident,'') AS resident,
          v.checkin_at,
          v.checkout_at,
          CASE
            WHEN v.checkout_at IS NULL THEN NULL
            ELSE ROUND(EXTRACT(EPOCH FROM (v.checkout_at - v.checkin_at))/60.0)
          END AS duration_min,
          CASE WHEN v.checkout_at IS NULL THEN 'IN' ELSE 'OUT' END AS status
        FROM visitors v
        WHERE ${where.join(' AND ')}
        ORDER BY v.checkin_at DESC
        ${limitClause}
        `,
        params
      );

      if (String(csv || '') === '1') {
        // CSV headers
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        const suffix =
          (from ? `_${String(from)}` : '') + (to ? `_${String(to)}` : '');
        res.setHeader('Content-Disposition', `attachment; filename="visitors${suffix}.csv"`);

        // Write CSV with CRLF and proper escaping
        const headers = [
          'id','primary_name','resident','checkin_at','checkout_at','duration_min','status'
        ];
        const esc = (v) => {
          if (v == null) return '';
          const s = String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
        };

        res.write(headers.join(',') + '\r\n');
        for (const r of rows) {
          const line = [
            r.id,
            r.primary_name || '',
            r.resident || '',
            r.checkin_at ? new Date(r.checkin_at).toISOString() : '',
            r.checkout_at ? new Date(r.checkout_at).toISOString() : '',
            (r.duration_min == null ? '' : r.duration_min),
            r.status || ''
          ].map(esc).join(',');
          res.write(line + '\r\n');
        }
        res.end();
        return;
      }

      // JSON response (backward-compatible, plus extra fields if you want to use them)
      res.json({ items: rows });
    } catch (e) {
      console.error('[visitors GET]', e);
      res.status(500).json({ error: 'server error' });
    }
  });


  app.post('/visitors', auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      const b = req.body || {};
      const primary_name = getVisitorNameFromBody(b);   // NEVER empty
      const resident     = getResidentFromBody(b);      // may be empty

      const { rows } = await pool.query(
        `INSERT INTO visitors(tenant_id, primary_name, resident, checkin_at)
         VALUES ($1,$2,$3,NOW())
         RETURNING id`,
        [tid, primary_name, resident || null]
      );
      const id = rows[0].id;

      await notifyVisitorArrival(req, { id, primary_name, resident });
      sendSSE('visitors', { id, kind: 'checkin' });

      res.json({ ok: true, id });
    } catch (e) {
      console.error('[visitors POST]', e);
      res.status(500).json({ error: 'server error' });
    }
  });

  app.post('/visitors/:id/checkout', auth, async (req, res) => {
  try {
    const tid = tenantIdOf(req);
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'bad id' });

    const { rows } = await pool.query(
      `UPDATE visitors
          SET checkout_at = NOW()
        WHERE id=$1 AND tenant_id=$2 AND checkout_at IS NULL
        RETURNING id, primary_name`,
      [id, tid]
    );

    sendSSE('visitors', { id, kind: 'checkout' });
    const payload = rows[0] || { id, primary_name: '' };
    res.json({ ok: true, id: payload.id, primary_name: payload.primary_name || '' });
  } catch (e) {
    console.error('[visitors checkout]', e);
    res.status(500).json({ error: 'server error' });
  }
});


  app.post('/visitors/checkout', auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      const id = Number(req.body?.id || 0);
      if (!id) return res.status(400).json({ error: 'bad id' });
      await pool.query(
        `UPDATE visitors
            SET checkout_at = NOW()
          WHERE id=$1 AND tenant_id=$2 AND checkout_at IS NULL`,
        [id, tid]
      );
      sendSSE('visitors', { id, kind: 'checkout' });
      res.json({ ok: true });
    } catch (e) {
      console.error('[visitors checkout (fallback)]', e);
      res.status(500).json({ error: 'server error' });
    }
  });

  // -------- Reception TAP endpoints (token or auth) --------

  if (!hasRoute('post', '/reception/checkin')) {
    app.post('/reception/checkin', authReception, async (req, res) => {
      try {
        const tid = req.user?.tenant_id || await resolveTenantForTapAsync(req);
        if (!tid) return res.status(401).json({ error: 'unauthorized' });

        const b = req.body || {};
        const primary_name = getVisitorNameFromBody(b); // NEVER empty (fallback to "Visitor")
        const resident     = getResidentFromBody(b);

        // Debug: log what we received/derived (helps if TAP payload changes)
        console.log('[reception/checkin] body=', b, 'derived:', { primary_name, resident, tid });

        const { rows } = await pool.query(
          `INSERT INTO visitors(tenant_id, primary_name, resident, checkin_at)
           VALUES ($1,$2,$3,NOW())
           RETURNING id`,
          [tid, primary_name, resident || null]
        );
        const id = rows[0].id;

        await notifyVisitorArrival(req, { id, primary_name, resident });
        sendSSE('visitors', { id, kind: 'checkin' });

        res.json({ ok: true, id });
      } catch (e) {
        console.error('[reception checkin]', e);
        res.status(500).json({ error: 'server error' });
      }
    });
  }

  if (!hasRoute('post', '/reception/checkout')) {
    app.post('/reception/checkout', authReception, async (req, res) => {
      try {
        const tid = req.user?.tenant_id || await resolveTenantForTapAsync(req);
        if (!tid) return res.status(401).json({ error: 'unauthorized' });

        const id = Number(req.body?.id || req.body?.visitor_id || 0);
        if (!id) return res.status(400).json({ error: 'bad id' });

        await pool.query(
          `UPDATE visitors
              SET checkout_at = NOW()
            WHERE id=$1 AND tenant_id=$2 AND checkout_at IS NULL`,
          [id, tid]
        );

        sendSSE('visitors', { id, kind: 'checkout' });
        res.json({ ok: true });
      } catch (e) {
        console.error('[reception checkout]', e);
        res.status(500).json({ error: 'server error' });
      }
    });
  }
};
