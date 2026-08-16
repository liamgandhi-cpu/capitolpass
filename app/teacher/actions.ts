'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { getSchool, resolveSchoolDistrict } from '@/lib/schools';
import {
  createTrip,
  getTrip,
  recomputePlan,
  setCosignPending,
  setQuestionStatus,
  updateRequestStatus,
  type RequestStatus,
  type SendMode,
} from '@/lib/trips';
import { coSignMessage, sendMail } from '@/lib/mail';
import { createMagicLink } from '@/lib/auth';
import { isIsoDate } from '@/lib/dates';
import type { AccessibilityNeed, ArrivalMethod, GradeBand } from '@/lib/feasibility/types';

const GRADE_BANDS: GradeBand[] = ['elementary', 'middle', 'high', 'mixed'];
const ARRIVALS: ArrivalMethod[] = ['charter_bus', 'amtrak', 'flying', 'local'];
const NEEDS: AccessibilityNeed[] = [
  'wheelchair',
  'mobility_limited',
  'deaf_hoh',
  'blind_low_vision',
  'sensory_sensitive',
  'other',
];

function intField(form: FormData, name: string, fallback = 0): number {
  const raw = Number(form.get(name));
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}

/**
 * Create a trip.
 *
 * Validation is server-side and returns the teacher to the form with a reason
 * rather than throwing. The one thing we resolve here that the form cannot is
 * the congressional district, which comes from the school's coordinates.
 */
export async function createTripAction(formData: FormData) {
  const user = await requireUser('teacher');

  const title = String(formData.get('title') ?? '').trim();
  const preferredDate = String(formData.get('preferred_date') ?? '');
  const alternates = [
    String(formData.get('alternate_date_1') ?? ''),
    String(formData.get('alternate_date_2') ?? ''),
  ].filter((d) => d.length > 0);

  const errors: string[] = [];
  if (title.length < 3) errors.push('title');
  if (!isIsoDate(preferredDate)) errors.push('preferred_date');
  for (const alt of alternates) {
    if (!isIsoDate(alt)) errors.push('alternate_date');
  }

  const students = intField(formData, 'students');
  const teachers = intField(formData, 'teachers', 1);
  const chaperones = intField(formData, 'chaperones');
  if (students < 1) errors.push('students');
  if (teachers < 1) errors.push('teachers');

  const gradeBand = String(formData.get('grade_band') ?? '') as GradeBand;
  if (!GRADE_BANDS.includes(gradeBand)) errors.push('grade_band');

  const arrivalMethod = String(formData.get('arrival_method') ?? '') as ArrivalMethod;
  if (!ARRIVALS.includes(arrivalMethod)) errors.push('arrival_method');

  const wantsTour = formData.get('wants_tour') === 'on';
  const wantsMeeting = formData.get('wants_meeting') === 'on';
  if (!wantsTour && !wantsMeeting) errors.push('wants_nothing');

  if (errors.length > 0) {
    redirect(`/teacher/trips/new?error=${encodeURIComponent(errors.join(','))}`);
  }

  const accessibilityNeeds = formData
    .getAll('accessibility')
    .map(String)
    .filter((n): n is AccessibilityNeed => NEEDS.includes(n as AccessibilityNeed));

  // Resolve the district from the school's coordinates. This is the step that
  // makes the app know who the teacher's Representative is without asking.
  let districtState: string | null = null;
  let districtNumber: number | null = null;

  if (user.school_nces_id) {
    const school = getSchool(user.school_nces_id);
    if (school) {
      const resolved = await resolveSchoolDistrict(school);
      if (resolved) {
        districtState = resolved.state;
        districtNumber = resolved.district;
      }
    }
  }

  const trip = createTrip({
    teacherId: user.id,
    schoolNcesId: user.school_nces_id,
    title,
    preferredDate,
    alternateDates: alternates,
    students,
    teachers,
    chaperones,
    gradeBand,
    arrivalMethod,
    accessibilityNeeds,
    wantsTour,
    wantsMeeting,
    districtState,
    districtNumber,
  });

  redirect(`/teacher/trips/${trip.id}`);
}

