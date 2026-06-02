import { describe, it, expect } from "vitest";
import { demoteHeadings, pageAnchorId, assembleDocument, assignAnchors, buildLinkTargets, rewriteCrossLinks } from "../../src/assemble/assemble.js";

describe("demoteHeadings", () => {
  it("shifts heading levels down by the given amount", () => {
    expect(demoteHeadings("<h1>A</h1><h2>B</h2>", 1)).toBe("<h2>A</h2><h3>B</h3>");
  });
  it("caps at h6", () => {
    expect(demoteHeadings("<h5>A</h5><h6>B</h6>", 2)).toBe("<h6>A</h6><h6>B</h6>");
  });
  it("leaves non-heading elements untouched", () => {
    expect(demoteHeadings("<p>x</p>", 1)).toBe("<p>x</p>");
  });
});

describe("pageAnchorId", () => {
  it("produces a stable slug from a file path", () => {
    expect(pageAnchorId("guides/workflows.md")).toBe("guides-workflows-md");
    expect(pageAnchorId("intro.md")).toBe("intro-md");
  });
});

import { assembleBody, renderCover } from "../../src/assemble/assemble.js";
import type { Tree } from "../../src/resolve/tree.js";


describe("assembleBody", () => {
  const tree: Tree = [
    { type: "section", title: "Guides", children: [
      { type: "page", file: "guides/intro.md", title: "Intro" }
    ]}
  ];
  const rendered = new Map([["guides/intro.md", "<h1>Heading in page</h1><p>body</p>"]]);

  it("emits the section heading at the section's depth level", () => {
    // Top-level (depth-0) section also carries chapter-start.
    expect(assembleBody(tree, rendered)).toContain('<h1 class="chapter-heading chapter-start chapter-landing-title" id="quire-section-1">Guides</h1>');
  });

  it("gives the section heading a quire-section-N id for PDF outline navigation", () => {
    const html = assembleBody(tree, rendered);
    expect(html).toMatch(/id="quire-section-\d+"/);
    expect(html).toContain('<h1 class="chapter-heading chapter-start chapter-landing-title" id="quire-section-1">Guides</h1>');
  });
  it("wraps each page in a section and puts the anchor id on the page heading", () => {
    const html = assembleBody(tree, rendered);
    // Anchor id is on the heading, not the <section> wrapper (so pagedjs can
    // build working PDF outline destinations from it).
    expect(html).toContain('id="guides-intro-md">Intro</h2>');
    expect(html).not.toContain('<section id="guides-intro-md">');
    expect(html).toContain("<section>");                // wrapper still present, just no id
    expect(html).toContain("<h3>Heading in page</h3>"); // page content h1 demoted by 2 -> h3
  });

  it("marks the depth-0 section heading with chapter-start so it breaks to a new page", () => {
    const html = assembleBody(tree, rendered);
    // The top-level section heading carries BOTH chapter-heading (running header
    // named string) and chapter-start (page break before).
    expect(html).toContain('<h1 class="chapter-heading chapter-start chapter-landing-title" id="quire-section-1">Guides</h1>');
    // The nested page-title heading (depth 1) must NOT carry chapter-start; it
    // carries page-start (break only, so the running header keeps the chapter).
    expect(html).not.toContain('chapter-start" id="guides-intro-md"');
    expect(html).toContain('<h2 class="chapter-heading page-start" id="guides-intro-md">Intro</h2>');
  });
});

describe("assembleBody chapter-start on flat page lists", () => {
  it("marks a depth-0 page heading with chapter-start when the manifest is a flat page list", () => {
    const tree: Tree = [
      { type: "page", file: "a.md", title: "A" },
      { type: "page", file: "b.md", title: "B" },
    ];
    const rendered = new Map([
      ["a.md", "<p>body a</p>"],
      ["b.md", "<p>body b</p>"],
    ]);
    const html = assembleBody(tree, rendered);
    // Both top-level pages are depth-0 chapters.
    expect(html).toContain('<h1 class="chapter-heading chapter-start" id="a-md">A</h1>');
    expect(html).toContain('<h1 class="chapter-heading chapter-start" id="b-md">B</h1>');
  });

  it("does not mark a nested page heading inside a section with chapter-start", () => {
    const tree: Tree = [
      {
        type: "section",
        title: "Sec",
        children: [{ type: "page", file: "a.md", title: "A" }],
      },
    ];
    const rendered = new Map([["a.md", "<p>body</p>"]]);
    const html = assembleBody(tree, rendered);
    // The section (depth 0) is the chapter (chapter-start); the page (depth 1)
    // gets page-start (break only), not chapter-start.
    expect(html).toContain('<h1 class="chapter-heading chapter-start chapter-landing-title" id="quire-section-1">Sec</h1>');
    expect(html).toContain('<h2 class="chapter-heading page-start" id="a-md">A</h2>');
    expect(html).not.toContain('chapter-start" id="a-md"');
  });
});

