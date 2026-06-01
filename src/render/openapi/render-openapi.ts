/**
 * Render an OpenAPI 3.0/3.1 spec (already parsed into a JS object) into a
 * Markdown string suitable for Quire's Markdown→PDF/Word pipeline.
 *
 * The renderer is pure: it takes a parsed spec object and returns a string. It
 * does no I/O. Operations are grouped under their OpenAPI tags (the doc's
 * sections), and every named schema transitively referenced from the rendered
 * operations is collected into a `## Schemas` appendix.
 *
 * Output structure matches the proven prototype, with one improvement: table
 * cells whose source text is a multi-line Markdown list are rendered as
 * `<br/>`-joined bullets (see {@link cleanCell}) instead of being collapsed into
 * an unreadable run-on line.
 */

// ---------------------------------------------------------------------------
// Types
//
// These describe only the slice of the OpenAPI object model this renderer
// reads. They are intentionally permissive (most fields optional) because real
// specs vary, and recursive where the spec is recursive (schemas).
// ---------------------------------------------------------------------------

/** A `$ref` wrapper: `{ $ref: "#/components/schemas/Name" }`. */
export interface Reference {
  $ref: string;
}

/** A JSON Schema object as used by OpenAPI, possibly a `$ref`. Recursive. */
export interface OpenApiSchema {
  $ref?: string;
  type?: string;
  description?: string;
  /** Property name → property schema. */
  properties?: Record<string, OpenApiSchema>;
  /** Names of required properties. */
  required?: string[];
  /** Item schema for `type: array`. */
  items?: OpenApiSchema;
  /** Composition: this schema is the merge of its members. */
  allOf?: OpenApiSchema[];
  /** Allowed values for a scalar. */
  enum?: unknown[];
  /** Default value. */
  default?: unknown;
  [k: string]: unknown;
}

/** An operation parameter, or a `$ref` to one in `components.parameters`. */
export interface OpenApiParameter {
  $ref?: string;
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
  [k: string]: unknown;
}

/** A media-type entry under a request/response `content` map. */
export interface OpenApiMediaType {
  schema?: OpenApiSchema;
  [k: string]: unknown;
}

/** A request body. */
export interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, OpenApiMediaType>;
  [k: string]: unknown;
}

/** A single response, or a `$ref` to one in `components.responses`. */
export interface OpenApiResponse {
  $ref?: string;
  description?: string;
  content?: Record<string, OpenApiMediaType>;
  [k: string]: unknown;
}

/** A single operation (one HTTP method on one path). */
export interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
  [k: string]: unknown;
}

/** The set of operations on one path, keyed by HTTP method. */
export type OpenApiPathItem = {
  [method in HttpMethod]?: OpenApiOperation;
} & {
  [k: string]: unknown;
};

/** A declared tag with an optional description. */
export interface OpenApiTag {
  name: string;
  description?: string;
  [k: string]: unknown;
}

/** A server entry; only `url` is read. */
export interface OpenApiServer {
  url: string;
  [k: string]: unknown;
}

/** The components object; only `schemas`, `parameters`, and `responses` are read. */
export interface OpenApiComponents {
  schemas?: Record<string, OpenApiSchema>;
  parameters?: Record<string, OpenApiParameter>;
  responses?: Record<string, OpenApiResponse>;
  [k: string]: unknown;
}

/** A parsed OpenAPI 3.0/3.1 document (the slice this renderer reads). */
export interface OpenApiSpec {
  info?: { title?: string; description?: string; [k: string]: unknown };
  servers?: OpenApiServer[];
  tags?: OpenApiTag[];
  paths?: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
  [k: string]: unknown;
}

/** Options for {@link renderOpenApiMarkdown}. */
export interface RenderOpenApiOptions {
  /** When set, emitted as a `title` in leading YAML frontmatter. */
  title?: string;
}

/** HTTP methods rendered, in the order operations are emitted within a path. */
type HttpMethod = "get" | "post" | "put" | "delete" | "patch";
const HTTP_METHODS: readonly HttpMethod[] = ["get", "post", "put", "delete", "patch"];

/** The tag used for operations that declare no tags. */
const UNTAGGED = "Other";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a parsed OpenAPI spec into a Markdown string.
 *
 * @param spec    A parsed OpenAPI 3.0/3.1 document.
 * @param options `title` adds leading YAML frontmatter.
 */
export function renderOpenApiMarkdown(spec: OpenApiSpec, options: RenderOpenApiOptions = {}): string {
  return new Renderer(spec).render(options);
}

// ---------------------------------------------------------------------------
// Renderer
//
// A short-lived instance per render call. It accumulates output lines and the
// set of schemas referenced while rendering operations, so the appendix can be
// emitted afterwards.
// ---------------------------------------------------------------------------

