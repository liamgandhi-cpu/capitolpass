/**
 * Load the NCES Common Core of Data school directory into the local database.
 *
 *   npm run data:schools                 # demo states (fast)
 *   npm run data:schools -- --state VA
 *   npm run data:schools -- --all        # every state and territory (~100k schools)
 *
 * ----------------------------------------------------------------------------
 * WHERE THIS DATA COMES FROM
 * ----------------------------------------------------------------------------
 * NCES publishes the CCD as a bulk download intended for statistical software.
 * The Urban Institute's Education Data API serves the same CCD directory as
 * JSON, free and without an API key, which is a far better fit for an app that
 * needs to look up one school at a time. Same underlying federal data, same
 * NCES school ids — just a usable transport.
 *
 *   https://educationdata.urban.org/documentation/
 *
 * ----------------------------------------------------------------------------
 * A NOTE ON THE DISTRICT FIELD
 * ----------------------------------------------------------------------------
 * The CCD includes a `congress_district_id` field (state FIPS + district, e.g.
 * 5110). We deliberately do not import it. It reflects the districts in force
 * for the data year, and redistricting moves those lines — a stale district
 * would send a teacher's request to an office that is not theirs, which is the
 * exact failure this app exists to prevent.
 *
 * Instead we import the coordinates, and resolve the district from them through
 * the US Census Geocoder at the point we need it (see lib/schools/index.ts).
 * One authority, resolved live, cached on the school row.
 */

import { all, db, migrate, nowIso, run, transaction } from '../lib/db';

const YEAR = 2024; // latest year available in the CCD directory endpoint
const BASE = 'https://educationdata.urban.org/api/v1/schools/ccd/directory';

/** States used by the seeded demo. Enough to be real, small enough to be quick. */
const DEMO_STATES = ['VA', 'MD', 'DC', 'PA', 'WV'];

const ALL_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR',
  'PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','AS','GU','MP','PR','VI',
];

interface CcdSchool {
  ncessch: string;
  school_name: string;
  lea_name: string | null;
  street_location: string | null;
  city_location: string | null;
  state_location: string | null;
  zip_location: string | null;
  latitude: number | null;
  longitude: number | null;
  enrollment: number | null;
  charter: number | null;
  school_level: number | null;
  school_status: number | null;
  congress_district_id: number | null;
}

/** CCD school_status: 1 open, 3 new, 8 reopened. Everything else is not a school we can send a class to. */
const OPEN_STATUSES = new Set([1, 3, 8]);

const LEVELS: Record<number, string> = {
  1: 'elementary',
  2: 'middle',
  3: 'high',
  4: 'other',
  5: 'other',
  6: 'other',
  7: 'other',
};

async function fetchState(state: string): Promise<CcdSchool[]> {
  const out: CcdSchool[] = [];
  let url: string | null = `${BASE}/${YEAR}/?state_location=${state}`;

  while (url) {
    const res: Response = await fetch(url, { headers: { 'User-Agent': 'CapitolPass/0.1' } });
    if (!res.ok) throw new Error(`${state}: HTTP ${res.status}`);
    const page = (await res.json()) as { results: CcdSchool[]; next: string | null };
    out.push(...page.results);
    url = page.next;
  }

  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const stateFlag = args.indexOf('--state');
  const states = args.includes('--all')
    ? ALL_STATES
    : stateFlag >= 0
      ? [args[stateFlag + 1]?.toUpperCase()].filter(Boolean)
      : DEMO_STATES;

  migrate();

  const insert = db().prepare(`
    INSERT INTO schools (
      nces_id, name, lea_name, street, city, state, zip, latitude, longitude,
      enrollment, is_charter, level, source, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (nces_id) DO UPDATE SET
      name = excluded.name,
      lea_name = excluded.lea_name,
      street = excluded.street,
      city = excluded.city,
      state = excluded.state,
      zip = excluded.zip,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      enrollment = excluded.enrollment,
      is_charter = excluded.is_charter,
      level = excluded.level
  `);

  let total = 0;
  let skipped = 0;
  let noCoords = 0;

  for (const state of states) {
    process.stdout.write(`  ${state} … `);
    const schools = await fetchState(state);

    const usable = schools.filter((s) => {
      if (!OPEN_STATUSES.has(s.school_status ?? 0)) {
        skipped += 1;
        return false;
      }
      return true;
    });

    transaction(() => {
      for (const s of usable) {
        if (s.latitude === null || s.longitude === null) noCoords += 1;
        insert.run(
          s.ncessch,
          s.school_name,
          s.lea_name,
          s.street_location,
          s.city_location,
          s.state_location ?? state,
          s.zip_location,
          s.latitude,
          s.longitude,
          s.enrollment,
          s.charter === 1 ? 1 : 0,
          LEVELS[s.school_level ?? -1] ?? null,
          'nces_ccd',
          nowIso(),
        );
      }
    });

    total += usable.length;
    console.log(`${usable.length} schools`);
  }

  const inDb = all<{ n: number }>('SELECT COUNT(*) AS n FROM schools')[0]?.n ?? 0;

  run('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)', 'ccd_year', String(YEAR));
  run(
    'INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)',
    'ccd_loaded_at',
    nowIso(),
  );

  console.log(
    `\nLoaded ${total} open schools (${skipped} closed or inactive skipped).\n` +
      `${noCoords} have no coordinates and will need address-based district lookup.\n` +
      `${inDb} schools now in the database.`,
  );
}

main().catch((err) => {
  console.error('\nSchool load failed:', err.message);
  process.exit(1);
});
