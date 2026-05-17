// backend/server.v2.cjs
// New modular entrypoint for Ernos (v2) wired to .env

try { require("dotenv").config(); } catch (_) {}

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
});

// --- Core DB + migrations/seeds ---
const {
  pool,
  runMigrations,
  ensureDefaultTenant,
  seedAdmin,
  seedSuperadmin,
  seedQuestions,
} = require("./db.cjs");

// --- Security / auth helpers ---
const {
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
  bcrypt,
} = require("./security.cjs");


// --- Operational routes bundle (QR / checkins / issues / visitors / env / alerts) ---
const setupOps = require("./routes/ops.cjs");

// --- Plugins ---
const setupAttachments   = require("./plugins/attachments.cjs");
const setupFridgeFire    = require("./plugins/fridge_fire.cjs");
const setupResidentsOut  = require("./plugins/residents_out.cjs");
const setupPush          = require("./plugins/push.cjs");
const setupPasswords     = require("./plugins/passwords.cjs");
const setupStaff         = require("./plugins/staff.cjs");
const setupVisitors      = require("./plugins/visitors.cjs");
const setupLocations     = require("./plugins/locations.cjs");
const setupQrPrint       = require("./plugins/qr_print.cjs");   // <<< NEW
const setupDemoAuth      = require("./plugins/auth_demo.cjs");
const setupLegacyShims   = require("./plugins/legacy_shims.cjs");
const setupEnvAudit      = require("./plugins/env_audit.cjs");
const setupTapUniversal  = require("./plugins/tap_universal.cjs");
const setupIssues        = require("./plugins/issues.cjs");
const setupNursingAlerts = require('./plugins/nursing_alerts.cjs');
const setupFamilyTouchpoint = require('./plugins/family_touchpoint.cjs');


// =======================================================
// .env-driven config
// =======================================================
const PORT = process.env.PORT || 5055;

// Frontend paths (relative to project root by default)
const FRONTEND_DIR =
  process.env.FRONTEND_DIR && !path.isAbsolute(process.env.FRONTEND_DIR)
    ? path.join(__dirname, "..", process.env.FRONTEND_DIR)
    : process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");

const SKIN_DIR =
  process.env.SKIN_DIR && !path.isAbsolute(process.env.SKIN_DIR)
    ? path.join(__dirname, "..", process.env.SKIN_DIR)
    : process.env.SKIN_DIR || path.join(__dirname, "..", "frontend", "frontend-skin");

// CORS origin: allow your public web URL in prod, fallback to dev-friendly *
const PUBLIC_WEB_URL = (process.env.PUBLIC_WEB_URL || "").trim();
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || "").trim();
// Normalized environment name
const NODE_ENV = (process.env.NODE_ENV || "development").trim().toLowerCase();

if (!JWT_SECRET) {
  console.error("[boot] FATAL: JWT_SECRET is not set in environment.");
  process.exit(1);
}

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  console.warn("[boot] WARNING: No DATABASE_URL/PGHOST set; ensure db.cjs config is correct.");
}

// =======================================================
// Helpers that used to live inside server.pg.cjs
// =======================================================

// Normalize tokens coming from QR/NFC / URLs
function normalizeToken(raw) {
  return String(raw || "")
    .trim()
    .replace(/^ernos:/i, "") // strip any "ernos:" prefix if used
    .replace(/[^A-Za-z0-9._~-]/g, ""); // keep URL-safe chars only
}

// Generic CSV helper for exports
function rowsToCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  let out = "";
  out += headers.join(",") + "\r\n";
  for (const r of rows) {
    const line = headers.map((h) => esc(r[h])).join(",");
    out += line + "\r\n";
  }
  return out;
}

// Per-tenant config loader (from tenant_config.data JSONB)
const TENANT_CONFIG_CACHE_MS = 30_000; // 30s simple cache
const tenantConfigCache = new Map(); // tid -> { data, ts }

async function getTenantConfig(tenantId) {
  const tid = Number(tenantId || 0);
  if (!tid) return {};

  const cached = tenantConfigCache.get(tid);
  const now = Date.now();
  if (cached && now - cached.ts < TENANT_CONFIG_CACHE_MS) {
    return cached.data;
  }

  const { rows } = await pool.query(
    "SELECT data FROM tenant_config WHERE tenant_id=$1",
    [tid]
  );
  const cfg = rows[0]?.data || {};

  tenantConfigCache.set(tid, { data: cfg, ts: now });
  return cfg;
}

// =======================================================
// SSE event bus (/events + sendEvent helper)
// =======================================================
const sseClients = new Set();

function sendEvent(channel, data) {
  const payload = {
    channel,
    time: nowISO(),
    data: data || {},
  };
  const line = "data: " + JSON.stringify(payload) + "\n\n";
  for (const res of sseClients) {
    try {
      res.write(line);
    } catch (_) {
      // ignore broken pipes, cleanup will happen on "close"
    }
  }
}

