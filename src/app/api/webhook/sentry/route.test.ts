import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function request(body: string) {
  return new NextRequest('http://localhost/api/webhook/sentry', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body,
  });
}

describe('POST /api/webhook/sentry', () => {
  const originalError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('accepts valid webhook payloads', async () => {
    const response = await POST(request(JSON.stringify({ event: 'issue' })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'received' });
    expect(console.error).toHaveBeenCalledWith(
      '[SENTRY WEBHOOK]',
      expect.objectContaining({
        body: { event: 'issue' },
      }),
    );
  });

  it('returns 400 for invalid JSON', async () => {
    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid request' });
    expect(console.error).toHaveBeenCalledWith('[SENTRY WEBHOOK ERROR]', expect.anything());
  });
});
