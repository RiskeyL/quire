import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

/**
 * Patterns that identify a link as docs "page chrome" (edit / report / feedback
 * links a site appends to every page), rather than real content.
 *
 * A link counts as chrome when either its href OR its visible text matches.
 * Hrefs: a GitHub-style edit URL (`.../edit/...`) or an issues URL
 * (`.../issues/new` or `.../issues`). Text: "Edit this page" / "Report an
 * issue" (case-insensitive, allowing surrounding whitespace).
 */
const CHROME_HREF_PATTERNS: RegExp[] = [/\/edit\//i, /\/issues(\/new)?(\?|#|$)/i];
const CHROME_TEXT_PATTERNS: RegExp[] = [
  /^\s*edit this page\s*$/i,
  /^\s*report an issue\s*$/i,
];

/** True when a single `<a>` element is recognizable edit/report/feedback chrome. */
function isChromeLink($: cheerio.CheerioAPI, el: Element): boolean {
  const href = $(el).attr("href") ?? "";
  const text = $(el).text();
  return (
    CHROME_HREF_PATTERNS.some((re) => re.test(href)) ||
    CHROME_TEXT_PATTERNS.some((re) => re.test(text))
  );
}

/**
 * True when a paragraph consists ONLY of links plus separators/whitespace and
 * every link is chrome. Requires at least one link. Any non-link, non-whitespace
 * text node (e.g. real prose) disqualifies the paragraph, so a real paragraph
 * that merely happens to contain an edit link is never removed.
 */
function isChromeParagraph($: cheerio.CheerioAPI, p: Element): boolean {
  let linkCount = 0;
  const children = p.children as AnyNode[];
  for (const child of children) {
    if (child.type === "text") {
      // Allow only whitespace and separator characters between links.
      if (!/^[\s|·•·,\-–—/]*$/.test(child.data)) return false;
      continue;
    }
    if (child.type === "tag") {
      const tagged = child as Element;
      if (tagged.tagName !== "a") return false;
      if (!isChromeLink($, tagged)) return false;
      linkCount++;
      continue;
    }
    // Comments and other node types are ignored; anything unexpected is safe to skip.
  }
  return linkCount > 0;
}

/**
 * Remove trailing docs "page chrome" (the edit-this-page / report-an-issue
 * footer that a docs site appends to every page) from an HTML fragment.
 *
 * Strategy: inspect the LAST element in the fragment. If it is a `<p>` made up
 * solely of chrome links (and separators), remove it. If removing it leaves a
 * dangling trailing `<hr>` (the rule the footer was separated by), remove that
 * too. Only the document's trailing chrome is targeted, so a links-only edit
 * paragraph that appears mid-document is left untouched.
 *
 * Conservative by design: a paragraph that contains any real prose, or links
 * that are not edit/report/feedback chrome, is never removed.
 */
export function stripPageChrome(html: string): string {
  const $ = cheerio.load(html, null, false);

  // Find the last element-type child of the fragment root (skipping whitespace
  // text nodes that cheerio may keep between blocks).
  const topLevel = $.root().children().toArray();
  let lastIdx = topLevel.length - 1;
  while (lastIdx >= 0 && topLevel[lastIdx].type !== "tag") lastIdx--;
  if (lastIdx < 0) return $.html();

  const last = topLevel[lastIdx] as Element;
  if (last.tagName !== "p" || !isChromeParagraph($, last)) {
    return $.html();
  }

  $(last).remove();

  // Drop a now-dangling trailing <hr> the footer was separated from.
  const remaining = $.root().children().toArray();
  let prevIdx = remaining.length - 1;
  while (prevIdx >= 0 && remaining[prevIdx].type !== "tag") prevIdx--;
  if (prevIdx >= 0 && (remaining[prevIdx] as Element).tagName === "hr") {
    $(remaining[prevIdx] as Element).remove();
  }

  return $.html();
}
