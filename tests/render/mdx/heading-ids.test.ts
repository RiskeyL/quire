import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../src/render/mdx/render-mdx.js";

describe("custom heading ids ({#id})", () => {
  it("uses the id and removes the marker from the heading text", () => {
    const { html } = renderMdx("## Follow up {#after-you-submit}\n");
    expect(html).toContain('<h2 id="after-you-submit">Follow up</h2>');
    expect(html).not.toContain("{#");
  });

  it("does not push the page into the degraded fallback", () => {
    const warnings: string[] = [];
    const source = "## Follow up {#after-you-submit}\n\n<Note>\nKeep **this** in mind.\n</Note>\n";
    const withId = renderMdx(source, { onWarn: (m) => warnings.push(m) });
    const withoutId = renderMdx(source.replace(" {#after-you-submit}", ""));
    expect(warnings).toEqual([]);
    // The Note renders exactly as it does on a page without a custom id.
    const tail = (html: string) => html.slice(html.indexOf("</h2>"));
    expect(tail(withId.html)).toBe(tail(withoutId.html));
  });

  it("keeps inline markup in the heading", () => {
    const { html } = renderMdx("### Use `x` now {#use-x}\n");
    expect(html).toContain('<h3 id="use-x">Use <code>x</code> now</h3>');
  });

  it("leaves a marker inside a fenced code block alone", () => {
    const { html } = renderMdx("```md\n## Title {#keep-me}\n```\n");
    expect(html).toContain("## Title {#keep-me}");
  });

  it("leaves headings without a marker to the automatic slug", () => {
    const { html } = renderMdx("## Plain heading\n");
    expect(html).toContain('<h2 id="plain-heading">Plain heading</h2>');
  });

  it("still applies the id when the page degrades for another reason", () => {
    const warnings: string[] = [];
    const { html } = renderMdx("## Title {#kept}\n\nBroken {expression here}\n", {
      onWarn: (m) => warnings.push(m),
    });
    expect(warnings).toHaveLength(1);
    expect(html).toContain('<h2 id="kept">Title</h2>');
  });

  it("accepts a custom id on a heading indented inside a component", () => {
    const warnings: string[] = [];
    const source = '<Steps>\n  <Step title="One">\n    ### Inner {#inner}\n\n    text\n  </Step>\n</Steps>\n';
    const { html } = renderMdx(source, { onWarn: (m) => warnings.push(m) });
    expect(warnings).toEqual([]);
    expect(html).toContain('id="inner"');
    expect(html).not.toContain("{#");
  });

  it("leaves a marker inside a fenced code block alone in a CRLF file", () => {
    const { html } = renderMdx("```md\r\n## Title {#keep-me}\r\n```\r\n");
    expect(html).toContain("## Title {#keep-me}");
    expect(html).not.toContain("quire-heading-id");
  });

  it("leaves an escaped brace as literal text", () => {
    const { html } = renderMdx("## T \\{#x}\n");
    expect(html).toContain("{#x}");
    expect(html).not.toContain('id="x"');
  });

  it("does not touch frontmatter", () => {
    const { frontmatter, html } = renderMdx("---\ndescription: |\n  ## d {#q}\n---\n\n## Body {#b}\n");
    expect(String(frontmatter.description)).toContain("## d {#q}");
    expect(html).toContain('<h2 id="b">Body</h2>');
  });

  it("keeps an indented heading-like line as code when the page degrades", () => {
    const { html } = renderMdx("Broken {expression here}\n\n    ## Code {#c}\n");
    expect(html).toContain("## Code {#c}");
    expect(html).not.toContain("quire-heading-id");
  });

  it("handles several custom ids on one page", () => {
    const { html } = renderMdx("## One {#first}\n\ntext\n\n## Two {#second}\n");
    expect(html).toContain('<h2 id="first">One</h2>');
    expect(html).toContain('<h2 id="second">Two</h2>');
  });
});
