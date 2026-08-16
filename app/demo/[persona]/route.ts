import { NextResponse } from 'next/server';
import { findUserByEmail, startSession } from '@/lib/auth';
import { demoEnabled, findPersona } from '@/lib/auth/demo';
import { absoluteUrl } from '@/lib/site-url';

/**
 * Sign in as a demo persona.
 *
 * A route handler because it sets a cookie, which a server component cannot do.
 * A GET because it has to work as a plain link — the people this exists for are
 * arriving from a submission form or an email, and a link is the only thing that
 * survives that trip.
 *
 * Every guard is in lib/auth/demo.ts. This handler resolves a key against the
 * hardcoded allowlist and does nothing else; it never sees an email address from
 * the request.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ persona: string }> },
) {
  // Off unless explicitly switched on. 404 rather than 403: an endpoint that
  // says "forbidden" has told you it exists.
  if (!demoEnabled()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { persona: key } = await params;
  const persona = findPersona(key);
  if (!persona) {
    return NextResponse.redirect(absoluteUrl('/?demo=unknown', request));
  }

  const user = findUserByEmail(persona.email);
  if (!user) {
    // The flag is on but the database was never seeded. Say so plainly rather
    // than bouncing to a sign-in page that will not work either.
    return NextResponse.redirect(absoluteUrl('/?demo=unseeded', request));
  }

  await startSession(user.id);

  const destination = absoluteUrl(persona.destination, request);
  destination.searchParams.set('demo', persona.key);
  return NextResponse.redirect(destination);
}
