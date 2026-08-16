import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, InsetText, Card } from '@/components/ui';
import {
  buildCoverage,
  CONFIDENCE_LABEL,
  CONFIDENCE_MEANING,
  type OfficeCoverage,
} from '@/lib/congress/coverage';
import { blockedOffices, routesGeneratedAt, type RouteConfidence } from '@/lib/congress/routing';

export const metadata: Metadata = {
  title: 'The 535 front doors',
  description:
    'Every congressional office runs its own tour request page. This is all 537 of them, measured: which have a confirmed tour page, and the 92 different paths they put it at.',
};

/**
 * Solid fills rather than the tinted status pills used elsewhere.
 *
 * At this density — 537 cells — a tint and a border read as one grey mass. The
 * ramp is deliberately ordered worst-to-best in luminance so the pattern is
 * still legible in greyscale, and every cell carries its own text label for
 * screen readers. Colour never carries the meaning alone: the legend below
 * states every count in words.
 */
const CELL_FILL: Record<RouteConfidence, string> = {
  verified: 'bg-ok-700',
  contact_form: 'bg-warn-700',
  website: 'bg-slate-400',
  unknown: 'bg-stop-700',
};

const LEGEND_ORDER: RouteConfidence[] = ['verified', 'contact_form', 'website', 'unknown'];

function officeLabel(office: OfficeCoverage): string {
  const seat =
    office.chamber === 'senate'
      ? `Senator, ${office.state}`
      : office.district === 0
        ? `${office.state} at-large`
        : `${office.state}-${office.district}`;
  return `${office.name} (${seat}) — ${CONFIDENCE_LABEL[office.confidence]}`;
}

