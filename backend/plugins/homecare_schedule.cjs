module.exports = function setupHomecareSchedule(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareScheduleLoaded) return;
  app.locals.homecareScheduleLoaded = true;

  const requireUser = typeof auth === 'function' ? auth : function (_req, _res, next) { next(); };

  function tenantOf(req) {
    return Number((req.user && req.user.tenant_id) || req.tenant_id || 1);
  }

  function userIdOf(req) {
    return Number((req.user && (req.user.id || req.user.user_id)) || 0) || null;
  }

  function clean(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max || 500);
  }

  function isoOrNull(v) {
    const s = clean(v, 40);
    if (!s) return null;
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  }

  async function setup() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planned_visits (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        patient_id BIGINT NOT NULL,
        planned_for TIMESTAMPTZ,
        window_text TEXT NOT NULL DEFAULT '',
        visit_type TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'planned',
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_planned_visits_tenant_time ON planned_visits(tenant_id, planned_for DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_planned_visits_patient ON planned_visits(tenant_id, patient_id, planned_for DESC, id DESC);
    `);
  }
  setup().catch(e => console.error('[homecare_schedule] setup failed', e));

  async function assertPatient(tenantId, patientId) {
    const r = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
    return !!r.rows.length;
  }

  function normalizeStatus(v) {
    const s = clean(v, 30).toLowerCase();
    if (s === 'done' || s === 'completed') return 'done';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    return 'planned';
  }

  async function listRows(req, patientId) {
    const tenantId = tenantOf(req);
    const status = clean(req.query && req.query.status, 30).toLowerCase();
    const params = [tenantId];
    let where = 'pv.tenant_id=$1';
    if (patientId) { params.push(patientId); where += ' AND pv.patient_id=$' + params.length; }
    if (status && status !== 'all') { params.push(status); where += ' AND pv.status=$' + params.length; }
    const sql = `
      SELECT pv.id, pv.patient_id, pv.planned_for, pv.window_text, pv.visit_type, pv.instructions, pv.status, pv.created_at, pv.updated_at,
             p.first_name, p.last_name, p.address, p.phone
      FROM planned_visits pv
      LEFT JOIN patients p ON p.id=pv.patient_id AND p.tenant_id=pv.tenant_id
      WHERE ${where}
      ORDER BY COALESCE(pv.planned_for, pv.created_at) DESC, pv.id DESC
      LIMIT 200`;
    const { rows } = await pool.query(sql, params);
    return rows.map(r => ({ ...r, patient_name: String((r.first_name || '') + ' ' + (r.last_name || '')).trim() }));
  }

  app.get('/api/care/schedule', requireUser, async (req, res) => {
    try {
      const items = await listRows(req, 0);
      res.json({ items });
    } catch (e) {
      console.error('[homecare_schedule] list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.get('/api/care/patients/:id/schedule', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const items = await listRows(req, patientId);
      res.json({ items });
    } catch (e) {
      console.error('[homecare_schedule] patient list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/care/patients/:id/schedule', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      const b = req.body || {};
      const plannedFor = isoOrNull(b.planned_for);
      const windowText = clean(b.window_text, 80);
      const visitType = clean(b.visit_type, 160) || 'Posjeta';
      const instructions = clean(b.instructions, 1500);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!plannedFor && !windowText) return res.status(400).json({ error: 'Upiši datum/vrijeme ili vremenski okvir posjete' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const saved = await pool.query(
        'INSERT INTO planned_visits (tenant_id, patient_id, planned_for, window_text, visit_type, instructions, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, patient_id, planned_for, window_text, visit_type, instructions, status, created_at, updated_at',
        [tenantId, patientId, plannedFor, windowText, visitType, instructions, 'planned', userIdOf(req)]
      );
      res.json({ ok: true, item: saved.rows[0] });
    } catch (e) {
      console.error('[homecare_schedule] create failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.patch('/api/care/schedule/:id', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const id = Number(req.params.id || 0);
      const b = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const status = normalizeStatus(b.status);
      const plannedFor = Object.prototype.hasOwnProperty.call(b, 'planned_for') ? isoOrNull(b.planned_for) : null;
      const windowText = clean(b.window_text, 80);
      const visitType = clean(b.visit_type, 160);
      const instructions = clean(b.instructions, 1500);
      const r = await pool.query(
        `UPDATE planned_visits SET
           status=$1,
           planned_for=COALESCE($2, planned_for),
           window_text=CASE WHEN $3<>'' THEN $3 ELSE window_text END,
           visit_type=CASE WHEN $4<>'' THEN $4 ELSE visit_type END,
           instructions=CASE WHEN $5<>'' THEN $5 ELSE instructions END,
           updated_at=NOW()
         WHERE tenant_id=$6 AND id=$7
         RETURNING id, patient_id, planned_for, window_text, visit_type, instructions, status, created_at, updated_at`,
        [status, plannedFor, windowText, visitType, instructions, tenantId, id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Planned visit not found' });
      res.json({ ok: true, item: r.rows[0] });
    } catch (e) {
      console.error('[homecare_schedule] update failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
