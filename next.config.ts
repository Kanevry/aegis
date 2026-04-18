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
