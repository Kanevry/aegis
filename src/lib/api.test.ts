import { describe, it, expect } from "vitest";
import { throwIfError } from "./api-client";
import { apiOk, apiError } from "./api";
import { runWithRequestContext } from "./request-context";

describe("apiOk", () => {
  it.concurrent("returns status 200 by default", async () => {
    const res = apiOk({ hello: "world" });
    expect(res.status).toBe(200);
  });

  it.concurrent("body has ok:true and the correct data payload", async () => {
    const res = apiOk({ hello: "world" });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ hello: "world" });
  });

  it.concurrent("body request_id falls back to 'unknown' outside ALS scope", async () => {
    const res = apiOk({ x: 1 });
    const body = await res.json();
    expect(body.request_id).toBe("unknown");
  });

  it.concurrent("body request_id comes from ALS when in scope", async () => {
    const res = runWithRequestContext({ requestId: "req-1" }, () =>
      apiOk({ a: 1 }),
    );
    const body = await res.json();
    expect(body.request_id).toBe("req-1");
  });

  it.concurrent("sets content-type: application/json by default", async () => {
    const res = apiOk({});
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it.concurrent("respects custom init.status", async () => {
    const res = apiOk({}, { status: 201 });
    expect(res.status).toBe(201);
  });

  it.concurrent("merges caller headers with content-type header", async () => {
    const res = apiOk({}, { headers: { "x-custom": "value" } });
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-custom")).toBe("value");
  });
});

describe("apiError", () => {
  it.concurrent("returns the specified HTTP status code", async () => {
    const res = apiError({ status: 401, error: "unauthorized" });
    expect(res.status).toBe(401);
  });

  it.concurrent("body has ok:false and the error code", async () => {
    const res = apiError({ status: 401, error: "unauthorized" });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it.concurrent("message defaults to the error code when not provided", async () => {
    const res = apiError({ status: 401, error: "unauthorized" });
    const body = await res.json();
    expect(body.message).toBe("unauthorized");
  });

  it.concurrent("uses the explicit message when provided", async () => {
    const res = apiError({ status: 400, error: "invalid_body", message: "foo" });
    const body = await res.json();
    expect(body.message).toBe("foo");
  });

  it.concurrent("passes issues array into the body", async () => {
    const issues = [{ code: "too_small", path: ["x"], message: "x" }] as never;
    const res = apiError({ status: 422, error: "invalid_body", issues });
    const body = await res.json();
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].code).toBe("too_small");
    expect(body.issues[0].path).toEqual(["x"]);
    expect(body.issues[0].message).toBe("x");
  });

  it.concurrent("request_id falls back to 'unknown' outside ALS scope", async () => {
    const res = apiError({ status: 500, error: "internal" });
    const body = await res.json();
    expect(body.request_id).toBe("unknown");
  });

  it.concurrent("request_id comes from ALS when in scope", async () => {
    const res = runWithRequestContext({ requestId: "err-req-1" }, () =>
      apiError({ status: 400, error: "invalid_body" }),
    );
    const body = await res.json();
    expect(body.request_id).toBe("err-req-1");
  });

  it.concurrent("sets content-type: application/json", async () => {
    const res = apiError({ status: 400, error: "invalid_body" });
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it.concurrent("merges caller headers into the response", async () => {
    const res = apiError({
      status: 429,
      error: "rate_limited",
      headers: { "retry-after": "30" },
    });
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("retry-after")).toBe("30");
  });
});

describe("throwIfError", () => {
  it("resolves to data when the response is successful", async () => {
    const res = apiOk({ n: 42 });
    const data = await throwIfError<{ n: number }>(res);
    expect(data).toEqual({ n: 42 });
  });

  it("throws an error when the response is not ok", async () => {
    const res = apiError({
      status: 400,
      error: "invalid_body",
      message: "bad",
      issues: [{ code: "too_small", path: ["x"], message: "x" }] as never,
    });
    let thrown: unknown;
    try {
      await throwIfError(res);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("bad");
  });

  it("thrown error carries the error code on .code", async () => {
    const res = apiError({ status: 400, error: "invalid_body", message: "bad" });
    let thrown: unknown;
    try {
      await throwIfError(res);
    } catch (e) {
      thrown = e;
    }
    expect((thrown as { code?: string }).code).toBe("invalid_body");
  });

  it("thrown error carries issues on .issues", async () => {
    const issues = [{ code: "too_small", path: ["x"], message: "x" }] as never;
    const res = apiError({
      status: 400,
      error: "invalid_body",
      message: "bad",
      issues,
    });
    let thrown: unknown;
    try {
      await throwIfError(res);
    } catch (e) {
      thrown = e;
    }
    const err = thrown as { issues?: Array<{ code: string }> };
    expect(Array.isArray(err.issues)).toBe(true);
    expect(err.issues![0].code).toBe("too_small");
  });

  it("thrown error carries requestId on .requestId", async () => {
    const res = runWithRequestContext({ requestId: "throw-req" }, () =>
      apiError({ status: 400, error: "invalid_body", message: "bad" }),
    );
    let thrown: unknown;
    try {
      await throwIfError(res);
    } catch (e) {
      thrown = e;
    }
    expect((thrown as { requestId?: string }).requestId).toBe("throw-req");
  });
});
