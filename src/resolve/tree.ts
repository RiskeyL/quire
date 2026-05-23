export interface SectionNode {
  type: "section";
  title: string;
  children: TreeNode[];
}

export interface PageNode {
  type: "page";
  file: string;
  title?: string;
  description?: string;
}

export type TreeNode = SectionNode | PageNode;
export type Tree = TreeNode[];

/** All page nodes in document (depth-first) order. */
export function collectPages(tree: Tree): PageNode[] {
  const pages: PageNode[] = [];
  for (const node of tree) {
    if (node.type === "page") pages.push(node);
    else pages.push(...collectPages(node.children));
  }
  return pages;
}

/**
 * Prune the tree to the selected pages, retaining the ancestor sections of any
 * selected page and dropping sections with no selected descendants.
 */
export function selectPages(tree: Tree, selectedFiles: string[]): Tree {
  return pruneToSelected(tree, new Set(selectedFiles));
}

function pruneToSelected(tree: Tree, selected: Set<string>): Tree {
  const result: TreeNode[] = [];
  for (const node of tree) {
    if (node.type === "page") {
      if (selected.has(node.file)) result.push(node);
    } else {
      const prunedChildren = pruneToSelected(node.children, selected);
      if (prunedChildren.length > 0) {
        result.push({ type: "section", title: node.title, children: prunedChildren });
      }
    }
  }
  return result;
}

/** Render the tree as an indented text outline (for --dry-run). */
export function formatTree(tree: Tree, depth = 0): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  for (const node of tree) {
    if (node.type === "page") {
      lines.push(indent + (node.title ? `${node.title} (${node.file})` : node.file));
    } else {
      lines.push(indent + node.title);
      const childLines = formatTree(node.children, depth + 1);
      if (childLines) lines.push(childLines);
    }
  }
  return lines.join("\n");
}
