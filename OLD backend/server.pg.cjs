// ===============================
// File: server.pg.cjs
// Ernos backend (CommonJS) – PostgreSQL version (feature-parity)
// ===============================
try { require("dotenv").config(); } catch (_) {}

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const setupResidentsOut = require("./plugins/residents_out.cjs");
const setupPasswords = require('./plugins/passwords.cjs');

const { Pool } = require("pg");

const app = express();
app.set("trust proxy", 1);
const PORT = parseInt(process.env.PORT || "5055", 10);
const FRONTEND_DIR = process.env.FRONTEND_DIR || "frontend";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const PUBLIC_WEB_URL = (process.env.PUBLIC_WEB_URL || "").replace(/\/+$/, "");
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || "").replace(/\/+$/, "");

// Example DATABASE_URL: postgres://user:pass@localhost:5432/ernos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : false,
});

if (JWT_SECRET === "dev-secret") {
  console.warn("[warn] Using default JWT secret. Set JWT_SECRET in production.");
}

// ---------- CORS (prod: allow PUBLIC_WEB_URL; dev: allow localhost) ----------
const allowedOrigins = [PUBLIC_WEB_URL].filter(Boolean);
const devOrigins = [/^https?:\/\/localhost(:\d+)?$/i, /^https?:\/\/127\.0\.0\.1(:\d+)?$/i];

app.use(cors({
  origin: allowedOrigins.length
    ? allowedOrigins
    : function (origin, cb) {
        if (!origin) return cb(null, true); // same-origin / curl
        if (devOrigins.some(rx => rx.test(origin))) return cb(null, true);
        return cb(null, false);
      },
  credentials: true
}));
// ---------------------------------------------------------------------------

app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));



// ---------- Skin & static (Windows-safe, auto-detect) ----------
// Uses existing: path, fs, FRONTEND_DIR

// Make absolute fallback root for the old frontend
const FRONTEND_ROOT = path.isAbsolute(FRONTEND_DIR)
  ? FRONTEND_DIR
  : path.resolve(__dirname, "..", FRONTEND_DIR);

// Try several possible skin locations, first one that exists wins.
function pickSkinDir() {
  const fromEnv = process.env.SKIN_DIR && path.resolve(process.env.SKIN_DIR);
  const candidates = [
    fromEnv,                                                   // explicit override
    path.resolve(FRONTEND_ROOT, "frontend-skin"),              // <repo>/frontend/frontend-skin
    path.resolve(__dirname, "..", "frontend", "frontend-skin"),// <repo>/frontend/frontend-skin
    path.resolve(__dirname, "frontend", "frontend-skin"),      // <backend>/frontend/frontend-skin (rare)
    path.resolve(process.cwd(), "frontend", "frontend-skin"),  // cwd-relative
    path.resolve(process.cwd(), "frontend-skin"),              // cwd-relative (flat)
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

const SKIN_DIR = pickSkinDir();

if (SKIN_DIR) {
  console.log("[skin] serving from:", SKIN_DIR);
  // Serve skin assets at /skin/* and also directly at /
  app.use("/skin", express.static(SKIN_DIR));

  app.use(express.static(SKIN_DIR));

} else {
  console.warn("[skin] WARNING: no skin directory found; using fallback frontend only.");
}

// Always mount fallback app (old frontend) after skin so skin wins when both exist
app.use(express.static(FRONTEND_ROOT));

// Root route → prefer skin/index.html, else fallback/index.html, else tiny page
app.get("/", (_req, res) => {
  const tryFiles = [
    SKIN_DIR && path.join(SKIN_DIR, "index.html"),
    path.join(FRONTEND_ROOT, "index.html"),
  ].filter(Boolean);

  for (const f of tryFiles) {
    try { if (fs.existsSync(f)) return res.sendFile(f); } catch {}
  }

  res
    .status(200)
    .type("html")
    .send(`<!doctype html><meta charset="utf-8">
<title>Ernos</title>
<body style="font:14px system-ui;background:#0c1e3d;color:#f0f4fb;padding:24px">
  No <code>index.html</code> found in skin or fallback frontend.
</body>`);
});

// Favicon (avoid 404s even if skin is missing)
app.get("/favicon.ico", (_req, res) => {
  const tryIcons = [
    SKIN_DIR && path.join(SKIN_DIR, "icons", "favicon.ico"),
    SKIN_DIR && path.join(SKIN_DIR, "icons", "logo.png"),
    path.join(FRONTEND_ROOT, "icons", "favicon.ico"),
    path.join(FRONTEND_ROOT, "icons", "logo.png"),
  ].filter(Boolean);

  for (const f of tryIcons) {
    try { if (fs.existsSync(f)) return res.sendFile(f); } catch {}
  }
  // Nothing available; return no-content instead of 404
  res.status(204).end();
});

// Diagnostics (optional)
app.get("/__static_diag", (_req, res) => {
  res.json({
    __dirname,
    cwd: process.cwd(),
    FRONTEND_DIR,
    FRONTEND_ROOT,
    SKIN_DIR,
    exists: {
      skinDir:       !!SKIN_DIR && fs.existsSync(SKIN_DIR),
      skinIndex:     !!SKIN_DIR && fs.existsSync(path.join(SKIN_DIR, "index.html")),
      skinCss:       !!SKIN_DIR && fs.existsSync(path.join(SKIN_DIR, "styles.css")),
      skinJs:        !!SKIN_DIR && fs.existsSync(path.join(SKIN_DIR, "app.js")),
      skinLogo:      !!SKIN_DIR && fs.existsSync(path.join(SKIN_DIR, "icons", "logo.png")),
      fallbackDir:   fs.existsSync(FRONTEND_ROOT),
      fallbackIndex: fs.existsSync(path.join(FRONTEND_ROOT, "index.html")),
    },
  });
});

// ---------- end Skin & static ----------



app.get("/__kill_sw", (_req, res) => {
  res.type("html").send(`<!doctype html>
<meta charset="utf-8">
<title>Kill SW</title>
<body style="font:14px system-ui;background:#0c1e3d;color:#f0f4fb;padding:24px">
  <h3>Unregistering any service workers…</h3>
  <pre id="out"></pre>
  <script>
    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations?.() || [];
        for (const r of regs) { await r.unregister(); }
        document.getElementById('out').textContent =
          'Done. Hard-refresh (Ctrl+F5) and reload /. ' + regs.length + ' SW unregistered.';
      } catch (e) {
        document.getElementById('out').textContent = 'No SW or failed: ' + (e && e.message || e);
      }
    })();
  </script>
</body>`);
});
// ---------- end Skin & static ----------


/* ================= Helpers ================= */
function nowISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
function makeToken(u, expiresIn = "7d") {
  return jwt.sign(
    {
      id: u.id, email: u.email, role: u.role, category: u.category,
      title: u.title, tenant_id: u.tenant_id,
    },
    JWT_SECRET,
    { expiresIn }
  );
}

function tenantIdOf(req) {
  return Number(req.user?.tenant_id || 0);
}
function rowsToCsv(rows) {
  if (!rows || !rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n")
  );
}
// ✅ makeTempPassword must be available to /admin/tenants
function makeTempPassword(len = 10) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
/* ================= Tenant Config helpers ================= */
const DEFAULT_CONFIG = {
  schedules: {
    fridge: { min_c: 2, max_c: 8, due_hours: 24, alert_by: "12:00" },
    fire:   { panel_days: 7, extinguisher_days: 30, drill_days: 90 },
    env_audit: { frequency_days: 30 },
    alerts: {
      visitors_overdue_hours: 3,
      housekeeping_overdue_minutes: 60,
      night_window: { start: "20:00", end: "07:00" }
    }
  },
  access: {
    fridge:     { view: ["ADMIN","NURSING","HOUSEKEEPING"], edit: ["ADMIN"] },
    fire:       { view: ["ADMIN","MAINTENANCE"],            edit: ["ADMIN","MAINTENANCE"] },
    env_audit:  { view: ["ADMIN","AUDITOR"],                edit: ["ADMIN","AUDITOR"] },
    training:   { view: ["ADMIN"],                          edit: ["ADMIN"] },
    activities: { view: ["ADMIN","RECEPTION"],              edit: ["ADMIN","RECEPTION"] },
    visitors:   { view: ["ADMIN","RECEPTION"],              edit: ["ADMIN","RECEPTION"] },
    issues:     { view: ["ADMIN","MAINTENANCE"],            edit: ["ADMIN","MAINTENANCE"] },
    visits:     { view: ["ADMIN","NURSING","HOUSEKEEPING"], edit: ["ADMIN","HOUSEKEEPING"] }
  }
};

function deepMerge(a, b){
  if (!a || typeof a !== "object") return b;
  const out = Array.isArray(a) ? a.slice() : { ...a };
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) {
      out[k] = deepMerge(a[k] || {}, b[k]);
    } else {
      out[k] = b[k];
    }
  }
  return out;
}

async function getTenantConfig(tid){
  try{
    const { rows } = await pool.query("SELECT data FROM tenant_config WHERE tenant_id=$1", [tid]);
    const data = rows[0]?.data || {};
    return deepMerge(DEFAULT_CONFIG, data || {});
  }catch(_){
    return DEFAULT_CONFIG;
  }
}

function roleOf(req){ return String(req.user?.role || "").toUpperCase(); }
function catOf(req){  return String(req.user?.category || "").toUpperCase(); }

function canView(module, cfg, req){
  const r = roleOf(req), c = catOf(req);
  if (r === "ADMIN" || r === "ADMIN_GLOBAL") return true;
  const allow = ((cfg.access || {})[module] || {}).view || [];
  return allow.includes(r) || allow.includes(c);
}
function canEdit(module, cfg, req){
  const r = roleOf(req), c = catOf(req);
  if (r === "ADMIN" || r === "ADMIN_GLOBAL") return true;
  const allow = ((cfg.access || {})[module] || {}).edit || [];
  return allow.includes(r) || allow.includes(c);
}
// Allow EventSource to pass token via query (?token=...)
// (handy when the browser can't attach Authorization header to SSE)
function allowTokenQuery(req, _res, next) {
  const qToken = String((req.query && req.query.token) || '').trim();
  if (qToken && !req.headers.authorization) {
    req.headers.authorization = 'Bearer ' + qToken;
  }
  next();
}

/* ================= SSE (events) ================= */
// Simple Server-Sent Events hub used by visitors/issues/visits/etc.
const sseClients = new Set();

function sendEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) {}
  }
}

// expose to routes/plugins (they already call sendEvent in your file)
app.locals.sendEvent = sendEvent;

// Live events stream (no auth: frontend may not send JWT on EventSource)
app.get("/events", allowTokenQuery, (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  res.flushHeaders?.();

  // Initial handshake event
  try { res.write("event: ready\ndata: {}\n\n"); } catch (_) {}

  sseClients.add(res);

  // Keep-alive comment every 25s (prevents some proxies from closing)
  const keepAlive = setInterval(() => {
    try { res.write(`:ka ${Date.now()}\n\n`); } catch (_) {}
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

/* ================= Auth middlewares ================= */
async function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const parts = h.split(" ");
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
    try {
      const claims = jwt.verify(parts[1], JWT_SECRET);
      // Load fresh snapshot of the user
      const { rows } = await pool.query(
        "SELECT id,name,email,role,category,title,tenant_id FROM users WHERE id=$1",
        [claims.id]
      );
      if (!rows.length) return res.status(401).json({ error: "no user" });
      const u = rows[0];
      // ✅ Preserve tenant_id from the token (used after /admin/switch-tenant)
      req.user = { ...u, tenant_id: claims.tenant_id ?? u.tenant_id };
      return next();
    } catch (e) {
      return res.status(401).json({ error: "bad token" });
    }
  }
  return res.status(401).json({ error: "no token" });
}

async function requireMaintenance(req, res, next) {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [
      req.user.id,
    ]);
    const u = rows[0];
    const cat = String(u?.category || "").toUpperCase();
    const role = String(u?.role || "").toUpperCase();
    if (role === "ADMIN" || cat === "MAINTENANCE") return next();
  } catch (_) {}
  return res.status(403).json({ error: "forbidden" });
}
async function requireAdmin(req, res, next) {
  try {
    const { rows } = await pool.query("SELECT role FROM users WHERE id=$1", [
      req.user.id,
    ]);
    const role = String(rows[0]?.role || "").toUpperCase();
    if (role === "ADMIN" || role === "ADMIN_GLOBAL") return next();
  } catch (_) {}
  return res.status(403).json({ error: "forbidden" });
}

// === Fridge & Fire plugin (Windows-safe path) ===
const setupFridgeFire = require(path.join(__dirname, 'plugins', 'fridge_fire.cjs'));
setupFridgeFire({
  app,
  pool,
  auth,
  PUBLIC_API_URL,
  nowISO,
  tenantIdOf,
  roleOf,
  catOf,
});

const setupIssues = require(path.join(__dirname, 'plugins', 'issues.cjs'));
setupIssues({ app, pool, auth, tenantIdOf });

// === Attachments plugin (Windows-safe path + writable upload dir) ===
const setupAttachments = require(path.join(__dirname, 'plugins', 'attachments.cjs'));

// Choose a writable upload directory (avoid Program Files)
const DEFAULT_UPLOAD_DIR =
  process.env.ERNOS_UPLOAD_DIR ||
  path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Ernosapp', 'uploads');

try { fs.mkdirSync(DEFAULT_UPLOAD_DIR, { recursive: true }); } catch {}

setupAttachments({
  app,
  pool,
  auth,
  uploadDir: DEFAULT_UPLOAD_DIR,
  // publicBaseUrl: 'https://your-domain.example' // optional
});
// === Push plugin (Windows-safe path)
{
  const pushModPath = path.join(__dirname, 'plugins', 'push.cjs');
  const pushMod = require(pushModPath);

  // Accept either: module.exports = function (...) { … }  OR  module.exports = { setupPush(...) { … } }
  const setupPush =
    typeof pushMod === 'function'
      ? pushMod
      : (pushMod && typeof pushMod.setupPush === 'function' ? pushMod.setupPush : null);

  if (!setupPush) {
    throw new Error(
      `[push] ${pushModPath} must export a function or { setupPush }. Got: ` +
      (pushMod === null ? 'null' : typeof pushMod)
    );
  }

  setupPush({
    app,
    pool,
    auth,
    VAPID_PUBLIC_KEY:  process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT:     process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    tenantIdOf: (req) => Number(req.user?.tenant_id || 0),
  });

  // Expose the VAPID public key to the browser (kept here for clarity)
  app.get("/push/public-key", (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY || "";
    if (!key) return res.status(400).json({ error: "push not configured" });
    res.json({ key });
  });
}


