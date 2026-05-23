import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { run } from "../util/exec.js";

const PAGEDJS_BIN = fileURLToPath(
  new URL("../../node_modules/.bin/pagedjs-cli", import.meta.url)
);

/** Render a full HTML document to a paginated PDF via Paged.js. */
export async function htmlToPdf(html: string, outPath: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "quire-html-"));
  const htmlPath = join(dir, "input.html");
  try {
    await writeFile(htmlPath, html, "utf8");
    await run(PAGEDJS_BIN, [htmlPath, "-o", outPath], {
      env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: puppeteer.executablePath() }
    });
  } catch (err) {
    await rm(outPath, { force: true }).catch(() => {});
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
