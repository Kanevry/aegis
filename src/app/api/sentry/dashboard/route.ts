import { getSentryDashboardUrl } from "@/lib/sentry-dashboard-url";

export const runtime = "nodejs";

export function GET(): Response {
  return Response.redirect(getSentryDashboardUrl(), 307);
}
