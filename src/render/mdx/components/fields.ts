import type { ElementContent } from "hast";
import {
  element,
  text,
  getStringAttr,
  hasAttr,
  type ComponentHandler,
  type JsxComponentNode,
  type State,
} from "../hast-helpers.js";

/**
 * The API field component family: ParamField, ResponseField, and the
 * request/response example containers (RequestExample, ResponseExample).
 *
 * All four are real, author-placeable Mintlify components verified against the
 * official component docs (components/fields, components/responses,
 * components/examples). Nothing in this family was skipped.
 *
 * ParamField — name resolution:
 *   The parameter name is NOT a `name` prop; it is the VALUE of whichever
 *   location attribute is present. Mintlify uses one of `path` / `query` /
 *   `body` / `header`, and that attribute's value is the parameter name while
 *   the attribute itself names the location. So
 *   `<ParamField path="label" type="object">` is name "label", location "path".
 *   `LOCATION_ATTRS` is checked in a fixed order; the first present wins.
 *
 * ResponseField — name resolution:
 *   The name comes from a plain `name` attribute. Otherwise its meta
 *   (`type` / `required` / `default` / `deprecated`) matches ParamField, so it
 *   reuses the same `fieldBlock` helper parameterised by how the name is read.
 *   `pre` / `post` (string[] label arrays) are expression-valued props with no
 *   simple print analogue and are dropped.
 *
 * Recursion:
 *   ParamField is recursive. Nested `<ParamField>` (or `<Expandable>`) children
 *   appear inside `state.all(node)`, which is placed in `.param-body`. The
 *   `.param-body` left indent makes the nesting read as a hierarchy. No special
 *   recursion logic is needed: each nested field is just another handler call.
 *
 * Examples — print strategy:
 *   On the web, RequestExample / ResponseExample pin their code to a right-hand
 *   sidebar panel. Print has no side panel, so the children render inline under
 *   a bold label ("Request example" / "Response example") so the reader knows
 *   what the code block is. The `dropdown` prop (web language switcher) is
 *   dropped.
 *
 * Dropped props (project decision for print):
 * - ParamField: `placeholder` (form input hint, no print analogue).
 * - ResponseField: `pre`, `post` (label arrays; expression-valued, deferred).
 * - RequestExample / ResponseExample: `dropdown` (web language switcher).
 */

/** Location attributes for ParamField, in resolution order; first present wins. */
const LOCATION_ATTRS = ["path", "query", "body", "header"] as const;

/**
 * Read a ParamField's name and location from its location attribute.
 *
 * Returns the first present `path`/`query`/`body`/`header` attribute's value as
 * the name, plus the attribute key as the location. Returns `undefined` when no
 * location attribute is present (a malformed field).
 */
function resolveParamName(
  node: JsxComponentNode
): { name: string; location: string } | undefined {
  for (const location of LOCATION_ATTRS) {
    const name = getStringAttr(node, location);
    if (name !== undefined) return { name, location };
  }
  return undefined;
}

/**
 * Shared helper — render a "field block": the name + meta head line and a body.
 *
 * Output:
 *   <div class="param-field">
 *     <p class="param-head">
 *       <code class="param-name">{name}</code>
 *       <span class="param-type">{type}</span>            (when type)
 *       <span class="param-required">required</span>       (when required flag)
 *       <span class="param-deprecated">deprecated</span>   (when deprecated flag)
 *       <span class="param-default">default: {default}</span> (when default)
 *     </p>
 *     <div class="param-body">{children}</div>
 *   </div>
 *
 * Parameterised only by how the name is read: ParamField passes the resolved
 * location-attribute value; ResponseField passes its `name` attribute. The
 * meta line is identical for both.
 */
function fieldBlock(
  state: State,
  node: JsxComponentNode,
  name: string | undefined
): ElementContent {
  const head: ElementContent[] = [];
  // Separate consecutive head pieces with a literal space. The PDF spaces them
  // via CSS margin-left, but Pandoc drops that margin in Word, so without a real
  // space the inline pieces run together ("labelobject", "en_USstringrequired").
  // A literal space reads correctly in both formats.
  const pushPart = (part: ElementContent): void => {
    if (head.length > 0) head.push(text(" "));
    head.push(part);
  };

  if (name !== undefined) {
    pushPart(element("code", { class: "param-name" }, [text(name)]));
  }

  const type = getStringAttr(node, "type");
  if (type !== undefined) {
    pushPart(element("span", { class: "param-type" }, [text(type)]));
  }

  if (hasAttr(node, "required")) {
    pushPart(element("span", { class: "param-required" }, [text("required")]));
  }

  if (hasAttr(node, "deprecated")) {
    pushPart(
      element("span", { class: "param-deprecated" }, [text("deprecated")])
    );
  }

  const defaultValue = getStringAttr(node, "default");
  if (defaultValue !== undefined) {
    pushPart(
      element("span", { class: "param-default" }, [
        text(`default: ${defaultValue}`),
      ])
    );
  }

  const body = state.all(node);
  const children: ElementContent[] = [
    element("p", { class: "param-head" }, head),
  ];
  // Only emit the body when there is something to show. An empty .param-body
  // would still apply its 1em left indent and leave a stray gap.
  // Nested ParamFields land here via state.all and indent via .param-body.
  if (body.length > 0) {
    children.push(element("div", { class: "param-body" }, body));
  }

  return element("div", { class: "param-field" }, children);
}

/**
 * `<ParamField path|query|body|header="name" type="…" required>` — one API
 * parameter, recursively nestable.
 *
 * The name is the value of the first present location attribute; see
 * `resolveParamName`. When no location attribute is present, the head simply
 * omits the name (the field still renders its meta and body).
 *
 * Dropped props: `placeholder`.
 */
const paramFieldHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
) => {
  const resolved = resolveParamName(node);
  return fieldBlock(state, node, resolved?.name);
};

/**
 * `<ResponseField name="…" type="…">` — one API response value.
 *
 * Reuses `fieldBlock` with the name read from the `name` attribute. Dropped
 * props: `pre`, `post`.
 */
const responseFieldHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
) => fieldBlock(state, node, getStringAttr(node, "name"));

/**
 * Shared helper — render an example container inline under a label.
 *
 *   <div class="example">
 *     <p class="example-label">{label}</p>
 *     ...children...
 *   </div>
 */
function exampleBlock(
  state: State,
  node: JsxComponentNode,
  label: string
): ElementContent {
  return element("div", { class: "example" }, [
    element("p", { class: "example-label" }, [text(label)]),
    ...state.all(node),
  ]);
}

/**
 * `<RequestExample>` — code pinned to the right sidebar on the web. In print,
 * its children render inline under a "Request example" label. Dropped prop:
 * `dropdown`.
 */
const requestExampleHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
) => exampleBlock(state, node, "Request example");

/**
 * `<ResponseExample>` — like RequestExample, rendered inline under a
 * "Response example" label. Dropped prop: `dropdown`.
 */
const responseExampleHandler: ComponentHandler = (
  state: State,
  node: JsxComponentNode
) => exampleBlock(state, node, "Response example");

/** Registration object spread into the render core's component map. */
export const fieldsHandlers: Record<string, ComponentHandler> = {
  ParamField: paramFieldHandler,
  ResponseField: responseFieldHandler,
  RequestExample: requestExampleHandler,
  ResponseExample: responseExampleHandler,
};
