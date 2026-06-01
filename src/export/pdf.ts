import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import puppeteer from "puppeteer";
import { run } from "../util/exec.js";

const require = createRequire(import.meta.url);

/**
 * Locate the pagedjs-cli entry script through Node's module resolution instead of a fixed
 * relative path. This works whether node_modules is nested (a dev checkout) or hoisted to
 * the top level (a consumer or global install), which a hardcoded path does not. We
 * resolve the package's main entry (its exports map blocks the package.json subpath) and
 * walk up to the package root to read its bin.
 */
function resolvePagedjsCli(): string {
  const mainEntry = require.resolve("pagedjs-cli");
  let root = dirname(mainEntry);
  while (!existsSync(join(root, "package.json"))) {
    const parent = dirname(root);
    if (parent === root) throw new Error("could not locate the pagedjs-cli package root");
    root = parent;
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name?: string;
    bin?: string | Record<string, string>;
  };
  if (pkg.name !== "pagedjs-cli") {
    throw new Error(`expected the pagedjs-cli package root, found "${pkg.name ?? "unknown"}"`);
  }
  const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["pagedjs-cli"];
  if (!rel) throw new Error("pagedjs-cli exposes no bin entry");
  return join(root, rel);
}

/** Render a full HTML document to a paginated PDF via Paged.js. */
export async function htmlToPdf(html: string, outPath: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "quire-html-"));
  const htmlPath = join(dir, "input.html");
  try {
    await writeFile(htmlPath, html, "utf8");
    // Spawn the CLI with the current Node binary so we never depend on the bin symlink's
    // location or its executable bit.
    await run(process.execPath, [resolvePagedjsCli(), htmlPath, "-o", outPath], {
      env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: puppeteer.executablePath() }
    });
  } catch (err) {
    await rm(outPath, { force: true }).catch(() => {});
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
