module.exports = function setupHomecareFamilyOutbox(opts = {}) {
  const app = opts.app;
  const pool = opts.pool;
  const auth = opts.auth;
  if (!app || !pool) return;
  if (app.locals.homecareFamilyOutboxLoaded) return;
  app.locals.homecareFamilyOutboxLoaded = true;

  const requireUser = typeof auth === 'function' ? auth : function (_req, _res, next) { next(); };

  function tenantOf(req) {
    return Number((req.user && req.user.tenant_id) || req.tenant_id || 1);
  }

  function clean(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max || 500);
  }

  async function setup() {
    await pool.query(`
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS family_notification_sent_at TIMESTAMPTZ;
      ALTER TABLE care_visits ADD COLUMN IF NOT EXISTS family_notification_sent_note TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_care_visits_family_outbox
      ON care_visits(tenant_id, family_notification_status, family_notification_at DESC)
      WHERE family_notification_requested = TRUE;
    `);
  }
  setup().catch(e => console.error('[homecare_family_outbox] setup failed', e));

  app.get('/api/care/family-outbox', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const status = clean(req.query && req.query.status, 40).toLowerCase();
      const params = [tenantId];
      let where = `cv.tenant_id=$1 AND cv.family_notification_requested=TRUE AND cv.family_notification_message<>''`;
      if (status && status !== 'all') {
        params.push(status);
        where += ' AND cv.family_notification_status=$' + params.length;
      }
      const r = await pool.query(
        `SELECT cv.id, cv.patient_id, cv.started_at, cv.finished_at,
                cv.family_notification_status, cv.family_notification_to, cv.family_notification_message,
                cv.family_notification_at, cv.family_notification_sent_at, cv.family_notification_sent_note,
                p.first_name, p.last_name, p.address, p.phone, p.family_contact_name, p.family_contact_phone
         FROM care_visits cv
         LEFT JOIN patients p ON p.id=cv.patient_id AND p.tenant_id=cv.tenant_id
         WHERE ${where}
         ORDER BY COALESCE(cv.family_notification_at, cv.finished_at, cv.started_at) DESC
         LIMIT 200`,
        params
      );
      const items = r.rows.map(x => ({
        ...x,
        patient_name: String((x.first_name || '') + ' ' + (x.last_name || '')).trim(),
        profile_url: '#patient?id=' + encodeURIComponent(x.patient_id || ''),
        summary_url: '#patient-summary?id=' + encodeURIComponent(x.patient_id || '')
      }));
      const counts = { prepared: 0, sent: 0, other: 0 };
      for (const it of items) {
        if (it.family_notification_status === 'prepared') counts.prepared++;
        else if (it.family_notification_status === 'sent') counts.sent++;
        else counts.other++;
      }
      res.json({ items, counts });
    } catch (e) {
      console.error('[homecare_family_outbox] list failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });

  app.patch('/api/care/family-outbox/:visitId', requireUser, async (req, res) => {
    try {
      const tenantId = tenantOf(req);
      const visitId = Number(req.params.visitId || 0);
      const b = req.body || {};
      if (!visitId) return res.status(400).json({ error: 'Missing visit id' });
      const statusRaw = clean(b.status, 40).toLowerCase();
      const status = statusRaw === 'sent' ? 'sent' : 'prepared';
      const note = clean(b.note, 1000);
      const r = await pool.query(
        `UPDATE care_visits SET
           family_notification_status=$1,
           family_notification_sent_note=$2,
           family_notification_sent_at=CASE WHEN $1='sent' THEN NOW() ELSE NULL END
         WHERE tenant_id=$3 AND id=$4 AND family_notification_requested=TRUE
         RETURNING id, patient_id, family_notification_status, family_notification_to, family_notification_message,
                   family_notification_at, family_notification_sent_at, family_notification_sent_note`,
        [status, note, tenantId, visitId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Obavijest nije pronađena' });
      res.json({ ok: true, item: r.rows[0] });
    } catch (e) {
      console.error('[homecare_family_outbox] update failed', e);
      res.status(500).json({ error: 'Server error', detail: e.message });
    }
  });
};
