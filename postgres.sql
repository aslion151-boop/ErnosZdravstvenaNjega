-- Postgres schema for Ernos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password        TEXT NOT NULL,
  role            TEXT NOT NULL,
  category        TEXT,
  title           TEXT
);

-- LOCATIONS
CREATE TABLE IF NOT EXISTS locations (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- QR TOKENS
CREATE TABLE IF NOT EXISTS qrcodes (
  id              BIGSERIAL PRIMARY KEY,
  token           TEXT NOT NULL UNIQUE,
  location_id     BIGINT REFERENCES locations(id) ON DELETE CASCADE
);

-- CHECKINS
CREATE TABLE IF NOT EXISTS checkins (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  location_id     BIGINT REFERENCES locations(id) ON DELETE SET NULL,
  checkin_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checkout_at     TIMESTAMPTZ,
  note            TEXT,
  user_name       TEXT,
  user_category   TEXT,
  location_name   TEXT
);

-- VISITORS
CREATE TABLE IF NOT EXISTS visitors (
  id              BIGSERIAL PRIMARY KEY,
  primary_name    TEXT NOT NULL,
  names           TEXT,                 -- JSON string array for compatibility with UI
  resident        TEXT,
  checkin_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checkout_at     TIMESTAMPTZ
);

-- ISSUES (Maintenance)
CREATE TABLE IF NOT EXISTS issues (
  id                   BIGSERIAL PRIMARY KEY,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ,
  user_id              BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_name            TEXT,
  location_id          BIGINT REFERENCES locations(id) ON DELETE SET NULL,
  location_name        TEXT,
  category             TEXT,
  text                 TEXT,
  status               TEXT,
  accepted_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
  accepted_by_name     TEXT,
  accepted_at          TIMESTAMPTZ,
  maintenance_comment  TEXT
);

-- ENVIRONMENTAL AUDIT
CREATE TABLE IF NOT EXISTS env_questions (
  id        BIGSERIAL PRIMARY KEY,
  section   TEXT NOT NULL,
  text      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS env_audits (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at  TIMESTAMPTZ,
  auditor_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  auditor_name  TEXT,
  overall_score INTEGER,
  status        TEXT
);

CREATE TABLE IF NOT EXISTS env_audit_locations (
  id            BIGSERIAL PRIMARY KEY,
  audit_id      BIGINT REFERENCES env_audits(id) ON DELETE CASCADE,
  location_id   BIGINT REFERENCES locations(id) ON DELETE SET NULL,
  location_name TEXT
);

CREATE TABLE IF NOT EXISTS env_audit_answers (
  id           BIGSERIAL PRIMARY KEY,
  audit_loc_id BIGINT REFERENCES env_audit_locations(id) ON DELETE CASCADE,
  question_id  BIGINT REFERENCES env_questions(id) ON DELETE SET NULL,
  answer       TEXT,
  comment      TEXT
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_checkins_open    ON checkins (checkout_at) WHERE checkout_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_checkins_cat     ON checkins (user_category);
CREATE INDEX IF NOT EXISTS idx_issues_status    ON issues (status);
CREATE INDEX IF NOT EXISTS idx_visitors_open    ON visitors (checkout_at) WHERE checkout_at IS NULL;

-- Seed env questions (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM env_questions) THEN
    INSERT INTO env_questions(section,text) VALUES
      ('General Environment','Are all areas visibly clean and free from clutter?'),
      ('General Environment','Is the environment free from unpleasant odours?'),
      ('General Environment','Is lighting adequate across areas?'),
      ('General Environment','Is ventilation adequate in all areas?'),
      ('Health & Safety','Are fire exits clearly marked and unobstructed?'),
      ('Health & Safety','Are fire doors functioning and not propped open?'),
      ('Health & Safety','Is emergency lighting tested and working?'),
      ('Infection Prevention & Control','Are alcohol hand gel dispensers available and filled?'),
      ('Infection Prevention & Control','Are sinks with soap and paper towels available where needed?'),
      ('Infection Prevention & Control','Is PPE available and stored appropriately?'),
      ('Maintenance & Equipment','Is equipment clean and in good working order?'),
      ('Maintenance & Equipment','Evidence of regular servicing/maintenance of equipment?'),
      ('Resident Comfort & Dignity','Are bedrooms personalised and homely?'),
      ('Resident Comfort & Dignity','Are bathrooms clean, accessible, and private?');
  END IF;
END$$;
