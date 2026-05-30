import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { basename, extname, posix } from "node:path";
import { escapeHtml, wrapHtmlDocument } from "../render/html-document.js";
import { collectPages } from "../resolve/tree.js";
import type { PageNode, Tree, TreeNode } from "../resolve/tree.js";

/**
 * Shift all heading levels in an HTML fragment down by `by` positions,
 * capping at h6. Processes from h6 down to h1 to avoid re-processing
 * a heading that was just renamed.
 *
 * `by` must be >= 0. Negative values are not supported.
 */
export function demoteHeadings(html: string, by: number): string {
  if (by === 0) return html;
  const $ = cheerio.load(html, null, false);
  // Process from highest number to lowest so a renamed tag is not revisited.
  for (let level = 6; level >= 1; level--) {
    $(`h${level}`).each((_, el) => {
      const newLevel = Math.min(level + by, 6);
      el.tagName = `h${newLevel}`;
    });
  }
  return $.html();
}

/**
 * Convert a file path to a stable, URL-safe anchor id.
 * Lowercases and replaces every run of non-[a-z0-9] characters with a
 * single hyphen, then trims leading/trailing hyphens.
 */
export function pageAnchorId(file: string): string {
  return file
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Assign a unique anchor id to every page (collisions get a -2, -3, ... suffix). */
export function assignAnchors(tree: Tree): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const page of collectPages(tree)) {
    let id = pageAnchorId(page.file);
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    used.add(id);
    map.set(page.file, id);
  }
  return map;
}

/**
 * Normalize a manifest-relative file path to a link-resolution key:
 * POSIX-normalize the path, then strip a trailing `.md` or `.mdx` extension
 * (case-insensitive). Used by `buildLinkTargets` and `rewriteCrossLinks`.
 *
 * Examples:
 *   `./guides/intro.md`        → `guides/intro`
 *   `guides/../guides/intro.mdx` → `guides/intro`
 */
function linkKey(path: string): string {
  const normalized = posix.normalize(path);
  return normalized.replace(/\.(md|mdx)$/i, "");
}

/**
 * Build a lookup from normalized link key → anchor id for every included page.
 * When two pages normalize to the same key, the first one wins.
 *
 * @param tree    The resolved page tree.
 * @param anchors The anchor map produced by `assignAnchors`.
 */
export function buildLinkTargets(
  tree: Tree,
  anchors: Map<string, string>
): Map<string, string> {
  const targets = new Map<string, string>();
  for (const page of collectPages(tree)) {
    const key = linkKey(page.file);
    if (!targets.has(key)) {
      const anchor = anchors.get(page.file);
      if (anchor !== undefined) targets.set(key, anchor);
    }
  }
  return targets;
}

/**
 * Resolve a site-absolute link (e.g. `/en/develop-plugin/.../tool-plugin`) to a
 * bundled page's anchor, or `undefined` when none matches.
 *
 * The site root is unknown, so a site-absolute link matches a page when the
 * page's file key ENDS WITH the site path (the site path is the page's tail
 * after whatever site root the manifest paths carry). The leading `/` enforces a
 * segment boundary, so `/en/foo/bar` matches `.../en/foo/bar` but not
 * `.../x-en/foo/bar`. A bare equality also matches when manifest paths happen to
 * be site-rooted already.
 *
 * The match must be UNIQUE: if two bundled pages share the suffix, the link is
 * ambiguous and is left unchanged rather than guessed.
 */
function resolveSiteAbsolute(
  pathPart: string,
  targets: Map<string, string>
): string | undefined {
  const sitePath = linkKey(pathPart.replace(/^\/+/, ""));
  if (sitePath === "") return undefined;
  const suffix = `/${sitePath}`;
  let found: string | undefined;
  let matches = 0;
  for (const [key, anchor] of targets) {
    if (key === sitePath || key.endsWith(suffix)) {
      found = anchor;
      matches++;
    }
  }
  return matches === 1 ? found : undefined;
}

/**
 * Join a base URL with a site-absolute path, avoiding a double slash. The base
 * URL's trailing slash (if any) is stripped; `path` always starts with `/`, so
 * the result is `<base><path>` with exactly one slash at the seam.
 */
function joinBaseUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + path;
}

/**
 * Rewrite cross-links in an HTML fragment so that links pointing to other
 * included pages resolve to in-document anchors (`#<anchor>`).
 *
 * Links that are absolute URLs, protocol-relative, `mailto:`/other schemes, or
 * pure-fragment (`#...`) are left unchanged. Site-absolute links (`/...`) are
 * resolved to a bundled page by suffix match (see `resolveSiteAbsolute`); when
 * no bundled page matches they are left unchanged, UNLESS `baseUrl` is set, in
 * which case the site-absolute path (with its original query/fragment) is joined
 * onto `baseUrl` to form a live external URL to the published site. Relative
 * links that target a page not in the selection are left unchanged (they have no
 * site path to rebuild against `baseUrl`).
 *
 * Original `#fragment` parts are dropped when a link is rewritten to an in-document
 * anchor; intra-page heading navigation within included pages is not preserved in
 * v1. When a site-absolute link is rebuilt onto `baseUrl`, its query/fragment ARE
 * preserved (a heading anchor on the external page is still meaningful).
 *
 * @param html     The HTML fragment for one page.
 * @param fromFile The manifest-relative file path of the page being processed.
 * @param targets  The link-targets map produced by `buildLinkTargets`.
 * @param baseUrl  Optional published-site base (e.g. `https://docs.dify.ai`);
 *                 when set, out-of-bundle site-absolute links become external URLs.
 */
export function rewriteCrossLinks(
  html: string,
  fromFile: string,
  targets: Map<string, string>,
  baseUrl?: string
): string {
  const $ = cheerio.load(html, null, false);
  $("a[href]").each((_, el) => {
    const raw = $(el).attr("href") ?? "";

    // Pure-fragment or empty href: leave unchanged.
    if (raw === "" || raw.startsWith("#")) return;

    // Absolute scheme (http:, mailto:, …): leave unchanged.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return;

    // Protocol-relative: leave unchanged.
    if (raw.startsWith("//")) return;

    // Strip fragment and query to get the path part.
    const pathPart = raw.replace(/[?#].*$/, "");

    // After stripping, nothing left (e.g. href was "?query" or "#frag" already caught above).
    if (pathPart === "") return;

    // Site-absolute: resolve to a bundled page by suffix match. Rewrite when a
    // unique page matches; otherwise, when baseUrl is set, rebuild it as a live
    // external URL to the published site (preserving the original query/fragment
    // in `raw`); else leave it unchanged.
    if (pathPart.startsWith("/")) {
      const anchor = resolveSiteAbsolute(pathPart, targets);
      if (anchor !== undefined) {
        $(el).attr("href", `#${anchor}`);
      } else if (baseUrl !== undefined) {
        $(el).attr("href", joinBaseUrl(baseUrl, raw));
      }
      return;
    }

    // Resolve relative to the linking page's directory.
    const key = linkKey(posix.join(posix.dirname(fromFile), pathPart));

    if (targets.has(key)) {
      $(el).attr("href", `#${targets.get(key)}`);
    }
  });
  return $.html();
}

/**
 * Fixed id for the cover heading, used by pagedjs to build the PDF outline
 * entry for the cover. Page anchors are filename-derived slugs, so the
 * reserved "quire-cover" prefix won't collide with them.
 */
const COVER_ID = "quire-cover";

/**
 * Fixed id for the TOC title heading, used by pagedjs to build the PDF
 * outline entry for the table of contents. The "quire-toc" prefix follows
 * the same convention as COVER_ID and won't collide with page anchors.
 */
const TOC_ID = "quire-toc";

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
  return `<section class="cover"><div class="cover-spine"></div><div class="cover-main">${main.join("")}</div></section>`;
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
    // the height from proportionally. 44mm matches the PDF cover logo.
    const img = `<img src="${meta.logoDataUri}" alt="" width="44mm" />`;
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

/**
 * Derive the cover footer URL from a published-site base URL: strip the scheme
 * and any trailing slash (e.g. "https://docs.dify.ai/" -> "docs.dify.ai").
 * Returns undefined when no base URL is set, so the footer is omitted.
 */
function coverUrlFromBaseUrl(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined || baseUrl.trim() === "") return undefined;
  const stripped = baseUrl
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/\/+$/, "");
  return stripped === "" ? undefined : stripped;
}

