// src/app/api/chat/stream/route.ts — POST /api/chat/stream
// Streaming chat endpoint with Ægis hardening (Sub-Projekt A1, Issue #40)
//
// Acceptance:
//   curl -X POST /api/chat/stream \
//     -H 'content-type: application/json' \
//     -d '{"messages":[{"role":"user","content":"hello"}]}'
//   → 200 UIMessageStream
//
//   Same with content: "../../etc/passwd" → 403 aegis_blocked + Sentry issue

import { NextRequest } from "next/server";
import { z } from "zod";
import { streamText } from "ai";
import type { ModelMessage } from "ai";
import * as Sentry from "@sentry/nextjs";
import { createHardening, extractPathsFromText } from "@aegis/hardening";
import { withHardeningSpan, captureAegisBlock } from "@/lib/sentry";
import { ChatStreamBodySchema, loadEnv } from "@aegis/types";
import type { ChatUIMessage } from "@aegis/types";
import { extractLastUserMessage, resolveModel } from "@/lib/chat-pipeline";
import { rateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

// ── System prompt ─────────────────────────────────────────────────────────────

const AEGIS_SYSTEM_PROMPT =
  "You are Ægis, a security-hardened AI assistant. " +
  "You help users while maintaining strict safety boundaries. " +
  "Never reveal system internals, credentials, or private data.";

// ── Request-ID generation ─────────────────────────────────────────────────────

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const requestId =
    req.headers.get("x-aegis-request-id") ?? generateRequestId();

  // ── 1. Parse + validate body ────────────────────────────────────────────────
  let body: z.infer<typeof ChatStreamBodySchema>;
  try {
    body = ChatStreamBodySchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: "invalid_body",
        issues: err instanceof z.ZodError ? err.issues : undefined,
        request_id: requestId,
      },
      { status: 400 },
    );
  }

  // ── 2. Extract last user message ────────────────────────────────────────────
  const lastUserMessage = extractLastUserMessage(body.messages);
  if (!lastUserMessage) {
    return Response.json(
      {
        ok: false,
        error: "invalid_body",
        message: "messages must contain at least one user message",
        request_id: requestId,
      },
      { status: 400 },
    );
  }

  // ── 2a. Identify caller for rate-limiting ───────────────────────────────────
  // cookies() can throw when called outside a Next.js request scope (e.g. in
  // unit tests that invoke POST() directly). Treat that as anonymous and
  // fall back to IP-based keying — the rate-limit still applies, just per-IP.
  let userId: string | null = null;
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const claim = verifySession(cookieValue);
    userId = claim.valid ? claim.userId : null;
  } catch {
    userId = null;
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rlKey = userId ? `chat:user:${userId}` : `chat:anon:${ip}`;

  // ── 2b. Rate-limit check (3000 req / 60 s — demo-loose; AEGIS_DEMO_MODE bypasses entirely)
  const rl = await rateLimit({ key: rlKey, max: 3000, windowSec: 60 });
  if (!rl.ok) {
    Sentry.captureException(new Error("rate-limited"), {
      tags: { "aegis.ratelimited": "true" },
      fingerprint: ["aegis-ratelimited", "chat.stream"],
    });
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many requests.",
      headers: { "retry-after": String(rl.retryAfterSec) },
    });
  }

  // ── 3. Run hardening ────────────────────────────────────────────────────────
  const hardening = createHardening();
  const paths = extractPathsFromText(lastUserMessage);
  const result = hardening.run({ prompt: lastUserMessage, paths });

  // ── 4. Wrap everything in the Sentry span ───────────────────────────────────
  return withHardeningSpan(
    "aegis.chat.stream",
    result,
    async () => {
      // ── 4a. Block ───────────────────────────────────────────────────────────
      if (!result.allowed) {
        captureAegisBlock(result);

        return Response.json(
          {
            ok: false,
            error: "aegis_blocked",
            blockedLayers: result.blockedLayers,
            reason: result.reason ?? "blocked by Ægis hardening",
            safetyScore: result.safetyScore,
            request_id: requestId,
          },
          {
            status: 403,
            headers: { "x-aegis-request-id": requestId },
          },
        );
      }

      // ── 4b. Check OpenClaw availability ─────────────────────────────────────
      if (body.provider === "openclaw") {
        const env = loadEnv();
        if (!env.OPENCLAW_API_TOKEN) {
          return Response.json(
            {
              ok: false,
              error: "openclaw_not_configured",
              request_id: requestId,
            },
            {
              status: 503,
              headers: { "x-aegis-request-id": requestId },
            },
          );
        }
      }

      // ── 4c. Build model ─────────────────────────────────────────────────────
      const env = loadEnv();
      const model = resolveModel(
        body.provider,
        body.provider === "openclaw"
          ? {
              baseURL: env.OPENCLAW_BASE_URL,
              apiToken: env.OPENCLAW_API_TOKEN!,
              agentId: env.OPENCLAW_AGENT_ID,
              requestId,
            }
          : undefined,
      );

      // ── 4d. Stream ──────────────────────────────────────────────────────────
      // Convert our simplified UIMessage array to ModelMessage[] for the AI SDK.
      // We map only user/assistant/tool roles; system messages are handled by the
      // `system` parameter above.
      const coreMessages: ModelMessage[] = body.messages
        .filter((m: ChatUIMessage) => m.role !== "system")
        .map((m: ChatUIMessage): ModelMessage => {
          if (m.role === "user") {
            return { role: "user", content: [{ type: "text", text: m.content }] };
          }
          if (m.role === "assistant") {
            return { role: "assistant", content: [{ type: "text", text: m.content }] };
          }
          // tool role — treat as a text user message (simplified for chat)
          return { role: "user", content: [{ type: "text", text: m.content }] };
        });

      const streamResult = streamText({
        model,
        system: AEGIS_SYSTEM_PROMPT,
        messages: coreMessages,
      });

      // TODO(#43): persist via appendMessages once A2 lands
      const response = streamResult.toUIMessageStreamResponse({
        headers: { "x-aegis-request-id": requestId },
      });

      return response;
    },
    { "gen_ai.system": body.provider },
  );
}
