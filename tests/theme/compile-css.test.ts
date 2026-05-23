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

  describe("content: heading scale", () => {
    it("h1 has a font-size in em", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/h1\b[^{]*\{[^}]*font-size:\s*2em/);
    });

    it("h6 has a font-size in em", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/h6\b[^{]*\{[^}]*font-size:\s*0\.85em/);
    });

    it("headings have break-after: avoid", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("break-after: avoid");
    });

    it("h6 uses var(--color-muted)", () => {
      // h6 is rendered in muted tone
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/h6\b[^{]*\{[^}]*color:\s*var\(--color-muted\)/);
    });
  });

  describe("content: inline code and code blocks", () => {
    it("pre has white-space: pre-wrap", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("white-space: pre-wrap");
    });

    it("pre has overflow-wrap: anywhere", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("overflow-wrap: anywhere");
    });

    it("pre has padding", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bpre\b[^{]*\{[^}]*padding:/);
    });

    it("pre has border-radius", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bpre\b[^{]*\{[^}]*border-radius:/);
    });

    it("inline code has a background", () => {
      // A code rule (not pre code) that sets background
      const css = compileCss(DEFAULT_TOKENS);
      // The inline code rule should set a background; pre code resets it
      expect(css).toMatch(/:not\(pre\)\s*>\s*code[^{]*\{[^}]*background/);
    });

    it("pre code resets background to transparent", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/pre\s+code[^{]*\{[^}]*background:\s*transparent/);
    });

    it("pre code resets padding to 0", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/pre\s+code[^{]*\{[^}]*padding:\s*0/);
    });
  });

  describe("content: tables", () => {
    it("table has border-collapse: collapse", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("border-collapse: collapse");
    });

    it("table has width: 100%", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\btable\b[^{]*\{[^}]*width:\s*100%/);
    });

    it("th and td have padding", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/th\b[^,{]*,\s*td\b[^{]*\{[^}]*padding:/);
    });

    it("th and td have a border", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/th\b[^,{]*,\s*td\b[^{]*\{[^}]*border:/);
    });

    it("th has a background", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bth\b[^{]*\{[^}]*background:/);
    });

    it("only the header row is protected from breaking (thead tr)", () => {
      // Body rows are allowed to break so a tall tbody cell does not leave a gap.
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/thead\s+tr[^{]*\{[^}]*break-inside:\s*avoid/);
    });
  });

  describe("content: blockquote", () => {
    it("blockquote uses var(--color-accent) for border-left", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /blockquote[^{]*\{[^}]*border-left[^:]*:[^;]*var\(--color-accent\)/
      );
    });

    it("blockquote uses var(--color-muted) for color", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /blockquote[^{]*\{[^}]*color:\s*var\(--color-muted\)/
      );
    });

    it("blockquote has padding-left", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/blockquote[^{]*\{[^}]*padding-left:/);
    });
  });

  describe("content: lists", () => {
    it("ul and ol have padding-left", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bul\b[^,{]*,\s*ol\b[^{]*\{[^}]*padding-left:/);
    });

    it("li has a bottom margin", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bli\b[^{]*\{[^}]*margin-bottom:/);
    });
  });

  describe("content: hr", () => {
    it("hr has border-top", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bhr\b[^{]*\{[^}]*border-top:/);
    });

    it("hr resets border to 0 or none on non-top sides", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bhr\b[^{]*\{[^}]*border:\s*(0|none)/);
    });
  });

  describe("content: images", () => {
    it("img has max-width: 100%", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bimg\b[^{]*\{[^}]*max-width:\s*100%/);
    });

    it("img has height: auto", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bimg\b[^{]*\{[^}]*height:\s*auto/);
    });

    it("img has display: block", () => {
      // display: block removes the inline descender gap below images in print.
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bimg\b[^{]*\{[^}]*display:\s*block/);
    });
  });

  describe("content: vertical rhythm", () => {
    it("p has a margin-bottom", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\bp\b[^{]*\{[^}]*margin-bottom:/);
    });

    it("section first-child top margin is reset to 0", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("margin-top: 0");
    });
  });

  describe("boxed: callouts", () => {
    it("emits a base .callout rule with padding and a left border", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toMatch(/\.callout\b[^{]*\{[^}]*padding:/);
      expect(css).toMatch(/\.callout\b[^{]*\{[^}]*border-left:/);
    });

    it(".callout uses break-inside: avoid", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.callout\b[^{]*\{[^}]*break-inside:\s*avoid/
      );
    });

    it("emits a .callout-label rule that is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.callout-label[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });

    it(".callout-info border uses var(--color-accent)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.callout-info[^{]*\{[^}]*border-left-color:\s*var\(--color-accent\)/
      );
    });

    it(".callout-note border uses var(--color-muted)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.callout-note[^{]*\{[^}]*border-left-color:\s*var\(--color-muted\)/
      );
    });

    it(".callout-warning sets a left-border color", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.callout-warning[^{]*\{[^}]*border-left-color:/
      );
    });

    it(".callout-danger and .callout-check set a left-border color", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toMatch(/\.callout-danger[^{]*\{[^}]*border-left-color:/);
      expect(css).toMatch(/\.callout-check[^{]*\{[^}]*border-left-color:/);
    });
  });

  describe("boxed: panel and update", () => {
    it("emits a .panel rule with a border", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.panel\b[^{]*\{[^}]*border:/);
    });

    it("emits an .update rule with a left rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.update\b[^{]*\{[^}]*border-left:/
      );
    });

    it("emits an .update-label rule that is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.update-label[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });
  });

  describe("TOC rules are not overridden by generic list rules", () => {
    it(".toc ul rule for list-style: none is still present", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".toc ul");
      expect(compileCss(DEFAULT_TOKENS)).toContain("list-style: none");
    });

    it(".toc-section > ul rule is still present", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".toc-section > ul");
    });

    it(".toc li rule is still present", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".toc li");
    });
  });
});
