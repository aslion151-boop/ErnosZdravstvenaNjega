// plugins/passwords.cjs
// Self-contained: auto-migrates + forgot/reset + change pw + must-change flag
// Requirements: pool (pg Pool), app (Express), auth (req.user set), baseUrl, sendMail

const crypto = require('crypto');

module.exports = function setupPasswords({
  app, pool, auth, baseUrl, sendMail,
  tokenTTLMinutes = 30,
  tenantIdOf = (req) => Number(req.user?.tenant_id || 0),
} = {}) {
  if (!app || !pool) throw new Error('[passwords] Missing { app, pool }');

  // Fallbacks
  
  baseUrl ||= process.env.PUBLIC_WEB_URL || process.env.APP_PUBLIC_URL || process.env.APP_BASE_URL || 'http://localhost:3000';

  sendMail ||= async ({ to, subject, text, html }) => {
    console.log('[passwords] sendMail stub ->', { to, subject, text });
  };

    // --- Auto-migration (runs once at boot; idempotent)
  (async function migrate() {
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS password_hash TEXT,
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
    `);
    console.log('[passwords] migration OK');
  })().catch(e => console.error('[passwords] migration error', e));


  async function hashPassword(pw) {
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(String(pw), salt);
  }
  async function verifyPassword(pw, hash) {
    if (!hash) return false;
    const bcrypt = require('bcryptjs');
    return bcrypt.compare(String(pw), String(hash));
  }

  function now() { return new Date(); }
  function addMinutes(d, m) { return new Date(d.getTime() + m * 60000); }
  function newToken() { return crypto.randomBytes(32).toString('hex'); }

  // --- Forgot: POST /auth/forgot { email }
  app.post('/auth/forgot', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: 'email required' });

      // Multi-tenant: find user by email
      const q = await pool.query(
        `SELECT id, tenant_id, email, name FROM users WHERE lower(email)=lower($1) LIMIT 1`,
        [email]
      );
      // Always “ok” to avoid account enumeration
      if (!q.rowCount) return res.json({ ok: true });

      const user = q.rows[0];
      const token = newToken();
      const expires = addMinutes(now(), tokenTTLMinutes);

      await pool.query(
        `INSERT INTO password_resets(tenant_id, user_id, token, expires_at)
         VALUES ($1,$2,$3,$4)`,
        [user.tenant_id, user.id, token, expires]
      );

      const resetUrl = `${baseUrl.replace(/\/+$/,'')}/#resetpw?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: email,
        subject: 'Reset your password',
        text: `Click to reset your password: ${resetUrl}\nThis link expires in ${tokenTTLMinutes} minutes.`,
        html: `<p>Click to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in ${tokenTTLMinutes} minutes.</p>`
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error('[auth/forgot]', e);
      return res.json({ ok: true }); // stay non-enumerating
    }
  });

  // --- Reset: POST /auth/reset { token, new_password }
  app.post('/auth/reset', async (req, res) => {
    try {
      const token = String(req.body?.token || '').trim();
      const pw = String(req.body?.new_password || '');
      if (!token || pw.length < 5) return res.status(400).json({ error: 'invalid request' });

      const { rows } = await pool.query(
        `SELECT pr.id, pr.tenant_id, pr.user_id, pr.expires_at, pr.used_at
           FROM password_resets pr
          WHERE pr.token=$1`, [token]
      );
      if (!rows.length) return res.status(400).json({ error: 'invalid token' });
      const pr = rows[0];
      if (pr.used_at) return res.status(400).json({ error: 'token already used' });
      if (new Date(pr.expires_at).getTime() < Date.now())
        return res.status(400).json({ error: 'token expired' });

      const pwHash = await hashPassword(pw);

      await pool.query('BEGIN');
      try {
        // set new hash + must_change_password TRUE (forces update after first login)
        await pool.query(
          `UPDATE users
              SET password_hash=$1, must_change_password=TRUE
            WHERE id=$2 AND tenant_id=$3`,
          [pwHash, pr.user_id, pr.tenant_id]
        );
        await pool.query(
          `UPDATE password_resets SET used_at=NOW() WHERE id=$1`,
          [pr.id]
        );
        await pool.query('COMMIT');
      } catch (e) {
        await pool.query('ROLLBACK');
        throw e;
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error('[auth/reset]', e);
      return res.status(500).json({ error: 'server error' });
    }
  });

          // --- Change current pw: POST /me/password { current_password, new_password }
  // Secure behaviour:
  // - Only the logged-in user can change their own password.
  // - current_password is REQUIRED if a hash already exists.
  // - For normal staff: current_password must match (strict).
  // - For ADMIN / ADMIN_GLOBAL: if hash check fails, we still allow
  //   a reset so bootstrap/legacy admins are not locked out forever.
  app.post('/me/password', auth, async (req, res) => {
    try {
      const uid  = Number(req.user?.id || req.user?.user_id || 0);
      const cur  = String(req.body?.current_password || '');
      const next = String(req.body?.new_password || '');

      // Basic validation
      if (!uid || next.length < 5) {
        return res.status(400).json({ error: 'invalid request' });
      }

      // Load current user (including role + current hash)
      const { rows } = await pool.query(
        `SELECT id, role, password_hash
           FROM users
          WHERE id = $1
          LIMIT 1`,
        [uid]
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'not found' });
      }

      const u = rows[0];
      const role = String(u.role || req.user?.role || '').toUpperCase();
      const isAdmin = role === 'ADMIN' || role === 'ADMIN_GLOBAL';

      // If a password already exists, enforce current_password check
      if (u.password_hash) {
        if (!cur) {
          return res.status(400).json({ error: 'current password required' });
        }

        const ok = await verifyPassword(cur, u.password_hash);

        if (!ok) {
          // Normal staff: strict check
          if (!isAdmin) {
            return res.status(400).json({ error: 'current password incorrect' });
          }

          // ADMIN / ADMIN_GLOBAL:
          // allow override in case their stored hash is from an old system.
          console.warn(
            '[me/password] admin override: current password did not match, but allowing reset for user id=',
            uid
          );
        }
      }
      // If there is no password_hash yet (legacy / bootstrap user),
      // we allow setting the first password without verifying anything.

      const hash = await hashPassword(next);

      // IMPORTANT: keep both password_hash AND legacy password column in sync.
      // This ensures login works even if it still uses the old `password` field.
      await pool.query(
        `UPDATE users
            SET password_hash       = $1,
                password            = $1,
                must_change_password = FALSE
          WHERE id = $2`,
        [hash, uid]
      );

      return res.json({ ok: true });
    } catch (e) {
      console.error('[me/password]', e);
      return res.status(500).json({ error: 'server error' });
    }
  });



  // --- Must-change flag: GET /me/mcp  -> { must_change_password: boolean }
  app.get('/me/mcp', auth, async (req, res) => {
    try {
      const uid = Number(req.user?.id || req.user?.user_id || 0);
      const { rows } = await pool.query(
        `SELECT must_change_password FROM users WHERE id=$1`, [uid]
      );
      const mcp = rows[0]?.must_change_password ? true : false;
      res.json({ must_change_password: mcp });
    } catch (e) {
      console.error('[me/mcp]', e);
      res.json({ must_change_password: false });
    }
  });

  // OPTIONAL: helper for username/email login to enforce bcrypt + mcp (call in your login flow)
  async function setMustChangeOnTempPasswordUser(userId) {
    await pool.query(`UPDATE users SET must_change_password=TRUE WHERE id=$1`, [userId]);
  }

  return { setMustChangeOnTempPasswordUser };
};
