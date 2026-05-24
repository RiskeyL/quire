import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { run, assertBinary } from "../util/exec.js";

/** Render a full HTML document to a Word file via Pandoc. */
export async function htmlToDocx(
  html: string,
  outPath: string,
  options?: { toc?: boolean; referenceDoc?: string; frontMatterBreak?: boolean }
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
    // Split the front matter (Title block + TOC) into its own header/footerless
    // Word section, so the running header/footer only appears from the body.
    if (options?.frontMatterBreak) {
      await applyFrontMatterSection(outPath);
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
 * header/footer, so the furniture only appears from the body.
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

  // Front-matter section = body section minus the header/footer references.
  // (A first section with no header/footer reference shows neither in Word.)
  const frontMatterSectPr = bodySectPr
    .replace(/<w:headerReference\b[^>]*\/>/g, "")
    .replace(/<w:footerReference\b[^>]*\/>/g, "");

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

  const breakPara = `<w:p><w:pPr>${frontMatterSectPr}</w:pPr></w:p>`;
  return documentXml.slice(0, pOpen) + breakPara + documentXml.slice(pOpen);
}

/** Apply {@link insertFrontMatterSection} to the generated docx in place. */
async function applyFrontMatterSection(docxPath: string): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(docxPath));
  const docFile = zip.file("word/document.xml");
  if (!docFile) return;
  const xml = await docFile.async("string");
  const patched = insertFrontMatterSection(xml);
  if (patched === xml) return; // no-op (no body sectPr or no Heading1)
  zip.file("word/document.xml", patched);
  await writeFile(docxPath, await zip.generateAsync({ type: "nodebuffer" }));
}
