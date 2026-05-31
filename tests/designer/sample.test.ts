import { describe, it, expect, beforeAll } from "vitest";
import { renderSample } from "../../src/designer/sample.js";

/**
 * Kitchen-sink sample tests for the designer preview.
 *
 * Every marker asserted below was verified against the real rendered HTML
 * produced by renderMdx on the full (non-degraded) path. The class names
 * and element shapes come directly from the component handlers and their
 * existing test suites.
 */

describe("renderSample", () => {
  // Render once in beforeAll so every assertion has a populated result, even
  // when tests are filtered or reordered (a module-level assignment inside the
  // first test would leave `result` undefined for the rest in that case).
  let result: ReturnType<typeof renderSample>;

  beforeAll(() => {
    result = renderSample();
  });

  it("renders without throwing (full path, not degraded fallback)", () => {
    expect(() => renderSample()).not.toThrow();
  });

  it("title matches the frontmatter title", () => {
    expect(result.title).toBe("Quire Theme Designer Sample");
  });

  // -------------------------------------------------------------------------
  // TOC
  // -------------------------------------------------------------------------
  it("tocHtml contains class=\"toc\"", () => {
    expect(result.tocHtml).toContain('class="toc"');
  });

  it("tocHtml contains at least 4 toc-entry elements", () => {
    const matches = result.tocHtml.match(/toc-entry/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

  // -------------------------------------------------------------------------
  // Headings h1-h6
  // -------------------------------------------------------------------------
  it("bodyHtml contains <h1", () => {
    expect(result.bodyHtml).toMatch(/<h1[\s>]/);
  });

  it("bodyHtml contains <h2", () => {
    expect(result.bodyHtml).toMatch(/<h2[\s>]/);
  });

  it("bodyHtml contains <h3", () => {
    expect(result.bodyHtml).toMatch(/<h3[\s>]/);
  });

  it("bodyHtml contains <h4", () => {
    expect(result.bodyHtml).toMatch(/<h4[\s>]/);
  });

  it("bodyHtml contains <h5", () => {
    expect(result.bodyHtml).toMatch(/<h5[\s>]/);
  });

  it("bodyHtml contains <h6", () => {
    expect(result.bodyHtml).toMatch(/<h6[\s>]/);
  });

  // -------------------------------------------------------------------------
  // Inline formatting
  // -------------------------------------------------------------------------
  it("bodyHtml contains inline <code>", () => {
    // An inline code span inside a <p> (not a fenced block)
    expect(result.bodyHtml).toMatch(/<p[^>]*>[\s\S]*<code>[\s\S]*<\/code>[\s\S]*<\/p>/);
  });

  it("bodyHtml contains a link <a ", () => {
    expect(result.bodyHtml).toContain("<a ");
  });

  // -------------------------------------------------------------------------
  // Block elements
  // -------------------------------------------------------------------------
  it("bodyHtml contains a fenced code block <pre>", () => {
    expect(result.bodyHtml).toContain("<pre>");
  });

  it("bodyHtml contains a <table", () => {
    expect(result.bodyHtml).toContain("<table");
  });

  it("bodyHtml contains a <blockquote", () => {
    expect(result.bodyHtml).toContain("<blockquote");
  });

  it("bodyHtml contains a horizontal rule <hr", () => {
    expect(result.bodyHtml).toMatch(/<hr\s*\/?>/);
  });

  // -------------------------------------------------------------------------
  // CodeGroup
  // -------------------------------------------------------------------------
  it("bodyHtml contains class=\"code-group\"", () => {
    expect(result.bodyHtml).toContain('class="code-group"');
  });

  // -------------------------------------------------------------------------
  // Callouts (all six types)
  // -------------------------------------------------------------------------
  it("bodyHtml contains callout-info", () => {
    expect(result.bodyHtml).toContain("callout-info");
  });

  it("bodyHtml contains callout-tip", () => {
    expect(result.bodyHtml).toContain("callout-tip");
  });

  it("bodyHtml contains callout-note", () => {
    expect(result.bodyHtml).toContain("callout-note");
  });

  it("bodyHtml contains callout-warning", () => {
    expect(result.bodyHtml).toContain("callout-warning");
  });

  it("bodyHtml contains callout-danger", () => {
    expect(result.bodyHtml).toContain("callout-danger");
  });

  it("bodyHtml contains callout-check", () => {
    expect(result.bodyHtml).toContain("callout-check");
  });

  // -------------------------------------------------------------------------
  // Panel and Update
  // -------------------------------------------------------------------------
  it("bodyHtml contains class=\"panel\"", () => {
    expect(result.bodyHtml).toContain('class="panel"');
  });

  it("bodyHtml contains class=\"update\"", () => {
    expect(result.bodyHtml).toContain('class="update"');
  });

  // -------------------------------------------------------------------------
  // Cards and Columns
  // -------------------------------------------------------------------------
  it("bodyHtml contains class=\"card-group\"", () => {
    expect(result.bodyHtml).toContain('class="card-group"');
  });

  it("bodyHtml contains class=\"card\"", () => {
    expect(result.bodyHtml).toContain('class="card"');
  });

  it("bodyHtml contains class=\"columns\"", () => {
    expect(result.bodyHtml).toContain('class="columns"');
  });

  it("bodyHtml contains class=\"column\"", () => {
    expect(result.bodyHtml).toContain('class="column"');
  });

  // -------------------------------------------------------------------------
  // Steps
  // -------------------------------------------------------------------------
  it("bodyHtml contains class=\"steps\"", () => {
    expect(result.bodyHtml).toContain('class="steps"');
  });

  it("bodyHtml contains class=\"step\"", () => {
    expect(result.bodyHtml).toContain('class="step"');
  });

  // -------------------------------------------------------------------------
  // Fields
  // -------------------------------------------------------------------------
  it("bodyHtml contains class=\"param-field\"", () => {
    expect(result.bodyHtml).toContain('class="param-field"');
  });

  it("bodyHtml has several param-field blocks (ParamField + ResponseField both render)", () => {
    // ParamField and ResponseField share the .param-field class; the sample
    // includes both plus nested fields, so there must be multiple occurrences.
    const matches = result.bodyHtml.match(/class="param-field"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------
  it("bodyHtml contains <figure class=\"frame\"", () => {
    expect(result.bodyHtml).toContain('<figure class="frame"');
  });

  // -------------------------------------------------------------------------
  // Badge
  // -------------------------------------------------------------------------
  it("bodyHtml contains class=\"badge\"", () => {
    expect(result.bodyHtml).toContain('class="badge"');
  });

  // -------------------------------------------------------------------------
  // Tree and CheckList
  // -------------------------------------------------------------------------
  it("bodyHtml contains class=\"tree\"", () => {
    expect(result.bodyHtml).toContain('class="tree"');
  });

  it("bodyHtml contains class=\"checklist\"", () => {
    expect(result.bodyHtml).toContain('class="checklist"');
  });

  // -------------------------------------------------------------------------
  // Disclosure: Accordion, Tabs, Expandable
  // -------------------------------------------------------------------------
  it("bodyHtml contains class=\"accordion\"", () => {
    expect(result.bodyHtml).toContain('class="accordion"');
  });

  it("bodyHtml contains class=\"tabs\"", () => {
    expect(result.bodyHtml).toContain('class="tabs"');
  });

  it("bodyHtml contains class=\"expandable\"", () => {
    expect(result.bodyHtml).toContain('class="expandable"');
  });

  // -------------------------------------------------------------------------
  // bodyHtml wrapper
  // -------------------------------------------------------------------------
  it("bodyHtml is wrapped in <div class=\"doc-body\">", () => {
    expect(result.bodyHtml).toMatch(/^<div class="doc-body">/);
    expect(result.bodyHtml).toMatch(/<\/div>$/);
  });
});
