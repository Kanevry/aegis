import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { ApprovalDecision } from "./types";

export interface OpenclawClientOptions {
  baseURL: string;
  apiToken: string;
  defaultAgentId?: string;
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

export function createOpenclawClient(opts: OpenclawClientOptions): OpenclawClient {
  const { baseURL, apiToken, defaultAgentId } = opts;
  const trimmedBase = baseURL.replace(/\/+$/, "");

  const provider = createOpenAICompatible({
    name: "openclaw",
    baseURL: trimmedBase,
    headers: { authorization: `Bearer ${apiToken}` },
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
      const res = await fetch(`${trimmedBase}/exec/approval/resolve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiToken}`,
        },
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
      const res = await fetch(`${trimmedBase}/models`, {
        headers: { authorization: `Bearer ${apiToken}` },
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
