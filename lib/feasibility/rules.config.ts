/**
 * ============================================================================
 *  THE RULES
 * ============================================================================
 *
 * This is the single place where CapitolPass encodes how Capitol field trips
 * actually work. Everything the feasibility engine decides traces back to a
 * numbered rule in this file, and every rule carries the source it came from
 * and the date that source was last checked.
 *
 * Why the rules live in one annotated config instead of inside the UI:
 *
 *   1. These numbers change. Congressional offices revise tour policy, the CVC
 *      revises reservation windows. When that happens the fix should be one
 *      line here, not a hunt through components.
 *   2. A reader should be able to audit our claims. If we say a staff-led tour
 *      caps at 15 people, you should be able to see where we got that and when
 *      we last confirmed it.
 *   3. Everything downstream is a pure function of this object, which makes the
 *      whole engine testable without a database or a network.
 *
 * ----------------------------------------------------------------------------
 * HONESTY NOTE — please read before relying on this in production.
 * ----------------------------------------------------------------------------
 * The values below are transcribed from published guidance and from the
 * research that went into this project. They are *not* scraped live from an
 * official API, because no such API exists. `lastVerified` tells you how stale
 * a rule may be, and `confidence` tells you how firm the underlying source is:
 *
 *   'published'  — stated plainly in official public guidance.
 *   'documented' — consistently documented across many congressional offices,
 *                  but not centrally published as one authoritative rule.
 *   'heuristic'  — our own planning judgment, not an official limit.
 *
 * Anything marked 'heuristic' is advice, not policy. The UI labels these
 * differently on purpose: we never want a teacher to believe we are quoting a
 * rule when we are actually offering an opinion.
 */

export type RuleConfidence = 'published' | 'documented' | 'heuristic';

export interface RuleSource {
  /** Where this value came from, in words. */
  cite: string;
  /** URL a human can open to check, when one exists. */
  url?: string;
  /** ISO date this was last checked against the source. */
  lastVerified: string;
  confidence: RuleConfidence;
}

export interface Rule<T> {
  id: string;
  value: T;
  /** One sentence a teacher would understand, shown in the UI. */
  explain: string;
  source: RuleSource;
}

function rule<T>(id: string, value: T, explain: string, source: RuleSource): Rule<T> {
  return { id, value, explain, source };
}

/** The date this ruleset was assembled. Surfaced in the UI footer. */
export const RULESET_VERSION = '2026-08-08';

