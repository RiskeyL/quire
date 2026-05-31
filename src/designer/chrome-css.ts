// src/designer/chrome-css.ts
/**
 * Chrome CSS for the Quire theme designer.
 * Exported as a string; app.ts injects it into a <style> element at boot.
 * Browser-pure: no Node builtins, no imports.
 *
 * Design language: dark precision instrument — the chrome recedes so the
 * PDF preview is the visual hero. Mono typeface throughout for labels
 * and values; one warm-amber accent.
 */
export const CHROME_CSS = `
/* ---- Reset ---- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ---- Root variables ---- */
:root {
  --panel-bg:      #17171a;
  --topbar-bg:     #0f0f11;
  --hairline:      #2a2a2e;
  --text:          #e8e8ea;
  --muted:         #8a8a90;
  --accent:        #f5a623;
  --field-bg:      #202024;
  --field-border:  #2a2a2e;
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
  color: var(--text);
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
  border: 1px solid var(--hairline);
  background: transparent;
  color: var(--muted);
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
  color: #0f0f11;
  font-weight: 600;
}

.qd-btn-primary:hover {
  background: #f7b84a;
  border-color: #f7b84a;
  color: #0f0f11;
}

.qd-btn-flash {
  background: #2a3a1e;
  border-color: #4a7a2a;
  color: #8dc45a;
}

/* ---- Main layout ---- */
#qd-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ---- Left control panel ---- */
#qd-panel {
  width: 380px;
  min-width: 380px;
  background: var(--panel-bg);
  border-right: 1px solid var(--hairline);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

/* Subtle scrollbar */
#qd-panel::-webkit-scrollbar { width: 4px; }
#qd-panel::-webkit-scrollbar-track { background: transparent; }
#qd-panel::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 2px; }

/* ---- Token groups ---- */
.qd-group {
  border-bottom: 1px solid var(--hairline);
}

.qd-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s ease;
}

.qd-group-header:hover {
  background: rgba(255,255,255,0.03);
}

.qd-group-title {
  font-family: var(--mono);
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--muted);
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
  padding: 4px 0 8px 0;
}

/* ---- Field rows ---- */
.qd-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px;
  min-height: 28px;
  gap: 8px;
}

.qd-field:hover {
  background: rgba(255,255,255,0.02);
}

.qd-field-label {
  font-family: var(--mono);
  font-size: var(--font-xs);
  color: var(--muted);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 90px;
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
  padding: 0 16px 6px 16px;
  font-family: var(--sans);
  font-size: 10px;
  color: var(--muted);
  line-height: 1.5;
  opacity: 0.75;
}

/* ---- Text inputs ---- */
.qd-input-text {
  font-family: var(--mono);
  font-size: var(--font-xs);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  color: var(--text);
  padding: 3px 7px;
  border-radius: 3px;
  width: 160px;
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
  padding: 3px 24px 3px 7px;
  border-radius: 3px;
  width: 130px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238a8a90' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 7px center;
  cursor: pointer;
  transition: border-color 0.12s ease;
}

.qd-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.2);
}

/* ---- Color pair (swatch + hex text) ---- */
.qd-color-pair {
  display: flex;
  align-items: center;
  gap: 5px;
}

.qd-color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 3px;
  border: 1px solid var(--hairline);
  padding: 0;
  cursor: pointer;
  background: none;
  overflow: hidden;
  flex-shrink: 0;
  transition: border-color 0.12s ease;
}

.qd-color-swatch:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.2);
}

/* Override native color input chrome */
.qd-color-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.qd-color-swatch::-webkit-color-swatch { border: none; border-radius: 2px; }

.qd-color-hex {
  font-family: var(--mono);
  font-size: var(--font-xs);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  color: var(--text);
  padding: 3px 6px;
  border-radius: 3px;
  width: 76px;
  transition: border-color 0.12s ease;
}

.qd-color-hex:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.2);
}

/* ---- Number input ---- */
.qd-input-number {
  font-family: var(--mono);
  font-size: var(--font-xs);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  color: var(--text);
  padding: 3px 6px;
  border-radius: 3px;
  width: 72px;
  text-align: right;
  transition: border-color 0.12s ease;
}

.qd-input-number:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.2);
}

/* ---- Number-array (h1-h6 inputs) ---- */
.qd-num-array {
  display: flex;
  gap: 3px;
  align-items: center;
  flex-wrap: nowrap;
}

.qd-num-array .qd-input-number {
  width: 44px;
  padding: 3px 3px;
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

/* ---- Slot (text + datalist keywords) ---- */
.qd-slot-input {
  font-family: var(--mono);
  font-size: var(--font-xs);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  color: var(--text);
  padding: 3px 7px;
  border-radius: 3px;
  width: 138px;
  transition: border-color 0.12s ease;
}

.qd-slot-input:focus {
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
  font-size: 10px;
  color: var(--muted);
  background: transparent;
  padding: 10px 16px 16px 16px;
  white-space: pre;
  overflow-x: auto;
  line-height: 1.55;
  max-height: 340px;
  overflow-y: auto;
}

#qd-yaml-pre::-webkit-scrollbar { width: 3px; height: 3px; }
#qd-yaml-pre::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 2px; }

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
  color: #c0574a;
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