/** One operation paired with the path and method it was found under. */
interface LocatedOperation {
  path: string;
  method: HttpMethod;
  op: OpenApiOperation;
}

class Renderer {
  private readonly spec: OpenApiSpec;
  private readonly schemas: Record<string, OpenApiSchema>;
  private readonly out: string[] = [];
  /** Schema names referenced while rendering, in discovery order, deduped. */
  private readonly referenced = new Set<string>();

  constructor(spec: OpenApiSpec) {
    this.spec = spec;
    this.schemas = spec.components?.schemas ?? {};
  }

  render(options: RenderOpenApiOptions): string {
    if (options.title !== undefined) {
      this.w("---");
      this.w(`title: ${options.title}`);
      this.w("---");
      this.w("");
    }

    this.renderIntro();
    this.renderOperationsByTag();
    this.renderSchemasAppendix();

    return this.out.join("\n") + "\n";
  }

  // -- Intro ----------------------------------------------------------------

  private renderIntro(): void {
    const description = this.spec.info?.description;
    if (description) {
      this.w(this.cleanBlock(description));
      this.w("");
    }
    const server = this.spec.servers?.[0]?.url;
    if (server) {
      this.w(`Base URL: \`${server}\``);
      this.w("");
    }
  }

  // -- Operations by tag ----------------------------------------------------

  private renderOperationsByTag(): void {
    const opsByTag = new Map<string, LocatedOperation[]>();
    for (const [path, item] of Object.entries(this.spec.paths ?? {})) {
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (!op) continue;
        const tags = op.tags && op.tags.length ? op.tags : [UNTAGGED];
        for (const tag of tags) {
          const list = opsByTag.get(tag) ?? [];
          list.push({ path, method, op });
          opsByTag.set(tag, list);
        }
      }
    }

    const declared = (this.spec.tags ?? []).map((t) => t.name);
    const tagDescriptions = new Map(
      (this.spec.tags ?? []).map((t) => [t.name, t.description ?? ""] as const)
    );
    // Declared tags that actually have operations, in declaration order, then
    // any undeclared tags (e.g. `Other`) in the order they were first seen.
    const orderedTags = [
      ...declared.filter((t) => opsByTag.has(t)),
      ...[...opsByTag.keys()].filter((t) => !declared.includes(t)),
    ];

