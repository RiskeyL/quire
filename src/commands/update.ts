import { spawn } from "node:child_process";

const PACKAGE = "@riskeyl/quire";

/**
 * Update Quire in place by reinstalling the latest published version. This assumes the
 * documented global npm install. If the tool was installed another way (a different
 * package manager, from source) or the global prefix needs elevated permissions, the
 * command can't always succeed, so on failure it prints the manual command to run.
 */
export async function runUpdate(): Promise<void> {
  const args = ["install", "-g", `${PACKAGE}@latest`];
  process.stderr.write(`Updating ${PACKAGE}…  (npm ${args.join(" ")})\n\n`);

  const code = await new Promise<number>((resolve) => {
    const child = spawn("npm", args, {
      stdio: "inherit",
      shell: process.platform === "win32" // npm is npm.cmd on Windows
    });
    child.on("error", () => resolve(-1));
    child.on("close", (c) => resolve(c ?? -1));
  });

  if (code === 0) {
    process.stderr.write(`\nUpdated. Run \`quire --version\` to confirm.\n`);
    return;
  }
  process.stderr.write(
    `\nCould not update automatically. If you installed Quire another way or hit a ` +
      `permissions error, run this yourself:\n  npm install -g ${PACKAGE}@latest\n`
  );
  process.exitCode = 1;
}
