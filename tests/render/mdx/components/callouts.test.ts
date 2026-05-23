import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

describe("callout components", () => {
  describe("named callouts map to a fixed type and label", () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ["Info", "info", "Info"],
      ["Tip", "tip", "Tip"],
      ["Warning", "warning", "Warning"],
      ["Note", "note", "Note"],
      ["Check", "check", "Success"],
      ["Danger", "danger", "Danger"],
    ];

    for (const [name, type, label] of cases) {
      it(`renders <${name}> as callout callout-${type} with the "${label}" label and its children`, () => {
        const { html } = renderMdx(`<${name}>body text here</${name}>`);
        expect(html).toContain(`class="callout callout-${type}"`);
        expect(html).toContain(`class="callout-label"`);
        expect(html).toContain(label);
        expect(html).toContain("body text here");
        // The passthrough fallback must not fire for a registered component.
        expect(html).not.toContain('data-component');
      });
    }
  });

  describe("generic Callout", () => {
    it("reads its type attribute", () => {
      const { html } = renderMdx(`<Callout type="warning">x</Callout>`);
      expect(html).toContain(`class="callout callout-warning"`);
      expect(html).toContain("Warning");
      expect(html).toContain("x");
    });

    it("defaults to note when type is absent", () => {
      const { html } = renderMdx(`<Callout>plain</Callout>`);
      expect(html).toContain(`class="callout callout-note"`);
      expect(html).toContain("Note");
      expect(html).toContain("plain");
    });

    it("falls back to note for an unknown type", () => {
      const { html } = renderMdx(`<Callout type="bogus">y</Callout>`);
      expect(html).toContain(`class="callout callout-note"`);
      expect(html).toContain("Note");
    });
  });

  describe("dropped props", () => {
    it("does not render an icon prop", () => {
      const { html } = renderMdx(`<Info icon="rocket">hi</Info>`);
      expect(html).toContain(`class="callout callout-info"`);
      expect(html).not.toContain("rocket");
      expect(html).not.toContain("icon");
    });

    it("does not render a color prop", () => {
      const { html } = renderMdx(`<Callout type="info" color="#FFC107">hi</Callout>`);
      expect(html).toContain(`class="callout callout-info"`);
      expect(html).not.toContain("#FFC107");
      expect(html).not.toContain("color");
    });
  });

  describe("inline content", () => {
    it("renders child markdown formatting inside the callout", () => {
      const { html } = renderMdx(`<Info>has **bold** inside</Info>`);
      expect(html).toContain(`class="callout callout-info"`);
      expect(html).toContain("<strong>bold</strong>");
    });
  });
});
