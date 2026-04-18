import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('./pgboss-client', () => ({
  enqueue: vi.fn().mockResolvedValue('job-id'),
  QUEUES: {
    APPROVAL_EXPIRE: 'approval.expire',
    SENTRY_ENRICH: 'sentry.enrich',
    NOTIFICATION_DISPATCH: 'notification.dispatch',
    SESSION_CLEANUP: 'session.cleanup',
  },
}));

vi.mock('./supabase', () => ({
  createServiceRoleClient: vi.fn(),
}));

import {
  createApproval,
  getApproval,
  listPending,
  markDecided,
  expireIfPending,
  logAegisDecisionForApproval,
} from './approvals';
import { enqueue } from './pgboss-client';

// ── Helper: build a chainable Supabase mock ────────────────────────────────────

function makeSupabaseMock() {
  const chain: Record<string, unknown> & { _resolve: (v: unknown) => void } = {
    _resolve: () => {},
  } as never;

  // Every method returns chain for chaining; terminal methods are overridden per test.
  chain.from = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(async () => ({ data: null, error: null }));
  chain.eq = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.match = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.returns = vi.fn(async () => ({ data: [], error: null }));
  return chain;
}

// ── Fixtures ────────────────────────────────────────────────────────────────────

const APPROVAL_INPUT = {
  openclaw_approval_id: 'approval-uuid-001',
  session_id: 'session-uuid-001',
  tool: 'bash',
  args: { command: 'ls -la' },
  system_run_plan: { steps: ['ls'] },
};

const APPROVAL_ROW = {
  id: 'approval-uuid-001',
  session_id: 'session-uuid-001',
  tool: 'bash',
  args: { command: 'ls -la' },
  system_run_plan: { steps: ['ls'] },
  status: 'pending' as const,
  decided_by: null,
  decided_at: null,
  decision_scope: null,
  reason: null,
  sentry_issue_url: null,
  created_at: '2026-04-18T11:00:00.000Z',
};

// ── createApproval ──────────────────────────────────────────────────────────────

describe('createApproval', () => {
  beforeEach(() => {
    vi.mocked(enqueue).mockResolvedValue('job-id');
  });

  it('inserts row with status="pending" and correct columns', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: APPROVAL_ROW,
      error: null,
    });

    await createApproval(APPROVAL_INPUT, mock as never);

    expect(mock.from).toHaveBeenCalledWith('approvals');
    expect(mock.insert).toHaveBeenCalledWith({
      id: 'approval-uuid-001',
      session_id: 'session-uuid-001',
      tool: 'bash',
      args: { command: 'ls -la' },
      system_run_plan: { steps: ['ls'] },
      status: 'pending',
    });
  });

  it('returns the inserted Approval on success', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: APPROVAL_ROW,
      error: null,
    });

    const result = await createApproval(APPROVAL_INPUT, mock as never);

    expect(result.id).toBe('approval-uuid-001');
    expect(result.status).toBe('pending');
    expect(result.tool).toBe('bash');
  });

  it('throws when Supabase returns an error', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    });

    await expect(createApproval(APPROVAL_INPUT, mock as never)).rejects.toThrow(
      'createApproval failed: duplicate key value violates unique constraint',
    );
  });

  it('throws when Supabase returns no data and no error', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(createApproval(APPROVAL_INPUT, mock as never)).rejects.toThrow(
      'createApproval returned no data',
    );
  });

  it('calls enqueue(APPROVAL_EXPIRE, { id }, { startAfter: 900 }) after insert', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: APPROVAL_ROW,
      error: null,
    });

    await createApproval(APPROVAL_INPUT, mock as never);

    expect(enqueue).toHaveBeenCalledWith(
      'approval.expire',
      { id: 'approval-uuid-001' },
      { startAfter: 900 },
    );
  });

  it('does NOT throw if enqueue fails (best-effort schedule)', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: APPROVAL_ROW,
      error: null,
    });
    vi.mocked(enqueue).mockRejectedValueOnce(new Error('pg-boss unavailable'));

    // Must resolve with the row despite enqueue failure
    const result = await createApproval(APPROVAL_INPUT, mock as never);
    expect(result.id).toBe('approval-uuid-001');
  });
});

// ── getApproval ─────────────────────────────────────────────────────────────────

describe('getApproval', () => {
  it('returns the Approval when row exists', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: APPROVAL_ROW,
      error: null,
    });

    const result = await getApproval('approval-uuid-001', mock as never);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('approval-uuid-001');
    expect(result?.status).toBe('pending');
  });

  it('returns null on PGRST116 (not-found) error', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });

    const result = await getApproval('nonexistent-id', mock as never);

    expect(result).toBeNull();
  });

  it('throws on other Supabase errors', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'relation "approvals" does not exist' },
    });

    await expect(getApproval('some-id', mock as never)).rejects.toThrow(
      'getApproval failed: relation "approvals" does not exist',
    );
  });

  it('queries by id and selects all columns', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: APPROVAL_ROW,
      error: null,
    });

    await getApproval('approval-uuid-001', mock as never);

    expect(mock.from).toHaveBeenCalledWith('approvals');
    expect(mock.select).toHaveBeenCalledWith('*');
    expect(mock.eq).toHaveBeenCalledWith('id', 'approval-uuid-001');
  });
});

