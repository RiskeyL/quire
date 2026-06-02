import { load } from "js-yaml";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Resolved type
// ---------------------------------------------------------------------------

/** Fully-resolved brand tokens (all fields present after merging with defaults). */
export interface BrandTokens {
  page: { size: "A4" | "Letter"; margin: string };
  colors: {
    text: string;
    heading: string;
    link: string;
    accent: string;
    muted: string;
    surface: string;
    border: string;
  };
  semantic: { info: string; success: string; caution: string; danger: string };
  shape: { radius: string };
  typography: {
    bodyFont: string;
    headingFont: string;
    monoFont: string;
    baseSize: string;
    lineHeight: number;
  };
  toc: { title: string; depth: number };
  headings: { scale: number[]; weight: number[] };
  links: { underline: boolean };
  density: "compact" | "normal" | "relaxed";
  header: { left: string; center: string; right: string };
  /**
   * Running-footer slots plus an optional `note`. A slot set to `"note"` renders
   * the note as a Paged.js running element, so its URL is a real clickable link in
   * the PDF (margin-box `content` strings cannot hold a hyperlink). `text` is the
   * displayed string; `url` (optional) makes the whole note a link. Empty `text`
   * means a `"note"` slot is omitted. In Word the note shows as plain text only.
   */
  footer: { left: string; center: string; right: string; note: { text: string; url: string } };
  furniture: { fontSize: string; color: string };
  pageNumbers: { restartAtBody: boolean };
  meta: { showDescription: boolean };
  tables: { layout: "fixed" | "auto" };
  /**
   * Sizing caps for images and diagrams. `maxHeight` (any CSS length, e.g. "80vh")
   * keeps a tall image on one page instead of overflowing the page box and being
   * clipped (Paged.js cannot split an image). `maxWidth` (e.g. "100%" or "85%")
   * caps how wide a large image may render in the text column; set below 100% to
   * stop screenshots from filling the full column width.
   */
  image: { maxHeight: string; maxWidth: string };
  /**
   * Brand identity shown on the cover. Both fields are optional: a brand may
   * have no logo, and the product name is omitted when absent. `logo` is a path
   * (resolved and embedded at convert time); `productName` is plain text.
   */
  brand: { logo?: string; productName?: string };
  cover: {
    layout: "spine" | "plain";
    spineWidth: string;
    logoWidth: string;
    titleAnchor: "top" | "center" | "bottom";
    align: "left" | "center";
    /** Cover title font size, e.g. "2.8em" or "32pt" (PDF only). */
    titleSize: string;
  };
  badges: { color: string };
  components: { gap: number };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default brand tokens applied before user overrides. */
export const DEFAULT_TOKENS: BrandTokens = {
  page: { size: "A4", margin: "2cm" },
  colors: {
    text: "#1a1a1a",
    heading: "#111827",
    link: "#2563eb",
    accent: "#2563eb",
    muted: "#6b7280",
    surface: "#f2f2f2",
    border: "#d9d9d9",
  },
  semantic: { info: "#2563eb", success: "#15803d", caution: "#b45309", danger: "#b91c1c" },
  shape: { radius: "4px" },
  typography: {
    bodyFont: "Georgia, 'Times New Roman', serif",
    headingFont: "Helvetica, Arial, sans-serif",
    // Consolas leads the stack because it is the one mono font Microsoft Office
    // bundles on both Windows and macOS, so the Word export (which can only use a
    // single resolvable family name, not a CSS fallback chain) renders inline code
    // as monospace. Chromium, used for the PDF, has no Consolas on a bare macOS
    // box and falls through to SF Mono / Menlo, which are always present there.
    monoFont: "Consolas, 'SF Mono', Menlo, monospace",
    baseSize: "11pt",
    lineHeight: 1.5,
  },
  toc: { title: "Contents", depth: 3 },
  headings: { scale: [2, 1.5, 1.25, 1.1, 1, 0.85], weight: [700, 700, 600, 600, 600, 600] },
  links: { underline: true },
  density: "normal",
  header: { left: "docTitle", center: "none", right: "chapter" },
  footer: { left: "none", center: "pageNumber", right: "none", note: { text: "", url: "" } },
  furniture: { fontSize: "9pt", color: "#6b7280" },
  pageNumbers: { restartAtBody: true },
  meta: { showDescription: true },
  // "fixed" (PDF table-layout) distributes column widths evenly and lets cell
  // content wrap, so a long unbreakable token can't force a column wider than the
  // page and clip the last column. "auto" reverts to content-driven sizing.
  tables: { layout: "fixed" },
  // Cap image height to 80% of the page so a tall image scales down to fit one
  // page rather than overflowing. maxWidth defaults to the full column; a theme
  // can lower it (e.g. "85%") so large screenshots don't fill the whole width.
  image: { maxHeight: "80vh", maxWidth: "100%" },
  // No logo or product name by default; the cover then shows just the title
  // (plus any per-run version/date).
  brand: {},
  cover: { layout: "spine", spineWidth: "16mm", logoWidth: "44mm", titleAnchor: "bottom", align: "left", titleSize: "2.8em" },
  badges: { color: "muted" },
  components: { gap: 1 },
};

// ---------------------------------------------------------------------------
// Zod schema (partial — every field is optional)
// ---------------------------------------------------------------------------

const partialPageSchema = z
  .object({
    size: z.enum(["A4", "Letter"]),
    margin: z.string(),
  })
  .strict()
  .partial();

const partialColorsSchema = z
  .object({
    text: z.string(),
    heading: z.string(),
    link: z.string(),
    accent: z.string(),
    muted: z.string(),
    surface: z.string(),
    border: z.string(),
  })
  .strict()
  .partial();

const partialSemanticSchema = z
  .object({ info: z.string(), success: z.string(), caution: z.string(), danger: z.string() })
  .strict()
  .partial();

const partialShapeSchema = z.object({ radius: z.string() }).strict().partial();

const partialTypographySchema = z
  .object({
    bodyFont: z.string(),
    headingFont: z.string(),
    monoFont: z.string(),
    baseSize: z.string(),
    lineHeight: z.number(),
  })
  .strict()
  .partial();

const partialTocSchema = z
  .object({
    title: z.string(),
    depth: z.number(),
  })
  .strict()
  .partial();

const partialHeadingsSchema = z.object({ scale: z.array(z.number()), weight: z.array(z.number()) }).strict().partial();
const partialLinksSchema = z.object({ underline: z.boolean() }).strict().partial();
const partialHeaderSchema = z.object({ left: z.string(), center: z.string(), right: z.string() }).strict().partial();
const partialFooterNoteSchema = z.object({ text: z.string(), url: z.string() }).strict().partial();
const partialFooterSchema = z
  .object({ left: z.string(), center: z.string(), right: z.string(), note: partialFooterNoteSchema })
  .strict()
  .partial();
const partialFurnitureSchema = z.object({ fontSize: z.string(), color: z.string() }).strict().partial();
const partialPageNumbersSchema = z.object({ restartAtBody: z.boolean() }).strict().partial();

const partialMetaSchema = z
  .object({
    showDescription: z.boolean(),
  })
  .strict()
  .partial();

const partialTablesSchema = z
  .object({
    layout: z.enum(["fixed", "auto"]),
  })
  .strict()
  .partial();

const partialImageSchema = z.object({ maxHeight: z.string(), maxWidth: z.string() }).strict().partial();

const partialBrandSchema = z
  .object({
    logo: z.string(),
    productName: z.string(),
  })
  .strict()
  .partial();

const partialCoverSchema = z
  .object({
    layout: z.enum(["spine", "plain"]),
    spineWidth: z.string(),
    logoWidth: z.string(),
    titleAnchor: z.enum(["top", "center", "bottom"]),
    align: z.enum(["left", "center"]),
    titleSize: z.string(),
  })
  .strict()
  .partial();

const partialBadgesSchema = z.object({ color: z.string() }).strict().partial();
const partialComponentsSchema = z.object({ gap: z.number() }).strict().partial();

const partialThemeSchema = z
  .object({
    page: partialPageSchema,
    colors: partialColorsSchema,
    semantic: partialSemanticSchema,
    shape: partialShapeSchema,
    typography: partialTypographySchema,
    toc: partialTocSchema,
    headings: partialHeadingsSchema,
    links: partialLinksSchema,
    density: z.enum(["compact", "normal", "relaxed"]),
    header: partialHeaderSchema,
    footer: partialFooterSchema,
    furniture: partialFurnitureSchema,
    pageNumbers: partialPageNumbersSchema,
    meta: partialMetaSchema,
    tables: partialTablesSchema,
    image: partialImageSchema,
    brand: partialBrandSchema,
    cover: partialCoverSchema,
    badges: partialBadgesSchema,
    components: partialComponentsSchema,
  })
  .strict()
  .partial();

type PartialTheme = z.infer<typeof partialThemeSchema>;

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

/** Convert zod issues into a single human-readable error message. */
function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");

