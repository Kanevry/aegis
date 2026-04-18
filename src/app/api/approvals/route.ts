// src/app/api/approvals/route.ts — GET /api/approvals
// Lists approvals for the authenticated session owner, filtered by status and tool.

export const runtime = 'nodejs';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { listPending } from '@/lib/approvals';
import { createServiceRoleClient } from '@/lib/supabase';
import { apiOk, apiError } from '@/lib/api';
import type { Approval } from '@aegis/types';

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

  let data: Approval[];

  try {
    if (status === 'pending') {
      // Use the dedicated listPending helper which enforces session ownership
      data = await listPending(userId, { tool, limit });
    } else if (status === 'all') {
      // Fetch all statuses for this user's sessions
      const client = createServiceRoleClient();
      let q = client
        .from('approvals')
        .select('*, sessions!inner(user_id)')
        .eq('sessions.user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (tool) {
        q = q.eq('tool', tool);
      }

      const { data: rows, error } = await q.returns<Approval[]>();
      if (error) throw new Error(`list all failed: ${error.message}`);
      data = rows ?? [];
    } else {
      // Specific non-pending status
      const client = createServiceRoleClient();
      let q = client
        .from('approvals')
        .select('*, sessions!inner(user_id)')
        .eq('sessions.user_id', userId)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (tool) {
        q = q.eq('tool', tool);
      }

      const { data: rows, error } = await q.returns<Approval[]>();
      if (error) throw new Error(`list ${status} failed: ${error.message}`);
      data = rows ?? [];
    }
  } catch (err) {
    console.error('[api/approvals] query failed:', err);
    return apiError({ status: 500, error: 'internal' });
  }

  return apiOk(data);
}
