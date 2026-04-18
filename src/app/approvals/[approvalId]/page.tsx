import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveApprovalAction } from "../actions";
import {
  ensureOpenclawRuntimeBridgeStarted,
  expireRuntimeApprovalIfNeeded,
  getRuntimeApproval,
} from "@/lib/openclaw-runtime";

export const runtime = "nodejs";

function formatTimestamp(ms: number) {
  return new Date(ms).toLocaleString();
}

function DecisionButton(props: {
  approvalId: string;
  decision: "allow-once" | "allow-always" | "deny";
  children: ReactNode;
  className: string;
}) {
  return (
    <form action={resolveApprovalAction}>
      <input type="hidden" name="approvalId" value={props.approvalId} />
      <input type="hidden" name="decision" value={props.decision} />
      <button className={props.className} type="submit">
        {props.children}
      </button>
    </form>
  );
}

export default async function ApprovalDetailPage(
  props: { params: Promise<{ approvalId: string }> },
) {
  try {
    await ensureOpenclawRuntimeBridgeStarted();
  } catch {
    // The detail view still works from mirrored state while the bridge reconnects.
  }
  const { approvalId } = await props.params;
  await expireRuntimeApprovalIfNeeded(approvalId);
  const approval = await getRuntimeApproval(approvalId);

  if (!approval) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-400">
              Approval Detail
            </p>
            <h1 className="mt-2 text-2xl font-semibold">OpenClaw Exec Approval</h1>
          </div>
          <Link
            href="/approvals"
            className="rounded border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-700 hover:text-white"
          >
            Back to queue
          </Link>
        </div>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-300">
              {approval.status}
            </span>
            <span className="text-xs text-neutral-500">{approval.approvalId}</span>
          </div>

          <div className="mt-5 rounded-2xl bg-neutral-950/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Command</p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-sm text-neutral-100">
              {approval.commandText}
            </pre>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-800 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Context</p>
              <dl className="mt-3 space-y-2 text-neutral-300">
                <div className="flex justify-between gap-4">
                  <dt>Agent</dt>
                  <dd>{approval.agentId ?? "unknown"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Host</dt>
                  <dd>{approval.host ?? "gateway"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>CWD</dt>
                  <dd className="truncate">{approval.cwd ?? "unknown"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Session</dt>
                  <dd className="truncate">{approval.sessionKey ?? "unknown"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Created</dt>
                  <dd>{formatTimestamp(approval.createdAtMs)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Expires</dt>
                  <dd>{formatTimestamp(approval.expiresAtMs)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-neutral-800 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Decision</p>
              {approval.status === "pending" ? (
                <div className="mt-4 grid gap-3">
                  <DecisionButton
                    approvalId={approval.approvalId}
                    decision="allow-once"
                    className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400"
                  >
                    Allow once
                  </DecisionButton>
                  <DecisionButton
                    approvalId={approval.approvalId}
                    decision="allow-always"
                    className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-medium text-cyan-950 transition hover:bg-cyan-400"
                  >
                    Allow always
                  </DecisionButton>
                  <DecisionButton
                    approvalId={approval.approvalId}
                    decision="deny"
                    className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-medium text-rose-950 transition hover:bg-rose-400"
                  >
                    Deny
                  </DecisionButton>
                </div>
              ) : (
                <div className="mt-4 space-y-2 text-neutral-300">
                  <p>Decision: {approval.decision ?? "none"}</p>
                  <p>Resolved by: {approval.resolvedBy ?? "unknown"}</p>
                  <p>Resolved at: {approval.resolvedAtMs ? formatTimestamp(approval.resolvedAtMs) : "unknown"}</p>
                  <p>Source: {approval.source ?? "unknown"}</p>
                </div>
              )}

              {approval.lastBridgeError ? (
                <p className="mt-4 rounded-xl border border-amber-700/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Last bridge error: {approval.lastBridgeError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-neutral-800 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
              Mirrored payload
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-neutral-300">
              {JSON.stringify(approval, null, 2)}
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}
