import { describe, it, expect } from "vitest";
import { buildTocFromHeadings } from "../../src/assemble/assemble.js";

describe("buildTocFromHeadings", () => {
  it("wraps entries in a nav.toc with an h2.toc-title carrying the quire-toc id", () => {
    const body = `<h1 id="s1">Section</h1>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    expect(html).toContain('<nav class="toc">');
    expect(html).toContain('<h2 class="toc-title" id="quire-toc">Contents</h2>');
  });

  it("produces balanced <ul>/<li> markup even when a deeper heading precedes a shallower one", () => {
    // Pathological order: a tier-2 heading appears before the tier-1 heading.
    // assembleDocument never produces this, but the public export must not emit
    // malformed HTML for an arbitrary caller.
    const body = `<h3 id="a">A</h3><h2 id="b">B</h2>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    const count = (re: RegExp) => (html.match(re) ?? []).length;
    expect(count(/<ul>/g)).toBe(count(/<\/ul>/g));
    expect(count(/<li\b/g)).toBe(count(/<\/li>/g));
    expect(html).toContain('<a href="#a"><span class="toc-text">A</span>');
    expect(html).toContain('<a href="#b"><span class="toc-text">B</span>');
  });

  it("ranks distinct heading levels into tiers regardless of absolute tag numbers", () => {
    // Levels present: h1 (tier 1), h2 (tier 2), h3 (tier 3). All within depth 3.
    const body =
      `<h1 id="a">A</h1>` +
      `<h2 id="b">B</h2>` +
      `<h3 id="c">C</h3>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    expect(html).toContain('class="toc-entry toc-level-1"');
    expect(html).toContain('class="toc-entry toc-level-2"');
    expect(html).toContain('class="toc-entry toc-level-3"');
    expect(html).toContain('<a href="#a"><span class="toc-text">A</span>');
    expect(html).toContain('<a href="#b"><span class="toc-text">B</span>');
    expect(html).toContain('<a href="#c"><span class="toc-text">C</span>');
  });

  it("ranks by RELATIVE depth even when the shallowest heading is not h1", () => {
    // Demoted document: levels h2 (tier 1), h3 (tier 2), h4 (tier 3).
    const body =
      `<h2 id="a">A</h2>` +
      `<h3 id="b">B</h3>` +
      `<h4 id="c">C</h4>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    expect(html).toContain('class="toc-entry toc-level-1"><a href="#a"><span class="toc-text">A</span><span class="toc-leader" aria-hidden="true"></span></a>');
    expect(html).toContain('class="toc-entry toc-level-2"><a href="#b"><span class="toc-text">B</span><span class="toc-leader" aria-hidden="true"></span></a>');
    expect(html).toContain('class="toc-entry toc-level-3"><a href="#c"><span class="toc-text">C</span><span class="toc-leader" aria-hidden="true"></span></a>');
  });

  it("excludes headings deeper than the 3rd tier by default", () => {
    const body =
      `<h1 id="a">A</h1>` +
      `<h2 id="b">B</h2>` +
      `<h3 id="c">C</h3>` +
      `<h4 id="d">D (4th tier)</h4>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    expect(html).toContain('<a href="#a"><span class="toc-text">A</span>');
    expect(html).toContain('<a href="#c"><span class="toc-text">C</span>');
    expect(html).not.toContain('href="#d"');
    expect(html).not.toContain("D (4th tier)");
  });

  it("nests deeper tiers inside the shallower tier's list", () => {
    const body =
      `<h1 id="a">A</h1>` +
      `<h2 id="b">B</h2>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    // The tier-2 entry must be inside a <ul> nested under the tier-1 entry.
    const pattern =
      /<li class="toc-entry toc-level-1"><a href="#a"><span class="toc-text">A<\/span><span class="toc-leader" aria-hidden="true"><\/span><\/a><ul><li class="toc-entry toc-level-2"><a href="#b"><span class="toc-text">B<\/span><span class="toc-leader" aria-hidden="true"><\/span><\/a><\/li><\/ul><\/li>/;
    expect(html).toMatch(pattern);
  });

  it("ignores headings without a non-empty id", () => {
    const body =
      `<h1 id="a">A</h1>` +
      `<h2>No id</h2>` +
      `<h2 id="">Empty id</h2>` +
      `<h2 id="c">C</h2>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    expect(html).toContain('<a href="#a"><span class="toc-text">A</span>');
    expect(html).toContain('<a href="#c"><span class="toc-text">C</span>');
    expect(html).not.toContain("No id");
    expect(html).not.toContain("Empty id");
  });

  it("preserves document order of entries", () => {
    const body =
      `<h1 id="first">First</h1>` +
      `<h1 id="second">Second</h1>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    expect(html.indexOf("#first")).toBeLessThan(html.indexOf("#second"));
  });

  it("HTML-escapes the heading's text content", () => {
    // Heading text containing reserved characters must be escaped in the entry
    // so it cannot break out of the <a> when re-rendered.
    const body = `<h1 id="x">Tags &amp; &lt;Filters&gt;</h1>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    expect(html).toContain('<a href="#x"><span class="toc-text">Tags &amp; &lt;Filters&gt;</span>');
  });

  it("HTML-escapes the title", () => {
    const html = buildTocFromHeadings(`<h1 id="a">A</h1>`, { title: "<b>X</b>" });
    expect(html).not.toContain("<b>X</b>");
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });

  it("uses the visible text of a heading, stripping nested markup", () => {
    const body = `<h1 id="a">Hello <em>World</em></h1>`;
    const html = buildTocFromHeadings(body, { title: "Contents" });
    expect(html).toContain('<a href="#a"><span class="toc-text">Hello World</span>');
  });

  it("respects a custom maxDepth", () => {
    const body =
      `<h1 id="a">A</h1>` +
      `<h2 id="b">B</h2>` +
      `<h3 id="c">C (excluded at maxDepth 2)</h3>`;
    const html = buildTocFromHeadings(body, { title: "Contents", maxDepth: 2 });
    expect(html).toContain('<a href="#a"><span class="toc-text">A</span>');
    expect(html).toContain('<a href="#b"><span class="toc-text">B</span>');
    expect(html).not.toContain('href="#c"');
  });

  it("returns a nav with an empty list when the body has no qualifying headings", () => {
    const html = buildTocFromHeadings(`<p>No headings.</p>`, { title: "Contents" });
    expect(html).toContain('<nav class="toc">');
    expect(html).toContain('<h2 class="toc-title" id="quire-toc">Contents</h2>');
    expect(html).toContain("<ul></ul>");
  });
});