describe("renderCover", () => {
  it("renders a cover section with the title", () => {
    expect(renderCover({ title: "My Doc" })).toContain('class="cover"');
    expect(renderCover({ title: "My Doc" })).toContain("My Doc");
  });

  it("renders the brand spine, main column, and hero block (PDF)", () => {
    const html = renderCover({ title: "My Doc" });
    expect(html).toContain('<div class="cover-spine">');
    expect(html).toContain('<div class="cover-main">');
    expect(html).toContain('<div class="cover-hero">');
  });

  it("puts id=\"quire-cover\" on the cover h1 so the PDF outline can navigate to it", () => {
    const html = renderCover({ title: "My Doc" });
    // The id must be on the h1, not just somewhere in the output.
    expect(html).toContain('<h1 class="doc-title" id="quire-cover">');
  });

  it("renders the kicker and a single meta line holding version and date (PDF)", () => {
    const html = renderCover({
      title: "My Doc",
      productName: "Documentation",
      version: "1.2.3",
      date: "2026-05-25",
    });
    expect(html).toMatch(/class="cover-product"[^>]*>Documentation</);
    expect(html).toMatch(/class="cover-meta"/);
    expect(html).toMatch(/class="cover-version"[^>]*>1\.2\.3</);
    expect(html).toMatch(/class="cover-date"[^>]*>2026-05-25</);
    // version and date share one line, separated by a middot.
    expect(html).toContain('class="cover-sep"');
  });

  it("always renders the blue rule under the title (PDF)", () => {
    expect(renderCover({ title: "My Doc" })).toContain('<div class="cover-rule">');
  });

  it("renders the footer URL when given and omits it otherwise (PDF)", () => {
    expect(renderCover({ title: "My Doc", url: "docs.dify.ai" })).toMatch(
      /class="cover-footer"[^>]*>docs\.dify\.ai</
    );
    expect(renderCover({ title: "My Doc" })).not.toContain("cover-footer");
  });

  it("omits the kicker and meta line when those fields are absent or blank", () => {
    const html = renderCover({ title: "My Doc", productName: "  ", version: "" });
    expect(html).not.toContain("cover-product");
    expect(html).not.toContain("cover-meta");
  });

  it("embeds the logo image when a data URI is given", () => {
    const html = renderCover({ title: "My Doc", logoDataUri: "data:image/png;base64,AAA" });
    expect(html).toMatch(/class="cover-logo"/);
    expect(html).toContain('src="data:image/png;base64,AAA"');
  });

  it("escapes the title", () => {
    expect(renderCover({ title: "A & B <x>" })).toContain("A &amp; B &lt;x&gt;");
  });

  it("for Word: each present element is its own custom-style paragraph, not an h1, with no spine", () => {
    const html = renderCover({
      title: "My Doc",
      productName: "Documentation",
      version: "v1.2.3",
      date: "2026-05-25",
      logoDataUri: "data:image/png;base64,AAA",
      url: "docs.dify.ai",
      forWord: true,
    });
    // The title is a styled paragraph, never an h1 (an h1 would pollute the
    // Word TOC and the running-header STYLEREF).
    expect(html).not.toContain("<h1");
    expect(html).toContain('class="cover-title"');
    // The brand spine is PDF-only; Word gets the typographic layout.
    expect(html).not.toContain("cover-spine");
    // The logo carries a width ATTRIBUTE (Pandoc honors this, not inline style)
    // so Word does not embed it at full size.
    expect(html).toContain('width="44mm"');
    // Each element carries its OWN custom-style so Word can style them distinctly.
    expect(html).toContain('custom-style="Quire Cover Logo"');
    expect(html).toContain('custom-style="Quire Cover Product"');
    expect(html).toContain('custom-style="Quire Cover Title"');
    expect(html).toContain('custom-style="Quire Cover Meta"');
    expect(html).toContain('custom-style="Quire Cover Footer"');
    // version and date collapse into one meta paragraph, joined by a middot.
    expect(html).toMatch(/Quire Cover Meta"><p>v1\.2\.3 · 2026-05-25<\/p>/);
    // No bare shared wrapper style.
    expect(html).not.toMatch(/custom-style="Quire Cover"/);
  });

  it("for Word: emits a per-element style only for the fields that are present", () => {
    const html = renderCover({ title: "My Doc", forWord: true });
    expect(html).toContain('custom-style="Quire Cover Title"');
    expect(html).not.toContain("Quire Cover Logo");
    expect(html).not.toContain("Quire Cover Product");
    expect(html).not.toContain("Quire Cover Meta");
    expect(html).not.toContain("Quire Cover Footer");
  });
});

describe("renderCover layout and logoWidth (T3.2)", () => {
  it("renderCover PDF shows the spine for layout spine and omits it for plain", () => {
    expect(renderCover({ title: "T", layout: "spine" })).toContain('<div class="cover-spine"></div>');
    const plain = renderCover({ title: "T", layout: "plain" });
    expect(plain).not.toContain("cover-spine");
    expect(plain).toContain('class="cover-main"');
    expect(renderCover({ title: "T" })).toContain('<div class="cover-spine"></div>'); // default = spine
  });
  it("renderCover Word logo width follows logoWidth", () => {
    const data = "data:image/png;base64,AAA";
    expect(renderCover({ title: "T", forWord: true, logoDataUri: data, logoWidth: "30mm" })).toContain('width="30mm"');
    expect(renderCover({ title: "T", forWord: true, logoDataUri: data })).toContain('width="44mm"'); // default
  });
});

describe("assembleDocument", () => {
  const tree: Tree = [{ type: "page", file: "x.md", title: "X" }];
  const rendered = new Map([["x.md", "<p>body</p>"]]);

  it("includes a cover with the title when cover is true", () => {
    const html = assembleDocument(tree, rendered, { title: "My Title", cover: true });
    expect(html).toContain('class="cover"');
    expect(html).toContain("<title>My Title</title>");
    expect(html).toContain("My Title");
    expect(html).toContain('id="quire-cover"');
  });

  it("omits the cover when cover is false", () => {
    const html = assembleDocument(tree, rendered, { title: "My Title", cover: false });
    expect(html).not.toContain('class="cover"');
    expect(html).toContain("<title>My Title</title>"); // title still in <head>
  });

  it("wraps the body in a .doc-body container (the PDF page-counter reset hook)", () => {
    const html = assembleDocument(tree, rendered, { title: "My Title", cover: true });
    expect(html).toContain('<div class="doc-body">');
    expect(html).toContain("<p>body</p>"); // page content lives inside the wrapper
  });

  it("injects the footer-note running element (with a clickable link) as the first child of .doc-body", () => {
    const html = assembleDocument(tree, rendered, {
      title: "My Title",
      cover: true,
      footerNote: { text: "See docs.example.com", url: "https://docs.example.com" },
    });
    // First child of .doc-body so Paged.js binds it to the body pages; the first-chapter
    // break is cancelled in CSS so this leading element does not insert a blank page.
    expect(html).toContain('<div class="doc-body"><div class="footer-note"><a href="https://docs.example.com">See docs.example.com</a></div>');
  });

  it("renders the footer note as plain text when no url is given", () => {
    const html = assembleDocument(tree, rendered, {
      title: "My Title",
      cover: true,
      footerNote: { text: "Snapshot copy" },
    });
    expect(html).toContain('<div class="footer-note">Snapshot copy</div>');
    expect(html).not.toContain("<a href");
  });

  it("omits the footer-note element when footerNote is absent or its text is empty", () => {
    // Check for the ELEMENT specifically: the default stylesheet always contains
    // `.footer-note` selectors, so a bare "footer-note" substring would false-positive.
    const none = assembleDocument(tree, rendered, { title: "My Title", cover: true });
    expect(none).not.toContain('class="footer-note"');
    const empty = assembleDocument(tree, rendered, { title: "My Title", cover: true, footerNote: { text: "  ", url: "x" } });
    expect(empty).not.toContain('class="footer-note"');
  });
});

describe("assignAnchors", () => {
  it("disambiguates files that slugify to the same id", () => {
    const tree: Tree = [
      { type: "page", file: "a/x.md" },
      { type: "page", file: "a-x.md" }
    ];
    const anchors = assignAnchors(tree);
    expect(anchors.get("a/x.md")).toBe("a-x-md");
    expect(anchors.get("a-x.md")).toBe("a-x-md-2");
  });
});

describe("buildLinkTargets", () => {
  it("maps each page's normalized key (extension stripped) to its anchor", () => {
    const tree: Tree = [
      { type: "page", file: "guides/intro.md" },
      { type: "page", file: "guides/other.mdx" },
    ];
    const anchors = assignAnchors(tree);
    const targets = buildLinkTargets(tree, anchors);
    expect(targets.get("guides/intro")).toBe(anchors.get("guides/intro.md"));
    expect(targets.get("guides/other")).toBe(anchors.get("guides/other.mdx"));
  });

  it("strips .MDX extension case-insensitively", () => {
    const tree: Tree = [{ type: "page", file: "guide.MDX" }];
    const anchors = assignAnchors(tree);
    const targets = buildLinkTargets(tree, anchors);
    expect(targets.get("guide")).toBe(anchors.get("guide.MDX"));
  });

  it("first page wins when two pages normalize to the same key", () => {
    // "./a.md" and "a.md" both normalize to key "a" via posix.normalize + extension strip.
    // The collision guard must not throw, and the first entry must win.
    const tree: Tree = [
      { type: "page", file: "./a.md" },  // linkKey → "a"
      { type: "page", file: "a.md" },    // linkKey → "a"  (collision)
    ];
    const anchors = assignAnchors(tree);
    // Must not throw
    const targets = buildLinkTargets(tree, anchors);
    // Key "a" must be present
    expect(targets.has("a")).toBe(true);
    // The first page's anchor must win
    expect(targets.get("a")).toBe(anchors.get("./a.md"));
    // The second page's anchor must NOT be the winner
    expect(targets.get("a")).not.toBe(anchors.get("a.md"));
  });
});

describe("rewriteCrossLinks", () => {
  // Helper: build a two-page tree with deterministic anchors.
  const tree: Tree = [
    { type: "page", file: "a.md" },
    { type: "page", file: "guides/b.md" },
  ];
  const anchors = assignAnchors(tree);         // a-md, guides-b-md
  const targets = buildLinkTargets(tree, anchors);

  it("rewrites a relative .md link to an included page", () => {
    const html = `<p><a href="guides/b.md">B</a></p>`;
    const result = rewriteCrossLinks(html, "a.md", targets);
    expect(result).toContain(`href="#guides-b-md"`);
  });

  it("rewrites an extensionless relative link when the target key matches", () => {
    const html = `<p><a href="guides/b">B</a></p>`;
    const result = rewriteCrossLinks(html, "a.md", targets);
    expect(result).toContain(`href="#guides-b-md"`);
  });

  it("resolves ../ paths correctly across directories", () => {
    // from guides/b.md, linking to ../a.md should resolve to a.md -> a-md
    const html = `<p><a href="../a.md">A</a></p>`;
    const result = rewriteCrossLinks(html, "guides/b.md", targets);
    expect(result).toContain(`href="#a-md"`);
  });

  it("leaves http:// links unchanged", () => {
    const html = `<a href="http://example.com/page.md">x</a>`;
    expect(rewriteCrossLinks(html, "a.md", targets)).toContain(`href="http://example.com/page.md"`);
  });

  it("leaves https:// links unchanged", () => {
    const html = `<a href="https://example.com">x</a>`;
    expect(rewriteCrossLinks(html, "a.md", targets)).toContain(`href="https://example.com"`);
  });

  it("leaves mailto: links unchanged", () => {
    const html = `<a href="mailto:user@example.com">x</a>`;
    expect(rewriteCrossLinks(html, "a.md", targets)).toContain(`href="mailto:user@example.com"`);
  });

  it("leaves protocol-relative //cdn... links unchanged", () => {
    const html = `<a href="//cdn.example.com/asset.js">x</a>`;
    expect(rewriteCrossLinks(html, "a.md", targets)).toContain(`href="//cdn.example.com/asset.js"`);
  });

  it("leaves pure-fragment #foo links unchanged", () => {
    const html = `<a href="#section">x</a>`;
    expect(rewriteCrossLinks(html, "a.md", targets)).toContain(`href="#section"`);
  });

  it("leaves site-absolute /foo/bar links unchanged", () => {
    const html = `<a href="/use-dify/guides/b">x</a>`;
    expect(rewriteCrossLinks(html, "a.md", targets)).toContain(`href="/use-dify/guides/b"`);
  });

  it("leaves relative links to NON-included pages unchanged", () => {
    const html = `<a href="notincluded.md">x</a>`;
    expect(rewriteCrossLinks(html, "a.md", targets)).toContain(`href="notincluded.md"`);
  });

  it("drops the original fragment when rewriting (b.md#section -> #anchor-of-b)", () => {
    const html = `<a href="guides/b.md#some-section">B</a>`;
    const result = rewriteCrossLinks(html, "a.md", targets);
    expect(result).toContain(`href="#guides-b-md"`);
    expect(result).not.toContain("some-section");
  });

  it("leaves a relative .md link unchanged when targets map is empty", () => {
    const html = `<a href="other.md">Other</a>`;
    expect(rewriteCrossLinks(html, "a.md", new Map())).toContain(`href="other.md"`);
  });
});

describe("rewriteCrossLinks site-absolute resolution", () => {
  // Manifests usually carry absolute (or site-rooted) file paths, while in-content
  // links are written site-absolute (e.g. /en/develop-plugin/.../tool-plugin).
  // A site-absolute link resolves to a bundled page when that page's file path
  // ENDS WITH the site path (the site path is the page's tail after the site root).
  const tree: Tree = [
    { type: "page", file: "/repo/en/develop-plugin/dev-guides/tool-plugin.mdx" },
    { type: "page", file: "/repo/en/develop-plugin/getting-started/cli.mdx" },
  ];
  const anchors = assignAnchors(tree);
  const targets = buildLinkTargets(tree, anchors);

  it("rewrites a site-absolute link to a bundled page by suffix match", () => {
    const html = `<a href="/en/develop-plugin/dev-guides/tool-plugin">Learn more</a>`;
    const result = rewriteCrossLinks(html, "/repo/en/develop-plugin/getting-started/cli.mdx", targets);
    const anchor = anchors.get("/repo/en/develop-plugin/dev-guides/tool-plugin.mdx");
    expect(result).toContain(`href="#${anchor}"`);
  });

  it("drops the fragment when rewriting a site-absolute link", () => {
    const html = `<a href="/en/develop-plugin/dev-guides/tool-plugin#install">x</a>`;
    const result = rewriteCrossLinks(html, "/repo/en/develop-plugin/getting-started/cli.mdx", targets);
    expect(result).not.toContain("install");
  });

  it("leaves a site-absolute link to a non-bundled page unchanged", () => {
    const html = `<a href="/en/use-dify/workflow/overview">x</a>`;
    const result = rewriteCrossLinks(html, "/repo/en/develop-plugin/getting-started/cli.mdx", targets);
    expect(result).toContain(`href="/en/use-dify/workflow/overview"`);
  });

  it("leaves an ambiguous site-absolute link unchanged (two pages share the suffix)", () => {
    const ambiguous: Tree = [
      { type: "page", file: "/a/en/foo/bar.mdx" },
      { type: "page", file: "/b/en/foo/bar.mdx" },
    ];
    const ambAnchors = assignAnchors(ambiguous);
    const ambTargets = buildLinkTargets(ambiguous, ambAnchors);
    const html = `<a href="/en/foo/bar">x</a>`;
    const result = rewriteCrossLinks(html, "/a/en/foo/bar.mdx", ambTargets);
    expect(result).toContain(`href="/en/foo/bar"`);
  });
});

describe("rewriteCrossLinks with baseUrl", () => {
  // Same bundle as the site-absolute suffix tests: one bundled page, plus
  // out-of-bundle site-absolute links that only baseUrl can resolve.
  const tree: Tree = [
    { type: "page", file: "/repo/en/develop-plugin/dev-guides/tool-plugin.mdx" },
  ];
  const anchors = assignAnchors(tree);
  const targets = buildLinkTargets(tree, anchors);
  const from = "/repo/en/develop-plugin/dev-guides/tool-plugin.mdx";

  it("rewrites an out-of-bundle site-absolute link to an absolute URL", () => {
    const html = `<a href="/en/use-dify/workflow/overview">x</a>`;
    const result = rewriteCrossLinks(html, from, targets, "https://docs.dify.ai");
    expect(result).toContain(`href="https://docs.dify.ai/en/use-dify/workflow/overview"`);
  });

  it("preserves the fragment of an out-of-bundle link when joining baseUrl", () => {
    const html = `<a href="/en/use-dify/workflow/overview#triggers">x</a>`;
    const result = rewriteCrossLinks(html, from, targets, "https://docs.dify.ai");
    expect(result).toContain(`href="https://docs.dify.ai/en/use-dify/workflow/overview#triggers"`);
  });

  it("strips a trailing slash from baseUrl so the join has no double slash", () => {
    const html = `<a href="/en/use-dify/workflow/overview">x</a>`;
    const result = rewriteCrossLinks(html, from, targets, "https://docs.dify.ai/");
    expect(result).toContain(`href="https://docs.dify.ai/en/use-dify/workflow/overview"`);
  });

  it("still prefers an in-bundle anchor over baseUrl", () => {
    const html = `<a href="/en/develop-plugin/dev-guides/tool-plugin">x</a>`;
    const result = rewriteCrossLinks(html, from, targets, "https://docs.dify.ai");
    const anchor = anchors.get("/repo/en/develop-plugin/dev-guides/tool-plugin.mdx");
    expect(result).toContain(`href="#${anchor}"`);
    expect(result).not.toContain("docs.dify.ai");
  });

  it("leaves relative out-of-bundle links untouched even when baseUrl is set", () => {
    // baseUrl only rebuilds site-absolute paths; a bare relative link has no
    // site path to append, so it stays as-is.
    const html = `<a href="../other/page.md">x</a>`;
    const result = rewriteCrossLinks(html, from, targets, "https://docs.dify.ai");
    expect(result).toContain(`href="../other/page.md"`);
  });
});

describe("assembleDocument with toc option", () => {
  const tree: Tree = [{ type: "page", file: "x.md", title: "X" }];
  const rendered = new Map([["x.md", "<p>body</p>"]]);

  it("includes the toc nav when toc is true", () => {
    const html = assembleDocument(tree, rendered, { title: "My Title", cover: true, toc: true });
    expect(html).toContain('<nav class="toc">');
  });

  it("does not include the toc nav when toc is omitted (default false)", () => {
    const html = assembleDocument(tree, rendered, { title: "My Title", cover: true });
    expect(html).not.toContain('<nav class="toc">');
  });

  it("does not include the toc nav when toc is false", () => {
    const html = assembleDocument(tree, rendered, { title: "My Title", cover: true, toc: false });
    expect(html).not.toContain('<nav class="toc">');
  });
});

describe("assembleDocument tocTitle option", () => {
  const tree: Tree = [{ type: "page", file: "x.md", title: "X" }];
  const rendered = new Map([["x.md", "<p>body</p>"]]);

  it("passes tocTitle to buildToc when toc is true", () => {
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: true,
      toc: true,
      tocTitle: "Sommaire",
    });
    expect(html).toContain('<h2 class="toc-title" id="quire-toc">Sommaire</h2>');
  });

  it("uses default 'Contents' when tocTitle is omitted", () => {
    const html = assembleDocument(tree, rendered, { title: "Doc", cover: true, toc: true });
    expect(html).toContain('<h2 class="toc-title" id="quire-toc">Contents</h2>');
  });
});

