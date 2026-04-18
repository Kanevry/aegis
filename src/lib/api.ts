import type { z } from "zod";
import type { ApiErrorCode, ApiResponse } from "@aegis/types";
import { getRequestId } from "./request-context";

const JSON_HEADERS = { "content-type": "application/json" } as const;

export function apiOk<T>(data: T, init?: ResponseInit): Response {
  const body: ApiResponse<T> = {
    ok: true,
    data,
    request_id: getRequestId() ?? "unknown",
  };
  return new Response(JSON.stringify(body), {
    ...init,
    status: init?.status ?? 200,
    headers: { ...JSON_HEADERS, ...(init?.headers ?? {}) },
  });
}

export interface ApiErrorInput {
  status: number;
  error: ApiErrorCode;
  message?: string;
  issues?: z.core.$ZodIssue[];
  headers?: HeadersInit;
}

export function apiError(input: ApiErrorInput): Response {
  const body: ApiResponse = {
    ok: false,
    error: input.error,
    message: input.message ?? input.error,
    issues: input.issues,
    request_id: getRequestId() ?? "unknown",
  };
  return new Response(JSON.stringify(body), {
    status: input.status,
    headers: { ...JSON_HEADERS, ...(input.headers ?? {}) },
  });
}

export async function throwIfError<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok) {
    const err = new Error(body.message);
    (err as Error & { code?: string; issues?: unknown; requestId?: string }).code = body.error;
    (err as Error & { code?: string; issues?: unknown; requestId?: string }).issues = body.issues;
    (err as Error & { code?: string; issues?: unknown; requestId?: string }).requestId = body.request_id;
    throw err;
  }
  return body.data;
}
