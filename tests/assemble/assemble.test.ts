import { describe, it, expect } from "vitest";
import { demoteHeadings, pageAnchorId, assembleDocument, assignAnchors, buildLinkTargets, rewriteCrossLinks, buildToc } from "../../src/assemble/assemble.js";

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
    expect(assembleBody(tree, rendered)).toContain('<h1 id="quire-section-1">Guides</h1>');
  });

  it("gives the section heading a quire-section-N id for PDF outline navigation", () => {
    const html = assembleBody(tree, rendered);
    expect(html).toMatch(/id="quire-section-\d+"/);
    expect(html).toContain('<h1 id="quire-section-1">Guides</h1>');
  });
  it("wraps each page in a section and puts the anchor id on the page heading", () => {
    const html = assembleBody(tree, rendered);
    // Anchor id is on the heading, not the <section> wrapper (so pagedjs can
    // build working PDF outline destinations from it).
    expect(html).toContain('<h2 id="guides-intro-md">Intro</h2>');
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

describe("buildToc", () => {
  it("emits a nav with class toc and an h2 with class toc-title", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "Alpha" }];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors);
    expect(html).toContain('<nav class="toc">');
    expect(html).toContain('<h2 class="toc-title" id="quire-toc">Contents</h2>');
  });

  it("puts id=\"quire-toc\" on the toc-title h2 so the PDF outline can navigate to the TOC", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "Alpha" }];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors);
    expect(html).toContain('id="quire-toc"');
    expect(html).toContain('<h2 class="toc-title" id="quire-toc">');
  });

  it("renders a page as a toc-page li with a link to its anchor", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "Alpha" }];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors);
    const anchor = anchors.get("a.md")!;
    expect(html).toContain(`<li class="toc-page"><a href="#${anchor}">Alpha</a></li>`);
  });

  it("falls back to the filename stem when page has no title", () => {
    const tree: Tree = [{ type: "page", file: "guides/intro.md" }];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors);
    expect(html).toContain(">intro<");
  });

  it("renders a section as a non-linked toc-section label", () => {
    const tree: Tree = [
      {
        type: "section",
        title: "Part One",
        children: [{ type: "page", file: "a.md", title: "Alpha" }],
      },
    ];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors);
    expect(html).toContain('<li class="toc-section">');
    expect(html).toContain("<span>Part One</span>");
    // Must NOT wrap the section title in an anchor
    expect(html).not.toMatch(/<a[^>]*>Part One<\/a>/);
  });

  it("nests a page inside its parent section's child ul", () => {
    const tree: Tree = [
      {
        type: "section",
        title: "Part One",
        children: [{ type: "page", file: "a.md", title: "Alpha" }],
      },
    ];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors);
    // Section li must contain both the span and a nested ul with the page entry.
    const sectionPattern = /<li class="toc-section"><span>Part One<\/span><ul>.*<li class="toc-page">.*<\/li>.*<\/ul><\/li>/s;
    expect(html).toMatch(sectionPattern);
  });

  it("HTML-escapes titles", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "<script>alert(1)</script>" }];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("throws a clear error when a page has no anchor in the map", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "Alpha" }];
    // Deliberately pass an empty map to trigger the error.
    expect(() => buildToc(tree, new Map())).toThrow(/anchor/i);
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

describe("buildToc custom title", () => {
  it("uses the provided title argument as the toc-title text", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "Alpha" }];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors, "Inhalt");
    expect(html).toContain('<h2 class="toc-title" id="quire-toc">Inhalt</h2>');
    expect(html).not.toContain(">Contents<");
  });

  it("defaults to 'Contents' when no title argument is supplied", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "Alpha" }];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors);
    expect(html).toContain('<h2 class="toc-title" id="quire-toc">Contents</h2>');
  });

  it("HTML-escapes the custom title", () => {
    const tree: Tree = [{ type: "page", file: "a.md", title: "Alpha" }];
    const anchors = assignAnchors(tree);
    const html = buildToc(tree, anchors, "<b>Bold</b>");
    expect(html).not.toContain("<b>Bold</b>");
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
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
    expect(html).toContain(`<h1 id="${bAnchor}">`);
    expect(html).not.toContain(`<section id="${bAnchor}">`);

    // The cross-link in a.md must point at b's anchor
    expect(html).toContain(`href="#${bAnchor}"`);
  });
});
