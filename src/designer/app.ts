// src/designer/app.ts
/**
 * Browser entry for the theme designer. Bundled by scripts/build-designer.ts
 * via esbuild (platform=browser). Must import ONLY browser-pure modules (no
 * Node builtins). The kitchen-sink sample HTML is injected at build time via
 * esbuild `define`.
 */

import { Previewer } from "pagedjs";
import { compileCss } from "../theme/compile-css.js";
import { DEFAULT_TOKENS } from "../theme/tokens.js";
import { serializeTheme } from "../theme/serialize-theme.js";
import { renderCover } from "../assemble/cover.js";
import { CHROME_CSS } from "./chrome-css.js";
import { FORM_SPEC } from "./form-spec.js";
import { createForm } from "./form.js";
import type { BrandTokens } from "../theme/tokens.js";

// Injected at build time by esbuild `define` (see scripts/build-designer.ts).
declare const __QUIRE_SAMPLE_BODY__: string;
declare const __QUIRE_SAMPLE_TOC__: string;
declare const __QUIRE_SAMPLE_TITLE__: string;

// ---------------------------------------------------------------------------
// Deep clone helper (browser-pure: no structuredClone polyfill needed in
// modern Chromium / Safari 17+ / Firefox 94+)
// ---------------------------------------------------------------------------
function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---------------------------------------------------------------------------
// Shell DOM builder
// ---------------------------------------------------------------------------

function buildShell(): {
  topbar: HTMLElement;
  panel: HTMLElement;
  previewPane: HTMLElement;
  btnCopy: HTMLButtonElement;
  btnDownload: HTMLButtonElement;
  yamlGroup: HTMLElement;
  yamlPre: HTMLPreElement;
  pageCount: HTMLElement;
} {
  const app = document.getElementById("quire-app");
  if (!app) throw new Error("quire-app element not found");

  // Top bar
  const topbar = document.createElement("div");
  topbar.id = "qd-topbar";

  const wordmark = document.createElement("div");
  wordmark.id = "qd-wordmark";
  const wName = document.createElement("span");
  wName.id = "qd-wordmark-name";
  wName.textContent = "Quire";
  const wLabel = document.createElement("span");
  wLabel.id = "qd-wordmark-label";
  wLabel.textContent = "Theme Designer";
  wordmark.appendChild(wName);
  wordmark.appendChild(wLabel);
  topbar.appendChild(wordmark);

  const actions = document.createElement("div");
  actions.id = "qd-actions";

  const btnCopy = document.createElement("button");
  btnCopy.className = "qd-btn";
  btnCopy.textContent = "Copy YAML";
  btnCopy.type = "button";

  const btnDownload = document.createElement("button");
  btnDownload.className = "qd-btn qd-btn-primary";
  btnDownload.textContent = "Download .yaml";
  btnDownload.type = "button";

  actions.appendChild(btnCopy);
  actions.appendChild(btnDownload);
  topbar.appendChild(actions);
  app.appendChild(topbar);

  // Main area
  const main = document.createElement("div");
  main.id = "qd-main";

  // Left panel
  const panel = document.createElement("div");
  panel.id = "qd-panel";

  // YAML pane (at bottom of panel — appended after form groups)
  const yamlGroup = document.createElement("div");
  yamlGroup.className = "qd-group";
  yamlGroup.id = "qd-yaml-group";
  yamlGroup.dataset.open = "true";

  const yamlHeader = document.createElement("div");
  yamlHeader.className = "qd-group-header";
  yamlHeader.setAttribute("role", "button");
  yamlHeader.setAttribute("aria-expanded", "true");
  yamlHeader.tabIndex = 0;

  const yamlTitle = document.createElement("span");
  yamlTitle.className = "qd-group-title";
  yamlTitle.textContent = "THEME.YAML";
  const yamlChevron = document.createElement("span");
  yamlChevron.className = "qd-group-chevron";
  yamlChevron.textContent = "▶";
  yamlHeader.appendChild(yamlTitle);
  yamlHeader.appendChild(yamlChevron);

  const yamlBody = document.createElement("div");
  yamlBody.className = "qd-group-body";

  const yamlPre = document.createElement("pre");
  yamlPre.id = "qd-yaml-pre";
  yamlBody.appendChild(yamlPre);
  yamlGroup.appendChild(yamlHeader);
  yamlGroup.appendChild(yamlBody);

  function toggleYaml() {
    const open = yamlGroup.dataset.open !== "true";
    yamlGroup.dataset.open = open ? "true" : "false";
    yamlHeader.setAttribute("aria-expanded", open ? "true" : "false");
  }
  yamlHeader.addEventListener("click", toggleYaml);
  yamlHeader.addEventListener("keydown", (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === "Enter" || ke.key === " ") { ke.preventDefault(); toggleYaml(); }
  });

  // Preview pane
  const previewPane = document.createElement("div");
  previewPane.id = "qd-preview-pane";

  const previewEl = document.createElement("div");
  previewEl.id = "quire-preview";
  previewPane.appendChild(previewEl);

  const pageCount = document.createElement("div");
  pageCount.id = "qd-page-count";
  previewPane.appendChild(pageCount);

  main.appendChild(panel);
  main.appendChild(previewPane);
  app.appendChild(main);

  // yamlGroup is returned (not appended here) so the boot can place it at the
  // bottom of the panel AFTER createForm has populated the form groups.
  return { topbar, panel, previewPane, btnCopy, btnDownload, yamlGroup, yamlPre, pageCount };
}

