import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

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

export interface PdfProgress {
  /** Paged.js finished laying out the document; `pages` is the printed page count. */
  onLaidOut?: (pages: number) => void;
}

/** Render a full HTML document to a paginated PDF via Paged.js. */
export async function htmlToPdf(html: string, outPath: string, progress?: PdfProgress): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "quire-html-"));
  const htmlPath = join(dir, "input.html");
  try {
    await writeFile(htmlPath, html, "utf8");
    await runPagedjs([resolvePagedjsCli(), htmlPath, "-o", outPath], progress);
  } catch (err) {
    await rm(outPath, { force: true }).catch(() => {});
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * Spawn pagedjs-cli with the current Node binary (so we never depend on the bin symlink's
 * location or its executable bit). Its stderr is piped and discarded rather than inherited,
 * so its own spinner does not compete with Quire's checklist; the one line we care about,
 * "Rendering N pages took…", is parsed to report the printed page count. NODE_NO_WARNINGS
 * silences a deprecation notice pagedjs-cli would otherwise print. On failure the tail of
 * stderr is included in the thrown error so the cause is still visible.
 */
function runPagedjs(args: string[], progress?: PdfProgress): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        PUPPETEER_EXECUTABLE_PATH: puppeteer.executablePath(),
        NODE_NO_WARNINGS: "1"
      }
    });
    let pending = "";
    let tail = "";
    let reported = false;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      tail = (tail + chunk).slice(-4000);
      pending += chunk;
      const segments = pending.split(/[\r\n]+/);
      pending = segments.pop() ?? "";
      for (const seg of segments) {
        const m = seg.replace(ANSI, "").match(/Rendering\s+(\d+)\s+pages\s+took/i);
        if (m && !reported) {
          reported = true;
          progress?.onLaidOut?.(Number(m[1]));
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pagedjs-cli exited with code ${code}${tail.trim() ? `\n${tail.trim()}` : ""}`))
    );
  });
}
