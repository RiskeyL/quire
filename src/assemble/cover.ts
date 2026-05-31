import { escapeHtml } from "../render/html-document.js";

/**
 * Fixed id for the cover heading, used by pagedjs to build the PDF outline
 * entry for the cover. Page anchors are filename-derived slugs, so the
 * reserved "quire-cover" prefix won't collide with them.
 */
const COVER_ID = "quire-cover";

/** Cover metadata: the manual title plus optional brand and release fields. */
export interface CoverMeta {
  /** The manual/document title (always shown). */
  title: string;
  /**
   * Small uppercase kicker above the title (the brand "eyebrow", e.g.
   * "Documentation"). Sourced from the theme `brand.productName`; omitted when
   * blank. Named `productName` for backward compatibility with the token.
   */
  productName?: string;
  /** Release/version label shown in the cover meta line (omitted when blank). */
  version?: string;
  /** Publish date shown in the cover meta line (omitted when blank). */
  date?: string;
  /** Embedded logo image as a `data:` URI (omitted when absent). */
  logoDataUri?: string;
  /** Footer URL low on the cover (e.g. "docs.dify.ai"); omitted when blank. */
  url?: string;
  /**
   * Render for Word rather than the PDF. Each cover element becomes its own
   * paragraph wrapped in a div carrying a per-element `custom-style`
   * (`Quire Cover Logo`/`Product`/`Title`/`Version`/`Date`), so Pandoc stamps a
   * distinct paragraph style on each line and Word can size them into a real
   * hierarchy. The title is a styled paragraph, never an `<h1>` (an `<h1>` would
   * become a `Heading1` that pollutes the Word TOC and the running-header
   * STYLEREF). All five styles share the `QuireCover` prefix, so the export step
   * can find and relocate the contiguous run (see `moveCoverToFront`).
   */
  forWord?: boolean;
  /**
   * PDF cover layout: `"spine"` (default) shows the brand-color bar down the
   * left edge; `"plain"` omits it and the main column fills the full width.
   * Has no effect when `forWord` is true (the Word cover never has a spine).
   */
  layout?: "spine" | "plain";
  /**
   * Logo width on the Word cover. Pandoc honors the HTML `width` attribute and
   * scales the height proportionally. Defaults to `"44mm"` (matching the PDF cover).
   */
  logoWidth?: string;
}

/** True when an optional cover field has visible content. */
function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

/**
 * Render the document cover as an HTML fragment, following the Dify brand
 * "book-spine" layout: a full-bleed brand-color spine down the left edge, the
 * logo anchoring the top of the white main column, and the title block (kicker,
 * title, blue rule, version/date, footer URL) grouped low. The title is always
 * present; every other element appears only when provided.
 *
 * The PDF and Word paths diverge because Pandoc cannot reproduce page-level
 * layout: {@link renderCoverPdf} builds the full spine layout for Chromium,
 * while {@link renderCoverWord} emits a left-aligned typographic adaptation
 * (per-element `custom-style` paragraphs, no spine) that `compile-docx-ref`
 * styles. Both share the `Quire Cover` style prefix so the export step can
 * relocate the run (see `moveCoverToFront`).
 */
export function renderCover(meta: CoverMeta): string {
  return meta.forWord === true ? renderCoverWord(meta) : renderCoverPdf(meta);
}

/** PDF cover: brand spine + white main column with the title block low. */
function renderCoverPdf(meta: CoverMeta): string {
  const main: string[] = [];
  if (hasText(meta.logoDataUri)) {
    main.push(`<img class="cover-logo" src="${meta.logoDataUri}" alt="" />`);
  }
  const hero: string[] = [];
  if (hasText(meta.productName)) {
    hero.push(`<p class="cover-product">${escapeHtml(meta.productName)}</p>`);
  }
  // The title is always present; it keeps the fixed id and .doc-title class so
  // pagedjs builds the outline entry and string-set captures the running-header
  // title (both are global, so nesting it inside .cover-hero is fine).
  hero.push(`<h1 class="doc-title" id="${COVER_ID}">${escapeHtml(meta.title)}</h1>`);
  hero.push(`<div class="cover-rule"></div>`);
  const metaParts: string[] = [];
  if (hasText(meta.version)) {
    metaParts.push(`<span class="cover-version">${escapeHtml(meta.version)}</span>`);
  }
  if (hasText(meta.date)) {
    metaParts.push(`<span class="cover-date">${escapeHtml(meta.date)}</span>`);
  }
  if (metaParts.length > 0) {
    hero.push(
      `<p class="cover-meta">${metaParts.join(`<span class="cover-sep">·</span>`)}</p>`
    );
  }
  if (hasText(meta.url)) {
    hero.push(`<p class="cover-footer">${escapeHtml(meta.url)}</p>`);
  }
  main.push(`<div class="cover-hero">${hero.join("")}</div>`);
  const spine = (meta.layout ?? "spine") === "spine" ? `<div class="cover-spine"></div>` : "";
  return `<section class="cover">${spine}<div class="cover-main">${main.join("")}</div></section>`;
}

/**
 * Word cover: a left-aligned typographic adaptation. The spine is dropped (no
 * Pandoc equivalent) and the blue rule becomes a bottom border on the title
 * style. Each element is a div with its own `custom-style`, which `compile-docx-ref`
 * defines; version and date collapse into one meta paragraph.
 */
function renderCoverWord(meta: CoverMeta): string {
  const parts: string[] = [];
  if (hasText(meta.logoDataUri)) {
    // Pandoc ignores external CSS (and the inline `style` width), so the logo
    // size must be set via the width ATTRIBUTE, which Pandoc honors and scales
    // the height from proportionally. Defaults to 44mm matching the PDF cover logo.
    const img = `<img src="${meta.logoDataUri}" alt="" width="${meta.logoWidth ?? "44mm"}" />`;
    parts.push(
      `<div class="cover-logo" custom-style="Quire Cover Logo"><p>${img}</p></div>`
    );
  }
  if (hasText(meta.productName)) {
    parts.push(
      `<div class="cover-product" custom-style="Quire Cover Product"><p>${escapeHtml(meta.productName)}</p></div>`
    );
  }
  parts.push(
    `<div class="cover-title" custom-style="Quire Cover Title"><p>${escapeHtml(meta.title)}</p></div>`
  );
  const metaText = [meta.version, meta.date]
    .filter(hasText)
    .map((s) => escapeHtml(s))
    .join(" · ");
  if (metaText !== "") {
    parts.push(
      `<div class="cover-meta" custom-style="Quire Cover Meta"><p>${metaText}</p></div>`
    );
  }
  if (hasText(meta.url)) {
    parts.push(
      `<div class="cover-footer" custom-style="Quire Cover Footer"><p>${escapeHtml(meta.url)}</p></div>`
    );
  }
  return `<section class="cover">${parts.join("")}</section>`;
}
