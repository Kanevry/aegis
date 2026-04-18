const PLACEHOLDER_VALUES = new Set(["", "your-org-slug"]);

type EnvLike = Record<string, string | undefined>;

function readEnvValue(env: EnvLike, key: string): string | undefined {
  const value = env[key];
  if (!value) return undefined;

  const trimmed = value.trim();
  return PLACEHOLDER_VALUES.has(trimmed) ? undefined : trimmed;
}

export function getSentryDashboardUrl(
  env: EnvLike = process.env
): string {
  const org =
    readEnvValue(env, "SENTRY_ORG") ??
    readEnvValue(env, "NEXT_PUBLIC_SENTRY_ORG");
  const project =
    readEnvValue(env, "SENTRY_PROJECT") ??
    readEnvValue(env, "NEXT_PUBLIC_SENTRY_PROJECT");

  if (org && project) {
    return `https://sentry.io/organizations/${encodeURIComponent(org)}/projects/${encodeURIComponent(project)}/`;
  }

  if (org) {
    return `https://sentry.io/organizations/${encodeURIComponent(org)}/`;
  }

  return "https://sentry.io/organizations/";
}
