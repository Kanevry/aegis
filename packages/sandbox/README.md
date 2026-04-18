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
