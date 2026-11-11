import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")
) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

describe("packaging", () => {
  it("declares pagedjs-cli as a runtime dependency", () => {
    // PDF export spawns pagedjs-cli at runtime, so it must survive a production install.
    // devDependencies are pruned after the prepare build, so a devDependency would be
    // absent for anyone who runs `npm install <quire>` (including CI and global installs).
    expect(pkg.dependencies?.["pagedjs-cli"]).toBeTruthy();
    expect(pkg.devDependencies?.["pagedjs-cli"]).toBeUndefined();
  });

  it("does not hard-code a node_modules path for mermaid", () => {
    // A consumer's package manager may hoist mermaid out of Quire's own node_modules,
    // so the bundle has to be found through module resolution.
    const src = readFileSync(
      fileURLToPath(new URL("../src/render/mermaid.ts", import.meta.url)),
      "utf8"
    );
    expect(src).not.toContain("../../node_modules/mermaid");
  });
});
