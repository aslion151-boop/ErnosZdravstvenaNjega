// backend/plugins/staff.cjs
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

module.exports = function setupStaff(opts) {
  const {
    app, pool, auth,
    tenantIdOf = (req) => Number(req.user?.tenant_id || 0),
    roleOf    = (req) => String(req.user?.role || '').toUpperCase(),
  } = opts || {};

  if (!app || !pool || !auth) throw new Error('[staff] Missing { app, pool, auth }');

  // ---------- Migrate users table, backfill, tighten (single IIFE!) ----------
  (async () => {
    const sql = `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS tenant_id      INTEGER,
        ADD COLUMN IF NOT EXISTS username       TEXT,
        ADD COLUMN IF NOT EXISTS category       TEXT,
        ADD COLUMN IF NOT EXISTS active         BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS password_hash  TEXT,
        ADD COLUMN IF NOT EXISTS email          TEXT,
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

      -- Backfill username from email (left side) if empty (only if email exists)
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='email'
        ) THEN
          UPDATE users
             SET username = COALESCE(NULLIF(username,''), NULLIF(split_part(email,'@',1), ''))
           WHERE (username IS NULL OR username='');
        END IF;
      END$$;

      -- If every row now has username, enforce NOT NULL (best-effort)
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='username' AND is_nullable='YES'
        ) THEN
          IF NOT EXISTS (SELECT 1 FROM users WHERE username IS NULL OR username='') THEN
            ALTER TABLE users ALTER COLUMN username SET NOT NULL;
          END IF;
        END IF;
      END$$;

      -- Drop legacy global unique index if it still exists
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='uniq_users_username_nocase') THEN
          DROP INDEX uniq_users_username_nocase;
        END IF;
      END$$;

      -- Unique: tenant + lower(username) (ignore NULL/empty usernames)
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tenant_id')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username')
        AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='ux_users_tenant_lcusername') THEN
          CREATE UNIQUE INDEX ux_users_tenant_lcusername
            ON users (COALESCE(tenant_id,0), lower(username))
            WHERE username IS NOT NULL AND username <> '';
        END IF;
      END$$;
    `;
    try { await pool.query(sql); } catch (e) { console.error('[staff migrate]', e); }

    // Show users in Staff list: turn legacy NULLs into TRUE
    try { await pool.query("UPDATE users SET active=TRUE WHERE active IS NULL"); }
    catch (e) { console.error('[staff migrate] active backfill', e); }

    // Backfill passwords (hash) for any user missing stored password/hash; force change on next login
    try {
      const { rows: need } = await pool.query(`
        SELECT id, COALESCE(username, split_part(email,'@',1)) AS uname
          FROM users
         WHERE (password IS NULL OR password = '')
            OR (password_hash IS NULL OR password_hash = '')
      `);
      for (const r of need) {
        const tmp  = crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g,'').slice(0,12);
        const hash = await bcrypt.hash(tmp, 10);
        await pool.query(
          `UPDATE users
              SET password = $1,
                  password_hash = $1,
                  must_change_password = TRUE
            WHERE id = $2`,
          [hash, r.id]
        );
        console.log('[staff migrate] backfilled password for user', r.id, '(' + (r.uname||'') + ')');
      }
    } catch (e) {
      console.error('[staff migrate] backfill passwords failed', e);
    }

    // --- One-time admin reset via env (run only if env vars are set) ---
    try {
      const email = process.env.ADMIN_RESET_EMAIL && String(process.env.ADMIN_RESET_EMAIL).trim();
      const pass  = process.env.ADMIN_RESET_PASSWORD && String(process.env.ADMIN_RESET_PASSWORD);

      if (email && pass) {
        const hash = await bcrypt.hash(pass, 10);

        // Try find existing admin by email
        const { rows: have } = await pool.query(
          `SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1`,
          [email]
        );

        if (have.length) {
          await pool.query(`
  UPDATE users
     SET password = $1,
         password_hash = $1,
         must_change_password = FALSE,
         active = TRUE,
         role = CASE
                  WHEN UPPER(COALESCE(role,'')) IN ('ADMIN','ADMIN_GLOBAL') THEN role
                  ELSE 'ADMIN_GLOBAL'
                END
   WHERE id = $2
`, [hash, have[0].id]);

          console.log('[staff migrate] ADMIN_RESET: updated user', have[0].id, email);
        } else {
          // Create a new global admin if not present
          const username = email.split('@')[0] || 'admin';
          const { rows: ins } = await pool.query(`
            INSERT INTO users (email, username, name, role, category, active, password, password_hash, must_change_password)
            VALUES ($1, $2, 'Admin', 'ADMIN_GLOBAL', 'MANAGER', TRUE, $3, $3, FALSE)
            RETURNING id
          `, [email, username, hash]);

          console.log('[staff migrate] ADMIN_RESET: created user', ins[0].id, email);
        }
      }
    } catch (e) {
      console.error('[staff migrate] ADMIN_RESET failed', e);
    }

    // Best-effort tighten NOT NULL when every row has values (safe)
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password') THEN
            IF NOT EXISTS (SELECT 1 FROM users WHERE password IS NULL OR password='') THEN
              BEGIN
                ALTER TABLE users ALTER COLUMN password SET NOT NULL;
              EXCEPTION WHEN others THEN NULL;
              END;
            END IF;
          END IF;

          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash') THEN
            IF NOT EXISTS (SELECT 1 FROM users WHERE password_hash IS NULL OR password_hash='') THEN
              BEGIN
                ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
              EXCEPTION WHEN others THEN NULL;
              END;
            END IF;
          END IF;
        END$$;
      `);
    } catch (e) {
      console.error('[staff migrate] set NOT NULL failed', e);
    }
  })();

  /* ---------- Introspect schema so we only touch real columns ---------- */
  let USERS_COLS = new Set();
  let USERS_REQ  = new Set();           // NOT NULL columns
  let USERS_DEF  = {};                  // defaults
  async function refreshUsersSchema(){
    try{
      const { rows } = await pool.query(`
        SELECT column_name, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_name='users'
      `);
      USERS_COLS = new Set(rows.map(r => r.column_name));
      USERS_REQ  = new Set(rows.filter(r => r.is_nullable === 'NO').map(r => r.column_name));
      USERS_DEF  = Object.fromEntries(rows.map(r => [r.column_name, r.column_default]));
    }catch(e){ console.error('[staff] schema introspection failed:', e); }
  }
  async function ensureUsersSchema(){
    if (!USERS_COLS.size) await refreshUsersSchema();
  }
  const hasCol = (c) => USERS_COLS.has(c);
  const reqCol = (c) => USERS_REQ.has(c);

  /* ---------- Helpers ---------- */
  function requireAdmin(req, res){
    const r = roleOf(req);
    if (r !== 'ADMIN' && r !== 'ADMIN_GLOBAL') {
      res.status(403).json({ error: 'forbidden' });
      return false;
    }
    return true;
  }

  /* ---------- Debug: see live users-table shape (admin only) ---------- */
  app.get('/users/_schema', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try{
      await refreshUsersSchema();
      res.json({
        columns: [...USERS_COLS],
        required: [...USERS_REQ],
        defaults: USERS_DEF
      });
    }catch(e){
      res.status(500).json({ error:'schema read failed', message:e.message });
    }
  });

  /* ---------- List users (tenant-scoped) ---------- */
  app.get('/users', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try{
      await ensureUsersSchema();

      const tid    = tenantIdOf(req);
      const meRole = roleOf(req);

      const SEL = [
        hasCol('id')        ? 'id'                      : 'NULL::int AS id',
        hasCol('name')      ? 'name'                    : "''::text AS name",
        hasCol('username')  ? 'username'                : "''::text AS username",
        hasCol('role')      ? 'role'                    : "''::text AS role",
        hasCol('category')  ? 'category'                : "''::text AS category",
        hasCol('active')    ? 'active'                  : 'TRUE AS active',
      ].join(', ');

      const where  = [];
      const params = [];

      if (hasCol('tenant_id') && Number.isFinite(Number(tid)) && Number(tid) > 0) {
        params.push(Number(tid));
        where.push(`tenant_id = $${params.length}`);
      }

      if (hasCol('role')) {
        // Hide ADMIN_GLOBAL from non-global admins
        params.push(meRole);
        where.push(`($${params.length} = 'ADMIN_GLOBAL' OR UPPER(role) <> 'ADMIN_GLOBAL')`);
      }
      if (hasCol('active')) { where.push(`active = TRUE`); }

      const ORDER = [
        hasCol('name')     ? 'name'     : null,
        hasCol('username') ? 'username' : null,
        'id'
      ].filter(Boolean).join(', ');

      const sql = `
        SELECT ${SEL}
          FROM users
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY ${ORDER}
      `;
      const { rows } = await pool.query(sql, params);
      res.json({ items: rows });
    }catch(e){
      console.error('[GET /users]', { code:e.code, detail:e.detail, message:e.message });
      res.status(500).json({ error:'server error', code:e.code, detail:e.detail });
    }
  });

  //* ---------- Create user (tenant-safe, clear errors) ---------- */
app.post('/users', auth, async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    await ensureUsersSchema();

    const rawTid = tenantIdOf(req);
    const tidFromJwt = Number(rawTid) > 0 ? Number(rawTid) : null;
    const meRole = roleOf(req);

    // Fallback: derive tenant if JWT missing it
    let effectiveTid = tidFromJwt;
    try {
      if (effectiveTid == null) {
        const { rows: meRows } = await pool.query(
          "SELECT tenant_id FROM users WHERE id=$1 LIMIT 1",
          [Number(req.user?.id || req.user?.user_id || 0)]
        );
        if (meRows.length && meRows[0].tenant_id != null) {
          effectiveTid = Number(meRows[0].tenant_id);
        }
      }
    } catch (_) {}

    const {
      name, username,
      role = 'USER',
      category = '',
      active = true,
      email: reqEmail,
      password: reqPassword
    } = req.body || {};

    // Accept optional password; if missing/short, generate a strong temp one (min 5)
    const providedPw = (typeof reqPassword === 'string' && reqPassword.trim()) || '';
    const finalPw =
      providedPw.length >= 5
        ? providedPw
        : crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);

    const nm = String(name || '').trim();
    const un = String(username || '').trim();
    const R  = String(role || 'USER').toUpperCase();
    const C  = String(category || '').toUpperCase();
    const A  = !!active;

    if (!nm || !un) return res.status(400).json({ error: 'name and username required' });
    if (R === 'ADMIN_GLOBAL' && meRole !== 'ADMIN_GLOBAL') {
      return res.status(403).json({ error: 'cannot assign ADMIN_GLOBAL' });
    }

    const hash = await bcrypt.hash(finalPw, 10);
    // Only force a change if we had to generate a temp password.
    // If the admin supplied a real password (>= 5), let the user log straight in.
    const mustChange = providedPw.length < 5;

    function buildInsert(includeTenant) {
      const cols = [];
      const vals = [];

      if (includeTenant && hasCol('tenant_id')) { cols.push('tenant_id'); vals.push(effectiveTid); }
      if (hasCol('name'))     { cols.push('name');     vals.push(nm); }
      if (hasCol('username')) { cols.push('username'); vals.push(un); }
      if (hasCol('role'))     { cols.push('role');     vals.push(R); }
      if (hasCol('category')) { cols.push('category'); vals.push(C); }
      if (hasCol('active'))   { cols.push('active');   vals.push(A); }
      if (hasCol('must_change_password')) { cols.push('must_change_password'); vals.push(mustChange); }

      if (hasCol('email')) {
        const suffix =
          (effectiveTid != null)
            ? `t${effectiveTid}`
            : `g${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`; // global creator: randomize
        const emailVal =
          (reqEmail && String(reqEmail).trim()) || `${un}+${suffix}@local.invalid`;
        cols.push('email'); vals.push(emailVal);
      }

      // Write hash to BOTH columns when present (covers legacy NOT NULL(password))
      if (hasCol('password_hash') && hasCol('password')) {
        cols.push('password_hash'); vals.push(hash);
        cols.push('password');      vals.push(hash);
      } else if (hasCol('password_hash')) {
        cols.push('password_hash'); vals.push(hash);
      } else if (hasCol('password')) {
        cols.push('password');      vals.push(hash);
      }

      const returningCols = ['id','name','username','email','role','category','active'].filter(hasCol);
      const returning = returningCols.length ? returningCols.join(',') : 'id';
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');

      return {
        sql: `INSERT INTO users (${cols.join(',')}) VALUES (${placeholders}) RETURNING ${returning}`,
        vals
      };
    }

    const tenantColumnExists = hasCol('tenant_id');
    const mustIncludeTenant  = tenantColumnExists && reqCol('tenant_id');

    if (mustIncludeTenant && (effectiveTid == null)) {
      return res.status(400).json({
        error: 'missing tenant_id on your account; cannot create user',
        hint:  'Ensure your own user has tenant_id set'
      });
    }

    // Single insert — no retry without tenant_id
    const { sql, vals } = buildInsert(true /* includeTenant */);
    try {
      const { rows } = await pool.query(sql, vals);
      const resp = rows[0] || {};
      // Do NOT return any password or temp password
      return res.json(resp);
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({
          error: 'username or email already exists for this site',
          code: e.code, detail: e.detail, constraint: e.constraint
        });
      }
      if (e.code === '23502') {
        return res.status(400).json({
          error: 'missing required field on users table',
          code: e.code, detail: e.detail, column: e.column
        });
      }
      if (e.code === '23503' || /foreign key/i.test(String(e.detail || ''))) {
        return res.status(400).json({
          error: 'invalid tenant/site (tenant_id foreign key)',
          code: e.code, detail: e.detail, constraint: e.constraint
        });
      }

      console.error('[POST /users]', { code: e.code, detail: e.detail, message: e.message, where: e.where });
      return res.status(500).json({ error: 'server error', code: e.code, detail: e.detail, constraint: e.constraint });
    }

  } catch (e) {
    console.error('[POST /users fatal]', e);
    return res.status(500).json({ error: 'server error', message: e.message });
  }
});
  /* ---------- Update user (role/category/name/active/email/etc.) ---------- */
  app.patch('/users/:id', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;

    try {
      await ensureUsersSchema();

      const id  = parseInt(req.params.id, 10) || 0;
      const tid = tenantIdOf(req);
      const meRole = roleOf(req);

      if (!id) return res.status(400).json({ error: 'invalid user id' });

      // Load current user row (for tenant + role checks)
      const sel = `
        SELECT id,
               ${hasCol('tenant_id') ? 'tenant_id' : 'NULL::int AS tenant_id'},
               ${hasCol('role') ? 'role' : "''::text AS role"}
          FROM users
         WHERE id = $1
      `;
      const { rows } = await pool.query(sel, [id]);
      if (!rows.length) return res.status(404).json({ error: 'not found' });

      const cur = rows[0];

      // Tenant guard
      if (hasCol('tenant_id') && cur.tenant_id != null && Number(cur.tenant_id) !== Number(tid)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      // Protect ADMIN_GLOBAL from being changed by non-global admins
      const curRole = String(cur.role || '').toUpperCase();
      if (curRole === 'ADMIN_GLOBAL' && meRole !== 'ADMIN_GLOBAL') {
        return res.status(403).json({ error: 'cannot modify ADMIN_GLOBAL user' });
      }

      const body = req.body || {};

      // Fields we allow to be edited from UI
      const allowed = ['name', 'username', 'role', 'category', 'active', 'email', 'phone', 'note'];

      const sets   = [];
      const values = [];
      let idx = 1;

      for (const key of allowed) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        if (!hasCol(key)) continue; // skip columns that don't exist in schema

        let val = body[key];

        if (key === 'role' || key === 'category') {
          val = String(val || '').toUpperCase();
        }
        if (key === 'active') {
          val = !!val;
        }

        // Extra guard: do not allow non-global admins to set ADMIN_GLOBAL
        if (key === 'role' && String(val).toUpperCase() === 'ADMIN_GLOBAL' && meRole !== 'ADMIN_GLOBAL') {
          return res.status(403).json({ error: 'cannot assign ADMIN_GLOBAL' });
        }

        sets.push(`${key} = $${idx++}`);
        values.push(val);
      }

      if (!sets.length) {
        return res.status(400).json({ error: 'no editable fields supplied' });
      }

      // Optional updated_at if the column exists
      if (hasCol('updated_at')) {
        sets.push(`updated_at = NOW()`);
      }

      // tenant & id conditions
      if (hasCol('tenant_id') && Number(tid) > 0) {
        sets.push(`tenant_id = tenant_id`); // no-op to keep syntax simple
        const sql = `
          UPDATE users
             SET ${sets.join(', ')}
           WHERE id = $${idx}
             AND tenant_id = $${idx + 1}
           RETURNING id, name, username, email, role, category, active
        `;
        values.push(id, Number(tid));
        const { rows: upd } = await pool.query(sql, values);
        if (!upd.length) return res.status(404).json({ error: 'not found' });
        return res.json(upd[0]);
      } else {
        const sql = `
          UPDATE users
             SET ${sets.join(', ')}
           WHERE id = $${idx}
           RETURNING id, name, username, email, role, category, active
        `;
        values.push(id);
        const { rows: upd } = await pool.query(sql, values);
        if (!upd.length) return res.status(404).json({ error: 'not found' });
        return res.json(upd[0]);
      }

    } catch (e) {
      console.error('[PATCH /users/:id]', e);
      res.status(500).json({ error: 'server error', message: e.message });
    }
  });

  /* ---------- Delete or deactivate user ---------- */
  app.delete('/users/:id', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const id  = parseInt(req.params.id, 10) || 0;
    const tid = tenantIdOf(req);

    try{
      const sel = `
        SELECT id,
               ${hasCol('tenant_id') ? 'tenant_id' : 'NULL::int AS tenant_id'},
               ${hasCol('role') ? 'role' : "''::text AS role"}
          FROM users
         WHERE id=$1
      `;
      const { rows: cur } = await pool.query(sel, [id]);
      if (!cur.length) return res.status(404).json({ error:'not found' });
      const u = cur[0];

      if (hasCol('tenant_id') && u.tenant_id != null && Number(u.tenant_id) !== Number(tid)) {
        return res.status(403).json({ error:'forbidden' });
      }
      if (String(u.role||'').toUpperCase()==='ADMIN_GLOBAL' && roleOf(req) !== 'ADMIN_GLOBAL') {
        return res.status(403).json({ error:'cannot delete ADMIN_GLOBAL' });
      }

      await pool.query(
        `DELETE FROM users WHERE id=$1${hasCol('tenant_id') ? ' AND tenant_id=$2' : ''}`,
        hasCol('tenant_id') ? [id, tid] : [id]
      );
      res.json({ ok:true });
    }catch(e){
      console.error('[DELETE /users/:id]', e);
      res.status(500).json({ error:'server error' });
    }
  });

  /* ---------- Admin: reset any user's password (force change on next login) ---------- */
  app.post('/users/:id/password', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const id = parseInt(req.params.id, 10) || 0;
    const { new_password } = req.body || {};

    if (!id) return res.status(400).json({ error: 'invalid user id' });
    if (!new_password || String(new_password).length < 5) {
      return res.status(400).json({ error: 'new password too short (min 5 chars)' });
    }

    try {
      // Verify user exists and (if tenant_id enforced) belongs to same tenant
      const sel = `
        SELECT id,
               ${hasCol('tenant_id') ? 'tenant_id' : 'NULL::int AS tenant_id'}
          FROM users
         WHERE id = $1
      `;
      const { rows } = await pool.query(sel, [id]);
      if (!rows.length) return res.status(404).json({ error: 'not found' });

      // If your system scopes by tenant, enforce it here:
      if (hasCol('tenant_id')) {
        const tid = tenantIdOf(req);
        if (rows[0].tenant_id != null && Number(rows[0].tenant_id) !== Number(tid)) {
          return res.status(403).json({ error: 'forbidden' });
        }
      }

      const hash = await bcrypt.hash(String(new_password), 10);

      await pool.query(`
        UPDATE users
           SET password = $1,
               password_hash = $1,
               must_change_password = TRUE
         WHERE id = $2
      `, [hash, id]);

      res.json({ ok: true, id, must_change_password: true });
    } catch (e) {
      console.error('[POST /users/:id/password]', e);
      res.status(500).json({ error: 'server error' });
    }
  });

}; // end setupStaff
