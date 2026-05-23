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
 * `<Frame>` — Mintlify's captioned figure component.
 *
 * Renders a semantic `<figure>` that keeps an image and its optional caption
 * together in print:
 *
 *   <figure class="frame">
 *     ...children...                           (the image, via state.all)
 *     <figcaption>{caption}</figcaption>       (only when a caption is given)
 *   </figure>
 *
 * The `caption` prop is read as a plain string. When it is absent, the
 * `<figcaption>` element is omitted entirely.
 *
 * Children come from `state.all(node)`. In real Mintlify docs the immediate
 * child is a Markdown image (`![alt](src)`), which remark converts to a
 * `<p><img></p>` subtree. A `<figure>` wrapping a `<p><img>` is valid HTML
 * and correct for print, so the paragraph is left in place rather than
 * unwrapped. Raw `<img>` children (inline JSX) also flow through unchanged.
 */
const frameHandler: ComponentHandler = (state: State, node: JsxComponentNode) => {
  const children: ElementContent[] = [...state.all(node)];

  const caption = getStringAttr(node, "caption");
  if (caption !== undefined) {
    children.push(element("figcaption", {}, [text(caption)]));
  }

  return element("figure", { class: "frame" }, children);
};

/** Registration object spread into the render core's component map. */
export const frameHandlers: Record<string, ComponentHandler> = {
  Frame: frameHandler,
};
