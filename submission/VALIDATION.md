# Validation kit

Everything in this project so far argues that a problem exists. None of it is
evidence that anyone else thinks so.

That gap is worth closing, and not only for the scoring rubric. Right now the
strongest claim the project can make is *I believe this is a problem and here is
what I measured about the routing.* Five conversations turns that into *I asked
seven teachers and a congressional scheduler, and six of the seven had already
hit the fifteen-guest cap without knowing it existed.*

Almost no submission has any of this. It is the cheapest available advantage.

---

## What to find out

Four questions. Everything below is in service of them.

1. **Does the problem land?** Have they actually tried to organise a DC trip, and
   where did it stall?
2. **Was the fifteen-guest cap a surprise?** This is the app's central claim. If
   experienced teachers all knew it already, the framing needs to change.
3. **Would published office availability change what they do?** This is the
   newest and least proven feature.
4. **What would stop them using this?** The answer you least want is the one
   worth the most.

---

## Teacher interviews

**Target: five to seven.** Social studies and civics teachers first; an
activities director or trip coordinator is worth two teachers. Twenty minutes
each. In person or a call — not a survey form, because the useful material is
always in an aside.

### Finding them

- Your own school's social studies department, and the department chair
- The activities or student-activities office, which owns field trip paperwork
- A teacher who has run a DC trip before — every school has one, and everyone
  knows who they are
- If you have a contact in a congressional office, ask which schools in the
  district have asked about tours. That list is the best sample you can get.

### The guide

Open by saying you built something and want to know whether it is wrong. People
are far more useful when they think they are helping you find flaws than when
they think they are being shown a product.

**Do not demo the app until question 6.** Everything before that is
contaminated the moment they see a solution.

1. Have you ever tried to organise a trip to DC or the Capitol? Tell me what
   happened.
2. *(if yes)* Walk me through what you actually did first. Who did you contact?
3. Where did it get stuck, or where did it take longer than you expected?
4. How many students would go on a typical trip? How many adults?
5. What did you know about how a Capitol tour gets booked before you started?
6. **Now show the 34-person plan.** Do not explain it. Ask: *what is this telling
   you?* Then wait. Whether they get it unaided is the single most useful thing
   you will learn all day.
7. Did you know about the fifteen-guest cap?
8. **Show the date cards with the office availability.** Would knowing this
   before you picked dates change anything?
9. What is missing? What would stop you using this?
10. Is there anything I should have asked?

### Recording it

Take notes during, write them up within an hour, and capture **verbatim
quotes** — a real sentence in a teacher's own words is worth a paragraph of your
summary, in the video and in the write-up.

Log each conversation in `submission/interviews/` as a dated file:

```
submission/interviews/2026-09-04-social-studies-chair.md
```

Include: role, whether they have run a DC trip, answers to 1–10, at least one
verbatim quote, and one line on what you changed or did not change as a result.
**Ask permission to quote them, and ask whether they want to be named or
described by role.** A teacher's name in a public video is their decision, not
yours.

---

## The congressional office conversation

You have access most applicants do not. Use it once, well.

**Ask for twenty minutes with whoever handles tour requests** — usually a staff
assistant or the scheduler, not the district director. That person lives inside
the exact constraint this app is built around, and their reaction is the most
credible sentence available to this project.

### What to ask

1. How do school tour requests actually reach you now? Email, the web form, a
   phone call?
2. Roughly how many do you get in a busy month?
3. How do you track which weeks are already committed?
4. What do teachers most often get wrong when they ask?
5. **Show the office queue and the capacity tracker.** Is this how you think
   about the week?
6. **Show the publish-availability list.** Would your office publish this? What
   would stop you?
7. Is there anything about this that would make your job harder rather than
   easier?

Question 6 is the real one. If the answer is no, find out whether it is a policy
problem or a workload problem — those need different fixes, and knowing which
one it is *is itself a finding worth reporting*.

### One caution

Be clear that this is a school project and that nothing in it sends mail to any
office. Ask before you use the office's name, the Member's name, or any quote in
a public video or write-up. An office that feels surprised by how it was
represented is a worse outcome than not having the quote.

---

## What to do with the results

**In the video**, one line at most, early: *"I talked to seven teachers. Six had
never heard of the fifteen-guest cap."* Do not spend thirty seconds on
methodology.

**In the written submission**, a short section: how many people, what roles, the
three things you learned, and — most valuable — **one thing you changed because
of what they said.** A project that visibly moved in response to a user is
categorically different from one that was merely admired.

**In the repo**, the interview files themselves, plus a new entry in
[`DECISIONS.md`](../DECISIONS.md) for anything that changed the design. That log
already records what you got wrong from data; user research belongs in exactly
the same place.

---

## If nobody replies

It happens, and it is not a reason to claim nothing.

Fall back to what you can honestly say: you tested the routing against 537 real
offices, you measured the 88-of-537 contact-form gap yourself, and two of the
first three school addresses you geocoded failed. That is real evidence about a
real system, gathered by you.

State plainly that you were not able to interview teachers in time. Do not
imply, in a video or a form, that you talked to people you did not talk to.
Every other honesty commitment in this project is load-bearing, and this is the
one where it would be easiest and most damaging to break.
