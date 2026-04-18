import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ATTACK_LIBRARY, getAttackById } from '@/lib/attacks';

export const runtime = 'nodejs';

const BodySchema = z.object({
  attackId: z.string().min(1),
  provider: z.enum(['openai', 'anthropic']).default('openai'),
});

function parseDownstreamBody(text: string): Record<string, unknown> {
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { body: parsed };
  } catch {
    return { text };
  }
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { error: 'invalid_body', issues: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400 },
    );
  }

  const attack = getAttackById(body.attackId);
  if (!attack) {
    return Response.json(
      { error: 'unknown_attack', attackId: body.attackId, availableAttackIds: ATTACK_LIBRARY.map((item) => item.id) },
      { status: 404 },
    );
  }

  try {
    const upstream = await fetch(new URL('/api/agent/run', req.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prompt: attack.prompt,
        provider: body.provider,
        patternId: attack.id,
      }),
    });

    const text = await upstream.text();
    const parsed = parseDownstreamBody(text);

    return Response.json(
      {
        attackId: attack.id,
        prompt: attack.prompt,
        provider: body.provider,
        ...parsed,
        ok: upstream.ok,
        status: upstream.status,
      },
      { status: upstream.status },
    );
  } catch (err) {
    return Response.json(
      {
        attackId: attack.id,
        prompt: attack.prompt,
        provider: body.provider,
        ok: false,
        status: 502,
        error: 'downstream_request_failed',
      },
      { status: 502 },
    );
  }
}
