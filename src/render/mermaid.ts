import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser } from "puppeteer";

/**
 * The subset of the mermaid global API used inside the browser context. Mermaid
 * is injected as a UMD bundle via `page.addScriptTag`, so it attaches itself to
 * `globalThis`. Declaring it here lets the `page.evaluate` callbacks reference
 * `globalThis.mermaid` with a real type instead of an `as` cast. (This global
 * exists only in the in-browser page context, never in the Node process.)
 */
declare global {
  // eslint-disable-next-line no-var
  var mermaid: {
    initialize(config: { startOnLoad: boolean }): void;
    render(id: string, source: string): Promise<{ svg: string }>;
  };
}

/**
 * A diagram renderer: takes Mermaid source and returns a `data:` URI for an
 * image of the rendered diagram.
 *
 * This is the injectable seam that keeps the detection/replacement logic (which
 * cheerio block to swap for which `<img>`) independent of the slow, environment-
 * dependent puppeteer+mermaid rasterization. Tests pass a fake renderer; the
 * real pipeline uses the puppeteer-backed default created by
 * `createPuppeteerRenderer`.
 */
export type DiagramRenderer = (source: string) => Promise<string>;

/** Options for {@link renderMermaid}. */
export interface RenderMermaidOptions {
  /** Called with a human-readable message when one diagram fails to render. */
  warn?: (message: string) => void;
  /**
   * Override the diagram renderer. When omitted, a puppeteer + bundled-mermaid
   * renderer is created lazily (only if at least one mermaid block is present)
   * and torn down before the function returns.
   */
  renderDiagram?: DiagramRenderer;
}

/**
 * Replace every `<pre><code class="language-mermaid">` block in an HTML
 * fragment with a rasterized `<img class="mermaid-diagram">` of the rendered
 * diagram, wrapped in a `<figure class="frame">` so it inherits the existing
 * centered-figure print treatment.
 *
 * Self-contained output: each diagram is embedded as a PNG `data:` URI, so the
 * result has no external references (mirroring `embedImages`). PNG is used
 * rather than inline/data-URI SVG because the Word/Pandoc path embeds PNG
 * reliably, whereas SVG through Pandoc docx is not dependable. The trade-off is
 * a fixed raster resolution; the puppeteer renderer compensates with a 2x
 * device scale factor so diagrams stay crisp in print.
 *
 * Resilience (mirrors `embedImages`): each diagram render is wrapped in
 * try/catch. On failure the original `<pre><code>` block is left untouched and
 * `warn` is called — one bad diagram never aborts the run.
 *
 * Fast path: if the fragment contains no mermaid blocks, the html is returned
 * unchanged and no browser is launched.
 */
export async function renderMermaid(
  html: string,
  options: RenderMermaidOptions = {}
): Promise<string> {
  const warn =
    options.warn ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const $ = cheerio.load(html, null, false);

  // Match <code> whose class is "language-mermaid" or starts with
  // "language-mermaid " (e.g. when extra classes are present).
  const blocks = $("pre > code").filter((_i, el) => {
    const cls = $(el).attr("class") ?? "";
    return /(?:^|\s)language-mermaid(?:\s|$)/.test(cls);
  });

  // Fast path: no mermaid blocks, so no browser is launched.
  if (blocks.length === 0) return html;

  // Resolve the renderer. When the caller supplies one (tests), use it and do
  // not own a browser. Otherwise create a puppeteer-backed renderer that owns a
  // single browser for the whole call and is closed in the finally below.
  let close: (() => Promise<void>) | undefined;
  let render: DiagramRenderer;
  if (options.renderDiagram) {
    render = options.renderDiagram;
  } else {
    const created = await createPuppeteerRenderer();
    render = created.render;
    close = created.close;
  }

  try {
    // Render sequentially: a single shared browser/page is reused per diagram,
    // and diagrams are typically few per page. Collect the elements first so we
    // can await each render before mutating the DOM.
    const codeEls = blocks.toArray();
    for (let i = 0; i < codeEls.length; i++) {
      const $code = $(codeEls[i]);
      // The diagram source is the text content of the <code> element.
      const source = $code.text();
      const $pre = $code.closest("pre");
      try {
        const dataUri = await render(source);
        const img = $(
          `<img class="mermaid-diagram" />`
        ).attr("src", dataUri);
        const figure = $(`<figure class="frame"></figure>`).append(img);
        $pre.replaceWith(figure);
      } catch (err) {
        // Leave the original code block in place and warn. Include the block
        // index and a short source snippet so a failure is locatable in a
        // multi-diagram page; handle non-Error throws defensively.
        const msg = err instanceof Error ? err.message : String(err);
        const snippet = source.trim().slice(0, 60);
        warn(`Failed to render mermaid diagram ${i + 1} (${snippet}…): ${msg}`);
      }
    }
  } finally {
    if (close) await close();
  }

  return $.html();
}

