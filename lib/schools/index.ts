/**
 * Schools, and the domain-to-school problem.
 *
 * ----------------------------------------------------------------------------
 * THE GAP IN THE ORIGINAL PLAN
 * ----------------------------------------------------------------------------
 * The plan for this app was: "teacher signs up with a school email, match the
 * domain against the NCES Common Core of Data directory".
 *
 * The CCD does not contain email domains. It has no such field, and no federal
 * dataset publishes one. There is no authoritative mapping from
 * `lcps.org` to a school district anywhere in public data.
 *
 * So domain verification cannot be a lookup. It has to be a mapping we build,
 * with a state attached to each entry saying how much we trust it:
 *
 *   seeded            we added and checked it by hand
 *   admin_confirmed   an administrator on that domain confirmed it
 *   claimed           a teacher asserted it, nobody has confirmed it yet
 *
 * A `claimed` domain still gets the teacher the entire product. It just does
 * not produce a Verified Trip badge, because a badge that anyone can self-issue
 * is worth nothing to the congressional staffer reading it. That distinction —
 * everyone gets the tool, not everyone gets the badge — is the whole design.
 *
 * The teacher whose school is not in the CCD at all (private, parochial,
 * homeschool co-op, a school that opened last year) is handled the same way:
 * free-text school name, `claimed` status, full access to the product.
 */

import { all, get, nowIso, run } from '../db';
import { resolveDistrict, DistrictLookupError } from '../districts/census';

export interface School {
  nces_id: string;
  name: string;
  lea_name: string | null;
  street: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  enrollment: number | null;
  is_charter: number;
  level: string | null;
  district_state: string | null;
  district_number: number | null;
  district_method: string | null;
  district_resolved_at: string | null;
}

export type DomainStatus = 'seeded' | 'admin_confirmed' | 'claimed' | 'rejected';

export interface SchoolDomain {
  domain: string;
  nces_id: string | null;
  status: DomainStatus;
  claimed_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  note: string | null;
}

/**
 * Domains that can never identify one school, whatever a user types. A teacher
 * on Gmail is welcome here — they simply cannot claim `gmail.com` as their
 * school's domain, because it is not.
 */
const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'zoho.com',
  'yandex.com',
]);

export function isConsumerDomain(domain: string): boolean {
  return CONSUMER_DOMAINS.has(domain.toLowerCase());
}

/**
 * Domains that look institutional. Not proof of anything — plenty of real
 * schools use a plain .org or .com — but a useful signal for how much
 * ceremony to put in front of a claim.
 */
export function looksInstitutional(domain: string): boolean {
  const d = domain.toLowerCase();
  return d.endsWith('.k12.') || /\.k12\.[a-z]{2}\.us$/.test(d) || d.endsWith('.edu') || d.endsWith('.sch.us');
}

// ---------------------------------------------------------------------------
// School lookup
// ---------------------------------------------------------------------------

export function getSchool(ncesId: string): School | null {
  return get<School>('SELECT * FROM schools WHERE nces_id = ?', ncesId);
}

/**
 * Search by name, optionally within a state.
 *
 * Ranked so that a prefix match beats a match buried in the middle of a name,
 * because a teacher typing "Riverside" wants Riverside High School before
 * "Academy at Riverside Park".
 */
export function searchSchools(query: string, state?: string, limit = 25): School[] {
  const q = query.trim();
  if (q.length < 2) return [];

  const like = `%${q}%`;
  const prefix = `${q}%`;

  if (state) {
    return all<School>(
      `SELECT * FROM schools
       WHERE state = ? AND name LIKE ?
       ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, enrollment DESC NULLS LAST, name
       LIMIT ?`,
      state.toUpperCase(),
      like,
      prefix,
      limit,
    );
  }

  return all<School>(
    `SELECT * FROM schools
     WHERE name LIKE ?
     ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, enrollment DESC NULLS LAST, name
     LIMIT ?`,
    like,
    prefix,
    limit,
  );
}

export function schoolsInState(state: string, limit = 50): School[] {
  return all<School>(
    'SELECT * FROM schools WHERE state = ? ORDER BY name LIMIT ?',
    state.toUpperCase(),
    limit,
  );
}

