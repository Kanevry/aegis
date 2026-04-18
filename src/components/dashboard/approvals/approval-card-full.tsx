'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Shield, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Approval, ApprovalDecision } from '@aegis/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { throwIfError } from '@/lib/api-client';
import { ApprovalArgsDiff } from './approval-args-diff';
import { ApprovalSafetyBadge } from './approval-safety-badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalCardFullProps =
  | {
      /** Direct approval object — used when the parent already has the data. */
      approval: Approval;
      approvalId?: never;
      safetyScore?: number;
      seerContext?: React.ReactNode;
      onDecided?: (decision: string) => void;
      /** When provided, wraps the card in a Dialog sheet. */
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }
  | {
      /** Fetch-by-id mode — used when only the ID is known (e.g. approvals-shell). */
      approvalId: string;
      approval?: never;
      safetyScore?: number;
      seerContext?: React.ReactNode;
      onDecided?: (decision: string) => void;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    };

// ---------------------------------------------------------------------------
// Decision buttons config
// ---------------------------------------------------------------------------

type DecisionConfig = {
  value: ApprovalDecision;
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  isDeny: boolean;
};

const DECISIONS: DecisionConfig[] = [
  { value: 'allow-once', label: 'Allow once', variant: 'default', isDeny: false },
  { value: 'allow-always', label: 'Allow always', variant: 'secondary', isDeny: false },
  { value: 'deny-once', label: 'Deny once', variant: 'outline', isDeny: true },
  { value: 'deny-always', label: 'Deny always', variant: 'destructive', isDeny: true },
];

// ---------------------------------------------------------------------------
// Inner content (shared between standalone and dialog modes)
// ---------------------------------------------------------------------------

interface ApprovalCardFullContentProps {
  approval: Approval;
  safetyScore?: number;
  seerContext?: React.ReactNode;
  onDecided?: (decision: string) => void;
  onClose?: () => void;
}

