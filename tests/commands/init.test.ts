import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prettifyTitle,
  treeToManifestYaml,
  rebaseManifestPaths,
  scanDirToTree,
  runInit,
} from "../../src/commands/init.js";
import { parseManifest } from "../../src/resolve/manifest.js";
import type { Tree } from "../../src/resolve/tree.js";

describe("prettifyTitle", () => {
  it("turns a hyphenated folder name into title case", () => {
    expect(prettifyTitle("getting-started")).toBe("Getting Started");
  });

  it("treats underscores as word separators too", () => {
    expect(prettifyTitle("dev_guides_and_walkthroughs")).toBe("Dev Guides And Walkthroughs");
  });

  it("capitalizes a single bare word", () => {
    expect(prettifyTitle("overview")).toBe("Overview");
  });
});

describe("treeToManifestYaml", () => {
  it("round-trips through parseManifest to the same tree", () => {
    const tree: Tree = [
      {
        type: "section",
        title: "Getting Started",
        children: [{ type: "page", file: "getting-started/intro.md" }],
      },
      { type: "page", file: "overview.md" },
    ];
    const yaml = treeToManifestYaml(tree);
    expect(parseManifest(yaml)).toEqual(tree);
  });

  it("quotes paths that contain spaces so they parse back intact", () => {
    const tree: Tree = [{ type: "page", file: "my docs/a b.md" }];
    const yaml = treeToManifestYaml(tree);
    expect(parseManifest(yaml)).toEqual(tree);
  });

  it("includes a header comment explaining the manifest", () => {
    const yaml = treeToManifestYaml([{ type: "page", file: "a.md" }]);
    expect(yaml.startsWith("#")).toBe(true);
    expect(yaml).toMatch(/quire init/);
  });

  it("does not emit the internal `type` discriminator", () => {
    const yaml = treeToManifestYaml([
      { type: "section", title: "S", children: [{ type: "page", file: "a.md" }] },
    ]);
    expect(yaml).not.toMatch(/\btype:/);
  });
});

describe("rebaseManifestPaths", () => {
  it("rewrites absolute file paths relative to the manifest directory", () => {
    const tree: Tree = [
      {
        type: "section",
        title: "S",
        children: [{ type: "page", file: "/root/en/a.md" }],
      },
      { type: "page", file: "/root/en/b.md" },
    ];
    const out = rebaseManifestPaths(tree, "/root/quire");
    expect(out).toEqual([
      { type: "section", title: "S", children: [{ type: "page", file: "../en/a.md" }] },
      { type: "page", file: "../en/b.md" },
    ]);
  });

  it("produces in-directory paths when the manifest sits at the scan root", () => {
    const tree: Tree = [{ type: "page", file: "/root/a.md" }];
    expect(rebaseManifestPaths(tree, "/root")).toEqual([{ type: "page", file: "a.md" }]);
  });
});

describe("scanDirToTree", () => {
  it("mirrors the folder tree: subdirs become sections, md/mdx files become pages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-init-"));
    await writeFile(join(dir, "overview.md"), "# Overview", "utf8");
    await mkdir(join(dir, "getting-started"));
    await writeFile(join(dir, "getting-started", "intro.mdx"), "# Intro", "utf8");
    await writeFile(join(dir, "getting-started", "cli.md"), "# CLI", "utf8");

    const tree = await scanDirToTree(dir);

    expect(tree).toEqual([
      { type: "page", file: join(dir, "overview.md") },
      {
        type: "section",
        title: "Getting Started",
        children: [
          { type: "page", file: join(dir, "getting-started", "cli.md") },
          { type: "page", file: join(dir, "getting-started", "intro.mdx") },
        ],
      },
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it("lists a directory's own pages before its subsections, each sorted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-init-"));
    await writeFile(join(dir, "b.md"), "b", "utf8");
    await writeFile(join(dir, "a.md"), "a", "utf8");
    await mkdir(join(dir, "sub"));
    await writeFile(join(dir, "sub", "c.md"), "c", "utf8");

    const tree = await scanDirToTree(dir);

    expect(tree.map((n) => (n.type === "page" ? n.file.split("/").pop() : `[${n.title}]`))).toEqual([
      "a.md",
      "b.md",
      "[Sub]",
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it("skips dotfiles, non-markdown files, and prunes empty sections", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-init-"));
    await writeFile(join(dir, "keep.md"), "k", "utf8");
    await writeFile(join(dir, ".hidden.md"), "h", "utf8");
    await writeFile(join(dir, "image.png"), "x", "utf8");
    await mkdir(join(dir, "empty"));
    await writeFile(join(dir, "empty", "notes.txt"), "t", "utf8");
    await mkdir(join(dir, ".git"));
    await writeFile(join(dir, ".git", "config.md"), "c", "utf8");

    const tree = await scanDirToTree(dir);

    expect(tree).toEqual([{ type: "page", file: join(dir, "keep.md") }]);

    await rm(dir, { recursive: true, force: true });
  });
});

describe("runInit", () => {
  it("writes a parseable manifest with paths relative to the output file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quire-init-"));
    await mkdir(join(dir, "docs"));
    await writeFile(join(dir, "docs", "intro.md"), "# Intro", "utf8");
    await mkdir(join(dir, "out"));
    const outPath = join(dir, "out", "manifest.yaml");

    await runInit(join(dir, "docs"), { out: outPath });

    const yaml = await readFile(outPath, "utf8");
    const tree = parseManifest(yaml);
    expect(tree).toEqual([{ type: "page", file: "../docs/intro.md" }]);

    await rm(dir, { recursive: true, force: true });
  });
});
