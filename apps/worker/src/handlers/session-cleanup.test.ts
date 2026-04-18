// apps/worker/src/handlers/session-cleanup.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'pg-boss';
import type { SessionCleanupJob } from './session-cleanup';

vi.mock('../supabase', () => ({ createServiceRoleClient: vi.fn() }));
vi.mock('@sentry/node', () => ({
  startSpan: vi.fn((_o: unknown, fn: () => unknown) => fn()),
  captureException: vi.fn(),
}));

import { createServiceRoleClient } from '../supabase';
import * as Sentry from '@sentry/node';
import { handleSessionCleanup } from './session-cleanup';

function makeJobs(n = 1): Job<SessionCleanupJob>[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `job-cleanup-${i}`,
    name: 'session.cleanup',
    data: {},
  } as Job<SessionCleanupJob>));
}

describe('handleSessionCleanup', () => {
  let ltMock: ReturnType<typeof vi.fn>;
  let deleteMock: ReturnType<typeof vi.fn>;
  let fromMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    ltMock = vi.fn().mockResolvedValue({ error: null, count: 3 });
    deleteMock = vi.fn().mockReturnValue({ lt: ltMock });
    fromMock = vi.fn().mockReturnValue({ delete: deleteMock });

    vi.mocked(createServiceRoleClient).mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof createServiceRoleClient>);
  });

  it('calls .from("sessions").delete({count:"exact"}).lt("created_at", cutoff) with cutoff ~7 days ago', async () => {
    const beforeMs = Date.now();
    await handleSessionCleanup(makeJobs());
    const afterMs = Date.now();

    expect(fromMock).toHaveBeenCalledWith('sessions');
    expect(deleteMock).toHaveBeenCalledWith({ count: 'exact' });
    expect(ltMock).toHaveBeenCalledOnce();

    const [field, cutoffIso] = ltMock.mock.calls[0] as [string, string];
    expect(field).toBe('created_at');

    const cutoffMs = new Date(cutoffIso).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    // cutoff should be within 1 second of (now - 7 days)
    expect(cutoffMs).toBeGreaterThanOrEqual(beforeMs - sevenDaysMs - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(afterMs - sevenDaysMs + 1000);
  });

  it('resolves without throwing on success', async () => {
    await expect(handleSessionCleanup(makeJobs())).resolves.toBeUndefined();
  });

  it('logs deleted count=0 without throwing when no sessions are deleted', async () => {
    ltMock.mockResolvedValue({ error: null, count: 0 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(handleSessionCleanup(makeJobs())).resolves.toBeUndefined();

    const doneCalls = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('session.cleanup done'),
    );
    expect(doneCalls.length).toBeGreaterThan(0);
    const doneArg = doneCalls[0]![1] as { deleted: number };
    expect(doneArg.deleted).toBe(0);

    warnSpy.mockRestore();
  });

  it('logs deleted count=N without throwing when N sessions are deleted', async () => {
    ltMock.mockResolvedValue({ error: null, count: 42 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(handleSessionCleanup(makeJobs())).resolves.toBeUndefined();

    const doneCalls = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('session.cleanup done'),
    );
    expect(doneCalls.length).toBeGreaterThan(0);
    const doneArg = doneCalls[0]![1] as { deleted: number };
    expect(doneArg.deleted).toBe(42);

    warnSpy.mockRestore();
  });

  it('calls captureException with aegis.job.queue tag and rethrows when Supabase returns an error', async () => {
    const dbError = new Error('sessions delete failed');
    ltMock.mockResolvedValue({ error: dbError, count: null });

    await expect(handleSessionCleanup(makeJobs())).rejects.toThrow('sessions delete failed');

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    const [capturedErr, capturedOpts] = vi.mocked(Sentry.captureException).mock.calls[0] as [
      unknown,
      { tags: Record<string, string> },
    ];
    expect(capturedErr).toBe(dbError);
    expect(capturedOpts.tags['aegis.job.queue']).toBe('session.cleanup');
  });
});
