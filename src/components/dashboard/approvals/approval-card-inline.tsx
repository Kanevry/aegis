'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Approval, ApprovalDecision } from '@aegis/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { throwIfError } from '@/lib/api-client';
import { ApprovalSafetyBadge } from './approval-safety-badge';
import { ApprovalCardFull } from './approval-card-full';

export interface ApprovalCardInlineProps {
  approval: Approval;
  safetyScore?: number;
  /** Visual selection highlight — used by queue list to show the active item. */
  selected?: boolean;
  onDecided?: (decision: string) => void;
  onOpenFull?: () => void;
}

function argsPreview(args: Record<string, unknown>): string {
  try {
    const keys = Object.keys(args);
    if (keys.length === 0) return '{}';
    // Show first key-value pair as a short preview
    const first = keys[0]!;
    const val = args[first];
    const valStr =
      typeof val === 'string'
        ? val.length > 40
          ? `"${val.slice(0, 37)}…"`
          : `"${val}"`
        : JSON.stringify(val);
    const more = keys.length > 1 ? ` +${keys.length - 1} more` : '';
    return `{ ${first}: ${valStr}${more} }`;
  } catch {
    return '{ … }';
  }
}

export function ApprovalCardInline({
  approval,
  safetyScore,
  selected = false,
  onDecided,
  onOpenFull,
}: ApprovalCardInlineProps) {
  const [fullOpen, setFullOpen] = React.useState(false);
  const [loading, setLoading] = React.useState<ApprovalDecision | null>(null);
  const [inlineError, setInlineError] = React.useState<string | null>(null);

  const isResolved =
    approval.status === 'approved' ||
    approval.status === 'denied' ||
    approval.status === 'expired';

  async function handleQuickDecide(
    e: React.MouseEvent,
    decision: ApprovalDecision,
  ) {
    e.stopPropagation();
    if (loading || isResolved) return;
    setInlineError(null);
    setLoading(decision);

    try {
      const res = await fetch(`/api/approvals/${approval.id}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });

      await throwIfError(res);
      toast.success(`Decision recorded: ${decision}`);
      onDecided?.(decision);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to record decision.';
      setInlineError(message);
      toast.error(message);
    } finally {
      setLoading(null);
    }
  }

  function handleOpenFull() {
    setFullOpen(true);
    onOpenFull?.();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpenFull();
    }
  }

  function handleDecided(decision: string) {
    setFullOpen(false);
    onDecided?.(decision);
  }

  return (
    <>
      <Card
        className={cn(
          'transition-colors',
          selected
            ? 'border-indigo-500/50 bg-indigo-500/10'
            : 'border-neutral-800 bg-neutral-900/80 hover:border-neutral-700',
        )}
      >
        <CardContent className="p-0">
          {/* Clickable main row */}
          <div
            role="button"
            tabIndex={0}
            aria-label={`Open approval details for ${approval.tool}`}
            onClick={handleOpenFull}
            onKeyDown={handleKeyDown}
            className="flex min-h-[100px] cursor-pointer items-center gap-4 rounded-t-lg px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
          >
            {/* Tool name + args preview */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-neutral-100">
                  {approval.tool}
                </span>
                <ApprovalSafetyBadge safetyScore={safetyScore} />
                <Badge
                  variant={
                    approval.status === 'pending'
                      ? 'default'
                      : approval.status === 'approved'
                        ? 'success'
                        : approval.status === 'denied'
                          ? 'destructive'
                          : 'secondary'
                  }
                >
                  {approval.status}
                </Badge>
              </div>
              <p className="truncate font-mono text-xs text-neutral-500" title={JSON.stringify(approval.args)}>
                {argsPreview(approval.args)}
              </p>
              {inlineError ? (
                <p role="alert" className="text-xs text-red-400">
                  {inlineError}
                </p>
              ) : null}
            </div>

            {/* Quick action buttons + chevron */}
            <div className="flex shrink-0 items-center gap-2">
              {!isResolved ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={loading !== null}
                    aria-label="Allow once"
                    onClick={(e) => void handleQuickDecide(e, 'allow-once')}
                  >
                    {loading === 'allow-once' ? '…' : 'Allow'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={loading !== null}
                    aria-label="Deny once"
                    onClick={(e) => void handleQuickDecide(e, 'deny-once')}
                  >
                    {loading === 'deny-once' ? '…' : 'Deny'}
                  </Button>
                </>
              ) : null}

              <ChevronRight
                size={16}
                className="text-neutral-500"
                aria-hidden="true"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full approval dialog — opened when row is clicked */}
      <ApprovalCardFull
        approval={approval}
        safetyScore={safetyScore}
        open={fullOpen}
        onOpenChange={setFullOpen}
        onDecided={handleDecided}
      />
    </>
  );
}
