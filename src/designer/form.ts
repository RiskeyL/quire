// src/designer/form.ts
/**
 * DOM builder for the designer token-editing form.
 * Browser-pure — no Node builtins.
 *
 * createForm() builds the collapsible group/field structure into `root`,
 * wires initial values from `tokens`, and fires onChange on every edit.
 *
 * setValues() re-reads every control from a new tokens object (used by D5d load).
 */
import type { BrandTokens } from "../theme/tokens.js";
import type { GroupSpec, FieldSpec } from "./form-spec.js";

// ---------------------------------------------------------------------------
// Path helpers (browser-pure)
// ---------------------------------------------------------------------------

/**
 * Read a value from obj by dotted path. Array values are returned whole.
 * Returns undefined if any segment is missing.
 */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Write a value into obj at a dotted path, creating intermediate objects
 * as needed. Array paths like "headings.scale" are whole-array leaves.
 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (cur[part] == null || typeof cur[part] !== "object") {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Slot keywords
//
// A header/footer slot is either one of these dynamic keywords or an arbitrary
// literal string. The control surfaces the keywords as named choices and offers
// a "Custom text…" escape hatch for the literal case, so the keywords are
// discoverable instead of hidden behind a free-text field.
// ---------------------------------------------------------------------------

const SLOT_KEYWORDS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "pageNumber", label: "Page number" },
  { value: "docTitle", label: "Document title" },
  { value: "chapter", label: "Chapter" },
];
const SLOT_CUSTOM = "__custom__";

// ---------------------------------------------------------------------------
// Control renderers
// ---------------------------------------------------------------------------

interface ControlResult {
  /** The root element to append into the field row. */
  element: HTMLElement;
  /** Read the current parsed value from the control. */
  getValue: () => unknown;
  /** Write a new value into the control without firing onChange. */
  setValue: (v: unknown) => void;
}

function makeColorControl(initial: string): ControlResult {
  const wrap = document.createElement("div");
  wrap.className = "qd-color-pair";

  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.className = "qd-color-swatch";
  swatch.value = initial.startsWith("#") ? initial : "#000000";

  const hex = document.createElement("input");
  hex.type = "text";
  hex.className = "qd-color-hex";
  hex.value = initial;
  hex.maxLength = 9;
  hex.spellcheck = false;

  // Keep swatch and hex text in sync
  swatch.addEventListener("input", () => { hex.value = swatch.value; });
  hex.addEventListener("input", () => {
    const v = hex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) swatch.value = v;
  });

  wrap.appendChild(swatch);
  wrap.appendChild(hex);

  return {
    element: wrap,
    getValue: () => hex.value.trim(),
    setValue: (v) => {
      const s = String(v ?? "");
      hex.value = s;
      if (/^#[0-9a-fA-F]{6}$/.test(s)) swatch.value = s;
    },
  };
}

function makeTextControl(initial: string): ControlResult {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "qd-input-text";
  input.value = initial;
  input.spellcheck = false;

  return {
    element: input as unknown as HTMLElement,
    getValue: () => input.value,
    setValue: (v) => { input.value = String(v ?? ""); },
  };
}

function makeSelectControl(initial: string, options: string[]): ControlResult {
  const sel = document.createElement("select");
  sel.className = "qd-select";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    if (opt === initial) o.selected = true;
    sel.appendChild(o);
  }

  return {
    element: sel as unknown as HTMLElement,
    getValue: () => sel.value,
    setValue: (v) => { sel.value = String(v ?? ""); },
  };
}

function makeToggleControl(initial: boolean): ControlResult {
  const wrap = document.createElement("div");
  wrap.className = "qd-toggle-wrap";

  const label = document.createElement("label");
  label.className = "qd-toggle";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = initial;

  const track = document.createElement("span");
  track.className = "qd-toggle-track";

  label.appendChild(checkbox);
  label.appendChild(track);
  wrap.appendChild(label);

  return {
    element: wrap,
    getValue: () => checkbox.checked,
    setValue: (v) => { checkbox.checked = Boolean(v); },
  };
}

function makeNumberControl(initial: number, spec: FieldSpec): ControlResult {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "qd-input-number";
  input.value = String(initial);
  if (spec.min !== undefined) input.min = String(spec.min);
  if (spec.max !== undefined) input.max = String(spec.max);
  if (spec.step !== undefined) input.step = String(spec.step);

  return {
    element: input as unknown as HTMLElement,
    getValue: () => {
      const v = parseFloat(input.value);
      return isNaN(v) ? initial : v;
    },
    setValue: (v) => { input.value = String(v ?? initial); },
  };
}

