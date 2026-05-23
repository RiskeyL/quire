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

  /* Cover and TOC each occupy their own page(s). */
  .cover { break-after: page; }
  .toc { break-after: page; }

  /* TOC layout: remove bullets, dot leaders, page numbers via target-counter. */
  .toc ul { list-style: none; padding: 0; margin: 0; }
  .toc li { margin: 0.25em 0; }
  .toc-section > span { font-weight: bold; display: block; margin-top: 0.75em; }
  .toc-page a {
    display: flex;
    align-items: baseline;
    text-decoration: none;
    color: inherit;
  }
  .toc-page a::after {
    content: target-counter(attr(href), page);
    margin-left: auto;
    padding-left: 0.5em;
  }
  .toc-section > ul { padding-left: 1.5em; }
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
