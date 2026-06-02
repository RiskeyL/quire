import type { ElementContent } from "hast";
import { element, text, getStringAttr, type JsxComponentNode } from "../hast-helpers.js";

/**
 * Lowercase HTML media tags that Quire turns into a static "watch online" placeholder
 * instead of letting them through.
 *
 * Neither output can play embedded media: a raw `<video>` prints as a black player box
 * (Chromium draws its native controls over an unplayable frame) and an `<iframe>` prints
 * as a broken/empty frame. Replacing them with a labeled, clickable link keeps the page
 * useful in print and on screen. Note this only catches LIVE elements — `<iframe>` shown
 * inside a code fence (an embed example) is code, not a JSX element, so it is untouched.
 */
const MEDIA_TAGS = new Set(["video", "iframe"]);

/** True when a lowercase HTML tag should be rendered as a media placeholder. */
export function isMediaTag(name: string): boolean {
  return MEDIA_TAGS.has(name);
}

/**
 * Render a `<video>`/`<iframe>` as a clickable placeholder: a labeled box with a "Watch
 * this video online" link to the media URL (a real, clickable annotation in the PDF; the
 * raw URL is intentionally hidden behind friendly text). The label uses the element's
 * `title` when present, else "Video" for `<video>` and "Embedded content" for `<iframe>`.
 * The URL comes from the element's `src`, or for `<video>` from a nested `<source>`. When
 * no URL resolves, the box is label-only with a short note.
 */
export function renderMediaPlaceholder(node: JsxComponentNode): ElementContent {
  const src = mediaSrc(node);
  const title = getStringAttr(node, "title");
  const label = title ?? (node.name === "video" ? "Video" : "Embedded content");

  const children: ElementContent[] = [
    element("p", { class: "media-embed-label" }, [text(`▶ ${label}`)]),
  ];
  if (src !== undefined) {
    children.push(
      element("a", { class: "media-embed-link", href: src }, [text("Watch this video online")])
    );
  } else {
    children.push(
      element("p", { class: "media-embed-note" }, [
        text("Not available in this document; view the online version."),
      ])
    );
  }
  return element("div", { class: "media-embed" }, children);
}

/** The media URL: the element's own `src`, or a nested `<source>`'s `src` (for `<video>`). */
function mediaSrc(node: JsxComponentNode): string | undefined {
  const own = getStringAttr(node, "src");
  if (own !== undefined) return own;
  for (const child of node.children) {
    if (
      (child.type === "mdxJsxFlowElement" || child.type === "mdxJsxTextElement") &&
      child.name === "source"
    ) {
      const nested = getStringAttr(child as JsxComponentNode, "src");
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}
