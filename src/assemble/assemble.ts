import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { basename, extname, posix } from "node:path";
import { escapeHtml, wrapHtmlDocument } from "../render/html-document.js";
import { collectPages } from "../resolve/tree.js";
import type { PageNode, Tree, TreeNode } from "../resolve/tree.js";
import { renderCover } from "./cover.js";
import type { CoverMeta } from "./cover.js";
export { renderCover };
export type { CoverMeta };

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
 * Assign a stable id to every section, in the same depth-first order walkTree
 * visits them, so the section heading, the chapter-contents landing list, and the
 * structural TOC all reference the same `quire-section-N` id. Keyed by node
 * identity (sections have no file path). The prefix won't collide with page
 * anchors (filename slugs).
 */
export function assignSectionIds(tree: Tree): Map<TreeNode, string> {
  const map = new Map<TreeNode, string>();
  let n = 0;
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.type === "section") {
        map.set(node, `quire-section-${++n}`);
        walk(node.children);
      }
    }
  };
  walk(tree);
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
 * Fixed id for the TOC title heading, used by pagedjs to build the PDF
 * outline entry for the table of contents. The "quire-toc" prefix follows
 * the same convention as the `COVER_ID` constant in `cover.ts` and won't
 * collide with page anchors.
 */
const TOC_ID = "quire-toc";

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

    out += `<li class="toc-entry toc-level-${entry.tier}"><a href="#${entry.id}"><span class="toc-text">${escapeHtml(entry.text)}</span><span class="toc-leader" aria-hidden="true"></span></a>`;
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
 * Build a structural `<nav class="toc">` from the page tree: one entry per
 * section and page, nested to the tree's full depth. Unlike `buildTocFromHeadings`,
 * it includes ONLY structural entries (group titles + page titles), never a
 * page's internal content headings — so a leaf page contributes a single line and
 * the TOC mirrors the document's navigation however deep it nests.
 *
 * Each entry links to the section's `quire-section-N` id or the page's anchor, so
 * the `target-counter` page-number CSS resolves for every line. Anchors and
 * section ids are recomputed here (both deterministic) to match what walkTree
 * emits in the body.
 */
export function buildTocFromTree(tree: Tree, options: { title: string }): string {
  const anchors = assignAnchors(tree);
  const sectionIds = assignSectionIds(tree);

  const renderNodes = (nodes: TreeNode[], tier: number): string => {
    let items = "";
    for (const node of nodes) {
      if (node.type === "section") {
        const id = sectionIds.get(node);
        if (id === undefined) continue;
        // The child <ul> nests inside this entry's <li>, which the caller closes.
        items += tocEntry(id, node.title, tier) + renderNodes(node.children, tier + 1) + "</li>";
      } else {
        const id = anchors.get(node.file);
        if (id === undefined) continue;
        items += tocEntry(id, pageTitle(node), tier) + "</li>";
      }
    }
    return items === "" ? "" : `<ul>${items}</ul>`;
  };

  return `<nav class="toc"><h2 class="toc-title" id="${TOC_ID}">${escapeHtml(options.title)}</h2>${renderNodes(tree, 1)}</nav>`;
}

/** An open TOC `<li>` with the link, text, and dotted leader (caller closes `</li>`). */
function tocEntry(id: string, text: string, tier: number): string {
  return `<li class="toc-entry toc-level-${tier}"><a href="#${id}"><span class="toc-text">${escapeHtml(text)}</span><span class="toc-leader" aria-hidden="true"></span></a>`;
}

/**
 * The chapter landing list: an index of a top-level chapter's contents, two
 * levels deep — its direct children (sub-groups and pages), and one level below
 * that (a sub-group's own children). Deeper nesting is not expanded here. Each
 * entry links to its section/page heading. The children break to their own pages
 * (depth-1 `.page-start`), so this list shares the landing page only with the
 * chapter title.
 */
function renderChapterContents(
  children: TreeNode[],
  anchors: Map<string, string>,
  sectionIds: Map<TreeNode, string>,
  levels = 2
): string {
  const render = (nodes: TreeNode[], level: number): string => {
    if (level > levels) return "";
    let items = "";
    for (const node of nodes) {
      if (node.type === "section") {
        const id = sectionIds.get(node);
        if (id === undefined) continue;
        // The nested sub-list goes inside this entry's <li>, closed below.
        items += chapterContentsEntry(id, node.title, level) + render(node.children, level + 1) + "</li>";
      } else {
        const id = anchors.get(node.file);
        if (id === undefined) continue;
        items += chapterContentsEntry(id, pageTitle(node), level) + "</li>";
      }
    }
    return items === "" ? "" : `<ul>${items}</ul>`;
  };
  const list = render(children, 1);
  return list === "" ? "" : `<nav class="chapter-contents">${list}</nav>`;
}

/** An open chapter-contents `<li>` with the link and dotted leader (caller closes `</li>`). */
function chapterContentsEntry(id: string, text: string, level: number): string {
  return `<li class="cc-level-${level}"><a href="#${id}"><span class="toc-text">${escapeHtml(text)}</span><span class="toc-leader" aria-hidden="true"></span></a>`;
}

/**
 * Structural-heading class by tree depth. A depth-0 chapter carries
 * `chapter-start` (page break + the running-header chapter title via string-set).
 * Its direct children (depth 1) carry `page-start` (page break only, so the
 * header keeps showing the chapter). Deeper nodes carry neither and flow
 * continuously.
 */
