// backend/plugins/family_touchpoint.cjs
// Family Touchpoint + Home-care Patients API
// -------------------------------------------------------

const crypto = require('crypto');

module.exports = function setupFamilyTouchpoint(opts = {}) {
  const { app, pool, auth } = opts || {};
  if (!app || !pool) {
    console.warn('[family_touchpoint] Missing app/pool; plugin not initialised');
    return;
  }

  function nowISO() { return new Date().toISOString(); }
  function rndToken() { return crypto.randomBytes(24).toString('hex'); }
  const requireUser = auth?.requireUser || ((req, res, next) => next());

  function tenantOf(req) {
    return Number(req.user?.tenant_id || req.tenant_id || 0);
  }

  function userIdOf(req) {
    return Number(req.user?.id || req.user?.user_id || 0) || null;
  }

  function cleanText(v, max = 500) {
    return String(v ?? '').trim().slice(0, max);
  }

  async function ensureTables() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        date_of_birth DATE,
        address TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        family_contact_name TEXT NOT NULL DEFAULT '',
        family_contact_phone TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_patients_tenant_active
        ON patients(tenant_id, active, last_name, first_name);

      CREATE TABLE IF NOT EXISTS family_room_summaries (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL,
        location_id BIGINT NOT NULL,
        resident_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'STABLE',
        today_update TEXT NOT NULL DEFAULT '',
        diet TEXT NOT NULL DEFAULT '',
        alerts TEXT NOT NULL DEFAULT '',
        care_summary TEXT NOT NULL DEFAULT '',
        updated_by BIGINT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_family_room_summaries_tenant_loc
        ON family_room_summaries(tenant_id, location_id);

      CREATE TABLE IF NOT EXISTS visitor_room_sessions (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        visitor_name TEXT NOT NULL DEFAULT '',
        resident_name TEXT NOT NULL DEFAULT '',
        location_id BIGINT NOT NULL,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_visitor_room_sessions_tenant_loc
        ON visitor_room_sessions(tenant_id, location_id);
      CREATE INDEX IF NOT EXISTS idx_visitor_room_sessions_expires
        ON visitor_room_sessions(expires_at);
    `);
  }

  ensureTables().catch(e => console.error('[family_touchpoint] ensureTables failed', e));

  // -------------------------------------------------------
  // Home-care patients API
  // -------------------------------------------------------
  app.get('/api/patients', requireUser, async (req, res) => {
    try {
      const tenant_id = tenantOf(req);
      if (!tenant_id) return res.status(400).json({ error: 'Missing tenant' });

      const q = cleanText(req.query.q || '', 120);
      const params = [tenant_id];
      let where = 'tenant_id = $1 AND active = TRUE';

      if (q) {
        params.push('%' + q.toLowerCase() + '%');
        where += ` AND (LOWER(first_name) LIKE $${params.length} OR LOWER(last_name) LIKE $${params.length} OR LOWER(address) LIKE $${params.length})`;
      }

      const { rows } = await pool.query(`
        SELECT id, first_name, last_name, date_of_birth, address, phone,
               family_contact_name, family_contact_phone, notes, active,
               created_at, updated_at
        FROM patients
        WHERE ${where}
        ORDER BY last_name ASC, first_name ASC, id DESC
      `, params);

      res.json({ items: rows });
    } catch (e) {
      console.error('[patients] GET /api/patients failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.get('/api/patients/:id', requireUser, async (req, res) => {
    try {
      const tenant_id = tenantOf(req);
      const id = Number(req.params.id || 0);
      if (!tenant_id || !id) return res.status(400).json({ error: 'Missing tenant/id' });

      const { rows } = await pool.query(`
        SELECT id, first_name, last_name, date_of_birth, address, phone,
               family_contact_name, family_contact_phone, notes, active,
               created_at, updated_at
        FROM patients
        WHERE tenant_id = $1 AND id = $2 AND active = TRUE
        LIMIT 1
      `, [tenant_id, id]);

      if (!rows.length) return res.status(404).json({ error: 'Patient not found' });
      res.json({ item: rows[0] });
    } catch (e) {
      console.error('[patients] GET /api/patients/:id failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/patients', requireUser, async (req, res) => {
    try {
      const tenant_id = tenantOf(req);
      const created_by = userIdOf(req);
      if (!tenant_id) return res.status(400).json({ error: 'Missing tenant' });

      const body = req.body || {};
      const first_name = cleanText(body.first_name, 120);
      const last_name = cleanText(body.last_name, 120);
      const date_of_birth = cleanText(body.date_of_birth, 20) || null;
      const address = cleanText(body.address, 300);
      const phone = cleanText(body.phone, 80);
      const family_contact_name = cleanText(body.family_contact_name, 160);
      const family_contact_phone = cleanText(body.family_contact_phone, 80);
      const notes = cleanText(body.notes, 1500);

      if (!first_name || !last_name) {
        return res.status(400).json({ error: 'Ime i prezime su obavezni' });
      }

      const { rows } = await pool.query(`
        INSERT INTO patients
          (tenant_id, first_name, last_name, date_of_birth, address, phone,
           family_contact_name, family_contact_phone, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, first_name, last_name, date_of_birth, address, phone,
                  family_contact_name, family_contact_phone, notes, active,
                  created_at, updated_at
      `, [tenant_id, first_name, last_name, date_of_birth, address, phone, family_contact_name, family_contact_phone, notes, created_by]);

      res.json({ ok: true, item: rows[0] });
    } catch (e) {
      console.error('[patients] POST /api/patients failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.patch('/api/patients/:id', requireUser, async (req, res) => {
    try {
      const tenant_id = tenantOf(req);
      const id = Number(req.params.id || 0);
      if (!tenant_id || !id) return res.status(400).json({ error: 'Missing tenant/id' });

      const allowed = ['first_name','last_name','date_of_birth','address','phone','family_contact_name','family_contact_phone','notes'];
      const sets = [];
      const vals = [];

      for (const key of allowed) {
        if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;
        let val = key === 'date_of_birth'
          ? (cleanText(req.body[key], 20) || null)
          : cleanText(req.body[key], key === 'notes' ? 1500 : 300);
        vals.push(val);
        sets.push(`${key} = $${vals.length}`);
      }

      if (!sets.length) return res.status(400).json({ error: 'No fields supplied' });
      sets.push('updated_at = NOW()');
      vals.push(tenant_id, id);

      const { rows } = await pool.query(`
        UPDATE patients
        SET ${sets.join(', ')}
        WHERE tenant_id = $${vals.length - 1} AND id = $${vals.length} AND active = TRUE
        RETURNING id, first_name, last_name, date_of_birth, address, phone,
                  family_contact_name, family_contact_phone, notes, active,
                  created_at, updated_at
      `, vals);

      if (!rows.length) return res.status(404).json({ error: 'Patient not found' });
      res.json({ ok: true, item: rows[0] });
    } catch (e) {
      console.error('[patients] PATCH /api/patients/:id failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.delete('/api/patients/:id', requireUser, async (req, res) => {
    try {
      const tenant_id = tenantOf(req);
      const id = Number(req.params.id || 0);
      if (!tenant_id || !id) return res.status(400).json({ error: 'Missing tenant/id' });

      const { rowCount } = await pool.query(`
        UPDATE patients
        SET active = FALSE, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2 AND active = TRUE
      `, [tenant_id, id]);

      if (!rowCount) return res.status(404).json({ error: 'Patient not found' });
      res.json({ ok: true });
    } catch (e) {
      console.error('[patients] DELETE /api/patients/:id failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  // -------------------------------------------------------
  // Original Family Touchpoint helpers/routes
  // -------------------------------------------------------
  async function getTenantRooms(tenant_id) {
    const r = await pool.query(
      `SELECT id, name
       FROM locations
       WHERE tenant_id = $1 AND type = 'ROOM'
       ORDER BY name ASC`,
      [tenant_id]
    );
    return r.rows;
  }

  async function getLatestSummary(tenant_id, location_id) {
    const r = await pool.query(
      `SELECT *
       FROM family_room_summaries
       WHERE tenant_id = $1 AND location_id = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [tenant_id, location_id]
    );
    return r.rows[0] || null;
  }

  async function upsertSummary({ tenant_id, location_id, resident_name, status, today_update, diet, alerts, care_summary, updated_by }) {
    await pool.query(
      `INSERT INTO family_room_summaries
       (tenant_id, location_id, resident_name, status, today_update, diet, alerts, care_summary, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())`,
      [tenant_id, location_id, resident_name || '', status || 'STABLE', today_update || '', diet || '', alerts || '', care_summary || '', updated_by || null]
    );
    return getLatestSummary(tenant_id, location_id);
  }

  async function resolveRoomByCode(tenant_id, code) {
    const r = await pool.query(
      `SELECT l.id AS location_id, l.name, l.type
       FROM qrcodes q
       JOIN locations l ON l.id = q.location_id
       WHERE q.tenant_id = $1 AND (q.token = $2 OR q.code = $2)
       LIMIT 1`,
      [tenant_id, code]
    );
    const row = r.rows[0];
    if (!row || row.type !== 'ROOM') return null;
    return { location_id: row.location_id, room_name: row.name };
  }

  async function validateVisitorSession(tenant_id, token) {
    if (!token) return null;
    const r = await pool.query(
      `SELECT * FROM visitor_room_sessions WHERE tenant_id = $1 AND token = $2 LIMIT 1`,
      [tenant_id, token]
    );
    const s = r.rows[0];
    if (!s || s.revoked_at) return null;
    if (new Date(s.expires_at).getTime() < Date.now()) return null;
    return s;
  }

  app.get('/family/rooms', requireUser, async (req, res) => {
    try {
      const tenant_id = tenantOf(req);
      if (!tenant_id) return res.status(400).json({ error: 'Missing tenant' });
      const rooms = await getTenantRooms(tenant_id);
      res.json({ rooms });
    } catch (e) {
      console.error('[family_touchpoint] GET /family/rooms failed', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/family/summary', requireUser, async (req, res) => {
    try {
      const tenant_id = tenantOf(req);
      const location_id = Number(req.query.location_id || 0);
      if (!tenant_id || !location_id) return res.status(400).json({ error: 'Missing tenant/location_id' });
      const summary = await getLatestSummary(tenant_id, location_id);
      res.json({ now: nowISO(), summary });
    } catch (e) {
      console.error('[family_touchpoint] GET /family/summary failed', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/family/summary', requireUser, async (req, res) => {
    try {
      const tenant_id = tenantOf(req);
      const user_id = userIdOf(req);
      const { location_id, resident_name, status, today_update, diet, alerts, care_summary } = req.body || {};
      const locId = Number(location_id || 0);
      if (!tenant_id || !locId) return res.status(400).json({ error: 'Missing tenant/location_id' });
      const saved = await upsertSummary({ tenant_id, location_id: locId, resident_name, status, today_update, diet, alerts, care_summary, updated_by: user_id });
      res.json({ ok: true, summary: saved });
    } catch (e) {
      console.error('[family_touchpoint] POST /family/summary failed', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/family/session', requireUser, async (req, res) => {
    try {
      const tenant_id = tenantOf(req);
      const user_id = userIdOf(req);
      const { visitor_name, resident_name, location_id, expires_min } = req.body || {};
      const locId = Number(location_id || 0);
      const mins = Math.max(15, Math.min(12 * 60, Number(expires_min || 240)));
      if (!tenant_id || !locId) return res.status(400).json({ error: 'Missing tenant/location_id' });
      const token = rndToken();
      const expiresAt = new Date(Date.now() + mins * 60 * 1000).toISOString();
      await pool.query(
        `INSERT INTO visitor_room_sessions
         (tenant_id, token, visitor_name, resident_name, location_id, created_by, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenant_id, token, visitor_name || '', resident_name || '', locId, user_id, expiresAt]
      );
      res.json({ ok: true, token, expires_at: expiresAt });
    } catch (e) {
      console.error('[family_touchpoint] POST /family/session failed', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/v/room/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').trim();
      const token = String(req.query.s || '').trim();
      if (!code || !token) return res.status(400).json({ error: 'Missing code/session' });

      const sessRow = await pool.query(
        `SELECT tenant_id, token, location_id, visitor_name, resident_name, expires_at, revoked_at
         FROM visitor_room_sessions
         WHERE token = $1
         LIMIT 1`,
        [token]
      );
      const sess = sessRow.rows[0];
      if (!sess) return res.status(401).json({ error: 'Invalid session' });

      const valid = await validateVisitorSession(sess.tenant_id, token);
      if (!valid) return res.status(401).json({ error: 'Session expired/invalid' });

      const room = await resolveRoomByCode(sess.tenant_id, code);
      if (!room) return res.status(404).json({ error: 'Room not found' });

      if (Number(valid.location_id) !== Number(room.location_id)) {
        return res.status(403).json({ error: 'Not allowed for this room' });
      }

      const summary = await getLatestSummary(sess.tenant_id, room.location_id);
      res.json({
        ok: true,
        now: nowISO(),
        room: { id: room.location_id, name: room.room_name },
        session: {
          visitor_name: valid.visitor_name || '',
          resident_name: (summary?.resident_name || valid.resident_name || '').trim(),
          expires_at: valid.expires_at
        },
        summary: summary ? {
          resident_name: summary.resident_name,
          status: summary.status,
          today_update: summary.today_update,
          diet: summary.diet,
          alerts: summary.alerts,
          care_summary: summary.care_summary,
          updated_at: summary.updated_at
        } : null
      });
    } catch (e) {
      console.error('[family_touchpoint] GET /v/room/:code failed', e);
      res.status(500).json({ error: 'Server error' });
    }
  });
};
