import { describe, it, expect } from "vitest";
import { writeFile, mkdtemp, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import { runConvert } from "../../src/commands/convert.js";
import { loadTheme } from "../../src/theme/tokens.js";

// ---------------------------------------------------------------------------
// Sample theme file round-trip
// ---------------------------------------------------------------------------

describe("examples/dify.brand.yaml", () => {
  it("loads and validates without throwing", async () => {
    const samplePath = resolve(process.cwd(), "examples/dify.brand.yaml");
    const tokens = await loadTheme(samplePath);
    // Spot-check a couple of values from the sample file
    expect(tokens.page.size).toBe("A4");
    expect(tokens.colors.heading).toBe("#111827");
    expect(tokens.toc.title).toBe("Contents");
    expect(tokens.typography.baseSize).toBe("11pt");
  });
});

// ---------------------------------------------------------------------------
// Themed end-to-end: --theme reaches the Word output
// ---------------------------------------------------------------------------

describe("runConvert with --theme", () => {
  it("applies the theme's heading color to the exported .docx styles.xml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-theme-e2e-"));
    try {
      // Two small markdown pages
      await writeFile(join(dir, "a.md"), "# Alpha\n\nFirst page.", "utf8");
      await writeFile(join(dir, "b.md"), "# Beta\n\nSecond page.", "utf8");

      // Manifest referencing both pages
      const manifest = join(dir, "m.yaml");
      await writeFile(manifest, "- file: a.md\n- file: b.md\n", "utf8");

      // Theme with a distinctive heading color that won't appear by coincidence
      const themeFile = join(dir, "theme.yaml");
      await writeFile(themeFile, "colors:\n  heading: \"#FF0000\"\n", "utf8");

      const out = join(dir, "output");
      await runConvert([], { format: "both", manifest, out, theme: themeFile });

      // Both output files must exist
      await access(`${out}.pdf`);
      await access(`${out}.docx`);

      // The heading color must have been applied to word/styles.xml in the docx
      const docxBuffer = await readFile(`${out}.docx`);
      const zip = await JSZip.loadAsync(docxBuffer);
      const stylesFile = zip.file("word/styles.xml");
      expect(stylesFile).not.toBeNull();
      const stylesXml = await stylesFile!.async("string");
      expect(stylesXml).toContain("FF0000");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);
});

// ---------------------------------------------------------------------------
// PDF-only themed run: compileCss + tocTitle path, no docx produced
// ---------------------------------------------------------------------------

describe("runConvert with --theme, format: pdf", () => {
  it("produces .pdf but NOT .docx for a pdf-only themed run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-theme-pdf-"));
    try {
      const src = join(dir, "page.md");
      await writeFile(src, "# PDF Only\n\nThemed PDF run.", "utf8");

      const themeFile = join(dir, "theme.yaml");
      await writeFile(themeFile, "colors:\n  heading: \"#003366\"\n", "utf8");

      const out = join(dir, "output");
      await runConvert([src], { format: "pdf", out, theme: themeFile });

      await access(`${out}.pdf`);

      // .docx must NOT be produced
      let docxExists = false;
      try {
        await access(`${out}.docx`);
        docxExists = true;
      } catch {
        // expected — file should not exist
      }
      expect(docxExists).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);
});

// ---------------------------------------------------------------------------
// Non-themed run still produces output (default path with reference doc)
// ---------------------------------------------------------------------------

describe("runConvert without --theme (default tokens)", () => {
  it("still produces .pdf and .docx when no theme is specified", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-default-theme-"));
    const src = join(dir, "page.md");
    await writeFile(src, "# Hello\n\nDefault theme run.", "utf8");

    try {
      await runConvert([src], { format: "both" });
      await access(join(dir, "page.pdf"));
      await access(join(dir, "page.docx"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120000);
});

// ---------------------------------------------------------------------------
// showDescription precedence: CLI override beats token default
// ---------------------------------------------------------------------------

describe("showDescription precedence", () => {
  it("description: false (--no-description) suppresses the lede even when token default is true", async () => {
    // This is a focused unit test on the precedence expression without a full render.
    // We verify the assembled HTML doesn't contain the lede when description=false is passed.
    const { assembleDocument } = await import("../../src/assemble/assemble.js");
    const tree = [
      { type: "page" as const, file: "p.md", title: "Page", description: "A visible lede." },
    ];
    const rendered = new Map([["p.md", "<p>content</p>"]]);

    // Token default is true, but CLI passes false — the lede must NOT appear.
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: false,
      showDescription: false,
    });
    expect(html).not.toContain('class="page-description"');
  });

  it("description: undefined falls through to the token value (true by default) and shows the lede", async () => {
    const { assembleDocument } = await import("../../src/assemble/assemble.js");
    const tree = [
      { type: "page" as const, file: "p.md", title: "Page", description: "Visible lede." },
    ];
    const rendered = new Map([["p.md", "<p>content</p>"]]);

    // Simulate: options.description is undefined, token default is true → ?? gives true.
    const tokenDefault = true;
    const showDescription = undefined ?? tokenDefault;
    const html = assembleDocument(tree, rendered, {
      title: "Doc",
      cover: false,
      showDescription,
    });
    expect(html).toContain(
      '<div class="page-description" custom-style="Page Description">Visible lede.</div>'
    );
  });
});
