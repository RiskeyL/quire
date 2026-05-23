import { describe, it, expect } from "vitest";
import { wrapHtmlDocument } from "../../src/render/html-document.js";

describe("wrapHtmlDocument", () => {
  it("wraps a fragment in a full HTML document with a title", () => {
    const html = wrapHtmlDocument("<h1>Hi</h1>", "My Title");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>My Title</title>");
    expect(html).toContain("<h1>Hi</h1>");
  });

  it("escapes special characters in the title", () => {
    const html = wrapHtmlDocument("<p>x</p>", 'A & B </title>');
    expect(html).toContain("<title>A &amp; B &lt;/title&gt;</title>");
  });

  it("includes a non-empty default <style> block with token-driven rules", () => {
    const html = wrapHtmlDocument("<h1>Hi</h1>", "T");
    expect(html).toContain("<style>");
    const styleContent = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(styleContent.length).toBeGreaterThan(0);
    expect(styleContent).toContain("var(--font-body)");
  });
});
