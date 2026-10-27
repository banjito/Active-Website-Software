import React, { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy as PdfDoc } from "pdfjs-dist";
import { loadPdfJs } from "@/lib/loadPdfJs";

interface PageSize {
  width: number;
  height: number;
}

/** What was double-clicked: the printed line, the word under the pointer, and
 * the page's top line (its header, which names the study). */
export interface PreviewClick {
  line: string;
  word: string;
  header: string;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** Find the printed line and word at a point, in PDF coordinates. */
function textAt(items: TextItem[], x: number, y: number): PreviewClick | null {
  const text = items.filter((it) => typeof it.str === "string" && it.str.trim());
  const bottom = (it: TextItem) => it.transform[5];
  const size = (it: TextItem) => it.height || Math.abs(it.transform[3]) || 10;
  const onLine = text.filter((it) => y >= bottom(it) - size(it) * 0.3 && y <= bottom(it) + size(it));
  if (!onLine.length) return null;
  const distance = (it: TextItem) => {
    const left = it.transform[4];
    return x < left ? left - x : x > left + it.width ? x - left - it.width : 0;
  };
  const hit = onLine.reduce((a, b) => (distance(b) < distance(a) ? b : a));
  const lineOf = (anchor: TextItem) =>
    text
      .filter((it) => Math.abs(bottom(it) - bottom(anchor)) < size(anchor) * 0.5)
      .sort((a, b) => a.transform[4] - b.transform[4])
      .map((it) => it.str)
      .join(" ")
      .replace(/\s+/g, " ");
  const top = text.reduce((a, b) => (bottom(b) > bottom(a) ? b : a));
  // Estimate which character was clicked, then widen to the whole word.
  const share = hit.width ? (x - hit.transform[4]) / hit.width : 0;
  const at = Math.max(0, Math.min(hit.str.length - 1, Math.floor(share * hit.str.length)));
  const before = hit.str.slice(0, at + 1).match(/[\p{L}\p{N}]*$/u)?.[0] ?? "";
  const after = hit.str.slice(at + 1).match(/^[\p{L}\p{N}]*/u)?.[0] ?? "";
  return { line: lineOf(hit), word: before + after, header: lineOf(top) };
}

/**
 * Draws one page when it scrolls near view. A new build is drawn off screen
 * and swapped in, so the old page stays put instead of flashing blank.
 */
function PreviewPage({ doc, pageNumber, size, width, onDoubleClickText }: {
  doc: PdfDoc;
  pageNumber: number;
  size: PageSize;
  width: number;
  onDoubleClickText?: (click: PreviewClick | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: "800px 0px",
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near || width <= 0) return;
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await doc.getPage(pageNumber);
      const scale = (width / page.getViewport({ scale: 1 }).width) * (window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale });
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.ceil(viewport.width);
      offscreen.height = Math.ceil(viewport.height);
      task = page.render({ canvasContext: offscreen.getContext("2d")!, viewport });
      await task.promise;
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      canvas.width = offscreen.width;
      canvas.height = offscreen.height;
      canvas.getContext("2d")!.drawImage(offscreen, 0, 0);
    })().catch(() => {
      // Cancelled by a newer build or a closed document; the next one redraws.
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, near, width]);

  const handleDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onDoubleClickText || !boxRef.current) return;
    e.preventDefault();
    const rect = boxRef.current.getBoundingClientRect();
    try {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const [x, y] = viewport.convertToPdfPoint(e.clientX - rect.left, e.clientY - rect.top);
      const content = await page.getTextContent();
      onDoubleClickText(textAt(content.items as TextItem[], x, y));
    } catch {
      onDoubleClickText(null);
    }
  };

  return (
    <div
      ref={boxRef}
      onDoubleClick={handleDoubleClick}
      title={onDoubleClickText ? "Double-click to find this in the code" : undefined}
      className="mx-auto bg-white shadow-[0_1px_3px_rgba(12,10,52,0.25)]"
      style={{ width, height: (width * size.height) / size.width }}
    >
      <canvas ref={canvasRef} aria-hidden className="block h-full w-full" />
    </div>
  );
}

/** Scrollable page-by-page view of a PDF that keeps its place across rebuilds. */
export default function PdfPreview({ pdf, onDoubleClickText }: {
  pdf: Uint8Array | null;
  onDoubleClickText?: (click: PreviewClick | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(Math.min(el.clientWidth - 32, 960)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf) return;
    let loaded: PdfDoc | null = null;
    let cancelled = false;
    (async () => {
      const pdfjs = await loadPdfJs();
      // pdf.js takes ownership of the bytes it is given, so hand it a copy.
      const opened = await pdfjs.getDocument({ data: pdf.slice() }).promise;
      if (cancelled) {
        opened.destroy();
        return;
      }
      loaded = opened;
      const nextSizes: PageSize[] = [];
      for (let i = 1; i <= opened.numPages; i++) {
        const { width: w, height: h } = (await opened.getPage(i)).getViewport({ scale: 1 });
        nextSizes.push({ width: w, height: h });
      }
      if (cancelled) return;
      setSizes(nextSizes);
      setDoc(opened);
    })().catch((error) => console.error("PDF preview failed:", error));
    return () => {
      cancelled = true;
      // Close the previous build once a newer one replaces it.
      const previous = loaded;
      if (previous) setTimeout(() => previous.destroy(), 2000);
    };
  }, [pdf]);

  return (
    <div ref={scrollRef} className="h-full overflow-auto bg-[#e7e5ef] py-4 dark:bg-[#07061f]">
      {doc && width > 0 && (
        <div className="flex flex-col gap-4">
          {sizes.map((size, i) => (
            <PreviewPage
              key={i}
              doc={doc}
              pageNumber={i + 1}
              size={size}
              width={width}
              onDoubleClickText={onDoubleClickText}
            />
          ))}
        </div>
      )}
    </div>
  );
}
