import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Emit .next/standalone so the container carries only what it needs and does
   * not have to install node_modules at runtime. See DEPLOY.md.
   */
  output: 'standalone',

  /**
   * Three files are read at runtime with readFileSync rather than imported, so
   * Next's dependency tracing cannot see them and would leave them out of the
   * standalone output:
   *
   *   lib/db/schema.sql      — applied by migrate()
   *   data/legislators.json  — the pinned congress-legislators snapshot
   *   data/tour-routes.json  — the 498 verified tour URLs
   *
   * The Dockerfile also copies them explicitly. Listing them here as well means
   * a plain `next build && node .next/standalone/server.js` works too, without
   * Docker.
   */
  outputFileTracingIncludes: {
    '/*': ['lib/db/schema.sql', 'data/legislators.json', 'data/tour-routes.json'],
  },
};

export default nextConfig;
