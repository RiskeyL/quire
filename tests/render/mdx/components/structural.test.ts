import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

/**
 * Tests for structural list components: Tree and CheckList/CheckListItem.
 *
 * Tree — verified shape (https://mintlify.com/docs/components/tree):
 *   Uses dot-notation sub-components Tree.Folder and Tree.File.
 *   remark-mdx parses these as component names "Tree.Folder" and "Tree.File"
 *   (string literals with a dot), so the component map registers all three.
 *   Props used: name (string) on Folder and File. Dropped: defaultOpen, openable,
 *   icon (all web-only interactive props).
 *
 * CheckList/CheckListItem — Dify-custom (not a standard Mintlify component):
 *   Appears in the Dify docs repo; not listed at mintlify.com/docs/components.
 *   CheckList → <ul class="checklist">
 *   CheckListItem → <li class="checklist-item"> (id attribute dropped, ☐ glyph
 *   comes from CSS ::before, not from HTML text content).
 */

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

describe("Tree", () => {
  it("renders as a <ul class=\"tree\">", () => {
    const { html } = renderMdx(
      `<Tree><Tree.File name="README.md" /></Tree>`
    );
    expect(html).toMatch(/<ul\b[^>]*class="tree"[^>]*>/);
  });

  it("does not use the passthrough data-component wrapper", () => {
    const { html } = renderMdx(
      `<Tree><Tree.File name="README.md" /></Tree>`
    );
    expect(html).not.toContain("data-component");
  });

  it("Tree.File renders as a .tree-file list item", () => {
    const { html } = renderMdx(
      `<Tree><Tree.File name="README.md" /></Tree>`
    );
    expect(html).toMatch(/<li\b[^>]*class="tree-file"[^>]*>/);
  });

  it("Tree.File renders the name in a .tree-name span", () => {
    const { html } = renderMdx(
      `<Tree><Tree.File name="README.md" /></Tree>`
    );
    expect(html).toMatch(/<span\b[^>]*class="tree-name"[^>]*>README\.md<\/span>/);
  });

  it("Tree.Folder renders as a .tree-folder list item", () => {
    const { html } = renderMdx(
      `<Tree><Tree.Folder name="src"><Tree.File name="index.ts" /></Tree.Folder></Tree>`
    );
    expect(html).toMatch(/<li\b[^>]*class="tree-folder"[^>]*>/);
  });

  it("Tree.Folder renders the name with a trailing slash in .tree-name", () => {
    const { html } = renderMdx(
      `<Tree><Tree.Folder name="src"><Tree.File name="index.ts" /></Tree.Folder></Tree>`
    );
    expect(html).toMatch(/<span\b[^>]*class="tree-name"[^>]*>src\/<\/span>/);
  });

  it("Tree.Folder with children nests another <ul class=\"tree\"> inside the li", () => {
    const { html } = renderMdx(
      `<Tree><Tree.Folder name="src"><Tree.File name="index.ts" /></Tree.Folder></Tree>`
    );
    // The outer tree ul wraps a .tree-folder li; inside that li is another .tree ul
    expect(html).toMatch(
      /<li\b[^>]*class="tree-folder"[^>]*>[\s\S]*<ul\b[^>]*class="tree"[^>]*>/
    );
  });

  it("Tree.Folder with no children renders the name only (no nested ul)", () => {
    const { html } = renderMdx(
      `<Tree><Tree.Folder name="empty" /></Tree>`
    );
    // The .tree-folder li should exist
    expect(html).toMatch(/<li\b[^>]*class="tree-folder"[^>]*>/);
    // Its .tree-name span should be present with "empty/"
    expect(html).toMatch(/<span\b[^>]*class="tree-name"[^>]*>empty\/<\/span>/);
    // No nested <ul class="tree"> inside this particular folder item
    // (the outer top-level ul exists; we check no second .tree ul is present)
    const folderBlock = html.match(/<li\b[^>]*class="tree-folder"[^>]*>([\s\S]*?)<\/li>/)?.[0] ?? "";
    expect(folderBlock).not.toMatch(/<ul\b[^>]*class="tree"[^>]*>/);
  });

  it("mixed Tree: folder with nested file + top-level file", () => {
    const src = `<Tree>
<Tree.Folder name="src">
  <Tree.File name="index.ts" />
</Tree.Folder>
<Tree.File name="README.md" />
</Tree>`;
    const { html } = renderMdx(src);

    // Outer ul.tree wraps everything
    expect(html).toMatch(/<ul\b[^>]*class="tree"[^>]*>/);

    // Top-level .tree-folder for "src/"
    expect(html).toMatch(/<li\b[^>]*class="tree-folder"[^>]*>/);
    expect(html).toMatch(/<span\b[^>]*class="tree-name"[^>]*>src\/<\/span>/);

    // Nested ul.tree inside the folder containing "index.ts"
    expect(html).toMatch(
      /<li\b[^>]*class="tree-folder"[^>]*>[\s\S]*<ul\b[^>]*class="tree"[^>]*>[\s\S]*index\.ts[\s\S]*<\/ul>/
    );

    // Top-level .tree-file for "README.md"
    expect(html).toMatch(/<span\b[^>]*class="tree-name"[^>]*>README\.md<\/span>/);
  });

  it("dropped props: defaultOpen and openable do not appear in the output", () => {
    const { html } = renderMdx(
      `<Tree><Tree.Folder name="app" defaultOpen openable><Tree.File name="page.tsx" /></Tree.Folder></Tree>`
    );
    expect(html).not.toContain("defaultOpen");
    expect(html).not.toContain("openable");
  });
});