// =======================================================
// Express app setup
// =======================================================
const app = express();

// If behind proxy (nginx, Cloudflare, etc)
app.set("trust proxy", 1);

app.disable("x-powered-by");

// Helmet basic hardening
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // For now, disable CSP so existing inline scripts and CDN JS work.
    // Later we can add a custom CSP that includes 'unsafe-inline' and jsdelivr.
    contentSecurityPolicy: false,
  })
);

// CORS – allow one or more web origins (prod) or be permissive in dev
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || PUBLIC_WEB_URL || ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  credentials: true,
  origin: (origin, cb) => {
    // No origin (e.g. curl, Postman) → always allow
    if (!origin) return cb(null, true);

    // Same-origin dev (http://localhost:PORT) → always allow
    const localOrigin = `http://localhost:${PORT}`;
    if (origin === localOrigin) {
      return cb(null, true);
    }

    // 🔓 Always allow any ernosapp.com origin (http/https, with/without www)
    if (/\.?ernosapp\.com$/i.test(origin.replace(/^https?:\/\//, ""))) {
      return cb(null, true);
    }

    // In dev, if no explicit allowed origins are configured, allow everything
    if (!ALLOWED_ORIGINS.length && NODE_ENV !== "production") {
      return cb(null, true);
    }

    // If we have an allowlist, check it
    if (ALLOWED_ORIGINS.includes(origin)) {
      return cb(null, true);
    }

    console.warn("[CORS] Blocked origin:", origin, "allowed:", ALLOWED_ORIGINS);
    return cb(new Error("Not allowed by CORS"), false);
  },
};



app.use(cors(corsOptions));

app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Allow ?token=... for SSE / some taps
app.use(allowTokenQuery);

// -------------------------------------------------------------------
// Back-compat bridge for plugins that expect auth.requireUser/admin
// (Some plugins use auth.requireUser / auth.requireAdmin, while v2 also
// exports standalone requireAdmin/requireMaintenance middleware.)
// -------------------------------------------------------------------
if (auth && typeof auth === "object") {
  if (typeof auth.requireUser !== "function") {
    auth.requireUser = (req, res, next) => {
      if (req.user) return next();
      return res.status(401).json({ error: "Authentication required" });
    };
  }

  if (typeof auth.requireAdmin !== "function" && typeof requireAdmin === "function") {
    auth.requireAdmin = requireAdmin;
  }
}

// =======================================================
// Static frontend + skin
// =======================================================


// Main SPA (index.html etc.)
app.use(express.static(SKIN_DIR, { index: false }));

// Skin assets (CSS, logos, icons)
app.use("/skin", express.static(SKIN_DIR, { index: false }));


// Root → serve SPA index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(SKIN_DIR, "index.html"));
});


// (OPTIONAL) catch-all for SPA routes (/# handled in frontend anyway).
// If you have clean URLs like /login or /about, you can uncomment this:
//
// app.get(["/login", "/about"], (req, res) => {
//   res.sendFile(path.join(FRONTEND_DIR, "index.html"));
// });

// =======================================================
// SSE endpoint
// =======================================================
app.get("/events", auth, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  sseClients.add(res);
  res.write("event: hello\ndata: {}\n\n");

  req.on("close", () => {
    sseClients.delete(res);
  });
});

// Simple health-check
app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    time: nowISO(),
    db: !!pool,
    version: "v2",
  });
});

// =======================================================
// Attach helpers + env stuff to app.locals (for plugins)
// =======================================================
app.locals.sendEvent = sendEvent;
app.locals.getTenantConfig = getTenantConfig;
app.locals.normalizeToken = normalizeToken;
app.locals.rowsToCsv = rowsToCsv;

app.locals.makeToken = makeToken;
app.locals.makeResetToken = makeResetToken;
app.locals.JWT_SECRET = JWT_SECRET;
app.locals.bcrypt = bcrypt;

app.locals.tenantIdOf = tenantIdOf;
app.locals.roleOf = roleOf;
app.locals.catOf = catOf;

app.locals.PUBLIC_WEB_URL = PUBLIC_WEB_URL;
app.locals.PUBLIC_API_URL = PUBLIC_API_URL;

// VAPID / push config (used later when we hook push plugin)
app.locals.pushConfig = {
  publicKey: (process.env.VAPID_PUBLIC_KEY || "").trim(),
  privateKey: (process.env.VAPID_PRIVATE_KEY || "").trim(),
  subject: (process.env.VAPID_SUBJECT || "").trim(),
};

// =======================================================
// Register plugins + core operational routes
// =======================================================

// 0) Demo auth endpoints (/auth/login, /me, /me/mcp)
setupDemoAuth({ app, auth, makeToken, pool });

