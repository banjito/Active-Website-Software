/**
 * Compare & update: a saved report next to the same report on a newer version
 * of its form, both drawn as the printed report, with a button to move it.
 *
 * Laid out like the review window (panel on the left, print sheets on the
 * right, same sheet look and zoom) so it reads the same way. Opens on its own
 * page from the report, or inside the review window (?embedded=true), where a
 * finished update tells the window to reload the report.
 *
 * Left sheet:  the report as it is (?print=true).
 * Right sheet: ?print=true&upgradeTo=<version>, which runs the same steps as
 *              the update below, so what you see is what gets saved.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  Columns2,
  ExternalLink,
  Link2,
  Lock,
  Minus,
  Plus,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useJobDetails } from "@/lib/hooks/useJobDetails";
import type {
  CustomFormStructure,
  CustomFormTemplate,
  CustomFormTemplateVersion,
} from "@/lib/types/customForms";
import {
  getActiveTemplateVersion,
  getTemplateVersion,
  resolveRenderStructure,
} from "@/lib/customForms/versioning";
import {
  adaptStoredData,
  buildStoredData,
  mergeRuntimeIntoState,
  parseStoredData,
  projectStateToRuntime,
  type StoredInstanceData,
} from "@/lib/customForms/instanceState";
import {
  diffFormVersions,
  isFormVersionLocked,
  summarizeDiff,
  upgradeRuntimeData,
  upgradedStatus,
  type FormVersionDiff,
  type SectionChange,
} from "@/lib/customForms/versionUpgrade";
import {
  applyFormVersionUpgrade,
  fetchReportAssetStatus,
  fetchVersionsBetween,
  type VersionSummary,
} from "@/lib/customForms/formVersionStatus";
import { clearLocalDraft, localDraftKey } from "@/lib/customForms/localDraft";
import {
  applyReviewSheet,
  attachReviewZoomKeys,
  stepReviewZoom,
} from "@/components/reports/common/reviewSheet";
import { computeAutoStatus } from "./runtime/useAutoStatus";

type ViewMode = "split" | "current" | "updated";

interface Loaded {
  stored: StoredInstanceData | null;
  savedStatus: string | null;
  revision: number | null;
  currentStructure: CustomFormStructure;
  currentVersion: CustomFormTemplateVersion;
  target: CustomFormTemplateVersion | null;
  targetTemplate: CustomFormTemplate | null;
  before: Record<string, any>;
  diff: FormVersionDiff | null;
  between: VersionSummary[];
  reportStatus: string | null;
  reportName: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  "not started": "Not Started",
  in_progress: "In Progress",
  ready_for_review: "Ready for Review",
  approved: "Approved",
  sent: "Sent",
  issue: "Issue",
  archived: "Archived",
};

const STATUS_PILL: Record<string, string> = {
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300",
  ready_for_review: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
  sent: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300",
  issue: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
};

// Kept for the session, like the review window's choices.
let savedZoom = 1;
let savedView: ViewMode = "split";
let savedSync = true;
let savedCollapsed = false;

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

export const FormVersionCompare: React.FC = () => {
  const { jobId, templateId, instanceId } = useParams<{
    jobId: string;
    templateId: string;
    instanceId: string;
  }>();
  const [searchParams] = useSearchParams();
  const embedded = searchParams.get("embedded") === "true";
  const requestedVersionId = searchParams.get("to");
  const navigate = useNavigate();
  const { jobDetails } = useJobDetails(embedded ? undefined : jobId);
  usePageTitle("Compare form versions");

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const [view, setView] = useState<ViewMode>(savedView);
  const [zoom, setZoom] = useState(savedZoom);
  const [sync, setSync] = useState(savedSync);
  const [collapsed, setCollapsed] = useState(savedCollapsed);
  useEffect(() => {
    savedView = view;
    savedZoom = zoom;
    savedSync = sync;
    savedCollapsed = collapsed;
  }, [view, zoom, sync, collapsed]);

  const reportPath = `/jobs/${jobId}/custom-form/${templateId}/${instanceId}`;

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!jobId || !templateId || !instanceId) return;
    setError(null);
    setLoaded(null);
    try {
      const [{ data: row, error: rowError }, { data: templateRow, error: templateError }] =
        await Promise.all([
          supabase
            .schema("neta_ops")
            .from("custom_form_instances")
            .select("id, job_id, template_id, data, status, revision, template_version_id")
            .eq("id", instanceId)
            .eq("job_id", jobId)
            .single(),
          supabase
            .schema("neta_ops")
            .from("custom_form_templates")
            .select("id, name, description, neta_section, structure")
            .eq("id", templateId)
            .single(),
        ]);
      if (rowError || !row) throw new Error("The report could not be loaded.");
      if (templateError || !templateRow) throw new Error("The form could not be loaded.");
      if (row.template_id && row.template_id !== templateId) {
        throw new Error("This report belongs to a different form.");
      }

      const draft: CustomFormTemplate = {
        id: templateRow.id,
        name: templateRow.name,
        description: templateRow.description,
        netaSection: templateRow.neta_section,
        structure: templateRow.structure,
      };
      const resolved = await resolveRenderStructure({
        templateId,
        templateVersionId: row.template_version_id ?? null,
        existingInstance: true,
        draft,
      });
      if (resolved.source !== "pinned" || !resolved.version) {
        throw new Error(
          "This report is not pinned to a form version, so there is nothing to compare. It already shows the form's current version.",
        );
      }

      const [target, asset] = await Promise.all([
        requestedVersionId ? getTemplateVersion(requestedVersionId) : getActiveTemplateVersion(templateId),
        fetchReportAssetStatus(jobId, templateId, instanceId),
      ]);
      const newer =
        target && target.templateId === templateId && target.version > resolved.version.version
          ? target
          : null;

      const stored = parseStoredData(row.data);
      const before = projectStateToRuntime(adaptStoredData(stored, resolved.structure));
      const targetTemplate: CustomFormTemplate | null = newer
        ? {
            ...draft,
            name: newer.name,
            description: newer.description,
            netaSection: newer.netaSection,
            structure: newer.structure,
          }
        : null;

      setLoaded({
        stored,
        savedStatus: row.status ?? null,
        revision: typeof row.revision === "number" ? row.revision : null,
        currentStructure: resolved.structure,
        currentVersion: resolved.version,
        target: newer,
        targetTemplate,
        before,
        diff: newer ? diffFormVersions(resolved.structure, newer.structure, before) : null,
        between: newer
          ? await fetchVersionsBetween(templateId, resolved.version.version, newer.version)
          : [],
        reportStatus: asset?.status ?? null,
        reportName: asset?.name ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not compare the form versions.");
    }
  }, [jobId, templateId, instanceId, requestedVersionId]);

  useEffect(() => {
    load();
  }, [load]);

  const locked = isFormVersionLocked(loaded?.reportStatus);

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  const applyUpdate = async () => {
    if (!loaded?.target || !loaded.targetTemplate || !instanceId || locked) return;
    const { target, targetTemplate, diff } = loaded;
    const hidden = diff?.hiddenValues.length ?? 0;
    const ok = await confirmDialog({
      title: `Update this report to form v${target.version}?`,
      description: [
        "Every reading carries over to the matching field on the new version.",
        hidden
          ? `${hidden} filled-in value${hidden === 1 ? "" : "s"} will no longer show or print. ${hidden === 1 ? "It stays" : "They stay"} in the saved data.`
          : "",
        "This is logged in the report history.",
      ]
        .filter(Boolean)
        .join(" "),
      confirmLabel: `Update to v${target.version}`,
      cancelLabel: "Cancel",
    });
    if (!ok) return;

    setApplying(true);
    try {
      // The same steps the right-hand preview ran (CustomFormFiller ?upgradeTo).
      const state = adaptStoredData(loaded.stored, target.structure);
      const after = upgradeRuntimeData(loaded.currentStructure, targetTemplate, projectStateToRuntime(state));
      const merged = mergeRuntimeIntoState(state, after, target.structure);
      const status = upgradedStatus({
        saved: loaded.savedStatus,
        oldStructure: loaded.currentStructure,
        oldData: loaded.before,
        newStructure: target.structure,
        newData: after,
        auto: computeAutoStatus,
      });
      const data = buildStoredData(merged, {
        status: status ?? loaded.savedStatus ?? "PASS",
        templateName: target.name,
        templateId,
        templateVersionId: target.id,
      });
      await applyFormVersionUpgrade({
        instanceId,
        versionId: target.id,
        expectedRevision: loaded.revision,
        data,
        status,
        note: diff ? summarizeDiff(diff) : "",
      });
      // A copy of old unsaved typing on this device would bring the old layout back.
      clearLocalDraft(localDraftKey(jobId, templateId, instanceId));
      setDone(target.version);
      toast({ title: `Report updated to form v${target.version}`, variant: "success" });
      if (embedded) {
        window.parent?.postMessage(
          { type: "formVersionUpdated", version: target.version },
          window.location.origin,
        );
      }
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "The report could not be updated.",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  // -------------------------------------------------------------------------
  // The two print sheets: zoom, Ctrl + scroll, scroll together, jump to section
  // -------------------------------------------------------------------------
  const currentFrame = useRef<HTMLIFrameElement>(null);
  const updatedFrame = useRef<HTMLIFrameElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const syncingRef = useRef(false);

  const frames = () =>
    [currentFrame.current, updatedFrame.current].filter(Boolean) as HTMLIFrameElement[];

  useEffect(() => {
    frames().forEach((f) => applyReviewSheet(f, zoom));
  }, [zoom]);

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoom((z) => stepReviewZoom(z, direction));
  }, []);
  const resetZoom = useCallback(() => setZoom(1), []);

  const followScroll = (from: HTMLIFrameElement | null, to: HTMLIFrameElement | null) => {
    if (!syncRef.current || syncingRef.current || !from || !to) return;
    try {
      const a = from.contentDocument?.scrollingElement;
      const b = to.contentDocument?.scrollingElement;
      if (!a || !b) return;
      // By proportion: the two reports are rarely the same length.
      const ratio = a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight);
      syncingRef.current = true;
      b.scrollTop = ratio * Math.max(0, b.scrollHeight - b.clientHeight);
      b.scrollLeft = a.scrollLeft;
      window.setTimeout(() => {
        syncingRef.current = false;
      }, 50);
    } catch {
      /* not readable yet */
    }
  };

  const onFrameLoad = (which: "current" | "updated") => {
    const frame = which === "current" ? currentFrame.current : updatedFrame.current;
    const other = which === "current" ? updatedFrame.current : currentFrame.current;
    if (!frame) return;
    applyReviewSheet(frame, zoomRef.current);
    attachReviewZoomKeys(frame, stepZoom, resetZoom);
    try {
      frame.contentWindow?.addEventListener("scroll", () => followScroll(frame, other), {
        passive: true,
      });
    } catch {
      /* not readable */
    }
  };

  /** Scroll both sheets to a section and flash it. */
  const jumpTo = (sectionId: string) => {
    for (const frame of frames()) {
      try {
        const doc = frame.contentDocument;
        const el = doc?.querySelector<HTMLElement>(`[data-cf-section="${CSS.escape(sectionId)}"]`);
        if (!el) continue;
        syncingRef.current = true;
        el.scrollIntoView({ block: "start", behavior: "smooth" });
        el.style.outline = "3px solid #f59e0b";
        el.style.outlineOffset = "4px";
        window.setTimeout(() => {
          el.style.outline = "";
          el.style.outlineOffset = "";
        }, 1800);
        window.setTimeout(() => {
          syncingRef.current = false;
        }, 800);
      } catch {
        /* not readable */
      }
    }
  };

  const frameBase = `${reportPath}?fromApproval=true&print=true&embedded=true`;
  const currentSrc = frameBase;
  const updatedSrc = loaded?.target ? `${frameBase}&upgradeTo=${loaded.target.id}` : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const close = () => {
    if (embedded) {
      window.parent?.postMessage({ type: "formVersionCompareClose" }, window.location.origin);
      return;
    }
    navigate(reportPath);
  };

  const title = loaded?.reportName || loaded?.currentVersion.name || "Report";

  return (
    <div className="h-screen flex flex-col bg-neutral-100 dark:bg-dark-200 text-neutral-900 dark:text-neutral-100">
      {/* Header (the review window already has one when embedded) */}
      {!embedded && (
        <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Compare form versions
              {jobDetails?.job_number ? ` · Job #${jobDetails.job_number}` : ""}
            </div>
            <h1 className="text-lg font-semibold truncate" title={title}>
              {title}
            </h1>
          </div>
          <Button variant="outline" onClick={close} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to report
          </Button>
        </div>
      )}

      {error ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 rounded-none p-5 space-y-4">
            <p className="text-sm">{error}</p>
            <Button variant="outline" onClick={close} leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Back to report
            </Button>
          </div>
        </div>
      ) : !loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="md" />
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Panel: what changes, and the update button */}
          <aside
            className={`flex-shrink-0 flex flex-col border-r border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 transition-[width] duration-150 ${
              collapsed ? "w-[60px]" : "w-[320px] max-w-[85vw]"
            }`}
          >
            <div className={`flex-shrink-0 flex items-center gap-2 p-3 ${collapsed ? "flex-col" : ""}`}>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span>v{loaded.currentVersion.version}</span>
                    <ArrowRight className="w-4 h-4 text-neutral-400" />
                    <span className={loaded.target ? "text-brand" : ""}>
                      v{loaded.target?.version ?? loaded.currentVersion.version}
                    </span>
                  </div>
                  {loaded.reportStatus && (
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded-none ${
                        STATUS_PILL[loaded.reportStatus] ??
                        "bg-neutral-100 text-neutral-700 dark:bg-dark-100 dark:text-neutral-300"
                      }`}
                    >
                      {STATUS_LABELS[loaded.reportStatus] ?? loaded.reportStatus}
                    </span>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                title="Collapse / expand panel"
                aria-label="Collapse or expand panel"
                className="w-10 h-10 flex items-center justify-center border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-700 dark:text-neutral-200 hover:border-brand"
              >
                <ChevronsLeft className={`w-5 h-5 ${collapsed ? "rotate-180" : ""}`} />
              </button>
            </div>

            {!collapsed && (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-4">
                  {!loaded.target ? (
                    <p className="text-sm text-neutral-600 dark:text-neutral-300">
                      This report already uses the newest version of its form (v
                      {loaded.currentVersion.version}).
                    </p>
                  ) : (
                    <>
                      {locked && (
                        <div className="flex gap-2 p-3 text-sm border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-dark-100 rounded-none">
                          <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>
                            {STATUS_LABELS[loaded.reportStatus ?? ""] ?? "This"} reports keep the form
                            version they were issued with. You can compare, but not update.
                          </span>
                        </div>
                      )}
                      <VersionNotes current={loaded.currentVersion} between={loaded.between} />
                      {loaded.diff && <ChangeList diff={loaded.diff} onJump={jumpTo} />}
                    </>
                  )}
                </div>

                <div className="flex-shrink-0 border-t border-neutral-200 dark:border-neutral-700 p-3 space-y-2">
                  {done != null ? (
                    <>
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        Updated to form v{done}.
                      </p>
                      {!embedded && (
                        <Button className="w-full" onClick={() => navigate(reportPath)}>
                          Open the report
                        </Button>
                      )}
                    </>
                  ) : loaded.target ? (
                    <Button
                      className="w-full"
                      onClick={applyUpdate}
                      disabled={locked || applying}
                      title={locked ? "Approved and sent reports cannot be updated" : undefined}
                      leftIcon={locked ? <Lock className="w-4 h-4" /> : undefined}
                    >
                      {applying ? "Updating…" : `Update to v${loaded.target.version}`}
                    </Button>
                  ) : null}
                  <Button variant="outline" className="w-full" onClick={close}>
                    {embedded ? "Back to report" : "Cancel"}
                  </Button>
                </div>
              </>
            )}
          </aside>

          {/* The two print sheets */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150">
              {updatedSrc && (
                <div className="flex border border-neutral-300 dark:border-neutral-600" role="group" aria-label="View">
                  {(
                    [
                      ["split", "Side by side"],
                      ["current", `Current (v${loaded.currentVersion.version})`],
                      ["updated", `Updated (v${loaded.target!.version})`],
                    ] as [ViewMode, string][]
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setView(mode)}
                      aria-pressed={view === mode}
                      className={`h-8 px-3 text-xs font-medium rounded-none inline-flex items-center gap-1.5 ${
                        view === mode
                          ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                          : "bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-dark-150 dark:text-neutral-200 dark:hover:bg-dark-100"
                      }`}
                    >
                      {mode === "split" && <Columns2 className="w-3.5 h-3.5" />}
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {updatedSrc && view === "split" && (
                <label className="inline-flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded-none"
                    checked={sync}
                    onChange={(e) => setSync(e.target.checked)}
                  />
                  <Link2 className="w-3.5 h-3.5" />
                  Scroll together
                </label>
              )}
              <div className="ml-auto flex items-center border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150">
                <button
                  type="button"
                  onClick={() => stepZoom(-1)}
                  title="Zoom out (Ctrl + scroll)"
                  aria-label="Zoom out"
                  className="w-8 h-8 flex items-center justify-center rounded-none hover:bg-neutral-100 dark:hover:bg-dark-100"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  title="Reset zoom"
                  className="min-w-[52px] h-8 text-xs border-x border-neutral-200 dark:border-neutral-700 rounded-none hover:bg-neutral-100 dark:hover:bg-dark-100"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => stepZoom(1)}
                  title="Zoom in (Ctrl + scroll)"
                  aria-label="Zoom in"
                  className="w-8 h-8 flex items-center justify-center rounded-none hover:bg-neutral-100 dark:hover:bg-dark-100"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
              <SheetPane
                hidden={!!updatedSrc && view === "updated"}
                label={done != null ? `Before (v${loaded.currentVersion.version})` : `Current · v${loaded.currentVersion.version}`}
                tone="neutral"
                openHref={reportPath}
              >
                <iframe
                  ref={currentFrame}
                  src={currentSrc}
                  title="Current version preview"
                  className="w-full h-full border-0"
                  onLoad={() => onFrameLoad("current")}
                />
              </SheetPane>
              {updatedSrc && (
                <SheetPane
                  hidden={view === "current"}
                  divider={view === "split"}
                  label={
                    done != null
                      ? `Saved · v${loaded.target!.version}`
                      : `After update · v${loaded.target!.version}`
                  }
                  tone="brand"
                >
                  <iframe
                    ref={updatedFrame}
                    src={updatedSrc}
                    title="Updated version preview"
                    className="w-full h-full border-0"
                    onLoad={() => onFrameLoad("updated")}
                  />
                </SheetPane>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const SheetPane: React.FC<{
  hidden: boolean;
  label: string;
  tone: "neutral" | "brand";
  openHref?: string;
  /** Line between the two sheets (side by side only). */
  divider?: boolean;
  children: React.ReactNode;
}> = ({ hidden, label, tone, openHref, divider, children }) => (
  <div
    className={`flex-1 min-w-0 min-h-0 flex flex-col border-neutral-300 dark:border-neutral-700 ${
      divider ? "border-t md:border-t-0 md:border-l" : ""
    } ${hidden ? "hidden" : ""}`}
  >
    <div
      className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold ${
        tone === "brand"
          ? "bg-brand text-white"
          : "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100"
      }`}
    >
      <span className="truncate">{label}</span>
      {openHref && (
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 font-normal hover:underline"
          title="Open the report in a new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open
        </a>
      )}
    </div>
    <div className="flex-1 min-h-0">{children}</div>
  </div>
);

