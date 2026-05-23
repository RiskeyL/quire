import { describe, it, expect } from "vitest";
import { stripPageChrome } from "../../src/render/strip-chrome.js";

describe("stripPageChrome", () => {
  it("strips the exact Dify footer (edit + report links separated by ' | ')", () => {
    const html =
      `<h1 id="title">Title</h1>` +
      `<p>Some content here.</p>` +
      `<hr>` +
      `<p><a href="https://github.com/langgenius/dify-docs/edit/main/en/x.mdx">Edit this page</a> | ` +
      `<a href="https://github.com/langgenius/dify-docs/issues/new?template=docs.yml">Report an issue</a></p>`;
    const result = stripPageChrome(html);
    expect(result).not.toContain("Edit this page");
    expect(result).not.toContain("Report an issue");
    expect(result).not.toContain("/edit/");
    expect(result).not.toContain("/issues/new");
    // Legitimate content is preserved.
    expect(result).toContain("Some content here.");
    expect(result).toContain('<h1 id="title">Title</h1>');
  });

  it("strips a trailing <p> containing only edit + issue links", () => {
    const html =
      `<p>Body.</p>` +
      `<p><a href="https://github.com/owner/repo/edit/main/doc.md">A</a> | ` +
      `<a href="https://github.com/owner/repo/issues/new">B</a></p>`;
    const result = stripPageChrome(html);
    expect(result).not.toContain("/edit/");
    expect(result).not.toContain("/issues/new");
    expect(result).toContain("<p>Body.</p>");
  });

  it("strips a trailing <p> matched by link text alone (no recognizable href)", () => {
    const html =
      `<p>Body.</p>` +
      `<p><a href="https://example.com/feedback">Edit this page</a> | ` +
      `<a href="https://example.com/report">Report an issue</a></p>`;
    const result = stripPageChrome(html);
    expect(result).not.toContain("Edit this page");
    expect(result).not.toContain("Report an issue");
    expect(result).toContain("<p>Body.</p>");
  });

  it("does NOT strip a normal paragraph containing an inline link", () => {
    const html =
      `<p>See <a href="https://example.com/guide">the guide</a> for more.</p>`;
    const result = stripPageChrome(html);
    expect(result).toContain("See");
    expect(result).toContain("the guide");
    expect(result).toContain("for more.");
  });

  it("does NOT strip a paragraph with prose plus an edit link (other text present)", () => {
    const html =
      `<p>You can <a href="https://github.com/owner/repo/edit/main/doc.md">Edit this page</a> directly.</p>`;
    const result = stripPageChrome(html);
    expect(result).toContain("You can");
    expect(result).toContain("directly.");
    expect(result).toContain("/edit/");
  });

  it("does NOT strip a links-only paragraph that is not edit/report chrome", () => {
    // Two unrelated links separated by ' | ' must survive: they are not chrome.
    const html =
      `<p><a href="https://example.com/a">Alpha</a> | ` +
      `<a href="https://example.com/b">Beta</a></p>`;
    const result = stripPageChrome(html);
    expect(result).toContain("Alpha");
    expect(result).toContain("Beta");
  });

  it("removes a leftover trailing <hr> left dangling above the stripped footer", () => {
    const html =
      `<p>Body.</p>` +
      `<hr>` +
      `<p><a href="https://github.com/owner/repo/edit/main/doc.md">Edit this page</a> | ` +
      `<a href="https://github.com/owner/repo/issues/new">Report an issue</a></p>`;
    const result = stripPageChrome(html);
    expect(result).not.toContain("<hr");
    expect(result).toContain("<p>Body.</p>");
  });

  it("leaves content unchanged when there is no chrome footer", () => {
    const html = `<h1>T</h1><p>Just content.</p>`;
    expect(stripPageChrome(html)).toContain("Just content.");
    expect(stripPageChrome(html)).toContain("<h1>T</h1>");
  });

  it("strips a single-link feedback footer (only Report an issue)", () => {
    const html =
      `<p>Body.</p>` +
      `<p><a href="https://github.com/owner/repo/issues/new?template=docs.yml">Report an issue</a></p>`;
    const result = stripPageChrome(html);
    expect(result).not.toContain("Report an issue");
    expect(result).toContain("<p>Body.</p>");
  });

  it("only strips the trailing chrome paragraph, not an earlier links-only edit paragraph", () => {
    // An edit-link-only paragraph that is NOT the last block stays put: the
    // function targets the document's trailing chrome, not mid-document links.
    const html =
      `<p><a href="https://github.com/owner/repo/edit/main/doc.md">Edit this page</a></p>` +
      `<p>Real trailing content.</p>`;
    const result = stripPageChrome(html);
    expect(result).toContain("Edit this page");
    expect(result).toContain("Real trailing content.");
  });
});
