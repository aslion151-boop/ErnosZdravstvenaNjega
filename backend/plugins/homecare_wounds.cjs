module.exports = function setupHomecareWounds(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareWoundsLoaded) return;
  app.locals.homecareWoundsLoaded = true;

  const requireUser = typeof auth === 'function' ? auth : function (_req, _res, next) { next(); };

  function tenantOf(req) {
    return Number((req.user && req.user.tenant_id) || req.tenant_id || 1);
  }

  function userIdOf(req) {
    return Number((req.user && (req.user.id || req.user.user_id)) || 0) || null;
  }

  function userNameOf(req) {
    return String((req.user && (req.user.name || req.user.username || req.user.email)) || '').trim();
  }

  function clean(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max || 500);
  }

  async function setup() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wound_records (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        patient_id BIGINT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        wound_type TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS wound_observations (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        wound_id BIGINT NOT NULL,
        patient_id BIGINT NOT NULL,
        observed_by BIGINT,
        observed_by_name TEXT NOT NULL DEFAULT '',
        observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        size_text TEXT NOT NULL DEFAULT '',
        exudate TEXT NOT NULL DEFAULT '',
        surrounding_skin TEXT NOT NULL DEFAULT '',
        pain_score TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_wound_records_patient ON wound_records(tenant_id, patient_id, active, id DESC);
      CREATE INDEX IF NOT EXISTS idx_wound_observations_wound ON wound_observations(tenant_id, wound_id, observed_at DESC);
    `);
  }
  setup().catch(e => console.error('[homecare_wounds] setup failed', e));

  async function assertPatient(tenantId, patientId) {
    const r = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
    return !!r.rows.length;
  }

  app.get('/api/care/patients/:id/wounds', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const wounds = await pool.query(
        'SELECT id, title, location, wound_type, active, created_at, updated_at FROM wound_records WHERE tenant_id=$1 AND patient_id=$2 AND active=TRUE ORDER BY id DESC',
        [tenantId, patientId]
      );
      const ids = wounds.rows.map(w => w.id);
      let observations = [];
      if (ids.length) {
        const obs = await pool.query(
          'SELECT id, wound_id, observed_by_name, observed_at, size_text, exudate, surrounding_skin, pain_score, note FROM wound_observations WHERE tenant_id=$1 AND wound_id = ANY($2::bigint[]) ORDER BY observed_at DESC LIMIT 100',
          [tenantId, ids]
        );
        observations = obs.rows;
      }
      res.json({ items: wounds.rows, observations });
    } catch (e) {
      console.error('[homecare_wounds] list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/care/patients/:id/wounds', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      const b = req.body || {};
      const title = clean(b.title, 160) || 'Rana';
      const location = clean(b.location, 160);
      const woundType = clean(b.wound_type, 160);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      if (!location && !woundType && !title) return res.status(400).json({ error: 'Upiši podatke o rani' });
      if (!(await assertPatient(tenantId, patientId))) return res.status(404).json({ error: 'Patient not found' });
      const saved = await pool.query(
        'INSERT INTO wound_records (tenant_id, patient_id, title, location, wound_type, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, title, location, wound_type, active, created_at, updated_at',
        [tenantId, patientId, title, location, woundType, userIdOf(req)]
      );
      res.json({ ok: true, item: saved.rows[0] });
    } catch (e) {
      console.error('[homecare_wounds] create failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/care/wounds/:id/observations', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const woundId = Number(req.params.id || 0);
      const b = req.body || {};
      if (!woundId) return res.status(400).json({ error: 'Missing wound id' });
      const found = await pool.query('SELECT id, patient_id FROM wound_records WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, woundId]);
      if (!found.rows.length) return res.status(404).json({ error: 'Wound not found' });
      const patientId = found.rows[0].patient_id;
      const saved = await pool.query(
        `INSERT INTO wound_observations (tenant_id, wound_id, patient_id, observed_by, observed_by_name, size_text, exudate, surrounding_skin, pain_score, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, wound_id, observed_by_name, observed_at, size_text, exudate, surrounding_skin, pain_score, note`,
        [tenantId, woundId, patientId, userIdOf(req), userNameOf(req), clean(b.size_text, 120), clean(b.exudate, 300), clean(b.surrounding_skin, 300), clean(b.pain_score, 40), clean(b.note, 1500)]
      );
      res.json({ ok: true, item: saved.rows[0] });
    } catch (e) {
      console.error('[homecare_wounds] observation failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.delete('/api/care/wounds/:id', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const woundId = Number(req.params.id || 0);
      if (!woundId) return res.status(400).json({ error: 'Missing wound id' });
      const r = await pool.query('UPDATE wound_records SET active=FALSE, updated_at=NOW() WHERE tenant_id=$1 AND id=$2 AND active=TRUE', [tenantId, woundId]);
      if (!r.rowCount) return res.status(404).json({ error: 'Wound not found' });
      res.json({ ok: true });
    } catch (e) {
      console.error('[homecare_wounds] close failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
