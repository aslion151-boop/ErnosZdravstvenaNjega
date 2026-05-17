// backend/db.cjs
// Centralised PostgreSQL pool + migrations + seeds

try { require("dotenv").config(); } catch (_) {}

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const {
  DATABASE_URL,
  PGHOST,
  PGPORT,
  PGUSER,
  PGPASSWORD,
  PGDATABASE,
  PGSSL,
} = process.env;

// Prefer DATABASE_URL, but allow explicit PGHOST/PGUSER/PGDATABASE config
if (!DATABASE_URL && !PGHOST && !PGDATABASE) {
  console.error(
    "[db] FATAL: No DATABASE_URL or PGHOST/PGDATABASE provided. " +
    "Set DATABASE_URL or the standard PG* env vars."
  );
  // Let this crash early rather than fail later in random places
  throw new Error("Database configuration missing");
}

const pool = new Pool({
  connectionString: DATABASE_URL || undefined,
  host: DATABASE_URL ? undefined : PGHOST,
  port: DATABASE_URL ? undefined : (PGPORT ? Number(PGPORT) : undefined),
  user: DATABASE_URL ? undefined : PGUSER,
  password: DATABASE_URL ? undefined : PGPASSWORD,
  database: DATABASE_URL ? undefined : PGDATABASE,
  ssl: PGSSL === "1" ? { rejectUnauthorized: false } : false,

  // Basic pooling tunables (can override via env)
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PGPOOL_IDLE || 30000),
  connectionTimeoutMillis: Number(process.env.PGPOOL_CONN_TIMEOUT || 10000),
});

// Log unexpected idle errors so they don't crash the process silently
pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle client:", err);
});

// Optional: per-connection statement timeout (in ms) via PG_STATEMENT_TIMEOUT
pool.on("connect", (client) => {
  const ms = Number(process.env.PG_STATEMENT_TIMEOUT || 0);
  if (ms > 0 && Number.isFinite(ms)) {
    client
      .query(`SET statement_timeout TO ${ms}`)
      .catch((err) => console.warn("[db] Failed to set statement_timeout:", err.message));
  }
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
  if (!email) return;

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

async function seedQuestions() {
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

module.exports = {
  pool,
  runMigrations,
  ensureDefaultTenant,
  seedAdmin,
  seedSuperadmin,
  seedQuestions,
};
