import { describe, it, expect } from "vitest";
import { selectPages, collectPages, formatTree, type Tree } from "../../src/resolve/tree.js";

const sample: Tree = [
  { type: "section", title: "Getting Started", children: [
    { type: "page", file: "intro.md" },
    { type: "page", file: "quickstart.md", title: "Quick Start" }
  ]},
  { type: "section", title: "Guides", children: [
    { type: "page", file: "guides/workflows.md" }
  ]}
];

describe("collectPages", () => {
  it("returns all pages in document order", () => {
    expect(collectPages(sample).map((p) => p.file)).toEqual([
      "intro.md", "quickstart.md", "guides/workflows.md"
    ]);
  });
});

describe("selectPages", () => {
  it("keeps a selected page and its ancestor section, dropping the rest", () => {
    expect(selectPages(sample, ["guides/workflows.md"])).toEqual([
      { type: "section", title: "Guides", children: [
        { type: "page", file: "guides/workflows.md" }
      ]}
    ]);
  });

  it("drops sections that have no selected descendants", () => {
    expect(selectPages(sample, ["intro.md"])).toEqual([
      { type: "section", title: "Getting Started", children: [
        { type: "page", file: "intro.md" }
      ]}
    ]);
  });

  it("ignores files not present in the tree", () => {
    expect(selectPages(sample, ["nope.md"])).toEqual([]);
  });
});

describe("formatTree", () => {
  it("renders an indented outline; pages with a title show it with the file in parens", () => {
    expect(formatTree(sample)).toBe([
      "Getting Started",
      "  intro.md",
      "  Quick Start (quickstart.md)",
      "Guides",
      "  guides/workflows.md"
    ].join("\n"));
  });
});
