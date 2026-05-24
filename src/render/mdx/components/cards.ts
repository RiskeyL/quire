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
 * The card/grid component family: Card/CardGroup, Columns/Column, and Tile.
 *
 * Print strategy — "stack vertically":
 *   Responsive grid layout has no analogue in print. All container components
 *   (CardGroup, Columns) become plain block wrappers that let their children
 *   stack naturally. Grid/column props (`cols`, `horizontal`) are dropped.
 *
 * Dropped props (project decision for print):
 * - `icon` / `iconType` on Card: icons are dropped project-wide.
 * - `color` on Card: icon colour, irrelevant without icons.
 * - `horizontal` on Card: compact horizontal layout has no print analogue.
 * - `img` on Card: image preview at top of card; not handled in this iteration.
 * - `cta`, `arrow`, `type` on Card: interactive/visual props with no print analogue.
 * - `cols` on CardGroup and Columns: responsive column count has no print analogue.
 *
 * Shared internal helper — `cardBlock`:
 *   Card and Tile share the same "bordered block with optional linked title,
 *   optional href line, and children" shape. Parameterised by a CSS class prefix
 *   (`card` / `tile`) so the output classes stay distinct without duplicating logic.
 *
 * href display (print readability decision):
 *   On screen, cards and tiles are clickable. The title text always becomes an
 *   `<a>` so the link is live (internal hrefs are rewritten to in-document
 *   anchors at assembly time; external URLs stay as-is). The destination is
 *   surfaced as muted text in a `.{prefix}-href` span ONLY for external URLs
 *   (http/https/mailto/protocol-relative): an external URL is genuinely useful
 *   on paper, but an internal site path is noise once the link resolves to an
 *   anchor, so it is suppressed (see `isExternalUrl`).
 *
 * Tile — `description` prop:
 *   Tile supports an optional `description` string (a short caption below the
 *   title). When present, it is rendered as a `<p class="{prefix}-description">`.
 *   Card does not have a `description` prop per Mintlify docs.
 *
 * No `Tiles` container:
 *   Mintlify documents no `<Tiles>` wrapper component. Tiles are author-placed
 *   standalone or nested inside `<Columns>`. No `Tiles` handler is registered.
 */

/**
 * An href is "external" when it carries a URL scheme (http:, https:, mailto:, …)
 * or is protocol-relative (`//host/...`). Everything else (site-absolute `/x`,
 * relative `./x`/`../x`, or a bare `x.md`) is an internal doc path that becomes
 * an in-document anchor at assembly time, so its raw form is not shown on paper.
 */
function isExternalUrl(href: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith("//");
}

/** Options controlling which optional prop paths `cardBlock` renders. */
interface CardBlockOptions {
  /**
   * Render the `description` prop as a `<p class="{prefix}-description">`.
   * Defaults to `false`. Only `Tile` opts in; `Card` has no `description` prop
   * per Mintlify docs, so `<Card description="…">` must not emit one.
   */
  description?: boolean;
}

/**
 * Shared helper — render a bordered card/tile block.
 *
 * Output when title + href are present (and `description` opted in):
 *   <div class="{prefix}">
 *     <p class="{prefix}-title"><a href="{href}">{title}</a></p>
 *     <span class="{prefix}-href">{href}</span>            (only for external URLs)
 *     [<p class="{prefix}-description">{description}</p>]   (only if opts.description)
 *     ...children...
 *   </div>
 *
 * Output when title only (no href):
 *   <div class="{prefix}">
 *     <p class="{prefix}-title">{title}</p>
 *     ...children...
 *   </div>
 *
 * When title is absent, the title paragraph is omitted entirely.
 *
 * The `description` prop is rendered only when `opts.description` is `true`.
 * Card does not pass it, so a stray `<Card description="…">` is ignored; Tile
 * passes it, so `<Tile description="…">` still renders `.{prefix}-description`.
 */