    if (issue.code === "unrecognized_keys") {
      // Zod v4: unrecognized_keys has a `keys` array
      const prefix = path ? `${path}.` : "";
      const keys = issue.keys.join('", "');
      return `unknown option "${prefix}${keys}"`;
    }

    if (issue.code === "invalid_value") {
      // Zod v4 uses "invalid_value" for enum mismatches; issue has a `values` array
      const allowed = issue.values.join('" or "');
      return `${path} must be "${allowed}"`;
    }

    if (issue.code === "invalid_type") {
      // The message already contains the received value in zod v4
      return `${path} must be a ${issue.expected}`;
    }

    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return `Invalid theme: ${issues.join("; ")}`;
}

// ---------------------------------------------------------------------------
// Deep merge helpers
// ---------------------------------------------------------------------------

/** Shallow-merge two objects, keeping defined values from override. */
function mergeSection<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  return { ...base, ...override } as T;
}

/** Deep-merge a partial theme over DEFAULT_TOKENS. */
function applyOverrides(partial: PartialTheme): BrandTokens {
  // Each section is enumerated explicitly so the compiler enforces coverage:
  // adding a new section to BrandTokens without updating this function is a type error.
  return {
    page: mergeSection(DEFAULT_TOKENS.page, partial.page ?? {}),
    colors: mergeSection(DEFAULT_TOKENS.colors, partial.colors ?? {}),
    semantic: mergeSection(DEFAULT_TOKENS.semantic, partial.semantic ?? {}),
    shape: mergeSection(DEFAULT_TOKENS.shape, partial.shape ?? {}),
    typography: mergeSection(DEFAULT_TOKENS.typography, partial.typography ?? {}),
    toc: mergeSection(DEFAULT_TOKENS.toc, partial.toc ?? {}),
    headings: mergeSection(DEFAULT_TOKENS.headings, partial.headings ?? {}),
    links: mergeSection(DEFAULT_TOKENS.links, partial.links ?? {}),
    density: partial.density ?? DEFAULT_TOKENS.density,
    header: mergeSection(DEFAULT_TOKENS.header, partial.header ?? {}),
    footer: {
      left: partial.footer?.left ?? DEFAULT_TOKENS.footer.left,
      center: partial.footer?.center ?? DEFAULT_TOKENS.footer.center,
      right: partial.footer?.right ?? DEFAULT_TOKENS.footer.right,
      // note is deep-merged so a theme can set just `text` and keep the `url` default.
      note: mergeSection(DEFAULT_TOKENS.footer.note, partial.footer?.note ?? {}),
    },
    furniture: mergeSection(DEFAULT_TOKENS.furniture, partial.furniture ?? {}),
    pageNumbers: mergeSection(DEFAULT_TOKENS.pageNumbers, partial.pageNumbers ?? {}),
    meta: mergeSection(DEFAULT_TOKENS.meta, partial.meta ?? {}),
    tables: mergeSection(DEFAULT_TOKENS.tables, partial.tables ?? {}),
    image: mergeSection(DEFAULT_TOKENS.image, partial.image ?? {}),
    brand: mergeSection(DEFAULT_TOKENS.brand, partial.brand ?? {}),
    cover: mergeSection(DEFAULT_TOKENS.cover, partial.cover ?? {}),
    badges: mergeSection(DEFAULT_TOKENS.badges, partial.badges ?? {}),
    components: mergeSection(DEFAULT_TOKENS.components, partial.components ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a YAML theme string, validate it, and return fully-resolved BrandTokens.
 *
 * Empty, whitespace-only, or comment-only input returns DEFAULT_TOKENS unchanged.
 * Unknown keys or wrong value types produce a human-readable error message.
 */
export function parseTheme(yamlText: string): BrandTokens {
  let raw: unknown;
  try {
    raw = load(yamlText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse theme YAML: ${msg}`);
  }

  // A null YAML document (empty, whitespace, or comments only) → use defaults
  if (raw === null || raw === undefined) {
    return structuredClone(DEFAULT_TOKENS);
  }

  const result = partialThemeSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }

  return applyOverrides(result.data);
}
