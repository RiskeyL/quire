#!/usr/bin/env node
import { Command, Option } from "commander";
import { createRequire } from "node:module";
import { runConvert } from "./commands/convert.js";
import { loadRunConfig, mergeRunConfig } from "./commands/run-config.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("quire")
  .description("Convert Markdown/MDX docs to branded PDF and Word")
  .version(version);

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
  .option("--no-description", "suppress the page-description lede (default: follows theme token meta.showDescription)")
  .option("-c, --config <file>", "run-config YAML supplying defaults; CLI flags override it")
  .action(async (
    paths: string[],
    opts: { format: "pdf" | "docx" | "both"; out?: string; manifest?: string; dryRun?: boolean; title?: string; cover?: boolean; toc?: boolean; root?: string; offline?: boolean; theme?: string; description?: boolean; baseUrl?: string; config?: string },
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
    });
  });

await program.parseAsync();
