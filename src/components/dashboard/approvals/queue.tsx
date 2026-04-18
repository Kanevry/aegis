'use client';

import * as React from 'react';
import type { Approval } from '@aegis/types';
import type { ApprovalStatus } from './queue-filters';
import { ApprovalCardInline } from '@/components/dashboard/approvals/approval-card-inline';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from './empty-state';

export interface QueueFilters {
  status: ApprovalStatus;
  tool: string;
}

export interface QueueProps {
  filters: QueueFilters;
  selectedId: string | null;
  onSelect: (approval: Approval) => void;
  /** Increment to force an immediate re-fetch outside the polling interval. */
  refreshKey?: number;
}

const POLL_INTERVAL_MS = 15_000;

async function fetchApprovals(filters: QueueFilters): Promise<Approval[]> {
  const params = new URLSearchParams();
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.tool) params.set('tool', filters.tool);
  params.set('limit', '50');

  const res = await fetch(`/api/approvals?${params.toString()}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch approvals: ${res.status}`);
  }

  const body = (await res.json()) as { ok: boolean; data: Approval[] };
  if (!body.ok) throw new Error('API returned ok: false');
  return body.data;
}

export function Queue({ filters, selectedId, onSelect, refreshKey }: QueueProps) {
  const [approvals, setApprovals] = React.useState<Approval[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await fetchApprovals(filters);
      setApprovals(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Initial load + polling every 15s; also re-fetches when refreshKey increments.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading indicator before async fetch
    setLoading(true);
    void load();

    const interval = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-3" role="status" aria-label="Loading approvals">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center" role="alert">
        <p className="text-sm text-red-400">Failed to load approvals</p>
        <p className="text-xs text-neutral-500">{error}</p>
        <button
          onClick={() => { setLoading(true); void load(); }}
          className="mt-2 text-xs text-indigo-400 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  if (approvals.length === 0) {
    return <EmptyState />;
  }

  return (
    <ul
      className="flex flex-col gap-1 p-2"
      role="listbox"
      aria-label="Approvals queue"
      aria-multiselectable="false"
    >
      {approvals.map((approval) => (
        <li
          key={approval.id}
          role="option"
          aria-selected={approval.id === selectedId}
          className={[
            'cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
            approval.id === selectedId ? 'ring-2 ring-indigo-500' : '',
          ].join(' ')}
          onClick={() => onSelect(approval)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(approval);
            }
          }}
          tabIndex={0}
        >
          <ApprovalCardInline approval={approval} />
        </li>
      ))}
    </ul>
  );
}
