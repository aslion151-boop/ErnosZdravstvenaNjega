// backend/plugins/auth_demo.cjs
// Real DB-backed login for SPA: /auth/login, /me, /me/mcp
// Uses bcrypt hashes in password_hash (no plain-text passwords).

const bcrypt = require("bcryptjs");

const DEFAULT_TENANT_NAME =
  process.env.ERNOS_TENANT_NAME || "Mount Sackville Nursing Home";
const DEFAULT_TENANT_ID = 1;

module.exports = function setupDemoAuth(opts = {}) {
  const { app, auth, makeToken, pool } = opts;

  if (!app || !auth || !makeToken || !pool) {
    throw new Error("[auth_demo] Missing { app, auth, makeToken, pool }");
  }

  // ----------- SECURE LOGIN: username/email + password -----------
  async function loginHandler(req, res) {
    try {
      const { username, email, password } = req.body || {};
      const identRaw = String(username || email || "").trim();
      const pw = String(password || "");

      if (!identRaw || !pw) {
        return res
          .status(400)
          .json({ error: "username/email and password are required" });
      }

      const identLower = identRaw.toLowerCase();
      const isEmail = identLower.includes("@");

      // 1) First try strict matches (keeps your current behaviour)
      let rows = [];
      {
        const q = await pool.query(
          `
          SELECT id,
                 name,
                 username,
                 email,
                 role,
                 category,
                 tenant_id,
                 password_hash,
                 password
            FROM users
           WHERE lower(username) = $1
              OR lower(email)    = $1
              OR lower(name)     = $1
           ORDER BY
             CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END,
             id ASC
           LIMIT 1
          `,
          [identLower, DEFAULT_TENANT_ID]
        );
        rows = q.rows || [];
      }

      // 2) If user typed a username (no "@") and we didn't find anyone,
      //    also match against email prefix before "+" (e.g. debby+t1@local.invalid -> debby)
      if (!rows.length && !isEmail) {
        const q2 = await pool.query(
          `
          SELECT id,
                 name,
                 username,
                 email,
                 role,
                 category,
                 tenant_id,
                 password_hash,
                 password
            FROM users
           WHERE lower(split_part(split_part(email,'@',1),'+',1)) = $1
           ORDER BY
             CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END,
             id ASC
           LIMIT 1
          `,
          [identLower, DEFAULT_TENANT_ID]
        );
        rows = q2.rows || [];
      }

      if (!rows.length) {
        return res.status(401).json({ error: "invalid credentials" });
      }

      const row = rows[0];

      // Prefer password_hash; fall back to password if needed.
      const passwordHash = row.password_hash || row.password;
      if (!passwordHash) {
        return res.status(401).json({ error: "invalid credentials" });
      }

      const ok = await bcrypt.compare(pw, passwordHash);
      if (!ok) {
        return res.status(401).json({ error: "invalid credentials" });
      }

      const tenantId = row.tenant_id || DEFAULT_TENANT_ID;
      const tenantName = DEFAULT_TENANT_NAME;

      const user = {
        id: row.id,
        name: row.name || row.username || identRaw,
        username: row.username || identRaw,
        email: row.email,
        role: (row.role || "USER").toUpperCase(),
        category: (row.category || "").toUpperCase(),
        tenant_id: tenantId,
        tenant_name: tenantName,
        site: tenantName,
        facility: tenantName,
      };

      const token = makeToken(user);
      return res.json({ token, user });
    } catch (err) {
      console.error("[auth_demo] login error:", err);
      return res.status(500).json({ error: "login failed" });
    }
  }

  // ----------- /me : return JWT claims -----------
  function meHandler(req, res) {
    if (!req.user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    return res.json(req.user);
  }

  // ----------- /me/mcp : must-change-password flag -----------
  function mcpHandler(_req, res) {
    // You can wire real password-change enforcement here later
    return res.json({ must_change_password: false });
  }

  // Routes used by SPA bundle
  app.post("/auth/login", loginHandler);
  app.post("/api/auth/login", loginHandler); // alias

  app.get("/me", auth, meHandler);
  app.get("/api/me", auth, meHandler);

  // /me/mcp is safe to expose without auth: it just returns a flag.
  // Making it public avoids noisy 401s when the SPA checks it without a token.
  app.get("/me/mcp", mcpHandler);
  app.get("/api/me/mcp", mcpHandler);

  console.log(
    "[auth_demo] /auth/login, /me, /me/mcp routes registered (bcrypt-secure)"
  );
};


