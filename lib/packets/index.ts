/**
 * Request packets.
 *
 * A packet is everything one destination needs, written out once, in the order
 * that destination asks for it. The teacher answered these questions when they
 * built the trip; they should never answer them again.
 *
 * The three send modes exist because the three destinations behave differently,
 * and pretending otherwise is how requests get lost:
 *
 *   prefill — the office's own web form is the channel they actually monitor,
 *             so we take the teacher there with everything ready to paste and a
 *             checklist mirroring the fields. Highest success rate. Requires a
 *             human to press submit, which is correct.
 *   email   — a complete draft, opened in the teacher's own mail client, sent
 *             as themselves. We never send on anyone's behalf.
 *   in_app  — straight into a claimed office's queue. No email involved at all.
 *
 * There is no fourth mode where we mail 535 offices automatically, and there
 * should not be. See lib/mail.ts for why.
 */

import { formatLong, type IsoDate } from '../dates';
import type { Member } from '../congress/legislators';
import type { DestinationType } from '../feasibility/types';
import type { School } from '../schools';
import type { TripRow } from '../trips';
import { accessibilityNeeds } from '../trips';

export interface PacketField {
  label: string;
  value: string;
  /** Fields a target form almost always asks for, flagged for the checklist. */
  essential?: boolean;
}

export interface Packet {
  destination: DestinationType;
  title: string;
  /** One-line description of who this is going to. */
  addressedTo: string;
  fields: PacketField[];
  /** Ready to paste into a form, in field order. */
  plainText: string;
  emailSubject: string;
  emailBody: string;
  /** Steps mirroring the target form, so nothing is missed mid-paste. */
  checklist: string[];
  /** What this request is for, in the teacher's words, for the office to read. */
  narrative: string;
}

const ACCESSIBILITY_LABELS: Record<string, string> = {
  wheelchair: 'Wheelchair users in the group',
  mobility_limited: 'Group members with limited mobility',
  deaf_hoh: 'Deaf or hard-of-hearing group members',
  blind_low_vision: 'Blind or low-vision group members',
  sensory_sensitive: 'Group members with sensory sensitivities',
  other: 'Other accessibility needs (details provided separately)',
};

const ARRIVAL_LABELS: Record<string, string> = {
  charter_bus: 'Charter bus',
  amtrak: 'Train (Amtrak, arriving Union Station)',
  flying: 'Flying into the DC area',
  local: 'Local — already in the DC area',
};

const GRADE_LABELS: Record<string, string> = {
  elementary: 'Elementary',
  middle: 'Middle school',
  high: 'High school',
  mixed: 'Mixed grades',
};

export interface PacketContext {
  trip: TripRow;
  school: School | null;
  schoolNameFallback: string;
  teacherName: string;
  teacherEmail: string;
  member: Member | null;
  requestedDate: IsoDate;
  guests: number;
  verified: boolean;
}

function groupBreakdown(trip: TripRow): string {
  return `${trip.students} students, ${trip.teachers} teacher${trip.teachers === 1 ? '' : 's'}, ${trip.chaperones} chaperone${trip.chaperones === 1 ? '' : 's'}`;
}

function datesLine(trip: TripRow, requested: IsoDate): string {
  const alternates = [trip.alternate_date_1, trip.alternate_date_2].filter(Boolean) as string[];
  const others = alternates.filter((d) => d !== requested);
  if (others.length === 0) return formatLong(requested);
  // Wrapped rather than passed by reference: formatLong takes an optional
  // locale as its second argument, and `.map(formatLong)` would hand it the
  // array index.
  return `${formatLong(requested)} (alternates: ${others.map((d) => formatLong(d)).join('; ')})`;
}

function accessibilityLine(trip: TripRow): string {
  const needs = accessibilityNeeds(trip);
  if (needs.length === 0) return 'None reported';
  return needs.map((n) => ACCESSIBILITY_LABELS[n] ?? n).join('; ');
}

