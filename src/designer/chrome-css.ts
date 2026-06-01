// src/designer/chrome-css.ts
/**
 * Chrome CSS for the Quire theme designer.
 * Exported as a string; app.ts injects it into a <style> element at boot.
 * Browser-pure: no Node builtins, no imports.
 *
 * Design language: dark precision instrument — the chrome recedes so the
 * PDF preview is the visual hero. Mono typeface throughout; one warm-amber
 * accent reserved for the primary action and focus.
 *
 * Text uses a deliberate three-tier hierarchy so the panel scans cleanly:
 *   --title  group headers (brightest structural text)
 *   --text   editable values inside inputs
 *   --label  field labels (one step down)
 *   --help   inline guidance (dimmer, but AA-readable, never opacity-faded)
 *   --muted  genuinely secondary marks (chevrons, separators, page count)
 */
export const CHROME_CSS = `
/* ---- Reset ---- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ---- Root variables ---- */
:root {
  --panel-bg:      #161619;
  --topbar-bg:     #0e0e10;
  --hairline:      #28282e;
  --title:         #e6e6ea;
  --text:          #ededf0;
  --label:         #b9bac1;
  --help:          #a0a1a9;
  --muted:         #82838b;
  --accent:        #f5a623;
  --field-bg:      #222227;
  --field-border:  #34343b;
  --preview-bg:    #525659;
  --page-shadow:   0 2px 12px rgba(0,0,0,0.55);
  --mono:          ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  --sans:          -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-xs:       11px;
  --font-sm:       12px;
  --font-base:     13px;
}

/* ---- Body / root ---- */
html, body {
  height: 100%;
  overflow: hidden;
  background: var(--topbar-bg);
  color: var(--text);
  font-family: var(--mono);
  font-size: var(--font-base);
  line-height: 1.4;
}

/* ---- App shell ---- */
#quire-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ---- Top bar ---- */
#qd-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  min-height: 48px;
  padding: 0 16px;
  background: var(--topbar-bg);
  border-bottom: 1px solid var(--hairline);
  flex-shrink: 0;
  z-index: 10;
}

#qd-wordmark {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

#qd-wordmark-name {
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--title);
}

#qd-wordmark-label {
  font-family: var(--mono);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--muted);
  text-transform: uppercase;
}

#qd-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ---- Buttons ---- */
.qd-btn {
  font-family: var(--mono);
  font-size: var(--font-xs);
  font-weight: 500;
  letter-spacing: 0.04em;
  border: 1px solid var(--field-border);
  background: transparent;
  color: var(--label);
  cursor: pointer;
  padding: 5px 12px;
  border-radius: 3px;
  transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}

.qd-btn:hover {
  color: var(--text);
  border-color: var(--muted);
}

.qd-btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #14110a;
  font-weight: 600;
}

.qd-btn-primary:hover {
  background: #f7b84a;
  border-color: #f7b84a;
  color: #14110a;
}

.qd-btn-flash {
  background: #243a1c;
  border-color: #5a9a36;
  color: #a3da6c;
}

/* ---- Cover preset buttons (quick-apply arrangements) ---- */
.qd-preset-row {
  gap: 5px;
  flex-wrap: wrap;
}

.qd-preset-btn {
  padding: 4px 9px;
}

/* ---- Main layout ---- */
#qd-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ---- Left control panel ---- */
#qd-panel {
  width: 384px;
  min-width: 384px;
  background: var(--panel-bg);
  border-right: 1px solid var(--hairline);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

/* Subtle scrollbar */
#qd-panel::-webkit-scrollbar { width: 5px; }
#qd-panel::-webkit-scrollbar-track { background: transparent; }
#qd-panel::-webkit-scrollbar-thumb { background: var(--field-border); border-radius: 3px; }
#qd-panel::-webkit-scrollbar-thumb:hover { background: var(--muted); }

/* ---- Token groups ---- */
.qd-group {
  border-bottom: 1px solid var(--hairline);
}

.qd-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s ease;
}

.qd-group-header:hover {
  background: rgba(255,255,255,0.035);
}

/* Open group: faint seat + an amber left rail marking the active section. */
.qd-group[data-open="true"] > .qd-group-header {
  background: rgba(255,255,255,0.022);
  box-shadow: inset 2px 0 0 var(--accent);
}

.qd-group-title {
  font-family: var(--mono);
  font-size: var(--font-sm);
  font-weight: 600;
  letter-spacing: 0.11em;
  color: var(--title);
  text-transform: uppercase;
}

.qd-group-chevron {
  font-size: 9px;
  color: var(--muted);
  transition: transform 0.15s ease;
  display: inline-block;
}

.qd-group[data-open="true"] .qd-group-chevron {
  transform: rotate(90deg);
  color: var(--label);
}

.qd-group-body {
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.18s ease;
}

.qd-group[data-open="true"] .qd-group-body {
  max-height: 2000px;
}

.qd-group-fields {
  padding: 8px 0 12px 0;
}

/* ---- Field rows ---- */
.qd-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 16px 4px 16px;
  min-height: 28px;
  gap: 8px;
}

.qd-field-label {
  font-family: var(--mono);
  font-size: var(--font-xs);
  color: var(--label);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 96px;
}

.qd-field-control {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
}

/* ---- Field help text ---- */
.qd-field-help {
  padding: 0 16px 10px 16px;
  font-family: var(--sans);
  font-size: var(--font-xs);
  color: var(--help);
  line-height: 1.45;
}

/* ---- Text inputs ---- */
.qd-input-text {
  font-family: var(--mono);
  font-size: var(--font-xs);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  color: var(--text);
  padding: 4px 7px;
  border-radius: 3px;
  width: 162px;
  min-width: 0;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.qd-input-text:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.2);
}

/* ---- Select ---- */
.qd-select {
  font-family: var(--mono);
  font-size: var(--font-xs);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  color: var(--text);
  padding: 4px 24px 4px 7px;
  border-radius: 3px;
  width: 132px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2382838b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 7px center;
  cursor: pointer;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.qd-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.2);
}

/* ---- Compact font picker (▾ dropdown added beside each font field on detect) ---- */
.qd-font-pick {
  width: 34px;
  min-width: 34px;
  flex: 0 0 auto;
  padding: 4px 4px;
  text-align: center;
  background-position: right 5px center;
}

/* ---- Color pill (swatch + hex unified into one control) ---- */
.qd-color-pair {
  display: inline-flex;
  align-items: center;
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  border-radius: 4px;
  overflow: hidden;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.qd-color-pair:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.2);
}

.qd-color-swatch {
  width: 18px;
  height: 18px;
  margin: 3px 1px 3px 3px;
  border-radius: 3px;
  border: none;
  padding: 0;
  cursor: pointer;
  background: none;
  overflow: hidden;
  flex-shrink: 0;
  /* Inner hairline so a near-black chip stays visible against the dark pill. */
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18);
}

/* Override native color input chrome */
.qd-color-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.qd-color-swatch::-webkit-color-swatch { border: none; border-radius: 3px; }
.qd-color-swatch:focus { outline: none; }

.qd-color-hex {
  font-family: var(--mono);
  font-size: var(--font-xs);
  background: transparent;
  border: none;
  color: var(--text);
  padding: 4px 8px 4px 5px;
  width: 74px;
}

.qd-color-hex:focus { outline: none; }

/* ---- Number input ---- */
.qd-input-number {
  font-family: var(--mono);
  font-size: var(--font-xs);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  color: var(--text);
  padding: 4px 6px;
  border-radius: 3px;
  width: 72px;
  text-align: right;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.qd-input-number:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.2);
}

/* ---- Stacked field (label on its own line, control fills the width below) ---- */
/* Used for the six-cell heading scale/weight arrays, which do not fit beside a
   label on one panel row. */
.qd-field--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.qd-field--stack .qd-field-label { min-width: 0; }
.qd-field--stack .qd-field-control { justify-content: flex-start; }

/* ---- Number-array (h1-h6 inputs) ---- */
.qd-num-array {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: nowrap;
  width: 100%;
}

/* Cells share the row width evenly so all six fit without clipping or
   overlapping the label, at any panel width. */
.qd-num-array .qd-input-number {
  flex: 1 1 0;
  width: auto;
  min-width: 0;
  padding: 4px 3px;
  text-align: center;
}

/* ---- Toggle ---- */
.qd-toggle-wrap {
  display: flex;
  align-items: center;
}

.qd-toggle {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
}

.qd-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.qd-toggle-track {
  position: absolute;
  inset: 0;
  background: var(--field-border);
  border-radius: 9px;
  transition: background 0.15s ease;
  cursor: pointer;
}

.qd-toggle input:checked + .qd-toggle-track {
  background: var(--accent);
}

.qd-toggle-track::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 14px;
  height: 14px;
  background: var(--text);
  border-radius: 50%;
  transition: transform 0.15s ease;
}

.qd-toggle input:checked + .qd-toggle-track::after {
  transform: translateX(14px);
}

.qd-toggle input:focus-visible + .qd-toggle-track {
  box-shadow: 0 0 0 2px rgba(245,166,35,0.35);
}

/* ---- Slot (keyword select + custom-text escape hatch) ---- */
.qd-slot {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.qd-slot-custom {
  font-family: var(--mono);
  font-size: var(--font-xs);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  color: var(--text);
  padding: 4px 7px;
  border-radius: 3px;
  width: 160px;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.qd-slot-custom:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.2);
}

/* ---- YAML pane (at bottom of panel) ---- */
#qd-yaml-group {
  margin-top: auto;
  border-top: 1px solid var(--hairline);
  border-bottom: none;
}

#qd-yaml-pre {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--label);
  background: transparent;
  padding: 10px 16px 16px 16px;
  white-space: pre;
  overflow-x: auto;
  line-height: 1.55;
  max-height: 340px;
  overflow-y: auto;
}

#qd-yaml-pre::-webkit-scrollbar { width: 4px; height: 4px; }
#qd-yaml-pre::-webkit-scrollbar-thumb { background: var(--field-border); border-radius: 2px; }

/* ---- Preview pane ---- */
#qd-preview-pane {
  flex: 1;
  background: var(--preview-bg);
  overflow-y: auto;
  overflow-x: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0 48px 0;
  position: relative;
}

#quire-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.pagedjs_page {
  background: #ffffff;
  box-shadow: var(--page-shadow);
}

/* ---- Page count readout ---- */
#qd-page-count {
  position: fixed;
  bottom: 12px;
  right: 16px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--muted);
  opacity: 0.6;
  pointer-events: none;
  z-index: 5;
}

/* ---- Relayout pulse: brief highlight on the preview pane after repagination ---- */
@keyframes qd-relayout-pulse {
  0%   { box-shadow: inset 0 0 0 2px rgba(245,166,35,0.0); }
  25%  { box-shadow: inset 0 0 0 2px rgba(245,166,35,0.55); }
  100% { box-shadow: inset 0 0 0 2px rgba(245,166,35,0.0); }
}

#qd-preview-pane.qd-relayout-pulse {
  animation: qd-relayout-pulse 400ms ease-out forwards;
}

/* ---- Status message (load success / error) ---- */
#qd-status {
  font-family: var(--mono);
  font-size: var(--font-xs);
  padding: 0 8px;
  opacity: 0;
  transition: opacity 0.15s ease;
  white-space: nowrap;
  pointer-events: none;
}

#qd-status.qd-status-ok {
  color: var(--accent);
  opacity: 1;
}

#qd-status.qd-status-error {
  color: #ff7a6b;
  opacity: 1;
}

/* ---- Drag-and-drop overlay ---- */
#qd-drop-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
}

#qd-drop-overlay.qd-drop-active {
  display: block;
  border: 3px solid var(--accent);
  background: rgba(245,166,35,0.06);
}
`;
