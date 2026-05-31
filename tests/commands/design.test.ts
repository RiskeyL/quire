import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runDesign } from "../../src/commands/design.js";

// Minimal designer HTML that contains the bundle <script> tag used for injection.
const FAKE_DESIGNER_HTML = `<!doctype html><html><head></head><body><div id="quire-app"></div><script>/*bundle*/console.log(1)</script></body></html>`;

describe("runDesign", () => {
  let tmpDir: string;
  let designerHtmlPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "quire-design-test-"));
    designerHtmlPath = join(tmpDir, "designer.html");
    await writeFile(designerHtmlPath, FAKE_DESIGNER_HTML, "utf8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("no theme: calls openInBrowser with a file URL pointing at the designer", async () => {
    const opened: string[] = [];
    await runDesign(undefined, {
      designerHtmlPath,
      openInBrowser: (url) => { opened.push(url); },
    });

    expect(opened).toHaveLength(1);
    const url = opened[0];
    expect(url.startsWith("file://")).toBe(true);
    // The URL should resolve back to the designerHtmlPath.
    expect(url).toBe(pathToFileURL(designerHtmlPath).href);
  });

  it("with theme: calls openInBrowser with a file URL to a temp file (not the original)", async () => {
    const themeYaml = 'colors:\n  link: "#abcdef"\n';
    const themeFile = join(tmpDir, "theme.yaml");
    await writeFile(themeFile, themeYaml, "utf8");

    const opened: string[] = [];
    await runDesign(themeFile, {
      designerHtmlPath,
      openInBrowser: (url) => { opened.push(url); },
    });

    expect(opened).toHaveLength(1);
    const url = opened[0];
    expect(url.startsWith("file://")).toBe(true);

    // The opened file must be a temp file, not the original designer.
    expect(url).not.toBe(pathToFileURL(designerHtmlPath).href);

    // Read back the temp file via the URL to verify injection.
    const { fileURLToPath } = await import("node:url");
    const tempPath = fileURLToPath(url);
    const html = await readFile(tempPath, "utf8");

    // Injection must appear BEFORE the bundle script.
    const injectionIdx = html.indexOf("window.__QUIRE_INITIAL_THEME__");
    const bundleIdx = html.indexOf("<script>/*bundle*/");
    expect(injectionIdx).toBeGreaterThan(-1);
    expect(bundleIdx).toBeGreaterThan(-1);
    expect(injectionIdx).toBeLessThan(bundleIdx);

    // The YAML content must be embedded (as a JSON string, so check a substring
    // that appears verbatim inside the JSON encoding).
    expect(html).toContain("colors:");

    // The original bundle script must still be present.
    expect(html).toContain("<script>/*bundle*/console.log(1)</script>");

    // Clean up the temp file the command wrote.
    await rm(tempPath, { force: true });
  });

  it("</script> in theme YAML is escaped so the inline script is not broken", async () => {
    const dangerousYaml = 'name: "</script><script>alert(1)</script>"\n';
    const themeFile = join(tmpDir, "dangerous.yaml");
    await writeFile(themeFile, dangerousYaml, "utf8");

    const opened: string[] = [];
    await runDesign(themeFile, {
      designerHtmlPath,
      openInBrowser: (url) => { opened.push(url); },
    });

    const { fileURLToPath } = await import("node:url");
    const tempPath = fileURLToPath(opened[0]);
    const html = await readFile(tempPath, "utf8");

    // The raw </script> must not appear inside the injection block.
    // Find the injection script contents.
    const injStart = html.indexOf("<script>window.__QUIRE_INITIAL_THEME__");
    const injEnd = html.indexOf("</script>", injStart);
    const injectionBlock = html.slice(injStart, injEnd);

    // </script> must not appear literally inside the injection block.
    expect(injectionBlock).not.toContain("</script>");
    // The escaped form should be present.
    expect(injectionBlock).toContain("<\\/script>");

    await rm(tempPath, { force: true });
  });

  it("missing designer: rejects with an error mentioning build:designer", async () => {
    const opened: string[] = [];
    await expect(
      runDesign(undefined, {
        designerHtmlPath: "/nonexistent/path/designer.html",
        openInBrowser: (url) => { opened.push(url); },
      })
    ).rejects.toThrow(/build:designer/);

    expect(opened).toHaveLength(0);
  });
});
