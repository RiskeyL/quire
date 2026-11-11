import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import type { Plugin } from "unified";

/**
 * Custom heading ids: `## Title {#my-id}`.
 *
 * Mintlify (like many Markdown flavours) lets an author pin a heading's anchor
 * with a trailing `{#id}`. To an MDX parser `{…}` is a JavaScript expression,
 * and `#id` is not valid JavaScript, so one such heading makes the whole page
 * fail to parse and drop into the degraded fallback, where every component on
 * the page loses its rendering.
 *
 * The fix has two halves. Before parsing, `markHeadingIds` swaps the `{#id}` on
 * an ATX heading line for a plain-text marker the parser passes through. After
 * the tree is built, `rehypeHeadingIds` removes the marker from the heading and
 * sets the heading's `id`, ahead of `rehype-slug` (which only fills in headings
 * that have no id yet).
 */

const MARK_OPEN = "⟪quire-heading-id:";
const MARK_CLOSE = "⟫";

/** An ATX heading line that ends in `{#id}`. Group 1 is the line without it; group 2 the id. */
const ATX_WITH_ID = /^( {0,3}#{1,6}[ \t]+.*?)[ \t]*\{#([A-Za-z0-9_][\w:.-]*)\}[ \t]*$/;

/** The opening (or closing) line of a fenced code block. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** The marker at the end of a heading's last text node. */
const MARKER_AT_END = new RegExp(`\\s*${MARK_OPEN}([^${MARK_CLOSE}]+)${MARK_CLOSE}\\s*$`);

/**
 * Replace the trailing `{#id}` of every ATX heading outside fenced code with a
 * marker that survives MDX parsing as ordinary text.
 */
export function markHeadingIds(source: string): string {
  if (!source.includes("{#")) return source;
  let fence: { char: string; length: number } | null = null;
  return source
    .split("\n")
    .map((line) => {
      const fenceMatch = FENCE.exec(line);
      if (fence === null) {
        if (fenceMatch) {
          fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
          return line;
        }
        const heading = ATX_WITH_ID.exec(line.replace(/\r$/, ""));
        if (!heading) return line;
        const carriageReturn = line.endsWith("\r") ? "\r" : "";
        return `${heading[1]} ${MARK_OPEN}${heading[2]}${MARK_CLOSE}${carriageReturn}`;
      }
      const closes =
        fenceMatch !== null &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.length &&
        fenceMatch[2].trim() === "";
      if (closes) fence = null;
      return line;
    })
    .join("\n");
}

/** Rehype plugin: turn each heading's marker into its `id` and drop the marker text. */
export const rehypeHeadingIds: Plugin<[], Root> = () => {
  return (tree) => {
    walk(tree.children);
  };
};

function walk(nodes: Array<RootContent | ElementContent>): void {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (/^h[1-6]$/.test(node.tagName)) applyMarker(node);
    else walk(node.children);
  }
}

function applyMarker(heading: Element): void {
  const owner = lastTextOwner(heading);
  if (!owner) return;
  const { parent, index } = owner;
  const text = parent.children[index] as Text;
  const match = MARKER_AT_END.exec(text.value);
  if (!match) return;
  heading.properties = { ...heading.properties, id: match[1] };
  text.value = text.value.slice(0, match.index);
  if (text.value === "") parent.children.splice(index, 1);
}

/** The element holding the heading's last text node, and that node's position in it. */
function lastTextOwner(element: Element): { parent: Element; index: number } | null {
  for (let i = element.children.length - 1; i >= 0; i--) {
    const child = element.children[i];
    if (child.type === "text") return { parent: element, index: i };
    if (child.type === "element") return lastTextOwner(child);
  }
  return null;
}