/** Derive a human-readable title from a page node. */
function pageTitle(node: PageNode): string {
  return node.title ?? basename(node.file, extname(node.file));
}

/**
 * Flatten Markdown inline-link syntax `[text](url)` to just its link text.
 *
 * A page's `description` frontmatter is rendered as a plain-text lede (escaped,
 * not parsed as Markdown). When an author writes Markdown links in the
 * description, the raw `[text](url)` would otherwise appear verbatim in the
 * lede, exposing a file path the reader can neither click nor use. Keeping the
 * link text and dropping the URL yields a clean, path-free summary line in both
 * the PDF and the Word output. Exported for unit testing.
 */
export function flattenDescriptionMarkdown(description: string): string {
  return description.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

/**
 * Build a nested HTML `<nav class="toc">` by scanning an already-assembled body
 * for headings that carry an `id`, down to `maxDepth` levels (default 3).
 *
 * Because page content is demoted by tree depth, the document mixes absolute
 * heading levels (e.g. a section is h1, a page title is h2, page content runs
 * h2→h4). Keying off tag numbers would be unreliable. Instead, the distinct
 * heading levels that actually appear are RANKED — shallowest = tier 1, next =
 * tier 2, and so on — and only headings in the top `maxDepth` tiers are
 * included, nested by tier. This yields a sensible N-level TOC regardless of
 * how content was demoted.
 *
 * Every entry is a link (`<a href="#id">`) so the `target-counter` page-number
 * CSS applies to all of them. The cover and the TOC title are excluded simply
 * because only the body is scanned (it contains neither).
 *
 * @param bodyHtml The assembled body HTML (excludes the cover and TOC title).
 * @param options  `title` for the TOC heading; optional `maxDepth` (default 3).
 */
export function buildTocFromHeadings(
  bodyHtml: string,
  options: { title: string; maxDepth?: number }
): string {
  const maxDepth = options.maxDepth ?? 3;
  const $ = cheerio.load(bodyHtml, null, false);

  // Collect, in document order, every h1–h6 with a non-empty id.
  const headings: Array<{ level: number; id: string; text: string }> = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el: Element) => {
    const id = $(el).attr("id");
    if (id === undefined || id === "") return;
    const level = Number(el.tagName.slice(1));
    headings.push({ level, id, text: $(el).text() });
  });

  // Rank distinct levels: shallowest level -> tier 1, next -> tier 2, etc.
  const distinctLevels = [...new Set(headings.map((h) => h.level))].sort((a, b) => a - b);
  const tierOf = new Map<number, number>();
  distinctLevels.forEach((level, i) => tierOf.set(level, i + 1));

  // Keep only headings within the top `maxDepth` tiers, tagged with their tier.
  const entries = headings
    .map((h) => ({ ...h, tier: tierOf.get(h.level) ?? 0 }))
    .filter((h) => h.tier >= 1 && h.tier <= maxDepth);

  return `<nav class="toc"><h2 class="toc-title" id="${TOC_ID}">${escapeHtml(options.title)}</h2>${renderTocList(entries)}</nav>`;
}

/**
 * Render a flat, tier-ranked list of TOC entries into nested `<ul>`s. A deeper
 * tier opens a nested list under the most recent shallower entry; a shallower
 * tier closes back out. Entries at the top tier sit in the outer list.
 */
