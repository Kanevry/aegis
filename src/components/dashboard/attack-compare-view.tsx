'use client';

import * as React from 'react';
import { AlertTriangle, GitBranch, RefreshCw, Shield, Sparkles } from 'lucide-react';
import { ATTACK_LIBRARY } from '@/lib/attacks';
import type { CompareSingleResponse, CompareVariant } from '@/lib/compare';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type AttackCompareViewProps = {
  mode: 'compare' | 'flow';
  initialData: CompareSingleResponse | null;
};

const flowStages = ['Input', 'B1', 'B2', 'B3', 'B4', 'B5', 'LLM', 'Output'] as const;

function formatSafetyScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

function variantBadge(variant: CompareVariant) {
  if (variant.outcome === 'blocked') return 'destructive' as const;
  if (variant.outcome === 'allowed') return 'success' as const;
  return 'secondary' as const;
}

function variantTitle(variant: CompareVariant) {
  return `${variant.provider === 'openai' ? 'OpenAI' : 'Anthropic'} · ${
    variant.hardening ? 'Hardening on' : 'Hardening off'
  }`;
}

export function AttackCompareView({ mode, initialData }: AttackCompareViewProps) {
  const [selectedAttackId, setSelectedAttackId] = React.useState(
    initialData?.attackId ?? ATTACK_LIBRARY[0]?.id ?? '',
  );
  const [data, setData] = React.useState<CompareSingleResponse | null>(initialData);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedAttack =
    ATTACK_LIBRARY.find((attack) => attack.id === selectedAttackId) ?? ATTACK_LIBRARY[0];
  const visibleData = data?.attackId === selectedAttackId ? data : null;

  const loadComparison = React.useCallback(async (attackId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attackId }),
      });

      const payload = (await response.json()) as CompareSingleResponse | { error?: string };
      if (!response.ok || !('mode' in payload)) {
        throw new Error('error' in payload && payload.error ? payload.error : 'Compare request failed');
      }

      setData(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unexpected compare request failure',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const activeBlockedLayer =
    visibleData?.variants.find((variant) => variant.hardening && variant.blockedLayers.length > 0)
      ?.blockedLayers[0] ??
    selectedAttack?.expectedBlockedLayers[0] ??
    null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
              {mode === 'flow' ? <GitBranch size={16} /> : <Sparkles size={16} />}
            </span>
            <div>
              <h1 className="text-xl font-semibold text-neutral-950 dark:text-neutral-100">
                {mode === 'flow' ? 'Flow' : 'Compare'}
              </h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-500">
                {mode === 'flow'
                  ? 'Trace the selected attack through the five-layer defense path.'
                  : 'Run the same attack through OpenAI and Anthropic with hardening on and off.'}
              </p>
            </div>
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (selectedAttackId) {
              void loadComparison(selectedAttackId);
            }
          }}
          disabled={loading}
        >
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          {loading ? 'Running…' : 'Re-run compare'}
        </Button>
      </div>

      <Card className="border-neutral-200 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80">
        <CardHeader>
          <CardTitle>Attack selector</CardTitle>
          <CardDescription>Choose a canonical attack to replay through the compare endpoint.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ATTACK_LIBRARY.map((attack) => {
            const isSelected = attack.id === selectedAttackId;
            return (
              <button
                key={attack.id}
                type="button"
                onClick={() => {
                  setSelectedAttackId(attack.id);
                  void loadComparison(attack.id);
                }}
                className={cn(
                  'rounded-xl border p-4 text-left transition',
                  isSelected
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-neutral-200 bg-white/70 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950/40 dark:hover:border-neutral-700',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-neutral-950 dark:text-neutral-100">
                    {attack.title}
                  </p>
                  <Badge variant="secondary">{attack.category}</Badge>
                </div>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  {attack.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {attack.expectedBlockedLayers.map((layer) => (
                    <Badge key={layer} variant="outline">
                      {layer}
                    </Badge>
                  ))}
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {loading ? (
        <Card className="border-neutral-200 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80">
          <CardContent className="flex items-center gap-2 pt-6 text-sm text-neutral-700 dark:text-neutral-300">
            <RefreshCw size={16} className="animate-spin text-indigo-700 dark:text-indigo-300" />
            <span>
              {visibleData
                ? `Refreshing ${selectedAttack?.title ?? 'selected attack'} results…`
                : `Running ${selectedAttack?.title ?? 'selected attack'}…`}
            </span>
          </CardContent>
        </Card>
      ) : null}

      {mode === 'flow' ? (
        <Card className="border-neutral-200 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80">
          <CardHeader>
            <CardTitle>Defense flow</CardTitle>
            <CardDescription>
              Active blocked layer: {activeBlockedLayer ?? 'no block'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
              {flowStages.map((stage) => {
                const highlighted = activeBlockedLayer === stage;
                const isInputOrOutput = stage === 'Input' || stage === 'Output' || stage === 'LLM';
                return (
                  <div
                    key={stage}
                    className={cn(
                      'rounded-xl border px-4 py-5 text-center text-sm transition',
                      highlighted
                        ? 'border-red-500/40 bg-red-500/12 text-red-700 shadow-[0_0_0_1px_rgba(248,113,113,0.16)] dark:text-red-100'
                        : isInputOrOutput
                          ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-100'
                          : 'border-neutral-200 bg-white/70 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-300',
                    )}
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                      Stage
                    </div>
                    <div className="mt-2 font-semibold">{stage}</div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <span className="text-neutral-500 dark:text-neutral-500">Prompt:</span>{' '}
                {visibleData?.prompt ?? selectedAttack?.prompt}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {(visibleData?.variants ?? []).map((variant) => (
          <Card
            key={variant.id}
            className="border-neutral-200 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80"
          >
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>{variantTitle(variant)}</CardTitle>
                  <CardDescription>{variant.model}</CardDescription>
                </div>
                <Badge variant={variantBadge(variant)}>{variant.outcome}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/50">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-500">
                    Safety
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-neutral-100">
                    {formatSafetyScore(variant.safetyScore)}
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/50">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-500">
                    Latency
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-neutral-100">
                    {variant.latencyMs} ms
                  </p>
                </div>
              </div>

              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <span className="text-neutral-500 dark:text-neutral-500">Reason:</span>{' '}
                {variant.reason}
              </p>

              <div className="flex flex-wrap gap-2">
                {variant.blockedLayers.length > 0 ? (
                  variant.blockedLayers.map((layer) => (
                    <Badge key={`${variant.id}-${layer}`} variant="outline">
                      {layer}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="secondary">No blocked layers</Badge>
                )}
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 text-sm leading-6 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-neutral-300">
                {variant.response || 'No model output was generated for this variant.'}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!visibleData && !loading ? (
        <Card className="border-neutral-200 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-500">
              <Shield size={16} className="text-indigo-700 dark:text-indigo-300" />
              Run a compare request to populate the panels.
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
