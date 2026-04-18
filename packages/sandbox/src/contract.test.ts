import { describe, expect, it } from 'vitest';
import { SandboxSpanAttributesSchema, SANDBOX_EGRESS_FINGERPRINT } from './contract';

// ── SandboxSpanAttributesSchema ─────────────────────────────────────────────

describe('SandboxSpanAttributesSchema', () => {
  const validFull = {
    'aegis.sandbox.vm_backend': 'qemu',
    'aegis.sandbox.scenario': 'prompt-injection-test',
    'aegis.sandbox.cold_start_ms': 142,
    'aegis.sandbox.exit_code': 0,
    'aegis.sandbox.egress_attempts': 3,
    'aegis.sandbox.egress_blocks': 1,
    'aegis.sandbox.secrets_injected': 2,
    'aegis.sandbox.available': true,
    'aegis.sandbox.outcome': 'ok',
  };

  const validMinimal = {
    'aegis.sandbox.vm_backend': 'krun',
    'aegis.sandbox.scenario': 'exfil-attempt',
    'aegis.sandbox.exit_code': 1,
    'aegis.sandbox.egress_attempts': 0,
    'aegis.sandbox.egress_blocks': 0,
    'aegis.sandbox.secrets_injected': 0,
    'aegis.sandbox.available': false,
    'aegis.sandbox.outcome': 'error',
  };

  it('accepts a fully-populated valid object', () => {
    expect(() => SandboxSpanAttributesSchema.parse(validFull)).not.toThrow();
  });

  it('accepts a minimal object without the optional cold_start_ms field', () => {
    expect(() => SandboxSpanAttributesSchema.parse(validMinimal)).not.toThrow();
    const result = SandboxSpanAttributesSchema.parse(validMinimal);
    expect(result['aegis.sandbox.cold_start_ms']).toBeUndefined();
  });

  it('rejects when vm_backend is an unknown value', () => {
    expect(() =>
      SandboxSpanAttributesSchema.parse({ ...validFull, 'aegis.sandbox.vm_backend': 'docker' }),
    ).toThrow();
  });

  it('rejects when outcome is an unknown value', () => {
    expect(() =>
      SandboxSpanAttributesSchema.parse({ ...validFull, 'aegis.sandbox.outcome': 'unknown' }),
    ).toThrow();
  });

  it('rejects when egress_blocks is negative', () => {
    expect(() =>
      SandboxSpanAttributesSchema.parse({ ...validFull, 'aegis.sandbox.egress_blocks': -1 }),
    ).toThrow();
  });

  it('rejects when exit_code is a non-integer', () => {
    expect(() =>
      SandboxSpanAttributesSchema.parse({ ...validFull, 'aegis.sandbox.exit_code': 1.5 }),
    ).toThrow();
  });

  it('rejects an object with an extra unknown attribute key (strictness contract-drift guard)', () => {
    expect(() =>
      SandboxSpanAttributesSchema.strict().parse({
        ...validFull,
        'aegis.sandbox.injected_extra': true,
      }),
    ).toThrow();
  });
});

// ── SANDBOX_EGRESS_FINGERPRINT ───────────────────────────────────────────────

describe('SANDBOX_EGRESS_FINGERPRINT', () => {
  it('returns a 3-element tuple', () => {
    const result = SANDBOX_EGRESS_FINGERPRINT('evil.example.com', 'not-in-allowedHosts');
    expect(result).toHaveLength(3);
  });

  it('first element is the literal aegis-sandbox-egress', () => {
    const result = SANDBOX_EGRESS_FINGERPRINT('evil.example.com', 'not-in-allowedHosts');
    expect(result[0]).toBe('aegis-sandbox-egress');
  });

  it('carries the host verbatim in position 1', () => {
    const result = SANDBOX_EGRESS_FINGERPRINT('data.exfil.io', 'not-in-allowedHosts');
    expect(result[1]).toBe('data.exfil.io');
  });

  it('carries the reason verbatim in position 2', () => {
    const result = SANDBOX_EGRESS_FINGERPRINT('evil.example.com', 'rate-limit-exceeded');
    expect(result[2]).toBe('rate-limit-exceeded');
  });

  it('returns identical tuples for identical host and reason inputs (Seer grouping stability)', () => {
    const first = SANDBOX_EGRESS_FINGERPRINT('evil.example.com', 'not-in-allowedHosts');
    const second = SANDBOX_EGRESS_FINGERPRINT('evil.example.com', 'not-in-allowedHosts');
    expect(first[0]).toBe(second[0]);
    expect(first[1]).toBe(second[1]);
    expect(first[2]).toBe(second[2]);
  });

  it('returns different tuples when host differs', () => {
    const a = SANDBOX_EGRESS_FINGERPRINT('host-a.example.com', 'not-in-allowedHosts');
    const b = SANDBOX_EGRESS_FINGERPRINT('host-b.example.com', 'not-in-allowedHosts');
    expect(a[1]).not.toBe(b[1]);
  });

  it('returns different tuples when reason differs', () => {
    const a = SANDBOX_EGRESS_FINGERPRINT('evil.example.com', 'not-in-allowedHosts');
    const b = SANDBOX_EGRESS_FINGERPRINT('evil.example.com', 'rate-limit-exceeded');
    expect(a[2]).not.toBe(b[2]);
  });
});
