export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_CSS = `
  @page { size: A4; margin: 2cm; }
  body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; }
  h1, h2, h3 { font-family: Helvetica, Arial, sans-serif; }
  pre, code { font-family: "SFMono-Regular", Consolas, monospace; }
`;

/** Wrap an HTML fragment in a complete, styleable HTML document. */
export function wrapHtmlDocument(fragment: string, title: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${DEFAULT_CSS}</style>
</head>
<body>
${fragment}
</body>
</html>`;
}
