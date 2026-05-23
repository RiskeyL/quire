import * as cheerio from "cheerio";
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

/** Render the document cover as an HTML fragment. */
export function renderCover(title: string): string {
  return `<section class="cover"><h1 class="doc-title">${escapeHtml(title)}</h1></section>`;
}

/** Derive a human-readable title from a page node. */
function pageTitle(node: PageNode): string {
  return node.title ?? basename(node.file, extname(node.file));
}

/**
 * Build a nested HTML `<nav class="toc">` from the document tree.
 *
 * - Section nodes render as non-linked group labels (`<li class="toc-section">`).
 * - Page nodes render as anchored links (`<li class="toc-page">`).
 *
 * V1 limitation: section entries are group labels without page numbers;
 * only page entries get target-counter page numbers via CSS.
 *
 * @param tree    The resolved page tree.
 * @param anchors The anchor map produced by `assignAnchors`.
 */
export function buildToc(tree: Tree, anchors: Map<string, string>): string {
  function walkNodes(nodes: TreeNode[]): string {
    let items = "";
    for (const node of nodes) {
      if (node.type === "section") {
        items += `<li class="toc-section"><span>${escapeHtml(node.title)}</span><ul>${walkNodes(node.children)}</ul></li>`;
      } else {
        const anchor = anchors.get(node.file);
        if (anchor === undefined) {
          throw new Error(`No anchor assigned for page "${node.file}".`);
        }
        const title = pageTitle(node);
        items += `<li class="toc-page"><a href="#${anchor}">${escapeHtml(title)}</a></li>`;
      }
    }
    return items;
  }
  return `<nav class="toc"><h2 class="toc-title">Contents</h2><ul>${walkNodes(tree)}</ul></nav>`;
}

/**
 * Walk the tree depth-first and combine all pages into a single HTML body
 * fragment. Section titles become headings at their depth level; page content
 * has its headings demoted to prevent conflicts with the structural headings.
 */
export function assembleBody(tree: Tree, rendered: Map<string, string>): string {
  const anchors = assignAnchors(tree);
  const targets = buildLinkTargets(tree, anchors);
  return walkTree(tree, rendered, anchors, targets, 0);
}

/**
 * Build the full HTML document: optional cover, optional TOC, then the
 * assembled body, wrapped in a complete HTML page.
 *
 * `toc` defaults to `false`; existing callers that pass `{title, cover}` are
 * unaffected and produce no TOC. When `toc` is true, the nav is inserted
 * between the cover and the body.
 */
export function assembleDocument(
  tree: Tree,
  rendered: Map<string, string>,
  options: { title: string; cover: boolean; toc?: boolean; css?: string }
): string {
  const cover = options.cover ? renderCover(options.title) : "";
  let toc = "";
  if (options.toc) {
    // assignAnchors is deterministic over collectPages order, so calling it
    // here and in assembleBody (via walkTree) produces identical maps.
    const anchors = assignAnchors(tree);
    toc = buildToc(tree, anchors);
  }
  return wrapHtmlDocument(
    cover + toc + assembleBody(tree, rendered),
    options.title,
    options.css
  );
}

function walkTree(
  nodes: TreeNode[],
  rendered: Map<string, string>,
  anchors: Map<string, string>,
  targets: Map<string, string>,
  depth: number
): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "section") {
      const L = Math.min(depth + 1, 6);
      out += `<h${L}>${escapeHtml(node.title)}</h${L}>`;
      out += walkTree(node.children, rendered, anchors, targets, depth + 1);
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
      out += `<section id="${anchor}"><h${L}>${escapeHtml(title)}</h${L}>${demoteHeadings(linked, depth + 1)}</section>`;
    }
  }
  return out;
}
