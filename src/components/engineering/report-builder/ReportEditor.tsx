import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  Save,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  templateFields,
  templatePdfSlots,
  type ReportTemplate,
} from "@/lib/engineering/typst/templates";
import { isMissingTable, jobFieldValues, STORAGE_NOT_SET_UP } from "@/lib/engineering/reportStore";
import { measurePdfMargins } from "@/lib/engineering/typst/pdfMargins";
import {
  compileTypstPdf,
  setTypstFile,
  type TypstDiagnostic,
} from "@/lib/engineering/typst/typstClient";
import { ce } from "../engineeringTheme";
import PdfPreview, { type PreviewClick } from "./PdfPreview";

const FIRST_FILES = ["/main.typ", "/project.typ", "/style.typ"];
// Typst wants Helvetica first and falls back to Arimo; that's expected here.
const IGNORED_WARNING = /unknown font family/i;

const sameRecord = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

/** "range" is "line:col-line:col" counted from 0. */
const diagnosticLine = (d: TypstDiagnostic) => (parseInt(d.range, 10) || 0) + 1;
const normalizePath = (path: string) => (path.startsWith("/") ? path : `/${path}`);
const fileLabel = (path: string) => path.replace(/^\//, "");

const tokenize = (text: string) =>
  [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    word: m[0].toLowerCase(),
    start: m.index!,
    end: m.index! + m[0].length,
  }));

/**
 * Find double-clicked preview text in the code. Typst in the browser has no
 * click-to-code map (Overleaf's SyncTeX), so this looks for the longest run
 * of the clicked line's words in the files, favoring runs with the clicked
 * word. Text from job fields or uploaded PDFs usually isn't in the code.
 */
function locateText(sources: Record<string, string>, click: PreviewClick) {
  // The same paragraph appears in several studies, so prefer the file of the
  // study named in the page header: #study("Title")[#include "file.typ"].
  const studyFile = [...(sources["/main.typ"] ?? "").matchAll(/study\(\s*"([^"]+)"[^\]]*#include\s+"([^"]+)"/g)]
    .find((m) => click.header.startsWith(m[1]))?.[2];
  const preferred = studyFile ? normalizePath(studyFile) : null;
  const line = tokenize(click.line).map((t) => t.word);
  const clicked = line.indexOf(click.word.toLowerCase());
  let best: { score: number; length: number; path: string; start: number; end: number } | null = null;
  for (const [path, text] of Object.entries(sources)) {
    const tokens = tokenize(text);
    for (let i = 0; i < tokens.length; i++) {
      for (let j = 0; j < line.length; j++) {
        if (tokens[i].word !== line[j]) continue;
        if (i > 0 && j > 0 && tokens[i - 1].word === line[j - 1]) continue; // middle of a run
        let length = 0;
        while (i + length < tokens.length && j + length < line.length && tokens[i + length].word === line[j + length]) length++;
        const score =
          length + (clicked >= j && clicked < j + length ? 2 : 0) + (path === preferred ? 0.5 : 0);
        if (!best || score > best.score) {
          best = { score, length, path, start: tokens[i].start, end: tokens[i + length - 1].end };
        }
      }
    }
  }
  // One matching word is only trusted when it's the long word that was clicked.
  if (!best || (best.length < 2 && !(best.score >= 3 && click.word.length >= 5))) return null;
  return best;
}

/** How far down a textarea a character sits, measured with an invisible copy. */
function offsetTop(el: HTMLTextAreaElement, offset: number) {
  const style = getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const prop of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordSpacing", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const) {
    mirror.style[prop] = style[prop];
  }
  Object.assign(mirror.style, {
    position: "absolute",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    boxSizing: "border-box",
    width: `${el.clientWidth}px`,
  });
  mirror.textContent = el.value.slice(0, offset);
  document.body.appendChild(mirror);
  const top = mirror.scrollHeight;
  mirror.remove();
  return top;
}

interface JobOption {
  id: string;
  label: string;
  fields: Record<string, string>;
}

export interface Saved {
  name: string;
  sources: Record<string, string>;
  values: Record<string, string>;
}

