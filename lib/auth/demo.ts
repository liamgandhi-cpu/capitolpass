/**
 * Guided demo access.
 *
 * The problem this solves: the app is only meaningful when there is a trip in
 * it, and getting a trip in it means signing up, waiting for a link, and filling
 * in an intake form. Anyone evaluating the project — a judge, a teacher deciding
 * whether this is worth their time, a staffer sent a link by a constituent —
 * gives up long before that.
 *
 * So there is a front door: three named personas, each backed by a seeded
 * account, each one click away from a fully populated view.
 *
 * SAFETY. This is an endpoint that hands out a session without proving anything,
 * which is exactly the shape of a serious auth hole. Three things keep it
 * closed:
 *
 *   1. The persona list below is a hardcoded allowlist. The route takes a
 *      persona *key*, never an email, so there is no input that can be bent
 *      into "sign me in as someone else".
 *   2. Every account it can reach is created by `npm run db:seed`, has a
 *      demo.* local part, and holds nothing but fabricated demo data.
 *   3. It is off unless CAPITOLPASS_DEMO=1 is set. A deployment that forgets to
 *      set it gets a 404, not an open door. See `demoEnabled()`.
 *
 * If real schools ever use a hosted instance, the flag comes off that instance
 * and the demo moves to a separate deployment with its own database.
 */

export interface DemoPersona {
  /** URL-safe key. The only thing the route accepts. */
  key: string;
  /** Seeded account this signs in as. Must match scripts/seed.ts. */
  email: string;
  /** Where to land, chosen so the first screen is the interesting one. */
  destination: string;
  name: string;
  role: string;
  /** What this persona is for — rendered on the landing page. */
  blurb: string;
  /** The one thing to look at first. Rendered as a hint after sign-in. */
  lookFor: string;
}

export const DEMO_PERSONAS: readonly DemoPersona[] = [
  {
    key: 'teacher',
    email: 'demo.teacher@pwcs.edu',
    destination: '/teacher',
    name: 'Dana Whitfield',
    role: 'Teacher · 12th grade government · Osbourn Park High, VA-10',
    blurb:
      'A class of 34 — too big for a staff-led tour. The plan tells her to ask her office for a guided school tour instead, which takes everyone.',
    lookFor:
      'Open the trip. The first thing the plan does is tell you the tour you were about to ask for cannot take your group, and what to ask for instead.',
  },
  {
    key: 'teacher-small',
    email: 'demo.teacher2@pwcs.edu',
    destination: '/teacher',
    name: 'Marcus Reyes',
    role: 'Teacher · small group · Osbourn Park High, VA-10',
    blurb:
      'A group of 14, which fits a staff-led tour. Sent in-app to the sample office queue.',
    lookFor:
      'Compare this plan against the 34-person one. Same engine, one input different, completely different route.',
  },
  {
    key: 'staffer',
    email: 'demo.staffer@mail.house.gov',
    destination: '/office',
    name: 'Alex Chen',
    role: 'Congressional staff · demo office',
    blurb:
      'The other side: a queue of requests with the constituent check already done, and a weekly tracker. All sample data.',
    lookFor:
      'The weekly tracker, and the availability an office can publish so schools see it before they pick a date.',
  },
] as const;

export function findPersona(key: string | null | undefined): DemoPersona | null {
  if (!key) return null;
  return DEMO_PERSONAS.find((p) => p.key === key) ?? null;
}

/**
 * The persona behind a signed-in session, if any.
 *
 * Drives the demo banner. Resolving from the session's own email rather than
 * from a query parameter means the banner cannot be pinned onto a real account
 * by editing the URL, and that it survives navigation without being threaded
 * through every page.
 */
export function personaForEmail(email: string | null | undefined): DemoPersona | null {
  if (!email || !demoEnabled()) return null;
  const normalised = email.trim().toLowerCase();
  return DEMO_PERSONAS.find((p) => p.email === normalised) ?? null;
}

/**
 * Demo mode is opt-in and explicit.
 *
 * Deliberately not keyed off NODE_ENV: the whole point is that this works on a
 * hosted production build, and inferring it from the environment would mean
 * either breaking the deployment or opening the door on every deployment.
 */
export function demoEnabled(): boolean {
  return process.env.CAPITOLPASS_DEMO === '1';
}
