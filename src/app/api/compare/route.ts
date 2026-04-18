import { z } from 'zod';
import { ATTACK_LIBRARY } from '@/lib/attacks';
import { buildBatchComparison, buildSingleComparison } from '@/lib/compare-service';

export const runtime = 'nodejs';

const BodySchema = z
  .object({
    attackId: z.string().min(1).optional(),
    attackIds: z.array(z.string().min(1)).min(1).max(ATTACK_LIBRARY.length).optional(),
    prompt: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const modes = [
      typeof value.attackId === 'string',
      Array.isArray(value.attackIds),
      typeof value.prompt === 'string',
    ].filter(Boolean).length;

    if (modes !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of `attackId`, `attackIds`, or `prompt`.',
      });
    }
  });

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return Response.json(
      {
        error: 'invalid_body',
        issues: error instanceof z.ZodError ? error.issues : undefined,
      },
      { status: 400 },
    );
  }

  if (body.attackIds) {
    const payload = buildBatchComparison(body.attackIds);
    if (!payload) {
      return Response.json(
        {
          error: 'unknown_attack',
          availableAttackIds: ATTACK_LIBRARY.map((attack) => attack.id),
        },
        { status: 404 },
      );
    }

    return Response.json(payload);
  }

  const payload = body.attackId || body.prompt
    ? await buildSingleComparison({
        attackId: body.attackId,
        prompt: body.prompt,
      })
    : null;

  if (!payload) {
    return Response.json(
      {
        error: 'unknown_attack',
        availableAttackIds: ATTACK_LIBRARY.map((attack) => attack.id),
      },
      { status: 404 },
    );
  }

  return Response.json(payload);
}