// near your other plugins
require(path.join(__dirname, 'plugins', 'staff.cjs'))({
  app, pool, auth,
  tenantIdOf: (req) => Number(req.user?.tenant_id || 0),
  roleOf:     (req) => String(req.user?.role || '').toUpperCase(),
});
// === Visitors plugin (Windows-safe path)
const setupVisitors = require(require('path').join(__dirname, 'plugins', 'visitors.cjs'));
setupVisitors({
  app, pool, auth,
  tenantIdOf: (req) => Number(req.user?.tenant_id || 0),
});
// put this near other helpers, before setupPasswords(...)
async function sendMail({ to, subject, html, text }) {
  // TODO: swap with nodemailer in production
  console.log('[mail] to=%s subject=%s\n%s', to, subject, text || html || '');
}


// Passwords: forgot/reset/change + must-change flag
setupPasswords({
  app,
  pool,
  auth, // must set req.user for /me/password and /me/mcp
  baseUrl: process.env.APP_BASE_URL || 'https://YOUR_PUBLIC_HOST', // used in the email reset link
  sendMail, // your mailer
  tenantIdOf, // ensure tokens are tenant-scoped
});


/* ================= DB INIT / MIGRATIONS ================= */
async function runMigrations() {
  const sql = `
  -- Tenants
  CREATE TABLE IF NOT EXISTS tenants (
    id   SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE
  );

  -- Users
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT,
    category TEXT,
    title TEXT,
    tenant_id INTEGER REFERENCES tenants(id)
  );
-- Username support (tenant-scoped, case-insensitive unique)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

-- Drop legacy global-unique index so same username can exist in different tenants
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_users_username_nocase'
  ) THEN
    DROP INDEX uniq_users_username_nocase;
  END IF;
END$$;

-- Create tenant-scoped unique index (ignore NULL/empty usernames)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'ux_users_tenant_lcusername'
  ) THEN
    CREATE UNIQUE INDEX ux_users_tenant_lcusername
      ON users (COALESCE(tenant_id, 0), LOWER(username))
      WHERE username IS NOT NULL AND username <> '';
  END IF;
END$$;

  -- Backfill username from email local-part if empty
  UPDATE users
  SET username = COALESCE(NULLIF(username, ''), SPLIT_PART(email, '@', 1))
  WHERE (username IS NULL OR username = '')
    AND email IS NOT NULL AND email <> '';

  -- Locations
  CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name TEXT,
    type TEXT,
    active BOOLEAN DEFAULT TRUE,
    tenant_id INTEGER REFERENCES tenants(id)
  );
-- ================= Nursing & Housekeeping operational logs =================

-- Nursing checks (resident rounds)
CREATE TABLE IF NOT EXISTS nursing_checks(
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  user_id     INTEGER,
  location_id INTEGER,
  taken_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nursing_checks_tenant_loc
  ON nursing_checks(tenant_id, location_id, taken_at DESC);

-- Housekeeping asset checks
CREATE TABLE IF NOT EXISTS housekeeping_checks(
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  location_id   INTEGER,
  location_name TEXT,
  note          TEXT,
  by_user_id    INTEGER,
  by_user_name  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_housekeeping_checks_tenant
  ON housekeeping_checks(tenant_id, created_at DESC);

  -- QRCodes
  CREATE TABLE IF NOT EXISTS qrcodes (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    tenant_id INTEGER REFERENCES tenants(id)
  );

  -- Checkins
  CREATE TABLE IF NOT EXISTS checkins (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    checkin_at TIMESTAMPTZ,
    checkout_at TIMESTAMPTZ,
    note TEXT,
    user_name TEXT,
    user_category TEXT,
    location_name TEXT,
    tenant_id INTEGER REFERENCES tenants(id)
  );

  -- Visitors
  CREATE TABLE IF NOT EXISTS visitors (
    id SERIAL PRIMARY KEY,
    primary_name TEXT,
    names JSONB,
    resident TEXT,
    checkin_at TIMESTAMPTZ,
    checkout_at TIMESTAMPTZ,
    tenant_id INTEGER REFERENCES tenants(id)
  );
  ALTER TABLE visitors ADD COLUMN IF NOT EXISTS signature_png TEXT;

  -- Issues (now tenant-scoped)
  CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name TEXT,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    location_name TEXT,
    category TEXT,
    text TEXT,
    status TEXT,
    accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    accepted_by_name TEXT,
    accepted_at TIMESTAMPTZ,
    maintenance_comment TEXT,
    tenant_id INTEGER REFERENCES tenants(id)
  );

  -- Environmental Audit
  CREATE TABLE IF NOT EXISTS env_questions (
    id SERIAL PRIMARY KEY,
    section TEXT,
    text TEXT
  );
  CREATE TABLE IF NOT EXISTS env_audits (
    id SERIAL PRIMARY KEY,
    name TEXT,
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    auditor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    auditor_name TEXT,
    overall_score INTEGER,
    status TEXT
  );
  CREATE TABLE IF NOT EXISTS env_audit_locations (
    id SERIAL PRIMARY KEY,
    audit_id INTEGER REFERENCES env_audits(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    location_name TEXT
  );
  -- Web Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER REFERENCES tenants(id),
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  endpoint   TEXT UNIQUE,
  data       JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_push_endpoint ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tenant ON push_subscriptions(tenant_id);

  CREATE TABLE IF NOT EXISTS env_audit_answers (
    id SERIAL PRIMARY KEY,
    audit_loc_id INTEGER REFERENCES env_audit_locations(id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES env_questions(id) ON DELETE CASCADE,
    answer TEXT,
    comment TEXT
  );
-- Password reset tokens (plugin-compatible)
CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   INTEGER REFERENCES tenants(id),
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Back-compat: add missing columns on older installs
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE password_resets ALTER COLUMN created_at SET DEFAULT NOW();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_password_resets_user_expires
  ON password_resets(user_id, expires_at)
  WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_resets_token
  ON password_resets(token);


-- Optional hardening: scope environmental audits by tenant
ALTER TABLE env_audits ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_env_audits_tenant ON env_audits(tenant_id);

ALTER TABLE env_audit_locations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_env_audit_locations_tenant ON env_audit_locations(tenant_id);

ALTER TABLE env_audit_answers ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_env_audit_answers_tenant ON env_audit_answers(tenant_id);

-- Backfill audit tenant_id from linked locations, where available
UPDATE env_audits a
SET tenant_id = l.tenant_id
FROM env_audit_locations al
JOIN locations l ON l.id = al.location_id
WHERE al.audit_id = a.id AND (a.tenant_id IS NULL OR a.tenant_id=0);

UPDATE env_audit_locations al
SET tenant_id = l.tenant_id
FROM locations l
WHERE al.location_id = l.id AND (al.tenant_id IS NULL OR al.tenant_id=0);

UPDATE env_audit_answers aa
SET tenant_id = al.tenant_id
FROM env_audit_locations al
WHERE aa.audit_loc_id = al.id AND (aa.tenant_id IS NULL OR aa.tenant_id=0);

-- Resident Outings (tap OUT/IN)
CREATE TABLE IF NOT EXISTS resident_outings (
  id           SERIAL PRIMARY KEY,
  resident     TEXT NOT NULL,
  escort       TEXT,
  note         TEXT,
  out_at       TIMESTAMPTZ,
  in_at        TIMESTAMPTZ,
  location_id  INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  tenant_id    INTEGER REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_resident_outings_tenant ON resident_outings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_resident_outings_open   ON resident_outings(in_at) WHERE in_at IS NULL;

  -- ================= NEW: per-site config & feature tables =================

  CREATE TABLE IF NOT EXISTS tenant_config (
    tenant_id   INTEGER PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ
  );

  INSERT INTO tenant_config(tenant_id, data, updated_at)
  SELECT t.id,
         '{
            "schedules":{
              "fridge":{"min_c":2,"max_c":8,"due_hours":24,"alert_by":"12:00"},
              "fire":{"panel_days":7,"extinguisher_days":30,"drill_days":90},
              "env_audit":{"frequency_days":30},
              "alerts":{
                "visitors_overdue_hours":3,
                "housekeeping_overdue_minutes":60,
                "night_window":{"start":"20:00","end":"07:00"}
              }
            },
            "access":{
              "fridge":{"view":["ADMIN","NURSING","HOUSEKEEPING"],"edit":["ADMIN"]},
              "fire":{"view":["ADMIN","MAINTENANCE"],"edit":["ADMIN","MAINTENANCE"]},
              "env_audit":{"view":["ADMIN","AUDITOR"],"edit":["ADMIN","AUDITOR"]},
              "training":{"view":["ADMIN"],"edit":["ADMIN"]},
              "activities":{"view":["ADMIN","RECEPTION"],"edit":["ADMIN","RECEPTION"]},
              "visitors":{"view":["ADMIN","RECEPTION"],"edit":["ADMIN","RECEPTION"]},
              "issues":{"view":["ADMIN","MAINTENANCE"],"edit":["ADMIN","MAINTENANCE"]},
              "visits":{"view":["ADMIN","NURSING","HOUSEKEEPING"],"edit":["ADMIN","HOUSEKEEPING"]}
            }
          }'::jsonb,
         NOW()
  FROM tenants t
  WHERE NOT EXISTS (SELECT 1 FROM tenant_config c WHERE c.tenant_id = t.id);

    -- Helpful indexes
  CREATE INDEX IF NOT EXISTS idx_checkins_open ON checkins (location_id) WHERE checkout_at IS NULL;

  -- Fix visitors open index to be partial
  DROP INDEX IF EXISTS idx_visitors_open;
  CREATE INDEX IF NOT EXISTS idx_visitors_open ON visitors (checkout_at) WHERE checkout_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_issues_status ON issues (status);

  -- Add missing tenant_id columns if tables existed before (idempotent)
  ALTER TABLE users     ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
  ALTER TABLE locations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
  ALTER TABLE qrcodes   ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
  ALTER TABLE checkins  ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
  ALTER TABLE visitors  ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
  ALTER TABLE issues    ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);

  -- Tenant indexes
  CREATE INDEX IF NOT EXISTS idx_users_tenant     ON users(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_locations_tenant ON locations(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_qrcodes_tenant   ON qrcodes(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_checkins_tenant  ON checkins(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_visitors_tenant  ON visitors(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_issues_tenant    ON issues(tenant_id);

  -- Backfill issues.tenant_id from location if missing
  UPDATE issues i
  SET tenant_id = l.tenant_id
  FROM locations l
  WHERE i.location_id = l.id
    AND (i.tenant_id IS NULL OR i.tenant_id = 0);

  -- Enforce unique per (audit_loc_id, question_id) to avoid duplicates
WITH ranked AS (
  SELECT
    id,
    audit_loc_id,
    question_id,
    ROW_NUMBER() OVER (
      PARTITION BY audit_loc_id, question_id
      ORDER BY id DESC
    ) AS rn
  FROM env_audit_answers
)
DELETE FROM env_audit_answers e
USING ranked r
WHERE e.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'env_audit_answers_unique'
  ) THEN
    ALTER TABLE env_audit_answers
      ADD CONSTRAINT env_audit_answers_unique
      UNIQUE (audit_loc_id, question_id);
  END IF;
END$$;
  `;
  await pool.query(sql);
}
// Ensure we have at least one tenant
async function ensureDefaultTenant() {
  const t = await pool.query("SELECT id FROM tenants ORDER BY id LIMIT 1");
  if (!t.rows.length) {
    const ins = await pool.query(
      "INSERT INTO tenants(name,slug) VALUES ($1,$2) RETURNING id",
      ["Default Tenant", "default-tenant"]
    );
    console.log("[seed] Default tenant created with id", ins.rows[0].id);
  }
}

