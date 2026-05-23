import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import yaml from "js-yaml";
import type { Root as MdastRoot, Yaml } from "mdast";
import type { ElementContent } from "hast";
import type {
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxJsxAttribute,
} from "mdast-util-mdx-jsx";
import type { Handler, Handlers, State } from "mdast-util-to-hast";
import type { Plugin } from "unified";
import { element, type ComponentHandler } from "./hast-helpers.js";
import { calloutHandlers } from "./components/callouts.js";
import { boxedHandlers } from "./components/boxed.js";
import { frameHandlers } from "./components/frame.js";
import { disclosureHandlers } from "./components/disclosure.js";
import { stepsHandlers } from "./components/steps.js";
import { cardsHandlers } from "./components/cards.js";
import { fieldsHandlers } from "./components/fields.js";

/** Parsed YAML frontmatter for a page. `title`/`description` are surfaced for convenience. */
export interface PageFrontmatter {
  title?: string;
  description?: string;
  [k: string]: unknown;
}

/** The HTML body of a rendered page plus its parsed frontmatter. */
export interface RenderResult {
  html: string;
  frontmatter: PageFrontmatter;
}

/** Options for `renderMdx`. */
export interface RenderMdxOptions {
  /** Called with a human-readable message when a page degrades to the fallback render. */
  onWarn?: (msg: string) => void;
}

/**
 * Per-component hast handlers, keyed by component name (e.g. `Info`, `Frame`).
 * Populated by spreading the per-group registration objects from the
 * `components/` modules; any Capitalized component without an entry falls back
 * to the passthrough `data-component` wrapper.
 */
const componentMap: Record<string, ComponentHandler> = {
  ...calloutHandlers,
  ...boxedHandlers,
  ...frameHandlers,
  ...disclosureHandlers,
  ...stepsHandlers,
  ...cardsHandlers,
  ...fieldsHandlers,
};

/**
 * Render an MDX/Markdown source string to an HTML fragment, extracting its
 * YAML frontmatter.
 *
 * JSX is parsed structurally and never evaluated: lowercase tags become real
 * HTML elements, Capitalized components fall back to a `data-component`
 * wrapper that preserves their children, and `{...}` expressions are dropped.
 * A malformed page never aborts the run: on any parse/compile failure the page
 * degrades to a minimal Markdown-only render and `onWarn` is invoked.
 *
 * Heading ids from rehype-slug are page-local and may collide once pages are
 * concatenated; a future linking task should dedupe them (the assembler already
 * handles cross-page section/page anchors separately).
 */
export function renderMdx(source: string, options: RenderMdxOptions = {}): RenderResult {
  try {
    const file = buildProcessor().processSync(source);
    const frontmatter = (file.data.frontmatter as PageFrontmatter | undefined) ?? {};
    return { html: String(file), frontmatter };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    options.onWarn?.(`MDX render failed, using degraded fallback: ${message}`);
    return renderDegraded(source);
  }
}

/** Build the full unified MDX processor. */
function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMdx)
    .use(remarkExtractFrontmatter)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      handlers: jsxHandlers(),
    })
    .use(rehypeSlug)
    .use(rehypeStringify, { allowDangerousHtml: true });
}

/**
 * Remark plugin: find the root `yaml` node produced by `remark-frontmatter`,
 * parse it with js-yaml, and stash the resulting object on
 * `file.data.frontmatter`. The `yaml` node itself is dropped by remark-rehype,
 * so frontmatter never leaks into the HTML.
 */
const remarkExtractFrontmatter: Plugin<[], MdastRoot> = () => {
  return (tree, file) => {
    const yamlNode = tree.children.find((child): child is Yaml => child.type === "yaml");
    if (!yamlNode) return;
    try {
      const parsed = yaml.load(yamlNode.value);
      if (parsed && typeof parsed === "object") {
        file.data.frontmatter = parsed as PageFrontmatter;
      }
    } catch {
      // Malformed YAML: leave frontmatter unset rather than failing the render.
    }
  };
};

/** The custom mdast-to-hast handlers for MDX JSX and expression nodes. */
function jsxHandlers(): Handlers {
  const handlers: Record<string, Handler> = {
    mdxJsxFlowElement: (state, node: MdxJsxFlowElement) =>
      handleJsxElement(state, node, "div"),
    mdxJsxTextElement: (state, node: MdxJsxTextElement) =>
      handleJsxElement(state, node, "span"),
    // Drop `{...}`, `{{...}}`, and `{/* comment */}` so braces never render as
    // visible garbage. They mostly live in code fences, which are not parsed
    // as expressions, so code stays intact.
    mdxFlowExpression: () => undefined,
    mdxTextExpression: () => undefined,
    // ESM import/export statements have no print representation.
    mdxjsEsm: () => undefined,
  };
  return handlers;
}

/**
 * Convert one MDX JSX element node to hast.
 *
 * - Lowercase `name` (real HTML element): a hast element with that tag name,
 *   mapped attributes, and recursed children.
 * - Capitalized `name` (component): a registered handler if present, else a
 *   passthrough `<div>`/`<span data-component="Name">` wrapping the children.
 * - `null` `name` (`<>...</>` fragment): just the children.
 *
 * The component passthrough wrapper drops the component's attributes; the
 * registered handlers added in later tasks read attributes themselves.
 *
 * @param wrapperTag The element used for the component passthrough wrapper
 *                   (`div` for flow elements, `span` for text elements).
 */
