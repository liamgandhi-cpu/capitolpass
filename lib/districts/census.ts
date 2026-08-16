/**
 * Address → congressional district, via the US Census Geocoder.
 *
 * This is the "magic" moment in the product: the teacher never types "who is
 * my representative", the app already knows. So it has to be right, and it has
 * to fail honestly when it is not sure.
 *
 * ----------------------------------------------------------------------------
 * WHY WE PREFER COORDINATES OVER ADDRESSES
 * ----------------------------------------------------------------------------
 * The Geocoder exposes two relevant endpoints. Testing both against real school
 * addresses showed a clear difference:
 *
 *   /geographies/address      — matches against a street-address point file.
 *                               Misses a lot. Two of three real suburban
 *                               addresses we tried returned zero matches.
 *   /geographies/coordinates  — a point-in-polygon lookup against the district
 *                               boundary file. Always answers for a point
 *                               inside the United States.
 *
 * The NCES school directory ships latitude and longitude for every school, so
 * for a school we have already matched we can skip address matching entirely
 * and ask the reliable question. We keep the address path for the fallback case
 * where a teacher types an address for a school we do not have on file.
 *
 * ----------------------------------------------------------------------------
 * DISTRICT BOUNDARIES ARE NOT ZIP CODES
 * ----------------------------------------------------------------------------
 * We never guess a district from a ZIP code. ZIP codes cross district lines
 * routinely, and a wrong guess here sends a teacher's request to an office that
 * will correctly ignore it, because they are not their constituent. When we
 * cannot resolve a district we say so and ask, rather than approximating.
 */

import { stateByFips, type StateRecord } from './states';

const BENCHMARK = 'Public_AR_Current';
const VINTAGE = 'Current_Current';
/** Layer 54 is the current (119th) congressional district boundary layer. */
const CD_LAYER = '54';
const BASE = 'https://geocoding.geo.census.gov/geocoder/geographies';

export interface DistrictResolution {
  state: StateRecord;
  /** 0 for at-large seats, Delegates and the Resident Commissioner. */
  district: number;
  /** Census GEOID, `SSDD`. Kept so a result can be traced back to its source. */
  geoid: string;
  /** How we got here, surfaced in the UI so the teacher can judge it. */
  method: 'coordinates' | 'address';
  /** The address the geocoder actually matched, when it matched one. */
  matchedAddress?: string;
  latitude?: number;
  longitude?: number;
}

export class DistrictLookupError extends Error {
  constructor(
    message: string,
    readonly kind: 'no_match' | 'network' | 'unexpected_response' | 'outside_us',
  ) {
    super(message);
    this.name = 'DistrictLookupError';
  }
}

interface CensusGeography {
  GEOID?: string;
  NAME?: string;
  BASENAME?: string;
  STATE?: string;
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'CapitolPass/0.1' },
    });
  } catch {
    throw new DistrictLookupError(
      'Could not reach the Census geocoder. Check your connection and try again.',
      'network',
    );
  }
  if (!res.ok) {
    throw new DistrictLookupError(
      `Census geocoder returned HTTP ${res.status}.`,
      res.status >= 500 ? 'network' : 'unexpected_response',
    );
  }
  return res.json();
}

/**
 * Pull the district out of a geographies payload.
 *
 * The layer key contains the Congress number ("119th Congressional Districts"),
 * which changes every two years after redistricting. We match on the shape of
 * the key rather than the exact string so a new Congress does not silently
 * break district resolution.
 */
function extractDistrict(geographies: Record<string, CensusGeography[]>): {
  state: StateRecord;
  district: number;
  geoid: string;
} {
  const key = Object.keys(geographies).find((k) => /congressional district/i.test(k));
  const record = key ? geographies[key]?.[0] : undefined;

  if (!record) {
    throw new DistrictLookupError(
      'The Census geocoder found this location but returned no congressional district for it.',
      'unexpected_response',
    );
  }

  const geoid = record.GEOID ?? '';
  if (!/^\d{4}$/.test(geoid)) {
    throw new DistrictLookupError(
      `Census returned an unrecognised district identifier: ${geoid || '(empty)'}.`,
      'unexpected_response',
    );
  }

  const state = stateByFips(geoid.slice(0, 2));
  if (!state) {
    throw new DistrictLookupError(
      `Census returned an unrecognised state code: ${geoid.slice(0, 2)}.`,
      'unexpected_response',
    );
  }

  return { state, district: parseDistrictCode(geoid.slice(2, 4)), geoid };
}

