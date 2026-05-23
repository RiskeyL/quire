import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

describe("boxed components", () => {
  describe("Update", () => {
    it("renders its label and children", () => {
      const { html } = renderMdx(
        `<Update label="2024-10-11">shipped a thing</Update>`
      );
      expect(html).toContain(`class="update"`);
      expect(html).toContain(`class="update-label"`);
      expect(html).toContain("2024-10-11");
      expect(html).toContain("shipped a thing");
      expect(html).not.toContain("data-component");
    });

    it("renders the description when present", () => {
      const { html } = renderMdx(
        `<Update label="2024-10-11" description="v0.1.0">notes</Update>`
      );
      expect(html).toContain("2024-10-11");
      expect(html).toContain("v0.1.0");
      expect(html).toContain("notes");
    });

    it("omits the label element when no label is given", () => {
      const { html } = renderMdx(`<Update>just body</Update>`);
      expect(html).toContain(`class="update"`);
      expect(html).toContain("just body");
      expect(html).not.toContain(`class="update-label"`);
    });

    it("does not render the tags array prop as text", () => {
      const { html } = renderMdx(
        `<Update label="2024-10-11" tags={["Mintlify"]}>body</Update>`
      );
      expect(html).toContain("2024-10-11");
      expect(html).not.toContain("Mintlify");
      expect(html).not.toContain("tags");
    });
  });

  describe("Panel", () => {
    it("renders its children inside an aside.panel box", () => {
      const { html } = renderMdx(`<Panel>side content</Panel>`);
      expect(html).toContain(`<aside class="panel"`);
      expect(html).toContain("side content");
      expect(html).not.toContain("data-component");
    });

    it("renders nested components inside the panel", () => {
      const { html } = renderMdx(`<Panel><Info>pinned</Info></Panel>`);
      expect(html).toContain(`<aside class="panel"`);
      expect(html).toContain(`class="callout callout-info"`);
      expect(html).toContain("pinned");
    });
  });

  describe("Banner", () => {
    // Banner is a docs.json site-config feature in Mintlify, not an
    // author-placeable in-content component, so the render core deliberately
    // has no handler for it. If it ever appears in page MDX it must degrade
    // harmlessly via the passthrough wrapper rather than throwing.
    it("passes through harmlessly (config-only component, no handler)", () => {
      let html = "";
      expect(() => {
        html = renderMdx(`<Banner>announcement</Banner>`).html;
      }).not.toThrow();
      expect(html).toContain("announcement");
      expect(html).toContain('data-component="Banner"');
    });
  });
});
