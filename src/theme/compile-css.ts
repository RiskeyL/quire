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
  const boxed = buildBoxed();
  const figure = buildFigure();
  const disclosure = buildDisclosure();
  const steps = buildSteps();
  const cards = buildCards();
  const fields = buildFields();
  const structural = buildStructural();

  return [root, page, elements, content, boxed, figure, disclosure, steps, cards, fields, structural].join("\n");
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

/**
 * Boxed / aside component styling: callouts (Info/Tip/Warning/Note/Check/Danger
 * and the generic Callout), the Panel aside, and the Update changelog box.
 *
 * Per-type left-border colours: info/tip/note reuse existing tokens
 * (--color-accent / --color-muted). warning/danger/check use restrained fixed
 * semantic colours because the token set has no semantic colours yet — these
 * three literals (amber/red/green) are candidates for future tokens once a
 * semantic-colour set exists. Backgrounds stay as very light neutral fills.
 */
function buildBoxed(): string {
  return `/* ---- Callouts ---- */
.callout {
  padding: 0.75em 1em;
  border-left: 3px solid var(--color-muted);
  background: rgba(0,0,0,0.03);
  border-radius: 0 4px 4px 0;
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
/* Per-type left-border colour. info/tip/note use tokens; warning/danger/check
   use fixed semantic colours (future-token candidates). */
/* info and tip deliberately share --color-accent: Mintlify renders both blue,
   so tip does not need its own token. */
.callout-info { border-left-color: var(--color-accent); }
.callout-tip { border-left-color: var(--color-accent); }
.callout-note { border-left-color: var(--color-muted); }
.callout-warning { border-left-color: #b45309; }
.callout-danger { border-left-color: #b91c1c; }
.callout-check { border-left-color: #15803d; }

/* ---- Banner ---- */
/* Full-width emphasized bar. Banner is a docs.json site-config feature in
   Mintlify rather than an in-content component, so the render core emits no
   <div class="banner">; this rule styles a stray passthrough should one occur. */
.banner {
  padding: 0.75em 1em;
  background: rgba(0,0,0,0.08);
  border-radius: 4px;
  margin: 1em 0;
  font-weight: 600;
}

/* ---- Panel (aside) ---- */
.panel {
  display: block;
  border: 1px solid rgba(0,0,0,0.15);
  border-radius: 4px;
  padding: 0.85em 1em;
  margin: 1em 0;
  background: rgba(0,0,0,0.02);
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
 *   - Border and label use var(--color-muted) — a neutral tone that avoids
 *     competing with callout accent colors.
 *   - Body indentation is a plain padding value; no color token needed.
 *   - Hardcoded neutral: the hairline top border uses rgba(0,0,0,0.12), which
 *     is a restrained separator consistent with the table/callout palette used
 *     elsewhere. Future-token candidate once a separator-color token exists.
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

/* ---- Disclosure panels (.tab, .accordion, .expandable) ---- */
/* Shared shape: hairline top border, left padding on body, vertical gap. */
.tab,
.accordion,
.expandable {
  border-top: 1px solid rgba(0,0,0,0.12);  /* hardcoded neutral: future-token candidate */
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
.expandable:first-child {
  border-top: none;
  padding-top: 0;
}

/* ---- Disclosure labels (.*-label) ---- */
/* Bold, slightly smaller, with a decorative collapse hint (▾). */
.tab-label,
.accordion-label,
.expandable-label {
  font-weight: 700;
  font-size: 0.9em;
  color: var(--color-muted);
  margin: 0 0 0.3em;
  padding: 0;
  /* Keep the label with the start of its body so it is not orphaned at the
     bottom of a page (panel-level break-inside is no longer protecting it). */
  break-after: avoid;
}
/* Decorative hint that these were collapsible sections. */
.tab-label::before,
.accordion-label::before,
.expandable-label::before {
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
 *   - Borders use rgba(0,0,0,0.15) — a restrained hairline consistent with
 *     .panel and table cells. Hardcoded neutral; future-token candidate.
 *   - Backgrounds on .card / .tile are intentionally omitted to avoid adding
 *     a surface-color token that doesn't exist yet. The border alone is
 *     sufficient to visually delineate the block.
 */
function buildCards(): string {
  return `/* ---- Card and Tile (bordered content blocks) ---- */
/* Shared visual shape: hairline border, padding, radius, vertical margin.   */
/* break-inside is intentionally absent — card/tile bodies can be long        */
/* (multi-paragraph, code blocks), so forcing them whole would leave a blank  */
/* gap. Mirrors the .tab/.accordion/.step decision.                           */
.card,
.tile {
  border: 1px solid rgba(0,0,0,0.15);  /* hardcoded neutral: future-token candidate */
  border-radius: 4px;
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
 *   - .param-required / .param-deprecated are small uppercase badges. They use
 *     restrained semantic colours (amber border+text for required, neutral
 *     muted for deprecated) because the token set has no semantic colours yet —
 *     these literals are future-token candidates, consistent with the
 *     callout warning/danger/check decision.
 *   - Hairline separator uses rgba(0,0,0,0.12), the same restrained neutral as
 *     the disclosure panels. Future-token candidate.
 *   - .example-label is bold + muted, matching the disclosure/step label tone.
 */
function buildFields(): string {
  return `/* ---- API fields (ParamField, ResponseField) ---- */
/* Each field is separated from the previous by a hairline top border. No     */
/* break-inside: avoid — fields with nested children can be long, so forcing   */
/* them whole would leave a blank-page gap (mirrors table/disclosure/card).    */
.param-field {
  border-top: 1px solid rgba(0,0,0,0.12);  /* hardcoded neutral: future-token candidate */
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
/* Semantic colours are hardcoded (no semantic-colour tokens yet): amber for    */
/* required, neutral muted for deprecated. Both are future-token candidates,    */
/* consistent with the callout warning/danger palette.                          */
.param-required,
.param-deprecated {
  font-size: 0.7em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-left: 0.5em;
  padding: 0.05em 0.4em;
  border-radius: 3px;
}
.param-required {
  border: 1px solid #b45309;  /* amber — future-token candidate */
  color: #b45309;
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
