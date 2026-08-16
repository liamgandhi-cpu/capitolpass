# Demo video — script and shot list

Target run time **3:15**. Confirm the current limit on the Congressional App
Challenge portal before you cut; it has been four minutes in recent years, and
going over is a disqualification rather than a deduction.

## The problem this script solves

CapitolPass does not demo itself. Its value is *reasoning* — the app knows a
rule and applies it — and reasoning is invisible on screen. A tour of the
interface would show a lot of well-set text and land nothing.

So the video is built around one beat: **the app tells you no.** Most student
projects say yes to everything. Yours looks at a class of 34 and says the path
you were about to take cannot seat your group, here is why, here is what can,
and here is the date you have to act by. Everything else in the script exists to
set that up or to pay it off.

Say "I" throughout. Judges are scoring a student, not a product.

---

## Before you record

- [ ] `npm run db:reset && npm run db:seed` — fresh demo data, dates snapped to real school weekdays
- [ ] Confirm the deployed URL loads and the three demo doors work
- [ ] Browser at 1280×800, zoom 100%, bookmarks bar hidden, no other tabs
- [ ] Sign out first, so the landing page is the signed-out one
- [ ] Have `/front-doors` pre-loaded in a second tab — it is a heavy page and you do not want to film it loading
- [ ] Record system audio off; narrate over the top afterwards if that is easier than live

---

## Script

### 0:00 – 0:20 · The scatter

**On screen:** `/front-doors`, scrolled so the state grid fills the frame.

> Every one of these squares is a congressional office. Five hundred and
> thirty-seven of them, and every single one runs its own tour request page, on
> its own website, at its own address.
>
> I know that because I checked all of them.

**Cut to:** the four stat tiles — 537 / 498 / 92 / 66.

> Four hundred and ninety-eight have a real tour page. They are at ninety-two
> different URLs. Sixty-six of those are used by exactly one office.

*Do not explain the colours. The grid does that on its own.*

---

### 0:20 – 0:45 · Who this is actually for

**On screen:** the landing page hero.

> Booking a Capitol field trip is not one action. It is a scattered, undocumented
> process, and the teachers who pull it off are disproportionately the ones with
> a parent volunteer who used to work on the Hill.
>
> Everyone else gives up somewhere in those ninety-two front doors.

**If you have a real story, it goes here and it replaces this paragraph.** One
sentence about a specific teacher, a specific class, a specific trip that did
not happen. A named person beats any statistic in this video.

---

### 0:45 – 1:35 · The app says no

**On screen:** click **Open as Dana** on the landing page. Land on the trip list,
click through to the trip.

> This is a real school in Virginia's tenth district. I never typed who her
> representative is — the school's coordinates come from the federal school
> directory, go to the Census geocoder, and come back as a congressional
> district.

**Scroll to the first finding. Let it sit on screen for a full two seconds
before you say anything.**

> Thirty-four people. And the first thing the app does is tell her the thing she
> was about to do cannot work.
>
> A tour led by a congressional office's staff is capped at fifteen guests —
> students, teachers and chaperones counted together. Most teachers find that
> out *after* they have already asked.

**Scroll to the strategies section.**

> So it does not just refuse. It ranks what is actually open to a group this
> size: the Visitor Center seats all thirty-four, and splitting the group is
> offered but never as the default, because a split needs two separate requests
> to land.

---

### 1:35 – 2:05 · The deadline nobody tells you about

**On screen:** the critical path timeline.

> Counted backwards from the trip date. Seven deadlines, drawn to scale — you can
> see the six quiet weeks and then three deadlines landing inside one.
>
> The first one is in five days. Nobody tells a teacher that.

**On screen:** the date cards, showing OFFICE: FULL / CLOSED / OPEN.

> And this is the part I am most pleased with. The office has published which
> weeks it can actually take a school. Her first choice is already gone — a
> district school asked first.
>
> She finds that out now, instead of in October.

---

### 2:05 – 2:35 · The other side

**On screen:** switch to **Alex Chen** via the demo banner. Land on the office queue.

> Same system, from the congressional office. A queue of requests where the
> constituent check is already done, and a weekly capacity tracker — because an
> office may host one school tour a week and nothing else a staffer uses shows
> them that.

**Scroll to "What teachers can see."**

> This is where that availability came from. One click, and it is visible to
> every school in the district before they commit to a date.
>
> A week the office says nothing about shows as *not published* — never as open.
> Silence is not a yes, and the app never pretends otherwise.

---

### 2:35 – 3:00 · What I got wrong

**On screen:** `DECISIONS.md` on GitHub, or the `/rules` page.

*This section is worth more than another feature. Judges score what you
learned, and almost nobody uses the time on it.*

> Three things in my own spec turned out to be false.
>
> I assumed the legislators dataset had a contact form for every member. It has
> them for eighty-eight out of five hundred and thirty-seven.
>
> I assumed I could geocode school addresses. Two of the first three I tried
> returned nothing, so the whole thing runs on coordinates instead.
>
> And my first script for finding tour pages guessed at URLs. It topped out at
> eighty-nine offices, because it could only ever find paths I had thought of.
> Reading each office's own navigation menu instead found four hundred and
> eighty-five.

---

### 3:00 – 3:15 · Close

**On screen:** the `/rules` page, showing the confidence labels.

> Every rule the app applies is written down, with its source, the date I last
> checked it, and whether it is published guidance or my own judgment. Four of
> the fifteen are my judgment, and the app says so everywhere they appear.
>
> July fourth, twenty twenty-six is the two hundred and fiftieth anniversary.
> The weekly tour cap is the same as it was last year. That is the whole reason
> this needs to exist now.

**End card:** the URL, on screen, for three full seconds.

---

## Things to cut if you run long

In this order:

1. The split-group explanation at 1:20 (keep the cap, drop the ranking detail)
2. The landing page section at 0:20 — go straight from the grid to Dana
3. The Senate/House stat detail in the opening

**Never cut:** the app-says-no beat, the office availability beat, or *What I
got wrong*.

## Things not to do

- **Do not narrate the interface.** "Here we can see a button that says…" is
  the single most common way these videos die.
- **Do not show sign-up.** That is why the demo doors exist.
- **Do not apologise for what is unfinished.** The roadmap is honestly labelled
  in the app; a judge who finds it will credit you. A judge who hears you
  apologise will go looking for more.
- **Do not read this script aloud verbatim.** Learn the beats and say them like
  a person. Two takes of natural speech beat one perfect read.

## Captions

Upload a caption file rather than relying on auto-captions. It takes ten
minutes, some judges watch muted, and an app that targets WCAG 2.1 AA with an
uncaptioned demo video is an own goal a judge may well notice.
