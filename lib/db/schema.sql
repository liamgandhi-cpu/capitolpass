-- ===========================================================================
--  CapitolPass schema
-- ===========================================================================
--
--  Runs on SQLite via node:sqlite (no native build step, no service to start).
--  supabase/schema.sql is the Postgres translation of this same model for a
--  hosted deployment; keep the two in step.
--
--  Conventions:
--    * ids are text (nanoid-style) so records can be created client-side or
--      merged across databases without sequence collisions.
--    * timestamps are ISO-8601 strings in UTC.
--    * calendar dates are 'YYYY-MM-DD' text, never timestamps — a trip date is
--      a date on a wall calendar, not an instant.
--    * json columns hold shapes that are genuinely free-form (a computed plan,
--      a packet snapshot). Anything queried gets its own column.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Schools — from the NCES Common Core of Data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schools (
  nces_id           TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  lea_name          TEXT,
  street            TEXT,
  city              TEXT,
  state             TEXT NOT NULL,
  zip               TEXT,
  latitude          REAL,
  longitude         REAL,
  enrollment        INTEGER,
  is_charter        INTEGER NOT NULL DEFAULT 0,
  level             TEXT,
  -- Congressional district, resolved once from the school's coordinates and
  -- then cached. Null until resolved; we never guess it from the ZIP code.
  district_state    TEXT,
  district_number   INTEGER,
  district_method   TEXT,          -- 'coordinates' | 'address' | 'manual'
  district_resolved_at TEXT,
  source            TEXT NOT NULL DEFAULT 'nces_ccd',
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schools_state_city ON schools (state, city);
CREATE INDEX IF NOT EXISTS idx_schools_name ON schools (name);
CREATE INDEX IF NOT EXISTS idx_schools_district ON schools (district_state, district_number);

-- ---------------------------------------------------------------------------
-- School email domains
-- ---------------------------------------------------------------------------
--
--  The original plan was "match the teacher's email domain against NCES".
--  NCES does not publish email domains — it has no such field. So the mapping
--  has to be built, and this table is where it lives.
--
--  status:
--    'seeded'          we added it by hand and checked it
--    'admin_confirmed' a school administrator on this domain confirmed it
--    'claimed'         a teacher asserted it; not yet independently confirmed
--    'rejected'        confirmed wrong, kept so we stop re-suggesting it
--
--  Only 'seeded' and 'admin_confirmed' domains can produce a Verified Trip
--  badge. A 'claimed' domain still lets the teacher use the whole product —
--  we never hard-block someone because we lack data about their school.

CREATE TABLE IF NOT EXISTS school_domains (
  domain            TEXT PRIMARY KEY,
  nces_id           TEXT REFERENCES schools (nces_id) ON DELETE SET NULL,
  status            TEXT NOT NULL CHECK (status IN ('seeded','admin_confirmed','claimed','rejected')),
  claimed_by        TEXT,          -- user id
  confirmed_by      TEXT,          -- administrator email
  confirmed_at      TEXT,
  note              TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_school_domains_nces ON school_domains (nces_id);

-- ---------------------------------------------------------------------------
-- Users and sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT,
  role              TEXT NOT NULL CHECK (role IN ('teacher','student','staff','admin')),
  school_nces_id    TEXT REFERENCES schools (nces_id) ON DELETE SET NULL,
  -- Free-text school name for teachers whose school is not in NCES
  -- (private, parochial, homeschool co-op). Never a blocker.
  school_freeform   TEXT,
  email_verified_at TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_school ON users (school_nces_id);

CREATE TABLE IF NOT EXISTS sessions (
  token             TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Single-use tokens for sign-in links and administrator co-sign links.
CREATE TABLE IF NOT EXISTS magic_links (
  token             TEXT PRIMARY KEY,
  email             TEXT NOT NULL,
  purpose           TEXT NOT NULL CHECK (purpose IN ('signin','admin_cosign','office_claim')),
  payload           TEXT,          -- json
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  used_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links (email);

-- ---------------------------------------------------------------------------
-- Congressional offices
-- ---------------------------------------------------------------------------
--
--  One row per office we know about. Offices exist in the table whether or not
--  anyone has claimed them, so a teacher can always see who they would be
--  writing to — claiming only changes how the request is delivered.

CREATE TABLE IF NOT EXISTS offices (
  id                TEXT PRIMARY KEY,
  bioguide_id       TEXT NOT NULL UNIQUE,
  chamber           TEXT NOT NULL CHECK (chamber IN ('house','senate')),
  state             TEXT NOT NULL,
  district          INTEGER,       -- null for senators
  member_name       TEXT NOT NULL,
  claim_status      TEXT NOT NULL DEFAULT 'unclaimed'
                    CHECK (claim_status IN ('unclaimed','pending','claimed')),
  claimed_at        TEXT,
  -- Offices set their own weekly limit; defaults to the documented one tour
  -- per week but a scheduler can correct it.
  weekly_tour_limit INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offices_state_district ON offices (state, district);

CREATE TABLE IF NOT EXISTS office_staff (
  id                TEXT PRIMARY KEY,
  office_id         TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title             TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','revoked')),
  created_at        TEXT NOT NULL,
  UNIQUE (office_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trips (
  id                TEXT PRIMARY KEY,
  teacher_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  school_nces_id    TEXT REFERENCES schools (nces_id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  join_code         TEXT NOT NULL UNIQUE,

  preferred_date    TEXT NOT NULL,
  alternate_date_1  TEXT,
  alternate_date_2  TEXT,

  students          INTEGER NOT NULL,
  teachers          INTEGER NOT NULL,
  chaperones        INTEGER NOT NULL,
  grade_band        TEXT NOT NULL CHECK (grade_band IN ('elementary','middle','high','mixed')),
  arrival_method    TEXT NOT NULL CHECK (arrival_method IN ('charter_bus','amtrak','flying','local')),
  accessibility     TEXT NOT NULL DEFAULT '[]',   -- json array
  wants_tour        INTEGER NOT NULL DEFAULT 1,
  wants_meeting     INTEGER NOT NULL DEFAULT 0,

  -- Delegation resolved at creation time and cached, so a trip keeps pointing
  -- at the right office even if the school record is later corrected.
  district_state    TEXT,
  district_number   INTEGER,

  -- The computed plan, stored so the teacher sees a stable plan rather than one
  -- that silently changes as deadlines pass. Recomputed on demand.
  plan_json         TEXT,
  plan_computed_at  TEXT,

  -- Administrator co-sign — the third verification layer.
  cosign_email      TEXT,
  cosign_status     TEXT NOT NULL DEFAULT 'none'
                    CHECK (cosign_status IN ('none','pending','confirmed','declined')),
  cosign_at         TEXT,

  status            TEXT NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning','requesting','confirmed','completed','cancelled')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trips_teacher ON trips (teacher_id);
CREATE INDEX IF NOT EXISTS idx_trips_join_code ON trips (join_code);

CREATE TABLE IF NOT EXISTS trip_members (
  id                TEXT PRIMARY KEY,
  trip_id           TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users (id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('student','chaperone','teacher')),
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members (trip_id);

-- ---------------------------------------------------------------------------
-- Requests — one per destination the trip needs
-- ---------------------------------------------------------------------------
--
--  send_mode records how this request left the building, which determines who
--  is responsible for keeping the status honest:
--    'prefill'  teacher pasted it into the office's own form  → teacher updates
--    'email'    teacher sent it from their own mailbox        → teacher updates
--    'in_app'   delivered into a claimed office's queue       → office updates

CREATE TABLE IF NOT EXISTS requests (
  id                TEXT PRIMARY KEY,
  trip_id           TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  destination_type  TEXT NOT NULL CHECK (destination_type IN
                      ('cvc_group_reservation','house_office_tour','senate_office_tour','rep_meeting')),
  office_id         TEXT REFERENCES offices (id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  guests            INTEGER NOT NULL,
  send_by           TEXT,          -- date
  send_mode         TEXT CHECK (send_mode IN ('prefill','email','in_app')),

  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
                      ('draft','sent','acknowledged','confirmed','declined','alternate_proposed')),
  -- Which of the trip's three dates this request is actually for.
  requested_date    TEXT,
  -- Set when an office proposes something different.
  proposed_date     TEXT,
  response_note     TEXT,

  packet_json       TEXT,          -- snapshot of what was sent
  sent_at           TEXT,
  responded_at      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_trip ON requests (trip_id);
CREATE INDEX IF NOT EXISTS idx_requests_office_status ON requests (office_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_requested_date ON requests (requested_date);

-- Append-only history. Both sides can see exactly what happened and when,
-- which is most of what teachers say they want from this process.
CREATE TABLE IF NOT EXISTS request_events (
  id                TEXT PRIMARY KEY,
  request_id        TEXT NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  actor_type        TEXT NOT NULL CHECK (actor_type IN ('teacher','office','system')),
  actor_name        TEXT,
  from_status       TEXT,
  to_status         TEXT,
  note              TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_events_request ON request_events (request_id);

-- ---------------------------------------------------------------------------
-- Student questions for the Member meeting
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS student_questions (
  id                TEXT PRIMARY KEY,
  trip_id           TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  author_name       TEXT NOT NULL,
  body              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted','selected','hidden')),
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_questions_trip ON student_questions (trip_id, status);

-- ---------------------------------------------------------------------------
-- Lunch venues
-- ---------------------------------------------------------------------------
--
--  is_partner is 0 for every row shipped with this project and must stay that
--  way until a real agreement exists. The directory is researched public
--  information; a partnership is a relationship. Conflating the two would be
--  the fastest way to lose a reader's trust.

CREATE TABLE IF NOT EXISTS venues (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL,     -- 'cafeteria' | 'fast_casual' | 'food_hall' | 'sit_down' | 'outdoor'
  address           TEXT,
  walk_minutes      INTEGER,
  max_group         INTEGER,
  price_per_student_cents INTEGER,
  takes_advance_orders INTEGER NOT NULL DEFAULT 0,
  dietary           TEXT NOT NULL DEFAULT '[]',   -- json array
  notes             TEXT,
  source_url        TEXT,
  is_partner        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS partner_leads (
  id                TEXT PRIMARY KEY,
  business_name     TEXT NOT NULL,
  contact_name      TEXT,
  email             TEXT NOT NULL,
  phone             TEXT,
  max_group         INTEGER,
  notes             TEXT,
  created_at        TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Schema bookkeeping
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_meta (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL
);
