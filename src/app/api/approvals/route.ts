// src/app/api/approvals/route.ts — GET /api/approvals
// Lists approvals for the authenticated session owner, filtered by status and tool.

export const runtime = 'nodejs';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { listApprovals } from '@/lib/approvals';
import { apiOk, apiError } from '@/lib/api';

// ── Query schema ──────────────────────────────────────────────────────────────

const QuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'denied', 'expired', 'all']).default('pending'),
  tool: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  // Auth gate
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claim = verifySession(cookieValue);

  if (!claim.valid) {
    return apiError({ status: 401, error: 'unauthorized' });
  }

  const userId = claim.userId;

  // Parse + validate query params
  const url = new URL(req.url);
  const rawQuery = {
    status: url.searchParams.get('status') ?? undefined,
    tool: url.searchParams.get('tool') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  };

  let query: z.infer<typeof QuerySchema>;
  try {
    query = QuerySchema.parse(rawQuery);
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return apiError({ status: 400, error: 'invalid_query', issues });
  }

  const { status, tool, limit } = query;

  try {
    const data = await listApprovals(userId, { status, tool, limit });
    return apiOk(data);
  } catch (err) {
    console.error('[api/approvals] query failed:', err);
    return apiError({ status: 500, error: 'internal' });
  }
}
