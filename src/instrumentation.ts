// src/instrumentation.ts — Sentry-only (OTel disabled for hackathon)
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { loadEnv } from '@aegis/types';
import { redactSecrets } from '@aegis/hardening';

export async function register() {
  // Fail-fast env validation: throws an actionable Error on missing/malformed
  // required keys. Set SKIP_ENV_VALIDATION=true to bypass in dev/CI.
  let aegisEnv;
  try {
    aegisEnv = loadEnv(process.env);
  } catch (err) {
    console.error('[Ægis] Server start aborted — invalid environment:', err);
    throw err;
  }

  const SENTRY_ENABLED =
    aegisEnv.NEXT_PUBLIC_SENTRY_ENABLED && !!aegisEnv.NEXT_PUBLIC_SENTRY_DSN;

  if (!SENTRY_ENABLED) return;

  const commonConfig = {
    dsn: aegisEnv.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: aegisEnv.NODE_ENV,
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
          delete event.request.headers['x-api-key'];
        }

        // B5 redaction: strip known secret shapes from event text fields.
        if (event.message) {
          event.message = redactSecrets(event.message).text;
        }

        if (event.exception?.values) {
          for (const ex of event.exception.values) {
            if (ex.value) {
              ex.value = redactSecrets(ex.value).text;
            }
          }
        }

        if (event.request?.data && typeof event.request.data === 'string') {
          event.request.data = redactSecrets(event.request.data).text;
        }

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
