/**
 * Build-time only (imports Node fs + the Node-bound assembler). The designer's
 * esbuild step calls renderSample() and inlines the returned strings into the
 * browser bundle; this module itself is never bundled into the browser.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { renderMdx } from "../render/mdx/render-mdx.js";
import { buildTocFromHeadings } from "../assemble/assemble.js";

/** The three strings the designer needs to render the preview. */
export interface SampleDoc {
  title: string;
  tocHtml: string;
  bodyHtml: string;
}

/**
 * Read, render, and assemble the kitchen-sink designer sample.
 *
 * The sample MDX is rendered through the real renderMdx pipeline so the
 * preview body can never drift from actual converter output. If the sample
 * triggers the degraded fallback, this function throws immediately so a
 * broken sample fails the build loudly rather than silently.
 */
export function renderSample(): SampleDoc {
  const samplePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../examples/designer-sample.mdx"
  );

  const source = readFileSync(samplePath, "utf-8");

  const { html, frontmatter } = renderMdx(source, {
    onWarn: (m) => {
      throw new Error(`designer sample failed to render: ${m}`);
    },
  });

  const title = (frontmatter.title as string | undefined) ?? "Quire Theme Designer Sample";
  const tocHtml = buildTocFromHeadings(html, { title: "Contents", maxDepth: 3 });
  const bodyHtml = `<div class="doc-body">${html}</div>`;

  return { title, tocHtml, bodyHtml };
}
