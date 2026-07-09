module.exports = function setupHomecareReports(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareReportsLoaded) return;
  app.locals.homecareReportsLoaded = true;

  const requireUser = typeof auth === 'function' ? auth : function (_req, _res, next) { next(); };

  function tenantOf(req) {
    return Number((req.user && req.user.tenant_id) || req.tenant_id || 1);
  }

  function clean(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max || 500);
  }

  function csv(v) {
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  }

  function durationMinutes(started, finished) {
    if (!started || !finished) return '';
    const a = new Date(started).getTime();
    const b = new Date(finished).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '';
    return String(Math.round((b - a) / 60000));
  }

  async function visitRows(req, limit) {
    const tenantId = tenantOf(req);
    const q = clean(req.query && req.query.q, 160);
    const patientId = Number((req.query && req.query.patient_id) || 0);
    const onlyOpen = String((req.query && req.query.open) || '') === '1';
    const params = [tenantId];
    let where = 'v.tenant_id=$1';
    if (patientId) { params.push(patientId); where += ' AND v.patient_id=$' + params.length; }
    if (onlyOpen) where += ' AND v.finished_at IS NULL';
    if (q) {
      params.push('%' + q.toLowerCase() + '%');
      where += ' AND (LOWER(p.first_name) LIKE $' + params.length + ' OR LOWER(p.last_name) LIKE $' + params.length + ' OR LOWER(p.address) LIKE $' + params.length + ')';
    }
    params.push(Math.max(1, Math.min(Number(limit || 100), 500)));
    const sql = `
      SELECT
        v.id, v.patient_id,
        p.first_name, p.last_name, p.address, p.phone, p.family_contact_name, p.family_contact_phone,
        v.started_at, v.finished_at, v.started_by_name, v.finished_by_name,
        v.performed_procedures, v.procedure_note, v.care_plan_done,
        v.bp, v.pulse, v.temperature, v.spo2, v.pain_score, v.wound_note,
        v.finish_note, v.start_note,
        v.family_notification_requested, v.family_notification_status, v.family_notification_to, v.family_notification_message, v.family_notification_at
      FROM care_visits v
      LEFT JOIN patients p ON p.id=v.patient_id AND p.tenant_id=v.tenant_id
      WHERE ${where}
      ORDER BY v.started_at DESC
      LIMIT $${params.length}`;
    const { rows } = await pool.query(sql, params);
    return rows.map(r => ({
      ...r,
      patient_name: String((r.first_name || '') + ' ' + (r.last_name || '')).trim(),
      duration_minutes: durationMinutes(r.started_at, r.finished_at),
      status: r.finished_at ? 'Završeno' : 'U tijeku'
    }));
  }

  app.get('/api/care/reports/visits', requireUser, async (req, res) => {
    try {
      const items = await visitRows(req, req.query && req.query.limit);
      res.json({ items });
    } catch (e) {
      console.error('[homecare_reports] visits failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.get('/api/care/reports/visits.csv', requireUser, async (req, res) => {
    try {
      const items = await visitRows(req, 500);
      const headers = [
        'ID', 'Pacijent', 'Adresa', 'Telefon', 'Status', 'Pocetak', 'Zavrsetak', 'Trajanje min',
        'Zapoceo', 'Zavrsio', 'Postupci', 'Opis postupaka', 'Iz plana odradeno',
        'Tlak', 'Puls', 'Temperatura', 'SpO2', 'Bol', 'Rana', 'Napomena',
        'Obitelj status', 'Obitelj kontakt', 'Obitelj poruka'
      ];
      const lines = [headers.map(csv).join(',')];
      for (const r of items) {
        lines.push([
          r.id, r.patient_name, r.address, r.phone, r.status, r.started_at, r.finished_at, r.duration_minutes,
          r.started_by_name, r.finished_by_name, r.performed_procedures, r.procedure_note, r.care_plan_done,
          r.bp, r.pulse, r.temperature, r.spo2, r.pain_score, r.wound_note, r.finish_note || r.start_note,
          r.family_notification_status, r.family_notification_to, r.family_notification_message
        ].map(csv).join(','));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ernos-posjete.csv"');
      res.send('\uFEFF' + lines.join('\n'));
    } catch (e) {
      console.error('[homecare_reports] csv failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