describe("assembleDocument with showDescription option", () => {
  it("emits .page-description after the page title heading when showDescription is true and the page has a description", () => {
    const tree: Tree = [
      { type: "page", file: "a.md", title: "Alpha", description: "A short intro." },
    ];
    const rendered = new Map([["a.md", "<p>body</p>"]]);
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: false,
      showDescription: true,
    });
    // The lede must appear immediately after the page-title heading. It is a
    // <div> carrying custom-style so Pandoc maps it to the Word "Page
    // Description" style (a Para cannot hold the attribute); the class still
    // drives the PDF.
    expect(html).toContain(
      '<div class="page-description" custom-style="Page Description">A short intro.</div>'
    );
    // It must come after the heading, not before
    const headingPos = html.indexOf('<h1 class="chapter-heading chapter-start" id="a-md">Alpha</h1>');
    const ledePos = html.indexOf('class="page-description"');
    expect(headingPos).toBeGreaterThanOrEqual(0);
    expect(ledePos).toBeGreaterThan(headingPos);
  });

  it("flattens Markdown link syntax in the description to plain link text (no URL or brackets)", () => {
    // Some `description` frontmatter contains Markdown links. The lede is emitted
    // as escaped plain text, so without flattening the raw "[text](/path)" would
    // show verbatim, exposing a file path the reader can neither click nor use.
    const tree: Tree = [
      {
        type: "page",
        file: "a.md",
        title: "Alpha",
        description: "See [Basic Concepts](/en/develop-plugin/getting-started/x) for more.",
      },
    ];
    const rendered = new Map([["a.md", "<p>body</p>"]]);
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: false,
      showDescription: true,
    });
    expect(html).toContain(
      '<div class="page-description" custom-style="Page Description">See Basic Concepts for more.</div>'
    );
    expect(html).not.toContain("/en/develop-plugin");
    expect(html).not.toContain("[Basic Concepts]");
  });

  it("does NOT emit .page-description when showDescription is false", () => {
    const tree: Tree = [
      { type: "page", file: "a.md", title: "Alpha", description: "A short intro." },
    ];
    const rendered = new Map([["a.md", "<p>body</p>"]]);
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: false,
      showDescription: false,
    });
    expect(html).not.toContain('class="page-description"');
  });

  it("does NOT emit .page-description when the page has no description even if showDescription is true", () => {
    const tree: Tree = [
      { type: "page", file: "a.md", title: "Alpha" },
    ];
    const rendered = new Map([["a.md", "<p>body</p>"]]);
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: false,
      showDescription: true,
    });
    expect(html).not.toContain('class="page-description"');
  });

  it("HTML-escapes the description to prevent XSS", () => {
    const tree: Tree = [
      { type: "page", file: "a.md", title: "Alpha", description: '<script>alert("xss")</script>' },
    ];
    const rendered = new Map([["a.md", "<p>body</p>"]]);
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: false,
      showDescription: true,
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does NOT emit .page-description for section nodes (sections have no description)", () => {
    const tree: Tree = [
      {
        type: "section",
        title: "My Section",
        children: [{ type: "page", file: "a.md", title: "Alpha" }],
      },
    ];
    const rendered = new Map([["a.md", "<p>body</p>"]]);
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: false,
      showDescription: true,
    });
    expect(html).not.toContain('class="page-description"');
  });

  it("omitting showDescription from options produces no .page-description (backward-compat)", () => {
    const tree: Tree = [
      { type: "page", file: "a.md", title: "Alpha", description: "Some desc." },
    ];
    const rendered = new Map([["a.md", "<p>body</p>"]]);
    const html = assembleDocument(tree, rendered, { title: "Doc", cover: false });
    expect(html).not.toContain('class="page-description"');
  });
});

