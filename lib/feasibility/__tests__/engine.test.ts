import { describe, expect, it } from 'vitest';
import { buildPlan, classifyLeadTime, totalGuests } from '../engine';
import { RULES } from '../rules.config';
import type { TripInput } from '../types';

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
// The 15/16 boundary — the rule the whole product exists to surface
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
    expect(findingCodes(plan)).not.toContain('GROUP_OVER_STAFF_LED_CAP');
  });

  it('at 16 guests, the staff-led tour stops being viable', () => {
    const plan = buildPlan(trip({ groupSize: { students: 13, teachers: 1, chaperones: 2 } }));
    expect(plan.totalGuests).toBe(16);
    expect(strategy(plan, 'office_staff_led').viable).toBe(false);
    expect(findingCodes(plan)).toContain('GROUP_OVER_STAFF_LED_CAP');
  });

  it('one extra chaperone is enough to break a group of exactly 15', () => {
    const at15 = buildPlan(trip({ groupSize: { students: 12, teachers: 1, chaperones: 2 } }));
    const at16 = buildPlan(trip({ groupSize: { students: 12, teachers: 1, chaperones: 3 } }));
    expect(strategy(at15, 'office_staff_led').viable).toBe(true);
    expect(strategy(at16, 'office_staff_led').viable).toBe(false);
  });

  it('a full class of 30 is pushed to the Visitor Center, not the office', () => {
    const plan = buildPlan(trip({ groupSize: { students: 30, teachers: 2, chaperones: 4 } }));
    expect(plan.totalGuests).toBe(36);
    expect(recommended(plan).id).toBe('cvc_group');
    expect(recommended(plan).guestsCovered).toBe(36);
  });
});

// ---------------------------------------------------------------------------
// Split-group recommendation
// ---------------------------------------------------------------------------

describe('split-group option', () => {
  it('is not offered when the whole group already fits a staff-led tour', () => {
    const plan = buildPlan(trip({ groupSize: { students: 10, teachers: 1, chaperones: 1 } }));
    expect(plan.strategies.map((s) => s.id)).not.toContain('split_staff_led_and_cvc');
  });

  it('is offered once the group is over the cap', () => {
    const plan = buildPlan(trip({ groupSize: { students: 25, teachers: 2, chaperones: 3 } }));
    expect(plan.strategies.map((s) => s.id)).toContain('split_staff_led_and_cvc');
  });

  it('splits at the cap and covers the whole group', () => {
    const plan = buildPlan(trip({ groupSize: { students: 25, teachers: 2, chaperones: 3 } }));
    const split = strategy(plan, 'split_staff_led_and_cvc');
    expect(plan.totalGuests).toBe(30);
    expect(split.guestsCovered).toBe(30);
    expect(split.title).toContain('15');
    expect(split.title).toContain('15'); // 30 - 15 remainder
    expect(split.destinations).toEqual(['house_office_tour', 'cvc_group_reservation']);
  });

  it('is never the default recommendation, because it needs two requests to land', () => {
    const plan = buildPlan(trip({ groupSize: { students: 25, teachers: 2, chaperones: 3 } }));
    expect(strategy(plan, 'split_staff_led_and_cvc').recommended).toBe(false);
    expect(recommended(plan).id).toBe('cvc_group');
  });

  it('warns that adults count toward the 15 on the staff-led half', () => {
    const plan = buildPlan(trip({ groupSize: { students: 25, teachers: 2, chaperones: 3 } }));
    const split = strategy(plan, 'split_staff_led_and_cvc');
    expect(split.rationale.join(' ')).toMatch(/adults count toward/i);
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
  it('generates one CVC request for an oversized group', () => {
    const plan = buildPlan(trip({ groupSize: { students: 30, teachers: 2, chaperones: 4 } }));
    expect(plan.requests.map((r) => r.id)).toEqual(['cvc_tour']);
    expect(plan.requests[0].guests).toBe(36);
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
