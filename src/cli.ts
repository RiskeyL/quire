#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("quire")
  .description("Convert Markdown/MDX docs to branded PDF and Word")
  .version("0.1.0");

program
  .command("convert")
  .description("Convert one or more files to PDF and/or Word")
  .argument("<paths...>", "Markdown/MDX files to convert")
  .option("-f, --format <format>", "pdf | docx | both", "both")
  .option("-o, --out <path>", "output file base or directory")
  .action(() => {
    console.log("convert: not implemented yet");
  });

await program.parseAsync();