function renderTocList(entries: Array<{ tier: number; id: string; text: string }>): string {
  if (entries.length === 0) return "<ul></ul>";

  let out = "";
  // Stack of tiers for the currently-open <ul> levels. Using an explicit stack
  // (rather than assuming the list starts at tier 1) keeps the output balanced
  // for ANY input, including the pathological case where the first entry is
  // deeper than a later one — assembleDocument never produces that, but
  // buildTocFromHeadings is a public export.
  const stack: number[] = [];

  for (const entry of entries) {
    if (stack.length === 0) {
      out += "<ul>";
      stack.push(entry.tier);
    } else if (entry.tier > stack[stack.length - 1]) {
      // Descend: open a nested <ul> inside the previous <li>, which stays open.
      out += "<ul>";
      stack.push(entry.tier);
    } else {
      // Close the previous sibling <li>, then ascend, closing any deeper lists.
      out += "</li>";
      while (stack.length > 1 && stack[stack.length - 1] > entry.tier) {
        out += "</ul></li>";
        stack.pop();
      }
      // This entry is a sibling at the current open level.
      stack[stack.length - 1] = entry.tier;
    }

    out += `<li class="toc-entry toc-level-${entry.tier}"><a href="#${entry.id}">${escapeHtml(entry.text)}</a>`;
  }

  // Close the final entry, then unwind every still-open nested list + its <li>.
  out += "</li>";
  while (stack.length > 1) {
    out += "</ul></li>";
    stack.pop();
  }
  out += "</ul>";

  return out;
}

/**
 * Walk the tree depth-first and combine all pages into a single HTML body
 * fragment. Section titles become headings at their depth level; page content
 * has its headings demoted to prevent conflicts with the structural headings.
 */
export function assembleBody(
  tree: Tree,
  rendered: Map<string, string>,
  showDescription?: boolean,
  baseUrl?: string
): string {
  const anchors = assignAnchors(tree);
  const targets = buildLinkTargets(tree, anchors);
  // idState is threaded through the recursion so each section heading gets a
  // unique "quire-section-N" id. pagedjs uses these ids as PDF outline
  // destinations. The "quire-section-" prefix won't collide with page anchors
  // (filename slugs) as long as no file is literally named "section-N.md".
  const body = walkTree(tree, rendered, anchors, targets, 0, { section: 0 }, showDescription, baseUrl);
  return deduplicateIds(body);
}

/**
 * Make every `id` in the assembled body globally unique. rehype-slug only
 * dedupes ids within a single page render, so the same content heading slug
 * (e.g. "summary") can recur across pages. Combined into one document, those
 * collisions break both in-document links and the TOC's `target-counter`
 * page-number lookup (which resolves to the FIRST element with a given id).
 *
 * First occurrence keeps its id; later collisions get a `-2`, `-3`, … suffix.
 * Structural ids (page anchors, `quire-section-N`) are unique by construction
 * and always appear before any colliding content heading, so they are never
 * rewritten — keeping cross-links and the PDF outline intact.
 */
function deduplicateIds(bodyHtml: string): string {
  const $ = cheerio.load(bodyHtml, null, false);
  const seen = new Set<string>();
  $("[id]").each((_, el) => {
    const id = $(el).attr("id");
    if (id === undefined || id === "") return;
    if (!seen.has(id)) {
      seen.add(id);
      return;
    }
    let n = 2;
    while (seen.has(`${id}-${n}`)) n++;
    const unique = `${id}-${n}`;
    seen.add(unique);
    $(el).attr("id", unique);
  });
  return $.html();
}

/**
 * Build the full HTML document: optional cover, optional TOC, then the
 * assembled body, wrapped in a complete HTML page.
 *
 * `toc` defaults to `false`; existing callers that pass `{title, cover}` are
 * unaffected and produce no TOC. When `toc` is true, the nav is inserted
 * between the cover and the body.
 *
 * `showDescription` controls whether a page node's `description` field is
 * rendered as a `<p class="page-description">` lede beneath the page title.
 * When omitted, no lede is emitted (preserves backward compatibility).
 */
