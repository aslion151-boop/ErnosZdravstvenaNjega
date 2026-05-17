// backend/plugins/nursing_alerts.cjs
// Nursing Checks Alerts plugin
//
// - Stores alert frequency per tenant in tenant_config.key = 'nursing_check_interval_min' (legacy)
//   OR tenant_config.data JSONB (v2)
// - Exposes:
//     GET  /nc/config        -> { interval_min }
//     POST /nc/config        -> { ok:true, interval_min }
//     GET  /nc/alerts        -> { now, interval_min, rooms, overdue, due_soon, ok }
//     GET  /nc/trend         -> { from,to,interval_min, summary_days, rows }
//     GET  /nc/trend.csv     -> CSV (HIQA style)
//
// PUSH FLOW:
// - Background poll detects room status transitions (OK/DUE_SOON -> OVERDUE/NEVER)
// - Sends push to topic(s): nc_alerts + nursing_alerts
//
// NOTE:
// - checkins timestamp column is auto-detected (because many DBs do NOT have created_at)

module.exports = function setupNursingAlerts(opts = {}) {
  const { app, pool, auth, push } = opts || {};
  if (!app || !pool) {
    console.warn('[nursing_alerts] Missing app/pool; plugin not initialised');
    return;
  }

  // Allow SPA bridge: if ?token= is present, convert it into Authorization header
  function allowTokenQuery(req, _res, next) {
    try {
      const t = (req.query && req.query.token) ? String(req.query.token).trim() : '';
      if (t && !(req.headers && req.headers.authorization)) {
        req.headers.authorization = 'Bearer ' + t;
      }
    } catch (_) {}
    next();
  }

  // Prefer server-provided auth middleware when available
  const requireUser =
    (auth && typeof auth.requireUser === 'function')
      ? auth.requireUser
      : (typeof auth === 'function')
          ? auth
          : function requireUser(req, res, next) {
              const u = req.user || req.me || req.auth || {};
              if (u && (u.id || u.user_id || u.email || u.tenant_id || u.tenantId)) return next();
              return res.status(401).json({ error: 'Authentication required' });
            };

  const requireAdmin =
    (auth && typeof auth.requireAdmin === 'function')
      ? auth.requireAdmin
      : requireUser;

  const CONFIG_KEY = 'nursing_check_interval_min';
  const DEFAULT_MINUTES = 60; // default = every 1 hour

  function getTenantId(req) {
    const u = req.user || req.me || req.auth || {};
    return (
      u.tenant_id ||
      u.tenantId ||
      (u.tenant && (u.tenant.id || u.tenant.tenant_id)) ||
      null
    );
  }

  // --- tenant_config value column detector (schema-safe across versions) ---
  let TENANT_CFG_VALUE_COL = null;

  async function getTenantCfgValueCol() {
    if (TENANT_CFG_VALUE_COL) return TENANT_CFG_VALUE_COL;

    const candidates = ['data', 'value', 'val', 'config_value', 'setting'];

    const q = await pool.query(
      `
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='tenant_config'
         AND column_name = ANY($1::text[])
       ORDER BY array_position($1::text[], column_name)
       LIMIT 1
      `,
      [candidates]
    );

    TENANT_CFG_VALUE_COL =
      (q.rows[0] && q.rows[0].column_name) ? q.rows[0].column_name : 'data';

    return TENANT_CFG_VALUE_COL;
  }

  // --- tenant_config schema detector: do we have a "key" column? ---
  let TENANT_CFG_HAS_KEY_COL = null;

  async function tenantCfgHasKeyCol() {
    if (TENANT_CFG_HAS_KEY_COL !== null) return TENANT_CFG_HAS_KEY_COL;

    const q = await pool.query(
      `
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='tenant_config'
         AND column_name='key'
       LIMIT 1
      `
    );

    TENANT_CFG_HAS_KEY_COL = !!q.rows.length;
    return TENANT_CFG_HAS_KEY_COL;
  }

  async function loadIntervalMinutes(tenantId, raw) {
    const col = await getTenantCfgValueCol();
    const hasKey = await tenantCfgHasKeyCol();

    // Schema A (legacy): tenant_config has (tenant_id, key, value/val/...)
    if (hasKey) {
      const res = await pool.query(
        `SELECT ${col} AS v
           FROM tenant_config
          WHERE tenant_id = $1
            AND key = $2
          LIMIT 1`,
        [tenantId, CONFIG_KEY]
      );

      if (!res.rows.length) return raw ? null : DEFAULT_MINUTES;

      const value = res.rows[0].v;
      const n = raw ? value : parseInt(String(value), 10);
      if (!Number.isFinite(n) || n <= 0) return DEFAULT_MINUTES;
      return n;
    }

    // Schema B (v2): tenant_config has (tenant_id, data JSONB)
    const res = await pool.query(
      `SELECT ${col} AS v
         FROM tenant_config
        WHERE tenant_id = $1
        LIMIT 1`,
      [tenantId]
    );

    if (!res.rows.length) return raw ? null : DEFAULT_MINUTES;

    const data = res.rows[0].v || {};
    const value = (data && typeof data === 'object') ? data[CONFIG_KEY] : null;

    const n = raw ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_MINUTES;
    return n;
  }

    async function saveIntervalMinutes(tenantId, minutes) {
    // Parse + validate minutes
    let m = parseInt(String(minutes ?? ''), 10);
    if (!Number.isFinite(m) || m <= 0) m = DEFAULT_MINUTES;

    // Clamp between 5 min and 12 hours
    if (m < 5) m = 5;
    if (m > 12 * 60) m = 12 * 60;

    const col    = await getTenantCfgValueCol();
    const hasKey = await tenantCfgHasKeyCol();

    // -------- SCHEMA A: tenant_config(tenant_id, key, <value-col>) --------
    if (hasKey) {
      // 1) Try UPDATE first
      const upd = await pool.query(
        `
        UPDATE tenant_config
           SET ${col} = $3
         WHERE tenant_id = $1::int
           AND key       = $2::text
        `,
        [tenantId, CONFIG_KEY, String(m)]
      );

      // 2) If no row was updated, INSERT a new one
      if (!upd.rowCount) {
        await pool.query(
          `
          INSERT INTO tenant_config (tenant_id, key, ${col})
          VALUES ($1::int, $2::text, $3)
          `,
          [tenantId, CONFIG_KEY, String(m)]
        );
      }

      return m;
    }

    // -------- SCHEMA B: tenant_config(tenant_id, data JSONB-like in ${col}) --------
    const keyText = CONFIG_KEY;

    // 1) Try UPDATE existing row (merge JSON)
    const upd = await pool.query(
      `
      UPDATE tenant_config
         SET ${col} =
           COALESCE(${col}, '{}'::jsonb)
           || jsonb_build_object($2::text, $3::int)::jsonb
       WHERE tenant_id = $1::int
      `,
      [tenantId, keyText, m]
    );

    // 2) If nothing updated, INSERT new row
    if (!upd.rowCount) {
      await pool.query(
        `
        INSERT INTO tenant_config (tenant_id, ${col})
        VALUES ($1::int, jsonb_build_object($2::text, $3::int)::jsonb)
        `,
        [tenantId, keyText, m]
      );
    }

    return m;
  }


  // --- checkins timestamp column detector (fixes your error: created_at missing) ---
  let CHECKINS_TIME_COL = null;

  async function getCheckinsTimeCol() {
  if (CHECKINS_TIME_COL) return CHECKINS_TIME_COL;

  // Get the ACTUAL columns from the DB (no guessing)
  const colsRes = await pool.query(
    `
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='checkins'
     ORDER BY ordinal_position ASC
    `
  );

  const cols = (colsRes.rows || []).map(r => String(r.column_name || '').trim()).filter(Boolean);

  // Preference order (only choose if it truly exists in cols[])
  const pref = [
    'checkin_at',
    'checked_at',
    'created_at',
    'occurred_at',
    'timestamp',
    'ts',
    'time',
    'at'
  ];

  let chosen = null;

  for (const c of pref) {
    if (cols.includes(c)) { chosen = c; break; }
  }

  // Heuristic fallback: pick first column that looks like a timestamp column name
  if (!chosen) {
    chosen =
      cols.find(c => /(_at|time|timestamp|ts)$/i.test(c)) ||
      cols.find(c => /at|time|ts|stamp/i.test(c)) ||
      null;
  }

  // Absolute last resort (prevents crash, but should never happen)
  if (!chosen) chosen = 'checkin_at';

  // Verify chosen column actually works (guards against weird edge cases)
  try {
    await pool.query(`SELECT ${chosen} FROM checkins LIMIT 1`);
  } catch (e) {
    // If it fails, remove it and try the next best
    const remaining = pref.filter(x => x !== chosen).filter(x => cols.includes(x));
    let ok = null;

    for (const c of remaining) {
      try {
        await pool.query(`SELECT ${c} FROM checkins LIMIT 1`);
        ok = c;
        break;
      } catch (_) {}
    }

    if (ok) chosen = ok;
  }

  CHECKINS_TIME_COL = chosen;
  console.log('[nursing_alerts] checkins time column =', CHECKINS_TIME_COL);
  return CHECKINS_TIME_COL;
}


  // ---------------- PUSH SENDER (best-effort, supports multiple server shapes) ----------------
  async function sendPushToTopics(tenantId, topics, payload) {
    const t = Array.isArray(topics) ? topics : [topics];
    try {
      if (push && typeof push.sendToTopics === 'function') {
        await push.sendToTopics(tenantId, t, payload);
        return true;
      }
      if (push && typeof push.sendToTopic === 'function') {
        for (const one of t) await push.sendToTopic(tenantId, one, payload);
        return true;
      }
      if (push && typeof push.notifyTopic === 'function') {
        for (const one of t) await push.notifyTopic(tenantId, one, payload);
        return true;
      }
      if (typeof push === 'function') {
        await push(tenantId, t, payload);
        return true;
      }
    } catch (e) {
      console.warn('[nursing_alerts] push send failed', e?.message || e);
      return false;
    }
    return false;
  }

  // ---------------- ALERT STATUS HELPERS ----------------
  function computeStatus(minutesSince, intervalMin) {
    if (minutesSince == null) return 'NEVER';
    if (!Number.isFinite(minutesSince)) return 'NEVER';

    const dueSoonAt = Math.max(1, Math.floor(intervalMin * 0.8)); // 80%
    if (minutesSince > intervalMin) return 'OVERDUE';
    if (minutesSince >= dueSoonAt) return 'DUE_SOON';
    return 'OK';
  }

  async function getRoomsForTenant(tenantId) {
    const locRes = await pool.query(
      `
      SELECT id, name
        FROM locations
       WHERE tenant_id = $1
         AND (type IS NULL OR UPPER(type) = 'ROOM')
       ORDER BY name ASC
      `,
      [tenantId]
    );
    return locRes.rows || [];
  }

  async function getLastChecks(tenantId, locIds) {
    const timeCol = await getCheckinsTimeCol();

    const checkRes = await pool.query(
      `
      SELECT c.location_id,
             MAX(c.${timeCol}) AS last_at
        FROM checkins c
       WHERE c.tenant_id = $1
         AND c.location_id = ANY($2::int[])
         AND UPPER(COALESCE(c.user_category, '')) = 'NURSING'
       GROUP BY c.location_id
      `,
      [tenantId, locIds]
    );

    const lastMap = new Map();
    for (const row of checkRes.rows || []) {
      lastMap.set(row.location_id, row.last_at);
    }
    return lastMap;
  }

  async function buildAlertsSnapshot(tenantId) {
    const interval_min = await loadIntervalMinutes(tenantId);

    const locations = await getRoomsForTenant(tenantId);
    if (!locations.length) {
      const nowIso = new Date().toISOString();
      return { now: nowIso, interval_min, rooms: [], overdue: [], due_soon: [], ok: [] };
    }

    const locIds = locations.map(l => l.id);
    const lastMap = await getLastChecks(tenantId, locIds);

    const now = new Date();
    const rooms = [];
    const overdue = [];
    const due_soon = [];
    const ok = [];

    for (const loc of locations) {
      const lastAtRaw = lastMap.get(loc.id) || null;
      const lastAt = lastAtRaw ? new Date(lastAtRaw) : null;

      let minutesSince = null;
      if (lastAt) {
        const diffMs = now.getTime() - lastAt.getTime();
        minutesSince = Math.floor(diffMs / 60000);
      }

      const status = computeStatus(minutesSince, interval_min);

      const item = {
        location_id: loc.id,
        location_name: loc.name,
        last_at: lastAt ? lastAt.toISOString() : null,
        minutes_since: minutesSince,
        status,
      };

      rooms.push(item);
      if (status === 'OK') ok.push(item);
      else if (status === 'DUE_SOON') due_soon.push(item);
      else overdue.push(item);
    }

    return {
      now: now.toISOString(),
      interval_min,
      rooms,
      overdue,
      due_soon,
      ok,
    };
  }

  // --- GET /nc/config -------------------------------------------------
  app.get('/nc/config', allowTokenQuery, requireUser, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing tenant_id' });
      const interval_min = await loadIntervalMinutes(tenantId);
      res.json({ interval_min });
    } catch (e) {
      console.error('[nursing_alerts] GET /nc/config failed', e);
      res.status(500).json({ error: 'Failed to load config' });
    }
  });

  // --- POST /nc/config ------------------------------------------------
  app.post('/nc/config', allowTokenQuery, requireAdmin, expressJsonSafe(), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing tenant_id' });

      const body = req.body || {};
      const minutes = body.interval_min ?? body.minutes ?? body.value;

      const interval_min = await saveIntervalMinutes(tenantId, minutes);
      res.json({ ok: true, interval_min });
    } catch (e) {
      console.error('[nursing_alerts] POST /nc/config failed', e);
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  // --- GET /nc/alerts -------------------------------------------------
  app.get('/nc/alerts', allowTokenQuery, requireUser, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing tenant_id' });

      const snapshot = await buildAlertsSnapshot(tenantId);
      res.json(snapshot);
    } catch (e) {
      console.error('[nursing_alerts] GET /nc/alerts failed', e);
      res.status(500).json({ error: 'Failed to load nursing alerts' });
    }
  });

  // --- TREND (JSON) ---------------------------------------------------
  app.get('/nc/trend', allowTokenQuery, requireUser, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).json({ error: 'Missing tenant_id' });

      const interval_min = await loadIntervalMinutes(tenantId);

      const from = String(req.query.from || '').trim(); // YYYY-MM-DD
      const to   = String(req.query.to   || '').trim(); // YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ error: 'from/to must be YYYY-MM-DD' });
      }

      const rooms = await getRoomsForTenant(tenantId);
      const roomIds = rooms.map(r => r.id);
      if (!roomIds.length) return res.json({ from, to, interval_min, summary_days: [], rows: [] });

      const timeCol = await getCheckinsTimeCol();

      const q = await pool.query(
        `
        SELECT
          c.location_id,
          (c.${timeCol} AT TIME ZONE 'UTC') AS ts_utc
        FROM checkins c
        WHERE c.tenant_id = $1
          AND c.location_id = ANY($2::int[])
          AND UPPER(COALESCE(c.user_category,'')) = 'NURSING'
          AND c.${timeCol} >= ($3::date)
          AND c.${timeCol} <  (($4::date) + INTERVAL '1 day')
        ORDER BY c.location_id ASC, ts_utc ASC
        `,
        [tenantId, roomIds, from, to]
      );

      const dayStart = new Date(from + 'T00:00:00Z');
      const dayEnd   = new Date(to   + 'T00:00:00Z');

      const days = [];
      for (let d = new Date(dayStart); d <= dayEnd; d = new Date(d.getTime() + 86400000)) {
        days.push(d.toISOString().slice(0, 10));
      }

      const byRoomDay = new Map(); // `${locId}|${date}` -> [Date...]
      for (const row of (q.rows || [])) {
        const locId = row.location_id;
        const ts = new Date(row.ts_utc);
        const date = ts.toISOString().slice(0, 10);
        const k = `${locId}|${date}`;
        if (!byRoomDay.has(k)) byRoomDay.set(k, []);
        byRoomDay.get(k).push(ts);
      }

      function maxGapMinForDay(timestamps, dateStr) {
        const start = new Date(dateStr + 'T00:00:00Z');
        const end   = new Date(dateStr + 'T23:59:59Z');

        if (!timestamps || !timestamps.length) return 24 * 60;

        let maxMs = 0;
        maxMs = Math.max(maxMs, timestamps[0].getTime() - start.getTime());
        for (let i = 1; i < timestamps.length; i++) {
          maxMs = Math.max(maxMs, timestamps[i].getTime() - timestamps[i - 1].getTime());
        }
        maxMs = Math.max(maxMs, end.getTime() - timestamps[timestamps.length - 1].getTime());
        return Math.max(0, Math.ceil(maxMs / 60000));
      }

      const roomName = new Map();
      for (const r of rooms) roomName.set(r.id, r.name || String(r.id));

      const rows = [];
      const summary_days = [];

      for (const dateStr of days) {
        let rooms_ok = 0;
        let rooms_total = rooms.length;

        for (const r of rooms) {
          const k = `${r.id}|${dateStr}`;
          const tsList = byRoomDay.get(k) || [];
          const checks_count = tsList.length;
          const max_gap_min = maxGapMinForDay(tsList, dateStr);
          const compliant = (max_gap_min <= interval_min) && (checks_count > 0);

          if (compliant) rooms_ok++;

          rows.push({
            date: dateStr,
            room: roomName.get(r.id),
            location_id: r.id,
            checks_count,
            max_gap_min,
            compliant: compliant ? 'YES' : 'NO'
          });
        }

        const compliance_pct = rooms_total ? Math.round((rooms_ok / rooms_total) * 1000) / 10 : 0;
        summary_days.push({ date: dateStr, rooms_ok, rooms_total, compliance_pct });
      }

      res.json({ from, to, interval_min, summary_days, rows });
    } catch (e) {
      console.error('[nursing_alerts] GET /nc/trend failed', e);
      res.status(500).json({ error: 'Failed to load trend' });
    }
  });

  // --- TREND (CSV) ----------------------------------------------------
  app.get('/nc/trend.csv', allowTokenQuery, requireUser, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(400).send('Missing tenant_id');

      const from = String(req.query.from || '').trim();
      const to   = String(req.query.to   || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        res.status(400).send('from/to must be YYYY-MM-DD');
        return;
      }

      // build JSON and then output CSV
      const interval_min = await loadIntervalMinutes(tenantId);

      // reuse trend logic by calling our own query builder again (same as /nc/trend)
      const rooms = await getRoomsForTenant(tenantId);
      const roomIds = rooms.map(r => r.id);
      if (!roomIds.length) {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.send(`From,${from}\nTo,${to}\nInterval (min),${interval_min}\n\nNo rooms\n`);
        return;
      }

      const timeCol = await getCheckinsTimeCol();

      const q = await pool.query(
        `
        SELECT
          c.location_id,
          (c.${timeCol} AT TIME ZONE 'UTC') AS ts_utc
        FROM checkins c
        WHERE c.tenant_id = $1
          AND c.location_id = ANY($2::int[])
          AND UPPER(COALESCE(c.user_category,'')) = 'NURSING'
          AND c.${timeCol} >= ($3::date)
          AND c.${timeCol} <  (($4::date) + INTERVAL '1 day')
        ORDER BY c.location_id ASC, ts_utc ASC
        `,
        [tenantId, roomIds, from, to]
      );

      const dayStart = new Date(from + 'T00:00:00Z');
      const dayEnd   = new Date(to   + 'T00:00:00Z');

      const days = [];
      for (let d = new Date(dayStart); d <= dayEnd; d = new Date(d.getTime() + 86400000)) {
        days.push(d.toISOString().slice(0, 10));
      }

      const byRoomDay = new Map();
      for (const row of (q.rows || [])) {
        const locId = row.location_id;
        const ts = new Date(row.ts_utc);
        const date = ts.toISOString().slice(0, 10);
        const k = `${locId}|${date}`;
        if (!byRoomDay.has(k)) byRoomDay.set(k, []);
        byRoomDay.get(k).push(ts);
      }

      function maxGapMinForDay(timestamps, dateStr) {
        const start = new Date(dateStr + 'T00:00:00Z');
        const end   = new Date(dateStr + 'T23:59:59Z');
        if (!timestamps || !timestamps.length) return 24 * 60;

        let maxMs = 0;
        maxMs = Math.max(maxMs, timestamps[0].getTime() - start.getTime());
        for (let i = 1; i < timestamps.length; i++) {
          maxMs = Math.max(maxMs, timestamps[i].getTime() - timestamps[i - 1].getTime());
        }
        maxMs = Math.max(maxMs, end.getTime() - timestamps[timestamps.length - 1].getTime());
        return Math.max(0, Math.ceil(maxMs / 60000));
      }

      const roomName = new Map();
      for (const r of rooms) roomName.set(r.id, r.name || String(r.id));

      const summary_days = [];
      const rows = [];

      for (const dateStr of days) {
        let rooms_ok = 0;
        let rooms_total = rooms.length;

        for (const r of rooms) {
          const k = `${r.id}|${dateStr}`;
          const tsList = byRoomDay.get(k) || [];
          const checks_count = tsList.length;
          const max_gap_min = maxGapMinForDay(tsList, dateStr);
          const compliant = (max_gap_min <= interval_min) && (checks_count > 0);

          if (compliant) rooms_ok++;

          rows.push({
            date: dateStr,
            room: roomName.get(r.id),
            checks_count,
            max_gap_min,
            compliant: compliant ? 'YES' : 'NO'
          });
        }

        const compliance_pct = rooms_total ? Math.round((rooms_ok / rooms_total) * 1000) / 10 : 0;
        summary_days.push({ date: dateStr, rooms_ok, rooms_total, compliance_pct });
      }

      const lines = [];
      lines.push(`From,${from}`);
      lines.push(`To,${to}`);
      lines.push(`Interval (min),${interval_min}`);
      lines.push('');
      lines.push('Daily Summary');
      lines.push('date,rooms_ok,rooms_total,compliance_pct');
      for (const d of summary_days) {
        lines.push(`${d.date},${d.rooms_ok},${d.rooms_total},${d.compliance_pct}`);
      }
      lines.push('');
      lines.push('Room Detail');
      lines.push('date,room,checks_count,max_gap_min,compliant');
      for (const r of rows) {
        const room = String(r.room || '').includes(',') ? `"${String(r.room).replace(/"/g, '""')}"` : String(r.room || '');
        lines.push(`${r.date},${room},${r.checks_count},${r.max_gap_min},${r.compliant}`);
      }

      const csv = lines.join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="nursing_checks_trend_${from}_to_${to}.csv"`);
      res.send(csv);
    } catch (e) {
      console.error('[nursing_alerts] GET /nc/trend.csv failed', e);
      res.status(500).send('Failed to build CSV');
    }
  });

  // ---------------- BACKGROUND PUSH DETECTOR ----------------
  const lastStatus = new Map(); // key `${tenantId}:${locationId}` -> status
  let pushTimer = null;

  async function pollAndPush() {
    try {
      const tenantsRes = await pool.query(`SELECT DISTINCT tenant_id FROM locations ORDER BY tenant_id ASC`);
      const tenants = (tenantsRes.rows || []).map(r => r.tenant_id).filter(Boolean);

      for (const tenantId of tenants) {
        const snap = await buildAlertsSnapshot(tenantId);

        for (const room of (snap.rooms || [])) {
          const key = `${tenantId}:${room.location_id}`;
          const prev = lastStatus.get(key) || null;
          const cur = room.status || 'NEVER';
          lastStatus.set(key, cur);

          const becameBad =
            (cur === 'OVERDUE' || cur === 'NEVER') &&
            (prev === 'OK' || prev === 'DUE_SOON' || prev == null);

          if (!becameBad) continue;

          const mins = (room.minutes_since == null) ? '' : ` (${room.minutes_since} min)`;
          const title = (cur === 'NEVER') ? 'Nursing check missing' : 'Nursing check overdue';
          const body = `${room.location_name || 'Room'} is ${cur}${mins}.`;

          await sendPushToTopics(tenantId, ['nc_alerts', 'nursing_alerts'], {
            title,
            body,
            url: '#ncalerts'
          });
        }
      }
    } catch (e) {
      console.warn('[nursing_alerts] pollAndPush failed', e?.message || e);
    }
  }

  if (!pushTimer) {
    pushTimer = setInterval(pollAndPush, 60 * 1000); // every 60s
    setTimeout(() => pollAndPush().catch(()=>{}), 2000);
  }

  console.log('[nursing_alerts] plugin initialised');
};

function expressJsonSafe() {
  const express = require('express');
  return express.json ? express.json() : (req, _res, next) => next();
}
