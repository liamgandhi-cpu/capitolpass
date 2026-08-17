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

**Consequence:** the 108-test suite runs in ~200ms with no network and no
fixtures, so it actually gets run.

---

## D2 — Every rule carries its source, its date, and its confidence

**Decided:** at the same time as D1.

All fifteen rules live in `lib/feasibility/rules.config.ts`. Each one has the
value the engine uses, a one-sentence explanation in a teacher's language, the
source it came from, the date that source was last checked, and a confidence
level:

- `published` — stated in official guidance (5 rules)
- `documented` — consistent across many offices but not centrally published (5)
- `heuristic` — our own planning judgment, not policy (5)

The third level is the one that matters. CVC slot sizing, the screening buffer,
chaperone ratios, paperwork lead times and the 250th-anniversary advisory (D15)
are *advice*, not rules, and an app that presents its own opinions in the same
voice as federal guidance is lying to the person using it. So the confidence
renders in the UI everywhere a rule appears, and `/rules` publishes all fifteen
with sources.

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

**Addendum — the accessibility claim was partly wrong, and measuring caught it.**
Auditing the pages added later turned up three real defects, all of which had
looked fine:

- The `/front-doors` grid used a green/amber/grey/red scale. Measured against
  the page background, `verified` sat at 8.22:1 and `unknown` at 8.42:1 — a
  green and a red of near-identical luminance, the pair that collapses into one
  colour under deuteranopia and into one grey in print. **The two ends of the
  scale were the least distinguishable cells on the page.** It is now a
  luminance ramp down the app's own navy, with red kept for the single office
  that has no web route at all and given an outline so it differs in shape too.
- Every verified cell is a link, which is right — but that is 536 consecutive
  tab stops before anything below the grid. A skip link fixes it.
- The critical-path SVG scaled its labels with its container, so on a phone
  "Today" and "Trip day" rendered at about six pixels: present, correctly
  positioned, unreadable. It scrolls below 40rem now instead of shrinking.

The lesson worth keeping: "status never carried by colour alone" was satisfied
the whole time — every cell has a text label — and the visual design was still
failing the readers it was written for. Contrast is a number. It should have
been measured rather than eyeballed.

---

## D11 — Silence is not availability

**Decided:** when the office calendar was added.

Everything else in this app routes a request to the right place. None of it
touches the actual scarcity: **an office may host one school tour a week, and
nobody outside that office can see which weeks are already gone.** Two schools in
the same district pick the same week, both send a request two months out, and one
of them finds out in October that the answer was always going to be no.

So a claimed office can mark a week `open`, `full` or `closed`, and teachers see
that beside their candidate dates before they commit.

The load-bearing decision is what happens for every week nobody has spoken
about. A week with no row is `unpublished`, and that renders to the office as
"not published" and to a teacher as *nothing at all* — never as open.

Reading absence as availability would be the same mistake as guessing a tour URL
in D4: a confident answer manufactured out of no information, with the teacher
paying for it. Most offices will never publish anything, and the app has to stay
completely usable for their constituents.

Two consequences fall out:

- Clearing a week **deletes the row** rather than storing a third state. The
  absence of a statement and a statement of absence are different things, and
  only one of them belongs in a table.
- The database-backed tests exist precisely to pin that down, because it is a
  storage decision and asserting it without touching storage would assert
  nothing.

This is the only feature here that changes the allocation rather than the
paperwork.

---

## D12 — Translate the family surfaces, not the staff ones

**Decided:** with the Spanish work.

The student and family pages are translated. The teacher and congressional-office
pages are not, and that is a line rather than an unfinished job.

A teacher planning a trip and a scheduler working a queue are doing their jobs in
the language their employer runs on. A family is not. A what-you-cannot-bring
list and a permission slip that exist only in English are exactly where the
exclusion this whole project is about stops being structural and lands on a
specific child — the one whose parent cannot read the form and therefore does not
sign it.

**No i18n library.** The app has four runtime dependencies and effectively no
client JavaScript; a framework would add a bundle and a runtime for what is, at
this size, a typed object. The types do the important work: `StudentCopy` is
derived from the English copy, so a missing Spanish string is a compile error.

What the type system cannot catch is a key that is *present and still English*,
which is how half-translated pages happen. A test covers that — and it earned its
keep immediately, by exposing a dictionary key that nothing rendered and that an
exemption in the test itself had been quietly protecting.

