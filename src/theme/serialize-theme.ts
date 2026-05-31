import type { BrandTokens } from "./tokens.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape inner double-quotes so the value is safe in a YAML double-quoted scalar. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Emit a string value as a YAML double-quoted scalar. */
function str(s: string): string {
  return `"${esc(s)}"`;
}

/** Emit a number array as a YAML inline-flow sequence. */
function numArray(arr: number[]): string {
  return `[${arr.join(", ")}]`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize a resolved `BrandTokens` object into a grouped, commented brand-theme
 * YAML string. This is the inverse of `parseTheme`: load a theme with `parseTheme`,
 * let the user edit the resolved tokens, then call `serializeTheme` to write them
 * back out.
 *
 * Round-trip guarantee: `parseTheme(serializeTheme(t))` deep-equals `t` for any
 * valid resolved `BrandTokens`.
 *
 * @param tokens  Fully-resolved brand tokens to serialize.
 * @param notes   Optional free-text note block emitted as leading YAML comments.
 *                `parseTheme` ignores comments, so the round-trip is preserved.
 */
export function serializeTheme(tokens: BrandTokens, notes?: string): string {
  const lines: string[] = [];

  // -- Notes comment block ---------------------------------------------------
  if (notes && notes.trim().length > 0) {
    lines.push("# Notes:");
    for (const line of notes.split("\n")) {
      lines.push(`# ${line}`);
    }
    lines.push("");
  }

  // -- page ------------------------------------------------------------------
  lines.push("page:");
  lines.push(`  size: ${str(tokens.page.size)}       # Page size: A4 or Letter`);
  lines.push(`  margin: ${str(tokens.page.margin)}   # Uniform page margin (PDF @page margin)`);
  lines.push("");

  // -- colors ----------------------------------------------------------------
  lines.push("colors:");
  lines.push(`  text: ${str(tokens.colors.text)}     # Body text color`);
  lines.push(`  heading: ${str(tokens.colors.heading)}  # Heading color`);
  lines.push(`  link: ${str(tokens.colors.link)}     # Hyperlink color`);
  lines.push(`  accent: ${str(tokens.colors.accent)}   # Accent color`);
  lines.push(`  muted: ${str(tokens.colors.muted)}   # Captions and secondary text`);
  lines.push(`  surface: ${str(tokens.colors.surface)}  # Light fills for code blocks, callouts, panels`);
  lines.push(`  border: ${str(tokens.colors.border)}   # Hairlines for table cells, rules, separators`);
  lines.push("");

  // -- semantic --------------------------------------------------------------
  lines.push("semantic:");
  lines.push(`  success: ${str(tokens.semantic.success)}  # Tip and Check callouts`);
  lines.push(`  caution: ${str(tokens.semantic.caution)}  # Note callout and required-field badge`);
  lines.push(`  danger: ${str(tokens.semantic.danger)}   # Warning and Danger callouts`);
  lines.push("");

  // -- shape -----------------------------------------------------------------
  lines.push("shape:");
  lines.push(`  radius: ${str(tokens.shape.radius)}   # Corner radius for code, callouts, cards, badges`);
  lines.push("");

  // -- typography ------------------------------------------------------------
  lines.push("typography:");
  lines.push(`  bodyFont: ${str(tokens.typography.bodyFont)}    # Body font stack`);
  lines.push(`  headingFont: ${str(tokens.typography.headingFont)}  # Heading font stack`);
  lines.push(`  monoFont: ${str(tokens.typography.monoFont)}    # Code and pre font stack`);
  lines.push(`  baseSize: ${str(tokens.typography.baseSize)}    # Base body font size`);
  lines.push(`  lineHeight: ${tokens.typography.lineHeight}     # Body line height (PDF only)`);
  lines.push("");

  // -- headings --------------------------------------------------------------
  lines.push("headings:");
  lines.push(`  scale: ${numArray(tokens.headings.scale)}     # h1 through h6 font sizes in em`);
  lines.push(`  weight: ${numArray(tokens.headings.weight)}   # h1 through h6 font weights`);
  lines.push("");

  // -- toc -------------------------------------------------------------------
  lines.push("toc:");
  lines.push(`  title: ${str(tokens.toc.title)}   # Heading text above the table of contents`);
  lines.push(`  depth: ${tokens.toc.depth}         # Number of heading levels shown in the TOC`);
  lines.push("");

  // -- links -----------------------------------------------------------------
  lines.push("links:");
  lines.push(`  underline: ${tokens.links.underline}   # Underline hyperlinks in PDF and Word`);
  lines.push("");

  // -- density ---------------------------------------------------------------
  lines.push(`density: ${str(tokens.density)}   # Vertical rhythm preset: "compact", "normal", or "relaxed"`);
  lines.push("");

  // -- header ----------------------------------------------------------------
  lines.push("header:");
  lines.push(`  left: ${str(tokens.header.left)}     # Running-header left slot (docTitle, chapter, pageNumber, none, or literal text)`);
  lines.push(`  center: ${str(tokens.header.center)}  # Running-header center slot`);
  lines.push(`  right: ${str(tokens.header.right)}   # Running-header right slot`);
  lines.push("");

  // -- footer ----------------------------------------------------------------
  lines.push("footer:");
  lines.push(`  left: ${str(tokens.footer.left)}     # Running-footer left slot`);
  lines.push(`  center: ${str(tokens.footer.center)}  # Running-footer center slot`);
  lines.push(`  right: ${str(tokens.footer.right)}   # Running-footer right slot`);
  lines.push("");

  // -- furniture -------------------------------------------------------------
  lines.push("furniture:");
  lines.push(`  fontSize: ${str(tokens.furniture.fontSize)}  # Running header and footer text size`);
  lines.push(`  color: ${str(tokens.furniture.color)}        # Running header and footer text color`);
  lines.push("");

  // -- pageNumbers -----------------------------------------------------------
  lines.push("pageNumbers:");
  lines.push(`  restartAtBody: ${tokens.pageNumbers.restartAtBody}   # Restart page numbering at the first body page`);
  lines.push("");

  // -- tables ----------------------------------------------------------------
  lines.push("tables:");
  lines.push(`  layout: ${str(tokens.tables.layout)}   # Table column sizing: "fixed" or "auto"`);
  lines.push("");

  // -- meta ------------------------------------------------------------------
  lines.push("meta:");
  lines.push(`  showDescription: ${tokens.meta.showDescription}   # Render each page's frontmatter description as a lede`);
  lines.push("");

  // -- cover -----------------------------------------------------------------
  lines.push("cover:");
  lines.push(`  layout: ${str(tokens.cover.layout)}       # Cover layout: "spine" or "plain"`);
  lines.push(`  spineWidth: ${str(tokens.cover.spineWidth)}  # Width of the cover spine bar (PDF only)`);
  lines.push(`  logoWidth: ${str(tokens.cover.logoWidth)}   # Cover logo width`);
  lines.push("");

  // -- badges ----------------------------------------------------------------
  lines.push("badges:");
  lines.push(`  color: ${str(tokens.badges.color)}   # Badge border and text color: "accent", "muted", or a hex value`);
  lines.push("");

  // -- components ------------------------------------------------------------
  lines.push("components:");
  lines.push(`  gap: ${tokens.components.gap}   # Multiplier on vertical spacing around component blocks`);
  lines.push("");

  // -- brand (optional) ------------------------------------------------------
  const hasBrand = tokens.brand.logo !== undefined || tokens.brand.productName !== undefined;
  if (hasBrand) {
    lines.push("brand:");
    if (tokens.brand.logo !== undefined) {
      lines.push(`  logo: ${str(tokens.brand.logo)}   # Cover logo path`);
    }
    if (tokens.brand.productName !== undefined) {
      lines.push(`  productName: ${str(tokens.brand.productName)}   # Product name shown on the cover`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
