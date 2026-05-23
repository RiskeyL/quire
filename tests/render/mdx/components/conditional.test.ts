import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

/**
 * Tests for conditional-content components: View and Visibility.
 *
 * View — verified props (https://mintlify.com/docs/components/view):
 *   `title` (string, required): identifies which view panel this is (e.g. "Python")
 *   `icon`, `iconType` — dropped in print (web-only decorative props)
 *   In a browser, only the active panel is shown. In print, there is no
 *   interactive view-switching so ALL panels are rendered. View is a switchable
 *   panel like Tab, so it reuses the expand-and-label treatment: its `title`
 *   becomes a `<p class="view-label">` above the panel content.
 *
 * Visibility — verified props (https://mintlify.com/docs/components/visibility):
 *   `for` (string, required): `"humans"` | `"agents"`
 *   - `for="humans"`: rendered on the web UI, excluded from Markdown.
 *     Quire produces a HUMAN-facing print document → RENDER this content.
 *   - `for="agents"`: hidden on the web UI, appears in Markdown (for AI ingestion).
 *     Quire produces human-facing output → DROP this content (return []).
 *   - No `for` prop: treated as human content → RENDER.
 */

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

describe("View", () => {
  it("renders its children inside a labeled view block", () => {
    const { html } = renderMdx(`<View title="Python">visible content</View>`);
    expect(html).toContain("visible content");
    expect(html).toContain('class="view"');
  });

  it("does not use the passthrough data-component wrapper", () => {
    const { html } = renderMdx(`<View title="Python">visible content</View>`);
    expect(html).not.toContain("data-component");
  });

  it("renders the title as a view-label (expand-and-label, like Tab)", () => {
    const { html } = renderMdx(`<View title="Python">visible content</View>`);
    expect(html).toMatch(/<p class="view-label">Python<\/p>/);
  });

  it("renders children and labels from multiple View panels (all preserved in print)", () => {
    const src = `<View title="Python">Python example</View>
<View title="Node">Node example</View>`;
    const { html } = renderMdx(src);
    expect(html).toContain("Python example");
    expect(html).toContain("Node example");
    expect(html).toContain("Python");
    expect(html).toContain("Node");
  });

  it("renders children with rich content (not just plain text)", () => {
    const { html } = renderMdx(
      `<View title="Example">**bold text** and _italic_</View>`
    );
    expect(html).toContain("bold text");
  });
});

// ---------------------------------------------------------------------------
// Visibility — human content rendered, agent content dropped
// ---------------------------------------------------------------------------

describe("Visibility", () => {
  it('renders children when for="humans" (human-facing content is kept)', () => {
    const { html } = renderMdx(
      `<Visibility for="humans">human readable content</Visibility>`
    );
    expect(html).toContain("human readable content");
  });

  it('renders children when no for prop is provided (defaults to human content)', () => {
    const { html } = renderMdx(
      `<Visibility>default audience content</Visibility>`
    );
    expect(html).toContain("default audience content");
  });

  it('drops children when for="agents" (AI-agent-only content is excluded from print)', () => {
    const { html } = renderMdx(
      `<Visibility for="agents">AI-only instructions here</Visibility>`
    );
    expect(html).not.toContain("AI-only instructions here");
  });

  it('preserves surrounding content when an agents Visibility block is dropped', () => {
    const src = `before

<Visibility for="agents">secret AI content</Visibility>

after`;
    const { html } = renderMdx(src);
    expect(html).toContain("before");
    expect(html).toContain("after");
    expect(html).not.toContain("secret AI content");
  });

  it("does not use the passthrough data-component wrapper for either audience", () => {
    const { html: htmlHumans } = renderMdx(
      `<Visibility for="humans">human</Visibility>`
    );
    expect(htmlHumans).not.toContain("data-component");

    const { html: htmlAgents } = renderMdx(
      `<Visibility for="agents">agent</Visibility>`
    );
    expect(htmlAgents).not.toContain("data-component");
  });

  it('does not emit a visibility wrapper element for for="humans" content', () => {
    const { html } = renderMdx(
      `<Visibility for="humans">human content</Visibility>`
    );
    expect(html).not.toMatch(/class="visibility"/);
  });
});
