# Demo video: script and shot list

**Hard limit: 3:00.** The 2026 rulebook says the video "should be 1-3 minutes
long" and that judges may penalize videos outside that range. Target **2:45**,
which leaves room for natural pauses. The video **must be public** on YouTube
or Vimeo. Unlisted is not enough.

## What the rulebook requires on screen

The 2026 rules list six things the video must contain. Every one is placed
below, and the script marks each with ✅ where it lands. Do not cut a ✅ line.

1. ✅ Your name
2. ✅ The app's name
3. ✅ The purpose **in one clear sentence**
4. ✅ The target audience
5. ✅ The tools and languages used
6. ✅ The app actually working

## The idea the script is built on

CapitolPass does not demo itself. Its value is *reasoning*: the app knows a rule
and applies it. Reasoning is invisible on screen, so a tour of the interface
would show a lot of well-set text and land nothing.

So the video is built around one beat: **the app catches the mistake.** A
teacher with a full class asks her office for a staff-led tour, which takes 15,
and is told no. This app looks at a class of 34, says that tour can't take her
group, tells her the tour that can (a guided school tour, up to 50) and to ask
for it by name, and gives her the date she has to act by.

The rules behind it are sourced from congressional office tour pages, and the
demo office's availability is labelled as sample data on screen. Both matter:
the people judging this run tours for VA-10.

Say "I" throughout. Judges are scoring a student, not a product.

---

## Before you record

- [ ] `npm run db:reset && npm run db:seed` the same day you record, so dates are fresh and land on real school weekdays
- [ ] Open Dana's trip and **write down the number of days until the first deadline**. The script uses it at 1:35, and it changes with the date you record
- [ ] Browser at 1280×800, zoom 100%, bookmarks bar hidden, no other tabs
- [ ] Sign out first, so the landing page is the signed-out one
- [ ] Pre-load `/front-doors` in a second tab. It is a heavy page and you do not want to film it loading
- [ ] Record system audio off. Narrating over the top afterwards is fine

---

## Script (target 2:45)

### 0:00 – 0:15 · Who you are, and the one sentence

**On screen:** the landing page, top of the hero.

> Hi, I'm Liam Gandhi ✅, and this is CapitolPass ✅.
>
> CapitolPass plans a school field trip to the US Capitol: it finds your
> representatives, tells you what will actually work for your group, and gives
> you every deadline. ✅

*That second line is the one-sentence purpose the rules ask for. Say it exactly
once, cleanly.*

### 0:15 – 0:40 · The scatter, and who it's for

**On screen:** `/front-doors`, scrolled so the state grid fills the frame. Then
the stat tiles.

> It's for teachers bringing a class to the Capitol ✅, and the offices that
> answer them.
>
> Every square is a congressional office. I checked all five hundred and
> thirty-seven, and their tour pages are at ninety-two different URLs. There's
> no single front door.

*Do not explain the colours. The grid does that on its own.*

**If you have a real story about a real teacher, one sentence of it goes here.**
A named person beats any statistic in this video.

### 0:40 – 1:25 · The app catches the mistake

**On screen:** back on the landing page, click **Open as Dana**, then open her trip.

> This is a real high school in Virginia's tenth district. Its representative
> came from the Census geocoder, not from her.

**Let the first finding sit on screen for a full two seconds before you speak.**

> Thirty-four people. And the first thing the app does is stop her asking for
> the wrong thing.
>
> A staff-led tour, the kind an office's own staff give, takes fifteen people,
> chaperones included. Ask for one with a class of thirty-four and the answer is
> no. But her office can also book a guided school tour for up to fifty, so the
> app tells her to ask for that, by name.

**Scroll to the strategies, so the guided school tour shows as Recommended.**

### 1:25 – 1:55 · The deadline nobody tells you

**On screen:** the critical path timeline, then the three date cards.

> Every deadline, counted back from the trip. The first is [N] days away.
>
> And offices can publish which weeks they can host a school. In the demo that's
> sample data, but here her first choice is full, and she'd know before she
> picked it.

### 1:55 – 2:15 · The other side

**On screen:** switch to **Alex Chen** via the demo banner. The office queue,
then "What teachers can see."

> This is the office's side: a weekly tracker, and one click to publish
> availability to every school in the district. A week they haven't published
> never shows as open.

### 2:15 – 2:35 · How I built it, and what I got wrong

**On screen:** the `/rules` page, showing the confidence labels.

> I built it in TypeScript with Next.js, React and SQLite ✅, on real federal
> data: a hundred thousand schools and every member of Congress.
>
> My first version told a class of thirty-four it couldn't go through its
> office at all. Then I checked what offices actually publish, and school groups
> can be up to fifty. So I fixed it, and now every rule shows its source.

### 2:35 – 2:45 · Close

**On screen:** the landing page, with the URL in the address bar.

> Every school should be able to make this trip. I'm Liam Gandhi, and this is
> CapitolPass.

**End card:** the deployed URL, on screen for three full seconds. (The end card
can run past 2:45. Stay under 3:00.)

---

## If you run long

Cut in this order:

1. "Ask for one with a class of thirty-four and the answer is no" at 1:10
2. The "one click to publish availability" clause at 2:05
3. The geocoder sentence at 0:45. Keep "a real high school in Virginia's tenth district"

**Never cut:** your name, the one-sentence purpose, "it's for teachers," the
tools line, the catches-the-mistake beat, or "In the demo that's sample data."
The first four are required by the rules. The fifth is the whole video. The last
keeps you from presenting invented data as the office's own to the office.

## Things not to do

- **Do not narrate the interface.** "Here we can see a button that says…" is
  the most common way these videos die.
- **Do not show sign-up.** That is why the demo doors exist.
- **Do not apologise for what is unfinished.** The roadmap is honestly labelled
  in the app.
- **Do not read this word for word.** Learn the beats and say them like a
  person. Two takes of natural speech beat one perfect read.
- **Do not call the 250th anniversary upcoming.** July 4, 2026 has passed, and
  judges watch this in November or later. If you mention it, use the past
  tense: the anniversary brought more schools, and the weekly cap didn't move.

## Captions

Upload a caption file instead of relying on auto-captions. It takes ten
minutes, some judges watch muted, and auto-captions will mangle "CapitolPass"
and "Subramanyam."

## Timing check

Read the script aloud once with a stopwatch before you record. At a normal
speaking pace the narration is about 2:25 (about 360 words), which leaves 15 seconds for pauses
and the end card. If your read-through comes in over 2:45, cut from the list
above before you record, not in the edit.