interface ReportEditorProps {
  /** Small label above the name: "Template" or "Report". */
  kind: string;
  name: string;
  /** Show the name as a text box so it can be renamed. */
  nameEditable?: boolean;
  /** The bundled template that supplies pictures and field labels. */
  base: ReportTemplate;
  /** The files and field values as last saved. */
  sources: Record<string, string>;
  values?: Record<string, string>;
  /** Offer "Fill fields from a job", to preview a template with real data. */
  jobPicker?: boolean;
  /** Field values are part of what's saved (reports), not just a preview (templates). */
  saveValues?: boolean;
  /** Save button: stores the current state; resolve false if nothing was saved. */
  onSave?: (saved: Saved) => Promise<void | false>;
  saveLabel?: string;
  /** Save even with no changes (e.g. "Save as new template" on a built-in one). */
  saveWhenClean?: boolean;
  onBack?: () => void;
  backLabel?: string;
  /** More header buttons, e.g. Delete. */
  actions?: React.ReactNode;
}

interface UploadedPdf {
  name: string;
  pages: number;
  /** Blank border, "left,right,top,bottom" (see measurePdfMargins). */
  margins: string;
}

/**
 * Typst report editor: template files on the left, the file being edited in
 * the middle, the built PDF on the right. Job fields and SKM PDFs feed the
 * template; the PDF rebuilds a moment after each change. Remount it (key) to
 * open something else.
 */
