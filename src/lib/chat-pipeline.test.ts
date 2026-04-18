// src/lib/chat-pipeline.test.ts — Unit tests for chat-pipeline helpers

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Hoisted mocks (must be before vi.mock factories) ─────────────────────────

const { mockOpenaiModel, mockAnthropicModel, mockOpenclawModel, mockChatModel, mockCreateOpenclawClient } =
  vi.hoisted(() => {
    const mockOpenclawModel = { _tag: "openclaw-model" };
    const mockChatModel = vi.fn().mockReturnValue(mockOpenclawModel);
    return {
      mockOpenaiModel: { _tag: "openai-model" },
      mockAnthropicModel: { _tag: "anthropic-model" },
      mockOpenclawModel,
      mockChatModel,
      mockCreateOpenclawClient: vi.fn().mockReturnValue({ chatModel: mockChatModel }),
    };
  });

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn().mockReturnValue(mockOpenaiModel),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn().mockReturnValue(mockAnthropicModel),
}));

vi.mock("@aegis/openclaw-client", () => ({
  createOpenclawClient: mockCreateOpenclawClient,
}));

import { extractLastUserMessage, resolveModel } from "./chat-pipeline";

// ── extractLastUserMessage ────────────────────────────────────────────────────

describe("extractLastUserMessage", () => {
  it("returns the content of the last user message", () => {
    const messages = [
      { role: "user" as const, content: "first" },
      { role: "assistant" as const, content: "response" },
      { role: "user" as const, content: "second question" },
    ];
    expect(extractLastUserMessage(messages)).toBe("second question");
  });

  it("returns null when no user message exists", () => {
    const messages = [
      { role: "assistant" as const, content: "hello" },
      { role: "system" as const, content: "system prompt" },
    ];
    expect(extractLastUserMessage(messages)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(extractLastUserMessage([])).toBeNull();
  });

  it("handles single user message", () => {
    const messages = [{ role: "user" as const, content: "only message" }];
    expect(extractLastUserMessage(messages)).toBe("only message");
  });
});

// ── resolveModel ──────────────────────────────────────────────────────────────

describe("resolveModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateOpenclawClient.mockReturnValue({ chatModel: mockChatModel });
    mockChatModel.mockReturnValue(mockOpenclawModel);
  });

  it("returns openai model for 'openai' provider", () => {
    const model = resolveModel("openai");
    expect(model).toBe(mockOpenaiModel);
  });

  it("returns anthropic model for 'anthropic' provider", () => {
    const model = resolveModel("anthropic");
    expect(model).toBe(mockAnthropicModel);
  });

  it("returns openclaw chatModel when config is provided", () => {
    const config = {
      baseURL: "http://localhost:8787",
      apiToken: "test-token",
      agentId: "openclaw/default",
      requestId: "req_test",
    };
    const model = resolveModel("openclaw", config);
    expect(mockCreateOpenclawClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "http://localhost:8787",
        apiToken: "test-token",
        defaultAgentId: "openclaw/default",
      }),
    );
    expect(model).toBe(mockOpenclawModel);
  });

  it("throws when openclaw provider is requested without config", () => {
    expect(() => resolveModel("openclaw")).toThrow(
      "openclaw provider requires OpenclawConfig",
    );
  });
});
