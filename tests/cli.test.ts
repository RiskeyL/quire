import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const run = promisify(execFile);
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { version: string };

describe("quire CLI", () => {
  it("prints its version", async () => {
    const tsxBin = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;
    // Disable the update notifier so the version check doesn't spawn a background
    // registry check during the test.
    const { stdout } = await run(tsxBin, ["src/cli.ts", "--version"], {
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    });
    expect(stdout.trim()).toBe(version);
  });
});
