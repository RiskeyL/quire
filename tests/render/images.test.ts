import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as http from "node:http";
import { embedImages } from "../../src/render/images.js";

// Minimal valid-enough PNG header bytes for testing (not display-valid, but
// sufficient for a read-and-encode round-trip).
const FAKE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR length + type
]);

describe("embedImages", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "quire-images-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("embeds a local relative image as a data URI", async () => {
    await writeFile(join(dir, "pic.png"), FAKE_PNG);
    const html = `<img src="pic.png">`;
    const result = await embedImages(html, { baseDir: dir, root: dir, offline: false });
    const expected = `data:image/png;base64,${FAKE_PNG.toString("base64")}`;
    expect(result).toContain(expected);
  });

  it("resolves ../ relative paths against baseDir", async () => {
    const subDir = join(dir, "sub");
    await mkdir(subDir, { recursive: true });
    // pic.png already written in dir above
    const html = `<img src="../pic.png">`;
    const result = await embedImages(html, { baseDir: subDir, root: dir, offline: false });
    const expected = `data:image/png;base64,${FAKE_PNG.toString("base64")}`;
    expect(result).toContain(expected);
  });

  it("resolves root-relative /assets/pic.png against root", async () => {
    const assetsDir = join(dir, "assets");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, "pic.png"), FAKE_PNG);
    const html = `<img src="/assets/pic.png">`;
    const result = await embedImages(html, { baseDir: dir, root: dir, offline: false });
    const expected = `data:image/png;base64,${FAKE_PNG.toString("base64")}`;
    expect(result).toContain(expected);
  });

  it("leaves src unchanged and emits a warning when local file is missing", async () => {
    const warnings: string[] = [];
    const html = `<img src="missing.png">`;
    const result = await embedImages(html, {
      baseDir: dir,
      root: dir,
      offline: false,
      warn: (msg) => warnings.push(msg),
    });
    expect(result).toContain(`src="missing.png"`);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/missing\.png/);
  });

  it("leaves an already-inline data: URI unchanged without warning", async () => {
    const warnings: string[] = [];
    const dataUri = "data:image/png;base64,abc123";
    const html = `<img src="${dataUri}">`;
    const result = await embedImages(html, {
      baseDir: dir,
      root: dir,
      offline: false,
      warn: (msg) => warnings.push(msg),
    });
    expect(result).toContain(dataUri);
    expect(warnings.length).toBe(0);
  });

  it("uses image/svg+xml mime type for .svg files", async () => {
    const svgContent = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    await writeFile(join(dir, "icon.svg"), svgContent);
    const html = `<img src="icon.svg">`;
    const result = await embedImages(html, { baseDir: dir, root: dir, offline: false });
    expect(result).toContain(`data:image/svg+xml;base64,`);
    expect(result).toContain(svgContent.toString("base64"));
  });

  it("does not fetch remote images when offline is true and emits a warning", async () => {
    const warnings: string[] = [];
    // Use a port that would refuse connections — but with offline mode we
    // must never attempt it.  We simply assert src is unchanged and warned.
    const src = "http://127.0.0.1:1/unreachable.png";
    const html = `<img src="${src}">`;
    const result = await embedImages(html, {
      baseDir: dir,
      root: dir,
      offline: true,
      warn: (msg) => warnings.push(msg),
    });
    expect(result).toContain(`src="${src}"`);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/offline/i);
    expect(warnings[0]).toContain(src);
  });

  it("fetches a remote image and embeds it as a data URI", async () => {
    // Spin up a local HTTP server to serve FAKE_PNG bytes.
    let serverPort: number;
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(FAKE_PNG);
    });

    try {
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });
      serverPort = (server.address() as http.AddressInfo).port;

      const src = `http://127.0.0.1:${serverPort}/image.png`;
      const html = `<img src="${src}">`;
      const result = await embedImages(html, { baseDir: dir, root: dir, offline: false });
      const expected = `data:image/png;base64,${FAKE_PNG.toString("base64")}`;
      expect(result).toContain(expected);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it("leaves src unchanged and emits a warning when a remote server returns 404", async () => {
    const warnings: string[] = [];
    const server = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end("Not Found");
    });

    try {
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });
      const port = (server.address() as http.AddressInfo).port;
      const src = `http://127.0.0.1:${port}/nope.png`;
      const html = `<img src="${src}">`;
      const result = await embedImages(html, {
        baseDir: dir,
        root: dir,
        offline: false,
        warn: (msg) => warnings.push(msg),
      });
      expect(result).toContain(`src="${src}"`);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain(src);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it("leaves src unchanged and emits a warning when fetch fails (unreachable port)", async () => {
    const warnings: string[] = [];
    // Pick an almost-certainly-closed port. The connection will be refused.
    const src = "http://127.0.0.1:1/image.png";
    const html = `<img src="${src}">`;
    const result = await embedImages(html, {
      baseDir: dir,
      root: dir,
      offline: false,
      warn: (msg) => warnings.push(msg),
    });
    expect(result).toContain(`src="${src}"`);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain(src);
  });

  it("leaves a protocol-relative src unchanged and warns when offline (no network call)", async () => {
    const warnings: string[] = [];
    const src = "//cdn.example.com/img.png";
    const html = `<img src="${src}">`;
    const result = await embedImages(html, {
      baseDir: dir,
      root: dir,
      offline: true,
      warn: (msg) => warnings.push(msg),
    });
    expect(result).toContain(`src="${src}"`);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/offline/i);
    expect(warnings[0]).toContain(src);
  });

  it("leaves src unchanged and warns when a root-relative path escapes root", async () => {
    const warnings: string[] = [];
    // /../../etc/passwd resolves outside root (the tmp dir).
    const src = "/../../etc/passwd";
    const html = `<img src="${src}">`;
    const result = await embedImages(html, {
      baseDir: dir,
      root: dir,
      offline: false,
      warn: (msg) => warnings.push(msg),
    });
    expect(result).toContain(`src="${src}"`);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/escapes root/i);
    expect(warnings[0]).toContain(src);
  });
});
