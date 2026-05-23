import { describe, it, expect } from "vitest";
import { renderMarkdownToHtml } from "../../src/render/markdown.js";

describe("renderMarkdownToHtml", () => {
  it("renders a heading", () => {
    expect(renderMarkdownToHtml("# Hello")).toContain("<h1");
    expect(renderMarkdownToHtml("# Hello")).toContain("Hello");
  });

  it("renders a paragraph", () => {
    expect(renderMarkdownToHtml("plain text")).toContain("<p>plain text</p>");
  });
});
