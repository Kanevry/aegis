import { describe, it, expect } from "vitest";
import { validateSinglePath, validatePaths } from "../src/paths.js";

describe("B1 — Path-traversal guard", () => {
  it("blocks path with .. traversal segment", () => {
    const result = validateSinglePath("../../etc/passwd", "path");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/traversal/i);
    expect(result.offendingPath).toBe("../../etc/passwd");
  });

  it("blocks /etc/passwd (forbidden prefix)", () => {
    const result = validateSinglePath("/etc/passwd", "path");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/forbidden/i);
  });

  it("blocks /root/.bashrc", () => {
    const result = validateSinglePath("/root/.bashrc", "path");
    expect(result.ok).toBe(false);
  });

  it("blocks /.ssh/id_rsa", () => {
    const result = validateSinglePath("/.ssh/id_rsa", "path");
    expect(result.ok).toBe(false);
  });

  it("allows normal workspace path", () => {
    const result = validateSinglePath("/workspace/src/index.ts", "path");
    expect(result.ok).toBe(true);
  });

  it("allows empty path (workspace root default)", () => {
    const result = validateSinglePath("", "path");
    expect(result.ok).toBe(true);
  });

  it("validatePaths returns first failure when mixed paths given", () => {
    const result = validatePaths(["/workspace/file.ts", "../../etc/shadow"]);
    expect(result.ok).toBe(false);
  });
});
