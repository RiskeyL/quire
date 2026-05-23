import { describe, it, expect } from "vitest";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTheme, loadTheme, DEFAULT_TOKENS } from "../../src/theme/tokens.js";

describe("parseTheme", () => {
  it("empty string returns DEFAULT_TOKENS", () => {
    expect(parseTheme("")).toEqual(DEFAULT_TOKENS);
  });

  it("whitespace-only string returns DEFAULT_TOKENS", () => {
    expect(parseTheme("   \n\n  ")).toEqual(DEFAULT_TOKENS);
  });

  it("comment-only YAML returns DEFAULT_TOKENS", () => {
    expect(parseTheme("# just a comment\n")).toEqual(DEFAULT_TOKENS);
  });

  it("partial override: colors.link only, all other fields default", () => {
    const result = parseTheme("colors:\n  link: \"#ff0000\"\n");
    expect(result.colors.link).toBe("#ff0000");
    // Other color fields unchanged
    expect(result.colors.text).toBe(DEFAULT_TOKENS.colors.text);
    expect(result.colors.heading).toBe(DEFAULT_TOKENS.colors.heading);
    expect(result.colors.accent).toBe(DEFAULT_TOKENS.colors.accent);
    expect(result.colors.muted).toBe(DEFAULT_TOKENS.colors.muted);
    // Unrelated sections unchanged
    expect(result.typography.bodyFont).toBe(DEFAULT_TOKENS.typography.bodyFont);
    expect(result.page.size).toBe(DEFAULT_TOKENS.page.size);
    expect(result.toc.title).toBe(DEFAULT_TOKENS.toc.title);
  });

  it("partial override: typography.lineHeight only", () => {
    const result = parseTheme("typography:\n  lineHeight: 1.8\n");
    expect(result.typography.lineHeight).toBe(1.8);
    expect(result.typography.bodyFont).toBe(DEFAULT_TOKENS.typography.bodyFont);
    expect(result.typography.headingFont).toBe(DEFAULT_TOKENS.typography.headingFont);
    expect(result.typography.monoFont).toBe(DEFAULT_TOKENS.typography.monoFont);
    expect(result.typography.baseSize).toBe(DEFAULT_TOKENS.typography.baseSize);
  });

  it("page.size: Letter is accepted", () => {
    const result = parseTheme("page:\n  size: Letter\n");
    expect(result.page.size).toBe("Letter");
    expect(result.page.margin).toBe(DEFAULT_TOKENS.page.margin);
  });

  it("page.size: invalid value throws error naming page.size and allowed values", () => {
    const fn = () => parseTheme("page:\n  size: A3\n");
    expect(fn).toThrow(/page\.size/);
    expect(fn).toThrow(/A4.*Letter|Letter.*A4/);
  });

  it("wrong type: typography.lineHeight as string throws error naming the field", () => {
    const fn = () => parseTheme("typography:\n  lineHeight: \"big\"\n");
    expect(fn).toThrow(/typography\.lineHeight/);
    expect(fn).toThrow(/number/);
  });

  it("unknown top-level key throws a readable error", () => {
    expect(() => parseTheme("colrs:\n  text: \"#000\"\n")).toThrow(/colrs/);
  });

  it("unknown nested key throws a readable error", () => {
    expect(() => parseTheme("typography:\n  fontBody: Georgia\n")).toThrow(/fontBody/);
  });

  it("malformed YAML throws a clear parse error", () => {
    expect(() => parseTheme("colors: [unclosed")).toThrow(/parse|YAML|yaml/i);
  });
});

describe("parseTheme — meta.showDescription token", () => {
  it("absent meta keeps showDescription at default true", () => {
    const result = parseTheme("");
    expect(result.meta.showDescription).toBe(true);
  });

  it("meta: { showDescription: false } overrides default true", () => {
    const result = parseTheme("meta:\n  showDescription: false\n");
    expect(result.meta.showDescription).toBe(false);
    // All other sections stay at defaults
    expect(result.colors.text).toBe(DEFAULT_TOKENS.colors.text);
    expect(result.toc.title).toBe(DEFAULT_TOKENS.toc.title);
  });

  it("meta: { showDescription: true } keeps the default value", () => {
    const result = parseTheme("meta:\n  showDescription: true\n");
    expect(result.meta.showDescription).toBe(true);
  });

  it("unknown key under meta is rejected (strict schema)", () => {
    expect(() => parseTheme("meta:\n  unknownKey: true\n")).toThrow(/unknownKey/);
  });
});

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
