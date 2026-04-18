export type CompareProvider = 'openai' | 'anthropic';

export type CompareVariantId =
  | 'openai-on'
  | 'openai-off'
  | 'anthropic-on'
  | 'anthropic-off';

export type CompareOutcome = 'allowed' | 'blocked' | 'error';

export type CompareVariant = {
  id: CompareVariantId;
  provider: CompareProvider;
  hardening: boolean;
  outcome: CompareOutcome;
  safetyScore: number;
  blockedLayers: string[];
  reason: string;
  response: string;
  latencyMs: number;
  model: string;
};

export type CompareSingleResponse = {
  mode: 'single';
  attackId: string;
  prompt: string;
  variants: CompareVariant[];
};

export type CompareMatrixRow = {
  attackId: string;
  title: string;
  category: string;
  expectedBlockedLayers: string[];
  variants: CompareVariant[];
};

export type CompareBatchResponse = {
  mode: 'batch';
  rows: CompareMatrixRow[];
};

export type CompareResponse = CompareSingleResponse | CompareBatchResponse;

export function toVariantId(
  provider: CompareProvider,
  hardening: boolean,
): CompareVariantId {
  return `${provider}-${hardening ? 'on' : 'off'}` as CompareVariantId;
}
