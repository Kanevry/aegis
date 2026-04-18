import Link from "next/link";
import type { Route } from "next";
import {
  ensureOpenclawRuntimeBridgeStarted,
  expirePendingRuntimeApprovals,
  listRuntimeApprovals,
} from "@/lib/openclaw-runtime";

export const runtime = "nodejs";

function formatTimestamp(ms: number) {
  return new Date(ms).toLocaleString();
}

export default async function ApprovalsPage() {
  try {
    await ensureOpenclawRuntimeBridgeStarted();
  } catch {
    // The page still renders from mirrored state while the live bridge reconnects.
  }
  await expirePendingRuntimeApprovals();
  const items = await listRuntimeApprovals();

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-400">
              OpenClaw Runtime
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Approval Queue</h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              Pending OpenClaw exec approvals mirrored into Ægis. Resolve here and Ægis
              sends the decision back to the original OpenClaw approval.
            </p>
          </div>
          <Link
            href="/"
            className="rounded border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-700 hover:text-white"
          >
            Back to Ægis
          </Link>
        </div>

        <div className="grid gap-4">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/70 p-6 text-sm text-neutral-400">
              No mirrored OpenClaw approvals yet. POST a request to
              <code className="ml-1 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200">
                /api/runtime/openclaw/approval-requests
              </code>
              or trigger one from the gateway once the bridge worker is active.
            </div>
          ) : (
            items.map((item) => (
              <Link
                key={item.approvalId}
                href={item.uiUrl as Route<string>}
                className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5 transition hover:border-neutral-700 hover:bg-neutral-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-300">
                        {item.status}
                      </span>
                      <span className="text-xs text-neutral-500">{item.approvalId}</span>
                    </div>
                    <p className="mt-3 font-mono text-sm text-neutral-100">
                      {item.commandPreview || item.commandText}
                    </p>
                  </div>
                  <div className="text-right text-xs text-neutral-500">
                    <p>Created: {formatTimestamp(item.createdAtMs)}</p>
                    <p>Expires: {formatTimestamp(item.expiresAtMs)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-xs text-neutral-400 md:grid-cols-3">
                  <p>Agent: {item.agentId ?? "unknown"}</p>
                  <p>Host: {item.host ?? "gateway"}</p>
                  <p>CWD: {item.cwd ?? "unknown"}</p>
                </div>

                {item.lastBridgeError ? (
                  <p className="mt-4 rounded-xl border border-amber-700/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Last bridge error: {item.lastBridgeError}
                  </p>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
