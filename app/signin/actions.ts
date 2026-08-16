'use server';

import { redirect } from 'next/navigation';
import {
  createMagicLink,
  createUser,
  emailDomain,
  findUserByEmail,
  normaliseEmail,
} from '@/lib/auth';
import { sendMail, signInMessage, siteUrl } from '@/lib/mail';
import { claimDomain, isConsumerDomain, schoolForDomain } from '@/lib/schools';

/**
 * Ask for a sign-in link.
 *
 * We deliberately do not reveal whether an address already has an account.
 * Sending someone to a "no account found" page tells anyone with the form who
 * teaches at a school, which is not ours to disclose.
 */
export async function requestSignInLink(formData: FormData) {
  const email = normaliseEmail(String(formData.get('email') ?? ''));

  if (!email.includes('@') || email.length < 5) {
    redirect('/signin?error=invalid_email');
  }

  const user = findUserByEmail(email);
  if (!user) {
    // No account: send them to sign-up, carrying the address so they do not
    // type it twice.
    redirect(`/signup?email=${encodeURIComponent(email)}`);
  }

  const token = createMagicLink({ email, purpose: 'signin' });
  await sendMail(signInMessage(email, token));

  // In development there is no mail provider, so the link is surfaced on the
  // next screen. Never in production.
  const devToken = process.env.NODE_ENV === 'production' ? '' : `&dev_token=${token}`;
  redirect(`/signin/sent?email=${encodeURIComponent(email)}${devToken}`);
}

/**
 * Create a teacher account.
 *
 * The school match comes from the email domain when we have that domain on
 * file. When we do not — which is most of the time, because no public dataset
 * maps email domains to schools — the teacher picks their school and we record
 * the domain as *claimed*. Claimed is enough to use the whole product. It is
 * not enough for a Verified Trip badge; that needs an administrator co-sign.
 */
export async function createTeacherAccount(formData: FormData) {
  const email = normaliseEmail(String(formData.get('email') ?? ''));
  const name = String(formData.get('name') ?? '').trim();
  const ncesId = String(formData.get('nces_id') ?? '').trim() || null;
  const freeform = String(formData.get('school_freeform') ?? '').trim() || null;

  if (!email.includes('@')) redirect('/signup?error=invalid_email');
  if (name.length < 2) {
    redirect(`/signup?email=${encodeURIComponent(email)}&error=name_required`);
  }
  if (!ncesId && !freeform) {
    redirect(`/signup?email=${encodeURIComponent(email)}&error=school_required`);
  }

  const existing = findUserByEmail(email);
  if (existing) {
    const token = createMagicLink({ email, purpose: 'signin' });
    await sendMail(signInMessage(email, token));
    const devToken = process.env.NODE_ENV === 'production' ? '' : `&dev_token=${token}`;
    redirect(`/signin/sent?email=${encodeURIComponent(email)}${devToken}`);
  }

  const user = createUser({
    email,
    role: 'teacher',
    name,
    schoolNcesId: ncesId,
    schoolFreeform: freeform,
  });

  // Record the domain claim so the next teacher at this school gets an
  // automatic match — this is how the mapping gets built at all.
  const domain = emailDomain(email);
  if (domain && ncesId && !isConsumerDomain(domain) && !schoolForDomain(domain)) {
    try {
      claimDomain({ domain, ncesId, userId: user.id, note: 'Claimed at sign-up.' });
    } catch {
      // A consumer domain or a race with another claim. Neither is fatal.
    }
  }

  const token = createMagicLink({ email, purpose: 'signin' });
  await sendMail(signInMessage(email, token));
  const devToken = process.env.NODE_ENV === 'production' ? '' : `&dev_token=${token}`;
  redirect(`/signin/sent?email=${encodeURIComponent(email)}${devToken}`);
}

export async function devSiteUrl(path: string) {
  return siteUrl(path);
}
