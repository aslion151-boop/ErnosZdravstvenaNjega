// backend/security.cjs
// JWT, auth middlewares, and basic helpers

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("./db.cjs");

const JWT_SECRET = (process.env.JWT_SECRET || "").trim();

if (!JWT_SECRET) {
  console.error("[security] FATAL: JWT_SECRET is not set. Define it in your environment.");
  // Fail fast instead of running with an insecure default
  throw new Error("JWT_SECRET not configured");
}

/* ============ helpers that were in server.pg.cjs ============ */
function nowISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function makeToken(u, expiresIn = "7d") {
  return jwt.sign(
    {
      id: u.id,
      email: u.email,
      role: u.role,
      category: u.category,
      title: u.title,
      tenant_id: u.tenant_id,
    },
    JWT_SECRET,
    { expiresIn }
  );
}

function makeResetToken() {
  // 24 bytes -> 32+ char URL-safe token, sufficient for password reset
  return crypto.randomBytes(24).toString("base64url");
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

// Allow EventSource to pass token via query (?token=...)
// (handy when the browser can't attach Authorization header to SSE)
function allowTokenQuery(req, _res, next) {
  const qToken = String((req.query && req.query.token) || "").trim();
  if (qToken && !req.headers.authorization) {
    req.headers.authorization = "Bearer " + qToken;
  }
  next();
}

/* ============ Auth middlewares ============ */
async function auth(req, res, next) {
  // 1) Extract token from Authorization header if present
  const authHeader = req.get("authorization") || "";
  let token = null;

  const m = authHeader.match(/^bearer\s+(.+)$/i);
  if (m) {
    token = m[1].trim();
  }

  // 2) Fallback: also accept ?token= in query (for legacy callers/SSE)
  if (
    !token &&
    req.query &&
    typeof req.query.token === "string" &&
    req.query.token.trim()
  ) {
    token = req.query.token.trim();
  }

  // 3) If still no token → 401
  if (!token) {
    console.warn("[auth] 401 no token", {
      path: req.path,
      hasAuthHeader: !!authHeader,
      hasQueryToken: !!(req.query && req.query.token),
    });
    return res.status(401).json({ error: "no token" });
  }

  // 4) Verify JWT
  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    console.warn("[auth] 401 bad token", {
      path: req.path,
      name: e && e.name,
      msg: e && e.message,
    });
    return res.status(401).json({ error: "bad token" });
  }

  // 5) Look up user in DB – but FALL BACK to claims if missing
  try {
    const { rows } = await pool.query(
      "SELECT id,name,email,role,category,title,tenant_id,username FROM users WHERE id=$1",
      [claims.id]
    );

    if (!rows.length) {
      // IMPORTANT: do NOT 401 here – trust the token for now.
      console.warn("[auth] token user missing in DB, trusting claims", {
        path: req.path,
        userId: claims.id,
      });

      req.user = {
        id: claims.id,
        name: claims.name || "User",
        email: claims.email,
        role: claims.role,
        category: claims.category,
        title: claims.title || "",
        tenant_id: claims.tenant_id ?? 1,
        username: claims.username || claims.email || "user",
      };

      return next();
    }

    const u = rows[0];

    // Prefer tenant from token, fallback to DB
    req.user = {
      ...u,
      tenant_id: claims.tenant_id ?? u.tenant_id,
    };

    return next();
  } catch (e) {
    console.error("[auth] 500 auth DB error", {
      path: req.path,
      err: e && e.message,
    });
    return res.status(500).json({ error: "auth db error" });
  }
}



async function requireMaintenance(req, res, next) {
  try {
    const { rows } = await pool.query("SELECT role,category FROM users WHERE id=$1", [
      req.user.id,
    ]);
    const u = rows[0] || {};
    const cat = String(u.category || "").toUpperCase();
    const role = String(u.role || "").toUpperCase();
    if (role === "ADMIN" || role === "ADMIN_GLOBAL" || cat === "MAINTENANCE") {
      return next();
    }
  } catch (_) {}
  return res.status(403).json({ error: "forbidden" });
}

// === Admin guard: trust token, optionally refresh from DB ===
async function requireAdmin(req, res, next) {
  let role = String(req.user?.role || "").toUpperCase();
  let cat  = String(req.user?.category || "").toUpperCase();

  // Optional: refresh from DB so changes take effect without re-login
  try {
    if (req.user?.id) {
      const { rows } = await pool.query(
        "SELECT role, category FROM users WHERE id=$1",
        [req.user.id]
      );
      if (rows[0]) {
        if (rows[0].role != null) {
          role = String(rows[0].role).toUpperCase();
        }
        if (rows[0].category != null) {
          cat = String(rows[0].category).toUpperCase();
        }
      }
    }
  } catch (_) {
    // if DB lookup fails, fall back to token values
  }

  // Allow: ADMIN, ADMIN_GLOBAL, or manager-style admin category
  if (
    role === "ADMIN" ||
    role === "ADMIN_GLOBAL" ||
    cat  === "ADMIN" ||
    cat  === "MANAGER"
  ) {
    return next();
  }

  return res.status(403).json({ error: "forbidden" });
}


module.exports = {
  JWT_SECRET,
  nowISO,
  makeToken,
  makeResetToken,
  tenantIdOf,
  roleOf,
  catOf,
  allowTokenQuery,
  auth,
  requireAdmin,
  requireMaintenance,
  bcrypt, // exported so routes can use async compare if needed
};
