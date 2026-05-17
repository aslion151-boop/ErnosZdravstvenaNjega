// backend/routes/ops.cjs
// All operational routes: QR/NFC, checkins, issues, visitors, residents out,
// reception kiosk, alerts, environmental audits.
// Behaviour is identical to the inline version in server.pg.cjs.
const crypto = require("crypto");
module.exports = function setupOps({
  app,
  pool,
  auth,
  requireAdmin,
  tenantIdOf,
  nowISO,
  normalizeToken,
  rowsToCsv,
  getTenantConfig,
  sendEvent,
}) {

  /* ================= QR / NFC ================= */
  function makeTokenString () {
    // 8 bytes = 16 hex chars, plenty for QR tokens and not guessable like Math.random
    return crypto.randomBytes(8).toString("hex");
  }

  app.post("/qrcodes", auth, requireAdmin, async (req, res) => {
    const tid = tenantIdOf(req);
    const { locationId } = req.body || {};
    if (!locationId) return res.status(400).json({ error: "locationId required" });

    // Ensure location belongs to this tenant
    const { rows: locRows } = await pool.query(
      "SELECT id, tenant_id, type FROM locations WHERE id=$1 AND tenant_id=$2",
      [locationId, tid]
    );
    if (!locRows.length) return res.status(404).json({ error: "no location" });

    const tok = makeTokenString();
    await pool.query(
      "INSERT INTO qrcodes(token,location_id,tenant_id) VALUES ($1,$2,$3)",
      [tok, locationId, tid]
    );

    // Compute public base (prefer env, otherwise from proxy/req)
    const xfProto = (req.headers["x-forwarded-proto"] || "").split(",")[0] || "";
    const proto   = xfProto || (req.secure ? "https" : req.protocol || "http");
    const host    = req.headers["x-forwarded-host"] || req.get("host");
    const computed = `${proto}://${host}`;
    const base = (process.env.PUBLIC_API_URL || computed).replace(/\/+$/, "");

    // Unified auto router
    const tapAuto = `${base}/tap/u/${tok}`;

    // New-type aware deep links
    const type = String(locRows[0].type || "").trim().toUpperCase();

    const urlTapRoom   = `${base}/tap/nursing/room/${tok}`;
    const urlTapAsset  = `${base}/tap/nursing/asset/${tok}`;
    const urlTapFridge = `${base}/tap/fridge/${tok}`;
    const urlTapFire   = `${base}/tap/fire/${tok}`;
    const urlTapCi     = `${base}/tap/ci/${tok}`; // generic HK/maint toggle

    // Choose best default based on location type
    let tap = tapAuto;
    switch (type) {
      case "ROOM":   tap = urlTapRoom;   break;
      case "ASSET":  tap = urlTapAsset;  break;
      case "FRIDGE": tap = urlTapFridge; break;
      case "FIRE":   tap = urlTapFire;   break;
      default:       tap = tapAuto;      break; // let /tap/u decide or fall back
    }

    res.json({
      token: tok,
      urlTap: tap,          // primary link to print on the QR
      urlTapAuto: tapAuto,  // always include the smart router
      urlTapCi,             // handy if you need HK/maint flow
      urlTapRoom,
      urlTapAsset,
      urlTapFridge,
      urlTapFire
    });
  });

  // ANCHOR: TAP_RECEPTION_KIOSK (BEGIN)
  app.get("/tap/reception/:token", (req, res) => {
    const token = String(req.params.token || "").trim();

    // PUBLIC API base for kiosk; falls back to origin inside the page
    const api = (process.env.PUBLIC_API_URL || "").trim();

    res
      .status(200)
      .type("html")
      .send(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Ernos • Visitor</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
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
  let API = ${JSON.stringify(api)}; if (!API) API = location.origin;

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
    return fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data||{})
    }).then(r=>r.json().then(j=>{
      if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status));
      return j;
    }));
  }

  function welcomeMessage(nameOrNames){
    const txt = Array.isArray(nameOrNames) ? nameOrNames.join(', ') : nameOrNames;
    return '✅ Welcome ' + (txt || 'visitor') + '. Enjoy your visit!';
  }

  // If there is an existing visit id → treat this scan as checkout
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
      .catch(e=>{
        showMsg(e.message||String(e), 'err');
        $('bigMessage').textContent='';
        show('promptCard');
      });
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
  // ANCHOR: TAP_RECEPTION_KIOSK (END)

  /* ================= TAP PERFORM (HK/Nursing/Maint) ================= */
  app.post("/tap/ci/perform", auth, async (req, res) => {
    try {
      const { token } = req.body || {};
      const norm = normalizeToken(token || "");
      if (!norm) return res.status(400).json({ error: "token required" });

      const userTid = tenantIdOf(req);
      const role    = String(req.user?.role || "").toUpperCase();

      // Look up QR + tenant
      const { rows: qrRows } = await pool.query(
        "SELECT token, location_id, tenant_id FROM qrcodes WHERE token=$1",
        [norm]
      );
      if (!qrRows.length) return res.status(404).json({ error: "bad token" });
      const qr = qrRows[0];

      // Enforce tenant match unless ADMIN_GLOBAL
      if (role !== "ADMIN_GLOBAL" && Number(qr.tenant_id || 0) !== Number(userTid || 0)) {
        return res.status(403).json({ error: "forbidden (tenant mismatch)" });
      }

      const effectiveTid = qr.tenant_id || userTid;

      // Location must belong to same tenant
      const { rows: locRows } = await pool.query(
        "SELECT id, tenant_id, name FROM locations WHERE id=$1 AND tenant_id=$2",
        [qr.location_id, effectiveTid]
      );
      if (!locRows.length) return res.status(404).json({ error: "no location" });
      const loc = locRows[0];

      // Current user
      const { rows: userRows } = await pool.query(
        "SELECT id, name, category FROM users WHERE id=$1",
        [req.user.id]
      );
      if (!userRows.length) return res.status(401).json({ error: "no user" });
      const u = userRows[0];

      const now = nowISO();

      // Is there an open check-in by this user at this location (same tenant)?
      const { rows: openRows } = await pool.query(
        `SELECT id, checkin_at
           FROM checkins
          WHERE user_id=$1
            AND location_id=$2
            AND tenant_id=$3
            AND checkout_at IS NULL
          ORDER BY id DESC
          LIMIT 1`,
        [u.id, loc.id, effectiveTid]
      );

      if (openRows.length) {
        // CHECKOUT
        const open = openRows[0];

        await pool.query(
          "UPDATE checkins SET checkout_at=$1 WHERE id=$2 AND tenant_id=$3",
          [now, open.id, effectiveTid]
        );

        const { rows: d } = await pool.query(
          `SELECT EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/60 AS minutes
             FROM checkins
            WHERE id=$1 AND tenant_id=$2`,
          [open.id, effectiveTid]
        );

        const durationMin =
          d[0]?.minutes != null
            ? Math.max(0, Math.round(Number(d[0].minutes)))
            : null;

        sendEvent("visits", {});
        return res.json({
          ok: true,
          action: "checkout",
          role: u.category || "",
          locationName: loc.name,
          started_at: open.checkin_at,
          ended_at: now,
          durationMin,
        });
      }

      // CHECKIN
      const ins = await pool.query(
        `INSERT INTO checkins(
           user_id,location_id,checkin_at,checkout_at,note,
           user_name,user_category,location_name,tenant_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          u.id,
          loc.id,
          now,
          null,
          "",
          u.name,
          u.category || "",
          loc.name,
          effectiveTid,
        ]
      );

      sendEvent("visits", {});
      return res.json({
        ok: true,
        action: "checkin",
        role: u.category || "",
        locationName: loc.name,
        checkinId: ins.rows[0].id,
        started_at: now,
      });
    } catch (e) {
      console.error("[tap/ci/perform]", e);
      res.status(500).json({ error: "server error" });
    }
  });


  /* ================= CHECKINS ================= */
  app.get("/checkins", auth, async (req, res) => {
    const tid = tenantIdOf(req);
    const { csv, from, to, category, locationId, userId } = req.query || {};

    const filters = ["tenant_id=$1"];
    const params = [tid];

    if (from) {
      params.push(from);
      filters.push(`checkin_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      filters.push(`(checkout_at <= $${params.length} OR checkout_at IS NULL)`);
    }
    if (category) {
      params.push(String(category).toUpperCase());
      filters.push(`UPPER(user_category) = $${params.length}`);
    }
    if (locationId) {
      params.push(parseInt(String(locationId), 10));
      filters.push(`location_id = $${params.length}`);
    }
    if (userId) {
      params.push(parseInt(String(userId), 10));
      filters.push(`user_id = $${params.length}`);
    }

    const where = "WHERE " + filters.join(" AND ");

    if (String(csv || "") === "1") {
      const { rows } = await pool.query(
        `SELECT * FROM checkins ${where} ORDER BY id DESC`,
        params
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=checkins.csv");
      return res.send(rowsToCsv(rows));
    }

    // ✅ allow ?open=1 (default) or ?open=0 for full history
    const onlyOpen = String(req.query?.open || "1") === "1";
    const sql = `SELECT * FROM checkins ${where} ${
      onlyOpen ? "AND checkout_at IS NULL" : ""
    } ORDER BY id DESC`;
    const { rows } = await pool.query(sql, params);
    res.json({ items: rows });

  });

  app.post("/checkin", auth, async (req, res) => {
    const tid = tenantIdOf(req);
    const { locationId, note } = req.body || {};
    if (!locationId) return res.status(400).json({ error: "locationId required" });

    const { rows: locRows } = await pool.query(
      "SELECT * FROM locations WHERE id=$1 AND tenant_id=$2",
      [locationId, tid]
    );
    if (!locRows.length) return res.status(404).json({ error: "no location" });
    const loc = locRows[0];

    const { rows: uRows } = await pool.query("SELECT * FROM users WHERE id=$1", [
      req.user.id,
    ]);
    const u = uRows[0];

    const ins = await pool.query(
      `INSERT INTO checkins(user_id,location_id,checkin_at,checkout_at,note,user_name,user_category,location_name,tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        u.id,
        loc.id,
        nowISO(),
        null,
        note || "",
        u.name,
        u.category || "",
        loc.name,
        tid,
      ]
    );
    sendEvent("visits", {});
    res.json({ id: ins.rows[0].id });
  });

  app.post("/checkout", auth, async (req, res) => {
    try {
      const { checkinId } = req.body || {};
      const idNum = Number(checkinId);
      if (!idNum) return res.status(400).json({ error: "invalid checkinId" });

      const tid  = tenantIdOf(req);
      const role = String(req.user?.role || "").toUpperCase();

      let selectSql = "SELECT * FROM checkins WHERE id=$1";
      const selectParams = [idNum];

      // Non-global admins can only touch their own tenant's checkins
      if (role !== "ADMIN_GLOBAL") {
        selectSql += " AND tenant_id=$2";
        selectParams.push(tid);
      }

      const { rows } = await pool.query(selectSql, selectParams);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "no checkin" });

      const end = nowISO();

      let updateSql = "UPDATE checkins SET checkout_at=$1 WHERE id=$2";
      const updateParams = [end, idNum];

      if (role !== "ADMIN_GLOBAL") {
        updateSql += " AND tenant_id=$3";
        updateParams.push(tid);
      }

      await pool.query(updateSql, updateParams);

      const { rows: d } = await pool.query(
        `SELECT EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/60 AS minutes
           FROM checkins
          WHERE id=$1`,
        [idNum]
      );
      const durationMin =
        d[0]?.minutes != null
          ? Math.max(0, Math.round(Number(d[0].minutes)))
          : null;

      sendEvent("visits", {});
      res.json({ ok: true, durationMin });
    } catch (e) {
      console.error("[checkout]", e);
      res.status(500).json({ error: "server error" });
    }
  });


  /* ================= ISSUES ================= */
  app.get("/issues", auth, async (req, res) => {
    try {
      // Only Admin or Maintenance can list issues
      const role = String(req.user?.role || "").toUpperCase();
      const cat  = String(req.user?.category || "").toUpperCase();
      if (!(role === "ADMIN" || role === "ADMIN_GLOBAL" || cat === "MAINTENANCE")) {
        return res.status(403).json({ error: "forbidden" });
      }

      const tid = tenantIdOf(req);
      const { rows } = await pool.query(
        "SELECT * FROM issues WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200",
        [tid]
      );
      res.json({ items: rows });
    } catch (e) {
      console.error("[issues GET]", e);
      res.status(500).json({ error: "server error" });
    }
  });

  app.post("/issues", auth, async (req, res) => {
    try {
      const { token, locationId, text, category } = req.body || {};
      const bodyText = String(text || "").trim();
      if (!bodyText) return res.status(400).json({ error: "missing text" });

      // Determine location and tenant from token or explicit locationId
      let locId = 0, locName = null, tid = tenantIdOf(req);

      if (token) {
        const norm = normalizeToken(token);
        const { rows: qrRows } = await pool.query(
          "SELECT location_id, tenant_id FROM qrcodes WHERE token=$1",
          [norm]
        );
        if (!qrRows.length) return res.status(404).json({ error: "bad token" });
        locId = qrRows[0].location_id || 0;
        tid   = qrRows[0].tenant_id || tid;
      } else if (locationId) {
        locId = Number(locationId);
        const { rows: locRows } = await pool.query(
          "SELECT name, tenant_id FROM locations WHERE id=$1",
          [locId]
        );
        if (!locRows.length) return res.status(404).json({ error: "no location" });
        tid = locRows[0].tenant_id || tid;
        locName = locRows[0].name || null;
      }

      if (locId) {
        const { rows: loc2 } = await pool.query(
          "SELECT name FROM locations WHERE id=$1",
          [locId]
        );
        if (loc2.length) locName = loc2[0].name || locName;
      }
      if (!tid) return res.status(400).json({ error: "no tenant" });

      // Cross-tenant guard
      const myRole = String(req.user?.role || "").toUpperCase();
      if (myRole !== "ADMIN_GLOBAL" && Number(tid) !== Number(tenantIdOf(req))) {
        return res.status(403).json({ error: "forbidden (different tenant)" });
      }

      // Enforce/normalize category per role
      const myCat = String(req.user?.category || "").toUpperCase();
      let effCategory = String(category || "MAINTENANCE").toUpperCase();
      if (!(myRole === "ADMIN" || myRole === "ADMIN_GLOBAL" || myCat === "MAINTENANCE")) {
        effCategory = "MAINTENANCE";
      }

      const ins = await pool.query(
        `INSERT INTO issues(created_at,updated_at,user_id,user_name,location_id,location_name,category,text,status,tenant_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id`,
        [
          nowISO(), nowISO(),
          req.user?.id || null,
          req.user?.name || req.user?.email || "",
          locId || null,
          locName,
          effCategory,
          bodyText,
          "OPEN",
          tid
        ]
      );
      sendEvent("issues", {});
      res.json({ ok: true, id: ins.rows[0].id });
    } catch (e) {
      console.error("[issues POST]", e);
      res.status(500).json({ error: "server error" });
    }
  });


  /* ================= VISITORS (Reception) ================= */
  app.get("/visitors", auth, async (req, res) => {
    const tid = tenantIdOf(req);
    const { csv, from, to } = req.query || {};
    const filters = ["tenant_id=$1"];
    const params = [tid];
    if (from) {
      params.push(from);
      filters.push(`checkin_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      filters.push(
        `(checkout_at <= $${params.length} OR checkout_at IS NULL)`
      );
    }
    const where = "WHERE " + filters.join(" AND ");
    const { rows } = await pool.query(
      `SELECT * FROM visitors ${where} ORDER BY id DESC`,
      params
    );
    if (String(csv || "") === "1") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=visitors.csv"
      );
      return res.send(rowsToCsv(rows));
    }
    res.json({ items: rows });
  });

  app.post("/visitors/:id/checkout", auth, async (req, res) => {
    const tid = tenantIdOf(req);
    const id = req.params.id;
    const { rows: vrows } = await pool.query(
      "SELECT * FROM visitors WHERE id=$1 AND tenant_id=$2",
      [id, tid]
    );
    const v = vrows[0];
    if (!v) return res.status(404).json({ error: "no visitor" });
    if (v.checkout_at) {
      const names = (() => {
        try { return JSON.parse(v.names || "[]"); } catch (_) { return []; }
      })();
      const { rows: d } = await pool.query(
        `SELECT EXTRACT(EPOCH FROM (checkout_at - checkin_at))/60 AS minutes FROM visitors WHERE id=$1`,
        [id]
      );
      const mins =
        d[0]?.minutes != null
          ? Math.max(0, Math.round(Number(d[0].minutes)))
          : null;
      return res.json({
        ok: true,
        durationMin: mins,
        message: `Goodbye ${names.length ? names.join(", ") : v.primary_name}. Thank you for your visit!`,
      });
    }
    await pool.query(
      "UPDATE visitors SET checkout_at=NOW() WHERE id=$1 AND tenant_id=$2",
      [id, tid]
    );
    sendEvent("visitors", {});
    const { rows: w } = await pool.query(
      "SELECT * FROM visitors WHERE id=$1 AND tenant_id=$2",
      [id, tid]
    );
    const nv = w[0];
    const names = (() => {
      try { return JSON.parse(nv.names || "[]"); } catch (_) { return []; }
    })();
    const { rows: d } = await pool.query(
      `SELECT EXTRACT(EPOCH FROM (checkout_at - checkin_at))/60 AS minutes FROM visitors WHERE id=$1`,
      [id]
    );
    const mins =
      d[0]?.minutes != null
        ? Math.max(0, Math.round(Number(d[0].minutes)))
        : null;
    res.json({
      ok: true,
      durationMin: mins,
      message: `Goodbye ${names.length ? names.join(", ") : nv.primary_name}. Thank you for your visit!`,
    });
  });

  app.get("/visitors/signatures.zip", auth, async (req, res) => {
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=visitor_signatures.zip"
    );
    res.end(
      Buffer.from([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) // empty zip
    );
  });


  /* ================= RESIDENT OUTINGS ================= */

  // list for dashboards
  app.get("/residents/outside", auth, async (req, res) => {
    const tid = tenantIdOf(req);
    const { rows } = await pool.query(
      `SELECT id, resident, escort, note, out_at,
              EXTRACT(EPOCH FROM (NOW()-out_at))/60 AS minutes_out
       FROM resident_outings
       WHERE tenant_id=$1 AND in_at IS NULL
       ORDER BY out_at DESC`,
      [tid]
    );
    res.json({ items: rows.map(r => ({
      id: r.id, resident: r.resident, escort: r.escort, note: r.note,
      out_at: r.out_at, minutes_out: r.minutes_out!=null ? Math.round(r.minutes_out) : null
    }))});
  });

  // helper for toggle
  async function toggleResidentOuting({ token, resident, escort, note }) {
    const norm = normalizeToken(token);
    const { rows: qrRows } = await pool.query("SELECT * FROM qrcodes WHERE token=$1", [norm]);
    if (!qrRows.length) throw new Error("bad token");

    const locId = qrRows[0].location_id;
    const { rows: locRows } = await pool.query("SELECT * FROM locations WHERE id=$1", [locId]);
    const loc = locRows[0] || null;
    const tid = loc?.tenant_id || null;
    if (!tid) throw new Error("no tenant for location");

    // if same resident is already OUT -> mark IN
    const { rows: open } = await pool.query(
      `SELECT id FROM resident_outings
       WHERE tenant_id=$1 AND in_at IS NULL AND resident ILIKE $2
       ORDER BY id DESC LIMIT 1`,
      [tid, resident]
    );

    if (open.length) {
      await pool.query("UPDATE resident_outings SET in_at=NOW() WHERE id=$1", [open[0].id]);
      sendEvent("residents", {});
      return { action: "in", id: open[0].id, tenant_id: tid };
    }

    const ins = await pool.query(
      `INSERT INTO resident_outings(resident, escort, note, out_at, in_at, location_id, tenant_id)
       VALUES ($1,$2,$3,NOW(),NULL,$4,$5) RETURNING id`,
      [resident, escort || null, note || null, locId || null, tid]
    );
    sendEvent("residents", {});
    return { action: "out", id: ins.rows[0].id, tenant_id: tid };
  }

  // public (no auth) POST used by the resident tap page
  app.post("/resident/tap", async (req, res) => {
    try {
      const { token, resident, escort, note } = req.body || {};
      const name = String(resident || "").trim();
      if (!token || !name) return res.status(400).json({ error: "token and resident required" });
      const result = await toggleResidentOuting({ token, resident: name, escort, note });
      res.json({ ok: true, action: result.action, id: result.id, resident: name });
    } catch (e) {
      console.error("[resident/tap] error:", e);
      res.status(500).json({ error: "server error" });
    }
  });

  // (optional) keep old alias if you added it earlier
  app.post("/reception/resident/tap", async (req, res) => {
    try {
      const { token, resident, escort, note } = req.body || {};
      const name = String(resident || "").trim();
      if (!token || !name) return res.status(400).json({ error: "token and resident required" });
      const result = await toggleResidentOuting({ token, resident: name, escort, note });
      res.json({ ok: true, action: result.action, id: result.id, resident: name });
    } catch (e) {
      console.error("[reception/resident/tap] error:", e);
      res.status(500).json({ error: "server error" });
    }
  });


    app.post("/reception/checkin", async (req, res) => {
    try {
      const { token, primaryName, names, resident, signature } = req.body || {};
      const norm = normalizeToken(token || "");
      if (!primaryName) return res.status(400).json({ error: "missing name" });

      console.log("[reception/checkin] body =", req.body);

      // --- look up QR by token ---
      const { rows: qr } = await pool.query(
        "SELECT location_id, tenant_id FROM qrcodes WHERE token=$1",
        [norm]
      );
      if (!qr.length) {
        console.warn("[reception/checkin] bad token:", norm);
        return res.status(404).json({ error: "bad token" });
      }

      let tid = Number(qr[0].tenant_id || 0);
      const locationId = qr[0].location_id || null;
      console.log("[reception/checkin] qr row =", qr[0]);

      // If qrcodes.tenant_id is missing (old data), derive from location
      if (!tid && locationId) {
        try {
          const { rows: locRows } = await pool.query(
            "SELECT id, name, tenant_id FROM locations WHERE id=$1 LIMIT 1",
            [locationId]
          );
          console.log("[reception/checkin] location row =", locRows[0]);
          if (locRows[0]?.tenant_id) {
            tid = Number(locRows[0].tenant_id);
          }
        } catch (e) {
          console.warn(
            "[reception/checkin] derive tenant from location failed:",
            e.message || e
          );
        }
      }

      if (!tid) {
        tid = Number(process.env.DEFAULT_TENANT_ID || 1) || 1;
        console.warn("[reception/checkin] fallback tenant_id ->", tid);
      }

      // --- insert visitor with CORRECT tenant_id ---
      const ins = await pool.query(
        `INSERT INTO visitors(
           primary_name, names, resident,
           checkin_at, checkout_at,
           tenant_id, signature_png
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          String(primaryName).trim(),
          JSON.stringify(Array.isArray(names) ? names : []),
          resident || "",
          nowISO(),
          null,
          tid,
          signature || null,
        ]
      );
      const visitorId = ins.rows[0].id;
      console.log("[reception/checkin] inserted visitor id =", visitorId, "tenant_id =", tid);

      // Notify live dashboards (visitors + generic push stream)
      try {
        sendEvent("visitors", {});
      } catch (e) {
        console.warn("[reception/checkin] sendEvent(visitors) failed:", e.message || e);
      }

      const who     = String(primaryName).trim();
      const resName = String(resident || "").trim();
      const body    = resName
        ? `${who} is here to see ${resName}`
        : `${who} has arrived`;

      // === PUSH NOTIFICATIONS ===
      try {
        const pushNotify =
          req.app?.locals?.pushNotify || app.locals?.pushNotify || null;
        const sendPushToRoles =
          (typeof app.get === "function" && app.get("sendPushToRoles")) || null;

        console.log(
          "[reception/checkin] push backends:",
          "pushNotify =", typeof pushNotify,
          "sendPushToRoles =", typeof sendPushToRoles,
          "tid =", tid
        );

        // 1) If we have pushNotify(tenantId, payload) → use it
        if (typeof pushNotify === "function" && tid) {
          console.log("[reception/checkin] calling pushNotify...");
          await pushNotify(tid, {
            type:  "visitors",
            title: "Visitor arrived",
            body,
            url:   "/#visitors?onsite=1",
            kind:  "visitors",
            visitor_id: visitorId,
          });
          console.log("[reception/checkin] pushNotify done");
        }

        // 2) Also, if we have sendPushToRoles → use it too
        if (typeof sendPushToRoles === "function" && tid) {
          console.log("[reception/checkin] calling sendPushToRoles...");
          const roles = ["ADMIN", "RECEPTION", "NURSING", "ADMIN_GLOBAL"];

          await sendPushToRoles({
            tenantId:  tid,
            wantRoles: roles,
            wantCats:  roles,
            payloadObj: {
              title: "Visitor arrived",
              body,
              url: "/#visitors?onsite=1",
              kind: "visitors",
              visitor_id: visitorId,
            },
            topicKey: null, // ignore topic prefs → always deliver
          });
          console.log("[reception/checkin] sendPushToRoles done");
        }

        if (
          (typeof pushNotify !== "function") &&
          (typeof sendPushToRoles !== "function")
        ) {
          console.warn("[reception/checkin] no push backend configured at all");
        }

        // 3) SSE "push" stream (in-app toast)
        try {
          console.log("[reception/checkin] sendEvent(push)...");
          sendEvent("push", {
            tenant_id:  tid || null,
            created_at: nowISO(),
            title:      "Visitor arrived",
            body,
            url:        "/#visitors?onsite=1",
            kind:       "visitors",
            visitor_id: visitorId,
          });
        } catch (sseErr) {
          console.warn("[reception/checkin SSE push]", sseErr?.message || sseErr);
        }
      } catch (pushErr) {
        console.error("[reception/checkin push]", pushErr);
      }

      res.json({ ok: true, id: visitorId });
    } catch (e) {
      console.error("[reception/checkin]", e);
      res.status(500).json({ error: "server error" });
    }
  });


  app.post("/reception/checkout", async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: "missing id" });

      const { rows } = await pool.query("SELECT * FROM visitors WHERE id=$1", [id]);
      const v = rows[0];
      if (!v) return res.status(404).json({ error: "no visitor" });

      if (!v.checkout_at) {
        await pool.query("UPDATE visitors SET checkout_at=$1 WHERE id=$2", [nowISO(), id]);
        sendEvent("visitors", {});
      }

      let names = [];
      try { names = JSON.parse(v.names || "[]"); } catch {}
      const d = await pool.query(
        "SELECT EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/60 AS minutes FROM visitors WHERE id=$1",
        [id]
      );
      const mins = d.rows[0]?.minutes != null ? Math.max(0, Math.round(Number(d.rows[0].minutes))) : null;

      res.json({
        ok: true,
        durationMin: mins,
        message: `Goodbye ${names.length ? names.join(", ") : v.primary_name}. Thank you for your visit!`,
      });
    } catch (e) {
      console.error("[reception/checkout]", e);
      res.status(500).json({ error: "server error" });
    }
  });


  /* ================= ALERTS ================= */
  /* On superadmin (ADMIN_GLOBAL) "site": no nursing visits or alerts needed. */
  app.get("/alerts", auth, async (req, res) => {
    const role = String(req.user?.role || "").toUpperCase();
    if (role === "ADMIN_GLOBAL") {
      return res.json({
        housekeeping_overdue: [],
        visitors_overdue: [],
        nursing_night_due: [],
      });
    }

    const tid = tenantIdOf(req);
    const cfg = await getTenantConfig(tid);

    const hkMinutes = Number(cfg?.schedules?.alerts?.housekeeping_overdue_minutes ?? 60);
    const visitHours = Number(cfg?.schedules?.alerts?.visitors_overdue_hours ?? 3);
    const nursingMinutesWindow = Number(cfg?.schedules?.alerts?.nursing_window_minutes ?? 60);
    const nightCfg = cfg?.schedules?.alerts?.night_window || { start: "20:00", end: "07:00" };

    const { rows: hkOpen } = await pool.query(
      `SELECT *, CAST(EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/60 AS INT) AS minutes_open
       FROM checkins WHERE tenant_id=$1 AND checkout_at IS NULL AND UPPER(user_category)='HOUSEKEEPING'`,
      [tid]
    );
    const housekeeping_overdue = hkOpen
      .filter((r) => (r.minutes_open || 0) > hkMinutes)
      .map((r) => ({
        id: r.id,
        location_name: r.location_name,
        checkin_at: r.checkin_at,
        minutes_open: r.minutes_open,
      }));

    const { rows: vOpen } = await pool.query(
      `SELECT *, (EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/3600.0) AS hours_open
       FROM visitors WHERE tenant_id=$1 AND checkout_at IS NULL`,
      [tid]
    );
    const visitors_overdue = vOpen
      .filter((v) => (v.hours_open || 0) > visitHours)
      .map((v) => ({
        id: v.id,
        primary_name: v.primary_name,
        resident: v.resident,
        hours_open: Number(v.hours_open),
      }));

    // Compute local "night" window from config, supports overnight ranges (e.g., 20:00→07:00)
    const now = new Date();
    const [sH, sM = 0] = String(nightCfg.start || "20:00").split(":").map(Number);
    const [eH, eM = 0] = String(nightCfg.end   || "07:00").split(":").map(Number);
    const minsNow = now.getHours() * 60 + now.getMinutes();
    const minsStart = sH * 60 + sM;
    const minsEnd = eH * 60 + eM;
    const overnight = minsEnd <= minsStart;
    const isNight = overnight
      ? (minsNow >= minsStart || minsNow < minsEnd)
      : (minsNow >= minsStart && minsNow < minsEnd);

    let nursing_night_due = [];
    if (isNight) {
      const { rows: lack } = await pool.query(
        `SELECT l.name AS location_name
           FROM locations l
          WHERE l.tenant_id=$1
            AND NOT EXISTS(
              SELECT 1 FROM checkins c
               WHERE c.location_id = l.id
                 AND c.tenant_id=$1
                 AND UPPER(c.user_category)='NURSING'
                 AND (NOW() - c.checkin_at) <= ($2 || ' minutes')::interval
            )
          LIMIT 10`,
        [tid, String(nursingMinutesWindow)]
      );
      nursing_night_due = lack.map((x) => ({ location_name: x.location_name }));
    }

    res.json({ housekeeping_overdue, visitors_overdue, nursing_night_due });
  });


  /* ================= ENV AUDIT ================= */
  app.get("/env/questions", auth, async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM env_questions ORDER BY id"
    );
    res.json({ items: rows });
  });

  app.post("/env/audits", auth, async (req, res) => {
    const { name } = req.body || {};
    const tid = tenantIdOf(req);
    if (!tid) return res.status(403).json({ error: "no tenant" });

    const { rows: uRows } = await pool.query("SELECT * FROM users WHERE id=$1", [req.user.id]);
    const u = uRows[0];

    const { rows } = await pool.query(
      "INSERT INTO env_audits(name,started_at,auditor_id,auditor_name,status,tenant_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [
        name || "Audit " + nowISO().slice(0, 10),
        nowISO(),
        u?.id || null,
        u?.name || u?.email || "",
        "open",
        tid
      ]
    );
    res.json({ id: rows[0].id });
  });

  app.get("/env/audits", auth, async (req, res) => {
    const tid = tenantIdOf(req);
    const { rows } = await pool.query(
      "SELECT * FROM env_audits WHERE tenant_id=$1 ORDER BY id DESC",
      [tid]
    );
    res.json({ items: rows });
  });

  app.get("/env/audits/:id", auth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const tid = tenantIdOf(req);

    const { rows: aRows } = await pool.query(
      "SELECT * FROM env_audits WHERE id=$1 AND tenant_id=$2",
      [id, tid]
    );
    const a = aRows[0];
    if (!a) return res.status(404).json({ error: "no audit" });

    const { rows: locs } = await pool.query(
      "SELECT * FROM env_audit_locations WHERE audit_id=$1 AND tenant_id=$2",
      [id, tid]
    );

    const locEnriched = [];
    for (const l of locs) {
      const { rows: ans } = await pool.query(
        "SELECT * FROM env_audit_answers WHERE audit_loc_id=$1 AND tenant_id=$2",
        [l.id, tid]
      );
      const total = ans.length;
      const yesCount = ans.filter(x => String(x.answer || "").toUpperCase() === "YES").length;
      const score = total ? Math.round((yesCount / total) * 100) : null;
      locEnriched.push({ ...l, total, yes_count: yesCount, score });
    }

    const responses = {};
    for (const l of locEnriched) {
      const { rows } = await pool.query(
        `SELECT q.id AS question_id, q.section, q.text, a.answer, a.comment
         FROM env_questions q
         LEFT JOIN env_audit_answers a 
           ON a.question_id=q.id AND a.audit_loc_id=$1 AND a.tenant_id=$2
         ORDER BY q.id`,
        [l.id, tid]
      );
      responses[l.id] = rows;
    }

    res.json({ audit: a, locations: locEnriched, responses });
  });

  // UI aliases -> /audit/:auditId
  app.get("/env/audits/:id/csv", auth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const tid = tenantIdOf(req);

    const { rows: aRows } = await pool.query(
      "SELECT * FROM env_audits WHERE id=$1 AND tenant_id=$2",
      [id, tid]
    );
    const a = aRows[0];
    if (!a) return res.status(404).json({ error: "no audit" });

    const { rows } = await pool.query(
      `SELECT
        al.audit_id                         AS audit_id,
        a.name                              AS audit_name,
        a.started_at, a.submitted_at, a.auditor_id, a.auditor_name,
        a.overall_score, a.status,
        al.id                               AS audit_loc_id,
        al.location_id, al.location_name,
        q.id                                AS question_id,
        q.section, q.text                   AS question,
        aa.answer, aa.comment
      FROM env_audit_locations al
      JOIN env_audits a ON a.id = al.audit_id
      CROSS JOIN env_questions q
      LEFT JOIN env_audit_answers aa 
        ON aa.audit_loc_id = al.id AND aa.question_id = q.id AND aa.tenant_id=$2
      WHERE al.audit_id = $1 AND al.tenant_id=$2
      ORDER BY al.id, q.id`,
      [id, tid]
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=audit_${id}.csv`);
    res.send(rowsToCsv(rows));
  });

  app.post("/env/tap", auth, async (req, res) => {
    const { token, auditId } = req.body || {};
    const tid = tenantIdOf(req);
    const norm = normalizeToken(token || "");

    // ensure audit belongs to tenant
    const { rows: aRows } = await pool.query(
      "SELECT id FROM env_audits WHERE id=$1 AND tenant_id=$2",
      [auditId, tid]
    );
    if (!aRows.length) return res.status(404).json({ error: "no audit" });

    const { rows: qrRows } = await pool.query("SELECT * FROM qrcodes WHERE token=$1", [norm]);
    if (!qrRows.length) return res.status(404).json({ error: "bad token" });

    const { rows: locRows } = await pool.query("SELECT * FROM locations WHERE id=$1 AND tenant_id=$2", [qrRows[0].location_id, tid]);
    if (!locRows.length) return res.status(404).json({ error: "no location" });
    const loc = locRows[0];

    const { rows: exist } = await pool.query(
      "SELECT id FROM env_audit_locations WHERE audit_id=$1 AND location_id=$2 AND tenant_id=$3",
      [auditId, loc.id, tid]
    );

    const auditLocId = exist[0]?.id || (
      await pool.query(
        "INSERT INTO env_audit_locations(audit_id,location_id,location_name,tenant_id) VALUES ($1,$2,$3,$4) RETURNING id",
        [auditId, loc.id, loc.name || "Loc " + loc.id, tid]
      )
    ).rows[0].id;

    res.json({
      auditLocId,
      locationId: loc.id,
      locationName: loc.name || "Loc " + loc.id,
    });
  });

  app.post("/env/answer", auth, async (req, res) => {
    const { auditLocId, questionId, answer, comment } = req.body || {};
    if (!auditLocId || !questionId || !answer)
      return res.status(400).json({ error: "missing" });

    const tid = tenantIdOf(req);
    // verify location belongs to this tenant and get tenant_id for answers
    const { rows: alRows } = await pool.query(
      "SELECT id, tenant_id FROM env_audit_locations WHERE id=$1 AND tenant_id=$2",
      [auditLocId, tid]
    );
    const al = alRows[0];
    if (!al) return res.status(404).json({ error: "no audit location" });

    await pool.query(
      `INSERT INTO env_audit_answers(audit_loc_id,question_id,answer,comment,tenant_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (audit_loc_id,question_id)
       DO UPDATE SET answer=EXCLUDED.answer, comment=EXCLUDED.comment, tenant_id=EXCLUDED.tenant_id`,
      [auditLocId, questionId, String(answer).trim(), comment || "", al.tenant_id]
    );

    const { rows } = await pool.query(
      "SELECT answer FROM env_audit_answers WHERE audit_loc_id=$1 AND tenant_id=$2",
      [auditLocId, tid]
    );

    const total = rows.length;
    const yes = rows.filter(x => String(x.answer || "").toUpperCase() === "YES").length;
    const score = total ? Math.round((yes / total) * 100) : null;
    res.json({ ok: true, locationScore: score, compliant: score === 100 });
  });

  app.post("/env/submit", auth, async (req, res) => {
    const { auditId } = req.body || {};
    const tid = tenantIdOf(req);

    const { rows: aRows } = await pool.query(
      "SELECT id FROM env_audits WHERE id=$1 AND tenant_id=$2",
      [auditId, tid]
    );
    if (!aRows.length) return res.status(404).json({ error: "no audit" });

    const { rows: locs } = await pool.query(
      "SELECT id FROM env_audit_locations WHERE audit_id=$1 AND tenant_id=$2",
      [auditId, tid]
    );

    let total = 0, yes = 0;
    for (const l of locs) {
      const { rows: ans } = await pool.query(
        "SELECT answer FROM env_audit_answers WHERE audit_loc_id=$1 AND tenant_id=$2",
        [l.id, tid]
      );
      total += ans.length;
      yes   += ans.filter(x => String(x.answer || "").toUpperCase() === "YES").length;
    }
    const pct = total ? Math.round((yes / total) * 100) : 0;

    await pool.query(
      "UPDATE env_audits SET submitted_at=$1, overall_score=$2, status=$3 WHERE id=$4 AND tenant_id=$5",
      [nowISO(), pct, "done", auditId, tid]
    );
    res.json({ overall: pct });
  });

}; // end setupOps
