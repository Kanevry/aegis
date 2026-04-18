// src/instrumentation-client.ts — Sentry browser init (Next.js 16 App Router)
// Loaded automatically by Next.js when the file is present in src/.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const SENTRY_ENABLED =
  !!process.env.NEXT_PUBLIC_SENTRY_DSN &&
  process.env.NEXT_PUBLIC_SENTRY_ENABLED !== 'false';

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV,
    debug: false,

    integrations: [
      Sentry.replayIntegration({
        // Mask form inputs (passwords, tokens) but allow text for UX screenshots.
        maskAllText: false,
        maskAllInputs: true,
      }),
    ],

    // Capture a Session Replay for 100 % of error sessions — critical for Seer AI debugger.
    replaysOnErrorSampleRate: 1.0,
    // Record 10 % of normal sessions for UX baseline.
    replaysSessionSampleRate: 0.1,
  });
}
