import { describe, it, expect } from "vitest";
import { setTableColumnWidths } from "../../src/render/tables.js";

describe("setTableColumnWidths", () => {
  it("injects an equal-width colgroup matching the column count", () => {
    const html =
      "<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>" +
      "<tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>";
    const out = setTableColumnWidths(html);
    const cols = out.match(/<col\b[^>]*>/g) ?? [];
    expect(cols).toHaveLength(3);
    // 100 / 3 = 33.3333
    expect(out).toContain("<colgroup>");
    expect(cols.every((c) => /width:\s*33\.3333%/.test(c))).toBe(true);
  });

  it("places the colgroup before the table body", () => {
    const html = "<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
    const out = setTableColumnWidths(html);
    expect(out.indexOf("<colgroup>")).toBeLessThan(out.indexOf("<tbody>"));
    expect((out.match(/<col\b[^>]*>/g) ?? [])).toHaveLength(2);
  });

  it("leaves a table that already declares a colgroup untouched", () => {
    const html =
      '<table><colgroup><col style="width: 70%" /><col style="width: 30%" /></colgroup>' +
      "<tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
    const out = setTableColumnWidths(html);
    expect(out).toContain('width: 70%');
    expect((out.match(/<colgroup>/g) ?? [])).toHaveLength(1);
  });

  it("counts columns by the first row's summed colspan", () => {
    const html =
      '<table><thead><tr><th colspan="2">Wide</th><th>C</th></tr></thead>' +
      "<tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>";
    const out = setTableColumnWidths(html);
    // colspan 2 + 1 = 3 columns
    expect((out.match(/<col\b[^>]*>/g) ?? [])).toHaveLength(3);
  });

  it("leaves non-table HTML unchanged", () => {
    const html = "<p>No tables here. <code>inline</code></p>";
    expect(setTableColumnWidths(html)).toContain("No tables here.");
    expect(setTableColumnWidths(html)).not.toContain("<colgroup>");
  });

  it("handles multiple tables independently", () => {
    const html =
      "<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>" +
      "<table><tbody><tr><td>a</td><td>b</td><td>c</td><td>d</td></tr></tbody></table>";
    const out = setTableColumnWidths(html);
    expect((out.match(/<colgroup>/g) ?? [])).toHaveLength(2);
    expect((out.match(/<col\b[^>]*>/g) ?? [])).toHaveLength(6); // 2 + 4
  });
});
