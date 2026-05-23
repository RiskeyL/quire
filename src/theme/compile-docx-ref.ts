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

/**
 * Generate a Pandoc reference document (.docx) with styles patched from the
 * given brand tokens, and write it to `outPath`.
 *
 * The reference doc is used via `pandoc --reference-doc=<outPath>` to brand
 * Word export output with the correct fonts, heading colors, and base size.
 *
 * TODO (M4): patch page geometry — A4/Letter page size (`<w:pgSz>`) and
 * margins (`<w:pgMar>`) in the section properties. The PDF already honors
 * page size/margins via CSS `@page`; the Word output uses Pandoc's default
 * page for now.
 */
export async function compileDocxReference(tokens: BrandTokens, outPath: string): Promise<void> {
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

  // Step e: write patched styles back, regenerate zip, write to disk
  zip.file("word/styles.xml", stylesXml);
  const outBuffer = await zip.generateAsync({ type: "nodebuffer" });
  await writeFile(outPath, outBuffer);
}
