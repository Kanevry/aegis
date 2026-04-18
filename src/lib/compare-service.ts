import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { createHardening } from '@aegis/hardening';
import { ATTACK_LIBRARY, getAttackById } from '@/lib/attacks';
import type {
  CompareBatchResponse,
  CompareMatrixRow,
  CompareProvider,
  CompareSingleResponse,
  CompareVariant,
} from '@/lib/compare';
import { toVariantId } from '@/lib/compare';
import { captureAegisBlock, withHardeningSpan } from '@/lib/sentry';

const hardeningOffFlags = {
  B1: false,
  B2: false,
  B3: false,
  B4: false,
  B5: false,
} as const;

const variantDefinitions: Array<{ provider: CompareProvider; hardening: boolean }> = [
  { provider: 'openai', hardening: true },
  { provider: 'openai', hardening: false },
  { provider: 'anthropic', hardening: true },
  { provider: 'anthropic', hardening: false },
];

type SingleComparisonInput = {
  attackId?: string;
  prompt?: string;
};

function createVariantHardening(hardening: boolean) {
  return hardening ? createHardening() : createHardening({ flags: hardeningOffFlags });
}

function modelFor(provider: CompareProvider) {
  if (provider === 'anthropic') {
    return {
      model: anthropic('claude-haiku-4-5-20251001'),
      label: 'claude-haiku-4-5-20251001',
    };
  }

  return {
    model: openai('gpt-4o-mini'),
    label: 'gpt-4o-mini',
  };
}

async function runSingleVariant(
  prompt: string,
  attackId: string,
  provider: CompareProvider,
  hardening: boolean,
): Promise<CompareVariant> {
  const hardeningResult = createVariantHardening(hardening).run({
    prompt,
    paths: [prompt],
  });
  const variantId = toVariantId(provider, hardening);
  const startedAt = Date.now();

  return withHardeningSpan(
    'aegis.compare',
    hardeningResult,
    async () => {
      if (!hardeningResult.allowed) {
        captureAegisBlock(hardeningResult, attackId);
        return {
          id: variantId,
          provider,
          hardening,
          outcome: 'blocked',
          safetyScore: hardeningResult.safetyScore,
          blockedLayers: hardeningResult.blockedLayers,
          reason: hardeningResult.reason ?? 'Blocked by Ægis hardening',
          response: '',
          latencyMs: Date.now() - startedAt,
          model: provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini',
        };
      }

      try {
        const { model, label } = modelFor(provider);
        const result = await generateText({
          model,
          prompt: hardeningResult.redactedPrompt,
        });

        return {
          id: variantId,
          provider,
          hardening,
          outcome: 'allowed',
          safetyScore: hardeningResult.safetyScore,
          blockedLayers: hardeningResult.blockedLayers,
          reason: hardeningResult.reason ?? 'Request completed',
          response: result.text,
          latencyMs: Date.now() - startedAt,
          model: label,
        };
      } catch (error) {
        return {
          id: variantId,
          provider,
          hardening,
          outcome: 'error',
          safetyScore: hardeningResult.safetyScore,
          blockedLayers: hardeningResult.blockedLayers,
          reason: 'Provider invocation failed unexpectedly',
          response: '',
          latencyMs: Date.now() - startedAt,
          model: provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini',
        };
      }
    },
    {
      'gen_ai.system': provider,
      'aegis.comparison.variant': variantId,
    },
  );
}

function matrixVariant(
  prompt: string,
  provider: CompareProvider,
  hardening: boolean,
): CompareVariant {
  const result = createVariantHardening(hardening).run({
    prompt,
    paths: [prompt],
  });

  return {
    id: toVariantId(provider, hardening),
    provider,
    hardening,
    outcome: result.allowed ? 'allowed' : 'blocked',
    safetyScore: result.safetyScore,
    blockedLayers: result.blockedLayers,
    reason: result.reason ?? (result.allowed ? 'Allowed' : 'Blocked'),
    response: '',
    latencyMs: 0,
    model: provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini',
  };
}

function buildMatrixRow(attackId: string): CompareMatrixRow | null {
  const attack = getAttackById(attackId);
  if (!attack) {
    return null;
  }

  return {
    attackId: attack.id,
    title: attack.title,
    category: attack.category,
    expectedBlockedLayers: attack.expectedBlockedLayers,
    variants: variantDefinitions.map((variant) =>
      matrixVariant(attack.prompt, variant.provider, variant.hardening),
    ),
  };
}

export async function buildSingleComparison(
  input: SingleComparisonInput,
): Promise<CompareSingleResponse | null> {
  const attack = input.attackId ? getAttackById(input.attackId) : null;
  const prompt = attack?.prompt ?? input.prompt?.trim();

  if (!prompt) {
    return null;
  }

  const resolvedAttackId = attack?.id ?? input.attackId ?? 'custom-prompt';

  const variants = await Promise.all(
    variantDefinitions.map((variant) =>
      runSingleVariant(prompt, resolvedAttackId, variant.provider, variant.hardening),
    ),
  );

  return {
    mode: 'single',
    attackId: resolvedAttackId,
    prompt,
    variants,
  };
}

export function buildBatchComparison(
  attackIds: string[],
): CompareBatchResponse | null {
  const rows = attackIds
    .map((attackId) => buildMatrixRow(attackId))
    .filter((row): row is CompareMatrixRow => row !== null);

  if (rows.length !== attackIds.length) {
    return null;
  }

  return {
    mode: 'batch',
    rows,
  };
}

export function defaultAttackId() {
  return ATTACK_LIBRARY[0]?.id ?? null;
}
