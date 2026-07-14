module.exports = function setupHomecareTherapy(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareTherapyLoaded) return;
  app.locals.homecareTherapyLoaded = true;

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
      CREATE TABLE IF NOT EXISTS patient_therapy_items (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        patient_id BIGINT NOT NULL,
        medicine_name TEXT NOT NULL DEFAULT '',
        dose TEXT NOT NULL DEFAULT '',
        schedule_note TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_patient_therapy_active ON patient_therapy_items(tenant_id, patient_id, active, id);
    `);
  }
  setup().catch(e => console.error('[homecare_therapy] setup failed', e));

  async function assertPatient(tenantId, patientId) {
    const r = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
    return !!r.rows.length;
  }

  app.get('/api/care/patients/:id/therapy', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const { rows } = await pool.query(
        'SELECT id, medicine_name, dose, schedule_note, instructions, active, created_at, updated_at FROM patient_therapy_items WHERE tenant_id=$1 AND patient_id=$2 AND active=TRUE ORDER BY id DESC',
        [tenantId, patientId]
      );
      res.json({ items: rows });
    } catch (e) {
      console.error('[homecare_therapy] list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/care/patients/:id/therapy', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      const b = req.body || {};
      const medicineName = clean(b.medicine_name, 180);
      const dose = clean(b.dose, 160);
      const scheduleNote = clean(b.schedule_note, 240);
      const instructions = clean(b.instructions, 2000);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!medicineName) return res.status(400).json({ error: 'Upiši naziv lijeka ili terapijske upute' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const saved = await pool.query(
        'INSERT INTO patient_therapy_items (tenant_id, patient_id, medicine_name, dose, schedule_note, instructions, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, medicine_name, dose, schedule_note, instructions, active, created_at, updated_at',
        [tenantId, patientId, medicineName, dose, scheduleNote, instructions, userIdOf(req)]
      );
      res.json({ ok: true, item: saved.rows[0] });
    } catch (e) {
      console.error('[homecare_therapy] create failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.delete('/api/care/therapy/:itemId', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const itemId = Number(req.params.itemId || 0);
      if (!itemId) return res.status(400).json({ error: 'Missing therapy item id' });
      const r = await pool.query('UPDATE patient_therapy_items SET active=FALSE, updated_at=NOW() WHERE tenant_id=$1 AND id=$2 AND active=TRUE', [tenantId, itemId]);
      if (!r.rowCount) return res.status(404).json({ error: 'Therapy item not found' });
      res.json({ ok: true });
    } catch (e) {
      console.error('[homecare_therapy] delete failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
