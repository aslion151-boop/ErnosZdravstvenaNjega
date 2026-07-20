module.exports = function setupHomecareTasks(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareTasksLoaded) return;
  app.locals.homecareTasksLoaded = true;

  const requireUser = typeof auth === 'function' ? auth : function (_req, _res, next) { next(); };
  function tenantOf(req) { return Number((req.user && req.user.tenant_id) || req.tenant_id || 1); }
  function userIdOf(req) { return Number((req.user && (req.user.id || req.user.user_id)) || 0) || null; }
  function userNameOf(req) { return String((req.user && (req.user.name || req.user.username || req.user.email)) || '').trim(); }
  function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }

  async function setup() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patient_tasks (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        patient_id BIGINT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'open',
        due_at TIMESTAMPTZ,
        created_by BIGINT,
        created_by_name TEXT NOT NULL DEFAULT '',
        completed_by BIGINT,
        completed_by_name TEXT NOT NULL DEFAULT '',
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_patient_tasks_patient ON patient_tasks(tenant_id, patient_id, status, due_at, id DESC);
      CREATE INDEX IF NOT EXISTS idx_patient_tasks_status ON patient_tasks(tenant_id, status, due_at, id DESC);
    `);
  }
  setup().catch(e => console.error('[homecare_tasks] setup failed', e));

  function normalizePriority(v) {
    const s = clean(v, 30).toLowerCase();
    if (s === 'high' || s === 'visoko') return 'high';
    if (s === 'low' || s === 'nisko') return 'low';
    return 'normal';
  }
  function normalizeStatus(v) {
    const s = clean(v, 30).toLowerCase();
    if (s === 'done' || s === 'completed' || s === 'odrađeno') return 'done';
    if (s === 'cancelled' || s === 'canceled' || s === 'otkazano') return 'cancelled';
    return 'open';
  }
  function isoOrNull(v) {
    const s = clean(v, 40);
    if (!s) return null;
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  }
  async function assertPatient(tenantId, patientId) {
    const r = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
    return !!r.rows.length;
  }

  app.get('/api/care/tasks', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const status = clean(req.query && req.query.status, 30).toLowerCase() || 'open';
      const params = [tenantId];
      let where = 't.tenant_id=$1';
      if (status !== 'all') { params.push(normalizeStatus(status)); where += ' AND t.status=$' + params.length; }
      const { rows } = await pool.query(`
        SELECT t.id, t.patient_id, t.title, t.details, t.priority, t.status, t.due_at, t.created_by_name, t.completed_by_name, t.completed_at, t.created_at, t.updated_at,
               p.first_name, p.last_name, p.address, p.phone, p.scan_code
        FROM patient_tasks t
        LEFT JOIN patients p ON p.id=t.patient_id AND p.tenant_id=t.tenant_id
        WHERE ${where}
        ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, COALESCE(t.due_at, t.created_at) ASC, t.id DESC
        LIMIT 300`, params);
      res.json({ items: rows.map(r => ({ ...r, patient_name: String((r.first_name || '') + ' ' + (r.last_name || '')).trim(), scan_url: r.scan_code ? ('#scan?t=' + encodeURIComponent(r.scan_code)) : '' })) });
    } catch (e) {
      console.error('[homecare_tasks] list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.get('/api/care/patients/:id/tasks', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const status = clean(req.query && req.query.status, 30).toLowerCase() || 'open';
      const params = [tenantId, patientId];
      let where = 'tenant_id=$1 AND patient_id=$2';
      if (status !== 'all') { params.push(normalizeStatus(status)); where += ' AND status=$' + params.length; }
      const { rows } = await pool.query(`SELECT id, patient_id, title, details, priority, status, due_at, created_by_name, completed_by_name, completed_at, created_at, updated_at FROM patient_tasks WHERE ${where} ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, COALESCE(due_at, created_at) ASC, id DESC LIMIT 100`, params);
      res.json({ items: rows });
    } catch (e) {
      console.error('[homecare_tasks] patient list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/care/patients/:id/tasks', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      const b = req.body || {};
      const title = clean(b.title, 220);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!title) return res.status(400).json({ error: 'Upiši zadatak' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const { rows } = await pool.query(
        'INSERT INTO patient_tasks (tenant_id, patient_id, title, details, priority, due_at, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, patient_id, title, details, priority, status, due_at, created_by_name, created_at, updated_at',
        [tenantId, patientId, title, clean(b.details, 1500), normalizePriority(b.priority), isoOrNull(b.due_at), userIdOf(req), userNameOf(req)]
      );
      res.json({ ok: true, item: rows[0] });
    } catch (e) {
      console.error('[homecare_tasks] create failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.patch('/api/care/tasks/:id', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const id = Number(req.params.id || 0);
      const b = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const status = normalizeStatus(b.status);
      const { rows } = await pool.query(
        `UPDATE patient_tasks SET status=$1, completed_by=CASE WHEN $1='done' THEN $2 ELSE completed_by END, completed_by_name=CASE WHEN $1='done' THEN $3 ELSE completed_by_name END, completed_at=CASE WHEN $1='done' THEN NOW() ELSE completed_at END, updated_at=NOW()
         WHERE tenant_id=$4 AND id=$5
         RETURNING id, patient_id, title, details, priority, status, due_at, completed_by_name, completed_at, created_at, updated_at`,
        [status, userIdOf(req), userNameOf(req), tenantId, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Task not found' });
      res.json({ ok: true, item: rows[0] });
    } catch (e) {
      console.error('[homecare_tasks] update failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
