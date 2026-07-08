module.exports = function setupHomecareCarePlan(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareCarePlanLoaded) return;
  app.locals.homecareCarePlanLoaded = true;

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

  async function setup() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS care_plan_items (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        patient_id BIGINT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_care_plan_patient_active ON care_plan_items(tenant_id, patient_id, active, id);
    `);
  }
  setup().catch(e => console.error('[homecare_careplan] setup failed', e));

  async function assertPatient(tenantId, patientId) {
    const r = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
    return !!r.rows.length;
  }

  app.get('/api/care/patients/:id/plan', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const { rows } = await pool.query(
        'SELECT id, title, description, active, created_at, updated_at FROM care_plan_items WHERE tenant_id=$1 AND patient_id=$2 AND active=TRUE ORDER BY id DESC',
        [tenantId, patientId]
      );
      res.json({ items: rows });
    } catch (e) {
      console.error('[homecare_careplan] list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/care/patients/:id/plan', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      const b = req.body || {};
      const title = clean(b.title, 160);
      const description = clean(b.description, 2000);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!title && !description) return res.status(400).json({ error: 'Upiši stavku plana njege' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const saved = await pool.query(
        'INSERT INTO care_plan_items (tenant_id, patient_id, title, description, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, title, description, active, created_at, updated_at',
        [tenantId, patientId, title || 'Stavka plana njege', description, userIdOf(req)]
      );
      res.json({ ok: true, item: saved.rows[0] });
    } catch (e) {
      console.error('[homecare_careplan] create failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.delete('/api/care/plan/:itemId', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const itemId = Number(req.params.itemId || 0);
      if (!itemId) return res.status(400).json({ error: 'Missing plan item id' });
      const r = await pool.query('UPDATE care_plan_items SET active=FALSE, updated_at=NOW() WHERE tenant_id=$1 AND id=$2 AND active=TRUE', [tenantId, itemId]);
      if (!r.rowCount) return res.status(404).json({ error: 'Plan item not found' });
      res.json({ ok: true });
    } catch (e) {
      console.error('[homecare_careplan] delete failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
