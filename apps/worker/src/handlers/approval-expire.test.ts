import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'pg-boss';
import type { ApprovalExpireJob } from './approval-expire';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted (vi.mock is hoisted by Vitest automatically)
// ---------------------------------------------------------------------------

vi.mock('../supabase', () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock('pg-boss', () => ({
  default: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  startSpan: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers to resolve the mocked modules after hoisting
// ---------------------------------------------------------------------------

async function getSupabaseMock() {
  const mod = await import('../supabase');
  return mod.createServiceRoleClient as ReturnType<typeof vi.fn>;
}

async function getSentryMock() {
  const sentry = await import('@sentry/node');
  return {
    startSpan: sentry.startSpan as ReturnType<typeof vi.fn>,
    captureException: sentry.captureException as ReturnType<typeof vi.fn>,
  };
}

async function getPgBossMock() {
  const mod = await import('pg-boss');
  return mod.default as unknown as ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Supabase chainable builder
// ---------------------------------------------------------------------------

function buildSupabaseChain(result: { data: { id: string }[] | null; error: unknown }) {
  const chain = {
    from: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Job factory
// ---------------------------------------------------------------------------

function makeJob(approvalId: string, index = 0): Job<ApprovalExpireJob> {
  return {
    id: `job-${index}`,
    name: 'approval.expire',
    data: { id: approvalId },
  } as unknown as Job<ApprovalExpireJob>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleApprovalExpire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('expired path — Supabase update returns 1 row', () => {
    it('calls startSpan with op=aegis.job and name=approval.expire', async () => {
      const supabaseClient = buildSupabaseChain({ data: [{ id: 'approval-A' }], error: null });
      const createServiceRoleClient = await getSupabaseMock();
      createServiceRoleClient.mockReturnValue(supabaseClient);

      const PgBoss = await getPgBossMock();
      const bossInstance = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue('msg-id'),
        stop: vi.fn().mockResolvedValue(undefined),
      };
      PgBoss.mockImplementation(() => bossInstance);

      const { handleApprovalExpire } = await import('./approval-expire');
      const { startSpan } = await getSentryMock();

      await handleApprovalExpire([makeJob('approval-A', 0)]);

      expect(startSpan).toHaveBeenCalledTimes(1);
      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'aegis.job', name: 'approval.expire' }),
        expect.any(Function),
      );
    });

    it('sends notification.dispatch with template=expired and correct approval_id', async () => {
      const supabaseClient = buildSupabaseChain({ data: [{ id: 'approval-B' }], error: null });
      const createServiceRoleClient = await getSupabaseMock();
      createServiceRoleClient.mockReturnValue(supabaseClient);

      const PgBoss = await getPgBossMock();
      const bossInstance = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue('msg-id'),
        stop: vi.fn().mockResolvedValue(undefined),
      };
      PgBoss.mockImplementation(() => bossInstance);

      const { handleApprovalExpire } = await import('./approval-expire');

      await handleApprovalExpire([makeJob('approval-B', 1)]);

      expect(bossInstance.send).toHaveBeenCalledTimes(1);
      expect(bossInstance.send).toHaveBeenCalledWith('notification.dispatch', {
        channel: 'discord',
        template: 'expired',
        payload: { approval_id: 'approval-B' },
      });
    });
  });

  describe('already_decided path — Supabase update returns empty array', () => {
    it('does not call pg-boss send when no rows are returned', async () => {
      const supabaseClient = buildSupabaseChain({ data: [], error: null });
      const createServiceRoleClient = await getSupabaseMock();
      createServiceRoleClient.mockReturnValue(supabaseClient);

      const PgBoss = await getPgBossMock();
      const bossInstance = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue('msg-id'),
        stop: vi.fn().mockResolvedValue(undefined),
      };
      PgBoss.mockImplementation(() => bossInstance);

      const { handleApprovalExpire } = await import('./approval-expire');

      await handleApprovalExpire([makeJob('approval-C', 2)]);

      expect(bossInstance.send).not.toHaveBeenCalled();
    });

    it('resolves without error when approval is already decided', async () => {
      const supabaseClient = buildSupabaseChain({ data: [], error: null });
      const createServiceRoleClient = await getSupabaseMock();
      createServiceRoleClient.mockReturnValue(supabaseClient);

      const PgBoss = await getPgBossMock();
      PgBoss.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue('msg-id'),
        stop: vi.fn().mockResolvedValue(undefined),
      }));

      const { handleApprovalExpire } = await import('./approval-expire');
      const { captureException } = await getSentryMock();

      await expect(handleApprovalExpire([makeJob('approval-C', 3)])).resolves.toBeUndefined();
      expect(captureException).not.toHaveBeenCalled();
    });
  });

  describe('multi-job batch', () => {
    it('opens one Sentry span per job when processing 3 jobs', async () => {
      const createServiceRoleClient = await getSupabaseMock();
      createServiceRoleClient.mockImplementation(() =>
        buildSupabaseChain({ data: [{ id: 'row' }], error: null }),
      );

      const PgBoss = await getPgBossMock();
      PgBoss.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue('msg-id'),
        stop: vi.fn().mockResolvedValue(undefined),
      }));

      const { handleApprovalExpire } = await import('./approval-expire');
      const { startSpan } = await getSentryMock();

      await handleApprovalExpire([
        makeJob('approval-D', 4),
        makeJob('approval-E', 5),
        makeJob('approval-F', 6),
      ]);

      expect(startSpan).toHaveBeenCalledTimes(3);
    });
  });

  describe('Supabase error path', () => {
    it('calls captureException with tag aegis.job.queue=approval.expire and rethrows', async () => {
      const dbError = new Error('supabase connection failure');
      const supabaseClient = buildSupabaseChain({ data: null, error: dbError });
      const createServiceRoleClient = await getSupabaseMock();
      createServiceRoleClient.mockReturnValue(supabaseClient);

      const PgBoss = await getPgBossMock();
      PgBoss.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue('msg-id'),
        stop: vi.fn().mockResolvedValue(undefined),
      }));

      const { handleApprovalExpire } = await import('./approval-expire');
      const { captureException } = await getSentryMock();

      await expect(handleApprovalExpire([makeJob('approval-G', 7)])).rejects.toThrow(
        'supabase connection failure',
      );

      expect(captureException).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledWith(
        dbError,
        expect.objectContaining({
          tags: { 'aegis.job.queue': 'approval.expire' },
        }),
      );
    });
  });

  describe('pg-boss send error path', () => {
    it('calls captureException and rethrows when boss.send rejects', async () => {
      const supabaseClient = buildSupabaseChain({ data: [{ id: 'approval-H' }], error: null });
      const createServiceRoleClient = await getSupabaseMock();
      createServiceRoleClient.mockReturnValue(supabaseClient);

      const sendError = new Error('pg-boss send failed');
      const PgBoss = await getPgBossMock();
      PgBoss.mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockRejectedValue(sendError),
        stop: vi.fn().mockResolvedValue(undefined),
      }));

      const { handleApprovalExpire } = await import('./approval-expire');
      const { captureException } = await getSentryMock();

      await expect(handleApprovalExpire([makeJob('approval-H', 8)])).rejects.toThrow(
        'pg-boss send failed',
      );

      expect(captureException).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledWith(
        sendError,
        expect.objectContaining({
          tags: { 'aegis.job.queue': 'approval.expire' },
        }),
      );
    });
  });

  describe('id pass-through', () => {
    it('sends approval_id in notification payload that exactly matches job.data.id', async () => {
      const targetId = 'approval-unique-99';
      const supabaseClient = buildSupabaseChain({ data: [{ id: targetId }], error: null });
      const createServiceRoleClient = await getSupabaseMock();
      createServiceRoleClient.mockReturnValue(supabaseClient);

      const PgBoss = await getPgBossMock();
      const bossInstance = {
        start: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue('msg-id'),
        stop: vi.fn().mockResolvedValue(undefined),
      };
      PgBoss.mockImplementation(() => bossInstance);

      const { handleApprovalExpire } = await import('./approval-expire');

      await handleApprovalExpire([makeJob(targetId, 9)]);

      const [, payload] = bossInstance.send.mock.calls[0] as [string, { payload: { approval_id: string } }];
      expect(payload.payload.approval_id).toBe('approval-unique-99');
    });
  });
});
