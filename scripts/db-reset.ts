/**
 * Drop and recreate the local database.
 *
 *   npm run db:reset            # keep the loaded school directory
 *   npm run db:reset -- --hard  # delete the file entirely, schools included
 *
 * The default deliberately preserves `schools`, because reloading the CCD
 * directory means going back out to the network and that is slow. Everything
 * else — users, trips, requests, offices — is cheap to recreate from seed.
 */

import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { db, migrate, run } from '../lib/db';

const TABLES_TO_CLEAR = [
  'request_events',
  'requests',
  'student_questions',
  'trip_members',
  'trips',
  'office_staff',
  'offices',
  'sessions',
  'magic_links',
  'users',
  'partner_leads',
  'venues',
  'school_domains',
];

function main() {
  const hard = process.argv.includes('--hard');
  const file = process.env.CAPITOLPASS_DB ?? path.join(process.cwd(), 'data', 'capitolpass.db');

  if (hard) {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${file}${suffix}`;
      if (existsSync(p)) unlinkSync(p);
    }
    console.log('Deleted the database file.');
    migrate();
    console.log('Recreated the schema. Run `npm run data:schools` to reload the directory.');
    // A running dev server holds an open handle to the file we just deleted,
    // and will keep reading the unlinked inode until it is restarted. Symptom:
    // every page suddenly behaves as though the database is empty.
    console.log('\nIf `npm run dev` is running, restart it — it is still holding the old file.');
    return;
  }

  migrate();

  // Order matters even with ON DELETE CASCADE, since we clear rather than drop.
  db().exec('PRAGMA foreign_keys = OFF');
  for (const table of TABLES_TO_CLEAR) {
    run(`DELETE FROM ${table}`);
  }
  db().exec('PRAGMA foreign_keys = ON');

  console.log(
    `Cleared ${TABLES_TO_CLEAR.length} tables. The school directory was kept — ` +
      'pass --hard to drop that too.',
  );
}

main();
