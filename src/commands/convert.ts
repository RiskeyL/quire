import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { renderMarkdownToHtml } from "../render/markdown.js";
import { wrapHtmlDocument } from "../render/html-document.js";
import { htmlToPdf } from "../export/pdf.js";
import { htmlToDocx } from "../export/docx.js";
import { loadManifest } from "../resolve/manifest.js";
import { collectPages, formatTree, type PageNode, type Tree } from "../resolve/tree.js";

export interface ConvertOptions {
  format: "pdf" | "docx" | "both";
  out?: string;
  manifest?: string;
  dryRun?: boolean;
}

export async function runConvert(paths: string[], options: ConvertOptions): Promise<void> {
  if (!options.manifest && paths.length === 0) {
    throw new Error("Nothing to convert. Provide one or more file paths, or a --manifest.");
  }

  if (options.manifest && paths.length > 0) {
    throw new Error("Provide either file paths or --manifest, not both.");
  }

  const tree: Tree = options.manifest
    ? await loadManifest(options.manifest)
    : paths.map((file): PageNode => ({ type: "page", file }));

  if (options.dryRun) {
    process.stdout.write(formatTree(tree) + "\n");
    return;
  }

  const pages = collectPages(tree);
  if (pages.length !== 1) {
    throw new Error(
      "Multi-page conversion arrives in Milestone 3. For now pass exactly one file, or use --dry-run to preview a manifest."
    );
  }

  const src = pages[0].file;
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
