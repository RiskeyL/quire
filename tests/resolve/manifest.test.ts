import { describe, it, expect } from "vitest";
import { parseManifest } from "../../src/resolve/manifest.js";

describe("parseManifest", () => {
  it("parses sections and pages with optional title overrides", () => {
    const yaml = `
- section: "Getting Started"
  children:
    - file: intro.md
    - file: quickstart.md
      title: "Quick Start"
- section: "Guides"
  children:
    - file: guides/workflows.md
`;
    expect(parseManifest(yaml)).toEqual([
      { type: "section", title: "Getting Started", children: [
        { type: "page", file: "intro.md" },
        { type: "page", file: "quickstart.md", title: "Quick Start" }
      ]},
      { type: "section", title: "Guides", children: [
        { type: "page", file: "guides/workflows.md" }
      ]}
    ]);
  });

  it("parses a flat list of pages (no sections)", () => {
    expect(parseManifest("- file: a.md\n- file: b.md\n")).toEqual([
      { type: "page", file: "a.md" },
      { type: "page", file: "b.md" }
    ]);
  });

  it("parses an openapi entry into an openapi page with its title", () => {
    expect(parseManifest('- openapi: api/chat.json\n  title: "Chat and Agent"\n')).toEqual([
      { type: "page", file: "api/chat.json", openapi: true, title: "Chat and Agent" }
    ]);
  });

  it("parses an openapi entry without a title", () => {
    expect(parseManifest("- openapi: api/chat.json\n")).toEqual([
      { type: "page", file: "api/chat.json", openapi: true }
    ]);
  });

  it("throws if an entry combines openapi with file or section", () => {
    expect(() => parseManifest("- openapi: a.json\n  file: b.md")).toThrow();
    expect(() => parseManifest("- openapi: a.json\n  section: X")).toThrow();
  });

  it("throws if an entry has neither section nor file", () => {
    expect(() => parseManifest("- foo: bar")).toThrow();
  });

  it("throws if an entry has both section and file", () => {
    expect(() => parseManifest("- section: X\n  file: y.md")).toThrow();
  });

  it("throws if the top level is not a list", () => {
    expect(() => parseManifest("foo: bar")).toThrow();
  });
});
