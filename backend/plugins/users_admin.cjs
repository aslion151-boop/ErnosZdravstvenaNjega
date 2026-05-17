// plugins/users_admin.cjs
module.exports = function setupUsersAdmin(opts){
  const {
    app, pool, auth,
    tenantIdOf = (req) => Number(req.user?.tenant_id || 0),
  } = opts || {};
  if (!app || !pool || !auth) throw new Error("[users_admin] Missing { app, pool, auth }");

  // --- Migration: username/role/category/active (idempotent)
  (async function migrate(){
    const sql = `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'USER';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'NONE';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

      -- unique per-tenant username (case-insensitive)
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_tenant_username'
        ) THEN
          CREATE UNIQUE INDEX idx_users_tenant_username
          ON users(tenant_id, lower(username));
        END IF;
      END$$;
    `;
    await pool.query(sql);
  })().catch(e=>console.error("[users_admin migrate]", e));

  // Helpers
  function isGlobalAdmin(req){ return String(req.user?.role||'').toUpperCase() === 'ADMIN_GLOBAL'; }
  function isAdmin(req){
    const r = String(req.user?.role||'').toUpperCase();
    return r === 'ADMIN' || r === 'ADMIN_GLOBAL';
  }

  // GET /users — list users for current tenant
  app.get('/users', auth, async (req, res) => {
    const tid = tenantIdOf(req);
    const { rows } = await pool.query(
      `SELECT id, name, username, email, role, category, active
         FROM users
        WHERE tenant_id=$1
        ORDER BY name NULLS LAST, username`, [tid]
    );
    res.json({ items: rows });
  });

  // POST /users — create user (username-based)
  app.post('/users', auth, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

    const tid = tenantIdOf(req);
    let { name, username, role='USER', category='NONE', active=true, password } = req.body || {};
    name     = String(name||'').trim();
    username = String(username||'').trim();
    role     = String(role||'USER').toUpperCase();
    category = String(category||'NONE').toUpperCase();
    active   = !!active;

    if (!name || !username) return res.status(400).json({ error: 'name and username required' });
    if (role === 'ADMIN_GLOBAL' && !isGlobalAdmin(req)){
      return res.status(403).json({ error: 'only ADMIN_GLOBAL may assign ADMIN_GLOBAL' });
    }

    // Generate a temp password if not supplied
    password = String(password || (Math.random().toString(36).slice(-8) + 'A1!'));

    // Hash (bcryptjs). If you don’t have it: npm i bcryptjs
    let password_hash = null;
    try{
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      password_hash = await bcrypt.hash(password, salt);
    }catch(e){
      console.warn("[users_admin] bcryptjs not available; creating user without password hash");
    }

    try{
      const dupe = await pool.query(
        'SELECT 1 FROM users WHERE tenant_id=$1 AND lower(username)=lower($2)',
        [tid, username]
      );
      if (dupe.rowCount) return res.status(409).json({ error: 'username already exists' });

      const { rows } = await pool.query(
        `INSERT INTO users(tenant_id, name, username, role, category, active, password_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, name, username, role, category, active`,
        [tid, name, username, role, category, active, password_hash]
      );
      // Mark new user to change password on first login (if column exists)
// (passwords plugin migration creates this column; wrap in try/catch to be safe)
try {
  await pool.query(
    'UPDATE users SET must_change_password = TRUE WHERE id = $1',
    [rows[0].id]
  );
} catch (e) {
  console.warn('[users_admin] could not set must_change_password (column missing yet?)');
}

      res.json({ ok:true, user: rows[0], temp_password: password_hash ? password : undefined });
    }catch(e){
      console.error('[users_admin POST /users]', e);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /users/:id — update role/category/active/name/username
  app.patch('/users/:id', auth, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

    const id = Number(req.params.id)||0;
    const tid = tenantIdOf(req);

    const cur = await pool.query('SELECT id, tenant_id, role FROM users WHERE id=$1', [id]);
    if (!cur.rowCount) return res.status(404).json({ error: 'not found' });
    const target = cur.rows[0];
    const targetRole = String(target.role||'').toUpperCase();

    if (target.tenant_id !== tid && !isGlobalAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    if (targetRole === 'ADMIN_GLOBAL' && !isGlobalAdmin(req)) return res.status(403).json({ error: 'cannot modify ADMIN_GLOBAL' });

    const fields=[], vals=[];
    function add(col, val){ fields.push(col + '=$' + (vals.length+1)); vals.push(val); }

    const body = req.body || {};
    if (body.name != null) add('name', String(body.name).trim());
    if (body.username != null) add('username', String(body.username).trim());
    if (body.category != null) add('category', String(body.category).toUpperCase());
    if (body.active != null) add('active', !!body.active);
    if (body.role != null){
      const R = String(body.role).toUpperCase();
      if (R === 'ADMIN_GLOBAL' && !isGlobalAdmin(req)) return res.status(403).json({ error: 'only ADMIN_GLOBAL may assign ADMIN_GLOBAL' });
      add('role', R);
    }

    if (!fields.length) return res.json({ ok:true });

    vals.push(id); vals.push(tid);
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(',')}
        WHERE id=$${vals.length-1} AND tenant_id=$${vals.length}
        RETURNING id, name, username, role, category, active`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json({ ok:true, user: rows[0] });
  });

  // DELETE /users/:id — safe delete
  app.delete('/users/:id', auth, async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

    const tid = tenantIdOf(req);
    const meId = String(req.user?.id ?? req.user?.user_id ?? '');
    const id = String(Number(req.params.id)||0);

    if (id === meId) return res.status(400).json({ error: 'cannot delete yourself' });

    const got = await pool.query('SELECT id, tenant_id, role FROM users WHERE id=$1', [id]);
    if (!got.rowCount) return res.status(404).json({ error: 'not found' });

    const target = got.rows[0];
    const targetRole = String(target.role||'').toUpperCase();
    if (targetRole === 'ADMIN_GLOBAL' && !isGlobalAdmin(req))
      return res.status(403).json({ error: 'cannot delete ADMIN_GLOBAL' });
    if (target.tenant_id !== tid && !isGlobalAdmin(req))
      return res.status(403).json({ error: 'forbidden' });

    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ ok:true });
  });
};
