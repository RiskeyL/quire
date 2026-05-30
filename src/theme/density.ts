import type { BrandTokens } from "./tokens.js";

/**
 * Vertical-rhythm multiplier for a density preset: compact tightens, relaxed
 * loosens, normal is the 1.0 baseline. Used by both the PDF (`--rhythm` custom
 * property in compile-css) and Word (BodyText paragraph spacing in
 * compile-docx-ref), so the mapping lives in one place. This module is pure
 * (type-only import) so compile-css.ts stays browser-bundle-safe.
 */
export function densityFactor(density: BrandTokens["density"]): number {
  return density === "compact" ? 0.7 : density === "relaxed" ? 1.3 : 1;
}
