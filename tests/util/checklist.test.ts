import { describe, it, expect } from "vitest";
import { createChecklist, type ChecklistStage } from "../../src/util/checklist.js";

function fakeStream(isTTY: boolean) {
  const chunks: string[] = [];
  const stream = {
    isTTY,
    columns: 80,
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  return { stream, out: () => chunks.join("") };
}

const STAGES: ChecklistStage[] = [
  { key: "render", label: "Render content" },
  { key: "pdf", label: "Generate PDF" },
];

describe("checklist (non-TTY)", () => {
  it("prints a numbered list up front and a checked line per stage", () => {
    const { stream, out } = fakeStream(false);
    const cl = createChecklist(STAGES, { stream });
    cl.start("render");
    cl.detail("render", "page 5/5");
    cl.done("render");
    cl.start("pdf");
    cl.done("pdf");
    cl.finish();
    const text = out();
    expect(text).toContain("2 stages:");
    expect(text).toContain("1. Render content");
    expect(text).toContain("2. Generate PDF");
    expect(text).toContain("✔ [1/2] Render content");
    expect(text).toContain("✔ [2/2] Generate PDF");
  });

  it("reports the active stage on failure", () => {
    const { stream, out } = fakeStream(false);
    const cl = createChecklist(STAGES, { stream });
    cl.start("render");
    cl.fail();
    cl.finish();
    expect(out()).toContain("✖ Render content");
  });
});

describe("checklist (TTY)", () => {
  it("draws every stage up front with a pending marker", () => {
    const { stream, out } = fakeStream(true);
    const cl = createChecklist(STAGES, { stream });
    cl.finish();
    const text = out();
    expect(text).toContain("Render content");
    expect(text).toContain("Generate PDF");
    expect(text).toContain("○");
  });

  it("shows a checkmark when a stage completes", () => {
    const { stream, out } = fakeStream(true);
    const cl = createChecklist(STAGES, { stream });
    cl.start("render");
    cl.done("render");
    cl.finish();
    expect(out()).toContain("✔");
  });

  it("moves the cursor up to redraw the block in place", () => {
    const { stream, out } = fakeStream(true);
    const cl = createChecklist(STAGES, { stream });
    cl.done("render"); // a redraw after the initial draw must reposition the cursor
    cl.finish();
    expect(out()).toContain("\x1b[2A");
  });
});
