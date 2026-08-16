import { Button, Card, DescriptionList, PageHeader, Panel } from '@/components/ui';
import { consumeMagicLink, magicLinkPayload } from '@/lib/auth';
import { confirmCosign, getTrip } from '@/lib/trips';
import { confirmDomain, getSchool } from '@/lib/schools';
import { findUserById } from '@/lib/auth';
import { formatLong } from '@/lib/dates';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Confirm a school trip' };

/**
 * Administrator co-sign.
 *
 * Deliberately account-free: an assistant principal will not create an account
 * to click one button, and requiring it would kill the feature. The magic link
 * is the authentication — it went to an address on the school's own domain and
 * it works once.
 *
 * Confirming does two things: it marks this trip as co-signed, and it promotes
 * the school's email domain from `claimed` to `admin_confirmed`, so the next
 * teacher at the same school gets an automatic match. That is how the mapping
 * that no federal dataset provides actually gets built.
 */
async function confirm(formData: FormData) {
  'use server';

  const token = String(formData.get('token') ?? '');
  const result = consumeMagicLink(token, 'admin_cosign');
  if (!result.ok) redirect(`/cosign?state=${result.reason}`);

  const payload = magicLinkPayload<{ tripId?: string }>(result.link, {});
  if (!payload.tripId) redirect('/cosign?state=not_found');

  const trip = getTrip(payload.tripId);
  if (!trip) redirect('/cosign?state=not_found');

  confirmCosign(trip.id);

  const adminDomain = result.link.email.split('@')[1];
  if (adminDomain) confirmDomain(adminDomain, result.link.email);

  redirect('/cosign?state=confirmed');
}

const MESSAGES: Record<string, { title: string; body: string; tone: 'ok' | 'stop' }> = {
  confirmed: {
    title: 'Confirmed — thank you',
    body: 'This trip now shows a Verified Trip badge to congressional offices, and future teachers at your school will be matched automatically. Nothing else is needed from you.',
    tone: 'ok',
  },
  expired: {
    title: 'That link had expired',
    body: 'Co-sign links last 30 minutes. Ask the teacher to send a fresh one.',
    tone: 'stop',
  },
  used: {
    title: 'That link was already used',
    body: 'This trip may already be confirmed. Check with the teacher who sent it.',
    tone: 'stop',
  },
  not_found: {
    title: 'We did not recognise that link',
    body: 'Ask the teacher to send a new co-sign request.',
    tone: 'stop',
  },
};

export default async function CoSignPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; state?: string }>;
}) {
  const { token, state } = await searchParams;

  if (state) {
    const message = MESSAGES[state] ?? MESSAGES.not_found;
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader title="School trip confirmation" />
        <Panel title={message.title} tone={message.tone}>
          <p>{message.body}</p>
        </Panel>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader title="School trip confirmation" />
        <Panel title="This page needs a link from an email" tone="stop">
          <p>
            Co-sign requests are sent by a teacher to a school administrator. If you were expecting
            one, check your email.
          </p>
        </Panel>
      </div>
    );
  }

  // Peek without consuming: the token is only spent when they press confirm.
  const { get } = await import('@/lib/db');
  const link = get<{ email: string; payload: string | null; expires_at: string; used_at: string | null }>(
    "SELECT email, payload, expires_at, used_at FROM magic_links WHERE token = ? AND purpose = 'admin_cosign'",
    token,
  );

  if (!link) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader title="School trip confirmation" />
        <Panel title="We did not recognise that link" tone="stop">
          <p>Ask the teacher to send a new co-sign request.</p>
        </Panel>
      </div>
    );
  }

  const payload = link.payload ? (JSON.parse(link.payload) as { tripId?: string }) : {};
  const trip = payload.tripId ? getTrip(payload.tripId) : null;
  const teacher = trip ? findUserById(trip.teacher_id) : null;
  const school = trip?.school_nces_id ? getSchool(trip.school_nces_id) : null;

  if (!trip) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader title="School trip confirmation" />
        <Panel title="That trip no longer exists" tone="stop">
          <p>It may have been cancelled. Nothing to confirm.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Confirm this school trip"
        lede="One click. You do not need an account, and we will not email you again about this."
      />

      <Card>
        <DescriptionList
          items={[
            { term: 'School', description: school?.name ?? teacher?.school_freeform ?? 'Not specified' },
            { term: 'Trip', description: trip.title },
            { term: 'Organised by', description: `${teacher?.name ?? 'A teacher'} (${teacher?.email ?? ''})` },
            { term: 'Date', description: formatLong(trip.preferred_date) },
            {
              term: 'Group size',
              description: `${trip.students + trip.teachers + trip.chaperones} people — ${trip.students} students, ${trip.teachers} teachers, ${trip.chaperones} chaperones`,
            },
          ]}
        />
      </Card>

      <Card>
        <h2 className="text-lg font-bold">What confirming means</h2>
        <p className="mt-2 text-slate-600">
          You are saying this is a real trip, organised by a member of your staff, at your school.
          Congressional offices see that confirmation next to the request, which is what separates a
          genuine constituent school group from an unverified form submission.
        </p>
        <p className="mt-2 text-slate-600">
          You are <strong>not</strong> taking on responsibility for the trip, approving a budget, or
          signing anything binding.
        </p>

        <form action={confirm} className="mt-5">
          <input type="hidden" name="token" value={token} />
          <Button>Yes, confirm this trip</Button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          If you do not recognise this request, simply close this page. The trip stays unverified and
          nobody is notified.
        </p>
      </Card>
    </div>
  );
}