async function seedAdmin() {
  const email = "admin@example.com";

  // there is at least one tenant because ensureDefaultTenant() runs before this
  const t = await pool.query("SELECT id FROM tenants ORDER BY id LIMIT 1");
  const tenantId = t.rows[0].id;

  const have = await pool.query(
    "SELECT id, email, role, tenant_id FROM users WHERE LOWER(email)=LOWER($1)",
    [email]
  );
  if (!have.rows.length) {
    const hash = bcrypt.hashSync("Password123", 8);
    await pool.query(
      "INSERT INTO users(name,email,password,role,category,title,tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      ["Admin", email.toLowerCase(), hash, "ADMIN", "NURSING", "DON", tenantId]
    );
    console.log("[seed] Admin created:", email);
  } else {
    const u = have.rows[0];
    if (String(u.role || "").toUpperCase() !== "ADMIN") {
      await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [u.id]);
      console.log("[seed] Existing user promoted to ADMIN:", email);
    }
    if (!u.tenant_id) {
      await pool.query("UPDATE users SET tenant_id=$1 WHERE id=$2", [
        tenantId,
        u.id,
      ]);
      console.log("[seed] Admin tenant_id backfilled to", tenantId);
    }
  }

  if (process.env.FORCE_ADMIN_RESET === "1") {
    const hash = bcrypt.hashSync("Password123", 8);
    await pool.query("UPDATE users SET password=$1 WHERE email=$2", [
      hash,
      email,
    ]);
    console.log("[seed] Admin password reset to default.");
  }
}
async function seedSuperadmin() {
  const email = (process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) return; // no superadmin seeding requested

  const pass = (process.env.SUPERADMIN_PASSWORD || "SuperAdmin123").trim();
  const have = await pool.query(
    "SELECT id, role FROM users WHERE LOWER(email)=LOWER($1)",
    [email]
  );
  const hash = bcrypt.hashSync(pass, 8);

  if (!have.rows.length) {
    await pool.query(
      `INSERT INTO users(name,email,password,role,category,title,tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      ["Superadmin", email, hash, "ADMIN_GLOBAL", "NURSING", "DON", null]
    );
    console.log("[seed] Superadmin created:", email);
  } else {
    const u = have.rows[0];
    if (String(u.role || "").toUpperCase() !== "ADMIN_GLOBAL") {
      await pool.query(
        "UPDATE users SET role='ADMIN_GLOBAL', password=$1 WHERE LOWER(email)=LOWER($2)",
        [hash, email]
      );
      console.log("[seed] Existing user promoted to ADMIN_GLOBAL:", email);
    }
  }
}

async function seedQuestions(){
  // Expanded HIQA-style list (>=15). Add more here safely.
  const list = [
    ["General Environment","Are all areas visibly clean and free from clutter?"],
    ["General Environment","Is the environment free from unpleasant odours?"],
    ["General Environment","Is lighting adequate across areas?"],
    ["General Environment","Is ventilation adequate in all areas?"],

    ["Health & Safety","Are fire exits clearly marked and unobstructed?"],
    ["Health & Safety","Are fire doors functioning and not propped open?"],
    ["Health & Safety","Is emergency lighting tested and working?"],

    ["Infection Prevention & Control","Are alcohol hand gel dispensers available and filled?"],
    ["Infection Prevention & Control","Are sinks with soap and paper towels available where needed?"],
    ["Infection Prevention & Control","Is PPE available and stored appropriately?"],

    ["Maintenance & Equipment","Is equipment clean and in good working order?"],
    ["Maintenance & Equipment","Evidence of regular servicing/maintenance of equipment?"],

    ["Resident Comfort & Dignity","Are bedrooms personalised and homely?"],
    ["Resident Comfort & Dignity","Are bathrooms clean, accessible, and private?"],

    ["Medication & Sharps","Are medicines and sharps stored securely?"],
    ["Waste Management","Is clinical and domestic waste segregated and disposed correctly?"],
    ["Staff & Visitors","Are hand hygiene notices visible and up to date?"],
    ["Records & Signage","Are safety notices and incident reporting info clearly displayed?"],
    ["Slips/Trips/Falls","Are floors dry, even, and free from trailing cables?"],
    ["Fire Safety","Are extinguishers present, accessible, and in-date?"]
  ];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [section, text] of list) {
      await client.query(
        `INSERT INTO env_questions(section, text)
         SELECT $1, $2
         WHERE NOT EXISTS (
           SELECT 1 FROM env_questions WHERE section = $1 AND text = $2
         )`,
        [section, text]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}


/* ================= Utility ================= */
function normalizeToken(raw) {
  let t = String(raw || "").trim();
  try { t = decodeURIComponent(t); } catch (_) {}
  if (t.startsWith("#")) t = t.slice(1);
  if (/^https?:\/\//i.test(t)) {
    const parts = t.split("#");
    t = parts[1] || t.split("/").pop();
  }
  if (/^ci\//i.test(t)) t = t.slice(3);
  if (/^reception\//i.test(t)) t = t.slice(10);
  if (/^env\//i.test(t)) t = t.slice(4);
  if (t.includes("/")) t = t.split("/").pop();
  return t;
}

/* ================= AUTH ================= */
// ================= AUTH (tenant-aware) =================
app.post("/auth/login", async (req, res) => {
  try {
    let { email, username, password, remember, tenant_id, tenant_slug } = req.body || {};
    const login = String((email || username) || "").trim().toLowerCase();
    if (!login || !password) return res.status(400).json({ error: "missing" });

    const byEmail = login.includes("@");
    let u = null;

    if (byEmail) {
      // Email path: email is globally unique in your schema
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1",
        [login]
      );
      u = rows[0] || null;
    } else {
      // USERNAME path: MUST scope to tenant to avoid matching another site's user
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
        // Back-compat fallback: deterministically pick one (not recommended).
        // Prefer sending tenant_id or tenant_slug from the client.
        const { rows } = await pool.query(
          "SELECT * FROM users WHERE LOWER(username)=LOWER($1) ORDER BY tenant_id NULLS LAST, id ASC LIMIT 1",
          [login]
        );
        u = rows[0] || null;
      }
    }

    if (!u) return res.status(401).json({ error: "no user" });

    const storedHash = u.password || u.password_hash || "";
    if (!bcrypt.compareSync(password, storedHash)) {
      return res.status(401).json({ error: "bad pass" });
    }

    // 12h when not remembered, 30d when remembered
    const exp = (String(remember) === "true" || remember === true) ? "30d" : "12h";
    const token = makeToken(u, exp);
    res.json({ token, expiresIn: exp });
  } catch (e) {
    console.error("[/auth/login]", e);
    res.status(500).json({ error: "server error" });
  }
});

// Helper to create a one-time reset token
function makeResetToken() {
  return require("crypto").randomBytes(24).toString("base64url");
}


/* ================= ME ================= */
app.get("/me", auth, async (req, res) => {
  // Use req.user (already honors switched tenant_id), then look up tenant meta
  const u = req.user;
  let tenant_name = null, tenant_slug = null;
  if (u.tenant_id) {
    const { rows: t } = await pool.query(
      "SELECT name, slug FROM tenants WHERE id=$1",
      [u.tenant_id]
    );
    if (t.length) {
      tenant_name = t[0].name;
      tenant_slug = t[0].slug;
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

/* ================= USERS (handled by plugins/staff.cjs) ================= */
// Intentionally empty. All /users routes are provided by backend/plugins/staff.cjs.

/* ================= LOCATIONS ================= */
app.get("/locations", auth, async (req, res) => {
  const tid = tenantIdOf(req);
  const { rows } = await pool.query(
    "SELECT id,name,type,active FROM locations WHERE tenant_id=$1 ORDER BY id",
    [tid]
  );
  if (String((req.query || {}).csv || "") === "1") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=locations.csv");
    return res.send(rowsToCsv(rows));
  }
  res.json({ items: rows });
});

app.post("/locations", auth, async (req, res) => {
  const { name, type } = req.body || {};
  if (!name || !type) return res.status(400).json({ error: "missing" });

  const tid = tenantIdOf(req);
  if (!tid) return res.status(403).json({ error: "no tenant" });

  const { rows } = await pool.query(
    "INSERT INTO locations(tenant_id,name,type,active) VALUES ($1,$2,$3,TRUE) RETURNING id",
    [tid, name, String(type).toUpperCase()]
  );
  res.json({ id: rows[0].id });
});

app.patch("/locations/:id", auth, async (req, res) => {
  const tid = tenantIdOf(req);
  const { active } = req.body || {};
  await pool.query(
    "UPDATE locations SET active=$1 WHERE id=$2 AND tenant_id=$3",
    [!!active, req.params.id, tid]
  );
  res.json({ ok: true });
});

app.delete("/locations/:id", auth, async (req, res) => {
  const tid = tenantIdOf(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM qrcodes WHERE location_id=$1 AND tenant_id=$2",
      [req.params.id, tid]
    );
    await client.query(
      "DELETE FROM locations WHERE id=$1 AND tenant_id=$2",
      [req.params.id, tid]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

/* ================= QR / NFC ================= */
function makeTokenString () {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

app.post("/qrcodes", auth, requireAdmin, async (req, res) => {
  const tid = tenantIdOf(req);
  const { locationId } = req.body || {};
  if (!locationId) return res.status(400).json({ error: "locationId required" });

  // Ensure location belongs to this tenant
  const { rows: locRows } = await pool.query(
    "SELECT id, tenant_id, type FROM locations WHERE id=$1 AND tenant_id=$2",
    [locationId, tid]
  );
  if (!locRows.length) return res.status(404).json({ error: "no location" });

  const tok = makeTokenString();
  await pool.query(
    "INSERT INTO qrcodes(token,location_id,tenant_id) VALUES ($1,$2,$3)",
    [tok, locationId, tid]
  );

  // Compute public base (prefer env, otherwise from proxy/req)
  const xfProto = (req.headers["x-forwarded-proto"] || "").split(",")[0] || "";
  const proto   = xfProto || (req.secure ? "https" : req.protocol || "http");
  const host    = req.headers["x-forwarded-host"] || req.get("host");
  const computed = `${proto}://${host}`;
  const base = (process.env.PUBLIC_API_URL || computed).replace(/\/+$/, "");

  // Unified auto router
  const tapAuto = `${base}/tap/u/${tok}`;

  // New-type aware deep links
  const type = String(locRows[0].type || "").trim().toUpperCase();

  const urlTapRoom   = `${base}/tap/nursing/room/${tok}`;
  const urlTapAsset  = `${base}/tap/nursing/asset/${tok}`;
  const urlTapFridge = `${base}/tap/fridge/${tok}`;
  const urlTapFire   = `${base}/tap/fire/${tok}`;
  const urlTapCi     = `${base}/tap/ci/${tok}`; // generic HK/maint toggle

  // Choose best default based on location type
  let tap = tapAuto;
  switch (type) {
    case "ROOM":   tap = urlTapRoom;   break;
    case "ASSET":  tap = urlTapAsset;  break;
    case "FRIDGE": tap = urlTapFridge; break;
    case "FIRE":   tap = urlTapFire;   break;
    default:       tap = tapAuto;      break; // let /tap/u decide or fall back
  }

  res.json({
    token: tok,
    urlTap: tap,          // primary link to print on the QR
    urlTapAuto: tapAuto,  // always include the smart router
    urlTapCi,             // handy if you need HK/maint flow
    urlTapRoom,
    urlTapAsset,
    urlTapFridge,
    urlTapFire
  });
});


/* ================= TAP PERFORM (HK/Nursing/Maint) ================= */
app.post("/tap/ci/perform", auth, async (req, res) => {
  const { token } = req.body || {};
  const norm = normalizeToken(token || "");
  const { rows: qrRows } = await pool.query(
    "SELECT * FROM qrcodes WHERE token=$1",
    [norm]
  );
  if (!qrRows.length) return res.status(404).json({ error: "bad token" });
  const qr = qrRows[0];
  const { rows: locRows } = await pool.query(
    "SELECT * FROM locations WHERE id=$1",
    [qr.location_id]
  );
  if (!locRows.length) return res.status(404).json({ error: "no location" });
  const loc = locRows[0];
  const { rows: userRows } = await pool.query(
    "SELECT * FROM users WHERE id=$1",
    [req.user.id]
  );
  if (!userRows.length) return res.status(401).json({ error: "no user" });
  const u = userRows[0];

  // Is there an open check-in by this user at this location?
  const { rows: openRows } = await pool.query(
    `SELECT * FROM checkins
     WHERE user_id=$1 AND location_id=$2 AND checkout_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [u.id, loc.id]
  );
  if (openRows.length) {
    const open = openRows[0];
    const end = nowISO();
    await pool.query("UPDATE checkins SET checkout_at=$1 WHERE id=$2", [
      end,
      open.id,
    ]);
    const { rows: d } = await pool.query(
      `SELECT EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/60 AS minutes
       FROM checkins WHERE id=$1`,
      [open.id]
    );
    const durationMin =
      d[0]?.minutes != null
        ? Math.max(0, Math.round(Number(d[0].minutes)))
        : null;
    sendEvent("visits", {});
    return res.json({
      ok: true,
      action: "checkout",
      role: u.category || "",
      locationName: loc.name,
      started_at: open.checkin_at,
      ended_at: end,
      durationMin,
    });
  } else {
    const tid = loc.tenant_id || tenantIdOf(req);
    const ins = await pool.query(
      `INSERT INTO checkins(user_id,location_id,checkin_at,checkout_at,note,user_name,user_category,location_name,tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        u.id,
        loc.id,
        nowISO(),
        null,
        "",
        u.name,
        u.category || "",
        loc.name,
        tid,
      ]
    );
    sendEvent("visits", {});
    return res.json({
      ok: true,
      action: "checkin",
      role: u.category || "",
      locationName: loc.name,
      checkinId: ins.rows[0].id,
      started_at: nowISO(),
    });
  }
});


/* Auditor-only TAP page and Universal TAP routes: keep original HTML pages */

/* ================= CHECKINS ================= */
app.get("/checkins", auth, async (req, res) => {
  const tid = tenantIdOf(req);
  const { csv, from, to, category, locationId, userId } = req.query || {};

  const filters = ["tenant_id=$1"];
  const params = [tid];

  if (from) {
    params.push(from);
    filters.push(`checkin_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    filters.push(`(checkout_at <= $${params.length} OR checkout_at IS NULL)`);
  }
  if (category) {
    params.push(String(category).toUpperCase());
    filters.push(`UPPER(user_category) = $${params.length}`);
  }
  if (locationId) {
    params.push(parseInt(String(locationId), 10));
    filters.push(`location_id = $${params.length}`);
  }
  if (userId) {
    params.push(parseInt(String(userId), 10));
    filters.push(`user_id = $${params.length}`);
  }

  const where = "WHERE " + filters.join(" AND ");

 if (String(csv || "") === "1") {
  const { rows } = await pool.query(
    `SELECT * FROM checkins ${where} ORDER BY id DESC`,
    params
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=checkins.csv");
  return res.send(rowsToCsv(rows));
}

// ✅ NEW: allow ?open=1 (default) or ?open=0 for full history
const onlyOpen = String(req.query?.open || "1") === "1";
const sql = `SELECT * FROM checkins ${where} ${onlyOpen ? "AND checkout_at IS NULL" : ""} ORDER BY id DESC`;
const { rows } = await pool.query(sql, params);
res.json({ items: rows });

});

app.post("/checkin", auth, async (req, res) => {
  const tid = tenantIdOf(req);
  const { locationId, note } = req.body || {};
  if (!locationId) return res.status(400).json({ error: "locationId required" });

  const { rows: locRows } = await pool.query(
    "SELECT * FROM locations WHERE id=$1 AND tenant_id=$2",
    [locationId, tid]
  );
  if (!locRows.length) return res.status(404).json({ error: "no location" });
  const loc = locRows[0];

  const { rows: uRows } = await pool.query("SELECT * FROM users WHERE id=$1", [
    req.user.id,
  ]);
  const u = uRows[0];

  const ins = await pool.query(
    `INSERT INTO checkins(user_id,location_id,checkin_at,checkout_at,note,user_name,user_category,location_name,tenant_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      u.id,
      loc.id,
      nowISO(),
      null,
      note || "",
      u.name,
      u.category || "",
      loc.name,
      tid,
    ]
  );
  sendEvent("visits", {});
  res.json({ id: ins.rows[0].id });
});

app.post("/checkout", auth, async (req, res) => {
  const { checkinId } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM checkins WHERE id=$1", [
    checkinId,
  ]);
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "no checkin" });
  const end = nowISO();
  await pool.query("UPDATE checkins SET checkout_at=$1 WHERE id=$2", [
    end,
    checkinId,
  ]);
  const { rows: d } = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/60 AS minutes FROM checkins WHERE id=$1`,
    [checkinId]
  );
  const durationMin =
    d[0]?.minutes != null
      ? Math.max(0, Math.round(Number(d[0].minutes)))
      : null;
  sendEvent("visits", {});
  res.json({ ok: true, durationMin });
});
/* ================= ISSUES ================= */
app.get("/issues", auth, async (req, res) => {
  try {
    // Only Admin or Maintenance can list issues
    const role = String(req.user?.role || "").toUpperCase();
    const cat  = String(req.user?.category || "").toUpperCase();
    if (!(role === "ADMIN" || role === "ADMIN_GLOBAL" || cat === "MAINTENANCE")) {
      return res.status(403).json({ error: "forbidden" });
    }

    const tid = tenantIdOf(req);
    const { rows } = await pool.query(
      "SELECT * FROM issues WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200",
      [tid]
    );
    res.json({ items: rows });
  } catch (e) {
    console.error("[issues GET]", e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/issues", auth, async (req, res) => {
  try {
    const { token, locationId, text, category } = req.body || {};
    const bodyText = String(text || "").trim();
    if (!bodyText) return res.status(400).json({ error: "missing text" });

    // Determine location and tenant from token or explicit locationId
    let locId = 0, locName = null, tid = tenantIdOf(req);

    if (token) {
      const norm = normalizeToken(token);
      const { rows: qrRows } = await pool.query(
        "SELECT location_id, tenant_id FROM qrcodes WHERE token=$1",
        [norm]
      );
      if (!qrRows.length) return res.status(404).json({ error: "bad token" });
      locId = qrRows[0].location_id || 0;
      tid   = qrRows[0].tenant_id || tid;
    } else if (locationId) {
      locId = Number(locationId);
      const { rows: locRows } = await pool.query(
        "SELECT name, tenant_id FROM locations WHERE id=$1",
        [locId]
      );
      if (!locRows.length) return res.status(404).json({ error: "no location" });
      tid = locRows[0].tenant_id || tid;
      locName = locRows[0].name || null;
    }

    if (locId) {
      const { rows: loc2 } = await pool.query(
        "SELECT name FROM locations WHERE id=$1",
        [locId]
      );
      if (loc2.length) locName = loc2[0].name || locName;
    }
    if (!tid) return res.status(400).json({ error: "no tenant" });

    // Cross-tenant guard
    const myRole = String(req.user?.role || "").toUpperCase();
    if (myRole !== "ADMIN_GLOBAL" && Number(tid) !== Number(tenantIdOf(req))) {
      return res.status(403).json({ error: "forbidden (different tenant)" });
    }

    // Enforce/normalize category per role
    const myCat = String(req.user?.category || "").toUpperCase();
    let effCategory = String(category || "MAINTENANCE").toUpperCase();
    if (!(myRole === "ADMIN" || myRole === "ADMIN_GLOBAL" || myCat === "MAINTENANCE")) {
      effCategory = "MAINTENANCE";
    }

    const ins = await pool.query(
      `INSERT INTO issues(created_at,updated_at,user_id,user_name,location_id,location_name,category,text,status,tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        nowISO(), nowISO(),
        req.user?.id || null,
        req.user?.name || req.user?.email || "",
        locId || null,
        locName,
        effCategory,
        bodyText,
        "OPEN",
        tid
      ]
    );
    sendEvent("issues", {});
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) {
    console.error("[issues POST]", e);
    res.status(500).json({ error: "server error" });
  }
});


