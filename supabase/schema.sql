-- ===========================================================================
--  CapitolPass — Postgres / Supabase schema
-- ===========================================================================
--
--  This is the hosted translation of lib/db/schema.sql. The local app runs on
--  SQLite through node:sqlite so that `git clone && npm run setup && npm run
--  dev` works with no service to start and no credentials to hand out. This
--  file is what you apply when you want the same model on Supabase.
--
--  Differences from the SQLite version, and why:
--
--    * Real enum types instead of CHECK constraints. Postgres has them; using
--      them means a bad status value fails at the type level.
--    * `timestamptz` for instants, `date` for calendar dates. SQLite has
--      neither, so the local schema stores both as text. Trip dates stay
--      `date` — a trip date is a day on a calendar, not an instant, and
--      storing it as a timestamp is how you end up off by one across a
--      timezone boundary.
--    * `jsonb` instead of json-in-text.
--    * Row Level Security, which SQLite has no equivalent for. The policies at
--      the bottom are the real access rules: a teacher sees their own trips, a
--      staffer sees requests addressed to their office, and nobody sees
--      anything else.
--
--  Apply with:  psql "$DATABASE_URL" -f supabase/schema.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

CREATE TYPE user_role         AS ENUM ('teacher','student','staff','admin');
CREATE TYPE domain_status     AS ENUM ('seeded','admin_confirmed','claimed','rejected');
CREATE TYPE magic_purpose     AS ENUM ('signin','admin_cosign','office_claim');
CREATE TYPE chamber           AS ENUM ('house','senate');
CREATE TYPE claim_status      AS ENUM ('unclaimed','pending','claimed');
CREATE TYPE staff_status      AS ENUM ('pending','approved','revoked');
CREATE TYPE grade_band        AS ENUM ('elementary','middle','high','mixed');
CREATE TYPE arrival_method    AS ENUM ('charter_bus','amtrak','flying','local');
CREATE TYPE cosign_status     AS ENUM ('none','pending','confirmed','declined');
CREATE TYPE trip_status       AS ENUM ('planning','requesting','confirmed','completed','cancelled');
CREATE TYPE member_role       AS ENUM ('student','chaperone','teacher');
CREATE TYPE destination_type  AS ENUM (
  'cvc_group_reservation','house_office_tour','senate_office_tour','rep_meeting'
);
CREATE TYPE send_mode         AS ENUM ('prefill','email','in_app');
CREATE TYPE request_status    AS ENUM (
  'draft','sent','acknowledged','confirmed','declined','alternate_proposed'
);
CREATE TYPE actor_type        AS ENUM ('teacher','office','system');
CREATE TYPE question_status   AS ENUM ('submitted','selected','hidden');

-- ---------------------------------------------------------------------------
-- Schools
-- ---------------------------------------------------------------------------

