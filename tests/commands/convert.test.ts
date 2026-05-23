import { describe, it, expect } from "vitest";
import { writeFile, mkdtemp, rm, access, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConvert } from "../../src/commands/convert.js";

describe("runConvert", () => {
  it("writes a pdf and a docx next to a single source file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-convert-"));
    const src = join(dir, "notes.md");
    await writeFile(src, "# Notes\n\nHello world.", "utf8");

    await runConvert([src], { format: "both" });

    await access(join(dir, "notes.pdf"));   // throws if missing
    await access(join(dir, "notes.docx"));  // throws if missing
    const pdfStat = await stat(join(dir, "notes.pdf"));
    const docxStat = await stat(join(dir, "notes.docx"));
    expect(pdfStat.size).toBeGreaterThan(0);
    expect(docxStat.size).toBeGreaterThan(0);

    await rm(dir, { recursive: true, force: true });
  });
});
