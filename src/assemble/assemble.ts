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

// V1 limitation: only relative links (./x, ../x, x.md) are rewritten.
// Site-absolute links (/use-dify/x) are left unchanged because mapping a
// site root to manifest paths requires the docs.json resolver (Milestone 6).

/**
 * Rewrite cross-links in an HTML fragment so that links pointing to other
 * included pages resolve to in-document anchors (`#<anchor>`).
 *
 * Links that are absolute URLs, protocol-relative, `mailto:`/other schemes,
 * pure-fragment (`#...`), site-absolute (`/...`), or that target a page not
 * in the selection are left unchanged.
 *
 * Original `#fragment` parts are dropped when a link is rewritten; intra-page
 * heading navigation within included pages is not preserved in v1.
 *
 * @param html     The HTML fragment for one page.
 * @param fromFile The manifest-relative file path of the page being processed.
 * @param targets  The link-targets map produced by `buildLinkTargets`.
 */
export function rewriteCrossLinks(
  html: string,
  fromFile: string,
  targets: Map<string, string>
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

    // Site-absolute: leave unchanged (v1 limitation, see comment above).
    if (pathPart.startsWith("/")) return;

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

/** Render the document cover as an HTML fragment. */
export function renderCover(title: string): string {
  return `<section class="cover"><h1 class="doc-title" id="${COVER_ID}">${escapeHtml(title)}</h1></section>`;
}

/** Derive a human-readable title from a page node. */
function pageTitle(node: PageNode): string {
  return node.title ?? basename(node.file, extname(node.file));
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
  showDescription?: boolean
): string {
  const anchors = assignAnchors(tree);
  const targets = buildLinkTargets(tree, anchors);
  // idState is threaded through the recursion so each section heading gets a
  // unique "quire-section-N" id. pagedjs uses these ids as PDF outline
  // destinations. The "quire-section-" prefix won't collide with page anchors
  // (filename slugs) as long as no file is literally named "section-N.md".
  const body = walkTree(tree, rendered, anchors, targets, 0, { section: 0 }, showDescription);
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
  }
): string {
  const cover = options.cover ? renderCover(options.title) : "";
  // Assemble the body first so the TOC can be built from its actual headings
  // (which carry ids from rehype-slug + structural-heading ids from walkTree).
  const body = assembleBody(tree, rendered, options.showDescription);
  const toc = options.toc
    ? buildTocFromHeadings(body, { title: options.tocTitle ?? "Contents" })
    : "";
  return wrapHtmlDocument(cover + toc + body, options.title, options.css);
}

function walkTree(
  nodes: TreeNode[],
  rendered: Map<string, string>,
  anchors: Map<string, string>,
  targets: Map<string, string>,
  depth: number,
  idState: { section: number },
  showDescription?: boolean
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
      out += walkTree(node.children, rendered, anchors, targets, depth + 1, idState, showDescription);
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
      const linked = rewriteCrossLinks(content, node.file, targets);
      // The anchor id moves to the page heading (not the <section> wrapper) so
      // pagedjs registers it as the PDF outline destination for this entry.
      // The TOC and cross-links already target "#anchor" — fragment resolution
      // works the same regardless of which element carries the id.
      const lede =
        showDescription && node.description && node.description.trim() !== ""
          ? `<p class="page-description">${escapeHtml(node.description)}</p>`
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
