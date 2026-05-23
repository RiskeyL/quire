import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

describe("Steps and Step components", () => {
  // -------------------------------------------------------------------------
  // Basic structure
  // -------------------------------------------------------------------------
  it("Steps renders as an <ol class=\"steps\">", () => {
    const { html } = renderMdx(
      `<Steps><Step title="Install">run brew</Step></Steps>`
    );
    expect(html).toContain('<ol class="steps"');
  });

  it("each Step renders as an <li class=\"step\">", () => {
    const { html } = renderMdx(
      `<Steps><Step title="Install">run brew</Step><Step title="Init">dify init</Step></Steps>`
    );
    const matches = html.match(/class="step"/g);
    expect(matches).toHaveLength(2);
  });

  it("each Step title renders as a .step-title paragraph", () => {
    const { html } = renderMdx(
      `<Steps><Step title="Install">run brew</Step><Step title="Init">dify init</Step></Steps>`
    );
    expect(html).toContain('class="step-title"');
    expect(html).toContain("Install");
    expect(html).toContain("Init");
  });

  it("each Step body content is rendered", () => {
    const { html } = renderMdx(
      `<Steps><Step title="Install">run brew</Step><Step title="Init">dify init</Step></Steps>`
    );
    expect(html).toContain("run brew");
    expect(html).toContain("dify init");
  });

  it("Steps container is an <ol> (for automatic numbering via browser/print engine)", () => {
    const { html } = renderMdx(
      `<Steps><Step title="One">first</Step></Steps>`
    );
    expect(html).toMatch(/<ol\b[^>]*class="steps"[^>]*>/);
  });

  it("Step items are <li> elements (not <div>)", () => {
    const { html } = renderMdx(
      `<Steps><Step title="One">first</Step></Steps>`
    );
    expect(html).toMatch(/<li\b[^>]*class="step"[^>]*>/);
  });

  // -------------------------------------------------------------------------
  // Optional title
  // -------------------------------------------------------------------------
  it("Step with no title still renders an <li class=\"step\">", () => {
    const { html } = renderMdx(
      `<Steps><Step>body text</Step></Steps>`
    );
    expect(html).toContain('class="step"');
    expect(html).toContain("body text");
  });

  it("Step with no title emits NO step-title paragraph", () => {
    const { html } = renderMdx(
      `<Steps><Step>body text</Step></Steps>`
    );
    expect(html).not.toContain('class="step-title"');
  });

  // -------------------------------------------------------------------------
  // Dropped props
  // -------------------------------------------------------------------------
  it("icon attr does NOT leak into output", () => {
    const { html } = renderMdx(
      `<Steps><Step title="Setup" icon="rocket">content</Step></Steps>`
    );
    expect(html).not.toContain("rocket");
    expect(html).not.toContain("icon");
  });

  // -------------------------------------------------------------------------
  // No passthrough wrapper
  // -------------------------------------------------------------------------
  it("does not use the passthrough data-component wrapper", () => {
    const { html } = renderMdx(
      `<Steps><Step title="A">body</Step></Steps>`
    );
    expect(html).not.toContain("data-component");
  });
});
