import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBuildBatchComparison, mockBuildSingleComparison } = vi.hoisted(() => ({
  mockBuildBatchComparison: vi.fn(),
  mockBuildSingleComparison: vi.fn(),
}));

vi.mock('@/lib/attacks', () => ({
  ATTACK_LIBRARY: [
    { id: 'attack-1' },
    { id: 'attack-2' },
  ],
}));

vi.mock('@/lib/compare-service', () => ({
  buildBatchComparison: mockBuildBatchComparison,
  buildSingleComparison: mockBuildSingleComparison,
}));

import { POST } from './route';

function request(body: unknown) {
  return new Request('http://localhost/api/compare', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/compare', () => {
  beforeEach(() => {
    mockBuildBatchComparison.mockReset();
    mockBuildSingleComparison.mockReset();
  });

  it('returns 400 when compare mode is ambiguous', async () => {
    const response = await POST(
      request({
        attackId: 'attack-1',
        prompt: 'custom prompt',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_body',
    });
  });

  it('returns a batch response for known attack ids', async () => {
    mockBuildBatchComparison.mockReturnValue({
      mode: 'batch',
      rows: [{ attackId: 'attack-1' }],
    });

    const response = await POST(
      request({
        attackIds: ['attack-1'],
      }),
    );

    expect(mockBuildBatchComparison).toHaveBeenCalledWith(['attack-1']);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mode: 'batch',
      rows: [{ attackId: 'attack-1' }],
    });
  });

  it('returns 404 for unknown batch attacks', async () => {
    mockBuildBatchComparison.mockReturnValue(null);

    const response = await POST(
      request({
        attackIds: ['missing'],
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'unknown_attack',
      availableAttackIds: ['attack-1', 'attack-2'],
    });
  });

  it('passes prompt mode through to single comparison', async () => {
    mockBuildSingleComparison.mockResolvedValue({
      mode: 'single',
      prompt: 'custom prompt',
      variants: [],
    });

    const response = await POST(
      request({
        prompt: 'custom prompt',
      }),
    );

    expect(mockBuildSingleComparison).toHaveBeenCalledWith({
      attackId: undefined,
      prompt: 'custom prompt',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mode: 'single',
      prompt: 'custom prompt',
      variants: [],
    });
  });

  it('returns 404 when single comparison resolves to null', async () => {
    mockBuildSingleComparison.mockResolvedValue(null);

    const response = await POST(
      request({
        attackId: 'missing',
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'unknown_attack',
      availableAttackIds: ['attack-1', 'attack-2'],
    });
  });
});
