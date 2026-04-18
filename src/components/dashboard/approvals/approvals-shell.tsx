'use client';

import * as React from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import type { Approval } from '@aegis/types';
import { Queue } from './queue';
import { QueueFilters, type ApprovalStatus } from './queue-filters';
import { EmptyState } from './empty-state';
import { ApprovalCardFull } from '@/components/dashboard/approvals/approval-card-full';

export function ApprovalsShell() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const id = searchParams.get('id');
  const status = (searchParams.get('status') ?? 'pending') as ApprovalStatus;
  const tool = searchParams.get('tool') ?? '';

  // Selected approval — populated when the user clicks a row so we don't need
  // a separate fetch for the detail pane (the queue already holds the data).
  const [selectedApproval, setSelectedApproval] = React.useState<Approval | null>(null);

  // Increment to force queue to re-fetch immediately after a decision is made.
  const [refreshKey, setRefreshKey] = React.useState(0);

  const pushParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const qs = next.toString();
      const href = `${pathname}${qs ? `?${qs}` : ''}`;
      // window.history + next/navigation's useSearchParams picks up the change
      window.history.pushState({}, '', href);
      // Force a re-render so useSearchParams reflects the new URL
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    [searchParams, pathname],
  );

  const handleSelect = React.useCallback(
    (approval: Approval) => {
      setSelectedApproval(approval);
      pushParams({ id: approval.id });
    },
    [pushParams],
  );

  const handleStatusChange = React.useCallback(
    (nextStatus: ApprovalStatus) => {
      setSelectedApproval(null);
      pushParams({ status: nextStatus === 'pending' ? null : nextStatus, id: null });
    },
    [pushParams],
  );

  const handleToolChange = React.useCallback(
    (nextTool: string) => {
      setSelectedApproval(null);
      pushParams({ tool: nextTool || null, id: null });
    },
    [pushParams],
  );

  const handleDecided = React.useCallback(() => {
    setRefreshKey((k) => k + 1);
    setSelectedApproval(null);
  }, []);

  const filters = React.useMemo(() => ({ status, tool }), [status, tool]);

  // Determine what to show in the detail pane
  const detailApproval = selectedApproval?.id === id ? selectedApproval : null;

  return (
    <section className="flex h-full flex-col gap-4" aria-label="Approvals queue">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">Approvals</h1>
        <p className="text-xs text-neutral-500">Auto-refreshes every 15 seconds</p>
      </header>

      <div className="grid flex-1 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80 md:grid-cols-[380px_1fr]">
        {/* Left pane: queue list */}
        <div className="flex flex-col overflow-hidden border-b border-neutral-800 md:border-b-0 md:border-r md:border-neutral-800">
          <QueueFilters
            status={status}
            tool={tool}
            onStatusChange={handleStatusChange}
            onToolChange={handleToolChange}
          />
          <div className="flex-1 overflow-y-auto">
            <Queue filters={filters} selectedId={id} onSelect={handleSelect} refreshKey={refreshKey} />
          </div>
        </div>

        {/* Right pane: detail */}
        <div className="overflow-y-auto">
          {detailApproval ? (
            <ApprovalCardFull approval={detailApproval} onDecided={handleDecided} />
          ) : (
            <EmptyState
              title={id ? 'Loading approval…' : 'Select an approval'}
              description={
                id
                  ? 'Click a row to reload the selection.'
                  : 'Click a row in the queue to view the full details and take action.'
              }
            />
          )}
        </div>
      </div>
    </section>
  );
}
