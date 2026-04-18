// src/app/api/agent/run/route.ts — POST endpoint: hardening + streaming LLM
// Acceptance (from Issue #1):
//   curl -X POST localhost:3000/api/agent/run \
//     -H 'content-type: application/json' -d '{"prompt":"hello"}'
//   → 200 streamed chunks
//
//   curl -X POST localhost:3000/api/agent/run \
//     -H 'content-type: application/json' -d '{"prompt":"../../etc/passwd"}'
//   → 403 with { safetyScore<0.3, blockedLayers:['B1'], reason }

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { createHardening, extractPathsFromText } from '@aegis/hardening';
import { getAttackById } from '@/lib/attacks';
import { withHardeningSpan, captureAegisBlock } from '@/lib/sentry';

export const runtime = 'nodejs';

const PatternIdSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().min(1).max(128).optional(),
);

const BodySchema = z.object({
  prompt: z.string().min(1).max(10_000),
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  patternId: PatternIdSchema,
});

export async function POST(req: NextRequest) {
  // Parse + validate
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { error: 'invalid_body', issues: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400 },
    );
  }

  // Hardening — extract real path candidates from the prompt so B1 catches traversal sequences
  const hardening = createHardening();
  const extractedPaths = extractPathsFromText(body.prompt);
  const result = hardening.run({ prompt: body.prompt, paths: extractedPaths });
  const stablePatternId = body.patternId ? getAttackById(body.patternId)?.id : undefined;

  // Sentry span with aegis.* attributes — delegates to withHardeningSpan for clean attribute wiring
  return withHardeningSpan('aegis.run', result, async () => {
    if (!result.allowed) {
      captureAegisBlock(result, stablePatternId);

      return Response.json(
        {
          safetyScore: result.safetyScore,
          blockedLayers: result.blockedLayers,
          reason: result.reason ?? 'blocked by Ægis hardening',
        },
        { status: 403 },
      );
    }

    // Allowed — stream from chosen provider using redactedPrompt
    const model =
      body.provider === 'anthropic'
        ? anthropic('claude-haiku-4-5-20251001')
        : openai('gpt-4o-mini');

    const streamResult = streamText({
      model,
      prompt: result.redactedPrompt,
    });

    return streamResult.toTextStreamResponse();
  }, { 'gen_ai.system': body.provider });
}
