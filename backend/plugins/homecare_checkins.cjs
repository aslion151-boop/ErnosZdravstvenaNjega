module.exports = function setupHomecareCheckins(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareCheckinsLoaded) return;
  app.locals.homecareCheckinsLoaded = true;

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

  function makeCode() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  function buildFamilyMessage(patient, b) {
    const parts = [];
    const name = String(((patient && patient.first_name) || '') + ' ' + ((patient && patient.last_name) || '')).trim() || 'pacijenta';
    parts.push('Njega za ' + name + ' je završena.');
    if (b.care_plan_done) parts.push('Odrađeno iz plana njege: ' + clean(b.care_plan_done, 800) + '.');
    if (b.procedures) parts.push('Postupci: ' + clean(b.procedures, 800) + '.');
    if (b.bp || b.pulse || b.temperature || b.spo2 || b.pain_score) {
      const clinical = [];
      if (b.bp) clinical.push('TA ' + clean(b.bp, 40));
      if (b.pulse) clinical.push('P ' + clean(b.pulse, 40));
      if (b.temperature) clinical.push('T ' + clean(b.temperature, 40));
      if (b.spo2) clinical.push('SpO2 ' + clean(b.spo2, 40));
      if (b.pain_score) clinical.push('bol ' + clean(b.pain_score, 40) + '/10');
      parts.push('Klinički podaci: ' + clinical.join(', ') + '.');
    }
    if (b.wound_note) parts.push('Rana: ' + clean(b.wound_note, 500) + '.');
    if (b.note) parts.push('Napomena: ' + clean(b.note, 500) + '.');
    return parts.join(' ');
  }

  async function setup() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
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
      ALTER TABLE patients ADD COLUMN IF NOT EXISTS scan_code TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_patients_scan_code ON patients(scan_code) WHERE scan_code IS NOT NULL;
      CREATE TABLE IF NOT EXISTS care_visits (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        patient_id BIGINT NOT NULL,
        started_by BIGINT,
        started_by_name TEXT NOT NULL DEFAULT '',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_by BIGINT,
        finished_by_name TEXT NOT NULL DEFAULT '',
        finished_at TIMESTAMPTZ,
        start_note TEXT NOT NULL DEFAULT '',
        finish_note TEXT NOT NULL DEFAULT '',
        performed_procedures TEXT NOT NULL DEFAULT '',
        procedure_note TEXT NOT NULL DEFAULT '',
        care_plan_done TEXT NOT NULL DEFAULT '',
        bp TEXT NOT NULL DEFAULT '',
        pulse TEXT NOT NULL DEFAULT '',
        temperature TEXT NOT NULL DEFAULT '',
        spo2 TEXT NOT NULL DEFAULT '',
        pain_score TEXT NOT NULL DEFAULT '',
        wound_note TEXT NOT NULL DEFAULT '',
        family_notification_requested BOOLEAN NOT NULL DEFAULT FALSE,
        family_notification_status TEXT NOT NULL DEFAULT '',
        family_notification_to TEXT NOT NULL DEFAULT '',
        family_notification_message TEXT NOT NULL DEFAULT '',
        family_notification_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS performed_procedures TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS procedure_note TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS care_plan_done TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS bp TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS pulse TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS temperature TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS spo2 TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS pain_score TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS wound_note TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS family_notification_requested BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS family_notification_status TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS family_notification_to TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS family_notification_message TEXT NOT NULL DEFAULT '';
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS family_notification_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_care_visits_patient ON care_visits(patient_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_care_visits_open ON care_visits(patient_id) WHERE finished_at IS NULL;
    `);
  }
  setup().catch(e => console.error('[homecare_checkins] setup failed', e));

  async function getOrCreateCode(tenantId, patientId) {
    const found = await pool.query('SELECT scan_code FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
    if (!found.rows.length) return null;
    if (found.rows[0].scan_code) return found.rows[0].scan_code;
    const code = makeCode();
    const saved = await pool.query('UPDATE patients SET scan_code=$1, updated_at=NOW() WHERE tenant_id=$2 AND id=$3 AND active=TRUE RETURNING scan_code', [code, tenantId, patientId]);
    return saved.rows[0] && saved.rows[0].scan_code;
  }

  app.get('/api/care/patients/:id/code', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      const code = await getOrCreateCode(tenantId, patientId);
      if (!code) return res.status(404).json({ error: 'Patient not found' });
      res.json({ ok: true, code: code, url: '/#scan?t=' + encodeURIComponent(code) });
    } catch (e) {
      console.error('[homecare_checkins] code failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.get('/api/care/patients/:id/visits', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const patientId = Number(req.params.id || 0);
      if (!patientId) return res.status(400).json({ error: 'Missing patient id' });
      const patient = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE LIMIT 1', [tenantId, patientId]);
      if (!patient.rows.length) return res.status(404).json({ error: 'Patient not found' });
      const rows = await pool.query(
        'SELECT id, started_by_name, started_at, finished_by_name, finished_at, start_note, finish_note, performed_procedures, procedure_note, care_plan_done, bp, pulse, temperature, spo2, pain_score, wound_note, family_notification_requested, family_notification_status, family_notification_to, family_notification_message, family_notification_at FROM care_visits WHERE tenant_id=$1 AND patient_id=$2 ORDER BY started_at DESC LIMIT 50',
        [tenantId, patientId]
      );
      res.json({ items: rows.rows });
    } catch (e) {
      console.error('[homecare_checkins] visits failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.get('/api/care/scan/:code', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const code = clean(req.params.code, 120);
      const p = await pool.query('SELECT id, first_name, last_name, date_of_birth, address, phone, family_contact_name, family_contact_phone, notes FROM patients WHERE tenant_id=$1 AND scan_code=$2 AND active=TRUE LIMIT 1', [tenantId, code]);
      if (!p.rows.length) return res.status(404).json({ error: 'Patient not found' });
      const open = await pool.query('SELECT id, started_by_name, started_at, start_note FROM care_visits WHERE tenant_id=$1 AND patient_id=$2 AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1', [tenantId, p.rows[0].id]);
      res.json({ patient: p.rows[0], open_visit: open.rows[0] || null });
    } catch (e) {
      console.error('[homecare_checkins] scan failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.post('/api/care/scan/:code/toggle', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const code = clean(req.params.code, 120);
      const p = await pool.query('SELECT id, first_name, last_name, family_contact_name, family_contact_phone FROM patients WHERE tenant_id=$1 AND scan_code=$2 AND active=TRUE LIMIT 1', [tenantId, code]);
      if (!p.rows.length) return res.status(404).json({ error: 'Patient not found' });
      const patient = p.rows[0];
      const patientId = patient.id;
      const open = await pool.query('SELECT id FROM care_visits WHERE tenant_id=$1 AND patient_id=$2 AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1', [tenantId, patientId]);
      if (open.rows.length) {
        const b = req.body || {};
        const notifyFamily = !!b.notify_family;
        const familyTo = notifyFamily ? clean(((patient.family_contact_name || '') + ' ' + (patient.family_contact_phone || '')).trim(), 300) : '';
        const familyMessage = notifyFamily ? buildFamilyMessage(patient, b) : '';
        const familyStatus = notifyFamily ? 'prepared' : '';
        const done = await pool.query(
          'UPDATE care_visits SET finished_by=$1, finished_by_name=$2, finish_note=$3, performed_procedures=$4, procedure_note=$5, care_plan_done=$6, bp=$7, pulse=$8, temperature=$9, spo2=$10, pain_score=$11, wound_note=$12, family_notification_requested=$13, family_notification_status=$14, family_notification_to=$15, family_notification_message=$16, family_notification_at=CASE WHEN $13 THEN NOW() ELSE family_notification_at END, finished_at=NOW() WHERE tenant_id=$17 AND id=$18 RETURNING id, started_at, finished_at, performed_procedures, procedure_note, care_plan_done, bp, pulse, temperature, spo2, pain_score, wound_note, family_notification_requested, family_notification_status, family_notification_to, family_notification_message, family_notification_at',
          [userIdOf(req), userNameOf(req), clean(b.note, 1000), clean(b.procedures, 1500), clean(b.procedure_note, 2000), clean(b.care_plan_done, 2000), clean(b.bp, 40), clean(b.pulse, 40), clean(b.temperature, 40), clean(b.spo2, 40), clean(b.pain_score, 40), clean(b.wound_note, 1000), notifyFamily, familyStatus, familyTo, clean(familyMessage, 2500), tenantId, open.rows[0].id]
        );
        return res.json({ ok: true, action: 'OUT', visit: done.rows[0] });
      }
      const started = await pool.query('INSERT INTO care_visits (tenant_id, patient_id, started_by, started_by_name, start_note) VALUES ($1,$2,$3,$4,$5) RETURNING id, started_at', [tenantId, patientId, userIdOf(req), userNameOf(req), clean(req.body && req.body.note, 1000)]);
      res.json({ ok: true, action: 'IN', visit: started.rows[0] });
    } catch (e) {
      console.error('[homecare_checkins] toggle failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