export function ApprovalCardFullContent({
  approval,
  safetyScore,
  seerContext,
  onDecided,
  onClose,
}: ApprovalCardFullContentProps) {
  const [pendingDecision, setPendingDecision] = React.useState<ApprovalDecision | null>(null);
  const [rejectionMessage, setRejectionMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [inlineError, setInlineError] = React.useState<string | null>(null);

  const isDenySelected =
    pendingDecision === 'deny-once' || pendingDecision === 'deny-always';

  const isResolved =
    approval.status === 'approved' || approval.status === 'denied' || approval.status === 'expired';

  async function submitDecision(decision: ApprovalDecision) {
    if (loading) return;
    setInlineError(null);

    const isDeny = decision === 'deny-once' || decision === 'deny-always';

    // For deny, require the user to click twice (first sets pendingDecision, second submits)
    if (isDeny && pendingDecision !== decision) {
      setPendingDecision(decision);
      return;
    }

    setLoading(true);
    try {
      const body: { decision: ApprovalDecision; rejectionMessage?: string } = { decision };
      if (isDeny && rejectionMessage.trim()) {
        body.rejectionMessage = rejectionMessage.trim();
      }

      const res = await fetch(`/api/approvals/${approval.id}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      await throwIfError(res);

      const label = DECISIONS.find((d) => d.value === decision)?.label ?? decision;
      toast.success(`Decision recorded: ${label}`);
      onDecided?.(decision);
      onClose?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to record decision. Please try again.';
      setInlineError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="flex flex-col gap-0">
      {/* Header */}
      <DialogHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
              <Shield size={16} aria-hidden="true" />
            </span>
            <div>
              <DialogTitle>Approval Request</DialogTitle>
              <p className="mt-0.5 font-mono text-xs text-neutral-500">{approval.id}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {approval.tool}
            </Badge>
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
        </div>

        {onClose ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </DialogHeader>

      <Separator />

      <div className="space-y-5 p-6">
        {/* Args */}
        <section aria-labelledby="args-heading">
          <h3 id="args-heading" className="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-500">
            Arguments
          </h3>
          <ApprovalArgsDiff args={approval.args} />
        </section>

        {/* System run plan */}
        {approval.system_run_plan ? (
          <section aria-labelledby="plan-heading">
            <h3 id="plan-heading" className="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-500">
              System Run Plan
            </h3>
            <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs leading-6 text-neutral-300">
              {typeof approval.system_run_plan === 'string'
                ? approval.system_run_plan
                : JSON.stringify(approval.system_run_plan, null, 2)}
            </pre>
          </section>
        ) : null}

        {/* Seer context slot */}
        {seerContext ? (
          <section aria-labelledby="seer-heading">
            <h3 id="seer-heading" className="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-500">
              Seer Context
            </h3>
            {seerContext}
          </section>
        ) : null}

        {/* Sentry issue link */}
        {approval.sentry_issue_url ? (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>Sentry:</span>
            <a
              href={approval.sentry_issue_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 underline underline-offset-4 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              View issue
            </a>
          </div>
        ) : null}

        <Separator />

        {/* Inline error */}
        {inlineError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{inlineError}</span>
          </div>
        ) : null}

        {/* Decision row */}
        {isResolved ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            <CheckCircle2 size={15} aria-hidden="true" />
            <span>This request has already been {approval.status}.</span>
          </div>
        ) : (
          <>
            {/* Rejection textarea — shown when a deny option is selected */}
            {isDenySelected ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="rejection-message"
                  className="text-xs font-medium text-neutral-400"
                >
                  Rejection reason{' '}
                  <span className="text-neutral-600">(optional, max 2000 chars)</span>
                </label>
                <textarea
                  id="rejection-message"
                  rows={3}
                  maxLength={2000}
                  value={rejectionMessage}
                  onChange={(e) => setRejectionMessage(e.target.value)}
                  placeholder="Explain why this action is being denied…"
                  className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
                />
              </div>
            ) : null}

            {/* Decision buttons */}
            <div
              role="group"
              aria-label="Approval decision"
              className="flex flex-wrap items-center gap-2"
            >
              {DECISIONS.map((d) => (
                <Button
                  key={d.value}
                  type="button"
                  variant={d.variant}
                  size="sm"
                  disabled={loading}
                  aria-pressed={pendingDecision === d.value}
                  onClick={() => void submitDecision(d.value)}
                >
                  {loading && pendingDecision === d.value ? 'Saving…' : d.label}
                </Button>
              ))}
            </div>

            {isDenySelected ? (
              <p className="text-xs text-neutral-500">
                Click the deny button again to confirm.
              </p>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ApprovalCardFull — optional dialog wrapper
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Self-fetching wrapper for approvalId mode
// ---------------------------------------------------------------------------

function ApprovalCardFullFetcher({
  approvalId,
  ...rest
}: Omit<Extract<ApprovalCardFullProps, { approvalId: string }>, 'approval'> & {
  onClose?: () => void;
}) {
  const [approval, setApproval] = React.useState<Approval | null>(null);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on approvalId change before async fetch
    setApproval(null);
    setFetchError(null);
    let cancelled = false;

    fetch(`/api/approvals/${approvalId}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { ok: boolean; data: Approval };
        if (!body.ok) throw new Error('API returned ok: false');
        if (!cancelled) setApproval(body.data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setFetchError(err instanceof Error ? err.message : 'Failed to load approval');
      });

    return () => {
      cancelled = true;
    };
  }, [approvalId]);

  if (fetchError) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-red-400">
        <AlertCircle size={15} aria-hidden="true" />
        <span>{fetchError}</span>
      </div>
    );
  }

  if (!approval) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  return (
    <ApprovalCardFullContent
      approval={approval}
      safetyScore={rest.safetyScore}
      seerContext={rest.seerContext}
      onDecided={rest.onDecided}
      onClose={rest.onClose}
    />
  );
}

// ---------------------------------------------------------------------------
// ApprovalCardFull — optional dialog wrapper
// ---------------------------------------------------------------------------

export function ApprovalCardFull(props: ApprovalCardFullProps) {
  const { open, onOpenChange } = props;

  // If open/onOpenChange are provided, wrap in dialog
  if (open !== undefined && onOpenChange !== undefined) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-labelledby="approval-dialog-title">
          {'approvalId' in props && props.approvalId ? (
            <ApprovalCardFullFetcher
              approvalId={props.approvalId}
              safetyScore={props.safetyScore}
              seerContext={props.seerContext}
              onDecided={props.onDecided}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <ApprovalCardFullContent
              approval={props.approval!}
              safetyScore={props.safetyScore}
              seerContext={props.seerContext}
              onDecided={props.onDecided}
              onClose={() => onOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // Standalone (embedded in page)
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900">
      {'approvalId' in props && props.approvalId ? (
        <ApprovalCardFullFetcher
          approvalId={props.approvalId}
          safetyScore={props.safetyScore}
          seerContext={props.seerContext}
          onDecided={props.onDecided}
        />
      ) : (
        <ApprovalCardFullContent
          approval={props.approval!}
          safetyScore={props.safetyScore}
          seerContext={props.seerContext}
          onDecided={props.onDecided}
        />
      )}
    </div>
  );
}
