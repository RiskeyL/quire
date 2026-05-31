// tests/designer/form-spec.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_TOKENS, type BrandTokens } from "../../src/theme/tokens.js";
import { FORM_SPEC, type GroupSpec } from "../../src/designer/form-spec.js";

// ---------------------------------------------------------------------------
// Leaf-path walker
// ---------------------------------------------------------------------------

/**
 * Walk `obj` and yield every dotted leaf path.
 * Arrays and primitives are leaves; plain objects recurse.
 * The `brand` group is excluded: DEFAULT_TOKENS.brand is `{}` so it
 * has no leaves, and brand.productName is the one manually-added path.
 */
function leafPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (key === "brand") continue; // excluded — no leaves in DEFAULT_TOKENS.brand
    if (Array.isArray(value) || typeof value !== "object" || value === null) {
      paths.push(full);
    } else {
      paths.push(...leafPaths(value as Record<string, unknown>, full));
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allSpecPaths(spec: GroupSpec[]): string[] {
  return spec.flatMap((g) => g.fields.map((f) => f.path));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FORM_SPEC coverage", () => {
  const tokenLeaves = leafPaths(DEFAULT_TOKENS as unknown as Record<string, unknown>);
  const specPaths = allSpecPaths(FORM_SPEC);

  it("every DEFAULT_TOKENS leaf (excluding brand group) appears in FORM_SPEC", () => {
    const missing = tokenLeaves.filter((p) => !specPaths.includes(p));
    expect(missing, `Missing from FORM_SPEC: ${missing.join(", ")}`).toEqual([]);
  });

  it("FORM_SPEC adds exactly brand.productName beyond the token leaves", () => {
    const extras = specPaths.filter((p) => !tokenLeaves.includes(p));
    expect(extras).toEqual(["brand.productName"]);
  });

  it("no duplicate paths in FORM_SPEC", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const p of specPaths) {
      if (seen.has(p)) dupes.push(p);
      seen.add(p);
    }
    expect(dupes, `Duplicate paths: ${dupes.join(", ")}`).toEqual([]);
  });

  it("every group has a non-empty id and title", () => {
    for (const g of FORM_SPEC) {
      expect(g.id.length, `group id empty`).toBeGreaterThan(0);
      expect(g.title.length, `group title empty for id=${g.id}`).toBeGreaterThan(0);
    }
  });

  it("every field has a non-empty path, label, and valid control type", () => {
    const validControls = ["color", "text", "select", "toggle", "number", "number-array", "slot"];
    for (const g of FORM_SPEC) {
      for (const f of g.fields) {
        expect(f.path.length, `empty path in group ${g.id}`).toBeGreaterThan(0);
        expect(f.label.length, `empty label for ${f.path}`).toBeGreaterThan(0);
        expect(validControls, `invalid control "${f.control}" for ${f.path}`).toContain(f.control);
      }
    }
  });
});
