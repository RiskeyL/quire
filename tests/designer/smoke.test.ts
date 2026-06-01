import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer";
import type { Browser, Page } from "puppeteer";
import { buildDesignerHtml } from "../../scripts/build-designer.js";
import { compileCss } from "../../src/theme/compile-css.js";
import { DEFAULT_TOKENS } from "../../src/theme/tokens.js";
import { replaceTocPageNumberWithVar } from "../../src/designer/live-css.js";

/**
 * End-to-end smoke test for the bundled theme designer, exercised in a real
 * headless Chromium. It is SKIPPED by default because the rest of the suite
 * never launches a browser (sandbox-safe, fast). Run it explicitly with:
 *
 *   QUIRE_BROWSER_TESTS=1 npm test
 *
 * In a sandboxed shell Chromium also needs `--no-sandbox` (already passed
 * below) and the shell sandbox disabled.
 *
 * It is the canonical "Puppeteer smoke" from the designer plan and doubles as
 * the runtime bundle-integrity check: the CSS the designer applies for the
 * default theme must EQUAL `compileCss(DEFAULT_TOKENS)` from the real module,
 * proving the bundled compiler is the converter's actual source (no drift).
 */

const RUN = process.env.QUIRE_BROWSER_TESTS === "1";

describe.skipIf(!RUN)("designer headless smoke", () => {
  let browser: Browser;
  let page: Page;
  let fileUrl: string;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "quire-designer-smoke-"));
    const htmlPath = join(tmpDir, "designer.html");
    await writeFile(htmlPath, await buildDesignerHtml(), "utf8");
    fileUrl = pathToFileURL(htmlPath).href;
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
    });
    (page as unknown as { _quireErrors: string[] })._quireErrors = errors;
    await page.goto(fileUrl, { waitUntil: "load", timeout: 60000 });
    await page.waitForSelector("#quire-preview .pagedjs_page", { timeout: 60000 });
  }, 60000);

  function pageErrors(): string[] {
    return (page as unknown as { _quireErrors: string[] })._quireErrors;
  }

  it("paginates the kitchen-sink sample and the bundled compileCss matches the real module", async () => {
    const pages = await page.$$eval("#quire-preview .pagedjs_page", (els) => els.length);
    expect(pages).toBeGreaterThan(0);

    // Runtime integrity: the live theme CSS the designer applied on load must be
    // the converter's compileCss(DEFAULT_TOKENS) with the TOC page number rewired
    // to a CSS variable the designer fills itself (no browser target-counter).
    const liveCss = await page.$eval("#qd-theme-live", (el) => el.textContent ?? "");
    expect(liveCss).toBe(replaceTocPageNumberWithVar(compileCss(DEFAULT_TOKENS)));
    // The fragile target-counter() must NOT survive into the preview CSS.
    expect(liveCss).not.toContain("target-counter(");

    expect(pageErrors()).toEqual([]);
  });

  it("fills every TOC entry with a body-relative page number", async () => {
    const result = await page.evaluate(() => {
      const entries = [...document.querySelectorAll<HTMLElement>(".toc-entry a[href^='#']")];
      const nums = entries.map((a) => a.style.getPropertyValue("--quire-toc-page"));
      return { count: entries.length, nums };
    });
    // The kitchen-sink sample's TOC must have entries, each carrying a quoted
    // page number var. Numbers are body-relative (first body page is "1").
    expect(result.count).toBeGreaterThan(0);
    expect(result.nums.every((n) => /^"\d+"$/.test(n))).toBe(true);
    expect(result.nums[0]).toBe('"1"');
    // Non-decreasing down the list (entries are in document order).
    const asInt = result.nums.map((n) => parseInt(n.replace(/"/g, ""), 10));
    for (let i = 1; i < asInt.length; i++) expect(asInt[i]).toBeGreaterThanOrEqual(asInt[i - 1]);
    expect(pageErrors()).toEqual([]);
  });

  it("restyle: a color edit updates the live CSS without repaginating", async () => {
    const result = await page.evaluate(async () => {
      const before = [...document.querySelectorAll("#quire-preview .pagedjs_page")];
      before.forEach((p, i) => p.setAttribute("data-smoke", `p${i}`));
      const beforeCount = before.length;
      const colorInput = document.querySelector<HTMLInputElement>('#qd-panel input[type="color"]');
      if (!colorInput) return { ok: false };
      colorInput.value = "#00ff88";
      colorInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      const stillMarked = [...document.querySelectorAll("#quire-preview .pagedjs_page")]
        .filter((p) => p.getAttribute("data-smoke")).length;
      const afterCount = document.querySelectorAll("#quire-preview .pagedjs_page").length;
      const live = document.getElementById("qd-theme-live")?.textContent ?? "";
      return { ok: true, beforeCount, afterCount, stillMarked, liveHasNewColor: live.includes("#00ff88") };
    });
    expect(result.ok).toBe(true);
    // No repagination: the same page nodes persist and the count is unchanged.
    expect(result.afterCount).toBe(result.beforeCount);
    expect(result.stillMarked).toBe(result.beforeCount);
    expect(result.liveHasNewColor).toBe(true);
    expect(pageErrors()).toEqual([]);
  });

  it("relayout: a page-size change repaginates", async () => {
    const result = await page.evaluate(async () => {
      [...document.querySelectorAll("#quire-preview .pagedjs_page")].forEach((p, i) =>
        p.setAttribute("data-smoke-rl", `p${i}`),
      );
      const sel = [...document.querySelectorAll<HTMLSelectElement>("#qd-panel select")]
        .find((s) => [...s.options].some((o) => o.value === "Letter"));
      if (!sel) return { ok: false };
      sel.value = "Letter";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 1500));
      const survivingOld = [...document.querySelectorAll("#quire-preview .pagedjs_page")]
        .filter((p) => p.getAttribute("data-smoke-rl")).length;
      const count = document.querySelectorAll("#quire-preview .pagedjs_page").length;
      return { ok: true, survivingOld, count };
    });
    expect(result.ok).toBe(true);
    // The old page nodes were torn down and replaced (genuine repagination).
    expect(result.survivingOld).toBe(0);
    expect(result.count).toBeGreaterThan(0);
    expect(pageErrors()).toEqual([]);
  });

  it("editing a token updates the live YAML output", async () => {
    const yaml = await page.evaluate(async () => {
      const colorInput = document.querySelector<HTMLInputElement>('#qd-panel input[type="color"]');
      if (!colorInput) return null;
      colorInput.value = "#abcdef";
      colorInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 100));
      return document.getElementById("qd-yaml-pre")?.textContent ?? "";
    });
    expect(yaml).not.toBeNull();
    expect(yaml).toContain("#abcdef");
    expect(pageErrors()).toEqual([]);
  });
});
