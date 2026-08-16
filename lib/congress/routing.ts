/**
 * ============================================================================
 *  ROUTING — where a request actually has to go
 * ============================================================================
 *
 * The original plan for this app assumed the congress-legislators dataset gives
 * you a `contact_form` URL for every member, and that routing a teacher to the
 * right office form was therefore a solved problem.
 *
 * It is not. We checked:
 *
 *     537 current members
 *      88 have a `contact_form` URL   (16%)
 *     536 have an official website     (99.8%)
 *
 * So for roughly five out of six offices, the dataset does not tell you where
 * the form is. And a tour request does not go to the general contact form
 * anyway — it goes to a dedicated tour page, whose path is not standardised:
 *
 *     subramanyam.house.gov/services/tours-and-tickets   200
 *     subramanyam.house.gov/services/tours               404
 *     mcclellan.house.gov/services/tours                 200
 *
 * Guessing is worse than useless here. Sending a teacher to a 404 costs them
 * more time than sending them to the homepage, because they assume they did
 * something wrong. So this module never guesses. It resolves through a chain
 * and reports, honestly, how confident it is at each step:
 *
 *   1. `verified`     — a URL we actually requested and got a 200 from, stored
 *                       in data/tour-routes.json with the date we checked it.
 *                       Produced by `npm run data:tour-routes`.
 *   2. `contact_form` — the official contact form from the dataset. Real, but
 *                       it is a general contact form, not a tour form.
 *   3. `website`      — the member's official site, plus instructions on where
 *                       the tour page usually lives. Always works, needs a
 *                       click or two from the teacher.
 *   4. `unknown`      — we have nothing. We say so and offer the phone number.
 *
 * The UI renders the confidence level. A teacher should always be able to tell
 * the difference between "we checked this link" and "this is where it usually
 * is". That distinction is the whole difference between a useful router and a
 * confident-sounding guess.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Member } from './legislators';

export type RouteConfidence = 'verified' | 'contact_form' | 'website' | 'unknown';

export type RouteKind = 'tour_request' | 'meeting_request' | 'general_contact';

export interface OfficeRoute {
  kind: RouteKind;
  url: string | null;
  confidence: RouteConfidence;
  /** Short label for the link or the absence of one. */
  label: string;
  /** What the teacher should do once they get there. */
  instruction: string;
  /** ISO date we last confirmed a `verified` URL responded. */
  checkedAt?: string;
  /** Fallback contact details, always populated when we have them. */
  phone: string | null;
}

interface VerifiedRoute {
  url: string;
  status: number;
  checkedAt: string;
  /** Whether we found this in the office's own menu or by probing paths. */
  via?: 'homepage_link' | 'path_probe';
  /**
   * The office's own wording for the link, when we read it off their menu —
   * "Tours and Tickets", "Schedule a DC Tour". Worth surfacing: a teacher
   * looking for that exact phrase on the page will find it faster than one
   * looking for whatever we would have called it.
   */
  linkText?: string;
}

interface TourRouteFile {
  generatedAt: string;
  routes: Record<string, VerifiedRoute>;
  /** Offices a firewall refused. Not the same as having no tour page. */
  blocked?: string[];
}

let verifiedCache: TourRouteFile | null | undefined;

function verifiedRoutes(): TourRouteFile | null {
  if (verifiedCache !== undefined) return verifiedCache;
  try {
    const file = path.join(process.cwd(), 'data', 'tour-routes.json');
    verifiedCache = JSON.parse(readFileSync(file, 'utf8')) as TourRouteFile;
  } catch {
    // Entirely optional. Without it we fall back a step in the chain.
    verifiedCache = null;
  }
  return verifiedCache;
}

/**
 * Candidate paths where House and Senate offices put their tour page.
 *
 * Used only by the discovery script, which actually requests each one. They are
 * never turned into links without a 200 response behind them.
 */
export const TOUR_PATH_CANDIDATES = [
  '/services/tours-and-tickets',
  '/services/tours',
  '/services/capitol-tours',
  '/services/visiting-dc',
  '/services/visiting-washington-dc',
  '/tours',
  '/capitol-tours',
  '/visiting-dc',
  '/constituent-services/tours',
  '/services/tour-requests',
] as const;

