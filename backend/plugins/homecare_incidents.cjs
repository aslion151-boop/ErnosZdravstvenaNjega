module.exports = function setupHomecareIncidents(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareIncidentsLoaded) return;
  app.locals.homecareIncidentsLoaded = true;

  const requireUser = typeof auth === 'function' ? auth : function (_req, _res, next) { next(); };

  function tenantOf(req) { return Number((req.user && req.user.tenant_id) || req.tenant_id || 1); }
  function userIdOf(req) { return Number((req.user && (req.user.id || req.user.user_id)) || 0) || null; }
  function userNameOf(req) { return String((req.user && (req.user.name || req.user.username || req.user.email)) || '').trim(); }
  function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }
  function statusOf(v) { v = clean(v, 40).toLowerCase(); return v === 'closed' || v === 'resolved' ? 'closed' : 'open'; }
  function severityOf(v) { v = clean(v, 40).toLowerCase(); return ['low','medium','high'].indexOf(v) >= 0 ? v : 'medium'; }

  async function setup() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patient_incidents (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        patient_id BIGINT NOT NULL,
        visit_id BIGINT,
        incident_type TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL DEFAULT 'medium',
        description TEXT NOT NULL DEFAULT '',
        action_taken TEXT NOT NULL DEFAULT '',
        follow_up TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        created_by BIGINT,
        created_by_name TEXT NOT NULL DEFAULT '',
        closed_by BIGINT,
        closed_by_name TEXT NOT NULL DEFAULT '',
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_patient_incidents_patient ON patient_incidents(tenant_id, patient_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_patient_incidents_status ON patient_incidents(tenant_id, status, created_at DESC);
    `);
  }
  setup().catch(e => console.error('[homecare_incidents] setup failed', e));

  app.get('/api/care/incidents', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const status = clean(req.query.status || '', 40).toLowerCase();
      const patientId = Number(req.query.patient_id || 0) || null;
      const params = [tenantId];
      let where = 'i.tenant_id=$1';
      if (status && status !== 'all') { params.push(statusOf(status)); where += ' AND i.status=$' + params.length; }
      if (patientId) { params.push(patientId); where += ' AND i.patient_id=$' + params.length; }
      const { rows } = await pool.query(
        `SELECT i.*, p.first_name, p.last_name, p.address, p.phone, p.scan_code
         FROM patient_incidents i
         JOIN patients p ON p.id=i.patient_id AND p.tenant_id=i.tenant_id
         WHERE ${where}
         ORDER BY CASE i.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.created_at DESC
         LIMIT 200`,
        params
      );
      res.json({ ok: true, items: rows });
    } catch (e) {
      console.error('[homecare_incidents] list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.get('/api/care/patients/:id/incidents', requireUser, async (req, res) => {
    try {
      req.query.patient_id = req.params.id;
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      const { rows } = await pool.query(
        `SELECT * FROM patient_incidents
         WHERE tenant_id=$1 AND patient_id=$2
         ORDER BY status ASC, created_at DESC LIMIT 100`,
        [tenantId, patientId]
      );
      res.json({ ok: true, items: rows });
    } catch (e) {
      console.error('[homecare_incidents] patient list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/care/patients/:id/incidents', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      const b = req.body || {};
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      const incidentType = clean(b.incident_type || b.type, 120);
      const description = clean(b.description, 3000);
      if (!incidentType || !description) return res.status(400).json({ error: 'Vrsta događaja i opis su obavezni' });
      const patient = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
      if (!patient.rows.length) return res.status(404).json({ error: 'Patient not found' });
      const { rows } = await pool.query(
        `INSERT INTO patient_incidents (tenant_id, patient_id, visit_id, incident_type, severity, description, action_taken, follow_up, status, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10)
         RETURNING *`,
        [tenantId, patientId, Number(b.visit_id || 0) || null, incidentType, severityOf(b.severity), description, clean(b.action_taken, 3000), clean(b.follow_up, 2000), userIdOf(req), userNameOf(req)]
      );
      res.json({ ok: true, item: rows[0] });
    } catch (e) {
      console.error('[homecare_incidents] create failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.patch('/api/care/incidents/:id', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const id = Number(req.params.id || 0);
      const b = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const nextStatus = statusOf(b.status);
      const { rows } = await pool.query(
        `UPDATE patient_incidents
         SET status=$1, follow_up=COALESCE(NULLIF($2,''), follow_up),
             closed_by=CASE WHEN $1='closed' THEN $3 ELSE closed_by END,
             closed_by_name=CASE WHEN $1='closed' THEN $4 ELSE closed_by_name END,
             closed_at=CASE WHEN $1='closed' THEN NOW() ELSE closed_at END,
             updated_at=NOW()
         WHERE tenant_id=$5 AND id=$6
         RETURNING *`,
        [nextStatus, clean(b.follow_up, 2000), userIdOf(req), userNameOf(req), tenantId, id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Incident not found' });
      res.json({ ok: true, item: rows[0] });
    } catch (e) {
      console.error('[homecare_incidents] update failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
