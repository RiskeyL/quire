import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import { resolve, join, extname, relative, isAbsolute } from "node:path";

/**
 * Map file extensions to MIME types for common image formats.
 * Used when a local file has no better source for the MIME type,
 * or as a fallback for remote images that lack a Content-Type header.
 */
const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
};

/** Infer a MIME type from a file extension. Defaults to application/octet-stream. */
function mimeFromExt(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

/** Encode a Buffer as a data URI string. */
function toDataUri(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Embed all `<img src>` references in an HTML fragment as inline data URIs,
 * making the output self-contained and portable.
 *
 * Resolution rules for local paths:
 * - Root-relative paths (starting with `/`) are resolved against `opts.root`.
 * - All other relative paths (`./x`, `../x`, `x.png`) are resolved against
 *   `opts.baseDir` (the directory of the source page file).
 *
 * Remote images (http://, https://, //) are fetched unless `opts.offline` is
 * true, in which case they are skipped with a warning. Already-inline `data:`
 * URIs are left unchanged.
 *
 * Failures (missing local files, fetch errors, non-OK responses) emit a
 * warning via `opts.warn` and leave the original src unchanged — they never
 * crash the conversion.
 */
export async function embedImages(
  html: string,
  opts: {
    baseDir: string;
    root: string;
    offline: boolean;
    warn?: (message: string) => void;
  }
): Promise<string> {
  const warn = opts.warn ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const $ = cheerio.load(html, null, false);

  const tasks: Array<Promise<void>> = [];

  $("img[src]").each((_i, el) => {
    const src = $(el).attr("src") ?? "";

    // Already inline or empty — leave unchanged.
    if (src === "" || src.startsWith("data:")) return;

    tasks.push(
      (async () => {
        const isProtocolRelative = src.startsWith("//");
        const isRemote = /^https?:/i.test(src) || isProtocolRelative;

        if (isRemote) {
          if (opts.offline) {
            warn(`Skipped remote image (offline): ${src}`);
            return;
          }
          const url = isProtocolRelative ? `https:${src}` : src;
          try {
            // 15 s timeout so a stalled server cannot hang the run forever.
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) {
              warn(`Failed to fetch image (HTTP ${response.status}): ${src}`);
              return;
            }
            const arrayBuffer = await response.arrayBuffer();
            const buf = Buffer.from(arrayBuffer);
            const contentType = response.headers.get("content-type");
            // Use Content-Type header, stripping any parameters (e.g. "; charset=...").
            // For the extension fallback, strip query/fragment via URL.pathname so
            // e.g. https://host/img.png?v=2 correctly infers image/png.
            const urlPathname = new URL(url).pathname;
            const mime =
              (contentType ? contentType.split(";")[0].trim() : "") ||
              mimeFromExt(urlPathname) ||
              "application/octet-stream";
            $(el).attr("src", toDataUri(buf, mime));
          } catch (err) {
            warn(`Failed to fetch image: ${src} (${(err as Error).message})`);
          }
          return;
        }

        // Local path — root-relative vs baseDir-relative.
        let absPath: string;
        if (src.startsWith("/")) {
          // Strip the leading slash and resolve under root.
          absPath = resolve(join(opts.root, src.slice(1)));
          // Containment check: root-relative paths must not escape root.
          const rel = relative(resolve(opts.root), absPath);
          if (rel.startsWith("..") || isAbsolute(rel)) {
            warn(`Image path escapes root (skipped): ${src}`);
            return;
          }
        } else {
          absPath = resolve(opts.baseDir, src);
        }

        try {
          const buf = await readFile(absPath);
          const mime = mimeFromExt(absPath);
          $(el).attr("src", toDataUri(buf, mime));
        } catch {
          warn(`Image not found: ${absPath}`);
        }
      })()
    );
  });

  await Promise.all(tasks);

  return $.html();
}
