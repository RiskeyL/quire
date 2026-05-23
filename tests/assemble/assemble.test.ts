import { describe, it, expect } from "vitest";
import { demoteHeadings, pageAnchorId, assembleDocument, assignAnchors } from "../../src/assemble/assemble.js";

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
    expect(assembleBody(tree, rendered)).toContain("<h1>Guides</h1>");
  });
  it("wraps each page in an anchored section with a demoted heading", () => {
    const html = assembleBody(tree, rendered);
    expect(html).toContain('<section id="guides-intro-md">');
    expect(html).toContain("<h2>Intro</h2>");           // page title at depth 1 -> h2
    expect(html).toContain("<h3>Heading in page</h3>"); // page content h1 demoted by 2 -> h3
  });
});

describe("renderCover", () => {
  it("renders a cover section with the title", () => {
    expect(renderCover("My Doc")).toContain('class="cover"');
    expect(renderCover("My Doc")).toContain("My Doc");
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
