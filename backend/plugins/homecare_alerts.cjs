module.exports = function setupHomecareAlerts(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareAlertsLoaded) return;
  app.locals.homecareAlertsLoaded = true;

  const requireUser = typeof auth === 'function' ? auth : function (_req, _res, next) { next(); };

  function tenantOf(req) {
    return Number((req.user && req.user.tenant_id) || req.tenant_id || 1);
  }

  function fullName(r) {
    return String(((r.first_name || '') + ' ' + (r.last_name || '')).trim() || 'Pacijent');
  }

  function withScan(row) {
    const code = row.scan_code || '';
    return Object.assign({}, row, {
      patient_name: fullName(row),
      scan_url: code ? ('#scan?t=' + encodeURIComponent(code)) : '',
      profile_url: row.patient_id ? ('#patient?id=' + encodeURIComponent(row.patient_id)) : ''
    });
  }

  async function ensurePatientCodes(tenantId) {
    try {
      const crypto = require('crypto');
      const missing = await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND active=TRUE AND (scan_code IS NULL OR scan_code=$2) LIMIT 50', [tenantId, '']);
      for (const r of missing.rows) {
        const code = 'p' + Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
        await pool.query('UPDATE patients SET scan_code=$1, updated_at=NOW() WHERE tenant_id=$2 AND id=$3 AND (scan_code IS NULL OR scan_code=$4)', [code, tenantId, r.id, '']);
      }
    } catch (_e) {}
  }

  app.get('/api/care/alerts', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      await ensurePatientCodes(tenantId);

      const overdue = await pool.query(
        `SELECT pv.id, pv.patient_id, pv.planned_for, pv.window_text, pv.visit_type, pv.instructions, pv.status,
                p.first_name, p.last_name, p.address, p.phone, p.scan_code
         FROM planned_visits pv
         JOIN patients p ON p.id=pv.patient_id AND p.tenant_id=pv.tenant_id AND p.active=TRUE
         WHERE pv.tenant_id=$1 AND pv.status='planned' AND pv.planned_for IS NOT NULL AND pv.planned_for < NOW() - INTERVAL '2 hours'
         ORDER BY pv.planned_for ASC
         LIMIT 50`,
        [tenantId]
      ).catch(() => ({ rows: [] }));

      const openLong = await pool.query(
        `SELECT cv.id, cv.patient_id, cv.started_at, cv.started_by_name, cv.start_note,
                p.first_name, p.last_name, p.address, p.phone, p.scan_code
         FROM care_visits cv
         JOIN patients p ON p.id=cv.patient_id AND p.tenant_id=cv.tenant_id AND p.active=TRUE
         WHERE cv.tenant_id=$1 AND cv.finished_at IS NULL AND cv.started_at < NOW() - INTERVAL '4 hours'
         ORDER BY cv.started_at ASC
         LIMIT 50`,
        [tenantId]
      ).catch(() => ({ rows: [] }));

      const incomplete = await pool.query(
        `SELECT cv.id, cv.patient_id, cv.started_at, cv.finished_at, cv.finished_by_name,
                cv.performed_procedures, cv.procedure_note, cv.care_plan_done, cv.therapy_done, cv.finish_note,
                p.first_name, p.last_name, p.address, p.phone, p.scan_code
         FROM care_visits cv
         JOIN patients p ON p.id=cv.patient_id AND p.tenant_id=cv.tenant_id AND p.active=TRUE
         WHERE cv.tenant_id=$1
           AND cv.finished_at >= NOW() - INTERVAL '24 hours'
           AND COALESCE(cv.performed_procedures,'')=''
           AND COALESCE(cv.procedure_note,'')=''
           AND COALESCE(cv.care_plan_done,'')=''
           AND COALESCE(cv.therapy_done,'')=''
           AND COALESCE(cv.finish_note,'')=''
         ORDER BY cv.finished_at DESC
         LIMIT 50`,
        [tenantId]
      ).catch(() => ({ rows: [] }));

      const missingSafety = await pool.query(
        `SELECT id AS patient_id, first_name, last_name, address, phone, scan_code,
                COALESCE(allergies,'') allergies, COALESCE(risks,'') risks, COALESCE(mobility_note,'') mobility_note, COALESCE(access_note,'') access_note
         FROM patients
         WHERE tenant_id=$1 AND active=TRUE
           AND COALESCE(allergies,'')='' AND COALESCE(risks,'')='' AND COALESCE(mobility_note,'')='' AND COALESCE(access_note,'')=''
         ORDER BY last_name ASC, first_name ASC
         LIMIT 50`,
        [tenantId]
      ).catch(() => ({ rows: [] }));

      const alerts = [];
      overdue.rows.map(withScan).forEach(r => alerts.push({
        type: 'overdue_planned_visit',
        severity: 'high',
        title: 'Zakašnjela planirana posjeta',
        message: (r.visit_type || 'Posjeta') + ' je planirana za ' + (r.planned_for || '-') + '.',
        item: r
      }));
      openLong.rows.map(withScan).forEach(r => alerts.push({
        type: 'long_open_visit',
        severity: 'high',
        title: 'Njega je dugo otvorena',
        message: 'Posjeta je započeta prije više od 4 sata i još nije završena.',
        item: r
      }));
      incomplete.rows.map(withScan).forEach(r => alerts.push({
        type: 'incomplete_visit_documentation',
        severity: 'medium',
        title: 'Završena posjeta bez dokumentacije',
        message: 'U zadnja 24 sata postoji završena posjeta bez postupaka, plana, terapije ili napomene.',
        item: r
      }));
      missingSafety.rows.map(withScan).forEach(r => alerts.push({
        type: 'missing_safety_notes',
        severity: 'low',
        title: 'Nedostaju sigurnosne napomene',
        message: 'Pacijent nema upisane alergije, rizike, mobilnost ili kućne upute.',
        item: r
      }));

      res.json({
        ok: true,
        counts: {
          total: alerts.length,
          high: alerts.filter(a => a.severity === 'high').length,
          medium: alerts.filter(a => a.severity === 'medium').length,
          low: alerts.filter(a => a.severity === 'low').length
        },
        alerts
      });
    } catch (e) {
      console.error('[homecare_alerts] failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
