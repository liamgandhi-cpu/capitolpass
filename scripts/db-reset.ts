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
import { all, db, migrate, run } from '../lib/db';

/**
 * Tables the default reset deliberately preserves.
 *
 * Everything else is derived from the database itself rather than listed here.
 *
 * This used to be the other way round — an explicit list of tables to clear —
 * and it was a quiet trap. Adding a table to the schema without remembering to
 * add it here left its rows in place across every reset, still pointing at ids
 * from a database generation that no longer existed. Nothing failed; the rows
 * simply accumulated as orphans, and the first symptom was stale data appearing
 * under a fresh seed.
 *
 * ON DELETE CASCADE does not save you here, because clearing runs with foreign
 * keys switched off so the order of the deletes does not matter.
 *
 * Inverting it makes the safe behaviour the default: a new table is cleared
 * automatically, and keeping one is a deliberate decision recorded right here.
 */
const TABLES_TO_KEEP = new Set([
  // Reloading the CCD directory means going back out to the network, and it is
  // slow. `--hard` drops it.
  'schools',
  // Bookkeeping written by migrate(), not application data.
  'schema_meta',
  'sqlite_sequence',
]);

function tablesToClear(): string[] {
  const rows = all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  return rows.map((r) => r.name).filter((name) => !TABLES_TO_KEEP.has(name));
}

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

  // Foreign keys off so the delete order does not matter — this clears rather
  // than drops, and the tables reference each other in both directions.
  const tables = tablesToClear();
  db().exec('PRAGMA foreign_keys = OFF');
  for (const table of tables) {
    run(`DELETE FROM ${table}`);
  }
  db().exec('PRAGMA foreign_keys = ON');

  console.log(
    `Cleared ${tables.length} tables: ${tables.join(', ')}.\n` +
      `Kept: ${[...TABLES_TO_KEEP].filter((t) => t !== 'sqlite_sequence').join(', ')} — ` +
      'pass --hard to drop the school directory too.',
  );
}

main();
