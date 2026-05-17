// plugins/issues.cjs
module.exports = function setupIssues(opts){
  const {
    app, pool, auth,
    tenantIdOf = (req) => Number(req.user?.tenant_id || 0),
  } = opts || {};
  if (!app || !pool || !auth) throw new Error("[issues] Missing { app, pool, auth }");

  /* ---------------- Migrations (idempotent) ---------------- */
  (async function migrate(){
    const sql = `
      CREATE TABLE IF NOT EXISTS issues(
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        location_id INTEGER,
        location_name TEXT,
        category TEXT,
        text TEXT NOT NULL,
        status TEXT DEFAULT 'OPEN',
        user_id INTEGER,
        user_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        accepted_by INTEGER,
        accepted_by_name TEXT,
        maintenance_comment TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_issues_tenant ON issues(tenant_id, created_at DESC);

      -- Add fields if they don't exist (older installs)
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='issues' AND column_name='accepted_at') THEN
          ALTER TABLE issues ADD COLUMN accepted_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='issues' AND column_name='resolved_at') THEN
          ALTER TABLE issues ADD COLUMN resolved_at TIMESTAMPTZ;
        END IF;
      END $$;

      -- Optional: attachments table is created by attachments plugin.
      -- We don't create it here, but we will SELECT from it if present.
    `;
    await pool.query(sql);
  })().catch(e => console.error("[issues migrate]", e));

  /* ---------------- Helpers ---------------- */
    const up = (s) => String(s || "").toUpperCase();

  function canWrite(req) {
    // Be generous and look at role + all possible category fields
    const role = up(req.user?.role);

    const catRaw = up(
      req.user?.category ||
      req.user?.staff_category ||
      req.user?.staff_cat ||
      req.user?.cat
    );

    const combined = `${role} ${catRaw}`;

    // Admins (local + global) can always write
    if (role === "ADMIN" || role === "ADMIN_GLOBAL") return true;

    // Anyone clearly tagged as maintenance in either role or category
    if (combined.includes("MAINT")) return true;

    return false;
  }

  function canCreate(req) {
    // Anyone signed-in can create (HK, Nursing, Reception, Admin, etc.)
    return !!req.user;
  }

  /* ---------------- Routes ---------------- */

  // GET /issues — list all issues in the tenant
  app.get("/issues", auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      const { rows } = await pool.query(
        `SELECT id, status, location_name, category, text, user_name, created_at,
                accepted_by, accepted_by_name, accepted_at, resolved_at, maintenance_comment
           FROM issues
          WHERE tenant_id = $1
          ORDER BY created_at DESC
          LIMIT 500`,
        [tid]
      );
      res.json({ items: rows });
    } catch (e) {
      console.error("[issues GET]", e);
      res.status(500).json({ error: "server error" });
    }
  });
  // GET /issues/open — open (non-resolved) issues for housekeeping/dashboard
  app.get("/issues/open", auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      const { rows } = await pool.query(
        `SELECT id, status, location_name, category, text, user_name, created_at,
                accepted_by, accepted_by_name, accepted_at, resolved_at, maintenance_comment
           FROM issues
          WHERE tenant_id = $1
            AND (status IS NULL OR UPPER(status) <> 'RESOLVED')
          ORDER BY created_at DESC
          LIMIT 500`,
        [tid]
      );
      res.json({ items: rows });
    } catch (e) {
      console.error("[issues GET /open]", e);
      res.status(500).json({ error: "server error" });
    }
  });

  // POST /issues — create a new issue
    // --- POST /issues — create new issue + notify maintenance
  app.post("/issues", auth, async (req, res) => {
    try {
      const tid  = tenantIdOf(req);
      const text = String(req.body?.text || "").trim();
      const locName = String(req.body?.location_name || req.body?.location || "");
      const category = String(req.body?.category || 'MAINTENANCE').toUpperCase();
      if (!text) return res.status(400).json({ error: "text required" });

      const userName = req.user?.name || req.user?.email || "User";
      const { rows } = await pool.query(
        `INSERT INTO issues(tenant_id, text, status, user_name, created_at, location_name, category)
         VALUES ($1,$2,'OPEN',$3,NOW(),$4,$5)
         RETURNING id`,
        [tid, text, userName, locName || null, category]
      );
      const id = rows[0].id;

      // Push: notify MAINTENANCE (admins can opt-in via Settings → “Maintenance Issues”)
try {
  const push = req.app?.locals?.pushNotify;
  if (push) {
    const title = 'New maintenance issue';
    const body  = (locName ? `[${locName}] ` : '') + text;
    await push.notifyRoles({
      tenantId: tid,
      rolesOrCats: ['MAINTENANCE', 'ADMIN', 'ADMIN_GLOBAL'],
      title,
      body,
      data: {
        url:  '/#issues',
          kind: 'issues',
        issue_id: id,
        location_name: locName || null,
        category
      }
    });
  }
} catch (e) {
  console.warn('[issues push notify]', e?.message || e);
}

      res.json({ ok: true, id });
    } catch (e) {
      console.error("[issues POST]", e);
      res.status(500).json({ error: "server error" });
    }
  });


  // PATCH /issues/:id — generic update (used by frontend fallback)
  // Allows: status, accepted_by_id/name, maintenance_comment, accepted_at/resolved_at, location fields, category
  app.patch("/issues/:id", auth, async (req, res) => {
    try {
      if (!canWrite(req)) return res.status(403).json({ error: "forbidden" });

      const id  = Number(req.params.id || 0);
      const tid = tenantIdOf(req);
      if (!id) return res.status(400).json({ error: "bad id" });

      const b = req.body || {};
      const fields = [];
      const vals   = [];
      let i = 1;

      function set(col, val){
        fields.push(`${col}=$${i++}`);
        vals.push(val);
      }

      if (b.status != null)              set('status', String(b.status));
      if (b.accepted_by_id != null)      set('accepted_by', Number(b.accepted_by_id) || null);
      if (b.accepted_by_name != null)    set('accepted_by_name', String(b.accepted_by_name||''));
      if (b.maintenance_comment != null) set('maintenance_comment', String(b.maintenance_comment||''));
      if (b.location_id != null)         set('location_id', Number(b.location_id) || null);
      if (b.location_name != null)       set('location_name', String(b.location_name||''));
      if (b.category != null)            set('category', up(b.category));
      if (b.accepted_at != null)         set('accepted_at', b.accepted_at);
      if (b.resolved_at != null)         set('resolved_at', b.resolved_at);

      if (!fields.length) return res.json({ ok: true, nochange: true });

      // tenant scoping
      vals.push(tid);  const tidIdx = i++;
      vals.push(id);   const idIdx  = i++;

      const sql = `UPDATE issues SET ${fields.join(', ')} WHERE tenant_id=$${tidIdx} AND id=$${idIdx}`;
      await pool.query(sql, vals);
      res.json({ ok: true });
    } catch (e) {
      console.error("[issues PATCH]", e);
      res.status(500).json({ error: "server error" });
    }
  });

  // POST /issues/:id/accept — convenience endpoint
  app.post("/issues/:id/accept", auth, async (req, res) => {
    try {
      if (!canWrite(req)) return res.status(403).json({ error: "forbidden" });

      const id  = Number(req.params.id || 0);
      const tid = tenantIdOf(req);
      if (!id) return res.status(400).json({ error: "bad id" });

      const uid  = Number(req.user?.id || req.user?.user_id || 0) || null;
      const name = req.user?.name || req.user?.email || "User";

      await pool.query(
        `UPDATE issues
            SET status='IN_PROGRESS',
                accepted_by=$1,
                accepted_by_name=$2,
                accepted_at=NOW()
          WHERE tenant_id=$3 AND id=$4`,
        [uid, name, tid, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("[issues accept]", e);
      res.status(500).json({ error: "server error" });
    }
  });

  // POST /issues/:id/resolve — convenience endpoint
  app.post("/issues/:id/resolve", auth, async (req, res) => {
    try {
      if (!canWrite(req)) return res.status(403).json({ error: "forbidden" });

      const id  = Number(req.params.id || 0);
      const tid = tenantIdOf(req);
      if (!id) return res.status(400).json({ error: "bad id" });

      await pool.query(
        `UPDATE issues
            SET status='RESOLVED',
                resolved_at=NOW()
          WHERE tenant_id=$1 AND id=$2`,
        [tid, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("[issues resolve]", e);
      res.status(500).json({ error: "server error" });
    }
  });

  // POST /issues/:id/comment — append to maintenance_comment with timestamp/name
  app.post("/issues/:id/comment", auth, async (req, res) => {
    try {
      if (!canWrite(req)) return res.status(403).json({ error: "forbidden" });

      const id  = Number(req.params.id || 0);
      const tid = tenantIdOf(req);
      if (!id) return res.status(400).json({ error: "bad id" });

      const text = String(req.body?.text || "").trim();
      if (!text) return res.status(400).json({ error: "text required" });

      const who = req.user?.name || req.user?.email || "User";
      // Fetch old comment
      const { rows } = await pool.query(
        `SELECT maintenance_comment FROM issues WHERE tenant_id=$1 AND id=$2`,
        [tid, id]
      );
      if (!rows.length) return res.status(404).json({ error: "not found" });
      const prev = rows[0].maintenance_comment || "";
      const line = `[${new Date().toISOString()}] ${who}: ${text}`;
      const merged = prev ? (prev + "\n" + line) : line;

      await pool.query(
        `UPDATE issues SET maintenance_comment=$1 WHERE tenant_id=$2 AND id=$3`,
        [merged, tid, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("[issues comment]", e);
      res.status(500).json({ error: "server error" });
    }
  });

  // GET /issues/:id/attachments — list photos (if attachments table exists)
  app.get("/issues/:id/attachments", auth, async (req, res) => {
    try {
      const id  = Number(req.params.id || 0);
      const tid = tenantIdOf(req);
      if (!id) return res.status(400).json({ error: "bad id" });

      // Check if attachments table exists
      const chk = await pool.query(
        `SELECT to_regclass('public.issue_attachments') AS t`
      );
      if (!chk.rows[0]?.t){
        return res.json({ items: [] }); // attachments plugin not installed
      }

      const { rows } = await pool.query(
        `SELECT id, issue_id, url, filename, mime, created_at
                      FROM issue_attachments
          WHERE tenant_id=$1 AND issue_id=$2
          ORDER BY created_at DESC
          LIMIT 20`,
        [tid, id]
      );
      res.json({ items: rows });
    } catch (e) {
      console.error("[issues attachments]", e);
      res.status(500).json({ error: "server error" });
    }
  });
};
