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
  const pageFurniture = buildPageFurniture();
  const elements = buildElements();
  const content = buildContent(tokens.tables.layout);
  const boxed = buildBoxed();
  const figure = buildFigure();
  const disclosure = buildDisclosure();
  const steps = buildSteps();
  const cards = buildCards();
  const fields = buildFields();
  const code = buildCode();
  const inline = buildInline();
  const structural = buildStructural(tokens);
  const structuralLists = buildStructuralLists();

  const pageDescription = buildPageDescription();

  return [root, page, pageFurniture, elements, content, pageDescription, boxed, figure, disclosure, steps, cards, fields, code, inline, structural, structuralLists].join("\n");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

// Trust assumption: token string values are interpolated directly into the
// <style> block without escaping. This is safe only because the brand-token
// file is authored by the trusted user running the tool — a value containing
// </style> or } would break out of the block.
function buildRoot(tokens: BrandTokens): string {
  const { colors, typography, semantic, shape } = tokens;
  return `:root {
  --color-text: ${colors.text};
  --color-heading: ${colors.heading};
  --color-link: ${colors.link};
  --color-accent: ${colors.accent};
  --color-muted: ${colors.muted};
  --color-surface: ${colors.surface};
  --color-border: ${colors.border};
  --font-body: ${typography.bodyFont};
  --font-heading: ${typography.headingFont};
  --font-mono: ${typography.monoFont};
  --base-size: ${typography.baseSize};
  --line-height: ${typography.lineHeight};
  --semantic-success: ${semantic.success};
  --semantic-caution: ${semantic.caution};
  --semantic-danger: ${semantic.danger};
  --radius: ${shape.radius};
}`;
}

function buildPage(tokens: BrandTokens): string {
  return `@page { size: ${tokens.page.size}; margin: ${tokens.page.margin}; }`;
}

/**
 * Running headers/footers (default page furniture), via CSS Paged Media:
 *   - bottom-center: the page number (counter(page)).
 *   - top-left: the document title, captured from the cover h1 (.doc-title) as
 *     the `doctitle` named string.
 *   - top-right: the current top-level chapter title, captured from depth-0
 *     structural headings (.chapter-start) as the `chaptertitle` named string.
 *     Only top-level chapters carry .chapter-start (set in walkTree), so the
 *     running header tracks the current chapter, not per-page titles — mirroring
 *     the Word side's STYLEREF "Heading 1". The `first` keyword yields the
 *     chapter in effect at the top of the page (it updates as chapters change).
 *
 * The cover page is given its own named page (`page: cover`) whose margin boxes
 * are emptied (content: none / normal), so the cover shows no furniture.
 *
 * Margin-box descriptors use ONLY literal values (no var()): Paged.js does not
 * reliably resolve custom properties inside @page, and a test forbids var()
 * there. The muted gray (#6b7280) matches the default --color-muted token value.
 *
 * The string-set rules (.doc-title / .chapter-start) live outside @page as
 * ordinary element rules; only the named-string consumers sit in the margin
 * boxes. This builder is emitted right after buildPage so all @page rules are
 * grouped together.
 */
