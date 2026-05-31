import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToDocx, insertFrontMatterSection, enableUpdateFields, stripDataUriDescriptions, moveCoverToFront } from "../../src/export/docx.js";
import JSZip from "jszip";
import { compileDocxReference } from "../../src/theme/compile-docx-ref.js";
import type { BrandTokens } from "../../src/theme/tokens.js";

describe("htmlToDocx", () => {
  it("produces a real .docx file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-docx-"));
    const out = join(dir, "out.docx");
    await htmlToDocx("<!doctype html><html><body><h1>Hi</h1></body></html>", out);

    const bytes = await readFile(out);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");

    await rm(dir, { recursive: true, force: true });
  });

  it("produces a real .docx file with toc: true", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-docx-toc-"));
    const out = join(dir, "out.docx");
    const html = "<!doctype html><html><body><h1>Hello</h1><p>World</p></body></html>";
    await htmlToDocx(html, out, { toc: true });

    const bytes = await readFile(out);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");

    await rm(dir, { recursive: true, force: true });
  });

  it("produces a real .docx file with referenceDoc", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-docx-ref-"));
    const refOut = join(dir, "ref.docx");
    const out = join(dir, "out.docx");

    const tokens: BrandTokens = {
      page: { size: "A4", margin: "2cm" },
      colors: {
        text: "#1a1a1a",
        heading: "#CC0000",
        link: "#2563eb",
        accent: "#2563eb",
        muted: "#6b7280",
        surface: "#f2f2f2",
        border: "#d9d9d9",
      },
      semantic: { success: "#15803d", caution: "#b45309", danger: "#b91c1c" },
      shape: { radius: "4px" },
      typography: {
        bodyFont: "Arial, sans-serif",
        headingFont: "Verdana, sans-serif",
        monoFont: "Courier New, monospace",
        baseSize: "11pt",
        lineHeight: 1.5,
      },
      toc: { title: "Contents", depth: 3 },
      headings: { scale: [2, 1.5, 1.25, 1.1, 1, 0.85], weight: [700, 700, 600, 600, 600, 600] },
      links: { underline: true },
      density: "normal",
      header: { left: "docTitle", center: "none", right: "chapter" },
      footer: { left: "none", center: "pageNumber", right: "none" },
      furniture: { fontSize: "9pt", color: "#6b7280" },
      pageNumbers: { restartAtBody: true },
      meta: { showDescription: true },
      tables: { layout: "fixed" },
      brand: {},
    };

    await compileDocxReference(tokens, refOut);
    const html = "<!doctype html><html><body><h1>Hello</h1><p>World</p></body></html>";
    await htmlToDocx(html, out, { referenceDoc: refOut });

    const bytes = await readFile(out);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");

    await rm(dir, { recursive: true, force: true });
  });
});

describe("enableUpdateFields", () => {
  it("inserts updateFields right after the settings root when absent", () => {
    const xml =
      '<?xml version="1.0"?><w:settings xmlns:w="x"><w:zoom w:percent="100" /></w:settings>';
    const out = enableUpdateFields(xml);
    expect(out).toContain('<w:updateFields w:val="true" />');
    // It must sit before the first existing child so Word reads it.
    expect(out.indexOf("<w:updateFields")).toBeLessThan(out.indexOf("<w:zoom"));
  });

  it("is idempotent (does not add a second element)", () => {
    const xml =
      '<w:settings xmlns:w="x"><w:updateFields w:val="true" /><w:zoom /></w:settings>';
    expect(enableUpdateFields(xml)).toBe(xml);
  });

  it("returns the input unchanged when there is no settings root", () => {
    const xml = "<w:notSettings />";
    expect(enableUpdateFields(xml)).toBe(xml);
  });
});

describe("stripDataUriDescriptions", () => {
  it("clears a base64 data: URI that Pandoc dumped into a picture descr", () => {
    const xml =
      '<pic:cNvPr id="1" descr="data:image/png;base64,iVBORw0KAAAA" name="Picture" />' +
      '<a:blip r:embed="rId5" />';
    const out = stripDataUriDescriptions(xml);
    expect(out).toContain('descr=""');
    expect(out).not.toContain("base64");
    // The real image reference (the media relationship) is untouched.
    expect(out).toContain('r:embed="rId5"');
  });

  it("leaves a normal descr alone", () => {
    const xml = '<pic:cNvPr descr="A workflow diagram" />';
    expect(stripDataUriDescriptions(xml)).toBe(xml);
  });

  it("is a no-op when there are no data: descriptions", () => {
    const xml = "<w:document><w:body /></w:document>";
    expect(stripDataUriDescriptions(xml)).toBe(xml);
  });
});

