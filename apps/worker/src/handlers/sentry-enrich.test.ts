// apps/worker/src/handlers/sentry-enrich.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'pg-boss';
import type { SentryEnrichJob } from './sentry-enrich';

vi.mock('../supabase', () => ({ createServiceRoleClient: vi.fn() }));
vi.mock('@sentry/node', () => ({
  startSpan: vi.fn((_o: unknown, fn: () => unknown) => fn()),
  captureException: vi.fn(),
}));

import { createServiceRoleClient } from '../supabase';
import * as Sentry from '@sentry/node';
import { handleSentryEnrich } from './sentry-enrich';

function makeJob(approval_id: string): Job<SentryEnrichJob> {
  return {
    id: `job-${approval_id}`,
    name: 'sentry.enrich',
    data: { approval_id },
  } as Job<SentryEnrichJob>;
}

describe('handleSentryEnrich', () => {
  let upsertMock: ReturnType<typeof vi.fn>;
  let fromMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    upsertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });

    vi.mocked(createServiceRoleClient).mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof createServiceRoleClient>);
  });

  it('calls upsert with correct approval_id and onConflict for a single job', async () => {
    await handleSentryEnrich([makeJob('approval-123')]);

    expect(fromMock).toHaveBeenCalledWith('sentry_context');
    expect(upsertMock).toHaveBeenCalledOnce();

    const [upsertData, upsertOpts] = upsertMock.mock.calls[0] as [Record<string, unknown>, { onConflict: string }];
    expect(upsertData.approval_id).toBe('approval-123');
    expect(upsertOpts).toEqual({ onConflict: 'approval_id' });
  });

  it('upsert payload includes similar_denials:[], seer_suggestion:null, and fetched_at as ISO string', async () => {
    const before = Date.now();
    await handleSentryEnrich([makeJob('approval-456')]);
    const after = Date.now();

    const [upsertData] = upsertMock.mock.calls[0] as [Record<string, unknown>];
    expect(upsertData.similar_denials).toEqual([]);
    expect(upsertData.seer_suggestion).toBeNull();

    const fetchedAt = upsertData.fetched_at as string;
    const fetchedAtMs = new Date(fetchedAt).getTime();
    expect(fetchedAtMs).toBeGreaterThanOrEqual(before);
    expect(fetchedAtMs).toBeLessThanOrEqual(after);
    // Verify it is a valid ISO string (contains 'T' and 'Z' or offset)
    expect(fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('opens exactly one Sentry span per job for a single job', async () => {
    await handleSentryEnrich([makeJob('approval-789')]);

    expect(Sentry.startSpan).toHaveBeenCalledOnce();
    const [spanOpts] = vi.mocked(Sentry.startSpan).mock.calls[0] as [{ op: string; name: string; attributes: Record<string, string> }, unknown];
    expect(spanOpts.op).toBe('aegis.job');
    expect(spanOpts.name).toBe('sentry.enrich');
  });

  it('opens 3 spans and calls upsert 3 times for a batch of 3 jobs', async () => {
    const jobs = [makeJob('a-1'), makeJob('a-2'), makeJob('a-3')];
    await handleSentryEnrich(jobs);

    expect(Sentry.startSpan).toHaveBeenCalledTimes(3);
    expect(upsertMock).toHaveBeenCalledTimes(3);

    const ids = upsertMock.mock.calls.map(([data]) => (data as Record<string, unknown>).approval_id);
    expect(ids).toEqual(['a-1', 'a-2', 'a-3']);
  });

  it('calls captureException with aegis.job.queue tag and rethrows when Supabase returns an error', async () => {
    const dbError = new Error('DB upsert failed');
    upsertMock.mockResolvedValue({ error: dbError });

    await expect(handleSentryEnrich([makeJob('approval-err')])).rejects.toThrow('DB upsert failed');

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    const [capturedErr, capturedOpts] = vi.mocked(Sentry.captureException).mock.calls[0] as [
      unknown,
      { tags: Record<string, string> },
    ];
    expect(capturedErr).toBe(dbError);
    expect(capturedOpts.tags['aegis.job.queue']).toBe('sentry.enrich');
  });
});
