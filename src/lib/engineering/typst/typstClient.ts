// Main-thread side of the Typst compiler worker (typst.worker.ts). One worker
// is shared by every report editor and starts on first use; its wasm engine is
// large, so nothing loads until the report builder opens.

export interface TypstDiagnostic {
  path: string;
  severity: string;
  /** "line:col-line:col", counted from 0. */
  range: string;
  message: string;
}

export type TypstRequest = { id: number; fontUrls: string[] } & (
  | { kind: "file"; path: string; bytes: Uint8Array | null }
  | { kind: "compile"; sources: Record<string, string>; inputs: Record<string, string> }
);

export type TypstResponse =
  | { id: number; ok: true; pdf?: Uint8Array; diagnostics?: TypstDiagnostic[] }
  | { id: number; ok: false; error: string };

/** Helvetica can't be shipped; Arimo has the same shapes and widths. */
const FONT_FILES = ["Arimo-Regular.ttf", "Arimo-Bold.ttf", "Arimo-Italic.ttf", "Arimo-BoldItalic.ttf"];

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (response: TypstResponse) => void>();

const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL("./typst.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<TypstResponse>) => {
      pending.get(data.id)?.(data);
      pending.delete(data.id);
    };
    worker.onerror = (event) => {
      for (const [id, settle] of pending) settle({ id, ok: false, error: event.message || "PDF engine failed to load" });
      pending.clear();
      worker = null;
    };
  }
  return worker;
};

type RequestBody =
  | { kind: "file"; path: string; bytes: Uint8Array | null }
  | { kind: "compile"; sources: Record<string, string>; inputs: Record<string, string> };

const send = (body: RequestBody, transfer: Transferable[] = []) =>
  new Promise<TypstResponse>((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    const fontUrls = FONT_FILES.map((f) => new URL(`/fonts/typst/${f}`, window.location.origin).href);
    getWorker().postMessage({ id, fontUrls, ...body } satisfies TypstRequest, transfer);
  });

/**
 * Put a binary file (picture, SKM PDF) where the template can read it, or
 * remove it with `bytes: null`. The bytes are handed to the worker, so don't
 * use them afterwards.
 */
export async function setTypstFile(path: string, bytes: Uint8Array | null) {
  const res = await send({ kind: "file", path, bytes }, bytes ? [bytes.buffer as ArrayBuffer] : []);
  if (!res.ok) throw new Error(res.error);
}

/** Build the PDF. `pdf` is missing when the template has errors. */
export async function compileTypstPdf(
  sources: Record<string, string>,
  inputs: Record<string, string>,
): Promise<{ pdf: Uint8Array | null; diagnostics: TypstDiagnostic[] }> {
  const res = await send({ kind: "compile", sources, inputs });
  if (!res.ok) throw new Error(res.error);
  return { pdf: res.pdf ?? null, diagnostics: res.diagnostics ?? [] };
}
