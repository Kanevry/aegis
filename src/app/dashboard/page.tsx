'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface MetricsSnapshot {
  firedCount: number;
  blockedCount: number;
  avgSafetyScore: number | null;
  mostBlockedLayer: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | null;
  layerBreakdown: Record<'B1' | 'B2' | 'B3' | 'B4' | 'B5', number>;
  lastUpdatedAt: string;
  source: 'db' | 'unavailable';
}

const POLL_INTERVAL_MS = 5_000;

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  return `${diffH}h ago`;
}

export default function DashboardOverviewPage() {
  const [snapshot, setSnapshot] = React.useState<MetricsSnapshot | null>(null);
  const [fetchErrored, setFetchErrored] = React.useState(false);

  const fetchMetrics = React.useCallback(async () => {
    try {
      const res = await fetch('/api/metrics', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MetricsSnapshot;
      setSnapshot(data);
      setFetchErrored(false);
    } catch (err) {
      console.warn('[overview] fetch failed', err);
      setFetchErrored(true);
      // keep last-known snapshot — do not clear it
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: immediate fetch on mount before first interval tick
    void fetchMetrics();
    const interval = setInterval(() => {
      void fetchMetrics();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const hasData = snapshot !== null && snapshot.firedCount > 0 && snapshot.source !== 'unavailable';
  const dotActive = snapshot !== null && !fetchErrored && snapshot.source !== 'unavailable';

  function renderValue(slot: 'fired' | 'blocked' | 'avgScore' | 'layer'): React.ReactNode {
    if (snapshot === null && !fetchErrored) {
      return <Skeleton className="h-9 w-20" />;
    }
    if (!hasData) return '—';
    switch (slot) {
      case 'fired':
        return snapshot.firedCount.toString();
      case 'blocked':
        return snapshot.blockedCount.toString();
      case 'avgScore':
        return Number.isFinite(snapshot.avgSafetyScore)
          ? (snapshot.avgSafetyScore as number).toFixed(2)
          : '—';
      case 'layer':
        return snapshot.mostBlockedLayer ?? '—';
    }
  }

  const statCards: { title: string; slot: 'fired' | 'blocked' | 'avgScore' | 'layer'; description: string }[] = [
    { title: 'Attacks fired', slot: 'fired', description: 'Total requests sent through the testbed' },
    { title: 'Blocked', slot: 'blocked', description: 'Requests blocked by at least one hardening layer' },
    { title: 'Avg safety score', slot: 'avgScore', description: 'Mean safety score across all evaluated requests' },
    { title: 'Most-blocked layer', slot: 'layer', description: 'The defense layer that fires most frequently' },
  ];

  const subCopy = (() => {
    if (snapshot === null) return 'Loading metrics…';
    if (snapshot.source === 'unavailable') {
      return 'Metrics storage unavailable — aegis_decisions table not reachable. Check Supabase connection + apply migrations.';
    }
    if (snapshot.firedCount === 0) {
      return 'Live data arrives when /api/agent/run receives its first request.';
    }
    return `Live from Postgres · last update ${relativeTime(snapshot.lastUpdatedAt)}`;
  })();

  return (
    <section>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-neutral-100">Overview</h1>
          <span
            className={[
              'inline-block h-2 w-2 rounded-full',
              dotActive ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600',
            ].join(' ')}
            aria-hidden="true"
          />
        </div>
        <p className="mt-1 text-sm text-neutral-500">{subCopy}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-neutral-100">{renderValue(card.slot)}</p>
              <p className="mt-1 text-xs text-neutral-500">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
