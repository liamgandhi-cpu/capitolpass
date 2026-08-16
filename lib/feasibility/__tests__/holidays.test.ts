import { describe, expect, it } from 'vitest';
import { federalHolidays, holidayOn, isFederalHoliday } from '../holidays';
import { dayOfWeek, isoWeekKey, previousWeekday, daysBetween, addDays } from '../../dates';

describe('federal holidays', () => {
  it('produces all eleven statutory holidays', () => {
    expect(federalHolidays(2026)).toHaveLength(11);
  });

  it('computes the floating holidays for 2026', () => {
    const byId = Object.fromEntries(federalHolidays(2026).map((h) => [h.id, h.observed]));
    expect(byId.mlk_day).toBe('2026-01-19'); // 3rd Monday in January
    expect(byId.washingtons_birthday).toBe('2026-02-16'); // 3rd Monday in February
    expect(byId.memorial_day).toBe('2026-05-25'); // last Monday in May
    expect(byId.labor_day).toBe('2026-09-07'); // 1st Monday in September
    expect(byId.columbus_day).toBe('2026-10-12'); // 2nd Monday in October
    expect(byId.thanksgiving).toBe('2026-11-26'); // 4th Thursday in November
  });

  it('shifts a Saturday holiday to the preceding Friday', () => {
    // 2026-07-04 is a Saturday.
    const july4 = federalHolidays(2026).find((h) => h.id === 'independence_day')!;
    expect(dayOfWeek(july4.date)).toBe(6);
    expect(july4.observed).toBe('2026-07-03');
    expect(isFederalHoliday('2026-07-03')).toBe(true);
    expect(isFederalHoliday('2026-07-04')).toBe(false); // the Saturday itself is not the closure
  });

  it('shifts a Sunday holiday to the following Monday', () => {
    // 2027-12-25 is a Saturday; 2021-12-25 was a Saturday too. Use 2022-12-25 (Sunday).
    const xmas = federalHolidays(2022).find((h) => h.id === 'christmas_day')!;
    expect(dayOfWeek(xmas.date)).toBe(0);
    expect(xmas.observed).toBe('2022-12-26');
  });

  it('finds a New Year’s Day observed in the previous calendar year', () => {
    // 2022-01-01 was a Saturday, so it was observed Friday 2021-12-31.
    const hit = holidayOn('2021-12-31');
    expect(hit?.id).toBe('new_years_day');
  });

  it('never shifts a floating holiday, since it is already a weekday', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      for (const h of federalHolidays(year)) {
        expect(dayOfWeek(h.observed)).not.toBe(0);
        expect(dayOfWeek(h.observed)).not.toBe(6);
      }
    }
  });
});

describe('date helpers', () => {
  it('steps deadlines back off the weekend', () => {
    expect(previousWeekday('2026-04-18')).toBe('2026-04-17'); // Sat -> Fri
    expect(previousWeekday('2026-04-19')).toBe('2026-04-17'); // Sun -> Fri
    expect(previousWeekday('2026-04-17')).toBe('2026-04-17'); // Fri stays
  });

  it('counts whole calendar days, unaffected by daylight saving', () => {
    // US DST began 2026-03-08. A naive local-time diff loses an hour here.
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(daysBetween('2026-04-14', '2026-04-14')).toBe(0);
    expect(daysBetween('2026-04-14', '2026-04-13')).toBe(-1);
  });

  it('round-trips through addDays across a year boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
  });

  it('buckets dates into ISO weeks, which is how offices count their one tour', () => {
    // Monday and the following Sunday are the same ISO week.
    expect(isoWeekKey('2026-04-13')).toBe(isoWeekKey('2026-04-19'));
    // The next Monday is not.
    expect(isoWeekKey('2026-04-20')).not.toBe(isoWeekKey('2026-04-19'));
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
  });
});
