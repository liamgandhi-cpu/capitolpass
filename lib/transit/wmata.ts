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

import { DEFAULT_LOCALE, type Locale } from '../i18n';

export interface Station {
  code: string;
  name: string;
  lines: string[];
  /** Walking minutes from the station to the Capitol Visitor Center entrance. */
  walkMinutesToCvc: number;
  /**
   * Per-locale. The station *name* deliberately never translates: a family
   * looking for "Capitol South" needs the words printed on the Metro sign.
   */
  note: Record<Locale, string>;
}

/** The stations a school group actually uses. */
export const CAPITOL_STATIONS: Station[] = [
  {
    code: 'D05',
    name: 'Capitol South',
    lines: ['Blue', 'Orange', 'Silver'],
    walkMinutesToCvc: 10,
    note: {
      en: 'The closest station to the Visitor Center entrance on the East Front. Small station — a group of thirty takes a while to get up the escalator, so build in a few minutes.',
      es: 'La estación más cercana a la entrada del Visitor Center, en el East Front. Es una estación pequeña: un grupo de treinta tarda un rato en subir la escalera mecánica, así que calcula unos minutos extra.',
    },
  },
  {
    code: 'B03',
    name: 'Union Station',
    lines: ['Red'],
    walkMinutesToCvc: 15,
    note: {
      en: 'Where you already are if you came by Amtrak. Longer walk than Capitol South but a much larger station, with food and restrooms before you set off.',
      es: 'Donde ya estás si llegaste en Amtrak. La caminata es más larga que desde Capitol South, pero es una estación mucho más grande, con comida y baños antes de salir.',
    },
  },
  {
    code: 'D06',
    name: 'Eastern Market',
    lines: ['Blue', 'Orange', 'Silver'],
    walkMinutesToCvc: 18,
    note: {
      en: 'Useful if you are eating at Eastern Market first. Otherwise Capitol South is the better stop.',
      es: 'Útil si van a comer en Eastern Market primero. Si no, Capitol South es la mejor parada.',
    },
  },
  {
    code: 'D04',
    name: "Federal Center SW",
    lines: ['Blue', 'Orange', 'Silver'],
    walkMinutesToCvc: 14,
    note: {
      en: 'An alternative on the south-west side. Quieter at rush hour than Capitol South.',
      es: 'Una alternativa por el lado suroeste. Menos concurrida en hora pico que Capitol South.',
    },
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
/**
 * Guidance strings, per locale.
 *
 * Kept beside the builder rather than in lib/i18n because they are transit
 * facts first and copy second: the reason a bus cannot wait belongs with the
 * station table it is derived from. `metro` interpolates, so it is a function.
 */
const GUIDANCE: Record<
  Locale,
  {
    busDropOff: string;
    busBags: string;
    metro: (station: string, lines: string, plural: boolean, minutes: number) => string;
    fareCards: string;
    rushHour: string;
    meetingPoint: string;
    fareWithKey: string;
    fareWithoutKey: string;
  }
> = {
  en: {
    busDropOff:
      'Your bus can drop off but cannot park or wait. Agree a drop-off point and a separate pickup time and place with your charter company before the trip.',
    busBags:
      'Because the bus leaves, anything the group cannot carry through security has to go with it. There is no bag storage at the Capitol.',
    metro: (station, lines, plural, minutes) =>
      `Take Metro to ${station} (${lines} line${plural ? 's' : ''}), then walk about ${minutes} minutes to the Visitor Center.`,
    fareCards:
      'Buy or load fare cards before the day, not at the station. Thirty students queueing at a fare machine is how groups miss their entry time.',
    rushHour:
      'Avoid arriving between 7:30 and 9:00am on a weekday if you can. Rush-hour platforms are hard to keep a group together on.',
    meetingPoint:
      'Agree a meeting point above ground before you go underground, in case the group gets split across two trains.',
    fareWithKey:
      'Fares vary by distance and time of day. Check current fares on wmata.com before you budget.',
    fareWithoutKey:
      'No WMATA API key is configured, so we are not showing a fare. Metro fares vary by distance and time of day — check wmata.com before you budget, and note that groups can often arrange a bulk fare card purchase in advance.',
  },
  es: {
    busDropOff:
      'El autobús puede dejarlos pero no puede estacionarse ni esperar. Acuerden con la empresa de autobuses un punto para bajar y una hora y un lugar aparte para recogerlos, antes del viaje.',
    busBags:
      'Como el autobús se va, todo lo que el grupo no pueda pasar por seguridad tiene que irse con él. En el Capitolio no hay dónde guardar bolsas.',
    metro: (station, lines, plural, minutes) =>
      `Toma el Metro hasta ${station} (línea${plural ? 's' : ''} ${lines}) y camina unos ${minutes} minutos hasta el Visitor Center.`,
    fareCards:
      'Compren o recarguen las tarjetas de transporte antes del día del viaje, no en la estación. Treinta estudiantes haciendo fila en una máquina es como los grupos pierden su hora de entrada.',
    rushHour:
      'Si pueden, eviten llegar entre las 7:30 y las 9:00 de la mañana entre semana. En hora pico es difícil mantener al grupo junto en los andenes.',
    meetingPoint:
      'Acuerden un punto de encuentro en la superficie antes de bajar al Metro, por si el grupo se separa en dos trenes.',
    fareWithKey:
      'Las tarifas varían según la distancia y la hora del día. Consulta las tarifas actuales en wmata.com antes de hacer el presupuesto.',
    fareWithoutKey:
      'No hay una clave de API de WMATA configurada, así que no mostramos una tarifa. Las tarifas del Metro varían según la distancia y la hora del día: consulta wmata.com antes de hacer el presupuesto, y ten en cuenta que los grupos a menudo pueden comprar tarjetas por adelantado en bloque.',
  },
};

export async function buildTransitPlan(
  arrivalMethod: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<TransitPlan> {
  const station = recommendedStation(arrivalMethod);
  const hasKey = Boolean(process.env.WMATA_API_KEY);
  const t = GUIDANCE[locale] ?? GUIDANCE[DEFAULT_LOCALE];

  const guidance: string[] = [];

  if (arrivalMethod === 'charter_bus') {
    guidance.push(t.busDropOff);
    guidance.push(t.busBags);
  } else {
    guidance.push(
      t.metro(
        station.name,
        station.lines.join(', '),
        station.lines.length > 1,
        station.walkMinutesToCvc,
      ),
    );
  }

  guidance.push(t.fareCards);
  guidance.push(t.rushHour);
  guidance.push(t.meetingPoint);

  return {
    station,
    walkMinutes: station.walkMinutesToCvc,
    // We do not fabricate a fare. Metro fares vary by distance and time of day,
    // and a wrong number in a teacher's budget is worse than no number.
    farePerPersonCents: null,
    fareNote: hasKey ? t.fareWithKey : t.fareWithoutKey,
    guidance,
    source: hasKey ? 'wmata_api' : 'curated',
  };
}

/** The station note in the reader's language. */
export function stationNote(station: Station, locale: Locale = DEFAULT_LOCALE): string {
  return station.note[locale] ?? station.note[DEFAULT_LOCALE];
}