    for (const tag of orderedTags) {
      this.w(`## ${tag}`);
      this.w("");
      const desc = tagDescriptions.get(tag);
      if (desc) {
        this.w(this.cleanBlock(desc));
        this.w("");
      }
      for (const located of opsByTag.get(tag) ?? []) {
        this.renderOperation(located);
      }
    }
  }

  private renderOperation({ path, method, op }: LocatedOperation): void {
    const heading = op.summary || op.operationId || `${method.toUpperCase()} ${path}`;
    this.w(`### ${heading}`);
    this.w("");
    this.w(`\`${method.toUpperCase()} ${path}\``);
    this.w("");
    if (op.description) {
      this.w(this.cleanBlock(op.description));
      this.w("");
    }

    this.renderParameters(op);
    this.renderRequestBody(op);
    this.renderResponses(op);
  }

  private renderParameters(op: OpenApiOperation): void {
    const params = (op.parameters ?? []).map((p) => this.resolveParameter(p));
    if (!params.length) return;
    this.w("**Parameters**");
    this.w("");
    this.w("| Name | In | Type | Required | Description |");
    this.w("|------|----|------|----------|-------------|");
    for (const p of params) {
      const type = this.typeName(p.schema);
      this.w(
        `| \`${p.name ?? ""}\` | ${p.in ?? ""} | \`${type}\` | ${p.required ? "Yes" : "No"} | ${cleanCell(p.description)} |`
      );
    }
    this.w("");
  }

  private renderRequestBody(op: OpenApiOperation): void {
    if (!op.requestBody) return;
    const content = op.requestBody.content ?? {};
    const contentType = Object.keys(content)[0];
    const schema = contentType ? content[contentType].schema : undefined;
    const refName = schema?.$ref ? this.refName(schema.$ref) : undefined;

    const ctLabel = contentType ? ` (\`${contentType}\`)` : "";
    const schemaLabel = refName ? `, schema \`${refName}\`` : "";
    this.w(`**Request body**${ctLabel}${schemaLabel}`);
    this.w("");

    if (schema) {
      if (refName) this.referenced.add(refName);
      if (!this.renderPropertiesTable(schema)) {
        this.w("_See schema above._");
        this.w("");
      }
    }
  }

  private renderResponses(op: OpenApiOperation): void {
    const responses = op.responses ?? {};
    if (!Object.keys(responses).length) return;
    this.w("**Responses**");
    this.w("");
    this.w("| Status | Description | Body |");
    this.w("|--------|-------------|------|");
    for (const [status, response] of Object.entries(responses)) {
      const r = this.resolveResponse(response);
      const content = r.content ?? {};
      const contentType = Object.keys(content)[0];
      const bodySchema = contentType ? content[contentType].schema : undefined;
      const body = bodySchema ? this.typeName(bodySchema) : "";
      this.w(`| ${status} | ${cleanCell(r.description)} | ${body ? "`" + body + "`" : ""} |`);
    }
    this.w("");
  }

  // -- Schemas appendix -----------------------------------------------------

  private renderSchemasAppendix(): void {
    this.w("## Schemas");
    this.w("");
    const rendered = new Set<string>();
    // A queue seeded with the schemas referenced while rendering operations.
    // Rendering a schema's properties may reference further schemas (added to
    // `this.referenced`), which we drain below so collection is transitive.
    const pending = [...this.referenced];
    while (pending.length) {
      const name = pending.shift();
      if (name === undefined) continue;
      if (rendered.has(name) || !this.schemas[name]) continue;
      rendered.add(name);
      const schema = this.schemas[name];
      this.w(`### ${name}`);
      this.w("");
      if (schema.description) {
        this.w(this.cleanBlock(schema.description));
        this.w("");
      }
      if (!this.renderPropertiesTable(schema)) {
        this.w(`Type: \`${this.typeName(schema)}\`.`);
        this.w("");
      }
      // Pick up any newly referenced schemas discovered while rendering above.
      for (const n of this.referenced) {
        if (!rendered.has(n) && !pending.includes(n)) pending.push(n);
      }
    }
  }

  // -- Property tables ------------------------------------------------------

  /**
   * Render a schema's merged properties as a `Field | Type | Required |
   * Description` table. Returns `false` (emitting nothing) when the schema has
   * no renderable properties, so callers can fall back to a note or type line.
   */
  private renderPropertiesTable(schema: OpenApiSchema): boolean {
    const { props, required } = this.collectProperties(schema);
    const names = Object.keys(props);
    if (!names.length) return false;
    this.w("| Field | Type | Required | Description |");
    this.w("|-------|------|----------|-------------|");
    for (const name of names) {
      const prop = props[name];
      let desc = cleanCell(prop.description);
      if (prop.enum) {
        const values = prop.enum.map((v) => `\`${String(v)}\``).join(", ");
        desc += (desc ? " " : "") + `(one of: ${values})`;
      }
      if (prop.default !== undefined) {
        desc += (desc ? " " : "") + `Default: \`${JSON.stringify(prop.default)}\`.`;
      }
      const required_ = required.includes(name) ? "Yes" : "No";
      this.w(`| \`${name}\` | \`${this.typeName(prop)}\` | ${required_} | ${desc} |`);
    }
    this.w("");
    return true;
  }

  /**
   * Merge `properties` and `required` across a schema's `allOf` members
   * (resolving each member's `$ref`) and then the schema's own
   * `properties`/`required`. Later members override earlier ones by name.
   */
  private collectProperties(schema: OpenApiSchema): {
    props: Record<string, OpenApiSchema>;
    required: string[];
  } {
    const resolved = this.resolveSchema(schema);
    let props: Record<string, OpenApiSchema> = {};
    let required: string[] = [];
    if (resolved.allOf) {
      for (const member of resolved.allOf) {
        const child = this.collectProperties(member);
        props = { ...props, ...child.props };
        required = required.concat(child.required);
      }
    }
    if (resolved.properties) props = { ...props, ...resolved.properties };
    if (resolved.required) required = required.concat(resolved.required);
    return { props, required };
  }

  // -- Type naming ----------------------------------------------------------

  /**
   * Produce the display type name for a schema, resolving `$ref`s and recording
   * every referenced schema name so it lands in the appendix.
   *
   * - `$ref` → the schema name (and record it).
   * - `array` → `array<` + item type + `>`.
   * - `allOf` → the `$ref` member names joined with ` & ` (each recorded), or
   *   `object` if none of the members are refs.
   * - otherwise the declared `type`, else `object` if it has properties, else
   *   `any`.
   */
  private typeName(schema: OpenApiSchema | undefined): string {
    if (!schema) return "any";
    if (schema.$ref) {
      const name = this.refName(schema.$ref);
      this.referenced.add(name);
      return name;
    }
    if (schema.type === "array") {
      return `array<${this.typeName(schema.items)}>`;
    }
    if (schema.allOf) {
      const names = schema.allOf
        .filter((member): member is Reference & OpenApiSchema => typeof member.$ref === "string")
        .map((member) => {
          const name = this.refName(member.$ref as string);
          this.referenced.add(name);
          return name;
        });
      return names.length ? names.join(" & ") : "object";
    }
    if (schema.type) return schema.type;
    if (schema.properties) return "object";
    return "any";
  }

  // -- Ref resolution -------------------------------------------------------

  /** The trailing segment of a `$ref` pointer, e.g. `.../schemas/Foo` → `Foo`. */
  private refName(ref: string): string {
    const last = ref.split("/").pop();
    return last ?? ref;
  }

  /** Resolve a possibly-`$ref` schema to the underlying schema object. */
  private resolveSchema(schema: OpenApiSchema): OpenApiSchema {
    if (schema.$ref) return this.schemas[this.refName(schema.$ref)] ?? {};
    return schema;
  }

  /** Resolve a possibly-`$ref` parameter against `components.parameters`. */
  private resolveParameter(param: OpenApiParameter): OpenApiParameter {
    if (param.$ref) {
      const components = this.spec.components?.parameters ?? {};
      return components[this.refName(param.$ref)] ?? {};
    }
    return param;
  }

  /** Resolve a possibly-`$ref` response against `components.responses`. */
  private resolveResponse(response: OpenApiResponse): OpenApiResponse {
    if (response.$ref) {
      const components = this.spec.components?.responses ?? {};
      return components[this.refName(response.$ref)] ?? {};
    }
    return response;
  }

  // -- Output + block-text helpers ------------------------------------------

  private w(line = ""): void {
    this.out.push(line);
  }

  /**
   * Lightly normalize a block of body text (paragraph context, not a table
   * cell): trim trailing whitespace but otherwise leave the Markdown intact, so
   * multi-line lists and paragraphs render normally outside tables.
   */
  private cleanBlock(text: unknown): string {
    return rewriteApiLinks(String(text ?? "")).trim();
  }
}

