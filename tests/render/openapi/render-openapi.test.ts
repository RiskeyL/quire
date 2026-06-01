import { describe, it, expect } from "vitest";
import { renderOpenApiMarkdown } from "../../../src/render/openapi/render-openapi.js";
import type { OpenApiSpec } from "../../../src/render/openapi/render-openapi.js";

/** Index of a `## `/`### ` heading line in the rendered output (line-by-line). */
function headingLines(md: string, prefix: string): string[] {
  return md
    .split("\n")
    .filter((l) => l.startsWith(prefix))
    .map((l) => l.slice(prefix.length));
}

describe("renderOpenApiMarkdown", () => {
  it("emits YAML frontmatter only when a title is given", () => {
    const spec: OpenApiSpec = { paths: {} };
    const withTitle = renderOpenApiMarkdown(spec, { title: "Chat API" });
    expect(withTitle.startsWith("---\ntitle: Chat API\n---\n\n")).toBe(true);

    const withoutTitle = renderOpenApiMarkdown(spec);
    expect(withoutTitle.startsWith("---")).toBe(false);
  });

  it("emits the info description and base URL intro", () => {
    const spec: OpenApiSpec = {
      info: { description: "The chat completion API." },
      servers: [{ url: "https://api.example.com/v1" }],
      paths: {},
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("The chat completion API.");
    expect(md).toContain("Base URL: `https://api.example.com/v1`");
  });

  it("orders tags by declaration order, then first-seen undeclared tags", () => {
    const spec: OpenApiSpec = {
      tags: [{ name: "Beta" }, { name: "Alpha" }],
      paths: {
        "/z": { get: { tags: ["Gamma"], responses: {} } },
        "/a": { get: { tags: ["Alpha"], responses: {} } },
        "/b": { get: { tags: ["Beta"], responses: {} } },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    // Declared order (Beta, Alpha) first, then undeclared Gamma (first seen).
    expect(headingLines(md, "## ")).toEqual(["Beta", "Alpha", "Gamma", "Schemas"]);
  });

  it("renders a tag description after the section heading", () => {
    const spec: OpenApiSpec = {
      tags: [{ name: "Chats", description: "Send and stream messages." }],
      paths: { "/chat": { post: { tags: ["Chats"], responses: {} } } },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("## Chats\n\nSend and stream messages.");
  });

  it("groups untagged operations under an Other tag", () => {
    const spec: OpenApiSpec = {
      paths: { "/ping": { get: { summary: "Ping", responses: {} } } },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(headingLines(md, "## ")).toEqual(["Other", "Schemas"]);
  });

  it("works when the spec has no top-level tags array", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/a": { get: { tags: ["X"], summary: "Get A", responses: {} } },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(headingLines(md, "## ")).toEqual(["X", "Schemas"]);
  });

  it("orders operations by path order then method order", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/first": {
          // Declared post-before-get; output must still be get then post.
          post: { tags: ["T"], summary: "First POST", responses: {} },
          get: { tags: ["T"], summary: "First GET", responses: {} },
        },
        "/second": { delete: { tags: ["T"], summary: "Second DELETE", responses: {} } },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(headingLines(md, "### ")).toEqual(["First GET", "First POST", "Second DELETE"]);
  });

  it("uses summary, then operationId, then METHOD /path for the operation heading", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/a": { get: { tags: ["T"], summary: "Summary A", responses: {} } },
        "/b": { get: { tags: ["T"], operationId: "opB", responses: {} } },
        "/c": { get: { tags: ["T"], responses: {} } },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(headingLines(md, "### ")).toEqual(["Summary A", "opB", "GET /c"]);
  });

  it("emits the method/path code line and operation description", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/chat": {
          post: { tags: ["T"], summary: "Send", description: "Send a message.", responses: {} },
        },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("`POST /chat`");
    expect(md).toContain("Send a message.");
  });

  it("renders a parameters table with the expected columns", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/users/{id}": {
          get: {
            tags: ["T"],
            summary: "Get user",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
                description: "The user id.",
              },
            ],
            responses: {},
          },
        },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("**Parameters**");
    expect(md).toContain("| Name | In | Type | Required | Description |");
    expect(md).toContain("| `id` | path | `string` | Yes | The user id. |");
  });

  it("resolves a $ref parameter to its target", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/x": {
          get: {
            tags: ["T"],
            summary: "X",
            parameters: [{ $ref: "#/components/parameters/PageParam" }],
            responses: {},
          },
        },
      },
      components: {
        parameters: {
          PageParam: { name: "page", in: "query", schema: { type: "integer" } },
        },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("| `page` | query | `integer` | No |  |");
  });

  it("labels a $ref request body with its schema name and renders its properties", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/chat": {
          post: {
            tags: ["T"],
            summary: "Send",
            requestBody: {
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChatRequest" } } },
            },
            responses: {},
          },
        },
      },
      components: {
        schemas: {
          ChatRequest: {
            type: "object",
            required: ["query"],
            properties: {
              query: { type: "string", description: "The user query." },
              stream: { type: "boolean", default: false },
            },
          },
        },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("**Request body** (`application/json`), schema `ChatRequest`");
    expect(md).toContain("| Field | Type | Required | Description |");
    expect(md).toContain("| `query` | `string` | Yes | The user query. |");
    expect(md).toContain("| `stream` | `boolean` | No | Default: `false`. |");
    // ChatRequest was referenced, so it lands in the appendix.
    expect(headingLines(md, "### ")).toContain("ChatRequest");
  });

  it("renders an inline request body and emits the schema-above note when it has no properties", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/upload": {
          post: {
            tags: ["T"],
            summary: "Upload",
            requestBody: {
              content: { "multipart/form-data": { schema: { type: "object" } } },
            },
            responses: {},
          },
        },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    // Inline schema (no $ref) => no "schema `Name`" suffix.
    expect(md).toContain("**Request body** (`multipart/form-data`)\n");
    expect(md).not.toContain("schema `");
    expect(md).toContain("_See schema above._");
  });

  it("renders a responses table with status, description, and body type", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/chat": {
          post: {
            tags: ["T"],
            summary: "Send",
            responses: {
              "200": {
                description: "OK",
                content: { "application/json": { schema: { $ref: "#/components/schemas/ChatResponse" } } },
              },
              "404": { description: "Not found" },
            },
          },
        },
      },
      components: {
        schemas: { ChatResponse: { type: "object", properties: { answer: { type: "string" } } } },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("**Responses**");
    expect(md).toContain("| Status | Description | Body |");
    expect(md).toContain("| 200 | OK | `ChatResponse` |");
    expect(md).toContain("| 404 | Not found |  |");
  });

  it("names array and enum types correctly in property tables", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/x": {
          get: {
            tags: ["T"],
            summary: "X",
            requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Holder" } } } },
            responses: {},
          },
        },
      },
      components: {
        schemas: {
          Holder: {
            type: "object",
            properties: {
              tags: { type: "array", items: { type: "string" } },
              items: { type: "array", items: { $ref: "#/components/schemas/Item" } },
              mode: { type: "string", enum: ["blocking", "streaming"], description: "Response mode." },
            },
          },
          Item: { type: "object", properties: { id: { type: "string" } } },
        },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("| `tags` | `array<string>` | No |  |");
    expect(md).toContain("| `items` | `array<Item>` | No |  |");
    expect(md).toContain("| `mode` | `string` | No | Response mode. (one of: `blocking`, `streaming`) |");
    // Item was referenced transitively via array items => appendix.
    expect(headingLines(md, "### ")).toContain("Item");
  });

  it("merges properties and required across allOf members", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/x": {
          get: {
            tags: ["T"],
            summary: "X",
            requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Derived" } } } },
            responses: {},
          },
        },
      },
      components: {
        schemas: {
          Base: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
          Derived: {
            allOf: [
              { $ref: "#/components/schemas/Base" },
              { type: "object", required: ["name"], properties: { name: { type: "string" } } },
            ],
          },
        },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    // Both inherited and own fields appear, with merged required flags.
    expect(md).toContain("| `id` | `string` | Yes |  |");
    expect(md).toContain("| `name` | `string` | Yes |  |");
  });

  it("names an allOf type as the joined ref members", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/x": {
          get: {
            tags: ["T"],
            summary: "X",
            requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Wrapper" } } } },
            responses: {},
          },
        },
      },
      components: {
        schemas: {
          A: { type: "object", properties: { a: { type: "string" } } },
          B: { type: "object", properties: { b: { type: "string" } } },
          Wrapper: {
            type: "object",
            properties: { combo: { allOf: [{ $ref: "#/components/schemas/A" }, { $ref: "#/components/schemas/B" }] } },
          },
        },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("| `combo` | `A & B` | No |  |");
    expect(headingLines(md, "### ")).toContain("A");
    expect(headingLines(md, "### ")).toContain("B");
  });

  it("collects transitively referenced schemas into the appendix without duplicates", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/x": {
          get: {
            tags: ["T"],
            summary: "X",
            requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Outer" } } } },
            responses: {},
          },
        },
      },
      components: {
        schemas: {
          Outer: { type: "object", properties: { inner: { $ref: "#/components/schemas/Inner" }, alsoInner: { $ref: "#/components/schemas/Inner" } } },
          Inner: { type: "object", properties: { deep: { $ref: "#/components/schemas/Deep" } } },
          Deep: { type: "object", properties: { value: { type: "string" } } },
          Unused: { type: "object", properties: { x: { type: "string" } } },
        },
      },
    };
    const md = renderOpenApiMarkdown(spec);
    const schemaHeadings = headingLines(md, "### ");
    // Outer, Inner, Deep all collected; Inner only once despite two refs.
    expect(schemaHeadings).toContain("Outer");
    expect(schemaHeadings).toContain("Inner");
    expect(schemaHeadings).toContain("Deep");
    expect(schemaHeadings.filter((h) => h === "Inner")).toHaveLength(1);
    // Unused is never referenced and must not appear.
    expect(schemaHeadings).not.toContain("Unused");
  });

  it("emits a Type line for a schema with no properties", () => {
    const spec: OpenApiSpec = {
      paths: {
        "/x": {
          get: {
            tags: ["T"],
            summary: "X",
            responses: {
              "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Token" } } } },
            },
          },
        },
      },
      components: { schemas: { Token: { type: "string" } } },
    };
    const md = renderOpenApiMarkdown(spec);
    expect(md).toContain("### Token\n\nType: `string`.");
  });

  describe("cleanCell (the error-list-in-cells fix)", () => {
    it("renders a multi-line Markdown list as <br/>-joined bullets", () => {
      const spec: OpenApiSpec = {
        paths: {
          "/x": {
            post: {
              tags: ["T"],
              summary: "X",
              responses: {
                "400": {
                  description:
                    "- `app_unavailable` : App unavailable or misconfigured.\n- `not_chat_app` : App mode does not match the API route.",
                },
              },
            },
          },
        },
      };
      const md = renderOpenApiMarkdown(spec);
      // Bullets are joined with <br/>, not collapsed to a run-on line.
      expect(md).toContain(
        "| 400 | • `app_unavailable` : App unavailable or misconfigured.<br/>• `not_chat_app` : App mode does not match the API route. |  |"
      );
    });

    it("keeps leading non-list text on its own line before the bullets", () => {
      const spec: OpenApiSpec = {
        paths: {
          "/x": {
            post: {
              tags: ["T"],
              summary: "X",
              responses: {
                "400": {
                  description: "Bad request. Possible causes:\n- `a` : first\n- `b` : second",
                },
              },
            },
          },
        },
      };
      const md = renderOpenApiMarkdown(spec);
      expect(md).toContain("Bad request. Possible causes:<br/>• `a` : first<br/>• `b` : second");
    });

    it("collapses a single-line multi-line (non-list) description to one line", () => {
      const spec: OpenApiSpec = {
        paths: {
          "/x": {
            post: {
              tags: ["T"],
              summary: "X",
              responses: { "200": { description: "Returns the result\nover several\nlines." } },
            },
          },
        },
      };
      const md = renderOpenApiMarkdown(spec);
      expect(md).toContain("| 200 | Returns the result over several lines. |  |");
      expect(md).not.toContain("<br/>");
    });

    it("escapes pipe characters in cell text so they cannot break the table", () => {
      const spec: OpenApiSpec = {
        paths: {
          "/x": {
            post: {
              tags: ["T"],
              summary: "X",
              responses: { "200": { description: "a | b | c" } },
            },
          },
        },
      };
      const md = renderOpenApiMarkdown(spec);
      expect(md).toContain("| 200 | a \\| b \\| c |  |");
    });
  });

  it("renders a small realistic spec end to end", () => {
    const spec: OpenApiSpec = {
      info: { title: "Demo API", description: "A tiny demo." },
      servers: [{ url: "https://api.demo.test/v1" }],
      tags: [
        { name: "Chats", description: "Conversation endpoints." },
        { name: "Files", description: "File endpoints." },
      ],
      paths: {
        "/chat-messages": {
          post: {
            tags: ["Chats"],
            summary: "Send chat message",
            description: "Create a chat completion.",
            requestBody: {
              required: true,
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChatRequest" } } },
            },
            responses: {
              "200": {
                description: "Success",
                content: { "application/json": { schema: { $ref: "#/components/schemas/ChatResponse" } } },
              },
              "400": {
                description: "- `invalid_param` : A parameter is invalid.\n- `app_unavailable` : The app is unavailable.",
              },
            },
          },
        },
        "/files/upload": {
          post: {
            tags: ["Files"],
            summary: "Upload file",
            requestBody: {
              content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string" } } } } },
            },
            responses: { "201": { description: "Created" } },
          },
        },
      },
      components: {
        schemas: {
          ChatRequest: {
            type: "object",
            required: ["query"],
            properties: {
              query: { type: "string", description: "User input." },
              response_mode: { type: "string", enum: ["streaming", "blocking"], default: "streaming" },
              files: { type: "array", items: { $ref: "#/components/schemas/FileInput" } },
            },
          },
          ChatResponse: {
            type: "object",
            properties: { answer: { type: "string", description: "The model answer." } },
          },
          FileInput: {
            type: "object",
            properties: { type: { type: "string" }, url: { type: "string" } },
          },
        },
      },
    };

    const md = renderOpenApiMarkdown(spec, { title: "Demo API" });

    // Frontmatter + intro.
    expect(md.startsWith("---\ntitle: Demo API\n---\n\n")).toBe(true);
    expect(md).toContain("A tiny demo.");
    expect(md).toContain("Base URL: `https://api.demo.test/v1`");
    // Tag sections in declared order.
    expect(headingLines(md, "## ")).toEqual(["Chats", "Files", "Schemas"]);
    // Operations.
    expect(headingLines(md, "### ")).toEqual(
      expect.arrayContaining(["Send chat message", "Upload file", "ChatRequest", "ChatResponse", "FileInput"])
    );
    // The error list in the 400 cell is bulletized.
    expect(md).toContain("• `invalid_param` : A parameter is invalid.<br/>• `app_unavailable` : The app is unavailable.");
    // Transitive schema collection (FileInput via array items).
    expect(headingLines(md, "### ")).toContain("FileInput");
    // Enum + default rendering in the request schema appendix.
    expect(md).toContain("(one of: `streaming`, `blocking`)");
    expect(md).toContain("Default: `\"streaming\"`.");
  });
});
