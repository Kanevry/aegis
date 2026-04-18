'use client';

import * as React from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react';
import { ATTACK_LIBRARY } from '@/lib/attacks';
import type { CompareBatchResponse, CompareMatrixRow } from '@/lib/compare';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const defenseLayers = ['B1', 'B2', 'B3', 'B4', 'B5'] as const;

function outcomeVariant(passed: boolean | null) {
  if (passed === true) return 'success' as const;
  if (passed === false) return 'destructive' as const;
  return 'secondary' as const;
}

function compareLayer(row: CompareMatrixRow, layer: string) {
  const hardeningOn = row.variants.find((variant) => variant.hardening);
  const expected = row.expectedBlockedLayers.includes(layer);
  const actual = hardeningOn?.blockedLayers.includes(layer) ?? false;

  if (!expected && !actual) return null;
  return expected === actual;
}

type EvalMatrixProps = {
  initialRows: CompareMatrixRow[];
};

export function EvalMatrix({ initialRows }: EvalMatrixProps) {
  const [rows, setRows] = React.useState<CompareMatrixRow[]>(initialRows);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadMatrix = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attackIds: ATTACK_LIBRARY.map((attack) => attack.id) }),
      });

      const payload = (await response.json()) as CompareBatchResponse | { error?: string };
      if (!response.ok || !('mode' in payload) || payload.mode !== 'batch') {
        throw new Error('error' in payload && payload.error ? payload.error : 'Matrix request failed');
      }

      setRows(payload.rows);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unexpected matrix request failure',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-neutral-950 dark:text-neutral-100">
            Eval matrix
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-500">
            Green means the live hardening result matched the seeded attack expectation.
          </p>
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <Button type="button" variant="outline" onClick={() => void loadMatrix()} disabled={loading}>
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          {loading ? 'Refreshing…' : 'Refresh matrix'}
        </Button>
      </div>

      <Card className="border-neutral-200 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80">
        <CardHeader>
          <CardTitle>Pass / Fail matrix</CardTitle>
          <CardDescription>
            Columns B1–B5 validate the blocking layer. The final two columns show hardening-on and
            hardening-off outcomes from the compare endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attack</TableHead>
                {defenseLayers.map((layer) => (
                  <TableHead key={layer}>{layer}</TableHead>
                ))}
                <TableHead>Hardening on</TableHead>
                <TableHead>Hardening off</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const hardeningOn = row.variants.find((variant) => variant.hardening);
                const hardeningOff = row.variants.find((variant) => !variant.hardening);

                return (
                  <TableRow key={row.attackId}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-neutral-950 dark:text-neutral-100">
                          {row.title}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{row.category}</Badge>
                          <span className="text-xs text-neutral-500 dark:text-neutral-500">
                            {row.attackId}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {defenseLayers.map((layer) => {
                      const passed = compareLayer(row, layer);
                      return (
                        <TableCell key={`${row.attackId}-${layer}`}>
                          <Badge variant={outcomeVariant(passed)}>
                            {passed === true ? 'Pass' : passed === false ? 'Fail' : '—'}
                          </Badge>
                        </TableCell>
                      );
                    })}

                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        {hardeningOn?.outcome === 'blocked' ? (
                          <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-300" />
                        ) : (
                          <ShieldX size={14} className="text-red-600 dark:text-red-300" />
                        )}
                        <span>{hardeningOn?.outcome ?? 'pending'}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        <ShieldCheck size={14} className="text-indigo-600 dark:text-indigo-300" />
                        <span>{hardeningOff?.outcome ?? 'pending'}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
