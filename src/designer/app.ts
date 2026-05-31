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
import { classifyTokenChange } from "./update-classifier.js";
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
// Live theme stylesheet element (#qd-theme-live)
//
// A single <style id="qd-theme-live"> kept as the LAST child of document.head
// holds the current compileCss(tokens) output. Because it comes after all of
// pagedjs's injected sheets (which carry data-pagedjs-inserted-styles="true"),
// its rules win any source-order ties for element-level selectors (colors,
// text-decoration, border-radius, etc.). Page-box geometry and running-header
// furniture are owned by pagedjs and only update on a full relayout.
// ---------------------------------------------------------------------------

function ensureThemeLiveEl(): HTMLStyleElement {
  let el = document.getElementById("qd-theme-live") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "qd-theme-live";
    document.head.appendChild(el);
  }
  return el;
}

/** Move #qd-theme-live to be the last child of document.head so it wins
 * source-order ties after pagedjs injects fresh sheets during a relayout. */
function pinThemeLiveLast(el: HTMLStyleElement): void {
  document.head.appendChild(el); // appendChild moves if already in DOM
}

/** Remove all <style data-pagedjs-inserted-styles> nodes that pagedjs left
 * behind from a previous render so they do not accumulate across relayouts. */
function removePagedjsStyles(): void {
  const stale = document.querySelectorAll(
    "style[data-pagedjs-inserted-styles]",
  );
  stale.forEach((el) => el.remove());
}

/** Build the full content string for pagination (cover rebuilds live; toc/body are static). */
function buildContent(tokens: BrandTokens): string {
  const cover = renderCover({
    title: __QUIRE_SAMPLE_TITLE__,
    productName: tokens.brand?.productName ?? "Documentation",
    version: "v1.0",
    date: "January 2026",
    url: "docs.example.com",
    layout: tokens.cover.layout,
    logoWidth: tokens.cover.logoWidth,
  });
  return cover + __QUIRE_SAMPLE_TOC__ + __QUIRE_SAMPLE_BODY__;
}

// ---------------------------------------------------------------------------
// Live preview controller
// ---------------------------------------------------------------------------

interface LivePreviewController {
  /** Must be called once after boot to produce the initial paginated render. */
  initialRender(): Promise<void>;
  /** Called by the form onChange handler with the changed token path. */
  onTokenChange(path: string): void;
}

function createLivePreviewController(
  tokens: BrandTokens,
  previewEl: HTMLElement,
  previewPane: HTMLElement,
  pageCount: HTMLElement,
): LivePreviewController {
  // The single controlled stylesheet element.
  const themeLiveEl = ensureThemeLiveEl();

  // Relayout concurrency guard: at most one repagination in flight, with one
  // pending slot. If a relayout arrives while one is running, we store a flag
  // and run exactly one more after the in-flight render completes.
  let relayoutRunning = false;
  let relayoutPending = false;

  // Debounce timer for relayout scheduling.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function runRelayout(): Promise<void> {
    relayoutRunning = true;
    try {
      const css = compileCss(tokens);
      const content = buildContent(tokens);

      // Clear previous pagedjs output and its injected style nodes.
      previewEl.innerHTML = "";
      removePagedjsStyles();

      // Previewer.preview paginates content into previewEl and injects its
      // processed stylesheet via polisher.insert(), which marks each injected
      // <style> with data-pagedjs-inserted-styles="true".
      await new Previewer().preview(
        content,
        [{ "quire://theme.css": css }],
        previewEl,
      );

      // Update the controlled live theme sheet and keep it last in head so
      // it wins source-order ties over the freshly injected pagedjs sheets.
      themeLiveEl.textContent = css;
      pinThemeLiveLast(themeLiveEl);

      // Update page count readout.
      const pages = previewEl.querySelectorAll(".pagedjs_page");
      if (pages.length > 0) {
        pageCount.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"}`;
      }

      // Brief highlight pulse on the preview pane to signal the repagination.
      previewPane.classList.remove("qd-relayout-pulse");
      // Force a reflow so removing + re-adding the class always triggers the animation.
      void previewPane.offsetWidth;
      previewPane.classList.add("qd-relayout-pulse");
      setTimeout(() => previewPane.classList.remove("qd-relayout-pulse"), 400);
    } finally {
      relayoutRunning = false;
      // If another relayout was requested while this one was in flight, run it now.
      if (relayoutPending) {
        relayoutPending = false;
        void scheduleRelayout(0);
      }
    }
  }

  function scheduleRelayout(delay: number): Promise<void> {
    return new Promise((resolve) => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        if (relayoutRunning) {
          relayoutPending = true;
          resolve();
          return;
        }
        await runRelayout();
        resolve();
      }, delay);
    });
  }

  return {
    async initialRender(): Promise<void> {
      // Initial render is a relayout with no debounce delay.
      await scheduleRelayout(0);
    },

    onTokenChange(path: string): void {
      const kind = classifyTokenChange(path);
      if (kind === "restyle") {
        // Geometry-neutral: swap CSS in the controlled element only, no repagination.
        themeLiveEl.textContent = compileCss(tokens);
      } else {
        // Geometry-affecting: debounced full repagination.
        void scheduleRelayout(250);
      }
    },
  };
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

  const { panel, previewPane, btnCopy, btnDownload, yamlGroup, yamlPre, pageCount } = shell;

  // 2. Working token state (deep clone so DEFAULT_TOKENS is never mutated)
  const tokens: BrandTokens = deepClone(DEFAULT_TOKENS);

  // 3. Resolve the preview element (created inside buildShell)
  const previewEl = document.getElementById("quire-preview");
  if (!previewEl) {
    document.body.textContent = "Quire designer failed to initialize: quire-preview element not found";
    return;
  }

  // 4. Create the live preview controller (wires #qd-theme-live and manages relayouts)
  const livePreview = createLivePreviewController(tokens, previewEl, previewPane, pageCount);

  // 5. YAML update helper
  function refreshYaml(): void {
    yamlPre.textContent = serializeTheme(tokens);
  }

  // 6. Build token form: onChange fires after the form writes the new value into tokens
  createForm(panel, FORM_SPEC, tokens, (path, _value) => {
    refreshYaml();
    livePreview.onTokenChange(path);
  });

  // Append the YAML group at the bottom of the panel, after the form groups.
  panel.appendChild(yamlGroup);

  // 7. Copy YAML
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

  // 8. Download .yaml
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

  // 9. Initial YAML render
  refreshYaml();

  // 10. Initial preview render (uses the same relayout machinery as live updates)
  try {
    await livePreview.initialRender();
  } catch (err) {
    previewEl.textContent =
      "Quire designer preview failed: " +
      (err instanceof Error ? err.message : String(err));
  }
})();