describe("htmlToDocx updateFields", () => {
  it("bakes updateFields into settings.xml when requested", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-docx-uf-"));
    const out = join(dir, "out.docx");
    const html = "<!doctype html><html><body><h1>A</h1><p>x</p></body></html>";
    await htmlToDocx(html, out, { toc: true, updateFields: true });
    const zip = await JSZip.loadAsync(await readFile(out));
    const settings = await zip.file("word/settings.xml")!.async("string");
    expect(settings).toContain('<w:updateFields w:val="true"');
    await rm(dir, { recursive: true, force: true });
  });
});

describe("insertFrontMatterSection", () => {
  const doc = (sectPr: string) =>
    "<w:document><w:body>" +
    '<w:p><w:pPr><w:pStyle w:val="Title" /></w:pPr><w:r><w:t>Doc Title</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="TOC1" /></w:pPr><w:r><w:t>Chapter One 3</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>' +
    "<w:p><w:r><w:t>body</w:t></w:r></w:p>" +
    sectPr +
    "</w:body></w:document>";

  const bodySectPr =
    "<w:sectPr>" +
    '<w:headerReference w:type="default" r:id="rId90" />' +
    '<w:footerReference w:type="default" r:id="rId91" />' +
    '<w:pgSz w:w="11906" w:h="16838" />' +
    "</w:sectPr>";

  it("splits the doc into two sections at the first Heading1", () => {
    const out = insertFrontMatterSection(doc(bodySectPr));
    expect(out).not.toBe(doc(bodySectPr));
    expect(out.match(/<w:sectPr\b/g) ?? []).toHaveLength(2);
    // The break is inserted before the first Heading1 paragraph.
    const firstSect = out.indexOf("<w:sectPr");
    const h1 = out.indexOf('<w:pStyle w:val="Heading1"');
    expect(firstSect).toBeLessThan(h1);
  });

  it("leaves the front-matter section without header/footer references", () => {
    const out = insertFrontMatterSection(doc(bodySectPr));
    // Only the body section keeps the header/footer references.
    expect(out.match(/<w:headerReference\b/g) ?? []).toHaveLength(1);
    expect(out.match(/<w:footerReference\b/g) ?? []).toHaveLength(1);
    // The front-matter section keeps the page geometry but no furniture.
    const frontSect = out.slice(out.indexOf("<w:sectPr"), out.indexOf("</w:sectPr>") + 11);
    expect(frontSect).toContain("<w:pgSz");
    expect(frontSect).not.toContain("headerReference");
    // The final (body) section retains the references.
    const bodySect = out.slice(out.lastIndexOf("<w:sectPr"));
    expect(bodySect).toContain("headerReference");
  });

  it("restarts the body section's page numbering at 1 (front matter keeps default)", () => {
    const out = insertFrontMatterSection(doc(bodySectPr));
    // The body (final) section restarts numbering at 1.
    const bodySect = out.slice(out.lastIndexOf("<w:sectPr"));
    expect(bodySect).toContain('<w:pgNumType w:start="1" />');
    // The front-matter section has no pgNumType (its pages are unnumbered anyway).
    const frontSect = out.slice(out.indexOf("<w:sectPr"), out.indexOf("</w:sectPr>") + 11);
    expect(frontSect).not.toContain("pgNumType");
  });

  it("returns the input unchanged when there is no Heading1", () => {
    const noH1 =
      "<w:document><w:body>" +
      '<w:p><w:pPr><w:pStyle w:val="Title" /></w:pPr><w:r><w:t>Only a title</w:t></w:r></w:p>' +
      bodySectPr +
      "</w:body></w:document>";
    expect(insertFrontMatterSection(noH1)).toBe(noH1);
  });

  it("returns the input unchanged when there is no body sectPr", () => {
    const noSect =
      "<w:document><w:body>" +
      '<w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>Ch</w:t></w:r></w:p>' +
      "</w:body></w:document>";
    expect(insertFrontMatterSection(noSect)).toBe(noSect);
  });

  it("insertFrontMatterSection restarts body numbering only when restartAtBody is true", () => {
    const doc =
      `<w:document><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr></w:p>` +
      `<w:sectPr><w:headerReference w:type="default" r:id="rId90" />` +
      `<w:footerReference w:type="default" r:id="rId91" />` +
      `<w:pgSz w:w="11906" w:h="16838" /></w:sectPr>` +
      `</w:body></w:document>`;
    expect(insertFrontMatterSection(doc, true)).toContain('<w:pgNumType w:start="1" />');
    expect(insertFrontMatterSection(doc, false)).not.toContain("<w:pgNumType");
  });
});

