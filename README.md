# Quire

Quire converts Markdown and MDX documentation into brand-consistent PDF and Word files. Point it at a set of pages (or a manifest that orders them), give it a brand theme, and it produces a single paginated PDF and a matching `.docx`: cover, table of contents, running headers and footers, and your fonts and colors across both.

It understands the Mintlify component set (Callouts, Tabs, Steps, Cards, ParamFields, Frames, Mermaid diagrams, and more), so real docs pages render with their structure intact instead of as raw tags. Use it to turn a docs site into an offline or formal deliverable: a printed handbook, or a versioned manual for a client.

## Requirements

- **Node.js 18 or newer.**
- **Pandoc**, for Word output only. Install it with `brew install pandoc` (macOS) or from [pandoc.org/installing](https://pandoc.org/installing.html). PDF-only runs do not need it.
- **Chromium** is downloaded automatically by Puppeteer during install; there is no separate browser to set up, and no path to configure.

## Install

```bash
npm install -g @riskeyl/quire
quire --help
```

This puts the `quire` command on your `PATH`. To work from source instead, see [Develop Quire](docs/guide.md#develop-quire).

## Quick start

Convert one or more files into a combined PDF and Word document:

```bash
quire convert intro.md guide.md --title "My Handbook" --out build/handbook
```

This writes `build/handbook.pdf` and `build/handbook.docx`. `--out` takes a **base path without an extension**; Quire appends `.pdf` and `.docx` itself. Add `--format pdf` (or `docx`) to produce just one.

To order many pages into chapters, brand the output, and add a cover, drive the build from a manifest and a theme:

```bash
quire convert --manifest manuals/user-guide.yaml --theme themes/brand.yaml \
  --title "User Guide" --out build/user-guide
```

See the [guide](docs/guide.md) for manifests, theming, the cover, cross-document links, config files, and every `convert` option.

## Theme designer

Quire includes a browser-based theme designer that edits brand tokens with a live PDF preview. Open it with the CLI:

```bash
quire design                   # start a new theme from the defaults
quire design themes/brand.yaml # open an existing theme to edit it
```

Tweak colors, fonts, and layout, then Copy or Download the result as a theme YAML. See [Use the theme designer](docs/guide.md#use-the-theme-designer) for building it and the full workflow.

## Documentation

The [Quire guide](docs/guide.md) is the task-oriented reference:

- [Build a manual from a manifest](docs/guide.md#build-a-manual-from-a-manifest)
- [Assemble an API reference from OpenAPI specs](docs/guide.md#assemble-an-api-reference-from-openapi-specs)
- [Brand the PDF and Word output](docs/guide.md#brand-the-pdf-and-word-output)
- [Customize the cover](docs/guide.md#customize-the-cover)
- [Link between documents](docs/guide.md#link-between-documents)
- [Reuse options with a config file](docs/guide.md#reuse-options-with-a-config-file)
- [All `convert` options](docs/guide.md#all-convert-options)

## License

Quire is released under the [MIT License](LICENSE).
