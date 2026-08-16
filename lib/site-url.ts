/**
 * Where this deployment lives, and how to build an absolute URL against it.
 *
 * Three things in the app need the public origin: the `Secure` flag on the
 * session cookie, the links in outgoing mail, and every redirect from a route
 * handler. They must all agree, so they all come from here.
 *
 * ---------------------------------------------------------------------------
 * Why there are two variable names
 * ---------------------------------------------------------------------------
 *
 * `NEXT_PUBLIC_*` variables are **inlined at build time**, not read at runtime.
 * `next build` substitutes the literal value into the compiled output, so a
 * container built with the variable unset has `undefined` compiled into it, and
 * setting `NEXT_PUBLIC_SITE_URL` in the deployment's environment afterwards
 * changes nothing at all.
 *
 * That is a silent failure with real consequences here: redirects fall back to
 * the address the server is bound to, so a standalone build behind a proxy
 * sends users to `http://0.0.0.0:3000/...` after a successful sign-in. The
 * cookie is set, the session is valid, and the browser lands on a dead link.
 *
 * So `CAPITOLPASS_SITE_URL` is the one that matters on a deployment. It has no
 * `NEXT_PUBLIC_` prefix, which means it is read from the environment at runtime
 * like any ordinary variable, which means `fly.toml` can set it.
 *
 * `NEXT_PUBLIC_SITE_URL` stays supported as a fallback because it is what
 * `.env.example` has always documented for local use, where the bound address
 * and the requested address are the same and either one works.
 */

/** The configured public origin, or null when nothing is set. */
export function siteOrigin(): string | null {
  // Runtime first: this is the one a hosted deployment can actually set.
  const runtime = process.env.CAPITOLPASS_SITE_URL;
  if (runtime) return runtime;

  // Build-time fallback, for local development and existing setups.
  const inlined = process.env.NEXT_PUBLIC_SITE_URL;
  if (inlined) return inlined;

  return null;
}

/**
 * Whether the session cookie should carry the `Secure` flag.
 *
 * Keying this off NODE_ENV alone breaks a production build served over plain
 * HTTP on localhost — exactly what `npm run build && npm start` gives you when
 * checking a release before deploying it. The browser would accept the cookie
 * but nothing else would, and sign-in would silently fail with no error to look
 * at.
 *
 * So believe a configured origin's scheme, and only fall back to NODE_ENV when
 * nothing is configured — falling back to secure, so an unconfigured production
 * deployment is safe by default rather than convenient by default.
 */
export function cookieSecure(): boolean {
  const origin = siteOrigin();
  if (origin) return origin.startsWith('https://');
  return process.env.NODE_ENV === 'production';
}

/**
 * An absolute URL for a redirect.
 *
 * `new URL(path, request.url)` is the obvious way to do this and is wrong
 * behind a proxy, for the reason described above. Prefer the configured origin;
 * fall back to the request only when nothing is configured.
 */
export function absoluteUrl(path: string, request: Request): URL {
  const origin = siteOrigin();
  if (origin) {
    try {
      return new URL(path, origin);
    } catch {
      // A malformed origin should not take the app down. The request-derived
      // fallback below is still better than a crash.
    }
  }
  return new URL(path, request.url);
}
