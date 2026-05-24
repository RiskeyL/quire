import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToDocx, insertFrontMatterSection } from "../../src/export/docx.js";
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
      },
      typography: {
        bodyFont: "Arial, sans-serif",
        headingFont: "Verdana, sans-serif",
        monoFont: "Courier New, monospace",
        baseSize: "11pt",
        lineHeight: 1.5,
      },
      toc: { title: "Contents" },
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
});