describe("assembleBody id de-duplication across pages", () => {
  it("suffixes a content-heading id that collides across two pages", () => {
    // rehype-slug dedupes only within a page, so both pages emit id="summary".
    // Combined, the second occurrence must be uniquified so target-counter and
    // in-document links resolve to the correct element.
    const tree: Tree = [
      { type: "page", file: "a.md", title: "A" },
      { type: "page", file: "b.md", title: "B" },
    ];
    const rendered = new Map([
      ["a.md", `<h2 id="summary">Summary A</h2>`],
      ["b.md", `<h2 id="summary">Summary B</h2>`],
    ]);
    const html = assembleBody(tree, rendered);
    // First occurrence keeps the original id; second gets a -2 suffix.
    expect(html).toContain('id="summary"');
    expect(html).toContain('id="summary-2"');
    // Both heading texts survive.
    expect(html).toContain("Summary A");
    expect(html).toContain("Summary B");
  });

  it("leaves unique structural ids untouched", () => {
    const tree: Tree = [
      { type: "section", title: "Sec", children: [{ type: "page", file: "a.md", title: "A" }] },
    ];
    const rendered = new Map([["a.md", `<p>body</p>`]]);
    const html = assembleBody(tree, rendered);
    expect(html).toContain('id="quire-section-1"');
    expect(html).toContain('id="a-md"');
    // No spurious -2 suffix on unique ids.
    expect(html).not.toContain('id="quire-section-1-2"');
    expect(html).not.toContain('id="a-md-2"');
  });
});

