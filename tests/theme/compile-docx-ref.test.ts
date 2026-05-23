import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import {
  compileDocxReference,
  firstFontFamily,
  ptToHalfPoints,
  hexColor,
  pageSizeToTwips,
  marginToTwips,
} from "../../src/theme/compile-docx-ref.js";
import { htmlToDocx } from "../../src/export/docx.js";
import type { BrandTokens } from "../../src/theme/tokens.js";

// Distinctive tokens for easy assertion — values chosen to not appear in pandoc defaults.
const CUSTOM_TOKENS: BrandTokens = {
  page: { size: "A4", margin: "2cm" },
  colors: {
    text: "#1a1a1a",
    heading: "#FF0000",
    link: "#2563eb",
    accent: "#2563eb",
    muted: "#6b7280",
  },
  typography: {
    bodyFont: "Arial, sans-serif",
    headingFont: "Verdana, sans-serif",
    monoFont: "Courier New, monospace",
    baseSize: "13pt",
    lineHeight: 1.5,
  },
  toc: { title: "Contents" },
  meta: { showDescription: true },
};

describe("compileDocxReference", () => {
  it("produces a valid .docx (PK header)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out);
      const bytes = await readFile(out);
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("patches heading color into the Heading1 style block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out);
      const bytes = await readFile(out);
      const zip = await JSZip.loadAsync(bytes);
      const stylesXml = await zip.file("word/styles.xml")!.async("string");
      // Extract the Heading1 style block and assert the color is present within it
      const heading1Match = stylesXml.match(/<w:style[^>]*w:styleId="Heading1"[^>]*>[\s\S]*?<\/w:style>/);
      expect(heading1Match).not.toBeNull();
      const heading1Block = heading1Match![0];
      expect(heading1Block).toContain("FF0000");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("patches body font into docDefaults rFonts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out);
      const bytes = await readFile(out);
      const zip = await JSZip.loadAsync(bytes);
      const stylesXml = await zip.file("word/styles.xml")!.async("string");
      // Extract docDefaults block and assert Arial is present within it
      const docDefaultsMatch = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
      expect(docDefaultsMatch).not.toBeNull();
      const docDefaultsBlock = docDefaultsMatch![0];
      expect(docDefaultsBlock).toContain('w:ascii="Arial"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("patches heading font into the Heading1 style block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out);
      const bytes = await readFile(out);
      const zip = await JSZip.loadAsync(bytes);
      const stylesXml = await zip.file("word/styles.xml")!.async("string");
      // Extract the Heading1 style block and assert the heading font is present within it
      const heading1Match = stylesXml.match(/<w:style[^>]*w:styleId="Heading1"[^>]*>[\s\S]*?<\/w:style>/);
      expect(heading1Match).not.toBeNull();
      const heading1Block = heading1Match![0];
      expect(heading1Block).toContain("Verdana");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("patches base size into docDefaults (13pt → half-points 26)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out);
      const bytes = await readFile(out);
      const zip = await JSZip.loadAsync(bytes);
      const stylesXml = await zip.file("word/styles.xml")!.async("string");
      // 13pt × 2 = 26 half-points; should appear in docDefaults rPr
      const docDefaultsMatch = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
      expect(docDefaultsMatch).not.toBeNull();
      const docDefaultsBlock = docDefaultsMatch![0];
      expect(docDefaultsBlock).toContain('w:val="26"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("end-to-end: branded reference doc propagates heading color and body font into output docx", async () => {
    // This test verifies the "swapping the reference file changes Word output" claim.
    const dir = await mkdtemp(join(tmpdir(), "quire-e2e-"));
    const ref = join(dir, "ref.docx");
    const out = join(dir, "out.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, ref);
      const html = "<!doctype html><html><body><h1>Heading</h1><p>Body text.</p></body></html>";
      await htmlToDocx(html, out, { referenceDoc: ref });
      const bytes = await readFile(out);
      expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
      const zip = await JSZip.loadAsync(bytes);
      const stylesEntry = zip.file("word/styles.xml");
      expect(stylesEntry).not.toBeNull();
      const stylesXml = await stylesEntry!.async("string");
      // Branded heading color and body font must appear in the output docx's styles.xml
      expect(stylesXml).toContain("FF0000");
      expect(stylesXml).toContain("Arial");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("non-hex heading color (named color) skips color patch but still produces valid docx", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-nohex-"));
    const out = join(dir, "ref.docx");
    const tokensNonHex: BrandTokens = {
      ...CUSTOM_TOKENS,
      colors: { ...CUSTOM_TOKENS.colors, heading: "red" },
    };
    try {
      await compileDocxReference(tokensNonHex, out);
      const bytes = await readFile(out);
      // Output must still be a valid zip/docx even though color patch was skipped
      expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("patches pageBreakBefore into the Heading1 paragraph style so top-level chapters break", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-pbb-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out);
      const zip = await JSZip.loadAsync(await readFile(out));
      const stylesXml = await zip.file("word/styles.xml")!.async("string");
      const heading1 = stylesXml.match(
        /<w:style[^>]*w:styleId="Heading1"[^>]*>[\s\S]*?<\/w:style>/
      )![0];
      // pageBreakBefore must sit inside the Heading1 pPr.
      expect(heading1).toMatch(/<w:pPr>[\s\S]*<w:pageBreakBefore\s*\/>[\s\S]*<\/w:pPr>/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adds a header part with the doc title and a STYLEREF Heading 1 field", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-hdr-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out, { docTitle: "Quire Sample Title" });
      const zip = await JSZip.loadAsync(await readFile(out));
      const headerFile = zip.file("word/header1.xml");
      expect(headerFile).not.toBeNull();
      const headerXml = await headerFile!.async("string");
      // Title text on the left.
      expect(headerXml).toContain("Quire Sample Title");
      // STYLEREF field for the current Heading 1 on the right.
      expect(headerXml).toMatch(/STYLEREF\s+"Heading 1"/);
      // Muted color + ~9pt styling.
      expect(headerXml).toContain('w:val="6B7280"');
      expect(headerXml).toContain('w:val="18"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adds a footer part with a centered PAGE field", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-ftr-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out, { docTitle: "T" });
      const zip = await JSZip.loadAsync(await readFile(out));
      const footerFile = zip.file("word/footer1.xml");
      expect(footerFile).not.toBeNull();
      const footerXml = await footerFile!.async("string");
      // PAGE field for the page number.
      expect(footerXml).toMatch(/<w:instrText[^>]*>\s*PAGE\s*<\/w:instrText>/);
      // Centered.
      expect(footerXml).toMatch(/<w:jc w:val="center"\s*\/>/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("wires header/footer into content-types, rels, and the sectPr references", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-wire-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out, { docTitle: "T" });
      const zip = await JSZip.loadAsync(await readFile(out));
      const ct = await zip.file("[Content_Types].xml")!.async("string");
      expect(ct).toContain("/word/header1.xml");
      expect(ct).toContain("/word/footer1.xml");
      const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
      expect(rels).toContain("header1.xml");
      expect(rels).toContain("footer1.xml");
      const doc = await zip.file("word/document.xml")!.async("string");
      const sectPr = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)![0];
      expect(sectPr).toMatch(/<w:headerReference[^>]*w:type="default"/);
      expect(sectPr).toMatch(/<w:footerReference[^>]*w:type="default"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("omits the header title text when no docTitle is supplied but still renders the STYLEREF chapter field", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-notitle-"));
    const out = join(dir, "ref.docx");
    try {
      // Backward-compatible 2-arg call: no options.
      await compileDocxReference(CUSTOM_TOKENS, out);
      const zip = await JSZip.loadAsync(await readFile(out));
      const headerXml = await zip.file("word/header1.xml")!.async("string");
      // STYLEREF still present even without a title.
      expect(headerXml).toMatch(/STYLEREF\s+"Heading 1"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("patches pgSz (A4 portrait) and pgMar (2cm => 1134 twips) into the sectPr", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-geom-"));
    const out = join(dir, "ref.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, out, { docTitle: "T" });
      const zip = await JSZip.loadAsync(await readFile(out));
      const doc = await zip.file("word/document.xml")!.async("string");
      const sectPr = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)![0];
      // A4 portrait.
      expect(sectPr).toMatch(/<w:pgSz[^>]*w:w="11906"/);
      expect(sectPr).toMatch(/<w:pgSz[^>]*w:h="16838"/);
      // 2cm = 1134 twips on all sides.
      expect(sectPr).toMatch(/<w:pgMar[^>]*w:top="1134"/);
      expect(sectPr).toMatch(/<w:pgMar[^>]*w:left="1134"/);
      expect(sectPr).toMatch(/<w:pgMar[^>]*w:right="1134"/);
      expect(sectPr).toMatch(/<w:pgMar[^>]*w:bottom="1134"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses Letter dimensions when the page size token is Letter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-letter-"));
    const out = join(dir, "ref.docx");
    const letterTokens: BrandTokens = {
      ...CUSTOM_TOKENS,
      page: { size: "Letter", margin: "1in" },
    };
    try {
      await compileDocxReference(letterTokens, out, { docTitle: "T" });
      const zip = await JSZip.loadAsync(await readFile(out));
      const doc = await zip.file("word/document.xml")!.async("string");
      const sectPr = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)![0];
      expect(sectPr).toMatch(/<w:pgSz[^>]*w:w="12240"/);
      expect(sectPr).toMatch(/<w:pgSz[^>]*w:h="15840"/);
      // 1in = 1440 twips.
      expect(sectPr).toMatch(/<w:pgMar[^>]*w:top="1440"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("end-to-end: pandoc preserves the header, footer, sectPr geometry and Heading1 break in the OUTPUT docx", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-cdr-e2e2-"));
    const ref = join(dir, "ref.docx");
    const out = join(dir, "out.docx");
    try {
      await compileDocxReference(CUSTOM_TOKENS, ref, { docTitle: "Doc Title" });
      const html =
        "<!doctype html><html><body><h1>Cover</h1><h1>Chapter A</h1><p>a</p><h1>Chapter B</h1><p>b</p></body></html>";
      await htmlToDocx(html, out, { referenceDoc: ref });
      const zip = await JSZip.loadAsync(await readFile(out));
      // Header/footer parts survive.
      expect(zip.file("word/header1.xml")).not.toBeNull();
      expect(zip.file("word/footer1.xml")).not.toBeNull();
      // sectPr in the OUTPUT carries refs + geometry.
      const doc = await zip.file("word/document.xml")!.async("string");
      const sectPr = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)![0];
      expect(sectPr).toMatch(/<w:headerReference/);
      expect(sectPr).toMatch(/<w:footerReference/);
      expect(sectPr).toMatch(/<w:pgSz/);
      expect(sectPr).toMatch(/<w:pgMar/);
      // Heading1 pageBreakBefore survives into the output styles.
      const styles = await zip.file("word/styles.xml")!.async("string");
      const heading1 = styles.match(
        /<w:style[^>]*w:styleId="Heading1"[^>]*>[\s\S]*?<\/w:style>/
      )![0];
      expect(heading1).toContain("pageBreakBefore");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Pure helper unit tests
// ---------------------------------------------------------------------------

describe("firstFontFamily", () => {
  it("returns the first font from a simple stack", () => {
    expect(firstFontFamily("Georgia, 'Times New Roman', serif")).toBe("Georgia");
  });

  it("strips single quotes from the first entry", () => {
    expect(firstFontFamily("'SFMono-Regular', Consolas, monospace")).toBe("SFMono-Regular");
  });

  it("strips double quotes from the first entry", () => {
    expect(firstFontFamily('"Courier New", monospace')).toBe("Courier New");
  });

  it("handles a single font name with no comma", () => {
    expect(firstFontFamily("Arial")).toBe("Arial");
  });

  it("trims whitespace", () => {
    expect(firstFontFamily("  Verdana , Arial ")).toBe("Verdana");
  });

  it("returns empty string for empty input", () => {
    expect(firstFontFamily("")).toBe("");
  });
});

describe("ptToHalfPoints", () => {
  it("converts 11pt to 22", () => {
    expect(ptToHalfPoints("11pt")).toBe(22);
  });

  it("converts 13pt to 26", () => {
    expect(ptToHalfPoints("13pt")).toBe(26);
  });

  it("handles bare integer (no unit)", () => {
    expect(ptToHalfPoints("12")).toBe(24);
  });

  it("falls back to 22 for unsupported units (e.g. px)", () => {
    expect(ptToHalfPoints("16px")).toBe(22);
  });
});

describe("hexColor", () => {
  it("returns 6-digit uppercase hex without # for #RRGGBB", () => {
    expect(hexColor("#FF0000")).toBe("FF0000");
    expect(hexColor("#2563eb")).toBe("2563EB");
    expect(hexColor("#1a1a1a")).toBe("1A1A1A");
  });

  it("expands #RGB to 6 digits", () => {
    expect(hexColor("#F00")).toBe("FF0000");
    expect(hexColor("#abc")).toBe("AABBCC");
  });

  it("returns null for named colors", () => {
    expect(hexColor("red")).toBeNull();
    expect(hexColor("blue")).toBeNull();
  });

  it("returns null for rgb() colors", () => {
    expect(hexColor("rgb(255,0,0)")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(hexColor("")).toBeNull();
  });
});

describe("pageSizeToTwips", () => {
  it("returns A4 portrait dimensions in twips", () => {
    expect(pageSizeToTwips("A4")).toEqual({ w: 11906, h: 16838 });
  });

  it("returns Letter portrait dimensions in twips", () => {
    expect(pageSizeToTwips("Letter")).toEqual({ w: 12240, h: 15840 });
  });
});

describe("marginToTwips", () => {
  it("converts a single cm value to twips on all four sides (2cm => 1134)", () => {
    expect(marginToTwips("2cm")).toEqual({ top: 1134, right: 1134, bottom: 1134, left: 1134 });
  });

  it("converts mm (10mm => 567)", () => {
    expect(marginToTwips("10mm")).toEqual({ top: 567, right: 567, bottom: 567, left: 567 });
  });

  it("converts inches (1in => 1440)", () => {
    expect(marginToTwips("1in")).toEqual({ top: 1440, right: 1440, bottom: 1440, left: 1440 });
  });

  it("converts points (72pt => 1440)", () => {
    expect(marginToTwips("72pt")).toEqual({ top: 1440, right: 1440, bottom: 1440, left: 1440 });
  });

  it("converts px (96px => 1440)", () => {
    expect(marginToTwips("96px")).toEqual({ top: 1440, right: 1440, bottom: 1440, left: 1440 });
  });

  it("handles the 2-value shorthand (vertical horizontal)", () => {
    // "2cm 1in" => top/bottom 2cm (1134), right/left 1in (1440)
    expect(marginToTwips("2cm 1in")).toEqual({ top: 1134, right: 1440, bottom: 1134, left: 1440 });
  });

  it("handles the 4-value shorthand (top right bottom left)", () => {
    expect(marginToTwips("1cm 2cm 3cm 4cm")).toEqual({
      top: 567,
      right: 1134,
      bottom: 1701,
      left: 2268,
    });
  });

  it("falls back to the 2cm default for an unparseable value", () => {
    expect(marginToTwips("garbage")).toEqual({ top: 1134, right: 1134, bottom: 1134, left: 1134 });
  });
});
