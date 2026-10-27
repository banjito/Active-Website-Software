// Runs the Typst compiler off the main thread, so typing stays smooth while a
// report builds. The page talks to it through typstClient.ts.
import { createTypstCompiler, CompileFormatEnum } from "@myriaddreamin/typst.ts/compiler";
import { loadFonts } from "@myriaddreamin/typst.ts/options.init";
import compilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url";
import type { TypstRequest, TypstResponse } from "./typstClient";

// Typed by hand: the DOM lib's `self` has the window postMessage signature.
const scope = self as unknown as {
  postMessage(message: TypstResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<TypstRequest>) => void) | null;
};

let compiler: ReturnType<typeof createTypstCompiler> | null = null;
let ready: Promise<void> | null = null;
// Last text sent for each file, so unchanged files aren't re-parsed.
const sent = new Map<string, string>();
// Pictures and PDFs, kept so a restarted compiler gets them back.
const files = new Map<string, Uint8Array>();

const start = (fontUrls: string[]) => {
  if (!ready) {
    const fresh = createTypstCompiler();
    sent.clear();
    // Only our own fonts: skips typst.ts's default set from a public CDN.
    ready = fresh
      .init({
        getModule: () => compilerWasmUrl,
        beforeBuild: [loadFonts(fontUrls, { assets: false })],
      })
      .then(() => {
        compiler = fresh;
        for (const [path, bytes] of files) fresh.mapShadow(path, bytes);
      });
  }
  return ready;
};

scope.onmessage = async ({ data: req }) => {
  try {
    if (req.kind === "file") {
      if (req.bytes) files.set(req.path, req.bytes);
      else files.delete(req.path);
    }
    await start(req.fontUrls);
    const c = compiler!;
    if (req.kind === "file") {
      if (req.bytes) c.mapShadow(req.path, req.bytes);
      else {
        try {
          c.unmapShadow(req.path);
        } catch {
          // A restarted compiler never had it.
        }
      }
      scope.postMessage({ id: req.id, ok: true });
      return;
    }
    for (const [path, text] of Object.entries(req.sources)) {
      if (sent.get(path) === text) continue;
      c.addSource(path, text);
      sent.set(path, text);
    }
    const { result, diagnostics } = await c.compile({
      mainFilePath: "/main.typ",
      format: CompileFormatEnum.pdf,
      diagnostics: "full",
      inputs: req.inputs,
    });
    // Copy before transferring, in case the bytes are a view of wasm memory.
    const pdf = result ? result.slice() : undefined;
    scope.postMessage(
      { id: req.id, ok: true, pdf, diagnostics: (diagnostics as any[]) ?? [] },
      pdf ? [pdf.buffer as ArrayBuffer] : [],
    );
  } catch (error) {
    // A crashed compiler can't be trusted; start a fresh one next time.
    ready = null;
    scope.postMessage({
      id: req.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