export async function recomputePlanAction(formData: FormData) {
  await requireUser('teacher');
  const tripId = String(formData.get('trip_id') ?? '');
  recomputePlan(tripId);
  revalidatePath(`/teacher/trips/${tripId}`);
}

/**
 * Mark a request as sent.
 *
 * Only the teacher can do this for the prefill and email modes, because only
 * they know whether they actually pressed submit on the office's form. Guessing
 * on their behalf would make the status meaningless.
 */
export async function markRequestSentAction(formData: FormData) {
  const user = await requireUser('teacher');
  const requestId = String(formData.get('request_id') ?? '');
  const tripId = String(formData.get('trip_id') ?? '');
  const sendMode = String(formData.get('send_mode') ?? 'prefill') as SendMode;

  updateRequestStatus({
    requestId,
    to: 'sent',
    actorType: 'teacher',
    actorName: user.name,
    sendMode,
    note:
      sendMode === 'prefill'
        ? 'Submitted through the office’s own web form.'
        : sendMode === 'email'
          ? 'Sent by the teacher from their own mailbox.'
          : 'Delivered to the office’s CapitolPass queue.',
  });

  revalidatePath(`/teacher/trips/${tripId}`);
  redirect(`/teacher/trips/${tripId}?sent=1`);
}

/** Record a reply the teacher received outside the app. */
export async function recordResponseAction(formData: FormData) {
  const user = await requireUser('teacher');
  const requestId = String(formData.get('request_id') ?? '');
  const tripId = String(formData.get('trip_id') ?? '');
  const to = String(formData.get('to') ?? '') as RequestStatus;
  const note = String(formData.get('note') ?? '').trim() || null;
  const proposedDate = String(formData.get('proposed_date') ?? '').trim() || null;

  updateRequestStatus({
    requestId,
    to,
    actorType: 'teacher',
    actorName: user.name,
    note,
    proposedDate: proposedDate && isIsoDate(proposedDate) ? proposedDate : null,
  });

  revalidatePath(`/teacher/trips/${tripId}`);
  redirect(`/teacher/trips/${tripId}`);
}

/**
 * Ask an administrator to co-sign.
 *
 * The administrator's address must be on the same domain as the teacher's.
 * A co-sign from an arbitrary address would prove nothing — the point is that
 * someone else at the same institution vouched for this trip.
 */
export async function requestCosignAction(formData: FormData) {
  const user = await requireUser('teacher');
  const tripId = String(formData.get('trip_id') ?? '');
  const adminEmail = String(formData.get('admin_email') ?? '').trim().toLowerCase();

  const trip = getTrip(tripId);
  if (!trip || trip.teacher_id !== user.id) redirect('/teacher');

  const teacherDomain = user.email.split('@')[1];
  const adminDomain = adminEmail.split('@')[1];

  if (!adminDomain || adminDomain !== teacherDomain) {
    redirect(`/teacher/trips/${tripId}?cosign_error=domain`);
  }

  const token = createMagicLink({
    email: adminEmail,
    purpose: 'admin_cosign',
    payload: { tripId },
  });

  setCosignPending(tripId, adminEmail);

  const school = trip.school_nces_id ? getSchool(trip.school_nces_id) : null;
  await sendMail(
    coSignMessage({
      to: adminEmail,
      teacherName: user.name ?? user.email,
      schoolName: school?.name ?? user.school_freeform ?? 'your school',
      tripTitle: trip.title,
      token,
    }),
  );

  const devToken = process.env.NODE_ENV === 'production' ? '' : `&cosign_token=${token}`;
  redirect(`/teacher/trips/${tripId}?cosign=sent${devToken}`);
}

export async function moderateQuestionAction(formData: FormData) {
  await requireUser('teacher');
  const id = String(formData.get('question_id') ?? '');
  const tripId = String(formData.get('trip_id') ?? '');
  const status = String(formData.get('status') ?? 'submitted') as 'submitted' | 'selected' | 'hidden';

  setQuestionStatus(id, status);
  revalidatePath(`/teacher/trips/${tripId}/questions`);
}
