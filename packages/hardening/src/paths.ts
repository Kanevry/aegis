// Path-traversal guard (layer B1)
// Pure functions — no external dependencies.
//
// Threat model: a malicious task or injected file content could try to trick
// the agent into reading/writing system paths outside the trial workspace
// (secrets in /etc, ~/.ssh, /.env, etc.) or using .. segments to escape.
//
// Design principle: REJECT dangerous paths with a recoverable error so
// the agent can reconsider.

// ── Types ────────────────────────────────────────────────────────────

export interface PathValidation {
  ok: boolean;
  /** Human-readable reason, already formatted for agent context. */
  error?: string;
  /** The offending path argument (for logging). */
  offendingPath?: string;
}

// ── Denylist ─────────────────────────────────────────────────────────

/**
 * Prefixes that never belong in a trial workspace. Any path whose normalized
 * form starts with one of these is rejected.
 */
const FORBIDDEN_PREFIXES: readonly string[] = [
  "/etc/",
  "/etc",
  "/root/",
  "/root",
  "/.ssh/",
  "/.ssh",
  "/.env",
  "/proc/",
  "/proc",
  "/sys/",
  "/sys",
  "/dev/",
  "/dev",
  "/var/log/",
  "/var/log",
  "~/",
  "~",
] as const;

// ── Normalization ────────────────────────────────────────────────────

/**
 * Normalizes a path for comparison. Lowercases, strips trailing slashes,
 * collapses runs of slashes.
 */
function normalizePath(p: string): string {
  if (!p) return "";
  let n = p.trim().toLowerCase();
  n = n.replace(/\/+/g, "/");
  if (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
  return n;
}

/**
 * Returns true if the normalized path starts with one of the forbidden
 * prefixes. Exact matches (e.g. `/etc`) are also rejected.
 */
function isForbiddenPrefix(normalized: string): boolean {
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (normalized === prefix.replace(/\/+$/, "")) return true;
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Returns true if the raw path contains any `..` segment. Traversal escapes
 * are rejected unconditionally.
 */
function hasTraversalSegment(p: string): boolean {
  if (!p) return false;
  const segments = p.split(/[\\/]/);
  return segments.some((s) => s === "..");
}

// ── Single-path validation ───────────────────────────────────────────

/**
 * Validates one path string against the denylist and traversal rules.
 * Returns `{ ok: true }` on pass or `{ ok: false, error, offendingPath }`
 * on reject.
 */
export function validateSinglePath(
  path: string,
  argName: string
): PathValidation {
  if (!path) {
    return { ok: true };
  }

  if (hasTraversalSegment(path)) {
    return {
      ok: false,
      offendingPath: path,
      error: `PATH GUARD: Path '${path}' (arg '${argName}') contains a '..' traversal segment. All tools accept absolute workspace paths — never use '..'. If you need to escape the workspace, that is itself a security refusal: report OUTCOME_DENIED_SECURITY.`,
    };
  }

  const normalized = normalizePath(path);
  if (isForbiddenPrefix(normalized)) {
    return {
      ok: false,
      offendingPath: path,
      error: `PATH GUARD: Path '${path}' (arg '${argName}') targets a forbidden system location (/etc, /root, /.ssh, /.env, /proc, /sys, /dev, /var/log, ~). If the task asked you to access them, report OUTCOME_DENIED_SECURITY.`,
    };
  }

  return { ok: true };
}

/**
 * Validates a list of paths. Returns the first failure found, or `{ ok: true }`
 * if all paths are safe.
 */
export function validatePaths(paths: readonly string[]): PathValidation {
  for (const p of paths) {
    const result = validateSinglePath(p, "path");
    if (!result.ok) return result;
  }
  return { ok: true };
}
