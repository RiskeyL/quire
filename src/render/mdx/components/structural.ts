import type { ElementContent } from "hast";
import {
  element,
  text,
  getStringAttr,
  type ComponentHandler,
  type JsxComponentNode,
  type State,
} from "../hast-helpers.js";

/**
 * Structural list component family: Tree and CheckList/CheckListItem.
 *
 * Tree — verified props (https://mintlify.com/docs/components/tree):
 *   Mintlify uses dot-notation sub-components: Tree.Folder and Tree.File.
 *   remark-mdx parses these as component names "Tree.Folder" and "Tree.File"
 *   (string literals containing a dot), so the component map registers all
 *   three names: "Tree", "Tree.Folder", "Tree.File".
 *
 *   Tree.Folder props:
 *     `name` (string, required): folder label
 *     `defaultOpen` (boolean): initial open state — dropped in print
 *     `openable` (boolean): whether the folder can be toggled — dropped in print
 *   Tree.File props:
 *     `name` (string, required): file label
 *
 *   Output structure:
 *     <Tree>                    → <ul class="tree">
 *     <Tree.Folder name="src"> → <li class="tree-folder">
 *                                  <span class="tree-name">src/</span>
 *                                  <ul class="tree">…children…</ul>  ← only when children present
 *                                </li>
 *     <Tree.File name="x.ts"> → <li class="tree-file">
 *                                  <span class="tree-name">x.ts</span>
 *                                </li>
 *
 *   The trailing "/" on folder names is the sole visual cue that distinguishes
 *   folders from files — no icon or special marker is needed, keeping output
 *   ASCII-safe and purely structural.
 *
 * CheckList / CheckListItem — Dify-custom:
 *   Not a standard Mintlify component (not listed at mintlify.com/docs/components).
 *   Appears in the Dify docs repo as a simple pre-publication checklist.
 *
 *   CheckListItem props:
 *     `id` (string): an anchor identifier with no print meaning — dropped.
 *
 *   Output structure:
 *     <CheckList>                    → <ul class="checklist">
 *     <CheckListItem id="x">text</…> → <li class="checklist-item">…children…</li>
 *
 *   The ☐ glyph is provided exclusively via CSS `.checklist-item::before { content: "☐ " }`
 *   so it never appears as a text node in the HTML and is not read back as
 *   literal content.
 */

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

/**
 * Build a tree name span, appending "/" for folders.
 */
function treeNameSpan(name: string, isFolder: boolean): ElementContent {
  return element("span", { class: "tree-name" }, [
    text(isFolder ? `${name}/` : name),
  ]);
}

/**
 * `<Tree>` — top-level file/folder hierarchy container.
 *
 * Output: <ul class="tree">{children}</ul>
 *
 * Dropped props: none (Tree itself carries no props in the Mintlify spec).
 */
const treeHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
): ElementContent => {
  return element("ul", { class: "tree" }, state.all(node));
};

/**
 * `<Tree.Folder name="…">` — a collapsible folder node.
 *
 * With children: wraps them in a nested <ul class="tree">.
 * Without children: renders the name only (no nested ul).
 *
 * Output:
 *   <li class="tree-folder">
 *     <span class="tree-name">{name}/</span>
 *     [<ul class="tree">…children…</ul>]   ← present only when children exist
 *   </li>
 *
 * Dropped props: `defaultOpen`, `openable`, `icon` (web-only interactive props).
 */
const treeFolderHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
): ElementContent => {
  const name = getStringAttr(node, "name") ?? "";
  const nameSpan = treeNameSpan(name, true);

  const children = state.all(node);
  const liChildren: ElementContent[] = [nameSpan];
  if (children.length > 0) {
    liChildren.push(element("ul", { class: "tree" }, children));
  }
  return element("li", { class: "tree-folder" }, liChildren);
};

/**
 * `<Tree.File name="…">` — a leaf file node.
 *
 * Output: <li class="tree-file"><span class="tree-name">{name}</span></li>
 *
 * Dropped props: `icon` (web-only decorative prop).
 */
const treeFileHandler: ComponentHandler = (
  _state: State,
  node: JsxComponentNode
): ElementContent => {
  const name = getStringAttr(node, "name") ?? "";
  return element("li", { class: "tree-file" }, [treeNameSpan(name, false)]);
};

// ---------------------------------------------------------------------------
// CheckList / CheckListItem
// ---------------------------------------------------------------------------

/**
 * `<CheckList>` — an unordered checklist container (Dify-custom component).
 *
 * Output: <ul class="checklist">{children}</ul>
 */
const checkListHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
): ElementContent => {
  return element("ul", { class: "checklist" }, state.all(node));
};

/**
 * `<CheckListItem id="…">` — a single checklist item (Dify-custom component).
 *
 * The ☐ glyph comes from CSS `.checklist-item::before { content: "☐ " }` and
 * is never inserted as a text node, so it stays out of the extracted text
 * content and does not read as a stray character in copy-paste.
 *
 * Output: <li class="checklist-item">{children}</li>
 *
 * Dropped props: `id` (an anchor identifier with no print meaning).
 */
const checkListItemHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
): ElementContent => {
  return element("li", { class: "checklist-item" }, state.all(node));
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Registration object spread into the render core's component map. */
export const structuralHandlers: Record<string, ComponentHandler> = {
  Tree: treeHandler,
  "Tree.Folder": treeFolderHandler,
  "Tree.File": treeFileHandler,
  CheckList: checkListHandler,
  CheckListItem: checkListItemHandler,
};
