import { describe, it, expect } from "vitest";
import {
  getRequestId,
  getRequestContext,
  runWithRequestContext,
} from "./request-context";

describe("getRequestId", () => {
  it("returns undefined outside any runWithRequestContext scope", () => {
    expect(getRequestId()).toBeUndefined();
  });
});

describe("getRequestContext", () => {
  it("returns undefined outside any runWithRequestContext scope", () => {
    expect(getRequestContext()).toBeUndefined();
  });
});

describe("runWithRequestContext", () => {
  it("exposes requestId via getRequestId inside the callback", () => {
    const result = runWithRequestContext({ requestId: "abc" }, () =>
      getRequestId(),
    );
    expect(result).toBe("abc");
  });

  it("exposes full context via getRequestContext inside the callback", () => {
    const ctx = {
      requestId: "r1",
      userId: "u1",
      traceParent: "tp",
      baggage: "bg",
    };
    const result = runWithRequestContext(ctx, () => getRequestContext());
    expect(result).toEqual({
      requestId: "r1",
      userId: "u1",
      traceParent: "tp",
      baggage: "bg",
    });
  });

  it("returns the callback's return value unchanged", () => {
    const returned = runWithRequestContext({ requestId: "ret-test" }, () => 42);
    expect(returned).toBe(42);
  });

  it("nested run replaces context only within the inner function", () => {
    let innerRequestId: string | undefined;
    let outerAfterNested: string | undefined;

    runWithRequestContext({ requestId: "outer" }, () => {
      runWithRequestContext({ requestId: "inner" }, () => {
        innerRequestId = getRequestId();
      });
      outerAfterNested = getRequestId();
    });

    expect(innerRequestId).toBe("inner");
    expect(outerAfterNested).toBe("outer");
  });

  it("async continuation inside the scope still sees the correct requestId after await", async () => {
    const result = await runWithRequestContext(
      { requestId: "async-id" },
      async () => {
        await Promise.resolve();
        return getRequestId();
      },
    );
    expect(result).toBe("async-id");
  });

  it("isolates stores across two concurrent async calls with different IDs", async () => {
    // Both Promises run concurrently; each must see only its own requestId throughout.
    const [idA, idB] = await Promise.all([
      runWithRequestContext({ requestId: "concurrent-A" }, async () => {
        // yield to the event loop so the two async branches interleave
        await Promise.resolve();
        return getRequestId();
      }),
      runWithRequestContext({ requestId: "concurrent-B" }, async () => {
        await Promise.resolve();
        return getRequestId();
      }),
    ]);

    expect(idA).toBe("concurrent-A");
    expect(idB).toBe("concurrent-B");
  });
});
