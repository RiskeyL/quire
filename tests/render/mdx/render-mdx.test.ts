import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderMdx } from "../../../src/render/mdx/render-mdx.js";

describe("renderMdx", () => {
  it("parses frontmatter and strips it from the body", () => {
    const source = "---\ntitle: My Page\ndescription: A lede\n---\n\n# Body\n\ntext";
    const { html, frontmatter } = renderMdx(source);
    expect(frontmatter.title).toBe("My Page");
    expect(frontmatter.description).toBe("A lede");
    // Body content is present.
    expect(html).toContain("Body");
    expect(html).toContain("text");
    // Frontmatter keys do NOT leak into the rendered HTML.
    expect(html).not.toContain("title:");
    expect(html).not.toContain("description:");
    // The `---` fence is not turned into a horizontal rule.
    expect(html).not.toContain("<hr");
  });

  it("adds ids to headings via rehype-slug", () => {
    const { html } = renderMdx("# Hello World");
    expect(html).toContain('<h1 id="hello-world"');
  });

  it("renders a GFM table", () => {
    const source = "| a | b |\n| - | - |\n| 1 | 2 |";
    const { html } = renderMdx(source);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("passes an unregistered capitalized component through without throwing", () => {
    // An unregistered component (e.g. a hypothetical <Unknown>) must degrade to
    // the passthrough wrapper while preserving its children.
    const source = "<Unknown>hello there</Unknown>";
    let html = "";
    expect(() => {
      html = renderMdx(source).html;
    }).not.toThrow();
    expect(html).toContain("hello there");
    expect(html).toContain('data-component="Unknown"');
  });

  it("renders lowercase HTML tags as real elements, not components", () => {
    const { html } = renderMdx('<img src="x.png" />');
    expect(html).toContain("<img");
    expect(html).toContain('src="x.png"');
    expect(html).not.toContain("data-component");
  });

  it("maps className to class on lowercase HTML tags", () => {
    const { html } = renderMdx('<span className="badge">hi</span>');
    expect(html).toContain('class="badge"');
    expect(html).not.toContain("className");
  });

  it("drops expression braces so Jinja vars do not leak as garbage", () => {
    const source = "Before {{ jinja_var }} after.";
    const { html } = renderMdx(source);
    expect(html).not.toContain("{{");
    expect(html).not.toContain("jinja_var");
    expect(html).toContain("Before");
    expect(html).toContain("after.");
  });

  it("keeps Jinja braces intact inside code fences", () => {
    const source = "```bash\ndocker inspect --format '{{ .Name }}'\n```";
    const { html } = renderMdx(source);
    expect(html).toContain("{{ .Name }}");
  });

  it("degrades gracefully on a page that breaks the MDX parser", () => {
    // An unclosed placeholder tag in prose makes remark-mdx throw.
    const source = "Set the key <WEAVIATE_API_KEY> in your config before starting.";
    const warnings: string[] = [];
    let result: ReturnType<typeof renderMdx> | undefined;
    expect(() => {
      result = renderMdx(source, { onWarn: (m) => warnings.push(m) });
    }).not.toThrow();
    expect(result).toBeDefined();
    expect(result!.html).toContain("Set the key");
    expect(result!.html).toContain("in your config");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("in the degraded path, keeps HTML inside a code fence but strips stray tags from prose", () => {
    // The bare unclosed placeholder in prose breaks the MDX parser, forcing the
    // degraded fallback. The code fence holds a valid HTML snippet.
    const source =
      "A stray <SOME_PLACEHOLDER> in prose.\n\n```html\n<div>x</div>\n```\n";
    const warnings: string[] = [];
    const { html } = renderMdx(source, { onWarn: (m) => warnings.push(m) });
    // The degraded path was taken.
    expect(warnings.length).toBeGreaterThan(0);
    // The HTML snippet inside the code fence survives (rendered as escaped text
    // inside the code block) rather than being stripped.
    expect(html).toContain("&#x3C;div>x&#x3C;/div>");
    // The stray placeholder tag in prose is removed, but its surrounding text stays.
    expect(html).not.toContain("SOME_PLACEHOLDER");
    expect(html).toContain("A stray");
    expect(html).toContain("in prose.");
  });

  it("extracts frontmatter even in the degraded fallback path", () => {
    const source =
      "---\ntitle: Broken Page\ndescription: still here\n---\n\nSet <WEAVIATE_API_KEY> now.";
    const warnings: string[] = [];
    const { html, frontmatter } = renderMdx(source, { onWarn: (m) => warnings.push(m) });
    expect(frontmatter.title).toBe("Broken Page");
    expect(frontmatter.description).toBe("still here");
    expect(html).not.toContain("title:");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("renders a real Dify MDX page without leaking frontmatter and with heading ids", () => {
    const realPath =
      "/Users/a47/Documents/Work/Dify Docs/Repo/dify-docs/en/self-host/troubleshooting/docker-issues.mdx";
    const source = readFileSync(realPath, "utf8");
    const warnings: string[] = [];
    const { html, frontmatter } = renderMdx(source, { onWarn: (m) => warnings.push(m) });
    // Frontmatter was parsed.
    expect(frontmatter.title).toBe("Docker Issues");
    // No literal frontmatter leak.
    expect(html).not.toContain("title: Docker Issues");
    // Headings carry ids.
    expect(html).toMatch(/<h2 id="[^"]+"/);
  });
});
