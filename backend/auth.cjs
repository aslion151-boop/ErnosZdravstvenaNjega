// backend/auth.cjs
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

function nowISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function tenantIdOf(req) {
  return Number(req.user?.tenant_id || 0);
}
function roleOf(req) {
  return String(req.user?.role || "").toUpperCase();
}
function catOf(req) {
  return String(req.user?.category || "").toUpperCase();
}

function makeTokenInternal(user, jwtSecret, expiresIn = "7d") {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      category: user.category,
      title: user.title,
      tenant_id: user.tenant_id,
    },
    jwtSecret,
    {
      expiresIn,
      algorithm: "HS256",   // explicit, same as default
    }
  );
}

function makeResetToken() {
  // 192 bits entropy, URL-safe
  return crypto.randomBytes(24).toString("base64url");
}

function setupAuth({ app, pool, jwtSecret }) {
  const JWT_SECRET = jwtSecret || "dev-secret";
  if (JWT_SECRET === "dev-secret") {
    console.warn(
      "[auth] WARNING: using default JWT secret. Set JWT_SECRET in production."
    );
  }

  // ============ core auth middleware ============
  async function auth(req, res, next) {
    const h = req.headers.authorization || "";
    const parts = h.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      try {
        const claims = jwt.verify(parts[1], JWT_SECRET);

        const { rows } = await pool.query(
          "SELECT id,name,email,role,category,title,tenant_id,username FROM users WHERE id=$1",
          [claims.id]
        );
        if (!rows.length) {
          return res.status(401).json({ error: "no user" });
        }
        const u = rows[0];

        // preserve tenant override from token (for /admin/switch-tenant)
        req.user = {
          ...u,
          tenant_id: claims.tenant_id ?? u.tenant_id,
        };
        return next();
      } catch (e) {
        console.error("[auth] token verify failed", e.message || e);
        return res.status(401).json({ error: "bad token" });
      }
    }
    return res.status(401).json({ error: "no token" });
  }

  async function requireMaintenance(req, res, next) {
    try {
      const { rows } = await pool.query(
        "SELECT role,category FROM users WHERE id=$1",
        [req.user.id]
      );
      const u = rows[0] || {};
      const cat = String(u.category || "").toUpperCase();
      const role = String(u.role || "").toUpperCase();
      if (role === "ADMIN" || role === "ADMIN_GLOBAL" || cat === "MAINTENANCE") {
        return next();
      }
    } catch (e) {
      console.error("[auth] requireMaintenance failed", e.message || e);
    }
    return res.status(403).json({ error: "forbidden" });
  }

  async function requireAdmin(req, res, next) {
    try {
      const { rows } = await pool.query("SELECT role FROM users WHERE id=$1", [
        req.user.id,
      ]);
      const role = String(rows[0]?.role || "").toUpperCase();
      if (role === "ADMIN" || role === "ADMIN_GLOBAL") {
        return next();
      }
    } catch (e) {
      console.error("[auth] requireAdmin failed", e.message || e);
    }
    return res.status(403).json({ error: "forbidden" });
  }

  // ============ /auth/login (tenant-aware) ============
  app.post("/auth/login", async (req, res) => {
    try {
      let {
        email,
        username,
        password,
        remember,
        tenant_id,
        tenant_slug,
      } = req.body || {};
      const login = String((email || username) || "").trim().toLowerCase();
      if (!login || !password) {
        return res.status(400).json({ error: "missing" });
      }

      const byEmail = login.includes("@");
      let u = null;

      if (byEmail) {
        const { rows } = await pool.query(
          "SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1",
          [login]
        );
        u = rows[0] || null;
      } else {
        if (tenant_id != null && tenant_id !== "") {
          const { rows } = await pool.query(
            "SELECT * FROM users WHERE LOWER(username)=LOWER($1) AND COALESCE(tenant_id,0)=COALESCE($2,0) LIMIT 1",
            [login, Number(tenant_id)]
          );
          u = rows[0] || null;
        } else if (tenant_slug) {
          const { rows } = await pool.query(
            `SELECT u.*
               FROM users u
               JOIN tenants t ON t.id = u.tenant_id
              WHERE LOWER(u.username)=LOWER($1) AND LOWER(t.slug)=LOWER($2)
              LIMIT 1`,
            [login, String(tenant_slug).toLowerCase()]
          );
          u = rows[0] || null;
        } else {
          const { rows } = await pool.query(
            "SELECT * FROM users WHERE LOWER(username)=LOWER($1) ORDER BY tenant_id NULLS LAST, id ASC LIMIT 1",
            [login]
          );
          u = rows[0] || null;
        }
      }

      if (!u) {
        return res.status(401).json({ error: "no user" });
      }

      const storedHash = u.password || u.password_hash || "";
      if (!storedHash || !bcrypt.compareSync(password, storedHash)) {
        return res.status(401).json({ error: "bad pass" });
      }

      const exp =
        String(remember) === "true" || remember === true ? "30d" : "12h";
      const token = makeTokenInternal(u, JWT_SECRET, exp);
      return res.json({ token, expiresIn: exp });
    } catch (e) {
      console.error("[/auth/login]", e);
      return res.status(500).json({ error: "server error" });
    }
  });

  // ============ /me ============
  app.get("/me", auth, async (req, res) => {
    const u = req.user;
    let tenant_name = null;
    let tenant_slug = null;

    if (u.tenant_id) {
      try {
        const { rows: tRows } = await pool.query(
          "SELECT name, slug FROM tenants WHERE id=$1",
          [u.tenant_id]
        );
        if (tRows.length) {
          tenant_name = tRows[0].name;
          tenant_slug = tRows[0].slug;
        }
      } catch (e) {
        console.error("[/me] tenant lookup failed", e.message || e);
      }
    }

    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      role: u.role,
      category: u.category,
      title: u.title,
      tenant_id: u.tenant_id,
      tenant_name,
      tenant_slug,
    });
  });

  return {
    auth,
    requireAdmin,
    requireMaintenance,
    tenantIdOf,
    roleOf,
    catOf,
    nowISO,
    makeToken: (user, expiresIn) =>
      makeTokenInternal(user, JWT_SECRET, expiresIn),
    makeResetToken,
  };
}

module.exports = { setupAuth };