function OfficeCell({ office }: { office: OfficeCoverage }) {
  const label = officeLabel(office);
  const cell = (
    <span
      className={`block h-3.5 w-3.5 ${CELL_FILL[office.confidence]}`}
      title={label}
      aria-hidden="true"
    />
  );

  // A verified route is a real link worth being able to follow — the claim is
  // "we checked this", and a reader should be able to check it too.
  if (office.url) {
    return (
      <a
        href={office.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block border-0 focus:outline-offset-2"
      >
        {cell}
        <span className="sr-only">{label} (opens in a new tab)</span>
      </a>
    );
  }

  return (
    <span className="block">
      {cell}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default function FrontDoorsPage() {
  const coverage = buildCoverage();
  const blocked = blockedOffices();
  const generatedAt = routesGeneratedAt();
  const topPath = coverage.paths[0];
  const longTail = coverage.paths.filter((p) => p.count === 1).length;

  return (
    <div className="space-y-14">
      <PageHeader
        eyebrow="Measured, not assumed"
        title={`${coverage.total} offices. ${coverage.distinctPaths} different front doors.`}
        lede={
          <>
            Every House and Senate office runs its own tour request page, on its own website, at
            its own URL. There is no directory of them. This is what it looks like when you go and
            check all {coverage.total}.
          </>
        }
      />

      {/* --------------------------------------------------------------- */}
      <section aria-labelledby="numbers-title">
        <h2 id="numbers-title" className="sr-only">
          The headline numbers
        </h2>
        <dl className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-4">
          {[
            {
              term: 'Offices checked',
              value: coverage.total.toString(),
              note: 'Every current member of the House and Senate',
            },
            {
              term: 'Confirmed tour page',
              value: coverage.byConfidence.verified.toString(),
              note: `${coverage.verifiedPercent}% — each one an HTTP 200 on a recorded date`,
            },
            {
              term: 'Distinct URL paths',
              value: coverage.distinctPaths.toString(),
              note: 'Across those confirmed pages. There is no standard',
            },
            {
              term: 'Used by exactly one office',
              value: longTail.toString(),
              note: 'The long tail no candidate list would have caught',
            },
          ].map((stat) => (
            <div key={stat.term} className="bg-white p-5">
              <dt className="text-sm font-bold uppercase tracking-wide text-slate-500">
                {stat.term}
              </dt>
              <dd className="mt-1 text-4xl font-bold text-ink-950">{stat.value}</dd>
              <dd className="mt-1 text-sm text-slate-600">{stat.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* --------------------------------------------------------------- */}
      <section aria-labelledby="map-title">
        <h2 id="map-title" className="text-2xl font-bold">
          Every office, by state
        </h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          One cell per office, grouped by state and ordered the way a delegation is usually listed
          — House by district, then Senators. Where we confirmed a tour page, the cell links to it.
        </p>

        <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
          {LEGEND_ORDER.map((confidence) => (
            <li key={confidence} className="flex items-center gap-2">
              <span className={`block h-3.5 w-3.5 ${CELL_FILL[confidence]}`} aria-hidden="true" />
              <span className="text-sm">
                <strong>{coverage.byConfidence[confidence]}</strong>{' '}
                {CONFIDENCE_LABEL[confidence].toLowerCase()}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-4">
          {coverage.states.map((state) => (
            <div key={state.state}>
              <p className="mb-1 font-mono text-xs font-bold text-slate-500">
                {state.state}
                <span className="sr-only">
                  {' '}
                  — {state.verified} of {state.total} offices with a confirmed tour page
                </span>
              </p>
              <ul className="flex w-[4.6rem] flex-wrap gap-0.5">
                {state.offices.map((office) => (
                  <li key={office.bioguideId}>
                    <OfficeCell office={office} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {LEGEND_ORDER.map((confidence) => (
            <div key={confidence} className="border-l-[6px] border-l-slate-300 py-1 pl-4">
              <p className="font-bold">
                {CONFIDENCE_LABEL[confidence]} — {coverage.byConfidence[confidence]}
              </p>
              <p className="mt-1 text-sm text-slate-600">{CONFIDENCE_MEANING[confidence]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      <section aria-labelledby="paths-title">
        <h2 id="paths-title" className="text-2xl font-bold">
          Where they put it
        </h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          {topPath ? (
            <>
              <code className="font-mono text-sm">{topPath.path}</code> covers {topPath.count} of
              the {coverage.byConfidence.verified} confirmed pages. The other{' '}
              {coverage.byConfidence.verified - topPath.count} are spread across{' '}
              {coverage.distinctPaths - 1} more paths, {longTail} of which belong to a single
              office.
            </>
          ) : null}
        </p>

        <InsetText>
          <p className="text-slate-600">
            This is the whole argument for not guessing. A 404 costs a teacher more than a homepage
            does, because they assume they did something wrong and start over.{' '}
            <Link href="/rules" className="font-bold">
              Every route we hand out states its confidence
            </Link>
            .
          </p>
        </InsetText>

        <ol className="mt-6 space-y-2">
          {coverage.paths.slice(0, 20).map((pattern) => {
            const width = topPath ? Math.max((pattern.count / topPath.count) * 100, 1.5) : 0;
            return (
              <li key={pattern.path} className="grid items-center gap-2 sm:grid-cols-[1fr_3rem_2fr]">
                <code className="truncate font-mono text-sm text-ink-900" title={pattern.path}>
                  {pattern.path}
                </code>
                <span className="text-right text-sm font-bold tabular-nums">{pattern.count}</span>
                <span className="hidden sm:block" aria-hidden="true">
                  <span className="block h-4 bg-ink-800" style={{ width: `${width}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm text-slate-500">
          Top 20 of {coverage.distinctPaths}. Counts are offices, not pages.
        </p>
      </section>

      {/* --------------------------------------------------------------- */}
      <section aria-labelledby="wording-title">
        <h2 id="wording-title" className="text-2xl font-bold">
          And what they call it
        </h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          Discovery reads each office&rsquo;s own navigation, so we get their own wording for the
          link. The app shows a teacher this phrase, because someone hunting for the words actually
          printed on the page finds it faster than someone hunting for ours.
        </p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {coverage.wordings.slice(0, 14).map((wording) => (
            <li
              key={wording.text}
              className="border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              &ldquo;{wording.text}&rdquo;{' '}
              <strong className="tabular-nums text-slate-500">{wording.count}</strong>
            </li>
          ))}
        </ul>
      </section>

      {/* --------------------------------------------------------------- */}
      <section aria-labelledby="method-title" className="border-t border-slate-200 pt-10">
        <h2 id="method-title" className="text-2xl font-bold">
          How this was measured
        </h2>

        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <Card>
            <h3 className="text-lg font-bold">Reading menus, not guessing paths</h3>
            <p className="mt-2 text-slate-600">
              The first version of the discovery script probed a list of candidate paths. It topped
              out at 89 offices, because it could only ever find paths someone had already thought
              of. The current one fetches each office&rsquo;s homepage and reads its navigation, the
              way a person would — and costs about two requests per office instead of ten.
            </p>
            <p className="mt-3 text-slate-600">
              <strong>485</strong> of the {coverage.byConfidence.verified} confirmed pages came from
              a site menu. Only <strong>13</strong> came from path probing.
            </p>
          </Card>

          <Card>
            <h3 className="text-lg font-bold">A rate limit is not a missing page</h3>
            <p className="mt-2 text-slate-600">
              An early sweep started drawing HTTP 403s from house.gov hosts, including on URLs that
              had returned 200 minutes earlier — a web application firewall doing its job. Recording
              those as &ldquo;no tour page&rdquo; would have quietly manufactured false negatives
              across the dataset.
            </p>
            <p className="mt-3 text-slate-600">
              They are recorded as <strong>blocked</strong> and retried separately.{' '}
              {blocked.length > 0 ? (
                <>
                  <strong>{blocked.length}</strong> offices remain persistently blocked and fall
                  back to their contact form, which is what the chain is for.
                </>
              ) : null}
            </p>
          </Card>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          {generatedAt ? (
            <>
              Verified set last rebuilt {new Date(generatedAt).toISOString().slice(0, 10)}. Offices
              change their websites, so these decay — every route in the app carries the date it was
              confirmed rather than presenting itself as current.{' '}
            </>
          ) : null}
          Rebuild with <code className="font-mono">npm run data:tour-routes -- --all</code>.
        </p>
      </section>
    </div>
  );
}
