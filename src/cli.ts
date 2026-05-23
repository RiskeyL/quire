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
  .action(async (paths: string[], opts: { format: "pdf" | "docx" | "both"; out?: string; manifest?: string; dryRun?: boolean }) => {
    await runConvert(paths, opts);
  });

await program.parseAsync();