function cardBlock(
  state: State,
  node: JsxComponentNode,
  prefix: string,
  opts: CardBlockOptions = {}
): ElementContent {
  const children: ElementContent[] = [];

  const title = getStringAttr(node, "title");
  const href = getStringAttr(node, "href");

  if (title !== undefined) {
    const titleContent = href !== undefined
      ? element("a", { href }, [text(title)])
      : text(title);
    children.push(element("p", { class: `${prefix}-title` }, [titleContent]));
  }

  if (href !== undefined && isExternalUrl(href)) {
    // Surface an external URL as muted visible text so print readers can see
    // where it points. Internal paths are omitted: they resolve to in-document
    // anchors, so showing the raw path would be noise on paper.
    children.push(element("span", { class: `${prefix}-href` }, [text(href)]));
  }

  if (opts.description) {
    const description = getStringAttr(node, "description");
    if (description !== undefined) {
      children.push(
        element("p", { class: `${prefix}-description` }, [text(description)])
      );
    }
  }

  children.push(...state.all(node));
  return element("div", { class: prefix }, children);
}

// ---------------------------------------------------------------------------
// Card / CardGroup
// ---------------------------------------------------------------------------

/**
 * `<Card title="…" href="…">` — a bordered content card.
 *
 * Dropped props: `icon`, `iconType`, `color`, `horizontal`, `img`, `cta`,
 *   `arrow`, `type`.
 *
 *   <div class="card">
 *     <p class="card-title">{title}</p>         (omitted when no title)
 *     <span class="card-href">{href}</span>      (only when href is present)
 *     ...children...
 *   </div>
 */
const cardHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  cardBlock(state, node, "card");

/**
 * `<CardGroup cols={n}>` — a transparent container for Card children.
 *
 * Dropped props: `cols` (column count has no print analogue; cards stack).
 *
 *   <div class="card-group">{children}</div>
 */
const cardGroupHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  element("div", { class: "card-group" }, state.all(node));

// ---------------------------------------------------------------------------
// Columns / Column
// ---------------------------------------------------------------------------

/**
 * `<Columns cols={n}>` — a transparent container for Column (or Tile) children.
 *
 * Dropped props: `cols` (responsive column count has no print analogue;
 * columns stack vertically).
 *
 *   <div class="columns">{children}</div>
 */
const columnsHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  element("div", { class: "columns" }, state.all(node));

/**
 * `<Column>` — a single column block inside a Columns container.
 *
 *   <div class="column">{children}</div>
 */
const columnHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  element("div", { class: "column" }, state.all(node));

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

/**
 * `<Tile href="…" title="…" description="…">` — a clickable tile, card-like.
 *
 * Tile is a real author-placeable Mintlify component per official docs.
 * It is used standalone or nested inside `<Columns>`; there is no `<Tiles>`
 * wrapper component in Mintlify — Mintlify's own component gallery uses
 * `<Columns>` as the outer container for a grid of tiles.
 *
 * Props: `href` (required on web, optional here for robustness), `title`,
 *   `description`, `children` (typically images/SVGs on the web; any content
 *   in print).
 *
 * Reuses `cardBlock` with prefix `"tile"` so the rendering logic is not
 * duplicated. `.tile-description` is unique to Tile; Card has no description prop.
 *
 *   <div class="tile">
 *     <p class="tile-title"><a href="{href}">{title}</a></p>  (when title + href)
 *     <span class="tile-href">{href}</span>                    (when href)
 *     <p class="tile-description">{description}</p>           (when description)
 *     ...children...
 *   </div>
 */
const tileHandler: ComponentHandler = (state: State, node: JsxComponentNode) =>
  cardBlock(state, node, "tile", { description: true });

/** Registration object spread into the render core's component map. */
export const cardsHandlers: Record<string, ComponentHandler> = {
  Card: cardHandler,
  CardGroup: cardGroupHandler,
  Columns: columnsHandler,
  Column: columnHandler,
  Tile: tileHandler,
};
