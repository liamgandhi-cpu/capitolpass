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
  Select,
  StatusPill,
  TextInput,
  Textarea,
  type StatusTone,
} from '@/components/ui';
import { CopyBlock } from '@/components/copy-block';
import { currentUser, emailDomain } from '@/lib/auth';
import { getSchool, domainTrust, lookupDomain } from '@/lib/schools';
import { eventsForRequest, getRequest, getTrip, savePacketSnapshot } from '@/lib/trips';
import { delegationFor } from '@/lib/congress/legislators';
import { cvcRoute, explainConfidence, resolveMeetingRoute, resolveTourRoute } from '@/lib/congress/routing';
import { isDemoOffice, isOfficeClaimed, officeByBioguide } from '@/lib/offices';
import { buildPacket, mailtoUrl } from '@/lib/packets';
import { formatLong, formatShort } from '@/lib/dates';
import { markRequestSentAction, recordResponseAction } from '../../../../actions';

const REQUEST_TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  sent: 'info',
  acknowledged: 'info',
  confirmed: 'ok',
  declined: 'stop',
  alternate_proposed: 'warn',
};

const CONFIDENCE_TONE: Record<string, StatusTone> = {
  verified: 'ok',
  contact_form: 'info',
  website: 'warn',
  unknown: 'stop',
};