// 1) Push notifications (must come early so others can use app.locals.pushNotify)
const { publicKey, privateKey, subject } = app.locals.pushConfig;
setupPush({
  app,
  pool,
  auth,
  tenantIdOf,
  VAPID_PUBLIC_KEY:  publicKey,
  VAPID_PRIVATE_KEY: privateKey,
  VAPID_SUBJECT:     subject || 'mailto:admin@example.com',
});


// 2) Password reset / change-password flows
setupPasswords({
  app,
  pool,
  auth,
  baseUrl: PUBLIC_WEB_URL || PUBLIC_API_URL || `http://localhost:${PORT}`,
  tenantIdOf,
});

// Staff / users (list, create, delete, admin password reset)
setupStaff({
  app,
  pool,
  auth,
  tenantIdOf,
  roleOf,
});

// 3) Attachments (photos on issues)
setupAttachments({
  app,
  pool,
  auth,
  uploadDir: process.env.ERNOS_UPLOAD_DIR,   // or leave undefined to use default ./uploads
  publicBaseUrl: PUBLIC_API_URL || PUBLIC_WEB_URL || "",
});

// 4) Legacy shims (ff summary + empty attachments)
// Must be BEFORE fridge_fire and core ops.
setupLegacyShims({
  app,
  auth,
});

// 5) Fridge / Fire / TAP pages bundle
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
// 5b) Universal tap router (/tap/u/:token)
setupTapUniversal({
  app,
  pool,
  normalizeToken,
});
// Environmental Audit TAP + runner pages
setupEnvAudit({
  app,
  PUBLIC_API_URL,
});
// 6) Residents out (reception tap)
setupResidentsOut({
  app,
  pool,
  auth,
  tenantIdOf,
  PUBLIC_API_URL,
});

setupNursingAlerts({ app, pool, auth, PUBLIC_API_URL });

setupVisitors({
  app,
  pool,
  auth,
  tenantIdOf,
});
// 6b) Family Touchpoint (staff snapshot + visitor session + visitor read-only)
setupFamilyTouchpoint({
  app,
  pool,
  auth,
});

// 7) Locations + QR codes (legacy SPA)
setupLocations({
  app,
  pool,
  auth,
  tenantIdOf,
  requireAdmin,
  rowsToCsv,
});
setupQrPrint({
  app,
  pool,
  tenantIdOf,
  auth,              // <- NEW
  PUBLIC_WEB_URL,
  PUBLIC_API_URL,
});

// 8) Core operational routes (QR / checkins / visitors / env / alerts / issues)
setupOps({
  app,
  pool,
  auth,
  requireAdmin,
  tenantIdOf,
  nowISO,
  normalizeToken,
  rowsToCsv,
  getTenantConfig,
  sendEvent,
});
// 9) Issues plugin (open issues card + write APIs)
setupIssues({
  app,
  pool,
  auth,
  tenantIdOf,
});
// =======================================================
// 404 + error handler (last)
// =======================================================
app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});


// Global error middleware
app.use((err, req, res, next) => {
  console.error("[unhandled error]", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: "server error",
    // In development you can expose a bit more detail:
    ...(NODE_ENV !== "production" ? { detail: String(err.message || err) } : {}),
  });
});

// =======================================================
// Boot: migrations + seeds + listen
// =======================================================
async function start() {
  console.log("[boot] Using PORT =", PORT);
  console.log("[boot] FRONTEND_DIR =", FRONTEND_DIR);
  console.log("[boot] SKIN_DIR =", SKIN_DIR);
  console.log("[boot] PUBLIC_WEB_URL =", PUBLIC_WEB_URL || "(none)");
  console.log("[boot] PUBLIC_API_URL =", PUBLIC_API_URL || "(none)");

  console.log("[boot] Running migrations…");
  await runMigrations();

  console.log("[boot] Ensuring default tenant…");
  await ensureDefaultTenant();

    const allowSeeds =
    NODE_ENV !== "production" || process.env.ERNOS_ALLOW_SEEDS === "1";

  if (allowSeeds) {
    console.log("[boot] Seeding superadmin/questions… (admin seeding disabled on VPS)");
    // NOTE:
    // users.username is NOT NULL on your DB, and admin already exists,
    // so calling seedAdmin() again just explodes with 23502.
    // If we ever need it again, we can fix seedAdmin() to include username.
    // await seedAdmin();
    await seedSuperadmin();
    await seedQuestions();
  } else {
    console.log("[boot] Skipping seeds (NODE_ENV=production and ERNOS_ALLOW_SEEDS!=1).");
  }


  app.listen(PORT, () => {
    console.log(`[boot] Ernos v2 server listening on http://localhost:${PORT}`);
  });
}

start().catch((e) => {
  console.error("[boot] Fatal:", e);
  process.exit(1);
});

// Export app for testing if needed
module.exports = app;
