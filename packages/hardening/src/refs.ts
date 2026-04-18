// Grounding-refs self-validation layer (B3)
// Pure functions — no external dependencies.
//
// Scope: verify each entry in grounding_refs corresponds to a path the agent
// actually visited during this task OR a path explicitly mentioned in the task
// instruction text. Prevents hallucinated citations from polluting the audit trail.
//
// Design principle: recoverable errors, not hard failures.

// ── Types ────────────────────────────────────────────────────────────

export interface RefsValidationResult {
  ok: boolean;
  /** Refs that were not found in the visited set. */
  unknownRefs: string[];
  /** Human-readable error message formatted for the agent. */
  error?: string;
}

// ── Path normalization ──────────────────────────────────────────────

/**
 * Normalizes a path for comparison: lowercase, collapse slashes, strip
 * trailing slash. Leading slash preserved.
 */
function normalize(p: string): string {
  if (!p) return "";
  let n = p.trim().toLowerCase();
  n = n.replace(/\\/g, "/");
  n = n.replace(/\/+/g, "/");
  if (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
  if (n.length > 0 && !n.startsWith("/")) n = "/" + n;
  return n;
}

// ── Extraction helpers ──────────────────────────────────────────────

/**
 * Extracts path-shaped substrings from arbitrary text (e.g. the task
 * instruction). Matches absolute paths starting with `/` followed by at
 * least one alphanumeric char.
 */
const PATH_RE = /\/[A-Za-z0-9][A-Za-z0-9_./-]*/g;

export function extractPathsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(PATH_RE);
  if (!matches) return [];
  return matches.map((m) => m);
}

// ── Visited set API ─────────────────────────────────────────────────

/**
 * Build the initial visited set for a task. Includes:
 * - /AGENTS.md (always read during bootstrap)
 * - Any path-shaped strings in the task text itself (legit citations)
 */
export function initialVisitedSet(taskText: string): Set<string> {
  const set = new Set<string>();
  set.add(normalize("/AGENTS.md"));
  set.add("/");
  for (const p of extractPathsFromText(taskText)) {
    set.add(normalize(p));
  }
  return set;
}

/**
 * Add a path to the visited set (e.g. after a file read/write tool call).
 */
export function trackVisited(visited: Set<string>, path: string): void {
  if (path) visited.add(normalize(path));
}

// ── Validation ──────────────────────────────────────────────────────

/**
 * Checks that each ref is present in the visited set (after normalization).
 * A ref is accepted if:
 *  - Its normalized form is in visited, OR
 *  - Any visited path is a prefix of the normalized ref, OR
 *  - The normalized ref is a prefix of any visited path.
 */
export function validateGroundingRefs(
  refs: readonly string[],
  visited: ReadonlySet<string>
): RefsValidationResult {
  if (!refs || refs.length === 0) {
    return { ok: true, unknownRefs: [] };
  }

  const unknown: string[] = [];
  for (const raw of refs) {
    const ref = normalize(raw);
    if (!ref) continue;

    if (visited.has(ref)) continue;

    let matched = false;
    for (const v of visited) {
      if (!v) continue;
      if (ref.startsWith(v + "/") || v.startsWith(ref + "/")) {
        matched = true;
        break;
      }
    }
    if (!matched) unknown.push(raw);
  }

  if (unknown.length === 0) {
    return { ok: true, unknownRefs: [] };
  }

  const visitedList = Array.from(visited).slice(0, 20).join(", ");
  return {
    ok: false,
    unknownRefs: unknown,
    error:
      `REFS VALIDATION: The following grounding_refs were not touched during this task and are not mentioned in the task instruction: ${unknown.join(", ")}. ` +
      `Use only refs from paths you actually read/wrote/listed OR paths explicitly named in the task instruction. Visited so far: ${visitedList}. ` +
      `Retry report_completion with corrected grounding_refs.`,
  };
}
