import { describe, it, expect } from "vitest";
import { renderCover } from "../../src/assemble/cover.js";
import type { CoverMeta } from "../../src/assemble/cover.js";

describe("renderCover (cover module direct import)", () => {
  it("PDF default: contains class=\"cover\", title text, spine div, h1 with quire-cover id, and cover-rule", () => {
    const html = renderCover({ title: "My Doc" });
    expect(html).toContain('class="cover"');
    expect(html).toContain("My Doc");
    expect(html).toContain('<div class="cover-spine"></div>');
    expect(html).toContain('<h1 class="doc-title" id="quire-cover">');
    expect(html).toContain('<div class="cover-rule">');
  });

  it("layout plain omits cover-spine; layout spine (and default) includes it", () => {
    expect(renderCover({ title: "T", layout: "plain" })).not.toContain("cover-spine");
    expect(renderCover({ title: "T", layout: "spine" })).toContain('<div class="cover-spine"></div>');
    expect(renderCover({ title: "T" })).toContain('<div class="cover-spine"></div>');
  });

  it("blank optional fields are omitted (whitespace-only productName, empty version)", () => {
    const html = renderCover({ title: "My Doc", productName: "  ", version: "" });
    expect(html).not.toContain("cover-product");
    expect(html).not.toContain("cover-meta");
  });

  it("HTML-escapes the title", () => {
    expect(renderCover({ title: "A & B <x>" })).toContain("A &amp; B &lt;x&gt;");
  });

  it("PDF: optional fields render their markup (escaped) when present", () => {
    const html = renderCover({
      title: "My Doc",
      productName: "Docs & Co",
      version: "v1.0",
      date: "2026-05-31",
      url: "docs.dify.ai",
      logoDataUri: "data:image/png;base64,AAA",
    });
    expect(html).toContain('<p class="cover-product">Docs &amp; Co</p>');
    expect(html).toContain('<span class="cover-version">v1.0</span>');
    expect(html).toContain('<span class="cover-date">2026-05-31</span>');
    expect(html).toContain('<p class="cover-footer">docs.dify.ai</p>');
    expect(html).toContain('<img class="cover-logo" src="data:image/png;base64,AAA"');
  });

  it("Word path: contains custom-style=\"Quire Cover Title\" div, no cover-spine, and logoWidth flows to width attribute", () => {
    const html = renderCover({
      title: "T",
      forWord: true,
      logoDataUri: "data:image/png;base64,AAA",
      logoWidth: "30mm",
    });
    expect(html).toContain('custom-style="Quire Cover Title"');
    expect(html).not.toContain("cover-spine");
    expect(html).toContain('width="30mm"');
  });

  it("Word path: logoWidth defaults to 44mm when not specified", () => {
    const html = renderCover({
      title: "T",
      forWord: true,
      logoDataUri: "data:image/png;base64,AAA",
    });
    expect(html).toContain('width="44mm"');
  });

  // Verify CoverMeta type is importable (type-level check exercised at compile time;
  // this runtime assertion confirms the value-level export is a function).
  it("CoverMeta type is importable and renderCover is a function", () => {
    const meta: CoverMeta = { title: "Type check" };
    expect(typeof renderCover).toBe("function");
    expect(renderCover(meta)).toContain("Type check");
  });
});
