import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

/**
 * Tests for inline (text-level) components: Badge, Tooltip, Icon.
 *
 * Color is NOT tested: the Mintlify Color component is a block-level design
 * tool using Color.Item/Color.Row dot-notation sub-components, not an inline
 * author-placeable. It is skipped per the Banner/Tiles precedent.
 */

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

describe("Badge", () => {
  it("renders as an inline <span class=\"badge\">, not a <div>", () => {
    const { html } = renderMdx(`Status: <Badge>New</Badge>`);
    expect(html).toContain('class="badge"');
    expect(html).toMatch(/<span[^>]*class="badge"[^>]*>/);
    expect(html).not.toMatch(/<div[^>]*class="badge"/);
  });

  it("renders children inside the badge span", () => {
    const { html } = renderMdx(`Status: <Badge>New</Badge>`);
    expect(html).toContain(">New<");
  });

  it("renders inline within a paragraph (not as a block element outside it)", () => {
    const { html } = renderMdx(`Status: <Badge>New</Badge>`);
    // The badge span must appear inside the paragraph's <p> element, confirming
    // it is treated as inline content, not hoisted out to block level.
    expect(html).toMatch(/<p[^>]*>[\s\S]*<span[^>]*class="badge"[^>]*>New<\/span>[\s\S]*<\/p>/);
  });

  it("does not use the passthrough data-component wrapper", () => {
    const { html } = renderMdx(`<Badge>Beta</Badge>`);
    expect(html).not.toContain("data-component");
  });

  it("reflects color variant as an additional badge class when color is provided", () => {
    const { html } = renderMdx(`<Badge color="green">Active</Badge>`);
    // Should add badge-green class while keeping the base badge class.
    expect(html).toMatch(/class="badge badge-green"/);
    expect(html).toContain("Active");
  });

  it("renders a badge without color using only the base class", () => {
    const { html } = renderMdx(`<Badge>Default</Badge>`);
    // No extra class beyond "badge" when no color is given.
    expect(html).toMatch(/class="badge"/);
    expect(html).not.toMatch(/class="badge badge-/);
  });
});

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

describe("Tooltip", () => {
  it("renders an inline <span class=\"tooltip\">, not a <div>", () => {
    const { html } = renderMdx(
      `<Tooltip tip="Large Language Model">LLM</Tooltip>`
    );
    expect(html).toContain('class="tooltip"');
    expect(html).toMatch(/<span[^>]*class="tooltip"[^>]*>/);
    expect(html).not.toMatch(/<div[^>]*class="tooltip"/);
  });

  it("renders the trigger text inside the tooltip span", () => {
    const { html } = renderMdx(
      `<Tooltip tip="Large Language Model">LLM</Tooltip>`
    );
    expect(html).toContain("LLM");
  });

  it("renders the tip text in a .tooltip-tip span", () => {
    const { html } = renderMdx(
      `<Tooltip tip="Large Language Model">LLM</Tooltip>`
    );
    expect(html).toContain('class="tooltip-tip"');
    expect(html).toContain("Large Language Model");
  });

  it("wraps the tip in parentheses after the trigger text", () => {
    const { html } = renderMdx(
      `<Tooltip tip="Large Language Model">LLM</Tooltip>`
    );
    // The tip must follow the trigger and be in parentheses.
    expect(html).toMatch(/LLM.*\(.*Large Language Model.*\)/s);
  });

  it("renders the tooltip-tip span inside the outer tooltip span", () => {
    const { html } = renderMdx(
      `<Tooltip tip="Large Language Model">LLM</Tooltip>`
    );
    expect(html).toMatch(
      /<span[^>]*class="tooltip"[^>]*>[\s\S]*<span[^>]*class="tooltip-tip"[^>]*>Large Language Model<\/span>[\s\S]*<\/span>/
    );
  });

  it("renders only the trigger when no tip prop is present", () => {
    const { html } = renderMdx(`<Tooltip>hover me</Tooltip>`);
    expect(html).toContain("hover me");
    // No tooltip-tip span when there is no tip.
    expect(html).not.toContain('class="tooltip-tip"');
  });

  it("does not use the passthrough data-component wrapper", () => {
    const { html } = renderMdx(
      `<Tooltip tip="test">trigger</Tooltip>`
    );
    expect(html).not.toContain("data-component");
  });
});

// ---------------------------------------------------------------------------
// Icon — renders nothing (icons dropped project-wide)
// ---------------------------------------------------------------------------

describe("Icon", () => {
  it("renders nothing for the Icon itself", () => {
    const { html } = renderMdx(`before <Icon icon="star" /> after`);
    // The icon name must not appear in any form.
    expect(html).not.toContain("star");
  });

  it("preserves surrounding text when Icon is dropped", () => {
    const { html } = renderMdx(`before <Icon icon="star" /> after`);
    expect(html).toContain("before");
    expect(html).toContain("after");
  });

  it("does not emit a data-component wrapper for Icon", () => {
    const { html } = renderMdx(`<Icon icon="flag" />`);
    expect(html).not.toContain("data-component");
  });

  it("does not emit any element for Icon when combined with inline text", () => {
    const { html } = renderMdx(`Click <Icon icon="arrow-right" /> here`);
    // The icon name should not appear, and no span/div for the icon.
    expect(html).not.toContain("arrow-right");
    expect(html).not.toContain('"Icon"');
  });
});
