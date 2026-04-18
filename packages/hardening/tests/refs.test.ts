import { describe, it, expect } from "vitest";
import {
  validateGroundingRefs,
  initialVisitedSet,
  trackVisited,
  extractPathsFromText,
} from "../src/refs.js";

describe("B3 — Refs validation", () => {
  it("rejects unknown ref that was never visited", () => {
    const visited = initialVisitedSet("Read the config file.");
    const result = validateGroundingRefs(
      ["/workspace/never-visited.ts"],
      visited
    );
    expect(result.ok).toBe(false);
    expect(result.unknownRefs).toContain("/workspace/never-visited.ts");
    expect(result.error).toMatch(/REFS VALIDATION/);
  });

  it("accepts ref after it has been tracked as visited", () => {
    const visited = initialVisitedSet("Some task");
    trackVisited(visited, "/workspace/main.ts");
    const result = validateGroundingRefs(["/workspace/main.ts"], visited);
    expect(result.ok).toBe(true);
    expect(result.unknownRefs).toHaveLength(0);
  });

  it("accepts ref mentioned in task text (seeded automatically)", () => {
    const visited = initialVisitedSet(
      "Read /workspace/config.json and summarize."
    );
    const result = validateGroundingRefs(["/workspace/config.json"], visited);
    expect(result.ok).toBe(true);
  });

  it("accepts /AGENTS.md which is always in the initial set", () => {
    const visited = initialVisitedSet("");
    const result = validateGroundingRefs(["/AGENTS.md"], visited);
    expect(result.ok).toBe(true);
  });

  it("returns ok for empty refs array", () => {
    const visited = initialVisitedSet("task");
    const result = validateGroundingRefs([], visited);
    expect(result.ok).toBe(true);
  });

  it("accepts ref via prefix matching (child of visited dir)", () => {
    const visited = initialVisitedSet("task");
    trackVisited(visited, "/workspace/src");
    const result = validateGroundingRefs(
      ["/workspace/src/index.ts"],
      visited
    );
    expect(result.ok).toBe(true);
  });
});

describe("B3 — normalize() via public API behaviour", () => {
  it("normalizes Windows backslashes to forward slashes", () => {
    const visited = initialVisitedSet("task");
    // trackVisited normalizes on the way in; validate normalizes refs on the way in
    // So C:\workspace\src\file should normalize to /c:/workspace/src/file
    trackVisited(visited, "C:\\workspace\\src\\file.ts");
    const result = validateGroundingRefs(
      ["C:\\workspace\\src\\file.ts"],
      visited
    );
    expect(result.ok).toBe(true);
    expect(result.unknownRefs).toHaveLength(0);
  });

  it("normalizes mixed Windows and POSIX separators", () => {
    const visited = initialVisitedSet("task");
    trackVisited(visited, "C:/work\\src/file.ts");
    const result = validateGroundingRefs(["C:/work\\src/file.ts"], visited);
    expect(result.ok).toBe(true);
  });

  it("prepends leading slash to relative paths", () => {
    const visited = initialVisitedSet("task");
    // "workspace/file.ts" should normalize to "/workspace/file.ts"
    trackVisited(visited, "workspace/file.ts");
    // validateGroundingRefs with the same relative path should also normalize and match
    const result = validateGroundingRefs(["workspace/file.ts"], visited);
    expect(result.ok).toBe(true);
  });

  it("collapses consecutive slashes to a single slash", () => {
    const visited = initialVisitedSet("task");
    trackVisited(visited, "///workspace///file.ts");
    // After normalization both sides become "/workspace/file.ts"
    const result = validateGroundingRefs(["///workspace///file.ts"], visited);
    expect(result.ok).toBe(true);
  });

  it("strips trailing slash from non-root paths", () => {
    const visited = initialVisitedSet("task");
    trackVisited(visited, "/workspace/");
    // "/workspace/" normalizes to "/workspace"; ref "/workspace" should match
    const result = validateGroundingRefs(["/workspace"], visited);
    expect(result.ok).toBe(true);
  });

  it("preserves root slash '/' on its own", () => {
    // "/" is always in the initial set (added verbatim); normalize("/") = "/"
    const visited = initialVisitedSet("");
    const result = validateGroundingRefs(["/"], visited);
    expect(result.ok).toBe(true);
  });

  it("normalizes ref casing (lowercase) so case differences do not cause false positives", () => {
    const visited = initialVisitedSet("task");
    // trackVisited("/Workspace/File.ts") normalizes to "/workspace/file.ts"
    trackVisited(visited, "/Workspace/File.ts");
    // ref "/workspace/file.ts" also normalizes to "/workspace/file.ts" → match
    const result = validateGroundingRefs(["/workspace/file.ts"], visited);
    expect(result.ok).toBe(true);
  });
});

describe("B3 — extractPathsFromText()", () => {
  it("extracts paths containing hyphens, dots, and numbers", () => {
    const paths = extractPathsFromText(
      "See /work-space/my-file and /src/index.ts and /path123/file456"
    );
    expect(paths).toContain("/work-space/my-file");
    expect(paths).toContain("/src/index.ts");
    expect(paths).toContain("/path123/file456");
  });

  it("returns empty array for empty string", () => {
    const paths = extractPathsFromText("");
    expect(paths).toHaveLength(0);
  });

  it("returns empty array for whitespace-only string", () => {
    const paths = extractPathsFromText("   \t\n  ");
    expect(paths).toHaveLength(0);
  });

  it("returns empty array when text has no slash-prefixed paths", () => {
    const paths = extractPathsFromText("no paths here, just words and numbers 42");
    expect(paths).toHaveLength(0);
  });

  it("does not extract paths with Cyrillic characters beyond the ASCII boundary", () => {
    // The regex [A-Za-z0-9_./-]* stops at the first non-ASCII character.
    // "/workspace/" is ASCII but "файл.ts" is Cyrillic, so at most "/workspace/" prefix matches.
    const paths = extractPathsFromText("/workspace/файл.ts");
    // Either nothing is extracted or only the ASCII prefix up to the Cyrillic boundary.
    // The path regex requires the char after "/" to be [A-Za-z0-9], so "/workspace" matches
    // but subsequent Cyrillic chars halt the match. Assert no full Unicode path leaks through.
    for (const p of paths) {
      expect(p).toMatch(/^[/A-Za-z0-9_./-]+$/);
    }
  });
});

