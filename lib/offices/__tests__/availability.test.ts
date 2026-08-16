/**
 * Published availability, tested against a real (temporary) database.
 *
 * The rest of the suite is pure, but the load-bearing rule here is a storage
 * decision — that an unpublished week is the *absence of a row*, not a row
 * saying "unpublished" — and asserting that without touching the database would
 * be asserting nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'capitolpass-test-'));
// Must be set before lib/db is imported: it reads the path when it opens the
// handle, and the handle is process-wide.
process.env.CAPITOLPASS_DB = path.join(dir, 'test.db');

const { migrate, run, nowIso } = await import('../../db');
const {
  publishedWeeks,
  setWeekStatus,
  weekStatusFor,
  hasPublishedAvailability,
  WEEK_STATUS_MEANING,
} = await import('../availability');

const OFFICE = 'office-under-test';
const USER = 'user-under-test';

beforeAll(() => {
  migrate();
  run(
    `INSERT INTO offices (id, bioguide_id, chamber, state, district, member_name, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    OFFICE,
    'T000001',
    'house',
    'VA',
    10,
    'Test Member',
    nowIso(),
  );
  run(
    `INSERT INTO users (id, email, name, role, created_at) VALUES (?,?,?,?,?)`,
    USER,
    'scheduler@mail.house.gov',
    'Test Scheduler',
    'staff',
    nowIso(),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('silence is not availability', () => {
  it('reports an untouched week as unpublished, never as open', () => {
    const week = weekStatusFor(OFFICE, '2026-05-12');
    expect(week.status).toBe('unpublished');
    expect(week.note).toBeNull();
  });

  it('tells a teacher plainly that unpublished is not a no', () => {
    // This wording is load-bearing. Most offices will never publish anything,
    // and their constituents must not read the app as saying they cannot go.
    const meaning = WEEK_STATUS_MEANING.unpublished.toLowerCase();
    expect(meaning).toContain('not a no');
  });

  it('has no availability at all before anything is published', () => {
    expect(hasPublishedAvailability(OFFICE)).toBe(false);
  });
});

describe('setWeekStatus', () => {
  it('stores a status and a note, and reads them back', () => {
    setWeekStatus({
      officeId: OFFICE,
      isoWeek: '2026-W20',
      status: 'full',
      note: '  Already hosting a school.  ',
      userId: USER,
    });

    const week = weekStatusFor(OFFICE, '2026-05-12'); // falls in 2026-W20
    expect(week.isoWeek).toBe('2026-W20');
    expect(week.status).toBe('full');
    expect(week.note).toBe('Already hosting a school.');
    expect(hasPublishedAvailability(OFFICE)).toBe(true);
  });

  it('updates in place rather than accumulating rows', () => {
    setWeekStatus({ officeId: OFFICE, isoWeek: '2026-W20', status: 'open', userId: USER });
    const week = weekStatusFor(OFFICE, '2026-05-12');
    expect(week.status).toBe('open');
    // The note from the previous statement must not survive a new one — an
    // office that reopens a week should not still be telling teachers it is
    // hosting someone else.
    expect(week.note).toBeNull();
  });

  it('deletes the row when a week is cleared, rather than storing a third state', () => {
    setWeekStatus({ officeId: OFFICE, isoWeek: '2026-W20', status: 'unpublished', userId: USER });
    expect(weekStatusFor(OFFICE, '2026-05-12').status).toBe('unpublished');
    expect(hasPublishedAvailability(OFFICE)).toBe(false);
  });

  it('truncates an over-long note instead of rejecting the update', () => {
    setWeekStatus({
      officeId: OFFICE,
      isoWeek: '2026-W21',
      status: 'closed',
      note: 'x'.repeat(500),
      userId: USER,
    });
    expect(weekStatusFor(OFFICE, '2026-05-19').note).toHaveLength(200);
  });
});

describe('publishedWeeks', () => {
  it('returns a contiguous strip including the weeks nobody has spoken about', () => {
    const weeks = publishedWeeks(OFFICE, '2026-05-04', 6);
    expect(weeks).toHaveLength(6);

    // Contiguous: each week starts exactly seven days after the last.
    for (let i = 1; i < weeks.length; i += 1) {
      const prev = new Date(`${weeks[i - 1].weekStart}T00:00:00Z`).getTime();
      const curr = new Date(`${weeks[i].weekStart}T00:00:00Z`).getTime();
      expect(curr - prev).toBe(7 * 86_400_000);
    }

    // A gap must render as unpublished rather than being omitted, so a
    // scheduler can see what they have not answered.
    const statuses = weeks.map((w) => w.status);
    expect(statuses).toContain('unpublished');
    expect(statuses).toContain('closed');
  });

  it('spans a week from Monday to Sunday', () => {
    const [week] = publishedWeeks(OFFICE, '2026-05-13', 1);
    expect(new Date(`${week.weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${week.weekEnd}T00:00:00Z`).getUTCDay()).toBe(0);
  });

  it('keeps offices separate', () => {
    const other = 'other-office';
    run(
      `INSERT INTO offices (id, bioguide_id, chamber, state, district, member_name, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      other,
      'T000002',
      'house',
      'VA',
      11,
      'Other Member',
      nowIso(),
    );
    expect(hasPublishedAvailability(other)).toBe(false);
    expect(weekStatusFor(other, '2026-05-19').status).toBe('unpublished');
    // The original office still has its statement.
    expect(weekStatusFor(OFFICE, '2026-05-19').status).toBe('closed');
  });
});
