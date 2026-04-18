# @aegis/sentry-integration

Sentry v8 Integration object for Ægis. Enriches every captured event with
hardening metadata without touching `process.env` — the package is pure and
edge-safe.

## What it does

- Adds `aegis.summary` and `aegis.layer` tags on blocked events (`aegis.outcome === 'blocked'`)
- Freezes `aegis-*` fingerprints so downstream integrations cannot mutate them
- Injects `environment` / `release` defaults from options or the Sentry client
- Attaches `event.contexts.aegis` (`{ hardening_enabled, demo_mode, version }`)

## Usage

```ts
import * as Sentry from '@sentry/nextjs';
import { aegisSentryIntegration } from '@aegis/sentry-integration';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    aegisSentryIntegration({
      hardeningEnabled: process.env.AEGIS_HARDENING_ENABLED === 'true',
      demoMode: process.env.AEGIS_DEMO_MODE === 'true',
      environment: process.env.SENTRY_ENVIRONMENT,
      release: process.env.SENTRY_RELEASE,
    }),
  ],
});
```

## Options

| Option             | Type      | Default                          | Description                              |
|--------------------|-----------|----------------------------------|------------------------------------------|
| `hardeningEnabled` | `boolean` | `false`                          | Resolved value of `AEGIS_HARDENING_ENABLED` |
| `demoMode`         | `boolean` | `false`                          | Resolved value of `AEGIS_DEMO_MODE`      |
| `environment`      | `string`  | client option → `'development'`  | Sentry environment tag override          |
| `release`          | `string`  | client option → `undefined`      | Sentry release tag override              |

## Exports

```ts
aegisSentryIntegration(opts?): Integration
AEGIS_INTEGRATION_VERSION: string
AegisSentryIntegrationOptions  // type
```

## Development

```bash
pnpm --filter @aegis/sentry-integration typecheck
pnpm --filter @aegis/sentry-integration test
```