CREATE TABLE schools (
  nces_id              text PRIMARY KEY,
  name                 text NOT NULL,
  lea_name             text,
  street               text,
  city                 text,
  state                text NOT NULL,
  zip                  text,
  latitude             double precision,
  longitude            double precision,
  enrollment           integer,
  is_charter           boolean NOT NULL DEFAULT false,
  level                text,
  -- Resolved from the school's coordinates via the US Census Geocoder and
  -- cached. Never inferred from the ZIP code.
  district_state       text,
  district_number      integer,
  district_method      text,
  district_resolved_at timestamptz,
  source               text NOT NULL DEFAULT 'nces_ccd',
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX schools_state_city_idx ON schools (state, city);
CREATE INDEX schools_district_idx   ON schools (district_state, district_number);
-- Trigram index for the "find your school" search box.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX schools_name_trgm_idx  ON schools USING gin (name gin_trgm_ops);

-- No federal dataset maps email domains to schools, so this mapping is built
-- by the app. `status` records how much a given entry actually proves.
CREATE TABLE school_domains (
  domain       text PRIMARY KEY,
  nces_id      text REFERENCES schools (nces_id) ON DELETE SET NULL,
  status       domain_status NOT NULL,
  claimed_by   uuid,
  confirmed_by text,
  confirmed_at timestamptz,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX school_domains_nces_idx ON school_domains (nces_id);

-- ---------------------------------------------------------------------------
-- Users and sessions
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL UNIQUE,
  name              text,
  role              user_role NOT NULL,
  school_nces_id    text REFERENCES schools (nces_id) ON DELETE SET NULL,
  school_freeform   text,
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE magic_links (
  token      text PRIMARY KEY,
  email      text NOT NULL,
  purpose    magic_purpose NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

CREATE INDEX magic_links_email_idx ON magic_links (email);

-- ---------------------------------------------------------------------------
-- Congressional offices
-- ---------------------------------------------------------------------------

CREATE TABLE offices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bioguide_id       text NOT NULL UNIQUE,
  chamber           chamber NOT NULL,
  state             text NOT NULL,
  district          integer,
  member_name       text NOT NULL,
  claim_status      claim_status NOT NULL DEFAULT 'unclaimed',
  claimed_at        timestamptz,
  weekly_tour_limit integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX offices_state_district_idx ON offices (state, district);

CREATE TABLE office_staff (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id  uuid NOT NULL REFERENCES offices (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      text,
  status     staff_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------

CREATE TABLE trips (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  school_nces_id   text REFERENCES schools (nces_id) ON DELETE SET NULL,
  title            text NOT NULL,
  join_code        text NOT NULL UNIQUE,

  preferred_date   date NOT NULL,
  alternate_date_1 date,
  alternate_date_2 date,

  students         integer NOT NULL CHECK (students   >= 0),
  teachers         integer NOT NULL CHECK (teachers   >= 0),
  chaperones       integer NOT NULL CHECK (chaperones >= 0),
  grade_band       grade_band NOT NULL,
  arrival_method   arrival_method NOT NULL,
  accessibility    jsonb NOT NULL DEFAULT '[]'::jsonb,
  wants_tour       boolean NOT NULL DEFAULT true,
  wants_meeting    boolean NOT NULL DEFAULT false,

  district_state   text,
  district_number  integer,

  plan_json        jsonb,
  plan_computed_at timestamptz,

  cosign_email     text,
  cosign_status    cosign_status NOT NULL DEFAULT 'none',
  cosign_at        timestamptz,

  status           trip_status NOT NULL DEFAULT 'planning',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trips_teacher_idx ON trips (teacher_id);

CREATE TABLE trip_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role         member_role NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trip_members_trip_idx ON trip_members (trip_id);

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------

CREATE TABLE requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  destination_type destination_type NOT NULL,
  office_id        uuid REFERENCES offices (id) ON DELETE SET NULL,
  title            text NOT NULL,
  guests           integer NOT NULL,
  send_by          date,
  send_mode        send_mode,

  status           request_status NOT NULL DEFAULT 'draft',
  requested_date   date,
  proposed_date    date,
  response_note    text,

  packet_json      jsonb,
  sent_at          timestamptz,
  responded_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX requests_trip_idx           ON requests (trip_id);
CREATE INDEX requests_office_status_idx  ON requests (office_id, status);
CREATE INDEX requests_requested_date_idx ON requests (requested_date);

CREATE TABLE request_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  actor_type  actor_type NOT NULL,
  actor_name  text,
  from_status request_status,
  to_status   request_status,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX request_events_request_idx ON request_events (request_id);

-- ---------------------------------------------------------------------------
-- Student questions, venues, partner leads
-- ---------------------------------------------------------------------------

CREATE TABLE student_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  author_name text NOT NULL,
  body        text NOT NULL,
  status      question_status NOT NULL DEFAULT 'submitted',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_questions_trip_idx ON student_questions (trip_id, status);

CREATE TABLE venues (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  kind                    text NOT NULL,
  address                 text,
  walk_minutes            integer,
  max_group               integer,
  price_per_student_cents integer,
  takes_advance_orders    boolean NOT NULL DEFAULT false,
  dietary                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                   text,
  source_url              text,
  -- Stays false until a signed agreement exists. A directory listing is
  -- researched public information; a partnership is a relationship.
  is_partner              boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE partner_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name  text,
  email         text NOT NULL,
  phone         text,
  max_group     integer,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
--  These policies assume Supabase Auth, where `auth.uid()` is the signed-in
--  user. The local SQLite build enforces the same rules in application code
--  (see the ownership checks in every teacher route) — here they are enforced
--  by the database, which is stronger.

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips             ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_staff      ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_leads     ENABLE ROW LEVEL SECURITY;

-- Schools, offices and venues are public reference data.
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY schools_readable ON schools FOR SELECT USING (true);

ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
CREATE POLICY offices_readable ON offices FOR SELECT USING (true);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY venues_readable ON venues FOR SELECT USING (true);

-- A user can read and update only their own record.
CREATE POLICY users_self ON users
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- A teacher owns their trips outright.
CREATE POLICY trips_owner ON trips
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- A teacher sees the requests belonging to their trips.
CREATE POLICY requests_teacher ON requests
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = requests.trip_id AND t.teacher_id = auth.uid())
  );

-- Approved office staff see requests addressed to their office, and may update
-- them — this is the queue. Note they can only reach requests that have
-- actually been sent: a teacher's draft is not visible to anyone else.
CREATE POLICY requests_office_read ON requests FOR SELECT
  USING (
    requests.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM office_staff s
      WHERE s.office_id = requests.office_id
        AND s.user_id = auth.uid()
        AND s.status = 'approved'
    )
  );

CREATE POLICY requests_office_respond ON requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM office_staff s
      WHERE s.office_id = requests.office_id
        AND s.user_id = auth.uid()
        AND s.status = 'approved'
    )
  );

-- Event history follows whatever access the request itself has.
CREATE POLICY request_events_visible ON request_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM requests r WHERE r.id = request_events.request_id)
  );

-- Questions belong to the trip's teacher. Students submit them without an
-- account, so inserts go through a server route rather than this policy.
CREATE POLICY questions_teacher ON student_questions
  USING (
    EXISTS (SELECT 1 FROM trips t WHERE t.id = student_questions.trip_id AND t.teacher_id = auth.uid())
  );

CREATE POLICY office_staff_self ON office_staff
  USING (user_id = auth.uid());

-- Anyone may register interest; nobody may read the list back.
CREATE POLICY partner_leads_insert ON partner_leads FOR INSERT WITH CHECK (true);

COMMIT;
