// src/lib/sentry-fingerprints.ts — Re-export shim + additional fingerprint helpers
// Stable fingerprints for Seer grouping of Ægis exceptions.

export {
  approvalDenyFingerprint,
  approvalBlockFingerprint,
  AEGIS_APPROVAL_ATTRS,
  AEGIS_JOB_ATTRS,
} from './aegis-attrs';
export type { ApprovalDeny, AegisApprovalAttr, AegisJobAttr } from './aegis-attrs';

/**
 * Stable fingerprint for approval-chain events: links an approval to its
 * originating session for Seer correlation.
 * Pattern: ['aegis-approval-chain', sessionId, toolName]
 */
export function approvalChainFingerprint(
  sessionId: string,
  toolName: string,
): readonly [string, string, string] {
  return ['aegis-approval-chain', sessionId, toolName] as const;
}
