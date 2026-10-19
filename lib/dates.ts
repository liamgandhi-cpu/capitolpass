/**
 * Date helpers for CapitolPass.
 *
 * Every date in the planning layer is a calendar date ("2026-04-14"), never an
 * instant. Trip dates, deadlines and office booking weeks are all things a human
 * writes on a wall calendar, so we anchor every parsed date to 12:00 UTC. That
 * makes the arithmetic immune to daylight-saving shifts and to the server's
 * timezone, which is the usual source of "the deadline moved by one day" bugs.
 */

export type IsoDate = string; // YYYY-MM-DD

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const d = parseDate(value);
  return toIsoDate(d) === value;
}

/** Parse `YYYY-MM-DD` to a Date anchored at 12:00 UTC. Throws on malformed input. */
export function parseDate(value: IsoDate): Date {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new TypeError(`Expected a YYYY-MM-DD date, received: ${String(value)}`);
  }
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = parseDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** Whole calendar days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(value: IsoDate): number {
  return parseDate(value).getUTCDay();
}

export function isWeekend(value: IsoDate): boolean {
  const d = dayOfWeek(value);
  return d === 0 || d === 6;
}

/** Step backwards to the nearest weekday, so deadlines never land on a Saturday. */
export function previousWeekday(value: IsoDate): IsoDate {
  let out = value;
  while (isWeekend(out)) out = addDays(out, -1);
  return out;
}

/**
 * ISO-8601 week identifier, e.g. "2026-W16".
 *
 * Congressional offices limit how many tours they run per *week*, so requests
 * have to be bucketed into a week key that both sides agree on. ISO weeks run
 * Monday–Sunday, which matches how a scheduler thinks about their week.
 */
export function isoWeekKey(value: IsoDate): string {
  // Shift to the Thursday of the same week; the year of that Thursday is the
  // ISO week-numbering year by definition.
  const d = parseDate(value);
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 12, 0, 0, 0));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Monday of the ISO week containing `value`. */
export function startOfIsoWeek(value: IsoDate): IsoDate {
  const dayNum = (dayOfWeek(value) + 6) % 7; // Monday = 0
  return addDays(value, -dayNum);
}

/**
 * Formatters are cached per BCP-47 tag.
 *
 * Constructing an Intl.DateTimeFormat is not cheap and these run inside list
 * renders, so the common tags are built once. The default stays en-US: only the
 * student and family pages are translated, and every other caller passes
 * nothing.
 *
 * A Spanish page showing "Tuesday, December 1, 2026" is the kind of seam that
 * tells a reader the translation is a veneer, so the date has to move with the
 * copy.
 */
const LONG_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
};

const SHORT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
};

const longCache = new Map<string, Intl.DateTimeFormat>();
const shortCache = new Map<string, Intl.DateTimeFormat>();

function formatter(
  cache: Map<string, Intl.DateTimeFormat>,
  options: Intl.DateTimeFormatOptions,
  locale: string,
): Intl.DateTimeFormat {
  const existing = cache.get(locale);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat(locale, options);
  cache.set(locale, created);
  return created;
}

export function formatLong(value: IsoDate, locale = 'en-US'): string {
  return formatter(longCache, LONG_OPTIONS, locale).format(parseDate(value));
}

export function formatShort(value: IsoDate, locale = 'en-US'): string {
  return formatter(shortCache, SHORT_OPTIONS, locale).format(parseDate(value));
}

/** "in 42 days" / "12 days ago" / "today", for deadline copy. */
export function relativeDays(from: IsoDate, to: IsoDate): string {
  const n = daysBetween(from, to);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${Math.abs(n)} days ago`;
}
