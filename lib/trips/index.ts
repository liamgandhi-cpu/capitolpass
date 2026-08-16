/**
 * Trips and the requests hanging off them.
 *
 * Creating a trip does three things in one transaction: stores what the teacher
 * told us, runs the feasibility engine over it, and materialises one request
 * row per destination the plan says is needed. That last step is the point of
 * the product — the teacher describes a trip once, and gets back a set of
 * correctly-addressed, separately-tracked requests instead of a form.
 */

import { all, fromJson, get, newId, newJoinCode, nowIso, run, toJson, transaction } from '../db';
import { buildPlan } from '../feasibility';
import type {
  AccessibilityNeed,
  ArrivalMethod,
  DestinationType,
  FeasibilityPlan,
  GradeBand,
  TripInput,
} from '../feasibility/types';
import { toIsoDate } from '../dates';
import { delegationFor } from '../congress/legislators';

export type TripStatus = 'planning' | 'requesting' | 'confirmed' | 'completed' | 'cancelled';
export type RequestStatus =
  | 'draft'
  | 'sent'
  | 'acknowledged'
  | 'confirmed'
  | 'declined'
  | 'alternate_proposed';
export type SendMode = 'prefill' | 'email' | 'in_app';

export interface TripRow {
  id: string;
  teacher_id: string;
  school_nces_id: string | null;
  title: string;
  join_code: string;
  preferred_date: string;
  alternate_date_1: string | null;
  alternate_date_2: string | null;
  students: number;
  teachers: number;
  chaperones: number;
  grade_band: GradeBand;
  arrival_method: ArrivalMethod;
  accessibility: string;
  wants_tour: number;
  wants_meeting: number;
  district_state: string | null;
  district_number: number | null;
  plan_json: string | null;
  plan_computed_at: string | null;
  cosign_email: string | null;
  cosign_status: 'none' | 'pending' | 'confirmed' | 'declined';
  cosign_at: string | null;
  status: TripStatus;
  created_at: string;
  updated_at: string;
}

