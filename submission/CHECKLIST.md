# Submission checklist

**Deadline: 12:00 pm EDT, Monday, October 26, 2026.** That's noon, not
midnight. After it passes the submission "cannot be modified in any way."
Source: the [2026 CAC rules](https://www.congressionalappchallenge.us/wp-content/uploads/2026/05/2026-CAC-Rules.pdf),
section 5. VA-10 may set its own earlier date, so check Rep. Subramanyam's CAC
page too.

**Aim to submit on Sunday, October 25.** Everything below is ordered to hit
that.

The engineering is done. What's left is mostly things only you can do.

---

## 0. Two things to settle first

- [ ] **Confirm which district you're entering.** You can compete where you live
  or where you go to school, in one district only (rulebook §1). TJ is in
  **VA-8**: the app's own geocoder resolves its coordinates there. So entering
  **VA-10** means your **home** address has to be in VA-10. Check it before you
  register, since registration asks for both.
- [ ] **Tell Rep. Subramanyam's App Challenge contact that you're entering, and
  that you intern in the office.** The rules don't bar interns, but this office
  judges the contest and the app features the office. Disclose it up front and
  let them decide whether anything should be handled differently. Ask the same
  person who you can talk to about tour rules (see
  [`VALIDATION.md`](VALIDATION.md)).

---

## Suggested schedule

| Dates | What |
|---|---|
| Oct 11–12 | Settle §0. Register on the portal (§1). Push to GitHub (§2). Deploy (§3) |
| Oct 11–21 | One section of [`JUDGE-PREP.md`](JUDGE-PREP.md) a day |
| Oct 12–16 | **Talk to the office's tour coordinator** about the tour rules (§4). Then teachers, if you can |
| Oct 19–22 | Record and upload the video (§5) |
| Oct 23–24 | Fill in the form (§6) |
| **Oct 25** | **Last pass and submit (§7)** |

---

## 1. Register on the portal first

Registration takes things you may have to go and find. From the rulebook, §2:

- [ ] A **personal** email address, not your school account
- [ ] Your home address with its **9-digit ZIP**, district, and Member of Congress
- [ ] Your school's address with its **9-digit ZIP**, district, and Member of Congress
- [ ] A parent or guardian's name and email
- [ ] (Optional) a coding teacher or mentor's name and email
- [ ] Complete the eligibility quiz, and wait for the email that lets you proceed

Look up a 9-digit ZIP at the USPS "Look Up a ZIP Code" tool.

---

## 2. Put the code on GitHub

There's no git remote yet, so nothing is on GitHub.

- [ ] Create a **public** repo and push `main`
- [ ] Check that `.env.local` did **not** get committed. It's in `.gitignore`, but look anyway
- [ ] Open the repo in a private window. Check that the README renders and the screenshots show
- [ ] Check that CI runs green on the first push

---

## 3. Deploy

Nothing else here is worth much until a judge can click a link. `flyctl` isn't
installed on this machine, so install it first. Full steps are in
[`DEPLOY.md`](../DEPLOY.md).

- [ ] Install flyctl and sign in
- [ ] `fly launch --no-deploy --copy-config`
- [ ] `fly volumes create capitolpass_data --region iad --size 1`
- [ ] `fly deploy`
- [ ] Change `CAPITOLPASS_SITE_URL` in [`fly.toml`](../fly.toml) if you used a different app name

Then check on the deployed URL, not on localhost:

- [ ] The three demo doors on the landing page each open a populated view
- [ ] `/front-doors` loads and the grid is there
- [ ] A student page loads, and `?lang=es` shows Spanish
- [ ] Sign-in **redirects to your real hostname**, not to `0.0.0.0`

That last one is the failure that hides. Only the runtime `CAPITOLPASS_SITE_URL`
configures a container. Get it wrong and sign-in lands the user on a dead
address with nothing in the logs.

**Keep it running until January 15, 2027.** Judging happens after the deadline,
and winners aren't announced until the embargo lifts on January 15. Once the
calendar passes November 30, the landing page's "Why this year" banner switches
on its own to a version that doesn't call the anniversary upcoming.

---

## 4. Talk to people

Guide and questions: [`VALIDATION.md`](VALIDATION.md).

- [ ] **The tour coordinator in your office, first.** Confirm or correct R1 (15 per staff-led guide), R2 (staff-led tours per week) and R16 (school groups up to 50). If anything differs, update `lib/feasibility/rules.config.ts` and cite the office

- [ ] Two or three teachers is enough at this point. Your own school's social studies department is the fastest route
- [ ] Write each one up in `submission/interviews/` the same day
- [ ] Ask permission to quote

If nobody replies in time, say nothing about interviews. Don't imply you talked
to people you didn't.

---

## 5. Shoot the video

Script: [`VIDEO.md`](VIDEO.md).

- [ ] **1–3 minutes. Target 2:45.** Over 3:00 can be penalized
- [ ] It must include your **name**, the **app name**, a **one-sentence purpose**, the **target audience**, the **tools and languages**, and the **app working**. The script marks each one ✅
- [ ] `npm run db:reset && npm run db:seed` the same day, then read the first-deadline number off Dana's trip
- [ ] Record at 1280×800, no bookmarks bar, no other tabs
- [ ] Upload a caption file
- [ ] Upload to YouTube or Vimeo, set to **public** (unlisted is not enough), and test the link in a private window

---

## 6. Fill in the form

Drafts: [`FORM-ANSWERS.md`](FORM-ANSWERS.md), matched to the rulebook's six questions.

- [ ] Replace the bracketed "what inspired you" with the real story
- [ ] **Write the AI disclosure honestly.** Read the box in FORM-ANSWERS first. The rules require full disclosure, and the commit history already shows it
- [ ] Add the interviews line, or delete it
- [ ] Paste the repo, live app, and video links

Decide deliberately:

- [ ] **A LICENSE file.** There is none, which means all rights reserved. CAC doesn't require one, and you keep the IP either way (rulebook §11). Your call
- [ ] **Keep the `Co-Authored-By` trailers.** Rewriting history to remove them would contradict the disclosure the rules require

---

## 7. Last pass and submit (Oct 25)

- [ ] `npm run typecheck && npm run lint && npm test` all clean
- [ ] `npm run build` succeeds
- [ ] CI is green on GitHub
- [ ] The deployed URL still works, including the demo doors
- [ ] The video link works in a private window, and the video is public
- [ ] Every link in the form opens in a private window
- [ ] **Submit.** Then screenshot the confirmation

---

## What is already done

So you don't redo any of it:

- Deployment config, container, and a database baked into the image
- Three one-click demo personas, guarded and tested
- `/front-doors`, the whole 537-office measurement, published
- The 250th anniversary as rule R15, labelled as judgment rather than policy, and a landing banner that stays accurate after the window closes
- Office-published availability, shown to teachers *before* they pick dates
- Spanish across every student and family surface
- The critical path drawn to scale
- Accessibility audited and three real defects fixed
- 110 tests, CI, a decision log (D1–D17), and the commit history
- README screenshots in `docs/screenshots/`
- A video script that fits the 2026 rules, form drafts matched to the 2026 questions, and a judge-prep study guide
- Tour limits corrected against published office pages: a full class is told to ask for a guided school tour (R16), not sent away (D16)
- The demo office's requests, availability and notes labelled as sample data everywhere they appear (D17)
- Landing page copy rewritten so it describes the process without criticizing the offices that run it
- An AI-assistance note in the README that matches the commit history
