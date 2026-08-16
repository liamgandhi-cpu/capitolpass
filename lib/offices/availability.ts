/**
 * Published weekly availability.
 *
 * ----------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ----------------------------------------------------------------------------
 * Everything else in this app routes a request to the right place. That is
 * useful and it does not touch the actual scarcity: a congressional office may
 * host one school tour a week, and nobody outside that office can see which
 * weeks are already gone.
 *
 * So two schools in the same district pick the same week, both send a request
 * two months out, and one of them finds out in October that the answer was
 * always going to be no. The information that would have prevented it existed
 * the whole time, on a whiteboard in a district office.
 *
 * This is the smallest thing that fixes it: an office marks a week open, full
 * or closed, and teachers see that *before* they choose their dates rather than
 * after they have committed to them.
 *
 * ----------------------------------------------------------------------------
 * SILENCE IS NOT AVAILABILITY
 * ----------------------------------------------------------------------------
 * The single most important rule here. A week with no row is `unpublished`, and
 * that renders as "this office has not published this week" — never as open.
 *
 * Reading absence as availability would be the same mistake as guessing a tour
 * URL: it manufactures a confident answer out of no information, and the
 * teacher pays for it. Most offices will never publish anything, and the app
 * has to stay completely usable for their constituents, so an unpublished week
 * costs a teacher nothing beyond the advice they would have got anyway.
 */

import { all, get, newId, nowIso, run } from '../db';
import { isoWeekKey, startOfIsoWeek, addDays, type IsoDate } from '../dates';
import { RULES } from '../feasibility/rules.config';

/** What an office has said about a week. `unpublished` is the absence of a row. */
export type WeekStatus = 'open' | 'full' | 'closed' | 'unpublished';

export interface PublishedWeek {
  isoWeek: string;
  weekStart: IsoDate;
  weekEnd: IsoDate;
  status: WeekStatus;
  note: string | null;
  updatedAt: string | null;
}

interface Row {
  iso_week: string;
  status: 'open' | 'full' | 'closed';
  note: string | null;
  updated_at: string;
}

export const WEEK_STATUS_LABEL: Record<WeekStatus, string> = {
  open: 'Open',
  full: 'Full',
  closed: 'Closed',
  unpublished: 'Not published',
};

/**
 * What each status means to a teacher, in their language rather than ours.
 * Rendered directly, so the wording is load-bearing — particularly for
 * `unpublished`, which must never read as a soft no.
 */
export const WEEK_STATUS_MEANING: Record<WeekStatus, string> = {
  open: 'The office has said it can take a school tour this week.',
  full: `The office has already committed its ${RULES.officeSchoolToursPerWeek.value} school tour for this week. Pick another week, or go through the Visitor Center.`,
  closed: 'The office has said it is not hosting tours this week at all.',
  unpublished:
    'This office has not published anything about this week. That is not a no — most offices do not publish at all. Request as normal.',
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function rowsFor(officeId: string): Map<string, Row> {
  const rows = all<Row>(
    'SELECT iso_week, status, note, updated_at FROM office_week_availability WHERE office_id = ?',
    officeId,
  );
  return new Map(rows.map((r) => [r.iso_week, r]));
}

/**
 * A contiguous strip of weeks from `from`, whether or not each is published.
 *
 * Returning every week rather than only the published ones keeps the calendar
 * honest: a scheduler sees the gaps they have not filled in, and a teacher sees
 * that a week is unaddressed rather than being shown a strip with holes in it
 * that invite guessing.
 */
export function publishedWeeks(officeId: string, from: IsoDate, weeks = 12): PublishedWeek[] {
  const published = rowsFor(officeId);
  const out: PublishedWeek[] = [];
  let cursor = startOfIsoWeek(from);

  for (let i = 0; i < weeks; i += 1) {
    const key = isoWeekKey(cursor);
    const row = published.get(key);
    out.push({
      isoWeek: key,
      weekStart: cursor,
      weekEnd: addDays(cursor, 6),
      status: row?.status ?? 'unpublished',
      note: row?.note ?? null,
      updatedAt: row?.updated_at ?? null,
    });
    cursor = addDays(cursor, 7);
  }

  return out;
}

/** What this office has said about the week containing `date`. */
export function weekStatusFor(officeId: string, date: IsoDate): PublishedWeek {
  const key = isoWeekKey(date);
  const row = get<Row>(
    'SELECT iso_week, status, note, updated_at FROM office_week_availability WHERE office_id = ? AND iso_week = ?',
    officeId,
    key,
  );
  const weekStart = startOfIsoWeek(date);
  return {
    isoWeek: key,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    status: row?.status ?? 'unpublished',
    note: row?.note ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

/** Whether an office has published anything at all. Drives the teacher-side UI. */
export function hasPublishedAvailability(officeId: string): boolean {
  const row = get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM office_week_availability WHERE office_id = ?',
    officeId,
  );
  return (row?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export function setWeekStatus(input: {
  officeId: string;
  isoWeek: string;
  status: WeekStatus;
  note?: string | null;
  userId: string;
}): void {
  // Clearing a week deletes the row rather than storing 'unpublished'. The
  // absence of a statement and a statement of absence are different things,
  // and only one of them belongs in the table.
  if (input.status === 'unpublished') {
    run(
      'DELETE FROM office_week_availability WHERE office_id = ? AND iso_week = ?',
      input.officeId,
      input.isoWeek,
    );
    return;
  }

  const note = input.note?.trim() ? input.note.trim().slice(0, 200) : null;

  const existing = get<{ id: string }>(
    'SELECT id FROM office_week_availability WHERE office_id = ? AND iso_week = ?',
    input.officeId,
    input.isoWeek,
  );

  if (existing) {
    run(
      'UPDATE office_week_availability SET status = ?, note = ?, updated_by = ?, updated_at = ? WHERE id = ?',
      input.status,
      note,
      input.userId,
      nowIso(),
      existing.id,
    );
    return;
  }

  run(
    `INSERT INTO office_week_availability (id, office_id, iso_week, status, note, updated_by, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    newId(),
    input.officeId,
    input.isoWeek,
    input.status,
    note,
    input.userId,
    nowIso(),
  );
}
