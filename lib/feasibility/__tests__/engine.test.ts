import { describe, expect, it } from 'vitest';
import { buildPlan, classifyLeadTime, totalGuests } from '../engine';
import { RULES } from '../rules.config';
import type { TripInput } from '../types';
import type { IsoDate } from '../../dates';

/**
 * A baseline trip that is deliberately boring: comfortably far out, on a
 * Tuesday the Capitol is open, with a group that fits every limit. Each test
 * changes exactly one thing so that when an assertion fails you know why.
 *
 * 2026-04-14 is a Tuesday. 2026-01-05 is a Monday, ~99 days earlier.
 */
function trip(overrides: Partial<TripInput> = {}): TripInput {
  return {
    preferredDate: '2026-04-14',
    alternateDates: ['2026-04-21', '2026-04-28'],
    requestedOn: '2026-01-05',
    groupSize: { students: 12, teachers: 1, chaperones: 2 },
    gradeBand: 'middle',
    arrivalMethod: 'charter_bus',
    accessibilityNeeds: [],
    wants: { tour: true, repMeeting: false },
    ...overrides,
  };
}

const findingCodes = (p: ReturnType<typeof buildPlan>) => p.findings.map((f) => f.code);
const strategy = (p: ReturnType<typeof buildPlan>, id: string) =>
  p.strategies.find((s) => s.id === id)!;
const recommended = (p: ReturnType<typeof buildPlan>) => p.strategies.find((s) => s.recommended)!;

// ---------------------------------------------------------------------------
// The 15/16 boundary — the staff-led cap
// ---------------------------------------------------------------------------

