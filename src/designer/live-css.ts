// src/designer/live-css.ts
/**
 * Browser-pure helpers for the designer's live preview CSS.
 * No DOM, no Node builtins.
 */

/**
 * CSS custom property that carries each TOC entry's page number in the preview.
 * Set per `.toc-entry a` by the designer after pagination (see fillTocPageNumbers
 * in app.ts); read by the rewritten `::after` content rule.
 */
export const TOC_PAGE_VAR = "--quire-toc-page";

/**
 * Rewrite the TOC page-number declaration so the PREVIEW does not depend on
 * pagedjs resolving `target-counter()` in the browser.
 *
 * `compileCss` emits `content: target-counter(attr(href), page)` for the TOC
 * page number. In the CLI that works: pagedjs rewrites it into a real counter
 * and the PDF shows the numbers. In the browser preview it is fragile — the
 * resolution depends on pagedjs reading each page's computed page counter, and
 * if it does not complete the dotted leader runs to the edge with no number
 * (exactly what users reported). Chromium also discards the raw
 * `target-counter()` as invalid, so there is no fallback.
 *
 * For the preview we instead display a CSS variable that the designer fills in
 * directly from the rendered pagination (physical page index, offset to match
 * the body-relative `counter(page)` numbering). pagedjs then has no
 * `target-counter()` to resolve, and the number is guaranteed to show in any
 * browser. The converter's real CSS is untouched, so the PDF path is unchanged.
 *
 * The fallback `""` keeps the `::after` empty (just the leader) until the
 * variable is set, so a half-painted frame never shows a stray `0`.
 */
export function replaceTocPageNumberWithVar(css: string): string {
  return css.replace(
    /content:\s*target-counter\([^;]*\);/g,
    `content: var(${TOC_PAGE_VAR}, "");`,
  );
}
