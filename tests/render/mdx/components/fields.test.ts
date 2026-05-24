import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

describe("API field components", () => {
  // -------------------------------------------------------------------------
  // ParamField — name resolution from the location attribute
  // -------------------------------------------------------------------------
  describe("ParamField", () => {
    it("renders the location-attribute value as the param name", () => {
      // <ParamField path="label" ...> → name "label", location "path"
      const { html } = renderMdx(
        `<ParamField path="label" type="object" required>desc</ParamField>`
      );
      expect(html).toContain('class="param-field"');
      expect(html).toContain('class="param-name"');
      expect(html).toMatch(/class="param-name"[^>]*>label</);
    });

    it("renders the type in a .param-type element", () => {
      const { html } = renderMdx(
        `<ParamField path="label" type="object" required>desc</ParamField>`
      );
      expect(html).toContain('class="param-type"');
      expect(html).toMatch(/class="param-type"[^>]*>object</);
    });

    it("renders a .param-required badge when required is present", () => {
      const { html } = renderMdx(
        `<ParamField path="label" type="object" required>desc</ParamField>`
      );
      expect(html).toContain('class="param-required"');
    });

    it("separates the head meta with whitespace so name/type/required do not run together", () => {
      // CSS margin-left spaces these in the PDF but Pandoc drops it in Word, so
      // the head pieces must carry literal whitespace between them to stay legible
      // in both formats (otherwise: "labelobject", "en_USstringrequired").
      const { html } = renderMdx(
        `<ParamField path="label" type="object" required>desc</ParamField>`
      );
      expect(html).toMatch(/label<\/code>\s+<span[^>]*class="param-type"/);
      expect(html).toMatch(/object<\/span>\s+<span[^>]*class="param-required"/);
    });

    it("renders the body content in a .param-body", () => {
      const { html } = renderMdx(
        `<ParamField path="label" type="object" required>desc</ParamField>`
      );
      expect(html).toContain('class="param-body"');
      expect(html).toContain("desc");
    });

    it("resolves the name from a query location attribute", () => {
      const { html } = renderMdx(
        `<ParamField query="page" type="number">page number</ParamField>`
      );
      expect(html).toMatch(/class="param-name"[^>]*>page</);
    });

    it("resolves the name from a body location attribute", () => {
      const { html } = renderMdx(
        `<ParamField body="payload" type="object">the payload</ParamField>`
      );
      expect(html).toMatch(/class="param-name"[^>]*>payload</);
    });

    it("resolves the name from a header location attribute", () => {
      const { html } = renderMdx(
        `<ParamField header="Authorization" type="string">bearer token</ParamField>`
      );
      expect(html).toMatch(/class="param-name"[^>]*>Authorization</);
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(
        `<ParamField path="label" type="object" required>desc</ParamField>`
      );
      expect(html).not.toContain("data-component");
    });
  });

  // -------------------------------------------------------------------------
  // ParamField — no required badge / default value
  // -------------------------------------------------------------------------
  describe("ParamField optional meta", () => {
    it("omits the .param-required badge when required is absent", () => {
      const { html } = renderMdx(
        `<ParamField path="label" type="string">desc</ParamField>`
      );
      expect(html).not.toContain('class="param-required"');
    });

    it("renders a .param-default showing the default value", () => {
      const { html } = renderMdx(
        `<ParamField path="label" type="string" default="foo">desc</ParamField>`
      );
      expect(html).toContain('class="param-default"');
      expect(html).toContain("foo");
    });

    it("renders a .param-deprecated badge when deprecated is present", () => {
      const { html } = renderMdx(
        `<ParamField path="label" type="string" deprecated>desc</ParamField>`
      );
      expect(html).toContain('class="param-deprecated"');
    });

    it("omits the .param-deprecated badge when deprecated is absent", () => {
      const { html } = renderMdx(
        `<ParamField path="label" type="string">desc</ParamField>`
      );
      expect(html).not.toContain('class="param-deprecated"');
    });

    it("omits the .param-type element when no type is given", () => {
      const { html } = renderMdx(
        `<ParamField path="label">desc</ParamField>`
      );
      expect(html).not.toContain('class="param-type"');
    });

    it("omits the .param-name element when no location attribute is present", () => {
      // A ParamField with no path/query/body/header is malformed (an author may
      // write `<ParamField type="string">` by habit). The handler degrades
      // gracefully: no name element, but the field still renders.
      const { html } = renderMdx(
        `<ParamField type="string">desc</ParamField>`
      );
      expect(html).not.toContain('class="param-name"');
      expect(html).toContain('class="param-field"');
      expect(html).toContain("desc");
    });
  });

  // -------------------------------------------------------------------------
  // ParamField — recursion (nested fields inside .param-body)
  // -------------------------------------------------------------------------
  describe("nested ParamField", () => {
    it("nests an inner .param-field inside the outer .param-body", () => {
      const { html } = renderMdx(
        `<ParamField path="outer" type="object"><ParamField path="inner" type="string">x</ParamField></ParamField>`
      );
      // Two field blocks rendered.
      const fieldBlocks = html.match(/class="param-field"/g);
      expect(fieldBlocks).toHaveLength(2);
      // The inner field block must appear inside the outer's .param-body, i.e.
      // a .param-body opens before the second .param-field. Assert structural
      // nesting, not a flat sequence: the inner field follows a param-body open.
      expect(html).toMatch(
        /class="param-field"[\s\S]*class="param-body"[\s\S]*class="param-field"[\s\S]*class="param-name"[^>]*>inner</
      );
      // Both names appear.
      expect(html).toMatch(/class="param-name"[^>]*>outer</);
      expect(html).toMatch(/class="param-name"[^>]*>inner</);
    });
  });

  // -------------------------------------------------------------------------
  // ResponseField — name comes from the `name` attribute
  // -------------------------------------------------------------------------
  describe("ResponseField", () => {
    it("renders the name attribute as the field name", () => {
      const { html } = renderMdx(
        `<ResponseField name="id" type="string">the id</ResponseField>`
      );
      expect(html).toContain('class="param-field"');
      expect(html).toMatch(/class="param-name"[^>]*>id</);
    });

    it("renders the type and body", () => {
      const { html } = renderMdx(
        `<ResponseField name="id" type="string">the id</ResponseField>`
      );
      expect(html).toMatch(/class="param-type"[^>]*>string</);
      expect(html).toContain('class="param-body"');
      expect(html).toContain("the id");
    });

    it("renders a .param-required badge when required is present", () => {
      const { html } = renderMdx(
        `<ResponseField name="id" type="string" required>the id</ResponseField>`
      );
      expect(html).toContain('class="param-required"');
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(
        `<ResponseField name="id" type="string">the id</ResponseField>`
      );
      expect(html).not.toContain("data-component");
    });
  });

  // -------------------------------------------------------------------------
  // RequestExample / ResponseExample — inline labeled containers
  // -------------------------------------------------------------------------
  // Verified author-placeable per Mintlify components/examples docs: containers
  // that pin code to the right sidebar on the web. In print there is no side
  // panel, so children render inline under a label.
  describe("RequestExample and ResponseExample", () => {
    it("renders RequestExample children under a 'Request example' label", () => {
      const { html } = renderMdx(
        "<RequestExample>\n\n```bash\ncurl https://x\n```\n\n</RequestExample>"
      );
      expect(html).toContain('class="example"');
      expect(html).toContain('class="example-label"');
      expect(html).toContain("Request example");
      expect(html).toContain("curl https://x");
    });

    it("renders ResponseExample children under a 'Response example' label", () => {
      const { html } = renderMdx(
        "<ResponseExample>\n\n```json\n{ \"ok\": true }\n```\n\n</ResponseExample>"
      );
      expect(html).toContain('class="example"');
      expect(html).toContain('class="example-label"');
      expect(html).toContain("Response example");
      expect(html).toContain("ok");
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(
        "<RequestExample>\n\n```bash\ncurl https://x\n```\n\n</RequestExample>"
      );
      expect(html).not.toContain("data-component");
    });
  });
});
