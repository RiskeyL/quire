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
 * The disclosure component family (Mintlify "Tabs", "Accordions",
 * "Expandables"): interactive sections that are collapsed by default on the
 * web but must be fully visible in print.
 *
 * Render strategy — "expand-and-label":
 *   Every child panel is rendered unconditionally. Each panel is preceded by
 *   a bold label paragraph so the reader knows what the section was titled.
 *
 * Dropped props (project decision for print):
 * - `icon` / `iconType` on Tab and Accordion: icons are not rendered in print.
 * - `id` on Tab and Accordion: anchor IDs are not meaningful in a PDF.
 * - `defaultOpen` on Accordion and Expandable: all panels are open in print.
 * - `description` on Accordion: secondary caption shown below the title in the
 *   collapsed header. In print, the title label is sufficient.
 * - `defaultTabIndex`, `sync`, `borderBottom` on Tabs: interactive/visual props
 *   with no print analogue.
 * - Accordion `href`: Mintlify docs confirm Accordion has no `href` prop.
 *
 * Shared internal helper — `disclosureBlock`:
 *   Avoids duplicating the "label paragraph + children" structure across the
 *   three leaf components (Tab, Accordion, Expandable). Parameterised by the
 *   CSS class prefix so the output classes stay distinct.
 */

/**
 * Render a labeled disclosure block.
 *
 * Output:
 *   <div class="{prefix}">
 *     <p class="{prefix}-label">{title}</p>   (only when title is present)
 *     ...children...
 *   </div>
 */
export function disclosureBlock(
  state: State,
  node: JsxComponentNode,
  prefix: string
): ElementContent {
  const children: ElementContent[] = [];

  const title = getStringAttr(node, "title");
  if (title !== undefined) {
    children.push(element("p", { class: `${prefix}-label` }, [text(title)]));
  }

  children.push(...state.all(node));
  return element("div", { class: prefix }, children);
}

// ---------------------------------------------------------------------------
// Tabs / Tab
// ---------------------------------------------------------------------------

/**
 * `<Tabs>` — a transparent container that groups `<Tab>` children.
 *
 *   <div class="tabs">{children}</div>
 *
 * All interactive props (`defaultTabIndex`, `sync`, `borderBottom`) are dropped.
 */
const tabsHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  element("div", { class: "tabs" }, state.all(node));

/**
 * `<Tab title="…">` — a single tab panel.
 *
 *   <div class="tab">
 *     <p class="tab-label">{title}</p>
 *     ...children...
 *   </div>
 *
 * Dropped props: `icon`, `iconType`, `id`.
 */
const tabHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  disclosureBlock(state, node, "tab");

// ---------------------------------------------------------------------------
// AccordionGroup / Accordion
// ---------------------------------------------------------------------------

/**
 * `<AccordionGroup>` — a transparent container that groups `<Accordion>` children.
 *
 *   <div class="accordion-group">{children}</div>
 *
 * `cols` (column layout) has no print analogue and is dropped.
 */
const accordionGroupHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  element("div", { class: "accordion-group" }, state.all(node));

/**
 * `<Accordion title="…">` — a single accordion panel.
 *
 *   <div class="accordion">
 *     <p class="accordion-label">{title}</p>
 *     ...children...
 *   </div>
 *
 * Dropped props: `icon`, `iconType`, `id`, `defaultOpen`, `description`.
 * Note: Mintlify docs confirm Accordion has no `href` prop; the label is plain text.
 */
const accordionHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  disclosureBlock(state, node, "accordion");

// ---------------------------------------------------------------------------
// Expandable
// ---------------------------------------------------------------------------

/**
 * `<Expandable title="…">` — typically used inside `<ParamField>` to reveal
 * nested object fields.
 *
 *   <div class="expandable">
 *     <p class="expandable-label">{title}</p>
 *     ...children...
 *   </div>
 *
 * Dropped props: `defaultOpen`.
 */
const expandableHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  disclosureBlock(state, node, "expandable");

/** Registration object spread into the render core's component map. */
export const disclosureHandlers: Record<string, ComponentHandler> = {
  Tabs: tabsHandler,
  Tab: tabHandler,
  AccordionGroup: accordionGroupHandler,
  Accordion: accordionHandler,
  Expandable: expandableHandler,
};
