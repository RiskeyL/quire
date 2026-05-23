import { describe, it, expect } from "vitest";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import { getStringAttr, hasAttr, element, text } from "../../../src/render/mdx/hast-helpers.js";

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

describe("hasAttr", () => {
  it("returns true for a present boolean attribute (null value)", () => {
    const node = nodeWith([
      { type: "mdxJsxAttribute", name: "required", value: null },
    ]);
    expect(hasAttr(node, "required")).toBe(true);
  });

  it("returns true for a present string attribute", () => {
    const node = nodeWith([
      { type: "mdxJsxAttribute", name: "type", value: "string" },
    ]);
    expect(hasAttr(node, "type")).toBe(true);
  });

  it("returns false for an absent attribute", () => {
    const node = nodeWith([
      { type: "mdxJsxAttribute", name: "type", value: "string" },
    ]);
    expect(hasAttr(node, "required")).toBe(false);
  });

  it("returns true for required={true} (expression-valued truthy)", () => {
    const node = nodeWith([
      {
        type: "mdxJsxAttribute",
        name: "required",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: "true",
        },
      },
    ]);
    expect(hasAttr(node, "required")).toBe(true);
  });

  it("returns false for required={false} (expression-valued falsy)", () => {
    const node = nodeWith([
      {
        type: "mdxJsxAttribute",
        name: "required",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: "false",
        },
      },
    ]);
    expect(hasAttr(node, "required")).toBe(false);
  });

  it("returns false (does not throw) when the expression value string is undefined", () => {
    // A constructible MdxJsxAttributeValueExpression shape can carry an
    // undefined `value` string. Trimming it directly would throw a TypeError
    // that propagates out of the handler and degrades the whole page to the
    // stripped fallback. hasAttr must guard the raw value and read it as
    // not-set instead.
    const node = nodeWith([
      {
        type: "mdxJsxAttribute",
        name: "required",
        value: {
          type: "mdxJsxAttributeValueExpression",
          // Cast: the type declares `value: string`, but a constructed node
          // can carry undefined here, which is exactly the case under test.
          value: undefined as unknown as string,
        },
      },
    ]);
    expect(() => hasAttr(node, "required")).not.toThrow();
    expect(hasAttr(node, "required")).toBe(false);
  });

  it("skips spread attributes without throwing", () => {
    const node = nodeWith([
      {
        type: "mdxJsxExpressionAttribute",
        value: "...props",
      },
    ]);
    expect(hasAttr(node, "required")).toBe(false);
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
