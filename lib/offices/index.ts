/**
 * Congressional offices — the second side of the system.
 *
 * A teacher-only version of this app is a form generator. What makes it a
 * system is that the office can claim their account and get a clean queue of
 * requests from schools that are actually their constituents, with the district
 * match already proved and a weekly capacity tracker that reflects the real
 * limit they work under.
 */

import { all, get, newId, nowIso, run, transaction } from '../db';
import { isoWeekKey, startOfIsoWeek, addDays, daysBetween, type IsoDate } from '../dates';
import { RULES } from '../feasibility/rules.config';
import { allMembers, memberByBioguide, type Member } from '../congress/legislators';
import { DEMO_PERSONAS } from '../auth/demo';

export interface Office {
  id: string;
  bioguide_id: string;
  chamber: 'house' | 'senate';
  state: string;
  district: number | null;
  member_name: string;
  claim_status: 'unclaimed' | 'pending' | 'claimed';
  claimed_at: string | null;
  weekly_tour_limit: number;
  created_at: string;
}

export interface QueueItem {
  requestId: string;
  tripId: string;
  title: string;
  destinationType: string;
  status: string;
  requestedDate: string | null;
  proposedDate: string | null;
  guests: number;
  sendBy: string | null;
  sentAt: string | null;
  createdAt: string;

  schoolName: string;
  schoolCity: string | null;
  schoolState: string | null;
  schoolDistrictState: string | null;
  schoolDistrictNumber: number | null;

  teacherName: string | null;
  teacherEmail: string;

  gradeBand: string;
  accessibility: string;
  students: number;
  teachers: number;
  chaperones: number;

  cosignStatus: string;
  domainStatus: string | null;
}

// ---------------------------------------------------------------------------
// Office records
// ---------------------------------------------------------------------------

export function getOffice(id: string): Office | null {
  return get<Office>('SELECT * FROM offices WHERE id = ?', id);
}

export function officeByBioguide(bioguideId: string): Office | null {
  return get<Office>('SELECT * FROM offices WHERE bioguide_id = ?', bioguideId);
}

/**
 * True when every approved staff account on this office is a seeded demo
 * persona.
 *
 * The demo claims a real office — the one the demo school's district actually
 * resolves to — so that the routing it shows is real. Everything that office
 * then "says" is invented by the seed. Pages use this to label it as sample
 * data, so nothing fabricated is ever presented as a real office's words.
 * Deliberately not gated on CAPITOLPASS_DEMO: the data is fabricated whether
 * or not the demo doors are switched on.
 */
export function isDemoOffice(officeId: string): boolean {
  const staff = all<{ email: string }>(
    `SELECT u.email FROM office_staff s
     JOIN users u ON u.id = s.user_id
     WHERE s.office_id = ? AND s.status = 'approved'`,
    officeId,
  );
  if (staff.length === 0) return false;
  const demoEmails = new Set(DEMO_PERSONAS.map((p) => p.email));
  return staff.every((row) => demoEmails.has(row.email.trim().toLowerCase()));
}

export function officesForUser(userId: string): Office[] {
  return all<Office>(
    `SELECT o.* FROM offices o
     JOIN office_staff s ON s.office_id = o.id
     WHERE s.user_id = ? AND s.status = 'approved'
     ORDER BY o.state, o.district`,
    userId,
  );
}

export function pendingStaffFor(userId: string): Office[] {
  return all<Office>(
    `SELECT o.* FROM offices o
     JOIN office_staff s ON s.office_id = o.id
     WHERE s.user_id = ? AND s.status = 'pending'`,
    userId,
  );
}

