import { describe, it, expect } from "vitest";
import { buildDesignerHtml } from "../../scripts/build-designer.js";

describe("buildDesignerHtml", () => {
  it(
    "produces a self-contained single-file HTML document with the sample and real theme CSS bundled",
    async () => {
      const html = await buildDesignerHtml();

      // Basic document structure
      expect(html.toLowerCase()).toMatch(/^<!doctype html/);
      expect(html).toContain("<html");

      // Self-contained: no external script or link tags
      expect(html).not.toContain("<script src=");
      expect(html).not.toContain("<link ");

      // Sample content injected via esbuild define
      expect(html).toContain("callout-tip");

      // Real compileCss bundled (emits CSS custom property --color-link)
      expect(html).toContain("--color-link");

      // pagedjs bundled
      expect(html).toContain("Previewer");
    },
    30000,
  );
});
