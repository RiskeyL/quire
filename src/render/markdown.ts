import { marked } from "marked";

/**
 * Render a Markdown string to an HTML fragment.
 * This is the Milestone 1 input adapter. It will be replaced by a
 * unified/remark-based MDX adapter in Milestone 5; keep the signature stable.
 */
export function renderMarkdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false });
}