export function assembleDocument(
  tree: Tree,
  rendered: Map<string, string>,
  options: {
    title: string;
    cover: boolean;
    toc?: boolean;
    css?: string;
    tocTitle?: string;
    showDescription?: boolean;
    baseUrl?: string;
    /** Optional cover metadata (product name, version, date, embedded logo). */
    productName?: string;
    version?: string;
    date?: string;
    logoDataUri?: string;
    /** Render the cover for Word (title as a styled paragraph, not an `<h1>`). */
    coverForWord?: boolean;
  }
): string {
  const cover = options.cover
    ? renderCover({
        title: options.title,
        productName: options.productName,
        version: options.version,
        date: options.date,
        logoDataUri: options.logoDataUri,
        url: coverUrlFromBaseUrl(options.baseUrl),
        forWord: options.coverForWord,
      })
    : "";
  // Assemble the body first so the TOC can be built from its actual headings
  // (which carry ids from rehype-slug + structural-heading ids from walkTree).
  const body = assembleBody(tree, rendered, options.showDescription, options.baseUrl);
  const toc = options.toc
    ? buildTocFromHeadings(body, { title: options.tocTitle ?? "Contents" })
    : "";
  // Wrap the body so the PDF can restart page numbering at 1 here: the cover and
  // TOC are unnumbered front matter, and `.doc-body { counter-reset: page }`
  // (see compile-css) resets the page counter where this wrapper begins. The
  // wrapper is inert in Word (Pandoc emits its contents); the Word body section
  // restarts numbering via pgNumType instead. The TOC is built from the unwrapped
  // body above, so the wrapper does not affect heading scanning.
  return wrapHtmlDocument(
    cover + toc + `<div class="doc-body">${body}</div>`,
    options.title,
    options.css
  );
}

function walkTree(
  nodes: TreeNode[],
  rendered: Map<string, string>,
  anchors: Map<string, string>,
  targets: Map<string, string>,
  depth: number,
  idState: { section: number },
  showDescription?: boolean,
  baseUrl?: string
): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "section") {
      const L = Math.min(depth + 1, 6);
      // Assign a unique id so pagedjs can build a working PDF outline entry
      // for this section heading. Content sub-headings produced by
      // demoteHeadings (h4+ in sectioned docs) are intentionally left without
      // ids — per-heading ids are an M5 / rehype-slug concern.
      const sectionId = `quire-section-${++idState.section}`;
      // class="chapter-heading" feeds the `chaptertitle` named string that the
      // top-right running header reads (see buildPageFurniture in compile-css).
      // Only structural headings (section + page-title) are marked, never
      // content sub-headings, so the running header tracks chapters, not prose.
      // A depth-0 node is a top-level chapter, so it ALSO gets `chapter-start`
      // (CSS `break-before: page` in the PDF). Nested sections/pages do not.
      const sectionClass = depth === 0 ? "chapter-heading chapter-start" : "chapter-heading";
      out += `<h${L} class="${sectionClass}" id="${sectionId}">${escapeHtml(node.title)}</h${L}>`;
      out += walkTree(node.children, rendered, anchors, targets, depth + 1, idState, showDescription, baseUrl);
    } else {
      // page node
      const L = Math.min(depth + 1, 6);
      const anchor = anchors.get(node.file);
      if (anchor === undefined) {
        throw new Error(`No anchor assigned for page "${node.file}".`);
      }
      const title = pageTitle(node);
      const content = rendered.get(node.file);
      if (content === undefined) {
        throw new Error(`No rendered content for page "${node.file}".`);
      }
      const linked = rewriteCrossLinks(content, node.file, targets, baseUrl);
      // The anchor id moves to the page heading (not the <section> wrapper) so
      // pagedjs registers it as the PDF outline destination for this entry.
      // The TOC and cross-links already target "#anchor" — fragment resolution
      // works the same regardless of which element carries the id.
      // A <div> (not a <p>) carries the Pandoc custom-style: a Word Para cannot
      // hold attributes, but a div applies "Page Description" to its paragraph.
      // The class still drives the PDF (the attribute is inert there).
      const lede =
        showDescription && node.description && node.description.trim() !== ""
          ? `<div class="page-description" custom-style="Page Description">${escapeHtml(flattenDescriptionMarkdown(node.description))}</div>`
          : "";
      // The page-title heading is a structural heading, so it carries
      // class="chapter-heading" to update the top-right running header. Content
      // sub-headings inside `linked` are intentionally left unmarked. A depth-0
      // page (flat page-list manifest, no enclosing section) is a top-level
      // chapter, so it ALSO gets `chapter-start`; a page nested under a section
      // (depth > 0) does not.
      const pageClass = depth === 0 ? "chapter-heading chapter-start" : "chapter-heading";
      out += `<section><h${L} class="${pageClass}" id="${anchor}">${escapeHtml(title)}</h${L}>${lede}${demoteHeadings(linked, depth + 1)}</section>`;
    }
  }
  return out;
}