describe('group size boundary at the staff-led cap', () => {
  it('uses 15 as the cap, so the test tracks the config rather than a literal', () => {
    expect(RULES.staffLedMaxGuests.value).toBe(15);
  });

  it('counts students, teachers and chaperones together', () => {
    // 12 + 1 + 2 = 15. A teacher who counts only students would think they had room.
    expect(totalGuests(trip())).toBe(15);
  });

  it('at exactly 15 guests, the staff-led tour is viable and recommended', () => {
    const plan = buildPlan(trip({ groupSize: { students: 12, teachers: 1, chaperones: 2 } }));
    expect(plan.totalGuests).toBe(15);
    expect(strategy(plan, 'office_staff_led').viable).toBe(true);
    expect(recommended(plan).id).toBe('office_staff_led');
    expect(findingCodes(plan)).toContain('GROUP_FITS_STAFF_LED');
    expect(findingCodes(plan)).not.toContain('ASK_FOR_GUIDED_SCHOOL_TOUR');
  });

  it('at 16 guests, the staff-led tour stops being viable', () => {
    const plan = buildPlan(trip({ groupSize: { students: 13, teachers: 1, chaperones: 2 } }));
    expect(plan.totalGuests).toBe(16);
    expect(strategy(plan, 'office_staff_led').viable).toBe(false);
    expect(findingCodes(plan)).toContain('ASK_FOR_GUIDED_SCHOOL_TOUR');
  });

  it('one extra chaperone is enough to break a group of exactly 15', () => {
    const at15 = buildPlan(trip({ groupSize: { students: 12, teachers: 1, chaperones: 2 } }));
    const at16 = buildPlan(trip({ groupSize: { students: 12, teachers: 1, chaperones: 3 } }));
    expect(strategy(at15, 'office_staff_led').viable).toBe(true);
    expect(strategy(at16, 'office_staff_led').viable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The guided school tour — how a full class goes through its office (R16)
// ---------------------------------------------------------------------------

describe('guided school tour booked by the office', () => {
  it('uses 50 as the school-group limit, tracking the config', () => {
    expect(RULES.officeGuidedSchoolMaxGuests.value).toBe(50);
    expect(RULES.officeGuidedSchoolMaxGuests.id).toBe('R16');
  });

  it('sends a full class of 36 through its office, not away from it', () => {
    // The mistake an earlier version made: treating the staff-led cap as the
    // ceiling on office tours and telling a full class to go elsewhere.
    const plan = buildPlan(trip({ groupSize: { students: 30, teachers: 2, chaperones: 4 } }));
    expect(plan.totalGuests).toBe(36);
    expect(recommended(plan).id).toBe('office_guided_school');
    expect(recommended(plan).guestsCovered).toBe(36);
    expect(recommended(plan).destinations).toEqual(['house_office_tour']);
  });

  it('tells the teacher to ask for a school group tour by name', () => {
    const plan = buildPlan(trip({ groupSize: { students: 28, teachers: 2, chaperones: 4 } }));
    const headline = plan.findings.find((f) => f.code === 'ASK_FOR_GUIDED_SCHOOL_TOUR')!;
    expect(headline.severity).toBe('high');
    expect(headline.ruleId).toBe('R16');
    expect(headline.detail).toMatch(/school group/i);
  });

  it('is viable at exactly 50 and not at 51', () => {
    const at50 = buildPlan(trip({ groupSize: { students: 44, teachers: 2, chaperones: 4 } }));
    const at51 = buildPlan(trip({ groupSize: { students: 45, teachers: 2, chaperones: 4 } }));
    expect(strategy(at50, 'office_guided_school').viable).toBe(true);
    expect(recommended(at50).id).toBe('office_guided_school');
    expect(strategy(at51, 'office_guided_school').viable).toBe(false);
  });

  it('over 50, recommends booking directly with the Visitor Center', () => {
    const plan = buildPlan(trip({ groupSize: { students: 80, teachers: 4, chaperones: 8 } }));
    expect(recommended(plan).id).toBe('cvc_group');
    expect(findingCodes(plan)).toContain('GROUP_OVER_OFFICE_LIMIT');
    expect(findingCodes(plan)).not.toContain('ASK_FOR_GUIDED_SCHOOL_TOUR');
  });

  it('always offers the Visitor Center as a backup', () => {
    for (const students of [10, 30, 80]) {
      const plan = buildPlan(trip({ groupSize: { students, teachers: 2, chaperones: 2 } }));
      expect(strategy(plan, 'cvc_group').viable).toBe(true);
    }
  });

  it('only warns about the weekly staff-led limit when staff-led is the plan', () => {
    const small = buildPlan(trip());
    const large = buildPlan(trip({ groupSize: { students: 30, teachers: 2, chaperones: 4 } }));
    expect(findingCodes(small)).toContain('OFFICE_WEEKLY_LIMIT');
    expect(findingCodes(large)).not.toContain('OFFICE_WEEKLY_LIMIT');
  });
});

// ---------------------------------------------------------------------------
// Lead time
// ---------------------------------------------------------------------------

describe('lead-time classification', () => {
  const t = { comfortable: 90, adequate: 30, minimum: 14 };

  it('bands each side of every threshold', () => {
    expect(classifyLeadTime(120, t)).toBe('comfortable');
    expect(classifyLeadTime(90, t)).toBe('comfortable'); // inclusive at the boundary
    expect(classifyLeadTime(89, t)).toBe('adequate');
    expect(classifyLeadTime(30, t)).toBe('adequate');
    expect(classifyLeadTime(29, t)).toBe('tight');
    expect(classifyLeadTime(14, t)).toBe('tight');
    expect(classifyLeadTime(13, t)).toBe('unlikely');
    expect(classifyLeadTime(0, t)).toBe('unlikely');
    expect(classifyLeadTime(-1, t)).toBe('past');
  });
});

describe('lead time applied to real dates', () => {
  it('a comfortable date produces no urgency findings', () => {
    const plan = buildPlan(trip());
    expect(plan.dates[0].leadTime).toBe('comfortable');
    expect(findingCodes(plan)).not.toContain('DATE_TOO_SOON');
    expect(findingCodes(plan)).not.toContain('DATE_TIGHT');
  });

  it('a date ten days out is flagged as unlikely and made non-viable', () => {
    const plan = buildPlan(
      trip({ requestedOn: '2026-04-04', preferredDate: '2026-04-14', alternateDates: [] }),
    );
    expect(plan.dates[0].daysOut).toBe(10);
    expect(plan.dates[0].leadTime).toBe('unlikely');
    expect(plan.dates[0].viable).toBe(false);
    expect(findingCodes(plan)).toContain('DATE_TOO_SOON');
  });

  it('takes the worst threshold across everything the trip needs', () => {
    // 35 days out: adequate for the CVC (30), but tight for an office tour (42).
    const plan = buildPlan(trip({ requestedOn: '2026-03-10', preferredDate: '2026-04-14' }));
    expect(plan.dates[0].daysOut).toBe(35);
    expect(plan.dates[0].leadTime).toBe('tight');
    expect(findingCodes(plan)).toContain('DATE_TIGHT');
  });

  it('falls back to the first viable alternate when the preferred date is too soon', () => {
    const plan = buildPlan(
      trip({
        requestedOn: '2026-04-04',
        preferredDate: '2026-04-14', // 10 days out — unlikely
        alternateDates: ['2026-07-14', '2026-08-11'], // comfortably far
      }),
    );
    expect(plan.dates[0].viable).toBe(false);
    expect(plan.recommendedDate).toBe('2026-07-14');
  });

  it('keeps the preferred date whenever it is viable, even if an alternate has more runway', () => {
    const plan = buildPlan(
      trip({ preferredDate: '2026-04-14', alternateDates: ['2026-09-15', '2026-10-13'] }),
    );
    expect(plan.recommendedDate).toBe('2026-04-14');
  });

  it('flags a blocker when no date survives', () => {
    const plan = buildPlan(
      trip({
        requestedOn: '2026-04-10',
        preferredDate: '2026-04-12', // Sunday, and 2 days out
        alternateDates: ['2026-04-13', '2026-04-14'],
      }),
    );
    expect(plan.recommendedDate).toBeNull();
    expect(findingCodes(plan)).toContain('NO_VIABLE_DATE');
    expect(plan.findings[0].severity).toBe('blocker');
  });
});

// ---------------------------------------------------------------------------
// Closed days
// ---------------------------------------------------------------------------

describe('days the Capitol is closed', () => {
  it('rejects Sundays', () => {
    const plan = buildPlan(trip({ preferredDate: '2026-04-12' })); // Sunday
    expect(plan.dates[0].open).toBe(false);
    expect(plan.dates[0].closedReason).toMatch(/Sunday/);
    expect(findingCodes(plan)).toContain('DATE_CLOSED');
  });

  it('accepts Saturdays but warns that offices are not staffed', () => {
    const plan = buildPlan(trip({ preferredDate: '2026-04-18' })); // Saturday
    expect(plan.dates[0].open).toBe(true);
    expect(plan.dates[0].notes.join(' ')).toMatch(/not staffed/i);
  });

  it('rejects federal holidays', () => {
    // 2026-05-25 is the last Monday in May — Memorial Day.
    const plan = buildPlan(trip({ requestedOn: '2026-01-05', preferredDate: '2026-05-25' }));
    expect(plan.dates[0].open).toBe(false);
    expect(plan.dates[0].closedReason).toMatch(/Memorial Day/);
  });

  it('rejects a holiday observed on a different day than it falls', () => {
    // 2026-07-04 is a Saturday, so Independence Day is observed Friday the 3rd.
    const plan = buildPlan(trip({ requestedOn: '2026-01-05', preferredDate: '2026-07-03' }));
    expect(plan.dates[0].open).toBe(false);
    expect(plan.dates[0].closedReason).toMatch(/Independence Day/);
  });
});

// ---------------------------------------------------------------------------
// Requests: the meeting/tour split
// ---------------------------------------------------------------------------

describe('request generation', () => {
  it('generates one office request for a full class, covering everyone', () => {
    const plan = buildPlan(trip({ groupSize: { students: 30, teachers: 2, chaperones: 4 } }));
    expect(plan.requests.map((r) => r.id)).toEqual(['office_tour']);
    expect(plan.requests[0].guests).toBe(36);
    expect(plan.requests[0].title).toMatch(/guided school tour/i);
  });

  it('generates one CVC request for a group too big for an office', () => {
    const plan = buildPlan(trip({ groupSize: { students: 80, teachers: 4, chaperones: 8 } }));
    expect(plan.requests.map((r) => r.id)).toEqual(['cvc_tour']);
    expect(plan.requests[0].guests).toBe(92);
  });

  it('generates an office request for a group that fits', () => {
    const plan = buildPlan(trip());
    expect(plan.requests.map((r) => r.id)).toEqual(['office_tour']);
  });

  it('generates the meeting as its own request, not bundled with the tour', () => {
    const plan = buildPlan(trip({ wants: { tour: true, repMeeting: true } }));
    const ids = plan.requests.map((r) => r.id);
    expect(ids).toContain('office_tour');
    expect(ids).toContain('rep_meeting');

    const meeting = plan.requests.find((r) => r.id === 'rep_meeting')!;
    expect(meeting.destination).toBe('rep_meeting');
    expect(meeting.why).toMatch(/scheduler/i);
    expect(findingCodes(plan)).toContain('MEETING_IS_SEPARATE');
  });

  it('puts the meeting and the tour on different deadlines', () => {
    const plan = buildPlan(trip({ wants: { tour: true, repMeeting: true } }));
    const tour = plan.requests.find((r) => r.id === 'office_tour')!;
    const meeting = plan.requests.find((r) => r.id === 'rep_meeting')!;
    // Tour goes out ~90 days ahead, meeting ~60 — different clocks, by design.
    expect(tour.sendBy < meeting.sendBy).toBe(true);
  });

  it('generates a meeting request even when no tour is wanted', () => {
    const plan = buildPlan(trip({ wants: { tour: false, repMeeting: true } }));
    expect(plan.requests.map((r) => r.id)).toEqual(['rep_meeting']);
  });

  it('never schedules a send-by deadline on a weekend', () => {
    const plan = buildPlan(trip({ wants: { tour: true, repMeeting: true } }));
    for (const r of plan.requests) {
      const day = new Date(`${r.sendBy}T12:00:00Z`).getUTCDay();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Critical path
// ---------------------------------------------------------------------------

describe('critical path', () => {
  it('is ordered by date and ends on the trip', () => {
    const plan = buildPlan(trip());
    const dates = plan.criticalPath.map((m) => m.dueDate);
    expect([...dates].sort()).toEqual(dates);
    expect(plan.criticalPath.at(-1)!.id).toBe('trip_day');
  });

  it('puts every request send-by on the critical path', () => {
    const plan = buildPlan(trip({ wants: { tour: true, repMeeting: true } }));
    for (const r of plan.requests) {
      expect(plan.criticalPath.map((m) => m.id)).toContain(`send_${r.id}`);
    }
  });

  it('sends permission slips out before they are due back', () => {
    const plan = buildPlan(trip());
    const out = plan.criticalPath.find((m) => m.id === 'permission_slips_out')!;
    const due = plan.criticalPath.find((m) => m.id === 'permission_slips_due')!;
    expect(out.dueDate < due.dueDate).toBe(true);
  });

  it('locks the headcount before the roster goes to the office', () => {
    const plan = buildPlan(trip());
    const lock = plan.criticalPath.find((m) => m.id === 'headcount_lock')!;
    const roster = plan.criticalPath.find((m) => m.id === 'final_roster')!;
    expect(lock.dueDate < roster.dueDate).toBe(true);
  });

  it('marks milestones that have already passed as overdue', () => {
    // Requesting 20 days out means the 45-day permission slip milestone is gone.
    const plan = buildPlan(trip({ requestedOn: '2026-03-25', preferredDate: '2026-04-14' }));
    const slips = plan.criticalPath.find((m) => m.id === 'permission_slips_out')!;
    expect(slips.status).toBe('overdue');
  });
});

// ---------------------------------------------------------------------------
// Chaperones
// ---------------------------------------------------------------------------

describe('chaperone assessment', () => {
  it('computes the shortfall against the band ratio', () => {
    const plan = buildPlan(
      trip({ gradeBand: 'elementary', groupSize: { students: 30, teachers: 1, chaperones: 1 } }),
    );
    expect(plan.chaperones.recommendedRatio).toBe(6);
    expect(plan.chaperones.adultsRecommended).toBe(5);
    expect(plan.chaperones.adultsPresent).toBe(2);
    expect(plan.chaperones.shortfall).toBe(3);
    expect(findingCodes(plan)).toContain('CHAPERONE_SHORTFALL');
  });

  it('says nothing when the ratio is met', () => {
    const plan = buildPlan(
      trip({ gradeBand: 'high', groupSize: { students: 24, teachers: 2, chaperones: 1 } }),
    );
    expect(plan.chaperones.meetsRecommendation).toBe(true);
    expect(findingCodes(plan)).not.toContain('CHAPERONE_SHORTFALL');
  });

  it('labels the ratio as a recommendation rather than a Capitol rule', () => {
    const plan = buildPlan(
      trip({ gradeBand: 'elementary', groupSize: { students: 30, teachers: 1, chaperones: 1 } }),
    );
    const f = plan.findings.find((x) => x.code === 'CHAPERONE_SHORTFALL')!;
    expect(f.detail).toMatch(/not a Capitol rule/i);
  });
});

// ---------------------------------------------------------------------------
// Logistics findings
// ---------------------------------------------------------------------------

describe('logistics findings', () => {
  it('always warns about bag storage and food, regardless of trip shape', () => {
    for (const arrival of ['charter_bus', 'amtrak', 'flying', 'local'] as const) {
      const codes = findingCodes(buildPlan(trip({ arrivalMethod: arrival })));
      expect(codes).toContain('NO_BAG_STORAGE');
      expect(codes).toContain('NO_FOOD_INSIDE');
    }
  });

  it('warns charter buses about parking', () => {
    expect(findingCodes(buildPlan(trip({ arrivalMethod: 'charter_bus' })))).toContain(
      'NO_BUS_PARKING',
    );
    expect(findingCodes(buildPlan(trip({ arrivalMethod: 'local' })))).not.toContain(
      'NO_BUS_PARKING',
    );
  });

  it('raises accessibility screening only when needs were declared', () => {
    expect(findingCodes(buildPlan(trip({ accessibilityNeeds: ['wheelchair'] })))).toContain(
      'ACCESSIBILITY_SCREENING',
    );
    expect(findingCodes(buildPlan(trip({ accessibilityNeeds: [] })))).not.toContain(
      'ACCESSIBILITY_SCREENING',
    );
  });

  it('sorts blockers above everything else', () => {
    const plan = buildPlan(
      trip({
        requestedOn: '2026-04-10',
        preferredDate: '2026-04-12',
        alternateDates: ['2026-04-13'],
      }),
    );
    expect(plan.findings[0].severity).toBe('blocker');
  });
});

// ---------------------------------------------------------------------------
// Traceability — the property that makes the UI able to explain itself
// ---------------------------------------------------------------------------

describe('traceability', () => {
  it('ties every rule-derived finding to a rule that exists', () => {
    const plan = buildPlan(trip({ wants: { tour: true, repMeeting: true } }));
    const known = new Set(Object.values(RULES).map((r) => r.id));
    for (const f of plan.findings) {
      if (f.ruleId) expect(known).toContain(f.ruleId);
    }
    for (const s of plan.strategies) {
      for (const id of s.ruleIds) expect(known).toContain(id);
    }
    for (const r of plan.requests) {
      for (const id of r.ruleIds) expect(known).toContain(id);
    }
  });

  it('stamps the ruleset version onto the plan', () => {
    expect(buildPlan(trip()).rulesetVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// R15 — the semiquincentennial advisory
// ---------------------------------------------------------------------------

describe('the 250th anniversary advisory (R15)', () => {
  const peak = RULES.semiquincentennial.value;

  function planFor(preferredDate: string, groupSize = { students: 10, teachers: 2, chaperones: 2 }) {
    return buildPlan({
      preferredDate: preferredDate as IsoDate,
      alternateDates: [],
      requestedOn: '2026-01-10' as IsoDate,
      groupSize,
      gradeBand: 'middle',
      arrivalMethod: 'charter_bus',
      accessibilityNeeds: [],
      wants: { tour: true, repMeeting: false },
    });
  }

  function advisory(preferredDate: string, groupSize?: { students: number; teachers: number; chaperones: number }) {
    return planFor(preferredDate, groupSize).findings.find(
      (f) => f.code === 'SEMIQUINCENTENNIAL_DEMAND',
    );
  }

  it('fires inside the peak window and stays quiet outside it', () => {
    expect(advisory(peak.peakStart)).toBeDefined();
    expect(advisory(peak.peakEnd)).toBeDefined();
    expect(advisory(peak.anniversary)).toBeDefined();

    // A day either side of the window, and a year that is not the anniversary.
    expect(advisory('2026-02-28')).toBeUndefined();
    expect(advisory('2026-12-01')).toBeUndefined();
    expect(advisory('2027-05-12')).toBeUndefined();
  });

  it('is sharper for a group that needs a limited office slot', () => {
    // Groups of 14 and 34 both go through their office, staff-led or guided,
    // and compete for the limited tours it can arrange each week.
    const small = advisory('2026-05-12', { students: 10, teachers: 2, chaperones: 2 });
    expect(small?.severity).toBe('medium');
    expect(small?.detail).toContain('each week');
    const class34 = advisory('2026-05-12', { students: 28, teachers: 2, chaperones: 4 });
    expect(class34?.severity).toBe('medium');

    // A group of 92 books the Visitor Center directly, so the office-slot
    // advice would be overstated.
    const large = advisory('2026-05-12', { students: 80, teachers: 4, chaperones: 8 });
    expect(large?.severity).toBe('info');
  });

  it('always traces back to R15, and R15 is labelled as our own judgment', () => {
    expect(advisory('2026-05-12')?.ruleId).toBe('R15');
    // This one matters: the anniversary date is a matter of record but the
    // advice is not policy, and the UI renders that distinction.
    expect(RULES.semiquincentennial.source.confidence).toBe('heuristic');
  });

  it('has a window that contains the anniversary it is about', () => {
    expect(peak.peakStart < peak.anniversary).toBe(true);
    expect(peak.anniversary < peak.peakEnd).toBe(true);
  });
});
