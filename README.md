# Quire

Quire converts Markdown and MDX documentation into brand-consistent PDF and Word files. Point it at a set of pages (or a manifest that orders them), give it a brand theme, and it produces a single paginated PDF and a matching `.docx`: cover page, table of contents, running headers and footers, and your fonts and colors applied to both outputs.

It was built for turning a documentation site into an offline or formal deliverable (a printed handbook, a versioned manual to hand to a client), and it understands the Mintlify component set (Callouts, Tabs, Steps, Cards, ParamFields, Frames, Mermaid diagrams, and more), so real docs pages render with their structure intact rather than as raw component tags.

## How it works

Everything passes through HTML, so the two output engines are independent:

1. **Resolve** the selection into an ordered page tree (positional file paths, or a manifest).
2. **Render** each MDX page to HTML (structural parse, no JavaScript evaluation), mapping Mintlify components to print-friendly markup and embedding images as self-contained data URIs.
3. **Assemble** the pages into one document: cover, TOC, section headings, per-page anchors, and cross-link rewriting.
4. **Style and export**: the PDF is paginated with [Paged.js](https://pagedjs.org/) via headless Chromium; the Word file is produced by [Pandoc](https://pandoc.org/) against a brand-compiled `reference.docx`.

## Requirements

- **Node.js 18 or newer.**
- **Pandoc**, for Word output. Install it with `brew install pandoc` (macOS) or from [pandoc.org/installing](https://pandoc.org/installing.html). PDF-only runs do not need it.
- **Chromium** is downloaded automatically by Puppeteer during `npm install`. There is no separate browser to install, and no machine-specific path to configure.

## Install

Quire is not yet published to npm. Clone the repository and build it:

```bash
git clone https://github.com/RiskeyL/quire.git
cd quire
npm install        # installs dependencies, downloads Chromium, and builds dist/
```

`npm install` runs the build automatically (via the `prepare` script), so `dist/` is ready afterward. To rebuild manually, run `npm run build`.

Then run it with `node dist/cli.js …`, or link it onto your `PATH` so `quire` works anywhere:

```bash
npm link
quire --help
```

The examples below use `quire`; substitute `node dist/cli.js` if you did not link.

## Quick start

Convert two files into a combined PDF and Word document:

```bash
quire convert intro.md guide.md --title "My Handbook" --out build/handbook
```

This writes `build/handbook.pdf` and `build/handbook.docx`. Note that `--out` takes a **base path without an extension**; Quire appends `.pdf` and `.docx` itself.

Convert a whole manual from a manifest, with a brand theme and a cover:

```bash
quire convert \
  --manifest manuals/user-guide.yaml \
  --root . \
  --theme themes/brand.yaml \
  --title "User Guide" \
  --doc-version "v2.1" \
  --date "2026-05-25" \
  --out build/user-guide
```

## `quire convert`

```
quire convert [paths...] [options]
```

Provide either one or more file `paths` or a `--manifest`, not both.

| Option | Description |
|:-------|:------------|
| `-f, --format <format>` | `pdf`, `docx`, or `both` (default `both`). |
| `-o, --out <path>` | Output base path (no extension) or directory. Defaults beside the source or manifest. |
| `-m, --manifest <file>` | Resolve page order and section hierarchy from a manifest (see below). |
| `--title <title>` | Document title, shown on the cover and in the running header. Defaults to the manifest filename. |
| `--theme <file>` | Brand-token YAML (colors, fonts, page size, logo). See [Brand themes](#brand-themes). |
| `--doc-version <version>` | Release or version label printed on the cover. Omitted when unset. |
| `--date <date>` | Publish date printed on the cover. Omitted when unset; never auto-filled. |
| `--base-url <url>` | Published-site base (e.g. `https://docs.dify.ai`). Rewrites links to pages outside the bundle into live external URLs. See [Cross-document links](#cross-document-links). |
| `--root <dir>` | Base directory for resolving root-relative image paths (`/images/…`). Defaults to the manifest directory, then the current directory. |
| `--offline` | Do not fetch remote images. |
| `--no-cover` | Omit the cover page. |
| `--no-toc` | Omit the table of contents. |
| `--no-description` | Suppress the per-page description lede (otherwise follows the theme's `meta.showDescription`). |
| `-c, --config <file>` | Run-config YAML supplying defaults. CLI flags override it. See [Run-config files](#run-config-files). |
| `--dry-run` | Resolve and print the page tree without rendering. |

## `quire init`

Scaffold a starter manifest by scanning a folder for `.md` and `.mdx` files:

```
quire init [dir] [-o, --out <file>]
```

Subfolders become sections (titled from the folder name), files become pages, and entries are sorted with a folder's own pages before its subsections. With no `--out` the manifest is printed to stdout, so you can review it before saving:

```bash
quire init docs/ --out manuals/docs.yaml
```

Page titles are intentionally omitted from the scaffold: Quire reads each title from the page's own frontmatter, so the frontmatter stays the single source of truth. Edit the generated file to set section titles and reorder as needed.

## Theme designer

The theme designer is a browser-based tool for editing brand tokens with a live PDF preview. Build it once after compiling the project:

```bash
npm run build:designer   # emits dist/designer.html
```

Open it directly in your browser, or use the CLI to pre-load an existing theme:

```bash
quire design                   # open the designer with default tokens
quire design themes/brand.yaml # open with brand.yaml tokens pre-loaded
```

When launched with a theme file, the designer opens with that theme's tokens already filled in. You can tweak colors, fonts, and page layout while watching the PDF preview update, then use Copy or Download to export the result as a theme YAML.

To run the headless designer smoke test (requires a local Chromium):

```bash
QUIRE_BROWSER_TESTS=1 npm test
```

## Manifests

A manifest is a YAML list that defines what goes into the document and in what order. Two entry types nest freely:

- A **page**: `{ file: <path> }`, with an optional `title:` (otherwise the page's frontmatter title is used).
- A **section**: `{ section: <title>, children: [ … ] }`, holding pages or further sections.

```yaml
- section: "Getting Started"
  children:
    - file: "en/start/introduction.mdx"
    - file: "en/start/quick-start.mdx"

- section: "Guides"
  children:
    - section: "Workflow"
      children:
        - file: "en/guides/workflow/overview.mdx"
        - file: "en/guides/workflow/nodes.mdx"
    - file: "en/guides/publishing.mdx"
```

Page paths are resolved relative to the manifest's own directory. Each top-level section becomes a chapter that starts on a new page. Sections can nest to any depth; the table of contents and heading hierarchy follow the structure.

## Brand themes

A theme is a YAML file of brand tokens. Every key is optional and falls back to a built-in default, so a theme can be as small as a single color override. One theme brands both outputs: the tokens compile to print CSS for the PDF and to a patched `reference.docx` for Word.

```yaml
page:
  size: A4              # A4 or Letter
  margin: "2cm"         # CSS length; 1, 2, or 4 values (e.g. "2cm 1.5cm")

colors:
  text: "#1a1a1a"       # body text
  heading: "#111827"    # headings (and Word Heading 1 to 6)
  link: "#2563eb"       # hyperlinks
  accent: "#2563eb"     # rules, the Info callout bar, the blockquote bar
  muted: "#6b7280"      # captions, the page-description lede, secondary text
  surface: "#f2f2f2"    # light fills: code blocks, callouts, panels, table header row
  border: "#d9d9d9"     # hairlines: table cells, card/panel borders, hr, separators

semantic:
  success: "#15803d"    # Tip and Check callout accents
  caution: "#b45309"    # Note callout and the required-field badge
  danger: "#b91c1c"     # Warning and Danger callout accents

shape:
  radius: "4px"         # corner radius for code, callouts, cards, panels, badges (PDF only; Word corners are square)

typography:
  bodyFont: "Georgia, 'Times New Roman', serif"      # PDF uses the full stack; Word uses the first family
  headingFont: "Helvetica, Arial, sans-serif"
  monoFont: "Consolas, 'SF Mono', Menlo, monospace"  # lead with a Word-resolvable mono family (see note)
  baseSize: "11pt"
  lineHeight: 1.5       # PDF only

headings:
  scale: [2, 1.5, 1.25, 1.1, 1, 0.85]    # h1 through h6 font sizes in em
  weight: [700, 700, 600, 600, 600, 600]  # h1 through h6 font weights (PDF only; Word uses the heading font family)

toc:
  title: "Contents"     # heading above the PDF table of contents
  depth: 3              # heading levels shown in the TOC

links:
  underline: true       # underline hyperlinks in both PDF and Word; set false to remove in both
                        # Note: the old Pandoc default for Word had no underline; the default true now adds one
                        # to match the PDF. Set links.underline: false to restore the old no-underline Word behavior.

density: "normal"       # vertical rhythm preset: "compact", "normal", or "relaxed"

header:                 # running-header slots (PDF and Word)
  left: "docTitle"      # keywords: docTitle, chapter, pageNumber, none; or any literal text
  center: "none"
  right: "chapter"

footer:                 # running-footer slots (PDF and Word), same keyword set as header
  left: "none"
  center: "pageNumber"
  right: "none"

furniture:
  fontSize: "9pt"       # running header/footer text size
  color: "#6b7280"      # running header/footer text color

pageNumbers:
  restartAtBody: true   # restart page numbering at the first body page; set false for continuous numbering

cover:
  layout: "spine"       # "spine" (brand-color bar on left edge) or "plain" (PDF only; Word cover is always plain)
  spineWidth: "16mm"    # width of the spine bar (PDF only)
  logoWidth: "44mm"     # cover logo width

badges:
  color: "muted"        # badge border and text color: "accent", "muted", or a hex value (PDF only)

components:
  gap: 1                # multiplier on vertical spacing around callouts, cards, panels, code groups, frames (PDF only)

tables:
  layout: fixed         # "fixed" (default) = equal columns, content wraps; "auto" = content-fit

meta:
  showDescription: true # render each page's frontmatter description as a lede

brand:
  logo: "./logo.png"    # cover logo; path is relative to THIS theme file, or absolute
  productName: "Acme"   # product name shown above the title on the cover
```

A few things worth knowing:

- **`typography.monoFont`** must lead with a font name that Word can resolve, because the Word export picks the first family literally (it cannot follow a CSS fallback chain). Consolas is a safe lead: Microsoft Office bundles it on both Windows and macOS. Chromium falls through the rest of the stack for the PDF.
- **`tables.layout: fixed`** governs both outputs. It gives every table equal-width columns and lets long unbreakable tokens (such as fully-qualified class paths) wrap, instead of stretching one column past the page edge and clipping the last one.
- **Logos**: PNG and JPG render reliably in both formats. SVG is reliable in the PDF but unreliable in Word, so prefer a raster logo if you need both.
- **PDF-only tokens**: `shape.radius`, `headings.weight`, `cover.layout`, `cover.spineWidth`, `badges.color`, and `components.gap` apply to the PDF only. The corresponding Word behavior is either fixed by design or governed by the heading font family.

## The cover

The cover shows, in order: the brand logo, the product name, the manual title, the version, and the publish date. The title is always present; every other element appears only when you supply it.

The split is deliberate. The **logo** and **product name** are brand-level, so they live in the theme (`brand.logo`, `brand.productName`). The **version** and **publish date** change with each release, so they are per-run flags (`--doc-version`, `--date`). The publish date is never auto-filled from the system clock; if you do not pass `--date`, no date line is printed. The **title** comes from `--title` (or the manifest filename).

```bash
quire convert --manifest m.yaml --theme brand.yaml \
  --title "User Guide" --doc-version "v2.1" --date "2026-05-25"
```

## Cross-document links

When a link points to another page **inside the same bundle**, Quire rewrites it to an in-document anchor, so it jumps within the PDF or Word file. Links to pages **outside the bundle** are, by default, left as written.

Pass `--base-url` to turn those out-of-bundle internal links into live URLs on your published site. For example, with `--base-url https://docs.dify.ai`, a link to `/en/use-dify/something` that is not in the bundle becomes `https://docs.dify.ai/en/use-dify/something` (query strings and fragments are preserved). Genuine external links and full URLs already written into the source are never touched.

## Run-config files

A run-config YAML supplies defaults so you do not retype the same flags. Every key mirrors a `convert` flag. An explicitly-set CLI flag wins over the file; the file wins over the built-in default.

```yaml
# quire.config.yaml
format: both
theme: themes/brand.yaml
root: .
toc: true
docVersion: "v2.1"
date: "2026-05-25"
baseUrl: https://docs.dify.ai
```

```bash
quire convert --manifest m.yaml --config quire.config.yaml
```

Available keys: `format`, `out`, `manifest`, `title`, `cover`, `toc`, `root`, `offline`, `theme`, `description`, `baseUrl`, `docVersion`, `date`. Unquoted `docVersion` and `date` values are accepted even when YAML parses them as a number or a date; they are normalized to strings.

## Examples

The `examples/` directory contains a commented brand theme (`dify.brand.yaml`) and a commented run-config (`quire.config.yaml`) to copy from.

## Notes and limitations

- Large image-heavy manuals embed every image, so the output can be sizable. A 100-plus-page manual with hundreds of screenshots can run for several minutes.
- Remote images are fetched with a timeout; if one cannot be retrieved it is skipped with a warning and the rest of the document still builds.
- The Word table of contents is emitted as a field that Word offers to populate on open (Quire flags it for update); the body cross-links work without that step.

## Development

```bash
npm test           # run the test suite (Vitest)
npm run build      # compile to dist/
npm run dev -- …   # run from source with tsx (e.g. npm run dev -- convert intro.md)
```

## License

Quire is released under the [MIT License](LICENSE).
