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
    expect(assembleBody(tree, rendered)).toContain('<h1 class="chapter-heading" id="quire-section-1">Guides</h1>');
  });

  it("gives the section heading a quire-section-N id for PDF outline navigation", () => {
    const html = assembleBody(tree, rendered);
    expect(html).toMatch(/id="quire-section-\d+"/);
    expect(html).toContain('<h1 class="chapter-heading" id="quire-section-1">Guides</h1>');
  });
  it("wraps each page in a section and puts the anchor id on the page heading", () => {
    const html = assembleBody(tree, rendered);
    // Anchor id is on the heading, not the <section> wrapper (so pagedjs can
    // build working PDF outline destinations from it).
    expect(html).toContain('<h2 class="chapter-heading" id="guides-intro-md">Intro</h2>');
    expect(html).not.toContain('<section id="guides-intro-md">');
    expect(html).toContain("<section>");                // wrapper still present, just no id
    expect(html).toContain("<h3>Heading in page</h3>"); // page content h1 demoted by 2 -> h3
  });
});

describe("renderCover", () => {
  it("renders a cover section with the title", () => {
    expect(renderCover("My Doc")).toContain('class="cover"');
    expect(renderCover("My Doc")).toContain("My Doc");
  });

  it("puts id=\"quire-cover\" on the cover h1 so the PDF outline can navigate to it", () => {
    expect(renderCover("My Doc")).toContain('id="quire-cover"');
    // The id must be on the h1, not just somewhere in the output.
    expect(renderCover("My Doc")).toContain('<h1 class="doc-title" id="quire-cover">');
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
    // The lede must appear immediately after the page-title heading
    expect(html).toContain('<p class="page-description">A short intro.</p>');
    // It must come after the heading, not before
    const headingPos = html.indexOf('<h1 class="chapter-heading" id="a-md">Alpha</h1>');
    const ledePos = html.indexOf('<p class="page-description">');
    expect(headingPos).toBeGreaterThanOrEqual(0);
    expect(ledePos).toBeGreaterThan(headingPos);
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
    expect(html).not.toContain('<p class="page-description">');
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
    expect(html).not.toContain('<p class="page-description">');
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
    expect(html).not.toContain('<p class="page-description">');
  });

  it("omitting showDescription from options produces no .page-description (backward-compat)", () => {
    const tree: Tree = [
      { type: "page", file: "a.md", title: "Alpha", description: "Some desc." },
    ];
    const rendered = new Map([["a.md", "<p>body</p>"]]);
    const html = assembleDocument(tree, rendered, { title: "Doc", cover: false });
    expect(html).not.toContain('<p class="page-description">');
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

    // The anchor must be on the heading, not the <section> wrapper
    expect(html).toContain(`<h1 class="chapter-heading" id="${bAnchor}">`);
    expect(html).not.toContain(`<section id="${bAnchor}">`);

    // The cross-link in a.md must point at b's anchor
    expect(html).toContain(`href="#${bAnchor}"`);
  });
});