export function schoolCount(): number {
  return all<{ n: number }>('SELECT COUNT(*) AS n FROM schools')[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// District resolution, cached on the school record
// ---------------------------------------------------------------------------

export interface ResolvedSchoolDistrict {
  state: string;
  district: number;
  method: string;
  cached: boolean;
}

/**
 * Work out which congressional district a school is in, and remember it.
 *
 * Coordinates first — the CCD ships them for essentially every school and the
 * Census point-in-polygon lookup is far more reliable than address matching.
 * We cache on the school row because this answer only changes with
 * redistricting, and a teacher should not wait on a network call to find out
 * who their Representative is.
 */
export async function resolveSchoolDistrict(
  school: School,
  options: { force?: boolean } = {},
): Promise<ResolvedSchoolDistrict | null> {
  if (!options.force && school.district_state && school.district_number !== null) {
    return {
      state: school.district_state,
      district: school.district_number,
      method: school.district_method ?? 'cached',
      cached: true,
    };
  }

  try {
    const resolution = await resolveDistrict({
      latitude: school.latitude,
      longitude: school.longitude,
      address:
        school.street && school.city
          ? {
              street: school.street,
              city: school.city,
              state: school.state,
              zip: school.zip ?? undefined,
            }
          : undefined,
    });

    run(
      `UPDATE schools
       SET district_state = ?, district_number = ?, district_method = ?, district_resolved_at = ?
       WHERE nces_id = ?`,
      resolution.state.usps,
      resolution.district,
      resolution.method,
      nowIso(),
      school.nces_id,
    );

    return {
      state: resolution.state.usps,
      district: resolution.district,
      method: resolution.method,
      cached: false,
    };
  } catch (err) {
    if (err instanceof DistrictLookupError) return null;
    throw err;
  }
}

/** Record a district a teacher picked by hand, when automatic lookup failed. */
export function setSchoolDistrictManually(ncesId: string, state: string, district: number): void {
  run(
    `UPDATE schools
     SET district_state = ?, district_number = ?, district_method = 'manual', district_resolved_at = ?
     WHERE nces_id = ?`,
    state.toUpperCase(),
    district,
    nowIso(),
    ncesId,
  );
}

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export function lookupDomain(domain: string): SchoolDomain | null {
  return get<SchoolDomain>('SELECT * FROM school_domains WHERE domain = ?', domain.toLowerCase());
}

export function schoolForDomain(domain: string): { school: School; mapping: SchoolDomain } | null {
  const mapping = lookupDomain(domain);
  if (!mapping || !mapping.nces_id || mapping.status === 'rejected') return null;
  const school = getSchool(mapping.nces_id);
  if (!school) return null;
  return { school, mapping };
}

/** Record a teacher's assertion that their domain belongs to a school. */
export function claimDomain(input: {
  domain: string;
  ncesId: string | null;
  userId: string;
  note?: string;
}): SchoolDomain {
  const domain = input.domain.toLowerCase();

  if (isConsumerDomain(domain)) {
    throw new Error(
      `${domain} is a personal email provider, so it cannot identify a school. ` +
        'You can still plan a trip — your school just will not be automatically verified.',
    );
  }

  const existing = lookupDomain(domain);
  if (existing && (existing.status === 'seeded' || existing.status === 'admin_confirmed')) {
    // Already confirmed by someone with more standing than a new claim.
    return existing;
  }

  run(
    `INSERT INTO school_domains (domain, nces_id, status, claimed_by, note, created_at)
     VALUES (?,?,'claimed',?,?,?)
     ON CONFLICT (domain) DO UPDATE SET
       nces_id = excluded.nces_id,
       claimed_by = excluded.claimed_by,
       note = excluded.note`,
    domain,
    input.ncesId,
    input.userId,
    input.note ?? null,
    nowIso(),
  );

  return lookupDomain(domain)!;
}

/** Promote a domain after an administrator on it confirms a trip. */
export function confirmDomain(domain: string, adminEmail: string): void {
  run(
    `UPDATE school_domains
     SET status = 'admin_confirmed', confirmed_by = ?, confirmed_at = ?
     WHERE domain = ? AND status IN ('claimed','seeded')`,
    adminEmail,
    nowIso(),
    domain.toLowerCase(),
  );
}

export function seedDomain(domain: string, ncesId: string, note?: string): void {
  run(
    `INSERT INTO school_domains (domain, nces_id, status, note, created_at)
     VALUES (?,?,'seeded',?,?)
     ON CONFLICT (domain) DO UPDATE SET nces_id = excluded.nces_id, status = 'seeded'`,
    domain.toLowerCase(),
    ncesId,
    note ?? null,
    nowIso(),
  );
}

/**
 * How much a domain proves, in one place, so the UI and the badge logic cannot
 * drift apart.
 */
export function domainTrust(mapping: SchoolDomain | null): {
  level: 'confirmed' | 'claimed' | 'none';
  canEarnVerifiedBadge: boolean;
  explanation: string;
} {
  if (!mapping || mapping.status === 'rejected') {
    return {
      level: 'none',
      canEarnVerifiedBadge: false,
      explanation:
        'We do not have this email domain on file for any school. You can still plan the whole trip; an administrator co-sign is what will get it verified.',
    };
  }

  if (mapping.status === 'seeded' || mapping.status === 'admin_confirmed') {
    return {
      level: 'confirmed',
      canEarnVerifiedBadge: true,
      explanation:
        mapping.status === 'admin_confirmed'
          ? 'A school administrator on this domain has confirmed it belongs to this school.'
          : 'This domain is on our confirmed list for this school.',
    };
  }

  return {
    level: 'claimed',
    canEarnVerifiedBadge: false,
    explanation:
      'This domain was matched to your school by a teacher, but nobody at the school has confirmed it yet. Ask an administrator to co-sign your trip and it becomes a Verified Trip.',
  };
}
