import { redirect } from 'next/navigation';
import {
  Button,
  ButtonLink,
  Card,
  DescriptionList,
  EmptyState,
  Field,
  InsetText,
  PageHeader,
  Panel,
  Select,
  StatusPill,
  TextInput,
  Textarea,
  type StatusTone,
} from '@/components/ui';
import { currentUser } from '@/lib/auth';
import {
  districtMatch,
  memberForOffice,
  officesForUser,
  pendingStaffFor,
  queueForOffice,
  weeklyCapacity,
  capacityWindowWeeks,
} from '@/lib/offices';
import {
  publishedWeeks,
  WEEK_STATUS_LABEL,
  type WeekStatus,
} from '@/lib/offices/availability';
import { formatLong, formatShort, isoWeekKey, toIsoDate } from '@/lib/dates';
import { RULES } from '@/lib/feasibility';
import { publishWeekAvailability, respondToRequest } from './actions';

export const metadata = { title: 'Request queue' };

const ACCESSIBILITY_LABELS: Record<string, string> = {
  wheelchair: 'Wheelchair users',
  mobility_limited: 'Limited mobility',
  deaf_hoh: 'Deaf or hard of hearing',
  blind_low_vision: 'Blind or low vision',
  sensory_sensitive: 'Sensory sensitivities',
  other: 'Other (details on request)',
};

/**
 * Tone for a published week. `unpublished` is deliberately neutral rather than
 * warning-coloured: an office that has said nothing has not said no, and
 * colouring it as a problem would push schedulers into publishing guesses.
 */
const WEEK_TONE: Record<WeekStatus, StatusTone> = {
  open: 'ok',
  full: 'warn',
  closed: 'stop',
  unpublished: 'neutral',
};

const STATUS_TONE: Record<string, StatusTone> = {
  sent: 'info',
  acknowledged: 'info',
  alternate_proposed: 'warn',
  confirmed: 'ok',
  declined: 'stop',
};

