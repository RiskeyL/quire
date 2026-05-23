import * as cheerio from "cheerio";
import { basename, extname } from "node:path";
import type { PageFrontmatter } from "./render-mdx.js";

/** Inputs for resolving a page's effective title. */
export interface ResolveTitleInput {
  /** Title from the manifest tree node, if any. Highest precedence. */
  manifestTitle?: string;
  /** Parsed page frontmatter (its `title`, if any, is second precedence). */
  frontmatter: PageFrontmatter;
  /** The rendered HTML body of the page. */
  html: string;
  /** The page's file path; its basename is the lowest-precedence fallback. */
  file: string;
}

/** Result of title resolution. */
export interface ResolveTitleResult {
  /** The resolved effective title. */
  title: string;
  /**
   * The page HTML. Identical to the input unless the title was taken from the
   * first body `<h1>`, in which case that `<h1>` is stripped to avoid being
   * duplicated by the page-title heading the assembler emits.
   */
  html: string;
}

/**
 * Resolve a page's effective title with precedence:
 * manifest title > frontmatter title > first body `<h1>` text > filename basename.
 *
 * When (and only when) the title comes from the first body `<h1>`, that `<h1>`
 * is removed from the returned HTML. All other branches return the HTML
 * unchanged.
 */
export function resolveTitle(input: ResolveTitleInput): ResolveTitleResult {
  const manifestTitle = nonEmpty(input.manifestTitle);
  if (manifestTitle !== undefined) {
    return { title: manifestTitle, html: input.html };
  }

  const frontmatterTitle =
    typeof input.frontmatter.title === "string" ? nonEmpty(input.frontmatter.title) : undefined;
  if (frontmatterTitle !== undefined) {
    return { title: frontmatterTitle, html: input.html };
  }

  // Try the first body <h1>. Strip it from the HTML when used.
  const $ = cheerio.load(input.html, null, false);
  const firstH1 = $("h1").first();
  if (firstH1.length > 0) {
    const h1Text = nonEmpty(firstH1.text());
    if (h1Text !== undefined) {
      firstH1.remove();
      return { title: h1Text, html: $.html() };
    }
  }

  // Lowest-precedence fallback: filename basename without extension.
  return { title: basename(input.file, extname(input.file)), html: input.html };
}

/** Return a trimmed string if it has non-whitespace content, else undefined. */
function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
