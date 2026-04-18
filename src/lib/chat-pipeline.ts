/**
 * src/lib/chat-pipeline.ts — Chat pipeline helpers (Sub-Projekt A1, Issue #40)
 *
 * Extracts the last user message from a messages array and resolves the
 * appropriate AI model for the given provider. Kept as pure, testable helpers
 * so route.ts stays thin.
 */

import type { LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenclawClient } from "@aegis/openclaw-client";
import type { ChatUIMessage } from "@aegis/types";

// ── Last-user-message extraction ──────────────────────────────────────────────

/**
 * Returns the text content of the last message with role === 'user'.
 * Returns null when no user message is found.
 */
export function extractLastUserMessage(
  messages: ChatUIMessage[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && msg.role === "user") {
      return msg.content;
    }
  }
  return null;
}

// ── Provider → model resolution ───────────────────────────────────────────────

export interface OpenclawConfig {
  baseURL: string;
  apiToken: string;
  agentId: string;
  requestId?: string;
}

export type Provider = "openai" | "anthropic" | "openclaw";

/**
 * Resolves the AI SDK LanguageModel for the given provider.
 *
 * Throws when provider === 'openclaw' but the config has no apiToken (callers
 * should check env before calling and return 503, but this is a safety guard).
 */
export function resolveModel(
  provider: Provider,
  openclawConfig?: OpenclawConfig,
): LanguageModel {
  switch (provider) {
    case "anthropic":
      return anthropic("claude-haiku-4-5-20251001");

    case "openclaw": {
      if (!openclawConfig) {
        throw new Error("openclaw provider requires OpenclawConfig");
      }
      const client = createOpenclawClient({
        baseURL: openclawConfig.baseURL,
        apiToken: openclawConfig.apiToken,
        defaultAgentId: openclawConfig.agentId,
        forwardHeaders: () => ({
          "x-aegis-request-id": openclawConfig.requestId ?? "",
        }),
      });
      return client.chatModel();
    }

    case "openai":
    default:
      return openai("gpt-4o-mini");
  }
}
