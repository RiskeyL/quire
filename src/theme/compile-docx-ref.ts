import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import JSZip from "jszip";
import { assertBinary } from "../util/exec.js";
import type { BrandTokens } from "./tokens.js";

/**
 * Thrown when the structural patches against pandoc's reference.docx cannot be
 * applied because the styles.xml layout is unrecognized (e.g. a future pandoc
 * version reorganized the file). Callers can catch this specifically to fall
 * back to unbranded output rather than failing hard.
 */
export class DocxReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxReferenceError";
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Extract the first font name from a CSS font stack.
 * E.g. `"Georgia, 'Times New Roman', serif"` → `"Georgia"`.
 * Word requires a single font name, not a CSS stack.
 * Returns an empty string if the input is empty.
 */
export function firstFontFamily(stack: string): string {
  if (!stack.trim()) return "";
  const first = stack.split(",")[0].trim();
  // Strip surrounding single or double quotes
  return first.replace(/^['"]|['"]$/g, "");
}

/**
 * Parse a pt size string (e.g. `"11pt"` or bare `"11"`) and return half-points
 * (Word's internal unit for font size). Falls back to 22 (11pt) for unsupported units.
 */
export function ptToHalfPoints(size: string): number {
  const ptMatch = size.match(/^(\d+(?:\.\d+)?)pt$/i);
  if (ptMatch) {
    return Math.round(parseFloat(ptMatch[1]) * 2);
  }
  const bareMatch = size.match(/^(\d+(?:\.\d+)?)$/);
  if (bareMatch) {
    return Math.round(parseFloat(bareMatch[1]) * 2);
  }
  // Unsupported unit (e.g. px, em) — fall back to 11pt default
  return 22;
}

/**
 * Convert a CSS hex color string to 6 uppercase hex digits without `#`.
 * Accepts `#RRGGBB` or `#RGB`. Returns `null` for anything else
 * (named colors, rgb(), etc.) — these are skipped in docx patching.
 */
export function hexColor(color: string): string | null {
  const six = color.match(/^#([0-9a-fA-F]{6})$/);
  if (six) return six[1].toUpperCase();
  const three = color.match(/^#([0-9a-fA-F]{3})$/);
  if (three) {
    const [r, g, b] = three[1].split("");
    return (r + r + g + g + b + b).toUpperCase();
  }
  return null;
}

/**
 * Portrait page dimensions in twips (1/20 pt) for the supported page sizes.
 * Word's `<w:pgSz>` uses twips for width/height. The PDF path honors page size
 * via CSS `@page size:`; this is the Word-side equivalent.
 *
 * A4    = 210mm × 297mm = 11906 × 16838 twips.
 * Letter = 8.5in × 11in  = 12240 × 15840 twips.
 */
export function pageSizeToTwips(size: "A4" | "Letter"): { w: number; h: number } {
  return size === "Letter" ? { w: 12240, h: 15840 } : { w: 11906, h: 16838 };
}

/**
 * Conversion factors from a CSS length unit to twips (1/20 pt = 1/1440 in).
 * cm: 1cm = 1440/2.54 = 566.929… → 567 (rounded per value below)
 * mm: 1mm = 56.6929… → 56.7
 * in: 1in = 1440
 * pt: 1pt = 20
 * px: 1px = 1/96 in = 15
 */
const UNIT_TO_TWIPS: Record<string, number> = {
  cm: 567,
  mm: 56.7,
  in: 1440,
  pt: 20,
  px: 15,
};

/** Default margin in twips (2cm) used when a margin value cannot be parsed. */
const DEFAULT_MARGIN_TWIPS = 1134; // 2cm × 567

/**
 * Parse a single CSS length token (e.g. `"2cm"`, `"1in"`, `"96px"`) to twips.
 * Returns `null` for an unrecognized unit or malformed token so callers can
 * fall back to the default rather than emit a nonsense margin.
 */
function lengthTokenToTwips(token: string): number | null {
  const m = token.trim().match(/^(\d+(?:\.\d+)?)(cm|mm|in|pt|px)$/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const factor = UNIT_TO_TWIPS[m[2].toLowerCase()];
  return Math.round(value * factor);
}

/**
 * Parse a CSS `margin` shorthand string to per-side twips, supporting the
 * 1-, 2-, and 4-value forms (CSS top/right/bottom/left ordering):
 *   "2cm"               → all four sides 2cm
 *   "2cm 1in"           → top/bottom 2cm, right/left 1in
 *   "1cm 2cm 3cm 4cm"   → top, right, bottom, left
 * Supported units: cm, mm, in, pt, px. If the string is unparseable (unknown
 * unit, wrong token count, or any token fails), falls back to the 2cm default
 * on all sides — mirroring the existing "skip rather than emit garbage" policy.
 */
export function marginToTwips(margin: string): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const fallback = {
    top: DEFAULT_MARGIN_TWIPS,
    right: DEFAULT_MARGIN_TWIPS,
    bottom: DEFAULT_MARGIN_TWIPS,
    left: DEFAULT_MARGIN_TWIPS,
  };
  const tokens = margin.trim().split(/\s+/);
  const twips = tokens.map(lengthTokenToTwips);
  if (twips.some((t) => t === null)) return fallback;
  const v = twips as number[];
  switch (v.length) {
    case 1:
      return { top: v[0], right: v[0], bottom: v[0], left: v[0] };
    case 2:
      return { top: v[0], right: v[1], bottom: v[0], left: v[1] };
    case 4:
      return { top: v[0], right: v[1], bottom: v[2], left: v[3] };
    default:
      // 3-value form and any other count are unsupported; use the default.
      return fallback;
  }
}

// ---------------------------------------------------------------------------
// XML patching helpers (private)
// ---------------------------------------------------------------------------

/**
 * Build the replacement `<w:rFonts .../>` element for an explicit font name.
 * We set ascii, hAnsi, and cs. Intentionally omit theme attributes so Word
 * treats our value as the authoritative font.
 */
function buildRFonts(fontName: string): string {
  return `<w:rFonts w:ascii="${fontName}" w:hAnsi="${fontName}" w:cs="${fontName}" />`;
}

/**
 * Replace the `<w:rFonts ... />` element inside the docDefaults rPr block.
 * The docDefaults section is tightly bounded, so we operate only inside it.
 * Returns null if the anchor was not found (caller should throw).
 */
function patchDocDefaultsFonts(xml: string, fontName: string): string | null {
  // Guard: skip if fontName is empty to avoid writing invalid OOXML attributes
  if (!fontName) return xml;
  const next = xml.replace(
    /(<w:docDefaults>[\s\S]*?<w:rPrDefault>[\s\S]*?<w:rPr>[\s\S]*?)(<w:rFonts[\s\S]*?\/\>)([\s\S]*?<\/w:rPr>[\s\S]*?<\/w:rPrDefault>)/,
    (_match, before, _oldFonts, after) => `${before}${buildRFonts(fontName)}${after}`
  );
  return next === xml ? null : next;
}

/**
 * Replace the `<w:sz w:val="..."/>` and `<w:szCs w:val="..."/>` elements
 * inside the docDefaults rPr block with the given half-point value.
 * Returns null if neither sz nor szCs anchor was found (caller should throw).
 */
function patchDocDefaultsSize(xml: string, halfPts: number): string | null {
  const val = String(halfPts);
  let changed = false;
  // Replace sz and szCs inside docDefaults only
  const next = xml.replace(
    /(<w:docDefaults>[\s\S]*?<w:rPrDefault>[\s\S]*?<w:rPr>[\s\S]*?)(<w:sz w:val=")[^"]*("[\s\S]*?<\/w:rPr>[\s\S]*?<\/w:rPrDefault>)/,
    (_match, before, szOpen, after) => {
      changed = true;
      const middle = szOpen + val + after;
      // Also replace szCs in the same region — do a second targeted replace
      return (before + middle).replace(
        /(<w:docDefaults>[\s\S]*?<w:rPrDefault>[\s\S]*?<w:rPr>[\s\S]*?<w:sz[\s\S]*?\/\>[\s\S]*?)(<w:szCs w:val=")[^"]*("[\s\S]*?<\/w:rPr>)/,
        (_m2, b2, szCsOpen, rest) => b2 + szCsOpen + val + rest
      );
    }
  );
  return changed ? next : null;
}

/**
 * Patch heading styles (Heading1–Heading6 and Title) plus their linked character
 * styles (Heading1Char–Heading6Char, TitleChar) to use the specified heading font
 * and color. For each paragraph style:
 *  - Replace `<w:rFonts .../>` inside that style's `<w:rPr>` with a plain-font element.
 *  - Replace `<w:color .../>` with a plain hex-color element (when color is patchable).
 * Character styles receive the same treatment.
 * Returns { xml, paragraphsPatched } so the caller can detect no-op on paragraph styles.
 */
function patchHeadingStyles(
  xml: string,
  fontName: string,
  colorHex: string | null
): { xml: string; paragraphsPatched: number } {
  const paragraphIds = ["Title", "Heading1", "Heading2", "Heading3", "Heading4", "Heading5", "Heading6"];
  const charIds = ["TitleChar", "Heading1Char", "Heading2Char", "Heading3Char", "Heading4Char", "Heading5Char", "Heading6Char"];
  let result = xml;
  let paragraphsPatched = 0;

  function patchOneStyle(styleId: string): void {
    const stylePattern = new RegExp(
      `(<w:style[^>]*w:styleId="${styleId}"[^>]*>[\\s\\S]*?<\\/w:style>)`,
      "g"
    );
    let patched = false;
    result = result.replace(stylePattern, (styleBlock) => {
      patched = true;
      let block = styleBlock;

      // Patch rFonts inside this style's rPr — replace existing <w:rFonts .../> element
      // Skip font patch if fontName is empty (avoid invalid OOXML)
      block = block.replace(
        /<w:rPr>([\s\S]*?)<\/w:rPr>/,
        (rPrBlock, inner) => {
          let newInner = inner;
          if (fontName) {
            if (/<w:rFonts/.test(inner)) {
              // Replace existing rFonts (may span multiple lines due to pandoc's formatting)
              newInner = inner.replace(/<w:rFonts[\s\S]*?\/\>/, buildRFonts(fontName));
            } else {
              // No rFonts present — insert at the start of rPr inner content
              newInner = `\n      ${buildRFonts(fontName)}` + inner;
            }
          }
          // Patch color if we have a hex value
          if (colorHex !== null) {
            if (/<w:color/.test(newInner)) {
              newInner = newInner.replace(/<w:color[\s\S]*?\/\>/, `<w:color w:val="${colorHex}" />`);
            } else {
              // Insert color after rFonts (or at start if no rFonts)
              if (fontName) {
                newInner = newInner.replace(
                  buildRFonts(fontName),
                  `${buildRFonts(fontName)}\n      <w:color w:val="${colorHex}" />`
                );
              } else {
                newInner = `\n      <w:color w:val="${colorHex}" />` + newInner;
              }
            }
          }
          return `<w:rPr>${newInner}</w:rPr>`;
        }
      );

      return block;
    });
    if (patched) paragraphsPatched++;
  }

  // Patch paragraph heading styles (these count toward the throw condition)
  for (const styleId of paragraphIds) {
    patchOneStyle(styleId);
  }

  // Patch linked character styles (best-effort: missing ones are fine)
  for (const styleId of charIds) {
    if (result.includes(`w:styleId="${styleId}"`)) {
      patchOneStyle(styleId);
    }
  }

  return { xml: result, paragraphsPatched };
}

/**
 * Patch the VerbatimChar style's rFonts to use the given mono font.
 * Best-effort: if the style is not found or fontName is empty, returns xml unchanged.
 */
function patchMonoFont(xml: string, fontName: string): string {
  if (!fontName || !xml.includes('w:styleId="VerbatimChar"')) {
    // Style not present in this pandoc version, or empty font name — skip silently
    return xml;
  }
  return xml.replace(
    /(<w:style[^>]*w:styleId="VerbatimChar"[\s\S]*?<w:rPr>[\s\S]*?)(<w:rFonts[\s\S]*?\/\>)([\s\S]*?<\/w:rPr>[\s\S]*?<\/w:style>)/,
    (_match, before, _oldFonts, after) => `${before}${buildRFonts(fontName)}${after}`
  );
}

/**
 * Insert `<w:pageBreakBefore/>` into the Heading1 paragraph style's `<w:pPr>`,
 * so each top-level chapter (an `<h1>` → Word "Heading 1") starts on a new page.
 * The cover title is also an `<h1>`; Word ignores pageBreakBefore on the very
 * first paragraph of the document, so the cover is unaffected (verified in the
 * generated docx). Idempotent: if pageBreakBefore is already present in the
 * Heading1 pPr, the style is returned unchanged. Best-effort: returns the input
 * unchanged (no throw) if the Heading1 style or its pPr is not found, so the
 * run degrades to "no chapter break" rather than aborting.
 */
function patchHeading1PageBreak(xml: string): string {
  return xml.replace(
    /(<w:style[^>]*w:styleId="Heading1"[^>]*>[\s\S]*?)(<w:pPr>)([\s\S]*?<\/w:pPr>[\s\S]*?<\/w:style>)/,
    (match, before, pPrOpen, after) => {
      if (/<w:pageBreakBefore\s*\/>/.test(match)) return match; // already patched
      return `${before}${pPrOpen}<w:pageBreakBefore />${after}`;
    }
  );
}

/**
 * Add a light hairline grid to the default "Table" style so Word tables have
 * visible cell borders (Pandoc's default Table style defines none, leaving
 * tables looking like floating text). This mirrors the PDF's `th, td` borders.
 *
 * The borders go on the default Table style (w:default="1"), which every Pandoc
 * table inherits, so all tables get the grid from one patch — no per-table
 * surgery. Single 0.5pt (w:sz="4") light-gray (BFBFBF) lines on the outer edges
 * and between cells.
 *
 * Per the OOXML schema (CT_TblPrBase), `<w:tblBorders>` precedes `<w:tblCellMar>`,
 * so it is inserted right before tblCellMar (falling back to the end of tblPr if
 * tblCellMar is absent). Idempotent (skips if tblBorders already present) and
 * best-effort: returns the input unchanged if the Table style or its tblPr is
 * not found, so the run degrades to borderless tables rather than aborting.
 */
function patchTableBorders(xml: string): string {
  const sides = ["top", "left", "bottom", "right", "insideH", "insideV"];
  const borders =
    "<w:tblBorders>" +
    sides.map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF" />`).join("") +
    "</w:tblBorders>";
  // Match by styleId only (it is unique: "Table" is distinct from "TableNormal"
  // / "TableGrid"). Attribute order is not assumed — pandoc's default reference
  // doc emits the Table style as <w:style w:type="table" w:default="1"
  // w:styleId="Table">, so a regex that pinned w:type before w:styleId would
  // silently miss it (and leave tables borderless).
  return xml.replace(
    /(<w:style\b[^>]*w:styleId="Table"[^>]*>[\s\S]*?<w:tblPr>)([\s\S]*?)(<\/w:tblPr>)/,
    (match, open: string, inner: string, close: string) => {
      if (/<w:tblBorders>/.test(inner)) return match; // already patched
      if (/<w:tblCellMar\b/.test(inner)) {
        return open + inner.replace(/<w:tblCellMar\b/, `${borders}<w:tblCellMar`) + close;
      }
      return open + inner + borders + close;
    }
  );
}

/**
 * Per-type left-border color for the Word callout boxes, mirroring the PDF
 * callout palette (see compile-css `buildBoxed`): green for tip/check, brown for
 * note, red for warning/danger. Info is intentionally absent here because it
 * uses the brand accent token (resolved at call time).
 */
const CALLOUT_BORDER_HEX: Record<string, string> = {
  Tip: "15803D",
  Check: "15803D",
  Note: "B45309",
  Warning: "B91C1C",
  Danger: "B91C1C",
};

/** Deterministic order of callout types (drives the injected style block). */
const CALLOUT_TYPES = ["Info", "Tip", "Note", "Warning", "Danger", "Check"] as const;

/**
 * Build one callout paragraph style ("Callout {Title}"). The box is a thin
 * neutral border on three sides with a thick colored left accent bar plus a
 * light fill, matching the PDF's left-accent-bar-over-neutral-tint look. Word
 * merges the borders of consecutive same-style paragraphs into one continuous
 * box (so a multi-paragraph callout reads as a single box); `<w:between>` is set
 * to `nil` to suppress internal lines.
 */
function buildCalloutStyle(title: string, borderHex: string): string {
  return (
    `<w:style w:type="paragraph" w:styleId="Callout${title}">` +
    `<w:name w:val="Callout ${title}" />` +
    `<w:basedOn w:val="BodyText" />` +
    `<w:pPr>` +
    `<w:pBdr>` +
    `<w:top w:val="single" w:sz="4" w:space="6" w:color="E5E5E5" />` +
    `<w:left w:val="single" w:sz="24" w:space="6" w:color="${borderHex}" />` +
    `<w:bottom w:val="single" w:sz="4" w:space="6" w:color="E5E5E5" />` +
    `<w:right w:val="single" w:sz="4" w:space="6" w:color="E5E5E5" />` +
    `<w:between w:val="nil" />` +
    `</w:pBdr>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="F7F7F7" />` +
    `</w:pPr>` +
    `</w:style>`
  );
}

/**
 * Inject one paragraph style per callout type before `</w:styles>`, so the docx
 * renderer's `custom-style="Callout {Type}"` divs map to a bordered, tinted box
 * (Pandoc matches the reference-doc style by name and stamps it on every
 * paragraph inside the callout div). Info takes the brand accent color; the rest
 * use the fixed semantic palette in {@link CALLOUT_BORDER_HEX}.
 *
 * Idempotent (only injects the types not already present) and best-effort
 * (returns the input unchanged if the `</w:styles>` anchor is absent), so a
 * future pandoc layout change degrades to plain callouts rather than aborting.
 */
function patchCalloutStyles(xml: string, accentHex: string | null): string {
  if (!xml.includes("</w:styles>")) return xml;
  const infoHex = accentHex ?? "2563EB";
  const missing = CALLOUT_TYPES.filter(
    (title) => !xml.includes(`w:styleId="Callout${title}"`)
  );
  if (missing.length === 0) return xml; // already patched
  const block = missing
    .map((title) =>
      buildCalloutStyle(title, title === "Info" ? infoHex : CALLOUT_BORDER_HEX[title])
    )
    .join("");
  return xml.replace("</w:styles>", `${block}</w:styles>`);
}

/** Header-row cell fill (light gray), mirroring the PDF's shaded `th`. */
const TABLE_HEADER_FILL = "F0F0F0";

/**
 * Give the table header row a light fill and bold text so it reads as a header,
 * mirroring the PDF's shaded `th`. Pandoc's tables carry `tblLook w:firstRow="1"`,
 * so Word applies the Table style's `firstRow` conditional band to the first row.
 *
 * Pandoc's default Table style already defines a `firstRow` band (a bottom
 * border + bottom vAlign), so this MERGES into it rather than adding a duplicate:
 * it inserts a bold run property (schema order: rPr precedes tcPr) and a cell
 * `<w:shd>` fill (schema order: shd precedes vAlign, follows tcBorders). If no
 * `firstRow` band exists (a future pandoc layout), a fresh one is appended before
 * the Table style's `</w:style>`. Idempotent (skips when the fill is already
 * present) and best-effort (returns the input unchanged if the Table style is
 * absent), so the run degrades to an unshaded header rather than aborting.
 */
function patchTableHeaderShading(xml: string): string {
  const shd = `<w:shd w:val="clear" w:color="auto" w:fill="${TABLE_HEADER_FILL}" />`;
  const freshBand =
    `<w:tblStylePr w:type="firstRow">` +
    `<w:rPr><w:b /></w:rPr>` +
    `<w:tcPr>${shd}</w:tcPr>` +
    `</w:tblStylePr>`;
  return xml.replace(
    /(<w:style\b[^>]*w:styleId="Table"[^>]*>[\s\S]*?)(<\/w:style>)/,
    (match, body: string, close: string) => {
      const existing = body.match(
        /<w:tblStylePr\b[^>]*w:type="firstRow"[\s\S]*?<\/w:tblStylePr>/
      );
      if (!existing) return body + freshBand + close; // no band yet: add one
      let band = existing[0];
      if (band.includes(`w:fill="${TABLE_HEADER_FILL}"`)) return match; // already patched

      // Bold the header text. Merge into an existing rPr, else insert one before
      // tcPr (rPr precedes tcPr in CT_TblStylePr), else before the band close.
      if (/<w:rPr\b/.test(band)) {
        if (!/<w:rPr\b[^>]*>[\s\S]*?<w:b\b/.test(band)) {
          band = band.replace(/<w:rPr>/, `<w:rPr><w:b />`);
        }
      } else if (/<w:tcPr\b/.test(band)) {
        band = band.replace(/(<w:tcPr\b)/, `<w:rPr><w:b /></w:rPr>$1`);
      } else {
        band = band.replace(/(<\/w:tblStylePr>)/, `<w:rPr><w:b /></w:rPr>$1`);
      }

      // Fill the header cells. shd precedes vAlign in CT_TcPr, so insert it just
      // before vAlign when present; otherwise before the tcPr close; if the band
      // has no tcPr, add one before its close.
      if (/<w:vAlign\b/.test(band)) {
        band = band.replace(/(<w:vAlign\b)/, `${shd}$1`);
      } else if (/<\/w:tcPr>/.test(band)) {
        band = band.replace(/(<\/w:tcPr>)/, `${shd}$1`);
      } else if (/<w:tcPr\b/.test(band)) {
        // Self-closed or childless tcPr is uncommon; fall back to a fresh tcPr.
        band = band.replace(/(<\/w:tblStylePr>)/, `<w:tcPr>${shd}</w:tcPr>$1`);
      } else {
        band = band.replace(/(<\/w:tblStylePr>)/, `<w:tcPr>${shd}</w:tcPr>$1`);
      }

      return body.replace(existing[0], band) + close;
    }
  );
}

// ---------------------------------------------------------------------------
// Page furniture: header/footer parts and section-properties wiring
// ---------------------------------------------------------------------------

// Relationship ids for the header/footer parts. These are high enough to avoid
// colliding with pandoc's existing rIds (rId1–rId8, rId30) in the reference doc.
const HEADER_RID = "rId90";
const FOOTER_RID = "rId91";

// Shared run properties for the muted, ~9pt furniture text, matching the PDF's
// @page margin-box styling (#6b7280 / 9pt). w:sz is in half-points → 18 = 9pt.
const FURNITURE_RPR = '<w:rPr><w:color w:val="6B7280" /><w:sz w:val="18" /></w:rPr>';

/**
 * Build word/header1.xml: the document title flush-left, and a STYLEREF field
 * for the current Heading 1 flush-right. The right alignment uses a single
 * right-aligned tab stop at the content width (page width minus left+right
 * margins), so the title sits left and the chapter sits right on one line.
 * Mirrors the PDF running header (doc title @top-left, chapter @top-right).
 *
 * `titleText` is XML-escaped. When empty, the title run is omitted but the
 * STYLEREF chapter field still renders (header degrades gracefully).
 */
function buildHeaderXml(titleText: string, contentWidthTwips: number): string {
  const escaped = escapeXml(titleText);
  const titleRun = escaped
    ? `<w:r>${FURNITURE_RPR}<w:t xml:space="preserve">${escaped}</w:t></w:r>`
    : "";
  // STYLEREF "Heading 1" \* MERGEFORMAT — shows the in-effect Heading 1 text.
  // Each run carries the muted/9pt rPr so the whole header line is uniform.
  const stylerefField =
    `<w:r>${FURNITURE_RPR}<w:fldChar w:fldCharType="begin" /></w:r>` +
    `<w:r>${FURNITURE_RPR}<w:instrText xml:space="preserve"> STYLEREF "Heading 1" \\* MERGEFORMAT </w:instrText></w:r>` +
    `<w:r>${FURNITURE_RPR}<w:fldChar w:fldCharType="separate" /></w:r>` +
    `<w:r>${FURNITURE_RPR}<w:t xml:space="preserve"></w:t></w:r>` +
    `<w:r>${FURNITURE_RPR}<w:fldChar w:fldCharType="end" /></w:r>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:p>` +
    `<w:pPr><w:tabs><w:tab w:val="right" w:pos="${contentWidthTwips}" /></w:tabs></w:pPr>` +
    titleRun +
    `<w:r>${FURNITURE_RPR}<w:tab /></w:r>` +
    stylerefField +
    `</w:p>` +
    `</w:hdr>`
  );
}

/**
 * Build word/footer1.xml: a centered PAGE field for the page number, styled
 * with the same muted/9pt furniture run properties as the header.
 */
function buildFooterXml(): string {
  const pageField =
    `<w:r>${FURNITURE_RPR}<w:fldChar w:fldCharType="begin" /></w:r>` +
    `<w:r>${FURNITURE_RPR}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>` +
    `<w:r>${FURNITURE_RPR}<w:fldChar w:fldCharType="separate" /></w:r>` +
    `<w:r>${FURNITURE_RPR}<w:t xml:space="preserve">1</w:t></w:r>` +
    `<w:r>${FURNITURE_RPR}<w:fldChar w:fldCharType="end" /></w:r>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:p>` +
    `<w:pPr><w:jc w:val="center" /></w:pPr>` +
    pageField +
    `</w:p>` +
    `</w:ftr>`
  );
}

/** Minimal XML escaping for text interpolated into header/footer runs. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Add the header/footer Override entries to [Content_Types].xml.
 * Idempotent and best-effort: if the closing </Types> anchor is missing, the
 * input is returned unchanged.
 */
function patchContentTypes(xml: string): string {
  if (xml.includes("/word/header1.xml")) return xml;
  const overrides =
    `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml" />` +
    `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml" />`;
  return xml.replace("</Types>", `${overrides}</Types>`);
}

/**
 * Add the header/footer Relationship entries to word/_rels/document.xml.rels.
 * Idempotent and best-effort: returns the input unchanged if the closing
 * </Relationships> anchor is missing.
 */
function patchDocumentRels(xml: string): string {
  if (xml.includes(`Id="${HEADER_RID}"`)) return xml;
  const rels =
    `<Relationship Id="${HEADER_RID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml" />` +
    `<Relationship Id="${FOOTER_RID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml" />`;
  return xml.replace("</Relationships>", `${rels}</Relationships>`);
}

/**
 * Patch word/document.xml's `<w:sectPr>` to (a) reference the header/footer
 * parts and (b) carry the page size and margins. Pandoc copies the reference
 * doc's sectPr verbatim into its generated output (verified empirically), so
 * branding the reference-doc sectPr is sufficient — no post-processing of the
 * output docx is needed.
 *
 * The reference doc's r: namespace is already declared on <w:document>
 * (xmlns:r=...), so the r:id attributes resolve. The header/footer references
 * must come FIRST inside sectPr per the OOXML schema's element ordering
 * (headerReference/footerReference precede pgSz/pgMar).
 *
 * Best-effort: returns the input unchanged (no throw) if no <w:sectPr> anchor
 * is found, so the run degrades to Pandoc's default page rather than aborting.
 */
function patchSectionProperties(
  xml: string,
  geometry: {
    pgW: number;
    pgH: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
    headerDist: number;
    footerDist: number;
  }
): string {
  const refs =
    `<w:headerReference w:type="default" r:id="${HEADER_RID}" />` +
    `<w:footerReference w:type="default" r:id="${FOOTER_RID}" />`;
  const pg =
    `<w:pgSz w:w="${geometry.pgW}" w:h="${geometry.pgH}" />` +
    `<w:pgMar w:top="${geometry.top}" w:right="${geometry.right}" ` +
    `w:bottom="${geometry.bottom}" w:left="${geometry.left}" ` +
    `w:header="${geometry.headerDist}" w:footer="${geometry.footerDist}" w:gutter="0" />`;

  // Self-closing sectPr (e.g. "<w:sectPr/>"): replace with a full element.
  if (/<w:sectPr\s*\/>/.test(xml)) {
    return xml.replace(/<w:sectPr\s*\/>/, `<w:sectPr>${refs}${pg}</w:sectPr>`);
  }
  // Open/close sectPr: inject refs at the very start (schema order) and pg at
  // the end, preserving any existing children (e.g. pandoc's footnotePr).
  return xml.replace(
    /<w:sectPr(\s[^>]*)?>([\s\S]*?)<\/w:sectPr>/,
    (_m, attrs, inner) => `<w:sectPr${attrs ?? ""}>${refs}${inner}${pg}</w:sectPr>`
  );
}

// ---------------------------------------------------------------------------
// Binary capture helper (must use buffer encoding to avoid UTF-8 corruption)
// ---------------------------------------------------------------------------

function pandocDefaultRefDocx(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "pandoc",
      ["--print-default-data-file", "reference.docx"],
      { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout as unknown as Buffer);
        }
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for {@link compileDocxReference}. All fields are optional. */
export interface CompileDocxReferenceOptions {
  /**
   * Document title for the Word running header (flush-left). When omitted, the
   * header still renders the right-aligned STYLEREF chapter field but with no
   * title text — so the existing 2-argument callers keep working unchanged.
   */
  docTitle?: string;
}

/**
 * Generate a Pandoc reference document (.docx) with styles patched from the
 * given brand tokens, and write it to `outPath`.
 *
 * The reference doc is used via `pandoc --reference-doc=<outPath>` to brand
 * Word export output with the correct fonts, heading colors, base size, page
 * geometry, and running header/footer. Pandoc copies the reference doc's
 * `<w:sectPr>` (page size, margins, header/footer references) verbatim into the
 * generated output and carries the header/footer parts through, so branding the
 * reference doc alone is sufficient — no post-processing of the output is needed
 * (verified empirically against pandoc 3.8).
 *
 * Page furniture (header/footer/geometry) is applied best-effort: if an anchor
 * is missing the furniture is skipped silently rather than aborting the run,
 * mirroring the existing warn-and-fallback policy. The font/size/heading
 * patches remain hard requirements (they throw DocxReferenceError on failure).
 */
export async function compileDocxReference(
  tokens: BrandTokens,
  outPath: string,
  options?: CompileDocxReferenceOptions
): Promise<void> {
  // Step a: preflight
  await assertBinary("pandoc", "Install it with: brew install pandoc");

  // Step b: capture pandoc's default reference.docx as binary
  const docxBuffer = await pandocDefaultRefDocx();

  // Step c: load into JSZip and extract styles.xml
  const zip = await JSZip.loadAsync(docxBuffer);
  const stylesFile = zip.file("word/styles.xml");
  if (!stylesFile) {
    throw new Error("Pandoc reference.docx does not contain word/styles.xml");
  }
  let stylesXml = await stylesFile.async("string");

  // Step d: patch styles.xml with token values

  const bodyFontName = firstFontFamily(tokens.typography.bodyFont);
  const headingFontName = firstFontFamily(tokens.typography.headingFont);
  const monoFontName = firstFontFamily(tokens.typography.monoFont);
  const halfPts = ptToHalfPoints(tokens.typography.baseSize);
  const headingColorHex = hexColor(tokens.colors.heading);

  // Body font in docDefaults (core patch — must succeed unless fontName is empty)
  if (bodyFontName) {
    const afterBodyFont = patchDocDefaultsFonts(stylesXml, bodyFontName);
    if (afterBodyFont === null) {
      throw new DocxReferenceError(
        "compile-docx-ref: could not apply brand to pandoc's reference.docx " +
        "(unrecognized styles.xml structure; pandoc version may have changed). " +
        "Body font docDefaults anchor not found."
      );
    }
    stylesXml = afterBodyFont;
  }

  // Base size in docDefaults (core patch — must succeed)
  const afterSize = patchDocDefaultsSize(stylesXml, halfPts);
  if (afterSize === null) {
    throw new DocxReferenceError(
      "compile-docx-ref: could not apply brand to pandoc's reference.docx " +
      "(unrecognized styles.xml structure; pandoc version may have changed). " +
      "Base size (sz/szCs) docDefaults anchor not found."
    );
  }
  stylesXml = afterSize;

  // Heading font + color in heading paragraph styles (core patch — at least one must match)
  const { xml: afterHeadings, paragraphsPatched } = patchHeadingStyles(stylesXml, headingFontName, headingColorHex);
  if (paragraphsPatched === 0) {
    throw new DocxReferenceError(
      "compile-docx-ref: could not apply brand to pandoc's reference.docx " +
      "(unrecognized styles.xml structure; pandoc version may have changed). " +
      "Zero heading paragraph styles (Title, Heading1–Heading6) found."
    );
  }
  stylesXml = afterHeadings;

  // Mono font in VerbatimChar (best-effort)
  stylesXml = patchMonoFont(stylesXml, monoFontName);

  // Feature 1 (Word side): top-level chapters break to a new page. <h1> maps to
  // Word "Heading 1", so a pageBreakBefore on the Heading1 style breaks before
  // each chapter. Best-effort — degrades to "no break" if the anchor is gone.
  stylesXml = patchHeading1PageBreak(stylesXml);

  // Give Word tables a hairline grid (Pandoc's default Table style has none),
  // mirroring the PDF's cell borders. Best-effort.
  stylesXml = patchTableBorders(stylesXml);

  // Shade + bold the table header row (firstRow conditional band), mirroring the
  // PDF's `th` background. Best-effort.
  stylesXml = patchTableHeaderShading(stylesXml);

  // Define the per-type callout box styles ("Callout {Type}") that the docx
  // renderer's custom-style attributes resolve to. Info uses the brand accent;
  // the rest use the fixed semantic palette. Best-effort.
  stylesXml = patchCalloutStyles(stylesXml, hexColor(tokens.colors.accent));

  zip.file("word/styles.xml", stylesXml);

  // Step e: page furniture — header/footer parts + section-properties geometry.
  // All best-effort: a missing anchor skips that piece rather than aborting.

  // Compute page geometry (Feature 3) from tokens.
  const { w: pgW, h: pgH } = pageSizeToTwips(tokens.page.size);
  const margins = marginToTwips(tokens.page.margin);
  // Header/footer distance: half the (smaller vertical) margin, floored at 360
  // twips (0.25in) so the furniture never sits flush against the page edge.
  const minVerticalMargin = Math.min(margins.top, margins.bottom);
  const headerFooterDist = Math.max(360, Math.round(minVerticalMargin / 2));
  // Content width = page width minus left+right margins; the header's
  // right-aligned tab stop sits here so the chapter title is flush-right.
  const contentWidth = pgW - margins.left - margins.right;

  // Header (Feature 2): title left, STYLEREF chapter right.
  zip.file("word/header1.xml", buildHeaderXml(options?.docTitle ?? "", contentWidth));
  // Footer (Feature 2): centered PAGE field.
  zip.file("word/footer1.xml", buildFooterXml());

  // Content types: register the header/footer parts (best-effort).
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    zip.file("[Content_Types].xml", patchContentTypes(await ctFile.async("string")));
  }

  // Document relationships: point the header/footer rIds at the parts (best-effort).
  const relsFile = zip.file("word/_rels/document.xml.rels");
  if (relsFile) {
    zip.file("word/_rels/document.xml.rels", patchDocumentRels(await relsFile.async("string")));
  }

  // Section properties: header/footer references + page geometry (best-effort).
  const docFile = zip.file("word/document.xml");
  if (docFile) {
    const patchedDoc = patchSectionProperties(await docFile.async("string"), {
      pgW,
      pgH,
      top: margins.top,
      right: margins.right,
      bottom: margins.bottom,
      left: margins.left,
      headerDist: headerFooterDist,
      footerDist: headerFooterDist,
    });
    zip.file("word/document.xml", patchedDoc);
  }

  // Step f: regenerate zip, write to disk
  const outBuffer = await zip.generateAsync({ type: "nodebuffer" });
  await writeFile(outPath, outBuffer);
}
