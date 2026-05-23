import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

describe("Frame component", () => {
  describe("with a caption attribute", () => {
    it("renders a <figure class=\"frame\"> containing the image and a <figcaption>", () => {
      const { html } = renderMdx(
        `<Frame caption="A diagram">![alt](pic.png)</Frame>`
      );
      expect(html).toContain(`<figure class="frame"`);
      expect(html).toContain(`<img`);
      expect(html).toContain(`<figcaption>A diagram</figcaption>`);
      expect(html).not.toContain("data-component");
    });

    it("preserves the alt text of the image", () => {
      const { html } = renderMdx(
        `<Frame caption="Chart">![my alt text](chart.png)</Frame>`
      );
      expect(html).toContain(`alt="my alt text"`);
    });
  });

  describe("without a caption attribute", () => {
    it("renders a <figure> with NO <figcaption>", () => {
      const { html } = renderMdx(`<Frame>![alt](pic.png)</Frame>`);
      expect(html).toContain(`<figure class="frame"`);
      expect(html).toContain(`<img`);
      expect(html).not.toContain("figcaption");
      expect(html).not.toContain("data-component");
    });
  });

  describe("with a raw <img> child", () => {
    it("preserves the img inside the figure", () => {
      const { html } = renderMdx(
        `<Frame caption="Raw image"><img src="x.png" /></Frame>`
      );
      expect(html).toContain(`<figure class="frame"`);
      expect(html).toContain(`<img`);
      expect(html).toContain(`<figcaption>Raw image</figcaption>`);
    });
  });
});
