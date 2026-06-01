#!/usr/bin/env node
import { Command, Option } from "commander";
import { createRequire } from "node:module";
import updateNotifier from "update-notifier";
import { runConvert } from "./commands/convert.js";
import { runInit } from "./commands/init.js";
import { runDesign } from "./commands/design.js";
import { runUpdate } from "./commands/update.js";
import { loadRunConfig, mergeRunConfig } from "./commands/run-config.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { name: string; version: string };

// Check npm (throttled, cached, in a detached background process) and print an
// "update available" notice after the command finishes. Suppressed automatically in
// CI and non-TTY output, and opt-out via NO_UPDATE_NOTIFIER / --no-update-notifier.
updateNotifier({ pkg }).notify();

const program = new Command();

program
  .name("quire")
  .description("Convert Markdown/MDX docs to branded PDF and Word")
  .version(pkg.version);

program
  .command("convert")
  .description("Convert one or more files to PDF and/or Word")
  .argument("[paths...]", "Markdown/MDX files to convert")
  .addOption(new Option("-f, --format <format>", "output format").choices(["pdf", "docx", "both"]).default("both"))
  .option("-o, --out <path>", "output file base or directory")
  .option("-m, --manifest <file>", "resolve order and hierarchy from a manifest")
  .option("--dry-run", "resolve and print the page tree without rendering")
  .option("--title <title>", "document title for the cover page")
  .option("--no-cover", "omit the cover page")
  .option("--no-toc", "omit the table of contents")
  .option("--root <dir>", "base directory for resolving root-relative image paths")
  .option("--offline", "do not fetch remote images")
  .option("--theme <file>", "brand-token YAML file (colors, fonts, page size)")
  .option("--base-url <url>", "published-site base (e.g. https://docs.dify.ai); rewrites out-of-bundle /en/... links to live external URLs")
  .option("--doc-version <version>", "release/version label printed on the cover")
  .option("--date <date>", "publish date printed on the cover")
  .option("--no-description", "suppress the page-description lede (default: follows theme token meta.showDescription)")
  .option("-c, --config <file>", "run-config YAML supplying defaults; CLI flags override it")
  .action(async (
    paths: string[],
    opts: { format: "pdf" | "docx" | "both"; out?: string; manifest?: string; dryRun?: boolean; title?: string; cover?: boolean; toc?: boolean; root?: string; offline?: boolean; theme?: string; description?: boolean; baseUrl?: string; docVersion?: string; date?: string; config?: string },
    command: Command
  ) => {
    // A run-config file supplies defaults; an explicitly-set CLI flag wins over
    // it (commander reports the source), and a flag's commander default fills any
    // gap. dryRun is always per-run and is not configurable.
    const file = opts.config ? await loadRunConfig(opts.config) : {};
    const m = mergeRunConfig(
      file,
      opts as Record<string, unknown>,
      (key) => command.getOptionValueSource(key) === "cli"
    );
    await runConvert(paths, {
      format: m.format as "pdf" | "docx" | "both",
      out: m.out as string | undefined,
      manifest: m.manifest as string | undefined,
      dryRun: opts.dryRun,
      title: m.title as string | undefined,
      root: m.root as string | undefined,
      offline: m.offline as boolean | undefined,
      theme: m.theme as string | undefined,
      noCover: m.cover === false,
      noToc: m.toc === false,
      description: m.description === false ? false : undefined,
      baseUrl: m.baseUrl as string | undefined,
      docVersion: m.docVersion as string | undefined,
      date: m.date as string | undefined,
    });
  });

program
  .command("init")
  .description("Scaffold a starter manifest by scanning a docs folder")
  .argument("[dir]", "directory to scan for .md/.mdx files", ".")
  .option("-o, --out <file>", "write the manifest to a file (default: stdout)")
  .action(async (dir: string, opts: { out?: string }) => {
    await runInit(dir, { out: opts.out });
  });

program
  .command("design")
  .description("Open the theme designer in your browser (optionally pre-loading a theme)")
  .argument("[theme]", "theme YAML file to pre-load into the designer")
  .action(async (theme: string | undefined) => { await runDesign(theme); });

program
  .command("update")
  .description("Update Quire to the latest version from npm")
  .action(async () => { await runUpdate(); });

await program.parseAsync();
