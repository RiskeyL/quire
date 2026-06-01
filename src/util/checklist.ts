/**
 * A small live checklist for the terminal. The full set of stages is printed up front so
 * the whole pipeline is visible from the start; each row then moves from pending (○) to a
 * spinner while active to a checkmark (✔) when done, redrawn in place.
 *
 * On a non-TTY stream (CI, a pipe) there is no cursor to move, so it degrades to a plain
 * numbered list printed once, followed by a "✔ [i/N] label" line as each stage finishes.
 * No dependency, no ANSI required off a TTY.
 */

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PENDING = "○";
const DONE = "✔";
const FAIL = "✖";

type Status = "pending" | "active" | "done" | "fail";

interface Row {
  key: string;
  label: string;
  status: Status;
  detail: string;
}

export interface ChecklistStage {
  key: string;
  label: string;
}

export interface Checklist {
  /** Mark a stage active (shows a spinner on a TTY). */
  start(key: string): void;
  /** Update the trailing detail of a stage (e.g. a live page count). */
  detail(key: string, text: string): void;
  /** Mark a stage complete. */
  done(key: string): void;
  /** Mark the active stage (or a named one) as failed. */
  fail(key?: string): void;
  /** Print a line (e.g. a warning) above the live block without corrupting it. */
  log(message: string): void;
  /** Stop the spinner and leave the final state on screen. Always call this. */
  finish(): void;
}

export interface ChecklistOptions {
  /** Output stream; defaults to process.stderr. */
  stream?: NodeJS.WriteStream;
  /** Force TTY behavior on/off; defaults to the stream's own isTTY. */
  isTTY?: boolean;
}

export function createChecklist(
  stages: ChecklistStage[],
  options: ChecklistOptions = {}
): Checklist {
  const stream = options.stream ?? process.stderr;
  const tty = options.isTTY ?? !!stream.isTTY;
  const rows: Row[] = stages.map((s) => ({ key: s.key, label: s.label, status: "pending", detail: "" }));
  const find = (key: string) => rows.find((r) => r.key === key);

  if (!tty) return plainChecklist(stream, rows);

  const color = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
  const markerOf = (r: Row, frame: number): string => {
    switch (r.status) {
      case "done": return color(32, DONE);
      case "fail": return color(31, FAIL);
      case "active": return SPINNER[frame % SPINNER.length];
      default: return color(2, PENDING);
    }
  };
  const lineOf = (r: Row, frame: number): string => {
    let text = r.label;
    if (r.detail && (r.status === "active" || r.status === "done")) text += `  ${r.detail}`;
    // Truncate the plain text to the terminal width (2-space indent + marker + space = 4)
    // so a long line never wraps and breaks the cursor math.
    const max = Math.max(8, (stream.columns ?? 80) - 4);
    if (text.length > max) text = text.slice(0, max - 1) + "…";
    if (r.status === "pending") text = color(2, text);
    return `  ${markerOf(r, frame)} ${text}`;
  };

  let frame = 0;
  let drawn = 0; // rows currently on screen
  const draw = () => {
    let out = "";
    if (drawn > 0) out += `\x1b[${drawn}A`; // cursor up to the first row
    for (const r of rows) out += `\x1b[2K${lineOf(r, frame)}\n`; // clear + rewrite each row
    drawn = rows.length;
    stream.write(out);
  };

  draw();
  const timer = setInterval(() => {
    if (rows.some((r) => r.status === "active")) {
      frame++;
      draw();
    }
  }, 90);
  timer.unref?.(); // never keep the process alive on the spinner alone

  return {
    start(key) {
      const r = find(key);
      if (r && r.status === "pending") r.status = "active";
      draw();
    },
    detail(key, text) {
      const r = find(key);
      if (r) r.detail = text; // the spinner timer repaints; no need to redraw per update
    },
    done(key) {
      const r = find(key);
      if (r && r.status !== "done") {
        r.status = "done";
        draw();
      }
    },
    fail(key) {
      const r = key ? find(key) : rows.find((x) => x.status === "active");
      if (r) {
        r.status = "fail";
        draw();
      }
    },
    log(message) {
      // Erase the live block, print the message where it was, then redraw the block
      // below it. Messages stack above the checklist in order, leaving it intact.
      if (drawn > 0) {
        stream.write(`\x1b[${drawn}A\x1b[J`);
        drawn = 0;
      }
      stream.write(message.endsWith("\n") ? message : `${message}\n`);
      draw();
    },
    finish() {
      clearInterval(timer);
      draw(); // settle the final frame (active spinner -> its last drawn state)
    },
  };
}

/** Non-TTY fallback: print a numbered list once, then a checked line per completed stage. */
function plainChecklist(stream: NodeJS.WriteStream, rows: Row[]): Checklist {
  stream.write(`${rows.length} stage${rows.length === 1 ? "" : "s"}:\n`);
  rows.forEach((r, i) => stream.write(`  ${i + 1}. ${r.label}\n`));
  let completed = 0;
  return {
    start() {},
    detail(key, text) {
      const r = rows.find((x) => x.key === key);
      if (r) r.detail = text;
    },
    done(key) {
      const r = rows.find((x) => x.key === key);
      if (!r || r.status === "done") return;
      r.status = "done";
      completed++;
      stream.write(`${DONE} [${completed}/${rows.length}] ${r.label}${r.detail ? ` (${r.detail})` : ""}\n`);
    },
    fail(key) {
      const r = key ? rows.find((x) => x.key === key) : rows.find((x) => x.status !== "done");
      if (r) stream.write(`${FAIL} ${r.label}\n`);
    },
    log(message) {
      stream.write(message.endsWith("\n") ? message : `${message}\n`);
    },
    finish() {},
  };
}
