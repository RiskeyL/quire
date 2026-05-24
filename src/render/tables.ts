import * as cheerio from "cheerio";

/**
 * Give every `<table>` an equal-width `<colgroup>` (one `<col>` per column) so
 * both outputs render fixed, evenly-distributed columns instead of content-fit
 * ones.
 *
 * Why: Pandoc's Word output autofits columns to content, so a long unbreakable
 * token in one column starves the rest (e.g. a Description column crushed to a
 * few characters wide). When a table declares explicit column widths, Pandoc
 * emits a fixed-layout docx table with equal `gridCol`s (verified empirically),
 * and Chromium honors the same widths under `table-layout: fixed`. Equal widths
 * are the safe generic default: per-column semantics can't be inferred.
 *
 * Column count comes from the first row's summed `colspan`. Tables that already
 * declare a `<colgroup>` are left untouched (respect authored widths). This is
 * called only when `tables.layout` is "fixed"; "auto" leaves tables content-fit
 * in both outputs.
 */
export function setTableColumnWidths(html: string): string {
  const $ = cheerio.load(html, null, false);
  $("table").each((_, table) => {
    const $table = $(table);
    // Respect an authored colgroup (do not override explicit column widths).
    if ($table.children("colgroup").length > 0) return;
    // Column count = the first row's cells, summing colspan.
    let cols = 0;
    $table
      .find("tr")
      .first()
      .children("th, td")
      .each((__, cell) => {
        const span = parseInt($(cell).attr("colspan") ?? "1", 10);
        cols += Number.isFinite(span) && span > 0 ? span : 1;
      });
    if (cols < 1) return;
    const width = (100 / cols).toFixed(4);
    const colTags = Array.from(
      { length: cols },
      () => `<col style="width: ${width}%" />`
    ).join("");
    $table.prepend(`<colgroup>${colTags}</colgroup>`);
  });
  return $.html();
}
