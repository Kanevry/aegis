import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SandboxOptionsSchema } from './types';
import { createSandbox } from './index';

// ── Schema validation ───────────────────────────────────────────────────────

describe('SandboxOptionsSchema', () => {
  it('rejects empty allowedHosts array', () => {
    expect(() =>
      SandboxOptionsSchema.parse({ allowedHosts: [] }),
    ).toThrow();
  });

  it('accepts valid options', () => {
    expect(() =>
      SandboxOptionsSchema.parse({ allowedHosts: ['example.com'] }),
    ).not.toThrow();
  });

  it('rejects unknown vmBackend values', () => {
    expect(() =>
      SandboxOptionsSchema.parse({
        allowedHosts: ['example.com'],
        vmBackend: 'docker',
      }),
    ).toThrow();
  });
});

// ── Fallback behaviour when gondolin is not installed ───────────────────────

describe('createSandbox — gondolin unavailable', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns a fallback sandbox with available: false and a descriptive fallbackReason', async () => {
    // @earendil-works/gondolin is not installed in this repo — the dynamic
    // import will throw a "Cannot find module" error, triggering the fallback.
    const sandbox = await createSandbox({ allowedHosts: ['api.example.com'] });
    const result = await sandbox.exec('echo hello');

    expect(result.available).toBe(false);
    expect(result.fallbackReason).toBeDefined();
    expect(typeof result.fallbackReason).toBe('string');
    expect((result.fallbackReason as string).length).toBeGreaterThan(0);
  });

  it('fallback exec returns { available: false, exitCode: -1 } and does not throw', async () => {
    const sandbox = await createSandbox({ allowedHosts: ['api.example.com'] });
    const result = await sandbox.exec('rm -rf /');

    expect(result.available).toBe(false);
    expect(result.exitCode).toBe(-1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.egressBlocks).toEqual([]);
    expect(result.secretsInjected).toBe(0);
    expect(result.coldStartMs).toBe(0);
  });

  it('fallback close resolves without throwing', async () => {
    const sandbox = await createSandbox({ allowedHosts: ['api.example.com'] });
    await expect(sandbox.close()).resolves.toBeUndefined();
  });
});

// ── Mocked gondolin — successful VM ────────────────────────────────────────

describe('createSandbox — mocked gondolin success', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns a result with the expected shape when the VM executes successfully', async () => {
    vi.doMock('@earendil-works/gondolin', () => {
      return {
        createHttpHooks: vi.fn(() => ({ onRequest: undefined })),
        VM: {
          create: vi.fn(async () => ({
            exec: vi.fn(async () => ({
              exitCode: 0,
              stdout: 'hello world',
              stderr: '',
            })),
            destroy: vi.fn(async () => undefined),
          })),
        },
      };
    });

    const { createSandbox: createSandboxMocked } = await import('./index.js');
    const sandbox = await createSandboxMocked({
      allowedHosts: ['api.example.com'],
      secrets: { API_KEY: { hosts: ['api.example.com'], value: 'secret-abc' } },
    });

    const result = await sandbox.exec('echo hello world');

    expect(result.available).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello world');
    expect(result.stderr).toBe('');
    expect(result.egressBlocks).toEqual([]);
    expect(result.secretsInjected).toBe(1);
    expect(result.coldStartMs).toBeGreaterThanOrEqual(0);
    expect(result.fallbackReason).toBeUndefined();

    await sandbox.close();
  });
});

// ── Mocked gondolin — egress block ─────────────────────────────────────────

describe('createSandbox — mocked gondolin egress block', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('captures egress blocks when a disallowed host is contacted', async () => {
    let capturedOnRequest:
      | ((info: { host: string; method: string }) => boolean)
      | undefined;

    vi.doMock('@earendil-works/gondolin', () => {
      return {
        createHttpHooks: vi.fn(() => {
          const hooks: { onRequest?: (info: { host: string; method: string }) => boolean } = {
            onRequest: undefined,
          };
          // Store a reference so the mock exec can trigger it.
          capturedOnRequest = (info) => hooks.onRequest?.(info) ?? true;
          return hooks;
        }),
        VM: {
          create: vi.fn(async () => ({
            exec: vi.fn(async () => {
              // Simulate the VM making an outbound request to a disallowed host.
              capturedOnRequest?.({ host: 'evil.example.net', method: 'GET' });
              return { exitCode: 0, stdout: '', stderr: '' };
            }),
            destroy: vi.fn(async () => undefined),
          })),
        },
      };
    });

    const { createSandbox: createSandboxMocked } = await import('./index.js');
    const sandbox = await createSandboxMocked({
      allowedHosts: ['api.example.com'],
    });

    const result = await sandbox.exec('curl https://evil.example.net');

    expect(result.egressBlocks).toHaveLength(1);
    expect(result.egressBlocks[0]).toMatchObject({
      host: 'evil.example.net',
      method: 'GET',
      reason: expect.stringContaining('allowedHosts') as string,
    });
    expect(result.egressBlocks[0]?.timestamp).toBeDefined();

    await sandbox.close();
  });
});
