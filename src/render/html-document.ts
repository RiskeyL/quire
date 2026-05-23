import { compileCss } from "../theme/compile-css.js";
import { DEFAULT_TOKENS } from "../theme/tokens.js";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_CSS = compileCss(DEFAULT_TOKENS);

/** Wrap an HTML fragment in a complete, styleable HTML document. */
export function wrapHtmlDocument(
  fragment: string,
  title: string,
  css: string = DEFAULT_CSS
): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
${fragment}
</body>
</html>`;
}
