import type { Element, ElementContent, Text } from "hast";
import type { State } from "mdast-util-to-hast";
import type { MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";

export type { State } from "mdast-util-to-hast";

/**
 * Canonical imports for component modules.
 *
 * Every module under `components/` should import its building blocks from this
 * file only, not directly from `mdast-util-mdx-jsx`. A handler helper types its
 * node parameter as `JsxComponentNode`, and pulls `State` / `ComponentHandler`
 * from here too, so the whole `components/*` tree imports from one place.
 */

/**
 * The mdast node a component handler receives: either a flow element
 * (`<Component>` on its own line) or a text element (`<Component>` inline).
 */
export type JsxComponentNode = MdxJsxFlowElement | MdxJsxTextElement;

/**
 * A handler that renders a single MDX component node into hast content.
 *
 * Returning an array lets a handler emit several sibling nodes; returning a
 * single node is the common case. Component modules under `components/`
 * implement this signature and are spread into the render core's component map.
 */
export type ComponentHandler = (
  state: State,
  node: JsxComponentNode
) => ElementContent | ElementContent[];

/** Build a hast element node. */
export function element(
  tagName: string,
  properties: Record<string, string | boolean>,
  children: ElementContent[]
): Element {
  return { type: "element", tagName, properties, children };
}

/** Build a hast text node. */
export function text(value: string): Text {
  return { type: "text", value };
}

/**
 * Find an `mdxJsxAttribute` by `name` and return its string value.
 *
 * Returns `undefined` for a missing attribute, a boolean attribute (value
 * `null`), or an expression-valued attribute (`prop={...}`): callers that want
 * a plain string should treat all of those as "not provided".
 */
export function getStringAttr(
  node: JsxComponentNode,
  name: string
): string | undefined {
  for (const attr of node.attributes) {
    if (attr.type !== "mdxJsxAttribute") continue; // skip spread attributes
    if (attr.name !== name) continue;
    return typeof attr.value === "string" ? attr.value : undefined;
  }
  return undefined;
}
