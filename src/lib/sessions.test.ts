// src/lib/sessions.test.ts — Vitest unit tests for sessions service

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────────────────────

// Chainable builder that Supabase PostgREST client returns.
// Each terminal method (single, returns, select after delete) resolves a promise.
type ChainResult = { data: unknown; error: null | { message: string; code?: string } };

const mockChain = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  lt: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  single: vi.fn(),
  returns: vi.fn(),
};

// Make every chain method return `mockChain` itself for fluent use.
// Terminal methods (single, returns, limit when last) are overridden per test.
Object.keys(mockChain).forEach((k) => {
  (mockChain as Record<string, ReturnType<typeof vi.fn>>)[k].mockReturnValue(mockChain);
});

const mockFrom = vi.fn().mockReturnValue(mockChain);

const mockClient = { from: mockFrom };

vi.mock("@/lib/supabase", () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}));

// ── AI SDK mock ───────────────────────────────────────────────────────────────

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn().mockReturnValue("mock-openai-model"),
}));

// ── Import service functions after mocks ──────────────────────────────────────

import {
  createSession,
  getSession,
  listSessions,
  appendMessages,
  autoTitleIfFirstMessage,
  cleanupExpired,
} from "./sessions.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetChain() {
  Object.keys(mockChain).forEach((k) => {
    (mockChain as Record<string, ReturnType<typeof vi.fn>>)[k].mockReset();
    (mockChain as Record<string, ReturnType<typeof vi.fn>>)[k].mockReturnValue(mockChain);
  });
  mockFrom.mockReset();
  mockFrom.mockReturnValue(mockChain);
}

function makeOk(data: unknown): ChainResult {
  return { data, error: null };
}

function makeErr(message: string, code?: string): ChainResult {
  return { data: null, error: { message, code } };
}

// ── createSession ─────────────────────────────────────────────────────────────

describe("createSession", () => {
  beforeEach(resetChain);

  it("[happy] inserts row and returns session", async () => {
    const fakeSession = {
      id: "abc-uuid",
      user_id: "u1",
      title: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    mockChain.single.mockResolvedValue(makeOk(fakeSession));

    const result = await createSession({ userId: "u1" }, mockClient as never);
    expect(result).toEqual(fakeSession);
    expect(mockFrom).toHaveBeenCalledWith("sessions");
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", title: null }),
    );
  });

  it("[error] DB error throws", async () => {
    mockChain.single.mockResolvedValue(makeErr("insert failed"));
    await expect(createSession({ userId: "u1" }, mockClient as never)).rejects.toThrow(
      "createSession failed: insert failed",
    );
  });

  it("[no data] no data returned throws", async () => {
    mockChain.single.mockResolvedValue({ data: null, error: null });
    await expect(createSession({ userId: "u1" }, mockClient as never)).rejects.toThrow(
      "createSession returned no data",
    );
  });
});

// ── getSession ────────────────────────────────────────────────────────────────

describe("getSession", () => {
  beforeEach(resetChain);

  it("[happy] returns session with messages", async () => {
    const fakeSession = {
      id: "sess-1",
      user_id: "u1",
      title: "Test Chat",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const fakeMessages = [
      { id: "msg-1", session_id: "sess-1", role: "user", content: "hello", created_at: "2026-01-01T00:00:01Z" },
    ];

    // First call (session lookup) → single resolves session
    // Second call (messages) → limit resolves messages array
    let callCount = 0;
    mockChain.single.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(makeOk(fakeSession));
      return Promise.resolve(makeOk(null));
    });
    mockChain.limit.mockResolvedValue(makeOk(fakeMessages));

    const result = await getSession("sess-1", mockClient as never);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("sess-1");
    expect(result!.messages).toHaveLength(1);
  });

  it("[not found] PGRST116 code → returns null", async () => {
    mockChain.single.mockResolvedValue(makeErr("row not found", "PGRST116"));

    const result = await getSession("no-such-id", mockClient as never);
    expect(result).toBeNull();
  });

  it("[error] non-PGRST116 DB error throws", async () => {
    mockChain.single.mockResolvedValue(makeErr("connection reset"));

    await expect(getSession("sess-1", mockClient as never)).rejects.toThrow(
      "getSession failed: connection reset",
    );
  });
});

// ── listSessions ──────────────────────────────────────────────────────────────