// ---------------------------------------------------------------------------
// Puppeteer-backed renderer
// ---------------------------------------------------------------------------

/** Path to the bundled mermaid UMD build (no CDN — offline-first). */
const MERMAID_DIST = fileURLToPath(
  new URL("../../node_modules/mermaid/dist/mermaid.min.js", import.meta.url)
);

/**
 * Create a {@link DiagramRenderer} backed by a single headless Chromium
 * instance (resolved via `puppeteer.executablePath()`, the same mechanism the
 * PDF export uses) and the bundled `mermaid` library injected from
 * `node_modules` — never a CDN.
 *
 * Returns the renderer plus a `close` that tears down the browser. The browser
 * and page are created once and reused across every diagram in the call.
 *
 * Rasterization: mermaid renders the source to SVG in-page; the SVG is then
 * given explicit pixel dimensions from its `viewBox` (mermaid emits
 * `width="100%"` + a `max-width` style, which would otherwise screenshot at the
 * wrong size) and screenshotted at a 2x device scale factor for crisp print
 * output. The element screenshot is returned as a PNG `data:` URI.
 */
export async function createPuppeteerRenderer(): Promise<{
  render: DiagramRenderer;
  close: () => Promise<void>;
}> {
  const mermaidScript = await readFile(MERMAID_DIST, "utf8");

  const browser: Browser = await puppeteer.launch({
    headless: "new",
    executablePath: puppeteer.executablePath(),
  });

  // Guard post-launch setup: if any of these throw, close the browser so the
  // Chromium process is not orphaned (the caller's finally can't help here
  // because this function would throw before returning a `close`).
  let page;
  try {
    page = await browser.newPage();
    // A 2x device scale factor keeps the rasterized diagram crisp in print.
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    await page.setContent(
      "<!doctype html><html><body style='margin:0;padding:0'></body></html>"
    );
    await page.addScriptTag({ content: mermaidScript });
    await page.evaluate(() => {
      globalThis.mermaid.initialize({ startOnLoad: false });
    });
  } catch (err) {
    await browser.close();
    throw err;
  }

  // A counter gives each render a unique element id, avoiding collisions when
  // the same page renders many diagrams.
  let counter = 0;

  const render: DiagramRenderer = async (source: string) => {
    const id = `quire-mermaid-${counter++}`;
    // 1. Render the source to SVG markup via mermaid (no DOM insertion yet).
    const svg = await page.evaluate(
      async (args: { id: string; src: string }) => {
        const { svg } = await globalThis.mermaid.render(args.id, args.src);
        return svg;
      },
      { id, src: source }
    );

    // 2. Insert the SVG, pin explicit dimensions from its viewBox so the
    //    element screenshot is sized correctly.
    await page.evaluate((svgMarkup: string) => {
      document.body.innerHTML = svgMarkup;
      const el = document.querySelector("svg");
      if (!el) return;
      const vb = el.getAttribute("viewBox");
      if (vb) {
        const parts = vb.split(/\s+/).map(Number);
        const w = parts[2];
        const h = parts[3];
        if (w > 0 && h > 0) {
          el.setAttribute("width", String(w));
          el.setAttribute("height", String(h));
        }
      }
      el.style.maxWidth = "none";
    }, svg);

    // 3. Screenshot the SVG element as a PNG and return a data URI.
    const el = await page.$("svg");
    if (!el) throw new Error("mermaid produced no SVG element");
    const png = await el.screenshot({ type: "png", omitBackground: true });
    const buf = Buffer.from(png);
    return `data:image/png;base64,${buf.toString("base64")}`;
  };

  const close = async () => {
    await browser.close();
  };

  return { render, close };
}