function buildPageFurniture(): string {
  return `/* ---- Named strings feeding the running headers ---- */
/* Captured from the cover title and from top-level chapter headings respectively. */
/* The top-right tracks .chapter-start (depth-0 chapters only), not .chapter-heading
   (which every page title carries), so the header shows the current section — not
   the per-page title — matching the Word side's STYLEREF "Heading 1". */
.doc-title { string-set: doctitle content(); }
.chapter-start { string-set: chaptertitle content(); }

/* ---- Default running headers/footers ---- */
/* Literal values only (no var()): Paged.js does not reliably resolve custom
   properties inside @page margin boxes. #6b7280 mirrors --color-muted. */
@page {
  @top-left { content: string(doctitle); font-size: 9pt; color: #6b7280; }
  @top-right { content: string(chaptertitle, first); font-size: 9pt; color: #6b7280; }
  @bottom-center { content: counter(page); font-size: 9pt; color: #6b7280; }
}

/* The cover and the TOC are front matter: each gets its own named page that
   suppresses the running header/footer, so the furniture only starts on the
   body pages. The page counter still increments on these pages (it is just not
   printed), so body page numbers stay continuous with their physical position. */
.cover { page: cover; }
@page cover {
  /* No margin: the brand spine is full-bleed to the physical page edges; the
     cover's main column re-establishes internal padding (see .cover-main). */
  margin: 0;
  @top-left { content: none; }
  @top-right { content: none; }
  @bottom-center { content: none; }
}
.toc { page: toc; }
@page toc {
  @top-left { content: none; }
  @top-right { content: none; }
  @bottom-center { content: none; }
}

/* The body restarts page numbering at 1: the cover and TOC are unnumbered front
   matter. .doc-body wraps the body (see assembleDocument) and begins on a fresh
   page after the TOC's break-after, so resetting the page counter here makes the
   first body page "1". The TOC's target-counter entries then resolve to these
   body-relative numbers. */
.doc-body { counter-reset: page 1; }`;
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
 * All fills and hairlines are token-driven: code/pre/table backgrounds use
 * var(--color-surface); border hairlines use var(--color-border).
 */
function buildContent(tableLayout: BrandTokens["tables"]["layout"]): string {
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
/* Fills use var(--color-surface); hairline borders use var(--color-border). */
:not(pre) > code {
  font-size: 0.88em;
  background: var(--color-surface);
  padding: 0.1em 0.35em;
  border-radius: var(--radius);
  /* Allow long unbreakable tokens (e.g. fully-qualified worker class paths in
     the env-vars table) to wrap. Without this, an inline <code> span sets a
     minimum column width that, under auto table-layout, pushes the last column
     past the page edge and clips it. Applies in both layouts. */
  overflow-wrap: anywhere;
  word-break: break-word;
}
pre {
  background: var(--color-surface);
  padding: 0.85em 1em;
  border-radius: var(--radius);
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
/* table-layout is token-driven (tables.layout). "fixed" (default) distributes
   column widths evenly regardless of content, so a long unbreakable token cannot
   stretch a column past the page edge and clip the last column under Paged.js.
   "auto" reverts to content-driven sizing for authors who prefer it. width:100%
   is kept so the table always fills the text column. */
table {
  width: 100%;
  table-layout: ${tableLayout};
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.95em;
}
th, td {
  border: 1px solid var(--color-border);
  padding: 0.45em 0.65em;
  text-align: left;
  vertical-align: top;
  /* Let long content wrap inside the cell so nothing overflows the column,
     in BOTH layouts. Critical for fixed layout, where the column width is set
     independently of content. */
  overflow-wrap: anywhere;
  word-break: break-word;
}
th {
  background: var(--color-surface);
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
  border-top: 1px solid var(--color-border);
  margin: 1.5em 0;
}

/* ---- Images ---- */
img { max-width: 100%; height: auto; display: block; }`;
}

/**
 * Page-description lede rule.
 *
 * Rendered beneath each page-title heading when `meta.showDescription` is true
 * (or the CLI `--no-description` flag has not been passed). Styled as a lede:
 * muted color, slightly larger or italicized, with tightened top margin so it
 * reads as a continuation of the heading and a margin-bottom before the body.
 */
function buildPageDescription(): string {
  return `/* ---- Page description lede ---- */
/* Rendered immediately after each page-title heading when showDescription is enabled. */
/* Muted color, italic, tightened top margin so it reads as a heading continuation. */
.page-description {
  color: var(--color-muted);
  font-style: italic;
  font-size: 1.05em;
  margin-top: 0.15em;
  margin-bottom: 0.75em;
}`;
}

/**
 * Boxed / aside component styling: callouts (Info/Tip/Warning/Note/Check/Danger
 * and the generic Callout), the Panel aside, and the Update changelog box.
 *
 * Per-type left-border colours: info uses var(--color-accent); tip/check use
 * var(--semantic-success); note/warning/danger use var(--semantic-caution) and
 * var(--semantic-danger). Surface fill uses var(--color-surface).
 */
function buildBoxed(): string {
  return `/* ---- Callouts ---- */
.callout {
  padding: 0.75em 1em;
  border-left: 3px solid var(--color-muted);
  background: var(--color-surface);
  border-radius: 0 var(--radius) var(--radius) 0;
  margin: 1em 0;
  /* Callouts are usually short, so keeping them whole avoids an orphaned label. */
  break-inside: avoid;
}
.callout > *:first-child { margin-top: 0; }
.callout > *:last-child { margin-bottom: 0; }
.callout-label {
  font-weight: 700;
  font-size: 0.85em;
  margin: 0 0 0.35em;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
/* Per-type left-border colour. info uses var(--color-accent); tip/check use
   var(--semantic-success); note uses var(--semantic-caution); warning/danger
   use var(--semantic-danger). */
.callout-info { border-left-color: var(--color-accent); }
.callout-tip { border-left-color: var(--semantic-success); }
.callout-note { border-left-color: var(--semantic-caution); }
.callout-warning { border-left-color: var(--semantic-danger); }
.callout-danger { border-left-color: var(--semantic-danger); }
.callout-check { border-left-color: var(--semantic-success); }

/* Note: Banner is a docs.json site-config feature in Mintlify, not an
   in-content component, so the render core emits no banner element and no
   .banner rule is defined here. A stray <Banner> falls through to the
   data-component passthrough. */

/* ---- Panel (aside) ---- */
.panel {
  display: block;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.85em 1em;
  margin: 1em 0;
  background: var(--color-surface);
}
.panel > *:first-child { margin-top: 0; }
.panel > *:last-child { margin-bottom: 0; }

/* ---- Update (changelog entry) ---- */
.update {
  border-left: 3px solid var(--color-muted);
  padding-left: 1em;
  margin: 1.25em 0;
}
.update > *:first-child { margin-top: 0; }
.update > *:last-child { margin-bottom: 0; }
.update-label {
  font-weight: 700;
  font-size: 0.95em;
  margin: 0 0 0.25em;
}
.update-description {
  color: var(--color-muted);
  margin: 0 0 0.5em;
}`;
}

/**
 * Figure / Frame component styling.
 *
 * The global `img` rule in `buildContent` already sets `max-width: 100%` and
 * `height: auto`, so those are not duplicated here. Only figure-specific rules
 * are added: centering, page-break protection, and caption styling.
 */
function buildFigure(): string {
  return `/* ---- Figure (Frame component) ---- */
.frame {
  margin: 1.25em 0;
  text-align: center;
  break-inside: avoid;
}
figcaption {
  color: var(--color-muted);
  font-size: 0.875em;
  text-align: center;
  margin-top: 0.4em;
}

/* ---- Mermaid diagram (rasterized PNG, embedded by renderMermaid) ---- */
/* Centered block image. break-inside: avoid keeps a diagram whole on one page;
   diagrams are atomic and cannot be split. When wrapped in <figure class="frame">
   (the default), the .frame rule above already centers it, but the explicit
   rules here also cover a bare .mermaid-diagram image. */
.mermaid-diagram {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
  break-inside: avoid;
}`;
}

/**
 * Disclosure component styling: the Tabs/Tab, AccordionGroup/Accordion, and
 * Expandable families.
 *
 * Print strategy — "expand-and-label": every panel is shown, each preceded
 * by a bold label so the reader can see which section they are reading.
 *
 * Panel blocks (.tab, .accordion, .expandable) share a common shape:
 *   - A hairline top border as a visual separator between sibling panels.
 *   - A modest left indent on the body content.
 *   - Vertical spacing between panels (margin-top).
 *
 * break-inside scoping (mirrors the table `thead tr` decision):
 *   break-inside: avoid is applied ONLY to .expandable. Expandable panels are
 *   reliably short (API parameter sub-objects), so keeping them whole is cheap.
 *   .tab and .accordion bodies in real Dify docs routinely contain multi-step
 *   code blocks and several paragraphs; forcing a tall panel onto one page
 *   would push it whole to the next page and leave a large blank gap. Just as
 *   table body rows are allowed to break (only thead tr is protected), tall
 *   tab/accordion panels are allowed to break across pages.
 *
 * To keep a label from being orphaned at the bottom of a page once panel-level
 * break-inside is gone, every label carries break-after: avoid, so it stays
 * with the start of its body.
 *
 * Label rules (.*-label) are bold and slightly smaller than body text.
 * A "▾" pseudo-element hints to PDF readers that these were collapsible;
 * it is decorative only and does not affect content.
 *
 * Container rules (.tabs, .accordion-group) add only vertical margin so they
 * do not compete with the inner panel spacing.
 *
 * Color usage:
 *   - Labels use var(--color-muted) — a neutral tone that avoids competing with
 *     callout accent colors.
 *   - Hairline top border uses var(--color-border).
 *   - Body indentation is a plain padding value; no color token needed.
 */
function buildDisclosure(): string {
  return `/* ---- Disclosure containers (Tabs, AccordionGroup) ---- */
/* Container rules add only vertical spacing; inner panel rules handle the rest. */
.tabs {
  margin: 1em 0;
}
.accordion-group {
  margin: 1em 0;
}

/* ---- Disclosure panels (.tab, .accordion, .expandable, .view) ---- */
/* Shared shape: hairline top border, left padding on body, vertical gap.
   .view is a switchable panel like .tab and shares the same treatment. */
.tab,
.accordion,
.expandable,
.view {
  border-top: 1px solid var(--color-border);
  padding: 0.6em 0 0.6em 1em;
  margin-top: 0;
}
/* break-inside: avoid only on .expandable — these are reliably short API param
   sub-objects. .tab/.accordion bodies can be tall (multi-step code, several
   paragraphs); forcing them whole would leave a blank-page gap, so they are
   allowed to break (mirrors the table thead-tr-only scoping). */
.expandable {
  break-inside: avoid;
}
/* Remove the top border from the very first panel in a group to avoid a
   double border when the container itself has a top border or margin. */
.tab:first-child,
.accordion:first-child,
.expandable:first-child,
.view:first-child {
  border-top: none;
  padding-top: 0;
}

/* ---- Disclosure labels (.*-label) ---- */
/* Bold, slightly smaller, with a decorative collapse hint (▾). */
.tab-label,
.accordion-label,
.expandable-label,
.view-label {
  font-weight: 700;
  font-size: 0.9em;
  color: var(--color-muted);
  margin: 0 0 0.3em;
  padding: 0;
  /* Keep the label with the start of its body so it is not orphaned at the
     bottom of a page (panel-level break-inside is no longer protecting it). */
  break-after: avoid;
}
/* Decorative hint that these were collapsible/switchable sections. */
.tab-label::before,
.accordion-label::before,
.expandable-label::before,
.view-label::before {
  content: "▾ ";
  font-size: 0.85em;
}`;
}

/**
 * Steps component styling (Mintlify "Steps"): a numbered sequential instruction
 * list rendered as `<ol class="steps">` with `<li class="step">` items.
 *
 * Design decisions:
 *   - `.steps` is an `ol`, so the browser/print engine handles number generation.
 *     We add padding-left to create room for the markers (overrides the generic
 *     `ul, ol` rule via higher class-selector specificity — no !important needed).
 *   - `.step` gets vertical spacing between items; no `break-inside: avoid` because
 *     step bodies can be long (multi-paragraph instructions, code blocks). Forcing
 *     a tall step onto one page would leave a blank gap — same reasoning as for
 *     .tab/.accordion in the disclosure panel.
 *   - `.step-title` is bold and gets `break-after: avoid` so the step number +
 *     title is never orphaned at the bottom of a page without its body. The small
 *     bottom margin keeps the title visually glued to the first content line.
 *
 * Color usage:
 *   - `.step-title` uses `var(--color-heading)` — a natural choice for a named
 *     step title that mirrors heading treatment without adding a new token.
 *   - All spacing values are plain em/pt literals; no color token is needed for
 *     the list markers (they inherit from the body color).
 */
function buildSteps(): string {
  return `/* ---- Steps (numbered sequential instructions) ---- */
.steps {
  padding-left: 2em;  /* room for the list marker digits */
  margin: 1em 0;
}

/* Step bodies are allowed to break across pages — they can contain multi-paragraph
   instructions and code blocks. Forcing a tall step whole would leave a blank gap,
   mirroring the .tab/.accordion decision for disclosure panels. */
.step {
  margin: 0 0 1em;
}

.step-title {
  font-weight: 700;
  color: var(--color-heading);
  margin: 0 0 0.2em;  /* small bottom margin keeps title glued to body */
  /* Keep the step number + title with the start of the body so it is not
     orphaned at the bottom of a page. */
  break-after: avoid;
}`;
}

/**
 * Card/grid component styling: Card/CardGroup, Columns/Column, and Tile.
 *
 * Print strategy — vertical stack:
 *   Print has no responsive grid. All container classes (.card-group, .columns)
 *   are plain block wrappers; children stack naturally. Layout-only props
 *   (cols, horizontal) are dropped by the render layer.
 *
 * .card and .tile share the same visual shape: a hairline border, padding, a
 * small radius, and vertical margin. They are authored separately (not via a
 * shared selector) so either class can be styled independently in the future.
 *
 * break-inside:
 *   NOT applied to .card or .tile. Card bodies in real Dify docs often contain
 *   multi-paragraph instructions or code blocks; forcing a tall card whole onto
 *   one page would push it to the next and leave a blank gap — the same
 *   reasoning that bars break-inside from .tab/.accordion/.step. Short cards
 *   (a title + one sentence) will naturally fit on a page without protection.
 *   This mirrors the table tbody-row decision: only the header row is protected,
 *   not the data rows.
 *
 * Color usage:
 *   - .card-href / .tile-href use var(--color-muted) — visually secondary, so
 *     they don't compete with the title.
 *   - Borders use var(--color-border).
 *   - Backgrounds on .card / .tile are intentionally omitted; the border alone
 *     is sufficient to delineate the block and avoids heavy fills on tall bodies.
 */
function buildCards(): string {
  return `/* ---- Card and Tile (bordered content blocks) ---- */
/* Shared visual shape: hairline border, padding, radius, vertical margin.   */
/* break-inside is intentionally absent — card/tile bodies can be long        */
/* (multi-paragraph, code blocks), so forcing them whole would leave a blank  */
/* gap. Mirrors the .tab/.accordion/.step decision.                           */
.card,
.tile {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.85em 1em;
  margin: 0.75em 0;
}
.card > *:first-child, .tile > *:first-child { margin-top: 0; }
.card > *:last-child,  .tile > *:last-child  { margin-bottom: 0; }

/* ---- Card/tile titles ---- */
.card-title,
.tile-title {
  font-weight: 700;
  margin: 0 0 0.25em;
}

/* ---- Card/tile href display ---- */
/* Visible URL below the title so print readers can see the link destination. */
/* Uses var(--color-muted) to stay visually secondary. Optional mono font     */
/* makes URLs scan naturally (same convention as code spans).                 */
/* Hardcoded font-size 0.8em: a proportional step-down, no token needed.      */
.card-href,
.tile-href {
  display: block;
  color: var(--color-muted);
  font-size: 0.8em;
  font-family: var(--font-mono);
  margin-bottom: 0.4em;
}

/* ---- Tile description ---- */
.tile-description {
  color: var(--color-muted);
  font-size: 0.9em;
  margin: 0 0 0.35em;
}

/* ---- Container wrappers (CardGroup, Columns) ---- */
/* Vertical spacing between consecutive card/tile children.                  */
/* No attempt at CSS columns or grid — print stacks everything vertically.   */
.card-group,
.columns {
  margin: 1em 0;
}

/* ---- Column ---- */
/* A bare block; children stack naturally inside the .columns wrapper.       */
.column {
  display: block;
}`;
}

/**
 * API field component styling: ParamField / ResponseField (rendered as
 * .param-field blocks) and the RequestExample / ResponseExample containers
 * (rendered as labeled .example wrappers).
 *
 * Print strategy:
 *   Each field is a flat block separated from its siblings by a hairline
 *   top border. The head line (.param-head) carries the name + meta inline;
 *   the body (.param-body) holds the description and any NESTED fields, which
 *   indent via the body's left padding so the parameter hierarchy reads
 *   naturally on paper.
 *
 * break-inside:
 *   NOT applied to .param-field. A field with nested children (deep object
 *   schemas are common in API docs) can span many lines; forcing it whole onto
 *   one page would push a tall field to the next page and leave a blank gap.
 *   This mirrors the table tbody-row / .tab / .accordion / .card decisions:
 *   only reliably-short blocks are protected, and parameter trees are not.
 *
 * Color usage:
 *   - .param-name uses var(--font-mono) and bold — a parameter name is an
 *     identifier, so it scans like inline code.
 *   - .param-type / .param-default use var(--color-muted) and a smaller size:
 *     secondary metadata that should not compete with the name.
 *   - .param-required badge uses var(--semantic-caution) for border and text.
 *   - .param-deprecated badge uses var(--color-muted) (neutral, struck-through).
 *   - Hairline separator uses var(--color-border).
 *   - .example-label is bold + muted, matching the disclosure/step label tone.
 */
function buildFields(): string {
  return `/* ---- API fields (ParamField, ResponseField) ---- */
/* Each field is separated from the previous by a hairline top border. No     */
/* break-inside: avoid — fields with nested children can be long, so forcing   */
/* them whole would leave a blank-page gap (mirrors table/disclosure/card).    */
.param-field {
  border-top: 1px solid var(--color-border);
  padding: 0.55em 0;
  margin: 0;
}
/* No double border above the first field in a group. */
.param-field:first-child {
  border-top: none;
  padding-top: 0;
}

/* ---- Field head line (name + inline meta) ---- */
.param-head {
  margin: 0 0 0.3em;
  /* Keep the head with the start of its body so it is not orphaned. */
  break-after: avoid;
}
.param-name {
  font-weight: 700;
  font-family: var(--font-mono);
  /* The name is a real <code> element, so the global inline-code rule
     (:not(pre) > code) would otherwise give it a tinted, padded pill. Reset
     those three properties so the name reads as a clean mono label. */
  background: transparent;
  padding: 0;
  border-radius: 0;
}
/* Secondary metadata: muted and a step smaller so it does not rival the name. */
.param-type,
.param-default {
  color: var(--color-muted);
  font-size: 0.85em;
  margin-left: 0.5em;
}

/* ---- required / deprecated badges ---- */
/* Small uppercase pills. The shared badge shape (size, casing, spacing, pill   */
/* radius) is grouped on one selector — only the per-type border/colour differ, */
/* mirroring how the disclosure section groups .tab/.accordion/.expandable.     */
/* required uses var(--semantic-caution); deprecated uses var(--color-muted).   */
.param-required,
.param-deprecated {
  font-size: 0.7em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-left: 0.5em;
  padding: 0.05em 0.4em;
  border-radius: var(--radius);
}
.param-required {
  border: 1px solid var(--semantic-caution);
  color: var(--semantic-caution);
}
.param-deprecated {
  border: 1px solid var(--color-muted);
  color: var(--color-muted);
  text-decoration: line-through;
}

/* ---- Field body (description + nested fields) ---- */
/* Left indent so nested .param-field children read as a hierarchy. */
.param-body {
  padding-left: 1em;
}
.param-body > *:first-child { margin-top: 0; }
.param-body > *:last-child { margin-bottom: 0; }

/* ---- Request / Response examples ---- */
/* No right-hand sidebar in print: children render inline under a bold label. */
.example {
  margin: 1em 0;
}
.example-label {
  font-weight: 700;
  font-size: 0.85em;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 0.35em;
  break-after: avoid;
}`;
}

/**
 * Code-group and Prompt component styling.
 *
 * CodeGroup — print strategy ("expand-and-label"):
 *   On the web, CodeGroup shows code fences in a tabbed interface. Print has
 *   no tabs, so all blocks are shown sequentially. The group container adds
 *   light vertical rhythm and an optional outline so the blocks read as a
 *   unit. Each item gets a small vertical gap between itself and its
 *   neighbour. The label is mono and muted — a filename/language tag look.
 *
 * Prompt — a labeled prompt block:
 *   The bold label mirrors the .example-label and .update-label conventions.
 *
 * break-inside:
 *   NOT applied to .code-group or .code-group-item. Code blocks can be long;
 *   forcing them whole onto one page would push them to the next and leave a
 *   blank gap — the same reasoning that bars break-inside from .tab/.accordion/
 *   .card/.step. This is the consistent project decision: only reliably-short
 *   blocks are protected.
 *
 * Color usage:
 *   - .code-label uses var(--font-mono) and var(--color-muted) — both token-driven.
 *   - .code-group border and .prompt border use var(--color-border); prompt fill
 *     uses var(--color-surface).
 *   - .prompt-label is bold; no additional color token is applied — the bold
 *     weight alone provides sufficient visual hierarchy for a prompt header.
 */
function buildCode(): string {
  return `/* ---- CodeGroup (multiple code blocks as labeled sequence) ---- */
/* No break-inside: avoid — code blocks can be long; forcing them whole       */
/* would leave a blank gap (mirrors .tab/.accordion/.card/.step decisions).   */
.code-group {
  margin: 1em 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.5em 0.75em;
}

/* Vertical gap between consecutive items; no break-inside (see above). */
.code-group-item {
  margin-top: 0.75em;
}
.code-group-item:first-child {
  margin-top: 0;
}

/* ---- Code label (filename / language tag above each block) ---- */
/* Mono font so filenames scan like paths; muted color so the label stays    */
/* visually secondary to the code content it annotates.                      */
.code-label {
  font-family: var(--font-mono);
  font-size: 0.8em;
  color: var(--color-muted);
  margin: 0 0 0.2em;
  /* Keep the label with the start of its code block. */
  break-after: avoid;
}

/* ---- Prompt (copyable AI prompt card) ---- */
/* Children (prompt text) follow below the bold label.                       */
.prompt {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.75em 1em;
  margin: 1em 0;
  background: var(--color-surface);
}
.prompt > *:first-child { margin-top: 0; }
.prompt > *:last-child { margin-bottom: 0; }
.prompt-label {
  font-weight: 700;
  font-size: 0.85em;
  color: var(--color-muted);
  margin: 0 0 0.35em;
  break-after: avoid;
}`;
}

/**
 * Inline (text-level) component styling: Badge, Tooltip.
 *
 * Color — no CSS: block-level design tool, not author-placeable inline (skipped).
 * Icon  — no CSS: renders nothing; empty-array handler needs no style rule.
 *
 * Badge:
 *   A small inline pill for status labels. `display: inline-block` so padding
 *   is rendered correctly without breaking flow. Font size and padding are
 *   fixed proportional values; border uses var(--color-muted) so it adapts to
 *   the brand token without a dedicated badge-color token.
 *   Color modifier classes (.badge-blue, .badge-green, etc.) are not styled
 *   here — neutral fallback is sufficient for print; authors who want colored
 *   badges in PDF can extend via custom CSS.
 *   `size` and `shape` props are dropped (no print analogue).
 *
 * Tooltip:
 *   .tooltip is a transparent inline wrapper (no visual treatment; the trigger
 *   text carries its own formatting). .tooltip-tip is the parenthetical tip:
 *   smaller, muted, and italicized to read as a gloss rather than main prose.
 *   font-style: italic is a deliberate choice here — it visually sets the tip
 *   apart from surrounding text without adding color or weight that would
 *   compete with the trigger.
 */
function buildInline(): string {
  return `/* ---- Badge (inline status/label pill) ---- */
/* display: inline-block so padding renders in flow without breaking lines. */
/* size/shape props dropped — no print analogue.                             */
.badge {
  display: inline-block;
  font-size: 0.75em;
  font-weight: 600;
  padding: 0.1em 0.45em;
  border-radius: var(--radius);
  border: 1px solid var(--color-muted);  /* token-driven neutral border */
  color: var(--color-muted);
  letter-spacing: 0.03em;
  vertical-align: middle;
}
/* Color modifier classes (.badge-blue etc.) are intentionally unstyled in   */
/* print — a neutral pill is sufficient; authors can extend via custom CSS.  */

/* ---- Tooltip (inline trigger + parenthetical tip) ---- */
/* .tooltip is a transparent wrapper; no visual treatment on the trigger.    */
.tooltip {
  display: inline;
}
/* .tooltip-tip: the parenthetical gloss after the trigger text.             */
/* Italic + muted + smaller so it reads as a gloss, not main prose.          */
.tooltip-tip {
  color: var(--color-muted);
  font-size: 0.9em;
  font-style: italic;
}`;
}

function buildStructural(tokens: BrandTokens): string {
  // Paged.js maps `vh` unreliably, so the cover's full height is emitted as an
  // explicit sheet height. The cover page has margin:0 (see @page cover), so its
  // content box is the whole sheet; this height makes the flex spine span it
  // top-to-bottom. Defaults to A4; Letter is the only other supported size.
  const sheetHeight =
    tokens.page.size.trim().toLowerCase() === "letter" ? "11in" : "297mm";
  return `/* Cover and TOC each occupy their own page(s). */
.cover { break-after: page; }
.toc { break-after: page; }

/* Cover: a full-bleed brand-color spine down the left edge (the "book spine"),
   the logo anchoring the top of the white main column, and the title block
   (kicker, title, blue rule, version/date, footer) grouped low via
   margin-top:auto. The cover page drops its margin so the spine is full-bleed;
   .cover-main restores internal padding. The explicit height fills the sheet so
   the spine spans full height (flex children stretch). */
.cover { display: flex; height: ${sheetHeight}; }
.cover-spine { flex: 0 0 16mm; background: var(--color-accent); }
.cover-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 26mm 24mm 24mm;
}
/* Explicit width + height:auto preserves the wordmark aspect ratio. (width:auto
   here would let the column's align-items:stretch force the width while max-height
   capped the height, distorting the logo.) align-self:flex-start is belt-and-braces
   against the stretch. */
.cover-logo { display: block; align-self: flex-start; width: 44mm; height: auto; margin: 0; }
.cover-hero { margin-top: auto; }
.cover-product {
  font-family: var(--font-body);
  font-size: 0.95em;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-link);
  margin: 0 0 1.8em;
}
.cover .doc-title {
  font-family: var(--font-heading);
  font-size: 2.8em;
  line-height: 1.07;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: var(--color-heading);
  margin: 0;
}
.cover-rule { height: 2px; width: 42mm; background: var(--color-accent); margin: 2.4em 0 1.9em; }
.cover-meta { font-family: var(--font-body); font-size: 1.05em; color: var(--color-muted); margin: 0; }
.cover-meta .cover-version { font-family: var(--font-heading); color: var(--color-heading); }
.cover-meta .cover-sep { margin: 0 0.5em; }
.cover-footer { font-family: var(--font-body); font-size: 0.85em; color: var(--color-muted); margin: 3.2em 0 0; }

/* Each top-level (depth-0) chapter starts on a fresh page. Only depth-0
   structural headings carry .chapter-start (set in walkTree); nested
   sections/pages do not, so sub-content flows continuously. The body's first
   chapter follows the TOC's own \`break-after: page\`, so Paged.js places it at
   the top of a fresh page; a forced break at the very top of a page is a no-op
   in Paged.js, so no spurious blank page is produced (verified empirically). */
.chapter-start { break-before: page; }

/* TOC layout: remove bullets; every entry is a link with a target-counter
   page number. The TOC is heading-based (buildTocFromHeadings): each entry is
   a .toc-entry li carrying a .toc-level-N tier class, nested in <ul>s by tier. */
.toc ul { list-style: none; padding: 0; margin: 0; }
.toc li { margin: 0.25em 0; }
/* Tier-1 entries read as bold group headers; deeper tiers are lighter. */
.toc-level-1 > a { font-weight: bold; }
.toc-entry a {
  display: flex;
  align-items: baseline;
  text-decoration: none;
  color: inherit;
}
/* Page number flushed right, fed by the linked heading's page via target-counter. */
.toc-entry a::after {
  content: target-counter(attr(href), page);
  margin-left: auto;
  padding-left: 0.5em;
}
/* Nested tiers indent so the heading hierarchy reads on paper. */
.toc-entry ul { padding-left: 1.5em; }`;
}

/**
 * Structural list component styling: Tree and CheckList/CheckListItem.
 *
 * Tree:
 *   A monospace, tight-line-height list with list-style: none so bullets do not
 *   compete with the trailing "/" folder marker. Nested .tree lists indent via
 *   padding-left so the hierarchy reads naturally on paper. The .tree rule uses
 *   a class selector (higher specificity than bare `ul`), so it is not overridden
 *   by the generic `ul, ol` rule in buildContent(). The .toc ul rule in
 *   buildStructural() also uses a class + element selector and is unaffected.
 *
 *   Folder/file distinction: a trailing "/" in the .tree-name text content (set
 *   by the component handler) is sufficient; no icon or ::before marker is used.
 *   This keeps the output purely ASCII-safe and avoids emoji encoding issues.
 *
 *   break-inside is not applied to .tree: a long file list can reasonably break
 *   across pages; forcing it whole would risk leaving a large blank gap, consistent
 *   with the project decision not to protect reliably-long blocks.
 *
 * CheckList:
 *   A bare list (list-style: none, padding-left for box room). The checkbox is a
 *   CSS-drawn bordered square via .checklist-item::before (content empty), so it
 *   never appears as a text node, does not affect text extraction, and does not
 *   depend on a font covering the ☐ glyph.
 *
 * Color usage:
 *   - .tree uses var(--font-mono): file/folder trees read naturally in monospace.
 *   - .checklist-item and .tree-name carry no additional color token — they
 *     inherit the body color (var(--color-text)) for plain readability.
 */
function buildStructuralLists(): string {
  return `/* ---- Tree (file/folder hierarchy) ---- */
/* list-style: none removes bullets; "/" suffix distinguishes folders from files. */
/* Class selector beats the generic \`ul, ol\` rule without needing !important.    */
.tree {
  list-style: none;
  padding-left: 0;
  margin: 0.5em 0;
  font-family: var(--font-mono);
  font-size: 0.9em;
  line-height: 1.6;
}

/* Nested .tree: indent children to show hierarchy. */
.tree .tree {
  padding-left: 1.5em;
  margin: 0;
}

/* File/folder name label. No extra color treatment — inherits body color. */
.tree-name {
  display: inline;
}

/* ---- CheckList (Dify-custom pre-publication checklist) ---- */
/* list-style: none; padding-left creates room for the ::before glyph.      */
.checklist {
  list-style: none;
  padding-left: 1.5em;
  margin: 0.5em 0;
}

/* Each item inherits the standard li bottom margin from buildContent(). */
.checklist-item {
  position: relative;
}

/* An empty bordered square drawn in CSS rather than the ☐ glyph: the checkbox no
   longer depends on a font covering U+2610 (Söhne does not, so it fell back to a
   dingbat font), it matches the brand's sharp-corner checkbox, and content stays
   empty so it never appears in extracted text. */
.checklist-item::before {
  content: "";
  position: absolute;
  left: -1.5em;
  top: 0.2em;
  width: 0.75em;
  height: 0.75em;
  border: 1.5px solid var(--color-muted);
  box-sizing: border-box;
}`;
}
