// src/app/api/approvals/[id]/decide/route.ts — POST /api/approvals/[id]/decide
// Validates operator session, loads approval, applies hardening to rejectionMessage,
// records decision, emits Sentry span + exception on deny, and forwards to OpenClaw.

export const runtime = 'nodejs';

import { cookies } from 'next/headers';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { createHardening } from '@aegis/hardening';
import { getApproval, markDecided } from '@/lib/approvals';
import { AEGIS_APPROVAL_ATTRS, approvalDenyFingerprint } from '@/lib/aegis-attrs';
import { captureAegisBlock } from '@/lib/sentry';
import { apiOk, apiError } from '@/lib/api';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { resolveApproval } from '@/lib/openclaw-resolver';

// ── Request body schema ───────────────────────────────────────────────────────

const DecideBodySchema = z.object({
  decision: z.enum(['allow-once', 'allow-always', 'deny-once', 'deny-always']),
  rejectionMessage: z.string().max(2000).optional(),
});

type DecideBody = z.infer<typeof DecideBodySchema>;

// ── Reason category bucketing ─────────────────────────────────────────────────

type ReasonCategory =
  | 'pii'
  | 'injection'
  | 'path-traversal'
  | 'secret'
  | 'user-deny'
  | 'expired';

function mapReasonCategory(reason: string | null | undefined): ReasonCategory {
  if (!reason) return 'user-deny';

  const r = reason.toLowerCase();

  if (r.includes('pii') || r.includes('personal')) return 'pii';
  if (r.includes('inject') || r.includes('prompt')) return 'injection';
  if (r.includes('path') || r.includes('traversal')) return 'path-traversal';
  if (r.includes('secret') || r.includes('token') || r.includes('redact')) return 'secret';
  if (r.includes('expir')) return 'expired';

  return 'user-deny';
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth gate: validate session cookie
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claim = verifySession(cookieValue);

  if (!claim.valid) {
    return apiError({ status: 401, error: 'unauthorized' });
  }

  // Rate-limit gate: 6000 decisions per user per 60s (demo-loose; AEGIS_DEMO_MODE bypasses)
  const rl = await rateLimit({ key: `approval:user:${claim.userId}`, max: 6000, windowSec: 60 });
  if (!rl.ok) {
    Sentry.captureException(new Error('rate-limited'), {
      tags: { 'aegis.ratelimited': 'true' },
      fingerprint: ['aegis-ratelimited', 'approvals.decide'],
    });
    return apiError({
      status: 429,
      error: 'rate_limited',
      message: 'Too many decisions. Slow down.',
      headers: { 'retry-after': String(rl.retryAfterSec) },
    });
  }

  // Parse and resolve route param
  const { id } = await params;

  // Parse + validate body
  let body: DecideBody;
  try {
    const raw: unknown = await req.json();
    body = DecideBodySchema.parse(raw);
  } catch (err) {
    const issues = err instanceof z.ZodError ? err.issues : undefined;
    return apiError({ status: 400, error: 'invalid_body', issues });
  }

  // Load approval
  const approval = await getApproval(id);
  if (!approval) {
    return apiError({ status: 404, error: 'not_found', message: `Approval ${id} not found` });
  }

  // B4 hardening on rejectionMessage
  if (body.rejectionMessage) {
    const hardening = createHardening();
    const hardeningResult = hardening.run({ prompt: body.rejectionMessage });

    if (!hardeningResult.allowed) {
      captureAegisBlock(hardeningResult);
      return apiError({
        status: 400,
        error: 'invalid_body',
        message: `rejectionMessage blocked by Ægis hardening: ${hardeningResult.reason ?? 'hardening violation'}`,
      });
    }
  }

  // Wrap approval decision in a Sentry span
  return Sentry.startSpan(
    {
      op: 'aegis.approval.decide',
      name: approval.tool,
      attributes: {
        [AEGIS_APPROVAL_ATTRS.ID]: id,
        [AEGIS_APPROVAL_ATTRS.TOOL]: approval.tool,
        [AEGIS_APPROVAL_ATTRS.DECISION]: body.decision,
        [AEGIS_APPROVAL_ATTRS.DECIDED_BY]: 'ui',
      },
    },
    async () => {
      // Record decision in store
      await markDecided({
        id,
        decision: body.decision,
        decided_by: 'ui',
        reason: body.rejectionMessage,
      });

      // On deny: capture Sentry exception with deterministic fingerprint
      if (body.decision.startsWith('deny')) {
        Sentry.captureException(new Error('approval-denied'), {
          fingerprint: [...approvalDenyFingerprint(
            approval.tool,
            mapReasonCategory(approval.reason),
          )],
          tags: {
            'aegis.approval.id': id,
            'aegis.approval.tool': approval.tool,
            'aegis.approval.decision': body.decision,
          },
        });
      }

      // Forward to OpenClaw — fire-and-forget; do not block response
      resolveApproval({
        approvalId: id,
        decision: body.decision,
        rejectionMessage: body.rejectionMessage,
      }).catch((err: unknown) => {
        console.error('[approvals/decide] OpenClaw resolveApproval failed:', err);
      });

      return apiOk({ approvalId: id, decision: body.decision });
    },
  );
}