describe("assembleBody cross-link integration", () => {
  it("rewrites cross-links in a two-page tree", () => {
    const tree: Tree = [
      { type: "page", file: "a.md", title: "A" },
      { type: "page", file: "b.md", title: "B" },
    ];
    const rendered = new Map([
      ["a.md", `<p><a href="b.md">Go to B</a></p>`],
      ["b.md", `<p>B content</p>`],
    ]);
    const html = assembleBody(tree, rendered);

    // b.md's section anchor
    const anchors = assignAnchors(tree);
    const bAnchor = anchors.get("b.md")!;   // "b-md"

    // The anchor must be on the heading, not the <section> wrapper. b.md is a
    // top-level (depth-0) page, so it also carries chapter-start.
    expect(html).toContain(`<h1 class="chapter-heading chapter-start" id="${bAnchor}">`);
    expect(html).not.toContain(`<section id="${bAnchor}">`);

    // The cross-link in a.md must point at b's anchor
    expect(html).toContain(`href="#${bAnchor}"`);
  });

  it("rebuilds out-of-bundle site-absolute links onto baseUrl when set", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "A" }];
    const rendered = new Map([
      ["a.md", `<p><a href="/en/use-dify/workflow/overview">WF</a></p>`],
    ]);
    const html = assembleBody(tree, rendered, undefined, "https://docs.dify.ai");
    expect(html).toContain(`href="https://docs.dify.ai/en/use-dify/workflow/overview"`);
  });
});

