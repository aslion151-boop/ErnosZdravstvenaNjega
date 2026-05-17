// backend/plugins/family_touchpoint.cjs
// Family Touchpoint (Visitors read-only resident snapshot)
// -------------------------------------------------------
// MVP goals:
// - Staff can update a "Family Snapshot" for a ROOM quickly (status + paste)
// - Reception creates a time-limited visitor session tied to a ROOM
// - Visitor can only view snapshot if they have a valid session AND tap that ROOM tag
//
// Endpoints (auth staff):
//   GET  /family/rooms                     -> list rooms
//   GET  /family/summary?location_id=123    -> get latest summary for room
//   POST /family/summary                   -> upsert summary for room
//   POST /family/session                   -> create visitor session (token)
//
// Visitor (no staff auth, but requires session token):
//   GET /v/room/:code?s=TOKEN              -> read-only snapshot for that room (if allowed)

const crypto = require('crypto');

module.exports = function setupFamilyTouchpoint(opts = {}) {
  const { app, pool, auth } = opts || {};
  if (!app || !pool) {
    console.warn('[family_touchpoint] Missing app/pool; plugin not initialised');
    return;
  }

  // --- helpers ---
  function nowISO() { return new Date().toISOString(); }
  function rndToken() { return crypto.randomBytes(24).toString('hex'); }

  async function ensureTables() {
    // Idempotent. Keeps MVP self-contained.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS family_room_summaries (
        id            BIGSERIAL PRIMARY KEY,
        tenant_id     INT NOT NULL,
        location_id   BIGINT NOT NULL,
        resident_name TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'STABLE',  -- STABLE|MONITOR|NOT_WELL|VERBAL_UPDATE
        today_update  TEXT NOT NULL DEFAULT '',
        diet          TEXT NOT NULL DEFAULT '',
        alerts        TEXT NOT NULL DEFAULT '',
        care_summary  TEXT NOT NULL DEFAULT '',
        updated_by    BIGINT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_family_room_summaries_tenant_loc
        ON family_room_summaries(tenant_id, location_id);

      CREATE TABLE IF NOT EXISTS visitor_room_sessions (
        id            BIGSERIAL PRIMARY KEY,
        tenant_id     INT NOT NULL,
        token         TEXT NOT NULL UNIQUE,
        visitor_name  TEXT NOT NULL DEFAULT '',
        resident_name TEXT NOT NULL DEFAULT '',
        location_id   BIGINT NOT NULL,
        created_by    BIGINT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at    TIMESTAMPTZ NOT NULL,
        revoked_at    TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_visitor_room_sessions_tenant_loc
        ON visitor_room_sessions(tenant_id, location_id);
      CREATE INDEX IF NOT EXISTS idx_visitor_room_sessions_expires
        ON visitor_room_sessions(expires_at);
    `);
  }

  async function getTenantRooms(tenant_id) {
    // A "room" is a LOCATION with type='ROOM'
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
    // Keep history by insert-only (simple). Latest = max(updated_at)
    await pool.query(
      `INSERT INTO family_room_summaries
       (tenant_id, location_id, resident_name, status, today_update, diet, alerts, care_summary, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())`,
      [
        tenant_id,
        location_id,
        resident_name || '',
        status || 'STABLE',
        today_update || '',
        diet || '',
        alerts || '',
        care_summary || '',
        updated_by || null
      ]
    );
    return getLatestSummary(tenant_id, location_id);
  }

  async function resolveRoomByCode(tenant_id, code) {
    // code comes from qrcodes.code typically
    // qrcodes table: (tenant_id, code, location_id, ...)
    const r = await pool.query(
      `SELECT l.id AS location_id, l.name, l.type
       FROM qrcodes q
       JOIN locations l ON l.id = q.location_id
       WHERE q.tenant_id = $1 AND q.code = $2
       LIMIT 1`,
      [tenant_id, code]
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.type !== 'ROOM') return null;
    return { location_id: row.location_id, room_name: row.name };
  }

  async function validateVisitorSession(tenant_id, token) {
    if (!token) return null;
    const r = await pool.query(
      `SELECT *
       FROM visitor_room_sessions
       WHERE tenant_id = $1 AND token = $2
       LIMIT 1`,
      [tenant_id, token]
    );
    const s = r.rows[0];
    if (!s) return null;
    if (s.revoked_at) return null;
    if (new Date(s.expires_at).getTime() < Date.now()) return null;
    return s;
  }

  // init tables
  ensureTables().catch(e => console.error('[family_touchpoint] ensureTables failed', e));

  // -------------------------
  // Staff routes (auth)
  // -------------------------
  const requireUser = auth?.requireUser || ((req, res, next) => next()); // fallback if your auth injects earlier

  app.get('/family/rooms', requireUser, async (req, res) => {
    try {
      const tenant_id = req.user?.tenant_id || req.tenant_id;
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
      const tenant_id = req.user?.tenant_id || req.tenant_id;
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
      const tenant_id = req.user?.tenant_id || req.tenant_id;
      const user_id = Number(req.user?.id || 0) || null;
      const {
        location_id,
        resident_name,
        status,
        today_update,
        diet,
        alerts,
        care_summary
      } = req.body || {};

      const locId = Number(location_id || 0);
      if (!tenant_id || !locId) return res.status(400).json({ error: 'Missing tenant/location_id' });

      const saved = await upsertSummary({
        tenant_id,
        location_id: locId,
        resident_name,
        status,
        today_update,
        diet,
        alerts,
        care_summary,
        updated_by: user_id
      });

      res.json({ ok: true, summary: saved });
    } catch (e) {
      console.error('[family_touchpoint] POST /family/summary failed', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/family/session', requireUser, async (req, res) => {
    try {
      const tenant_id = req.user?.tenant_id || req.tenant_id;
      const user_id = Number(req.user?.id || 0) || null;
      const { visitor_name, resident_name, location_id, expires_min } = req.body || {};

      const locId = Number(location_id || 0);
      const mins = Math.max(15, Math.min(12 * 60, Number(expires_min || 240))); // 15min..12h, default 4h
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

  // -------------------------
  // Visitor read-only route (requires session token)
  // -------------------------
  app.get('/v/room/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').trim();
      const token = String(req.query.s || '').trim(); // visitor session token
      // tenant detection: your system usually sets tenant by host or by code lookup
      // Here we infer tenant from session token row.
      if (!code || !token) return res.status(400).json({ error: 'Missing code/session' });

      // Find session first (we need tenant_id)
      const sessRow = await pool.query(
        `SELECT tenant_id, token, location_id, visitor_name, resident_name, expires_at, revoked_at
         FROM visitor_room_sessions
         WHERE token = $1
         LIMIT 1`,
        [token]
      );
      const sess = sessRow.rows[0];
      if (!sess) return res.status(401).json({ error: 'Invalid session' });
      const tenant_id = sess.tenant_id;

      const valid = await validateVisitorSession(tenant_id, token);
      if (!valid) return res.status(401).json({ error: 'Session expired/invalid' });

      const room = await resolveRoomByCode(tenant_id, code);
      if (!room) return res.status(404).json({ error: 'Room not found' });

      // Must match session room
      if (Number(valid.location_id) !== Number(room.location_id)) {
        return res.status(403).json({ error: 'Not allowed for this room' });
      }

      const summary = await getLatestSummary(tenant_id, room.location_id);

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
