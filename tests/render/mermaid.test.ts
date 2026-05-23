import { describe, it, expect } from "vitest";
import { renderMermaid } from "../../src/render/mermaid.js";

// A tiny 1x1 transparent PNG data URI used as the fake render output.
const FAKE_PNG_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("renderMermaid (detection + replacement, injectable renderer)", () => {
  it("replaces a language-mermaid block with an <img> carrying the rendered data URI", async () => {
    const html = `<pre><code class="language-mermaid">graph TD; A--&gt;B;\n</code></pre>`;
    const result = await renderMermaid(html, {
      renderDiagram: async () => FAKE_PNG_URI,
    });

    expect(result).toContain(`class="mermaid-diagram"`);
    expect(result).toContain(`src="${FAKE_PNG_URI}"`);
    // The original code block is gone.
    expect(result).not.toContain(`language-mermaid`);
    expect(result).not.toContain(`<pre>`);
  });

  it("passes the diagram source (decoded text) to the renderer", async () => {
    const sources: string[] = [];
    const html = `<pre><code class="language-mermaid">graph TD; A--&gt;B;\n</code></pre>`;
    await renderMermaid(html, {
      renderDiagram: async (src) => {
        sources.push(src);
        return FAKE_PNG_URI;
      },
    });

    expect(sources.length).toBe(1);
    // cheerio's .text() decodes entities, so the renderer sees real "-->".
    expect(sources[0]).toBe("graph TD; A-->B;\n");
  });

  it("wraps the produced image in a <figure class=\"frame\">", async () => {
    const html = `<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>`;
    const result = await renderMermaid(html, {
      renderDiagram: async () => FAKE_PNG_URI,
    });
    expect(result).toMatch(
      /<figure class="frame"><img class="mermaid-diagram" src="[^"]+"\s*\/?><\/figure>/
    );
  });

  it("matches language-mermaid even with additional classes", async () => {
    const html = `<pre><code class="language-mermaid hljs">graph TD; A-->B;</code></pre>`;
    const result = await renderMermaid(html, {
      renderDiagram: async () => FAKE_PNG_URI,
    });
    expect(result).toContain(`class="mermaid-diagram"`);
    expect(result).not.toContain(`language-mermaid`);
  });

  it("renders multiple mermaid blocks independently", async () => {
    let calls = 0;
    const html =
      `<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>` +
      `<p>between</p>` +
      `<pre><code class="language-mermaid">graph LR; X-->Y;</code></pre>`;
    const result = await renderMermaid(html, {
      renderDiagram: async () => {
        calls++;
        return `${FAKE_PNG_URI}#${calls}`;
      },
    });
    expect(calls).toBe(2);
    expect(result).toContain(`${FAKE_PNG_URI}#1`);
    expect(result).toContain(`${FAKE_PNG_URI}#2`);
    expect(result).toContain(`<p>between</p>`);
  });

  it("leaves non-mermaid code blocks untouched", async () => {
    const html = `<pre><code class="language-js">const a = 1;</code></pre>`;
    const result = await renderMermaid(html, {
      renderDiagram: async () => FAKE_PNG_URI,
    });
    expect(result).toContain(`class="language-js"`);
    expect(result).toContain(`const a = 1;`);
    expect(result).not.toContain(`mermaid-diagram`);
  });

  it("returns the html unchanged via the fast path when no mermaid blocks exist", async () => {
    let called = false;
    const html = `<p>Hello</p><pre><code class="language-py">x = 1</code></pre>`;
    const result = await renderMermaid(html, {
      renderDiagram: async () => {
        called = true;
        return FAKE_PNG_URI;
      },
    });
    // Fast path: the renderer is never invoked and the html is returned as-is.
    expect(called).toBe(false);
    expect(result).toBe(html);
  });

  it("leaves the original block in place and warns when the renderer throws", async () => {
    const warnings: string[] = [];
    const html = `<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>`;
    const result = await renderMermaid(html, {
      renderDiagram: async () => {
        throw new Error("boom");
      },
      warn: (msg) => warnings.push(msg),
    });

    // Original block survives.
    expect(result).toContain(`class="language-mermaid"`);
    expect(result).toContain(`graph TD; A-`);
    expect(result).not.toContain(`mermaid-diagram`);
    // Exactly one warning, mentioning the failure.
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/mermaid/i);
    expect(warnings[0]).toContain("boom");
  });

  it("one failing diagram does not abort sibling diagrams", async () => {
    const warnings: string[] = [];
    const html =
      `<pre><code class="language-mermaid">BAD</code></pre>` +
      `<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>`;
    const result = await renderMermaid(html, {
      renderDiagram: async (src) => {
        if (src === "BAD") throw new Error("bad diagram");
        return FAKE_PNG_URI;
      },
      warn: (msg) => warnings.push(msg),
    });

    // The bad one is left as a code block; the good one is replaced.
    expect(result).toContain(`<code class="language-mermaid">BAD</code>`);
    expect(result).toContain(`class="mermaid-diagram"`);
    expect(warnings.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: a real puppeteer + bundled-mermaid render.
//
// This is slow and environment-dependent. It exercises the default
// puppeteer-backed renderer (no injected renderDiagram), confirming the bundled
// mermaid library rasterizes a tiny diagram to a PNG data URI. The vitest config
// allows a 60s timeout, which is sufficient for a single small diagram.
// ---------------------------------------------------------------------------

describe("renderMermaid (real puppeteer + bundled mermaid)", () => {
  it("rasterizes a tiny diagram to a PNG data URI", async () => {
    const html = `<pre><code class="language-mermaid">graph TD; A--&gt;B;</code></pre>`;
    const result = await renderMermaid(html);

    expect(result).toContain(`class="mermaid-diagram"`);
    expect(result).toMatch(/src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
    expect(result).not.toContain(`language-mermaid`);
  });
});
