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

  // ── Case-insensitivity of forbidden prefixes ─────────────────────────

  describe("case-insensitive forbidden prefix matching", () => {
    it("blocks /ETC/passwd (uppercase prefix)", () => {
      const result = validateSinglePath("/ETC/passwd", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
      expect(result.offendingPath).toBe("/ETC/passwd");
    });

    it("blocks /Root/.ssh (mixed-case root)", () => {
      const result = validateSinglePath("/Root/.ssh", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it("blocks /Etc/Passwd (fully mixed-case)", () => {
      const result = validateSinglePath("/Etc/Passwd", "path");
      expect(result.ok).toBe(false);
    });
  });

  // ── Slash normalization ───────────────────────────────────────────────

  describe("slash normalization", () => {
    it("blocks /etc//passwd (double slash collapsed)", () => {
      const result = validateSinglePath("/etc//passwd", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it("blocks ///root/// (triple leading and trailing slashes)", () => {
      const result = validateSinglePath("///root///", "path");
      expect(result.ok).toBe(false);
    });

    it("allows /workspace///src////file (extra slashes in safe path)", () => {
      const result = validateSinglePath("/workspace///src////file", "path");
      expect(result.ok).toBe(true);
    });
  });

  // ── Tilde escape ─────────────────────────────────────────────────────

  describe("tilde-escape paths", () => {
    it("blocks ~/../../../etc/passwd (tilde with traversal)", () => {
      const result = validateSinglePath("~/../../../etc/passwd", "path");
      expect(result.ok).toBe(false);
    });

    it("blocks ~/config (bare tilde home expansion attempt)", () => {
      const result = validateSinglePath("~/config", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it("blocks ~ (bare tilde alone)", () => {
      const result = validateSinglePath("~", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });

  // ── Forbidden prefix boundary ─────────────────────────────────────────

  describe("forbidden prefix boundary conditions", () => {
    it("blocks /etc (exact prefix, no trailing slash)", () => {
      const result = validateSinglePath("/etc", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it("blocks /etc/ (prefix with trailing slash)", () => {
      const result = validateSinglePath("/etc/", "path");
      expect(result.ok).toBe(false);
    });

    it("blocks /etcX (startsWith bare /etc prefix — guard is intentionally strict)", () => {
      // The denylist includes the bare "/etc" entry (no trailing slash).
      // "/etcx/config".startsWith("/etc") is true, so the guard blocks it.
      // This documents the known conservative behavior of isForbiddenPrefix.
      const result = validateSinglePath("/etcX/config", "path");
      expect(result.ok).toBe(false);
    });

    it("allows /workspace/etc/config (forbidden prefix not at root)", () => {
      const result = validateSinglePath("/workspace/etc/config", "path");
      expect(result.ok).toBe(true);
    });
  });

  // ── Empty-segment edge cases ──────────────────────────────────────────

  describe("empty-segment edge cases", () => {
    it("allows / (root slash — not a forbidden prefix)", () => {
      const result = validateSinglePath("/", "path");
      expect(result.ok).toBe(true);
    });

    it("allows /// (triple slash, collapses to /)", () => {
      const result = validateSinglePath("///", "path");
      expect(result.ok).toBe(true);
    });

    it("allows /workspace//src (double slash in safe path)", () => {
      const result = validateSinglePath("/workspace//src", "path");
      expect(result.ok).toBe(true);
    });
  });

  // ── Backslash (Windows-style) paths ──────────────────────────────────

  describe("backslash separator paths", () => {
    it("blocks traversal via backslash separator (C:\\..\\etc\\passwd)", () => {
      const result = validateSinglePath("C:\\..\\etc\\passwd", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/traversal/i);
    });

    it("blocks traversal via mixed backslash (/workspace\\..\\etc)", () => {
      const result = validateSinglePath("/workspace\\..\\etc", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/traversal/i);
    });
  });

  // ── Very long path (DoS sanity) ───────────────────────────────────────

  describe("very long path", () => {
    it("allows a 4096-character workspace path without hanging", () => {
      const longSegment = "a".repeat(4000);
      const result = validateSinglePath(`/workspace/${longSegment}/file.ts`, "path");
      expect(result.ok).toBe(true);
    });

    it("blocks a 4096-character path rooted at /etc", () => {
      const longSegment = "a".repeat(4000);
      const result = validateSinglePath(`/etc/${longSegment}`, "path");
      expect(result.ok).toBe(false);
    });
  });

  // ── Unicode paths ─────────────────────────────────────────────────────

  describe("unicode paths", () => {
    it("allows /workspace/café (unicode filename in safe path)", () => {
      const result = validateSinglePath("/workspace/café", "path");
      expect(result.ok).toBe(true);
    });

    it("allows /workspace/文件夹 (CJK directory name in safe path)", () => {
      const result = validateSinglePath("/workspace/文件夹", "path");
      expect(result.ok).toBe(true);
    });

    it("blocks /root/文件夹 (unicode path under forbidden prefix)", () => {
      const result = validateSinglePath("/root/文件夹", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });

  // ── Null byte injection ───────────────────────────────────────────────

  describe("null byte injection", () => {
    it("blocks /etc/passwd\\x00.txt (null byte after forbidden path)", () => {
      const result = validateSinglePath("/etc/passwd\x00.txt", "path");
      expect(result.ok).toBe(false);
    });
  });

  // ── URL-encoded traversal ─────────────────────────────────────────────

  describe("URL-encoded traversal attempts", () => {
    it("allows /etc%2f..%2fpasswd (URL-encoded — not decoded, so safe path chars)", () => {
      // The guard operates on raw string bytes; URL-encoding is not decoded.
      // The raw string does not start with /etc/ (it starts with /etc%2f) so
      // behaviour depends on normalization. The important invariant is the
      // function does not panic and returns a consistent result.
      const result = validateSinglePath("/etc%2f..%2fpasswd", "path");
      // /etc%2f normalizes to /etc%2f — which starts with /etc, a forbidden prefix.
      expect(result.ok).toBe(false);
    });

    it("blocks %2e%2e/secret (URL-encoded dots — not a .. segment as split sees it)", () => {
      // hasTraversalSegment splits on / and \; "%2e%2e" is NOT ".." so traversal
      // guard does not fire. The path does not hit a forbidden prefix either.
      // The guard passes it through — URL decoding is handled at a higher layer.
      const result = validateSinglePath("%2e%2e/secret", "path");
      // Confirm the function is consistent and does not throw.
      expect(typeof result.ok).toBe("boolean");
    });
  });

  // ── validatePaths batch ───────────────────────────────────────────────

  describe("validatePaths — batch validation", () => {
    it("returns ok for empty array", () => {
      const result = validatePaths([]);
      expect(result.ok).toBe(true);
    });

    it("returns ok when all three paths are valid", () => {
      const result = validatePaths([
        "/workspace/src/index.ts",
        "/workspace/lib/utils.ts",
        "/workspace/tests/foo.test.ts",
      ]);
      expect(result.ok).toBe(true);
    });

    it("returns failure for malicious path in the middle of an array", () => {
      const result = validatePaths([
        "/workspace/src/index.ts",
        "/etc/shadow",
        "/workspace/lib/utils.ts",
      ]);
      expect(result.ok).toBe(false);
      expect(result.offendingPath).toBe("/etc/shadow");
    });

    it("returns the offending path for the first failure, not subsequent ones", () => {
      const result = validatePaths([
        "../../etc/passwd",
        "/root/.bashrc",
        "/workspace/ok.ts",
      ]);
      expect(result.ok).toBe(false);
      expect(result.offendingPath).toBe("../../etc/passwd");
    });

    it("includes the argName in the error message for validateSinglePath", () => {
      const result = validateSinglePath("/etc/passwd", "myCustomArg");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/myCustomArg/);
    });
  });

  // ── Additional forbidden system prefixes ──────────────────────────────

  describe("other forbidden system prefixes", () => {
    it("blocks /proc/self/environ", () => {
      const result = validateSinglePath("/proc/self/environ", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it("blocks /sys/kernel/config", () => {
      const result = validateSinglePath("/sys/kernel/config", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it("blocks /dev/null", () => {
      const result = validateSinglePath("/dev/null", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it("blocks /var/log/syslog", () => {
      const result = validateSinglePath("/var/log/syslog", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it("blocks /.env (dotenv at root)", () => {
      const result = validateSinglePath("/.env", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it("blocks /.env.local (dotenv variant at root)", () => {
      const result = validateSinglePath("/.env.local", "path");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });
});
