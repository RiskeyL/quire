import { readFile } from "node:fs/promises";
import { parseTheme } from "./tokens.js";
import type { BrandTokens } from "./tokens.js";

/**
 * Read a theme file from disk and return fully-resolved BrandTokens.
 *
 * Throws a clear error if the file cannot be read or the YAML is malformed.
 *
 * This lives apart from `tokens.ts` (which holds `parseTheme`/`DEFAULT_TOKENS`/
 * the schema) so that `tokens.ts` stays free of Node builtins and can be bundled
 * into the browser-only theme designer. Only this file pulls in `node:fs`.
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
