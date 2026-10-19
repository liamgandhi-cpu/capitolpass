import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  Button,
  ButtonLink,
  Card,
  DescriptionList,
  Field,
  InsetText,
  PageHeader,
  Panel,
  RuleTag,
  StatusPill,
  TextInput,
  type StatusTone,
} from '@/components/ui';
import { currentUser, emailDomain } from '@/lib/auth';
import { buildPlan } from '@/lib/feasibility';
import type { Finding, Severity } from '@/lib/feasibility/types';
import { getTrip, requestsForTrip, storedPlan, toTripInput, questionsForTrip } from '@/lib/trips';
import { getSchool, domainTrust, lookupDomain } from '@/lib/schools';
import { delegationFor, representativeFor } from '@/lib/congress/legislators';
import { isDemoOffice, officeByBioguide } from '@/lib/offices';
import {
  hasPublishedAvailability,
  weekStatusFor,
  WEEK_STATUS_LABEL,
  WEEK_STATUS_MEANING,
  type WeekStatus,
} from '@/lib/offices/availability';
import { daysBetween, formatLong, formatShort, relativeDays, toIsoDate } from '@/lib/dates';
import { CriticalPathTimeline } from '@/components/timeline';
import { recomputePlanAction, requestCosignAction } from '../../actions';

const SEVERITY_TONE: Record<Severity, StatusTone> = {
  blocker: 'stop',
  high: 'warn',
  medium: 'warn',
  info: 'info',
};

const SEVERITY_PANEL: Record<Severity, 'ok' | 'warn' | 'stop' | 'info'> = {
  blocker: 'stop',
  high: 'warn',
  medium: 'warn',
  info: 'info',
};

/** Mirrors the office-side map; see the note there on why silence is neutral. */
const OFFICE_WEEK_TONE: Record<WeekStatus, StatusTone> = {
  open: 'ok',
  full: 'warn',
  closed: 'stop',
  unpublished: 'neutral',
};

const REQUEST_TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  sent: 'info',
  acknowledged: 'info',
  confirmed: 'ok',
  declined: 'stop',
  alternate_proposed: 'warn',
};

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <Panel title={finding.title} tone={SEVERITY_PANEL[finding.severity]}>
      <p>{finding.detail}</p>
      <p className="mt-2 flex items-center gap-2 text-sm">
        <StatusPill tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</StatusPill>
        {finding.ruleId ? <RuleTag id={finding.ruleId} /> : null}
      </p>
    </Panel>
  );
}

