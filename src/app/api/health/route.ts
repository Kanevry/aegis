// src/app/api/health/route.ts — GET /api/health (liveness)
// Always returns 200 while the Node process is alive.

export const runtime = "nodejs";

const CACHE_HEADERS = { "Cache-Control": "no-store" } as const;

export function GET(): Response {
  const version =
    process.env["npm_package_version"] ?? "0.1.0";
  const uptime_s = Math.round(process.uptime() * 10) / 10;

  return new Response(
    JSON.stringify({ ok: true, version, uptime_s }),
    {
      status: 200,
      headers: { "content-type": "application/json", ...CACHE_HEADERS },
    },
  );
}