describe("htmlToDocx tocDepth", () => {
  // Pandoc emits the TOC depth range in the field instruction as `\o "1-N"`.
  // In the raw XML this appears as `&quot;1-N&quot;` (XML-escaped quotes).
  // --toc-depth=2 → &quot;1-2&quot;; --toc-depth=3 → &quot;1-3&quot;.
  it("passes tocDepth=2 to pandoc, producing a TOC field limited to 1-2", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-docx-toc-depth-"));
    const out = join(dir, "out.docx");
    const html =
      "<!doctype html><html><body>" +
      "<h1>Ch</h1><h2>Sec</h2><h3>Sub</h3><p>body</p>" +
      "</body></html>";
    await htmlToDocx(html, out, { toc: true, tocDepth: 2 });
    const zip = await JSZip.loadAsync(await readFile(out));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("&quot;1-2&quot;");
    expect(xml).not.toContain("&quot;1-3&quot;");
    await rm(dir, { recursive: true, force: true });
  });

  it("passes tocDepth=3 to pandoc, producing a TOC field covering 1-3", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-docx-toc-depth3-"));
    const out = join(dir, "out.docx");
    const html =
      "<!doctype html><html><body>" +
      "<h1>Ch</h1><h2>Sec</h2><h3>Sub</h3><p>body</p>" +
      "</body></html>";
    await htmlToDocx(html, out, { toc: true, tocDepth: 3 });
    const zip = await JSZip.loadAsync(await readFile(out));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("&quot;1-3&quot;");
    await rm(dir, { recursive: true, force: true });
  });

  it("defaults to 1-3 when tocDepth is omitted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-docx-toc-default-"));
    const out = join(dir, "out.docx");
    const html =
      "<!doctype html><html><body>" +
      "<h1>Ch</h1><h2>Sec</h2><h3>Sub</h3><p>body</p>" +
      "</body></html>";
    await htmlToDocx(html, out, { toc: true });
    const zip = await JSZip.loadAsync(await readFile(out));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("&quot;1-3&quot;");
    await rm(dir, { recursive: true, force: true });
  });
});

describe("moveCoverToFront", () => {
  // Mirrors the real Pandoc order: a metadata Title paragraph, then the TOC sdt,
  // then the cover paragraphs, then the body Heading1s. The cover now uses one
  // per-element custom-style each (Quire Cover Product/Title/Version -> pStyle
  // QuireCoverProduct/Title/Version), so the relocated run spans DISTINCT styles
  // that share the "QuireCover" prefix, not a single repeated style.
  const doc =
    "<w:document><w:body>" +
    '<w:p><w:pPr><w:pStyle w:val="Title" /></w:pPr><w:r><w:t>My Manual</w:t></w:r></w:p>' +
    "<w:sdt><w:sdtContent>" +
    '<w:p><w:pPr><w:pStyle w:val="TOCHeading" /></w:pPr><w:r><w:t>Contents</w:t></w:r></w:p>' +
    "</w:sdtContent></w:sdt>" +
    '<w:p><w:pPr><w:pStyle w:val="QuireCoverProduct" /></w:pPr><w:r><w:t>ACME</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="QuireCoverTitle" /></w:pPr><w:r><w:t>My Manual</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="QuireCoverVersion" /></w:pPr><w:r><w:t>v1.2.3</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>' +
    "</w:body></w:document>";

  // Matches any cover paragraph style (QuireCoverProduct, QuireCoverTitle, ...).
  const coverStyle = /w:val="QuireCover[A-Za-z]*"/g;

  it("moves the cover block ahead of the TOC", () => {
    const out = moveCoverToFront(doc);
    const firstCover = out.search(coverStyle);
    const toc = out.indexOf("<w:sdt>");
    expect(firstCover).toBeLessThan(toc);
  });

  it("removes Pandoc's auto Title paragraph", () => {
    const out = moveCoverToFront(doc);
    // The metadata Title para is gone, but the QuireCoverTitle style (which only
    // contains "Title" as a substring) must survive.
    expect(out).not.toContain('w:val="Title"');
    // All three cover paragraphs survive, each with its own style.
    expect(out.match(coverStyle) ?? []).toHaveLength(3);
  });

  it("inserts a page break between the cover and the TOC", () => {
    const out = moveCoverToFront(doc);
    const pageBreak = out.indexOf('<w:br w:type="page"');
    const lastCover = [...out.matchAll(coverStyle)].at(-1)!.index;
    const toc = out.indexOf("<w:sdt>");
    expect(lastCover).toBeLessThan(pageBreak);
    expect(pageBreak).toBeLessThan(toc);
  });

  it("keeps the body Heading1 after the TOC", () => {
    const out = moveCoverToFront(doc);
    expect(out.indexOf("<w:sdt>")).toBeLessThan(out.indexOf('w:val="Heading1"'));
  });

  it("returns the input unchanged when there is no cover block", () => {
    const noCover =
      "<w:document><w:body>" +
      '<w:p><w:pPr><w:pStyle w:val="Title" /></w:pPr><w:r><w:t>T</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>Ch</w:t></w:r></w:p>' +
      "</w:body></w:document>";
    expect(moveCoverToFront(noCover)).toBe(noCover);
  });
});
