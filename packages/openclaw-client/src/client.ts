import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { ApprovalDecision } from "./types";

/** Names of headers that may be forwarded for tracing/correlation. */
const FORWARDABLE_HEADERS = [
  "x-aegis-request-id",
  "sentry-trace",
  "baggage",
] as const;

export interface OpenclawClientOptions {
  baseURL: string;
  apiToken: string;
  defaultAgentId?: string;
  /**
   * Optional callback invoked on every outbound request to inject per-request
   * tracing / correlation headers. Only keys present in the returned object and
   * matching {@link FORWARDABLE_HEADERS} are forwarded; existing headers are
   * never overwritten.
   */
  forwardHeaders?: () => Record<string, string>;
}

export interface ResolveApprovalInput {
  approvalId: string;
  decision: ApprovalDecision;
  rejectionMessage?: string;
}

export interface ResolveApprovalResult {
  ok: boolean;
}

export interface ListedModel {
  id: string;
}

export interface OpenclawClient {
  chatModel: (agentId?: string) => LanguageModelV2;
  resolveApproval: (input: ResolveApprovalInput) => Promise<ResolveApprovalResult>;
  listModels: () => Promise<ListedModel[]>;
}

/**
 * Picks only the allowed forwardable headers from the callback result and
 * returns them as a plain object. Returns an empty object when `forwardHeaders`
 * is not provided or returns no matching keys.
 */
function resolveForwardHeaders(
  forwardHeaders: (() => Record<string, string>) | undefined,
): Record<string, string> {
  if (!forwardHeaders) return {};
  const provided = forwardHeaders();
  const out: Record<string, string> = {};
  for (const key of FORWARDABLE_HEADERS) {
    if (provided[key] !== undefined) {
      out[key] = provided[key];
    }
  }
  return out;
}

/**
 * Merges `extra` headers into `base`, only for keys that are not already
 * present in `base` (case-insensitive check via lower-cased key comparison).
 */
function mergeHeaders(
  base: Record<string, string>,
  extra: Record<string, string>,
): Record<string, string> {
  const lowerBase = new Set(Object.keys(base).map((k) => k.toLowerCase()));
  const merged: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (!lowerBase.has(key.toLowerCase())) {
      merged[key] = value;
    }
  }
  return merged;
}

export function createOpenclawClient(opts: OpenclawClientOptions): OpenclawClient {
  const { baseURL, apiToken, defaultAgentId, forwardHeaders } = opts;
  const trimmedBase = baseURL.replace(/\/+$/, "");

  /**
   * Custom fetch wrapper that injects forwardable headers for every request
   * made by the AI SDK provider (used for chatModel calls).
   */
  const wrappedFetch: typeof globalThis.fetch = (input, init) => {
    const extra = resolveForwardHeaders(forwardHeaders);
    if (Object.keys(extra).length === 0) {
      return globalThis.fetch(input, init);
    }
    const existingHeaders: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers;
      if (h instanceof Headers) {
        h.forEach((value, key) => {
          existingHeaders[key] = value;
        });
      } else if (Array.isArray(h)) {
        for (const [key, value] of h) {
          existingHeaders[key] = value;
        }
      } else {
        Object.assign(existingHeaders, h);
      }
    }
    const merged = mergeHeaders(existingHeaders, extra);
    return globalThis.fetch(input, { ...init, headers: merged });
  };

  const provider = createOpenAICompatible({
    name: "openclaw",
    baseURL: trimmedBase,
    headers: { authorization: `Bearer ${apiToken}` },
    fetch: wrappedFetch,
  });

  return {
    chatModel(agentId) {
      const id = agentId ?? defaultAgentId;
      if (!id) {
        throw new Error("openclaw chatModel: agentId required (no defaultAgentId set)");
      }
      return provider.languageModel(id);
    },

    async resolveApproval({ approvalId, decision, rejectionMessage }) {
      const extra = resolveForwardHeaders(forwardHeaders);
      const res = await fetch(`${trimmedBase}/exec/approval/resolve`, {
        method: "POST",
        headers: mergeHeaders(
          {
            "content-type": "application/json",
            authorization: `Bearer ${apiToken}`,
          },
          extra,
        ),
        body: JSON.stringify({
          approval_id: approvalId,
          decision,
          rejection_message: rejectionMessage,
        }),
      });
      if (!res.ok) {
        throw new Error(
          `openclaw resolveApproval failed: ${res.status} ${res.statusText}`,
        );
      }
      return { ok: true };
    },

    async listModels() {
      const extra = resolveForwardHeaders(forwardHeaders);
      const res = await fetch(`${trimmedBase}/models`, {
        headers: mergeHeaders(
          { authorization: `Bearer ${apiToken}` },
          extra,
        ),
      });
      if (!res.ok) {
        throw new Error(`openclaw listModels failed: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as
        | { data?: Array<{ id: string }> }
        | Array<{ id: string }>;
      const data = Array.isArray(json) ? json : (json.data ?? []);
      return data.map((m) => ({ id: m.id }));
    },
  };
}
