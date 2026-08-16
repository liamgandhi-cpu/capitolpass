# CapitolPass

**Planning a school field trip to the US Capitol is not one action. It is a scattered, undocumented process that quietly excludes schools without a parent volunteer who already knows how Washington works.**

CapitolPass is a router and coordinator for that process: one intake, correct addressing, real logistics, tracked status, and a queue on the congressional office side so requests actually get answered.

```bash
git clone <repo> && cd capitolpass
npm install
npm run setup     # downloads real federal data, creates the database, seeds a demo
npm run dev       # http://localhost:3000
```

No API keys, no database server, no credentials. `npm run setup` pulls the real NCES school directory and the real congress-legislators dataset, and the app runs on them.

**To look around without signing up**, set `CAPITOLPASS_DEMO=1` and open the landing page: three seeded personas — a teacher with a class of 34, a teacher with a group of 14, and a congressional staffer — are one click from a fully populated view. See [Deploying](#deploying).

---

## Contents

- [The problem](#the-problem)
- [What the app does](#what-the-app-does)
- [Architecture](#architecture)
- [The feasibility engine](#the-feasibility-engine)
- [The 535 front doors](#the-535-front-doors)
- [Published availability](#published-availability)
- [Spanish for families](#spanish-for-families)
- [Three things the original plan got wrong](#three-things-the-original-plan-got-wrong)
- [Running it](#running-it)
- [Testing](#testing)
- [What is live and what is roadmap](#what-is-live-and-what-is-roadmap)
- [Deploying](#deploying)

---

## The problem

Five specific failure points, all encoded in the app:

1. **Two booking systems, no shared front door.** A tour can be booked through the Capitol Visitor Center's Advance Reservation System, or through the office of the school's own Representative or Senators. Neither system knows the other exists.
2. **Staff-led tours cap at 15 guests**, counting students, teachers and chaperones together — and **each congressional office may reserve only one school tour per week.** A class of 30 physically cannot go as one staff-led group. Most teachers find this out after they have already asked.
3. **Every House and Senate office runs its own tour request form on its own website.** No standard format, no standard fields, no standard lead time. 535 different front doors.
4. **A meeting with the Member is a completely separate request**, on a different timeline, handled by the office scheduler rather than the tour coordinator.
5. **The logistics kill trips that clear all of the above.** No visitor parking. No food or drink inside. No bag storage of any kind. Chaperone ratios, headcounts and permission slips are the teacher's problem alone.

## What the app does

**Teacher** — signs up with a school email, and never types "who is my representative". The school's coordinates come from the NCES directory, go to the US Census Geocoder, and come back as a congressional district; the Representative and Senators follow from there.

They describe the trip once. The feasibility engine returns a **plan, not a form**: which paths are actually open to a group that size, which of their three dates survive contact with the rules, what has to be requested separately, and a dated critical path.

**Congressional staff** — claim their office and get a queue of requests where the constituent check is already done, plus a weekly capacity tracker built around the one-tour-per-week limit. Confirm, decline, or propose another date in one click.

**Students** — join with a six-character code. Itinerary, what they can and cannot bring, who represents them and what committees they sit on, and a moderated channel to submit a question for the meeting.

---

## Architecture

```
                    ┌──────────────────────────────────────────────┐
   REAL DATA        │  NCES CCD          US Census        congress-│
   (all free,       │  school directory  Geocoder         legislators
    no API keys)    │  (Urban Inst API)  (coords → CD)    (GitHub) │
                    └────────┬───────────────┬────────────────┬────┘
                             │               │                │
        npm run setup ───────┴───────────────┴────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  data/          │  legislators.json · tour-routes.json
                    │  capitolpass.db │  SQLite via node:sqlite (no native build)
                    └────────┬────────┘
                             │
   ┌─────────────────────────┴──────────────────────────────────────┐
   │                        lib/                                     │
   │                                                                 │
   │  feasibility/    ← THE CORE. Pure, no I/O, no clock.           │
   │    rules.config.ts   every rule, cited and dated                │
   │    engine.ts         input → plan                               │
   │    holidays.ts       federal holidays, computed not hardcoded   │
   │                                                                 │
   │  districts/      census.ts   coordinates → congressional district│
   │  congress/       legislators.ts, routing.ts (the 535 front doors)│
   │  schools/        NCES lookup + the email-domain mapping problem  │
   │  packets/        one packet per destination, three send modes    │
   │  trips/          trips, requests, status transitions             │
   │  offices/        office queue, constituent check, weekly capacity│
   └─────────────────────────┬───────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │  app/  Next.js  │  server components, server actions,
                    │  App Router     │  almost no client JavaScript
                    └─────────────────┘
```

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind 4 · SQLite via Node's built-in `node:sqlite`.

**Why SQLite and not Supabase for local dev:** so that cloning the repo and running it takes two commands and zero credentials. The same data model in Postgres, with Row Level Security policies, is in [`supabase/schema.sql`](supabase/schema.sql) for a hosted deployment. `lib/db/index.ts` is the only file that touches the driver.

---

## The feasibility engine

`lib/feasibility/` is the intellectual core, and it is deliberately easy to audit.

**Every rule lives in one annotated config file.** [`lib/feasibility/rules.config.ts`](lib/feasibility/rules.config.ts) holds all fifteen, each with:

- the value the engine uses,
- a one-sentence explanation a teacher would understand,
- the source it came from and a link where one exists,
- the date that source was last checked,
- and a **confidence level**: `published` (stated in official guidance), `documented` (consistent across many offices but not centrally published), or `heuristic` (our own planning judgment, not policy).

That last distinction is load-bearing. The app renders it, so a teacher can always tell whether we are quoting a rule or offering an opinion. Of the fifteen rules, **five are published guidance, five are documented practice, and five are explicitly our own judgment** — and the judgment calls (CVC slot sizing, screening buffer, chaperone ratios, paperwork lead times, and the 250th-anniversary advisory) are labelled as advice everywhere they appear. `/rules` shows all of them with sources and last-verified dates.

**The engine is pure.** `buildPlan(input) → plan`, with no database, no network, and no clock — `requestedOn` is an input. Same input, same plan, forever. That is what makes the test suite meaningful rather than decorative.

**Every output is traceable.** Each finding, strategy and request carries the `ruleId` it came from, and the UI links it back to the rule. A test asserts that no finding can reference a rule that does not exist.

What it decides:

| Concern | What happens |
|---|---|
| Group size | 15 or under → staff-led tour viable. 16+ → not viable, CVC recommended, split offered as an option but never as the default (it needs two requests to land) |
| Dates | Sundays and federal holidays rejected outright; Saturdays flagged because offices are not staffed; lead time banded against the worst threshold across everything the trip needs |
| Meeting vs tour | Always separate requests, separate deadlines, separate tracking |
| Critical path | Counted backwards from the trip date, never landing a deadline on a weekend |
| Chaperones | Ratio by grade band, labelled as a recommendation and not a Capitol rule |

---

## The 535 front doors

`/front-doors` publishes the whole routing picture, because it is the most
important finding in the project and it was invisible everywhere else: a teacher
plans one trip, sees one office and one link, and never learns there is no
standard at all.

| | |
|---|---|
| Offices checked | **537** — every current member |
| With a confirmed tour page | **498 (92.7%)**, each an HTTP 200 on a recorded date |
| Distinct URL paths across those | **92** |
| Used by exactly one office | **66** |

One cell per office, grouped by state, coloured by confidence and linking to the
real page where we have one. Underneath: the path distribution, and each
office's own wording for the link — 273 say "Tours and Tickets", 65 "Tour
Requests", 16 "Visiting DC" — which the app shows a teacher so they are hunting
for the phrase actually printed on the page.

[`lib/congress/coverage.ts`](lib/congress/coverage.ts) is pure, like the
feasibility engine, so the numbers on that page are tested. The tests assert
relationships rather than literals, so rebuilding the snapshot does not fail the
suite for being newer.

## Published availability

Everything else in the app routes a request to the right place. That is useful
and it does not touch the actual scarcity: **an office may host one school tour
a week, and nobody outside that office can see which weeks are already gone.**
So two schools in the same district pick the same week, both send a request two
months out, and one of them finds out in October that the answer was always
going to be no.

A claimed office now marks each week `open`, `full` or `closed`, and a teacher
sees that next to their candidate dates before they commit to one. It is the one
mechanism here that changes the allocation rather than the paperwork.

**Silence is not availability.** A week with no row is `unpublished`. It renders
to the office as "not published", and to a teacher as nothing at all — never as
open. Reading absence as availability would be the same mistake as guessing a
tour URL: a confident answer manufactured out of no information. Most offices
will never publish anything, and the app stays completely usable for their
constituents.

Clearing a week deletes the row rather than storing a third state, which is what
the database-backed tests in
[`lib/offices/__tests__/availability.test.ts`](lib/offices/__tests__/availability.test.ts)
exist to pin down.

## Spanish for families

The student and family pages are translated. The teacher and congressional-office
pages are not, and that is a deliberate line rather than an unfinished job: a
teacher planning a trip and a scheduler working a queue are doing their jobs in
the language their employer runs on. A family is not.

This is the same argument the rest of the app makes, applied one layer further.
A what-you-cannot-bring list and a permission slip that exist only in English are
exactly where exclusion stops being structural and lands on a specific child —
the one whose parent cannot read the form and therefore does not sign it.

No i18n library. `StudentCopy` is derived from the English object, so a missing
Spanish string is a compile error rather than a sentence that silently renders in
English halfway down a translated page; a test covers the case types cannot,
which is a key that is present and still English. The transit guidance and the
date formatting are localised too — half-translated reads as broken, and a
reader who hits an English paragraph stops trusting the ones they could read.

Teachers get the link to hand to families directly from the trip page.

## Three things the original plan got wrong

This project was specced before it was built, and three assumptions in that spec turned out to be false. They are documented here rather than quietly worked around, because the workarounds are some of the more interesting parts of the codebase.

### 1. `contact_form` does not cover 535 offices — it covers 88

The plan assumed the congress-legislators dataset gives a `contact_form` URL for every member, making routing a solved problem. Measured:

```
537 current members
 88 have a contact_form URL   (16%)
536 have an official website  (99.8%)
```

And a tour request does not go to the general contact form anyway — it goes to a dedicated tour page whose path is not standardised:

```
subramanyam.house.gov/services/tours-and-tickets   200
subramanyam.house.gov/services/tours               404
mcclellan.house.gov/services/tours                 200
```

Guessing is worse than useless: a 404 costs a teacher more time than a homepage, because they assume they did something wrong.

So [`lib/congress/routing.ts`](lib/congress/routing.ts) never guesses. It resolves through a chain and reports its confidence at each step — `verified` (a URL we requested and got a 200 from, with the date), `contact_form`, `website`, or `unknown` — and the UI shows which one you are getting.

[`scripts/discover-tour-routes.ts`](scripts/discover-tour-routes.ts) builds the verified set by actually checking. **498 of 537 offices (92.7%) now have a confirmed tour page**, and the full chain leaves nobody stranded:

| Confidence | Offices | What the teacher gets |
|---|---|---|
| `verified` | 498 | The office's real tour page, confirmed by an HTTP 200 on a stated date |
| `contact_form` | 6 | Their official contact form, labelled as general rather than tour-specific |
| `website` | 32 | Their homepage, plus where to look (`Services → Tours`) |
| `unknown` | 1 | A phone number — a member seated two months ago with no website in the dataset yet |

**How it finds them matters.** The first version probed a list of candidate paths. That could only ever find paths we had thought of, and it topped out at 89. The current version fetches each office's homepage once and reads its navigation, the way a person would — 485 of the 498 came from a site menu, only 13 from path probing. It also costs about 2 requests per office instead of 10.

The payoff is visible in the data: those 498 URLs sit at **92 distinct paths**. `/services/tours-and-tickets` covers 260 of them, but the long tail includes `/forms/tourrequest`, `/constituentservices/tourrequest.htm`, `/services/schedule-a-dc-tour/`, and `/tours-and-tickets-address-validation`. No candidate list was ever going to catch that.

Reading the menu also gives us the office's *own* wording — 273 call it "Tours and Tickets", 65 "Tour Requests", 16 "Visiting DC" — which the app shows the teacher, so they are hunting for the phrase actually on the page.

**On being throttled.** An early sweep at concurrency 6 started getting HTTP 403 from house.gov hosts, including on URLs that had returned 200 minutes earlier. That is a web application firewall doing its job. The script now runs two requests in flight with a delay, and — importantly — records a 403 as `blocked` rather than "no tour page", because conflating a rate limit with a missing page would quietly manufacture false negatives. `--retry` re-runs just those. After the national sweep 5 offices remain persistently blocked; they fall back to the contact form, which is what the chain is for.

### 2. NCES does not publish school email domains

The plan was "match the teacher's email domain against the NCES Common Core of Data". **The CCD has no email domain field**, and no federal dataset publishes one. There is no authoritative mapping from `lcps.org` to a school district anywhere in public data.

So domain verification cannot be a lookup — it has to be a mapping the app builds, with a trust level attached (`seeded` / `admin_confirmed` / `claimed`). See [`lib/schools/index.ts`](lib/schools/index.ts).

The design consequence: **a `claimed` domain gets a teacher the entire product. It just does not produce a Verified Trip badge.** Everyone gets the tool; not everyone gets the badge. A badge anyone can self-issue tells a congressional staffer nothing, so it takes an administrator co-sign — and that co-sign is also what promotes the domain, which is how the mapping gets built at all.

Teachers at private schools, parochial schools, homeschool co-ops, or schools too new for the CCD go through the same path with a free-text school name. Never a hard block.

### 3. Census address geocoding is unreliable; coordinate geocoding is not

The plan assumed address → district. Testing three real school addresses, the `/geographies/address` endpoint returned **zero matches for two of them**. The `/geographies/coordinates` endpoint — a point-in-polygon lookup against the district boundary file — answers for any point in the United States.

The CCD ships latitude and longitude for essentially every school, so [`lib/districts/census.ts`](lib/districts/census.ts) uses coordinates as the primary path and addresses only as a fallback. It also normalises the three different things Census means by an at-large district (`00` for Wyoming, `98` for DC's Delegate and Puerto Rico's Resident Commissioner) into the single `district: 0` the legislators dataset uses.

**We never infer a district from a ZIP code.** ZIPs cross district lines routinely, and a wrong guess sends a teacher's request to an office that will correctly ignore it because they are not a constituent.

---

## Running it

```bash
npm install
npm run setup          # everything below, in order
npm run dev
```

`npm run setup` runs:

| Command | What it does |
|---|---|
| `npm run data:legislators` | Snapshots congress-legislators (537 members, committees, district offices) to `data/` |
| `npm run data:schools` | Loads the NCES CCD directory for the demo states (~7,400 schools) into SQLite. `-- --all` for the full national set — **100,155 schools across all 56 states and territories**, every one with coordinates, ~26 MB, a few minutes. `-- --state VA` for one |
| `npm run db:reset` | Applies the schema. `-- --hard` drops the file, school directory included — restart `npm run dev` afterwards, since it holds an open handle to the deleted file |
| `npm run db:seed` | Office records for every member, the venue directory, and a demo |

Optional:

```bash
npm run data:tour-routes -- --state VA   # verify tour page URLs for one state
npm run data:tour-routes -- --all        # all 537; deliberately slow, ~30 min
npm run data:tour-routes -- --retry      # only the offices a firewall blocked
```

`data/tour-routes.json` is committed, so you do not need to run this to use the app.

### The demo

`npm run db:seed` creates two trips at a real school in VA-10, resolved live through the Census Geocoder:

| Account | What it shows |
|---|---|
| `demo.teacher@lcps.org` | **34 people** — over the 15-guest cap. Pushed to the Visitor Center, offered a split, meeting tracked separately |
| `demo.teacher2@lcps.org` | **14 people** — fits a staff-led tour. Sent in-app to a claimed office |
| `demo.staffer@mail.house.gov` | The office queue with that request in it, constituent check passed, weekly capacity tracker |

Students join at `/join` with the codes the seed prints.

**There is no mail provider by default.** Sign-in links are written to `data/outbox.log`, printed to the server console, and surfaced directly in the UI in development, so every flow — sign-in, administrator co-sign, office claim — can be walked end to end with no configuration.

### Running a production build locally

```bash
npm run build
npm start                                    # http://localhost:3000
npm run signin:link demo.teacher@lcps.org    # prints a sign-in link
```

Two things differ from `npm run dev`, and both are deliberate:

- **Sign-in links are not shown in the UI.** That shortcut is gated on `NODE_ENV` and is correctly off in a production build — a real deployment must never hand a session token to whoever loads the page. `npm run signin:link <email>` issues one from the server side instead, where shell access already implies database access. You can also read `data/outbox.log`, which every unsent message is written to.
- **`NEXT_PUBLIC_SITE_URL` decides whether the session cookie is `Secure`.** Set it to `http://localhost:3000` (as [`.env.example`](.env.example) shows) or sign-in will silently fail over plain HTTP. When the variable is unset, a production build defaults to secure cookies — safe by default rather than convenient by default.

### Environment

Everything is optional except as noted. See [`.env.example`](.env.example).

| Variable | Effect if unset |
|---|---|
| `RESEND_API_KEY`, `MAIL_FROM` | Mail goes to `data/outbox.log` and the console |
| `WMATA_API_KEY` | Transit uses the curated station table. Fares are shown as unknown rather than guessed |
| `NEXT_PUBLIC_SITE_URL` | Links in email default to `http://localhost:3000`. Also sets the cookie `Secure` flag from its scheme — **required for a production build served over plain HTTP** |
| `CAPITOLPASS_DB` | Database defaults to `data/capitolpass.db` |

---

## Testing

```bash
npm test                    # 108 tests, no network, ~200ms
NETWORK_TESTS=1 npm test    # 113 tests, adds live Census Geocoder checks
npm run typecheck
```

The suite concentrates on what a reviewer can verify is correct:

- **The 15/16 boundary** — at exactly 15 the staff-led tour is viable; at 16 it is not; one extra chaperone breaks a group of 15. The test asserts against the config value, not a literal, so the rule and the test cannot drift apart.
- **Split-group recommendations** — offered only above the cap, splits at the cap, covers the whole group, and is never the default.
- **Lead-time thresholds** — each side of every boundary, and the rule that the worst threshold across all needed requests wins.
- **Closed days** — Sundays, federal holidays, and holidays observed on a different day than they fall (July 4th 2026 is a Saturday, observed Friday the 3rd).
- **District resolution at borders** — two nearby points in different districts must resolve differently. This is the case a ZIP-code lookup gets wrong.
- **At-large and delegate districts** — Wyoming, DC and Puerto Rico all map to `district: 0` from three different Census encodings, and none of them ever render as "District 0".
- **Traceability** — every rule id referenced by a finding, strategy or request must exist.

---

## What is live and what is roadmap

Stated plainly, because the alternative is worse.

**Live and working:**

- District resolution against the real US Census Geocoder
- **Published weekly availability** — a claimed office marks weeks open, full or closed, and teachers see it before they pick dates. Unpublished weeks never render as open
- **Spanish** on every student- and family-facing page, including transit guidance and dates
- **`/front-doors`** — all 537 offices measured, with the 92 distinct URL paths
- **100,155 real schools** from the NCES CCD — every open public school in all 50 states, DC, and the five territories, each with the coordinates that district resolution runs on
- 537 real members, offices, committees and district offices
- **498 verified congressional tour request URLs** (92.7% of all 537 offices), each confirmed by an actual HTTP request on a recorded date, across 92 distinct URL patterns
- The feasibility engine, the packet generator, and the full request lifecycle
- The two-sided office queue, with a **seeded demo office**, not a real one

**Roadmap, and honestly labelled as such in the app:**

- **Restaurant partnerships: zero.** The lunch directory is researched public information. No venue carries a Partner tag, because none of them is a partner. `/partners` is a signup funnel with nobody in it. Where a group capacity or price is not published, the field says so instead of showing a number we invented.
- **Office claim approval.** The house.gov / senate.gov domain check is real — you cannot get one of those addresses without working there — but it does not prove *which* office. Claims from a verified domain are auto-approved so the system is walkable; production would add confirmation with the office itself. This is stated on the claim page.
- **WMATA live data.** The station table and walking times are curated and stable. With no API key, fares are shown as unknown rather than fabricated.

**What this app will never do:** email a congressional office on a teacher's behalf. Automated bulk mail to `.house.gov` and `.senate.gov` gets filtered and wastes the time of people whose inboxes are a public resource. Every request leaves through a channel a human chose — their form, the teacher's own mailbox, or an office queue that office opted into. See the header comment in [`lib/mail.ts`](lib/mail.ts).

---

## Deploying

Full instructions in [`DEPLOY.md`](DEPLOY.md). The short version and the
reasoning:

**Not serverless.** This app stores its data in a SQLite file through Node's
built-in `node:sqlite`, and that driver is *synchronous* — the query helpers in
[`lib/db/index.ts`](lib/db/index.ts) return values directly, and about forty call
sites depend on that. Moving to a serverless platform means moving to Postgres,
which means the helpers become async, which means every caller does too. That is
the right change the day more than one school uses this at once. It is the wrong
change to get a working link, and it would risk a working app for something a
visitor cannot see.

So it deploys to a host with a disk. [`fly.toml`](fly.toml) mounts a volume at
`/data`, the file lives there, and no application code changes at all. The
Postgres path stays ready in [`supabase/schema.sql`](supabase/schema.sql) —
same model, real enums, and Row Level Security policies that enforce in the
database what the local build enforces in application code.

```bash
fly volumes create capitolpass_data --region iad --size 1 && fly deploy
```

The [`Dockerfile`](Dockerfile) builds the SQLite database at **image build
time**, not at boot: loading the school directory and resolving the demo
school's district through the live Census Geocoder takes minutes, and doing it
on first request means the first person to open the link watches a spinner. The
entrypoint installs that database only when the volume is empty, and never
overwrites one that already has trips in it.

One trap worth knowing about, because it fails silently: **`NEXT_PUBLIC_*`
variables are inlined at build time**, so a container cannot configure one at
runtime. Set `CAPITOLPASS_SITE_URL` instead. It is read at runtime and it decides
the session cookie's `Secure` flag, the links in outgoing mail, and every
redirect — see [`lib/site-url.ts`](lib/site-url.ts). Get it wrong and sign-in
appears to work, sets its cookie, and lands the user on a dead address with
nothing in the logs.

## Accessibility

Targets WCAG 2.1 AA. An app about physical access to a public building that is not itself accessible would be an obvious own-goal.

- Semantic HTML with real `fieldset`/`legend`, labelled controls, and a skip link.
- Status is never carried by colour alone — every pill renders its text.
- A thick yellow focus ring, borrowed from GOV.UK, visible on both the paper background and the navy header.
- Server-rendered throughout; the only client component is a copy-to-clipboard button that degrades to a selectable textarea and announces its result politely.
- `prefers-reduced-motion` respected globally.

## Data sources

| Source | Use | Licence |
|---|---|---|
| [NCES Common Core of Data](https://nces.ed.gov/ccd/), via the [Urban Institute Education Data API](https://educationdata.urban.org/) | School directory, coordinates | Public domain |
| [US Census Geocoder](https://geocoding.geo.census.gov/) | Coordinates → congressional district | Public domain |
| [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) | Members, committees, contact routes | CC0 |
| [unitedstates/images](https://github.com/unitedstates/images) | Official member portraits | Public domain |
| [WMATA](https://developer.wmata.com/) | Transit (optional, needs a key) | — |
