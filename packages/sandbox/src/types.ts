import { z } from 'zod';

export interface SandboxOptions {
  allowedHosts: string[];
  secrets?: Record<string, { hosts: string[]; value: string }>;
  vmBackend?: 'qemu' | 'krun';
  sentry?: { enabled: boolean };
}

export interface EgressBlock {
  host: string;
  method: string;
  timestamp: string;
  reason: string;
}

export interface SandboxExecResult {
  available: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  egressBlocks: EgressBlock[];
  secretsInjected: number;
  coldStartMs: number;
  fallbackReason?: string;
}

export interface Sandbox {
  exec(command: string): Promise<SandboxExecResult>;
  close(): Promise<void>;
}

export const SandboxOptionsSchema = z.object({
  allowedHosts: z.array(z.string()).min(1),
  secrets: z.record(z.string(), z.object({
    hosts: z.array(z.string()).min(1),
    value: z.string(),
  })).optional(),
  vmBackend: z.enum(['qemu', 'krun']).optional(),
  sentry: z.object({ enabled: z.boolean() }).optional(),
});