export default async function TripPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cosign?: string; cosign_token?: string; cosign_error?: string; sent?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/signin');

  const { id } = await params;
  const query = await searchParams;

  const trip = getTrip(id);
  if (!trip) notFound();
  if (trip.teacher_id !== user.id && user.role !== 'admin') notFound();

  const today = toIsoDate(new Date());
  // Prefer the stored plan so the page is stable, but fall back to computing
  // one if this trip predates plan storage.
  const plan = storedPlan(trip) ?? buildPlan(toTripInput(trip, today));
  const requests = requestsForTrip(trip.id);
  const school = trip.school_nces_id ? getSchool(trip.school_nces_id) : null;
  const questions = questionsForTrip(trip.id);

  const delegation =
    trip.district_state && trip.district_number !== null
      ? delegationFor(trip.district_state, trip.district_number)
      : null;

  const domain = emailDomain(user.email);
  const trust = domainTrust(domain ? lookupDomain(domain) : null);
  const verified = trust.canEarnVerifiedBadge && trip.cosign_status === 'confirmed';

  // The office this trip's request would go to, and whether it has published
  // anything at all. Resolved once rather than per date card.
  const representative =
    trip.district_state && trip.district_number !== null
      ? representativeFor(trip.district_state, trip.district_number)
      : null;
  const officeForTrip = representative ? officeByBioguide(representative.bioguideId) : null;
  const officePublishes = officeForTrip ? hasPublishedAvailability(officeForTrip.id) : false;
  // A real office claimed by a demo account. What it "published" is invented by
  // the seed, and must never be presented as that office's own words.
  const officeIsDemo = officeForTrip ? isDemoOffice(officeForTrip.id) : false;

  /** What the office said about the week containing `date`, or null if nothing. */
  const officeWeek = (date: string) => {
    if (!officeForTrip || !officePublishes) return null;
    const week = weekStatusFor(officeForTrip.id, date);
    return week.status === 'unpublished' ? null : week;
  };

  const blockers = plan.findings.filter((f) => f.severity === 'blocker');
  const warnings = plan.findings.filter((f) => f.severity === 'high');
  const rest = plan.findings.filter((f) => f.severity === 'medium' || f.severity === 'info');

  // Derived from `today`, which was captured once above, rather than reading
  // the clock during render — a render must be pure and repeatable.
  const staleDays = trip.plan_computed_at
    ? daysBetween(trip.plan_computed_at.slice(0, 10), today)
    : 0;

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow={school?.name ?? user.school_freeform ?? undefined}
        title={trip.title}
        lede={
          <>
            {formatLong(trip.preferred_date)} · {plan.totalGuests} people ({trip.students} students,{' '}
            {trip.teachers} teachers, {trip.chaperones} chaperones)
          </>
        }
        actions={
          <>
            <ButtonLink href={`/teacher/trips/${trip.id}/questions`} tone="secondary">
              Questions ({questions.length})
            </ButtonLink>
            <ButtonLink href={`/teacher/trips/${trip.id}/briefing`} tone="secondary" external>
              Chaperone briefing
            </ButtonLink>
          </>
        }
      />

      {query.sent ? (
        <Panel title="Marked as sent" tone="ok">
          <p>
            The request status is updated. When the office replies, come back and record what they
            said so your trip status stays honest.
          </p>
        </Panel>
      ) : null}

      {/* ================================================================== */}
      {/* Findings                                                           */}
      {/* ================================================================== */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">What you need to know</h2>

        {blockers.map((f) => (
          <FindingCard key={f.code + f.title} finding={f} />
        ))}
        {warnings.map((f) => (
          <FindingCard key={f.code + f.title} finding={f} />
        ))}

        {rest.length > 0 ? (
          <details className="border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer text-base font-bold">
              {rest.length} more things worth knowing
            </summary>
            <div className="mt-4 space-y-4">
              {rest.map((f) => (
                <FindingCard key={f.code + f.title} finding={f} />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {/* ================================================================== */}
      {/* Dates                                                              */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">Your dates</h2>

        {officeForTrip ? (
          officePublishes && officeIsDemo ? (
            <p className="mt-1 max-w-3xl text-slate-600">
              <strong className="text-ink-950">Sample data.</strong> In this demo, invented weekly
              availability stands in for {officeForTrip.member_name}&rsquo;s office to show how the
              feature works. Nothing below came from the office.
            </p>
          ) : officePublishes ? (
            <p className="mt-1 max-w-3xl text-slate-600">
              {officeForTrip.member_name}&rsquo;s office publishes its weekly availability through
              CapitolPass, so some of this is their answer rather than our estimate.
            </p>
          ) : (
            <p className="mt-1 max-w-3xl text-slate-600">
              {officeForTrip.member_name}&rsquo;s office has not published its weekly availability.
              That is normal — most have not — and it changes nothing about how you request.
            </p>
          )
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {plan.dates.map((d) => (
            <Card key={d.date} className={d.date === plan.recommendedDate ? 'border-2 border-ink-900' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm uppercase tracking-wide text-slate-500">{d.label}</p>
                  <p className="text-lg font-bold">{formatShort(d.date)}</p>
                </div>
                <StatusPill tone={d.viable ? 'ok' : 'stop'}>
                  {d.viable ? 'usable' : 'not usable'}
                </StatusPill>
              </div>

              <p className="mt-2 text-sm text-slate-600">
                {d.daysOut >= 0 ? `${d.daysOut} days out` : `${Math.abs(d.daysOut)} days ago`} ·{' '}
                lead time <strong>{d.leadTime}</strong>
              </p>

              {d.closedReason ? (
                <p className="mt-2 text-sm font-bold text-stop-700">{d.closedReason}</p>
              ) : null}

              {d.notes.map((note) => (
                <p key={note} className="mt-2 text-sm text-slate-600">
                  {note}
                </p>
              ))}

              {/* What the office itself said about this week, when it has said
                  anything. Never rendered for an unpublished week: silence is
                  not availability, and a neutral "not published" pill on every
                  card would drown the cards where a real answer exists. */}
              {officeWeek(d.date) ? (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="flex items-center gap-2">
                    <StatusPill tone={OFFICE_WEEK_TONE[officeWeek(d.date)!.status]}>
                      {officeIsDemo ? 'Sample office' : 'Office'}:{' '}
                      {WEEK_STATUS_LABEL[officeWeek(d.date)!.status]}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {WEEK_STATUS_MEANING[officeWeek(d.date)!.status]}
                  </p>
                  {officeWeek(d.date)!.note ? (
                    <p className="mt-1 text-sm italic text-slate-600">
                      &ldquo;{officeWeek(d.date)!.note}&rdquo;
                    </p>
                  ) : null}
                </div>
              ) : null}

              {d.date === plan.recommendedDate ? (
                <p className="mt-3 text-sm font-bold text-ink-900">Planning against this date</p>
              ) : null}
            </Card>
          ))}
        </div>
      </section>

      {/* ================================================================== */}
      {/* Strategies                                                         */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">How your group can actually get in</h2>
        <p className="mt-1 max-w-3xl text-slate-600">
          Ranked by what seats everyone with the least that can go wrong. A single request that
          covers your whole group beats two requests that also cover it.
        </p>

        <div className="mt-5 space-y-5">
          {plan.strategies.map((s) => (
            <Card
              key={s.id}
              className={s.recommended ? 'border-l-[6px] border-l-ink-900' : ''}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-lg font-bold">{s.title}</h3>
                <div className="flex flex-wrap gap-2">
                  {s.recommended ? <StatusPill tone="ok">Recommended</StatusPill> : null}
                  <StatusPill tone={s.viable ? 'info' : 'stop'}>
                    {s.viable ? `seats ${s.guestsCovered}` : 'not viable'}
                  </StatusPill>
                </div>
              </div>

              <p className="mt-2 text-slate-700">{s.summary}</p>

              <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-600">
                {s.rationale.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>

              <p className="mt-3 flex flex-wrap gap-2">
                {s.ruleIds.map((r) => (
                  <RuleTag key={r} id={r} />
                ))}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ================================================================== */}
      {/* Requests                                                           */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">Your requests</h2>
        <p className="mt-1 max-w-3xl text-slate-600">
          One per destination, each addressed to the right person and tracked separately. Open a
          packet to send it.
        </p>

        <ul className="mt-5 space-y-4">
          {requests.map((r) => (
            <Card key={r.id} as="li">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">
                    <Link href={`/teacher/trips/${trip.id}/requests/${r.id}`}>{r.title}</Link>
                  </h3>
                  <p className="mt-1 text-slate-600">
                    {r.guests} guests
                    {r.send_by ? (
                      <>
                        {' '}
                        · send by <strong>{formatShort(r.send_by)}</strong> (
                        {relativeDays(today, r.send_by)})
                      </>
                    ) : null}
                  </p>
                  {r.proposed_date ? (
                    <p className="mt-1 text-warn-700">
                      Office proposed {formatLong(r.proposed_date)}
                    </p>
                  ) : null}
                  {r.response_note ? (
                    <p className="mt-1 text-slate-600">&ldquo;{r.response_note}&rdquo;</p>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <StatusPill tone={REQUEST_TONE[r.status] ?? 'neutral'}>
                    {r.status.replace('_', ' ')}
                  </StatusPill>
                  <ButtonLink
                    href={`/teacher/trips/${trip.id}/requests/${r.id}`}
                    tone={r.status === 'draft' ? 'primary' : 'secondary'}
                  >
                    {r.status === 'draft' ? 'Open packet' : 'View'}
                  </ButtonLink>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      </section>

      {/* ================================================================== */}
      {/* Critical path                                                      */}
      {/* ================================================================== */}
      <section id="critical-path" className="scroll-mt-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Critical path</h2>
            <p className="mt-1 text-slate-600">
              Counted backwards from {formatLong(plan.recommendedDate ?? trip.preferred_date)}.
            </p>
          </div>
          <form action={recomputePlanAction}>
            <input type="hidden" name="trip_id" value={trip.id} />
            <Button tone="secondary">Recompute against today</Button>
          </form>
        </div>

        {staleDays > 3 ? (
          <p className="mt-3 text-sm text-slate-500">
            This plan was computed {staleDays} days ago. Deadlines move as time passes — recompute to
            see where you stand now.
          </p>
        ) : null}

        <CriticalPathTimeline
          milestones={plan.criticalPath}
          today={today}
          tripDate={plan.recommendedDate ?? trip.preferred_date}
        />

        <ol className="mt-5 border-t border-slate-200">
          {plan.criticalPath.map((m) => (
            <li
              key={m.id}
              className="grid gap-2 border-b border-slate-200 py-4 sm:grid-cols-[9rem_1fr_auto] sm:gap-6"
            >
              <div className="font-mono text-sm font-bold text-ink-950">
                {formatShort(m.dueDate)}
              </div>
              <div>
                <p className="font-bold">{m.label}</p>
                <p className="text-sm text-slate-600">{m.detail}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {m.ruleIds.map((r) => (
                    <RuleTag key={r} id={r} />
                  ))}
                </p>
              </div>
              <div className="sm:text-right">
                <StatusPill
                  tone={m.status === 'overdue' ? 'stop' : m.status === 'due_soon' ? 'warn' : 'neutral'}
                >
                  {m.status.replace('_', ' ')}
                </StatusPill>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ================================================================== */}
      {/* Verification                                                       */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">Verification</h2>

        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <Card>
            <h3 className="font-bold">Current status</h3>
            <div className="mt-3">
              <DescriptionList
                items={[
                  {
                    term: 'Email confirmed',
                    description: user.email_verified_at ? (
                      <StatusPill tone="ok">Yes</StatusPill>
                    ) : (
                      <StatusPill tone="warn">Not yet</StatusPill>
                    ),
                  },
                  {
                    term: 'School domain',
                    description: (
                      <>
                        <StatusPill tone={trust.level === 'confirmed' ? 'ok' : 'warn'}>
                          {trust.level}
                        </StatusPill>
                        <p className="mt-1 text-sm">{trust.explanation}</p>
                      </>
                    ),
                  },
                  {
                    term: 'Administrator co-sign',
                    description: (
                      <StatusPill
                        tone={
                          trip.cosign_status === 'confirmed'
                            ? 'ok'
                            : trip.cosign_status === 'pending'
                              ? 'warn'
                              : 'neutral'
                        }
                      >
                        {trip.cosign_status}
                      </StatusPill>
                    ),
                  },
                  {
                    term: 'Verified Trip badge',
                    description: verified ? (
                      <StatusPill tone="ok">Shown to offices</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">Not yet</StatusPill>
                    ),
                  },
                ]}
              />
            </div>
          </Card>

          <Card>
            <h3 className="font-bold">Ask an administrator to co-sign</h3>
            <p className="mt-2 text-slate-600">
              One click for them, no account needed. It tells a congressional office that a second
              person at a real school stands behind this request — which is the only thing that makes
              a verification badge worth anything.
            </p>

            {query.cosign_error === 'domain' ? (
              <p className="mt-3 font-bold text-stop-700">
                The administrator&rsquo;s email has to be on the same domain as yours (
                {emailDomain(user.email)}). A co-sign from anywhere else would not prove anything.
              </p>
            ) : null}

            {query.cosign === 'sent' ? (
              <Panel title="Co-sign request sent" tone="ok">
                <p>We emailed {trip.cosign_email}. The link expires in 30 minutes.</p>
                {process.env.NODE_ENV !== 'production' && query.cosign_token ? (
                  <p className="mt-2">
                    Development mode:{' '}
                    <Link href={`/cosign?token=${query.cosign_token}`} className="font-bold">
                      open the co-sign link
                    </Link>
                  </p>
                ) : null}
              </Panel>
            ) : (
              <form action={requestCosignAction} className="mt-4 space-y-4">
                <input type="hidden" name="trip_id" value={trip.id} />
                <Field
                  label="Administrator's email"
                  name="admin_email"
                  hint={`Must be on ${emailDomain(user.email)} — a principal or activities director.`}
                >
                  <TextInput name="admin_email" type="email" required inputMode="email" />
                </Field>
                <Button tone="secondary">Send co-sign request</Button>
              </form>
            )}
          </Card>
        </div>
      </section>

      {/* ================================================================== */}
      {/* Sharing                                                            */}
      {/* ================================================================== */}
      <section className="border-t border-slate-200 pt-8">
        <h2 className="text-2xl font-bold">Share with your students</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-slate-600">
              Students go to <strong>/join</strong> and enter this code. They see the itinerary, what
              they can and cannot bring, who their Representative is, and can submit a question for
              the meeting.
            </p>
            <p className="mt-4">
              <code className="border-2 border-ink-900 bg-white px-4 py-2 font-mono text-3xl font-bold tracking-[0.3em]">
                {trip.join_code}
              </code>
            </p>

            <div className="mt-5 border-l-[6px] border-l-slate-300 py-1 pl-4">
              <p className="font-bold text-ink-950">Send families the Spanish version</p>
              <p className="mt-1 text-slate-600">
                The what-to-bring list and the permission-slip information are the pages where a
                language barrier actually keeps a student off the bus. This link opens the whole
                student page in Spanish — send it to families directly.
              </p>
              <p className="mt-2">
                <Link href={`/trip/${trip.join_code}?lang=es`} className="font-bold">
                  /trip/{trip.join_code}?lang=es
                </Link>
              </p>
            </div>
          </div>

          {delegation?.representative ? (
            <InsetText>
              <p className="font-bold text-ink-950">
                Students will see {delegation.representative.name}
              </p>
              <p className="mt-1 text-slate-600">
                {delegation.districtDescription}, resolved from your school&rsquo;s coordinates.
                Their photo, committee assignments and what the job actually involves.
              </p>
            </InsetText>
          ) : null}
        </div>
      </section>
    </div>
  );
}
