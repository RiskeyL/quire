/**
 * Browser entry for the theme designer. Bundled by scripts/build-designer.ts
 * via esbuild (platform=browser). Must import ONLY browser-pure modules (no
 * Node builtins). The kitchen-sink sample HTML is injected at build time via
 * esbuild `define`.
 */

import { Previewer } from "pagedjs";
import { compileCss } from "../theme/compile-css.js";
import { DEFAULT_TOKENS } from "../theme/tokens.js";
import { renderCover } from "../assemble/cover.js";

// Injected at build time by esbuild `define` (see scripts/build-designer.ts).
declare const __QUIRE_SAMPLE_BODY__: string;
declare const __QUIRE_SAMPLE_TOC__: string;
declare const __QUIRE_SAMPLE_TITLE__: string;

(async () => {
  const previewEl = document.getElementById("quire-preview");
  if (!previewEl) {
    console.error("quire-designer: #quire-preview element not found");
    return;
  }

  try {
    const tokens = DEFAULT_TOKENS;
    const css = compileCss(tokens);

    // version, date, and url are per-run fields, not theme tokens. Fixed
    // placeholders are used here so cover-related tokens visibly style
    // something in the preview without needing user input.
    const cover = renderCover({
      title: __QUIRE_SAMPLE_TITLE__,
      productName: "Documentation",
      version: "v1.0",
      date: "January 2026",
      url: "docs.example.com",
      layout: tokens.cover.layout,
      logoWidth: tokens.cover.logoWidth,
    });

    const content = cover + __QUIRE_SAMPLE_TOC__ + __QUIRE_SAMPLE_BODY__;

    // Previewer.preview(content, stylesheets, renderTo):
    //   content     - HTML string to paginate
    //   stylesheets - array of { [url]: cssText } objects (pagedjs polisher.add format)
    //   renderTo    - DOM Element to render pages into
    // Confirmed from node_modules/pagedjs/src/polyfill/previewer.js lines 136-168.
    await new Previewer().preview(
      content,
      [{ "quire://theme.css": css }],
      previewEl,
    );
  } catch (err) {
    previewEl.textContent =
      "Quire designer preview failed: " +
      (err instanceof Error ? err.message : String(err));
  }
})();
