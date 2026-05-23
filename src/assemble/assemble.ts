import * as cheerio from "cheerio";
import { basename, extname } from "node:path";
import { escapeHtml, wrapHtmlDocument } from "../render/html-document.js";
import { collectPages } from "../resolve/tree.js";
import type { Tree, TreeNode } from "../resolve/tree.js";

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

/** Render the document cover as an HTML fragment. */
export function renderCover(title: string): string {
  return `<section class="cover"><h1 class="doc-title">${escapeHtml(title)}</h1></section>`;
}

/**
 * Walk the tree depth-first and combine all pages into a single HTML body
 * fragment. Section titles become headings at their depth level; page content
 * has its headings demoted to prevent conflicts with the structural headings.
 */
export function assembleBody(tree: Tree, rendered: Map<string, string>): string {
  const anchors = assignAnchors(tree);
  return walkTree(tree, rendered, anchors, 0);
}

/** Build the full HTML document: optional cover, then the assembled body, wrapped. */
export function assembleDocument(
  tree: Tree,
  rendered: Map<string, string>,
  options: { title: string; cover: boolean }
): string {
  const cover = options.cover ? renderCover(options.title) : "";
  return wrapHtmlDocument(cover + assembleBody(tree, rendered), options.title);
}

function walkTree(
  nodes: TreeNode[],
  rendered: Map<string, string>,
  anchors: Map<string, string>,
  depth: number
): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "section") {
      const L = Math.min(depth + 1, 6);
      out += `<h${L}>${escapeHtml(node.title)}</h${L}>`;
      out += walkTree(node.children, rendered, anchors, depth + 1);
    } else {
      // page node
      const L = Math.min(depth + 1, 6);
      const anchor = anchors.get(node.file);
      if (anchor === undefined) {
        throw new Error(`No anchor assigned for page "${node.file}".`);
      }
      const title = node.title ?? basename(node.file, extname(node.file));
      const content = rendered.get(node.file);
      if (content === undefined) {
        throw new Error(`No rendered content for page "${node.file}".`);
      }
      out += `<section id="${anchor}"><h${L}>${escapeHtml(title)}</h${L}>${demoteHeadings(content, depth + 1)}</section>`;
    }
  }
  return out;
}