function makeNumberArrayControl(initial: number[], spec: FieldSpec): ControlResult {
  const count = spec.count ?? initial.length;
  const wrap = document.createElement("div");
  wrap.className = "qd-num-array";

  const inputs: HTMLInputElement[] = [];
  for (let i = 0; i < count; i++) {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.className = "qd-input-number";
    inp.value = String(initial[i] ?? 0);
    if (spec.min !== undefined) inp.min = String(spec.min);
    if (spec.max !== undefined) inp.max = String(spec.max);
    if (spec.step !== undefined) inp.step = String(spec.step);
    inp.title = `[${i + 1}]`;
    wrap.appendChild(inp);
    inputs.push(inp);
  }

  return {
    element: wrap,
    getValue: () => inputs.map((inp) => {
      const v = parseFloat(inp.value);
      return isNaN(v) ? 0 : v;
    }),
    setValue: (v) => {
      const arr = Array.isArray(v) ? (v as number[]) : [];
      inputs.forEach((inp, i) => { inp.value = String(arr[i] ?? 0); });
    },
  };
}

function makeSlotControl(initial: string): ControlResult {
  const wrap = document.createElement("div");
  wrap.className = "qd-slot";

  const sel = document.createElement("select");
  sel.className = "qd-select";
  for (const kw of SLOT_KEYWORDS) {
    const o = document.createElement("option");
    o.value = kw.value;
    o.textContent = kw.label;
    sel.appendChild(o);
  }
  const customOpt = document.createElement("option");
  customOpt.value = SLOT_CUSTOM;
  customOpt.textContent = "Custom text…";
  sel.appendChild(customOpt);

  const text = document.createElement("input");
  text.type = "text";
  text.className = "qd-slot-custom";
  text.placeholder = "Header/footer text";
  text.spellcheck = false;

  const isKeyword = (v: string): boolean => SLOT_KEYWORDS.some((k) => k.value === v);

  function applyValue(v: string): void {
    if (isKeyword(v)) {
      sel.value = v;
      text.value = "";
      text.style.display = "none";
    } else {
      sel.value = SLOT_CUSTOM;
      text.value = v;
      text.style.display = "";
    }
  }
  applyValue(initial);

  // Reveal the literal-text field only when "Custom text…" is chosen. Both the
  // select and the text input fire bubbling "input" events, so createForm wires
  // a single "input" listener on the wrapper (see buildField's slot branch).
  sel.addEventListener("change", () => {
    if (sel.value === SLOT_CUSTOM) {
      text.style.display = "";
      text.focus();
    } else {
      text.style.display = "none";
    }
  });

  wrap.appendChild(sel);
  wrap.appendChild(text);

  return {
    element: wrap,
    getValue: () => (sel.value === SLOT_CUSTOM ? text.value : sel.value),
    setValue: (v) => applyValue(String(v ?? "none")),
  };
}

// ---------------------------------------------------------------------------
// Field row builder
// ---------------------------------------------------------------------------

interface FieldBinding {
  path: string;
  getValue: () => unknown;
  setValue: (v: unknown) => void;
  /** The element that fires 'input'/'change' events. */
  eventSource: Element;
}

