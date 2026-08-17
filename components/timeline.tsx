/**
 * The critical path, drawn to scale.
 *
 * The list underneath this already says everything: eight milestones, each with
 * a date, an explanation and the rules it came from. What a list cannot show is
 * the *shape* of a schedule — that there are six quiet weeks and then three
 * deadlines inside one week, or that the first deadline is nine days away and
 * the trip is in four months. That shape is the thing a teacher needs to see in
 * one glance, and it is the reason to draw this at all rather than to decorate.
 *
 * Inline SVG, server-rendered, no client JavaScript, scales with its container.
 *
 * ACCESSIBILITY. The figure is aria-hidden and the ordered list below it is the
 * accessible representation. That is deliberate: an SVG with eight overlapping
 * tick labels is worse for a screen reader than the list already is good, and
 * duplicating the content would make a reader hear every milestone twice. The
 * figure carries a caption stating what it shows, so nobody is told there is a
 * picture and then denied its content.
 */

import type { Milestone } from '@/lib/feasibility/types';
import { daysBetween, formatShort, type IsoDate } from '@/lib/dates';

/** Status drives fill. Text below the figure always repeats the same facts. */
const STATUS_FILL: Record<Milestone['status'], string> = {
  overdue: 'var(--color-stop-700)',
  due_soon: 'var(--color-warn-700)',
  upcoming: 'var(--color-ink-800)',
};

// A wide, short viewBox. Height is fixed because the drawing is one axis with
// ticks; only the width needs to flex.
const W = 1000;
const H = 132;
const AXIS_Y = 84;
const PAD_L = 8;
const PAD_R = 8;

export function CriticalPathTimeline({
  milestones,
  today,
  tripDate,
}: {
  milestones: Milestone[];
  /** The date the plan was computed against — the left end of the runway. */
  today: IsoDate;
  /** Trip day, the right end. */
  tripDate: IsoDate;
}) {
  if (milestones.length === 0) return null;

  // The runway runs from today to the trip. A milestone can fall outside it —
  // an overdue one sits before today — so the domain is widened to contain
  // everything rather than letting a marker escape the drawing.
  const dates = [today, tripDate, ...milestones.map((m) => m.dueDate)];
  const start = dates.reduce((a, b) => (a < b ? a : b));
  const end = dates.reduce((a, b) => (a > b ? a : b));
  const span = Math.max(daysBetween(start, end), 1);

  const x = (date: IsoDate) =>
    PAD_L + ((W - PAD_L - PAD_R) * daysBetween(start, date)) / span;

  const todayX = x(today);
  const tripX = x(tripDate);

  // Milestones sharing a date would draw one on top of another. Grouping them
  // means the count is visible instead of hidden — and a day carrying three
  // deadlines is exactly the day worth noticing.
  //
  // Trip day is excluded: the critical path ends with a "trip day" milestone,
  // and the accent circle below already marks that date. Drawing both puts a
  // tick underneath the circle at identical coordinates, which reads as a
  // rendering fault rather than as emphasis.
  const groups = new Map<IsoDate, Milestone[]>();
  for (const m of milestones) {
    if (m.dueDate === tripDate) continue;
    const list = groups.get(m.dueDate);
    if (list) list.push(m);
    else groups.set(m.dueDate, [m]);
  }

  const deadlineCount = [...groups.values()].reduce((sum, g) => sum + g.length, 0);
  const next = milestones.find((m) => m.status !== 'upcoming') ?? milestones[0];

  return (
    <figure className="mt-5">
      {/*
        Scrolls rather than shrinks.

        The drawing scales with its container, and the labels scale with it. At
        a phone's width that put "Today" and "Trip day" at roughly six pixels —
        present, correctly positioned, and unreadable. A minimum width keeps the
        type legible and lets the narrow case scroll, which is what the capacity
        strip on the office page already does with the same problem.
      */}
      <div className="overflow-x-auto pb-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-hidden="true"
          className="block min-w-[40rem] overflow-visible"
        >
          {/* The runway from today to trip day. */}
          <line
            x1={todayX}
            y1={AXIS_Y}
            x2={tripX}
            y2={AXIS_Y}
            stroke="var(--color-slate-300)"
            strokeWidth={4}
          />

          {/* Today. A thin full-height rule, because "where am I on this" is the
              first question anyone asks of a schedule. */}
          <line
            x1={todayX}
            y1={AXIS_Y - 34}
            x2={todayX}
            y2={AXIS_Y + 16}
            stroke="var(--color-slate-400)"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
          <text
            x={todayX}
            y={AXIS_Y + 34}
            textAnchor="start"
            className="fill-slate-500 text-[19px] font-bold"
          >
            Today
          </text>

          {/* Each milestone date. */}
          {[...groups.entries()].map(([date, group]) => {
            const cx = x(date);
            const worst =
              group.find((m) => m.status === 'overdue') ??
              group.find((m) => m.status === 'due_soon') ??
              group[0];
            return (
              <g key={date}>
                <line
                  x1={cx}
                  y1={AXIS_Y - 18}
                  x2={cx}
                  y2={AXIS_Y}
                  stroke={STATUS_FILL[worst.status]}
                  strokeWidth={3}
                />
                <circle cx={cx} cy={AXIS_Y - 18} r={9} fill={STATUS_FILL[worst.status]} />
                {group.length > 1 ? (
                  // Centred on the dot itself. Without dominantBaseline the
                  // glyph sits on its baseline and reads as hanging below the
                  // circle rather than inside it.
                  <text
                    x={cx}
                    y={AXIS_Y - 18}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-white text-[15px] font-bold"
                  >
                    {group.length}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Trip day, the thing everything is counted back from. */}
          <circle cx={tripX} cy={AXIS_Y} r={12} fill="var(--color-accent-600)" />
          {/* Clear of the marker row: the ticks sit at AXIS_Y - 18 with r=9, so
              their tops reach AXIS_Y - 27. This baseline keeps the label above
              that even when a marker lands close to trip day. */}
          <text
            x={tripX}
            y={AXIS_Y - 38}
            textAnchor="end"
            className="fill-ink-950 text-[21px] font-bold"
          >
            Trip day
          </text>
          <text
            x={tripX}
            y={AXIS_Y + 34}
            textAnchor="end"
            className="fill-slate-500 text-[19px] font-bold"
          >
            {formatShort(tripDate)}
          </text>
        </svg>
      </div>

      <figcaption className="mt-2 text-sm text-slate-500">
        {deadlineCount} {deadlineCount === 1 ? 'deadline' : 'deadlines'} before trip day on{' '}
        {formatShort(tripDate)}, drawn to scale — a numbered marker is more than one falling on the
        same day. The next is{' '}
        <strong className="text-ink-900">{next.label.toLowerCase()}</strong> on{' '}
        {formatShort(next.dueDate)}. All of them are listed in full below.
      </figcaption>
    </figure>
  );
}
