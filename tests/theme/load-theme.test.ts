import { describe, it, expect } from "vitest";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTheme } from "../../src/theme/load-theme.js";
import { DEFAULT_TOKENS } from "../../src/theme/tokens.js";

describe("loadTheme", () => {
  it("round-trips a partial theme from a temp file", async () => {
    const tmpPath = join(tmpdir(), `quire-test-theme-${Date.now()}.yaml`);
    try {
      await writeFile(tmpPath, "colors:\n  link: \"#abcdef\"\n", "utf8");
      const result = await loadTheme(tmpPath);
      expect(result.colors.link).toBe("#abcdef");
      expect(result.colors.text).toBe(DEFAULT_TOKENS.colors.text);
      expect(result.typography.bodyFont).toBe(DEFAULT_TOKENS.typography.bodyFont);
    } finally {
      await rm(tmpPath, { force: true });
    }
  });

  it("missing file throws an error mentioning the path", async () => {
    const missingPath = "/tmp/quire-nonexistent-theme-file.yaml";
    await expect(loadTheme(missingPath)).rejects.toThrow(/quire-nonexistent-theme-file/);
  });
});
