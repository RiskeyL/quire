import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

describe("quire CLI", () => {
  it("prints its version", async () => {
    const tsxBin = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;
    const { stdout } = await run(tsxBin, ["src/cli.ts", "--version"]);
    expect(stdout.trim()).toBe("0.1.0");
  });
});
