import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { renderMdx } from "../render/mdx/render-mdx.js";
import { renderOpenApiMarkdown, type OpenApiSpec } from "../render/openapi/render-openapi.js";
import { resolveTitle } from "../render/mdx/title.js";
import { stripPageChrome } from "../render/strip-chrome.js";
import { embedImages } from "../render/images.js";
import { renderMermaid, createPuppeteerRenderer, type DiagramRenderer } from "../render/mermaid.js";
import { setTableColumnWidths } from "../render/tables.js";
import { htmlToPdf } from "../export/pdf.js";
import { htmlToDocx } from "../export/docx.js";
import { loadManifest } from "../resolve/manifest.js";
import { collectPages, formatTree, type PageNode, type Tree } from "../resolve/tree.js";
import { assembleDocument } from "../assemble/assemble.js";
import { DEFAULT_TOKENS } from "../theme/tokens.js";
import { loadTheme } from "../theme/load-theme.js";
import { compileCss } from "../theme/compile-css.js";
import { compileDocxReference, DocxReferenceError } from "../theme/compile-docx-ref.js";
import { createChecklist, type ChecklistStage } from "../util/checklist.js";

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
  /**
   * Published-site base URL (e.g. `https://docs.dify.ai`). When set, site-absolute
   * links (`/en/...`) to pages NOT in the bundle are rebuilt as live external URLs
   * instead of being left as dead site-relative paths. In-bundle links still resolve
   * to in-document anchors.
   */
  baseUrl?: string;
  /** Release/version label printed on the cover (omitted when absent). */
  docVersion?: string;
  /** Publish date printed on the cover (omitted when absent; never auto-filled). */
  date?: string;
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

  // Resolve brand tokens up front: the per-page render loop needs tables.layout
  // to decide whether to inject fixed-width <colgroup>s into tables.
  const tokens = options.theme ? await loadTheme(options.theme) : DEFAULT_TOKENS;

  // Embed the brand logo (if any) as a self-contained data URI for the cover.
  // A relative path is resolved against the theme file's directory (where it is
  // authored); an absolute path is used as-is. A missing/unreadable logo warns
  // and is omitted rather than failing the run. (This reads the file directly
  // rather than via embedImages, whose leading-"/" paths mean site-root-relative,
  // which would mangle an absolute filesystem path.)
  let logoDataUri: string | undefined;
  if (tokens.brand.logo) {
    const themeDir = options.theme ? dirname(resolve(options.theme)) : effectiveRoot;
    logoDataUri = await embedLogo(tokens.brand.logo, themeDir);
  }

  const wantPdf = options.format === "pdf" || options.format === "both";
  const wantDocx = options.format === "docx" || options.format === "both";

  // Show the whole pipeline as an upfront checklist so it is clear how many stages are
  // involved (rendering source pages is only the first). On a TTY each row redraws in
  // place from pending to spinner to checkmark; off a TTY it degrades to plain lines.
  const stages: ChecklistStage[] = [{ key: "render", label: "Render content" }];
  if (wantPdf) {
    stages.push(
      { key: "pdf-layout", label: "Lay out pages for print" },
      { key: "pdf-save", label: "Generate & save PDF" }
    );
  }
  if (wantDocx) stages.push({ key: "docx", label: "Build Word document" });
  const checklist = createChecklist(stages);

  try {
    // ---- Render every page to HTML ----
    checklist.start("render");
    const rendered = new Map<string, string>();
    // A single headless browser is shared across all pages for mermaid rendering.
    // It is created lazily on the first page that actually has a diagram (so
    // diagram-free runs never launch one) and torn down once in the finally below.
    let mermaidRenderer: { render: DiagramRenderer; close: () => Promise<void> } | null = null;
    let renderedCount = 0;
    try {
      for (const page of pages) {
        checklist.detail("render", `page ${renderedCount + 1}/${pages.length}`);
        const resolvedPath = manifestDir
          ? resolve(manifestDir, page.file)
          : resolve(page.file);
        // An OpenAPI page's `file` is a JSON spec, converted to Markdown here so it
        // flows through the same render/assemble pipeline as any other page. The
        // spec becomes a chapter whose tags are its sub-sections; the chapter title
        // comes from the manifest entry's `title` (via resolveTitle below).
        const markdown = page.openapi
          ? renderOpenApiMarkdown(parseOpenApiSpec(await readFile(resolvedPath, "utf8"), page.file))
          : await readFile(resolvedPath, "utf8");
        const { html: renderedHtml, frontmatter } = renderMdx(markdown, {
          onWarn: (msg) => checklist.log(msg),
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
        // (no external refs for embedImages to resolve). Only pages that actually
        // contain a mermaid block create/reuse the shared browser.
        let html = withImages;
        if (withImages.includes("language-mermaid")) {
          mermaidRenderer ??= await createPuppeteerRenderer();
          html = await renderMermaid(withImages, {
            warn: (msg) => checklist.log(msg),
            renderDiagram: mermaidRenderer.render,
          });
        }

        // With tables.layout "fixed" (default), give every table an equal-width
        // <colgroup>. This makes BOTH outputs use fixed, evenly-distributed columns:
        // Chromium honors the widths under `table-layout: fixed`, and Pandoc emits a
        // fixed-layout docx table with equal gridCols. Without it, Word's autofit
        // starves a column to a sliver when another holds a long unbreakable token.
        const withTables =
          tokens.tables.layout === "fixed" ? setTableColumnWidths(html) : html;
        rendered.set(page.file, withTables);
        renderedCount++;
      }
      checklist.detail("render", `${pages.length} pages`);
      checklist.done("render");
    } finally {
      // Tear down the shared mermaid browser once, after all pages are rendered
      // (or if a page throws), mirroring the per-call cleanup renderMermaid did.
      if (mermaidRenderer) await mermaidRenderer.close();
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

    // PDF gets an inline HTML TOC with target-counter page numbers; Word gets a
    // Pandoc-native TOC via --toc instead (no inline nav in the docx HTML).
    const useToc = !options.noToc;
    // CLI `--no-description` (options.description === false) overrides the token default.
    // When options.description is undefined, fall through to the token value.
    const showDescription = options.description ?? tokens.meta.showDescription;
    // The footer note becomes a clickable running element in the PDF when a footer
    // slot is set to "note" and the note has text. It is passed only to the PDF
    // assembly; the Word path renders the note (plain text) from the reference doc.
    const footerNote =
      [tokens.footer.left, tokens.footer.center, tokens.footer.right].includes("note") &&
      tokens.footer.note.text.trim() !== ""
        ? { text: tokens.footer.note.text, url: tokens.footer.note.url || undefined }
        : undefined;
    const pdfHtml = wantPdf
      ? assembleDocument(tree, rendered, {
          title: docTitle,
          cover: !options.noCover,
          toc: useToc,
          css: compileCss(tokens),
          tocTitle: tokens.toc.title,
          tocDepth: tokens.toc.depth,
          showDescription,
          baseUrl: options.baseUrl,
          productName: tokens.brand.productName,
          version: options.docVersion,
          date: options.date,
          logoDataUri,
          coverLayout: tokens.cover.layout,
          coverLogoWidth: tokens.cover.logoWidth,
          footerNote,
        })
      : "";
    // The Word cover is rendered with custom-style="Quire Cover" (coverForWord),
    // then relocated ahead of Pandoc's TOC in post-processing (moveCoverToFront),
    // which also drops Pandoc's metadata Title paragraph so the title is not
    // duplicated. With --no-cover the cover is omitted and Pandoc's plain Title
    // block stands in. The HTML still carries no inline TOC (toc:false); Pandoc
    // builds the field-based TOC via --toc.
    const wantCover = !options.noCover;
    const docxHtml = wantDocx
      ? assembleDocument(tree, rendered, {
          title: docTitle,
          cover: wantCover,
          toc: false,
          showDescription,
          baseUrl: options.baseUrl,
          productName: tokens.brand.productName,
          version: options.docVersion,
          date: options.date,
          logoDataUri,
          coverForWord: true,
          coverLayout: tokens.cover.layout,
          coverLogoWidth: tokens.cover.logoWidth,
        })
      : "";

    // Formats are exported sequentially; on partial failure the
    // already-exported file is kept (no rollback).
    if (wantPdf) {
      checklist.start("pdf-layout");
      await htmlToPdf(pdfHtml, `${base}.pdf`, {
        onLaidOut: (count) => {
          checklist.detail("pdf-layout", `${count} pages`);
          checklist.done("pdf-layout");
          checklist.start("pdf-save");
        },
      });
      // Safety net if pagedjs-cli never emitted the page-count line above.
      checklist.done("pdf-layout");
      checklist.done("pdf-save");
    }
    if (wantDocx) {
      checklist.start("docx");
      // Always apply a branded reference doc so Word output matches the theme
      // (even with default tokens, this ensures consistent heading fonts/colors).
      const refDir = await mkdtemp(join(tmpdir(), "quire-ref-"));
      try {
        const refPath = join(refDir, "reference.docx");
        try {
          // Thread docTitle so the Word running header shows the document title
          // (flush-left), mirroring the PDF's @top-left furniture.
          await compileDocxReference(tokens, refPath, { docTitle });
          // frontMatterBreak splits the Title block + TOC into a header/footerless
          // first section, so the running header/footer (from the reference doc)
          // only appears from the body. Mirrors the PDF's named-page suppression.
          await htmlToDocx(docxHtml, `${base}.docx`, {
            toc: useToc,
            tocDepth: tokens.toc.depth,
            referenceDoc: refPath,
            frontMatterBreak: true,
            // Flag fields for update so Word populates the (otherwise empty) TOC
            // field and its page numbers on open.
            updateFields: true,
            // Relocate the cover ahead of the TOC (and drop Pandoc's auto Title
            // para) when a cover was rendered.
            moveCover: wantCover,
            restartAtBody: tokens.pageNumbers.restartAtBody,
          });
        } catch (err) {
          if (err instanceof DocxReferenceError) {
            checklist.log(
              `Warning: could not apply brand to the Word output (${err.message}). Falling back to Pandoc defaults.`
            );
            await htmlToDocx(docxHtml, `${base}.docx`, { toc: useToc, tocDepth: tokens.toc.depth, updateFields: true, moveCover: wantCover, restartAtBody: tokens.pageNumbers.restartAtBody });
          } else {
            throw err;
          }
        }
      } finally {
        await rm(refDir, { recursive: true, force: true });
      }
      checklist.done("docx");
    }
  } catch (err) {
    checklist.fail();
    throw err;
  } finally {
    checklist.finish();
  }
}

/** Parse an OpenAPI spec file's contents as JSON, with a file-scoped error. */
function parseOpenApiSpec(raw: string, file: string): OpenApiSpec {
  try {
    return JSON.parse(raw) as OpenApiSpec;
  } catch (err) {
    throw new Error(`Could not parse OpenAPI spec "${file}" as JSON: ${(err as Error).message}`);
  }
}

/** MIME type for a logo file, inferred from its extension (defaults to PNG). */
function logoMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".svg":
      return "image/svg+xml";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

/**
 * Read a brand logo and return it as a `data:` URI, or `undefined` (with a
 * warning) when it cannot be read. A relative path resolves against `baseDir`
 * (the theme file's directory); an absolute path is used as-is.
 */
async function embedLogo(logoPath: string, baseDir: string): Promise<string | undefined> {
  const resolved = isAbsolute(logoPath) ? logoPath : resolve(baseDir, logoPath);
  try {
    const buf = await readFile(resolved);
    return `data:${logoMime(extname(resolved))};base64,${buf.toString("base64")}`;
  } catch {
    process.stderr.write(
      `Warning: could not read brand logo "${logoPath}"; the cover will omit it.\n`
    );
    return undefined;
  }
}
