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
 * Inline (text-level) component family: Badge, Tooltip, Icon.
 *
 * These components appear mid-sentence and must render as inline elements
 * (<span>) rather than block elements (<div>).
 *
 * Color — SKIPPED (block-level design tool, not inline author-placeable):
 *   Mintlify's Color component uses a parent-child system with Color.Item /
 *   Color.Row dot-notation sub-components and a `variant` prop for grid/table
 *   layout. It is a block-level documentation tool for color systems, not an
 *   inline author-placeable element. Skipped per the Banner/Tiles precedent.
 *
 * Badge — verified props (https://mintlify.com/docs/components/badge):
 *   `color`: "gray" | "blue" | "green" | "yellow" | "orange" | "red" |
 *            "purple" | "white" | "surface" | "white-destructive" |
 *            "surface-destructive" (default: "gray")
 *   `size`: "xs" | "sm" | "md" | "lg" (default: "md") — dropped in print
 *   `shape`: "rounded" | "pill" (default: "rounded") — dropped in print
 *   `icon`, `stroke`, `disabled`, `className` — dropped in print
 *   The `color` prop is reflected as a modifier class when present; `size` and
 *   `shape` have no print analogue and are silently dropped (comment preserved).
 *
 * Tooltip — verified props (https://mintlify.com/docs/components/tooltips):
 *   `tip` (required, string): the tooltip text
 *   `headline` (optional, string): text before the tip — dropped in print
 *   `cta` / `href` (optional): call-to-action link — dropped in print (no hover)
 *   Print strategy: trigger text followed by the tip in parentheses, so the
 *   information is accessible on paper without hover interaction.
 *
 * Icon — verified props (https://mintlify.com/docs/components/icons):
 *   `icon` (required, string): icon name (Font Awesome / Lucide / Tabler)
 *   `iconType`, `color`, `size`, `className` — irrelevant (icon is dropped)
 *   Print strategy: render NOTHING. Icons are decorative; they have no text
 *   equivalent and are dropped project-wide. An empty array is returned so the
 *   element disappears cleanly rather than leaving a passthrough wrapper.
 */

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

/**
 * `<Badge color="…">label</Badge>` — an inline status/label pill.
 *
 * Output without color:
 *   <span class="badge">label</span>
 *
 * Output with color:
 *   <span class="badge badge-{color}">label</span>
 *
 * Dropped props: `size`, `shape`, `icon`, `stroke`, `disabled`, `className`.
 * The `color` prop is reflected as a modifier class for minimal semantic
 * differentiation. Size and shape have no print analogue.
 */
const badgeHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
): ElementContent => {
  const color = getStringAttr(node, "color");
  const cls = color !== undefined ? `badge badge-${color}` : "badge";
  return element("span", { class: cls }, state.all(node));
};

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

/**
 * `<Tooltip tip="…">trigger</Tooltip>` — an inline term with a definition.
 *
 * Print has no hover interaction. The tip is appended in parentheses so the
 * information is not lost on paper.
 *
 * Output when tip is present:
 *   <span class="tooltip">
 *     {trigger children}
 *     (<span class="tooltip-tip">{tip}</span>)
 *   </span>
 *
 * Output when tip is absent: just the trigger children wrapped in .tooltip.
 *
 * Dropped props: `headline`, `cta`, `href` (web-only interactive props).
 */
const tooltipHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
): ElementContent => {
  const tip = getStringAttr(node, "tip");
  const triggerChildren = state.all(node);

  if (tip === undefined) {
    return element("span", { class: "tooltip" }, triggerChildren);
  }

  const tipSpan = element("span", { class: "tooltip-tip" }, [text(tip)]);
  return element("span", { class: "tooltip" }, [
    ...triggerChildren,
    text(" ("),
    tipSpan,
    text(")"),
  ]);
};

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

/**
 * `<Icon icon="…" />` — a self-closing icon element.
 *
 * Icons are decorative and dropped project-wide. Returning an empty array
 * removes the element entirely with no passthrough wrapper or residual content.
 *
 * Dropped props: all (`icon`, `iconType`, `color`, `size`, `className`).
 */
const iconHandler: ComponentHandler = (
  _state: State,
  _node: JsxComponentNode
): ElementContent[] => {
  return [];
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Registration object spread into the render core's component map. */
export const inlineHandlers: Record<string, ComponentHandler> = {
  Badge: badgeHandler,
  Tooltip: tooltipHandler,
  Icon: iconHandler,
};
