import type { ElementContent } from "hast";
import {
  getStringAttr,
  type ComponentHandler,
  type JsxComponentNode,
  type State,
} from "../hast-helpers.js";
import { disclosureBlock } from "./disclosure.js";

/**
 * Conditional-content component family: View and Visibility.
 *
 * View — verified props (https://mintlify.com/docs/components/view):
 *   `title` (string, required): identifies which view panel (e.g. "Python",
 *     "Node"). On the web, only the active panel is displayed via the
 *     multi-view dropdown.
 *   `icon`, `iconType` — web-only decorative props, dropped in print.
 *
 *   In a browser, View panels are shown one at a time. In print, there is no
 *   interactive view-switching: all panels must appear. View is a switchable
 *   panel like Tab, so it reuses the expand-and-label treatment (its `title`
 *   becomes a label above the panel content) so adjacent panels stay visually
 *   distinct. No prop causes content to be hidden in a print/human context.
 *
 * Visibility — verified props (https://mintlify.com/docs/components/visibility):
 *   `for` (string, required): `"humans"` | `"agents"`
 *
 *   Mintlify semantics:
 *     - `for="humans"`: rendered on the web UI, excluded from Markdown output.
 *       This is content written for human readers.
 *     - `for="agents"`: hidden on the web UI, included in Markdown output (for
 *       AI ingestion). This is content written exclusively for AI agents.
 *
 *   Quire mapping (human-facing print document):
 *     - `for="humans"` or absent → RENDER children (human content belongs in
 *       the deliverable).
 *     - `for="agents"` → DROP children (return []; AI-only content must not
 *       appear in the human-facing print output, just as Icon is dropped).
 */

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

/**
 * `<View title="…">` — a switchable content panel.
 *
 * In print, all panels are rendered (no interactive switching). View is a
 * switchable panel like Tab, so it reuses `disclosureBlock` (the shared
 * expand-and-label helper): the `title` renders as a `<p class="view-label">`
 * above the panel content, keeping adjacent panels distinct. `icon`/`iconType`
 * are dropped (web-only props).
 */
const viewHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
): ElementContent => disclosureBlock(state, node, "view");

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * `<Visibility for="humans|agents">` — audience-conditional content.
 *
 * Quire produces a human-facing print document:
 *   - `for="humans"` or absent: return children (human content rendered).
 *   - `for="agents"`: return [] (AI-agent-only content dropped entirely).
 *
 * Returning an empty array removes the block cleanly with no wrapper residue,
 * matching the pattern used by the Icon handler for dropped elements.
 */
const visibilityHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
): ElementContent | ElementContent[] => {
  const audience = getStringAttr(node, "for")?.trim().toLowerCase();
  if (audience === "agents") {
    return [];
  }
  return state.all(node);
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Registration object spread into the render core's component map. */
export const conditionalHandlers: Record<string, ComponentHandler> = {
  View: viewHandler,
  Visibility: visibilityHandler,
};
