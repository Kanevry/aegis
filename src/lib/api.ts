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
