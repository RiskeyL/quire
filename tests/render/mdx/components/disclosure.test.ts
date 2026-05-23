import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

describe("disclosure components", () => {
  // -------------------------------------------------------------------------
  // Tabs / Tab
  // -------------------------------------------------------------------------
  describe("Tabs and Tab", () => {
    it("wraps the group in a .tabs container", () => {
      const { html } = renderMdx(
        `<Tabs><Tab title="Mac">brew</Tab><Tab title="Linux">apt</Tab></Tabs>`
      );
      expect(html).toContain('class="tabs"');
    });

    it("renders each Tab as a .tab block", () => {
      const { html } = renderMdx(
        `<Tabs><Tab title="Mac">brew</Tab><Tab title="Linux">apt</Tab></Tabs>`
      );
      const matches = html.match(/class="tab"/g);
      expect(matches).toHaveLength(2);
    });

    it("renders each Tab's title as a .tab-label paragraph", () => {
      const { html } = renderMdx(
        `<Tabs><Tab title="Mac">brew</Tab><Tab title="Linux">apt</Tab></Tabs>`
      );
      expect(html).toContain('class="tab-label"');
      expect(html).toContain("Mac");
      expect(html).toContain("Linux");
    });

    it("renders each Tab's body content", () => {
      const { html } = renderMdx(
        `<Tabs><Tab title="Mac">brew</Tab><Tab title="Linux">apt</Tab></Tabs>`
      );
      expect(html).toContain("brew");
      expect(html).toContain("apt");
    });

    it("does not leak the icon prop value into the output", () => {
      const { html } = renderMdx(
        `<Tabs><Tab title="Setup" icon="rocket">content</Tab></Tabs>`
      );
      expect(html).not.toContain("rocket");
      expect(html).not.toContain("icon");
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(
        `<Tabs><Tab title="A">body</Tab></Tabs>`
      );
      expect(html).not.toContain("data-component");
    });

    it("Tabs without a title attribute still renders a .tab block", () => {
      // Tab with no title should still produce a .tab div, with NO label
      // paragraph (guards against an empty label <p> plus a dangling ▾ glyph).
      const { html } = renderMdx(`<Tabs><Tab>content</Tab></Tabs>`);
      expect(html).toContain('class="tab"');
      expect(html).toContain("content");
      expect(html).not.toContain('class="tab-label"');
    });
  });

  // -------------------------------------------------------------------------
  // AccordionGroup / Accordion
  // -------------------------------------------------------------------------
  describe("AccordionGroup and Accordion", () => {
    it("wraps the group in an .accordion-group container", () => {
      const { html } = renderMdx(
        `<AccordionGroup><Accordion title="Models">pkg models</Accordion></AccordionGroup>`
      );
      expect(html).toContain('class="accordion-group"');
    });

    it("renders Accordion as an .accordion block", () => {
      const { html } = renderMdx(
        `<AccordionGroup><Accordion title="Models">pkg models</Accordion></AccordionGroup>`
      );
      expect(html).toContain('class="accordion"');
    });

    it("renders Accordion title as an .accordion-label paragraph", () => {
      const { html } = renderMdx(
        `<AccordionGroup><Accordion title="Models">pkg models</Accordion></AccordionGroup>`
      );
      expect(html).toContain('class="accordion-label"');
      expect(html).toContain("Models");
    });

    it("renders Accordion body content", () => {
      const { html } = renderMdx(
        `<AccordionGroup><Accordion title="Models">pkg models</Accordion></AccordionGroup>`
      );
      expect(html).toContain("pkg models");
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(
        `<AccordionGroup><Accordion title="Models">body</Accordion></AccordionGroup>`
      );
      expect(html).not.toContain("data-component");
    });

    it("Accordion without AccordionGroup still renders as .accordion", () => {
      const { html } = renderMdx(`<Accordion title="Solo">body</Accordion>`);
      expect(html).toContain('class="accordion"');
      expect(html).toContain("Solo");
      expect(html).toContain("body");
    });

    it("drops the icon prop value", () => {
      const { html } = renderMdx(
        `<Accordion title="Docs" icon="book">body</Accordion>`
      );
      expect(html).not.toContain("book");
      expect(html).not.toContain("icon");
    });

    // Accordion does NOT have an href prop per Mintlify docs (confirmed); the
    // href-as-link case is not implemented and no test is written for it.
  });

  // -------------------------------------------------------------------------
  // Expandable
  // -------------------------------------------------------------------------
  describe("Expandable", () => {
    it("renders as an .expandable block", () => {
      const { html } = renderMdx(
        `<Expandable title="properties">nested</Expandable>`
      );
      expect(html).toContain('class="expandable"');
    });

    it("renders title as an .expandable-label paragraph", () => {
      const { html } = renderMdx(
        `<Expandable title="properties">nested</Expandable>`
      );
      expect(html).toContain('class="expandable-label"');
      expect(html).toContain("properties");
    });

    it("renders body content", () => {
      const { html } = renderMdx(
        `<Expandable title="properties">nested</Expandable>`
      );
      expect(html).toContain("nested");
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(
        `<Expandable title="properties">nested</Expandable>`
      );
      expect(html).not.toContain("data-component");
    });

    it("Expandable without a title still renders an .expandable block", () => {
      // No title means NO label paragraph (guards against an empty label <p>
      // plus a dangling ▾ glyph).
      const { html } = renderMdx(`<Expandable>body</Expandable>`);
      expect(html).toContain('class="expandable"');
      expect(html).toContain("body");
      expect(html).not.toContain('class="expandable-label"');
    });
  });
});
