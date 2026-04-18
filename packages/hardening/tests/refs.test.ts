import { describe, it, expect } from "vitest";
import {
  validateGroundingRefs,
  initialVisitedSet,
  trackVisited,
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
