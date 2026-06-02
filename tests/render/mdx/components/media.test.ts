import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

describe("media placeholder (video / iframe)", () => {
  it("turns a <video src> into a clickable .media-embed link, not a <video> element", () => {
    const { html } = renderMdx(
      `<video controls src="https://assets.example.com/demo.mp4" width="100%" />`
    );
    expect(html).toContain(`<div class="media-embed">`);
    expect(html).toContain(`<a class="media-embed-link" href="https://assets.example.com/demo.mp4">Watch this video online</a>`);
    expect(html).toContain(`▶ Video`);
    expect(html).not.toContain(`<video`);
  });

  it("uses the iframe title as the label and links its src", () => {
    const { html } = renderMdx(
      `<iframe src="https://www.youtube.com/embed/abc123" title="Dify Quick Start Video" frameBorder="0" />`
    );
    expect(html).toContain(`▶ Dify Quick Start Video`);
    expect(html).toContain(`href="https://www.youtube.com/embed/abc123"`);
    expect(html).not.toContain(`<iframe`);
  });

  it("falls back to a nested <source> for a video without its own src", () => {
    const { html } = renderMdx(
      `<video controls>\n  <source src="https://assets.example.com/clip.webm" type="video/webm" />\n</video>`
    );
    expect(html).toContain(`href="https://assets.example.com/clip.webm"`);
    expect(html).not.toContain(`<video`);
    expect(html).not.toContain(`<source`);
  });

  it("renders a label-only note when no media url resolves", () => {
    const { html } = renderMdx(`<iframe frameBorder="0" />`);
    expect(html).toContain(`<div class="media-embed">`);
    expect(html).toContain(`▶ Embedded content`);
    expect(html).toContain(`media-embed-note`);
    expect(html).not.toContain(`<a `);
  });

  it("leaves an <iframe> inside a code fence untouched (it is an embed example, not a live element)", () => {
    const { html } = renderMdx(
      "```html\n<iframe src=\"https://udify.app/chatbot/TOKEN\"></iframe>\n```"
    );
    // The fenced example stays as escaped code; it is NOT turned into a placeholder.
    expect(html).not.toContain(`class="media-embed"`);
    expect(html).toContain(`&#x3C;iframe`);
  });
});
