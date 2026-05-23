import type { Code } from "mdast";
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
 * The code-group component family: CodeGroup and Prompt.
 *
 * CodeGroup — print strategy ("expand-and-label"):
 *   On the web, CodeGroup shows multiple code fences in a tabbed interface.
 *   Print has no tabs, so all blocks are shown sequentially. Each block is
 *   preceded by a small label derived from its metadata so the reader knows
 *   which variant they are reading.
 *
 *   Label derivation (see `codeLabel`):
 *     1. A `title="..."` value in the fence's meta string.
 *     2. The bare meta text (e.g. `python Image URL` → "Image URL").
 *     3. The fence's language (e.g. `js` → "js").
 *     4. The default string "Code" when neither lang nor meta is present.
 *
 *   Child conversion strategy:
 *     The CodeGroup handler iterates the mdast children of the JSX node
 *     directly (not via `state.all`). For each mdast `code` node, it reads
 *     the label from `lang`/`meta`, converts the node to hast with
 *     `state.one(child, undefined)`, and wraps the result in a
 *     `.code-group-item` with a `.code-label` above it. Non-`code` children
 *     are converted and included without a label wrapper.
 *
 *     This approach is necessary because `state.all(node)` converts children
 *     to hast before the handler sees them, discarding the `lang`/`meta` label
 *     info (which lives only on the mdast node). By iterating mdast children
 *     directly we can read the label and then still produce the correct hast
 *     `<pre><code>` output via `state.one`.
 *
 * Prompt — print strategy ("labeled block"):
 *   Prompt is a real author-placeable Mintlify component (verified at
 *   https://mintlify.com/docs/components/prompt). On the web it renders a
 *   copyable card with clipboard/Cursor actions. In print, actions are
 *   dropped; the `description` prop becomes a bold label and the children
 *   (the prompt text) render below it.
 *
 *   Props used: `description` (string, optional — falls back to "Prompt").
 *   Props dropped: `actions`, `icon`, `iconType` (web-only interaction props).
 *
 * Dropped props by component:
 * - CodeGroup: `dropdown`, `theme` (web tab/display-only).
 * - Prompt: `actions`, `icon`, `iconType`.
 */

// ---------------------------------------------------------------------------
// codeLabel — exported for unit testing
// ---------------------------------------------------------------------------

/** Matches `title="..."` or `title='...'` in a fence meta string. */
const TITLE_ATTR = /\btitle=["']([^"']*)["']/;

/**
 * Derive a display label for a fenced code block.
 *
 * Resolution order:
 *   1. A `title="…"` / `title='…'` value extracted from `node.meta`.
 *   2. The trimmed `node.meta` text (e.g. `"Image URL"` or `"server.py"`).
 *   3. The `node.lang` value (e.g. `"js"` or `"bash"`).
 *   4. `"Code"` as the final fallback.
 */
export function codeLabel(node: Code): string {
  const meta = node.meta?.trim() ?? "";
  if (meta) {
    const match = TITLE_ATTR.exec(meta);
    // Only use the title value when it is non-empty; an empty `title=""`
    // falls through to the bare meta rather than emitting a blank label.
    if (match && match[1]) return match[1];
    return meta;
  }
  const lang = node.lang?.trim() ?? "";
  if (lang) return lang;
  return "Code";
}

// ---------------------------------------------------------------------------
// CodeGroup
// ---------------------------------------------------------------------------

/**
 * `<CodeGroup>` — render multiple fenced code blocks sequentially, each
 * under a small label derived from its metadata.
 *
 * Output structure:
 *   <div class="code-group">
 *     <div class="code-group-item">
 *       <p class="code-label">{label}</p>
 *       <pre><code>…</code></pre>
 *     </div>
 *     …
 *   </div>
 *
 * Non-`code` children are converted and included without a label wrapper.
 *
 * Dropped props: `dropdown`, `theme`.
 */
const codeGroupHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
) => {
  const items: ElementContent[] = [];

  for (const child of node.children) {
    if (child.type === "code") {
      const label = codeLabel(child);
      const converted = state.one(child, undefined);
      // `state.one` can return a single node, an array, or undefined.
      const block: ElementContent[] = converted === undefined
        ? []
        : Array.isArray(converted)
          ? converted
          : [converted];

      items.push(
        element("div", { class: "code-group-item" }, [
          element("p", { class: "code-label" }, [text(label)]),
          ...block,
        ])
      );
    } else {
      // Non-code child: convert and include without a label wrapper.
      const converted = state.one(child, undefined);
      if (converted !== undefined) {
        if (Array.isArray(converted)) {
          items.push(...converted);
        } else {
          items.push(converted);
        }
      }
    }
  }

  return element("div", { class: "code-group" }, items);
};

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * `<Prompt description="…">` — a copyable AI prompt card.
 *
 * Prompt is a real author-placeable component per Mintlify docs.
 * In print, clipboard/Cursor actions have no analogue, so they are dropped.
 * The `description` prop becomes the label; the children are the prompt body.
 *
 * Output:
 *   <div class="prompt">
 *     <p class="prompt-label">{description || "Prompt"}</p>
 *     …children…
 *   </div>
 *
 * Dropped props: `actions`, `icon`, `iconType`.
 */
const promptHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
) => {
  const label = getStringAttr(node, "description") ?? "Prompt";
  return element("div", { class: "prompt" }, [
    element("p", { class: "prompt-label" }, [text(label)]),
    ...state.all(node),
  ]);
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Registration object spread into the render core's component map. */
export const codeHandlers: Record<string, ComponentHandler> = {
  CodeGroup: codeGroupHandler,
  Prompt: promptHandler,
};
