import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, assertBinary } from "../util/exec.js";

/** Render a full HTML document to a Word file via Pandoc. */
export async function htmlToDocx(html: string, outPath: string): Promise<void> {
  await assertBinary("pandoc", "Install it with: brew install pandoc");
  const dir = await mkdtemp(join(tmpdir(), "quire-html-"));
  const htmlPath = join(dir, "input.html");
  try {
    await writeFile(htmlPath, html, "utf8");
    await run("pandoc", [htmlPath, "-f", "html", "-o", outPath]);
  } catch (err) {
    await rm(outPath, { force: true }).catch(() => {});
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
