import { describe, it, expect } from "vitest";
import { renderMdx } from "../../../../src/render/mdx/render-mdx.js";

describe("card/grid components", () => {
  // -------------------------------------------------------------------------
  // CardGroup / Card
  // -------------------------------------------------------------------------
  describe("CardGroup and Card", () => {
    it("wraps cards in a .card-group container", () => {
      const { html } = renderMdx(
        `<CardGroup cols={2}><Card title="Time" icon="clock">10 min</Card></CardGroup>`
      );
      expect(html).toContain('class="card-group"');
    });

    it("renders Card as a .card block", () => {
      const { html } = renderMdx(
        `<CardGroup cols={2}><Card title="Time" icon="clock">10 min</Card></CardGroup>`
      );
      expect(html).toContain('class="card"');
    });

    it("renders Card title as a .card-title paragraph", () => {
      const { html } = renderMdx(
        `<CardGroup cols={2}><Card title="Time" icon="clock">10 min</Card></CardGroup>`
      );
      expect(html).toContain('class="card-title"');
      expect(html).toContain("Time");
    });

    it("renders Card body content", () => {
      const { html } = renderMdx(
        `<CardGroup cols={2}><Card title="Time" icon="clock">10 min</Card></CardGroup>`
      );
      expect(html).toContain("10 min");
    });

    it("does not leak cols prop into output", () => {
      const { html } = renderMdx(
        `<CardGroup cols={2}><Card title="Time" icon="clock">10 min</Card></CardGroup>`
      );
      expect(html).not.toContain("cols");
    });

    it("does not leak icon prop value into output", () => {
      const { html } = renderMdx(
        `<CardGroup cols={2}><Card title="Time" icon="clock">10 min</Card></CardGroup>`
      );
      expect(html).not.toContain("clock");
      expect(html).not.toContain('"icon"');
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(
        `<CardGroup cols={2}><Card title="Time" icon="clock">10 min</Card></CardGroup>`
      );
      expect(html).not.toContain("data-component");
    });
  });

  // -------------------------------------------------------------------------
  // Card with href
  // -------------------------------------------------------------------------
  describe("Card with href", () => {
    it("renders the title as a link when href is present", () => {
      const { html } = renderMdx(
        `<Card title="Models" href="/x">body</Card>`
      );
      expect(html).toContain('href="/x"');
      expect(html).toContain("Models");
      // The link should wrap the title text
      expect(html).toMatch(/<a[^>]+href="\/x"[^>]*>Models<\/a>/);
    });

    it("renders the href as visible text in a .card-href element", () => {
      const { html } = renderMdx(
        `<Card title="Models" href="/x">body</Card>`
      );
      expect(html).toContain('class="card-href"');
      // The href destination must appear as readable text
      expect(html).toMatch(/class="card-href"[^>]*>\/x</);
    });

    it("renders body content alongside the link", () => {
      const { html } = renderMdx(
        `<Card title="Models" href="/x">body</Card>`
      );
      expect(html).toContain("body");
    });

    it("renders the href and body but no title paragraph when href has no title", () => {
      const { html } = renderMdx(`<Card href="/x">body</Card>`);
      // No title means no .card-title paragraph...
      expect(html).not.toContain('class="card-title"');
      // ...but the href is still surfaced as visible text...
      expect(html).toContain('class="card-href"');
      expect(html).toMatch(/class="card-href"[^>]*>\/x</);
      // ...and the body still renders.
      expect(html).toContain("body");
    });
  });

  // -------------------------------------------------------------------------
  // Card description (Mintlify Card has no description prop)
  // -------------------------------------------------------------------------
  describe("Card description prop", () => {
    it("does not render a .card-description even when description is given", () => {
      // Card has no `description` prop per Mintlify; the prop must be ignored
      // and produce no .card-description element (unlike Tile).
      const { html } = renderMdx(
        `<Card title="Models" description="ignored">body</Card>`
      );
      expect(html).not.toContain('class="card-description"');
      expect(html).toContain("body");
    });
  });

  // -------------------------------------------------------------------------
  // Card without title
  // -------------------------------------------------------------------------
  describe("Card without title", () => {
    it("omits the card-title paragraph when no title is given", () => {
      const { html } = renderMdx(`<Card>no title</Card>`);
      expect(html).toContain('class="card"');
      expect(html).not.toContain('class="card-title"');
    });

    it("still renders the body content", () => {
      const { html } = renderMdx(`<Card>no title</Card>`);
      expect(html).toContain("no title");
    });
  });

  // -------------------------------------------------------------------------
  // Columns / Column
  // -------------------------------------------------------------------------
  describe("Columns and Column", () => {
    it("wraps in a .columns container", () => {
      const { html } = renderMdx(
        `<Columns><Column><p>a</p></Column><Column><p>b</p></Column></Columns>`
      );
      expect(html).toContain('class="columns"');
    });

    it("renders each Column as a .column block", () => {
      const { html } = renderMdx(
        `<Columns><Column><p>a</p></Column><Column><p>b</p></Column></Columns>`
      );
      const matches = html.match(/class="column"/g);
      expect(matches).toHaveLength(2);
    });

    it("renders both column bodies", () => {
      const { html } = renderMdx(
        `<Columns><Column><p>a</p></Column><Column><p>b</p></Column></Columns>`
      );
      expect(html).toContain(">a<");
      expect(html).toContain(">b<");
    });

    it("does not leak cols prop from Columns into output", () => {
      const { html } = renderMdx(
        `<Columns cols={3}><Column><p>x</p></Column></Columns>`
      );
      expect(html).not.toContain("cols");
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(
        `<Columns><Column><p>a</p></Column></Columns>`
      );
      expect(html).not.toContain("data-component");
    });
  });

  // -------------------------------------------------------------------------
  // Tile
  // -------------------------------------------------------------------------
  // Tile is a real author-placeable component per Mintlify docs.
  // It is used standalone or nested inside <Columns>; there is no <Tiles>
  // parent container component — Mintlify does not document one.
  //
  // Tile props: href (required), title, description, children (images/SVGs).
  // Rendered as a .tile bordered block, mirroring Card.
  describe("Tile", () => {
    it("renders as a .tile block", () => {
      const { html } = renderMdx(
        `<Tile href="/guide" title="Guide">content</Tile>`
      );
      expect(html).toContain('class="tile"');
    });

    it("renders title as a link when href is present", () => {
      const { html } = renderMdx(
        `<Tile href="/guide" title="Guide">content</Tile>`
      );
      expect(html).toMatch(/<a[^>]+href="\/guide"[^>]*>Guide<\/a>/);
    });

    it("renders the href as visible text in a .tile-href element", () => {
      const { html } = renderMdx(
        `<Tile href="/guide" title="Guide">content</Tile>`
      );
      expect(html).toContain('class="tile-href"');
      expect(html).toMatch(/class="tile-href"[^>]*>\/guide</);
    });

    it("renders description when provided", () => {
      const { html } = renderMdx(
        `<Tile href="/guide" title="Guide" description="A short description">content</Tile>`
      );
      expect(html).toContain("A short description");
    });

    it("renders body children", () => {
      const { html } = renderMdx(
        `<Tile href="/guide" title="Guide">content</Tile>`
      );
      expect(html).toContain("content");
    });

    it("omits tile-title when no title given", () => {
      const { html } = renderMdx(
        `<Tile href="/guide">content</Tile>`
      );
      expect(html).not.toContain('class="tile-title"');
      expect(html).toContain("content");
    });

    it("does not use the passthrough data-component wrapper", () => {
      const { html } = renderMdx(
        `<Tile href="/guide" title="Guide">content</Tile>`
      );
      expect(html).not.toContain("data-component");
    });
  });
});