/**
 * The two-digit district half of a GEOID.
 *
 * `00` is an at-large seat. `98` is how Census encodes a Delegate district or
 * the Resident Commissioner district. The congress-legislators dataset files
 * all three of those under `district: 0`, so we normalise to that here and the
 * rest of the app never has to know about the 98.
 */
export function parseDistrictCode(code: string): number {
  if (code === '00' || code === '98') return 0;
  const n = Number(code);
  if (!Number.isInteger(n) || n < 0) {
    throw new DistrictLookupError(`Unrecognised district code: ${code}`, 'unexpected_response');
  }
  return n;
}

/** The reliable path: point-in-polygon against the district boundaries. */
export async function districtByCoordinates(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<DistrictResolution> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new DistrictLookupError('Latitude and longitude must be numbers.', 'unexpected_response');
  }

  const url =
    `${BASE}/coordinates?x=${encodeURIComponent(longitude)}&y=${encodeURIComponent(latitude)}` +
    `&benchmark=${BENCHMARK}&vintage=${VINTAGE}&layers=${CD_LAYER}&format=json`;

  const body = (await getJson(url, signal)) as { result?: { geographies?: Record<string, CensusGeography[]> } };
  const geographies = body?.result?.geographies;

  if (!geographies) {
    throw new DistrictLookupError('Unexpected response from the Census geocoder.', 'unexpected_response');
  }

  const key = Object.keys(geographies).find((k) => /congressional district/i.test(k));
  if (!key || !geographies[key]?.length) {
    throw new DistrictLookupError(
      'That location is not inside a US congressional district. Check the coordinates.',
      'outside_us',
    );
  }

  const { state, district, geoid } = extractDistrict(geographies);
  return { state, district, geoid, method: 'coordinates', latitude, longitude };
}

export interface AddressParts {
  street: string;
  city: string;
  /** USPS abbreviation. */
  state: string;
  zip?: string;
}

/**
 * The fallback path, for schools we do not have coordinates for.
 *
 * Returns null rather than throwing on a miss, because a miss here is expected
 * and routine — the caller is meant to fall back to asking the teacher.
 */
export async function districtByAddress(
  parts: AddressParts,
  signal?: AbortSignal,
): Promise<DistrictResolution | null> {
  const q = new URLSearchParams({
    street: parts.street,
    city: parts.city,
    state: parts.state,
    benchmark: BENCHMARK,
    vintage: VINTAGE,
    layers: CD_LAYER,
    format: 'json',
  });
  if (parts.zip) q.set('zip', parts.zip);

  const body = (await getJson(`${BASE}/address?${q.toString()}`, signal)) as {
    result?: { addressMatches?: Array<{ matchedAddress?: string; coordinates?: { x: number; y: number }; geographies?: Record<string, CensusGeography[]> }> };
  };

  const match = body?.result?.addressMatches?.[0];
  if (!match?.geographies) return null;

  const { state, district, geoid } = extractDistrict(match.geographies);
  return {
    state,
    district,
    geoid,
    method: 'address',
    matchedAddress: match.matchedAddress,
    latitude: match.coordinates?.y,
    longitude: match.coordinates?.x,
  };
}

/**
 * Resolve a district from whatever we know about a school.
 *
 * Coordinates first because they are far more reliable, address second. If both
 * fail we throw, and the caller is expected to fall back to letting the teacher
 * pick their district by hand rather than guessing on their behalf.
 */
export async function resolveDistrict(
  input: { latitude?: number | null; longitude?: number | null; address?: AddressParts },
  signal?: AbortSignal,
): Promise<DistrictResolution> {
  if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
    try {
      return await districtByCoordinates(input.latitude, input.longitude, signal);
    } catch (err) {
      // Fall through to the address path only if we have an address to try.
      if (!input.address) throw err;
    }
  }

  if (input.address) {
    const byAddress = await districtByAddress(input.address, signal);
    if (byAddress) return byAddress;
  }

  throw new DistrictLookupError(
    'We could not work out the congressional district for this address. You can pick your district manually instead.',
    'no_match',
  );
}
