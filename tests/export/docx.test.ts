import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToDocx } from "../../src/export/docx.js";
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