export default async function OfficeQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ responded?: string; error?: string; all?: string; published?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/signin');
  if (user.role !== 'staff' && user.role !== 'admin') redirect('/teacher');

  const query = await searchParams;
  const offices = officesForUser(user.id);
  const pending = pendingStaffFor(user.id);
  const today = toIsoDate(new Date());

  if (offices.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="Request queue" />
        {pending.length > 0 ? (
          <Panel title="Your claim is waiting on confirmation" tone="warn">
            <p>
              You started a claim for {pending.map((o) => o.member_name).join(', ')}. Follow the link
              in the confirmation email to finish it.
            </p>
          </Panel>
        ) : (
          <EmptyState
            title="You have not claimed an office yet"
            action={<ButtonLink href="/office/claim">Claim your office</ButtonLink>}
          >
            <p>Claiming your office gives you a queue of constituent school tour requests.</p>
          </EmptyState>
        )}
      </div>
    );
  }

  const showAll = query.all === '1';

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Congressional office"
        title="Request queue"
        lede={`School tour and meeting requests addressed to ${offices.map((o) => o.member_name).join(', ')}.`}
        actions={
          <ButtonLink href={showAll ? '/office' : '/office?all=1'} tone="secondary">
            {showAll ? 'Show open only' : 'Show everything'}
          </ButtonLink>
        }
      />

      {query.responded ? (
        <Panel title="Response recorded" tone="ok">
          <p>The teacher can see the change immediately. No email round trip.</p>
        </Panel>
      ) : null}

      {query.error === 'need_date' ? (
        <Panel title="Proposing an alternate needs a date" tone="stop">
          <p>Pick the date you can actually host, otherwise the teacher has nothing to act on.</p>
        </Panel>
      ) : null}

      {offices.map((office) => {
        const member = memberForOffice(office);
        const queue = queueForOffice(office.id, showAll);
        // Window sized to reach the furthest request, not a fixed near-term
        // span — school trips are requested months out.
        const capacity = weeklyCapacity(office.id, today, capacityWindowWeeks(office.id, today));
        // Publishing has to reach at least as far as the queue does, or a
        // scheduler cannot answer the request they are looking at. Floored at a
        // term's worth of weeks so the list is useful before anything is booked.
        const availabilityWeeks = Math.max(16, capacityWindowWeeks(office.id, today));
        const booked = capacity.filter((w) => w.confirmed > 0 || w.pending > 0);

        return (
          <section key={office.id} className="space-y-8">
            {/* ------------------------------------------------------------ */}
            {/* Weekly capacity                                              */}
            {/* ------------------------------------------------------------ */}
            <div>
              <h2 className="text-2xl font-bold">Weekly capacity</h2>
              <p className="mt-1 max-w-3xl text-slate-600">
                Your office can reserve {office.weekly_tour_limit} school tour
                {office.weekly_tour_limit === 1 ? '' : 's'} per week. Nothing else you use shows you
                this, which is how two schools in the same district end up competing for the same
                week without either of them knowing.
              </p>

              <p className="mt-2 font-bold text-ink-950">
                {booked.length === 0
                  ? `Nothing booked in the next ${capacity.length} weeks.`
                  : `${booked.length} of the next ${capacity.length} weeks ${booked.length === 1 ? 'has' : 'have'} a school tour on it.`}
              </p>

              {/* Scrolls rather than shrinking: the window stretches to reach
                  the furthest request, so it can be six months wide. */}
              <ol className="mt-4 flex snap-x gap-2 overflow-x-auto pb-2">
                {capacity.map((week) => (
                  <li
                    key={week.isoWeek}
                    className={`w-28 shrink-0 snap-start border p-3 ${
                      week.overLimit
                        ? 'border-stop-700 bg-stop-100'
                        : week.atLimit
                          ? 'border-warn-700 bg-warn-100'
                          : week.pending > 0
                            ? 'border-info-700 bg-info-100'
                            : 'border-slate-200 bg-white'
                    }`}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {formatShort(week.weekStart).replace(/, \d{4}$/, '')}
                    </p>
                    <p className="mt-1 text-2xl font-bold">
                      {week.confirmed}
                      <span className="text-base font-normal text-slate-500">/{week.limit}</span>
                    </p>
                    {week.pending > 0 ? (
                      <p className="text-xs text-slate-600">+{week.pending} pending</p>
                    ) : (
                      <p className="text-xs text-slate-400">&nbsp;</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {/* ------------------------------------------------------------ */}
            {/* Published availability                                       */}
            {/* ------------------------------------------------------------ */}
            <div id="availability" className="scroll-mt-4">
              <h2 className="text-2xl font-bold">What teachers can see</h2>
              <p className="mt-1 max-w-3xl text-slate-600">
                The strip above is yours. This is the part schools can see before they pick their
                dates. Marking a week <strong>full</strong> stops a teacher spending two months on a
                request you already know you cannot take — which is the single most useful thing
                this app can do for both of you.
              </p>
              <InsetText>
                <p className="text-slate-600">
                  Weeks you say nothing about show as <strong>not published</strong>, never as open.
                  You are not committing to anything by leaving them alone, and a teacher is told
                  plainly that silence is not a no.
                </p>
              </InsetText>

              <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
                {publishedWeeks(office.id, today, availabilityWeeks).map((week) => {
                  const load = capacity.find((w) => w.isoWeek === week.isoWeek);
                  return (
                    <li
                      key={week.isoWeek}
                      className="grid items-center gap-3 py-3 sm:grid-cols-[10rem_7rem_1fr]"
                    >
                      <div>
                        <p className="font-bold">
                          {formatShort(week.weekStart).replace(/, \d{4}$/, '')} –{' '}
                          {formatShort(week.weekEnd).replace(/, \d{4}$/, '')}
                        </p>
                        <p className="font-mono text-xs text-slate-500">{week.isoWeek}</p>
                      </div>

                      <div>
                        <StatusPill tone={WEEK_TONE[week.status]}>
                          {WEEK_STATUS_LABEL[week.status]}
                        </StatusPill>
                        {load && (load.confirmed > 0 || load.pending > 0) ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {load.confirmed} confirmed
                            {load.pending > 0 ? `, ${load.pending} pending` : ''}
                          </p>
                        ) : null}
                      </div>

                      <form action={publishWeekAvailability} className="flex flex-wrap gap-2">
                        <input type="hidden" name="office_id" value={office.id} />
                        <input type="hidden" name="iso_week" value={week.isoWeek} />
                        {(['open', 'full', 'closed', 'unpublished'] as const).map((status) => (
                          <button
                            key={status}
                            type="submit"
                            name="status"
                            value={status}
                            disabled={week.status === status}
                            className="border-2 border-slate-400 bg-white px-3 py-1 text-sm font-bold text-ink-900 hover:border-ink-900 hover:bg-ink-900 hover:text-paper-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            {status === 'unpublished' ? 'Clear' : WEEK_STATUS_LABEL[status]}
                            <span className="sr-only">
                              {' '}
                              — set week of {formatShort(week.weekStart)}
                            </span>
                          </button>
                        ))}
                      </form>

                      {week.note ? (
                        <p className="text-sm text-slate-600 sm:col-start-3">{week.note}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* ------------------------------------------------------------ */}
            {/* The queue                                                    */}
            {/* ------------------------------------------------------------ */}
            <div>
              <h2 className="text-2xl font-bold">
                {queue.length} request{queue.length === 1 ? '' : 's'}
              </h2>

              {queue.length === 0 ? (
                <EmptyState title="Nothing waiting">
                  <p>
                    When a school in {office.state}
                    {office.district !== null ? `-${office.district}` : ''} sends a request through
                    CapitolPass, it lands here.
                  </p>
                </EmptyState>
              ) : (
                <ul className="mt-4 space-y-6">
                  {queue.map((item) => {
                    const match = districtMatch(item, office);
                    const needs = JSON.parse(item.accessibility || '[]') as string[];
                    const week = item.requestedDate ? isoWeekKey(item.requestedDate) : null;
                    const weekLoad = capacity.find((w) => w.isoWeek === week);
                    const verified =
                      item.cosignStatus === 'confirmed' &&
                      (item.domainStatus === 'admin_confirmed' || item.domainStatus === 'seeded');

                    return (
                      <Card key={item.requestId} as="li">
                        {/* Header */}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-bold">{item.schoolName}</h3>
                            <p className="mt-1 text-slate-600">
                              {[item.schoolCity, item.schoolState].filter(Boolean).join(', ')} ·{' '}
                              {item.title}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {verified ? (
                              <StatusPill tone="ok">Verified trip</StatusPill>
                            ) : (
                              <StatusPill tone="neutral">Unverified</StatusPill>
                            )}
                            <StatusPill tone={STATUS_TONE[item.status] ?? 'neutral'}>
                              {item.status.replace('_', ' ')}
                            </StatusPill>
                          </div>
                        </div>

                        {/* Constituent check — the first question a scheduler asks */}
                        <div
                          className={`mt-4 border-l-[6px] p-4 ${
                            match.matches ? 'border-l-ok-700 bg-ok-100' : 'border-l-stop-700 bg-stop-100'
                          }`}
                        >
                          <p className="font-bold">
                            {match.matches ? 'Constituent — confirmed' : 'Not in this district'}
                          </p>
                          <p className="mt-1 text-sm">{match.explanation}</p>
                        </div>

                        {/* The facts */}
                        <div className="mt-4">
                          <DescriptionList
                            items={[
                              {
                                term: 'Requested date',
                                description: item.requestedDate ? (
                                  <>
                                    {formatLong(item.requestedDate)}
                                    {weekLoad ? (
                                      <span
                                        className={
                                          weekLoad.atLimit
                                            ? 'ml-2 font-bold text-warn-700'
                                            : 'ml-2 text-slate-500'
                                        }
                                      >
                                        (that week: {weekLoad.confirmed}/{weekLoad.limit} confirmed
                                        {weekLoad.pending > 0 ? `, ${weekLoad.pending} pending` : ''})
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  'Not specified'
                                ),
                              },
                              {
                                term: 'Group size',
                                description: (
                                  <>
                                    <strong>{item.guests}</strong> — {item.students} students,{' '}
                                    {item.teachers} teachers, {item.chaperones} chaperones
                                    {item.guests > RULES.staffLedMaxGuests.value ? (
                                      <span className="ml-2 font-bold text-warn-700">
                                        over the {RULES.staffLedMaxGuests.value}-guest staff-led limit
                                      </span>
                                    ) : null}
                                  </>
                                ),
                              },
                              { term: 'Grade level', description: item.gradeBand },
                              {
                                term: 'Accessibility',
                                description:
                                  needs.length === 0
                                    ? 'None reported'
                                    : needs.map((n) => ACCESSIBILITY_LABELS[n] ?? n).join(', '),
                              },
                              {
                                term: 'Contact',
                                description: (
                                  <>
                                    {item.teacherName ?? 'Teacher'} —{' '}
                                    <a href={`mailto:${item.teacherEmail}`}>{item.teacherEmail}</a>
                                  </>
                                ),
                              },
                            ]}
                          />
                        </div>

                        {/* Actions */}
                        {item.status === 'confirmed' || item.status === 'declined' ? (
                          <p className="mt-4 text-slate-500">
                            Settled. Nothing further needed from you.
                          </p>
                        ) : (
                          <form action={respondToRequest} className="mt-5 space-y-4 border-t border-slate-200 pt-5">
                            <input type="hidden" name="request_id" value={item.requestId} />

                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="Your response" name={`to-${item.requestId}`}>
                                <Select
                                  name="to"
                                  options={[
                                    { value: 'confirmed', label: 'Confirm this date' },
                                    { value: 'alternate_proposed', label: 'Propose a different date' },
                                    { value: 'acknowledged', label: 'Acknowledge — still deciding' },
                                    { value: 'declined', label: 'Decline' },
                                  ]}
                                />
                              </Field>

                              <Field
                                label="Alternate date"
                                name={`proposed-${item.requestId}`}
                                hint="Only needed if you are proposing a different date."
                              >
                                <TextInput name="proposed_date" type="date" />
                              </Field>
                            </div>

                            <Field
                              label="Message to the teacher"
                              name={`note-${item.requestId}`}
                              hint="They see this immediately. A one-line reason saves an email thread."
                            >
                              <Textarea name="note" rows={2} />
                            </Field>

                            <Button>Send response</Button>
                          </form>
                        )}
                      </Card>
                    );
                  })}
                </ul>
              )}
            </div>

            {member ? (
              <p className="text-sm text-slate-500">
                Office of {member.name} · {member.capitolOffice ?? ''} · {member.phone ?? ''}
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
