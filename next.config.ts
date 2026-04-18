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

function hasRealValue(value: string | undefined, placeholders: string[] = []) {
  if (!value) {
    return false;
  }

  return !value.includes('…') && !placeholders.includes(value);
}

const hasSentryReleaseConfig =
  hasRealValue(process.env.SENTRY_AUTH_TOKEN) &&
  hasRealValue(process.env.SENTRY_ORG, ['your-org-slug']) &&
  hasRealValue(process.env.SENTRY_PROJECT, ['aegis']);

const shouldCreateSentryRelease =
  shouldUploadSentryArtifacts && hasSentryReleaseConfig;

const sentryConfig = withSentryConfig(nextConfig, {
  org: shouldCreateSentryRelease ? process.env.SENTRY_ORG : undefined,
  project: shouldCreateSentryRelease ? process.env.SENTRY_PROJECT : undefined,
  authToken: shouldCreateSentryRelease ? process.env.SENTRY_AUTH_TOKEN : undefined,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  disableLogger: true,
  sourcemaps: {
    disable: !shouldCreateSentryRelease,
    deleteSourcemapsAfterUpload: shouldCreateSentryRelease,
  },
  release: {
    create: shouldCreateSentryRelease,
    finalize: shouldCreateSentryRelease,
  },
});

export default shouldCreateSentryRelease ? sentryConfig : nextConfig;
