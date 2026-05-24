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
 * The callout family (Mintlify "Callouts"): a left-bordered, tinted box with a
 * bold label and the component's children.
 *
 * Each callout renders as:
 *
 *   <div class="callout callout-{type}">
 *     <p class="callout-label">{Label}</p>
 *     ...children...
 *   </div>
 *
 * Dropped props (project decision for print):
 * - `icon` / `iconType`: icons are not rendered in print, so they are ignored.
 * - `color`: the custom hex color (border/background tint) is intentionally
 *   ignored for now. It is a candidate for a future theme token once a
 *   semantic-color set exists; until then per-type colors come from CSS.
 */

/** The visible label shown for each callout type. */
const TYPE_LABELS = {
  info: "Info",
  tip: "Tip",
  warning: "Warning",
  note: "Note",
  // Mintlify's Check callout signals a "checked status"; the conventional
  // label for that success state is "Success".
  check: "Success",
  danger: "Danger",
} as const;

/** A known callout type (a key of {@link TYPE_LABELS}). */
type CalloutType = keyof typeof TYPE_LABELS;

/** The type used by the generic `<Callout>` when none is given or it is unknown. */
const DEFAULT_TYPE: CalloutType = "note";

/** Build the hast box for a callout of the given type, using the node's children. */
function renderCallout(
  state: State,
  node: JsxComponentNode,
  type: string
): ElementContent {
  // `type` may be an unknown string (the generic Callout passes through whatever
  // the author wrote), so the lookup can miss; fall back to the default label.
  const label = TYPE_LABELS[type as CalloutType] ?? TYPE_LABELS[DEFAULT_TYPE];
  // The label is a bold run so it stands out in Word too: Pandoc ignores the
  // CSS `.callout-label { font-weight }`, but it carries an inline <strong>
  // through to a bold run. The PDF still bolds it via the class (double-bold is
  // a no-op visually).
  const labelEl = element("p", { class: "callout-label" }, [
    element("strong", {}, [text(label)]),
  ]);
  // `custom-style` is Pandoc's hook for mapping an HTML div to a Word paragraph
  // style: every paragraph inside inherits the named style, and the reference
  // doc defines "Callout {Type}" as a bordered, tinted box. The PDF ignores the
  // attribute (its CSS keys off the class), so it is harmless to carry here.
  const customStyle = `Callout ${type.charAt(0).toUpperCase()}${type.slice(1)}`;
  return element(
    "div",
    { class: `callout callout-${type}`, "custom-style": customStyle },
    [labelEl, ...state.all(node)]
  );
}

/** A handler for a named callout component bound to a fixed type. */
function namedCallout(type: string): ComponentHandler {
  return (state, node) => renderCallout(state, node, type);
}

/**
 * Handler for the generic `<Callout type="...">`. Reads the `type` attribute and
 * falls back to `note` when it is absent or unknown.
 */
const genericCallout: ComponentHandler = (state, node) => {
  const requested = getStringAttr(node, "type");
  const type = requested && requested in TYPE_LABELS ? requested : DEFAULT_TYPE;
  return renderCallout(state, node, type);
};

/** Registration object spread into the render core's component map. */
export const calloutHandlers: Record<string, ComponentHandler> = {
  Info: namedCallout("info"),
  Tip: namedCallout("tip"),
  Warning: namedCallout("warning"),
  Note: namedCallout("note"),
  Check: namedCallout("check"),
  Danger: namedCallout("danger"),
  Callout: genericCallout,
};
