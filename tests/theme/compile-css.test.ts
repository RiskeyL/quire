import { describe, it, expect } from "vitest";
import { compileCss } from "../../src/theme/compile-css.js";
import { DEFAULT_TOKENS, type BrandTokens } from "../../src/theme/tokens.js";

describe("compileCss", () => {
  describe("default tokens: custom properties", () => {
    it("emits --color-text with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("--color-text: #1a1a1a");
    });

    it("emits --color-link with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("--color-link: #2563eb");
    });

    it("emits --color-heading with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("--color-heading: #111827");
    });

    it("emits --color-accent with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("--color-accent: #2563eb");
    });

    it("emits --color-muted with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("--color-muted: #6b7280");
    });

    it("emits --font-body with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(
        "--font-body: Georgia, 'Times New Roman', serif"
      );
    });

    it("emits --font-heading with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(
        "--font-heading: Helvetica, Arial, sans-serif"
      );
    });

    it("emits --font-mono with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(
        "--font-mono: 'SFMono-Regular', Consolas, monospace"
      );
    });

    it("emits --base-size with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("--base-size: 11pt");
    });

    it("emits --line-height with default value", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("--line-height: 1.5");
    });
  });

  describe("default tokens: @page block uses literal values", () => {
    it("emits @page with literal size: A4", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("size: A4");
    });

    it("emits @page with literal margin: 2cm", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("margin: 2cm");
    });

    it("does NOT emit var() inside @page", () => {
      const css = compileCss(DEFAULT_TOKENS);
      // Extract the @page block to check it doesn't use var()
      const pageBlock = css.match(/@page\s*\{[^}]*\}/)?.[0] ?? "";
      expect(pageBlock).not.toContain("var(");
    });
  });

  describe("default tokens: token-driven body rules use custom properties", () => {
    it("body rule uses var(--font-body)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("font-family: var(--font-body)");
    });

    it("body rule uses var(--base-size)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("font-size: var(--base-size)");
    });

    it("body rule uses var(--line-height)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("line-height: var(--line-height)");
    });

    it("body rule uses var(--color-text)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("color: var(--color-text)");
    });

    it("heading rule uses var(--font-heading)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("font-family: var(--font-heading)");
    });

    it("heading rule uses var(--color-heading)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("color: var(--color-heading)");
    });

    it("link rule uses var(--color-link)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("color: var(--color-link)");
    });

    it("pre/code rule uses var(--font-mono)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("font-family: var(--font-mono)");
    });
  });

  describe("structural rules preserved verbatim", () => {
    it("emits .cover { break-after: page; }", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("break-after: page");
    });

    it("emits .toc break-after rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".toc");
    });

    it("emits target-counter rule exactly", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(
        "content: target-counter(attr(href), page)"
      );
    });

    it("emits .toc-section > ul rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".toc-section > ul");
    });

    it("emits .toc-page a with color: inherit", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("color: inherit");
    });

    it("emits .toc ul with list-style: none", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("list-style: none");
    });

    it("emits .toc-section > span with font-weight: bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("font-weight: bold");
    });
  });

  describe("non-default token overrides are reflected", () => {
    const customTokens: BrandTokens = {
      ...DEFAULT_TOKENS,
      page: { size: "Letter", margin: "1in" },
      colors: {
        ...DEFAULT_TOKENS.colors,
        link: "#ff0000",
      },
      typography: {
        ...DEFAULT_TOKENS.typography,
        baseSize: "12pt",
        bodyFont: "Arial, sans-serif",
      },
    };

    it("@page uses literal size: Letter", () => {
      expect(compileCss(customTokens)).toContain("size: Letter");
    });

    it("@page uses literal margin: 1in", () => {
      expect(compileCss(customTokens)).toContain("margin: 1in");
    });

    it("@page does NOT contain default size A4", () => {
      const css = compileCss(customTokens);
      const pageBlock = css.match(/@page\s*\{[^}]*\}/)?.[0] ?? "";
      expect(pageBlock).not.toContain("A4");
    });

    it("--color-link reflects override", () => {
      expect(compileCss(customTokens)).toContain("--color-link: #ff0000");
    });

    it("--base-size reflects override", () => {
      expect(compileCss(customTokens)).toContain("--base-size: 12pt");
    });

    it("--font-body reflects override", () => {
      expect(compileCss(customTokens)).toContain("--font-body: Arial, sans-serif");
    });

    it("unoverridden colors remain at default values", () => {
      expect(compileCss(customTokens)).toContain("--color-text: #1a1a1a");
      expect(compileCss(customTokens)).toContain("--color-heading: #111827");
    });
  });

  describe("heading selector covers h1–h6", () => {
    it("heading rule targets h4", () => {
      // Expanded from h1,h2,h3 to h1–h6 to cover demotion output
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/h4/);
    });

    it("heading rule targets h5 and h6", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/h5/);
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/h6/);
    });
  });
});
