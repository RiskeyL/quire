import { describe, it, expect } from "vitest";
import { serializeTheme } from "../../src/theme/serialize-theme.js";
import { parseTheme, DEFAULT_TOKENS, type BrandTokens } from "../../src/theme/tokens.js";

describe("serializeTheme", () => {
  it("round-trips DEFAULT_TOKENS through parseTheme", () => {
    expect(parseTheme(serializeTheme(DEFAULT_TOKENS))).toEqual(DEFAULT_TOKENS);
  });

  it("round-trips a fully-customized token set", () => {
    const custom: BrandTokens = {
      ...DEFAULT_TOKENS,
      page: { size: "Letter", margin: "1in" },
      colors: { ...DEFAULT_TOKENS.colors, accent: "#0033ff", surface: "#ffffff" },
      semantic: { info: "#0a0a04", success: "#0a0a01", caution: "#0a0a02", danger: "#0a0a03" },
      shape: { radius: "0" },
      typography: { bodyFont: "Inter, sans-serif", headingFont: "Söhne, sans-serif", monoFont: "Fira Code, monospace", baseSize: "12pt", lineHeight: 1.6 },
      toc: { title: "Table of Contents", depth: 4 },
      headings: { scale: [3, 2, 1.5, 1.2, 1, 0.9], weight: [800, 800, 700, 600, 600, 500] },
      links: { underline: false },
      density: "compact",
      header: { left: "none", center: "docTitle", right: "pageNumber" },
      footer: { left: "Confidential", center: "none", right: "pageNumber" },
      furniture: { fontSize: "8pt", color: "#999999" },
      pageNumbers: { restartAtBody: false },
      meta: { showDescription: false },
      tables: { layout: "auto" },
      cover: { layout: "plain", spineWidth: "20mm", logoWidth: "30mm", titleAnchor: "center", align: "center" },
      badges: { color: "#ff0000" },
      components: { gap: 1.5 },
      brand: { logo: "./logo.png", productName: "Dify" },
    };
    expect(parseTheme(serializeTheme(custom))).toEqual(custom);
  });

  it("emits notes as a comment block that parseTheme ignores", () => {
    const out = serializeTheme(DEFAULT_TOKENS, "First note line.\nSecond line.");
    expect(out).toContain("# Notes:");
    expect(out).toContain("# First note line.");
    expect(out).toContain("# Second line.");
    expect(parseTheme(out)).toEqual(DEFAULT_TOKENS); // notes are comments, ignored
  });

  it("omits the brand block when brand is empty", () => {
    const out = serializeTheme(DEFAULT_TOKENS); // DEFAULT_TOKENS.brand === {}
    expect(parseTheme(out).brand).toEqual({});
    // The brand: key should not appear in the output at all
    expect(out).not.toMatch(/^brand:/m);
  });

  it("round-trips a partial brand with logo only", () => {
    const tokens: BrandTokens = { ...DEFAULT_TOKENS, brand: { logo: "./my-logo.svg" } };
    const out = serializeTheme(tokens);
    const result = parseTheme(out);
    expect(result.brand.logo).toBe("./my-logo.svg");
    expect(result.brand.productName).toBeUndefined();
    expect(result).toEqual(tokens);
  });

  it("round-trips a partial brand with productName only", () => {
    const tokens: BrandTokens = { ...DEFAULT_TOKENS, brand: { productName: "My Product" } };
    expect(parseTheme(serializeTheme(tokens))).toEqual(tokens);
  });
});
