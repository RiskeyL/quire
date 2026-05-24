import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Resolved type
// ---------------------------------------------------------------------------

/** Fully-resolved brand tokens (all fields present after merging with defaults). */
export interface BrandTokens {
  page: { size: "A4" | "Letter"; margin: string };
  colors: { text: string; heading: string; link: string; accent: string; muted: string };
  typography: {
    bodyFont: string;
    headingFont: string;
    monoFont: string;
    baseSize: string;
    lineHeight: number;
  };
  toc: { title: string };
  meta: { showDescription: boolean };
  tables: { layout: "fixed" | "auto" };
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
  },
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
  toc: { title: "Contents" },
  meta: { showDescription: true },
  // "fixed" (PDF table-layout) distributes column widths evenly and lets cell
  // content wrap, so a long unbreakable token can't force a column wider than the
  // page and clip the last column. "auto" reverts to content-driven sizing.
  tables: { layout: "fixed" },
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
  })
  .strict()
  .partial();

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
  })
  .strict()
  .partial();

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

const partialThemeSchema = z
  .object({
    page: partialPageSchema,
    colors: partialColorsSchema,
    typography: partialTypographySchema,
    toc: partialTocSchema,
    meta: partialMetaSchema,
    tables: partialTablesSchema,
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
    typography: mergeSection(DEFAULT_TOKENS.typography, partial.typography ?? {}),
    toc: mergeSection(DEFAULT_TOKENS.toc, partial.toc ?? {}),
    meta: mergeSection(DEFAULT_TOKENS.meta, partial.meta ?? {}),
    tables: mergeSection(DEFAULT_TOKENS.tables, partial.tables ?? {}),
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

/**
 * Read a theme file from disk and return fully-resolved BrandTokens.
 *
 * Throws a clear error if the file cannot be read or the YAML is malformed.
 */
export async function loadTheme(filePath: string): Promise<BrandTokens> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read theme file "${filePath}": ${msg}`);
  }

  return parseTheme(text);
}