describe("listSessions", () => {
  beforeEach(resetChain);

  it("[happy] returns sessions list", async () => {
    const fakeSessions = [
      { id: "s1", user_id: "u1", title: null, created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
      { id: "s2", user_id: "u1", title: "Chat", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    ];
    mockChain.returns.mockResolvedValue(makeOk(fakeSessions));

    const result = await listSessions({ userId: "u1" }, mockClient as never);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("s1");
  });

  it("[empty] returns empty array when no sessions", async () => {
    mockChain.returns.mockResolvedValue(makeOk([]));
    const result = await listSessions({}, mockClient as never);
    expect(result).toEqual([]);
  });

  it("[error] DB error throws", async () => {
    mockChain.returns.mockResolvedValue(makeErr("query failed"));
    await expect(listSessions({}, mockClient as never)).rejects.toThrow(
      "listSessions failed: query failed",
    );
  });
});

// ── appendMessages ────────────────────────────────────────────────────────────

describe("appendMessages", () => {
  beforeEach(resetChain);

  it("[happy] inserts messages and returns count", async () => {
    mockChain.select.mockImplementation(() => {
      // First select call (after insert) — return inserted ids
      return Promise.resolve(makeOk([{ id: "m1" }, { id: "m2" }]));
    });
    // eq after update (update updated_at) — needs to resolve
    mockChain.eq.mockImplementation(() => mockChain);

    const result = await appendMessages(
      "sess-1",
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "world" },
      ],
      mockClient as never,
    );
    expect(result).toBe(2);
  });

  it("[empty] zero messages returns 0 without calling DB", async () => {
    const result = await appendMessages("sess-1", [], mockClient as never);
    expect(result).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("[error] DB insert error throws", async () => {
    mockChain.select.mockResolvedValue(makeErr("insert failed"));
    await expect(
      appendMessages("sess-1", [{ role: "user", content: "hi" }], mockClient as never),
    ).rejects.toThrow("appendMessages failed: insert failed");
  });
});

// ── autoTitleIfFirstMessage ───────────────────────────────────────────────────

describe("autoTitleIfFirstMessage", () => {
  beforeEach(() => {
    resetChain();
    mockGenerateText.mockReset();
  });

  it("[title already set] skips AI call when title exists", async () => {
    mockChain.single.mockResolvedValue(makeOk({ title: "Existing Title" }));

    await autoTitleIfFirstMessage("sess-1", "some prompt", mockClient as never);

    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("[title null] generates and writes title when null", async () => {
    // First call: fetch session title → null
    mockChain.single.mockResolvedValue(makeOk({ title: null }));
    // eq after update — chainable, returns mockChain (resolves to undefined via the default)
    mockGenerateText.mockResolvedValue({ text: "Chat about the weather today" });

    await autoTitleIfFirstMessage("sess-1", "What is the weather like?", mockClient as never);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Chat about the weather today" }),
    );
  });

  it("[not found] PGRST116 on fetch → silent skip, no throw", async () => {
    mockChain.single.mockResolvedValue(makeErr("not found", "PGRST116"));

    await expect(
      autoTitleIfFirstMessage("no-such", "hello", mockClient as never),
    ).resolves.toBeUndefined();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("[AI failure] generateText throws → silent skip, no throw", async () => {
    mockChain.single.mockResolvedValue(makeOk({ title: null }));
    mockGenerateText.mockRejectedValue(new Error("openai down"));

    await expect(
      autoTitleIfFirstMessage("sess-1", "some prompt", mockClient as never),
    ).resolves.toBeUndefined();
  });

  it("[title trimmed to 80 chars] long AI response is sliced", async () => {
    mockChain.single.mockResolvedValue(makeOk({ title: null }));
    mockGenerateText.mockResolvedValue({ text: "A".repeat(100) });

    await autoTitleIfFirstMessage("sess-1", "long prompt", mockClient as never);

    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "A".repeat(80) }),
    );
  });
});

// ── cleanupExpired ────────────────────────────────────────────────────────────

describe("cleanupExpired", () => {
  beforeEach(resetChain);

  it("[happy] returns count of deleted sessions", async () => {
    mockChain.select.mockResolvedValue(makeOk([{ id: "old-1" }, { id: "old-2" }]));

    const count = await cleanupExpired(7, mockClient as never);
    expect(count).toBe(2);
    expect(mockChain.delete).toHaveBeenCalled();
    expect(mockChain.lt).toHaveBeenCalledWith("updated_at", expect.any(String));
  });

  it("[none expired] returns 0 when nothing to delete", async () => {
    mockChain.select.mockResolvedValue(makeOk([]));
    const count = await cleanupExpired(7, mockClient as never);
    expect(count).toBe(0);
  });

  it("[error] DB error throws", async () => {
    mockChain.select.mockResolvedValue(makeErr("delete failed"));
    await expect(cleanupExpired(7, mockClient as never)).rejects.toThrow(
      "cleanupExpired failed: delete failed",
    );
  });
});
