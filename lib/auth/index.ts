/**
 * Authentication: passwordless, with the verification work done by the email
 * domain rather than by a password.
 *
 * Three layers, as designed:
 *
 *   1. The teacher signs up with a school-issued email address. We look the
 *      domain up against our school-domain map (see lib/schools/domains.ts —
 *      note that NCES does not publish email domains, so that map has to be
 *      built rather than downloaded).
 *   2. They confirm the address by following a single-use link.
 *   3. Optionally, an administrator on the same domain co-signs the trip. Only
 *      then does the trip show a Verified badge to a congressional office.
 *
 * There is no password anywhere in this system, so there is no password to
 * leak, reset, or store badly.
 */

import { cookies } from 'next/headers';
import { get, newId, newToken, nowIso, run, transaction } from '../db';

export const SESSION_COOKIE = 'capitolpass_session';
const SESSION_DAYS = 30;
const MAGIC_LINK_MINUTES = 30;

export type UserRole = 'teacher' | 'student' | 'staff' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  school_nces_id: string | null;
  school_freeform: string | null;
  email_verified_at: string | null;
  created_at: string;
}

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string | null {
  const at = normaliseEmail(email).lastIndexOf('@');
  if (at < 0) return null;
  const domain = normaliseEmail(email).slice(at + 1);
  return domain.length > 0 ? domain : null;
}

export function findUserByEmail(email: string): User | null {
  return get<User>('SELECT * FROM users WHERE email = ?', normaliseEmail(email));
}

export function findUserById(id: string): User | null {
  return get<User>('SELECT * FROM users WHERE id = ?', id);
}

export function createUser(input: {
  email: string;
  role: UserRole;
  name?: string | null;
  schoolNcesId?: string | null;
  schoolFreeform?: string | null;
}): User {
  const id = newId();
  run(
    `INSERT INTO users (id, email, name, role, school_nces_id, school_freeform, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    id,
    normaliseEmail(input.email),
    input.name ?? null,
    input.role,
    input.schoolNcesId ?? null,
    input.schoolFreeform ?? null,
    nowIso(),
  );
  return findUserById(id)!;
}

export function markEmailVerified(userId: string): void {
  run('UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL', nowIso(), userId);
}

// ---------------------------------------------------------------------------
// Magic links
// ---------------------------------------------------------------------------

export type MagicPurpose = 'signin' | 'admin_cosign' | 'office_claim';

export interface MagicLink {
  token: string;
  email: string;
  purpose: MagicPurpose;
  payload: string | null;
  expires_at: string;
  used_at: string | null;
}

export function createMagicLink(input: {
  email: string;
  purpose: MagicPurpose;
  payload?: unknown;
}): string {
  const token = newToken();
  run(
    `INSERT INTO magic_links (token, email, purpose, payload, created_at, expires_at)
     VALUES (?,?,?,?,?,?)`,
    token,
    normaliseEmail(input.email),
    input.purpose,
    input.payload === undefined ? null : JSON.stringify(input.payload),
    nowIso(),
    addMinutes(MAGIC_LINK_MINUTES),
  );
  return token;
}

/**
 * Redeem a link. Single use, and the row is marked used inside the same
 * transaction that reads it so a double-click cannot consume it twice.
 */
export function consumeMagicLink(
  token: string,
  purpose: MagicPurpose,
): { ok: true; link: MagicLink } | { ok: false; reason: 'not_found' | 'expired' | 'used' } {
  return transaction(() => {
    const link = get<MagicLink>('SELECT * FROM magic_links WHERE token = ?', token);
    if (!link || link.purpose !== purpose) return { ok: false as const, reason: 'not_found' as const };
    if (link.used_at) return { ok: false as const, reason: 'used' as const };
    if (link.expires_at < nowIso()) return { ok: false as const, reason: 'expired' as const };

    run('UPDATE magic_links SET used_at = ? WHERE token = ?', nowIso(), token);
    return { ok: true as const, link };
  });
}

export function magicLinkPayload<T>(link: MagicLink, fallback: T): T {
  if (!link.payload) return fallback;
  try {
    return JSON.parse(link.payload) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Whether the session cookie should carry the `Secure` flag.
 *
 * Keying this off NODE_ENV alone breaks a production build served over plain
 * HTTP on localhost — which is exactly what you get when you run `npm run
 * build && npm start` to check a release before deploying it. The browser
 * would accept the cookie but nothing else would, and sign-in would silently
 * fail with no error to look at.
 *
 * So: if NEXT_PUBLIC_SITE_URL is set, believe it — that is the deployment
 * telling us its own scheme. Only fall back to NODE_ENV when it is not set,
 * and fall back to secure, so an unconfigured production deployment is safe by
 * default rather than unsafe by default.
 */
function cookieSecure(): boolean {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return siteUrl.startsWith('https://');
  return process.env.NODE_ENV === 'production';
}

export async function startSession(userId: string): Promise<void> {
  const token = newToken();
  run(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)',
    token,
    userId,
    nowIso(),
    addDays(SESSION_DAYS),
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  store.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = get<{ user_id: string; expires_at: string }>(
    'SELECT user_id, expires_at FROM sessions WHERE token = ?',
    token,
  );
  if (!row) return null;

  if (row.expires_at < nowIso()) {
    run('DELETE FROM sessions WHERE token = ?', token);
    return null;
  }

  return findUserById(row.user_id);
}

/** For pages that require a signed-in user. Throws so a route can catch it. */
export async function requireUser(role?: UserRole): Promise<User> {
  const user = await currentUser();
  if (!user) throw new AuthError('You need to sign in to see that page.', 'signed_out');
  if (role && user.role !== role && user.role !== 'admin') {
    throw new AuthError('That page belongs to a different kind of account.', 'wrong_role');
  }
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly kind: 'signed_out' | 'wrong_role',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
