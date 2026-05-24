import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { z } from "zod";

/**
 * Run-config file schema. Every key mirrors a `quire convert` flag and is
 * optional; the file supplies defaults for a run and the CLI overrides it. Keys
 * are the user-facing flag names (`cover`/`toc`/`description` as booleans, not
 * the internal `noCover`/`noToc`).
 */
const runConfigSchema = z
  .object({
    format: z.enum(["pdf", "docx", "both"]).optional(),
    out: z.string().optional(),
    manifest: z.string().optional(),
    title: z.string().optional(),
    cover: z.boolean().optional(),
    toc: z.boolean().optional(),
    root: z.string().optional(),
    offline: z.boolean().optional(),
    theme: z.string().optional(),
    description: z.boolean().optional(),
    baseUrl: z.string().optional(),
    // YAML auto-types unquoted scalars: `1.14` parses as a number and a bare
    // `2026-05-25` as a Date. Accept those and normalize to a string so the user
    // need not remember to quote the cover's version/date.
    docVersion: z
      .union([z.string(), z.number()])
      .transform((v) => String(v))
      .optional(),
    date: z
      .union([z.string(), z.date()])
      .transform((v) => (typeof v === "string" ? v : v.toISOString().slice(0, 10)))
      .optional(),
  })
  .strict();

export type RunConfig = z.infer<typeof runConfigSchema>;

/** The user-facing convert option names a run-config can set. */
export const RUN_CONFIG_KEYS = [
  "format",
  "out",
  "manifest",
  "title",
  "cover",
  "toc",
  "root",
  "offline",
  "theme",
  "description",
  "baseUrl",
  "docVersion",
  "date",
] as const;

/** Convert zod issues into a single human-readable message (mirrors tokens.ts). */
function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    if (issue.code === "unrecognized_keys") {
      const prefix = path ? `${path}.` : "";
      const keys = issue.keys.join('", "');
      return `unknown option "${prefix}${keys}"`;
    }
    if (issue.code === "invalid_value") {
      const allowed = issue.values.join('" or "');
      return `${path} must be "${allowed}"`;
    }
    if (issue.code === "invalid_type") {
      return `${path} must be a ${issue.expected}`;
    }
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return `Invalid run-config: ${issues.join("; ")}`;
}

/** Parse a run-config YAML string into a validated partial options object. */
export function parseRunConfig(yamlText: string): RunConfig {
  let raw: unknown;
  try {
    raw = load(yamlText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse run-config YAML: ${msg}`);
  }
  // An empty file or a comment-only file loads as null/undefined → empty config.
  if (raw === null || raw === undefined) return {};
  const result = runConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

/** Read and parse a run-config file. */
export async function loadRunConfig(path: string): Promise<RunConfig> {
  return parseRunConfig(await readFile(path, "utf8"));
}

/**
 * Merge a run-config file with the CLI option values, resolving each key by
 * precedence: an explicitly-set CLI flag wins, else the file value, else the
 * CLI/commander default. `isCliSet(key)` reports whether the flag was set on the
 * command line (commander's `getOptionValueSource(key) === "cli"`); the `cli`
 * object holds the commander-resolved value (the CLI value or its default).
 */
export function mergeRunConfig(
  file: RunConfig,
  cli: Record<string, unknown>,
  isCliSet: (key: string) => boolean
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const key of RUN_CONFIG_KEYS) {
    if (isCliSet(key)) {
      merged[key] = cli[key];
    } else if (file[key] !== undefined) {
      merged[key] = file[key];
    } else {
      merged[key] = cli[key];
    }
  }
  return merged;
}
