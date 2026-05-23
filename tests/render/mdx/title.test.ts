import { describe, it, expect } from "vitest";
import { resolveTitle } from "../../../src/render/mdx/title.js";

describe("resolveTitle", () => {
  it("prefers the manifest title above all else", () => {
    const { title, html } = resolveTitle({
      manifestTitle: "Manifest",
      frontmatter: { title: "Frontmatter" },
      html: "<h1>Body Heading</h1><p>x</p>",
      file: "guides/intro.mdx",
    });
    expect(title).toBe("Manifest");
    // No H1 strip when the title did not come from the body H1.
    expect(html).toContain("<h1>Body Heading</h1>");
  });

  it("falls back to the frontmatter title when there is no manifest title", () => {
    const { title, html } = resolveTitle({
      frontmatter: { title: "Frontmatter" },
      html: "<h1>Body Heading</h1><p>x</p>",
      file: "guides/intro.mdx",
    });
    expect(title).toBe("Frontmatter");
    expect(html).toContain("<h1>Body Heading</h1>");
  });

  it("falls back to the first body H1 and strips it from the HTML", () => {
    const { title, html } = resolveTitle({
      frontmatter: {},
      html: '<h1 id="body-heading">Body Heading</h1><p>keep me</p>',
      file: "guides/intro.mdx",
    });
    expect(title).toBe("Body Heading");
    // The first H1 is removed so it is not duplicated by the page-title heading.
    expect(html).not.toContain("Body Heading");
    expect(html).toContain("keep me");
  });

  it("only strips the FIRST h1 when multiple exist", () => {
    const { title, html } = resolveTitle({
      frontmatter: {},
      html: "<h1>First</h1><p>mid</p><h1>Second</h1>",
      file: "guides/intro.mdx",
    });
    expect(title).toBe("First");
    expect(html).not.toContain("First");
    expect(html).toContain("<h1>Second</h1>");
  });

  it("falls back to the filename basename when nothing else is available", () => {
    const { title, html } = resolveTitle({
      frontmatter: {},
      html: "<p>no heading here</p>",
      file: "guides/getting-started.mdx",
    });
    expect(title).toBe("getting-started");
    // No H1 to strip; HTML is unchanged.
    expect(html).toContain("<p>no heading here</p>");
  });

  it("handles an absolute file path basename", () => {
    const { title } = resolveTitle({
      frontmatter: {},
      html: "<p>x</p>",
      file: "/Users/a47/docs/docker-issues.mdx",
    });
    expect(title).toBe("docker-issues");
  });
});
