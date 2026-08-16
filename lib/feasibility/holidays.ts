/**
 * US federal holidays, computed rather than hardcoded.
 *
 * The Capitol Visitor Center is closed on federal holidays, so a trip date that
 * lands on one is not a "high risk" date — it is simply impossible, and the
 * teacher needs to know that before they collect thirty permission slips.
 *
 * Rules encoded here come from 5 U.S.C. 6103. The "observed" shift (Saturday
 * holidays observed the preceding Friday, Sunday holidays the following Monday)
 * is the federal-employee rule from Executive Order 11582; it matters because a
 * building staffed by federal employees closes on the observed day.
 */

import { addDays, dayOfWeek, toIsoDate, type IsoDate } from '../dates';

export interface FederalHoliday {
  /** Stable machine name, e.g. `juneteenth`. */
  id: string;
  name: string;
  /** The statutory date. */
  date: IsoDate;
  /** The date federal offices actually close, after weekend shifting. */
  observed: IsoDate;
}

/** Date of the `n`th `weekday` in a month. `n` is 1-based. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): IsoDate {
  const first = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  first.setUTCDate(1 + offset + (n - 1) * 7);
  return toIsoDate(first);
}

/** Date of the last `weekday` in a month. */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): IsoDate {
  const last = new Date(Date.UTC(year, month, 0, 12, 0, 0, 0)); // day 0 = last day of prev month
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  last.setUTCDate(last.getUTCDate() - offset);
  return toIsoDate(last);
}

/** Apply the federal weekend-observance shift. */
function observedDate(date: IsoDate): IsoDate {
  const d = dayOfWeek(date);
  if (d === 6) return addDays(date, -1); // Saturday -> observed Friday
  if (d === 0) return addDays(date, 1); // Sunday -> observed Monday
  return date;
}

function fixed(id: string, name: string, year: number, month: number, day: number): FederalHoliday {
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { id, name, date, observed: observedDate(date) };
}

function floating(id: string, name: string, date: IsoDate): FederalHoliday {
  // Floating holidays are defined as a specific weekday, so they never need the
  // weekend shift — the statutory date is already the observed date.
  return { id, name, date, observed: date };
}

export function federalHolidays(year: number): FederalHoliday[] {
  return [
    fixed('new_years_day', "New Year's Day", year, 1, 1),
    floating('mlk_day', 'Birthday of Martin Luther King, Jr.', nthWeekdayOfMonth(year, 1, 1, 3)),
    floating('washingtons_birthday', "Washington's Birthday", nthWeekdayOfMonth(year, 2, 1, 3)),
    floating('memorial_day', 'Memorial Day', lastWeekdayOfMonth(year, 5, 1)),
    fixed('juneteenth', 'Juneteenth National Independence Day', year, 6, 19),
    fixed('independence_day', 'Independence Day', year, 7, 4),
    floating('labor_day', 'Labor Day', nthWeekdayOfMonth(year, 9, 1, 1)),
    floating('columbus_day', 'Columbus Day', nthWeekdayOfMonth(year, 10, 1, 2)),
    fixed('veterans_day', 'Veterans Day', year, 11, 11),
    floating('thanksgiving', 'Thanksgiving Day', nthWeekdayOfMonth(year, 11, 4, 4)),
    fixed('christmas_day', 'Christmas Day', year, 12, 25),
  ];
}

/**
 * The holiday closing a given date, if any.
 *
 * Checks the neighbouring years too: a January 1st that falls on a Saturday is
 * observed on December 31st of the *previous* year.
 */
export function holidayOn(date: IsoDate): FederalHoliday | null {
  const year = Number(date.slice(0, 4));
  for (const y of [year - 1, year, year + 1]) {
    const hit = federalHolidays(y).find((h) => h.observed === date);
    if (hit) return hit;
  }
  return null;
}

export function isFederalHoliday(date: IsoDate): boolean {
  return holidayOn(date) !== null;
}
