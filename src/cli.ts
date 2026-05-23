#!/usr/bin/env node
import { Command, Option } from "commander";
import { createRequire } from "node:module";
import { runConvert } from "./commands/convert.js";

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
  .action(async (paths: string[], opts: { format: "pdf" | "docx" | "both"; out?: string; manifest?: string; dryRun?: boolean; title?: string; cover?: boolean; toc?: boolean; root?: string; offline?: boolean; theme?: string }) => {
    await runConvert(paths, { ...opts, noCover: opts.cover === false, noToc: opts.toc === false });
  });

await program.parseAsync();
