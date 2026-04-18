import { z } from "zod";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  request_id: string;
};

export type ApiFailure = {
  ok: false;
  error: string; // machine-readable code: 'unauthorized' | 'invalid_body' | 'rate_limited' | 'payload_too_large' | ...
  message: string; // human-readable
  issues?: z.core.$ZodIssue[];
  request_id: string;
};

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure;

export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "invalid_body",
  "invalid_query",
  "not_found",
  "rate_limited",
  "payload_too_large",
  "internal",
  "upstream_unavailable",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
