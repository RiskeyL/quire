import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { renderMarkdownToHtml } from "../render/markdown.js";
import { wrapHtmlDocument } from "../render/html-document.js";
import { htmlToPdf } from "../export/pdf.js";
import { htmlToDocx } from "../export/docx.js";

export interface ConvertOptions {
  format: "pdf" | "docx" | "both";
  out?: string;
}

export async function runConvert(paths: string[], options: ConvertOptions): Promise<void> {
  if (paths.length !== 1) {
    throw new Error("Milestone 1 supports exactly one input file. Multi-file support comes in Milestone 3.");
  }
  const src = paths[0];
  const markdown = await readFile(src, "utf8");
  const title = basename(src, extname(src));
  const html = wrapHtmlDocument(renderMarkdownToHtml(markdown), title);

  const base = options.out ?? join(dirname(src), title);

  // Formats are exported sequentially; on partial failure the
  // already-exported file is kept (no rollback in Milestone 1).
  if (options.format === "pdf" || options.format === "both") {
    await htmlToPdf(html, `${base}.pdf`);
  }
  if (options.format === "docx" || options.format === "both") {
    await htmlToDocx(html, `${base}.docx`);
  }
}
