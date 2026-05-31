// src/designer/form-spec.ts
/**
 * Declarative spec for the designer token-editing form.
 * Pure data — no DOM, no Node builtins. Browser-pure.
 *
 * Groups and fields are ordered to match the serialize-theme.ts output order
 * so the YAML preview section headers align with the form groups.
 *
 * brand.logo is excluded (deferred to D5d file-picker).
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
    id: "colors",
    title: "COLORS",
    fields: [
      { path: "colors.text",    label: "text",    control: "color", help: "Body text color" },
      { path: "colors.heading", label: "heading", control: "color", help: "Heading color" },
      { path: "colors.link",    label: "link",    control: "color", help: "Hyperlink color" },
      { path: "colors.accent",  label: "accent",  control: "color", help: "Accent color for rules and highlights" },
      { path: "colors.muted",   label: "muted",   control: "color", help: "Captions and secondary text" },
      { path: "colors.surface", label: "surface", control: "color", help: "Light fills: code blocks, callouts, panels" },
      { path: "colors.border",  label: "border",  control: "color", help: "Hairlines: table cells, rules, separators" },
    ],
  },
  {
    id: "semantic",
    title: "SEMANTIC",
    fields: [
      { path: "semantic.success", label: "success", control: "color", help: "Tip and Check callouts" },
      { path: "semantic.caution", label: "caution", control: "color", help: "Note callout and required-field badge" },
      { path: "semantic.danger",  label: "danger",  control: "color", help: "Warning and Danger callouts" },
    ],
  },
  {
    id: "shape",
    title: "SHAPE",
    fields: [
      {
        path: "shape.radius",
        label: "radius",
        control: "text",
        help: "Corner radius for code blocks, callouts, badges. Use 0 for sharp corners.",
      },
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
        help: "Number of heading levels shown in the TOC (1-6)",
      },
    ],
  },
  {
    id: "links",
    title: "LINKS",
    fields: [
      {
        path: "links.underline",
        label: "underline",
        control: "toggle",
        help: "Underline hyperlinks in PDF and Word",
      },
    ],
  },
  {
    id: "density",
    title: "DENSITY",
    fields: [
      {
        path: "density",
        label: "density",
        control: "select",
        options: ["compact", "normal", "relaxed"],
        help: "Vertical rhythm preset: scales paragraph and block spacing",
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
    ],
  },
  {
    id: "pageNumbers",
    title: "PAGE NUMBERS",
    fields: [
      {
        path: "pageNumbers.restartAtBody",
        label: "restart at body",
        control: "toggle",
        help: "Restart page numbering at the first body page; cover and TOC are unnumbered",
      },
    ],
  },
  {
    id: "meta",
    title: "META",
    fields: [
      {
        path: "meta.showDescription",
        label: "show description",
        control: "toggle",
        help: "Render each page's frontmatter description as a lede beneath the title",
      },
    ],
  },
  {
    id: "tables",
    title: "TABLES",
    fields: [
      {
        path: "tables.layout",
        label: "layout",
        control: "select",
        options: ["fixed", "auto"],
        help: '"fixed" gives equal-width columns; "auto" sizes columns to content',
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
    ],
  },
  {
    id: "badges",
    title: "BADGES",
    fields: [
      {
        path: "badges.color",
        label: "color",
        control: "text",
        help: 'Badge border and text color: "accent", "muted", or a hex value (PDF only)',
      },
    ],
  },
  {
    id: "components",
    title: "COMPONENTS",
    fields: [
      {
        path: "components.gap",
        label: "gap",
        control: "number",
        min: 0,
        max: 3,
        step: 0.1,
        help: "Multiplier on vertical spacing around component blocks (PDF only)",
      },
    ],
  },
  {
    id: "brand",
    title: "BRAND",
    fields: [
      {
        path: "brand.productName",
        label: "product name",
        control: "text",
        help: "Product name shown above the title on the cover (both PDF and Word). Omit to hide.",
      },
      // brand.logo deferred to D5d (requires file-picker)
    ],
  },
];
