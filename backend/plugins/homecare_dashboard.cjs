module.exports = function setupHomecareDashboard(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareDashboardLoaded) return;
  app.locals.homecareDashboardLoaded = true;

  const requireUser = typeof auth === 'function' ? auth : function (_req, _res, next) { next(); };

  function tenantOf(req) {
    return Number((req.user && req.user.tenant_id) || req.tenant_id || 1);
  }

  app.get('/api/care/dashboard/today', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const planned = await pool.query(
        `SELECT pv.id, pv.patient_id, pv.planned_for, pv.window_text, pv.visit_type, pv.instructions, pv.status,
                p.first_name, p.last_name, p.address, p.phone, p.scan_code
         FROM planned_visits pv
         LEFT JOIN patients p ON p.id=pv.patient_id AND p.tenant_id=pv.tenant_id
         WHERE pv.tenant_id=$1
           AND pv.status='planned'
           AND (
             pv.planned_for IS NULL
             OR pv.planned_for >= date_trunc('day', NOW())
           )
           AND (
             pv.planned_for IS NULL
             OR pv.planned_for < date_trunc('day', NOW()) + interval '1 day'
             OR pv.planned_for < NOW() + interval '12 hours'
           )
         ORDER BY COALESCE(pv.planned_for, pv.created_at) ASC, pv.id ASC
         LIMIT 80`,
        [tenantId]
      );

      const open = await pool.query(
        `SELECT v.id, v.patient_id, v.started_at, v.started_by_name, v.start_note, v.planned_visit_id,
                p.first_name, p.last_name, p.address, p.phone, p.scan_code
         FROM care_visits v
         LEFT JOIN patients p ON p.id=v.patient_id AND p.tenant_id=v.tenant_id
         WHERE v.tenant_id=$1 AND v.finished_at IS NULL
         ORDER BY v.started_at ASC
         LIMIT 80`,
        [tenantId]
      );

      const finished = await pool.query(
        `SELECT v.id, v.patient_id, v.started_at, v.finished_at, v.started_by_name, v.finished_by_name,
                v.performed_procedures, v.care_plan_done, v.therapy_done, v.planned_visit_id,
                p.first_name, p.last_name, p.address, p.phone, p.scan_code
         FROM care_visits v
         LEFT JOIN patients p ON p.id=v.patient_id AND p.tenant_id=v.tenant_id
         WHERE v.tenant_id=$1
           AND v.finished_at IS NOT NULL
           AND v.finished_at >= date_trunc('day', NOW())
           AND v.finished_at < date_trunc('day', NOW()) + interval '1 day'
         ORDER BY v.finished_at DESC
         LIMIT 80`,
        [tenantId]
      );

      function mapPatient(r) {
        return {
          ...r,
          patient_name: String((r.first_name || '') + ' ' + (r.last_name || '')).trim(),
          scan_url: r.scan_code ? '/#scan?t=' + encodeURIComponent(r.scan_code) : ''
        };
      }

      res.json({
        ok: true,
        date: new Date().toISOString(),
        planned: planned.rows.map(mapPatient),
        open: open.rows.map(mapPatient),
        finished: finished.rows.map(mapPatient),
        counts: {
          planned: planned.rows.length,
          open: open.rows.length,
          finished: finished.rows.length
        }
      });
    } catch (e) {
      console.error('[homecare_dashboard] today failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
