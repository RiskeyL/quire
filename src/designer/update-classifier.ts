export type PreviewUpdate = "restyle" | "relayout";

/**
 * Decide how the designer's live preview should refresh when the brand token
 * at `path` changes. `path` is a dotted token path, e.g. "colors.link",
 * "page.size", "headings.scale", "links.underline".
 *
 * "restyle" is returned ONLY for geometry-neutral changes (recompile CSS + swap
 * the <style>, no repagination). Everything else, and any unknown path, returns
 * "relayout" (the safe default: rebuild + repaginate).
 */
export function classifyTokenChange(path: string): PreviewUpdate {
  // Pure color values consumed via CSS custom properties — no reflow.
  if (path.startsWith("colors.")) return "restyle";

  // Callout accent colors (success/caution/danger) — no reflow.
  if (path.startsWith("semantic.")) return "restyle";

  // Badge border/text color only — not all of badges.
  if (path === "badges.color") return "restyle";

  // Corner radius (border-radius) — no reflow.
  if (path === "shape.radius") return "restyle";

  // Toggles text-decoration on links — no reflow.
  if (path === "links.underline") return "restyle";

  // Everything else: geometry-affecting, margin-box content, unknown, or
  // empty. Repaginate to be safe.
  return "relayout";
}
