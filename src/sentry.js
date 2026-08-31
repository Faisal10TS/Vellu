// Sentry wiring — no-op unless VITE_SENTRY_DSN is configured.
//
// Why env-gated: local dev + CI shouldn't spam your Sentry quota with noise
// from HMR reloads and test runs. Production sets VITE_SENTRY_DSN in Vercel,
// everywhere else this module is inert.
//
// To turn on in production:
//   1. Create a Sentry project (https://sentry.io — free tier is fine).
//   2. Copy the DSN ("https://<key>@o<org>.ingest.sentry.io/<project>").
//   3. In Vercel → Project → Settings → Environment Variables, add
//      VITE_SENTRY_DSN for Production (and Preview if you want).
//   4. Redeploy.
//
// Also reports which release is running if VITE_APP_VERSION is set (Vercel
// auto-populates VERCEL_GIT_COMMIT_SHA — wire that to VITE_APP_VERSION in
// Vercel env vars if you want release tracking).

import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;
const RELEASE = import.meta.env.VITE_APP_VERSION;
const ENV = import.meta.env.MODE; // "development" | "production"

export function initSentry() {
  if (!DSN) {
    // Explicitly no-op. Leaves a single console.info so you can tell at a
    // glance whether Sentry is live on a given deploy.
    if (ENV === "production") {
      console.info("[sentry] disabled (VITE_SENTRY_DSN not set)");
    }
    return;
  }

  Sentry.init({
    dsn: DSN,
    release: RELEASE,
    environment: ENV,
    // Performance tracing off by default — free tier has tight quotas and the
    // error signal alone is what you want first. Flip to 0.1 later if you
    // want sampled perf data.
    tracesSampleRate: 0,
    // Session replay also off by default for the same quota reason.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Don't report errors from browser extensions / third-party scripts.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      // Instagram/Facebook in-app-browser (Android) injecteert een eigen
      // bridge-script (iabjs://…) dat naar de native app postMessaget; als
      // die referentie weg is gooit HUN code deze fout — niet de onze.
      // Klanten boeken massaal via de IG-bio-link, dus dit is pure ruis.
      "Java object is gone",
      // Zelfde familie (VELLU-5): IG's navigation_performance_logger crasht
      // in de native brug terwijl de webview sluit.
      "Java exception was raised during method invocation",
      // supabase-js (gotrue) gebruikt navigator.locks met steal:true bij
      // token-refresh; in een tweede open tab wordt de "gestolen" lock als
      // AbortError geworpen. Bekend en onschuldig meertabs-gedrag.
      "Lock broken by another request with the 'steal' option",
    ],
    // Structureel: alles waarvan de stack uit Instagrams geïnjecteerde
    // bridge-script komt (iabjs://…) is per definitie niet onze code.
    denyUrls: [/^iabjs:\/\//],
    beforeSend(event) {
      // Strip anything that smells like a token from the event before send.
      // Sentry masks some of this automatically but we belt-and-braces it.
      if (event.request?.headers) {
        delete event.request.headers.Authorization;
        delete event.request.headers.authorization;
        delete event.request.headers.apikey;
      }
      return event;
    },
  });
}

export const ErrorBoundary = Sentry.ErrorBoundary;

// Convenience wrapper so feature code can do `captureError(e, { tag: "booking" })`
// without importing Sentry directly.
export function captureError(err, context = {}) {
  if (!DSN) {
    console.error("[sentry:noop]", err, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context.tag) scope.setTag("feature", context.tag);
    if (context.extra) scope.setExtras(context.extra);
    if (context.user) scope.setUser(context.user);
    Sentry.captureException(err);
  });
}
