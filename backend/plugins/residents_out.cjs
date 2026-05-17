// =======================
// File: plugins/residents_out.cjs
// =======================
module.exports = function setupResidentsOut(opts = {}) {
  const {
    app, pool, auth,
    tenantIdOf = (req) => Number(req.user?.tenant_id || 0),
    PUBLIC_API_URL = "",
  } = opts;
  if (!app || !pool || !auth) throw new Error("[residents_out] Missing { app, pool, auth }");

  const { randomBytes } = require("crypto");

  // Canonical type + name for this special reception tap (residents only)
  const TYPE = "RECEPTION_RESIDENTS";
  const NAME = "Reception – Residents";

  // ---------- DB migrate (idempotent) ----------
  (async () => {
    try {
      // 1) Resident outings table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS resident_outings(
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL,
          resident  TEXT NOT NULL,
          escort    TEXT,
          note      TEXT,
          out_at    TIMESTAMPTZ DEFAULT NOW(),
          in_at     TIMESTAMPTZ
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_res_out_tenant_open
          ON resident_outings(tenant_id, out_at DESC) WHERE in_at IS NULL;
      `);

      // 2) Locations table (if your main app already created it, this is a no-op)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS locations(
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL
        );
      `);
      // Ensure uniqueness so ON CONFLICT works
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_locations_tenant_type_name
          ON locations(tenant_id, type, name);
      `);

      // 3) QR codes table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS qrcodes(
          id SERIAL PRIMARY KEY,
          tenant_id  INTEGER NOT NULL,
          location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
          token TEXT UNIQUE NOT NULL,
          kind  TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      // If the table predates "kind", add it safely
      await pool.query(`ALTER TABLE qrcodes ADD COLUMN IF NOT EXISTS kind TEXT;`);

    } catch (e) {
      console.error("[residents_out migrate]", e);
    }
  })();

  // ---------- helpers ----------
  async function ensureLocationAndToken(tid) {
    // Create/ensure the location
    const { rows: locRows } = await pool.query(`
      INSERT INTO locations(tenant_id, type, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, type, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [tid, TYPE, NAME]);

    const locId = locRows[0].id;

    // Try to find an existing token for this tenant+location
    const { rows: qr } = await pool.query(
      `SELECT token FROM qrcodes WHERE tenant_id=$1 AND location_id=$2 LIMIT 1`,
      [tid, locId]
    );
    if (qr[0]) {
      return { locId, token: qr[0].token };
    }

    // Generate a new unique token
    let token;
    for (let i = 0; i < 6; i++) {
      token = randomBytes(12).toString("base64url");
      const { rows } = await pool.query(`SELECT 1 FROM qrcodes WHERE token=$1`, [token]);
      if (!rows.length) break;
      token = null;
    }
    if (!token) throw new Error("cannot generate unique token");

    // Insert qrcode (mark kind='resident' so you can distinguish later if needed)
    const { rows: ins } = await pool.query(`
      INSERT INTO qrcodes(tenant_id, location_id, token, kind)
      VALUES ($1, $2, $3, 'resident')
      RETURNING token
    `, [tid, locId, token]);

    return { locId, token: ins[0].token };
  }

  // ---------- API ----------
  // Ensure special "Reception – Residents" location & token, return tap URL
  // POST /locations/reception-residents/ensure
  app.post("/locations/reception-residents/ensure", auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      if (!tid) return res.status(401).json({ error: "unauthorized" });

      const { locId, token } = await ensureLocationAndToken(tid);
      return res.json({
        ok: true,
        location_id: locId,
        type: TYPE,
        name: NAME,
        token,
        tap_url: `/tap/resident/${token}`
      });
    } catch (e) {
      console.error("[/locations/reception-residents/ensure] error:", e);
      return res.status(500).json({ error: "server error" });
    }
  });

  // Resident toggles OUT/IN when tapping at reception
  // POST /resident/tap   { token, resident, escort? }
  app.post("/resident/tap", async (req, res) => {
    try {
      const token    = String(req.body?.token || "").trim();
      const resident = String(req.body?.resident || "").trim();
      const escort   = String(req.body?.escort || "").trim();

      if (!token || !resident) {
        return res.status(400).json({ error: "token and resident required" });
      }

      // Resolve token → (tenant, location, type)
      const { rows: qrRows } = await pool.query(`
        SELECT q.tenant_id, q.location_id, COALESCE(l.type,'') AS type
        FROM qrcodes q
        LEFT JOIN locations l ON l.id = q.location_id
        WHERE q.token = $1
        LIMIT 1
      `, [token]);

      const qr = qrRows[0];
      if (!qr || qr.type !== TYPE) {
        return res.status(403).json({ error: "invalid token" });
      }

      const tid = qr.tenant_id;

      // If the resident is currently out → mark IN
      const { rows: openRows } = await pool.query(`
        SELECT id
        FROM resident_outings
        WHERE tenant_id=$1 AND resident=$2 AND in_at IS NULL
        LIMIT 1
      `, [tid, resident]);

      if (openRows[0]) {
        await pool.query(
          `UPDATE resident_outings SET in_at = NOW() WHERE id=$1`,
          [openRows[0].id]
        );
        return res.json({
          ok: true,
          action: "in",
          msg: `Nice to see you back, ${resident}! We hope you enjoyed your outing.`
        });
      }

      // Otherwise → mark OUT
      await pool.query(`
        INSERT INTO resident_outings(tenant_id, resident, escort, out_at)
        VALUES ($1, $2, $3, NOW())
      `, [tid, resident, escort || null]);

      return res.json({
        ok: true,
        action: "out",
        msg: `Enjoy your outing, see you soon ${resident}!`
      });

    } catch (e) {
      console.error("[/resident/tap] error:", e);
      return res.status(500).json({ error: "server error" });
    }
  });
    // Reception/Admin manual OUT/IN toggle (no QR, just resident + escort)
  // POST /residents/out/manual  { resident, escort? }
  app.post("/residents/out/manual", auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      if (!tid) return res.status(401).json({ error: "unauthorized" });

      const body     = req.body || {};
      const resident = String(body.resident || "").trim();
      const escort   = String(body.escort   || "").trim();

      if (!resident) {
        return res.status(400).json({ error: "resident required" });
      }

      // Is there an open outing row for this resident?
      const { rows: openRows } = await pool.query(`
        SELECT id
          FROM resident_outings
         WHERE tenant_id = $1
           AND resident  = $2
           AND in_at IS NULL
         ORDER BY out_at DESC
         LIMIT 1
      `, [tid, resident]);

      if (openRows[0]) {
        // Mark as back in
        await pool.query(
          `UPDATE resident_outings
              SET in_at = NOW()
            WHERE id = $1`,
          [openRows[0].id]
        );
        return res.json({
          ok: true,
          action: "in",
          msg: `Welcome back, ${resident}!`
        });
      }

      // Otherwise create an OUT record
      const { rows: ins } = await pool.query(
        `INSERT INTO resident_outings(tenant_id, resident, escort, out_at)
         VALUES ($1,$2,$3,NOW())
         RETURNING id`,
        [tid, resident, escort || null]
      );

      return res.json({
        ok: true,
        id: ins[0].id,
        action: "out",
        msg: `Enjoy your outing, see you soon ${resident}!`
      });
    } catch (e) {
      console.error("[/residents/out/manual] error:", e);
      return res.status(500).json({ error: "server error" });
    }
  });


      // --- Resident TAP page (classic UX, standalone HTML, resident + escort only) ---
  app.get('/tap/resident/:token', (req, res) => {
    const token = String(req.params.token || '').trim();
    const api   = (PUBLIC_API_URL || '');

    res
      .status(200)
      .type('html')
      .send(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Ernos • Resident</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{ box-sizing:border-box; }
  :root{
    --bg:#4E6E81;
    --panel:#FFFFFF;
    --text:#EAF1F4;
    --text-panel:#2E2E2E;
    --muted:#D7E3E8;
    --muted-panel:#606060;
    --accent:#7BA297;
    --border:#3E5967;
  }

  body{
    font:15px system-ui,sans-serif;
    max-width:640px;
    margin:0 auto;
    background:var(--bg);
    color:var(--text);
    padding:24px;
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
    border-radius:10px;
  }

  button{
    padding:10px 14px;
    border-radius:10px;
    border:0;
    background:var(--accent);
    color:#fff;
    font-weight:700;
    cursor:pointer;
  }

  .btn-outline{
    background:#fff;
    border:1px solid var(--border);
    color:var(--text-panel);
  }

  .stack > *{margin-top:10px}

  #msg{
    margin:10px 0;
    padding:12px;
    border-radius:12px;
    border:1px solid var(--border);
    background:#fff;
    color:var(--text-panel);
    display:none;
  }

  .ok{border-color:#CFE8DB;background:#E9F5EF;color:#1D5C45}
  .err{border-color:#F1C9C9;background:#FDEEEE;color:#7A2A2A}

  .muted{color:var(--muted)}
  .tiny{font-size:12px;color:var(--muted-panel)}

  .center{text-align:center;}
</style>
<body>
  <header style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <img src="/skin/icons/logo.png" alt="Ernos" style="height:84px" onerror="this.src='/icons/icon.svg'">
    <h2 style="margin:0">Resident</h2>
  </header>

  <div id="msg"></div>

  <!-- Prompt card if we remember last resident on this device -->
  <div class="card stack" id="promptCard" style="display:none">
    <div id="promptText" class="center" style="font-size:18px"></div>
    <div class="row" style="justify-content:center">
      <button id="btnYes">Yes, same resident</button>
      <button id="btnNo" class="btn-outline">No, different resident</button>
    </div>
  </div>

  <!-- Form card: resident + escort only -->
  <div class="card stack" id="formCard" style="display:none">
    <div>
      <label for="residentName">Resident name (required)</label>
      <input id="residentName" autocomplete="off" placeholder="e.g. Sr Mary O.">
    </div>

    <div>
      <label for="escort">Escort (optional)</label>
      <input id="escort" autocomplete="off" placeholder="e.g. family member or staff">
    </div>

    <div class="row" style="justify-content:flex-end">
      <button id="btnSubmit" type="button">Submit</button>
    </div>
    <div class="tiny">Tap when leaving and again on return with the same resident name.</div>
  </div>

  <!-- Message card after success -->
  <div class="card center" id="messageCard" style="display:none">
    <div id="bigMessage" style="font-size:18px"></div>
  </div>

<script>
(function(){
  const TOKEN = ${JSON.stringify(token)};
  let API = ${JSON.stringify(api)}; if(!API) API = location.origin;

  const $ = (id)=>document.getElementById(id);
  const show = (id)=>{ ['promptCard','formCard','messageCard'].forEach(x=>$(x).style.display='none'); $(id).style.display=''; };
  const showMsg = (t, cls='')=>{
    const el=$('msg');
    el.textContent=t;
    el.className=cls?cls:'';
    el.style.display=t?'':'none';
  };

  // Local storage keys (per token) – just resident+escort
  const K_RESIDENT = 'ernos_resident_name_'+TOKEN;
  const K_ESCORT   = 'ernos_resident_escort_'+TOKEN;

  function post(url, data){
    return fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data||{})
    }).then(r=>
      r.json().then(j=>{ if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status)); return j; })
    );
  }

  function defaultMessage(action, resident){
    if(action === 'in'){
      return '✅ ' + (resident || 'Resident') + ' is now back in the facility. Welcome back!';
    }
    if(action === 'out'){
      return '✅ ' + (resident || 'Resident') + ' has been recorded as out. Enjoy the outing!';
    }
    return '✅ Recorded successfully for ' + (resident || 'resident') + '.';
  }

  // Restore last resident/escort (per device + token)
  let lastResident = '', lastEscort = '';
  try{
    lastResident = localStorage.getItem(K_RESIDENT) || '';
    lastEscort   = localStorage.getItem(K_ESCORT) || '';
  }catch(_){}

  if(lastResident){
    $('promptText').textContent =
      'Are you recording an outing/return for ' + lastResident + ' with the same details?';
    show('promptCard');

    $('btnYes').onclick = ()=>{
      show('messageCard');
      $('bigMessage').textContent = 'Recording…';
      showMsg('', '');
      post((API||location.origin) + '/resident/tap', {
        token: TOKEN,
        resident: lastResident,
        escort: lastEscort
      })
      .then(j=>{
        const msg = (j && j.msg) || defaultMessage(j && j.action, lastResident);
        $('bigMessage').textContent = msg;
        try{
          localStorage.setItem(K_RESIDENT, lastResident);
          localStorage.setItem(K_ESCORT, lastEscort || '');
        }catch(_){}
      })
      .catch(e=>{
        show('promptCard');
        $('bigMessage').textContent = '';
        showMsg(e.message||String(e), 'err');
      });
    };

    $('btnNo').onclick = ()=>{
      $('residentName').value = '';
      $('escort').value = '';
      show('formCard');
    };
  } else {
    show('formCard');
  }

  $('btnSubmit').onclick = function(){
    const resident = ($('residentName').value||'').trim();
    const escort   = ($('escort').value||'').trim();
    if(!resident){ showMsg('Please enter resident name.', 'err'); return; }

    showMsg('Contacting server…','muted');
    post((API||location.origin) + '/resident/tap', {
      token: TOKEN,
      resident,
      escort
    })
    .then(j=>{
      show('messageCard');
      const msg = (j && j.msg) || defaultMessage(j && j.action, resident);
      $('bigMessage').textContent = msg;
      try{
        localStorage.setItem(K_RESIDENT, resident);
        localStorage.setItem(K_ESCORT, escort || '');
      }catch(_){}
      showMsg('', '');
    })
    .catch(e=> showMsg(e.message||String(e), 'err'));
  };
})();
</script>
</body></html>`);
  });


  // Residents Out history / log for UI (supports ?from=YYYY-MM-DD&to=YYYY-MM-DD)
  app.get("/residents/out/log", auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      if (!tid) return res.status(401).json({ error: "unauthorized" });

      const { from, to } = req.query || {};
      const vals = [tid];
      const where = ["tenant_id = $1"];

      if (from) {
        vals.push(from);
        where.push(`out_at >= $${vals.length}::date`);
      }
      if (to) {
        vals.push(to);
        // inclusive end-of-day
        where.push(`out_at < ($${vals.length}::date + INTERVAL '1 day')`);
      }

      const sql = `
        SELECT
          resident,
          escort,
          note,
          out_at,
          in_at,
          EXTRACT(EPOCH FROM (COALESCE(in_at, NOW()) - out_at))/60 AS minutes_out
        FROM resident_outings
        WHERE ${where.join(" AND ")}
        ORDER BY out_at DESC, id DESC
      `;

      const { rows } = await pool.query(sql, vals);
      return res.json({ items: rows });
    } catch (e) {
      console.error("[/residents/out/log] error:", e);
      return res.status(500).json({ error: "server error" });
    }
  });
  // === Manual OUT/IN for Reception (matches the residents_out table) ===
app.post("/residents/out/manual", auth, async (req, res) => {
  try {
    const tid = tenantIdOf(req);
    if (!tid) return res.status(401).json({ error: "unauthorized" });

    const b = req.body || {};
    const resident = String(b.resident || "").trim();
    const escort   = String(b.escort   || "").trim() || null;

    if (!resident) {
      return res.status(400).json({ error: "resident required" });
    }

    // Check if resident is already OUT
    const { rows: open } = await pool.query(`
      SELECT id
        FROM residents_out
       WHERE tenant_id = $1
         AND resident  = $2
         AND in_at IS NULL
       ORDER BY out_at DESC
       LIMIT 1
    `, [tid, resident]);

    if (open.length) {
      // Mark IN
      await pool.query(
        `UPDATE residents_out
            SET in_at = NOW()
          WHERE id = $1`,
        [open[0].id]
      );
      return res.json({ ok: true, action: "in" });
    }

    // Otherwise → create OUT record
    const { rows: ins } = await pool.query(`
      INSERT INTO residents_out(tenant_id, resident, escort, out_at)
      VALUES ($1,$2,$3,NOW())
      RETURNING id
    `, [tid, resident, escort]);

    return res.json({ ok: true, action: "out", id: ins[0].id });

  } catch(err) {
    console.error("[/residents/out/manual] ERROR:", err);
    return res.status(500).json({ error: "server error" });
  }
});

};
