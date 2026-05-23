#!/usr/bin/env node
import { Command, Option } from "commander";
import { createRequire } from "node:module";

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
  .argument("<paths...>", "Markdown/MDX files to convert")
  .addOption(new Option("-f, --format <format>", "output format").choices(["pdf", "docx", "both"]).default("both"))
  .option("-o, --out <path>", "output file base or directory")
  .action(() => {
    console.log("convert: not implemented yet");
  });

await program.parseAsync();
