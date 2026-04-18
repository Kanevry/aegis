// schema.test.ts — Zod discriminated-union validation for openclawEventSchema

import { describe, expect, it } from 'vitest';
import { openclawEventSchema } from './schema';

describe('openclawEventSchema', () => {
  describe('exec.approval.requested', () => {
    it('accepts a valid exec.approval.requested event', () => {
      const input = {
        type: 'exec.approval.requested',
        event_id: 'evt-001',
        approval_id: 'apr-001',
        tool: 'bash',
        args: { cmd: 'ls -la' },
      };
      const result = openclawEventSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'exec.approval.requested') {
        expect(result.data.event_id).toBe('evt-001');
        expect(result.data.approval_id).toBe('apr-001');
      } else {
        expect.fail('expected exec.approval.requested to parse');
      }
    });
  });

  describe('exec.approval.resolved', () => {
    it('accepts a valid exec.approval.resolved event with allow-once decision', () => {
      const input = {
        type: 'exec.approval.resolved',
        event_id: 'evt-002',
        approval_id: 'apr-001',
        decision: 'allow-once',
        decided_by: 'ui',
      };
      const result = openclawEventSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('exec.approval.resolved');
        expect(result.data.event_id).toBe('evt-002');
      }
    });

    it('rejects exec.approval.resolved with an invalid decision value', () => {
      const input = {
        type: 'exec.approval.resolved',
        event_id: 'evt-002',
        approval_id: 'apr-001',
        decision: 'maybe-later',
      };
      const result = openclawEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('exec.running', () => {
    it('accepts a valid exec.running event', () => {
      const input = {
        type: 'exec.running',
        event_id: 'evt-003',
        run_id: 'run-001',
        tool: 'bash',
        started_at: '2026-04-18T11:00:00Z',
      };
      const result = openclawEventSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('exec.running');
        expect(result.data.event_id).toBe('evt-003');
      }
    });
  });

  describe('exec.finished', () => {
    it('accepts a valid exec.finished event', () => {
      const input = {
        type: 'exec.finished',
        event_id: 'evt-004',
        run_id: 'run-001',
        exit_code: 0,
        duration_ms: 1234,
        output: 'done',
      };
      const result = openclawEventSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'exec.finished') {
        expect(result.data.exit_code).toBe(0);
      } else {
        expect.fail('expected exec.finished to parse');
      }
    });
  });

  describe('exec.denied', () => {
    it('accepts a valid exec.denied event', () => {
      const input = {
        type: 'exec.denied',
        event_id: 'evt-005',
        run_id: 'run-001',
        reason: 'policy violation',
      };
      const result = openclawEventSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === 'exec.denied') {
        expect(result.data.reason).toBe('policy violation');
      } else {
        expect.fail('expected exec.denied to parse');
      }
    });
  });

  describe('invalid inputs', () => {
    it('rejects an unknown type', () => {
      const input = {
        type: 'exec.teleported',
        event_id: 'evt-999',
      };
      const result = openclawEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects exec.approval.requested when event_id is missing', () => {
      const input = {
        type: 'exec.approval.requested',
        approval_id: 'apr-001',
        tool: 'bash',
        args: {},
      };
      const result = openclawEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