export interface RequestRow {
  id: string;
  trip_id: string;
  destination_type: DestinationType;
  office_id: string | null;
  title: string;
  guests: number;
  send_by: string | null;
  send_mode: SendMode | null;
  status: RequestStatus;
  requested_date: string | null;
  proposed_date: string | null;
  response_note: string | null;
  packet_json: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestEvent {
  id: string;
  request_id: string;
  actor_type: 'teacher' | 'office' | 'system';
  actor_name: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function getTrip(id: string): TripRow | null {
  return get<TripRow>('SELECT * FROM trips WHERE id = ?', id);
}

export function getTripByJoinCode(code: string): TripRow | null {
  return get<TripRow>('SELECT * FROM trips WHERE join_code = ?', code.trim().toUpperCase());
}

export function tripsForTeacher(teacherId: string): TripRow[] {
  return all<TripRow>(
    'SELECT * FROM trips WHERE teacher_id = ? ORDER BY preferred_date',
    teacherId,
  );
}

export function requestsForTrip(tripId: string): RequestRow[] {
  return all<RequestRow>(
    'SELECT * FROM requests WHERE trip_id = ? ORDER BY send_by, created_at',
    tripId,
  );
}

export function getRequest(id: string): RequestRow | null {
  return get<RequestRow>('SELECT * FROM requests WHERE id = ?', id);
}

export function eventsForRequest(requestId: string): RequestEvent[] {
  return all<RequestEvent>(
    'SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at DESC',
    requestId,
  );
}

/** The stored plan, or null if it has not been computed. */
export function storedPlan(trip: TripRow): FeasibilityPlan | null {
  return fromJson<FeasibilityPlan | null>(trip.plan_json, null);
}

export function accessibilityNeeds(trip: TripRow): AccessibilityNeed[] {
  return fromJson<AccessibilityNeed[]>(trip.accessibility, []);
}

/** Turn a stored trip back into engine input, as of a given day. */
export function toTripInput(trip: TripRow, asOf = toIsoDate(new Date())): TripInput {
  return {
    preferredDate: trip.preferred_date,
    alternateDates: [trip.alternate_date_1, trip.alternate_date_2].filter(
      (d): d is string => typeof d === 'string' && d.length > 0,
    ),
    requestedOn: asOf,
    groupSize: {
      students: trip.students,
      teachers: trip.teachers,
      chaperones: trip.chaperones,
    },
    gradeBand: trip.grade_band,
    arrivalMethod: trip.arrival_method,
    accessibilityNeeds: accessibilityNeeds(trip),
    wants: { tour: trip.wants_tour === 1, repMeeting: trip.wants_meeting === 1 },
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface CreateTripInput {
  teacherId: string;
  schoolNcesId: string | null;
  title: string;
  preferredDate: string;
  alternateDates: string[];
  students: number;
  teachers: number;
  chaperones: number;
  gradeBand: GradeBand;
  arrivalMethod: ArrivalMethod;
  accessibilityNeeds: AccessibilityNeed[];
  wantsTour: boolean;
  wantsMeeting: boolean;
  districtState: string | null;
  districtNumber: number | null;
}

/**
 * A join code has to be unique, and the alphabet is deliberately small to keep
 * codes readable off a whiteboard. Retry a few times rather than widening the
 * alphabet — at this scale collisions are vanishingly rare, and readability
 * matters more than entropy.
 */
function uniqueJoinCode(): string {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = newJoinCode();
    if (!get('SELECT 1 FROM trips WHERE join_code = ?', code)) return code;
  }
  throw new Error('Could not generate a unique join code. Try again.');
}

export function createTrip(input: CreateTripInput): TripRow {
  return transaction(() => {
    const id = newId();
    const now = nowIso();
    const today = toIsoDate(new Date());

    run(
      `INSERT INTO trips (
         id, teacher_id, school_nces_id, title, join_code,
         preferred_date, alternate_date_1, alternate_date_2,
         students, teachers, chaperones, grade_band, arrival_method, accessibility,
         wants_tour, wants_meeting, district_state, district_number,
         status, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      input.teacherId,
      input.schoolNcesId,
      input.title,
      uniqueJoinCode(),
      input.preferredDate,
      input.alternateDates[0] ?? null,
      input.alternateDates[1] ?? null,
      input.students,
      input.teachers,
      input.chaperones,
      input.gradeBand,
      input.arrivalMethod,
      toJson(input.accessibilityNeeds),
      input.wantsTour,
      input.wantsMeeting,
      input.districtState,
      input.districtNumber,
      'planning',
      now,
      now,
    );

    const trip = getTrip(id)!;
    const plan = buildPlan(toTripInput(trip, today));
    persistPlan(trip.id, plan);
    materialiseRequests(trip, plan);

    return getTrip(id)!;
  });
}

function persistPlan(tripId: string, plan: FeasibilityPlan): void {
  run(
    'UPDATE trips SET plan_json = ?, plan_computed_at = ?, updated_at = ? WHERE id = ?',
    toJson(plan),
    nowIso(),
    nowIso(),
    tripId,
  );
}

/**
 * Recompute the plan against today's date.
 *
 * Deliberately explicit rather than automatic: the plan a teacher is looking at
 * should not silently rearrange itself while they read it. Deadlines do move as
 * time passes, so the UI offers a refresh and says when it was last computed.
 */
export function recomputePlan(tripId: string): FeasibilityPlan {
  const trip = getTrip(tripId);
  if (!trip) throw new Error('Trip not found.');

  const plan = buildPlan(toTripInput(trip));
  transaction(() => {
    persistPlan(tripId, plan);
    syncRequests(trip, plan);
  });
  return plan;
}

/**
 * Which office a request should be addressed to.
 *
 * Only House and Senate destinations get an office; the CVC is not an office in
 * this sense. Returns null when we cannot identify one, which is fine — the
 * request still exists and still routes through the office's public form.
 */
function officeIdFor(trip: TripRow, destination: DestinationType): string | null {
  if (destination === 'cvc_group_reservation') return null;
  if (!trip.district_state || trip.district_number === null) return null;

  const delegation = delegationFor(trip.district_state, trip.district_number);
  const member =
    destination === 'senate_office_tour' ? delegation.senators[0] : delegation.representative;
  if (!member) return null;

  const office = get<{ id: string }>('SELECT id FROM offices WHERE bioguide_id = ?', member.bioguideId);
  return office?.id ?? null;
}

/** Create one request row per planned request. Used at trip creation. */
function materialiseRequests(trip: TripRow, plan: FeasibilityPlan): void {
  for (const planned of plan.requests) {
    run(
      `INSERT INTO requests (
         id, trip_id, destination_type, office_id, title, guests, send_by,
         status, requested_date, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      newId(),
      trip.id,
      planned.destination,
      officeIdFor(trip, planned.destination),
      planned.title,
      planned.guests,
      planned.sendBy,
      'draft',
      plan.recommendedDate ?? trip.preferred_date,
      nowIso(),
      nowIso(),
    );
  }
}

/**
 * Reconcile requests with a freshly computed plan.
 *
 * Requests that have already gone out are never touched: if a teacher has sent
 * a packet to an office, deleting or rewriting that row would lose the only
 * record of what was actually sent. We only add what is newly needed and update
 * deadlines on drafts.
 */
function syncRequests(trip: TripRow, plan: FeasibilityPlan): void {
  const existing = requestsForTrip(trip.id);

  for (const planned of plan.requests) {
    const match = existing.find((r) => r.destination_type === planned.destination);

    if (!match) {
      run(
        `INSERT INTO requests (
           id, trip_id, destination_type, office_id, title, guests, send_by,
           status, requested_date, created_at, updated_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        newId(),
        trip.id,
        planned.destination,
        officeIdFor(trip, planned.destination),
        planned.title,
        planned.guests,
        planned.sendBy,
        'draft',
        plan.recommendedDate ?? trip.preferred_date,
        nowIso(),
        nowIso(),
      );
      continue;
    }

    if (match.status === 'draft') {
      run(
        'UPDATE requests SET send_by = ?, guests = ?, requested_date = ?, updated_at = ? WHERE id = ?',
        planned.sendBy,
        planned.guests,
        plan.recommendedDate ?? trip.preferred_date,
        nowIso(),
        match.id,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Request status
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  draft: ['sent'],
  sent: ['acknowledged', 'confirmed', 'declined', 'alternate_proposed'],
  acknowledged: ['confirmed', 'declined', 'alternate_proposed'],
  alternate_proposed: ['confirmed', 'declined', 'sent'],
  confirmed: ['declined', 'alternate_proposed'],
  declined: ['sent'],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function updateRequestStatus(input: {
  requestId: string;
  to: RequestStatus;
  actorType: 'teacher' | 'office' | 'system';
  actorName?: string | null;
  note?: string | null;
  proposedDate?: string | null;
  sendMode?: SendMode | null;
}): RequestRow {
  return transaction(() => {
    const request = getRequest(input.requestId);
    if (!request) throw new Error('Request not found.');

    if (request.status !== input.to && !canTransition(request.status, input.to)) {
      throw new Error(
        `A request that is "${request.status}" cannot become "${input.to}".`,
      );
    }

    const now = nowIso();
    run(
      `UPDATE requests SET
         status = ?,
         send_mode = COALESCE(?, send_mode),
         proposed_date = COALESCE(?, proposed_date),
         response_note = COALESCE(?, response_note),
         sent_at = CASE WHEN ? = 'sent' AND sent_at IS NULL THEN ? ELSE sent_at END,
         responded_at = CASE WHEN ? IN ('confirmed','declined','alternate_proposed') THEN ? ELSE responded_at END,
         updated_at = ?
       WHERE id = ?`,
      input.to,
      input.sendMode ?? null,
      input.proposedDate ?? null,
      input.note ?? null,
      input.to,
      now,
      input.to,
      now,
      now,
      input.requestId,
    );

    run(
      `INSERT INTO request_events (id, request_id, actor_type, actor_name, from_status, to_status, note, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      newId(),
      input.requestId,
      input.actorType,
      input.actorName ?? null,
      request.status,
      input.to,
      input.note ?? null,
      now,
    );

    // Keep the trip's own status roughly in step, so a dashboard can be honest
    // without recomputing everything.
    const siblings = requestsForTrip(request.trip_id);
    const anySent = siblings.some((r) => r.status !== 'draft');
    const allSettled =
      siblings.length > 0 && siblings.every((r) => r.status === 'confirmed' || r.status === 'declined');
    const anyConfirmed = siblings.some((r) => r.status === 'confirmed');

    const tripStatus: TripStatus = allSettled && anyConfirmed ? 'confirmed' : anySent ? 'requesting' : 'planning';
    run('UPDATE trips SET status = ?, updated_at = ? WHERE id = ?', tripStatus, now, request.trip_id);

    return getRequest(input.requestId)!;
  });
}

export function savePacketSnapshot(requestId: string, packet: unknown): void {
  run(
    'UPDATE requests SET packet_json = ?, updated_at = ? WHERE id = ?',
    toJson(packet),
    nowIso(),
    requestId,
  );
}

// ---------------------------------------------------------------------------
// Co-sign
// ---------------------------------------------------------------------------

export function setCosignPending(tripId: string, adminEmail: string): void {
  run(
    "UPDATE trips SET cosign_email = ?, cosign_status = 'pending', updated_at = ? WHERE id = ?",
    adminEmail.toLowerCase(),
    nowIso(),
    tripId,
  );
}

export function confirmCosign(tripId: string): void {
  run(
    "UPDATE trips SET cosign_status = 'confirmed', cosign_at = ?, updated_at = ? WHERE id = ?",
    nowIso(),
    nowIso(),
    tripId,
  );
}

/**
 * Whether a congressional office should see a Verified Trip badge.
 *
 * Both conditions have to hold: the school's domain is confirmed by someone
 * other than the teacher who claimed it, and an administrator has co-signed
 * this specific trip. A badge that a single person can issue to themselves
 * tells a staffer nothing.
 */
export function isVerifiedTrip(trip: TripRow, domainConfirmed: boolean): boolean {
  return domainConfirmed && trip.cosign_status === 'confirmed';
}

// ---------------------------------------------------------------------------
// Student questions
// ---------------------------------------------------------------------------

export interface StudentQuestion {
  id: string;
  trip_id: string;
  author_name: string;
  body: string;
  status: 'submitted' | 'selected' | 'hidden';
  created_at: string;
}

export function questionsForTrip(tripId: string, status?: StudentQuestion['status']): StudentQuestion[] {
  if (status) {
    return all<StudentQuestion>(
      'SELECT * FROM student_questions WHERE trip_id = ? AND status = ? ORDER BY created_at DESC',
      tripId,
      status,
    );
  }
  return all<StudentQuestion>(
    'SELECT * FROM student_questions WHERE trip_id = ? ORDER BY created_at DESC',
    tripId,
  );
}

export function addQuestion(tripId: string, authorName: string, body: string): void {
  run(
    'INSERT INTO student_questions (id, trip_id, author_name, body, status, created_at) VALUES (?,?,?,?,?,?)',
    newId(),
    tripId,
    authorName,
    body,
    'submitted',
    nowIso(),
  );
}

export function setQuestionStatus(id: string, status: StudentQuestion['status']): void {
  run('UPDATE student_questions SET status = ? WHERE id = ?', status, id);
}

export function addTripMember(tripId: string, displayName: string, role: 'student' | 'chaperone' | 'teacher'): void {
  run(
    'INSERT INTO trip_members (id, trip_id, display_name, role, created_at) VALUES (?,?,?,?,?)',
    newId(),
    tripId,
    displayName,
    role,
    nowIso(),
  );
}
