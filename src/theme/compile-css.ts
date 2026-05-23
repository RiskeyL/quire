import type { BrandTokens } from "./tokens.js";

/**
 * Compile brand tokens into a complete print CSS string for Paged.js / Chromium.
 *
 * Structure:
 *   1. :root block — CSS custom properties for all var()-able tokens.
 *   2. @page block — literal size and margin values.
 *   3. Token-driven element rules using the custom properties.
 *   4. Structural rules (cover/TOC page breaks, TOC list styling, target-counter).
 *
 * Note: Paged.js / Chromium do not reliably resolve CSS custom properties inside
 * the @page `size` and `margin` descriptors, so those values are emitted as
 * literals rather than var() references. This is why page geometry is NOT
 * included in the :root custom properties block.
 */
export function compileCss(tokens: BrandTokens): string {
  const root = buildRoot(tokens);
  const page = buildPage(tokens);
  const elements = buildElements();
  const structural = buildStructural();

  return [root, page, elements, structural].join("\n");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

// Trust assumption: token string values are interpolated directly into the
// <style> block without escaping. This is safe only because the brand-token
// file is authored by the trusted user running the tool — a value containing
// </style> or } would break out of the block.
function buildRoot(tokens: BrandTokens): string {
  const { colors, typography } = tokens;
  return `:root {
  --color-text: ${colors.text};
  --color-heading: ${colors.heading};
  --color-link: ${colors.link};
  --color-accent: ${colors.accent};
  --color-muted: ${colors.muted};
  --font-body: ${typography.bodyFont};
  --font-heading: ${typography.headingFont};
  --font-mono: ${typography.monoFont};
  --base-size: ${typography.baseSize};
  --line-height: ${typography.lineHeight};
}`;
}

function buildPage(tokens: BrandTokens): string {
  return `@page { size: ${tokens.page.size}; margin: ${tokens.page.margin}; }`;
}

function buildElements(): string {
  return `body { font-family: var(--font-body); font-size: var(--base-size); line-height: var(--line-height); color: var(--color-text); }
h1,h2,h3,h4,h5,h6 { font-family: var(--font-heading); color: var(--color-heading); }
a { color: var(--color-link); }
pre, code { font-family: var(--font-mono); }`;
}

function buildStructural(): string {
  return `/* Cover and TOC each occupy their own page(s). */
.cover { break-after: page; }
.toc { break-after: page; }

/* TOC layout: remove bullets, dot leaders, page numbers via target-counter. */
.toc ul { list-style: none; padding: 0; margin: 0; }
.toc li { margin: 0.25em 0; }
.toc-section > span { font-weight: bold; display: block; margin-top: 0.75em; }
.toc-page a {
  display: flex;
  align-items: baseline;
  text-decoration: none;
  color: inherit;
}
.toc-page a::after {
  content: target-counter(attr(href), page);
  margin-left: auto;
  padding-left: 0.5em;
}
.toc-section > ul { padding-left: 1.5em; }`;
}
