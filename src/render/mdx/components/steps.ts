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
 * The Steps/Step component family (Mintlify "Steps"): a numbered sequential
 * instruction list.
 *
 * Render strategy:
 *   `<Steps>` becomes an `<ol class="steps">` whose children are the `<li>`
 *   elements produced by each `<Step>` handler. The ordered-list element
 *   provides automatic numbering via the browser/print engine; no hand-numbering
 *   is done in the handler.
 *
 *   `<Step title="…">` becomes:
 *     <li class="step">
 *       <p class="step-title">{title}</p>   (only when title is present)
 *       ...children...
 *     </li>
 *
 *   When `title` is absent the `<p class="step-title">` is omitted entirely,
 *   mirroring the same conditional used by the disclosure handler for its labels.
 *
 * Dropped props (project decision for print):
 * - `icon` / `iconType`: icons are not rendered in print.
 * - `titleSize` / `iconSize`: visual/layout props with no print analogue.
 */

/**
 * `<Steps>` — the ordered container.
 *
 *   <ol class="steps">{children}</ol>
 *
 * `state.all(node)` recurses through the children, each of which is a `<Step>`
 * node. Because `Step` is registered in the component map, each child call
 * returns an `<li class="step">` element, and they collect here as the `<ol>`'s
 * children.
 */
const stepsHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  element("ol", { class: "steps" }, state.all(node));

/**
 * `<Step title="…">` — a single numbered step item.
 *
 *   <li class="step">
 *     <p class="step-title">{title}</p>   (only when title is present)
 *     ...children...
 *   </li>
 *
 * Dropped props: `icon`, `iconType`, `titleSize`, `iconSize`.
 */
const stepHandler: ComponentHandler = (state: State, node: JsxComponentNode): ElementContent => {
  const children: ElementContent[] = [];

  const title = getStringAttr(node, "title");
  if (title !== undefined) {
    children.push(element("p", { class: "step-title" }, [text(title)]));
  }

  children.push(...state.all(node));
  return element("li", { class: "step" }, children);
};

/** Registration object spread into the render core's component map. */
export const stepsHandlers: Record<string, ComponentHandler> = {
  Steps: stepsHandler,
  Step: stepHandler,
};
