import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToDocx } from "../../src/export/docx.js";

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
});
