# Deploying CapitolPass

The goal is a URL someone can open and use without installing anything. Five
commands, below. First, why it deploys the way it does.

## Why not serverless

The obvious answer is Vercel, and the obvious answer is wrong here.

CapitolPass stores its data in a SQLite file, accessed through Node's built-in
`node:sqlite`. That driver is **synchronous**, and the whole application is built
on top of that fact — `all()`, `get()`, `run()` and `transaction()` in
[`lib/db/index.ts`](lib/db/index.ts) return values directly, and roughly forty
call sites across `lib/` and `app/` use them without `await`.

A serverless platform has an ephemeral filesystem, so moving there means moving
to Postgres, and moving to Postgres means the query helpers become async, and
that means every caller becomes async too. That is a mechanical change but a
wide one, and it touches the feasibility engine's callers, every server action
and every page.

That refactor is the right thing to do the day this app has more than one school
using it at once. It is the wrong thing to do to get a working link, because it
carries real risk of breaking a working app and buys a judge nothing they can
see.

So: deploy to a host with a disk. Fly.io mounts a volume at `/data`, the file
lives there, and no application code changes at all.

**The Postgres path is already written and stays ready.**
[`supabase/schema.sql`](supabase/schema.sql) carries the same model with real
enums, `date` columns for calendar dates, and Row Level Security policies that
enforce in the database what the local build enforces in application code. When
the async refactor happens, `lib/db/index.ts` is still the only file that touches
a driver.

## How the image is built

Three stages in [`Dockerfile`](Dockerfile):

| Stage | Does |
|---|---|
| `deps` | `npm ci` |
| `build` | `next build`, emitting `.next/standalone` so the runtime image installs nothing |
| `data` | Runs `db:reset`, `data:schools` and `db:seed` to produce a **pre-built database**, baked into the image |

Building the database at image-build time rather than at boot matters. Loading
the NCES directory and resolving the demo school's district through the live
Census Geocoder takes minutes. Doing that on first request means the first person
to open the link — quite possibly the person evaluating the project — watches a
spinner instead.

[`docker-entrypoint.sh`](docker-entrypoint.sh) copies the baked database onto the
volume **only when the volume has no database**. An existing one is never
overwritten. A running deployment accumulates trips, requests and the
school-domain mappings that only exist because an administrator co-signed, and a
redeploy must not discard them.

Three files are read at runtime with `readFileSync` rather than imported, so
Next's tracing cannot see them: `lib/db/schema.sql`, `data/legislators.json` and
`data/tour-routes.json`. They are listed in `outputFileTracingIncludes` in
[`next.config.ts`](next.config.ts) *and* copied explicitly in the Dockerfile.

## Deploying

```bash
fly launch --no-deploy --copy-config
```

```bash
fly volumes create capitolpass_data --region iad --size 1
```

```bash
fly deploy
```

Then confirm it came up and that the door is open:

```bash
fly logs
```

The app is at `https://<app-name>.fly.dev`. If you changed the app name, change
`NEXT_PUBLIC_SITE_URL` in [`fly.toml`](fly.toml) to match — it sets the `Secure`
flag on the session cookie from its own scheme, and a mismatch makes sign-in fail
silently with nothing in the logs to look at.

### The full national school directory

The default image loads the demo states, about 7,400 schools. For all 100,155:

```bash
fly deploy --build-arg SCHOOL_STATES=--all
```

Adds a few minutes to the build and about 26MB to the image.

## Settings that matter

| Variable | Set to | Why |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | the real `https://` origin | Sets the session cookie's `Secure` flag. A mismatch breaks sign-in with no error |
| `CAPITOLPASS_DEMO` | `1` | Opens `/demo/<persona>` and the three one-click doors. **Remove on any deployment serving real schools** |
| `CAPITOLPASS_DB` | `/data/capitolpass.db` | On the volume, not in the image |
| `CAPITOLPASS_OUTBOX` | `/data/outbox.log` | Undelivered mail. The app directory is not writable |
| `RESEND_API_KEY`, `MAIL_FROM` | optional | Without them, sign-in links go to the outbox instead of being sent |

Set the secret ones with `fly secrets set`, not in `fly.toml`:

```bash
fly secrets set RESEND_API_KEY=... MAIL_FROM="CapitolPass <no-reply@yourdomain>"
```

## Without a mail provider

Sign-in still works. Links are written to `$CAPITOLPASS_OUTBOX`, and the demo
doors bypass the whole exchange, which is what they are for. To sign in as a real
address on a deployed instance:

```bash
fly ssh console -C "cat /data/outbox.log"
```

## Reading and resetting state

The database is one file on the volume.

```bash
fly ssh console -C "ls -la /data"
```

To start over — this **destroys every trip anyone has created**, so be sure:

```bash
fly ssh console -C "rm /data/capitolpass.db"
```

The next boot reinstalls the seed from the image.

## Checking the production build locally first

Worth doing before every deploy, because it catches the two failures that only
appear in a production build:

```bash
npm run build && npm start
```

Sign-in links are not shown in the UI in a production build — that shortcut is
gated on `NODE_ENV` and is correctly off, because a real deployment must never
hand a session token to whoever loads the page. Use `npm run signin:link <email>`
instead, or the demo doors.
