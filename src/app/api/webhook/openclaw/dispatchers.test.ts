// dispatchers.test.ts — dedupe + 5-event dispatch paths

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabaseInsert: vi.fn(),
  createApproval: vi.fn(),
  markDecided: vi.fn(),
  enqueue: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({
    from: () => ({ insert: mocks.supabaseInsert }),
  }),
}));

vi.mock('@/lib/approvals', () => ({
  createApproval: mocks.createApproval,
  markDecided: mocks.markDecided,
}));

vi.mock('@/lib/pgboss-client', () => ({
  enqueue: mocks.enqueue,
  QUEUES: {
    APPROVAL_EXPIRE: 'approval.expire',
    SENTRY_ENRICH: 'sentry.enrich',
    NOTIFICATION_DISPATCH: 'notification.dispatch',
    SESSION_CLEANUP: 'session.cleanup',
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  addBreadcrumb: mocks.addBreadcrumb,
}));

import { dispatchEvent } from './dispatchers';
import type { OpenclawEventPayload } from './schema';

describe('dispatchEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supabaseInsert.mockResolvedValue({ error: null });
    mocks.createApproval.mockResolvedValue({ id: 'apr-1' });
    mocks.markDecided.mockResolvedValue({ id: 'apr-1' });
    mocks.enqueue.mockResolvedValue('job-id');
  });

  describe('dedupe', () => {
    it('returns deduped:true when Postgres unique_violation (23505) fires', async () => {
      mocks.supabaseInsert.mockResolvedValueOnce({
        error: { code: '23505', message: 'duplicate' },
      });
      const event: OpenclawEventPayload = {
        type: 'exec.running',
        event_id: 'evt-1',
        run_id: 'run-1',
        tool: 'bash',
      };
      const result = await dispatchEvent(event);
      expect(result.deduped).toBe(true);
      expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'aegis.webhook', message: 'deduped' }),
      );
    });

    it('re-throws non-unique-violation Supabase errors', async () => {
      mocks.supabaseInsert.mockResolvedValueOnce({
        error: { code: '42P01', message: 'table missing' },
      });
      const event: OpenclawEventPayload = {
        type: 'exec.running',
        event_id: 'evt-2',
        run_id: 'run-2',
        tool: 'bash',
      };
      await expect(dispatchEvent(event)).rejects.toMatchObject({ code: '42P01' });
    });

    it('proceeds to dispatch when insert succeeds', async () => {
      const event: OpenclawEventPayload = {
        type: 'exec.running',
        event_id: 'evt-3',
        run_id: 'run-3',
        tool: 'bash',
      };
      const result = await dispatchEvent(event);
      expect(result.deduped).toBe(false);
    });
  });

  describe('exec.approval.requested', () => {
    const event: OpenclawEventPayload = {
      type: 'exec.approval.requested',
      event_id: 'evt-4',
      approval_id: 'apr-4',
      tool: 'bash',
      args: { cmd: 'ls' },
    };

    it('creates approval and enqueues sentry.enrich + notification.dispatch', async () => {
      await dispatchEvent(event);
      expect(mocks.createApproval).toHaveBeenCalledWith({
        openclaw_approval_id: 'apr-4',
        session_id: null,
        tool: 'bash',
        args: { cmd: 'ls' },
        system_run_plan: null,
      });
      expect(mocks.enqueue).toHaveBeenCalledWith('sentry.enrich', {
        approval_id: 'apr-4',
      });
      expect(mocks.enqueue).toHaveBeenCalledWith('notification.dispatch', {
        channel: 'discord',
        template: 'approval_requested',
        payload: { approval_id: 'apr-4', tool: 'bash' },
      });
    });

    it('does NOT double-enqueue approval.expire (createApproval owns the TTL)', async () => {
      await dispatchEvent(event);
      const expireCalls = mocks.enqueue.mock.calls.filter(
        ([queue]) => queue === 'approval.expire',
      );
      expect(expireCalls).toHaveLength(0);
    });
  });

  describe('exec.approval.resolved', () => {
    it('calls markDecided + notification + captures exception on deny', async () => {
      const event: OpenclawEventPayload = {
        type: 'exec.approval.resolved',
        event_id: 'evt-5',
        approval_id: 'apr-5',
        decision: 'deny-once',
        decided_by: 'ui',
      };
      await dispatchEvent(event);
      expect(mocks.markDecided).toHaveBeenCalledWith({
        id: 'apr-5',
        decision: 'deny-once',
        decided_by: 'ui',
        reason: undefined,
      });
      expect(mocks.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          fingerprint: ['aegis-approval-deny', 'deny-once'],
        }),
      );
    });

    it('does NOT capture exception on allow decisions', async () => {
      const event: OpenclawEventPayload = {
        type: 'exec.approval.resolved',
        event_id: 'evt-6',
        approval_id: 'apr-6',
        decision: 'allow-once',
      };
      await dispatchEvent(event);
      expect(mocks.captureException).not.toHaveBeenCalled();
    });
  });

  describe('exec.running', () => {
    it('adds Sentry breadcrumb', async () => {
      const event: OpenclawEventPayload = {
        type: 'exec.running',
        event_id: 'evt-7',
        run_id: 'run-7',
        tool: 'exec',
      };
      await dispatchEvent(event);
      expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'aegis.exec',
          message: 'exec.running',
          data: { run_id: 'run-7', tool: 'exec' },
        }),
      );
    });
  });

  describe('exec.finished', () => {
    it('writes aegis_decisions row with outcome=ok on exit_code 0', async () => {
      const event: OpenclawEventPayload = {
        type: 'exec.finished',
        event_id: 'evt-8',
        run_id: 'run-8',
        exit_code: 0,
      };
      await dispatchEvent(event);
      // First insert was for openclaw_events dedupe, second is aegis_decisions
      expect(mocks.supabaseInsert).toHaveBeenCalledTimes(2);
      expect(mocks.supabaseInsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          approval_id: 'run-8',
          layer: 'B5',
          outcome: 'ok',
          details: expect.objectContaining({ sub_layer: 'B6', exit_code: 0 }),
        }),
      );
    });

    it('writes outcome=blocked on non-zero exit_code', async () => {
      const event: OpenclawEventPayload = {
        type: 'exec.finished',
        event_id: 'evt-9',
        run_id: 'run-9',
        exit_code: 1,
      };
      await dispatchEvent(event);
      expect(mocks.supabaseInsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ outcome: 'blocked' }),
      );
    });

    it('throws when aegis_decisions insert fails (no silent swallow)', async () => {
      // First call (dedupe): succeed. Second call (aegis_decisions): error.
      mocks.supabaseInsert
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: { code: '23514', message: 'CHECK violation' } });
      const event: OpenclawEventPayload = {
        type: 'exec.finished',
        event_id: 'evt-10',
        run_id: 'run-10',
        exit_code: 0,
      };
      await expect(dispatchEvent(event)).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('exec.denied', () => {
    it('writes aegis_decisions row with outcome=blocked + reason in details', async () => {
      const event: OpenclawEventPayload = {
        type: 'exec.denied',
        event_id: 'evt-11',
        run_id: 'run-11',
        reason: 'policy violation',
      };
      await dispatchEvent(event);
      expect(mocks.supabaseInsert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          approval_id: 'run-11',
          layer: 'B5',
          outcome: 'blocked',
          details: expect.objectContaining({ sub_layer: 'B6', reason: 'policy violation' }),
        }),
      );
      expect(mocks.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'aegis.exec', level: 'warning' }),
      );
    });

    it('throws when aegis_decisions insert fails (no silent swallow)', async () => {
      mocks.supabaseInsert
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: { code: '42P01' } });
      const event: OpenclawEventPayload = {
        type: 'exec.denied',
        event_id: 'evt-12',
        run_id: 'run-12',
        reason: 'blocked',
      };
      await expect(dispatchEvent(event)).rejects.toMatchObject({ code: '42P01' });
    });
  });
});
