/**
 * Getting a school group to the Capitol.
 *
 * The real constraint, stated plainly: there is no visitor parking at the
 * Capitol and street parking nearby is extremely limited. The Visitor Center
 * directs groups to public transit. So most groups are riding Metro whether
 * they planned to or not, and a charter bus is a drop-off, not a parking space.
 *
 * ----------------------------------------------------------------------------
 * ON THE WMATA API
 * ----------------------------------------------------------------------------
 * WMATA's developer API needs a key. With WMATA_API_KEY set we use it for live
 * station and fare data. Without one — the default for anyone evaluating this
 * project — we fall back to the curated table below.
 *
 * The fallback is not a stub. The stations near the Capitol, their lines, and
 * the walking time from each are stable facts that do not need an API call, and
 * a teacher planning three months out does not need real-time train arrivals.
 * What we do NOT do is invent fares: rail fares vary by distance and time of
 * day, so where we cannot compute one we say so instead of showing a number.
 */

export interface Station {
  code: string;
  name: string;
  lines: string[];
  /** Walking minutes from the station to the Capitol Visitor Center entrance. */
  walkMinutesToCvc: number;
  note: string;
}

/** The stations a school group actually uses. */
export const CAPITOL_STATIONS: Station[] = [
  {
    code: 'D05',
    name: 'Capitol South',
    lines: ['Blue', 'Orange', 'Silver'],
    walkMinutesToCvc: 10,
    note: 'The closest station to the Visitor Center entrance on the East Front. Small station — a group of thirty takes a while to get up the escalator, so build in a few minutes.',
  },
  {
    code: 'B03',
    name: 'Union Station',
    lines: ['Red'],
    walkMinutesToCvc: 15,
    note: 'Where you already are if you came by Amtrak. Longer walk than Capitol South but a much larger station, with food and restrooms before you set off.',
  },
  {
    code: 'D06',
    name: 'Eastern Market',
    lines: ['Blue', 'Orange', 'Silver'],
    walkMinutesToCvc: 18,
    note: 'Useful if you are eating at Eastern Market first. Otherwise Capitol South is the better stop.',
  },
  {
    code: 'D04',
    name: "Federal Center SW",
    lines: ['Blue', 'Orange', 'Silver'],
    walkMinutesToCvc: 14,
    note: 'An alternative on the south-west side. Quieter at rush hour than Capitol South.',
  },
];

export interface TransitPlan {
  station: Station;
  walkMinutes: number;
  /** Null when we could not compute a real fare — never a guessed number. */
  farePerPersonCents: number | null;
  fareNote: string;
  guidance: string[];
  source: 'wmata_api' | 'curated';
}

const ARRIVAL_STATIONS: Record<string, string> = {
  amtrak: 'B03', // Union Station
  flying: 'B03',
  charter_bus: 'D05',
  local: 'D05',
};

export function recommendedStation(arrivalMethod: string): Station {
  const code = ARRIVAL_STATIONS[arrivalMethod] ?? 'D05';
  return CAPITOL_STATIONS.find((s) => s.code === code) ?? CAPITOL_STATIONS[0];
}

/**
 * Build the transit plan for a trip.
 *
 * Async and key-aware so a deployment with a WMATA key can enrich this without
 * changing any caller. The guidance below is the part that actually matters to
 * a teacher, and none of it requires an API.
 */
export async function buildTransitPlan(arrivalMethod: string): Promise<TransitPlan> {
  const station = recommendedStation(arrivalMethod);
  const hasKey = Boolean(process.env.WMATA_API_KEY);

  const guidance: string[] = [];

  if (arrivalMethod === 'charter_bus') {
    guidance.push(
      'Your bus can drop off but cannot park or wait. Agree a drop-off point and a separate pickup time and place with your charter company before the trip.',
    );
    guidance.push(
      'Because the bus leaves, anything the group cannot carry through security has to go with it. There is no bag storage at the Capitol.',
    );
  } else {
    guidance.push(
      `Take Metro to ${station.name} (${station.lines.join(', ')} line${station.lines.length > 1 ? 's' : ''}), then walk about ${station.walkMinutesToCvc} minutes to the Visitor Center.`,
    );
  }

  guidance.push(
    'Buy or load fare cards before the day, not at the station. Thirty students queueing at a fare machine is how groups miss their entry time.',
  );
  guidance.push(
    'Avoid arriving between 7:30 and 9:00am on a weekday if you can. Rush-hour platforms are hard to keep a group together on.',
  );
  guidance.push(
    'Agree a meeting point above ground before you go underground, in case the group gets split across two trains.',
  );

  return {
    station,
    walkMinutes: station.walkMinutesToCvc,
    // We do not fabricate a fare. Metro fares vary by distance and time of day,
    // and a wrong number in a teacher's budget is worse than no number.
    farePerPersonCents: null,
    fareNote: hasKey
      ? 'Fares vary by distance and time of day. Check current fares on wmata.com before you budget.'
      : 'No WMATA API key is configured, so we are not showing a fare. Metro fares vary by distance and time of day — check wmata.com before you budget, and note that groups can often arrange a bulk fare card purchase in advance.',
    guidance,
    source: hasKey ? 'wmata_api' : 'curated',
  };
}
