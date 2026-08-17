# Congressional App Challenge, submission form

Drafts for the portal fields, in your voice. Anything in [brackets] is a fact I
don't have. Fill those in or cut them, but don't leave them.

Check the actual field names and word limits on the portal before you paste.
They move around year to year.

---

## App name

CapitolPass

---

## What does your app do?

CapitolPass plans a school field trip to the US Capitol.

You describe the trip once. It figures out which school you're at, which
congressional district that is, and who your Representative and Senators are, so
you never have to look any of that up. Then it tells you whether your trip
actually works.

That last part is the point. A tour led by a congressional office's staff caps at
15 people, counting chaperones. Most teachers find that out after they've already
asked. If you have a class of 30, the app says so up front and routes you to the
Capitol Visitor Center instead, with a dated list of what you have to send and
when.

It also has a side for congressional offices. They get a queue of requests where
the constituent check is already done, and they can publish which weeks they can
actually host a school. An office can only take one school tour a week, so two
schools in the same district end up fighting over the same week without either of
them knowing. Now they can see it before they pick a date.

---

## What inspired you to create this app?

[This is the one part I can't write for you. Put the real story here.]

If you have one, use it. A specific teacher, a specific trip, a specific person
who gave up. One real sentence about a real person beats anything else you could
put in this box.

If you don't have a story, the honest version works fine:

> I looked at how you actually book a trip to the Capitol and there's no single
> way to do it. There are 535 congressional offices and every one of them runs
> its own tour page on its own website. I checked all of them. 498 have a real
> tour page and they're at 92 different URLs. The teachers who pull this off are
> mostly the ones who already know somebody who worked on the Hill. Everybody
> else gives up somewhere in the middle.
>
> 2026 is the 250th anniversary, so a lot more schools are going to try this
> year, and the number of tours an office can host per week hasn't changed.

---

## What programming languages and tools did you use?

TypeScript, on Next.js 16 with React. Tailwind for styling. SQLite through
Node's built-in driver, so there's no database server to install. Vitest for
tests.

Almost the whole thing is server rendered. There's basically no client side
JavaScript, which keeps it usable on a school laptop with bad wifi.

It runs on real federal data, none of it behind an API key:

- 100,155 schools from the NCES Common Core of Data, each with coordinates
- The US Census Geocoder, for turning those coordinates into a congressional
  district
- The congress-legislators dataset, for all 537 current members

I also wrote a script that goes out and finds each office's tour request page,
since no list of those exists anywhere.

---

## What challenges did you face, and what did you learn?

Three things I assumed turned out to be wrong, and they were the interesting
part.

**I assumed the congressional dataset had a contact form for every member.** It
has one for 88 out of 537. And a tour request doesn't go to the general contact
form anyway, it goes to a separate tour page. So I wrote a script to find them.

**My first version of that script guessed at URLs.** It tried paths like
`/services/tours` and checked if they loaded. It topped out at 89 offices, and it
was never going to do better, because it could only find paths I'd already
thought of. So I rewrote it to load each office's homepage and read the
navigation menu instead, the way a person would. That found 485. It also cost
about two requests per office instead of ten.

Partway through, house.gov started returning 403 on URLs that had worked ten
minutes earlier. That's a firewall doing its job. I made the script record those
as "blocked" instead of "no tour page," because treating a rate limit like a
missing page would have quietly filled my data with wrong answers.

**I assumed I could geocode school addresses.** I tested three. Two returned
nothing. School addresses are messy. But the school directory ships latitude and
longitude for basically every school, and the Census has a separate endpoint that
takes coordinates and does a point in polygon lookup against the district
boundaries. That works everywhere. So the app never uses an address, and it never
guesses a district from a ZIP code, since ZIPs cross district lines all the time
and a wrong guess sends a teacher's request to an office that will correctly
ignore it.

The bigger thing I learned is that being honest about what you don't know is a
feature. Every rule the app applies is written down with where it came from, when
I last checked it, and whether it's official guidance or just my own judgment.
Five of the fifteen are my judgment, and the app says so every time one of them
shows up. It would have been easy to state all fifteen in the same confident
voice. That would have been lying.

---

## Anything else? (if the form has this field)

There's one thing the app will never do, and I built it that way on purpose. It
won't email a congressional office for you. Automated mail to .house.gov gets
filtered, and it wastes the time of people whose inboxes are a public resource.
Every request leaves through a channel a human picked, either the office's own
form, the teacher's own mailbox, or a queue that office signed up for.

The student and family pages are in Spanish as well as English. The permission
slip and the what you can't bring list are exactly where a language barrier keeps
a kid off the bus.

[If you talked to teachers or to a congressional office, one line here. How many
people, and the single most surprising thing they told you. Skip it if you
didn't.]

---

## If they ask about AI assistance

Answer it straight. Say what you used it for and what you decided yourself.
Something like:

> I used Claude as a coding assistant. The research calls were mine: checking all
> 537 offices, finding out the contact form data was incomplete, testing the
> geocoder and switching to coordinates, and deciding which rules were solid
> enough to state as fact. [Adjust this to what's actually true.]

Don't undersell it and don't hide it. The commit history and the decision log are
both in the repo and both show the work.
