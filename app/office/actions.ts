'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createMagicLink,
  createUser,
  findUserByEmail,
  markEmailVerified,
  normaliseEmail,
  requireUser,
  startSession,
} from '@/lib/auth';
import { officeClaimMessage, sendMail } from '@/lib/mail';
import {
  approveOfficeClaim,
  getOffice,
  officeByBioguide,
  officesForUser,
  requestOfficeClaim,
  canClaimOffice,
} from '@/lib/offices';
import { memberByBioguide } from '@/lib/congress/legislators';
import { getRequest, updateRequestStatus, type RequestStatus } from '@/lib/trips';
import { isIsoDate } from '@/lib/dates';
import { setWeekStatus, type WeekStatus } from '@/lib/offices/availability';

/**
 * Start an office claim.
 *
 * The house.gov / senate.gov domain check is a real signal — you cannot get one
 * of those addresses without working there — but it does not prove *which*
 * office, so a claim is not self-approving. In this build the claim is
 * auto-approved for a verified domain to keep the demo walkable, and that fact
 * is stated on the page rather than hidden.
 */
export async function startOfficeClaim(formData: FormData) {
  const email = normaliseEmail(String(formData.get('email') ?? ''));
  const bioguideId = String(formData.get('bioguide_id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim() || null;

  if (!email.includes('@')) redirect('/office/claim?error=invalid_email');
  if (!bioguideId) redirect('/office/claim?error=no_office');

  const member = memberByBioguide(bioguideId);
  if (!member) redirect('/office/claim?error=no_office');

  const check = canClaimOffice(email, member.chamber);
  if (!check.allowed) {
    redirect(`/office/claim?error=domain&bioguide_id=${bioguideId}`);
  }

  const office = officeByBioguide(bioguideId);
  if (!office) redirect('/office/claim?error=no_office');

  const user =
    findUserByEmail(email) ??
    createUser({ email, role: 'staff', name: name || null });

  requestOfficeClaim(office.id, user.id, title ?? undefined);

  const token = createMagicLink({
    email,
    purpose: 'office_claim',
    payload: { officeId: office.id, userId: user.id },
  });

  await sendMail(
    officeClaimMessage({ to: email, officeName: `Office of ${member.name}`, token }),
  );

  const devToken = process.env.NODE_ENV === 'production' ? '' : `&dev_token=${token}`;
  redirect(`/office/claim/sent?email=${encodeURIComponent(email)}${devToken}`);
}

/** An office responds to a request from its queue. */
export async function respondToRequest(formData: FormData) {
  const user = await requireUser('staff');

  const requestId = String(formData.get('request_id') ?? '');
  const to = String(formData.get('to') ?? '') as RequestStatus;
  const note = String(formData.get('note') ?? '').trim() || null;
  const proposedDate = String(formData.get('proposed_date') ?? '').trim() || null;

  const request = getRequest(requestId);
  if (!request?.office_id) redirect('/office');

  // Only staff of the office this request is addressed to may touch it.
  const permitted = officesForUser(user.id).some((o) => o.id === request.office_id);
  if (!permitted) redirect('/office');

  if (to === 'alternate_proposed' && (!proposedDate || !isIsoDate(proposedDate))) {
    redirect(`/office?error=need_date&request=${requestId}`);
  }

  updateRequestStatus({
    requestId,
    to,
    actorType: 'office',
    actorName: user.name ?? 'Congressional office',
    note,
    proposedDate: proposedDate && isIsoDate(proposedDate) ? proposedDate : null,
  });

  revalidatePath('/office');
  redirect('/office?responded=1');
}

/** Redeem an office claim link: verify, approve, and sign in. */
export async function completeOfficeClaim(token: string) {
  const { consumeMagicLink, magicLinkPayload } = await import('@/lib/auth');

  const result = consumeMagicLink(token, 'office_claim');
  if (!result.ok) return { ok: false as const, reason: result.reason };

  const payload = magicLinkPayload<{ officeId?: string; userId?: string }>(result.link, {});
  if (!payload.officeId || !payload.userId) return { ok: false as const, reason: 'not_found' as const };

  const office = getOffice(payload.officeId);
  if (!office) return { ok: false as const, reason: 'not_found' as const };

  approveOfficeClaim(payload.officeId, payload.userId);
  markEmailVerified(payload.userId);
  await startSession(payload.userId);

  return { ok: true as const, office };
}

/**
 * Publish (or retract) what this office can take in a given week.
 *
 * The scarce resource in this whole system is a weekly tour slot, and until an
 * office says something about it, nobody outside that office can see it. This
 * is the write side of that.
 *
 * Clearing a week is a first-class outcome, not an oversight: an office that
 * marked a week full and then had it free up must be able to take the statement
 * back, and "we never said" has to be storable as the absence of a row rather
 * than as a third kind of yes.
 */
export async function publishWeekAvailability(formData: FormData) {
  const user = await requireUser('staff');

  const officeId = String(formData.get('office_id') ?? '');
  const isoWeek = String(formData.get('iso_week') ?? '').trim();
  const status = String(formData.get('status') ?? '') as WeekStatus;
  const note = String(formData.get('note') ?? '').trim() || null;

  // Same authorisation rule as responding to a request: staff may only speak
  // for an office they belong to.
  const permitted = officesForUser(user.id).some((o) => o.id === officeId);
  if (!permitted) redirect('/office');

  if (!/^\d{4}-W\d{2}$/.test(isoWeek)) redirect('/office?error=bad_week');
  if (!['open', 'full', 'closed', 'unpublished'].includes(status)) {
    redirect('/office?error=bad_status');
  }

  setWeekStatus({ officeId, isoWeek, status, note, userId: user.id });

  revalidatePath('/office');
  redirect('/office?published=1#availability');
}
