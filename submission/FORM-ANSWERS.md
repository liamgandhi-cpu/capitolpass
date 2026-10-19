# Congressional App Challenge, submission form

Drafts for the portal fields, in your voice, matched to the six questions the
**2026 rulebook** lists (section 4, "Questions"). The rulebook says the portal
asks questions "similar to" these, so check the real field names and any word
limits when you log in, and trim to fit.

Anything in [brackets] is a fact I don't have. Fill it in or cut it, but don't
leave it in.

**After 12:00 pm EDT on Monday, October 26, 2026, the submission cannot be
changed in any way.** Submit a day early.

---

## 1. What is the title of your app?

CapitolPass

---

## 2. Explain the app's purpose.

CapitolPass plans a school field trip to the US Capitol.

A teacher describes the trip once. The app works out which school they're at,
which congressional district that is, and who their Representative and Senators
are, so they never have to look any of that up. Then it tells them whether the
trip actually works.

That last part is the point. There are two kinds of tour an office can arrange.
A staff-led tour, given by the office's own staff or interns, takes at most 15
people, chaperones included. A guided school tour the office books takes a school
group of up to 50. A teacher with a class of 30 who asks for the first kind gets
told no. The app tells her up front to ask for the second kind by name, and gives
her a dated list of what to send and when.

There's also a side for congressional offices. They get a queue of requests
where the constituent check is already done, and they can publish which weeks
they can actually host a school. Offices can only run so many tours a week, so
two schools in the same district can end up asking for the same week without
either of them knowing. Now teachers can see that before they pick a date.

---

## 3. What inspired you to create this app?

