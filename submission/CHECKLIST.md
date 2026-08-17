# Submission checklist

Everything left, in the order that makes sense. The engineering is done; what
remains is mostly things only you can do.

**First, before anything else:** confirm the actual deadline on the Congressional
App Challenge portal for VA-10. It is usually late October or early November,
but offices sometimes set an earlier internal date, and every plan below hangs
off it.

---

## 1. Get it deployed

Nothing else on this list is worth much until a judge can click a link.

- [ ] `fly launch --no-deploy --copy-config`
- [ ] `fly volumes create capitolpass_data --region iad --size 1`
- [ ] `fly deploy`
- [ ] Change `CAPITOLPASS_SITE_URL` in [`fly.toml`](../fly.toml) if you used a different app name

Then check, on the deployed URL, not on localhost:

- [ ] The three demo doors on the landing page each open a populated view
- [ ] `/front-doors` loads and the grid is there
- [ ] A student page loads, and `?lang=es` shows Spanish
- [ ] Sign-in **redirects to your real hostname**, not to `0.0.0.0`

That last one is the failure that hides. `NEXT_PUBLIC_*` variables are inlined
at build time, so only the runtime `CAPITOLPASS_SITE_URL` actually configures a
container. Get it wrong and sign-in sets its cookie and lands the user on a dead
address with nothing in the logs. See [`DEPLOY.md`](../DEPLOY.md).

Redeploying never wipes data: the entrypoint installs the seeded database only
when the volume is empty.

---

## 2. Talk to people

Start this now and let it run in the background. It is the longest lead time on
the list and the thing almost no other submission will have.

- [ ] Five to seven teachers, twenty minutes each
- [ ] One person in a congressional office who handles tour requests
- [ ] Write each one up in `submission/interviews/` the same day
- [ ] Ask permission to quote, and whether they want to be named or described by role

Guide and questions: [`VALIDATION.md`](VALIDATION.md). Do not demo the app until
question 6; everything before that is contaminated the moment they see a
solution.

If nobody replies in time, say so plainly and fall back on what you measured
yourself. Do not imply you talked to people you did not.

---

## 3. Shoot the video

Reserve the last full week for this. It is roughly a quarter of the score and
the only thing every judge is guaranteed to watch.

- [ ] `npm run db:reset && npm run db:seed` first, so dates are fresh and land on real school weekdays
- [ ] Record at 1280×800, no bookmarks bar, no other tabs
- [ ] Learn the beats in [`VIDEO.md`](VIDEO.md) and say them like a person, do not read it
- [ ] Add one real sentence about a real teacher if you have one
- [ ] Upload a caption file, do not rely on auto-captions
- [ ] Check the run time against the portal's limit before you publish
- [ ] Set it public or unlisted, whichever the portal requires, and test the link in a private window

The one beat that must survive any cut: **the app tells you no.** A class of 34,
and the plan opens by saying the path you were about to take cannot seat your
group.

Two things I could not do for you and that would help: **screenshots in the
README**, and a still frame of the 537-office grid for the video thumbnail.
Both are five minutes with a screenshot tool.

---

## 4. Fill in the portal

Drafts to paste: [`FORM-ANSWERS.md`](FORM-ANSWERS.md). Every number in them is
checked against the code.

- [ ] Replace the bracketed "what inspired you" with the real story
- [ ] Add one line about the interviews, if you did them
- [ ] Answer the AI-assistance question straight
- [ ] Repo link, and check it opens in a private window

Two things to decide before you submit:

- [ ] **A LICENSE file.** There is none, which means all rights reserved. That is a perfectly defensible default and CAC does not require an open licence. Your call, but make it deliberately.
- [ ] **The `Co-Authored-By` trailer** on every commit. It is accurate and visible on GitHub. Keeping it is the honest option; either way, disclose AI assistance on the form.

---

## 5. Last pass, the day before

- [ ] `npm run typecheck && npm run lint && npm test` all clean
- [ ] `npm run build` succeeds
- [ ] CI is green on GitHub
- [ ] The deployed URL still works, including the demo doors
- [ ] The video link works in a private window
- [ ] `README.md` and `DECISIONS.md` render properly on GitHub, not just locally

---

## What is already done

So you do not redo any of it:

- Deployment config, container, and a database baked into the image
- Three one-click demo personas, guarded and tested
- `/front-doors`, the whole 537-office measurement, published
- The 250th anniversary as rule R15, labelled as judgment rather than policy
- Office-published availability, shown to teachers *before* they pick dates
- Spanish across every student and family surface
- The critical path drawn to scale
- Accessibility audited and three real defects fixed
- 108 tests, CI, a decision log, and 32 commits of history