function schoolAddress(school: School | null): string {
  if (!school) return 'Address provided on request';
  return [school.street, school.city, school.state, school.zip].filter(Boolean).join(', ');
}

function commonFields(ctx: PacketContext): PacketField[] {
  const { trip, school } = ctx;
  return [
    { label: 'School', value: school?.name ?? ctx.schoolNameFallback, essential: true },
    ...(school?.lea_name ? [{ label: 'District', value: school.lea_name }] : []),
    { label: 'School address', value: schoolAddress(school), essential: true },
    { label: 'Trip lead', value: ctx.teacherName, essential: true },
    { label: 'Email', value: ctx.teacherEmail, essential: true },
    { label: 'Requested date', value: formatLong(ctx.requestedDate), essential: true },
    { label: 'Alternate dates', value: datesLine(trip, ctx.requestedDate) },
    { label: 'Total in group', value: String(ctx.guests), essential: true },
    { label: 'Group breakdown', value: groupBreakdown(trip), essential: true },
    { label: 'Grade level', value: GRADE_LABELS[trip.grade_band] ?? trip.grade_band },
    { label: 'Arriving by', value: ARRIVAL_LABELS[trip.arrival_method] ?? trip.arrival_method },
    { label: 'Accessibility needs', value: accessibilityLine(trip), essential: true },
  ];
}

function toPlainText(fields: PacketField[]): string {
  const width = Math.max(...fields.map((f) => f.label.length));
  return fields.map((f) => `${f.label.padEnd(width)} : ${f.value}`).join('\n');
}

// ---------------------------------------------------------------------------
// Packet builders, one per destination
// ---------------------------------------------------------------------------

function officeTourPacket(ctx: PacketContext): Packet {
  const { trip, member } = ctx;
  const memberName = member ? `${member.chamber === 'senate' ? 'Senator' : 'Representative'} ${member.name}` : 'our Member of Congress';
  const schoolName = ctx.school?.name ?? ctx.schoolNameFallback;

  const narrative = [
    `${schoolName} is bringing a ${GRADE_LABELS[trip.grade_band]?.toLowerCase() ?? ''} group of ${ctx.guests} to Washington and would like to request a staff-led tour of the Capitol.`,
    ctx.verified
      ? 'This request was submitted through CapitolPass and has been confirmed by a school administrator.'
      : 'This request was submitted through CapitolPass.',
    `We understand staff-led tours are limited to 15 guests and that your office can host one school tour per week, so we have kept our group within that limit and offered alternate dates.`,
  ].join(' ');

  const fields = commonFields(ctx);

  return {
    destination: 'house_office_tour',
    title: 'Staff-led Capitol tour request',
    addressedTo: member ? `Office of ${memberName}` : 'Your congressional office',
    fields,
    plainText: toPlainText(fields),
    emailSubject: `Capitol tour request — ${schoolName}, ${formatLong(ctx.requestedDate)}`,
    emailBody: [
      `Dear Office of ${memberName},`,
      '',
      narrative,
      '',
      toPlainText(fields),
      '',
      'We are happy to take an alternate date or time if the requested one is unavailable.',
      '',
      'Thank you,',
      ctx.teacherName,
      schoolName,
      ctx.teacherEmail,
    ].join('\n'),
    checklist: [
      'Choose the tour request or "Visiting Washington DC" option, not general contact',
      'Enter the school name and full address exactly as shown',
      'Enter the total group size, including teachers and chaperones',
      'Enter your requested date and add the alternates in the notes field',
      'Include accessibility needs — offices can arrange accommodation in advance',
      'Give a phone number you will actually answer on the day of the trip',
      'Submit, then come back and mark this request as sent',
    ],
    narrative,
  };
}

