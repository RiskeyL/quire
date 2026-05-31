import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { run, assertBinary } from "../util/exec.js";

/** Render a full HTML document to a Word file via Pandoc. */
export async function htmlToDocx(
  html: string,
  outPath: string,
  options?: {
    toc?: boolean;
    tocDepth?: number;
    referenceDoc?: string;
    frontMatterBreak?: boolean;
    updateFields?: boolean;
    /** Relocate the cover ahead of the TOC and drop Pandoc's auto Title para. */
    moveCover?: boolean;
    restartAtBody?: boolean;
  }
): Promise<void> {
  await assertBinary("pandoc", "Install it with: brew install pandoc");
  const dir = await mkdtemp(join(tmpdir(), "quire-html-"));
  const htmlPath = join(dir, "input.html");
  try {
    await writeFile(htmlPath, html, "utf8");
    const args = [htmlPath, "-f", "html", "-o", outPath];
    if (options?.toc) {
      args.push("--toc", `--toc-depth=${options.tocDepth ?? 3}`);
    }
    if (options?.referenceDoc) {
      args.push(`--reference-doc=${options.referenceDoc}`);
    }
    await run("pandoc", args);
    // Post-process the generated docx in a single zip pass: split the front
    // matter into its own header/footerless section, and/or flag fields for
    // update so Word populates the TOC on open.
    if (options?.frontMatterBreak || options?.updateFields || options?.moveCover) {
      await applyDocxPostProcessing(outPath, {
        frontMatterBreak: options?.frontMatterBreak ?? false,
        updateFields: options?.updateFields ?? false,
        moveCover: options?.moveCover ?? false,
        restartAtBody: options?.restartAtBody ?? true,
      });
    }
  } catch (err) {
    await rm(outPath, { force: true }).catch(() => {});
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Make the cover/TOC front matter a separate Word section with NO running
 * header/footer (so the furniture only appears from the body) and restart the
 * body section's page numbering at 1 (the cover/TOC are unnumbered front matter).
 *
 * Word headers/footers are per-section, but Pandoc emits a single section, so
 * we split the document: insert a section break (a `<w:sectPr>` carrying the
 * page geometry but no header/footer references) right before the first
 * Heading 1 (the first body chapter). Everything before it (the Title block and
 * the TOC) becomes section one with empty headers/footers; the body keeps the
 * final `<w:sectPr>` (which carries the header/footer references + geometry).
 *
 * Pure + best-effort: returns the input unchanged when there is no body sectPr
 * or no Heading1 paragraph (e.g. a headingless single-page doc), leaving the
 * furniture on every page rather than corrupting the document. Exported for
 * unit testing.
 */
export function insertFrontMatterSection(documentXml: string, restartAtBody = true): string {
  // The body section's properties: the <w:sectPr> just before </w:body>.
  const bodySectPr = documentXml.match(
    /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>(?=\s*<\/w:body>)/
  )?.[0];
  if (!bodySectPr) return documentXml;

  // Insert the break before the paragraph that opens the first Heading1 (the
  // first body chapter). TOC entries use TOC1/TOC2 styles and the title uses the
  // Title style, so the first Heading1 is reliably the first body content.
  const styleIdx = documentXml.search(/<w:pStyle w:val="Heading1"\s*\/>/);
  if (styleIdx === -1) return documentXml;
  // The paragraph opening is the nearest preceding "<w:p>" or "<w:p " (a space
  // rules out <w:pPr>/<w:pStyle>, which start with "<w:p" but not "<w:p>"/"<w:p ").
  const pOpen = Math.max(
    documentXml.lastIndexOf("<w:p>", styleIdx),
    documentXml.lastIndexOf("<w:p ", styleIdx)
  );
  if (pOpen === -1) return documentXml;

  // Front-matter section = body section minus the header/footer references, so
  // the cover/TOC show no furniture. It keeps default numbering (its pages are
  // unnumbered because there is no footer, so this is moot).
  const frontMatterSectPr = bodySectPr
    .replace(/<w:headerReference\b[^>]*\/>/g, "")
    .replace(/<w:footerReference\b[^>]*\/>/g, "");

  // Body section: when restartAtBody is true (default), restart page numbering
  // at 1 so the first body page shows "1" (the cover/TOC are unnumbered front
  // matter). pgNumType is appended before </w:sectPr>; Word reads sectPr
  // children order-independently. When false, keep bodySectPr unchanged so
  // numbering runs continuously through the front matter.
  const bodySectPrNumbered = restartAtBody
    ? bodySectPr.includes("<w:pgNumType")
      ? bodySectPr
      : bodySectPr.replace("</w:sectPr>", '<w:pgNumType w:start="1" /></w:sectPr>')
    : bodySectPr;

  // The body sectPr sits after the first Heading1, so swapping it does not shift
  // pOpen. Apply the numbering change, then insert the front-matter break.
  const numbered = documentXml.replace(bodySectPr, bodySectPrNumbered);
  const breakPara = `<w:p><w:pPr>${frontMatterSectPr}</w:pPr></w:p>`;
  return numbered.slice(0, pOpen) + breakPara + numbered.slice(pOpen);
}

/**
 * Flag the document's fields for update so Word recomputes them on open. Pandoc
 * emits the TOC as an empty field (no cached page numbers) and a `PAGE`/STYLEREF
 * header/footer with placeholder values; `<w:updateFields w:val="true"/>` in
 * settings.xml makes Word offer to update them when the file is opened, so the
 * TOC and its page numbers populate without the reader running "update field"
 * manually. The element is inserted right after the `<w:settings>` root (Word
 * reads settings.xml order-tolerantly). Idempotent (skips if already present)
 * and best-effort (returns the input unchanged if there is no settings root).
 */
export function enableUpdateFields(settingsXml: string): string {
  if (settingsXml.includes("<w:updateFields")) return settingsXml;
  return settingsXml.replace(
    /(<w:settings\b[^>]*>)/,
    `$1<w:updateFields w:val="true" />`
  );
}

/** Remove the first `<w:p>…</w:p>` paragraph whose pStyle matches `styleMarker`. */
function removeParagraphByStyle(xml: string, styleMarker: string): string {
  const idx = xml.indexOf(styleMarker);
  if (idx === -1) return xml;
  const open = Math.max(xml.lastIndexOf("<w:p>", idx), xml.lastIndexOf("<w:p ", idx));
  if (open === -1) return xml;
  const close = xml.indexOf("</w:p>", idx);
  if (close === -1) return xml;
  return xml.slice(0, open) + xml.slice(close + "</w:p>".length);
}

/**
 * Move the cover to the front of the document so it precedes the table of
 * contents in the Word output.
 *
 * Pandoc emits, in order: a metadata Title paragraph (from the HTML `<title>`),
 * the TOC (a `<w:sdt>` block), then the body. The cover is authored as per-element
 * `custom-style="Quire Cover …"` divs, so its paragraphs carry distinct
 * `pStyle="QuireCover<Element>"` values (Logo/Product/Title/Version/Date) and land
 * in the body, AFTER the TOC. This relocates the contiguous run of cover paragraphs
 * to the very top of `<w:body>`, drops Pandoc's now-redundant Title paragraph (the
 * manual title lives on the cover; `dc:title` in core.xml is untouched), and adds a
 * page break so the cover occupies its own page. The subsequent
 * `insertFrontMatterSection` then makes the cover + TOC the furniture-free front
 * matter.
 *
 * The cover run is detected by the shared `w:val="QuireCover` style-id PREFIX, so
 * it spans all the distinct per-element styles (and still matches the legacy
 * single `QuireCover` style). The `w:val="Title"` removal uses an exact match
 * (closing quote included), so it never catches the `QuireCoverTitle` line.
 *
 * Pure + best-effort: returns the input unchanged when there is no cover block or
 * no `<w:body>`. Exported for unit testing.
 */
export function moveCoverToFront(documentXml: string): string {
  // Style-id prefix shared by every cover paragraph (QuireCoverLogo, …Title, …).
  const COVER_STYLE = 'w:val="QuireCover';
  const firstStyle = documentXml.indexOf(COVER_STYLE);
  if (firstStyle === -1) return documentXml;
  const lastStyle = documentXml.lastIndexOf(COVER_STYLE);

  // Span the contiguous cover run: from the <w:p> opening the first cover
  // paragraph to the </w:p> closing the last one.
  const coverStart = Math.max(
    documentXml.lastIndexOf("<w:p>", firstStyle),
    documentXml.lastIndexOf("<w:p ", firstStyle)
  );
  if (coverStart === -1) return documentXml;
  const lastClose = documentXml.indexOf("</w:p>", lastStyle);
  if (lastClose === -1) return documentXml;
  const coverEnd = lastClose + "</w:p>".length;

  const coverBlock = documentXml.slice(coverStart, coverEnd);

  // Remove the cover block, then Pandoc's auto Title paragraph (which sits before
  // the cover, so removing the cover first does not shift its index).
  let xml = documentXml.slice(0, coverStart) + documentXml.slice(coverEnd);
  xml = removeParagraphByStyle(xml, 'w:val="Title"');

  // Re-insert the cover (plus a page break) at the very start of the body.
  const bodyOpen = xml.indexOf("<w:body>");
  if (bodyOpen === -1) return documentXml;
  const insertAt = bodyOpen + "<w:body>".length;
  const pageBreak = `<w:p><w:r><w:br w:type="page" /></w:r></w:p>`;
  return xml.slice(0, insertAt) + coverBlock + pageBreak + xml.slice(insertAt);
}

/**
 * Strip the base64 data: URIs that Pandoc copies into each picture's `descr`
 * (alt-text) attribute. When an `<img src="data:...">` has no `alt`, Pandoc both
 * extracts the image to word/media (the real, rendered reference via
 * `a:blip r:embed`) AND dumps the entire data URI into `descr`, duplicating every
 * image's bytes as text in document.xml. For an image-heavy document that is the
 * bulk of the file (and a big share of post-processing memory). Replacing the
 * data URI with an empty alt is lossless: the picture still renders via its media
 * relationship. Idempotent (a cleared descr has no data: URI to match).
 */
export function stripDataUriDescriptions(documentXml: string): string {
  return documentXml.replace(/descr="data:[^"]*"/g, 'descr=""');
}

/**
 * Apply the post-pandoc patches to the generated docx in a single read/write
 * zip pass (cheaper than reopening the archive per patch, which matters for
 * large image-heavy documents): strip data-URI picture descriptions from
 * word/document.xml (always), optionally split the front matter into its own
 * section, and optionally flag fields for update on word/settings.xml. The zip
 * is regenerated with DEFLATE compression (JSZip would otherwise STORE it
 * uncompressed, which alone bloated the output several-fold). Only rewrites the
 * archive if something actually changed.
 */
async function applyDocxPostProcessing(
  docxPath: string,
  opts: { frontMatterBreak: boolean; updateFields: boolean; moveCover: boolean; restartAtBody: boolean }
): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(docxPath));
  let changed = false;

  const docFile = zip.file("word/document.xml");
  if (docFile) {
    const xml = await docFile.async("string");
    let patched = stripDataUriDescriptions(xml);
    // Relocate the cover before the front-matter split: the cover must already
    // sit ahead of the TOC so the split (before the first Heading1) puts both in
    // the furniture-free front-matter section.
    if (opts.moveCover) patched = moveCoverToFront(patched);
    if (opts.frontMatterBreak) patched = insertFrontMatterSection(patched, opts.restartAtBody);
    if (patched !== xml) {
      zip.file("word/document.xml", patched);
      changed = true;
    }
  }

  if (opts.updateFields) {
    const settingsFile = zip.file("word/settings.xml");
    if (settingsFile) {
      const xml = await settingsFile.async("string");
      const patched = enableUpdateFields(xml);
      if (patched !== xml) {
        zip.file("word/settings.xml", patched);
        changed = true;
      }
    }
  }

  if (changed) {
    await writeFile(
      docxPath,
      await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      })
    );
  }
}
