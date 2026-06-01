// src/designer/form-spec.ts
/**
 * Declarative spec for the designer token-editing form.
 * Pure data — no DOM, no Node builtins. Browser-pure.
 *
 * Groups are ordered to follow the reader's path through the document: page
 * setup, then the cover and table of contents (the front matter), then the
 * body's type and color, then the running header/footer chrome. Single-control
 * token areas are folded into broader sections (STYLE, CONTENT, FURNITURE) so
 * the panel reads as a dozen meaningful groups rather than two dozen one-line
 * accordions. The YAML preview is the full serialize-theme output and does not
 * depend on this grouping.
 *
 * brand.logo is excluded (set via the logo file-picker, not a token field).
 */

export type ControlType =
  | "color"
  | "text"
  | "select"
  | "toggle"
  | "number"
  | "number-array"
  | "slot";

export interface FieldSpec {
  /** Dotted token path, e.g. "colors.text" or "density" or "headings.scale". */
  path: string;
  /** Short label shown next to the control. */
  label: string;
  control: ControlType;
  /** Allowed values for "select" controls. */
  options?: string[];
  /** One-line help shown below the control. */
  help?: string;
  /** Number/number-array: inclusive minimum. */
  min?: number;
  /** Number/number-array: inclusive maximum. */
  max?: number;
  /** Number/number-array: step increment. */
  step?: number;
  /** number-array: how many inputs to render (one per array element). */
  count?: number;
  /** text/slot: placeholder shown when the field is empty. */
  placeholder?: string;
}

export interface GroupSpec {
  id: string;
  title: string;
  fields: FieldSpec[];
}

