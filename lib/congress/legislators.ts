/**
 * Members of Congress, loaded from the snapshot in ./data.
 *
 * Source: github.com/unitedstates/congress-legislators (public domain).
 * Refresh with `npm run data:legislators`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stateByUsps, formatDistrict, describeDistrict } from '../districts/states';

export type Chamber = 'house' | 'senate';

export interface Member {
  bioguideId: string;
  name: string;
  firstName: string;
  lastName: string;
  chamber: Chamber;
  state: string;
  /** House only. 0 = at-large, Delegate or Resident Commissioner. */
  district: number | null;
  party: string;
  /** Senate class, 1–3. Senate only. */
  senateClass: number | null;
  /** Official website, e.g. https://subramanyam.house.gov */
  websiteUrl: string | null;
  /**
   * Official contact form URL, when the dataset has one.
   *
   * Reality check: this field is present for only about 16% of members. The
   * spec for this project assumed it covered all 535. It does not, which is
   * exactly why lib/congress/routing.ts exists.
   */
  contactFormUrl: string | null;
  phone: string | null;
  /** DC office, e.g. "1009 Longworth House Office Building". */
  capitolOffice: string | null;
  capitolAddress: string | null;
  photoUrl: string;
  termStart: string;
  termEnd: string;
}

export interface Committee {
  name: string;
  chamber: Chamber | 'joint';
  url: string | null;
  /** The member's role, e.g. "Chairman", "Ranking Member", or null for a seat. */
  title: string | null;
}

export interface DistrictOffice {
  city: string;
  state: string;
  address: string | null;
  phone: string | null;
}

export interface Delegation {
  state: string;
  district: number;
  /** The House member for this district. Null only if the data is incomplete. */
  representative: Member | null;
  /** Empty for DC and the territories, which have no Senators. */
  senators: Member[];
  /** How to write this district in the UI. */
  districtLabel: string;
  districtDescription: string;
  /** True where the House member is a Delegate or Resident Commissioner. */
  delegateOnly: boolean;
}

// ---------------------------------------------------------------------------
// Snapshot loading
// ---------------------------------------------------------------------------

interface RawTerm {
  type: 'rep' | 'sen';
  start: string;
  end: string;
  state: string;
  district?: number;
  class?: number;
  party?: string;
  url?: string;
  contact_form?: string;
  phone?: string;
  address?: string;
  office?: string;
}

interface RawLegislator {
  id: { bioguide: string };
  name: { first: string; last: string; official_full?: string };
  terms: RawTerm[];
}

interface RawCommittee {
  type: string;
  name: string;
  url?: string;
  thomas_id: string;
}

interface RawSnapshot {
  fetchedAt: string;
  legislators: RawLegislator[];
  committees: RawCommittee[];
  membership: Record<string, Array<{ bioguide: string; title?: string }>>;
  offices: Array<{
    id: { bioguide: string };
    offices: Array<{
      address?: string;
      suite?: string;
      city: string;
      state: string;
      phone?: string;
    }>;
  }>;
}

let cache: {
  fetchedAt: string;
  members: Member[];
  byBioguide: Map<string, Member>;
  byStateDistrict: Map<string, Member>;
  senatorsByState: Map<string, Member[]>;
  committeesByBioguide: Map<string, Committee[]>;
  officesByBioguide: Map<string, DistrictOffice[]>;
} | null = null;

function photoUrl(bioguideId: string): string {
  // unitedstates/images — public domain official portraits.
  return `https://unitedstates.github.io/images/congress/225x275/${bioguideId}.jpg`;
}

function toMember(raw: RawLegislator): Member | null {
  const term = raw.terms.at(-1);
  if (!term) return null;

  return {
    bioguideId: raw.id.bioguide,
    name: raw.name.official_full ?? `${raw.name.first} ${raw.name.last}`,
    firstName: raw.name.first,
    lastName: raw.name.last,
    chamber: term.type === 'sen' ? 'senate' : 'house',
    state: term.state,
    district: term.type === 'rep' ? (term.district ?? 0) : null,
    party: term.party ?? 'Unknown',
    senateClass: term.type === 'sen' ? (term.class ?? null) : null,
    websiteUrl: term.url ?? null,
    contactFormUrl: term.contact_form ?? null,
    phone: term.phone ?? null,
    capitolOffice: term.office ?? null,
    capitolAddress: term.address ?? null,
    photoUrl: photoUrl(raw.id.bioguide),
    termStart: term.start,
    termEnd: term.end,
  };
}

