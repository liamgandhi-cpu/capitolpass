/**
 * The front-doors page states numbers as findings — "537 offices, 92 distinct
 * paths". A finding that silently drifts when the snapshot is rebuilt is worse
 * than no finding, so the invariants are asserted here rather than trusted.
 *
 * These deliberately assert *relationships*, not the literal 92, so rebuilding
 * data/tour-routes.json does not fail the suite for being newer. The one place
 * a literal belongs is the trailing-slash rule, which is a decision rather than
 * an observation.
 */

import { describe, expect, it } from 'vitest';
import { buildCoverage, normalisePath } from '../coverage';
import { allMembers } from '../legislators';

describe('normalisePath', () => {
  it('treats a trailing slash as the same path', () => {
    // Without this, /forms/tourrequest and /forms/tourrequest/ count as two
    // patterns, which inflates the headline number and makes the claim less
    // true rather than more impressive.
    expect(normalisePath('https://x.house.gov/forms/tourrequest')).toBe('/forms/tourrequest');
    expect(normalisePath('https://x.house.gov/forms/tourrequest/')).toBe('/forms/tourrequest');
  });

  it('is case-insensitive and ignores query and fragment', () => {
    expect(normalisePath('https://x.house.gov/Services/Tours-And-Tickets?a=1#b')).toBe(
      '/services/tours-and-tickets',
    );
  });

  it('keeps the root path distinguishable from nothing', () => {
    expect(normalisePath('https://x.house.gov/')).toBe('/');
    expect(normalisePath('https://x.house.gov')).toBe('/');
  });

  it('returns null rather than throwing on a malformed URL', () => {
    expect(normalisePath('not a url')).toBeNull();
    expect(normalisePath('')).toBeNull();
  });
});

describe('buildCoverage', () => {
  const coverage = buildCoverage();

  it('accounts for every current member exactly once', () => {
    const members = allMembers();
    expect(coverage.total).toBe(members.length);

    const counted = Object.values(coverage.byConfidence).reduce((a, b) => a + b, 0);
    expect(counted).toBe(coverage.total);

    const inStates = coverage.states.reduce((sum, s) => sum + s.offices.length, 0);
    expect(inStates).toBe(coverage.total);
  });

  it('never strands an office — every one resolves to some confidence level', () => {
    // The whole point of the resolution chain is that there is no fifth
    // outcome where a teacher gets nothing.
    for (const state of coverage.states) {
      for (const office of state.offices) {
        expect(['verified', 'contact_form', 'website', 'unknown']).toContain(office.confidence);
      }
    }
  });

  it('only counts a path for a verified route', () => {
    for (const state of coverage.states) {
      for (const office of state.offices) {
        if (office.confidence !== 'verified') expect(office.path).toBeNull();
      }
    }
  });

  it('counts paths that sum to the number of verified offices', () => {
    const summed = coverage.paths.reduce((sum, p) => sum + p.count, 0);
    expect(summed).toBe(coverage.byConfidence.verified);
    expect(coverage.distinctPaths).toBe(coverage.paths.length);
  });

  it('finds genuine variety rather than one path with a rounding error', () => {
    // The claim the page makes is that there is no standard. If this ever
    // collapses toward a handful of paths, the page is telling a story the data
    // no longer supports and should be rewritten.
    expect(coverage.distinctPaths).toBeGreaterThan(50);
    const top = coverage.paths[0];
    expect(top.count).toBeLessThan(coverage.byConfidence.verified);
  });

  it('orders paths and wordings most common first', () => {
    for (let i = 1; i < coverage.paths.length; i += 1) {
      expect(coverage.paths[i - 1].count).toBeGreaterThanOrEqual(coverage.paths[i].count);
    }
    for (let i = 1; i < coverage.wordings.length; i += 1) {
      expect(coverage.wordings[i - 1].count).toBeGreaterThanOrEqual(coverage.wordings[i].count);
    }
  });

  it('reports a percentage consistent with the counts', () => {
    const expected = Math.round((coverage.byConfidence.verified / coverage.total) * 1000) / 10;
    expect(coverage.verifiedPercent).toBe(expected);
    expect(coverage.verifiedPercent).toBeGreaterThan(0);
    expect(coverage.verifiedPercent).toBeLessThanOrEqual(100);
  });

  it('lists each state once, sorted, with House before Senate', () => {
    const names = coverage.states.map((s) => s.state);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(names);

    for (const state of coverage.states) {
      const firstSenate = state.offices.findIndex((o) => o.chamber === 'senate');
      if (firstSenate === -1) continue;
      // Nothing from the House may appear after the first Senator.
      expect(state.offices.slice(firstSenate).every((o) => o.chamber === 'senate')).toBe(true);
    }
  });

  it('is pure — same input, same summary', () => {
    const again = buildCoverage();
    expect(again).toEqual(coverage);
  });
});