// ---------------------------------------------------------------------------
// CheckList / CheckListItem
// ---------------------------------------------------------------------------

describe("CheckList", () => {
  it("renders as a <ul class=\"checklist\">", () => {
    const { html } = renderMdx(
      `<CheckList><CheckListItem id="a">Do the thing</CheckListItem></CheckList>`
    );
    expect(html).toMatch(/<ul\b[^>]*class="checklist"[^>]*>/);
  });

  it("does not use the passthrough data-component wrapper", () => {
    const { html } = renderMdx(
      `<CheckList><CheckListItem id="a">Do the thing</CheckListItem></CheckList>`
    );
    expect(html).not.toContain("data-component");
  });

  it("is not an <ol> (unordered checklist, not numbered)", () => {
    const { html } = renderMdx(
      `<CheckList><CheckListItem id="a">task</CheckListItem></CheckList>`
    );
    expect(html).not.toMatch(/<ol\b[^>]*class="checklist"/);
  });
});

describe("CheckListItem", () => {
  it("renders as a <li class=\"checklist-item\">", () => {
    const { html } = renderMdx(
      `<CheckList><CheckListItem id="a">Do the thing</CheckListItem></CheckList>`
    );
    expect(html).toMatch(/<li\b[^>]*class="checklist-item"[^>]*>/);
  });

  it("renders the text content inside the li", () => {
    const { html } = renderMdx(
      `<CheckList><CheckListItem id="a">Do the thing</CheckListItem></CheckList>`
    );
    expect(html).toContain("Do the thing");
  });

  it("does NOT contain the ☐ glyph as literal HTML text (glyph comes from CSS ::before)", () => {
    const { html } = renderMdx(
      `<CheckList><CheckListItem id="a">Do the thing</CheckListItem></CheckList>`
    );
    // The checkbox glyph must NOT appear as a text node in the HTML output;
    // it is rendered exclusively via CSS content: "☐ " on ::before.
    expect(html).not.toContain("☐");
  });

  it("multiple items all render as .checklist-item", () => {
    const { html } = renderMdx(
      `<CheckList>
<CheckListItem id="a">First</CheckListItem>
<CheckListItem id="b">Second</CheckListItem>
<CheckListItem id="c">Third</CheckListItem>
</CheckList>`
    );
    const matches = html.match(/class="checklist-item"/g);
    expect(matches).toHaveLength(3);
  });

  it("id attribute does NOT appear in the HTML output (dropped as print-irrelevant anchor)", () => {
    const { html } = renderMdx(
      `<CheckList><CheckListItem id="privacy">Add privacy policy</CheckListItem></CheckList>`
    );
    // The id value "privacy" should not be an attribute on the rendered li
    expect(html).not.toMatch(/\bid="privacy"/);
  });

  it("li wraps the item text correctly — structure is ul.checklist > li.checklist-item > text", () => {
    const { html } = renderMdx(
      `<CheckList><CheckListItem id="a">Do the thing</CheckListItem></CheckList>`
    );
    expect(html).toMatch(
      /<ul\b[^>]*class="checklist"[^>]*>[\s\S]*<li\b[^>]*class="checklist-item"[^>]*>[\s\S]*Do the thing[\s\S]*<\/li>[\s\S]*<\/ul>/
    );
  });
});
