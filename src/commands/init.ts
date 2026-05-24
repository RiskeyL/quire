import { readdir, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname, relative, sep } from "node:path";
import { dump } from "js-yaml";
import type { Tree, TreeNode } from "../resolve/tree.js";

/** Matches a Markdown/MDX filename (case-insensitive). */
const MARKDOWN_EXT = /\.mdx?$/i;

/** Case-insensitive name sort, stable across platforms. */
function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * Turn a folder name into a human-readable section title: split on hyphens,
 * underscores, and whitespace, then capitalize each word. This is a starting
 * point the author is expected to refine, so it is intentionally simple
 * (`api` becomes `Api`, not `API`).
 */
export function prettifyTitle(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Recursively scan a directory into a Tree with ABSOLUTE page paths.
 *
 * Subdirectories become sections (title from the folder name via
 * `prettifyTitle`); `.md`/`.mdx` files become pages. A directory's own pages
 * are listed first (sorted by name), then its subdirectories as nested sections
 * (sorted by name), so a folder's overview pages precede its subsections.
 *
 * Dotfiles and dot-directories (`.git`, `.hidden.md`) and non-Markdown files
 * are skipped; a subdirectory with no Markdown anywhere beneath it is pruned so
 * the manifest carries no empty sections.
 */
export async function scanDirToTree(absDir: string): Promise<Tree> {
  const entries = await readdir(absDir, { withFileTypes: true });

  const pages: TreeNode[] = entries
    .filter((e) => e.isFile() && !e.name.startsWith(".") && MARKDOWN_EXT.test(e.name))
    .map((e) => e.name)
    .sort(byName)
    .map((name): TreeNode => ({ type: "page", file: join(absDir, name) }));

  const sections: TreeNode[] = [];
  const subdirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort(byName);
  for (const name of subdirs) {
    const children = await scanDirToTree(join(absDir, name));
    if (children.length > 0) {
      sections.push({ type: "section", title: prettifyTitle(name), children });
    }
  }

  return [...pages, ...sections];
}

/**
 * Rebase a Tree's absolute page paths to POSIX paths relative to the directory
 * the manifest will live in. `quire convert` resolves manifest page paths
 * relative to the manifest's own directory, so this keeps the scaffolded
 * manifest portable regardless of where it is saved.
 */
export function rebaseManifestPaths(tree: Tree, manifestDir: string): Tree {
  return tree.map((node): TreeNode => {
    if (node.type === "section") {
      return {
        type: "section",
        title: node.title,
        children: rebaseManifestPaths(node.children, manifestDir),
      };
    }
    const rel = relative(manifestDir, node.file).split(sep).join("/");
    return { type: "page", file: rel };
  });
}

/** Map a Tree node to its plain manifest object shape (no `type` discriminator). */
function toPlain(node: TreeNode): unknown {
  if (node.type === "section") {
    return { section: node.title, children: node.children.map(toPlain) };
  }
  return { file: node.file };
}

/** Explanatory header prepended to a scaffolded manifest. */
const HEADER = [
  "# Quire manifest scaffolded by `quire init`.",
  "# Sections mirror subdirectories; pages mirror .md/.mdx files.",
  "# Page titles come from each page's own frontmatter, so they are omitted here.",
  "# Reorder, retitle, or prune entries as needed, then run:",
  "#   quire convert --manifest <this-file>",
  "",
  "",
].join("\n");

/** Serialize a Tree to a manifest YAML string with an explanatory header. */
export function treeToManifestYaml(tree: Tree): string {
  const body = dump(tree.map(toPlain), { lineWidth: -1, noRefs: true });
  return HEADER + body;
}

export interface InitOptions {
  /** Write the manifest here; print to stdout when omitted. */
  out?: string;
}

/**
 * Scaffold a starter manifest by scanning `dir` for Markdown/MDX files.
 *
 * Page paths are written relative to wherever the manifest will live: the
 * `--out` file's directory, or the current directory when printing to stdout.
 */
export async function runInit(dir: string, options: InitOptions): Promise<void> {
  const absDir = resolve(dir);
  const tree = await scanDirToTree(absDir);
  if (tree.length === 0) {
    throw new Error(`No .md or .mdx files found under "${dir}".`);
  }

  const manifestDir = options.out ? dirname(resolve(options.out)) : process.cwd();
  const yaml = treeToManifestYaml(rebaseManifestPaths(tree, manifestDir));

  if (options.out) {
    const outPath = resolve(options.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, yaml, "utf8");
  } else {
    process.stdout.write(yaml);
  }
}