describe("assembleDocument with baseUrl option", () => {
  it("rebuilds out-of-bundle site-absolute links onto baseUrl", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "A" }];
    const rendered = new Map([
      ["a.md", `<p><a href="/en/use-dify/workflow/overview">WF</a></p>`],
    ]);
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: false,
      baseUrl: "https://docs.dify.ai",
    });
    expect(html).toContain(`href="https://docs.dify.ai/en/use-dify/workflow/overview"`);
  });
});

describe("assembleDocument structural TOC", () => {
  it("shows the full page/section hierarchy, including deeply nested pages", () => {
    const tree: Tree = [
      {
        type: "section",
        title: "Build",
        children: [
          {
            type: "section",
            title: "Nodes",
            children: [{ type: "page", file: "llm.md", title: "LLM" }],
          },
        ],
      },
    ];
    const rendered = new Map([["llm.md", "<p>body</p>"]]);
    const html = assembleDocument(tree, rendered, { title: "Doc", cover: false, toc: true });
    // Build (tier 1), Nodes (tier 2), and the LLM page (tier 3) all appear, even
    // though the page sits three tree-levels deep — no depth cap on the PDF TOC.
    expect(html).toContain('class="toc-entry toc-level-1"');
    expect(html).toContain('class="toc-entry toc-level-2"');
    expect(html).toContain('class="toc-entry toc-level-3"');
    expect(html).toContain(">LLM<");
  });

  it("excludes a page's internal content headings from the TOC", () => {
    const tree: Tree = [{ type: "page", file: "p.md", title: "Page" }];
    const rendered = new Map([["p.md", '<h2 id="internal-bit">Internal Bit</h2><p>body</p>']]);
    const html = assembleDocument(tree, rendered, { title: "Doc", cover: false, toc: true });
    // The page is in the TOC; its in-page heading is not linked from the TOC.
    const nav = html.match(/<nav class="toc">[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(nav).toContain('href="#p-md"');
    expect(nav).not.toContain('href="#internal-bit"');
    expect(nav).not.toContain("Internal Bit");
  });
});

describe("assembleBody chapter landing page", () => {
  it("indexes a chapter's contents two levels deep, but not a third", () => {
    const tree: Tree = [
      {
        type: "section",
        title: "Build",
        children: [
          {
            type: "section",
            title: "Nodes",
            children: [
              { type: "page", file: "user-input.md", title: "User Input" },
              { type: "section", title: "Trigger", children: [{ type: "page", file: "overview.md", title: "Trigger Overview" }] },
            ],
          },
        ],
      },
    ];
    const rendered = new Map([["user-input.md", "<p>a</p>"], ["overview.md", "<p>b</p>"]]);
    const html = assembleBody(tree, rendered);
    expect(html).toContain('<nav class="chapter-contents">');
    const nav = html.match(/<nav class="chapter-contents">[\s\S]*?<\/nav>/)?.[0] ?? "";
    // Level 1 (Nodes) and level 2 (Nodes' children: User Input, Trigger) appear...
    expect(nav).toContain('class="cc-level-1"');
    expect(nav).toContain('class="cc-level-2"');
    expect(nav).toContain("Nodes");
    expect(nav).toContain("User Input");
    expect(nav).toContain("Trigger");
    // ...but the third level (Trigger's own page) does not.
    expect(nav).not.toContain("Trigger Overview");
    expect(nav).not.toContain("cc-level-3");
  });

  it("gives the top-level chapter title the landing-title class (for the kicker) and breaks depth-1, not depth>=2", () => {
    const tree: Tree = [
      {
        type: "section",
        title: "Build",
        children: [
          { type: "section", title: "Nodes", children: [{ type: "page", file: "llm.md", title: "LLM" }] },
        ],
      },
    ];
    const rendered = new Map([["llm.md", "<p>a</p>"]]);
    const html = assembleBody(tree, rendered);
    expect(html).toContain('<h1 class="chapter-heading chapter-start chapter-landing-title" id="quire-section-1">Build</h1>');
    expect(html).toContain('<h2 class="chapter-heading page-start" id="quire-section-2">Nodes</h2>');
    expect(html).toContain('<h3 class="chapter-heading" id="llm-md">LLM</h3>');
  });
});
