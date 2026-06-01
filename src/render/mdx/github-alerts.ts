import type { Root, Blockquote, Paragraph } from "mdast";
import type { Plugin } from "unified";

/**
 * GitHub alerts: a non-Mintlify callout convention written as a blockquote whose
 * first line is an `[!TYPE]` marker, e.g.
 *
 *   > [!NOTE]
 *   > Body text.
 *
 * This remark transform rewrites such blockquotes into the same `<Callout>` the
 * Mintlify handlers render, so docs written with GitHub alerts get identical
 * styled callouts (one rendering path, one set of CSS/Word styles). A blockquote
 * without a recognized marker is left as a plain blockquote.
 *
 * `type` selects the callout's color and Word style; `label` preserves GitHub's
 * wording, which differs from the callout types' defaults. GitHub's five alert
 * types map onto Quire's callouts as:
 *   NOTE → info, TIP → tip, IMPORTANT → note, WARNING → warning, CAUTION → danger.
 * (GitHub's blue "Note" matches our blue Info; its "Important" maps to our Note.)
 */

const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\S\r\n]*(?:\r?\n|$)/i;

const ALERT_MAP: Record<string, { type: string; label: string }> = {
  NOTE: { type: "info", label: "Note" },
  TIP: { type: "tip", label: "Tip" },
  IMPORTANT: { type: "note", label: "Important" },
  WARNING: { type: "warning", label: "Warning" },
  CAUTION: { type: "danger", label: "Caution" },
};

export const remarkGithubAlerts: Plugin<[], Root> = () => {
  return (tree) => walk(tree as unknown as { children?: unknown[] });
};

/** Depth-first walk; blockquotes can nest and can hold nested blockquotes. */
function walk(node: { children?: unknown[] }): void {
  if (!node || !Array.isArray(node.children)) return;
  for (const child of node.children) {
    if (isBlockquote(child)) convertAlert(child);
    walk(child as { children?: unknown[] });
  }
}

function isBlockquote(n: unknown): n is Blockquote {
  return typeof n === "object" && n !== null && (n as { type?: string }).type === "blockquote";
}

function convertAlert(bq: Blockquote): void {
  const first = bq.children[0];
  if (!first || first.type !== "paragraph") return;
  const para = first as Paragraph;
  const lead = para.children[0];
  if (!lead || lead.type !== "text") return;

  const match = ALERT_RE.exec(lead.value);
  if (!match) return;
  const mapping = ALERT_MAP[match[1].toUpperCase()];
  if (!mapping) return;

  // Drop the marker (and its trailing newline) from the lead text.
  lead.value = lead.value.slice(match[0].length);
  if (lead.value === "") {
    para.children.shift();
    // A hard break right after the marker would now lead the paragraph; drop it.
    if (para.children[0]?.type === "break") para.children.shift();
  }
  // Remove the first paragraph entirely if the marker was its only content.
  if (para.children.length === 0) bq.children.shift();

  // Retag the blockquote as the generic Callout. The existing handler reads
  // `type` (color + Word custom-style) and `label` (visible wording).
  const node = bq as unknown as {
    type: string;
    name: string;
    attributes: Array<{ type: string; name: string; value: string }>;
  };
  node.type = "mdxJsxFlowElement";
  node.name = "Callout";
  node.attributes = [
    { type: "mdxJsxAttribute", name: "type", value: mapping.type },
    { type: "mdxJsxAttribute", name: "label", value: mapping.label },
  ];
}
