# CapitolPass container.
#
# Three stages. The interesting one is `data`, which builds the SQLite database
# at image build time rather than at boot: the school directory and the demo
# seed both need network access and take minutes, and doing that on the first
# request would mean the first person to open the link waits for it.
#
# See DEPLOY.md for why this deploys to a host with a disk rather than to a
# serverless platform.

# ---------------------------------------------------------------------------
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Build the Next.js standalone output.
FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Build the seed database.
#
# Kept in its own stage so a change to application code does not invalidate it,
# and so the ~26MB of NCES rows never enter the runtime layer except as the one
# file that matters.
FROM node:24-slim AS data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY lib ./lib
COPY scripts ./scripts
COPY data ./data

# SCHOOL_STATES controls how much of the NCES Common Core of Data is loaded.
# The default is the demo states (~7,400 schools) because that is what the seed
# needs and it keeps the image small. Pass --build-arg SCHOOL_STATES=--all for
# the full national set: 100,155 schools, every state and territory, a few
# minutes longer and about 26MB more.
ARG SCHOOL_STATES=""
RUN npm run db:reset \
 && npm run data:schools -- ${SCHOOL_STATES} \
 && npm run db:seed

# ---------------------------------------------------------------------------
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The database and the mail outbox live on the mounted volume, not in the image.
ENV CAPITOLPASS_DB=/data/capitolpass.db
ENV CAPITOLPASS_OUTBOX=/data/outbox.log

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Read at runtime with readFileSync, so dependency tracing cannot see them.
# next.config.ts lists them under outputFileTracingIncludes as well; this copy
# is the belt to that braces.
COPY --from=build /app/lib/db/schema.sql ./lib/db/schema.sql
COPY --from=build /app/data/legislators.json ./data/legislators.json
COPY --from=build /app/data/tour-routes.json ./data/tour-routes.json

# The pre-built database, staged inside the image. The entrypoint copies it onto
# the volume the first time the volume is empty, and never touches it again.
COPY --from=data /app/data/capitolpass.db /app/seed/capitolpass.db

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
