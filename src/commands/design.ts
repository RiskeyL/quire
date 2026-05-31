import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

export interface DesignDeps {
  /** Path to the prebuilt designer HTML (default: dist/designer.html beside the CLI). */
  designerHtmlPath?: string;
  /** Opens a file URL in the browser (default: platform opener). Seam for tests. */
  openInBrowser?: (fileUrl: string) => void;
}

function defaultOpen(fileUrl: string): void {
  const platform = process.platform;
  let cmd: string;
  let args: string[];

  if (platform === "darwin") {
    cmd = "open";
    args = [fileUrl];
  } else if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", fileUrl];
  } else {
    cmd = "xdg-open";
    args = [fileUrl];
  }

  const child = spawn(cmd, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export async function runDesign(
  themePath: string | undefined,
  deps?: DesignDeps
): Promise<void> {
  // Resolve the prebuilt designer path.
  // From dist/commands/design.js, ../designer.html resolves to dist/designer.html.
  const designerPath =
    deps?.designerHtmlPath ??
    fileURLToPath(new URL("../designer.html", import.meta.url));

  if (!existsSync(designerPath)) {
    throw new Error(
      `Designer not built. Run "npm run build:designer" first.`
    );
  }

  let designerHtml = await readFile(designerPath, "utf8");

  let targetPath: string;

  if (themePath) {
    const yamlText = await readFile(themePath, "utf8");

    // Escape </script> sequences so the YAML cannot break out of the inline script.
    const safeJson = JSON.stringify(yamlText).replace(/<\//g, "<\\/");

    const injectionScript = `<script>window.__QUIRE_INITIAL_THEME__ = ${safeJson};</script>`;

    // Insert the injection script immediately before the bundle <script> tag.
    // The bundle is the first <script> in the body that is not the injection.
    const bundleScriptIdx = designerHtml.indexOf("<script>");
    if (bundleScriptIdx === -1) {
      throw new Error("Could not locate bundle <script> tag in designer HTML.");
    }

    const injectedHtml =
      designerHtml.slice(0, bundleScriptIdx) +
      injectionScript +
      designerHtml.slice(bundleScriptIdx);

    const base = basename(themePath, ".yaml").replace(/[^a-zA-Z0-9_-]/g, "_");
    targetPath = join(tmpdir(), `quire-designer-${base}.html`);
    await writeFile(targetPath, injectedHtml, "utf8");
  } else {
    targetPath = designerPath;
  }

  const fileUrl = pathToFileURL(targetPath).href;
  console.log(`Opening the Quire theme designer (${targetPath})`);

  const opener = deps?.openInBrowser ?? defaultOpen;
  opener(fileUrl);
}