// ── listPending ─────────────────────────────────────────────────────────────────

describe('listPending', () => {
  it('filters by user_id via sessions!inner join and status="pending"', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [APPROVAL_ROW],
      error: null,
    });

    await listPending('user-001', {}, mock as never);

    expect(mock.from).toHaveBeenCalledWith('approvals');
    expect(mock.select).toHaveBeenCalledWith('*, sessions!inner(user_id)');
    expect(mock.eq).toHaveBeenCalledWith('status', 'pending');
    expect(mock.eq).toHaveBeenCalledWith('sessions.user_id', 'user-001');
  });

  it('applies tool filter when provided', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: null,
    });

    await listPending('user-001', { tool: 'bash' }, mock as never);

    expect(mock.eq).toHaveBeenCalledWith('tool', 'bash');
  });

  it('applies since filter using .gte("created_at", iso) when provided', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: null,
    });
    const since = new Date('2026-04-18T10:00:00.000Z');

    await listPending('user-001', { since }, mock as never);

    expect(mock.gte).toHaveBeenCalledWith('created_at', '2026-04-18T10:00:00.000Z');
  });

  it('applies limit when provided', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: null,
    });

    await listPending('user-001', { limit: 5 }, mock as never);

    expect(mock.limit).toHaveBeenCalledWith(5);
  });

  it('returns array of approvals on success', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [APPROVAL_ROW],
      error: null,
    });

    const result = await listPending('user-001', {}, mock as never);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('approval-uuid-001');
  });

  it('returns empty array when no pending approvals exist', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await listPending('user-001', {}, mock as never);

    expect(result).toEqual([]);
  });

  it('throws when Supabase returns an error', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });

    await expect(listPending('user-001', {}, mock as never)).rejects.toThrow(
      'listPending failed: connection refused',
    );
  });
});

// ── markDecided ─────────────────────────────────────────────────────────────────

describe('markDecided', () => {
  it('maps decision="allow-once" to status="approved"', async () => {
    const mock = makeSupabaseMock();
    const approvedRow = { ...APPROVAL_ROW, status: 'approved' as const };
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: approvedRow,
      error: null,
    });

    const result = await markDecided(
      { id: 'approval-uuid-001', decision: 'allow-once', decided_by: 'ui' },
      mock as never,
    );

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    );
    expect(result.status).toBe('approved');
  });

  it('maps decision="deny-once" to status="denied"', async () => {
    const mock = makeSupabaseMock();
    const deniedRow = { ...APPROVAL_ROW, status: 'denied' as const };
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: deniedRow,
      error: null,
    });

    const result = await markDecided(
      { id: 'approval-uuid-001', decision: 'deny-once', decided_by: 'cli' },
      mock as never,
    );

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'denied' }),
    );
    expect(result.status).toBe('denied');
  });

  it('sets decision_scope to the decision value', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ...APPROVAL_ROW, status: 'approved' as const },
      error: null,
    });

    await markDecided(
      { id: 'approval-uuid-001', decision: 'allow-always', decided_by: 'auto' },
      mock as never,
    );

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ decision_scope: 'allow-always' }),
    );
  });

  it('sets decided_by and reason in the update payload', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ...APPROVAL_ROW, status: 'denied' as const },
      error: null,
    });

    await markDecided(
      { id: 'approval-uuid-001', decision: 'deny-once', decided_by: 'discord', reason: 'dangerous command' },
      mock as never,
    );

    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ decided_by: 'discord', reason: 'dangerous command' }),
    );
  });

  it('guards update with .eq("status", "pending")', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ...APPROVAL_ROW, status: 'approved' as const },
      error: null,
    });

    await markDecided(
      { id: 'approval-uuid-001', decision: 'allow-once', decided_by: 'ui' },
      mock as never,
    );

    expect(mock.eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('throws when Supabase returns an error', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'update failed' },
    });

    await expect(
      markDecided(
        { id: 'approval-uuid-001', decision: 'allow-once', decided_by: 'ui' },
        mock as never,
      ),
    ).rejects.toThrow('markDecided failed: update failed');
  });

  it('throws when Supabase returns no data (already decided guard)', async () => {
    const mock = makeSupabaseMock();
    (mock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(
      markDecided(
        { id: 'approval-uuid-001', decision: 'allow-once', decided_by: 'ui' },
        mock as never,
      ),
    ).rejects.toThrow('markDecided returned no data');
  });
});

