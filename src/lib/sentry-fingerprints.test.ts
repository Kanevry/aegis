// src/lib/sentry-fingerprints.test.ts — Vitest tests for sentry-fingerprints re-export shim

import { describe, expect, it } from 'vitest';
import {
  approvalDenyFingerprint,
  approvalBlockFingerprint,
  approvalChainFingerprint,
  AEGIS_APPROVAL_ATTRS,
  AEGIS_JOB_ATTRS,
} from './sentry-fingerprints';

describe('sentry-fingerprints re-exports', () => {
  it('re-exports approvalDenyFingerprint with correct shape', () => {
    const fp = approvalDenyFingerprint('exec', 'injection');
    expect(fp).toEqual(['aegis-approval-deny', 'exec', 'injection']);
  });

  it('re-exports approvalDenyFingerprint defaults reason to user-deny', () => {
    const fp = approvalDenyFingerprint('bash');
    expect(fp).toEqual(['aegis-approval-deny', 'bash', 'user-deny']);
  });

  it('re-exports approvalBlockFingerprint with correct shape', () => {
    const fp = approvalBlockFingerprint('B4', 'apr-123');
    expect(fp).toEqual(['aegis-block', 'B4', 'apr-123']);
  });

  it('approvalChainFingerprint produces stable 3-tuple', () => {
    const fp = approvalChainFingerprint('sess-abc', 'code-exec');
    expect(fp).toEqual(['aegis-approval-chain', 'sess-abc', 'code-exec']);
  });

  it('approvalChainFingerprint is deterministic for same inputs', () => {
    const a = approvalChainFingerprint('sess-1', 'tool-x');
    const b = approvalChainFingerprint('sess-1', 'tool-x');
    expect(a).toEqual(b);
  });

  it('re-exports AEGIS_APPROVAL_ATTRS catalog with DECISION key', () => {
    expect(AEGIS_APPROVAL_ATTRS.DECISION).toBe('aegis.approval.decision');
  });

  it('re-exports AEGIS_JOB_ATTRS catalog with QUEUE key', () => {
    expect(AEGIS_JOB_ATTRS.QUEUE).toBe('aegis.job.queue');
  });
});
