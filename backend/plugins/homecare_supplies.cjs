module.exports = function setupHomecareSupplies(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareSuppliesLoaded) return;
  app.locals.homecareSuppliesLoaded = true;

  const requireUser = typeof auth === 'function' ? auth : function (_req, _res, next) { next(); };

  function tenantOf(req) { return Number((req.user && req.user.tenant_id) || req.tenant_id || 1); }
  function userIdOf(req) { return Number((req.user && (req.user.id || req.user.user_id)) || 0) || null; }
  function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }
  function statusOf(v) {
    v = clean(v, 40).toLowerCase();
    if (v === 'low' || v === 'nisko') return 'low';
    if (v === 'order' || v === 'naruciti' || v === 'naručiti') return 'order';
    return 'ok';
  }

  async function setup() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patient_supplies (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        patient_id BIGINT NOT NULL,
        item_name TEXT NOT NULL DEFAULT '',
        quantity_text TEXT NOT NULL DEFAULT '',
        location_note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ok',
        note TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_patient_supplies_patient ON patient_supplies(tenant_id, patient_id, active, id DESC);
      CREATE INDEX IF NOT EXISTS idx_patient_supplies_status ON patient_supplies(tenant_id, status, active, id DESC);
    `);
  }
  setup().catch(e => console.error('[homecare_supplies] setup failed', e));

  app.get('/api/care/patients/:id/supplies', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      const p = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
      if (!p.rows.length) return res.status(404).json({ error: 'Patient not found' });
      const r = await pool.query(
        `SELECT id, patient_id, item_name, quantity_text, location_note, status, note, created_at, updated_at
         FROM patient_supplies
         WHERE tenant_id=$1 AND patient_id=$2 AND active=TRUE
         ORDER BY CASE status WHEN 'order' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, id DESC`,
        [tenantId, patientId]
      );
      res.json({ items: r.rows });
    } catch (e) {
      console.error('[homecare_supplies] patient list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.get('/api/care/supplies', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const status = clean(req.query.status || '', 40).toLowerCase();
      const args = [tenantId];
      let where = 's.tenant_id=$1 AND s.active=TRUE';
      if (status === 'low' || status === 'order' || status === 'ok') { args.push(status); where += ' AND s.status=$2'; }
      if (status === 'needed') where += " AND s.status IN ('low','order')";
      const r = await pool.query(
        `SELECT s.id, s.patient_id, p.first_name, p.last_name, p.address,
                s.item_name, s.quantity_text, s.location_note, s.status, s.note, s.created_at, s.updated_at
         FROM patient_supplies s
         JOIN patients p ON p.tenant_id=s.tenant_id AND p.id=s.patient_id
         WHERE ${where}
         ORDER BY CASE s.status WHEN 'order' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, p.last_name, p.first_name, s.id DESC
         LIMIT 300`,
        args
      );
      res.json({ items: r.rows });
    } catch (e) {
      console.error('[homecare_supplies] global list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/care/patients/:id/supplies', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      const b = req.body || {};
      const item = clean(b.item_name || b.name, 180);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!item) return res.status(400).json({ error: 'Naziv materijala je obavezan' });
      const p = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
      if (!p.rows.length) return res.status(404).json({ error: 'Patient not found' });
      const r = await pool.query(
        `INSERT INTO patient_supplies (tenant_id, patient_id, item_name, quantity_text, location_note, status, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, patient_id, item_name, quantity_text, location_note, status, note, created_at, updated_at`,
        [tenantId, patientId, item, clean(b.quantity_text || b.quantity, 120), clean(b.location_note, 300), statusOf(b.status), clean(b.note, 1000), userIdOf(req)]
      );
      res.json({ ok: true, item: r.rows[0] });
    } catch (e) {
      console.error('[homecare_supplies] create failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.patch('/api/care/supplies/:id', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const id = Number(req.params.id || 0);
      const b = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const r = await pool.query(
        `UPDATE patient_supplies
         SET item_name=COALESCE(NULLIF($1,''), item_name), quantity_text=$2, location_note=$3, status=$4, note=$5, updated_at=NOW()
         WHERE tenant_id=$6 AND id=$7 AND active=TRUE
         RETURNING id, patient_id, item_name, quantity_text, location_note, status, note, created_at, updated_at`,
        [clean(b.item_name || b.name, 180), clean(b.quantity_text || b.quantity, 120), clean(b.location_note, 300), statusOf(b.status), clean(b.note, 1000), tenantId, id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Supply item not found' });
      res.json({ ok: true, item: r.rows[0] });
    } catch (e) {
      console.error('[homecare_supplies] update failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.delete('/api/care/supplies/:id', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const r = await pool.query('UPDATE patient_supplies SET active=FALSE, updated_at=NOW() WHERE tenant_id=$1 AND id=$2 AND active=TRUE', [tenantId, id]);
      if (!r.rowCount) return res.status(404).json({ error: 'Supply item not found' });
      res.json({ ok: true });
    } catch (e) {
      console.error('[homecare_supplies] delete failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
