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
        "--font-mono: Consolas, 'SF Mono', Menlo, monospace"
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
      // Extract the size/margin @page block to check it doesn't use var().
      const pageBlock = css.match(/@page\s*\{[^}]*\}/)?.[0] ?? "";
      expect(pageBlock).not.toContain("var(");
    });

    it("does NOT emit var() anywhere inside any @page rule (including margin boxes)", () => {
      // Paged.js does not reliably resolve custom properties inside @page, and
      // the running-header margin boxes must use literal values only. Scan from
      // each "@page" keyword to the end and assert the margin-box descriptors
      // (which sit between @page and the next top-level rule) carry no var().
      const css = compileCss(DEFAULT_TOKENS);
      // The margin-box keywords only ever appear inside @page rules.
      const marginBoxArea = css.slice(css.indexOf("@top-left"));
      expect(marginBoxArea).toContain("@top-left");
      // Restrict to the furniture region: everything up to the first non-@page
      // selector after the cover block. The named-string element rules sit
      // before @top-left, so checking the margin-box descriptors specifically:
      const furnitureLines = css
        .split("\n")
        .filter((l) => /@(top-left|top-right|bottom-center)/.test(l));
      expect(furnitureLines.length).toBeGreaterThan(0);
      for (const line of furnitureLines) {
        expect(line).not.toContain("var(");
      }
    });
  });

  describe("Part C: running headers/footers (page furniture)", () => {
    it("captures the document title as the doctitle named string from .doc-title", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.doc-title[^{]*\{[^}]*string-set:\s*doctitle content\(\)/
      );
    });

    it("captures the chapter title as the chaptertitle named string from .chapter-start", () => {
      // Only depth-0 chapters carry .chapter-start, so the running header tracks
      // the current top-level chapter (not per-page titles), matching the Word
      // side's STYLEREF "Heading 1".
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.chapter-start[^{]*\{[^}]*string-set:\s*chaptertitle content\(\)/
      );
    });

    it("puts the page number at @bottom-center via counter(page)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /@bottom-center\s*\{[^}]*content:\s*counter\(page\)/
      );
    });

    it("puts the document title at @top-left via string(doctitle)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /@top-left\s*\{[^}]*content:\s*string\(doctitle\)/
      );
    });

    it("puts the chapter title at @top-right via string(chaptertitle, first)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /@top-right\s*\{[^}]*content:\s*string\(chaptertitle,\s*first\)/
      );
    });

    it("styles margin boxes with a literal small font-size and muted gray", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toMatch(/@bottom-center\s*\{[^}]*font-size:\s*9pt/);
      expect(css).toMatch(/@bottom-center\s*\{[^}]*color:\s*#6b7280/);
    });

    it("gives the cover its own named page that suppresses the furniture", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toMatch(/\.cover[^{]*\{[^}]*page:\s*cover/);
      expect(css).toContain("@page cover");
      // All three margin boxes are emptied on the cover.
      const coverBlock = css.slice(css.indexOf("@page cover"));
      expect(coverBlock).toMatch(/@top-left\s*\{[^}]*content:\s*none/);
      expect(coverBlock).toMatch(/@top-right\s*\{[^}]*content:\s*none/);
      expect(coverBlock).toMatch(/@bottom-center\s*\{[^}]*content:\s*none/);
    });

    it("makes the cover full-bleed with a brand-color spine spanning the page height", () => {
      const css = compileCss(DEFAULT_TOKENS);
      // The cover page drops its margin so the spine reaches the physical edges.
      const coverPage = css.slice(css.indexOf("@page cover"));
      expect(coverPage).toMatch(/margin:\s*0/);
      // The cover is a flex row with an explicit A4 sheet height, so the spine
      // spans top-to-bottom (vh is unreliable in Paged.js).
      expect(css).toMatch(/\.cover\s*\{[^}]*display:\s*flex/);
      expect(css).toMatch(/\.cover\s*\{[^}]*height:\s*297mm/);
      // The spine is a fixed-width bar in the brand accent color.
      expect(css).toMatch(/\.cover-spine\s*\{[^}]*background:\s*var\(--color-accent\)/);
    });

    it("uses the Letter sheet height for the cover when page.size is Letter", () => {
      const letter = {
        ...DEFAULT_TOKENS,
        page: { ...DEFAULT_TOKENS.page, size: "Letter" as const },
      };
      expect(compileCss(letter)).toMatch(/\.cover\s*\{[^}]*height:\s*11in/);
    });

    it("gives the TOC its own named page that suppresses the furniture", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toMatch(/\.toc[^{]*\{[^}]*page:\s*toc/);
      expect(css).toContain("@page toc");
      // All three margin boxes are emptied on the TOC, like the cover, so the
      // running header/footer only appears from the body.
      const tocBlock = css.slice(css.indexOf("@page toc"));
      expect(tocBlock).toMatch(/@top-left\s*\{[^}]*content:\s*none/);
      expect(tocBlock).toMatch(/@top-right\s*\{[^}]*content:\s*none/);
      expect(tocBlock).toMatch(/@bottom-center\s*\{[^}]*content:\s*none/);
    });

    it("restarts page numbering at the body via .doc-body { counter-reset: page 1 }", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.doc-body\s*\{[^}]*counter-reset:\s*page\s+1/
      );
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

    it("emits .chapter-start { break-before: page } so each top-level chapter starts on a new page", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.chapter-start\b[^{]*\{[^}]*break-before:\s*page/
      );
    });

    it("emits target-counter rule exactly", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(
        "content: target-counter(attr(href), page)"
      );
    });

    it("applies the target-counter page number to .toc-entry links", () => {
      // Every heading-based TOC entry is a link, so the page-number rule must
      // be keyed off .toc-entry a (not the legacy .toc-page a).
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.toc-entry a::after[^{]*\{[^}]*content:\s*target-counter\(attr\(href\), page\)/
      );
    });

    it("emits a nested .toc-entry ul indent rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.toc-entry ul[^{]*\{[^}]*padding-left:/);
    });

    it("emits .toc-entry a with color: inherit", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.toc-entry a[^{]*\{[^}]*color:\s*inherit/);
    });

    it("emits .toc ul with list-style: none", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("list-style: none");
    });

    it("emits a bold tier-1 entry rule (.toc-level-1)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.toc-level-1[^{]*\{[^}]*font-weight:\s*bold/);
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

    it("code block and inline code share the same background (matches the Word fill)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      // Both pre and inline code use var(--color-surface) (= #f2f2f2), which is also
      // the Word SourceCode/VerbatimChar shading fill.
      expect(css).toMatch(/pre\s*\{[^}]*background:\s*var\(--color-surface\)/);
      expect(css).toMatch(/:not\(pre\)\s*>\s*code[^{]*\{[^}]*background:\s*var\(--color-surface\)/);
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

    it("table uses table-layout: fixed by default (token-driven)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\btable\b[^{]*\{[^}]*table-layout:\s*fixed/);
    });

    it("table-layout reflects the tables.layout token when set to auto", () => {
      const tokens = { ...DEFAULT_TOKENS, tables: { layout: "auto" as const } };
      expect(compileCss(tokens)).toMatch(/\btable\b[^{]*\{[^}]*table-layout:\s*auto/);
    });

    it("th and td wrap long content (overflow-wrap: anywhere)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /th\b[^,{]*,\s*td\b[^{]*\{[^}]*overflow-wrap:\s*anywhere/
      );
    });

    it("inline code wraps long tokens (overflow-wrap: anywhere)", () => {
      // The overflowing env-vars-table content is an inline <code>; it must wrap
      // so it cannot force a column past the page edge.
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /:not\(pre\)\s*>\s*code[^{]*\{[^}]*overflow-wrap:\s*anywhere/
      );
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

    it(".callout-info border uses var(--semantic-info)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.callout-info[^{]*\{[^}]*border-left-color:\s*var\(--semantic-info\)/
      );
    });

    it(".callout-tip border uses var(--semantic-success)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.callout-tip[^{]*\{[^}]*border-left-color:\s*var\(--semantic-success\)/
      );
    });

    it(".callout-note border uses var(--semantic-caution)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.callout-note[^{]*\{[^}]*border-left-color:\s*var\(--semantic-caution\)/
      );
    });

    it(".callout-warning border uses var(--semantic-danger)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.callout-warning[^{]*\{[^}]*border-left-color:\s*var\(--semantic-danger\)/
      );
    });

    it(".callout-danger uses var(--semantic-danger) and .callout-check uses var(--semantic-success)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toMatch(/\.callout-danger[^{]*\{[^}]*border-left-color:\s*var\(--semantic-danger\)/);
      expect(css).toMatch(/\.callout-check[^{]*\{[^}]*border-left-color:\s*var\(--semantic-success\)/);
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

  describe("figure: Frame component", () => {
    it("emits a .frame rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".frame");
    });

    it(".frame uses break-inside: avoid", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.frame\b[^{]*\{[^}]*break-inside:\s*avoid/
      );
    });

    it(".frame has text-align: center", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.frame\b[^{]*\{[^}]*text-align:\s*center/
      );
    });

    it("emits a figcaption rule that uses var(--color-muted)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /figcaption[^{]*\{[^}]*color:\s*var\(--color-muted\)/
      );
    });
  });

  describe("mermaid: rasterized diagram image", () => {
    it("emits a .mermaid-diagram rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.mermaid-diagram\b[^{]*\{/);
    });

    it(".mermaid-diagram is a centered block image (display: block, margin auto)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.mermaid-diagram\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/display:\s*block/);
      expect(rule).toMatch(/margin:\s*[^;]*auto/);
    });

    it(".mermaid-diagram has max-width: 100% and height: auto", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.mermaid-diagram\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/max-width:\s*100%/);
      expect(rule).toMatch(/height:\s*auto/);
    });

    it(".mermaid-diagram uses break-inside: avoid (a diagram is atomic)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.mermaid-diagram\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/break-inside:\s*avoid/);
    });
  });

  describe("TOC rules are not overridden by generic list rules", () => {
    it(".toc ul rule for list-style: none is still present", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".toc ul");
      expect(compileCss(DEFAULT_TOKENS)).toContain("list-style: none");
    });

    it(".toc-entry ul nested-indent rule is still present", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".toc-entry ul");
    });

    it(".toc li rule is still present", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".toc li");
    });
  });

  describe("disclosure: Tab, Accordion, Expandable panels", () => {
    it("emits a .tab rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.tab\b[^{]*\{/);
    });

    it(".tab has a top border or left border (hairline rule)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      // Accept either border-top or border-left as the hairline separator
      const tabRule = css.match(/\.tab\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(tabRule).toMatch(/border-(top|left):/);
    });

    it(".tab-label is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.tab-label[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });

    it("emits an .accordion rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.accordion\b[^{]*\{/);
    });

    it(".accordion-label is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.accordion-label[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });

    it("emits an .expandable rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.expandable\b[^{]*\{/);
    });

    it(".expandable-label is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.expandable-label[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });

    it("emits a .tabs container rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.tabs\b[^{]*\{/);
    });

    it("emits an .accordion-group container rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.accordion-group\b[^{]*\{/);
    });

    it(".expandable uses break-inside: avoid (reliably short API param sub-objects)", () => {
      // The standalone .expandable rule carries break-inside: avoid;
      // .tab/.accordion intentionally do not (asserted below). Scan every
      // `.expandable { ... }` block and require at least one to declare it.
      const css = compileCss(DEFAULT_TOKENS);
      const expandableRules = css.match(/\.expandable\s*\{[^}]*\}/g) ?? [];
      expect(expandableRules.some((r) => /break-inside:\s*avoid/.test(r))).toBe(true);
    });

    it(".tab/.accordion do NOT carry break-inside: avoid (tall panels may break across pages)", () => {
      // The shared panel rule (.tab, .accordion, .expandable { ... }) must not
      // declare break-inside; only the separate .expandable rule does.
      const css = compileCss(DEFAULT_TOKENS);
      const sharedPanelRule =
        css.match(/\.tab,\s*\.accordion,\s*\.expandable,\s*\.view\s*\{[^}]*\}/)?.[0] ?? "";
      expect(sharedPanelRule).not.toBe("");
      expect(sharedPanelRule).not.toMatch(/break-inside:\s*avoid/);
    });

    it("disclosure labels use break-after: avoid (label stays with its body)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const labelRule =
        css.match(/\.tab-label,\s*\.accordion-label,\s*\.expandable-label,\s*\.view-label\s*\{[^}]*\}/)?.[0] ?? "";
      expect(labelRule).toMatch(/break-after:\s*avoid/);
    });
  });

  describe("steps: Steps/Step component", () => {
    it("emits a .steps rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.steps\b[^{]*\{/);
    });

    it(".steps has padding-left for number indent", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.steps\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/padding-left:/);
    });

    it(".steps has vertical margin for spacing between list and surroundings", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.steps\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/margin:/);
    });

    it("emits a .step rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.step\b[^{]*\{/);
    });

    it(".step has vertical spacing (margin or padding)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.step\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/(margin|padding):/);
    });

    it("emits a .step-title rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.step-title\b[^{]*\{/);
    });

    it(".step-title is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.step-title[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });

    it(".step-title has break-after: avoid (keeps title with its body)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.step-title\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/break-after:\s*avoid/);
    });

    it(".step does NOT have break-inside: avoid (step bodies can be long)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.step\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).not.toMatch(/break-inside:\s*avoid/);
    });

    it(".steps does not conflict with generic ol rule (specificity check: .steps uses class selector)", () => {
      // .steps is a class selector — higher specificity than the bare `ol` rule,
      // so its padding-left wins without needing !important.
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toMatch(/\.steps\b/);
      expect(css).toMatch(/\bol\b/);
    });
  });

  describe("cards: Card/CardGroup, Columns/Column, Tile", () => {
    it("emits a .card rule with a border", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.card\b[^{]*\{[^}]*border:/);
    });

    it(".card has padding", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.card\b[^{]*\{[^}]*padding:/);
    });

    it(".card has a border-radius", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.card\b[^{]*\{[^}]*border-radius:/);
    });

    it(".card has vertical margin", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.card\b[^{]*\{[^}]*margin:/);
    });

    it("emits a .card-title rule that is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.card-title[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });

    it("emits a .card-href rule that uses var(--color-muted)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.card-href[^{]*\{[^}]*color:\s*var\(--color-muted\)/
      );
    });

    it(".card-href has a smaller font-size", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.card-href[^{]*\{[^}]*font-size:/
      );
    });

    it("emits a .card-group rule with vertical spacing", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.card-group\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).not.toBe("");
      expect(rule).toMatch(/(margin|gap|padding):/);
    });

    it("emits a .columns rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.columns\b[^{]*\{/);
    });

    it(".columns has vertical spacing", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.columns\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/(margin|gap|padding):/);
    });

    it("emits a .column rule (block display)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.column\b[^{]*\{/);
    });

    it("emits a .tile rule with a border", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.tile\b[^{]*\{[^}]*border:/);
    });

    it(".tile-title is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.tile-title[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });

    it(".tile-href uses var(--color-muted)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.tile-href[^{]*\{[^}]*color:\s*var\(--color-muted\)/
      );
    });
  });

  describe("fields: ParamField/ResponseField and examples", () => {
    it("emits a .param-field rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.param-field\b[^{]*\{/);
    });

    it(".param-field has a hairline border-top separator", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.param-field\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/border-top:/);
    });

    it(".param-field does NOT carry break-inside: avoid (nested fields can be long)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.param-field\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).not.toMatch(/break-inside:\s*avoid/);
    });

    it("emits a .param-name rule that uses var(--font-mono)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.param-name[^{]*\{[^}]*font-family:\s*var\(--font-mono\)/
      );
    });

    it(".param-name is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.param-name[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });

    it(".param-name neutralizes the global inline-code pill (background: transparent)", () => {
      // .param-name is a real <code>, so the global :not(pre) > code rule would
      // otherwise give it a tinted, padded pill. The rule must reset it.
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.param-name\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/background:\s*transparent/);
    });

    it("emits a .param-type rule that uses var(--color-muted)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.param-type[^{]*\{[^}]*color:\s*var\(--color-muted\)/
      );
    });

    it("emits a .param-required badge rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.param-required\b[^{]*\{/);
    });

    it("emits a .param-deprecated badge rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.param-deprecated\b[^{]*\{/);
    });

    it("emits a .param-default rule that uses var(--color-muted)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.param-default[^{]*\{[^}]*color:\s*var\(--color-muted\)/
      );
    });

    it("emits a .param-body rule with a left indent", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.param-body\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).not.toBe("");
      expect(rule).toMatch(/(padding-left|margin-left):/);
    });

    it("emits an .example rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.example\b[^{]*\{/);
    });

    it("emits an .example-label rule that is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.example-label[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });
  });

  describe("code: CodeGroup and Prompt components", () => {
    it("emits a .code-group rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.code-group\b[^{]*\{/);
    });

    it(".code-group has vertical margin", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.code-group\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).not.toBe("");
      expect(rule).toMatch(/margin:/);
    });

    it("emits a .code-group-item rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.code-group-item\b[^{]*\{/);
    });

    it(".code-group-item has spacing between items", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.code-group-item\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).not.toBe("");
      expect(rule).toMatch(/(margin|padding)/);
    });

    it("emits a .code-label rule that uses var(--font-mono)", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.code-label[^{]*\{[^}]*font-family:\s*var\(--font-mono\)/
      );
    });

    it(".code-label uses var(--color-muted) for color", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.code-label[^{]*\{[^}]*color:\s*var\(--color-muted\)/
      );
    });

    it(".code-group and .code-group-item do NOT carry break-inside: avoid", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const groupRule = css.match(/\.code-group\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      const itemRule = css.match(/\.code-group-item\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(groupRule).not.toMatch(/break-inside:\s*avoid/);
      expect(itemRule).not.toMatch(/break-inside:\s*avoid/);
    });

    it("emits a .prompt rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.prompt\b[^{]*\{/);
    });

    it("emits a .prompt-label rule that is bold", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.prompt-label[^{]*\{[^}]*font-weight:\s*(bold|700)/
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Inline component rules: Badge, Tooltip
  // (Color is not implemented — block-level design tool, not inline author-placeable)
  // (Icon emits nothing, so no CSS rule needed)
  // ---------------------------------------------------------------------------

  describe("inline component rules (Badge, Tooltip)", () => {
    it("emits a .badge rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.badge\b[^{]*\{/);
    });

    it(".badge is display: inline or inline-block (inline element)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      // The badge selector rule must declare an inline display variant.
      expect(css).toMatch(/\.badge\b[^{]*\{[^}]*display:\s*inline/);
    });

    it(".badge has border-radius for the pill shape", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(
        /\.badge\b[^{]*\{[^}]*border-radius:/
      );
    });

    it(".badge uses var(--badge-color) for border and color (token-driven)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const badgeRule = css.match(/\.badge\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(badgeRule).toContain("var(--badge-color)");
    });

    it("emits a .tooltip rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.tooltip\b[^{]*\{/);
    });

    it("emits a .tooltip-tip rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.tooltip-tip\b[^{]*\{/);
    });

    it(".tooltip-tip uses var(--color-muted)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const tipRule = css.match(/\.tooltip-tip\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(tipRule).toContain("var(--color-muted)");
    });
  });

  // ---------------------------------------------------------------------------
  // Structural list component rules: Tree and CheckList
  // ---------------------------------------------------------------------------

  describe("structural: Tree component", () => {
    it("emits a .tree rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.tree\b[^{]*\{/);
    });

    it(".tree has list-style: none", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.tree\b[^{,]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/list-style:\s*none/);
    });

    it(".tree uses var(--font-mono) for the monospace font", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.tree\b[^,{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/font-family:\s*var\(--font-mono\)/);
    });

    it("nested .tree gets a left indent (padding-left)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      // A nested selector like ".tree .tree" or ".tree > .tree" must carry padding-left
      expect(css).toMatch(/\.tree\s+\.tree[^{]*\{[^}]*padding-left:/);
    });

    it("emits a .tree-name rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.tree-name\b[^{]*\{/);
    });

    it(".tree does NOT break TOC rules (list-style: none appears on .tree but .toc ul also has it)", () => {
      // Both .tree and .toc ul should appear independently
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toContain(".tree");
      expect(css).toContain(".toc ul");
    });
  });

  describe("page-description lede rule", () => {
    it("emits a .page-description rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.page-description\b[^{]*\{/);
    });

    it(".page-description uses var(--color-muted) for color", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.page-description\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toContain("var(--color-muted)");
    });

    it(".page-description has a margin-bottom (space below the lede)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.page-description\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/margin-bottom:/);
    });
  });

  describe("structural: CheckList component", () => {
    it("emits a .checklist rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.checklist\b[^{]*\{/);
    });

    it(".checklist has list-style: none", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.checklist\b[^{]*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/list-style:\s*none/);
    });

    it("emits a .checklist-item rule", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.checklist-item\b[^{]*\{/);
    });

    it("draws the checkbox as an empty bordered square (no ☐ glyph, no font dependency)", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const rule = css.match(/\.checklist-item::before\s*\{[^}]*\}/)?.[0] ?? "";
      expect(rule).toMatch(/\.checklist-item::before\s*\{/);
      // Empty content (not the ☐ character), so it stays out of extracted text and
      // does not rely on a font covering U+2610.
      expect(rule).toMatch(/content:\s*["']["']/);
      expect(rule).not.toContain("☐");
      // A real bordered box with width and height.
      expect(rule).toMatch(/border:\s*[^;]*solid/);
      expect(rule).toMatch(/width:/);
      expect(rule).toMatch(/height:/);
    });
  });

  describe("T2 tokens: links.underline", () => {
    it("links underline by default and can be turned off", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("a { color: var(--color-link); text-decoration: underline; }");
      const off: BrandTokens = { ...DEFAULT_TOKENS, links: { underline: false } };
      expect(compileCss(off)).toContain("a { color: var(--color-link); text-decoration: none; }");
    });
  });

  describe("T2 tokens: headings.scale and headings.weight", () => {
    it("heading sizes and weights come from the headings token", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toMatch(/h1\s*\{[^}]*font-size:\s*2em;\s*font-weight:\s*700;/);
      expect(css).toMatch(/h3\s*\{[^}]*font-size:\s*1\.25em;\s*font-weight:\s*600;/);
    });
    it("custom heading scale and weight flow through", () => {
      const custom: BrandTokens = {
        ...DEFAULT_TOKENS,
        headings: { scale: [3, 2, 1.5, 1.2, 1, 0.9], weight: [800, 800, 700, 600, 500, 400] },
      };
      const css = compileCss(custom);
      expect(css).toMatch(/h1\s*\{[^}]*font-size:\s*3em;\s*font-weight:\s*800;/);
      expect(css).toMatch(/h6\s*\{[^}]*font-size:\s*0\.9em;\s*font-weight:\s*400;/);
    });
  });

  describe("T1 tokens", () => {
    it("emits the new custom properties with defaults", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toContain("--color-surface: #f2f2f2");
      expect(css).toContain("--color-border: #d9d9d9");
      expect(css).toContain("--semantic-info: #2563eb");
      expect(css).toContain("--semantic-success: #15803d");
      expect(css).toContain("--semantic-caution: #b45309");
      expect(css).toContain("--semantic-danger: #b91c1c");
      expect(css).toContain("--radius: 4px");
    });
    it("surfaces and borders use the new vars", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toMatch(/\bpre\s*\{[^}]*background:\s*var\(--color-surface\)/);
      expect(css).toMatch(/th,\s*td\s*\{[^}]*border:\s*1px solid var\(--color-border\)/);
    });
    it("callout accents use the semantic vars", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toContain(".callout-info { border-left-color: var(--semantic-info); }");
      expect(css).toContain(".callout-tip { border-left-color: var(--semantic-success); }");
      expect(css).toContain(".callout-note { border-left-color: var(--semantic-caution); }");
      expect(css).toContain(".callout-warning { border-left-color: var(--semantic-danger); }");
      expect(css).toContain(".callout-danger { border-left-color: var(--semantic-danger); }");
      expect(css).toContain(".callout-check { border-left-color: var(--semantic-success); }");
    });
    it("custom surface override flows through", () => {
      const custom: BrandTokens = {
        ...DEFAULT_TOKENS,
        colors: { ...DEFAULT_TOKENS.colors, surface: "#C0FFEE" },
      };
      expect(compileCss(custom)).toContain("--color-surface: #C0FFEE");
    });
  });

  describe("T2.5 tokens: density vertical-rhythm preset", () => {
    it("density sets --rhythm and wraps the paragraph margin", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toContain("--rhythm: 1");
      expect(css).toContain("margin-bottom: calc(0.75em * var(--rhythm))");
      expect(compileCss({ ...DEFAULT_TOKENS, density: "compact" })).toContain("--rhythm: 0.7");
      expect(compileCss({ ...DEFAULT_TOKENS, density: "relaxed" })).toContain("--rhythm: 1.3");
    });
  });

  describe("T3.2 tokens: cover.spineWidth and cover.logoWidth", () => {
    it("cover spine width and logo width come from tokens", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toContain(".cover-spine { flex: 0 0 16mm;");
      expect(css).toMatch(/\.cover-logo \{[^}]*width: 44mm;/);
      const custom: BrandTokens = { ...DEFAULT_TOKENS, cover: { layout: "spine", spineWidth: "20mm", logoWidth: "30mm", titleAnchor: "bottom", align: "left", titleSize: "2.8em" } };
      const c2 = compileCss(custom);
      expect(c2).toContain(".cover-spine { flex: 0 0 20mm;");
      expect(c2).toMatch(/\.cover-logo \{[^}]*width: 30mm;/);
    });

    it("cover title size comes from tokens", () => {
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.cover \.doc-title \{[^}]*font-size: 2\.8em;/);
      const custom: BrandTokens = { ...DEFAULT_TOKENS, cover: { ...DEFAULT_TOKENS.cover, titleSize: "40pt" } };
      expect(compileCss(custom)).toMatch(/\.cover \.doc-title \{[^}]*font-size: 40pt;/);
    });
  });

  describe("cover.titleAnchor and cover.align", () => {
    function withCover(partial: Partial<BrandTokens["cover"]>): string {
      return compileCss({ ...DEFAULT_TOKENS, cover: { ...DEFAULT_TOKENS.cover, ...partial } });
    }

    it("bottom anchor (default) pushes the hero down with margin-top:auto and no centering", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toContain(".cover-hero { margin-top: auto; }");
      expect(css).not.toContain("margin-top: auto; margin-bottom: auto;");
      expect(css).not.toMatch(/\.cover-main \{[^}]*align-items: center/);
    });

    it("center anchor centers the hero vertically in the space below the logo", () => {
      expect(withCover({ titleAnchor: "center" })).toContain(".cover-hero { margin-top: auto; margin-bottom: auto; }");
    });

    it("top anchor seats the hero just below the logo", () => {
      expect(withCover({ titleAnchor: "top" })).toContain(".cover-hero { margin-top: 10mm; }");
    });

    it("center align centers the column, logo, and rule", () => {
      const css = withCover({ align: "center" });
      expect(css).toMatch(/\.cover-main \{[^}]*align-items: center;[^}]*text-align: center;/);
      expect(css).toContain(".cover-logo { align-self: center; }");
      expect(css).toContain(".cover-rule { margin-left: auto; margin-right: auto; }");
    });

    it("left align (default) adds no centering overrides", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).not.toContain(".cover-logo { align-self: center; }");
      expect(css).not.toContain(".cover-rule { margin-left: auto; margin-right: auto; }");
    });
  });

  describe("T4 badges + components", () => {
    it("badge color resolves from the token", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toContain("--badge-color: var(--color-muted)"); // default muted
      expect(css).toMatch(/\.badge \{[^}]*border: 1px solid var\(--badge-color\)/);
      expect(css).toMatch(/\.badge \{[^}]*color: var\(--badge-color\)/);
      expect(compileCss({ ...DEFAULT_TOKENS, badges: { color: "accent" } })).toContain("--badge-color: var(--color-accent)");
      expect(compileCss({ ...DEFAULT_TOKENS, badges: { color: "#ff0000" } })).toContain("--badge-color: #ff0000");
    });
    it("component gap is a custom property and scales the named component margins", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain("--component-gap: 1");
      expect(compileCss(DEFAULT_TOKENS)).toMatch(/\.callout \{[^}]*margin: calc\(1em \* var\(--rhythm\) \* var\(--component-gap\)\) 0;/);
      expect(compileCss({ ...DEFAULT_TOKENS, components: { gap: 2 } })).toContain("--component-gap: 2");
    });
  });

  describe("T2.7 tokens: pageNumbers.restartAtBody", () => {
    it("pageNumbers.restartAtBody gates the body counter reset", () => {
      expect(compileCss(DEFAULT_TOKENS)).toContain(".doc-body { counter-reset: page 1; }");
      const continuous: BrandTokens = { ...DEFAULT_TOKENS, pageNumbers: { restartAtBody: false } };
      expect(compileCss(continuous)).not.toContain("counter-reset: page");
    });
  });

  describe("header/footer slots", () => {
    it("default furniture reproduces the current @page boxes", () => {
      const css = compileCss(DEFAULT_TOKENS);
      expect(css).toContain("@top-left { content: string(doctitle); font-size: 9pt; color: #6b7280; }");
      expect(css).toContain("@top-right { content: string(chaptertitle, first); font-size: 9pt; color: #6b7280; }");
      expect(css).toContain("@bottom-center { content: counter(page); font-size: 9pt; color: #6b7280; }");
      // none slots omit their boxes from the default @page block (cover/toc suppress all six separately)
      // Extract only the default @page block (before @page cover) to verify omissions
      const defaultPageBlock = css.slice(css.indexOf("@page {"), css.indexOf("@page cover"));
      expect(defaultPageBlock).not.toContain("@top-center { content: string");
      expect(defaultPageBlock).not.toContain("@bottom-left { content: string");
      expect(defaultPageBlock).not.toContain("@bottom-right { content: string");
      expect(defaultPageBlock).not.toContain("@top-center { content: counter");
      expect(defaultPageBlock).not.toContain("@bottom-left { content: counter");
      expect(defaultPageBlock).not.toContain("@bottom-right { content: counter");
    });
    it("custom slots and furniture flow through", () => {
      const custom: BrandTokens = {
        ...DEFAULT_TOKENS,
        header: { left: "none", center: "docTitle", right: "none" },
        footer: { left: "Confidential", center: "none", right: "pageNumber" },
        furniture: { fontSize: "8pt", color: "#999999" },
      };
      const css = compileCss(custom);
      expect(css).toContain('@top-center { content: string(doctitle); font-size: 8pt; color: #999999; }');
      expect(css).toContain('@bottom-left { content: "Confidential"; font-size: 8pt; color: #999999; }');
      expect(css).toContain("@bottom-right { content: counter(page); font-size: 8pt; color: #999999; }");
    });
    it("cover and toc suppress all six margin boxes", () => {
      const css = compileCss(DEFAULT_TOKENS);
      const cover = css.slice(css.indexOf("@page cover"));
      expect((cover.slice(0, cover.indexOf("}") + 200).match(/content: none/g) || []).length).toBeGreaterThanOrEqual(6);
      const toc = css.slice(css.indexOf("@page toc"));
      const tocBlock = toc.slice(0, toc.indexOf("}\n}") + 3);
      expect((tocBlock.match(/content: none/g) || []).length).toBeGreaterThanOrEqual(6);
    });
  });
});
