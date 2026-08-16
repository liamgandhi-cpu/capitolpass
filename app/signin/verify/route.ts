import { NextResponse } from 'next/server';
import {
  consumeMagicLink,
  findUserByEmail,
  markEmailVerified,
  startSession,
} from '@/lib/auth';
import { absoluteUrl } from '@/lib/site-url';

/**
 * Redeem a sign-in link.
 *
 * A route handler rather than a page, because setting a cookie is only allowed
 * in a Server Action or a Route Handler — a Server Component cannot write one.
 * This also means the whole exchange is a single redirect with no intermediate
 * page for the user to see.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  const fail = (reason: string) =>
    NextResponse.redirect(absoluteUrl(`/signin?error=${reason}`, request));

  if (!token) return fail('not_found');

  const result = consumeMagicLink(token, 'signin');
  if (!result.ok) return fail(result.reason);

  const user = findUserByEmail(result.link.email);
  if (!user) return fail('not_found');

  markEmailVerified(user.id);
  await startSession(user.id);

  return NextResponse.redirect(
    absoluteUrl(user.role === 'staff' ? '/office' : '/teacher', request),
  );
}
