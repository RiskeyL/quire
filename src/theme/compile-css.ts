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
  const content = buildContent();
  const structural = buildStructural();

  return [root, page, elements, content, structural].join("\n");
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
/* Single owner of the mono font for both code blocks and inline code. */
pre, code { font-family: var(--font-mono); }`;
}

/**
 * Minimally-viable default styling for content elements.
 *
 * Uses existing custom properties (var(--…)) wherever a token naturally applies.
 * Neutral surface values (code/table backgrounds, hairline borders, hr colour)
 * are hardcoded as restrained grays — these are candidates for future tokens
 * once a designer-facing theme tool exists.
 */
function buildContent(): string {
  return `/* ---- Heading scale ---- */
/* Each level has a distinct em size so demoted headings keep a visible hierarchy. */
h1 { font-size: 2em; font-weight: 700; margin: 1.5em 0 0.4em; line-height: 1.2; break-after: avoid; }
h2 { font-size: 1.5em; font-weight: 700; margin: 1.4em 0 0.35em; line-height: 1.25; break-after: avoid; }
h3 { font-size: 1.25em; font-weight: 600; margin: 1.3em 0 0.3em; line-height: 1.3; break-after: avoid; }
h4 { font-size: 1.1em; font-weight: 600; margin: 1.2em 0 0.25em; line-height: 1.35; break-after: avoid; }
h5 { font-size: 1em; font-weight: 600; margin: 1.1em 0 0.2em; line-height: 1.4; break-after: avoid; }
h6 { font-size: 0.85em; font-weight: 600; margin: 1em 0 0.2em; line-height: 1.4; break-after: avoid; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-muted); }

/* ---- Vertical rhythm ---- */
p { margin-top: 0; margin-bottom: 0.75em; }
/* Suppress the top margin on the first child of a content section. */
section > *:first-child { margin-top: 0; }

/* ---- Inline code vs. code blocks ---- */
/* Neutral surface values (rgba fills, hairline borders) are candidates for
   future tokens once the designer-facing theme tool exists. */
:not(pre) > code {
  font-size: 0.88em;
  background: rgba(0,0,0,0.05);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
pre {
  background: rgba(0,0,0,0.04);
  padding: 0.85em 1em;
  border-radius: 4px;
  font-size: 0.88em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 1em 0;
}
pre code {
  background: transparent;
  padding: 0;
  font-size: inherit;
  border-radius: 0;
}

/* ---- Tables ---- */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.95em;
}
th, td {
  border: 1px solid rgba(0,0,0,0.15);
  padding: 0.45em 0.65em;
  text-align: left;
  vertical-align: top;
}
th {
  background: rgba(0,0,0,0.06);
  font-weight: bold;
}
/* Only protect the header row from breaking. Body rows are intentionally
   allowed to break: a tall tbody cell (long prose or a code snippet) would
   otherwise be pushed whole to the next page, leaving a large blank gap. */
thead tr { break-inside: avoid; }

/* ---- Blockquotes ---- */
blockquote {
  border-left: 3px solid var(--color-accent);
  padding-left: 1em;
  margin: 1em 0;
  color: var(--color-muted);
}
blockquote > *:first-child { margin-top: 0; }
blockquote > *:last-child { margin-bottom: 0; }

/* ---- Lists ---- */
/* Generic list rules use lower specificity than the .toc-prefixed rules
   in buildStructural(), so TOC layout is never affected. */
ul, ol {
  padding-left: 1.75em;
  margin: 0.5em 0;
}
li { margin-bottom: 0.25em; }

/* ---- Horizontal rules ---- */
hr {
  border: 0;
  border-top: 1px solid rgba(0,0,0,0.15);
  margin: 1.5em 0;
}

/* ---- Images ---- */
img { max-width: 100%; height: auto; display: block; }`;
}

function buildStructural(): string {
  return `/* Cover and TOC each occupy their own page(s). */
.cover { break-after: page; }
.cover > *:first-child { margin-top: 0; }
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
