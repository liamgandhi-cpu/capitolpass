# Judge prep: know your code

The 2026 rulebook gives judges the right to ask for the app and the source code
"in person or via any reasonable manner," and expects you to show "technical
understanding of [your] app." With AI disclosed on the form, assume a judge or
staffer may ask you to explain something on the spot.

This is a study guide, not a script. For each question, open the file, read the
code until you could explain it without notes, then close it and explain it out
loud. If you can't, that's the part to study.

**Do one section a day.** Ten sections, about ten days, done before October 26.

---

## 1. "Walk me through what happens when a teacher creates a trip."

Follow it yourself, in order:

1. The form: [`app/teacher/trips/new/page.tsx`](../app/teacher/trips/new/page.tsx)
2. The trip is saved: `createTrip` in [`lib/trips/`](../lib/trips/)
3. The plan is built: `buildPlan` in [`lib/feasibility/engine.ts`](../lib/feasibility/engine.ts) (around line 672)
4. The page renders it: [`app/teacher/trips/[id]/page.tsx`](../app/teacher/trips/%5Bid%5D/page.tsx)

**Be able to say:** what goes into `buildPlan`, what comes out, and why it
takes `requestedOn` as an input instead of reading today's date.

<details><summary>Check yourself</summary>

It's a pure function. Same input, same output, with no database, network or
clock. Passing the date in means a test can say "pretend today is March 1" and
always get the same answer.
</details>

## 2. "How does it know the school's congressional district?"

- [`lib/districts/census.ts`](../lib/districts/census.ts): `districtByCoordinates` (line 156)
- [`lib/schools/index.ts`](../lib/schools/index.ts): `resolveSchoolDistrict` (line 183)

**Be able to say:** why coordinates and not the address, why never a ZIP code,
and what the Census geocoder actually returns.

## 3. "How did you find all those tour pages?"

- [`scripts/discover-tour-routes.ts`](../scripts/discover-tour-routes.ts): `findTourPage` (line 202), `scoreLink` (line 141), `extractCandidates` (line 168)

**Be able to say:** how a link gets scored, why reading the nav menu beat
guessing URLs (89 → 485), and what happens on a 403. That's the comment at line
40, and the `blocked` outcome at line 212.

## 4. "Where do the rules come from? How do I know they're right?"

- [`lib/feasibility/rules.config.ts`](../lib/feasibility/rules.config.ts)

**Be able to say:** the three confidence levels (`published`, `documented`,
`heuristic`), and name the five heuristic rules without looking. Explain R1 (15
per staff-led guide) and R16 (school groups up to 50 when the office books a
guided tour): where each number comes from, and why both are `documented`
rather than `published`. Open the source link on each and read it.

## 5. "What happens if a group is 15? 16? 34? 51?"

- `totalGuests` (line 42) and `buildStrategies` (line 171) in [`engine.ts`](../lib/feasibility/engine.ts)
- The tests in [`lib/feasibility/__tests__/engine.test.ts`](../lib/feasibility/__tests__/engine.test.ts)

**Be able to say:** that adults count toward both limits; that 15 or fewer gets
a staff-led tour, 16 to 50 gets a guided school tour booked by the office, and
over 50 books the Visitor Center directly; and why the app tells a teacher to ask
for a "school group tour" by name.

## 5b. "Your first version got the tour limit wrong. How did you find out?"

Expect this one. The people judging run tours for this district.

- D16 in [`DECISIONS.md`](../DECISIONS.md), and section 4 of "Four things the plan got wrong" in the README

**Be able to say:** what the app used to tell a class of 34, what the office
tour pages actually say, and the three places the fix landed: the rule (R16),
the plan (`buildStrategies`), and the packet sent to the office
([`lib/packets/index.ts`](../lib/packets/index.ts)). Owning a mistake you caught
yourself is a strength. Don't play it down.

## 5c. "Why does the demo use our office?"

- `isDemoOffice` (line 85) in [`lib/offices/index.ts`](../lib/offices/index.ts), and D17 in [`DECISIONS.md`](../DECISIONS.md)

**Be able to say:** the routing is real (a real school resolves to VA-10 and to
Rep. Subramanyam), but every request, week and note shown for the office is
invented, and each page says so. Nothing is ever sent to the office.

## 6. "How does sign-in work? Is there a password?"

- [`lib/auth/index.ts`](../lib/auth/index.ts): `createMagicLink` (line 112), `consumeMagicLink` (line 135), `startSession` (line 168)

**Be able to say:** what a magic link is, why the cookie is `httpOnly`, and why
there are no passwords to leak.

## 7. "Isn't the demo button a security hole?"

- [`lib/auth/demo.ts`](../lib/auth/demo.ts): read the SAFETY comment at the top

**Be able to say:** the three things that keep it closed (a hardcoded allowlist,
demo-only accounts, and off unless `CAPITOLPASS_DEMO=1`).

## 8. "How does published availability work?"

- [`lib/offices/availability.ts`](../lib/offices/availability.ts): `setWeekStatus` (line 150), `weekStatusFor` (line 119)
- [`lib/offices/index.ts`](../lib/offices/index.ts): `weeklyCapacity` (line 333)

**Be able to say:** why a week the office hasn't published shows as "not
published" and never as "open."

## 9. "Why SQLite? Why Next.js?"

- [`lib/db/index.ts`](../lib/db/index.ts): the only file that touches the database driver
- [`supabase/schema.sql`](../supabase/schema.sql): the same model in Postgres

**Be able to say:** cloning and running it takes two commands and no
credentials. Server rendering keeps it fast on a school laptop with bad wifi.

## 10. "Show me a test. Run them."

```bash
npm test
```

Pick one test in [`engine.test.ts`](../lib/feasibility/__tests__/engine.test.ts),
read it aloud, and explain what would break if it failed.

---

## The question you most need to be ready for

**"How much of this did the AI write?"**

Answer it the same way you answered on the form, and make sure that answer is
true. A judge who asks this isn't hunting for a gotcha. They want to see that
you understand what you submitted and own the decisions in it. Sections 1–10
are how you show that.

If you have time before the deadline, the strongest move is to **build one
real piece yourself**: a small feature or fix that you write, test and commit
on your own, with no AI co-author on the commit. Something from the 2.0 list in
the form answers is a good candidate. Then you can point at it.
