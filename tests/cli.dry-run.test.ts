import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const tsxBin = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;

describe("convert --manifest --dry-run", () => {
  it("prints the resolved tree without rendering", async () => {
    const { stdout } = await run(tsxBin, [
      "src/cli.ts", "convert", "--manifest", "fixtures/manifest-sample.yaml", "--dry-run"
    ]);
    expect(stdout).toContain("Getting Started");
    expect(stdout).toContain("Quick Start (quickstart.md)");
    expect(stdout).toContain("Guides");
    expect(stdout).toContain("guides/workflows.md");
  });

  it("prints a flat tree from direct paths", async () => {
    const { stdout } = await run(tsxBin, [
      "src/cli.ts", "convert", "a.md", "b.md", "--dry-run"
    ]);
    expect(stdout).toContain("a.md");
    expect(stdout).toContain("b.md");
  });
});
