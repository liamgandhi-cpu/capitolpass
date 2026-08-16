import { NextResponse } from 'next/server';
import { completeOfficeClaim } from '../../actions';
import { absoluteUrl } from '@/lib/site-url';

/**
 * Redeem an office claim link.
 *
 * A route handler for the same reason as the sign-in equivalent: completing the
 * claim starts a session, and only a Route Handler or Server Action may set a
 * cookie. Failures redirect back to the claim page with a reason rather than
 * rendering a dead end.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(absoluteUrl('/office/claim?error=no_office', request));
  }

  const result = await completeOfficeClaim(token);

  if (!result.ok) {
    return NextResponse.redirect(
      absoluteUrl(`/office/claim?claim_error=${result.reason}`, request),
    );
  }

  return NextResponse.redirect(absoluteUrl('/office', request));
}