function structuralClass(depth: number): string {
  if (depth === 0) return "chapter-heading chapter-start";
  if (depth === 1) return "chapter-heading page-start";
  return "chapter-heading";
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
  const sectionIds = assignSectionIds(tree);
  const targets = buildLinkTargets(tree, anchors);
  const body = walkTree(tree, rendered, anchors, targets, 0, sectionIds, showDescription, baseUrl);
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
    tocDepth?: number;
    showDescription?: boolean;
    baseUrl?: string;
    /** Optional cover metadata (product name, version, date, embedded logo). */
    productName?: string;
    version?: string;
    date?: string;
    logoDataUri?: string;
    /** Render the cover for Word (title as a styled paragraph, not an `<h1>`). */
    coverForWord?: boolean;
    /** PDF cover layout: `"spine"` (default) or `"plain"`. Passed through to `renderCover`. */
    coverLayout?: "spine" | "plain";
    /** Logo width for the Word cover (defaults to `"44mm"`). Passed through to `renderCover`. */
    coverLogoWidth?: string;
    /**
     * Footer note rendered as a Paged.js running element at the top of the body, so
     * a footer slot set to `"note"` shows it on every page with a clickable URL.
     * PDF only: omit it for the Word path, where a stray div would show inline.
     */
    footerNote?: { text: string; url?: string };
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
        layout: options.coverLayout,
        logoWidth: options.coverLogoWidth,
      })
    : "";
  const body = assembleBody(tree, rendered, options.showDescription, options.baseUrl);
  // The TOC is a structural page index built from the tree (sections + page
  // titles), not by scanning the body's headings — so a page's internal content
  // headings never appear and the index mirrors the navigation at full depth.
  // (`tocDepth` no longer affects the PDF; Word's TOC depth is set on the Pandoc
  // side in convert.ts.)
  const toc = options.toc
    ? buildTocFromTree(tree, { title: options.tocTitle ?? "Contents" })
    : "";
  // Wrap the body so the PDF can restart page numbering at 1 here: the cover and
  // TOC are unnumbered front matter, and `.doc-body { counter-reset: page }`
  // (see compile-css) resets the page counter where this wrapper begins. The
  // wrapper is inert in Word (Pandoc emits its contents); the Word body section
  // restarts numbering via pgNumType instead. The TOC is built from the unwrapped
  // body above, so the wrapper does not affect heading scanning.
  // The footer-note running element sits at the top of .doc-body so Paged.js binds it to
  // the body pages (the cover/TOC named pages suppress all margin boxes). Because an
  // element before the first chapter would otherwise make that chapter's `break-before:
  // page` fire and insert a blank first body page, compile-css cancels the break on the
  // first chapter (see `.doc-body > .footer-note + .chapter-start`). Declaring it before
  // the cover instead is NOT an option: the running element would then generate its own
  // blank page ahead of the cover.
  const footerNote = renderFooterNote(options.footerNote);
  return wrapHtmlDocument(
    cover + toc + `<div class="doc-body">${footerNote}${body}</div>`,
    options.title,
    options.css
  );
}

/**
 * Render the footer-note running element, or `""` when there is no note text.
 * When a `url` is given the whole note is wrapped in an `<a>` (the PDF turns it into
 * a clickable annotation, even inside a running element); otherwise it is plain text.
 */
function renderFooterNote(note: { text: string; url?: string } | undefined): string {
  if (note === undefined || note.text.trim() === "") return "";
  const text = escapeHtml(note.text);
  const inner =
    note.url !== undefined && note.url.trim() !== ""
      ? `<a href="${escapeHtml(note.url)}">${text}</a>`
      : text;
  return `<div class="footer-note">${inner}</div>`;
}

function walkTree(
  nodes: TreeNode[],
  rendered: Map<string, string>,
  anchors: Map<string, string>,
  targets: Map<string, string>,
  depth: number,
  sectionIds: Map<TreeNode, string>,
  showDescription?: boolean,
  baseUrl?: string
): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "section") {
      const L = Math.min(depth + 1, 6);
      // The pre-assigned id (assignSectionIds) is a PDF-outline destination and
      // the link target for the TOC and the chapter-contents list. structuralClass
      // marks chapters/their direct children for page breaks (and the depth-0
      // chapter for the running-header title); content sub-headings stay unmarked.
      const sectionId = sectionIds.get(node);
      if (sectionId === undefined) {
        throw new Error(`No id assigned for section "${node.title}".`);
      }
      // A top-level chapter (depth 0) gets a landing page: the title carries
      // chapter-landing-title (the blue "Chapter NN" kicker + accent rule),
      // followed by a linked index of its contents. Those children break to their
      // own pages (depth-1 page-start), so the landing page holds only the title
      // and this list.
      const headingClass =
        depth === 0 ? `${structuralClass(depth)} chapter-landing-title` : structuralClass(depth);
      out += `<h${L} class="${headingClass}" id="${sectionId}">${escapeHtml(node.title)}</h${L}>`;
      if (depth === 0) out += renderChapterContents(node.children, anchors, sectionIds);
      out += walkTree(node.children, rendered, anchors, targets, depth + 1, sectionIds, showDescription, baseUrl);
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
      // The anchor id sits on the page heading (not the <section> wrapper) so
      // pagedjs registers it as the PDF outline destination. A <div> (not a <p>)
      // carries the Pandoc custom-style for the description lede: a Word Para
      // cannot hold attributes, but a div applies "Page Description" to it; the
      // class still drives the PDF (the attribute is inert there).
      const lede =
        showDescription && node.description && node.description.trim() !== ""
          ? `<div class="page-description" custom-style="Page Description">${escapeHtml(flattenDescriptionMarkdown(node.description))}</div>`
          : "";
      out += `<section><h${L} class="${structuralClass(depth)}" id="${anchor}">${escapeHtml(title)}</h${L}>${lede}${demoteHeadings(linked, depth + 1)}</section>`;
    }
  }
  return out;
}
