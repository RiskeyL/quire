import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";
import { codeLabel } from "../../../../src/render/mdx/components/code.js";
import type { Code } from "mdast";

// ---------------------------------------------------------------------------
// codeLabel unit tests
// ---------------------------------------------------------------------------

/**
 * Helper to build a minimal mdast `code` node for label extraction tests.
 * Only `lang` and `meta` are relevant; `value` is irrelevant here.
 */
function codeNode(lang: string | null | undefined, meta: string | null | undefined): Code {
  return { type: "code", lang, meta, value: "" };
}

describe("codeLabel", () => {
  it("extracts title= from meta (double-quoted)", () => {
    expect(codeLabel(codeNode("js", 'title="app.js"'))).toBe("app.js");
  });

  it("extracts title= from meta (single-quoted)", () => {
    expect(codeLabel(codeNode("bash", "title='run.sh'"))).toBe("run.sh");
  });

  it("extracts title= when other meta tokens are also present", () => {
    // e.g. ```js title="app.js" {1-3}
    expect(codeLabel(codeNode("js", 'title="app.js" {1-3}'))).toBe("app.js");
  });

  it("returns bare meta text when no title= is present", () => {
    // e.g. ```python Image URL  →  label = "Image URL"
    expect(codeLabel(codeNode("python", "Image URL"))).toBe("Image URL");
  });

  it("returns bare meta text (single word)", () => {
    expect(codeLabel(codeNode("bash", "Mac"))).toBe("Mac");
  });

  it("falls back to lang when meta is null", () => {
    expect(codeLabel(codeNode("js", null))).toBe("js");
  });

  it("falls back to lang when meta is empty string", () => {
    expect(codeLabel(codeNode("python", ""))).toBe("python");
  });

  it("falls back to lang when meta is whitespace-only", () => {
    expect(codeLabel(codeNode("bash", "   "))).toBe("bash");
  });

  it("returns the default label when both lang and meta are absent", () => {
    expect(codeLabel(codeNode(null, null))).toBe("Code");
  });

  it("returns the default label when lang is empty and meta is absent", () => {
    expect(codeLabel(codeNode("", null))).toBe("Code");
  });
});

// ---------------------------------------------------------------------------
// CodeGroup component
// ---------------------------------------------------------------------------

describe("CodeGroup component", () => {
  // -------------------------------------------------------------------------
  // Basic structure: two code blocks with labels
  // -------------------------------------------------------------------------
  describe("two fenced blocks with labels", () => {
    // The MDX source must have a blank line between the JSX tag and the
    // fenced code block so remark-mdx parses the code fence as an mdast
    // `code` node rather than an inline child.
    const source = `<CodeGroup>

\`\`\`js title="app.js"
const x = 1;
\`\`\`

\`\`\`py server.py
x = 1
\`\`\`

</CodeGroup>`;

    it("wraps the group in a .code-group container", () => {
      const { html } = renderMdx(source);
      expect(html).toContain('class="code-group"');
    });

    it("wraps each block in a .code-group-item", () => {
      const { html } = renderMdx(source);
      const items = html.match(/class="code-group-item"/g);
      expect(items).toHaveLength(2);
    });

    it("renders the title= meta as the .code-label for the first block", () => {
      const { html } = renderMdx(source);
      expect(html).toMatch(/class="code-label"[^>]*>app\.js</);
    });

    it("renders the bare meta text as the .code-label for the second block", () => {
      const { html } = renderMdx(source);
      expect(html).toMatch(/class="code-label"[^>]*>server\.py</);
    });

    it("renders both code blocks as <pre> elements", () => {
      const { html } = renderMdx(source);
      const pres = html.match(/<pre>/g);
      expect(pres).toHaveLength(2);
    });

    it("renders the first block's content", () => {
      const { html } = renderMdx(source);
      expect(html).toContain("const x = 1");
    });

    it("renders the second block's content", () => {
      const { html } = renderMdx(source);
      expect(html).toContain("x = 1");
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(source);
      expect(html).not.toContain("data-component");
    });

    it(".code-label precedes its <pre> inside .code-group-item", () => {
      const { html } = renderMdx(source);
      // The label must appear before the pre within each item
      expect(html).toMatch(/class="code-label"[^>]*>[^<]*<\/p>[\s\S]*?<pre>/);
    });
  });

  // -------------------------------------------------------------------------
  // Lang-only fallback (no meta)
  // -------------------------------------------------------------------------
  describe("code block with lang only and no meta", () => {
    const source = `<CodeGroup>

\`\`\`js
const a = 1;
\`\`\`

</CodeGroup>`;

    it("falls back to the lang as the .code-label", () => {
      const { html } = renderMdx(source);
      expect(html).toMatch(/class="code-label"[^>]*>js</);
    });

    it("still wraps in .code-group and .code-group-item", () => {
      const { html } = renderMdx(source);
      expect(html).toContain('class="code-group"');
      expect(html).toContain('class="code-group-item"');
    });
  });

  // -------------------------------------------------------------------------
  // Mixed: one block with a filename meta, one with lang-only
  // -------------------------------------------------------------------------
  describe("mixed label derivation", () => {
    const source = `<CodeGroup>

\`\`\`bash
echo hello
\`\`\`

\`\`\`python utils/helper.py
print("hello")
\`\`\`

</CodeGroup>`;

    it("uses lang for the lang-only block", () => {
      const { html } = renderMdx(source);
      expect(html).toMatch(/class="code-label"[^>]*>bash</);
    });

    it("uses bare meta for the meta-bearing block", () => {
      const { html } = renderMdx(source);
      expect(html).toMatch(/class="code-label"[^>]*>utils\/helper\.py</);
    });
  });
});

// ---------------------------------------------------------------------------
// Prompt component
// ---------------------------------------------------------------------------

/**
 * Prompt is a real author-placeable Mintlify component per
 * https://mintlify.com/docs/components/prompt. It renders a copyable prompt
 * card. In print, we show the description as a bold label and the children
 * as the prompt body.
 *
 * Props: description (required, string), children (the prompt text), actions,
 * icon, iconType (all dropped in print — no clipboard/Cursor integration).
 */
describe("Prompt component", () => {
  it("renders as a .prompt block", () => {
    const { html } = renderMdx(
      `<Prompt description="Summarize this article">Write a 3-sentence summary.</Prompt>`
    );
    expect(html).toContain('class="prompt"');
  });

  it("renders the description as the .prompt-label", () => {
    const { html } = renderMdx(
      `<Prompt description="Summarize this article">Write a 3-sentence summary.</Prompt>`
    );
    expect(html).toContain('class="prompt-label"');
    expect(html).toContain("Summarize this article");
  });

  it("renders the children (prompt text) in the body", () => {
    const { html } = renderMdx(
      `<Prompt description="Summarize this article">Write a 3-sentence summary.</Prompt>`
    );
    expect(html).toContain("Write a 3-sentence summary.");
  });

  it("uses the default 'Prompt' label when description is absent", () => {
    const { html } = renderMdx(
      `<Prompt>Translate this to French.</Prompt>`
    );
    expect(html).toContain('class="prompt-label"');
    expect(html).toContain("Prompt");
  });

  it("does not use the passthrough data-component wrapper", () => {
    const { html } = renderMdx(
      `<Prompt description="Do X">content</Prompt>`
    );
    expect(html).not.toContain("data-component");
  });
});
