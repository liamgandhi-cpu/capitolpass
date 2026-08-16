/**
 * Snapshot the congress-legislators dataset into ./data.
 *
 * Run with: npm run data:legislators
 *
 * We snapshot rather than fetch at request time for three reasons: the app
 * should work offline in a demo, a school's network should not be a dependency
 * of "who is my representative", and pinning the data means a plan generated
 * today is reproducible tomorrow. Re-run this after an election or a special
 * election — the file records when it was fetched so staleness is visible.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCES = {
  legislators: 'https://unitedstates.github.io/congress-legislators/legislators-current.json',
  committees: 'https://unitedstates.github.io/congress-legislators/committees-current.json',
  membership: 'https://unitedstates.github.io/congress-legislators/committee-membership-current.json',
  offices: 'https://unitedstates.github.io/congress-legislators/legislators-district-offices.json',
} as const;

const OUT_DIR = path.join(process.cwd(), 'data');

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': 'CapitolPass/0.1' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const results: Record<string, unknown> = {};
  for (const [name, url] of Object.entries(SOURCES)) {
    process.stdout.write(`  fetching ${name} … `);
    try {
      results[name] = await fetchJson(url);
      const count = Array.isArray(results[name])
        ? (results[name] as unknown[]).length
        : Object.keys(results[name] as object).length;
      console.log(`${count} records`);
    } catch (err) {
      // District offices are a nice-to-have; the others are not.
      if (name === 'offices') {
        console.log(`skipped (${(err as Error).message})`);
        results[name] = [];
      } else {
        throw err;
      }
    }
  }

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    source: 'https://github.com/unitedstates/congress-legislators',
    license: 'Public domain (CC0)',
    ...results,
  };

  const out = path.join(OUT_DIR, 'legislators.json');
  await writeFile(out, JSON.stringify(snapshot));
  console.log(`\nWrote ${out}`);
}

main().catch((err) => {
  console.error('\nFailed to snapshot legislators data:', err.message);
  process.exit(1);
});
