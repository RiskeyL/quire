import { describe, it, expect } from "vitest";
import { writeFile, mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConvert } from "../../src/commands/convert.js";

describe("runConvert multi-page assembly", () => {
  it("combines a manifest of pages into one pdf and one docx", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-assemble-"));
    await writeFile(join(dir, "a.md"), "# Alpha\n\nFirst page.", "utf8");
    await writeFile(join(dir, "b.md"), "# Beta\n\nSecond page.", "utf8");
    await writeFile(join(dir, "m.yaml"),
      '- section: "Part One"\n  children:\n    - file: a.md\n    - file: b.md\n', "utf8");

    await runConvert([], { format: "both", manifest: join(dir, "m.yaml"), out: join(dir, "combined") });
    try {
      await access(join(dir, "combined.pdf"));
      await access(join(dir, "combined.docx"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
