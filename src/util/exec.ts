import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const run = promisify(execFile);

/** Throw a friendly error if a required binary is not callable. */
export async function assertBinary(bin: string, installHint: string): Promise<void> {
  try {
    await run(bin, ["--version"]);
  } catch {
    throw new Error(`Required tool "${bin}" was not found. ${installHint}`);
  }
}