function load() {
  if (cache) return cache;

  const file = path.join(process.cwd(), 'data', 'legislators.json');
  let raw: RawSnapshot;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8')) as RawSnapshot;
  } catch {
    throw new Error(
      'Missing data/legislators.json. Run `npm run data:legislators` to download the snapshot.',
    );
  }

  const members = raw.legislators.map(toMember).filter((m): m is Member => m !== null);

  const byBioguide = new Map(members.map((m) => [m.bioguideId, m]));
  const byStateDistrict = new Map<string, Member>();
  const senatorsByState = new Map<string, Member[]>();

  for (const m of members) {
    if (m.chamber === 'house') {
      byStateDistrict.set(`${m.state}-${m.district}`, m);
    } else {
      const list = senatorsByState.get(m.state) ?? [];
      list.push(m);
      senatorsByState.set(m.state, list);
    }
  }
  // Stable order: senior (lower class number is not seniority, so sort by name).
  for (const list of senatorsByState.values()) {
    list.sort((a, b) => a.lastName.localeCompare(b.lastName));
  }

  // Committees, indexed the other way round from how the dataset ships them.
  const committeeMeta = new Map(raw.committees.map((c) => [c.thomas_id, c]));
  const committeesByBioguide = new Map<string, Committee[]>();
  for (const [thomasId, seats] of Object.entries(raw.membership ?? {})) {
    // Subcommittee ids are the parent id plus digits; keep full committees only,
    // since a student view listing 40 subcommittees helps nobody.
    const meta = committeeMeta.get(thomasId);
    if (!meta) continue;
    for (const seat of seats) {
      const list = committeesByBioguide.get(seat.bioguide) ?? [];
      list.push({
        name: meta.name,
        chamber: meta.type === 'joint' ? 'joint' : meta.type === 'senate' ? 'senate' : 'house',
        url: meta.url ?? null,
        title: seat.title ?? null,
      });
      committeesByBioguide.set(seat.bioguide, list);
    }
  }
  for (const list of committeesByBioguide.values()) {
    // Leadership roles first, then alphabetical.
    list.sort((a, b) => (a.title ? 0 : 1) - (b.title ? 0 : 1) || a.name.localeCompare(b.name));
  }

  const officesByBioguide = new Map<string, DistrictOffice[]>();
  for (const entry of raw.offices ?? []) {
    officesByBioguide.set(
      entry.id.bioguide,
      (entry.offices ?? []).map((o) => ({
        city: o.city,
        state: o.state,
        address: [o.address, o.suite].filter(Boolean).join(', ') || null,
        phone: o.phone ?? null,
      })),
    );
  }

  cache = {
    fetchedAt: raw.fetchedAt,
    members,
    byBioguide,
    byStateDistrict,
    senatorsByState,
    committeesByBioguide,
    officesByBioguide,
  };
  return cache;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function snapshotFetchedAt(): string {
  return load().fetchedAt;
}

export function allMembers(): Member[] {
  return load().members;
}

export function memberByBioguide(id: string): Member | null {
  return load().byBioguide.get(id) ?? null;
}

export function representativeFor(state: string, district: number): Member | null {
  return load().byStateDistrict.get(`${state.toUpperCase()}-${district}`) ?? null;
}

export function senatorsFor(state: string): Member[] {
  return load().senatorsByState.get(state.toUpperCase()) ?? [];
}

export function committeesFor(bioguideId: string): Committee[] {
  return load().committeesByBioguide.get(bioguideId) ?? [];
}

export function districtOfficesFor(bioguideId: string): DistrictOffice[] {
  return load().officesByBioguide.get(bioguideId) ?? [];
}

/**
 * Everyone who represents one school: one House member, and two Senators
 * unless the school is in DC or a territory.
 */
export function delegationFor(state: string, district: number): Delegation {
  const usps = state.toUpperCase();
  const stateRecord = stateByUsps(usps);

  return {
    state: usps,
    district,
    representative: representativeFor(usps, district),
    senators: stateRecord?.hasSenators === false ? [] : senatorsFor(usps),
    districtLabel: formatDistrict(usps, district),
    districtDescription: describeDistrict(usps, district),
    delegateOnly: stateRecord?.delegateOnly ?? false,
  };
}

/** Search members by name, for the manual-fallback picker. */
export function searchMembers(query: string, limit = 10): Member[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return load()
    .members.filter((m) => m.name.toLowerCase().includes(q))
    .slice(0, limit);
}