/* ================= VISITORS (Reception) ================= */
app.get("/visitors", auth, async (req, res) => {
  const tid = tenantIdOf(req);
  const { csv, from, to } = req.query || {};
  const filters = ["tenant_id=$1"];
  const params = [tid];
  if (from) {
    params.push(from);
    filters.push(`checkin_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    filters.push(
      `(checkout_at <= $${params.length} OR checkout_at IS NULL)`
    );
  }
  const where = "WHERE " + filters.join(" AND ");
  const { rows } = await pool.query(
    `SELECT * FROM visitors ${where} ORDER BY id DESC`,
    params
  );
  if (String(csv || "") === "1") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=visitors.csv"
    );
    return res.send(rowsToCsv(rows));
  }
  res.json({ items: rows });
});
app.post("/visitors/:id/checkout", auth, async (req, res) => {
  const tid = tenantIdOf(req);
  const id = req.params.id;
  const { rows: vrows } = await pool.query(
    "SELECT * FROM visitors WHERE id=$1 AND tenant_id=$2",
    [id, tid]
  );
  const v = vrows[0];
  if (!v) return res.status(404).json({ error: "no visitor" });
  if (v.checkout_at) {
    const names = (() => {
      try { return JSON.parse(v.names || "[]"); } catch (_) { return []; }
    })();
    const { rows: d } = await pool.query(
      `SELECT EXTRACT(EPOCH FROM (checkout_at - checkin_at))/60 AS minutes FROM visitors WHERE id=$1`,
      [id]
    );
    const mins =
      d[0]?.minutes != null
        ? Math.max(0, Math.round(Number(d[0].minutes)))
        : null;
    return res.json({
      ok: true,
      durationMin: mins,
      message: `Goodbye ${names.length ? names.join(", ") : v.primary_name}. Thank you for your visit!`,
    });
  }
  await pool.query(
    "UPDATE visitors SET checkout_at=NOW() WHERE id=$1 AND tenant_id=$2",
    [id, tid]
  );
  sendEvent("visitors", {});
  const { rows: w } = await pool.query(
    "SELECT * FROM visitors WHERE id=$1 AND tenant_id=$2",
    [id, tid]
  );
  const nv = w[0];
  const names = (() => {
    try { return JSON.parse(nv.names || "[]"); } catch (_) { return []; }
  })();
  const { rows: d } = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (checkout_at - checkin_at))/60 AS minutes FROM visitors WHERE id=$1`,
    [id]
  );
  const mins =
    d[0]?.minutes != null
      ? Math.max(0, Math.round(Number(d[0].minutes)))
      : null;
  res.json({
    ok: true,
    durationMin: mins,
    message: `Goodbye ${names.length ? names.join(", ") : nv.primary_name}. Thank you for your visit!`,
  });
});
app.get("/visitors/signatures.zip", auth, async (req, res) => {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=visitor_signatures.zip"
  );
  res.end(
    Buffer.from([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) // empty zip
  );
});
/* ================= RESIDENT OUTINGS ================= */

// list for dashboards
app.get("/residents/outside", auth, async (req, res) => {
  const tid = tenantIdOf(req);
  const { rows } = await pool.query(
    `SELECT id, resident, escort, note, out_at,
            EXTRACT(EPOCH FROM (NOW()-out_at))/60 AS minutes_out
     FROM resident_outings
     WHERE tenant_id=$1 AND in_at IS NULL
     ORDER BY out_at DESC`,
    [tid]
  );
  res.json({ items: rows.map(r => ({
    id: r.id, resident: r.resident, escort: r.escort, note: r.note,
    out_at: r.out_at, minutes_out: r.minutes_out!=null ? Math.round(r.minutes_out) : null
  }))});
});

// helper for toggle
async function toggleResidentOuting({ token, resident, escort, note }) {
  const norm = normalizeToken(token);
  const { rows: qrRows } = await pool.query("SELECT * FROM qrcodes WHERE token=$1", [norm]);
  if (!qrRows.length) throw new Error("bad token");

  const locId = qrRows[0].location_id;
  const { rows: locRows } = await pool.query("SELECT * FROM locations WHERE id=$1", [locId]);
  const loc = locRows[0] || null;
  const tid = loc?.tenant_id || null;
  if (!tid) throw new Error("no tenant for location");

  // if same resident is already OUT -> mark IN
  const { rows: open } = await pool.query(
    `SELECT id FROM resident_outings
     WHERE tenant_id=$1 AND in_at IS NULL AND resident ILIKE $2
     ORDER BY id DESC LIMIT 1`,
    [tid, resident]
  );

  if (open.length) {
    await pool.query("UPDATE resident_outings SET in_at=NOW() WHERE id=$1", [open[0].id]);
    sendEvent("residents", {});
    return { action: "in", id: open[0].id, tenant_id: tid };
  }

  const ins = await pool.query(
    `INSERT INTO resident_outings(resident, escort, note, out_at, in_at, location_id, tenant_id)
     VALUES ($1,$2,$3,NOW(),NULL,$4,$5) RETURNING id`,
    [resident, escort || null, note || null, locId || null, tid]
  );
  sendEvent("residents", {});
  return { action: "out", id: ins.rows[0].id, tenant_id: tid };
}

// public (no auth) POST used by the resident tap page
app.post("/resident/tap", async (req, res) => {
  try {
    const { token, resident, escort, note } = req.body || {};
    const name = String(resident || "").trim();
    if (!token || !name) return res.status(400).json({ error: "token and resident required" });
    const result = await toggleResidentOuting({ token, resident: name, escort, note });
    res.json({ ok: true, action: result.action, id: result.id, resident: name });
  } catch (e) {
    console.error("[resident/tap] error:", e);
    res.status(500).json({ error: "server error" });
  }
});

// (optional) keep old alias if you added it earlier
app.post("/reception/resident/tap", async (req, res) => {
  try {
    const { token, resident, escort, note } = req.body || {};
    const name = String(resident || "").trim();
    if (!token || !name) return res.status(400).json({ error: "token and resident required" });
    const result = await toggleResidentOuting({ token, resident: name, escort, note });
    res.json({ ok: true, action: result.action, id: result.id, resident: name });
  } catch (e) {
    console.error("[reception/resident/tap] error:", e);
    res.status(500).json({ error: "server error" });
  }
});

/* ================= RECEPTION (public kiosk aliases) ================= */
app.post("/reception/checkin", async (req, res) => {
  try {
    const { token, primaryName, names, resident, signature } = req.body || {};
    const norm = normalizeToken(token || "");
    if (!primaryName) return res.status(400).json({ error: "missing name" });

    const { rows: qr } = await pool.query(
      "SELECT location_id, tenant_id FROM qrcodes WHERE token=$1",
      [norm]
    );
    if (!qr.length) return res.status(404).json({ error: "bad token" });

    const ins = await pool.query(
      `INSERT INTO visitors(primary_name, names, resident, checkin_at, checkout_at, tenant_id, signature_png)
 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
[
  String(primaryName).trim(),
  JSON.stringify(Array.isArray(names) ? names : []),
  resident || "",
  nowISO(),
  null,
  qr[0].tenant_id,
  signature || null
]

    );
    sendEvent("visitors", {});
    res.json({ ok: true, id: ins.rows[0].id });
  } catch (e) {
    console.error("[reception/checkin]", e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/reception/checkout", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "missing id" });

    const { rows } = await pool.query("SELECT * FROM visitors WHERE id=$1", [id]);
    const v = rows[0];
    if (!v) return res.status(404).json({ error: "no visitor" });

    if (!v.checkout_at) {
      await pool.query("UPDATE visitors SET checkout_at=$1 WHERE id=$2", [nowISO(), id]);
      sendEvent("visitors", {});
    }

    let names = [];
    try { names = JSON.parse(v.names || "[]"); } catch {}
    const d = await pool.query(
      "SELECT EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/60 AS minutes FROM visitors WHERE id=$1",
      [id]
    );
    const mins = d.rows[0]?.minutes != null ? Math.max(0, Math.round(Number(d.rows[0].minutes))) : null;

    res.json({
      ok: true,
      durationMin: mins,
      message: `Goodbye ${names.length ? names.join(", ") : v.primary_name}. Thank you for your visit!`,
    });
  } catch (e) {
    console.error("[reception/checkout]", e);
    res.status(500).json({ error: "server error" });
  }
});

/* ================= ALERTS ================= */
/* On superadmin (ADMIN_GLOBAL) "site": no nursing visits or alerts needed. */
app.get("/alerts", auth, async (req, res) => {
  const role = String(req.user?.role || "").toUpperCase();
  if (role === "ADMIN_GLOBAL") {
    return res.json({
      housekeeping_overdue: [],
      visitors_overdue: [],
      nursing_night_due: [],
    });
  }

  const tid = tenantIdOf(req);
  const cfg = await getTenantConfig(tid);

  const hkMinutes = Number(cfg?.schedules?.alerts?.housekeeping_overdue_minutes ?? 60);
  const visitHours = Number(cfg?.schedules?.alerts?.visitors_overdue_hours ?? 3);
  const nursingMinutesWindow = Number(cfg?.schedules?.alerts?.nursing_window_minutes ?? 60);
  const nightCfg = cfg?.schedules?.alerts?.night_window || { start: "20:00", end: "07:00" };

  const { rows: hkOpen } = await pool.query(
    `SELECT *, CAST(EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/60 AS INT) AS minutes_open
     FROM checkins WHERE tenant_id=$1 AND checkout_at IS NULL AND UPPER(user_category)='HOUSEKEEPING'`,
    [tid]
  );
  const housekeeping_overdue = hkOpen
    .filter((r) => (r.minutes_open || 0) > hkMinutes)
    .map((r) => ({
      id: r.id,
      location_name: r.location_name,
      checkin_at: r.checkin_at,
      minutes_open: r.minutes_open,
    }));

  const { rows: vOpen } = await pool.query(
    `SELECT *, (EXTRACT(EPOCH FROM (COALESCE(checkout_at, NOW()) - checkin_at))/3600.0) AS hours_open
     FROM visitors WHERE tenant_id=$1 AND checkout_at IS NULL`,
    [tid]
  );
  const visitors_overdue = vOpen
    .filter((v) => (v.hours_open || 0) > visitHours)
    .map((v) => ({
      id: v.id,
      primary_name: v.primary_name,
      resident: v.resident,
      hours_open: Number(v.hours_open),
    }));

  // Compute local "night" window from config, supports overnight ranges (e.g., 20:00→07:00)
  const now = new Date();
  const [sH, sM = 0] = String(nightCfg.start || "20:00").split(":").map(Number);
  const [eH, eM = 0] = String(nightCfg.end   || "07:00").split(":").map(Number);
  const minsNow = now.getHours() * 60 + now.getMinutes();
  const minsStart = sH * 60 + sM;
  const minsEnd = eH * 60 + eM;
  const overnight = minsEnd <= minsStart;
  const isNight = overnight
    ? (minsNow >= minsStart || minsNow < minsEnd)
    : (minsNow >= minsStart && minsNow < minsEnd);

  let nursing_night_due = [];
  if (isNight) {
    const { rows: lack } = await pool.query(
      `SELECT l.name AS location_name
         FROM locations l
        WHERE l.tenant_id=$1
          AND NOT EXISTS(
            SELECT 1 FROM checkins c
             WHERE c.location_id = l.id
               AND c.tenant_id=$1
               AND UPPER(c.user_category)='NURSING'
               AND (NOW() - c.checkin_at) <= ($2 || ' minutes')::interval
          )
        LIMIT 10`,
      [tid, String(nursingMinutesWindow)]
    );
    nursing_night_due = lack.map((x) => ({ location_name: x.location_name }));
  }

  res.json({ housekeeping_overdue, visitors_overdue, nursing_night_due });
});

/* ================= ENV AUDIT ================= */
app.get("/env/questions", auth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM env_questions ORDER BY id"
  );
  res.json({ items: rows });
});
app.post("/env/audits", auth, async (req, res) => {
  const { name } = req.body || {};
  const tid = tenantIdOf(req);
  if (!tid) return res.status(403).json({ error: "no tenant" });

  const { rows: uRows } = await pool.query("SELECT * FROM users WHERE id=$1", [req.user.id]);
  const u = uRows[0];

  const { rows } = await pool.query(
    "INSERT INTO env_audits(name,started_at,auditor_id,auditor_name,status,tenant_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [
      name || "Audit " + nowISO().slice(0, 10),
      nowISO(),
      u?.id || null,
      u?.name || u?.email || "",
      "open",
      tid
    ]
  );
  res.json({ id: rows[0].id });
});

app.get("/env/audits", auth, async (req, res) => {
  const tid = tenantIdOf(req);
  const { rows } = await pool.query(
    "SELECT * FROM env_audits WHERE tenant_id=$1 ORDER BY id DESC",
    [tid]
  );
  res.json({ items: rows });
});

app.get("/env/audits/:id", auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tid = tenantIdOf(req);

  const { rows: aRows } = await pool.query(
    "SELECT * FROM env_audits WHERE id=$1 AND tenant_id=$2",
    [id, tid]
  );
  const a = aRows[0];
  if (!a) return res.status(404).json({ error: "no audit" });

  const { rows: locs } = await pool.query(
    "SELECT * FROM env_audit_locations WHERE audit_id=$1 AND tenant_id=$2",
    [id, tid]
  );

  const locEnriched = [];
  for (const l of locs) {
    const { rows: ans } = await pool.query(
      "SELECT * FROM env_audit_answers WHERE audit_loc_id=$1 AND tenant_id=$2",
      [l.id, tid]
    );
    const total = ans.length;
    const yesCount = ans.filter(x => String(x.answer || "").toUpperCase() === "YES").length;
    const score = total ? Math.round((yesCount / total) * 100) : null;
    locEnriched.push({ ...l, total, yes_count: yesCount, score });
  }

  const responses = {};
  for (const l of locEnriched) {
    const { rows } = await pool.query(
      `SELECT q.id AS question_id, q.section, q.text, a.answer, a.comment
       FROM env_questions q
       LEFT JOIN env_audit_answers a 
         ON a.question_id=q.id AND a.audit_loc_id=$1 AND a.tenant_id=$2
       ORDER BY q.id`,
      [l.id, tid]
    );
    responses[l.id] = rows;
  }

  res.json({ audit: a, locations: locEnriched, responses });
});

// UI aliases -> /audit/:auditId
app.get("/env/audits/:id/csv", auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tid = tenantIdOf(req);

  const { rows: aRows } = await pool.query(
    "SELECT * FROM env_audits WHERE id=$1 AND tenant_id=$2",
    [id, tid]
  );
  const a = aRows[0];
  if (!a) return res.status(404).json({ error: "no audit" });

  const { rows } = await pool.query(
    `SELECT
      al.audit_id                         AS audit_id,
      a.name                              AS audit_name,
      a.started_at, a.submitted_at, a.auditor_id, a.auditor_name,
      a.overall_score, a.status,
      al.id                               AS audit_loc_id,
      al.location_id, al.location_name,
      q.id                                AS question_id,
      q.section, q.text                   AS question,
      aa.answer, aa.comment
    FROM env_audit_locations al
    JOIN env_audits a ON a.id = al.audit_id
    CROSS JOIN env_questions q
    LEFT JOIN env_audit_answers aa 
      ON aa.audit_loc_id = al.id AND aa.question_id = q.id AND aa.tenant_id=$2
    WHERE al.audit_id = $1 AND al.tenant_id=$2
    ORDER BY al.id, q.id`,
    [id, tid]
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=audit_${id}.csv`);
  res.send(rowsToCsv(rows));
});

app.post("/env/tap", auth, async (req, res) => {
  const { token, auditId } = req.body || {};
  const tid = tenantIdOf(req);
  const norm = normalizeToken(token || "");

  // ensure audit belongs to tenant
  const { rows: aRows } = await pool.query(
    "SELECT id FROM env_audits WHERE id=$1 AND tenant_id=$2",
    [auditId, tid]
  );
  if (!aRows.length) return res.status(404).json({ error: "no audit" });

  const { rows: qrRows } = await pool.query("SELECT * FROM qrcodes WHERE token=$1", [norm]);
  if (!qrRows.length) return res.status(404).json({ error: "bad token" });

  const { rows: locRows } = await pool.query("SELECT * FROM locations WHERE id=$1 AND tenant_id=$2", [qrRows[0].location_id, tid]);
  if (!locRows.length) return res.status(404).json({ error: "no location" });
  const loc = locRows[0];

  const { rows: exist } = await pool.query(
    "SELECT id FROM env_audit_locations WHERE audit_id=$1 AND location_id=$2 AND tenant_id=$3",
    [auditId, loc.id, tid]
  );

  const auditLocId = exist[0]?.id || (
    await pool.query(
      "INSERT INTO env_audit_locations(audit_id,location_id,location_name,tenant_id) VALUES ($1,$2,$3,$4) RETURNING id",
      [auditId, loc.id, loc.name || "Loc " + loc.id, tid]
    )
  ).rows[0].id;

  res.json({
    auditLocId,
    locationId: loc.id,
    locationName: loc.name || "Loc " + loc.id,
  });
});

app.post("/env/answer", auth, async (req, res) => {
  const { auditLocId, questionId, answer, comment } = req.body || {};
  if (!auditLocId || !questionId || !answer)
    return res.status(400).json({ error: "missing" });

  const tid = tenantIdOf(req);
  // verify location belongs to this tenant and get tenant_id for answers
  const { rows: alRows } = await pool.query(
    "SELECT id, tenant_id FROM env_audit_locations WHERE id=$1 AND tenant_id=$2",
    [auditLocId, tid]
  );
  const al = alRows[0];
  if (!al) return res.status(404).json({ error: "no audit location" });

  await pool.query(
    `INSERT INTO env_audit_answers(audit_loc_id,question_id,answer,comment,tenant_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (audit_loc_id,question_id)
     DO UPDATE SET answer=EXCLUDED.answer, comment=EXCLUDED.comment, tenant_id=EXCLUDED.tenant_id`,
    [auditLocId, questionId, String(answer).trim(), comment || "", al.tenant_id]
  );

  const { rows } = await pool.query(
    "SELECT answer FROM env_audit_answers WHERE audit_loc_id=$1 AND tenant_id=$2",
    [auditLocId, tid]
  );

  const total = rows.length;
  const yes = rows.filter(x => String(x.answer || "").toUpperCase() === "YES").length;
  const score = total ? Math.round((yes / total) * 100) : null;
  res.json({ ok: true, locationScore: score, compliant: score === 100 });
});

app.post("/env/submit", auth, async (req, res) => {
  const { auditId } = req.body || {};
  const tid = tenantIdOf(req);

  const { rows: aRows } = await pool.query(
    "SELECT id FROM env_audits WHERE id=$1 AND tenant_id=$2",
    [auditId, tid]
  );
  if (!aRows.length) return res.status(404).json({ error: "no audit" });

  const { rows: locs } = await pool.query(
    "SELECT id FROM env_audit_locations WHERE audit_id=$1 AND tenant_id=$2",
    [auditId, tid]
  );

  let total = 0, yes = 0;
  for (const l of locs) {
    const { rows: ans } = await pool.query(
      "SELECT answer FROM env_audit_answers WHERE audit_loc_id=$1 AND tenant_id=$2",
      [l.id, tid]
    );
    total += ans.length;
    yes   += ans.filter(x => String(x.answer || "").toUpperCase() === "YES").length;
  }
  const pct = total ? Math.round((yes / total) * 100) : 0;

  await pool.query(
    "UPDATE env_audits SET submitted_at=$1, overall_score=$2, status=$3 WHERE id=$4 AND tenant_id=$5",
    [nowISO(), pct, "done", auditId, tid]
  );
  res.json({ overall: pct });
});




/**
 * POST /tap/asset/check
 * body: { location_id?, location_name?, note? }
 * Semantics: “checked & cleaned”
 */
app.post('/tap/asset/check', auth, async (req, res)=>{
  try{
    const tid = Number(req.user?.tenant_id || 0);
    if (!tid) return res.status(401).json({ error:'no tenant' });

    const { location_id=null, location_name=null, note=null } = req.body || {};
    const by_user_id   = Number(req.user?.id || 0) || null;
    const by_user_name = req.user?.name || req.user?.email || null;

    const { rows } = await pool.query(
      `INSERT INTO housekeeping_checks
        (tenant_id, location_id, location_name, note, by_user_id, by_user_name)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, created_at`,
      [tid, location_id, location_name, note, by_user_id, by_user_name]
    );

    res.json({ ok:true, id: rows[0].id, created_at: rows[0].created_at });
  }catch(e){
    console.error('[tap/asset/check]', e);
    res.status(500).json({ error: e.message || 'server error' });
  }
});


// Mobile-friendly audit runner UI (fixed single <script> block)
app.get("/audit/:auditId", (req, res) => {
  const api = PUBLIC_API_URL || "";
  const auditId = String(req.params.auditId || "").trim();

  res.status(200).type("html").send(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Ernos • Audit #${auditId}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  /* Use skin variables so this page matches your current theme */
  *{box-sizing:border-box}
  :root{
    /* map local aliases to skin vars (fallbacks keep page usable if skin missing) */
    --bg: var(--bg, #f5f7fa);
    --panel: var(--panel, #ffffff);
    --text: var(--text, #2E2E2E);
    --muted: var(--muted, #606060);
    --border: var(--border, #d6dee5);
    --accent: var(--accent, #7BA297);
  }
  body{margin:0;background:var(--bg);color:var(--text);font:15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif}
  header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border)}
  header img{height:40px}
  main{max-width:720px;margin:0 auto;padding:0 12px 100px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:12px;margin:12px 0}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  select,button{font:inherit}
  select{width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:#fff;color:var(--text)}
  .q{padding:10px;border-radius:12px;border:1px solid var(--border);margin:8px 0;background:#fff}
  .sec{font-weight:700;color:var(--muted);margin-bottom:4px}
  .txt{margin:4px 0 10px;color:var(--text)}
  .btns{display:flex;gap:8px}
  .btn{flex:1;padding:10px 12px;border-radius:10px;border:1px solid var(--border);cursor:pointer;font-weight:700;transition:background .12s ease, transform .05s ease;background:#fff;color:var(--text)}
  .btn:active{transform:scale(.98)}
  .yes.active{background:#e9f5ef;border-color:#cfe8db}
  .no.active{background:#fdeeee;border-color:#f1c9c9}
  .muted{color:var(--muted)}
  .sticky{position:fixed;left:0;right:0;bottom:0;background:linear-gradient(180deg, rgba(255,255,255,0), var(--bg) 24px);padding:16px}
  .action{max-width:720px;margin:0 auto;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:10px;display:flex;gap:10px;align-items:center}
  .action .submit{flex:1;padding:12px;border-radius:10px;border:0;background:var(--accent);color:white;font-weight:800}
  .score{font-weight:700}
  #msg{margin:8px 0;padding:10px;border-radius:10px;border:1px solid var(--border);background:#fff;color:var(--muted);display:none}
  .ok{border-color:#CFE8DB;background:#E9F5EF;color:#1D5C45}
  .err{border-color:#F1C9C9;background:#FDEEEE;color:#7A2A2A}
</style>

<body>
  <header>
    <img src="/skin/icons/logo.png" onerror="this.src='/icons/icon.svg'">
    <h2 style="margin:0">Environmental Audit</h2>
    <button id="btnCsv" style="margin-left:auto;padding:8px 10px;border-radius:10px;border:0;background:#2e8af6;color:#fff;font-weight:700">
      Download CSV
    </button>
  </header>
  <main>
    <div id="msg"></div>
    <div class="card">
      <div class="row">
        <label for="locSel" class="muted">Audit #${auditId} • Location</label>
        <select id="locSel"></select>
      </div>
      <div class="muted" id="locHint">Tip: scan a location tag first if the list is empty.</div>
    </div>
    <div id="qWrap"></div>
  </main>
  <div class="sticky">
    <div class="action">
      <div class="muted">Overall: <span id="overall" class="score">–</span></div>
      <button class="submit" id="btnSubmit">Submit Audit</button>
    </div>
  </div>
<script>
(function(){
  const API = ${JSON.stringify(api)} || location.origin;
  const AUDIT_ID = ${JSON.stringify(auditId)};
  const $ = (id)=>document.getElementById(id);
  const msg = (t, cls='')=>{ const el=$('msg'); if(!t){ el.style.display='none'; el.textContent=''; el.className=''; return; } el.textContent=t; el.className=cls; el.style.display=''; };

  // CSV download (runner page)
  (function(){
    const btn = $('btnCsv');
    if(!btn) return;
    let JWT = ""; try{ JWT = localStorage.getItem('ernosToken') || ""; }catch(_){}
    btn.onclick = function(){
      if(!JWT){ alert("Sign in first in the app, then reload."); return; }
      fetch((API||location.origin) + "/env/audits/" + encodeURIComponent(AUDIT_ID) + "/csv", {
        headers: { "Authorization": "Bearer " + JWT }
      })
      .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.blob(); })
      .then(function(b){
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "audit_" + AUDIT_ID + ".csv";
        document.body.appendChild(a); a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
      })
      .catch(function(e){ alert(e && e.message ? e.message : String(e)); });
    };
  })();

  // Keep Android/iOS back inside the app when opened directly
  (function(){
    const cameFromApp = /\\/app\\.html/i.test(document.referrer || "");
    if (cameFromApp) return;
    try {
      history.pushState({stub:1}, "", "#audit");
      window.addEventListener("popstate", function(){
        const api = (API || location.origin);
location.replace("/?api=" + encodeURIComponent(api) + "&nosw=1");
      });
    } catch(_){}
  })();

  // Get JWT from app
  let JWT = ''; try{ JWT = localStorage.getItem('ernosToken') || ''; }catch(_){}
  if(!JWT){ msg('You are not signed in. Open the Ernos app, sign in (Auditor/Admin), then reload.', 'err'); }

  function authFetch(url, opts){
    opts = opts || {}; opts.headers = Object.assign({}, opts.headers || {}, { 'Authorization': 'Bearer ' + JWT });
    return fetch(url, opts).then(r => r.json().then(j => { if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status)); return j; }));
  }

  function renderQuestions(auditLocId, responses){
    const wrap = $('qWrap'); wrap.innerHTML = '';
    const map = new Map(); // qid -> answer
    (responses||[]).forEach(r => { if(r.question_id) map.set(String(r.question_id), (r.answer||'').toUpperCase()); });

    // group by section
    const groups = {};
    (responses||[]).forEach(r=>{
      const s = r.section || 'General'; (groups[s] = groups[s] || []).push(r);
    });

    Object.keys(groups).forEach(section=>{
      groups[section].forEach(r=>{
        const q = document.createElement('div'); q.className = 'q'; q.dataset.qid = r.question_id;
        const sec = document.createElement('div'); sec.className = 'sec'; sec.textContent = section;
        const txt = document.createElement('div'); txt.className = 'txt'; txt.textContent = r.text;

        const btns = document.createElement('div'); btns.className = 'btns';
        const yes = document.createElement('button'); yes.className = 'btn yes'; yes.textContent = 'YES'; yes.setAttribute('aria-pressed','false');
        const no  = document.createElement('button');  no.className = 'btn no';  no.textContent  = 'NO';  no.setAttribute('aria-pressed','false');

        function setActive(val){
          const y = (val==='YES'), n = (val==='NO');
          yes.classList.toggle('active', y);
          no.classList.toggle('active',  n);
          yes.setAttribute('aria-pressed', String(y));
          no.setAttribute('aria-pressed',  String(n));
        }

        setActive(map.get(String(r.question_id)) || '');

        yes.onclick = ()=>{
          const prev = yes.classList.contains('active') ? 'YES' : (no.classList.contains('active') ? 'NO' : '');
          setActive('YES'); // instant visual feedback
          saveAnswer(r.question_id, 'YES', yes, no, prev);
        };
        no.onclick  = ()=>{
          const prev = yes.classList.contains('active') ? 'YES' : (no.classList.contains('active') ? 'NO' : '');
          setActive('NO');  // instant visual feedback
          saveAnswer(r.question_id, 'NO',  yes, no, prev);
        };

        btns.appendChild(yes); btns.appendChild(no);
        q.appendChild(sec); q.appendChild(txt); q.appendChild(btns);
        wrap.appendChild(q);
      });
    });
  }

  let CURRENT_LOC_ID = 0;
  let OVERALL = '–';

  function refreshOverall(){
    const qs = Array.from(document.querySelectorAll('.q'));
    if(!qs.length){ $('overall').textContent = '–'; return; }
    let total = 0, yes = 0;
    qs.forEach(q=>{
      const y = q.querySelector('.yes'); const n = q.querySelector('.no');
      if(y.classList.contains('active') || n.classList.contains('active')){
        total++; if(y.classList.contains('active')) yes++;
      }
    });
    OVERALL = total ? Math.round(yes/total*100)+'%' : '–';
    $('overall').textContent = OVERALL;
  }

  function saveAnswer(qid, val, yesBtn, noBtn, prevVal){
    if(!CURRENT_LOC_ID){ msg('No location selected. Please scan a location tag onto this audit first.', 'err'); return; }
    authFetch(API + '/env/answer', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ auditLocId: CURRENT_LOC_ID, questionId: qid, answer: val, comment: '' })
    })
    .then(()=>{ refreshOverall(); msg('', ''); })
    .catch(e=>{
      // revert visuals using the passed buttons (no out-of-scope refs)
      const y = (prevVal==='YES'), n = (prevVal==='NO');
      yesBtn.classList.toggle('active', y);
      noBtn .classList.toggle('active',  n);
      yesBtn.setAttribute('aria-pressed', String(y));
      noBtn .setAttribute('aria-pressed', String(n));
      refreshOverall();
      msg(e.message||String(e), 'err');
    });
  }

  // Load audit & questions
  Promise.all([
    authFetch(API + '/env/questions'),
    authFetch(API + '/env/audits/' + encodeURIComponent(AUDIT_ID))
  ])
  .then(([qs, audit])=>{
    const locSel = $('locSel');
    locSel.innerHTML = '';
    (audit.locations||[]).forEach(l=>{
      const opt = document.createElement('option');
      opt.value = String(l.id); // audit_loc_id
      opt.textContent = l.location_name || ('Loc ' + l.location_id);
      locSel.appendChild(opt);
    });

    if(!audit.locations || !audit.locations.length){
      $('locHint').textContent = 'No locations yet. Scan a location tag (Auditor TAP) to add.';
      $('qWrap').innerHTML = '';
      refreshOverall();
      return;
    }
    $('locHint').textContent = '';

    function loadLoc(auditLocId){
      CURRENT_LOC_ID = Number(auditLocId);
      const resp = (audit.responses && audit.responses[auditLocId]) || [];
      const joined = (qs.items||[]).map(q=>{
        const r = (resp.find(x=>x.question_id===q.id) || {});
        return { question_id: q.id, section: q.section, text: q.text, answer: r.answer||null, comment: r.comment||null };
      });
      renderQuestions(auditLocId, joined);
      refreshOverall();
    }

    const firstId = String(audit.locations[0].id);
    locSel.value = firstId;
    locSel.onchange = ()=> loadLoc(locSel.value);
    loadLoc(firstId);
  })
  .catch(e=> msg(e.message||String(e), 'err'));

  // Submit audit
  $('btnSubmit').onclick = ()=>{
    authFetch(API + '/env/submit', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ auditId: Number(AUDIT_ID) })
    })
    .then(j=>{
      msg('Audit submitted. Overall score: ' + (j && typeof j.overall==='number' ? (j.overall+'%') : OVERALL), 'ok');
    })
    .catch(e=> msg(e.message||String(e), 'err'));
  };
})();
</script>
</body></html>`);
});
function nocache(res){
  res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma','no-cache');
  res.set('Expires','0');
}

app.get("/tap/ci/:token", (req, res) => {
  nocache(res);
  const token = req.params.token || "";
  const api = PUBLIC_API_URL || "";
  const web = PUBLIC_WEB_URL || "";
  res.status(200).type("html").send(`<!doctype html>
<html><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --bg:#4E6E81; --panel:#FFFFFF; --text:#EAF1F4; --text-panel:#2E2E2E;
    --muted:#D7E3E8; --muted-panel:#606060; --accent:#7BA297; --border:#3E5967;
  }
  body{font-family:system-ui;max-width:640px;margin:24px auto;padding:0 12px;background:var(--bg);color:var(--text)}
  header{display:flex;align-items:center;gap:8px;margin:12px 0 10px}
  #msg{display:none;padding:10px;border-radius:10px;background:#fff;color:var(--muted-panel);border:1px solid var(--border)}
  #issueBox{display:none;margin-top:10px;padding:12px;border:1px solid var(--border);border-radius:10px;background:#fff;color:var(--text-panel)}
  textarea{width:100%;min-height:84px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text-panel);padding:8px}
  .btn{padding:8px 12px;border-radius:10px;border:0;background:var(--accent);color:#fff;font-weight:700;cursor:pointer}
  .ok{background:#E9F5EF !important;color:#1D5C45 !important;border-color:#CFE8DB !important}
  .error{background:#FDEEEE !important;color:#7A2A2A !important;border-color:#F1C9C9 !important}
</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" style="height:56px" onerror="this.src='/icons/icon.svg'"></header>
  <div id="msg"></div>
  <div id="issueBox">
  <div style="display:flex;align-items:center;gap:12px">
    <img id="locPhoto" src="/skin/icons/logo.png" alt="Location" style="width:72px;height:72px;border-radius:12px;border:1px solid var(--border);object-fit:cover" onerror="this.style.display='none'">
    <div>
      <div style="font-weight:700">Report maintenance issue</div>
      <div class="tiny" style="color:#888">Optional — describe anything you noticed while cleaning.</div>
    </div>
  </div>
  <textarea id="issueText" placeholder="Describe the problem…"></textarea>
  <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">
    <button id="btnSendIssue" class="btn">Send</button>
  </div>
</div>


<script>
(function(){
  function show(el){ if(el) el.style.display=''; }
  function setMsg(t,k){ var el=document.getElementById('msg'); show(el); el.textContent=t; el.className=k||''; }
  window.addEventListener('error', e=>setMsg(e?.message||'Script error','error'));
  window.addEventListener('unhandledrejection', e=>setMsg((e?.reason?.message||e?.reason||'Promise error'),'error'));
  var API=${JSON.stringify(api)}||location.origin; var TOKEN=${JSON.stringify(token)};
  var JWT=''; try{ JWT=localStorage.getItem('ernosToken')||''; }catch(_){}
  try{
    var APP_URL = "/?api="+encodeURIComponent(API||location.origin)+"&nosw=1";
    history.replaceState({view:"tap-ci"}, ""); history.pushState({view:"tap-ci-2"}, "");
    window.addEventListener("popstate", function(){ location.replace(APP_URL); });
  }catch(_){}
if(!JWT){
  try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){}
  setMsg('You are not signed in. Open the Ernos app, sign in, then come back and tap again.', 'error');
  // do NOT auto-redirect anymore
  var w = document.getElementById('openAppWrap'); if (w) w.style.display = '';
  return;
}

  setMsg('Contacting server…','');
  fetch((API||'') + '/tap/ci/perform',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},body:JSON.stringify({token:TOKEN})})
  .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
  .then(j=>{
    var role=String(j.role||'').toUpperCase();
    var text = j.action==='checkin'
  ? (role==='HOUSEKEEPING'?'Cleaning started at ': role==='NURSING'?'Visit started at ': role==='MAINTENANCE'?'Maintenance started at ':'Checked in at ')
  : (role==='HOUSEKEEPING'?'Cleaning finished at ': role==='NURSING'?'Visit finished at ': role==='MAINTENANCE'?'Maintenance finished at ':'Checked out from ');

    var dur = (j.durationMin!=null && j.action==='checkout') ? (' — duration '+j.durationMin+' min') : '';
    setMsg('✅ '+text+(j.locationName||'this location')+dur,'ok');
    show(document.getElementById('issueBox'));
    var btn=document.getElementById('btnSendIssue'); if(btn) btn.onclick=function(){
      var txt=(document.getElementById('issueText').value||'').trim();
      if(!txt){ setMsg('No maintenance issue text entered.','ok'); return; }
      fetch((API||'') + '/issues',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},body:JSON.stringify({token:TOKEN,text:txt})})
      .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
      .then(()=>{ setMsg('Maintenance issue sent. Thank you!','ok'); document.getElementById('issueText').value='';})
      .catch(e=>setMsg(e.message||String(e),'error'));
    };
  })
  .catch(e=> setMsg('Failed: '+(e&&e.message?e.message:e),'error'));
})();
</script>
</body></html>`);
});


app.get("/tap/nursing/:token", async (req, res) => {
  nocache(res);
  const token = String(req.params.token || "").trim();
  const api = PUBLIC_API_URL || "";

  // Reuse the same resolver used by attachUniversalTap
  async function resolveToken(tok) {
    const { rows } = await pool.query(
      `SELECT q.location_id, COALESCE(l.name,'') AS location_name, COALESCE(l.type,'') AS location_type
       FROM qrcodes q
       LEFT JOIN locations l ON l.id=q.location_id
       WHERE q.token=$1 LIMIT 1`,
      [tok]
    );
    return rows[0] || null;
  }

  const hit = await resolveToken(token);
  const locType = String(hit?.location_type || "").toUpperCase();

  
  // Otherwise keep the classic nursing check page
  res.status(200).type("html").send(`<!doctype html>
<html><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{ --bg:#4E6E81; --panel:#FFFFFF; --text:#EAF1F4; --text-panel:#2E2E2E; --muted:#D7E3E8; --accent:#7BA297; --border:#3E5967; }
  body{font-family:system-ui;max-width:640px;margin:24px auto;padding:0 12px;background:var(--bg);color:var(--text)}
  h3{margin:0 0 10px}
  #msg{display:none;padding:10px;border-radius:10px;background:#fff;color:var(--text-panel);border:1px solid var(--border)}
  .ok{background:#E9F5EF !important;color:#1D5C45 !important;border-color:#CFE8DB !important}
  .error{background:#FDEEEE !important;color:#7A2A2A !important;border-color:#F1C9C9 !important}
</style>
<body>
  <h3>Nursing Tap</h3>
  <div id="msg"></div>
<script>
(function(){
  function show(el){ if(el) el.style.display=''; }
  function setMsg(t,k){ var el=document.getElementById('msg'); show(el); el.textContent=t; el.className=k||''; }
  window.addEventListener('error', e=>setMsg(e?.message||'Script error','error'));
  window.addEventListener('unhandledrejection', e=>setMsg((e?.reason?.message||e?.reason||'Promise error'),'error'));
  var API=${JSON.stringify(api)}||location.origin; var TOKEN=${JSON.stringify(token)};
  var JWT=''; try{ JWT=localStorage.getItem('ernosToken')||''; }catch(_){}
  try{
    var APP_URL = "/?api="+encodeURIComponent(API||location.origin)+"&nosw=1";
    history.replaceState({view:"tap-nursing"}, ""); history.pushState({view:"tap-nursing-2"}, "");
    window.addEventListener("popstate", function(){ location.replace(APP_URL); });
  }catch(_){}
  if(!JWT){
    try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){}
    setMsg('You are not signed in. Open the Ernos app, sign in, then tap again.', 'error');
    return;
  }

  setMsg('Logging nursing check…','');
  fetch((API||'') + '/tap/nursing/check',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+JWT},body:JSON.stringify({token:TOKEN})})
  .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
  .then(j=> setMsg('✅ Resident checked at '+(j.locationName||'this location')+'.','ok'))
  .catch(e=> setMsg('Failed: '+(e&&e.message?e.message:e),'error'));
})();
</script>
</body></html>`);
});

// ================= NURSING "TAP" CHECK (ROOM-ONLY) =================
// ANCHOR: NURSING_TAP_CHECK
app.post("/tap/nursing/check", auth, async (req, res) => {
  try {
    const tid = tenantIdOf(req);
    const { token } = req.body || {};
    const norm = normalizeToken(String(token || ""));

    // Resolve token -> location (+ type)
    const { rows: qr } = await pool.query(
      `SELECT q.location_id, l.name AS location_name, UPPER(COALESCE(l.type,'')) AS location_type
         FROM qrcodes q
         LEFT JOIN locations l ON l.id = q.location_id
        WHERE q.token = $1
        LIMIT 1`,
      [norm]
    );
    if (!qr.length) return res.status(404).json({ error: "bad token" });

    const loc = qr[0];

    // ACCEPTABLE types for nursing checks (adjust to your schema)
    const OK = new Set(["ROOM", "RESIDENT_ROOM", "BEDROOM", "WARD"]);
    if (!OK.has(String(loc.location_type))) {
      return res.status(400).json({ error: "not a resident location" });
    }

    // Record a lightweight "nursing check" (reuse your existing checkins table if used elsewhere)
    // If you already have a plugin doing this, you can skip the insert and just respond ok.
    await pool.query(
      `INSERT INTO nursing_checks (tenant_id, user_id, location_id, taken_at)
       VALUES ($1,$2,$3,NOW())`,
      [tid, req.user.id, loc.location_id]
    ).catch(() => {}); // table may not exist in your install — safe to ignore

    return res.json({
      ok: true,
      locationName: loc.location_name || "Resident Room",
      locationType: loc.location_type,
      message: "Resident check recorded."
    });
  } catch (e) {
    console.error("[tap/nursing/check]", e);
    return res.status(500).json({ error: "server error" });
  }
});


app.get("/tap/env/:token", (req, res) => {
  nocache(res);
  const tok = String(req.params.token || "").trim();
  res.type("html").send(`<!doctype html>
<meta charset="utf-8">
<title>Ernos • Auditor Tap</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{
    --bg:#4E6E81; --panel:#FFFFFF; --text:#EAF1F4; --text-panel:#2E2E2E;
    --muted:#D7E3E8; --muted-panel:#606060; --accent:#7BA297; --border:#3E5967;
  }
  body{font:14px system-ui,sans-serif;padding:24px;max-width:540px;margin:0 auto;background:var(--bg);color:var(--text)}
  #msg{padding:10px;border-radius:10px;background:#fff;color:var(--muted-panel);border:1px solid var(--border);display:block}
  .ok{background:#E9F5EF !important;color:#1D5C45 !important;border-color:#CFE8DB !important}
  .error{background:#FDEEEE !important;color:#7A2A2A !important;border-color:#F1C9C9 !important}
</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" style="height:56px" onerror="this.src='/icons/icon.svg'"></header>
  <div id="msg">Contacting server…</div>
<script>
(function(){
  var TOKEN=${JSON.stringify(tok)};
  var API = ""; try{ API=(localStorage.getItem("ernosApi")||location.origin).replace(/\\/+$/,''); }catch(_){}
  var JWT = ""; try{ JWT=localStorage.getItem("ernosToken")||""; }catch(_){}
  try{
    var APP_URL = "/?api="+encodeURIComponent(API||location.origin)+"&nosw=1";
    history.replaceState({view:"tap-env"}, ""); history.pushState({view:"tap-env-2"}, "");
    window.addEventListener("popstate", function(){ location.replace(APP_URL); });
  }catch(_){}
  function setMsg(t,k){ var el=document.getElementById('msg'); el.className=k||''; el.textContent=t; }

if(!JWT){
  try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){}
  setMsg('You are not signed in. Open the Ernos app (Auditor/Admin), sign in, then tap again.', 'error');
  return;
}

  setMsg("Contacting server…","");
  fetch(API + "/me",{headers:{'Authorization':"Bearer "+JWT}})
   .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
   .then(me=>{
      var role=String(me.role||"").toUpperCase(); var cat=String(me.category||"").toUpperCase();
      if(!(role==="ADMIN"||cat==="AUDITOR")){
  setMsg("This tag requires an Auditor or Admin. Open the Ernos app with the correct role, then tap again.", "error");
  return; // no redirect → no loop
}
      var audId=parseInt(localStorage.getItem("ernos_current_audit_id")||"0",10);
      if(!audId){ setMsg("Auditor signed in, but no open audit in this browser. Open the app, click an audit, then tap again.", "ok"); return; }
      return fetch(API+"/env/tap",{method:"POST",headers:{'Content-Type':"application/json",'Authorization':"Bearer "+JWT}, body: JSON.stringify({token:TOKEN,auditId:audId})})
        .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
        .then(j=> setMsg("Location added to audit: "+(j.locationName||"")+".", "ok"));
   })
   .catch(e=> setMsg(e.message||String(e),"error"));
})();
</script>
</body></html>`);
});

// ================= NURSING DASHBOARD FEED =================
// ANCHOR: NURSING_DASHBOARD_STATUS
app.get("/nursing/status", auth, async (req, res) => {
  try {
    const tid = tenantIdOf(req);
    const cfg = await getTenantConfig(tid);
    const mins = Number(cfg?.schedules?.alerts?.nursing_check_minutes ?? 60);

    // Only room-like locations (exclude FRIDGE/etc.)
    const roomTypes = ['ROOM','RESIDENT_ROOM','BEDROOM','WARD'];
    const { rows } = await pool.query(
      `
      WITH last_checks AS (
        SELECT location_id, MAX(taken_at) AS last_checked
        FROM nursing_checks
        WHERE tenant_id = $1
        GROUP BY location_id
      )
      SELECT
        l.id   AS location_id,
        l.name AS location_name,
        UPPER(COALESCE(l.type,'')) AS location_type,
        lc.last_checked,
        CASE
          WHEN lc.last_checked IS NULL THEN NULL
          ELSE EXTRACT(EPOCH FROM (NOW() - lc.last_checked))/60.0
        END AS minutes_since
      FROM locations l
      LEFT JOIN last_checks lc ON lc.location_id = l.id
      WHERE l.tenant_id = $1
        AND l.active = TRUE
      ORDER BY l.id
      `,
      [tid]
    );

    const items = rows
      .filter(r => roomTypes.includes(String(r.location_type)))
      .map(r => {
        const since = (r.minutes_since == null) ? null : Math.max(0, Math.round(Number(r.minutes_since)));
        const overdue = since == null ? true : (since > mins);
        // Status for UI: 'GREEN' when within window, 'RED' when overdue/missing
        const status = overdue ? 'RED' : 'GREEN';
        return {
          location_id: r.location_id,
          location_name: r.location_name,
          last_checked_at: r.last_checked,
          minutes_since: since,
          window_minutes: mins,
          status
        };
      });

    res.json({ items, window_minutes: mins });
  } catch (e) {
    console.error("[/nursing/status]", e);
    res.status(500).json({ error: "server error" });
  }
});

/* ================= HOUSEKEEPING DASHBOARD ================= */
app.get("/housekeeping/status", auth, async (req, res) => {
  const tid = tenantIdOf(req);

  // Only Housekeeping (or Admin) should read this list
  const r = String(req.user?.role||"").toUpperCase();
  const c = String(req.user?.category||"").toUpperCase();
  if (!(r === "ADMIN" || r === "ADMIN_GLOBAL" || c === "HOUSEKEEPING")) {
    return res.status(403).json({ error: "forbidden" });
  }

  // Locations for this tenant
  const { rows: locs } = await pool.query(
    "SELECT id, name, type, active FROM locations WHERE tenant_id=$1 AND active=TRUE ORDER BY id",
    [tid]
  );

  // Open HK checkins (red)
  const { rows: open } = await pool.query(
    `SELECT c.id, c.location_id, c.checkin_at,
            EXTRACT(EPOCH FROM (NOW() - c.checkin_at))/60 AS minutes_open
       FROM checkins c
      WHERE c.tenant_id=$1 AND c.checkout_at IS NULL AND UPPER(c.user_category)='HOUSEKEEPING'`,
    [tid]
  );
  const openByLoc = new Map(open.map(r => [r.location_id, r]));

  // Last finished HK today (green)
  const { rows: lastDone } = await pool.query(
    `SELECT DISTINCT ON (location_id)
            location_id, checkin_at, checkout_at,
            EXTRACT(EPOCH FROM (checkout_at - checkin_at))/60 AS minutes
       FROM checkins
      WHERE tenant_id=$1
        AND checkout_at IS NOT NULL
        AND UPPER(user_category)='HOUSEKEEPING'
        AND checkin_at::date = NOW()::date
      ORDER BY location_id, checkout_at DESC`,
    [tid]
  );
  const doneByLoc = new Map(lastDone.map(r => [r.location_id, r]));

  const items = locs.map(l => {
    const o = openByLoc.get(l.id);
    const d = doneByLoc.get(l.id);
    // status: open -> RED, else if done today -> GREEN, else RED (not done)
    const status = o ? "RED" : (d ? "GREEN" : "RED");
    return {
      location_id: l.id,
      location_name: l.name,
      status,                                  // "GREEN" | "RED"
      started_at: o?.checkin_at || null,       // when open
      minutes_open: o ? Math.max(0, Math.round(o.minutes_open||0)) : null,
      last_finished_at: d?.checkout_at || null,
      last_duration_min: d?.minutes != null ? Math.max(0, Math.round(d.minutes)) : null
    };
  });

  res.json({ items });
});


// === Resident TAP (OUT / IN toggle, same logic as /resident/tap) ===
app.get("/tap/resident/:token", async (req, res) => {
  const tid  = tenantIdOf(req);
  const raw  = String(req.params.token || "");
  const norm = normalizeToken(raw);

  // look up location name (optional; fallback "Reception")
  let locName = "Reception";
  try {
    const { rows } = await pool.query(
      "SELECT name FROM locations WHERE tenant_id=$1 AND tap_token=$2 LIMIT 1",
      [tid, norm]
    );
    if (rows.length && rows[0].name) locName = rows[0].name;
  } catch (_) {}

  // resident name can be pre-filled via ?name=
  const qName   = (req.query.name || "").toString().trim();
  const qEscort = (req.query.escort || "").toString().trim();

  // very small HTML-escape just in case
  function esc(s){
    return String(s || "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }

  res.send(`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Ernos — Resident Out</title>
<style>
  :root{
    --bg:#4E6E81;
    --panel:#FFFFFF;
    --text:#EAF1F4;
    --muted:#D7E3E8;
    --accent:#7BA297;
    --border:#3E5967;
  }
  body{
    font:15px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    max-width:640px;
    margin:24px auto;
    padding:0 12px;
    background:var(--bg);
    color:var(--text);
  }
  .card{
    background:var(--panel);
    border:1px solid var(--border);
    border-radius:16px;
    padding:18px 16px;
    box-shadow:0 6px 20px rgba(20,31,50,.06);
    color:#2E2E2E;
  }
  h1{
    font-size:18px;
    margin:0 0 6px;
  }
  .muted{
    color:#5f6b76;
    font-size:13px;
    margin-bottom:12px;
  }
  label{
    display:block;
    font-size:13px;
    margin-bottom:4px;
    color:#374151;
  }
  input{
    width:100%;
    box-sizing:border-box;
    border-radius:10px;
    border:1px solid #d1d5db;
    padding:8px 10px;
    font-size:14px;
  }
  button{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap:6px;
    padding:10px 16px;
    border-radius:999px;
    border:0;
    background:var(--accent);
    color:#fff;
    font-weight:600;
    cursor:pointer;
    font-size:14px;
    margin-top:12px;
  }
  button:active{ transform:translateY(1px); }
  .msg{
    margin-top:12px;
    font-size:14px;
  }
  .msg.ok{ color:#0f766e; }
  .msg.err{ color:#b91c1c; }
</style>
<body>
  <div class="card">
    <h1>Resident Out · ${esc(locName)}</h1>
    <div class="muted">
      First tap: marks the resident <strong>OUT</strong>.<br>
      Next tap: marks them <strong>back IN</strong>.
    </div>

    <div style="display:grid;gap:10px">
      <div>
        <label>Resident name</label>
        <input id="rName" placeholder="e.g., Sr Teresa" value="${esc(qName)}">
      </div>
      <div>
        <label>Escort (optional)</label>
        <input id="rEscort" placeholder="e.g., Family" value="${esc(qEscort)}">
      </div>
    </div>

    <button id="rToggle">Confirm OUT / IN</button>
    <div id="rMsg" class="msg muted"></div>
  </div>

<script>
(function(){
  const TOKEN   = ${JSON.stringify(norm)};
  const elName  = document.getElementById('rName');
  const elEsc   = document.getElementById('rEscort');
  const elBtn   = document.getElementById('rToggle');
  const elMsg   = document.getElementById('rMsg');

  function show(msg, kind){
    elMsg.textContent = msg || '';
    elMsg.className = 'msg ' + (kind || '');
  }

  elBtn.addEventListener('click', async function(){
    const resident = (elName.value || '').trim();
    const escort   = (elEsc.value || '').trim();
    if (!resident){
      show('Please enter the resident name.', 'err');
      return;
    }
    const payload = { token: TOKEN, resident, escort };
    elBtn.disabled = true;
    const orig = elBtn.textContent;
    elBtn.textContent = 'Saving…';
    try{
      const r = await fetch('/resident/tap', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));

      // backend already returns friendly msg for OUT / IN
      show(j.msg || 'Saved.', 'ok');
    }catch(e){
      show(e.message || String(e), 'err');
    }finally{
      elBtn.disabled = false;
      elBtn.textContent = orig;
    }
  });
})();
</script>
</body>`);
});

function renderUniversalTapPage(res, token) {
  nocache(res);
  const tok = String(token || "").trim();
  const api = (PUBLIC_API_URL || "").replace(/\/+$/, "");

  res.status(200).type("html").send(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Ernos • Tap</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  /* Main app palette */
  :root{
    --bg:#4E6E81; --panel:#FFFFFF; --text:#EAF1F4; --text-panel:#2E2E2E;
    --muted:#D7E3E8; --muted-panel:#606060; --accent:#7BA297; --border:#3E5967;
  }
  body{font:14px system-ui,sans-serif;padding:24px;max-width:560px;margin:0 auto;background:var(--bg);color:var(--text)}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:16px;margin-top:12px;color:var(--text-panel)}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  .btn{padding:10px 12px;border-radius:10px;border:0;background:var(--accent);color:#fff;font-weight:800;cursor:pointer}
  .btn.ghost{background:#fff;border:1px solid var(--border);color:var(--text-panel)}
  #msg{padding:10px;border-radius:10px;margin-top:12px;background:#fff;color:var(--muted-panel);border:1px solid var(--border)}
  .ok{background:#E9F5EF !important;color:#1D5C45 !important;border-color:#CFE8DB !important}
  .err{background:#FDEEEE !important;color:#7A2A2A !important;border-color:#F1C9C9 !important}
  .muted{color:var(--muted)}
</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" style="height:56px" onerror="this.src='/icons/icon.svg'"></header>
  <div id="msg" class="muted">Processing…</div>

  <div id="choices" class="card" style="display:none">
    <div style="font-weight:800;margin-bottom:8px">Choose what to do at this location</div>
    <div class="row">
      <button id="goVisit" class="btn">Visits & Maintenance</button>
      <button id="goAudit" class="btn ghost">Environmental Audit</button>
    </div>
  </div>

<script>
(function(){
  var TOKEN = ${JSON.stringify(tok)};
  var API   = ${JSON.stringify(api)} || location.origin;

  function setMsg(t, cls){ var el=document.getElementById('msg'); el.className=cls||''; el.textContent=t; }

  // keep back button inside app if opened directly
  try{
    var APP_URL = "/?api="+encodeURIComponent(API||location.origin)+"&nosw=1";
    history.replaceState({view:"tap-u"}, ""); history.pushState({view:"tap-u-2"}, "");
    window.addEventListener("popstate", function(){ location.replace(APP_URL); });
  }catch(_){}

  // a small bounce-guard so the page doesn't loop forever
  try{
    var k = "ernos_tap_bounce:" + TOKEN;
    var n = +(sessionStorage.getItem(k) || "0") + 1;
    sessionStorage.setItem(k, String(n));
    if(n > 3){
      var el=document.getElementById('msg');
      if(el){ el.className='err'; el.textContent='Could not open automatically. Tap to continue.'; }
      document.getElementById('choices').style.display='';
      var gv=document.getElementById('goVisit'), ga=document.getElementById('goAudit');
      if(gv) gv.onclick=function(){ location.replace('/tap/ci/'  + TOKEN); };
      if(ga) ga.onclick=function(){ location.replace('/tap/env/' + TOKEN); };
      return;
    }
  }catch(_){}

  var JWT=''; try{ JWT=localStorage.getItem('ernosToken')||''; }catch(_){}
  if(!JWT){ setMsg('You are not signed in. Open the Ernos app, sign in, then tap again.', 'err'); return; }

  // Use server-side /me to decide destination (prevents stale-claim loops)
  fetch((API||location.origin) + '/me', { headers: { 'Authorization': 'Bearer ' + JWT } })
    .then(r => r.json().then(j => { if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status)); return j; }))
    .then(function(me){
      var role = String(me.role||'').toUpperCase();
      var cat  = String(me.category||'').toUpperCase();

      if (role==='ADMIN' || role==='ADMIN_GLOBAL') {
        setMsg('Signed in as Admin. Pick an action below.','ok');
        document.getElementById('choices').style.display='';
        document.getElementById('goVisit').onclick = function(){ location.replace('/tap/ci/'  + TOKEN); };
        document.getElementById('goAudit').onclick = function(){ location.replace('/tap/env/' + TOKEN); };
        return;
      }

           // Decide target by role + location type
      function go(url){ setMsg('Taking you to ' + url + '…', 'ok'); setTimeout(function(){ location.replace(url); }, 350); }

      if (cat === 'AUDITOR') return go('/tap/env/' + TOKEN);

      // For others, resolve the token to know the location type
      fetch((API||location.origin) + '/tap/resolve?token=' + encodeURIComponent(TOKEN))
        .then(r => r.json().then(j => { if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status)); return j; }))
       .then(function(rsv){
  var t = String(rsv?.item?.location_type || '').toUpperCase();
  // fridge_fire.cjs exposes /tap/fridge/:token (no /temp)
  // Nursing staff tapping FRIDGE tags → ALWAYS go to fridge page first
if (cat === 'NURSING' && t === 'FRIDGE') {
  return location.replace('/tap/fridge/' + TOKEN);
}
  if (cat === 'NURSING') {
  return location.replace('/tap/nursing/' + TOKEN);
}

// Only non-Nursing go to general visit/CI flow
return location.replace('/tap/ci/' + TOKEN);

})

        .catch(function(e){ setMsg(e && e.message ? e.message : String(e), 'err'); });
    })
    .catch(function(e){ setMsg(e && e.message ? e.message : String(e), 'err'); });
})();
</script>
</body></html>`);
}


app.get("/tap/u/:token", (req, res) => {
  renderUniversalTapPage(res, req.params.token);
});

app.get(["/tap/visit/:token", "/visit/:token"], (req, res) => {
  renderUniversalTapPage(res, req.params.token);
});


// Resolves a TAP token and redirects to the correct SPA route.
// • /tap/auto/:token        -> auto route (we’ll redirect below)
// • /tap/reception/:token   -> stays reception if the location is RECEPTION,
//                              otherwise we redirect to #report (room/asset/etc.)
function attachUniversalTap(app, pool) {
  // Helper: resolve token -> { location_id, location_name, type }
  async function resolveToken(token) {
    // Try the common shapes; adjust names if your install uses a custom table
    // Assuming you have a qrcodes (or similar) table mapping token -> location_id
    const { rows } = await pool.query(
      `
      SELECT
        q.location_id,
        COALESCE(l.name, '') AS location_name,
        COALESCE(l.type,  '') AS location_type
      FROM qrcodes q
      LEFT JOIN locations l ON l.id = q.location_id
      WHERE q.token = $1
      LIMIT 1
      `,
      [token]
    );
    return rows[0] || null;
  }

  // Generic resolver (useful for the frontend token flow if you need it)
  app.get('/tap/resolve', async (req, res) => {
    try {
      const token = String(req.query.token || '').trim();
      if (!token) return res.status(400).json({ error: 'token required' });
      const hit = await resolveToken(token);
      if (!hit) return res.status(404).json({ error: 'not found' });
      res.json({ item: {
        location_id:   hit.location_id,
        location_name: hit.location_name,
        location_type: hit.location_type
      }});
    } catch (e) {
      console.error('[tap/resolve]', e);
      res.status(500).json({ error: 'server error' });
    }
  });

  // Auto TAP: always send to the report form (camera/file upload lives there)
  app.get('/tap/auto/:token', async (req, res) => {
    try {
      const token = req.params.token;
      const hit = await resolveToken(token);
      if (!hit) return res.status(404).send('Unknown TAP token');

      const locQS = `/#report?loc=${encodeURIComponent(hit.location_id)}&name=${encodeURIComponent(hit.location_name)}`;
      res.redirect(locQS);
    } catch (e) {
      console.error('[tap/auto]', e);
      res.status(500).send('Server error');
    }
  });

  // Reception TAP: ONLY stays here when it’s truly a reception location.
  // Otherwise, redirect rooms/assets to #report (so Nursing/HK/Maint can file issues).
  app.get('/tap/reception/:token', async (req, res, next) => {
    try {
      const token = req.params.token;
      const hit = await resolveToken(token);
      if (!hit) return res.status(404).send('Unknown TAP token');

      const type = String(hit.location_type || '').toUpperCase();
      if (type && type !== 'RECEPTION') {
        // Not a reception location → send to report page
        const locQS = `/#report?loc=${encodeURIComponent(hit.location_id)}&name=${encodeURIComponent(hit.location_name)}`;
        return res.redirect(locQS);
      }

      // Reception location → fall through to your existing reception handler/template
      return next(); // IMPORTANT: lets your existing /tap/reception route render as before
    } catch (e) {
      console.error('[tap/reception redirect check]', e);
      res.status(500).send('Server error');
    }
  });
}

attachUniversalTap(app, pool);
// INIT: Residents Out (Reception Residents independent tag)
setupResidentsOut({
  app,
  pool,
  auth,                  // your existing auth middleware
  tenantIdOf,            // same helper you pass to visitors plugin (if you have it)
  PUBLIC_API_URL,        // to render correct absolute API in the tap page
});

// --- Reception TAP page (classic UX)
app.get("/tap/reception/:token", (req, res) => {
  const token = String(req.params.token || "").trim();
  const api = PUBLIC_API_URL || "";

  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Ernos • Visitor</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  /* Match main app sidebar/header palette */
  :root{
    --bg:#4E6E81;              /* sidebar/header gray-blue */
    --panel:#FFFFFF;           /* white cards like main app */
    --text:#EAF1F4;            /* light text on the page background */
    --text-panel:#2E2E2E;      /* dark text inside white cards */
    --muted:#D7E3E8;           /* muted on bg */
    --muted-panel:#606060;     /* muted inside cards */
    --accent:#7BA297;          /* same accent as main */
    --border:#3E5967;          /* header border gray-blue */
  }

  body{
    font:15px system-ui,sans-serif;
    max-width:640px;
    margin:0 auto;
    background:var(--bg);
    color:var(--text);
    padding:24px
  }

  .card{
    background:var(--panel);
    border:1px solid var(--border);
    border-radius:16px;
    padding:16px;
    color:var(--text-panel);
  }

  .row{display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap}

  label{display:block;font-size:13px;color:var(--muted-panel);margin-bottom:6px}

  input{
    width:100%;
    border:1px solid var(--border);
    background:#fff;
    color:var(--text-panel);
    padding:10px;
    border-radius:10px
  }

  button{
    padding:10px 14px;
    border-radius:10px;
    border:0;
    background:var(--accent);
    color:#fff;
    font-weight:700;
    cursor:pointer
  }

  .btn-outline{
    background:#fff;
    border:1px solid var(--border);
    color:var(--text-panel)
  }

  .stack > *{margin-top:10px}

  #msg{
    margin:10px 0;
    padding:12px;
    border-radius:12px;
    border:1px solid var(--border);
    background:#fff;
    color:var(--text-panel);
    display:none
  }

  .ok{border-color:#CFE8DB;background:#E9F5EF;color:#1D5C45}
  .err{border-color:#F1C9C9;background:#FDEEEE;color:#7A2A2A}

  .muted{color:var(--muted)}
  .tiny{font-size:12px;color:var(--muted-panel)}

  .list{display:grid;gap:8px}
  .pill{
    display:flex;align-items:center;gap:8px;
    background:#fff;border:1px solid var(--border);
    padding:8px 10px;border-radius:999px
  }
  .pill span{flex:1}


  .center{text-align:center;}
</style>
<body>
  <header style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <img src="/skin/icons/logo.png" alt="Ernos" style="height:84px" onerror="this.src='/icons/icon.svg'">
    <h2 style="margin:0">Visitor</h2>
  </header>

  <div id="msg"></div>

  <div class="card stack" id="promptCard" style="display:none">
    <div id="promptText" class="center" style="font-size:18px"></div>
    <div class="row" style="justify-content:center">
      <button id="btnYes">Yes, check me in</button>
      <button id="btnNo" class="btn-outline">No, someone else</button>
    </div>
  </div>

  <div class="card stack" id="formCard" style="display:none">
    <div>
      <label for="primaryName">Your name (required)</label>
      <input id="primaryName" autocomplete="name" placeholder="e.g. Jane Smith">
    </div>

    <div>
      <label for="resident">Resident you're visiting</label>
      <input id="resident" placeholder="e.g. Teresa">
    </div>

    <div>
      <label>Additional visitors</label>
      <div class="row">
        <input id="newVisitor" placeholder="Add another visitor name">
        <button id="btnAdd" type="button" class="btn-outline">Add</button>
      </div>
      <div id="visitorsList" class="list"></div>
    </div>

    
    <div class="row" style="justify-content:flex-end">
      <button id="btnCheckin" type="button">Check in</button>
    </div>
    <div class="tiny">By checking in you agree to follow the facility's safety rules.</div>
  </div>

  <div class="card center" id="messageCard" style="display:none">
    <div id="bigMessage" style="font-size:18px"></div>
  </div>

<script>
(function(){
  const TOKEN = ${JSON.stringify(token)};
  let API = ${JSON.stringify(api)}; if(!API) API = location.origin;

  const $ = (id)=>document.getElementById(id);
  const show = (id)=>{ ['promptCard','formCard','messageCard'].forEach(x=>$(x).style.display='none'); $(id).style.display=''; };
  const showMsg = (t, cls='')=>{ const el=$('msg'); el.textContent=t; el.className=cls?cls:''; el.style.display=t?'':'none'; };

  const K_VISIT = 'ernos_visit_id_'+TOKEN;
  const K_NAME  = 'ernos_last_name_'+TOKEN;
  const K_RES   = 'ernos_last_resident_'+TOKEN;

  const names = [];
  function renderNames(){
    const box = $('visitorsList'); box.innerHTML = '';
    names.forEach((n, i)=>{
      const row = document.createElement('div');
      row.className = 'pill';
      const span = document.createElement('span'); span.textContent = n;
      const btn = document.createElement('button'); btn.textContent='Remove'; btn.className='btn-outline';
      btn.onclick = ()=>{ names.splice(i,1); renderNames(); };
      row.appendChild(span); row.appendChild(btn); box.appendChild(row);
    });
  }
  $('btnAdd')?.addEventListener('click', ()=>{
    const v = ($('newVisitor').value||'').trim(); if(!v) return;
    names.push(v); $('newVisitor').value=''; renderNames();
  });

  

  function post(url, data){
    return fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data||{}) })
      .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status)); return j; }));
  }

  function welcomeMessage(nameOrNames){
    const txt = Array.isArray(nameOrNames) ? nameOrNames.join(', ') : nameOrNames;
    return '✅ Welcome ' + (txt || 'visitor') + '. Enjoy your visit!';
  }

  try{
    const existing = localStorage.getItem(K_VISIT);
    if(existing){
      show('messageCard');
      $('bigMessage').textContent = 'Checking out…';
      post((API||location.origin) + '/reception/checkout', { id: Number(existing) })
        .then(j=>{
          $('bigMessage').textContent = j && j.message ? j.message : 'Thank you for your visit. See you soon!';
          try{ localStorage.removeItem(K_VISIT); }catch(_){}
        })
        .catch(e=>{
          $('bigMessage').textContent = 'Thank you for your visit!';
          showMsg(e.message||String(e), 'err');
          try{ localStorage.removeItem(K_VISIT); }catch(_){}
        });
      return;
    }
  }catch(_){}

  let lastName='', lastResident='';
  try{
    lastName = localStorage.getItem(K_NAME) || '';
    lastResident = localStorage.getItem(K_RES) || '';
  }catch(_){}
  if(lastName){
    $('promptText').textContent = 'Welcome again, ' + lastName + '. Are you here to visit ' + (lastResident || 'the same resident') + ' again?';
    show('promptCard');

    $('btnYes').onclick = ()=>{
      show('messageCard'); $('bigMessage').textContent = 'Checking you in…';
           post((API||location.origin) + '/reception/checkin', {
        token: TOKEN, primaryName: lastName, names: [], resident: lastResident
      })

      .then(j=>{
        $('bigMessage').textContent = welcomeMessage(lastName);
        try{ localStorage.setItem(K_VISIT, String(j.id)); }catch(_){}
      })
      .catch(e=>{ showMsg(e.message||String(e), 'err'); $('bigMessage').textContent=''; show('promptCard'); });
    };

    $('btnNo').onclick = ()=>{ show('formCard'); };
  } else {
    show('formCard');
  }

  $('btnCheckin').onclick = function(){
    const primaryName = ($('primaryName').value||'').trim();
    const resident    = ($('resident').value||'').trim();
    if(!primaryName){ showMsg('Please enter your name.', 'err'); return; }
       showMsg('Contacting server…','muted');
    post((API||location.origin) + '/reception/checkin', {
      token: TOKEN, primaryName, names, resident
    })

    .then(j=>{
      show('messageCard');
      $('bigMessage').textContent = welcomeMessage([primaryName].concat(names));
      try{
        localStorage.setItem(K_VISIT, String(j.id));
        localStorage.setItem(K_NAME, primaryName);
        localStorage.setItem(K_RES, resident);
      }catch(_){}
      showMsg('', '');
    })
    .catch(e=> showMsg(e.message||String(e), 'err'));
  };
})();
</script>
</body></html>`);
});
// --- UNIVERSAL TAP REDIRECT (non-reception → #report) -----------------------


app.get(["/app.html", "/app"], (req, res) => {
  const tryFiles = [
    SKIN_DIR && path.join(SKIN_DIR, "index.html"),
    path.join(FRONTEND_ROOT, "index.html"),
  ].filter(Boolean);

  for (const f of tryFiles) {
    try { if (fs.existsSync(f)) return res.sendFile(f); } catch {}
  }

  // Fallback tiny page so we never 302 and never loop
  res
    .status(200)
    .type("html")
    .send(`<!doctype html><meta charset="utf-8">
<title>Ernos</title>
<body style="font:14px system-ui;background:#0c1e3d;color:#f0f4fb;padding:24px">
  App shell not found. Try <a href="/">home</a>.
</body>`);
});


/* ================= Health ================= */
app.get("/health", (req, res) => res.json({ ok: true }));

/* ================= Startup ================= */
(async function start() {
  await runMigrations();
  await ensureDefaultTenant();
  await seedAdmin();
  await seedSuperadmin();
  await seedQuestions();


  app.listen(PORT, () => console.log("Server listening on", PORT));
})();

// ===============================
// END server.pg.cjs
// ===============================
