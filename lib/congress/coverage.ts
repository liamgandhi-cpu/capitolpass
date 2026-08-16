/**
 * The national picture of congressional tour-request routing.
 *
 * This exists because the most important finding in the project is invisible
 * everywhere else in the app. A teacher planning one trip sees one office and
 * one link, so they never see the thing that makes the link worth having: that
 * there is no standard, that the 498 offices with a confirmed tour page put it
 * at 92 different paths, and that no amount of guessing would have found them.
 *
 * Pure, like the feasibility engine — it reads the pinned snapshots and returns
 * a summary. No clock, no network, no database, so it can be tested.
 */

import { allMembers, type Member } from './legislators';
import { resolveTourRoute, verifiedLinkText, type RouteConfidence } from './routing';

export interface OfficeCoverage {
  bioguideId: string;
  name: string;
  state: string;
  /** House only. 0 = at-large, Delegate or Resident Commissioner. */
  district: number | null;
  chamber: 'house' | 'senate';
  confidence: RouteConfidence;
  url: string | null;
  /** The office's own wording for the link, when we read it off their menu. */
  linkText?: string;
  /** Normalised path, e.g. /services/tours-and-tickets. Verified routes only. */
  path: string | null;
}

export interface StateCoverage {
  state: string;
  offices: OfficeCoverage[];
  verified: number;
  total: number;
}

export interface PathPattern {
  path: string;
  count: number;
  /** One office using it, so the pattern is checkable rather than asserted. */
  example: string;
}

export interface CoverageSummary {
  total: number;
  byConfidence: Record<RouteConfidence, number>;
  /** Verified offices as a percentage, one decimal place. */
  verifiedPercent: number;
  /** Distinct normalised paths across every verified URL. */
  distinctPaths: number;
  paths: PathPattern[];
  /** How each office's own menu labels the link, most common first. */
  wordings: Array<{ text: string; count: number }>;
  states: StateCoverage[];
}

/**
 * Two URLs that differ only by a trailing slash are the same path.
 *
 * Worth doing explicitly: without it `/forms/tourrequest` and
 * `/forms/tourrequest/` count as two patterns, which inflates the headline
 * number by about 16 and makes the finding less true rather than more
 * impressive.
 */
export function normalisePath(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const trimmed = pathname.replace(/\/+$/, '');
    return trimmed.length === 0 ? '/' : trimmed.toLowerCase();
  } catch {
    return null;
  }
}

function coverageFor(member: Member): OfficeCoverage {
  const route = resolveTourRoute(member);
  return {
    bioguideId: member.bioguideId,
    name: member.name,
    state: member.state,
    district: member.district,
    chamber: member.chamber,
    confidence: route.confidence,
    url: route.url,
    linkText: verifiedLinkText(member.bioguideId) ?? undefined,
    path: route.confidence === 'verified' && route.url ? normalisePath(route.url) : null,
  };
}

export function buildCoverage(members: Member[] = allMembers()): CoverageSummary {
  const offices = members.map(coverageFor);

  const byConfidence: Record<RouteConfidence, number> = {
    verified: 0,
    contact_form: 0,
    website: 0,
    unknown: 0,
  };
  for (const office of offices) byConfidence[office.confidence] += 1;

  // Path patterns, verified routes only — an unverified route has no confirmed
  // path to count.
  const pathCounts = new Map<string, { count: number; example: string }>();
  for (const office of offices) {
    if (!office.path) continue;
    const existing = pathCounts.get(office.path);
    if (existing) existing.count += 1;
    else pathCounts.set(office.path, { count: 1, example: office.name });
  }

  const paths: PathPattern[] = [...pathCounts.entries()]
    .map(([path, v]) => ({ path, count: v.count, example: v.example }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  // What each office calls the link in its own menu.
  const wordingCounts = new Map<string, number>();
  for (const office of offices) {
    const text = office.linkText?.trim();
    if (!text) continue;
    wordingCounts.set(text, (wordingCounts.get(text) ?? 0) + 1);
  }
  const wordings = [...wordingCounts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));

  // Grouped by state, House before Senate and by district within the House, so
  // the grid reads the way a delegation is usually listed.
  const stateMap = new Map<string, OfficeCoverage[]>();
  for (const office of offices) {
    const list = stateMap.get(office.state);
    if (list) list.push(office);
    else stateMap.set(office.state, [office]);
  }

  const states: StateCoverage[] = [...stateMap.entries()]
    .map(([state, list]) => {
      list.sort((a, b) => {
        if (a.chamber !== b.chamber) return a.chamber === 'house' ? -1 : 1;
        return (a.district ?? 0) - (b.district ?? 0) || a.name.localeCompare(b.name);
      });
      return {
        state,
        offices: list,
        verified: list.filter((o) => o.confidence === 'verified').length,
        total: list.length,
      };
    })
    .sort((a, b) => a.state.localeCompare(b.state));

  return {
    total: offices.length,
    byConfidence,
    verifiedPercent:
      offices.length === 0
        ? 0
        : Math.round((byConfidence.verified / offices.length) * 1000) / 10,
    distinctPaths: paths.length,
    paths,
    wordings,
    states,
  };
}

/** Human label for a confidence level, used in the legend and in cell titles. */
export const CONFIDENCE_LABEL: Record<RouteConfidence, string> = {
  verified: 'Verified tour page',
  contact_form: 'Contact form only',
  website: 'Homepage only',
  unknown: 'No web route — phone',
};

/**
 * What a teacher actually gets at each level. The point of publishing the map is
 * that nobody is stranded, so the legend has to say what the fallback is rather
 * than just grading the coverage.
 */
export const CONFIDENCE_MEANING: Record<RouteConfidence, string> = {
  verified: 'Their real tour page, confirmed by an HTTP 200 on a recorded date.',
  contact_form: 'Their official contact form, labelled as general rather than tour-specific.',
  website: 'Their homepage, plus where to look once there.',
  unknown: 'A phone number.',
};