export default function ReportEditor({
  kind,
  name: initialName,
  nameEditable = false,
  base,
  sources: initialSources,
  values: initialValues = {},
  jobPicker = false,
  saveValues = true,
  onSave,
  saveLabel = "Save",
  saveWhenClean = false,
  onBack,
  backLabel = "Back",
  actions,
}: ReportEditorProps) {
  const [saved, setSaved] = useState<Saved>(() => ({
    name: initialName,
    sources: initialSources,
    values: initialValues,
  }));
  const [name, setName] = useState(initialName);
  const [sources, setSources] = useState<Record<string, string>>(() => ({ ...initialSources }));
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...initialValues }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState("/main.typ");
  const [cursorLine, setCursorLine] = useState(1);
  const [uploads, setUploads] = useState<Record<string, UploadedPdf>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [assetsReady, setAssetsReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [diagnostics, setDiagnostics] = useState<TypstDiagnostic[]>([]);
  const [building, setBuilding] = useState(false);
  const [buildSeconds, setBuildSeconds] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const dirty =
    name.trim() !== saved.name ||
    !sameRecord(sources, saved.sources) ||
    (saveValues && !sameRecord(values, saved.values));

  const fields = useMemo(() => templateFields(sources["/project.typ"] ?? ""), [sources]);
  const pdfSlots = useMemo(() => templatePdfSlots(sources), [sources]);
  const files = useMemo(
    () =>
      Object.keys(sources).sort((a, b) => {
        const ia = FIRST_FILES.indexOf(a);
        const ib = FIRST_FILES.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.localeCompare(b);
      }),
    [sources],
  );

  // A field left untouched uses the template's sample; "" prints blank.
  const inputs = useMemo(() => {
    const next: Record<string, string> = { ...values };
    for (const [path, upload] of Object.entries(uploads)) {
      next[`pages:${path}`] = String(upload.pages);
      next[`margins:${path}`] = upload.margins;
    }
    return next;
  }, [values, uploads]);

  const errors = diagnostics.filter((d) => /error/i.test(d.severity));
  const warnings = diagnostics.filter(
    (d) => !/error/i.test(d.severity) && !IGNORED_WARNING.test(d.message),
  );

  // Hand the template's pictures to the compiler; this also starts it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all(
        Object.entries(base.assets).map(async ([path, url]) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Couldn't load ${fileLabel(path)}`);
          await setTypstFile(path, new Uint8Array(await res.arrayBuffer()));
        }),
      );
      if (!cancelled) setAssetsReady(true);
    })().catch((error) => {
      console.error("Report builder failed to start:", error);
      if (!cancelled) setEngineError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Engineering jobs for "Fill fields from a job".
  useEffect(() => {
    if (!jobPicker) return;
    (async () => {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("id, job_number, title, location, site_address, customer_id")
        .eq("division", "engineering")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data || [];
      const customerIds = [...new Set(rows.map((j) => j.customer_id).filter(Boolean))];
      const customers = customerIds.length
        ? await supabase
            .schema("common")
            .from("customers")
            .select("id, name, company_name")
            .in("id", customerIds)
        : { data: [], error: null };
      if (customers.error) console.warn("Error loading customers:", customers.error);
      const customerName = new Map(
        (customers.data || []).map((c: any) => [c.id, c.company_name || c.name || ""]),
      );
      setJobs(
        rows.map((j: any) => ({
          id: j.id,
          label: [j.job_number, j.title].filter(Boolean).join(" · ") || "Untitled job",
          fields: jobFieldValues({ ...j, customerName: customerName.get(j.customer_id) }),
        })),
      );
    })().catch((error) => console.warn("Error loading engineering jobs:", error));
  }, [jobPicker]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty || !onSave) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onSave]);

  // Build a moment after the last change. If a build is already running,
  // run once more when it finishes so the preview always catches up.
  const latest = useRef({ sources, inputs });
  latest.current = { sources, inputs };
  const running = useRef(false);
  const again = useRef(false);

  const build = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setBuilding(true);
    try {
      do {
        again.current = false;
        const started = performance.now();
        const result = await compileTypstPdf(latest.current.sources, latest.current.inputs);
        setDiagnostics(result.diagnostics);
        if (result.pdf) {
          setPdf(result.pdf);
          setBuildSeconds((performance.now() - started) / 1000);
        }
        setEngineError(null);
      } while (again.current);
    } catch (error) {
      console.error("Report build failed:", error);
      setEngineError(error instanceof Error ? error.message : String(error));
    } finally {
      running.current = false;
      setBuilding(false);
    }
  }, []);

  useEffect(() => {
    if (!assetsReady) return;
    const timer = setTimeout(build, 400);
    return () => clearTimeout(timer);
  }, [assetsReady, sources, inputs, build]);

  const fillFromJob = (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const known = new Set(fields.map((f) => f.key));
    setValues((prev) => ({
      ...prev,
      ...Object.fromEntries(Object.entries(job.fields).filter(([key]) => known.has(key))),
    }));
  };

  const uploadPdf = async (path: string, file: File) => {
    setUploadError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const pages = doc.getPageCount();
      // A PDF pdf.js can't draw still goes in, just without trimming.
      const margins = await measurePdfMargins(bytes).catch((error) => {
        console.warn("Couldn't measure PDF margins:", error);
        return "0,0,0,0";
      });
      await setTypstFile(path, bytes);
      setUploads((prev) => ({ ...prev, [path]: { name: file.name, pages, margins } }));
    } catch (error) {
      console.error("PDF upload failed:", error);
      setUploadError(`${file.name} couldn't be read as a PDF.`);
    }
  };

  const removePdf = async (path: string) => {
    setUploads((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    await setTypstFile(path, null).catch((error) => console.warn("Error removing PDF:", error));
  };

  const discardChanges = () => {
    if (!window.confirm("Throw away your changes since the last save?")) return;
    setName(saved.name);
    setSources({ ...saved.sources });
    setValues({ ...saved.values });
  };

  const save = async () => {
    if (!onSave) return;
    const next = { name: name.trim() || saved.name, sources, values };
    setSaving(true);
    setSaveError(null);
    try {
      if ((await onSave(next)) === false) return;
      setName(next.name);
      setSaved(next);
    } catch (error) {
      console.error("Error saving:", error);
      setSaveError(isMissingTable(error) ? STORAGE_NOT_SET_UP : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (dirty && onSave && !window.confirm("Leave without saving? Your changes will be lost.")) return;
    onBack?.();
  };

  const fieldValue = (key: string) =>
    values[key] ?? fields.find((f) => f.key === key)?.sample ?? "";

  const downloadPdf = () => {
    if (!pdf) return;
    const name = `${fieldValue("projectnumber")} ${fieldValue("reporttypetitle")}`
      .replace(/[\\/:*?"<>|]+/g, "")
      .trim();
    const url = URL.createObjectURL(
      new Blob([pdf.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name || "report"}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Open a file and select start..end, scrolled about a third of the way down. */
  const reveal = (path: string, start: number, end: number) => {
    setActivePath(path);
    // Wait for the file to load into the editor.
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(start, end);
      editor.scrollTop = Math.max(0, offsetTop(editor, start) - editor.clientHeight / 3);
      setCursorLine(editor.value.slice(0, start).split("\n").length);
    });
  };

  const jumpTo = (d: TypstDiagnostic) => {
    const path = normalizePath(d.path);
    const text = sources[path];
    if (text === undefined) return;
    const lines = text.split("\n");
    const line = Math.min(diagnosticLine(d), lines.length);
    const start = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0);
    reveal(path, start, start + lines[line - 1].length);
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 4000);
  };

  const findInCode = (click: PreviewClick | null) => {
    const match = click && locateText(sources, click);
    if (match) reveal(match.path, match.start, match.end);
    else showNotice("Couldn't find that in the code. It may come from a job field or an uploaded PDF.");
  };

  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    // insertText keeps the browser's undo history.
    if (!document.execCommand("insertText", false, "  ")) {
      const el = e.currentTarget;
      el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
      setSources((prev) => ({ ...prev, [activePath]: el.value }));
    }
  };

  const trackCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    setCursorLine(el.value.slice(0, el.selectionStart).split("\n").length);
  };

  let status: React.ReactNode;
  if (saveError) {
    status = <span className="text-red-700 dark:text-red-300">{saveError}</span>;
  } else if (notice) {
    status = <span className={ce.accentInk}>{notice}</span>;
  } else if (engineError) {
    status = <span className="text-red-700 dark:text-red-300">PDF engine problem: {engineError}</span>;
  } else if (!pdf && !errors.length) {
    status = (
      <span className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Starting the PDF engine. The first time takes a little longer.
      </span>
    );
  } else if (building) {
    status = (
      <span className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Building…
      </span>
    );
  } else if (errors.length) {
    status = (
      <span className="text-red-700 dark:text-red-300">
        {errors.length} {errors.length === 1 ? "error" : "errors"}.{" "}
        {pdf ? "Showing the last good build." : "Fix them to see the PDF."}
      </span>
    );
  } else {
    status = <span>Up to date{buildSeconds !== null ? ` · built in ${buildSeconds.toFixed(1)}s` : ""}</span>;
  }

  const sectionTitle = `${ce.eyebrow} ${ce.muted} mb-2`;

  return (
    <div className={`flex flex-col border ${ce.border} ${ce.surface}`}>
      <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-3 ${ce.border}`}>
        {onBack && (
          <button type="button" onClick={back} className={`${ce.ghostButton} h-10 px-3`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {backLabel}
          </button>
        )}
        <div className="mr-auto min-w-0 flex-1">
          <div className={`${ce.eyebrow} ${ce.muted}`}>
            {kind}
            {dirty && onSave && <span className={`ml-2 normal-case tracking-normal ${ce.accentInk}`}>unsaved changes</span>}
          </div>
          {nameEditable ? (
            <input
              aria-label={`${kind} name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${ce.field} mt-1 h-9 w-full max-w-[420px] px-2 text-base font-bold`}
            />
          ) : (
            <div className="truncate text-base font-bold">{name}</div>
          )}
        </div>
        {jobs.length > 0 && (
          <select
            aria-label="Fill fields from a job"
            value=""
            onChange={(e) => fillFromJob(e.target.value)}
            className={`${ce.field} w-[280px] max-w-full px-3`}
          >
            <option value="">Fill fields from a job…</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.label}
              </option>
            ))}
          </select>
        )}
        {actions}
        {dirty && (
          <button type="button" onClick={discardChanges} className={`${ce.ghostButton} h-10 px-4`}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Discard changes
          </button>
        )}
        <button
          type="button"
          onClick={downloadPdf}
          disabled={!pdf || errors.length > 0}
          className={`${ce.ghostButton} h-10 px-4`}
        >
          <Download className="h-4 w-4" aria-hidden />
          Download PDF
        </button>
        {onSave && (
          <button
            type="button"
            onClick={save}
            disabled={saving || (!dirty && !saveWhenClean)}
            className={`${ce.primaryButton} h-10 px-4`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            {saveLabel}
          </button>
        )}
      </div>

      <div className="grid lg:h-[calc(100vh-9rem)] lg:min-h-[640px] lg:grid-cols-[264px_minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className={`overflow-y-auto border-b p-4 lg:border-b-0 lg:border-r ${ce.border} ${ce.surfaceAlt}`}>
          <div className={sectionTitle}>Files</div>
          <div className="mb-6 flex flex-col">
            {files.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => setActivePath(path)}
                className={`flex items-center gap-2 px-2 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  path === activePath
                    ? "bg-[#1b0f56] font-semibold text-white dark:bg-[#f4f5f8] dark:text-[#0c0a34]"
                    : `${ce.ink} ${ce.hoverAlt}`
                }`}
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{fileLabel(path)}</span>
                {saved.sources[path] !== sources[path] && (
                  <span className={`ml-auto text-xs ${path === activePath ? "" : ce.accentInk}`}>edited</span>
                )}
              </button>
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <div className={`${ce.eyebrow} ${ce.muted}`}>Job fields</div>
            {Object.keys(values).length > 0 && (
              <button
                type="button"
                onClick={() => setValues({})}
                className={`text-xs font-semibold underline ${ce.muted}`}
              >
                Clear
              </button>
            )}
          </div>
          <div className="mb-6 flex flex-col gap-3">
            {fields.map(({ key, sample }) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-semibold">
                <span className={ce.muted}>{base.fieldLabels[key] ?? key}</span>
                <input
                  value={values[key] ?? ""}
                  placeholder={values[key] === "" ? "Blank in the report" : sample}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={`${ce.field} h-9 px-2 font-normal`}
                />
              </label>
            ))}
          </div>

          <div className={sectionTitle}>SKM PDFs</div>
          {uploadError && (
            <p className="mb-2 text-xs text-red-700 dark:text-red-300">{uploadError}</p>
          )}
          <div className="flex flex-col gap-2">
            {pdfSlots.map(({ title, path }) => {
              const upload = uploads[path];
              return (
                <div key={path} className={`border p-2 text-xs ${ce.border} ${ce.surface}`}>
                  <div className="font-semibold">{title}</div>
                  {upload ? (
                    <div className={`mt-1 flex items-center gap-2 ${ce.muted}`}>
                      <span className="min-w-0 flex-1 truncate">
                        {upload.name} · {upload.pages} {upload.pages === 1 ? "page" : "pages"}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePdf(path)}
                        aria-label={`Remove ${upload.name}`}
                        className={`${ce.ghostButton} h-7 w-7 shrink-0`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <label className={`${ce.ghostButton} mt-2 h-8 cursor-pointer px-3 text-xs`}>
                      <Upload className="h-3.5 w-3.5" aria-hidden />
                      Upload PDF
                      <input
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) uploadPdf(path, file);
                        }}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className={`flex min-h-[60vh] flex-col border-b lg:min-h-0 lg:border-b-0 lg:border-r ${ce.border}`}>
          <div className={`flex items-center justify-between border-b px-4 py-2 text-sm ${ce.border}`}>
            <span className="font-semibold">{fileLabel(activePath)}</span>
            <span className={`text-xs ${ce.muted}`}>Line {cursorLine}</span>
          </div>
          <textarea
            ref={editorRef}
            aria-label={`Edit ${fileLabel(activePath)}`}
            value={sources[activePath] ?? ""}
            onChange={(e) => {
              const text = e.target.value;
              setSources((prev) => ({ ...prev, [activePath]: text }));
            }}
            onKeyDown={onEditorKeyDown}
            onSelect={trackCursor}
            spellCheck={false}
            className={`min-h-0 flex-1 resize-none rounded-none border-0 p-4 font-mono text-[13px] leading-5 focus:outline-none ${ce.surface} ${ce.ink}`}
          />
          {(errors.length > 0 || warnings.length > 0) && (
            <div className={`max-h-44 overflow-y-auto border-t ${ce.border}`}>
              {[...errors, ...warnings].map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => jumpTo(d)}
                  className={`flex w-full items-start gap-2 px-4 py-2 text-left text-xs ${ce.hoverAlt}`}
                >
                  <AlertTriangle
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      /error/i.test(d.severity) ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                    }`}
                    aria-hidden
                  />
                  <span>
                    <span className="font-semibold">
                      {fileLabel(normalizePath(d.path))}, line {diagnosticLine(d)}:
                    </span>{" "}
                    {d.message}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-[70vh] flex-col lg:min-h-0">
          <div className={`border-b px-4 py-2 text-sm ${ce.border} ${ce.muted}`} aria-live="polite">
            {status}
          </div>
          <div className="min-h-0 flex-1">
            <PdfPreview pdf={pdf} onDoubleClickText={findInCode} />
          </div>
        </div>
      </div>
    </div>
  );
}
