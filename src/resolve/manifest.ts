import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import type { Tree, TreeNode, PageNode } from "./tree.js";

/** Parse a manifest YAML string into a Tree. Throws on malformed entries. */
export function parseManifest(yamlText: string): Tree {
  const data = load(yamlText);
  if (!Array.isArray(data)) {
    throw new Error('Manifest must be a YAML list of section/page entries at the top level.');
  }
  return data.map(toNode);
}

/** Read a manifest file and parse it. */
export async function loadManifest(path: string): Promise<Tree> {
  return parseManifest(await readFile(path, "utf8"));
}

function toNode(raw: unknown, index: number): TreeNode {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`Manifest entry #${index + 1} is not a valid section or page object.`);
  }
  const obj = raw as Record<string, unknown>;
  const hasSection = "section" in obj;
  const hasFile = "file" in obj;
  const hasOpenapi = "openapi" in obj;

  if ([hasSection, hasFile, hasOpenapi].filter(Boolean).length > 1) {
    throw new Error(`Manifest entry #${index + 1} must have exactly one of "section", "file", or "openapi".`);
  }

  if (hasOpenapi) {
    if (typeof obj.openapi !== "string") {
      throw new Error(`Manifest entry #${index + 1}: "openapi" must be a string path.`);
    }
    if ("title" in obj && typeof obj.title !== "string") {
      throw new Error(`Manifest openapi "${obj.openapi}": "title" must be a string.`);
    }
    const node: PageNode = { type: "page", file: obj.openapi, openapi: true };
    if (typeof obj.title === "string") node.title = obj.title;
    return node;
  }

  if (hasSection) {
    if (typeof obj.section !== "string") {
      throw new Error(`Manifest entry #${index + 1}: "section" must be a string title.`);
    }
    const rawChildren = obj.children ?? [];
    if (!Array.isArray(rawChildren)) {
      throw new Error(`Manifest section "${obj.section}": "children" must be a list.`);
    }
    return { type: "section", title: obj.section, children: rawChildren.map(toNode) };
  }

  if (hasFile) {
    if (typeof obj.file !== "string") {
      throw new Error(`Manifest entry #${index + 1}: "file" must be a string path.`);
    }
    if ("title" in obj && typeof obj.title !== "string") {
      throw new Error(`Manifest page "${obj.file}": "title" must be a string.`);
    }
    const node: PageNode = { type: "page", file: obj.file };
    if (typeof obj.title === "string") node.title = obj.title;
    return node;
  }

  throw new Error(`Manifest entry #${index + 1} must have either "section" or "file".`);
}