/** Create office rows for every current member. Idempotent. */
export function ensureOfficesExist(): number {
  let created = 0;
  transaction(() => {
    for (const member of allMembers()) {
      const existing = officeByBioguide(member.bioguideId);
      if (existing) continue;
      run(
        `INSERT INTO offices (id, bioguide_id, chamber, state, district, member_name, claim_status, weekly_tour_limit, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        newId(),
        member.bioguideId,
        member.chamber,
        member.state,
        member.district,
        member.name,
        'unclaimed',
        RULES.officeStaffLedToursPerWeek.value,
        nowIso(),
      );
      created += 1;
    }
  });
  return created;
}

export function memberForOffice(office: Office): Member | null {
  return memberByBioguide(office.bioguide_id);
}

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

/**
 * Whether an email address can claim an office.
 *
 * The domain test is a real signal — you cannot get a @mail.house.gov address
 * without working there — but it is not sufficient on its own, because it does
 * not prove *which* office. So a claim lands in `pending` and a human approves
 * it. For a demo that human is the project maintainer; in production it would
 * be a verification step with the office itself.
 */
export function canClaimOffice(email: string, chamber: 'house' | 'senate'): {
  allowed: boolean;
  reason: string;
} {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';

  const houseOk = domain === 'mail.house.gov' || domain.endsWith('.house.gov') || domain === 'house.gov';
  const senateOk = domain === 'senate.gov' || domain.endsWith('.senate.gov');

  if (chamber === 'house' && houseOk) {
    return { allowed: true, reason: 'House domain confirmed.' };
  }
  if (chamber === 'senate' && senateOk) {
    return { allowed: true, reason: 'Senate domain confirmed.' };
  }

  return {
    allowed: false,
    reason:
      chamber === 'house'
        ? 'Office accounts need an email address on a house.gov domain.'
        : 'Office accounts need an email address on a senate.gov domain.',
  };
}

export function requestOfficeClaim(officeId: string, userId: string, title?: string): void {
  run(
    `INSERT INTO office_staff (id, office_id, user_id, title, status, created_at)
     VALUES (?,?,?,?,'pending',?)
     ON CONFLICT (office_id, user_id) DO UPDATE SET title = excluded.title`,
    newId(),
    officeId,
    userId,
    title ?? null,
    nowIso(),
  );
  run("UPDATE offices SET claim_status = 'pending' WHERE id = ? AND claim_status = 'unclaimed'", officeId);
}

export function approveOfficeClaim(officeId: string, userId: string): void {
  transaction(() => {
    run(
      "UPDATE office_staff SET status = 'approved' WHERE office_id = ? AND user_id = ?",
      officeId,
      userId,
    );
    run(
      "UPDATE offices SET claim_status = 'claimed', claimed_at = ? WHERE id = ?",
      nowIso(),
      officeId,
    );
  });
}

export function isOfficeClaimed(bioguideId: string): boolean {
  return officeByBioguide(bioguideId)?.claim_status === 'claimed';
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

/**
 * Requests waiting on this office.
 *
 * Everything a scheduler needs to make a decision is in one row: who the school
 * is, whether they are genuinely in this district, how many people, which
 * dates, what accessibility needs exist, and how verified the school is. No
 * clicking through to find out whether a request is worth reading.
 */
export function queueForOffice(officeId: string, includeSettled = false): QueueItem[] {
  const statusFilter = includeSettled
    ? ''
    : "AND r.status NOT IN ('draft','confirmed','declined')";

  return all<QueueItem>(
    `SELECT
       r.id              AS requestId,
       r.trip_id         AS tripId,
       r.title           AS title,
       r.destination_type AS destinationType,
       r.status          AS status,
       r.requested_date  AS requestedDate,
       r.proposed_date   AS proposedDate,
       r.guests          AS guests,
       r.send_by         AS sendBy,
       r.sent_at         AS sentAt,
       r.created_at      AS createdAt,

       COALESCE(s.name, t.title)   AS schoolName,
       s.city                      AS schoolCity,
       s.state                     AS schoolState,
       t.district_state            AS schoolDistrictState,
       t.district_number           AS schoolDistrictNumber,

       u.name  AS teacherName,
       u.email AS teacherEmail,

       t.grade_band     AS gradeBand,
       t.accessibility  AS accessibility,
       t.students       AS students,
       t.teachers       AS teachers,
       t.chaperones     AS chaperones,
       t.cosign_status  AS cosignStatus,
       d.status         AS domainStatus

     FROM requests r
     JOIN trips t   ON t.id = r.trip_id
     JOIN users u   ON u.id = t.teacher_id
     LEFT JOIN schools s ON s.nces_id = t.school_nces_id
     LEFT JOIN school_domains d ON d.nces_id = s.nces_id
     WHERE r.office_id = ? ${statusFilter}
     ORDER BY
       CASE r.status WHEN 'sent' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
       r.requested_date`,
    officeId,
  );
}

/**
 * Whether a queue item represents a genuine constituent.
 *
 * This is the question a staffer asks first and the one they currently have to
 * work out by hand from a school address. We resolved the district from the
 * school's coordinates when the trip was created, so we can just answer it.
 */
export function districtMatch(item: QueueItem, office: Office): {
  matches: boolean;
  explanation: string;
} {
  if (office.chamber === 'senate') {
    const matches = item.schoolDistrictState === office.state;
    return {
      matches,
      explanation: matches
        ? `This school is in ${office.state}, so they are constituents of this Senate office.`
        : `This school is in ${item.schoolDistrictState ?? 'an unknown state'}, not ${office.state}.`,
    };
  }

  const matches =
    item.schoolDistrictState === office.state && item.schoolDistrictNumber === office.district;

  return {
    matches,
    explanation: matches
      ? `School address resolves to ${office.state}-${office.district} via the US Census Geocoder. They are constituents.`
      : `School address resolves to ${item.schoolDistrictState ?? '?'}-${item.schoolDistrictNumber ?? '?'}, not ${office.state}-${office.district}.`,
  };
}

// ---------------------------------------------------------------------------
// Weekly capacity
// ---------------------------------------------------------------------------

export interface WeekCapacity {
  isoWeek: string;
  weekStart: IsoDate;
  weekEnd: IsoDate;
  confirmed: number;
  pending: number;
  limit: number;
  atLimit: boolean;
  overLimit: boolean;
}

/**
 * How many school tours this office has on the books each week.
 *
 * Small feature, and the one that gets a nod from anyone who has worked in a
 * district office: the one-tour-per-week limit is real, invisible in every
 * existing tool, and the reason two schools in the same district quietly
 * collide.
 */
export function weeklyCapacity(
  officeId: string,
  fromDate: IsoDate,
  weeks = 8,
): WeekCapacity[] {
  const office = getOffice(officeId);
  const limit = office?.weekly_tour_limit ?? RULES.officeStaffLedToursPerWeek.value;

  const rows = all<{ requested_date: string; status: string }>(
    `SELECT requested_date, status FROM requests
     WHERE office_id = ?
       AND destination_type IN ('house_office_tour','senate_office_tour')
       AND requested_date IS NOT NULL
       AND status IN ('sent','acknowledged','confirmed','alternate_proposed')`,
    officeId,
  );

  const counts = new Map<string, { confirmed: number; pending: number }>();
  for (const row of rows) {
    const key = isoWeekKey(row.requested_date);
    const entry = counts.get(key) ?? { confirmed: 0, pending: 0 };
    if (row.status === 'confirmed') entry.confirmed += 1;
    else entry.pending += 1;
    counts.set(key, entry);
  }

  const out: WeekCapacity[] = [];
  let cursor = startOfIsoWeek(fromDate);

  for (let i = 0; i < weeks; i += 1) {
    const key = isoWeekKey(cursor);
    const entry = counts.get(key) ?? { confirmed: 0, pending: 0 };
    out.push({
      isoWeek: key,
      weekStart: cursor,
      weekEnd: addDays(cursor, 6),
      confirmed: entry.confirmed,
      pending: entry.pending,
      limit,
      atLimit: entry.confirmed >= limit,
      overLimit: entry.confirmed > limit,
    });
    cursor = addDays(cursor, 7);
  }

  return out;
}

/** Capacity for the specific week a request is asking for. */
export function capacityForRequestWeek(officeId: string, date: IsoDate): WeekCapacity {
  return weeklyCapacity(officeId, date, 1)[0];
}

/**
 * How many weeks of capacity to display, given what is actually in the queue.
 *
 * A fixed "next 8 weeks" window is worse than useless here. School trips are
 * requested two to three months out, so a scheduler looking at a fixed
 * near-term window sees a row of empty weeks and reads it as "nothing booked"
 * while a request for October sits below it. The window has to reach the work.
 *
 * So: span from this week to the furthest date anyone has asked for, with a
 * floor of 8 weeks so the strip never looks broken when the queue is empty,
 * and a ceiling of 26 so a single far-out request cannot squash the display
 * into unreadable slivers.
 */
export function capacityWindowWeeks(officeId: string, from: IsoDate): number {
  const MIN_WEEKS = 8;
  const MAX_WEEKS = 26;

  const furthest = get<{ latest: string | null }>(
    `SELECT MAX(requested_date) AS latest FROM requests
     WHERE office_id = ?
       AND destination_type IN ('house_office_tour','senate_office_tour')
       AND requested_date IS NOT NULL
       AND status IN ('sent','acknowledged','confirmed','alternate_proposed')`,
    officeId,
  )?.latest;

  if (!furthest) return MIN_WEEKS;

  // +1 so the furthest request's own week is included rather than sitting just
  // past the end of the strip.
  const weeksOut =
    Math.ceil(daysBetween(startOfIsoWeek(from), startOfIsoWeek(furthest)) / 7) + 1;

  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, weeksOut));
}
