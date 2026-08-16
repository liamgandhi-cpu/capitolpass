import { Card, InsetText, PageHeader, StatusPill, type StatusTone } from '@/components/ui';
import { RULESET_VERSION, allRules } from '@/lib/feasibility';
import type { RuleConfidence } from '@/lib/feasibility/rules.config';
import { formatShort } from '@/lib/dates';
import { snapshotFetchedAt } from '@/lib/congress/legislators';

export const metadata = {
  title: 'The rules',
  description:
    'Every rule CapitolPass encodes, with the source it came from and the date it was last checked.',
};

const CONFIDENCE_TONE: Record<RuleConfidence, StatusTone> = {
  published: 'ok',
  documented: 'info',
  heuristic: 'warn',
};

const CONFIDENCE_LABEL: Record<RuleConfidence, string> = {
  published: 'Published guidance',
  documented: 'Documented practice',
  heuristic: 'Our judgment',
};

const CONFIDENCE_MEANING: Record<RuleConfidence, string> = {
  published: 'Stated plainly in official public guidance.',
  documented:
    'Consistently documented across many congressional offices, but not centrally published as one authoritative rule.',
  heuristic: 'Our own planning judgment. This is advice, not policy — treat it as a suggestion.',
};

function formatValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('/') : String(v)}`)
      .join(' · ');
  }
  return String(value);
}

export default function RulesPage() {
  const rules = allRules();

  let legislatorsFetched: string | null = null;
  try {
    legislatorsFetched = snapshotFetchedAt();
  } catch {
    // Snapshot not downloaded yet.
  }

  const byConfidence = {
    published: rules.filter((r) => r.source.confidence === 'published').length,
    documented: rules.filter((r) => r.source.confidence === 'documented').length,
    heuristic: rules.filter((r) => r.source.confidence === 'heuristic').length,
  };

  return (
    <div className="space-y-10">
      <PageHeader
        title="The rules"
        lede="Every decision this app makes traces back to one of these. Each carries the source it came from, the date we last checked it, and how firm that source actually is."
      />

      <InsetText tone="warn">
        <p className="font-bold text-ink-950">Read this before relying on any number below.</p>
        <p className="mt-1 text-slate-600">
          These values are transcribed from published guidance and research. They are not scraped
          live from an official API, because no such API exists. Policies change. Before you plan
          around a number here, check the source linked next to it — and if you find one that has
          moved, the fix is a single line in{' '}
          <code className="font-mono text-sm">lib/feasibility/rules.config.ts</code>.
        </p>
      </InsetText>

      <section>
        <h2 className="text-xl font-bold">How confident we are</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {(['published', 'documented', 'heuristic'] as const).map((c) => (
            <Card key={c}>
              <div className="flex items-center justify-between">
                <StatusPill tone={CONFIDENCE_TONE[c]}>{CONFIDENCE_LABEL[c]}</StatusPill>
                <span className="text-2xl font-bold">{byConfidence[c]}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{CONFIDENCE_MEANING[c]}</p>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-500">
          Ruleset version {RULESET_VERSION}
          {legislatorsFetched
            ? ` · member data snapshotted ${formatShort(legislatorsFetched.slice(0, 10))}`
            : ''}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold">Every rule</h2>

        <div className="mt-5 space-y-5">
          {rules.map((rule) => (
            <Card key={rule.id} id={rule.id} as="article" className="scroll-mt-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-sm font-bold text-slate-600">
                    {rule.id}
                  </span>
                  <h3 className="text-lg font-bold">{formatValue(rule.value)}</h3>
                </div>
                <StatusPill tone={CONFIDENCE_TONE[rule.source.confidence]}>
                  {CONFIDENCE_LABEL[rule.source.confidence]}
                </StatusPill>
              </div>

              <p className="mt-3 text-lg text-slate-700">{rule.explain}</p>

              <dl className="mt-4 grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="font-bold text-slate-500">Source</dt>
                <dd className="text-slate-600">
                  {rule.source.cite}
                  {rule.source.url ? (
                    <>
                      {' '}
                      —{' '}
                      <a href={rule.source.url} target="_blank" rel="noopener noreferrer">
                        check it
                      </a>
                    </>
                  ) : null}
                </dd>

                <dt className="font-bold text-slate-500">Last verified</dt>
                <dd className="text-slate-600">{formatShort(rule.source.lastVerified)}</dd>
              </dl>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 pt-8">
        <h2 className="text-xl font-bold">Things we deliberately do not do</h2>
        <ul className="mt-4 space-y-3 text-slate-600">
          <li>
            <strong className="text-ink-950">We do not guess a district from a ZIP code.</strong> ZIP
            codes cross district lines routinely. A wrong guess sends a teacher&rsquo;s request to an
            office that will correctly ignore it. We resolve from the school&rsquo;s coordinates
            through the US Census Geocoder, or we ask.
          </li>
          <li>
            <strong className="text-ink-950">We do not invent tour page links.</strong> Office tour
            pages live at inconsistent paths — <code className="font-mono text-sm">/services/tours-and-tickets</code>{' '}
            for one office, <code className="font-mono text-sm">/services/tours</code> for another,
            neither for a third. We link to pages we have actually requested and got a response from,
            and we say plainly when we are falling back to a contact form or a homepage instead.
          </li>
          <li>
            <strong className="text-ink-950">We do not email congressional offices for you.</strong>{' '}
            Every request goes out through a channel a human chose.
          </li>
          <li>
            <strong className="text-ink-950">We do not show partnerships we do not have.</strong>{' '}
            The lunch directory is researched public information. Nobody has a partner tag, because
            nobody is a partner yet.
          </li>
          <li>
            <strong className="text-ink-950">We do not make up numbers we could not confirm.</strong>{' '}
            Where a venue&rsquo;s group capacity or price is not published, the field is empty and
            the app tells you to call, rather than showing a figure we guessed.
          </li>
        </ul>
      </section>
    </div>
  );
}
