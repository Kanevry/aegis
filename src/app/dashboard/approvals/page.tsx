import type { Approval, ApprovalStatus } from '@aegis/types';
import { cookies } from 'next/headers';
import { ApprovalCardFull } from '@/components/dashboard/approvals/approval-card-full';
import { EmptyState } from '@/components/dashboard/approvals/empty-state';
import { Badge } from '@/components/ui/badge';
import { listApprovals } from '@/lib/approvals';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = {
  status?: string;
  tool?: string;
  id?: string;
};

const STATUS_OPTIONS: Array<{ value: ApprovalStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'expired', label: 'Expired' },
];

function parseStatus(value: string | undefined): ApprovalStatus | 'all' {
  if (
    value === 'pending' ||
    value === 'approved' ||
    value === 'denied' ||
    value === 'expired' ||
    value === 'all'
  ) {
    return value;
  }
  return 'all';
}

function buildQuery(params: {
  status: ApprovalStatus | 'all';
  tool: string;
  id?: string | null;
}) {
  const next = new URLSearchParams();
  if (params.status !== 'all') {
    next.set('status', params.status);
  }
  if (params.tool) {
    next.set('tool', params.tool);
  }
  if (params.id) {
    next.set('id', params.id);
  }
  const qs = next.toString();
  return qs ? `/dashboard/approvals?${qs}` : '/dashboard/approvals';
}

function approvalPreview(approval: Approval) {
  const command = approval.args['command'];
  return typeof command === 'string' && command.trim() ? command : approval.tool;
}

function statusVariant(status: ApprovalStatus): 'default' | 'success' | 'destructive' | 'secondary' {
  switch (status) {
    case 'approved':
      return 'success';
    case 'denied':
      return 'destructive';
    case 'expired':
      return 'secondary';
    default:
      return 'default';
  }
}

async function loadApprovalsForViewer(
  searchParams: SearchParams,
): Promise<{
  approvals: Approval[];
  selectedApproval: Approval | null;
  status: ApprovalStatus | 'all';
  tool: string;
}> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claim = verifySession(cookieValue);

  const status = parseStatus(searchParams.status);
  const tool = searchParams.tool?.trim() ?? '';

  if (!claim.valid) {
    return { approvals: [], selectedApproval: null, status, tool };
  }

  const approvals = await listApprovals(claim.userId, {
    status,
    tool: tool || undefined,
    limit: 50,
  });

  const selectedApproval =
    approvals.find((approval) => approval.id === searchParams.id) ?? approvals[0] ?? null;

  return { approvals, selectedApproval, status, tool };
}

export default async function ApprovalsPage(
  props: { searchParams?: Promise<SearchParams> },
) {
  const searchParams = (await props.searchParams) ?? {};
  const { approvals, selectedApproval, status, tool } = await loadApprovalsForViewer(searchParams);

  return (
    <section className="flex h-full flex-col gap-4" aria-label="Approvals queue">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">Approvals</h1>
        <p className="text-xs text-neutral-500">Server-rendered queue</p>
      </header>

      <div className="grid flex-1 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80 md:grid-cols-[380px_1fr]">
        <div className="flex flex-col overflow-hidden border-b border-neutral-800 md:border-b-0 md:border-r md:border-neutral-800">
          <form
            action="/dashboard/approvals"
            method="get"
            className="flex flex-col gap-2 border-b border-neutral-800 p-3"
          >
            <select
              name="status"
              defaultValue={status}
              className="flex h-9 rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-1 text-sm text-neutral-100 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-neutral-900 text-neutral-100">
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="search"
              name="tool"
              defaultValue={tool}
              placeholder="Filter by tool..."
              className="flex h-9 rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-1 text-sm text-neutral-100 shadow-sm transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              aria-label="Filter by tool"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-200 transition hover:border-neutral-700 hover:text-white"
            >
              Apply filters
            </button>
          </form>

          <div className="flex-1 overflow-y-auto">
            {approvals.length === 0 ? (
              <EmptyState
                title={status === 'all' ? 'No approvals yet' : `No ${status} approvals`}
                description={
                  status === 'all'
                    ? 'When an agent action requires operator sign-off, it will appear here and remain visible after resolution.'
                    : `Try another status filter or wait for the next ${status} approval to arrive.`
                }
              />
            ) : (
              <ul className="flex flex-col gap-1 p-2">
                {approvals.map((approval) => {
                  const selected = selectedApproval?.id === approval.id;
                  return (
                    <li key={approval.id}>
                      <a
                        href={buildQuery({ status, tool, id: approval.id })}
                        className={[
                          'block rounded-lg border p-3 transition',
                          selected
                            ? 'border-indigo-500/60 bg-indigo-500/10'
                            : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-neutral-100">
                            {approval.tool}
                          </span>
                          <Badge variant={statusVariant(approval.status)}>{approval.status}</Badge>
                        </div>
                        <p className="mt-2 truncate font-mono text-xs text-neutral-400">
                          {approvalPreview(approval)}
                        </p>
                        <p className="mt-2 text-[11px] text-neutral-500">{approval.id}</p>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="overflow-y-auto">
          {selectedApproval ? (
            <ApprovalCardFull approval={selectedApproval} />
          ) : (
            <EmptyState
              title="Select an approval"
              description="Click a row in the queue to view the full details and take action."
            />
          )}
        </div>
      </div>
    </section>
  );
}