function handleJsxElement(
  state: State,
  node: MdxJsxFlowElement | MdxJsxTextElement,
  wrapperTag: "div" | "span"
): ElementContent | ElementContent[] {
  const children = state.all(node);

  // Fragment: <>...</> — return the children directly.
  if (node.name === null) {
    return children;
  }

  // Capitalized component name.
  if (isComponentName(node.name)) {
    const handler = componentMap[node.name];
    if (handler) return handler(state, node);
    return element(wrapperTag, { "data-component": node.name }, children);
  }

  // Lowercase HTML element.
  return element(node.name, mapAttributes(node.attributes), children);
}

/** True when a JSX tag name is a component (starts with an uppercase letter). */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Map MDX JSX attributes to hast properties.
 *
 * - `className` is renamed to `class`.
 * - String values pass through unchanged.
 * - A `null` value is a boolean attribute (e.g. `disabled`) → `true`.
 * - Expression-valued attributes keep their raw expression text (5A does not
 *   evaluate expressions).
 * - Expression spread attributes (`{...props}`) have no name and are skipped.
 */
function mapAttributes(
  attributes: (MdxJsxFlowElement | MdxJsxTextElement)["attributes"]
): Record<string, string | boolean> {
  const properties: Record<string, string | boolean> = {};
  for (const attr of attributes) {
    if (attr.type !== "mdxJsxAttribute") continue; // skip spread attributes
    const name = attr.name === "className" ? "class" : attr.name;
    properties[name] = attributeValue(attr);
  }
  return properties;
}

/**
 * Resolve a single JSX attribute's value to a hast property value.
 *
 * Object/multi-token expression values (e.g. `style={{...}}`) are emitted as
 * raw escaped text for now; real expression handling is deferred to the
 * per-component tasks.
 */
function attributeValue(attr: MdxJsxAttribute): string | boolean {
  const value = attr.value;
  if (value === null || value === undefined) return true; // boolean attribute
  if (typeof value === "string") return value;
  // mdxJsxAttributeValueExpression: keep the raw expression text.
  return value.value;
}

// ---------------------------------------------------------------------------
// Degraded fallback
// ---------------------------------------------------------------------------

/** Matches a JSX-style opening or closing tag for the degraded strip step. */
const JSX_TAG = /<\/?[A-Za-z][^>]*>/g;

/**
 * Matches code regions that must survive the degraded JSX-tag strip verbatim:
 * a ```` ```…``` ```` fenced block, a `~~~…~~~` fenced block, or an inline-code
 * span delimited by one or more backticks. Non-code text between matches is the
 * only part that gets JSX tags stripped, so HTML/XML inside code is preserved.
 */
const CODE_REGION = /(```[\s\S]*?```|~~~[\s\S]*?~~~|(`+)[\s\S]*?\2)/g;

/** Matches a leading YAML frontmatter block: `---\n...\n---`. */
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\s*/;

/**
 * Render a page that broke the MDX pipeline using a minimal, resilient path:
 * extract frontmatter by regex, strip JSX-style tags from the body, and run a
 * plain remark→rehype pipeline. This guarantees one bad page never aborts the
 * whole document.
 */
function renderDegraded(source: string): RenderResult {
  const { frontmatter, body } = stripFrontmatter(source);
  const stripped = stripJsxOutsideCode(body);
  let html: string;
  try {
    html = String(
      unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeSlug)
        .use(rehypeStringify, { allowDangerousHtml: true })
        .processSync(stripped)
    );
  } catch {
    // Last-resort: emit the escaped plain text so content is never lost.
    html = `<p>${escapeText(stripped)}</p>`;
  }
  return { html, frontmatter };
}

/**
 * Strip JSX-style tags from prose while leaving code regions untouched.
 *
 * The body is split on fenced (```` ``` ````/`~~~`) and inline (backtick) code
 * regions; `JSX_TAG` is applied only to the text between those regions. This
 * keeps an HTML/XML snippet inside a code fence intact while still removing a
 * stray `<UnclosedTag>` from surrounding prose.
 */
function stripJsxOutsideCode(body: string): string {
  let out = "";
  let lastIndex = 0;
  CODE_REGION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CODE_REGION.exec(body)) !== null) {
    // Strip JSX tags from the prose preceding this code region.
    out += body.slice(lastIndex, match.index).replace(JSX_TAG, "");
    // Keep the code region verbatim.
    out += match[0];
    lastIndex = match.index + match[0].length;
  }
  // Strip JSX tags from the trailing prose after the last code region.
  out += body.slice(lastIndex).replace(JSX_TAG, "");
  return out;
}

/** Extract a leading YAML frontmatter block via regex; return it parsed plus the remaining body. */
function stripFrontmatter(source: string): { frontmatter: PageFrontmatter; body: string } {
  const match = FRONTMATTER_BLOCK.exec(source);
  if (!match) return { frontmatter: {}, body: source };
  let frontmatter: PageFrontmatter = {};
  try {
    const parsed = yaml.load(match[1]);
    if (parsed && typeof parsed === "object") frontmatter = parsed as PageFrontmatter;
  } catch {
    // Ignore malformed frontmatter in the fallback path.
  }
  return { frontmatter, body: source.slice(match[0].length) };
}

/** Minimal HTML text escaping for the last-resort fallback. */
function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