export function resolveTourRoute(member: Member): OfficeRoute {
  const verified = verifiedRoutes()?.routes[member.bioguideId];

  if (verified) {
    return {
      kind: 'tour_request',
      url: verified.url,
      confidence: 'verified',
      label: verified.linkText
        ? `${member.lastName} — “${verified.linkText}”`
        : `${member.lastName} tour request page`,
      instruction: verified.linkText
        ? `This is the office’s own tour page — they call it “${verified.linkText}”. Fill it in with the details from your packet; we have them ready to copy in the order the form asks for them.`
        : 'This is the office’s own tour request form. Fill it in with the details from your packet — we have them ready to copy in the order the form asks for them.',
      checkedAt: verified.checkedAt,
      phone: member.phone,
    };
  }

  if (member.contactFormUrl) {
    return {
      kind: 'tour_request',
      url: member.contactFormUrl,
      confidence: 'contact_form',
      label: `${member.lastName} contact form`,
      instruction:
        'We have not confirmed a dedicated tour page for this office, so this is their general contact form. Choose a "Tours" or "Visiting Washington DC" topic if it offers one, then paste your packet.',
      phone: member.phone,
    };
  }

  if (member.websiteUrl) {
    return {
      kind: 'tour_request',
      url: member.websiteUrl,
      confidence: 'website',
      label: `${member.lastName} official website`,
      instruction:
        'We do not have a confirmed tour link for this office. On the site, look under "Services" for "Tours and Tickets" or "Visiting Washington, DC". If you cannot find it, call the office — the number is below and it is genuinely the fastest route.',
      phone: member.phone,
    };
  }

  return {
    kind: 'tour_request',
    url: null,
    confidence: 'unknown',
    label: 'No online form on file',
    instruction:
      'We do not have a website on file for this office. Call them directly and ask for the staff member who handles Capitol tours.',
    phone: member.phone,
  };
}

/**
 * Meetings go to the scheduler, and the scheduler is almost never reachable
 * through the tour form. We deliberately do not reuse the tour route here: the
 * whole point of separating these requests is that they go to different people.
 */
export function resolveMeetingRoute(member: Member): OfficeRoute {
  const url = member.contactFormUrl ?? member.websiteUrl;

  return {
    kind: 'meeting_request',
    url: url ?? null,
    confidence: member.contactFormUrl ? 'contact_form' : url ? 'website' : 'unknown',
    label: url ? `${member.lastName} office contact` : 'No online form on file',
    instruction:
      'Meeting requests are handled by the office scheduler, not the tour coordinator. Use the contact form if it offers a "Scheduling" or "Meeting Request" topic. Otherwise call the DC office and ask to be put through to the scheduler — that one phone call is worth more than any form.',
    phone: member.phone,
  };
}

/**
 * The Capitol Visitor Center's own reservation system.
 *
 * Unlike the 535 office front doors, this one is a single known destination,
 * which is exactly why it is the reliable path for a full class.
 */
export function cvcRoute(): OfficeRoute {
  return {
    kind: 'tour_request',
    url: 'https://www.visitthecapitol.gov/plan-visit/tours-and-reservations',
    confidence: 'verified',
    label: 'Capitol Visitor Center — tours and reservations',
    instruction:
      'Book through the Visitor Center’s Advance Reservation System. This is a separate system from your congressional office: booking here does not tell your Representative anything, and a confirmed office tour does not reserve you a slot here.',
    phone: '202-226-8000',
  };
}

/** Human-readable explanation of a confidence level, for the UI. */
export function explainConfidence(confidence: RouteConfidence): string {
  switch (confidence) {
    case 'verified':
      return 'We requested this link and it responded. Last checked on the date shown.';
    case 'contact_form':
      return 'Official contact form from the public congress-legislators dataset. It is the office’s real form, but not a tour-specific one.';
    case 'website':
      return 'We could not confirm a tour page for this office, so this is their official website. You will need a click or two to find the right form.';
    case 'unknown':
      return 'We have no confirmed online route for this office. Phone is the reliable option.';
  }
}
