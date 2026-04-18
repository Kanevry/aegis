import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetAttackById } = vi.hoisted(() => ({
  mockGetAttackById: vi.fn(),
}));

vi.mock('@/lib/attacks', () => ({
  ATTACK_LIBRARY: [
    { id: 'attack-1' },
    { id: 'attack-2' },
  ],
  getAttackById: mockGetAttackById,
}));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/testbed/fire', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/testbed/fire', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetAttackById.mockReset();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns 400 for invalid bodies', async () => {
    const response = await POST(request({ provider: 'openai' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_body',
    });
  });

  it('returns 404 when the attack does not exist', async () => {
    mockGetAttackById.mockReturnValue(undefined);

    const response = await POST(
      request({
        attackId: 'missing',
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'unknown_attack',
      attackId: 'missing',
      availableAttackIds: ['attack-1', 'attack-2'],
    });
  });

  it('merges a successful downstream JSON response into the envelope', async () => {
    mockGetAttackById.mockReturnValue({
      id: 'attack-1',
      prompt: 'malicious prompt',
    });
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ safetyScore: 0.2, reason: 'blocked' }), {
        status: 403,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );

    const response = await POST(
      request({
        attackId: 'attack-1',
        provider: 'anthropic',
      }),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      new URL('/api/agent/run', 'http://localhost/api/testbed/fire'),
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      attackId: 'attack-1',
      prompt: 'malicious prompt',
      provider: 'anthropic',
      safetyScore: 0.2,
      reason: 'blocked',
      ok: false,
      status: 403,
    });
  });

  it('preserves non-JSON downstream bodies as text', async () => {
    mockGetAttackById.mockReturnValue({
      id: 'attack-2',
      prompt: 'plain text prompt',
    });
    vi.mocked(global.fetch).mockResolvedValue(
      new Response('plain text failure', {
        status: 500,
      }),
    );

    const response = await POST(
      request({
        attackId: 'attack-2',
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      attackId: 'attack-2',
      prompt: 'plain text prompt',
      provider: 'openai',
      text: 'plain text failure',
      ok: false,
      status: 500,
    });
  });

  it('returns 502 when the downstream request throws', async () => {
    mockGetAttackById.mockReturnValue({
      id: 'attack-2',
      prompt: 'plain text prompt',
    });
    vi.mocked(global.fetch).mockRejectedValue(new Error('network down'));

    const response = await POST(
      request({
        attackId: 'attack-2',
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      attackId: 'attack-2',
      prompt: 'plain text prompt',
      provider: 'openai',
      ok: false,
      status: 502,
      error: 'downstream_request_failed',
    });
  });
});