export const FORM_SPEC: GroupSpec[] = [
  {
    id: "page",
    title: "PAGE",
    fields: [
      {
        path: "page.size",
        label: "size",
        control: "select",
        options: ["A4", "Letter"],
        help: "PDF @page size",
      },
      {
        path: "page.margin",
        label: "margin",
        control: "text",
        help: "Uniform page margin, e.g. 2cm or 1in",
      },
    ],
  },
  {
    id: "cover",
    title: "COVER",
    fields: [
      {
        path: "cover.layout",
        label: "layout",
        control: "select",
        options: ["spine", "plain"],
        help: '"spine" adds a brand-color bar down the left edge (PDF only)',
      },
      {
        path: "cover.titleAnchor",
        label: "title anchor",
        control: "select",
        options: ["top", "center", "bottom"],
        help: "Vertical position of the title block; the logo stays at the top (PDF only)",
      },
      {
        path: "cover.align",
        label: "align",
        control: "select",
        options: ["left", "center"],
        help: "Horizontal alignment of the cover content (PDF only)",
      },
      {
        path: "cover.spineWidth",
        label: "spine width",
        control: "text",
        help: "Width of the cover spine bar, e.g. 16mm (PDF only)",
      },
      {
        path: "cover.logoWidth",
        label: "logo width",
        control: "text",
        help: "Cover logo width, e.g. 44mm",
      },
      {
        path: "cover.titleSize",
        label: "title size",
        control: "text",
        help: "Cover title font size, e.g. 2.8em or 32pt (PDF only)",
      },
      {
        path: "brand.productName",
        label: "product name",
        control: "text",
        placeholder: "Documentation",
        help: "Product name shown above the title on the cover (both PDF and Word). Omit to hide.",
      },
    ],
  },
  {
    id: "toc",
    title: "TOC",
    fields: [
      {
        path: "toc.title",
        label: "title",
        control: "text",
        help: "Heading text above the table of contents",
      },
      {
        path: "toc.depth",
        label: "depth",
        control: "number",
        min: 1,
        max: 6,
        step: 1,
        help: "Heading levels shown in the exported TOC (1-6). The preview's TOC is a fixed sample and does not change with this value.",
      },
    ],
  },
  {
    id: "colors",
    title: "COLORS",
    fields: [
      { path: "colors.text",    label: "text · body",                control: "color" },
      { path: "colors.heading", label: "heading · titles",           control: "color" },
      { path: "colors.link",    label: "link · hyperlinks",          control: "color" },
      { path: "colors.accent",  label: "accent · rules, highlights",  control: "color" },
      { path: "colors.muted",   label: "muted · captions, secondary", control: "color" },
      { path: "colors.surface", label: "surface · backgrounds",       control: "color" },
      { path: "colors.border",  label: "border · lines",              control: "color" },
    ],
  },
  {
    id: "semantic",
    title: "SEMANTIC",
    fields: [
      { path: "semantic.info",    label: "info",    control: "color", help: "Info callout" },
      { path: "semantic.success", label: "success", control: "color", help: "Tip and Check callouts" },
      { path: "semantic.caution", label: "caution", control: "color", help: "Note callout and required-field badge" },
      { path: "semantic.danger",  label: "danger",  control: "color", help: "Warning and Danger callouts" },
    ],
  },
  {
    id: "typography",
    title: "TYPOGRAPHY",
    fields: [
      { path: "typography.bodyFont",    label: "body font",    control: "text", help: "Body font stack (CSS font-family)" },
      { path: "typography.headingFont", label: "heading font", control: "text", help: "Heading font stack" },
      { path: "typography.monoFont",    label: "mono font",    control: "text", help: "Code and pre font stack. Lead with an Office-bundled name for Word." },
      { path: "typography.baseSize",    label: "base size",    control: "text", help: "Base body font size, e.g. 11pt or 10pt" },
      {
        path: "typography.lineHeight",
        label: "line height",
        control: "number",
        min: 1,
        max: 2.5,
        step: 0.05,
        help: "Body line height (PDF only)",
      },
    ],
  },
  {
    id: "headings",
    title: "HEADINGS",
    fields: [
      {
        path: "headings.scale",
        label: "scale (h1-h6)",
        control: "number-array",
        count: 6,
        min: 0.5,
        max: 4,
        step: 0.05,
        help: "Font size multipliers in em for h1 through h6",
      },
      {
        path: "headings.weight",
        label: "weight (h1-h6)",
        control: "number-array",
        count: 6,
        min: 100,
        max: 900,
        step: 100,
        help: "Font weights for h1 through h6 (PDF only)",
      },
    ],
  },
  {
    id: "style",
    title: "STYLE",
    fields: [
      {
        path: "shape.radius",
        label: "radius",
        control: "text",
        help: "Corner radius for code blocks, callouts, badges. Use 0 for sharp corners.",
      },
      {
        path: "density",
        label: "density",
        control: "select",
        options: ["compact", "normal", "relaxed"],
        help: "Vertical rhythm preset: scales paragraph and block spacing",
      },
      {
        path: "components.gap",
        label: "block gap",
        control: "number",
        min: 0,
        max: 3,
        step: 0.1,
        help: "Multiplier on vertical spacing around component blocks (PDF only)",
      },
      {
        path: "badges.color",
        label: "badge color",
        control: "text",
        help: 'Badge border and text color: "accent", "muted", or a hex value (PDF only)',
      },
    ],
  },
  {
    id: "content",
    title: "CONTENT",
    fields: [
      {
        path: "links.underline",
        label: "link underline",
        control: "toggle",
        help: "Underline hyperlinks in PDF and Word",
      },
      {
        path: "tables.layout",
        label: "table layout",
        control: "select",
        options: ["fixed", "auto"],
        help: '"fixed" gives equal-width columns; "auto" sizes columns to content',
      },
      {
        path: "meta.showDescription",
        label: "show description",
        control: "toggle",
        help: "Render each page's frontmatter description as a lede beneath the title",
      },
    ],
  },
  {
    id: "header",
    title: "HEADER",
    fields: [
      { path: "header.left",   label: "left",   control: "slot", help: "Running-header left slot" },
      { path: "header.center", label: "center", control: "slot", help: "Running-header center slot" },
      { path: "header.right",  label: "right",  control: "slot", help: "Running-header right slot" },
    ],
  },
  {
    id: "footer",
    title: "FOOTER",
    fields: [
      { path: "footer.left",   label: "left",   control: "slot", help: "Running-footer left slot" },
      { path: "footer.center", label: "center", control: "slot", help: "Running-footer center slot" },
      { path: "footer.right",  label: "right",  control: "slot", help: "Running-footer right slot" },
    ],
  },
  {
    id: "furniture",
    title: "FURNITURE",
    fields: [
      { path: "furniture.fontSize", label: "font size", control: "text",  help: "Running header and footer text size, e.g. 9pt" },
      { path: "furniture.color",    label: "color",     control: "color", help: "Running header and footer text color" },
      {
        path: "pageNumbers.restartAtBody",
        label: "restart numbering",
        control: "toggle",
        help: "Restart page numbering at the first body page; cover and TOC are unnumbered",
      },
    ],
  },
];