// ---------------------------------------------------------------------------
// Cell text cleaning (the error-list-in-cells fix)
// ---------------------------------------------------------------------------

/**
 * Clean a string for use inside a GFM table cell.
 *
 * Many OpenAPI descriptions are multi-line Markdown lists (e.g. an error-code
 * legend). Naively collapsing newlines to spaces turns these into an
 * unreadable run-on line. Instead:
 *
 * - If the text contains Markdown list items (lines starting with `- ` or
 *   `* `), each list item becomes `• <item>` and items are joined with `<br/>`
 *   (a self-closing line break, valid in MDX, that renders inside a table cell).
 *   Any leading non-list
 *   text is preserved on its own line before the bullets.
 * - Otherwise, whitespace and newlines collapse to single spaces, as before.
 *
 * In all cases, `|` is escaped as `\|` so cell content cannot break the table.
 * Backticks are left intact: cell content is parsed as inline Markdown, so
 * `` `code` `` still renders.
 */
export function cleanCell(text: unknown): string {
  const raw = rewriteApiLinks(String(text ?? ""));
  if (raw.trim() === "") return "";

  const lines = raw.split(/\r?\n/);
  const listItemPattern = /^\s*[-*]\s+(.*)$/;
  const hasList = lines.some((line) => listItemPattern.test(line));

  if (hasList) {
    const segments: string[] = [];
    let leading: string[] = [];
    for (const line of lines) {
      const match = listItemPattern.exec(line);
      if (match) {
        // Flush any accumulated leading prose as a single line before bullets.
        if (leading.length) {
          const text_ = leading.join(" ").replace(/\s+/g, " ").trim();
          if (text_) segments.push(text_);
          leading = [];
        }
        segments.push(`• ${match[1].trim()}`);
      } else if (line.trim() !== "") {
        leading.push(line);
      }
    }
    if (leading.length) {
      const text_ = leading.join(" ").replace(/\s+/g, " ").trim();
      if (text_) segments.push(text_);
    }
    return escapePipes(segments.join("<br/>"));
  }

  return escapePipes(raw.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim());
}

/** Escape `|` so cell content cannot break the surrounding GFM table. */
function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/**
 * Rewrite cross-reference links that point at API Reference pages, e.g.
 * `/api-reference/applications/get-app-parameters`, into in-document anchors,
 * e.g. `#get-app-parameters`, so they jump within the generated document instead
 * of out to the website. The link's last path segment is the kebab-cased endpoint
 * summary, which is the heading id Quire assigns (via rehype-slug). Links to other
 * (non-API-reference) pages are left untouched; the converter turns those into live
 * site URLs when run with `--base-url`.
 */
function rewriteApiLinks(text: string): string {
  return text.replace(
    /\]\(\/(?:[a-z]{2}\/)?api-reference\/[^)\s]*?\/([^)\s/#?]+)\)/g,
    (_match, slug: string) => `](#${slug})`,
  );
}