function cvcPacket(ctx: PacketContext): Packet {
  const schoolName = ctx.school?.name ?? ctx.schoolNameFallback;
  const fields = commonFields(ctx);

  const narrative = [
    `${schoolName} would like to reserve a group tour of the Capitol for ${ctx.guests} visitors.`,
    'This is a school group; we have a lead teacher and chaperones travelling with the students.',
  ].join(' ');

  return {
    destination: 'cvc_group_reservation',
    title: 'Capitol Visitor Center group reservation',
    addressedTo: 'Capitol Visitor Center — Advance Reservation System',
    fields,
    plainText: toPlainText(fields),
    emailSubject: `Group tour reservation — ${schoolName}, ${formatLong(ctx.requestedDate)}`,
    emailBody: [
      'Capitol Visitor Center group reservations,',
      '',
      narrative,
      '',
      toPlainText(fields),
      '',
      'Thank you,',
      ctx.teacherName,
      schoolName,
      ctx.teacherEmail,
    ].join('\n'),
    checklist: [
      'Open the Advance Reservation System and choose a group reservation',
      `Enter ${ctx.guests} as the group size — this includes every adult`,
      'Pick your requested date, and note the entry time offered',
      'Large groups may be split across staggered entry times; accept them if offered',
      'Enter the lead teacher as the group contact',
      'Note accessibility needs so screening can be arranged',
      'Save your confirmation number, then mark this request as sent',
    ],
    narrative,
  };
}

function meetingPacket(ctx: PacketContext): Packet {
  const { member } = ctx;
  const memberName = member ? `${member.chamber === 'senate' ? 'Senator' : 'Representative'} ${member.name}` : 'our Member of Congress';
  const schoolName = ctx.school?.name ?? ctx.schoolNameFallback;

  const narrative = [
    `${schoolName} will be at the Capitol on ${formatLong(ctx.requestedDate)} with ${ctx.guests} students and adults,`,
    `and we would like to request a short meeting or greeting with ${memberName}.`,
    'We understand this is scheduled separately from any tour and depends on the floor schedule.',
    'Even ten minutes, or time with a staff member if the Member is unavailable, would be valuable for the students.',
  ].join(' ');

  const fields: PacketField[] = [
    ...commonFields(ctx),
    { label: 'Request type', value: 'Meeting or greeting with the Member', essential: true },
    { label: 'Flexible on time', value: 'Yes — any time on the trip date' },
    { label: 'Acceptable alternative', value: 'A meeting with staff if the Member is unavailable' },
  ];

  return {
    destination: 'rep_meeting',
    title: 'Meeting request to the scheduler',
    addressedTo: member ? `Scheduler, Office of ${memberName}` : 'Your congressional office scheduler',
    fields,
    plainText: toPlainText(fields),
    emailSubject: `Meeting request — ${schoolName} student group, ${formatLong(ctx.requestedDate)}`,
    emailBody: [
      `Dear Scheduler,`,
      '',
      narrative,
      '',
      toPlainText(fields),
      '',
      'We know the floor schedule is not set far ahead and are glad to stay flexible.',
      '',
      'Thank you,',
      ctx.teacherName,
      schoolName,
      ctx.teacherEmail,
    ].join('\n'),
    checklist: [
      'Address this to the scheduler, not the tour coordinator — they are different people',
      'Say clearly that this is a meeting request, separate from your tour request',
      'Offer flexibility on time; the floor schedule drives everything',
      'Say that staff time is an acceptable alternative — it usually is what happens',
      'If a contact form has no scheduling option, call the DC office instead',
      'Mark this request as sent once it is in',
    ],
    narrative,
  };
}

export function buildPacket(destination: DestinationType, ctx: PacketContext): Packet {
  switch (destination) {
    case 'cvc_group_reservation':
      return cvcPacket(ctx);
    case 'rep_meeting':
      return meetingPacket(ctx);
    case 'house_office_tour':
    case 'senate_office_tour':
      return { ...officeTourPacket(ctx), destination };
  }
}

/** A mailto: URL for the "draft in your own mailbox" send mode. */
export function mailtoUrl(packet: Packet, to?: string | null): string {
  const params = new URLSearchParams({
    subject: packet.emailSubject,
    body: packet.emailBody,
  });
  return `mailto:${to ?? ''}?${params.toString()}`;
}
