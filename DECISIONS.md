# Decision log

Why CapitolPass is built the way it is. Each entry records what was assumed, what
was measured, and what changed as a result. Entries carry a date where the
evidence itself is dated — the data snapshots in `data/` timestamp themselves, so
those are exact.

The short version: the spec for this project was written before any of the
federal data had been touched, and three of its load-bearing assumptions turned
out to be false. The workarounds are most of what is interesting in the codebase.

---

## D1 — The engine is pure, and the clock is an input

**Decided:** early, before any UI existed.

`buildPlan(input) → plan` does no I/O. No database read, no network call, and no
`Date.now()` — `requestedOn` is passed in like any other field.

The reason is testability. A planner that reads the clock cannot be tested at a
boundary, because the boundary moves. With the clock as an input, the test suite
can assert that a trip 27 days out fails a 28-day lead time and a trip 28 days
out passes, and that assertion is true forever.

The cost is that every caller has to supply the date. That is the right cost:
it makes "when was this plan computed" a visible property of a plan rather than
an invisible one, which is why the trip page can say *this plan was computed 5
days ago, recompute to see where you stand now*.

**Consequence:** the 62-test suite runs in ~160ms with no network and no
fixtures, so it actually gets run.

---

## D2 — Every rule carries its source, its date, and its confidence

**Decided:** at the same time as D1.

All fourteen rules live in `lib/feasibility/rules.config.ts`. Each one has the
value the engine uses, a one-sentence explanation in a teacher's language, the
source it came from, the date that source was last checked, and a confidence
level:

- `published` — stated in official guidance (5 rules)
- `documented` — consistent across many offices but not centrally published (5)
- `heuristic` — our own planning judgment, not policy (4)

The third level is the one that matters. CVC slot sizing, the screening buffer,
chaperone ratios and paperwork lead times are *advice*, not rules, and an app
that presents its own opinions in the same voice as federal guidance is lying to
the person using it. So the confidence renders in the UI everywhere a rule
appears, and `/rules` publishes all fourteen with sources.

A test asserts that no finding, strategy or request can reference a rule id that
does not exist, which means the citations cannot rot silently.

---

## D3 — Districts come from coordinates, never from addresses or ZIPs

**Assumed:** address → congressional district, via the Census Geocoder's
`/geographies/address` endpoint.

**Measured:** tested against three real school addresses. **Two of the three
returned zero matches.** School addresses are exactly the kind of input that
address geocoders handle badly — campus names, rural routes, recently annexed
roads.

**Changed to:** `/geographies/coordinates`, a point-in-polygon lookup against the
district boundary file. It answers for any point in the United States, and the
NCES Common Core of Data ships latitude and longitude for essentially every
school. Addresses remain only as a fallback.

Two things fell out of this:

- Census encodes at-large districts three different ways — `00` for Wyoming,
  `98` for DC's Delegate and Puerto Rico's Resident Commissioner. All three
  normalise onto the single `district: 0` the legislators dataset uses, and none
  of them ever renders as "District 0".
- **ZIP codes are never used.** ZIPs cross district lines routinely. A wrong
  guess sends a teacher's request to an office that will correctly ignore it,
  because they are not a constituent — and the teacher will never find out why.

---

## D4 — `contact_form` does not cover Congress, and guessing is worse than useless

**Assumed:** the congress-legislators dataset gives a `contact_form` URL per
member, so routing a request is a lookup.

**Measured:**

```
537 current members
 88 have a contact_form URL   (16%)
536 have an official website  (99.8%)
```

And a tour request does not go to the general contact form anyway. It goes to a
dedicated tour page whose path is not standardised:

```
subramanyam.house.gov/services/tours-and-tickets   200
subramanyam.house.gov/services/tours               404
mcclellan.house.gov/services/tours                 200
```

**Changed to:** a resolution chain that never guesses and reports its confidence
at each step — `verified` (a URL we requested and got a 200 from, with the date),
`contact_form`, `website`, `unknown`. The UI shows the teacher which one they are
getting.

A 404 is worse than a homepage. A teacher who lands on a 404 assumes they did
something wrong and goes back to the beginning; a teacher who lands on a homepage
with "look under Services → Tours" gets there.

---

## D5 — Read the navigation instead of probing paths

**Decided:** 2026-08-08, after the first discovery sweep.

The first version of `scripts/discover-tour-routes.ts` probed a list of candidate
paths per office. It topped out at **89 offices** and cost about 10 requests
each, and its ceiling was structural: it could only ever find paths someone had
already thought of.

The current version fetches each office's homepage once and reads its navigation,
the way a person would. Results, from `data/tour-routes.json`:

| | |
|---|---|
| Offices with a verified tour URL | **498 of 537 (92.7%)** |
| Found by reading site navigation | 485 |
| Found by path probing | 13 |
| Distinct URL paths across those 498 | **92** |
| Requests per office | ~2, down from ~10 |

