# @aegis/sandbox

Microvm sandbox wrapper for the Ægis hardening pipeline. Wraps
`@earendil-works/gondolin` (QEMU-backed Linux microVM, TypeScript SDK) and
gracefully degrades to a no-op fallback when gondolin or QEMU is unavailable —
keeping the package compilable and tests passing in CI and on Vercel (where
QEMU cannot run).

Epic: #90

## Install — gondolin (manual, separate step)

`@earendil-works/gondolin` is NOT listed as a dependency to avoid lockfile
conflicts in parallel sessions. Install it manually on hosts that have QEMU:

```bash
pnpm add @earendil-works/gondolin
```

### macOS — QEMU prerequisite

```bash
brew install qemu
```

gondolin requires QEMU or krun at runtime. Without it the sandbox returns
`{ available: false }` on every `exec` call (see fallback behaviour below).

## Usage

```ts
import { createSandbox } from '@aegis/sandbox';

const sandbox = await createSandbox({
  allowedHosts: ['api.openai.com'],
  secrets: {
    OPENAI_API_KEY: { hosts: ['api.openai.com'], value: process.env.OPENAI_API_KEY! },
  },
  vmBackend: 'qemu',
});

const result = await sandbox.exec('curl https://api.openai.com/v1/models');

if (!result.available) {
  console.warn('Sandbox unavailable:', result.fallbackReason);
} else {
  console.log('exit:', result.exitCode, 'stdout:', result.stdout);
  console.log('egress blocks:', result.egressBlocks);
}

await sandbox.close();
```

## Fallback behaviour

When gondolin cannot be imported or the VM cannot be initialised:

- `createSandbox` still resolves (never throws).
- The returned `Sandbox.exec()` always resolves with:
  `{ available: false, exitCode: -1, fallbackReason: '<description>' }`.
- `Sandbox.close()` is a no-op.

This allows the rest of the Ægis pipeline to continue operating in degraded
mode without crashing.

## API

```ts
createSandbox(opts: SandboxOptions): Promise<Sandbox>
```

`SandboxOptions`:

| Field          | Type                                                  | Required | Description                              |
| -------------- | ----------------------------------------------------- | -------- | ---------------------------------------- |
| `allowedHosts` | `string[]`                                            | Yes      | Hostnames the VM may contact.            |
| `secrets`      | `Record<string, { hosts: string[]; value: string }>`  | No       | Secrets injected as env vars into the VM.|
| `vmBackend`    | `'qemu' \| 'krun'`                                   | No       | Hypervisor backend (default: gondolin decides). |

`SandboxExecResult`:

| Field            | Type           | Description                                            |
| ---------------- | -------------- | ------------------------------------------------------ |
| `available`      | `boolean`      | `false` when running in fallback mode.                 |
| `exitCode`       | `number`       | Process exit code, or `-1` in fallback.                |
| `stdout`         | `string`       | Standard output.                                       |
| `stderr`         | `string`       | Standard error.                                        |
| `egressBlocks`   | `EgressBlock[]`| Outbound requests that were blocked.                   |
| `secretsInjected`| `number`       | Count of secrets injected into the VM env.             |
| `coldStartMs`    | `number`       | VM boot time in milliseconds.                          |
| `fallbackReason` | `string?`      | Human-readable reason when `available` is `false`.     |

## Sentry observability (`aegis.sandbox.*`)

Issues [#95](https://github.com/Kanevry/aegis/issues/95) + [#92](https://github.com/Kanevry/aegis/issues/92).

Opt in by passing `sentry: { enabled: true }` to `createSandbox`. Every `exec` then emits a Sentry span `aegis.sandbox.exec` carrying the full
`SandboxSpanAttributes` contract, and every blocked egress fires `Sentry.captureException(AegisSandboxEgressBlocked)` with a stable
fingerprint so Seer groups recurring exfiltration attempts by `(host × reason)`.

```ts
const sandbox = await createSandbox({
  allowedHosts: ['api.openai.com'],
  vmBackend: 'qemu',
  sentry: { enabled: true },   // ← opt in
});
```

`@sentry/nextjs` is loaded via dynamic `import()` wrapped in `try/catch` — when the host app does not depend on Sentry, the wrapper transparently
runs `exec` unwrapped. There is no hard runtime dependency.

### Span attribute contract — `SandboxSpanAttributes`

Defined in `src/contract.ts` as a versioned Zod schema. The contract is the source of truth: any new attribute MUST be added to `SandboxSpanAttributesSchema` and the change must be coordinated with downstream Sentry dashboards / alerts.

| Attribute                          | Type                                  | Description                                                          |
| ---------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `aegis.sandbox.vm_backend`         | `'qemu' \| 'krun' \| 'fallback'`     | Hypervisor used. `'fallback'` when the sandbox is unavailable.       |
| `aegis.sandbox.scenario`           | `string`                              | Free-form caller tag (e.g. `'exec'`, `'demo:attack-5'`).             |
| `aegis.sandbox.cold_start_ms`      | `number?`                             | VM boot time. Optional — absent on cached/warm runs.                 |
| `aegis.sandbox.exit_code`          | `int`                                 | Guest process exit code, or `-1` in fallback.                        |
| `aegis.sandbox.egress_attempts`    | `int ≥ 0`                             | Outbound requests the guest attempted.                               |
| `aegis.sandbox.egress_blocks`      | `int ≥ 0`                             | Outbound requests denied by the host allowlist.                      |
| `aegis.sandbox.secrets_injected`   | `int ≥ 0`                             | Count of secret env vars injected for this exec.                     |
| `aegis.sandbox.available`          | `boolean`                             | `false` when running in fallback mode.                               |
| `aegis.sandbox.outcome`            | `'ok' \| 'blocked' \| 'error'`       | Derived: `blocked` if any egress block, `error` if not available or non-zero exit, else `ok`. |

Contract drift is guarded by `contract.test.ts` — the schema rejects any extra unknown key under `.strict()`.

### Egress fingerprint

`SANDBOX_EGRESS_FINGERPRINT(host, reason)` returns the tuple `['aegis-sandbox-egress', host, reason]` — stable across runs so Sentry/Seer groups recurring exfiltration attempts deterministically. `AegisSandboxEgressBlocked` carries the fingerprint on its instance for ergonomic re-throws.

### Version-bump policy

The `aegis.sandbox.*` namespace is treated as a **public contract**. Any change to attribute names, types, or enum members is a breaking change — bump `@aegis/sandbox` minor version and document in the package CHANGELOG. Adding a NEW optional attribute is non-breaking provided the schema stays additive (no `.strict()` regressions in production code paths).