const VersionNotes: React.FC<{
  current: CustomFormTemplateVersion;
  between: VersionSummary[];
}> = ({ current, between }) => (
  <section>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
      Versions
    </h3>
    <ol className="space-y-2 text-sm">
      <li className="text-neutral-600 dark:text-neutral-300">
        <span className="font-medium">v{current.version}</span> · this report
        {current.publishedAt ? ` · ${formatDate(current.publishedAt)}` : ""}
      </li>
      {between.map((v) => (
        <li key={v.id}>
          <div>
            <span className="font-medium">v{v.version}</span>
            {v.publishedAt ? (
              <span className="text-neutral-500 dark:text-neutral-400"> · {formatDate(v.publishedAt)}</span>
            ) : null}
          </div>
          {v.releaseNotes && (
            <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300 whitespace-pre-line">
              {v.releaseNotes}
            </p>
          )}
        </li>
      ))}
    </ol>
  </section>
);

const KIND_TAG: Record<SectionChange["kind"], string> = {
  added: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
  removed: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  changed: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
};

const ChangeList: React.FC<{ diff: FormVersionDiff; onJump: (sectionId: string) => void }> = ({
  diff,
  onJump,
}) => {
  const lines = (change: SectionChange): string[] => {
    const out: string[] = [];
    if (change.renamedFrom) out.push(`Renamed from “${change.renamedFrom}”`);
    if (change.kind === "changed" && change.added.length) out.push(`Added: ${change.added.join(", ")}`);
    if (change.kind === "changed" && change.removed.length) out.push(`Removed: ${change.removed.join(", ")}`);
    for (const r of change.renamed) out.push(`“${r.from}” → “${r.to}”`);
    if (change.moved) out.push("Moved");
    if (change.screenOnly) out.push(change.kind === "added" ? "Screen only (not printed)" : "Now left out of print");
    if (change.otherChanges) out.push("Formulas, choices or layout changed");
    if (change.kind === "added" && change.added.length) out.push(change.added.join(", "));
    return out;
  };

  return (
    <>
      {diff.hiddenValues.length > 0 && (
        <section className="p-3 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-none">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4" />
            {diff.hiddenValues.length} filled-in value{diff.hiddenValues.length === 1 ? "" : "s"} won’t show
          </div>
          <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
            The new version has no place for these. They stay in the saved data but won’t show or print.
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {diff.hiddenValues.map((v, i) => (
              <li key={i} className="text-neutral-800 dark:text-neutral-200">
                <span className="text-neutral-500 dark:text-neutral-400">{v.sectionTitle} ›</span> {v.label}:{" "}
                <span className="font-medium">{v.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
          What changes
        </h3>
        {diff.identical ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Nothing in the form’s layout changed. Updating only re-pins the report.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {diff.sections.map((change) => (
              <li key={`${change.kind}-${change.sectionId}`}>
                <button
                  type="button"
                  onClick={() => onJump(change.sectionId)}
                  disabled={change.kind === "removed"}
                  title={change.kind === "removed" ? undefined : "Show in both reports"}
                  className="w-full text-left p-2 border border-neutral-200 dark:border-neutral-700 rounded-none hover:border-brand disabled:hover:border-neutral-200 dark:disabled:hover:border-neutral-700 disabled:cursor-default"
                >
                  <div className="flex items-start gap-2">
                    <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded-none ${KIND_TAG[change.kind]}`}>
                      {change.kind}
                    </span>
                    <span className="text-sm font-medium leading-5">{change.title}</span>
                  </div>
                  {lines(change).map((line, i) => (
                    <div key={i} className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                      {line}
                    </div>
                  ))}
                </button>
              </li>
            ))}
            {diff.settingsChanged && (
              <li className="p-2 text-xs border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300">
                Form-wide settings changed (result choices, colours or print options).
              </li>
            )}
          </ul>
        )}
      </section>
    </>
  );
};

export default FormVersionCompare;
