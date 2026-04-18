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
      Sentry.feedbackIntegration({
        autoInject: false,
        colorScheme: 'dark',
        isEmailRequired: false,
        isNameRequired: false,
        showEmail: false,
        showName: false,
        formTitle: 'Report Attack Classification',
        submitButtonLabel: 'Send to Sentry',
        messageLabel: 'What went wrong?',
        messagePlaceholder:
          'Describe the incorrect classification, missing block, or confusing response.',
        successMessageText: 'Feedback captured. It is now linked to this dashboard session.',
        tags: {
          source: 'aegis_dashboard',
        },
        themeDark: {
          background: '#0a0a0f',
          foreground: '#f5f5f5',
          accentBackground: '#6366f1',
          accentForeground: '#ffffff',
          successColor: '#34d399',
          errorColor: '#f87171',
          boxShadow: '0 20px 50px rgba(2, 6, 23, 0.55)',
          outline: '2px solid rgba(99, 102, 241, 0.6)',
        },
      }),
    ],

    // Capture a Session Replay for 100 % of error sessions — critical for Seer AI debugger.
    replaysOnErrorSampleRate: 1.0,
    // Record 10 % of normal sessions for UX baseline.
    replaysSessionSampleRate: 0.1,
  });
}
