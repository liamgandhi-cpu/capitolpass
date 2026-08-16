#!/bin/sh
# Put a database on the volume if there is not one there already, then start.
#
# The copy is deliberately one-way and one-time. A running deployment
# accumulates real state — trips, requests, sessions, and the school-domain
# mappings that only exist because someone co-signed — and none of that is
# recoverable from the image. So the seed is written only when the volume is
# genuinely empty, and an existing database is never overwritten, never
# migrated backwards, and never reset by a redeploy.
set -e

DB="${CAPITOLPASS_DB:-/data/capitolpass.db}"
SEED="/app/seed/capitolpass.db"
DIR="$(dirname "$DB")"

mkdir -p "$DIR"

if [ ! -f "$DB" ]; then
  if [ -f "$SEED" ]; then
    echo "capitolpass: no database at $DB — installing the seed built into this image"
    cp "$SEED" "$DB"
  else
    echo "capitolpass: no database at $DB and no seed in the image."
    echo "capitolpass: the app will start, but every page that reads data will fail."
    echo "capitolpass: rebuild the image, or run the data scripts against $DB."
  fi
else
  echo "capitolpass: using the existing database at $DB"
fi

exec "$@"
