// src/instrumentation.ts — Sentry-only (OTel disabled for hackathon)
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const SENTRY_ENABLED =
  !!process.env.NEXT_PUBLIC_SENTRY_DSN &&
  process.env.NEXT_PUBLIC_SENTRY_ENABLED !== 'false';

export async function register() {
  if (!SENTRY_ENABLED) return;

  const commonConfig = {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV,
    debug: false,
  };

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      ...commonConfig,
      // vercelAIIntegration is the @sentry/nextjs v8 name for OpenAI + Vercel AI SDK
      // auto-instrumentation (emits gen_ai.* spans for every AI SDK call).
      // NOTE: in @sentry/node ≥8.x the same function is exported as openAIIntegration().
      integrations: [Sentry.vercelAIIntegration()],
      beforeSend(event) {
        // Redact sensitive request headers before shipping to Sentry (SEC-009).
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        // TODO: replace inline redaction with redactSecrets() from @aegis/hardening
        // once packages/hardening is ported (B5 redaction module).
        // import { redactSecrets } from '@aegis/hardening';
        // if (event.message) event.message = redactSecrets(event.message).text;
        return event;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime: no Node.js integrations; vercelAIIntegration not available here.
    Sentry.init(commonConfig);
  }
}

export const onRequestError = Sentry.captureRequestError;
