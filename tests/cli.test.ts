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

  it("documents --unresolved-links in the convert help", async () => {
    const tsxBin = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;
    const { stdout } = await run(tsxBin, ["src/cli.ts", "convert", "--help"], {
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
    });
    expect(stdout).toContain("--unresolved-links <mode>");
  });

  it("rejects an unknown --unresolved-links mode, naming the allowed choices", async () => {
    const tsxBin = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;
    await expect(
      run(tsxBin, ["src/cli.ts", "convert", "a.md", "--unresolved-links", "bogus"], {
        env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
      })
    ).rejects.toMatchObject({ stderr: expect.stringMatching(/keep.*text/s) });
  });
});