Half-translated is worse than untranslated. It reads as broken, and a reader who
hits an English paragraph stops trusting the paragraphs they could read. So the
transit guidance, the date formatting and the page title move with the copy.

---

## D13 — A door that hands out a session, and three locks

**Decided:** once it was clear nobody would evaluate this by running `npm run
setup`.

The app is only meaningful with a trip in it, and getting a trip in it means
signing up, waiting for a link and filling in an intake form. Anyone evaluating
the project gives up long before that. So there are three named personas, each
one click from a populated view.

This is an endpoint that grants a session without proving anything — the shape of
a serious auth hole. Three things keep it closed:

1. The persona list is a hardcoded allowlist and the route takes a **key, never
   an email**, so there is no input that can be bent into "sign me in as someone
   else".
2. Every account it can reach is created by the seed, has a `demo.` local part,
   and holds nothing but fabricated data. A test asserts that property of the
   list itself.
3. It is off unless `CAPITOLPASS_DEMO=1`, and an unset flag is a **404, not a
   403** — an endpoint that says "forbidden" has told you it exists.

Deliberately not keyed off `NODE_ENV`: the whole point is that it works on a
hosted production build, and inferring it from the environment would mean either
breaking the deployment or opening the door on every deployment.

---

## D14 — Deploy on a disk rather than rewrite for Postgres

**Decided:** when the app needed a public URL.

The obvious answer is a serverless platform, and it is the wrong one here.

Data lives in a SQLite file through Node's built-in `node:sqlite`, and that
driver is **synchronous**. The query helpers return values directly and about
forty call sites depend on that. Serverless means an ephemeral filesystem, which
means Postgres, which means the helpers become async, which means every caller
does too — including the feasibility engine's callers, every server action and
every page.

That is the right change the day more than one school uses this at once. It is
the wrong change to get a working link: a wide, mechanical refactor with real
odds of breaking a working app, buying a visitor nothing they can see. The
Postgres path stays written and ready in `supabase/schema.sql`.

Two things this surfaced, both of which fail silently:

- **`NEXT_PUBLIC_*` variables are inlined at build time.** A container built
  without one has `undefined` compiled in, and setting it in the environment
  afterwards changes nothing. Every route-handler redirect fell back to the
  bound address and pointed at `http://0.0.0.0:3000` — sign-in would set its
  cookie and land the user on a dead address with nothing in the logs. The
  runtime variable is `CAPITOLPASS_SITE_URL`, and one module now owns the
  origin for the cookie flag, mail links and redirects alike.
- **The seed left its writes in the WAL.** The image copies one `.db` file out
  of a build stage, so without an explicit checkpoint the shipped container had
  a database with no demo in it. Found by running the standalone build against a
  lone `.db` — the shape the image actually ships, which local development never
  reproduces.

---

## D15 — The anniversary is a fact; the advice is ours

**Decided:** with rule R15.

July 4, 2026 is the 250th anniversary of the Declaration of Independence. That is
a matter of record. What follows from it for a teacher is a judgment, and R15
carries `heuristic` confidence so the app says so wherever it appears.

**We publish no visitor forecast, because we do not have one worth quoting.** The
advice rests on arithmetic instead: an office may host one school tour a week
whether ten schools ask or a hundred. Lead time is the only variable a teacher
controls. That needs no forecast to be true, and it is the kind of claim that
survives a judge asking where the number came from.

The advisory keys off the *recommended* strategy rather than whatever is merely
viable — the split-group option is always technically viable, which would have
made the branch constant and the advice generic. A group heading for the Visitor
Center faces a different constraint from one competing for an office's single
weekly slot, and saying the same thing to both would overstate it for one of
them.

One knock-on worth recording, because it is the sort of thing that quietly
hollows out a demo: the seeded trip dates are offsets from today, so they drift,
and a 104-day offset had walked the flagship demo trip one day past the end of
the peak window. The entire rule was invisible in the demo anyone actually opens.
The seed now pulls a trip back inside the window when it can do so without
dropping below a believable lead time — **shifting the demo, never the rule.** If
nothing inside the window leaves enough lead time, the real date stands, because
a trip genuinely after the anniversary year should genuinely not get the
advisory.
