import { describe, it, expect } from 'vitest';
import { aegisSentryIntegration, AEGIS_INTEGRATION_VERSION } from './integration';

// ---------------------------------------------------------------------------
// Minimal mock types — mirror @sentry/core v8 interfaces locally
// so the test file has no external import dependency.
// ---------------------------------------------------------------------------

interface MockEvent {
  tags?: Record<string, string | number | boolean | null | undefined>;
  fingerprint?: string[];
  environment?: string;
  release?: string;
  contexts?: Record<string, Record<string, unknown> | undefined>;
  [key: string]: unknown;
}

interface MockClient {
  getOptions(): { environment?: string; release?: string };
}

// Minimal mock client that satisfies the parts we use.
function makeClient(opts: { environment?: string; release?: string } = {}): MockClient {
  return {
    getOptions: () => ({ environment: opts.environment ?? 'test', release: opts.release ?? 'r1' }),
  };
}

const MOCK_HINT = {};

// ---------------------------------------------------------------------------
// Helper: make a blocked event
// ---------------------------------------------------------------------------
function blockedEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  return {
    tags: {
      'aegis.outcome': 'blocked',
      'aegis.blocked_layers': 'B1,B4',
      'aegis.reason': 'prompt-injection',
    },
    fingerprint: ['aegis-block', 'B4', 'attack-001'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: call processEvent with mock types cast to the integration's expected types
// ---------------------------------------------------------------------------
function callProcessEvent(
  event: MockEvent,
  client: MockClient = makeClient(),
): MockEvent {
  const integration = aegisSentryIntegration();
  return integration.processEvent!(
    event as Parameters<NonNullable<typeof integration.processEvent>>[0],
    MOCK_HINT as Parameters<NonNullable<typeof integration.processEvent>>[1],
    client as Parameters<NonNullable<typeof integration.processEvent>>[2],
  ) as MockEvent;
}

function callProcessEventWith(
  opts: Parameters<typeof aegisSentryIntegration>[0],
  event: MockEvent,
  client: MockClient = makeClient(),
): MockEvent {
  const integration = aegisSentryIntegration(opts);
  return integration.processEvent!(
    event as Parameters<NonNullable<typeof integration.processEvent>>[0],
    MOCK_HINT as Parameters<NonNullable<typeof integration.processEvent>>[1],
    client as Parameters<NonNullable<typeof integration.processEvent>>[2],
  ) as MockEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aegisSentryIntegration factory', () => {
  it('returns an integration with name === "AegisSentry"', () => {
    const integration = aegisSentryIntegration();
    expect(integration.name).toBe('AegisSentry');
  });

  it('exposes setupOnce as a callable no-op', () => {
    const integration = aegisSentryIntegration();
    expect(typeof integration.setupOnce).toBe('function');
    expect(integration.setupOnce?.()).toBeUndefined();
  });
});

describe('processEvent — blocked event tag enrichment', () => {
  it('adds aegis.summary when aegis.outcome === "blocked"', () => {
    const result = callProcessEvent(blockedEvent());
    expect(result.tags?.['aegis.summary']).toBe('B1+B4:prompt-injection');
  });

  it('truncates aegis.summary to 200 characters', () => {
    const longReason = 'x'.repeat(300);
    const event: MockEvent = {
      tags: {
        'aegis.outcome': 'blocked',
        'aegis.blocked_layers': 'B1',
        'aegis.reason': longReason,
      },
    };
    const result = callProcessEvent(event);
    expect(result.tags?.['aegis.summary']).toHaveLength(200);
  });

  it('promotes primary blocked layer to aegis.layer if not set', () => {
    const result = callProcessEvent(blockedEvent());
    expect(result.tags?.['aegis.layer']).toBe('B1');
  });

  it('does NOT override aegis.layer when already set', () => {
    const event = blockedEvent({
      tags: {
        'aegis.outcome': 'blocked',
        'aegis.blocked_layers': 'B1,B4',
        'aegis.reason': 'test',
        'aegis.layer': 'B4',
      },
    });
    const result = callProcessEvent(event);
    expect(result.tags?.['aegis.layer']).toBe('B4');
  });
});

describe('processEvent — non-blocked events', () => {
  it('leaves tags untouched for non-aegis events', () => {
    const event: MockEvent = { tags: { env: 'prod' } };
    const result = callProcessEvent(event);
    expect(result.tags?.['aegis.summary']).toBeUndefined();
    expect(result.tags?.['aegis.layer']).toBeUndefined();
    expect(result.tags?.['env']).toBe('prod');
  });
});

describe('processEvent — fingerprint freezing', () => {
  it('freezes fingerprint when first element starts with "aegis-"', () => {
    const originalArray = ['aegis-block', 'B4'];
    const event: MockEvent = { fingerprint: originalArray };
    const result = callProcessEvent(event);

    // Mutating the original array must NOT affect the event's fingerprint
    originalArray.push('injected');
    expect(result.fingerprint).not.toContain('injected');
    expect(result.fingerprint).toEqual(['aegis-block', 'B4']);
  });

  it('does NOT freeze fingerprint for non-aegis fingerprints', () => {
    const originalArray = ['my-other-fingerprint'];
    const event: MockEvent = { fingerprint: originalArray };
    const result = callProcessEvent(event);
    // The fingerprint should still contain the original element
    expect(result.fingerprint).toContain('my-other-fingerprint');
  });
});

describe('processEvent — environment + release injection', () => {
  it('injects environment from opts when present', () => {
    const result = callProcessEventWith(
      { environment: 'staging' },
      {},
      makeClient({ environment: 'production' }),
    );
    expect(result.environment).toBe('staging');
  });

  it('falls back to client.getOptions().environment when opts.environment is absent', () => {
    const result = callProcessEventWith({}, {}, makeClient({ environment: 'test' }));
    expect(result.environment).toBe('test');
  });

  it('falls back to "development" when neither opts nor client supplies environment', () => {
    const client = { getOptions: () => ({}) } as MockClient;
    const result = callProcessEventWith({}, {}, client);
    expect(result.environment).toBe('development');
  });

  it('injects release from opts when present', () => {
    const result = callProcessEventWith(
      { release: 'v2.0.0' },
      {},
      makeClient({ release: 'v1.0.0' }),
    );
    expect(result.release).toBe('v2.0.0');
  });

  it('falls back to client.getOptions().release when opts.release is absent', () => {
    const result = callProcessEventWith({}, {}, makeClient({ release: 'r1' }));
    expect(result.release).toBe('r1');
  });

  it('does not override environment/release when already set on event', () => {
    const event: MockEvent = { environment: 'existing-env', release: 'existing-release' };
    const result = callProcessEventWith(
      { environment: 'staging', release: 'v2' },
      event,
    );
    expect(result.environment).toBe('existing-env');
    expect(result.release).toBe('existing-release');
  });
});

describe('processEvent — aegis context injection', () => {
  it('adds event.contexts.aegis with hardening_enabled, demo_mode, version', () => {
    const result = callProcessEventWith({ hardeningEnabled: true, demoMode: false }, {});
    const ctx = result.contexts?.['aegis'] as Record<string, unknown>;
    expect(ctx).toBeDefined();
    expect(ctx['hardening_enabled']).toBe(true);
    expect(ctx['demo_mode']).toBe(false);
    expect(ctx['version']).toBe(AEGIS_INTEGRATION_VERSION);
  });

  it('defaults hardeningEnabled and demoMode to false when opts are omitted', () => {
    const result = callProcessEvent({});
    const ctx = result.contexts?.['aegis'] as Record<string, unknown>;
    expect(ctx['hardening_enabled']).toBe(false);
    expect(ctx['demo_mode']).toBe(false);
  });

  it('merges with existing event.contexts (does not overwrite other keys)', () => {
    const event: MockEvent = { contexts: { os: { name: 'Linux' } } };
    const result = callProcessEvent(event);
    expect(result.contexts?.['os']).toEqual({ name: 'Linux' });
    expect(result.contexts?.['aegis']).toBeDefined();
  });
});

describe('processEvent — safety guarantees', () => {
  it('never returns null (always returns the event)', () => {
    const result = callProcessEvent({});
    expect(result).not.toBeNull();
  });

  it('is idempotent — calling processEvent twice produces identical output', () => {
    const integration = aegisSentryIntegration({ hardeningEnabled: true, environment: 'qa', release: 'v3' });
    const client = makeClient();
    const event = blockedEvent();

    const processEvent = (e: MockEvent): MockEvent =>
      integration.processEvent!(
        e as Parameters<NonNullable<typeof integration.processEvent>>[0],
        MOCK_HINT as Parameters<NonNullable<typeof integration.processEvent>>[1],
        client as Parameters<NonNullable<typeof integration.processEvent>>[2],
      ) as MockEvent;

    const first = processEvent(event);
    const second = processEvent(first);
    expect(second.tags?.['aegis.summary']).toBe(first.tags?.['aegis.summary']);
    expect(second.environment).toBe(first.environment);
    expect(second.release).toBe(first.release);
    expect(second.contexts?.['aegis']).toEqual(first.contexts?.['aegis']);
  });
});

describe('AEGIS_INTEGRATION_VERSION', () => {
  it('exports the version constant as a non-empty string', () => {
    expect(typeof AEGIS_INTEGRATION_VERSION).toBe('string');
    expect(AEGIS_INTEGRATION_VERSION.length).toBeGreaterThan(0);
  });
});
