import { type NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verifyWebhookSignature } from '@aegis/openclaw-client';
import { loadEnv } from '@aegis/types';
import { openclawEventSchema } from './schema';
import { AEGIS_WEBHOOK_ATTRS } from './span-attrs';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const sig = req.headers.get('x-openclaw-signature');
  const env = loadEnv();
  const secret = env.OPENCLAW_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'webhook_not_configured' },
      { status: 503 },
    );
  }

  if (!verifyWebhookSignature(raw, sig, secret)) {
    Sentry.withScope((scope) => {
      scope.setTag(AEGIS_WEBHOOK_ATTRS.INVALID_SIGNATURE, 'true');
      Sentry.captureMessage('OpenClaw webhook invalid signature', 'warning');
    });
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }

  let parsed: ReturnType<typeof openclawEventSchema.parse>;
  try {
    parsed = openclawEventSchema.parse(JSON.parse(raw));
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_payload',
        issues: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  return Sentry.startSpan(
    {
      op: 'aegis.webhook.openclaw',
      name: parsed.type,
      attributes: {
        [AEGIS_WEBHOOK_ATTRS.EVENT_TYPE]: parsed.type,
        [AEGIS_WEBHOOK_ATTRS.EVENT_ID]: parsed.event_id,
      },
    },
    async (span) => {
      // Wave 3 (dispatchers.ts) will attach dedupe-then-dispatch logic here.
      span.setAttribute(AEGIS_WEBHOOK_ATTRS.DEDUPED, false);
      return NextResponse.json({ ok: true, event_id: parsed.event_id, type: parsed.type });
    },
  );
}