`/services/tours-and-tickets` covers 260 of them. The long tail includes
`/forms/tourrequest`, `/constituentservices/tourrequest.htm`,
`/services/schedule-a-dc-tour/` and `/tours-and-tickets-address-validation`. No
candidate list was ever going to catch that.

Reading the nav also yields each office's *own* wording — 273 say "Tours and
Tickets", 65 "Tour Requests", 16 "Visiting DC" — which the app shows the teacher
so they are hunting for the phrase actually on the page.

**A 403 is recorded as `blocked`, not as "no tour page."** An early sweep at
concurrency 6 started drawing 403s from house.gov hosts, including on URLs that
had returned 200 minutes earlier — a web application firewall doing its job.
Conflating a rate limit with a missing page would have quietly manufactured false
negatives across the dataset. The script now runs two requests in flight with a
delay, and `--retry` re-runs only the blocked set. Five offices remain
persistently blocked and fall back to the contact form, which is what the chain
is for.

---

## D6 — There is no public mapping from an email domain to a school

**Assumed:** match the teacher's email domain against the NCES Common Core of
Data to prove where they work.

**Measured:** the CCD has no email domain field. Neither does any other federal
dataset. There is no authoritative public mapping from `lcps.org` to a school
district anywhere.

**Changed to:** domain verification is a mapping the app builds, with a trust
level attached — `seeded`, `admin_confirmed`, `claimed`.

The design consequence is the important part: **a `claimed` domain gets a teacher
the entire product. It just does not produce a Verified Trip badge.** Everyone
gets the tool; not everyone gets the badge.

That split is deliberate. A badge anyone can self-issue tells a congressional
staffer nothing, so the badge takes an administrator co-sign — and that co-sign
is also what promotes the domain, which is how the mapping gets built at all. The
verification requirement and the data-collection mechanism are the same action.

Teachers at private schools, parochial schools, homeschool co-ops, or schools too
new for the CCD go through the same path with a free-text school name. Never a
hard block.

---

## D7 — The app will never email a congressional office for a teacher

**Decided:** early, and it constrains the whole product.

Automated bulk mail to `.house.gov` and `.senate.gov` gets filtered, and it
wastes the time of people whose inboxes are a public resource. An app that
generates 500 school tour requests and fires them at the House mail gateway would
be actively harmful to the thing it claims to help.

So every request leaves through a channel a human chose: the office's own form,
the teacher's own mailbox, or an office queue that the office opted into by
claiming their account. The header comment in `lib/mail.ts` states this as a
standing rule.

This is why the product is a *router* rather than a sender, and why the packet
generator exists at all — the packet is what makes "you send it yourself" take
thirty seconds instead of an hour.

---

## D8 — SQLite locally, Postgres hosted, one file between them

**Decided:** when the repo needed to be clonable.

Local dev runs on Node's built-in `node:sqlite`, so `git clone && npm install &&
npm run setup && npm run dev` needs no database server, no credentials and no
native build step. That matters for anyone evaluating the project.

SQLite does not survive a serverless filesystem, so a hosted deployment runs the
same model on Postgres — `supabase/schema.sql` carries real enums, `date` for
calendar dates, and Row Level Security policies that enforce in the database what
the local build enforces in application code.

`lib/db/index.ts` is the only file that touches a driver. The whole surface is
`all` / `get` / `run` / `transaction`, which is what makes swapping the backend a
one-file change rather than a rewrite.

---

## D9 — Status is honest, and roadmap is labelled as roadmap

**Decided:** continuously, and it costs the demo something every time.

- **Restaurant partnerships: zero.** `/partners` is a signup funnel with nobody
  in it. No venue carries a Partner tag because none of them is a partner. Where
  a group capacity or a price is not published, the field says so rather than
  showing a number we invented.
- **Office claim approval** auto-approves verified `house.gov` / `senate.gov`
  domains so the system is walkable. That check proves employment, not *which*
  office. The claim page says so.
- **WMATA fares** show as unknown without an API key, rather than being guessed.

The alternative — a demo where everything looks finished — reads better for about
ten seconds and then falls apart under one question. Stating the seam is cheaper
than defending it.

---

## D10 — Accessibility is not a feature here, it is the subject

An app about physical access to a public building that is not itself accessible
would be an obvious own-goal. Targets WCAG 2.1 AA:

- Semantic HTML with real `fieldset`/`legend`, labelled controls, a skip link.
- Status never carried by colour alone — every pill renders its text.
- A thick yellow focus ring, borrowed from GOV.UK, chosen because it stays
  visible on both the paper background and the navy header.
- Server-rendered throughout; the only client component is a copy-to-clipboard
  button that degrades to a selectable textarea and announces its result
  politely.
- `prefers-reduced-motion` respected globally.
