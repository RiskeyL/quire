import { renderMdx } from "./mdx/render-mdx.js";

/**
 * Render a Markdown string to an HTML fragment.
 *
 * @deprecated Use {@link renderMdx} directly. It returns parsed frontmatter
 * alongside the HTML and handles MDX/JSX content. This thin wrapper remains
 * only for callers that need the bare HTML and predates the Milestone 5 MDX
 * pipeline; it discards the frontmatter.
 */
export function renderMarkdownToHtml(markdown: string): string {
  return renderMdx(markdown).html;
}
