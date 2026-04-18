import type { HardeningResult } from '@aegis/hardening';
import { createServiceRoleClient } from './supabase';

export type DecisionOutcome = 'ok' | 'blocked';
export type HardeningLayer = 'B1' | 'B2' | 'B3' | 'B4' | 'B5';

export interface MetricsSnapshot {
  firedCount: number;
  blockedCount: number;
  avgSafetyScore: number | null;
  mostBlockedLayer: HardeningLayer | null;
  layerBreakdown: Record<HardeningLayer, number>;
  /** ISO 8601 — latest created_at in the result set, or now() if no rows. */
  lastUpdatedAt: string;
  /** 'unavailable' when Supabase env is missing or query errored. */
  source: 'db' | 'unavailable';
}

export interface RecordDecisionOpts {
  patternId?: string;
  provider: 'openai' | 'anthropic';
}

// ── helpers ──────────────────────────────────────────────────────────────────

const LAYERS: HardeningLayer[] = ['B1', 'B2', 'B3', 'B4', 'B5'];

function resolveLayer(result: HardeningResult): HardeningLayer {
  if (result.allowed) return 'B5';
  const first = result.blockedLayers[0];
  return (first && LAYERS.includes(first as HardeningLayer) ? first : 'B5') as HardeningLayer;
}

function emptyBreakdown(): Record<HardeningLayer, number> {
  return { B1: 0, B2: 0, B3: 0, B4: 0, B5: 0 };
}

function unavailableSnapshot(): MetricsSnapshot {
  return {
    firedCount: 0,
    blockedCount: 0,
    avgSafetyScore: null,
    mostBlockedLayer: null,
    layerBreakdown: emptyBreakdown(),
    lastUpdatedAt: new Date().toISOString(),
    source: 'unavailable',
  };
}

// ── recordDecision ────────────────────────────────────────────────────────────

export async function recordDecision(
  result: HardeningResult,
  opts: RecordDecisionOpts,
): Promise<void> {
  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    console.warn('[metrics] recordDecision failed', err);
    return;
  }

  const layer = resolveLayer(result);
  const outcome: DecisionOutcome = result.allowed ? 'ok' : 'blocked';

  const { error } = await supabase.from('aegis_decisions').insert({
    approval_id: null,
    message_id: null,
    layer,
    outcome,
    safety_score: result.safetyScore,
    details: {
      blocked_layers: result.blockedLayers,
      pii_detected: result.piiDetected,
      injection_detected: result.injectionDetected,
      destructive_count: result.destructiveCount,
      reason: result.reason ?? null,
      pattern_id: opts.patternId ?? null,
      provider: opts.provider,
    },
  });

  if (error) {
    console.warn('[metrics] recordDecision failed', error);
  }
}

// ── getMetricsSnapshot ────────────────────────────────────────────────────────

interface DecisionRow {
  layer: string;
  outcome: string;
  safety_score: number | null;
  created_at: string;
}

export async function getMetricsSnapshot(): Promise<MetricsSnapshot> {
  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    console.warn('[metrics] getMetricsSnapshot failed', err);
    return unavailableSnapshot();
  }

  const { data, error } = await supabase
    .from('aegis_decisions')
    .select('layer, outcome, safety_score, created_at')
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) {
    console.warn('[metrics] getMetricsSnapshot failed', error);
    return unavailableSnapshot();
  }

  const rows: DecisionRow[] = (data as DecisionRow[] | null) ?? [];

  const firedCount = rows.length;
  const blockedRows = rows.filter((r) => r.outcome === 'blocked');
  const blockedCount = blockedRows.length;

  // avgSafetyScore — mean of non-null safety_score across all rows
  const scoredRows = rows.filter((r) => r.safety_score !== null);
  const avgSafetyScore =
    scoredRows.length > 0
      ? Math.round(
          (scoredRows.reduce((sum, r) => sum + (r.safety_score as number), 0) /
            scoredRows.length) *
            100,
        ) / 100
      : null;

  // layerBreakdown — blocked rows per layer
  const layerBreakdown = emptyBreakdown();
  for (const r of blockedRows) {
    if (LAYERS.includes(r.layer as HardeningLayer)) {
      layerBreakdown[r.layer as HardeningLayer]++;
    }
  }

  // mostBlockedLayer — highest count; tie-break: lowest B-number
  let mostBlockedLayer: HardeningLayer | null = null;
  if (blockedCount > 0) {
    let maxCount = 0;
    for (const layer of LAYERS) {
      // LAYERS is ordered B1..B5, so first-found wins tie-break
      if (layerBreakdown[layer] > maxCount) {
        maxCount = layerBreakdown[layer];
        mostBlockedLayer = layer;
      }
    }
  }

  // lastUpdatedAt — latest created_at, or now() if table is empty
  const lastUpdatedAt =
    rows.length > 0 ? rows[0].created_at : new Date().toISOString();

  return {
    firedCount,
    blockedCount,
    avgSafetyScore,
    mostBlockedLayer,
    layerBreakdown,
    lastUpdatedAt,
    source: 'db',
  };
}
