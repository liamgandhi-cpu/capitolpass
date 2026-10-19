/**
 * The feasibility engine.
 *
 * Input: what the teacher told us in one form.
 * Output: a plan — which paths are actually open to this group, which dates
 * survive contact with the rules, what has to be requested separately, and a
 * dated critical path.
 *
 * Two design commitments worth stating up front:
 *
 *   1. **Pure.** No database, no network, no clock. `requestedOn` is an input.
 *      Given the same input this function returns the same plan forever, which
 *      is what makes the test suite meaningful.
 *
 *   2. **Traceable.** Every finding and every strategy carries the `ruleId` it
 *      came from. The UI can always answer "why are you telling me this?" by
 *      pointing at a numbered rule in rules.config.ts.
 */

import {
  addDays,
  daysBetween,
  dayOfWeek,
  isoWeekKey,
  previousWeekday,
  type IsoDate,
} from '../dates';
import { holidayOn } from './holidays';
import { RULES, RULESET_VERSION } from './rules.config';
import type {
  ChaperoneAssessment,
  DateAssessment,
  FeasibilityPlan,
  Finding,
  LeadTimeBand,
  Milestone,
  PlannedRequest,
  TourStrategy,
  TripInput,
} from './types';

export function totalGuests(input: TripInput): number {
  const { students, teachers, chaperones } = input.groupSize;
  return students + teachers + chaperones;
}

function adultsPresent(input: TripInput): number {
  return input.groupSize.teachers + input.groupSize.chaperones;
}

/**
 * Classify how much runway a request has.
 *
 * Note `adequate` and `tight` both sit above the minimum — the difference is
 * whether we merely note it or actively push the teacher toward alternates.
 */
export function classifyLeadTime(
  daysOut: number,
  thresholds: { comfortable: number; adequate: number; minimum: number },
): LeadTimeBand {
  if (daysOut < 0) return 'past';
  if (daysOut >= thresholds.comfortable) return 'comfortable';
  if (daysOut >= thresholds.adequate) return 'adequate';
  if (daysOut >= thresholds.minimum) return 'tight';
  return 'unlikely';
}

const BAND_RANK: Record<LeadTimeBand, number> = {
  comfortable: 0,
  adequate: 1,
  tight: 2,
  unlikely: 3,
  past: 4,
};

