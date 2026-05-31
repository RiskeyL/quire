// Minimal ambient type declaration for pagedjs (0.4.3).
// pagedjs ships no bundled .d.ts; this stub satisfies tsc when app.ts imports
// from it. esbuild resolves the real ESM source at bundle time.
declare module "pagedjs" {
  export class Previewer {
    constructor(options?: Record<string, unknown>);
    preview(
      content: string | DocumentFragment | null | undefined,
      stylesheets: Array<string | Record<string, string>> | null | undefined,
      renderTo: Element | null | undefined,
    ): Promise<unknown>;
  }
}
