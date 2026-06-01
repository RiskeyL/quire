import { describe, it, expect } from "vitest";
import { replaceTocPageNumberWithVar, TOC_PAGE_VAR } from "../../src/designer/live-css.js";
import { compileCss } from "../../src/theme/compile-css.js";
import { DEFAULT_TOKENS } from "../../src/theme/tokens.js";

describe("replaceTocPageNumberWithVar", () => {
  it("rewrites the TOC target-counter content into the page-number variable", () => {
    const input = `.toc-entry a::after {
  content: target-counter(attr(href), page);
  flex: 0 0 auto;
}`;
    const out = replaceTocPageNumberWithVar(input);
    expect(out).toContain(`content: var(${TOC_PAGE_VAR}, "");`);
    expect(out).not.toContain("target-counter(");
    // The rest of the rule is preserved.
    expect(out).toContain("flex: 0 0 auto;");
  });

  it("removes every target-counter from real compiled CSS", () => {
    const css = compileCss(DEFAULT_TOKENS);
    // Precondition: the converter's CSS really does use target-counter.
    expect(css).toContain("target-counter(");
    const out = replaceTocPageNumberWithVar(css);
    expect(out).not.toContain("target-counter(");
    expect(out).toContain(`var(${TOC_PAGE_VAR}, "")`);
  });

  it("is a no-op on CSS that has no TOC page-number declaration", () => {
    const css = "a { color: red; }";
    expect(replaceTocPageNumberWithVar(css)).toBe(css);
  });
});
