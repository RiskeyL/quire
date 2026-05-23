import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { renderMdx } from "../render/mdx/render-mdx.js";
import { resolveTitle } from "../render/mdx/title.js";
import { stripPageChrome } from "../render/strip-chrome.js";
import { embedImages } from "../render/images.js";
import { renderMermaid } from "../render/mermaid.js";
import { htmlToPdf } from "../export/pdf.js";
import { htmlToDocx } from "../export/docx.js";
import { loadManifest } from "../resolve/manifest.js";
import { collectPages, formatTree, type PageNode, type Tree } from "../resolve/tree.js";
import { assembleDocument } from "../assemble/assemble.js";
import { loadTheme, DEFAULT_TOKENS } from "../theme/tokens.js";
import { compileCss } from "../theme/compile-css.js";
import { compileDocxReference, DocxReferenceError } from "../theme/compile-docx-ref.js";

export interface ConvertOptions {
  format: "pdf" | "docx" | "both";
  out?: string;
  manifest?: string;
  dryRun?: boolean;
  title?: string;
  noCover?: boolean;
  noToc?: boolean;
  root?: string;
  offline?: boolean;
  theme?: string;
  /** CLI override for the `meta.showDescription` token. `false` = `--no-description`; `undefined` = follow token. */
  description?: boolean;
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
  if (pages.length === 0) {
    throw new Error("Selection resolved to no pages.");
  }

  // Build a map from tree node file key -> rendered HTML.
  // For manifest-based trees the file key is the relative path stored in the
  // manifest node; the actual file is resolved relative to the manifest dir.
  // For positional-path trees the key and the resolved path are the same.
  const manifestDir = options.manifest ? dirname(resolve(options.manifest)) : undefined;

  // Compute the effective root for resolving root-relative image paths.
  // Priority: explicit --root option > manifest directory > cwd.
  const effectiveRoot = resolve(options.root ?? manifestDir ?? process.cwd());

  const rendered = new Map<string, string>();
  for (const page of pages) {
    const resolvedPath = manifestDir
      ? resolve(manifestDir, page.file)
      : resolve(page.file);
    const markdown = await readFile(resolvedPath, "utf8");
    const { html: renderedHtml, frontmatter } = renderMdx(markdown, {
      onWarn: (msg) => process.stderr.write(`${msg}\n`),
    });

    // Strip docs page chrome (the "Edit this page | Report an issue" footer that
    // a docs site appends to every page) before any further processing, so it
    // never reaches the PDF or Word output.
    const rawHtml = stripPageChrome(renderedHtml);

    // Resolve the effective title and strip the first body <h1> when it is the
    // title source. Mutating page.title on the tree node makes assemble.ts's
    // pageTitle/buildToc use the resolved title with no signature change
    // (collectPages returns the live tree nodes, so this is safe).
    const { title: resolvedTitle, html: titledHtml } = resolveTitle({
      manifestTitle: page.title,
      frontmatter,
      html: rawHtml,
      file: page.file,
    });
    page.title = resolvedTitle;

    // Capture the frontmatter description on the tree node so assemble.ts can
    // render it as a lede beneath the page title (gated by showDescription).
    if (typeof frontmatter.description === "string" && frontmatter.description.trim() !== "") {
      page.description = frontmatter.description.trim();
    }

    const withImages = await embedImages(titledHtml, {
      baseDir: dirname(resolvedPath),
      root: effectiveRoot,
      offline: !!options.offline,
    });

    // Rasterize any ```mermaid fenced blocks to embedded PNG <img>s. This runs
    // after embedImages because mermaid produces self-contained data-URI images
    // (no external refs for embedImages to resolve). The fast path in
    // renderMermaid means pages with no diagrams skip launching a browser.
    const html = await renderMermaid(withImages, {
      warn: (msg) => process.stderr.write(`${msg}\n`),
    });
    rendered.set(page.file, html);
  }

  // Determine document title.
  let docTitle: string;
  if (options.title) {
    docTitle = options.title;
  } else if (options.manifest) {
    docTitle = basename(options.manifest, extname(options.manifest));
  } else if (pages.length === 1) {
    const p = pages[0];
    docTitle = p.title ?? basename(p.file, extname(p.file));
  } else {
    docTitle = "Document";
  }

  // Determine output base path.
  let base: string;
  if (options.out) {
    base = options.out;
  } else if (options.manifest) {
    const absManifest = resolve(options.manifest);
    base = join(dirname(absManifest), basename(absManifest, extname(absManifest)));
  } else if (pages.length === 1) {
    // Single positional path: place output beside the source file.
    const resolvedFirst = resolve(pages[0].file);
    base = join(dirname(resolvedFirst), basename(resolvedFirst, extname(resolvedFirst)));
  } else {
    // Multiple positional paths: use the directory of the first file.
    const resolvedFirst = resolve(pages[0].file);
    base = join(dirname(resolvedFirst), "document");
  }

  // Resolve brand tokens — use user-supplied theme file when provided, otherwise defaults.
  const tokens = options.theme ? await loadTheme(options.theme) : DEFAULT_TOKENS;

  // PDF gets an inline HTML TOC with target-counter page numbers; Word gets a
  // Pandoc-native TOC via --toc instead (no inline nav in the docx HTML).
  const useToc = !options.noToc;
  // CLI `--no-description` (options.description === false) overrides the token default.
  // When options.description is undefined, fall through to the token value.
  const showDescription = options.description ?? tokens.meta.showDescription;
  const wantPdf = options.format === "pdf" || options.format === "both";
  const wantDocx = options.format === "docx" || options.format === "both";
  const pdfHtml = wantPdf
    ? assembleDocument(tree, rendered, {
        title: docTitle,
        cover: !options.noCover,
        toc: useToc,
        css: compileCss(tokens),
        tocTitle: tokens.toc.title,
        showDescription,
      })
    : "";
  const docxHtml = wantDocx
    ? assembleDocument(tree, rendered, {
        title: docTitle,
        cover: !options.noCover,
        toc: false,
        showDescription,
      })
    : "";

  // Formats are exported sequentially; on partial failure the
  // already-exported file is kept (no rollback).
  if (wantPdf) {
    await htmlToPdf(pdfHtml, `${base}.pdf`);
  }
  if (wantDocx) {
    // Always apply a branded reference doc so Word output matches the theme
    // (even with default tokens, this ensures consistent heading fonts/colors).
    // tocTitle is intentionally not passed here: the docx path uses toc:false
    // (Pandoc builds its own native TOC and supplies its own heading), so
    // tocTitle would have no effect and should not be added by reflex.
    const refDir = await mkdtemp(join(tmpdir(), "quire-ref-"));
    try {
      const refPath = join(refDir, "reference.docx");
      try {
        await compileDocxReference(tokens, refPath);
        await htmlToDocx(docxHtml, `${base}.docx`, { toc: useToc, referenceDoc: refPath });
      } catch (err) {
        if (err instanceof DocxReferenceError) {
          process.stderr.write(
            `Warning: could not apply brand to the Word output (${err.message}). Falling back to Pandoc defaults.\n`
          );
          await htmlToDocx(docxHtml, `${base}.docx`, { toc: useToc });
        } else {
          throw err;
        }
      }
    } finally {
      await rm(refDir, { recursive: true, force: true });
    }
  }
}