describe("B3 — trackVisited() edge cases", () => {
  it("does not add empty string to the visited set", () => {
    const visited = new Set<string>();
    const sizeBefore = visited.size;
    trackVisited(visited, "");
    expect(visited.size).toBe(sizeBefore);
    expect(visited.has("")).toBe(false);
  });
});

describe("B3 — initialVisitedSet()", () => {
  it("always contains the normalized form of /AGENTS.md", () => {
    const visited = initialVisitedSet("");
    // normalize("/AGENTS.md") = "/agents.md" due to lowercasing
    expect(visited.has("/agents.md")).toBe(true);
  });

  it("seeds paths extracted from task text into the initial set", () => {
    const visited = initialVisitedSet("Modify /src/app.ts and /config/env.json");
    expect(visited.has("/src/app.ts")).toBe(true);
    expect(visited.has("/config/env.json")).toBe(true);
  });

  it("does not auto-add /AGENTS.md when using a manually constructed empty set", () => {
    // A bare new Set has no defaults — validates that initialVisitedSet is the
    // only source of the auto-seeded paths.
    const manualSet = new Set<string>();
    const result = validateGroundingRefs(["/AGENTS.md"], manualSet);
    expect(result.ok).toBe(false);
    expect(result.unknownRefs).toContain("/AGENTS.md");
  });
});

describe("B3 — prefix-match bidirectional", () => {
  it("accepts parent ref when a child path was visited (parent-match direction)", () => {
    // visited "/workspace/src/file.ts", ref "/workspace/src" → v.startsWith(ref + "/") triggers
    const visited = initialVisitedSet("task");
    trackVisited(visited, "/workspace/src/file.ts");
    const result = validateGroundingRefs(["/workspace/src"], visited);
    expect(result.ok).toBe(true);
  });

  it("accepts child ref when a parent directory was visited (child-match direction)", () => {
    // visited "/workspace/src", ref "/workspace/src/utils.ts" → ref.startsWith(v + "/") triggers
    const visited = initialVisitedSet("task");
    trackVisited(visited, "/workspace/src");
    const result = validateGroundingRefs(["/workspace/src/utils.ts"], visited);
    expect(result.ok).toBe(true);
  });
});

describe("B3 — refs array with empty string entries", () => {
  it("skips empty-string entries and still validates the non-empty ref", () => {
    const visited = initialVisitedSet("task");
    trackVisited(visited, "/valid/path.ts");
    // "" normalizes to "" and is skipped (continue); "/valid/path.ts" must match
    const result = validateGroundingRefs(["", "/valid/path.ts"], visited);
    expect(result.ok).toBe(true);
    expect(result.unknownRefs).toHaveLength(0);
  });

  it("returns ok when all entries are empty strings", () => {
    const visited = initialVisitedSet("task");
    const result = validateGroundingRefs(["", ""], visited);
    expect(result.ok).toBe(true);
    expect(result.unknownRefs).toHaveLength(0);
  });
});

describe("B3 — large visited set performance", () => {
  it("validates a single ref against a 1000-entry visited set in under 100ms", () => {
    const visited = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      visited.add(`/workspace/file${i}.ts`);
    }
    const start = Date.now();
    const result = validateGroundingRefs(["/workspace/file500.ts"], visited);
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("B3 — visited set containing empty string (covers !v guard)", () => {
  it("skips the empty-string entry in visited during prefix matching and still validates correctly", () => {
    // The prefix-matching loop inside validateGroundingRefs has a `if (!v) continue`
    // guard. We trigger it by putting an empty string directly into the visited set
    // (bypassing trackVisited which also guards against empty strings).
    const visited = new Set<string>();
    visited.add(""); // empty string — should be skipped by the !v guard
    visited.add("/workspace/src/app.ts"); // valid entry that should match the ref

    const result = validateGroundingRefs(["/workspace/src/app.ts"], visited);
    expect(result.ok).toBe(true);
    expect(result.unknownRefs).toHaveLength(0);
  });

  it("reports unknown ref when visited set contains only the empty string", () => {
    // Empty string is skipped; no valid visited path → prefix match fails → unknown
    const visited = new Set<string>();
    visited.add("");

    const result = validateGroundingRefs(["/workspace/file.ts"], visited);
    expect(result.ok).toBe(false);
    expect(result.unknownRefs).toContain("/workspace/file.ts");
  });

  it("skips empty string in visited but still matches via prefix (parent-child direction)", () => {
    // visited has "" + a parent dir; ref is a child path
    const visited = new Set<string>();
    visited.add(""); // skipped by !v guard
    visited.add("/workspace/src"); // parent — triggers v.startsWith(ref+"/") or ref.startsWith(v+"/")

    const result = validateGroundingRefs(["/workspace/src/utils.ts"], visited);
    expect(result.ok).toBe(true);
  });
});
