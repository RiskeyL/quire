import { describe, it, expect } from "vitest";
import { parseRunConfig, mergeRunConfig } from "../../src/commands/run-config.js";

describe("parseRunConfig", () => {
  it("parses a valid config into a partial options object", () => {
    const cfg = parseRunConfig(
      ["format: pdf", "theme: brand.yaml", "root: .", "cover: false", "offline: true"].join("\n")
    );
    expect(cfg).toEqual({
      format: "pdf",
      theme: "brand.yaml",
      root: ".",
      cover: false,
      offline: true,
    });
  });

  it("accepts a baseUrl string", () => {
    expect(parseRunConfig("baseUrl: https://docs.dify.ai")).toEqual({
      baseUrl: "https://docs.dify.ai",
    });
  });

  it("accepts docVersion and date strings for the cover", () => {
    expect(parseRunConfig("docVersion: 1.14.2\ndate: 2026-05-25")).toEqual({
      docVersion: "1.14.2",
      date: "2026-05-25",
    });
  });

  it("treats an empty or null document as an empty config", () => {
    expect(parseRunConfig("")).toEqual({});
    expect(parseRunConfig("# just a comment\n")).toEqual({});
  });

  it("rejects an unknown key with a clear message", () => {
    expect(() => parseRunConfig("formats: pdf")).toThrow(/unknown option "formats"/);
  });

  it("rejects a wrong-typed value", () => {
    expect(() => parseRunConfig("cover: yes-please")).toThrow(/cover must be a boolean/);
  });

  it("rejects an invalid format enum", () => {
    expect(() => parseRunConfig("format: word")).toThrow(/format must be/);
  });
});

describe("mergeRunConfig", () => {
  const cliDefaults = { format: "both", cover: true, toc: true };

  it("uses an explicitly-set CLI flag over the file", () => {
    const merged = mergeRunConfig(
      { format: "pdf" },
      { ...cliDefaults, format: "docx" },
      (k) => k === "format" // format was set on the CLI
    );
    expect(merged.format).toBe("docx");
  });

  it("uses the file value when the CLI flag was not explicitly set", () => {
    const merged = mergeRunConfig(
      { format: "pdf", theme: "brand.yaml" },
      { ...cliDefaults },
      () => false // nothing set on the CLI
    );
    expect(merged.format).toBe("pdf");
    expect(merged.theme).toBe("brand.yaml");
  });

  it("falls back to the CLI/commander default when neither file nor CLI provides it", () => {
    const merged = mergeRunConfig({}, { ...cliDefaults }, () => false);
    expect(merged.format).toBe("both");
    expect(merged.cover).toBe(true);
  });

  it("lets the file turn off a negation-flag default (cover: false)", () => {
    const merged = mergeRunConfig({ cover: false }, { ...cliDefaults }, () => false);
    expect(merged.cover).toBe(false);
  });

  it("lets an explicit CLI --no-cover override a file cover: true", () => {
    const merged = mergeRunConfig(
      { cover: true },
      { ...cliDefaults, cover: false },
      (k) => k === "cover"
    );
    expect(merged.cover).toBe(false);
  });
});
