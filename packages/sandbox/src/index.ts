import {
  SandboxOptionsSchema,
  type EgressBlock,
  type Sandbox,
  type SandboxExecResult,
  type SandboxOptions,
} from './types';

export type { EgressBlock, Sandbox, SandboxExecResult, SandboxOptions };
export { SandboxOptionsSchema };

// Minimal shape we require from @earendil-works/gondolin at runtime.
// Declared locally so we never import the package statically.
interface GondolinHttpHooks {
  onRequest?: (info: { host: string; method: string }) => boolean;
}

interface GondolinVmExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface GondolinVm {
  exec(command: string): Promise<GondolinVmExecResult>;
  destroy(): Promise<void>;
}

interface GondolinModule {
  createHttpHooks(opts: {
    allowedHosts: string[];
    secrets?: Record<string, { hosts: string[]; value: string }>;
  }): GondolinHttpHooks;
  VM: {
    create(opts: {
      httpHooks: GondolinHttpHooks;
      env?: Record<string, string>;
      backend?: 'qemu' | 'krun';
    }): Promise<GondolinVm>;
  };
}

function makeFallbackSandbox(fallbackReason: string): Sandbox {
  return {
    async exec(_command: string): Promise<SandboxExecResult> {
      return {
        available: false,
        exitCode: -1,
        stdout: '',
        stderr: '',
        egressBlocks: [],
        secretsInjected: 0,
        coldStartMs: 0,
        fallbackReason,
      };
    },
    async close(): Promise<void> {
      // no-op: nothing to tear down in fallback mode
    },
  };
}

/**
 * Creates a microVM sandbox backed by @earendil-works/gondolin when available.
 *
 * The package is loaded dynamically so this module compiles and tests pass
 * even when gondolin is not installed. When QEMU or gondolin is absent the
 * function returns a fallback Sandbox whose exec always resolves with
 * { available: false }.
 *
 * Install gondolin separately when running on a Linux host with QEMU:
 *   pnpm add @earendil-works/gondolin
 */
export async function createSandbox(opts: SandboxOptions): Promise<Sandbox> {
  const validated = SandboxOptionsSchema.parse(opts);

  let gondolin: GondolinModule;

  try {
    // Dynamic import keeps gondolin out of static analysis and the lockfile.
    // The specifier must be a literal so Vitest's module registry can intercept it.
    // @ts-expect-error — @earendil-works/gondolin has no installed type declarations
    gondolin = (await import(/* webpackIgnore: true */ '@earendil-works/gondolin')) as unknown as GondolinModule;
  } catch (err) {
    const reason =
      err instanceof Error
        ? `gondolin unavailable: ${err.message}`
        : 'gondolin unavailable: import failed';
    return makeFallbackSandbox(reason);
  }

  let vm: GondolinVm;
  const egressBlocks: EgressBlock[] = [];
  const coldStartStart = Date.now();

  try {
    const hooks = gondolin.createHttpHooks({
      allowedHosts: validated.allowedHosts,
      secrets: validated.secrets,
    });

    // Intercept outbound requests to record egress blocks.
    const originalOnRequest = hooks.onRequest;
    hooks.onRequest = (info: { host: string; method: string }): boolean => {
      const allowed = validated.allowedHosts.some(
        (h) => info.host === h || info.host.endsWith(`.${h}`),
      );
      if (!allowed) {
        egressBlocks.push({
          host: info.host,
          method: info.method,
          timestamp: new Date().toISOString(),
          reason: `host not in allowedHosts: ${validated.allowedHosts.join(', ')}`,
        });
        return false;
      }
      return originalOnRequest ? originalOnRequest(info) : true;
    };

    const envRecord: Record<string, string> = {};
    if (validated.secrets) {
      for (const [key, secret] of Object.entries(validated.secrets)) {
        envRecord[key] = secret.value;
      }
    }

    vm = await gondolin.VM.create({
      httpHooks: hooks,
      env: envRecord,
      backend: validated.vmBackend,
    });
  } catch (err) {
    const reason =
      err instanceof Error
        ? `VM init failed: ${err.message}`
        : 'VM init failed: unknown error';
    return makeFallbackSandbox(reason);
  }

  const coldStartMs = Date.now() - coldStartStart;
  const secretsInjected = validated.secrets
    ? Object.keys(validated.secrets).length
    : 0;

  return {
    async exec(command: string): Promise<SandboxExecResult> {
      // Reset egress blocks per exec call so each result reflects only
      // the network activity of that individual command.
      egressBlocks.length = 0;

      try {
        const result = await vm.exec(command);
        return {
          available: true,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          egressBlocks: [...egressBlocks],
          secretsInjected,
          coldStartMs,
        };
      } catch (err) {
        const reason =
          err instanceof Error ? `exec failed: ${err.message}` : 'exec failed';
        return {
          available: false,
          exitCode: -1,
          stdout: '',
          stderr: '',
          egressBlocks: [...egressBlocks],
          secretsInjected,
          coldStartMs,
          fallbackReason: reason,
        };
      }
    },

    async close(): Promise<void> {
      try {
        await vm.destroy();
      } catch {
        // Swallow destroy errors — best-effort cleanup.
      }
    },
  };
}
