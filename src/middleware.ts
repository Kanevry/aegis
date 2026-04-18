// src/middleware.ts — Ægis Next.js Edge middleware
// Gates protected routes behind a valid `aegis_session` cookie.
// Propagates `x-request-id` to all downstream handlers.
// OpenClaw webhook (/api/webhook/openclaw) is NOT in matcher — HMAC auth lives in that handler.

import { NextResponse, type NextRequest } from "next/server";

// ── Inline Edge-compatible session verification ────────────────────────────────
// Mirrors the exact cookie format produced by src/lib/auth.ts:
//   <base64url(JSON(payload))>.<hmacSha256Hex>
// Uses WebCrypto (SubtleCrypto) so this runs on the Edge runtime without
// depending on node:crypto.

interface SessionPayload {
  userId: string;
  iat: number;
  exp: number;
}

type SessionClaim =
  | { valid: true; userId: string; expiresAt: Date }
  | { valid: false };

/**
 * Verifies an `aegis_session` cookie value using WebCrypto HMAC-SHA256.
 *
 * Cookie format (matches src/lib/auth.ts issueSession):
 *   <base64url(JSON(payload))>.<hmacSha256Hex>
 *
 * crypto.subtle.verify provides constant-time HMAC comparison internally,
 * preventing timing-oracle attacks without manual buffer juggling.
 */
async function verifySessionEdge(cookie: string | null): Promise<SessionClaim> {
  if (!cookie || typeof cookie !== "string") {
    return { valid: false };
  }

  const secret = process.env["AEGIS_SESSION_SECRET"];
  if (!secret) {
    return { valid: false };
  }

  const dotIndex = cookie.lastIndexOf(".");
  if (dotIndex === -1) {
    return { valid: false };
  }

  const payloadBase64 = cookie.slice(0, dotIndex);
  const providedSigHex = cookie.slice(dotIndex + 1);

  // Reject malformed hex signatures up front
  if (providedSigHex.length === 0 || providedSigHex.length % 2 !== 0) {
    return { valid: false };
  }

  // Decode hex signature to raw bytes — use a fixed ArrayBuffer (not shared)
  // so the Uint8Array satisfies the BufferSource constraint in crypto.subtle.verify.
  let providedSigBytes: Uint8Array<ArrayBuffer>;
  try {
    const pairs = providedSigHex.match(/.{2}/g);
    if (!pairs) return { valid: false };
    const ab = new ArrayBuffer(pairs.length);
    const view = new Uint8Array(ab);
    pairs.forEach((h, i) => {
      view[i] = parseInt(h, 16);
    });
    providedSigBytes = view;
  } catch {
    return { valid: false };
  }

  // Import the session secret as an HMAC-SHA256 key (verify-only)
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return { valid: false };
  }

  // Constant-time HMAC verification — crypto.subtle.verify re-derives the MAC
  // and compares internally, preventing timing side-channels.
  const data = new TextEncoder().encode(payloadBase64);
  let sigValid: boolean;
  try {
    sigValid = await crypto.subtle.verify("HMAC", key, providedSigBytes, data);
  } catch {
    return { valid: false };
  }

  if (!sigValid) {
    return { valid: false };
  }

  // Decode base64url payload to JSON
  let payload: SessionPayload;
  try {
    // base64url uses - and _ instead of + and /, no padding
    const base64 = payloadBase64
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(
        payloadBase64.length + ((4 - (payloadBase64.length % 4)) % 4),
        "=",
      );
    const json = atob(base64);
    payload = JSON.parse(json) as SessionPayload;
  } catch {
    return { valid: false };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) {
    return { valid: false };
  }

  if (!payload.userId || typeof payload.userId !== "string") {
    return { valid: false };
  }

  return {
    valid: true,
    userId: payload.userId,
    expiresAt: new Date(payload.exp * 1000),
  };
}

// ── Middleware ─────────────────────────────────────────────────────────────────

export async function middleware(
  req: NextRequest,
): Promise<NextResponse | Response> {
  // Propagate or generate a stable request-id for distributed tracing.
  // Validate the incoming header to prevent header-injection via forged IDs.
  const incoming = req.headers.get("x-request-id");
  const requestId =
    incoming && /^[a-zA-Z0-9-]{8,64}$/.test(incoming)
      ? incoming
      : crypto.randomUUID();

  // Build forwarded headers so downstream route handlers see the request-id
  const forwarded = new Headers(req.headers);
  forwarded.set("x-request-id", requestId);

  const cookieValue = req.cookies.get("aegis_session")?.value ?? null;
  const claim = await verifySessionEdge(cookieValue);

  if (!claim.valid) {
    const path = req.nextUrl.pathname;

    if (path.startsWith("/api/")) {
      // Return a JSON 401 envelope for API consumers
      return new Response(
        JSON.stringify({
          ok: false,
          error: "unauthorized",
          message: "Session required",
          request_id: requestId,
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
            "x-request-id": requestId,
          },
        },
      );
    }

    // Page route: redirect to /login preserving the intended destination
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set("x-request-id", requestId);
    return redirectRes;
  }

  // Session valid — pass through with x-request-id forwarded both on the
  // rewritten request and the outgoing response for Sentry trace correlation.
  const res = NextResponse.next({ request: { headers: forwarded } });
  res.headers.set("x-request-id", requestId);
  return res;
}

// ── Route matcher ──────────────────────────────────────────────────────────────
// Only routes listed here pass through this middleware.
//
// Intentionally NOT listed (no session gate):
//   /api/webhook/openclaw  — HMAC-gated inside the route handler
//   /api/auth/login        — issues the session cookie
//   /api/auth/logout       — clears the session cookie
//   /api/agent/run         — public testbed endpoint
//   /api/testbed/fire      — public testbed endpoint
//   /api/health            — liveness probe
//   /api/ready             — readiness probe
//   /login                 — auth page
//   /                      — landing page
//   /dashboard             — unauthenticated preview
//   /dashboard/testbed     — public demo surface

export const config = {
  matcher: [
    "/dashboard/chat/:path*",
    "/dashboard/approvals/:path*",
    "/api/chat/:path*",
    "/api/approvals/:path*",
    "/api/sessions/:path*",
    "/api/auth/me",
  ],
};
