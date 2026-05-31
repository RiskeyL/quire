import { describe, it, expect } from "vitest";
import { classifyTokenChange } from "../../src/designer/update-classifier.js";

describe("classifyTokenChange", () => {
  describe("restyle (geometry-neutral)", () => {
    it("colors.text", () => expect(classifyTokenChange("colors.text")).toBe("restyle"));
    it("colors.link", () => expect(classifyTokenChange("colors.link")).toBe("restyle"));
    it("colors.surface", () => expect(classifyTokenChange("colors.surface")).toBe("restyle"));
    it("colors.border", () => expect(classifyTokenChange("colors.border")).toBe("restyle"));
    it("colors.heading", () => expect(classifyTokenChange("colors.heading")).toBe("restyle"));
    it("colors.accent", () => expect(classifyTokenChange("colors.accent")).toBe("restyle"));
    it("colors.muted", () => expect(classifyTokenChange("colors.muted")).toBe("restyle"));
    it("semantic.success", () => expect(classifyTokenChange("semantic.success")).toBe("restyle"));
    it("semantic.danger", () => expect(classifyTokenChange("semantic.danger")).toBe("restyle"));
    it("semantic.caution", () => expect(classifyTokenChange("semantic.caution")).toBe("restyle"));
    it("badges.color", () => expect(classifyTokenChange("badges.color")).toBe("restyle"));
    it("shape.radius", () => expect(classifyTokenChange("shape.radius")).toBe("restyle"));
    it("links.underline", () => expect(classifyTokenChange("links.underline")).toBe("restyle"));
  });

  describe("relayout (geometry-affecting or unknown)", () => {
    // Page geometry
    it("page.size", () => expect(classifyTokenChange("page.size")).toBe("relayout"));
    it("page.margin", () => expect(classifyTokenChange("page.margin")).toBe("relayout"));

    // Typography
    it("typography.bodyFont", () => expect(classifyTokenChange("typography.bodyFont")).toBe("relayout"));
    it("typography.baseSize", () => expect(classifyTokenChange("typography.baseSize")).toBe("relayout"));
    it("typography.lineHeight", () => expect(classifyTokenChange("typography.lineHeight")).toBe("relayout"));

    // Headings
    it("headings.scale", () => expect(classifyTokenChange("headings.scale")).toBe("relayout"));
    it("headings.weight", () => expect(classifyTokenChange("headings.weight")).toBe("relayout"));

    // TOC
    it("toc.title", () => expect(classifyTokenChange("toc.title")).toBe("relayout"));
    it("toc.depth", () => expect(classifyTokenChange("toc.depth")).toBe("relayout"));

    // Density
    it("density", () => expect(classifyTokenChange("density")).toBe("relayout"));

    // Running headers / footers
    it("header.left", () => expect(classifyTokenChange("header.left")).toBe("relayout"));
    it("header.center", () => expect(classifyTokenChange("header.center")).toBe("relayout"));
    it("header.right", () => expect(classifyTokenChange("header.right")).toBe("relayout"));
    it("footer.center", () => expect(classifyTokenChange("footer.center")).toBe("relayout"));

    // Furniture (margin-box content rendered during pagination)
    it("furniture.fontSize", () => expect(classifyTokenChange("furniture.fontSize")).toBe("relayout"));
    it("furniture.color — color but in margin boxes, must be relayout", () =>
      expect(classifyTokenChange("furniture.color")).toBe("relayout"));

    // Page numbers
    it("pageNumbers.restartAtBody", () =>
      expect(classifyTokenChange("pageNumbers.restartAtBody")).toBe("relayout"));

    // Cover
    it("cover.layout", () => expect(classifyTokenChange("cover.layout")).toBe("relayout"));
    it("cover.spineWidth", () => expect(classifyTokenChange("cover.spineWidth")).toBe("relayout"));
    it("cover.logoWidth", () => expect(classifyTokenChange("cover.logoWidth")).toBe("relayout"));

    // Components
    it("components.gap", () => expect(classifyTokenChange("components.gap")).toBe("relayout"));

    // Meta
    it("meta.showDescription", () => expect(classifyTokenChange("meta.showDescription")).toBe("relayout"));

    // Tables
    it("tables.layout", () => expect(classifyTokenChange("tables.layout")).toBe("relayout"));

    // Brand
    it("brand.logo", () => expect(classifyTokenChange("brand.logo")).toBe("relayout"));
    it("brand.productName", () => expect(classifyTokenChange("brand.productName")).toBe("relayout"));

    // Unknown / empty / near-misses
    it("empty string", () => expect(classifyTokenChange("")).toBe("relayout"));
    it("bogus", () => expect(classifyTokenChange("bogus")).toBe("relayout"));
    it("badges.shape — under badges but not the color field", () =>
      expect(classifyTokenChange("badges.shape")).toBe("relayout"));
    it("shapes.radius — typo (wrong prefix)", () =>
      expect(classifyTokenChange("shapes.radius")).toBe("relayout"));
    it("link.underline — wrong singular", () =>
      expect(classifyTokenChange("link.underline")).toBe("relayout"));
  });
});
