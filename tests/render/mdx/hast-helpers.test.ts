import { describe, it, expect } from "vitest";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import { getStringAttr, element, text } from "../../../src/render/mdx/hast-helpers.js";

/** Build a minimal flow element node carrying the given attributes. */
function nodeWith(
  attributes: MdxJsxFlowElement["attributes"]
): MdxJsxFlowElement {
  return { type: "mdxJsxFlowElement", name: "Demo", attributes, children: [] };
}

describe("getStringAttr", () => {
  it("returns a string attribute's value", () => {
    const node = nodeWith([
      { type: "mdxJsxAttribute", name: "type", value: "warning" },
    ]);
    expect(getStringAttr(node, "type")).toBe("warning");
  });

  it("returns undefined for a missing attribute", () => {
    const node = nodeWith([
      { type: "mdxJsxAttribute", name: "type", value: "warning" },
    ]);
    expect(getStringAttr(node, "label")).toBeUndefined();
  });

  it("returns undefined for a boolean attribute (null value)", () => {
    const node = nodeWith([
      { type: "mdxJsxAttribute", name: "open", value: null },
    ]);
    expect(getStringAttr(node, "open")).toBeUndefined();
  });

  it("returns undefined for an expression-valued attribute", () => {
    const node = nodeWith([
      {
        type: "mdxJsxAttribute",
        name: "tags",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: '["a"]',
        },
      },
    ]);
    expect(getStringAttr(node, "tags")).toBeUndefined();
  });

  it("skips spread attributes without throwing", () => {
    const node = nodeWith([
      {
        type: "mdxJsxExpressionAttribute",
        value: "...props",
      },
    ]);
    expect(getStringAttr(node, "type")).toBeUndefined();
  });
});

describe("element", () => {
  it("builds a hast element with tag, properties, and children", () => {
    const el = element("div", { class: "x" }, [text("hi")]);
    expect(el).toEqual({
      type: "element",
      tagName: "div",
      properties: { class: "x" },
      children: [{ type: "text", value: "hi" }],
    });
  });
});

describe("text", () => {
  it("builds a hast text node", () => {
    expect(text("hello")).toEqual({ type: "text", value: "hello" });
  });
});
