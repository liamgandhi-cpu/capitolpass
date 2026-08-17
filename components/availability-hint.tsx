/**
 * What the teacher's own office has said about upcoming weeks, shown while they
 * are still choosing dates.
 *
 * This is the placement that matters. Seeing "the week you picked is already
 * gone" on the plan afterwards is useful; seeing it *before* you commit three
 * dates and a permission slip is the whole point of an office publishing
 * anything at all.
 *
 * Renders nothing at all when there is nothing to say — no district resolved
 * yet, no claimed office, or an office that has published nothing. Most offices
 * will publish nothing, and an empty box explaining its own emptiness on every
 * intake form would be worse than no box.
 */

import { formatShort, type IsoDate } from '@/lib/dates';
import { representativeFor } from '@/lib/congress/legislators';
import { officeByBioguide } from '@/lib/offices';
import {
  publishedWeeks,
  WEEK_STATUS_LABEL,
  type PublishedWeek,
} from '@/lib/offices/availability';
import { StatusPill, type StatusTone } from '@/components/ui';

const TONE: Record<PublishedWeek['status'], StatusTone> = {
  open: 'ok',
  full: 'warn',
  closed: 'stop',
  unpublished: 'neutral',
};

export function OfficeAvailabilityHint({
  districtState,
  districtNumber,
  from,
  weeks = 20,
}: {
  districtState: string | null;
  districtNumber: number | null;
  from: IsoDate;
  weeks?: number;
}) {
  if (!districtState || districtNumber === null) return null;

  const representative = representativeFor(districtState, districtNumber);
  if (!representative) return null;

  const office = officeByBioguide(representative.bioguideId);
  if (!office) return null;

  // Only the weeks the office has actually spoken about. Listing the silent
  // ones here would pad the form with rows that say nothing, and risk reading
  // as a refusal — see lib/offices/availability.ts on why silence is not a no.
  const spoken = publishedWeeks(office.id, from, weeks).filter(
    (w) => w.status !== 'unpublished',
  );
  if (spoken.length === 0) return null;

  return (
    <div className="mt-5 border-2 border-ink-900 p-5">
      <h3 className="text-lg font-bold">
        {representative.name}&rsquo;s office has published its availability
      </h3>
      <p className="mt-1 text-slate-600">
        They can host {office.weekly_tour_limit} school tour a week, and they have said which of
        the next few weeks are free. Picking an open week here is the single biggest thing you can
        do to get a yes. Weeks they have not mentioned are not a no.
      </p>

      <ul className="mt-4 space-y-2">
        {spoken.map((week) => (
          <li key={week.isoWeek} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <StatusPill tone={TONE[week.status]}>{WEEK_STATUS_LABEL[week.status]}</StatusPill>
            <span className="font-bold">
              {formatShort(week.weekStart).replace(/, \d{4}$/, '')} –{' '}
              {formatShort(week.weekEnd)}
            </span>
            {week.note ? <span className="text-sm text-slate-600">{week.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