// ---------------------------------------------------------------------------
// Preview renderer (initial render only; D5c will wire live updates)
// ---------------------------------------------------------------------------

async function renderPreview(tokens: BrandTokens): Promise<void> {
  const previewEl = document.getElementById("quire-preview");
  if (!previewEl) return;

  const css = compileCss(tokens);

  const cover = renderCover({
    title: __QUIRE_SAMPLE_TITLE__,
    productName: tokens.brand?.productName ?? "Documentation",
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
}

// ---------------------------------------------------------------------------
// Main boot
// ---------------------------------------------------------------------------

(async () => {
  // 1. Inject chrome CSS
  const styleEl = document.createElement("style");
  styleEl.textContent = CHROME_CSS;
  document.head.appendChild(styleEl);

  let shell: ReturnType<typeof buildShell>;
  try {
    shell = buildShell();
  } catch (err) {
    document.body.textContent =
      "Quire designer failed to initialize: " +
      (err instanceof Error ? err.message : String(err));
    return;
  }

  const { panel, btnCopy, btnDownload, yamlGroup, yamlPre, pageCount } = shell;

  // 2. Working token state (deep clone so DEFAULT_TOKENS is never mutated)
  const tokens: BrandTokens = deepClone(DEFAULT_TOKENS);

  // 3. YAML update helper
  function refreshYaml(): void {
    yamlPre.textContent = serializeTheme(tokens);
  }

  // 4. Build token form
  createForm(panel, FORM_SPEC, tokens, (_path, _value) => {
    // Form has already written the value into `tokens` via setByPath.
    refreshYaml();
    // D5c: live preview update hook — call classifyTokenChange(path) here and
    // either restyle (swap CSS only) or relayout (full re-render).
  });

  // Append the YAML group at the bottom of the panel, after the form groups.
  panel.appendChild(yamlGroup);

  // 5. Copy YAML
  btnCopy.addEventListener("click", () => {
    const yaml = serializeTheme(tokens);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(yaml).then(() => {
        const orig = btnCopy.textContent;
        btnCopy.textContent = "Copied!";
        btnCopy.classList.add("qd-btn-flash");
        setTimeout(() => {
          btnCopy.textContent = orig;
          btnCopy.classList.remove("qd-btn-flash");
        }, 1500);
      });
    } else {
      // Fallback: select from a textarea
      const ta = document.createElement("textarea");
      ta.value = yaml;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  });

  // 6. Download .yaml
  btnDownload.addEventListener("click", () => {
    const yaml = serializeTheme(tokens);
    const blob = new Blob([yaml], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "theme.yaml";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });

  // 7. Initial YAML render
  refreshYaml();

  // 8. Initial preview render (default theme — unchanged from pre-D5b behavior)
  try {
    await renderPreview(tokens);
    // Update page count after paginating
    const pages = document.querySelectorAll(".pagedjs_page");
    if (pages.length > 0) {
      pageCount.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"}`;
    }
  } catch (err) {
    const previewEl = document.getElementById("quire-preview");
    if (previewEl) {
      previewEl.textContent =
        "Quire designer preview failed: " +
        (err instanceof Error ? err.message : String(err));
    }
  }
})();
