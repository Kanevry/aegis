// apps/worker/src/handlers/notification-dispatch.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'pg-boss';
import type { NotificationDispatchJob } from './notification-dispatch';

vi.mock('@sentry/node', () => ({
  startSpan: vi.fn((_o: unknown, fn: () => unknown) => fn()),
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/node';
import { handleNotificationDispatch } from './notification-dispatch';

function makeJob(data: NotificationDispatchJob): Job<NotificationDispatchJob> {
  return {
    id: 'job-notif',
    name: 'notification.dispatch',
    data,
  } as Job<NotificationDispatchJob>;
}

const WEBHOOK_URL = 'https://discord.com/api/webhooks/test/token';

describe('handleNotificationDispatch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env['DISCORD_WEBHOOK_URL'];
  });

  it('does not call fetch and does not throw when DISCORD_WEBHOOK_URL is missing', async () => {
    delete process.env['DISCORD_WEBHOOK_URL'];

    const job = makeJob({
      channel: 'discord',
      template: 'approval_requested',
      payload: { approval_id: 'ap-1', tool: 'bash' },
    });

    await expect(handleNotificationDispatch([job])).resolves.toBeUndefined();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('calls fetch with POST to webhook URL and content containing the tool name for approval_requested', async () => {
    process.env['DISCORD_WEBHOOK_URL'] = WEBHOOK_URL;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    const job = makeJob({
      channel: 'discord',
      template: 'approval_requested',
      payload: { approval_id: 'ap-2', tool: 'read_file' },
    });

    await handleNotificationDispatch([job]);

    expect(global.fetch).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(WEBHOOK_URL);
    expect(calledInit.method).toBe('POST');

    const body = JSON.parse(calledInit.body as string) as { content: string };
    expect(body.content).toContain('read_file');
  });

  it('calls fetch with content containing the decision value for approval_resolved', async () => {
    process.env['DISCORD_WEBHOOK_URL'] = WEBHOOK_URL;
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as Response);

    const job = makeJob({
      channel: 'discord',
      template: 'approval_resolved',
      payload: { approval_id: 'ap-3', decision: 'approved' },
    });

    await handleNotificationDispatch([job]);

    const [, calledInit] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledInit.body as string) as { content: string };
    expect(body.content).toContain('approved');
  });

  it('calls fetch with content containing "expired" and the approval_id for expired template', async () => {
    process.env['DISCORD_WEBHOOK_URL'] = WEBHOOK_URL;
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as Response);

    const job = makeJob({
      channel: 'discord',
      template: 'expired',
      payload: { approval_id: 'ap-4' },
    });

    await handleNotificationDispatch([job]);

    const [, calledInit] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledInit.body as string) as { content: string };
    expect(body.content).toContain('expired');
    expect(body.content).toContain('ap-4');
  });

  it('calls captureException and rethrows when fetch returns a non-ok response', async () => {
    process.env['DISCORD_WEBHOOK_URL'] = WEBHOOK_URL;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const job = makeJob({
      channel: 'discord',
      template: 'approval_requested',
      payload: { approval_id: 'ap-5', tool: 'bash' },
    });

    await expect(handleNotificationDispatch([job])).rejects.toThrow('Discord webhook 500');

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    const [, capturedOpts] = vi.mocked(Sentry.captureException).mock.calls[0] as [
      unknown,
      { tags: Record<string, string> },
    ];
    expect(capturedOpts.tags['aegis.job.queue']).toBe('notification.dispatch');
  });

  it('calls captureException and rethrows when fetch throws a network error', async () => {
    process.env['DISCORD_WEBHOOK_URL'] = WEBHOOK_URL;
    const networkError = new Error('Network failure');
    vi.mocked(global.fetch).mockRejectedValue(networkError);

    const job = makeJob({
      channel: 'discord',
      template: 'approval_requested',
      payload: { approval_id: 'ap-6', tool: 'write_file' },
    });

    await expect(handleNotificationDispatch([job])).rejects.toThrow('Network failure');

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    const [capturedErr] = vi.mocked(Sentry.captureException).mock.calls[0] as [unknown];
    expect(capturedErr).toBe(networkError);
  });

  it('calls fetch once per job for a batch of 5 jobs', async () => {
    process.env['DISCORD_WEBHOOK_URL'] = WEBHOOK_URL;
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as Response);

    const jobs = Array.from({ length: 5 }, (_, i) =>
      makeJob({
        channel: 'discord',
        template: 'approval_requested',
        payload: { approval_id: `ap-batch-${i}`, tool: 'tool-x' },
      }),
    );

    await handleNotificationDispatch(jobs);

    expect(global.fetch).toHaveBeenCalledTimes(5);
  });
});
