import type { IsoDate } from '../dates';

export type GradeBand = 'elementary' | 'middle' | 'high' | 'mixed';

export type ArrivalMethod = 'charter_bus' | 'amtrak' | 'flying' | 'local';

export type AccessibilityNeed =
  | 'wheelchair'
  | 'mobility_limited'
  | 'deaf_hoh'
  | 'blind_low_vision'
  | 'sensory_sensitive'
  | 'other';

/** Where a request has to go. Each maps to a different real-world front door. */
export type DestinationType =
  | 'cvc_group_reservation'
  | 'house_office_tour'
  | 'senate_office_tour'
  | 'rep_meeting';

export type Severity = 'blocker' | 'high' | 'medium' | 'info';

export interface GroupSize {
  students: number;
  teachers: number;
  chaperones: number;
}

export interface TripInput {
  preferredDate: IsoDate;
  /** Up to two fallbacks. Order matters — first is preferred. */
  alternateDates: IsoDate[];
  /**
   * The date the plan is being computed on. Injected rather than read from the
   * clock so that every result in this module is deterministic and testable.
   */
  requestedOn: IsoDate;
  groupSize: GroupSize;
  gradeBand: GradeBand;
  arrivalMethod: ArrivalMethod;
  accessibilityNeeds: AccessibilityNeed[];
  wants: { tour: boolean; repMeeting: boolean };
}

/** A thing the teacher needs to know, tied back to the rule that produced it. */
export interface Finding {
  code: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Rule id from rules.config.ts, e.g. "R1". Absent for derived observations. */
  ruleId?: string;
}

export type LeadTimeBand = 'comfortable' | 'adequate' | 'tight' | 'unlikely' | 'past';

export interface DateAssessment {
  date: IsoDate;
  label: 'preferred' | 'alternate';
  /** False when the Capitol is closed that day — no amount of lead time helps. */
  open: boolean;
  closedReason?: string;
  daysOut: number;
  /** Worst band across all the requests this trip needs. */
  leadTime: LeadTimeBand;
  isoWeek: string;
  viable: boolean;
  notes: string[];
}

export interface TourStrategy {
  id: 'office_staff_led' | 'cvc_group' | 'split_staff_led_and_cvc';
  title: string;
  summary: string;
  viable: boolean;
  recommended: boolean;
  /** How many of the group this strategy actually seats. */
  guestsCovered: number;
  destinations: DestinationType[];
  /** Plain-language reasoning, shown in the UI as bullets. */
  rationale: string[];
  ruleIds: string[];
}

export interface PlannedRequest {
  id: string;
  destination: DestinationType;
  title: string;
  /** Why this is a separate request rather than part of another one. */
  why: string;
  /** Send this by this date to stay inside the comfortable window. */
  sendBy: IsoDate;
  leadTime: LeadTimeBand;
  guests: number;
  ruleIds: string[];
}

export interface Milestone {
  id: string;
  label: string;
  detail: string;
  dueDate: IsoDate;
  owner: 'teacher' | 'office' | 'cvc' | 'school';
  status: 'overdue' | 'due_soon' | 'upcoming';
  ruleIds: string[];
}

export interface ChaperoneAssessment {
  band: GradeBand;
  recommendedRatio: number;
  adultsPresent: number;
  adultsRecommended: number;
  shortfall: number;
  meetsRecommendation: boolean;
}

export interface FeasibilityPlan {
  totalGuests: number;
  chaperones: ChaperoneAssessment;
  dates: DateAssessment[];
  /** The best viable date we found, or null if none of the three work. */
  recommendedDate: IsoDate | null;
  strategies: TourStrategy[];
  requests: PlannedRequest[];
  criticalPath: Milestone[];
  findings: Finding[];
  /** Version of the ruleset this plan was computed against. */
  rulesetVersion: string;
}
