import * as esbuild from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { renderSample } from "../src/designer/sample.js";

/**
 * Bundle the theme designer browser entry into a self-contained HTML string.
 *
 * The kitchen-sink sample is rendered at build time via renderSample() and
 * injected into the browser bundle through esbuild `define` constants. The
 * result is a single HTML file with all JS and CSS inlined: no external
 * script or link tags.
 */
export async function buildDesignerHtml(): Promise<string> {
  const sample = renderSample();

  const result = await esbuild.build({
    entryPoints: ["src/designer/app.ts"],
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    legalComments: "none",
    define: {
      __QUIRE_SAMPLE_BODY__: JSON.stringify(sample.bodyHtml),
      __QUIRE_SAMPLE_TOC__: JSON.stringify(sample.tocHtml),
      __QUIRE_SAMPLE_TITLE__: JSON.stringify(sample.title),
    },
  });

  const bundleJs = result.outputFiles[0].text;

  // Designer shell CSS: neutral PDF-viewer gray background, centered pages.
  // Paged.js emits .pagedjs_page elements for each paginated sheet.
  const shellCss = `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 0;
      background: #525659;
      min-height: 100vh;
    }
    #quire-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    .pagedjs_page {
      background: #ffffff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
    }
  `.trim();

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Quire Theme Designer</title>
<style>
${shellCss}
</style>
</head>
<body>
<div id="quire-preview"></div>
<script>
${bundleJs}
</script>
</body>
</html>`;

  return html;
}

async function main(): Promise<void> {
  const html = await buildDesignerHtml();
  const outDir = "dist";
  await mkdir(outDir, { recursive: true });
  const outPath = `${outDir}/designer.html`;
  await writeFile(outPath, html, "utf-8");
  const bytes = Buffer.byteLength(html, "utf-8");
  console.log(`wrote ${outPath} (${(bytes / 1024).toFixed(1)} KB)`);
}

// Run main() only when this file is the direct entry point, so importing
// buildDesignerHtml from a test does NOT write to disk as a side effect.
// Guard the argv[1] lookup: it is undefined under inline-eval hosts
// (node -e / tsx -e), where pathToFileURL would otherwise throw.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