export const RULES = {
  // --------------------------------------------------------------------------
  // Group size
  // --------------------------------------------------------------------------

  /**
   * RULE R1 — the single most consequential number in this app.
   *
   * A tour led by a congressional office's own staff is capped at 15 guests.
   * This is why a class of 30 cannot go as one staff-led group, and it is the
   * fact most teachers discover only after they have already asked their
   * Representative's office and been told no.
   */
  staffLedMaxGuests: rule(
    'R1',
    15,
    'A tour led by your Representative’s or Senator’s staff can take at most 15 people, counting students, teachers and chaperones together.',
    {
      cite: 'Congressional office tour guidance, consistently published across House and Senate office websites',
      lastVerified: '2026-08-08',
      confidence: 'documented',
    },
  ),

  /**
   * RULE R2 — the constraint that makes the office queue worth building.
   *
   * Each congressional office may reserve only one school tour per week. Two
   * schools in the same district competing for the same week is a real and
   * invisible conflict; the office-side capacity tracker exists to surface it.
   */
  officeSchoolToursPerWeek: rule(
    'R2',
    1,
    'Each congressional office can reserve only one school tour per week, so the week you pick matters as much as the day.',
    {
      cite: 'Congressional office scheduling practice, as described in office tour request guidance',
      lastVerified: '2026-08-08',
      confidence: 'documented',
    },
  ),

  /**
   * RULE R3 — the Capitol Visitor Center's own group path.
   *
   * The CVC's Advance Reservation System treats 10 or more visitors as a group,
   * which is the path a full class actually has to use.
   */
  cvcGroupMinimum: rule(
    'R3',
    10,
    'The Capitol Visitor Center treats 10 or more visitors as a group, with its own reservation process.',
    {
      cite: 'Capitol Visitor Center, Advance Reservation System group guidance',
      url: 'https://www.visitthecapitol.gov/',
      lastVerified: '2026-08-08',
      confidence: 'published',
    },
  ),

  /**
   * RULE R4 — practical ceiling for one CVC group slot.
   *
   * Very large groups get split across staggered entry times. We use this to
   * tell a 90-student trip that it is going to be several slots, not one.
   */
  cvcGuestsPerSlot: rule(
    'R4',
    45,
    'Very large groups are split across staggered entry times rather than entering all at once.',
    {
      cite: 'CapitolPass planning heuristic based on typical CVC group slot sizing',
      lastVerified: '2026-08-08',
      confidence: 'heuristic',
    },
  ),

  // --------------------------------------------------------------------------
  // Lead time
  // --------------------------------------------------------------------------

  /**
   * RULE R5–R7 — how far ahead each request has to go out.
   *
   * These are thresholds, not deadlines: below `comfortable` we warn, below
   * `minimum` we tell the teacher plainly that the date is unlikely and push
   * them to their alternates.
   */
  cvcLeadTimeDays: rule(
    'R5',
    { comfortable: 90, adequate: 30, minimum: 14 },
    'Capitol Visitor Center group reservations should go in about three months ahead; under two weeks, availability is unlikely.',
    {
      cite: 'CVC advance reservation guidance, plus observed availability for school groups',
      lastVerified: '2026-08-08',
      confidence: 'documented',
    },
  ),

  officeTourLeadTimeDays: rule(
    'R6',
    { comfortable: 90, adequate: 42, minimum: 21 },
    'Congressional offices generally ask for tour requests at least four to six weeks ahead, and popular weeks fill months out.',
    {
      cite: 'Tour request lead times published by House and Senate offices',
      lastVerified: '2026-08-08',
      confidence: 'documented',
    },
  ),

  /**
   * RULE R7 — meetings run on a different clock than tours.
   *
   * A meeting with the Member is booked by the office scheduler, not the tour
   * coordinator, and it is confirmed far later because it depends on the floor
   * schedule. Bundling the two requests is the most common teacher mistake.
   */
  repMeetingLeadTimeDays: rule(
    'R7',
    { comfortable: 60, adequate: 30, minimum: 14 },
    'A meeting with your Member is scheduled separately by the office scheduler and is usually confirmed much closer to the date, because it depends on the House or Senate floor schedule.',
    {
      cite: 'Congressional scheduling practice; meeting requests are handled by the scheduler, separately from tours',
      lastVerified: '2026-08-08',
      confidence: 'documented',
    },
  ),

  // --------------------------------------------------------------------------
  // On the day
  // --------------------------------------------------------------------------

  /**
   * RULE R8 — days the Capitol is not open to tours.
   *
   * Tours run Monday through Saturday; the building is closed to tours on
   * Sundays and on federal holidays (see ./holidays.ts, which computes these
   * from 5 U.S.C. 6103 rather than hardcoding a list).
   */
  tourDays: rule(
    'R8',
    { closedWeekdays: [0], closedOnFederalHolidays: true },
    'Capitol tours run Monday through Saturday. The building is closed to tours on Sundays and federal holidays.',
    {
      cite: 'Capitol Visitor Center hours of operation',
      url: 'https://www.visitthecapitol.gov/',
      lastVerified: '2026-08-08',
      confidence: 'published',
    },
  ),

  /**
   * RULE R9 — screening time.
   *
   * Every visitor passes through security screening. Groups that arrive at
   * their tour time rather than ahead of it lose their slot.
   */
  securityScreeningBufferMinutes: rule(
    'R9',
    45,
    'Plan to arrive at least 45 minutes before your tour time. Every visitor goes through security screening, and a large group takes longer.',
    {
      cite: 'CapitolPass planning heuristic based on CVC screening guidance for groups',
      lastVerified: '2026-08-08',
      confidence: 'heuristic',
    },
  ),

  /**
   * RULE R10 — the bag problem.
   *
   * There is no bag storage at the Capitol. This is not a minor inconvenience:
   * a group that arrives with 30 backpacks has a genuine crisis at the door,
   * and there is no on-site solution to offer them.
   */
  bagStorage: rule(
    'R10',
    { available: false },
    'There is no bag storage at the Capitol. Anything your group cannot carry through screening has to stay on the bus or at the hotel.',
    {
      cite: 'Capitol Visitor Center prohibited items and storage guidance',
      url: 'https://www.visitthecapitol.gov/',
      lastVerified: '2026-08-08',
      confidence: 'published',
    },
  ),

  /**
   * RULE R11 — food and drink.
   */
  foodAndDrink: rule(
    'R11',
    { allowedInside: false },
    'No food or drink is allowed inside the Capitol, including water bottles. Plan to eat before you enter or after you exit.',
    {
      cite: 'Capitol Visitor Center prohibited items guidance',
      url: 'https://www.visitthecapitol.gov/',
      lastVerified: '2026-08-08',
      confidence: 'published',
    },
  ),

  /**
   * RULE R12 — parking.
   *
   * The CVC directs visitors to public transit. Charter bus drop-off is
   * possible but parking is not, which changes the whole shape of the day.
   */
  parking: rule(
    'R12',
    { publicParkingAtCapitol: false },
    'There is no visitor parking at the Capitol and street parking nearby is extremely limited. The Visitor Center directs groups to public transit; buses can drop off but cannot wait.',
    {
      cite: 'Capitol Visitor Center visitor transportation guidance',
      url: 'https://www.visitthecapitol.gov/',
      lastVerified: '2026-08-08',
      confidence: 'published',
    },
  ),

  // --------------------------------------------------------------------------
  // Chaperones and paperwork — school-side, not Capitol-side
  // --------------------------------------------------------------------------

  /**
   * RULE R13 — chaperone ratios.
   *
   * These are our recommendations, not a Capitol requirement. Districts set
   * their own ratios and the teacher's district policy always wins. We label
   * this clearly in the UI so nobody mistakes our suggestion for a rule.
   */
  chaperoneRatios: rule(
    'R13',
    { elementary: 6, middle: 10, high: 12, mixed: 8 },
    'Recommended students per adult. Your district’s own policy takes precedence — check it before you plan around this.',
    {
      cite: 'Common school field trip supervision ratios; not a Capitol or CVC requirement',
      lastVerified: '2026-08-08',
      confidence: 'heuristic',
    },
  ),

  /** RULE R14 — paperwork milestones, counted backwards from the trip date. */
  paperworkLeadDays: rule(
    'R14',
    {
      permissionSlipsOut: 45,
      permissionSlipsDue: 21,
      headcountLock: 14,
      finalRosterToOffice: 7,
      chaperoneBriefing: 5,
    },
    'Suggested schedule for the school-side paperwork, counted backwards from your trip date.',
    {
      cite: 'CapitolPass planning heuristic',
      lastVerified: '2026-08-08',
      confidence: 'heuristic',
    },
  ),
} as const;

export type RuleSet = typeof RULES;

/** Every rule, flattened — powers the "how we decided this" page. */
export function allRules(): Array<Rule<unknown>> {
  return Object.values(RULES) as Array<Rule<unknown>>;
}

export function ruleById(id: string): Rule<unknown> | undefined {
  return allRules().find((r) => r.id === id);
}