function buildField(
  spec: FieldSpec,
  initialValue: unknown,
): { row: HTMLElement; helpEl: HTMLElement | null; binding: FieldBinding } {
  const row = document.createElement("div");
  row.className = "qd-field";

  const labelEl = document.createElement("span");
  labelEl.className = "qd-field-label";
  labelEl.textContent = spec.label;
  row.appendChild(labelEl);

  const controlWrap = document.createElement("div");
  controlWrap.className = "qd-field-control";

  let ctrl: ControlResult;
  let eventSource: Element;

  switch (spec.control) {
    case "color": {
      ctrl = makeColorControl(String(initialValue ?? "#000000"));
      // Color fires on both swatch and hex; listen on the wrap
      eventSource = ctrl.element;
      break;
    }
    case "text": {
      ctrl = makeTextControl(String(initialValue ?? ""));
      eventSource = ctrl.element;
      break;
    }
    case "select": {
      ctrl = makeSelectControl(String(initialValue ?? ""), spec.options ?? []);
      eventSource = ctrl.element;
      break;
    }
    case "toggle": {
      ctrl = makeToggleControl(Boolean(initialValue));
      // The actual input[type=checkbox] is inside the wrap; use change event on wrap
      eventSource = ctrl.element;
      break;
    }
    case "number": {
      ctrl = makeNumberControl(Number(initialValue ?? 0), spec);
      eventSource = ctrl.element;
      break;
    }
    case "number-array": {
      const arr = Array.isArray(initialValue) ? (initialValue as number[]) : [];
      ctrl = makeNumberArrayControl(arr, spec);
      eventSource = ctrl.element;
      break;
    }
    case "slot": {
      ctrl = makeSlotControl(String(initialValue ?? ""));
      // Both the select and the custom-text input fire bubbling "input" events,
      // so listen on the wrapper to catch either.
      eventSource = ctrl.element;
      break;
    }
  }

  controlWrap.appendChild(ctrl.element);
  row.appendChild(controlWrap);

  let helpEl: HTMLElement | null = null;
  if (spec.help) {
    helpEl = document.createElement("div");
    helpEl.className = "qd-field-help";
    helpEl.textContent = spec.help;
  }

  return {
    row,
    helpEl,
    binding: {
      path: spec.path,
      getValue: ctrl.getValue,
      setValue: ctrl.setValue,
      eventSource,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FormHandle {
  /** Re-read every control from a new tokens object (for D5d load). */
  setValues(tokens: BrandTokens): void;
}

/**
 * Build the token-editing form into `root`.
 *
 * @param root      Container element (the left panel).
 * @param spec      Ordered group + field declarations.
 * @param tokens    Initial token values (will be mutated on change).
 * @param onChange  Called with the dotted path and new parsed value after each edit.
 *                  The form has already written the value into `tokens` before calling.
 */
export function createForm(
  root: HTMLElement,
  spec: GroupSpec[],
  tokens: BrandTokens,
  onChange: (path: string, value: unknown) => void,
): FormHandle {
  const tokensObj = tokens as unknown as Record<string, unknown>;
  const allBindings: FieldBinding[] = [];

  // Groups that start expanded (first 4 by index)
  const DEFAULT_OPEN = new Set([0, 1, 2, 3]);

  for (let gi = 0; gi < spec.length; gi++) {
    const group = spec[gi];
    const groupEl = document.createElement("div");
    groupEl.className = "qd-group";
    const isOpen = DEFAULT_OPEN.has(gi);
    groupEl.dataset.open = isOpen ? "true" : "false";

    // Header
    const header = document.createElement("div");
    header.className = "qd-group-header";
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", isOpen ? "true" : "false");
    header.tabIndex = 0;

    const titleEl = document.createElement("span");
    titleEl.className = "qd-group-title";
    titleEl.textContent = group.title;

    const chevron = document.createElement("span");
    chevron.className = "qd-group-chevron";
    chevron.textContent = "▶";

    header.appendChild(titleEl);
    header.appendChild(chevron);
    groupEl.appendChild(header);

    // Collapsible body
    const body = document.createElement("div");
    body.className = "qd-group-body";

    const fields = document.createElement("div");
    fields.className = "qd-group-fields";

    for (const fieldSpec of group.fields) {
      const initialValue = getByPath(tokensObj, fieldSpec.path);
      const { row, helpEl, binding } = buildField(fieldSpec, initialValue);
      fields.appendChild(row);
      if (helpEl) fields.appendChild(helpEl);
      allBindings.push(binding);

      // Wire onChange
      const eventName = fieldSpec.control === "select" || fieldSpec.control === "toggle"
        ? "change"
        : "input";

      binding.eventSource.addEventListener(eventName, () => {
        const v = binding.getValue();
        setByPath(tokensObj, binding.path, v);
        onChange(binding.path, v);
      });
    }

    body.appendChild(fields);
    groupEl.appendChild(body);
    root.appendChild(groupEl);

    // Toggle open/close
    function toggle() {
      const open = groupEl.dataset.open !== "true";
      groupEl.dataset.open = open ? "true" : "false";
      header.setAttribute("aria-expanded", open ? "true" : "false");
    }
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter" || ke.key === " ") { ke.preventDefault(); toggle(); }
    });
  }

  return {
    setValues(newTokens: BrandTokens) {
      const newObj = newTokens as unknown as Record<string, unknown>;
      for (const binding of allBindings) {
        const v = getByPath(newObj, binding.path);
        if (v !== undefined) binding.setValue(v);
      }
    },
  };
}
