import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToPdf } from "../../src/export/pdf.js";

describe("htmlToPdf", () => {
  it("produces a real PDF file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-pdf-"));
    const out = join(dir, "out.pdf");
    await htmlToPdf("<!doctype html><html><body><h1>Hi</h1></body></html>", out);

    const bytes = await readFile(out);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    await rm(dir, { recursive: true, force: true });
  });
});
