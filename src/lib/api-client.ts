import type { ApiResponse } from "@aegis/types";

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
