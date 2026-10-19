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
  isDemoOffice,
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

      {/* The demo claims the real office the demo school resolves to, so the
          routing is real. Everything else on this page is invented, and a
          staffer of that office must not mistake it for their own records. */}
      {offices.some((o) => isDemoOffice(o.id)) ? (
        <Panel title="This is sample data" tone="info">
          <p>
            A demo account has claimed this office to show how the queue works. The requests,
            availability and notes here were invented for the demo. None of it came from{' '}
            {offices.map((o) => o.member_name).join(', ')}&rsquo;s office, and nothing here is sent
            to it.
          </p>
        </Panel>
      ) : null}

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
                Every school group on the books, week by week, against a limit of{' '}
                {office.weekly_tour_limit} per week. When two schools in the district ask for the same
                week, this is where it shows up — before either of them has been promised anything.
              </p>

              <p className="mt-2 font-bold text-ink-950">
                {booked.length === 0
                  ? `Nothing booked in the next ${capacity.length} weeks.`
                  : // Named, because the strip scrolls and the booked week is
                    // often off-screen: a count next to a row of zeros reads
                    // as a bug.
                    `${booked.length} of the next ${capacity.length} weeks ${booked.length === 1 ? 'has' : 'have'} a school tour on it: the week${booked.length === 1 ? '' : 's'} of ${booked
                      .map((w) => formatShort(w.weekStart).replace(/, \d{4}$/, ''))
                      .join(', ')}.`}
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

                      <form action={publishWeekAvailability}>
                        <input type="hidden" name="office_id" value={office.id} />
                        <input type="hidden" name="iso_week" value={week.isoWeek} />

                        {/*
                          The button for the current status stays enabled.
                          Disabling it looks tidier and creates a dead end: the
                          note below is only written when a status is submitted,
                          so an office wanting to reword the note on an already-
                          open week would have had no button left to press.
                          Pressing the current status re-saves it.
                        */}
                        <div className="flex flex-wrap gap-2">
                          {(['open', 'full', 'closed', 'unpublished'] as const).map((status) => {
                            const current = week.status === status;
                            return (
                              <button
                                key={status}
                                type="submit"
                                name="status"
                                value={status}
                                aria-current={current ? 'true' : undefined}
                                // min-h-11 is 44px. WCAG 2.1 AA has no target
                                // size criterion, so the tighter button passed
                                // — but a scheduler answering a week from a
                                // phone is a real case, and four small buttons
                                // sitting side by side is exactly where a
                                // mis-tap costs someone a wrong answer.
                                className={`inline-flex min-h-11 items-center border-2 px-3 py-1 text-sm font-bold ${
                                  current
                                    ? 'border-ink-900 bg-ink-900 text-paper-50'
                                    : 'border-slate-400 bg-white text-ink-900 hover:border-ink-900 hover:bg-ink-900 hover:text-paper-50'
                                }`}
                              >
                                {status === 'unpublished' ? 'Clear' : WEEK_STATUS_LABEL[status]}
                                <span className="sr-only">
                                  {current ? ' (current)' : ''} — set week of{' '}
                                  {formatShort(week.weekStart)}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/*
                          A native disclosure rather than a permanently visible
                          input: sixteen text boxes down the page would bury the
                          buttons that are the actual job. The field lives inside
                          the same form, so whichever status button is pressed
                          carries the note with it whether or not this is open —
                          and it needs no client JavaScript to do that.
                        */}
                        <details className="mt-2" open={Boolean(week.note)}>
                          <summary className="cursor-pointer text-sm text-slate-500 hover:text-ink-900">
                            {week.note ? 'Edit the note' : 'Add a note'}
                          </summary>
                          <div className="mt-2">
                            <label
                              htmlFor={`note-${week.isoWeek}`}
                              className="block text-sm font-bold text-ink-950"
                            >
                              What teachers will see for{' '}
                              {formatShort(week.weekStart).replace(/, \d{4}$/, '')}
                            </label>
                            <p
                              id={`note-hint-${week.isoWeek}`}
                              className="mt-1 text-sm text-slate-500"
                            >
                              Shown to teachers word for word. A reason helps them plan — “already
                              hosting a school from Loudoun”, “district work period”. Saved when you
                              press a status button above.
                            </p>
                            <input
                              id={`note-${week.isoWeek}`}
                              name="note"
                              type="text"
                              maxLength={200}
                              defaultValue={week.note ?? ''}
                              aria-describedby={`note-hint-${week.isoWeek}`}
                              className="mt-2 w-full border-2 border-slate-600 bg-white px-3 py-2 text-base text-slate-800 placeholder:text-slate-400 focus:border-ink-900"
                            />
                          </div>
                        </details>
                      </form>
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
                                    {item.guests > RULES.officeGuidedSchoolMaxGuests.value ? (
                                      <span className="ml-2 font-bold text-stop-700">
                                        over the {RULES.officeGuidedSchoolMaxGuests.value}-person
                                        school-group limit
                                      </span>
                                    ) : item.guests > RULES.staffLedMaxGuests.value ? (
                                      <span className="ml-2 font-bold text-warn-700">
                                        too big for staff-led — a guided school tour
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
