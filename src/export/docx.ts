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
    referenceDoc?: string;
    frontMatterBreak?: boolean;
    updateFields?: boolean;
  }
): Promise<void> {
  await assertBinary("pandoc", "Install it with: brew install pandoc");
  const dir = await mkdtemp(join(tmpdir(), "quire-html-"));
  const htmlPath = join(dir, "input.html");
  try {
    await writeFile(htmlPath, html, "utf8");
    const args = [htmlPath, "-f", "html", "-o", outPath];
    if (options?.toc) {
      args.push("--toc", "--toc-depth=3");
    }
    if (options?.referenceDoc) {
      args.push(`--reference-doc=${options.referenceDoc}`);
    }
    await run("pandoc", args);
    // Post-process the generated docx in a single zip pass: split the front
    // matter into its own header/footerless section, and/or flag fields for
    // update so Word populates the TOC on open.
    if (options?.frontMatterBreak || options?.updateFields) {
      await applyDocxPostProcessing(outPath, {
        frontMatterBreak: options?.frontMatterBreak ?? false,
        updateFields: options?.updateFields ?? false,
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
export function insertFrontMatterSection(documentXml: string): string {
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

  // Body section: restart page numbering at 1, so the first body page shows "1"
  // (the cover/TOC are unnumbered front matter). pgNumType is appended before
  // </w:sectPr>; Word reads sectPr children order-independently.
  const bodySectPrNumbered = bodySectPr.includes("<w:pgNumType")
    ? bodySectPr
    : bodySectPr.replace("</w:sectPr>", '<w:pgNumType w:start="1" /></w:sectPr>');

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

/**
 * Apply the post-pandoc patches to the generated docx in a single read/write
 * zip pass (cheaper than reopening the archive per patch, which matters for
 * large image-heavy documents): the front-matter section split on
 * word/document.xml and/or the update-fields flag on word/settings.xml. Only
 * rewrites the archive if something actually changed.
 */
async function applyDocxPostProcessing(
  docxPath: string,
  opts: { frontMatterBreak: boolean; updateFields: boolean }
): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(docxPath));
  let changed = false;

  if (opts.frontMatterBreak) {
    const docFile = zip.file("word/document.xml");
    if (docFile) {
      const xml = await docFile.async("string");
      const patched = insertFrontMatterSection(xml);
      if (patched !== xml) {
        zip.file("word/document.xml", patched);
        changed = true;
      }
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
    await writeFile(docxPath, await zip.generateAsync({ type: "nodebuffer" }));
  }
}
