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
 * The boxed/aside family beyond callouts: `Update` and `Panel`.
 *
 * `Banner` is intentionally absent: in Mintlify it is a `docs.json` site-config
 * feature (a persistent site-wide bar), not an author-placeable in-content
 * component, so the render core has no handler for it. A stray `<Banner>` in
 * page MDX degrades harmlessly through the passthrough wrapper.
 */

/**
 * `<Update>` — a changelog / release-note entry. Mintlify's interactive timeline
 * (anchor links, RSS, right-panel tag filters) has no print analogue, so this
 * renders a simple left-ruled box:
 *
 *   <div class="update">
 *     <p class="update-label">{label}</p>      (only when a label is given)
 *     <p class="update-description">{description}</p>  (only when given)
 *     ...children...
 *   </div>
 *
 * The `tags` and `rss` props are dropped: `tags` drives the right-panel filter
 * UI and `rss` only customizes feed output, neither of which prints.
 */
const updateHandler: ComponentHandler = (state: State, node: JsxComponentNode) => {
  const children: ElementContent[] = [];

  const label = getStringAttr(node, "label");
  if (label !== undefined) {
    children.push(element("p", { class: "update-label" }, [text(label)]));
  }

  const description = getStringAttr(node, "description");
  if (description !== undefined) {
    children.push(
      element("p", { class: "update-description" }, [text(description)])
    );
  }

  children.push(...state.all(node));
  return element("div", { class: "update" }, children);
};

/**
 * `<Panel>` — in Mintlify this replaces the right side panel / table of contents
 * with arbitrary content. Print has no side panel, so its children render as an
 * aside box that flows inline with the page.
 */
const panelHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  element("aside", { class: "panel" }, state.all(node));

/** Registration object spread into the render core's component map. */
export const boxedHandlers: Record<string, ComponentHandler> = {
  Update: updateHandler,
  Panel: panelHandler,
};
