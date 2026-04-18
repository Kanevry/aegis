import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const shouldUploadSentryArtifacts = Boolean(
  process.env.VERCEL || process.env.GITHUB_ACTIONS,
);

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  turbopack: {},
  typedRoutes: true,
  transpilePackages: ['@aegis/hardening', '@aegis/types'],
  // Cap serverAction bodies at 1 MB. Route handlers enforce field-level limits
  // via Zod schemas (e.g. passphrase: z.string().max(200)) — body-size cap here
  // is an additional defence-in-depth layer (issue #64).
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: shouldUploadSentryArtifacts ? process.env.SENTRY_AUTH_TOKEN : undefined,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  disableLogger: true,
  sourcemaps: {
    disable: !shouldUploadSentryArtifacts,
    deleteSourcemapsAfterUpload: shouldUploadSentryArtifacts,
  },
  release: {
    create: shouldUploadSentryArtifacts,
    finalize: shouldUploadSentryArtifacts,
  },
});
