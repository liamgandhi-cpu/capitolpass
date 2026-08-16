/**
 * Find the real tour request page for each congressional office.
 *
 * Run with:
 *   npm run data:tour-routes -- --state VA     # one state
 *   npm run data:tour-routes -- --all          # every office
 *   npm run data:tour-routes -- --retry        # only the ones blocked last time
 *
 * ----------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS
 * ----------------------------------------------------------------------------
 * There is no directory of congressional tour request forms. The public
 * congress-legislators dataset has a `contact_form` for only ~16% of members,
 * and tour pages live at inconsistent paths — `/services/tours-and-tickets` for
 * one office, `/services/tours` for another, neither for a third.
 *
 * Rather than guess a URL and hand a teacher a 404, we check. Everything this
 * script writes is a link we have actually seen return HTTP 200.
 *
 * ----------------------------------------------------------------------------
 * HOW IT LOOKS: READ THE MENU, DO NOT GUESS THE PATH
 * ----------------------------------------------------------------------------
 * The first version of this script probed a list of candidate paths per office.
 * That was both wasteful and inaccurate: up to ten requests per host, and it
 * could only ever find paths we had thought of in advance.
 *
 * This version fetches the office homepage once and reads its navigation, which
 * is how a human would do it. House and Senate sites link their tour page from
 * the main menu with revealing link text ("Tours and Tickets", "Visiting DC"),
 * so one request usually finds the real URL — including paths that were never
 * in our candidate list. Path probing is kept only as a fallback for the sites
 * whose menu we cannot parse.
 *
 * Typical cost per office drops from up to 10 requests to about 2.
 *
 * ----------------------------------------------------------------------------
 * BEING A GOOD CITIZEN ABOUT IT
 * ----------------------------------------------------------------------------
 * A first full sweep at concurrency 6 confirmed 89 tour pages and then started
 * getting HTTP 403 from house.gov hosts — including from URLs that had returned
 * 200 minutes earlier. That is a web application firewall doing its job, and it
 * is a fair response to thousands of requests in a few minutes.
 *
 * So: two requests in flight, a pause between each, and a 403 or 429 stops work
 * on that host immediately rather than burning nine more requests to collect
 * nine more refusals. Blocked hosts are recorded as `blocked`, NOT as "no tour
 * page" — those are very different facts, and conflating them would quietly
 * turn a rate limit into a false negative. `--retry` re-runs just those.
 *
 * This is a maintenance job. It never runs in a teacher's request path.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { allMembers, type Member } from '../lib/congress/legislators';
import { TOUR_PATH_CANDIDATES } from '../lib/congress/routing';

const CONCURRENCY = 2;
const DELAY_MS = 400;
const TIMEOUT_MS = 15_000;
const USER_AGENT =
  'CapitolPass/0.1 (school field trip planning tool; contact via project repository)';

const OUT_FILE = path.join(process.cwd(), 'data', 'tour-routes.json');

interface Hit {
  url: string;
  status: number;
  checkedAt: string;
  /** How we found it, so a reader can judge the result. */
  via: 'homepage_link' | 'path_probe';
  /** The link text we matched, when we found it in a menu. */
  linkText?: string;
}

type Outcome =
  | { kind: 'found'; hit: Hit }
  | { kind: 'no_tour_page' }
  | { kind: 'blocked' }
  | { kind: 'no_website' };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

interface Fetched {
  status: number;
  body?: string;
  finalUrl?: string;
}

