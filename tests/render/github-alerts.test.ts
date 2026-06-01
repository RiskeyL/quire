import { describe, it, expect } from "vitest";
import { renderMdx } from "../../src/render/mdx/render-mdx.js";

/**
 * GitHub-style alert blockquotes (`> [!NOTE]` …) must render as the same styled
 * callouts the Mintlify `<Callout>`/`<Note>` handlers produce, so docs written
 * with GitHub alerts instead of Mintlify components are recognized.
 */
describe("GitHub alerts", () => {
  const cases: Array<{ marker: string; cls: string; label: string }> = [
    { marker: "NOTE", cls: "callout-info", label: "Note" },
    { marker: "TIP", cls: "callout-tip", label: "Tip" },
    { marker: "IMPORTANT", cls: "callout-note", label: "Important" },
    { marker: "WARNING", cls: "callout-warning", label: "Warning" },
    { marker: "CAUTION", cls: "callout-danger", label: "Caution" },
  ];

  for (const { marker, cls, label } of cases) {
    it(`[!${marker}] renders a ${cls} callout with the "${label}" label and body`, () => {
      const { html } = renderMdx(`> [!${marker}]\n> Body text here.`);
      expect(html).toContain(`class="callout ${cls}"`);
      expect(html).toContain(`<p class="callout-label"><strong>${label}</strong></p>`);
      expect(html).toContain("Body text here.");
      // The marker itself must not leak into the output.
      expect(html).not.toContain(`[!${marker}]`);
    });
  }

  it("maps the callout type to the Word custom-style", () => {
    const { html } = renderMdx(`> [!CAUTION]\n> Careful.`);
    expect(html).toContain('custom-style="Callout Danger"');
  });

  it("renders a marker-only alert as a callout with just its label", () => {
    const { html } = renderMdx(`> [!TIP]`);
    expect(html).toContain('class="callout callout-tip"');
    expect(html).toContain("<strong>Tip</strong>");
    expect(html).not.toContain("[!TIP]");
  });

  it("preserves multi-line and formatted body content", () => {
    const { html } = renderMdx(`> [!NOTE]\n> First line with **bold**.\n>\n> Second paragraph.`);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("Second paragraph.");
  });

  it("is case-insensitive on the marker", () => {
    const { html } = renderMdx(`> [!note]\n> Body.`);
    expect(html).toContain('class="callout callout-info"');
  });

  it("leaves an ordinary blockquote untouched", () => {
    const { html } = renderMdx(`> Just a normal quote.`);
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("callout");
  });

  it("does not convert when the marker is not alone on the first line", () => {
    // GitHub requires the marker on its own line; inline text after it is a quote.
    const { html } = renderMdx(`> [!NOTE] not an alert`);
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain('class="callout');
  });
});
