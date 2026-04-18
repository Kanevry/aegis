/**
 * @aegis/types — Chat request/response schemas (Sub-Projekt A1, Issue #40)
 *
 * Zod schemas for the /api/chat/stream endpoint.
 */

import { z } from "zod";

// ── UIMessage subset ──────────────────────────────────────────────────────────
// We accept the minimal shape needed: role + content, which covers the common
// case from the Vercel AI SDK's useChat hook messages array.

export const UIMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
  "tool",
]);

export type UIMessageRole = z.infer<typeof UIMessageRoleSchema>;

export const UIMessageSchema = z.object({
  id: z.string().optional(),
  role: UIMessageRoleSchema,
  content: z.string(),
  createdAt: z.coerce.date().optional(),
});

export type ChatUIMessage = z.infer<typeof UIMessageSchema>;

// ── Request body ──────────────────────────────────────────────────────────────

export const ChatStreamBodySchema = z.object({
  messages: z
    .array(UIMessageSchema)
    .min(1, "messages must contain at least one message"),
  sessionId: z.string().uuid().optional(),
  provider: z.enum(["openai", "anthropic", "openclaw"]).default("openai"),
});

export type ChatStreamBody = z.infer<typeof ChatStreamBodySchema>;

// ── Block response ────────────────────────────────────────────────────────────

export const ChatBlockedResponseSchema = z.object({
  ok: z.literal(false),
  error: z.literal("aegis_blocked"),
  blockedLayers: z.array(z.string()),
  reason: z.string(),
  safetyScore: z.number(),
  request_id: z.string(),
});

export type ChatBlockedResponse = z.infer<typeof ChatBlockedResponseSchema>;

// ── Error responses ───────────────────────────────────────────────────────────

export const ChatErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  request_id: z.string().optional(),
});

export type ChatErrorResponse = z.infer<typeof ChatErrorResponseSchema>;
