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
