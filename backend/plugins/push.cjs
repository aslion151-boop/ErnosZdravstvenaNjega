// File: backend/plugins/push.cjs
const webpush = require('web-push');

/**
 * @param {Object} opts
 * @param {import('express').Express} opts.app
 * @param {import('pg').Pool} opts.pool
 * @param {Function} opts.auth
 * @param {Function} opts.tenantIdOf
 * @param {string}   opts.VAPID_PUBLIC_KEY
 * @param {string}   opts.VAPID_PRIVATE_KEY
 * @param {string}   [opts.VAPID_SUBJECT='mailto:admin@example.com']
 */
function setupPush(opts) {
  const {
    app, pool, auth, tenantIdOf,
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
    VAPID_SUBJECT = 'mailto:admin@example.com',
  } = opts || {};

  if (!app || !pool || !auth || !tenantIdOf) {
    throw new Error('[push] setupPush missing required args (app, pool, auth, tenantIdOf)');
  }

  /* ---------------- Migrations (idempotent) ---------------- */
  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id         SERIAL PRIMARY KEY,
          tenant_id  INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
          user_id    INTEGER REFERENCES users(id)    ON DELETE SET NULL,
          endpoint   TEXT NOT NULL UNIQUE,
          data       JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_push_subs_tenant_user
          ON push_subscriptions(tenant_id, user_id);

        CREATE TABLE IF NOT EXISTS push_prefs (
          tenant_id  INTEGER NOT NULL,
          user_id    INTEGER NOT NULL,
          prefs      JSONB    DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (tenant_id, user_id)
        );
      `);
    } catch (e) {
      console.error('[push] migrate failed:', e);
    }
  })();

  /* ---------------- VAPID config ---------------- */
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys missing; push cannot be sent.');
  } else {
    try {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    } catch (e) {
      console.error('[push] setVapidDetails failed:', e);
    }
  }

  /* ---------------- Core sender (broad, tenant-wide) ---------------- */
async function sendToRoles({ tenantId, wantRoles = [], wantCats = [], payloadObj, topicKey = null }) {
  const payload = JSON.stringify(payloadObj || {});

  // For the pilot: IGNORE roles/cats/prefs and just send to everyone
  // in this tenant who has a subscription.
  const sql = `
    SELECT endpoint, data
      FROM push_subscriptions
     WHERE (tenant_id IS NULL OR tenant_id = $1)
  `;
  const params = [tenantId];

  const { rows } = await pool.query(sql, params);
  console.log('[push] sendToRoles BROAD', {
    tenantId,
    requestedRoles: wantRoles,
    requestedCats: wantCats,
    matchedSubs: rows.length
  });

  await Promise.all(rows.map(async (r) => {
    const sub = r.data && typeof r.data === 'object'
      ? r.data
      : JSON.parse(String(r.data || '{}'));
    try {
      await webpush.sendNotification(sub, payload);
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        try {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [r.endpoint]);
        } catch (_) {}
      } else {
        console.warn('[push] sendNotification error:', e?.statusCode, e?.message);
      }
    }
  }));
}



  // expose for other modules (if anyone reaches for it directly)
  app.set('sendPushToRoles', sendToRoles);

  // unified helper (what your other plugins call)
  app.locals.pushNotify = {
  /**
   * notifyRoles({ tenantId, rolesOrCats, title, body, data })
   * rolesOrCats can be roles OR categories; we match against both.
   */
  notifyRoles: async ({ tenantId, rolesOrCats = [], title, body, data = {} }) => {
    const upper = (rolesOrCats || []).map(s => String(s || '').toUpperCase());
    const payloadObj = {
      title,
      body,
      url:  data?.url  || '/#dashboard',
      kind: data?.kind || 'generic',
      ...data
    };
    // kind → topic key in push_prefs
    const k = String(payloadObj.kind || '').toLowerCase();
    const topicKey =
      k === 'visitors' ? 'visitors'
      : (k === 'issues' || k === 'maintenance') ? 'issues'
      : null;

    await sendToRoles({
      tenantId,
      wantRoles: upper,
      wantCats:  upper,
      payloadObj,
      topicKey
    });
  }
};


  /* ---------------- SPA key endpoints ---------------- */
  // Your SPA calls this:
  app.get('/push/public-key', (req, res) => {
    if (!VAPID_PUBLIC_KEY) return res.status(400).json({ error: 'push not configured' });
    res.json({ key: VAPID_PUBLIC_KEY });
  });

  // (Kept for compatibility)
  app.get('/push/vapid', (req, res) => {
    if (!VAPID_PUBLIC_KEY) return res.status(400).json({ error: 'push not configured' });
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  /* ---------------- Subscribe / Unsubscribe ---------------- */
  // Accept raw subscription object (what your SPA sends)
  app.post('/push/subscribe', auth, async (req, res) => {
    try {
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return res.status(400).json({ error: 'push not configured' });
      }
      const sub = req.body?.subscription || req.body;
      if (!sub || !sub.endpoint) return res.status(400).json({ error: 'invalid subscription payload' });

      const tid = tenantIdOf(req) || null;
      const uid = req.user?.id || null;

      await pool.query(
        `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, data, created_at)
         VALUES ($1,$2,$3,$4::jsonb,NOW())
         ON CONFLICT (endpoint)
         DO UPDATE SET tenant_id=EXCLUDED.tenant_id, user_id=EXCLUDED.user_id, data=EXCLUDED.data`,
        [tid, uid, sub.endpoint, JSON.stringify(sub)]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('[/push/subscribe]', e);
      res.status(500).json({ error: 'server error' });
    }
  });

  function endpointFromBody(body) {
    if (!body) return '';
    if (body.subscription && body.subscription.endpoint) return String(body.subscription.endpoint);
    if (body.endpoint) return String(body.endpoint);
    return '';
  }

  app.post('/push/unsubscribe', auth, async (req, res) => {
    try {
      const endpoint = endpointFromBody(req.body);
      const tid = tenantIdOf(req) || null;
      const uid = req.user?.id || null;

      if (endpoint) {
        await pool.query(
          `DELETE FROM push_subscriptions
             WHERE endpoint=$1 AND (tenant_id IS NULL OR tenant_id=$2)`,
          [endpoint, tid]
        );
        return res.json({ ok: true, deleted: 'endpoint' });
      }

      if (uid) {
        await pool.query(
          `DELETE FROM push_subscriptions
             WHERE user_id=$1 AND (tenant_id IS NULL OR tenant_id=$2)`,
          [uid, tid]
        );
        return res.json({ ok: true, deleted: 'user' });
      }
      res.status(400).json({ error: 'no endpoint or user' });
    } catch (e) {
      console.error('[/push/unsubscribe]', e);
      res.status(500).json({ error: 'server error' });
    }
  });

  /* ---------------- Preferences (fix your 404) ---------------- */
  app.get('/push/prefs', auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      const uid = req.user?.id;
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const { rows } = await pool.query(
        `SELECT prefs FROM push_prefs WHERE tenant_id=$1 AND user_id=$2`,
        [tid, uid]
      );
      res.json({ prefs: rows[0]?.prefs || {} });
    } catch (e) {
      console.error('[/push/prefs GET]', e);
      res.status(500).json({ error: 'server error' });
    }
  });

  app.post('/push/prefs', auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req);
      const uid = req.user?.id;
      if (!uid) return res.status(401).json({ error: 'unauthorized' });
      const incoming = req.body?.prefs;
      if (incoming && typeof incoming !== 'object') {
        return res.status(400).json({ error: 'prefs must be an object' });
      }
      await pool.query(
        `INSERT INTO push_prefs(tenant_id, user_id, prefs, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (tenant_id, user_id)
         DO UPDATE SET prefs=EXCLUDED.prefs, updated_at=NOW()`,
        [tid, uid, JSON.stringify(incoming || {})]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('[/push/prefs POST]', e);
      res.status(500).json({ error: 'server error' });
    }
  });

  /* ---------------- Test endpoint ---------------- */
  app.post('/push/test', auth, async (req, res) => {
    try {
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return res.status(400).json({ error: 'push not configured' });
      }
      const tid = tenantIdOf(req) || null;
      const uid = req.user?.id || 0;

      const { rows } = await pool.query(
        `SELECT endpoint, data FROM push_subscriptions
          WHERE (tenant_id IS NULL OR tenant_id=$1) AND user_id=$2
          ORDER BY id DESC LIMIT 10`,
        [tid, uid]
      );
      if (!rows.length) return res.status(404).json({ error: 'no subscriptions' });

      const payload = JSON.stringify({
        title: 'Ernos test',
        body:  'Push is working ✔',
        url:   '/#dashboard',
        kind:  'test',
        ts: Date.now()
      });

      const results = await Promise.all(rows.map(async (r) => {
        const sub = r.data && typeof r.data === 'object' ? r.data : JSON.parse(String(r.data || '{}'));
        try { await webpush.sendNotification(sub, payload); return { ok: true }; }
        catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            try { await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [r.endpoint]); } catch {}
          }
          return { ok: false, error: e?.message || String(e) };
        }
      }));

      res.json({ ok: true, results });
    } catch (e) {
      console.error('[/push/test]', e);
      res.status(500).json({ error: 'server error' });
    }
  });
}

module.exports = setupPush;