// ── expireIfPending ─────────────────────────────────────────────────────────────

describe('expireIfPending', () => {
  it('returns "expired" when update affected one row', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ status: 'expired' }],
      error: null,
    });

    const result = await expireIfPending('approval-uuid-001', mock as never);

    expect(result).toBe('expired');
  });

  it('returns "already_decided" when update returned empty data array', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await expireIfPending('approval-uuid-001', mock as never);

    expect(result).toBe('already_decided');
  });

  it('returns "already_decided" when data is null', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await expireIfPending('approval-uuid-001', mock as never);

    expect(result).toBe('already_decided');
  });

  it('throws on Supabase error', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });

    await expect(expireIfPending('approval-uuid-001', mock as never)).rejects.toThrow(
      'expireIfPending failed: permission denied',
    );
  });

  it('is idempotent: second call returns "already_decided" after first expires', async () => {
    const firstMock = makeSupabaseMock();
    (firstMock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ status: 'expired' }],
      error: null,
    });
    const first = await expireIfPending('approval-uuid-001', firstMock as never);
    expect(first).toBe('expired');

    const secondMock = makeSupabaseMock();
    (secondMock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: null,
    });
    const second = await expireIfPending('approval-uuid-001', secondMock as never);
    expect(second).toBe('already_decided');
  });

  it('guards update with .eq("status", "pending")', async () => {
    const mock = makeSupabaseMock();
    (mock.returns as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ status: 'expired' }],
      error: null,
    });

    await expireIfPending('approval-uuid-001', mock as never);

    expect(mock.eq).toHaveBeenCalledWith('status', 'pending');
    expect(mock.eq).toHaveBeenCalledWith('id', 'approval-uuid-001');
  });
});

// ── logAegisDecisionForApproval ─────────────────────────────────────────────────

describe('logAegisDecisionForApproval', () => {
  it('inserts N rows when blockedLayers has N entries', async () => {
    const mock = makeSupabaseMock();
    (mock.insert as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    await logAegisDecisionForApproval(
      'approval-uuid-001',
      { safetyScore: 0.3, blockedLayers: ['B1', 'B4'], allowed: false },
      mock as never,
    );

    expect(mock.from).toHaveBeenCalledWith('aegis_decisions');
    const insertCall = (mock.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as unknown[];
    expect(insertCall).toHaveLength(2);
  });

  it('writes 0 rows (no DB call) when blockedLayers is empty', async () => {
    const mock = makeSupabaseMock();

    await logAegisDecisionForApproval(
      'approval-uuid-001',
      { safetyScore: 1.0, blockedLayers: [], allowed: true },
      mock as never,
    );

    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('sets outcome="warn" when result.allowed=true', async () => {
    const mock = makeSupabaseMock();
    (mock.insert as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    await logAegisDecisionForApproval(
      'approval-uuid-001',
      { safetyScore: 0.7, blockedLayers: ['B2'], allowed: true },
      mock as never,
    );

    const rows = (mock.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ outcome: string }>;
    expect(rows[0].outcome).toBe('warn');
  });

  it('sets outcome="blocked" when result.allowed=false', async () => {
    const mock = makeSupabaseMock();
    (mock.insert as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    await logAegisDecisionForApproval(
      'approval-uuid-001',
      { safetyScore: 0.1, blockedLayers: ['B4'], allowed: false },
      mock as never,
    );

    const rows = (mock.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ outcome: string }>;
    expect(rows[0].outcome).toBe('blocked');
  });

  it('populates safety_score and details fields in each row', async () => {
    const mock = makeSupabaseMock();
    (mock.insert as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });

    await logAegisDecisionForApproval(
      'approval-uuid-001',
      { safetyScore: 0.42, blockedLayers: ['B1', 'B5'], allowed: false },
      mock as never,
    );

    const rows = (mock.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{
      approval_id: string;
      layer: string;
      safety_score: number;
      details: Record<string, unknown>;
    }>;
    expect(rows[0].approval_id).toBe('approval-uuid-001');
    expect(rows[0].layer).toBe('B1');
    expect(rows[0].safety_score).toBe(0.42);
    expect(rows[0].details).toEqual({});
    expect(rows[1].layer).toBe('B5');
    expect(rows[1].safety_score).toBe(0.42);
  });

  it('throws when Supabase insert returns an error', async () => {
    const mock = makeSupabaseMock();
    (mock.insert as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'insert failed: table not found' },
    });

    await expect(
      logAegisDecisionForApproval(
        'approval-uuid-001',
        { safetyScore: 0.5, blockedLayers: ['B3'], allowed: false },
        mock as never,
      ),
    ).rejects.toThrow('logAegisDecisionForApproval failed: insert failed: table not found');
  });
});