async function request(url: string, method: 'GET' | 'HEAD'): Promise<Fetched | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const body = method === 'GET' && res.ok ? await res.text() : undefined;
    return { status: res.status, body, finalUrl: res.url };
  } catch {
    // DNS failure, timeout, TLS error. Indistinguishable from each other and
    // all mean the same thing to us: no route from here.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Reading the menu
// ---------------------------------------------------------------------------

const ANCHOR = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

/** Strip tags and collapse whitespace from link text. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score a link on how likely it is to be the tour request page.
 *
 * Link text is weighted above the URL because it is what the office chose to
 * call the page, and it is far less ambiguous. "Agritourism Resources" is a
 * real link on a real House site, which is why `tour` alone is not enough —
 * the negative list below exists because of it.
 */
function scoreLink(href: string, text: string): number {
  const t = text.toLowerCase();
  const h = href.toLowerCase();

  // Things that contain "tour" but are emphatically not a Capitol tour page.
  if (/agritour|tourism board|tourette/.test(t + h)) return 0;

  let score = 0;

  if (/\btours?\s+and\s+tickets\b/.test(t)) score += 100;
  else if (/\btour\s+requests?\b/.test(t)) score += 95;
  else if (/\bcapitol\s+tours?\b/.test(t)) score += 90;
  else if (/\btours?\b/.test(t)) score += 70;

  if (/visiting\s+(washington|d\.?c\.?)/.test(t)) score += 65;
  else if (/\bplan\s+your\s+visit\b/.test(t)) score += 55;

  if (/tours?-and-tickets|tour-requests?|capitol-tours?/.test(h)) score += 40;
  else if (/\/tours?\b/.test(h)) score += 30;
  if (/visiting-(washington-)?dc/.test(h)) score += 30;

  // Constituent-services sections are where these pages live.
  if (/\/services\//.test(h)) score += 10;

  return score;
}

function extractCandidates(html: string, base: string): Array<{ url: string; text: string; score: number }> {
  const seen = new Map<string, { url: string; text: string; score: number }>();

  for (const match of html.matchAll(ANCHOR)) {
    const rawHref = match[1];
    const text = plainText(match[2]);
    if (!text) continue;

    const score = scoreLink(rawHref, text);
    if (score < 50) continue;

    let url: string;
    try {
      url = new URL(rawHref, base).toString();
    } catch {
      continue;
    }

    // Stay on the office's own site. An external "plan your visit" link to
    // visitthecapitol.gov is useful information but it is not this office's
    // tour request form, and we already link the CVC separately.
    if (new URL(url).host !== new URL(base).host) continue;

    const existing = seen.get(url);
    if (!existing || existing.score < score) seen.set(url, { url, text, score });
  }

  return [...seen.values()].sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Per-office discovery
// ---------------------------------------------------------------------------

async function findTourPage(member: Member): Promise<Outcome> {
  if (!member.websiteUrl) return { kind: 'no_website' };
  const base = member.websiteUrl.replace(/\/+$/, '');
  const today = new Date().toISOString().slice(0, 10);

  // --- 1. Read the homepage menu ------------------------------------------
  await sleep(DELAY_MS);
  const home = await request(base, 'GET');

  if (!home) return { kind: 'no_website' };
  if (home.status === 403 || home.status === 429) return { kind: 'blocked' };

  if (home.body) {
    const candidates = extractCandidates(home.body, home.finalUrl ?? base);

    for (const candidate of candidates.slice(0, 3)) {
      await sleep(DELAY_MS);
      const check = await request(candidate.url, 'HEAD');

      if (!check) continue;
      if (check.status === 403 || check.status === 429) return { kind: 'blocked' };
      if (check.status === 200) {
        return {
          kind: 'found',
          hit: {
            url: candidate.url,
            status: 200,
            checkedAt: today,
            via: 'homepage_link',
            linkText: candidate.text.slice(0, 60),
          },
        };
      }
    }
  }

  // --- 2. Fall back to probing known paths ---------------------------------
  // Only for sites whose menu we could not parse. Still stops at the first hit
  // and still stops dead on a 403.
  for (const candidate of TOUR_PATH_CANDIDATES) {
    await sleep(DELAY_MS);
    const probe = await request(`${base}${candidate}`, 'HEAD');

    if (!probe) continue;
    if (probe.status === 403 || probe.status === 429) return { kind: 'blocked' };
    if (probe.status === 200) {
      return {
        kind: 'found',
        hit: { url: `${base}${candidate}`, status: 200, checkedAt: today, via: 'path_probe' },
      };
    }
  }

  return { kind: 'no_tour_page' };
}

/** Run `worker` over `items` with a fixed number of workers in flight. */
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// ---------------------------------------------------------------------------

interface RouteFile {
  generatedAt: string;
  note: string;
  routes: Record<string, Hit>;
  /** Offices a firewall refused. Distinct from "has no tour page". */
  blocked: string[];
  /** Offices checked and genuinely without a findable tour page. */
  noTourPage: string[];
}

async function readExisting(): Promise<RouteFile> {
  try {
    const parsed = JSON.parse(await readFile(OUT_FILE, 'utf8')) as Partial<RouteFile>;
    return {
      generatedAt: parsed.generatedAt ?? '',
      note: parsed.note ?? '',
      routes: parsed.routes ?? {},
      blocked: parsed.blocked ?? [],
      noTourPage: parsed.noTourPage ?? [],
    };
  } catch {
    return { generatedAt: '', note: '', routes: {}, blocked: [], noTourPage: [] };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const retry = args.includes('--retry');
  const stateFlag = args.indexOf('--state');
  const state = stateFlag >= 0 ? args[stateFlag + 1]?.toUpperCase() : undefined;

  if (!all && !state && !retry) {
    console.error(
      'Specify a scope:\n' +
        '  npm run data:tour-routes -- --state VA\n' +
        '  npm run data:tour-routes -- --all\n' +
        '  npm run data:tour-routes -- --retry     (only offices blocked last run)\n',
    );
    process.exit(1);
  }

  const existing = await readExisting();

  let members = allMembers();
  if (state) members = members.filter((m) => m.state === state);
  if (retry) {
    const blocked = new Set(existing.blocked);
    members = members.filter((m) => blocked.has(m.bioguideId));
    if (members.length === 0) {
      console.log('Nothing was blocked on the last run. Nothing to retry.');
      return;
    }
  }

  console.log(
    `Probing ${members.length} offices at concurrency ${CONCURRENCY}, ${DELAY_MS}ms between requests.\n` +
      `Reading each office's menu first, falling back to path probes.\n`,
  );

  let done = 0;
  const counts = { found: 0, no_tour_page: 0, blocked: 0, no_website: 0 };

  const results = await pool(members, CONCURRENCY, async (member) => {
    const outcome = await findTourPage(member);
    done += 1;
    counts[outcome.kind] += 1;

    const label = `${member.state}${member.district !== null ? `-${member.district}` : ' (Sen)'}`;
    const tag =
      outcome.kind === 'found' ? 'found  ' : outcome.kind === 'blocked' ? 'blocked' : '  -    ';

    console.log(
      `[${String(done).padStart(3)}/${members.length}] ${tag} ${label} ${member.name}` +
        (outcome.kind === 'found' ? ` → ${outcome.hit.url}` : ''),
    );

    return [member.bioguideId, outcome] as const;
  });

  // Merge with previous runs so a per-state or --retry run never discards work.
  const routes = { ...existing.routes };
  const blocked = new Set(existing.blocked);
  const noTourPage = new Set(existing.noTourPage);

  for (const [bioguide, outcome] of results) {
    if (outcome.kind === 'found') {
      routes[bioguide] = outcome.hit;
      blocked.delete(bioguide);
      noTourPage.delete(bioguide);
    } else if (outcome.kind === 'blocked') {
      // Never downgrade a confirmed route because of a later rate limit.
      if (!routes[bioguide]) blocked.add(bioguide);
    } else if (outcome.kind === 'no_tour_page') {
      if (!routes[bioguide]) noTourPage.add(bioguide);
      blocked.delete(bioguide);
    }
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note:
          'Each route is a URL that returned HTTP 200 when checked on the date shown. ' +
          'Nothing here is guessed. `blocked` means a firewall refused us — that is not ' +
          'the same as having no tour page, and those offices fall back to the contact ' +
          'form or website rather than being recorded as absent.',
        scope: retry ? 'retry' : state ? `state:${state}` : 'all',
        routes,
        blocked: [...blocked].sort(),
        noTourPage: [...noTourPage].sort(),
      } satisfies RouteFile & { scope: string },
      null,
      2,
    ),
  );

  const viaMenu = Object.values(routes).filter((r) => r.via === 'homepage_link').length;

  console.log(
    `\n${'─'.repeat(64)}\n` +
      `This run:  ${counts.found} found · ${counts.no_tour_page} no tour page · ` +
      `${counts.blocked} blocked · ${counts.no_website} no website\n` +
      `On file:   ${Object.keys(routes).length} verified routes ` +
      `(${viaMenu} from a site menu, ${Object.keys(routes).length - viaMenu} from path probes)\n` +
      `           ${blocked.size} still blocked — re-run with --retry later\n` +
      `Written to ${OUT_FILE}`,
  );
}

main().catch((err) => {
  console.error('\nDiscovery failed:', err.message);
  process.exit(1);
});