function worstBand(bands: LeadTimeBand[]): LeadTimeBand {
  if (bands.length === 0) return 'comfortable';
  return bands.reduce((worst, b) => (BAND_RANK[b] > BAND_RANK[worst] ? b : worst));
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Which lead-time thresholds apply, given what this trip is asking for. */
function relevantThresholds(input: TripInput) {
  const sets: Array<{ comfortable: number; adequate: number; minimum: number }> = [];
  if (input.wants.tour) {
    sets.push(RULES.cvcLeadTimeDays.value);
    sets.push(RULES.officeTourLeadTimeDays.value);
  }
  if (input.wants.repMeeting) sets.push(RULES.repMeetingLeadTimeDays.value);
  // If they asked for nothing, fall back to the tour thresholds so the date
  // assessment still says something useful.
  return sets.length > 0 ? sets : [RULES.cvcLeadTimeDays.value];
}

function assessDate(
  date: IsoDate,
  label: 'preferred' | 'alternate',
  input: TripInput,
): DateAssessment {
  const notes: string[] = [];
  const daysOut = daysBetween(input.requestedOn, date);

  // Is the building even open?
  let open = true;
  let closedReason: string | undefined;

  const closedWeekdays = RULES.tourDays.value.closedWeekdays as readonly number[];
  if (closedWeekdays.includes(dayOfWeek(date))) {
    open = false;
    closedReason = 'The Capitol is closed to tours on Sundays.';
  }

  const holiday = RULES.tourDays.value.closedOnFederalHolidays ? holidayOn(date) : null;
  if (holiday) {
    open = false;
    closedReason = `${holiday.name} is a federal holiday — the Capitol is closed to tours.`;
  }

  if (dayOfWeek(date) === 6) {
    notes.push(
      'Saturday tours run, but congressional offices are generally not staffed, so a staff-led tour or a Member meeting is unlikely.',
    );
  }

  const leadTime = worstBand(
    relevantThresholds(input).map((t) => classifyLeadTime(daysOut, t)),
  );

  if (leadTime === 'past') notes.push('This date has already passed.');
  if (leadTime === 'unlikely') {
    notes.push('This is inside the window where requests are usually too late to place.');
  }
  if (leadTime === 'tight') {
    notes.push('Possible, but you would be requesting late. Have your alternates ready.');
  }

  return {
    date,
    label,
    open,
    closedReason,
    daysOut,
    leadTime,
    isoWeek: isoWeekKey(date),
    viable: open && leadTime !== 'past' && leadTime !== 'unlikely',
    notes,
  };
}

// ---------------------------------------------------------------------------
// Tour strategies
// ---------------------------------------------------------------------------

/**
 * The ways a school group can get into the Capitol, and which one to lead with.
 *
 * There are two kinds of tour an office can arrange, and the difference is the
 * most consequential thing this engine knows:
 *
 *   - a **staff-led** tour, given by the office's own staff or interns, capped
 *     at 15 per guide (R1) and limited per week (R2);
 *   - a **guided school tour** the office books with the Visitor Center, for a
 *     school group of up to 50 (R16).
 *
 * A teacher who only knows about the first one concludes a full class cannot
 * go through their office. It can. It has to ask for the right thing.
 */
function buildStrategies(input: TripInput): TourStrategy[] {
  const guests = totalGuests(input);
  const staffCap = RULES.staffLedMaxGuests.value;
  const guidedCap = RULES.officeGuidedSchoolMaxGuests.value;
  const strategies: TourStrategy[] = [];

  const fitsStaffLed = guests <= staffCap;
  const fitsGuided = guests <= guidedCap;

  // --- Strategy 1: staff-led tour through the office ----------------------
  strategies.push({
    id: 'office_staff_led',
    title: 'Staff-led tour through your congressional office',
    summary: fitsStaffLed
      ? `Your group of ${guests} fits within the ${staffCap}-person staff-led limit.`
      : `Your group of ${guests} is over the ${staffCap}-person staff-led limit, so this cannot take everyone.`,
    viable: fitsStaffLed,
    recommended: false, // decided below
    guestsCovered: Math.min(guests, staffCap),
    destinations: ['house_office_tour'],
    rationale: fitsStaffLed
      ? [
          `Staff-led tours take up to ${staffCap} people per guide and your group is ${guests}.`,
          'These are given by your Member’s own staff or interns and are usually the more personal experience.',
          'Offices can run only a limited number of staff-led tours each week, so the week you request matters.',
        ]
      : [
          `Staff-led tours take up to ${staffCap} people per guide, adults included. Your group is ${guests}.`,
          'Asking for a staff-led tour for a full class is the most common way a request goes wrong.',
          'Your office can still book you a different kind of tour. See the guided school tour below.',
        ],
    ruleIds: ['R1', 'R2'],
  });

  // --- Strategy 2: guided school tour booked by the office ---------------
  strategies.push({
    id: 'office_guided_school',
    title: 'Guided school tour booked by your congressional office',
    summary: fitsGuided
      ? `Your office books a Visitor Center guided tour for your whole group of ${guests}.`
      : `Your group of ${guests} is over the ${guidedCap}-person limit for a school group booked through an office.`,
    viable: fitsGuided,
    recommended: false,
    guestsCovered: Math.min(guests, guidedCap),
    destinations: ['house_office_tour'],
    rationale: fitsGuided
      ? [
          `Offices can book a guided tour for a school group of up to ${guidedCap} people. Your group is ${guests}.`,
          'Ask for a school group tour by name, and give your full headcount with the adults included. Other groups booked this way are held to 15.',
          'One request, to the office that represents your school, covering everyone.',
        ]
      : [
          `School groups booked through an office are limited to ${guidedCap} people. Your group is ${guests}.`,
          'Book directly with the Visitor Center instead, or ask your office whether it can split you across two tours.',
        ],
    ruleIds: ['R16', 'R6'],
  });

  // --- Strategy 3: book directly with the Visitor Center ------------------
  const cvcMin = RULES.cvcGroupMinimum.value;
  const perSlot = RULES.cvcGuestsPerSlot.value;
  const slotsNeeded = Math.ceil(guests / perSlot);
  const isGroup = guests >= cvcMin;

  strategies.push({
    id: 'cvc_group',
    title: 'Book directly with the Capitol Visitor Center',
    summary: isGroup
      ? `Books your whole group of ${guests}${slotsNeeded > 1 ? `, across ${slotsNeeded} staggered entry times` : ''}, without going through an office.`
      : `Your group of ${guests} is under the ${cvcMin}-visitor group threshold, so you would book as individuals.`,
    viable: true,
    recommended: false,
    guestsCovered: guests,
    destinations: ['cvc_group_reservation'],
    rationale: [
      isGroup
        ? `The Visitor Center treats ${cvcMin} or more visitors as a group, with its own reservation system, and your group of ${guests} qualifies.`
        : `Under ${cvcMin} visitors the Visitor Center does not treat you as a group; book through the standard reservation system.`,
      fitsGuided
        ? 'A good backup if your office cannot take you that week. It does not involve your office at all.'
        : 'The realistic path for a group this size, because it is not limited the way office-booked tours are.',
      ...(slotsNeeded > 1
        ? [
            `At roughly ${perSlot} guests per entry time, expect about ${slotsNeeded} staggered slots rather than one.`,
          ]
        : []),
    ],
    ruleIds: isGroup ? ['R3', 'R4'] : ['R3'],
  });

  // --- Pick the recommendation --------------------------------------------
  // Seat everyone with one request, and prefer the office that represents the
  // school: it is the more personal experience, and it is the office this app
  // exists to connect the school to. Above the office limit, go direct.
  const recommendedId = fitsStaffLed
    ? 'office_staff_led'
    : fitsGuided
      ? 'office_guided_school'
      : 'cvc_group';
  for (const s of strategies) s.recommended = s.id === recommendedId;

  return strategies;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function buildRequests(input: TripInput, strategies: TourStrategy[], targetDate: IsoDate): PlannedRequest[] {
  const requests: PlannedRequest[] = [];
  const guests = totalGuests(input);
  const daysOut = daysBetween(input.requestedOn, targetDate);
  const recommended = strategies.find((s) => s.recommended);

  if (input.wants.tour && recommended) {
    const usesCvc = recommended.destinations.includes('cvc_group_reservation');
    const usesOffice =
      recommended.destinations.includes('house_office_tour') ||
      recommended.destinations.includes('senate_office_tour');

    if (usesCvc) {
      const t = RULES.cvcLeadTimeDays.value;
      requests.push({
        id: 'cvc_tour',
        destination: 'cvc_group_reservation',
        title: 'Capitol Visitor Center group tour reservation',
        why: 'The Visitor Center runs its own Advance Reservation System for groups. It does not know about anything you send a congressional office, so if you also ask your office, cancel whichever booking you do not use.',
        sendBy: previousWeekday(addDays(targetDate, -t.comfortable)),
        leadTime: classifyLeadTime(daysOut, t),
        guests,
        ruleIds: ['R3', 'R5'],
      });
    }

    if (usesOffice) {
      const t = RULES.officeTourLeadTimeDays.value;
      const guided = recommended.id === 'office_guided_school';
      requests.push({
        id: 'office_tour',
        destination: 'house_office_tour',
        title: guided
          ? 'Guided school tour request to your Representative’s office'
          : 'Staff-led tour request to your Representative’s office',
        why: guided
          ? 'Every House and Senate office runs its own tour request form on its own website, so this has to go to your office directly. Ask for a guided school group tour by name and give your full headcount: a request that reads as a staff-led tour gets held to 15.'
          : 'Every House and Senate office runs its own tour request form on its own website. There is no shared system — this request has to go to your office directly.',
        sendBy: previousWeekday(addDays(targetDate, -t.comfortable)),
        leadTime: classifyLeadTime(daysOut, t),
        guests: guided ? guests : Math.min(guests, RULES.staffLedMaxGuests.value),
        ruleIds: guided ? ['R16', 'R6'] : ['R1', 'R2', 'R6'],
      });
    }
  }

  if (input.wants.repMeeting) {
    const t = RULES.repMeetingLeadTimeDays.value;
    requests.push({
      id: 'rep_meeting',
      destination: 'rep_meeting',
      title: 'Meeting request to your Member’s scheduler',
      why: 'A meeting is booked by the office scheduler, not the tour coordinator, and it is confirmed much later because it depends on the floor schedule. Sending it bundled with your tour request is the most common way it gets lost.',
      sendBy: previousWeekday(addDays(targetDate, -t.comfortable)),
      leadTime: classifyLeadTime(daysOut, t),
      guests,
      ruleIds: ['R7'],
    });
  }

  return requests;
}

// ---------------------------------------------------------------------------
// Critical path
// ---------------------------------------------------------------------------

function buildCriticalPath(
  input: TripInput,
  requests: PlannedRequest[],
  targetDate: IsoDate,
): Milestone[] {
  const paperwork = RULES.paperworkLeadDays.value;
  const milestones: Milestone[] = [];

  const push = (
    id: string,
    label: string,
    detail: string,
    dueDate: IsoDate,
    owner: Milestone['owner'],
    ruleIds: string[],
  ) => {
    const out = daysBetween(input.requestedOn, dueDate);
    milestones.push({
      id,
      label,
      detail,
      dueDate,
      owner,
      status: out < 0 ? 'overdue' : out <= 7 ? 'due_soon' : 'upcoming',
      ruleIds,
    });
  };

  for (const r of requests) {
    push(`send_${r.id}`, `Send: ${r.title}`, r.why, r.sendBy, 'teacher', r.ruleIds);
  }

  push(
    'permission_slips_out',
    'Distribute permission slips',
    'Send permission slips home. Families need real time with this, especially if the trip involves an overnight stay or a cost.',
    previousWeekday(addDays(targetDate, -paperwork.permissionSlipsOut)),
    'school',
    ['R14'],
  );

  push(
    'permission_slips_due',
    'Permission slips due back',
    'Collect signed slips. Anyone without one is not on the roster, and the roster is what you send to the office.',
    previousWeekday(addDays(targetDate, -paperwork.permissionSlipsDue)),
    'school',
    ['R14'],
  );

  push(
    'headcount_lock',
    'Lock your headcount',
    'Confirm the final number of students, teachers and chaperones. Both the Visitor Center and your congressional office plan around this number.',
    previousWeekday(addDays(targetDate, -paperwork.headcountLock)),
    'teacher',
    ['R14'],
  );

  push(
    'final_roster',
    'Send your final roster',
    'Send the confirmed names to whichever office is hosting you. Groups arriving with names that do not match the list lose time at screening.',
    previousWeekday(addDays(targetDate, -paperwork.finalRosterToOffice)),
    'teacher',
    ['R14'],
  );

  push(
    'chaperone_briefing',
    'Brief your chaperones',
    'Share the one-page briefing: no food or drink inside, no bag storage, arrive 45 minutes early for screening, meeting point and emergency contacts.',
    previousWeekday(addDays(targetDate, -paperwork.chaperoneBriefing)),
    'teacher',
    ['R9', 'R10', 'R11', 'R14'],
  );

  push('trip_day', 'Trip day', 'Arrive early, travel by Metro, and leave the bags on the bus.', targetDate, 'teacher', [
    'R9',
    'R12',
  ]);

  return milestones.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Chaperones
// ---------------------------------------------------------------------------

function assessChaperones(input: TripInput): ChaperoneAssessment {
  const ratio = RULES.chaperoneRatios.value[input.gradeBand];
  const adults = adultsPresent(input);
  const recommended = Math.ceil(input.groupSize.students / ratio);
  return {
    band: input.gradeBand,
    recommendedRatio: ratio,
    adultsPresent: adults,
    adultsRecommended: recommended,
    shortfall: Math.max(0, recommended - adults),
    meetsRecommendation: adults >= recommended,
  };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

function buildFindings(
  input: TripInput,
  dates: DateAssessment[],
  strategies: TourStrategy[],
  chaperones: ChaperoneAssessment,
): Finding[] {
  const findings: Finding[] = [];
  const guests = totalGuests(input);
  const cap = RULES.staffLedMaxGuests.value;
  const guidedCap = RULES.officeGuidedSchoolMaxGuests.value;

  // --- The headline constraint -------------------------------------------
  // The teacher's likely mistake depends on the size of the group, so the
  // headline does too. Over 15 the danger is asking for the wrong kind of tour;
  // over 50 it is asking the office at all.
  if (guests > guidedCap) {
    findings.push({
      code: 'GROUP_OVER_OFFICE_LIMIT',
      severity: 'high',
      title: `Your group of ${guests} is too big to book through your office`,
      detail: `Offices can book a guided tour for a school group of up to ${guidedCap} people, and a staff-led tour takes at most ${cap}. Your group is ${guests}. Book directly with the Capitol Visitor Center, which handles large groups across staggered entry times.`,
      ruleId: 'R16',
    });
  } else if (guests > cap) {
    findings.push({
      code: 'ASK_FOR_GUIDED_SCHOOL_TOUR',
      severity: 'high',
      title: `Ask your office for a guided school tour, not a staff-led one`,
      detail: `A staff-led tour takes at most ${cap} people per guide, adults included, and your group is ${guests}. Your office can also book a guided tour for a school group of up to ${guidedCap}, which takes everyone in one request. Say “school group” and give your full headcount when you ask — a request that reads as a staff-led tour gets held to ${cap}.`,
      ruleId: 'R16',
    });
  } else {
    findings.push({
      code: 'GROUP_FITS_STAFF_LED',
      severity: 'info',
      title: `Your group of ${guests} fits a staff-led tour`,
      detail: `Staff-led tours cap at ${cap} guests and you are at ${guests}. You have room for ${cap - guests} more before you lose this option, so watch the number as chaperones sign up.`,
      ruleId: 'R1',
    });
  }

  // --- Dates --------------------------------------------------------------
  const viableDates = dates.filter((d) => d.viable);
  if (viableDates.length === 0) {
    findings.push({
      code: 'NO_VIABLE_DATE',
      severity: 'blocker',
      title: 'None of your three dates will work',
      detail:
        'Every date you gave is either past, too close to request, or a day the Capitol is closed to tours. Pick new dates before doing anything else — everything downstream depends on this.',
    });
  }

  for (const d of dates) {
    if (!d.open) {
      findings.push({
        code: 'DATE_CLOSED',
        severity: d.label === 'preferred' ? 'high' : 'medium',
        title: `${d.date} is not a tour day`,
        detail: d.closedReason ?? 'The Capitol is closed to tours on this date.',
        ruleId: 'R8',
      });
    } else if (d.leadTime === 'unlikely') {
      findings.push({
        code: 'DATE_TOO_SOON',
        severity: d.label === 'preferred' ? 'high' : 'medium',
        title: `${d.date} is only ${d.daysOut} days away`,
        detail:
          'That is inside the window where tour requests are usually too late to place. Treat this date as unlikely and lead with an alternate.',
        ruleId: 'R5',
      });
    } else if (d.leadTime === 'tight') {
      findings.push({
        code: 'DATE_TIGHT',
        severity: 'medium',
        title: `${d.date} is tight at ${d.daysOut} days out`,
        detail:
          'Still worth requesting, but send everything this week and expect the office to come back with an alternate date.',
        ruleId: 'R6',
      });
    }
  }

  // --- Separate tracks ----------------------------------------------------
  if (input.wants.repMeeting && input.wants.tour) {
    findings.push({
      code: 'MEETING_IS_SEPARATE',
      severity: 'info',
      title: 'Your meeting and your tour are two different requests',
      detail:
        'They go to different people on different timelines — the tour to the office’s tour coordinator or the Visitor Center, the meeting to the scheduler. We have generated them separately, and they will be confirmed separately. A confirmed tour does not mean a confirmed meeting.',
      ruleId: 'R7',
    });
  }

  if (input.wants.repMeeting) {
    findings.push({
      code: 'MEETING_CONFIRMS_LATE',
      severity: 'info',
      title: 'Expect the meeting to be confirmed late',
      detail:
        'Member meetings depend on the floor schedule, which is not set far in advance. It is normal for this to be unconfirmed until the week of your trip. Plan a day that still works if the meeting becomes a photo with staff instead.',
      ruleId: 'R7',
    });
  }

  // --- Weekly office capacity --------------------------------------------
  // R2 limits staff-led tours specifically, so it only applies when that is
  // the tour we are telling the teacher to ask for.
  const recommendedStrategy = strategies.find((s) => s.recommended);
  if (recommendedStrategy?.id === 'office_staff_led') {
    findings.push({
      code: 'OFFICE_WEEKLY_LIMIT',
      severity: 'medium',
      title: 'Your office can run only a few staff-led tours that week',
      detail:
        'Offices can run only a limited number of staff-led tours each week — some publish it as one — so you may be competing with other schools in your district for the same week. Requesting early matters more than picking the perfect day.',
      ruleId: 'R2',
    });
  }

  // --- Chaperones ---------------------------------------------------------
  if (!chaperones.meetsRecommendation) {
    findings.push({
      code: 'CHAPERONE_SHORTFALL',
      severity: 'medium',
      title: `You may be ${chaperones.shortfall} adult${chaperones.shortfall === 1 ? '' : 's'} short`,
      detail: `For a ${chaperones.band} group we suggest about one adult per ${chaperones.recommendedRatio} students, which is ${chaperones.adultsRecommended} adults for ${input.groupSize.students} students. You have ${chaperones.adultsPresent}. This is our recommendation, not a Capitol rule — your district's own policy is the one that counts.`,
      ruleId: 'R13',
    });
  }

  // --- Logistics the teacher has not asked about yet ----------------------
  if (input.arrivalMethod === 'charter_bus') {
    findings.push({
      code: 'NO_BUS_PARKING',
      severity: 'high',
      title: 'Your bus can drop off, but it cannot park',
      detail:
        'There is no visitor parking at the Capitol and street parking nearby is extremely limited. Arrange a drop-off point and a separate pickup time with your charter company now — this is the logistics detail that most often goes wrong on the day.',
      ruleId: 'R12',
    });
  }

  if (input.arrivalMethod === 'flying' || input.arrivalMethod === 'amtrak') {
    findings.push({
      code: 'ARRIVE_VIA_TRANSIT',
      severity: 'info',
      title: 'You will be on Metro',
      detail:
        'Coming in by train or plane means public transit to the Capitol. Union Station and Capitol South are the two stations groups use. We will build you station-to-station directions once your date is set.',
      ruleId: 'R12',
    });
  }

  findings.push({
    code: 'NO_BAG_STORAGE',
    severity: 'high',
    title: 'There is nowhere to put backpacks',
    detail:
      'The Capitol has no bag storage. Thirty students arriving with thirty backpacks is a real problem at the door with no on-site solution. Decide now where bags stay, and tell families before the trip, not the morning of.',
    ruleId: 'R10',
  });

  findings.push({
    code: 'NO_FOOD_INSIDE',
    severity: 'medium',
    title: 'No food or drink inside, water bottles included',
    detail:
      'Plan lunch before you enter or after you exit. The Visitor Center has its own restaurant, and we keep a directory of nearby places that can actually seat a school group.',
    ruleId: 'R11',
  });

  if (input.accessibilityNeeds.length > 0) {
    findings.push({
      code: 'ACCESSIBILITY_SCREENING',
      severity: 'medium',
      title: 'Flag accessibility needs on every request',
      detail:
        'Visitors with disabilities go through a separate screening process, and the Capitol can arrange accommodations if it knows in advance. We have included your accessibility needs in each request packet — do not leave this to the day.',
      ruleId: 'R9',
    });
  }

  // The semiquincentennial. Fires only for trips inside the peak window, and
  // only says something a teacher can act on: request earlier. The weekly
  // office cap is the constraint that does not flex with demand, so the advice
  // is sharper for a group that needs an office slot than for one already
  // headed to the Visitor Center.
  const peak = RULES.semiquincentennial.value;
  const inPeak = input.preferredDate >= peak.peakStart && input.preferredDate <= peak.peakEnd;
  if (inPeak) {
    // Keyed off the strategy we actually recommend, not off whatever is merely
    // viable. The split is always technically viable, so testing viability here
    // would make this branch constant and the advice generic — and the whole
    // point is that a group heading for the Visitor Center faces a different
    // constraint from one competing for an office's single weekly slot.
    const recommended = strategies.find((s) => s.recommended);
    const needsOfficeSlot =
      recommended?.id === 'office_staff_led' || recommended?.id === 'office_guided_school';
    findings.push({
      code: 'SEMIQUINCENTENNIAL_DEMAND',
      severity: needsOfficeSlot ? 'medium' : 'info',
      title: 'You are planning into the 250th anniversary year',
      detail: needsOfficeSlot
        ? `July 4, 2026 is the 250th anniversary of the Declaration of Independence, and your trip falls in the busiest stretch of that year. The tours an office can arrange each week are limited, and that number does not change because more schools are asking. Send the request at the early end of the window below, not the late end, and treat your alternate dates as real rather than as a formality. This is our judgment, not a published policy.`
        : `July 4, 2026 is the 250th anniversary of the Declaration of Independence, and your trip falls in the busiest stretch of that year. Your group is going through the Visitor Center directly, and reservations still fill, so book at the early end of the window below. This is our judgment, not a published policy.`,
      ruleId: 'R15',
    });
  }

  const order: Record<Finding['severity'], number> = { blocker: 0, high: 1, medium: 2, info: 3 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildPlan(input: TripInput): FeasibilityPlan {
  const dates: DateAssessment[] = [
    assessDate(input.preferredDate, 'preferred', input),
    ...input.alternateDates.slice(0, 2).map((d) => assessDate(d, 'alternate', input)),
  ];

  // Plan against the best date we can actually use. If the preferred date is
  // viable we always keep it — teachers pick their preferred date for reasons
  // we do not know about, so we never quietly swap it for a "better" one.
  const preferred = dates[0];
  const recommendedDate = preferred.viable
    ? preferred.date
    : (dates.find((d) => d.viable)?.date ?? null);

  const strategies = buildStrategies(input);
  const chaperones = assessChaperones(input);

  // With no viable date there is nothing honest to anchor deadlines to, so we
  // still schedule against the preferred date and let the blocker finding say
  // plainly that the dates need to change first.
  const targetDate = recommendedDate ?? input.preferredDate;
  const requests = buildRequests(input, strategies, targetDate);
  const criticalPath = buildCriticalPath(input, requests, targetDate);
  const findings = buildFindings(input, dates, strategies, chaperones);

  return {
    totalGuests: totalGuests(input),
    chaperones,
    dates,
    recommendedDate,
    strategies,
    requests,
    criticalPath,
    findings,
    rulesetVersion: RULESET_VERSION,
  };
}