[This is the one part I can't write for you. Put the real story here.]

You intern in Rep. Subramanyam's office, so you may have a real story: what you
saw of how tour requests come in, or what made you think a teacher needed this.
Use it if you have it, with two cautions. Don't share anything the office
wouldn't make public, like a constituent's name or a specific request. And say
plainly that you intern there; the judges will know anyway.

One real sentence about a real person beats anything else you could put in this
box.

If you don't have a story, the honest version works fine:

> I looked at how you actually book a trip to the Capitol, and there's no single
> way to do it. There are 537 congressional offices, and every one of them runs
> its own tour page on its own website. I checked all of them. 498 have a real
> tour page, and they're at 92 different URLs, each with its own rules. A
> teacher doing this for the first time has to piece it all together from
> scratch.
>
> 2026 was the 250th anniversary, so more schools than usual tried to make this
> trip, and the number of tours an office can host each week didn't change.

---

## 4. What technical/coding difficulty did you face, and how did you address it?

Three things I assumed turned out to be wrong, and fixing them was most of the
real work.

**Finding the tour pages.** I assumed the congressional dataset had a contact
form for every member. It has one for 88 out of 537, and a tour request doesn't
go to the general contact form anyway. It goes to a separate tour page, and no
list of those exists. So I wrote a script to find them.

My first version guessed at URLs. It tried paths like `/services/tours` and
checked whether they loaded. It topped out at 89 offices and was never going to
do better, because it could only find paths I'd already thought of. So I
rewrote it to load each office's homepage and read the navigation menu instead,
the way a person would. That found 485, at about two requests per office
instead of ten.

Partway through, house.gov started returning 403 on URLs that had worked ten
minutes earlier. That's a firewall doing its job. I made the script record those
as "blocked" instead of "no tour page," because treating a rate limit like a
missing page would have quietly filled my data with wrong answers.

**Finding the district.** I assumed I could geocode school addresses. I tested
three, and two returned nothing. School addresses are messy. But the federal
school directory has latitude and longitude for basically every school, and the
Census has a separate endpoint that takes coordinates and does a point-in-polygon
lookup against district boundaries. That works everywhere. So the app never uses
an address, and it never guesses a district from a ZIP code. ZIPs cross district
lines all the time, and a wrong guess sends a teacher's request to an office
that will correctly ignore it.

**Making the rules testable.** All of the trip logic is one pure function: a
trip goes in, a plan comes out, with no database, no network and no clock. That
meant I could test it properly. There are 108 tests, and they run in under a
second.

---

## 5. What did you learn while participating in the CAC? What was your biggest takeaway?

My biggest takeaway is that being honest about what you don't know is a
feature.

Every rule the app applies is written down with where it came from, when I last
checked it, and whether it's official guidance or my own judgment. Five of the
sixteen are my judgment, and the app says so every time one of them shows up. It
would have been easy to state all sixteen in the same confident voice, but that
would have been lying to the teachers using it.

That habit is also how I caught my biggest mistake. My first version said a tour
through a congressional office caps at 15 people, so it told a class of 34 to go
somewhere else. When I went back to find a source for that rule, the office tour
pages said something different: 15 is the limit for a staff-led tour, but an
office can book a guided tour for a school group of up to 50. The app had been
telling teachers the opposite of what they needed to hear. I fixed the rule, the
plan, and the request the app writes for the office, and now every rule links
to where it came from.

The same thing came up with data. An office that hasn't published its
availability shows as "not published," never as "open." Silence isn't a yes,
and an app that pretends it is will send a teacher after a week that was never
available.

I also learned to check my assumptions against real data before building on
them. Every big problem in this project, the three in question 4 and the tour
limit above, came from something I was sure of until I checked.

[If you talked to teachers or a congressional office, one line here: how many
people, and the most surprising thing they told you. Skip it if you didn't.]

---

## 6. What would you change about your app if you were to create a 2.0 version?

Three things, in order:

1. **Get real offices using the queue.** Right now the office side runs on a
   demo office. The domain check is real, since you can't get a house.gov
   address without working there, but it doesn't prove *which* office you work
   for. Version 2 would confirm claims with the office directly, and I'd start
   with my own Representative's office.
2. **Keep the tour-page data fresh automatically.** The 498 tour URLs were each
   confirmed on a recorded date, but websites change. I'd run the discovery
   script on a schedule and flag any office whose page moved or broke.
3. **Cover more of the trip.** Lunch is the part teachers ask about most, and
   the current directory is just public information with no real partners. I'd
   also add live Metro data, which needs an API key I haven't set up.

---

## AI usage disclosure

**Read this before you write the answer.** The 2026 rulebook says:

- AI is allowed only if **all** AI usage is **fully disclosed** in the submission.
- AI "must not constitute the entirety of the technical development."
- "All coding and technical development must be done by the student," and you
  are "expected to demonstrate significant individual contributions and
  technical understanding."
- Judges can ask for the app and source code to verify it, and refusing means
  disqualification.

The repo's commit history shows Claude as co-author on 33 of the 34 commits.
That is accurate, it is public once the repo is on GitHub, and a judge who
reads it will see it. Don't try to hide it. Write the disclosure so it matches
what the history already shows, and make sure the **Significant individual
contributions** part is true.

A shape that works (rewrite it so every sentence is accurate):

> I used Claude (Anthropic's AI assistant) as a coding assistant throughout,
> and the commit history shows it as co-author. [Say plainly how much of the
> code it wrote.]
>
> The decisions and research were mine: [list what is actually yours. For
> example, choosing the problem; checking how tour requests work; deciding to
> measure all 537 offices; finding that the contact-form data covered only 88;
> testing the geocoder and switching to coordinates; deciding which rules were
> solid enough to state as fact and which to label as my judgment; deciding the
> app would never email an office.]
>
> I can explain how every part of it works, and I'm happy to walk a judge
> through the code.

Then make that last line true. See [`JUDGE-PREP.md`](JUDGE-PREP.md).

---

## Repo and demo links

- **Repo:** [your GitHub URL]. Open it in a private window to check it's public.
- **Live app:** [your deployed URL]. Check that the demo doors work in a private window.
- **Video:** [YouTube or Vimeo URL]. Must be set to **public**, not unlisted.
