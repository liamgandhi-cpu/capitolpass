/**
 * Demo-mode surfaces: the front door on the landing page, and the standing
 * banner that keeps a visitor oriented once they are inside.
 *
 * Both render nothing at all when demo mode is off, so this file is inert on a
 * deployment serving real schools.
 */

import Link from 'next/link';
import { DEMO_PERSONAS, demoEnabled, type DemoPersona } from '@/lib/auth/demo';

/**
 * Three doors on the landing page.
 *
 * Ordered deliberately: the 34-person trip first, because the engine saying
 * "this cannot work, here is what can" is the thing worth seeing first, and the
 * office queue last, because it only makes sense once you have seen a request
 * being made.
 */
export function DemoEntry() {
  if (!demoEnabled()) return null;

  return (
    <section
      aria-labelledby="demo-entry-title"
      className="border-4 border-ink-900 bg-white p-6 sm:p-8"
    >
      <p className="text-sm font-bold uppercase tracking-wider text-accent-600">
        No sign-up, no email
      </p>
      <h2 id="demo-entry-title" className="mt-1 text-2xl font-bold">
        Open it as someone who would actually use it
      </h2>
      <p className="mt-2 max-w-2xl text-slate-600">
        Three seeded accounts on real federal data — a real school in VA-10, its
        real Representative, resolved live through the Census Geocoder. One click
        puts you inside a populated trip.
      </p>

      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {DEMO_PERSONAS.map((p) => (
          <li key={p.key} className="flex flex-col border border-slate-200 p-5">
            <h3 className="text-lg font-bold">{p.name}</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">{p.role}</p>
            <p className="mt-3 grow text-sm text-slate-600">{p.blurb}</p>
            <Link
              href={`/demo/${p.key}`}
              prefetch={false}
              className="mt-5 inline-flex items-center justify-center border-2 border-ink-900 bg-ink-900 px-4 py-2.5 text-base font-bold text-paper-50 no-underline hover:bg-ink-950"
            >
              Open as {p.name.split(' ')[0]}
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-sm text-slate-500">
        Demo accounts hold fabricated trip data. Nothing here reaches a real
        congressional office — see{' '}
        <Link href="/rules" className="font-bold">
          the rules
        </Link>{' '}
        for what the app does and does not send.
      </p>
    </section>
  );
}

/**
 * The standing banner.
 *
 * Two jobs. It stops a visitor wondering whose data they are looking at, and it
 * carries the one-line "look at this first" pointer, because the interesting
 * thing on each screen is not always the biggest thing on it.
 *
 * Rendered from the session rather than from a query parameter, so it survives
 * navigation and cannot be spoofed onto a real account.
 */
export function DemoBanner({ persona }: { persona: DemoPersona }) {
  const others = DEMO_PERSONAS.filter((p) => p.key !== persona.key);

  return (
    <div className="border-b-2 border-accent-600 bg-accent-100">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="border border-accent-700 bg-white px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-accent-700">
            Demo
          </span>
          <p className="text-sm font-bold text-ink-950">
            You are signed in as {persona.name} — {persona.role}
          </p>
        </div>

        <p className="mt-1 text-sm text-ink-900">{persona.lookFor}</p>

        <p className="mt-1.5 text-sm text-slate-600">
          Switch to{' '}
          {others.map((p, i) => (
            <span key={p.key}>
              {i > 0 ? ' or ' : ''}
              <Link href={`/demo/${p.key}`} prefetch={false} className="font-bold">
                {p.name}
              </Link>
            </span>
          ))}
          .
        </p>
      </div>
    </div>
  );
}