export default async function PacketPage({
  params,
}: {
  params: Promise<{ id: string; rid: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect('/signin');

  const { id, rid } = await params;
  const trip = getTrip(id);
  const request = getRequest(rid);

  if (!trip || !request || request.trip_id !== trip.id) notFound();
  if (trip.teacher_id !== user.id && user.role !== 'admin') notFound();

  const school = trip.school_nces_id ? getSchool(trip.school_nces_id) : null;
  const delegation =
    trip.district_state && trip.district_number !== null
      ? delegationFor(trip.district_state, trip.district_number)
      : null;

  const member =
    request.destination_type === 'senate_office_tour'
      ? (delegation?.senators[0] ?? null)
      : (delegation?.representative ?? null);

  const domain = emailDomain(user.email);
  const trust = domainTrust(domain ? lookupDomain(domain) : null);
  const verified = trust.canEarnVerifiedBadge && trip.cosign_status === 'confirmed';

  const packet = buildPacket(request.destination_type, {
    trip,
    school,
    schoolNameFallback: user.school_freeform ?? 'Our school',
    teacherName: user.name ?? user.email,
    teacherEmail: user.email,
    member,
    requestedDate: request.requested_date ?? trip.preferred_date,
    guests: request.guests,
    verified,
  });

  // Keep a snapshot of exactly what was offered, so the record of what was sent
  // does not drift as the plan is recomputed.
  if (request.status === 'draft') savePacketSnapshot(request.id, packet);

  const route =
    request.destination_type === 'cvc_group_reservation'
      ? cvcRoute()
      : request.destination_type === 'rep_meeting'
        ? member
          ? resolveMeetingRoute(member)
          : null
        : member
          ? resolveTourRoute(member)
          : null;

  const officeClaimed = member ? isOfficeClaimed(member.bioguideId) : false;
  // Claimed by a seeded demo account rather than by the office itself. The
  // request still goes to a queue, but it is the demo's queue, and saying the
  // real office "has claimed their account" would put words in its mouth.
  const claimedOffice = member && officeClaimed ? officeByBioguide(member.bioguideId) : null;
  const officeIsDemo = claimedOffice ? isDemoOffice(claimedOffice.id) : false;
  const events = eventsForRequest(request.id);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <p>
        <Link href={`/teacher/trips/${trip.id}`}>← Back to {trip.title}</Link>
      </p>

      <PageHeader
        eyebrow={trip.title}
        title={packet.title}
        lede={
          <>
            To: <strong>{packet.addressedTo}</strong> · {request.guests} guests ·{' '}
            {formatLong(request.requested_date ?? trip.preferred_date)}
          </>
        }
        actions={<StatusPill tone={REQUEST_TONE[request.status] ?? 'neutral'}>{request.status.replace('_', ' ')}</StatusPill>}
      />

      {/* ================================================================== */}
      {/* Where this goes                                                    */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">Where this goes</h2>

        {officeClaimed && request.destination_type !== 'cvc_group_reservation' ? (
          <Panel
            title={officeIsDemo ? 'Sample office queue' : 'This office is on CapitolPass'}
            tone={officeIsDemo ? 'info' : 'ok'}
          >
            {officeIsDemo ? (
              <p>
                In this demo, a sample account stands in for {member?.name}&rsquo;s office, so you
                can see what happens when an office uses CapitolPass. Sending puts this request in the
                sample queue. Nothing reaches the real office.
              </p>
            ) : (
              <p>
                {member?.name}&rsquo;s office has claimed their account, so this request goes
                straight into their queue. No email, no form, no wondering whether it arrived — you
                will see the status change here when they respond.
              </p>
            )}
            <form action={markRequestSentAction} className="mt-4">
              <input type="hidden" name="request_id" value={request.id} />
              <input type="hidden" name="trip_id" value={trip.id} />
              <input type="hidden" name="send_mode" value="in_app" />
              <Button disabled={request.status !== 'draft'}>
                {request.status === 'draft' ? 'Send to their queue' : 'Already sent'}
              </Button>
            </form>
          </Panel>
        ) : route ? (
          <Card className="mt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{route.label}</h3>
                <p className="mt-1 text-slate-600">{route.instruction}</p>
              </div>
              <StatusPill tone={CONFIDENCE_TONE[route.confidence] ?? 'neutral'}>
                {route.confidence.replace('_', ' ')}
              </StatusPill>
            </div>

            <p className="mt-3 text-sm text-slate-500">
              {explainConfidence(route.confidence)}
              {route.checkedAt ? ` Last checked ${formatShort(route.checkedAt)}.` : ''}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              {route.url ? (
                <ButtonLink href={route.url} external>
                  Open their form
                </ButtonLink>
              ) : null}
              <ButtonLink href={mailtoUrl(packet)} tone="secondary">
                Draft in my own mailbox
              </ButtonLink>
            </div>

            {route.phone ? (
              <p className="mt-4 text-slate-600">
                Or call the office: <strong>{route.phone}</strong>. For a tour request this is often
                genuinely faster than any form.
              </p>
            ) : null}
          </Card>
        ) : (
          <Panel title="We could not identify an office for this request" tone="warn">
            <p>
              Your school&rsquo;s congressional district has not been resolved yet, so we cannot
              address this automatically. You can still copy the packet below and send it yourself.
            </p>
          </Panel>
        )}
      </section>

      {/* ================================================================== */}
      {/* The packet                                                         */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">Your packet</h2>
        <p className="mt-1 text-slate-600">
          Everything this destination asks for, in the order they ask for it. You already answered
          all of it.
        </p>

        <Card className="mt-4">
          <DescriptionList
            items={packet.fields.map((f) => ({
              term: f.label,
              description: (
                <span className={f.essential ? 'font-medium' : undefined}>{f.value}</span>
              ),
            }))}
          />
        </Card>

        <div className="mt-6">
          <CopyBlock text={packet.plainText} label="Ready to paste into their form" />
        </div>
      </section>

      {/* ================================================================== */}
      {/* Checklist                                                          */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">While you are on their form</h2>
        <p className="mt-1 text-slate-600">
          Their form will not look exactly like ours. This is what to watch for.
        </p>
        <ol className="mt-4 space-y-2">
          {packet.checklist.map((step, i) => (
            <li key={step} className="flex gap-3 border-b border-slate-200 pb-2">
              <span className="font-mono font-bold text-slate-400">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ================================================================== */}
      {/* Status                                                             */}
      {/* ================================================================== */}
      <section>
        <h2 className="text-2xl font-bold">Status</h2>

        {request.status === 'draft' ? (
          <Card className="mt-4">
            <h3 className="font-bold">Once you have actually submitted it</h3>
            <p className="mt-2 text-slate-600">
              We do not mark this as sent for you, because only you know whether you pressed submit.
              A status that guesses is worse than no status at all.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={markRequestSentAction}>
                <input type="hidden" name="request_id" value={request.id} />
                <input type="hidden" name="trip_id" value={trip.id} />
                <input type="hidden" name="send_mode" value="prefill" />
                <Button>I submitted their form</Button>
              </form>
              <form action={markRequestSentAction}>
                <input type="hidden" name="request_id" value={request.id} />
                <input type="hidden" name="trip_id" value={trip.id} />
                <input type="hidden" name="send_mode" value="email" />
                <Button tone="secondary">I emailed it myself</Button>
              </form>
            </div>
          </Card>
        ) : (
          <Card className="mt-4">
            <h3 className="font-bold">Record what the office said</h3>
            <p className="mt-2 text-slate-600">
              {request.send_mode === 'in_app'
                ? 'This one updates itself when the office responds in their queue. You can still record something you heard by phone.'
                : 'Replies arrive in your own inbox, so record them here to keep your trip status honest.'}
            </p>

            <form action={recordResponseAction} className="mt-4 space-y-4">
              <input type="hidden" name="request_id" value={request.id} />
              <input type="hidden" name="trip_id" value={trip.id} />

              <Field label="What happened?" name="to">
                <Select
                  name="to"
                  options={[
                    { value: 'acknowledged', label: 'They acknowledged it' },
                    { value: 'confirmed', label: 'Confirmed — we have a slot' },
                    { value: 'alternate_proposed', label: 'They proposed a different date' },
                    { value: 'declined', label: 'Declined' },
                  ]}
                />
              </Field>

              <Field
                label="Proposed date, if they offered one"
                name="proposed_date"
                hint="Leave blank unless they gave you a specific alternative."
              >
                <TextInput name="proposed_date" type="date" />
              </Field>

              <Field label="Notes" name="note">
                <Textarea name="note" rows={3} placeholder="What exactly did they say?" />
              </Field>

              <Button tone="secondary">Record it</Button>
            </form>
          </Card>
        )}

        {events.length > 0 ? (
          <div className="mt-6">
            <h3 className="font-bold">History</h3>
            <ol className="mt-3 border-t border-slate-200">
              {events.map((e) => (
                <li key={e.id} className="grid gap-1 border-b border-slate-200 py-3 sm:grid-cols-[10rem_1fr]">
                  <span className="font-mono text-sm text-slate-500">
                    {formatShort(e.created_at.slice(0, 10))}
                  </span>
                  <span>
                    <strong>
                      {e.from_status} → {e.to_status}
                    </strong>{' '}
                    <span className="text-slate-500">by {e.actor_name ?? e.actor_type}</span>
                    {e.note ? <span className="block text-slate-600">{e.note}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <InsetText>
        <p className="text-slate-600">
          CapitolPass never sends this for you. Automated mail to congressional offices gets filtered,
          and it lands on staff who are already answering constituents. Every route above puts a
          person — you, or a staffer who chose to receive requests here — in the loop.
        </p>
      </InsetText>
    </div>
  );
}
