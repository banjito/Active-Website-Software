import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";
import { Plus } from "lucide-react";
import { toast } from "react-hot-toast";
import AddReportDialog from "@/components/assets/AddReportDialog";
import AssetTrendsDialog from "@/components/assets/AssetTrendsDialog";
import EquipmentAssetDialog, {
  type AssetFieldSuggestions,
} from "@/components/assets/EquipmentAssetDialog";
import type { ReportTemplateChoice } from "@/components/assets/useReportTemplateChoices";
import { AMP_LOGO_URL } from "@/components/customForms/runtime/PrintHeader";
import ArchiveDiagramDialog, { type ArchiveChoice } from "@/components/diagrams/ArchiveDiagramDialog";
import type { DiagramDetailsActions } from "@/components/diagrams/DiagramDetailsPanel";
import DiagramExportDialog, { type ExportScope } from "@/components/diagrams/DiagramExportDialog";
import DiagramNameDialog from "@/components/diagrams/DiagramNameDialog";
import DiagramOverviewDialog from "@/components/diagrams/DiagramOverviewDialog";
import ReplaceAssetDialog from "@/components/diagrams/ReplaceAssetDialog";
import DiagramTaskbar from "@/components/diagrams/DiagramTaskbar";
import DiagramWorkspace, {
  type DiagramColorMode,
  type DiagramWorkspaceHandle,
} from "@/components/diagrams/DiagramWorkspace";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/lib/AuthContext";
import {
  archivableAssets,
  buildArchiveSnapshot,
  copyContents,
  readArchiveSnapshot,
} from "@/lib/diagrams/archive";
import { reportLink } from "@/lib/diagrams/assetDetails";
import {
  cleanSymbolChoices,
  toGeometry,
  type CustomSymbolRow,
  type SymbolChoices,
} from "@/lib/diagrams/customSymbols";
import { diffContents, type DiagramChanges, type SiteAsset } from "@/lib/diagrams/editing";
import {
  buildSiteOverview,
  findLinks,
  type DiagramLinkRow,
  type DiagramLinkTarget,
} from "@/lib/diagrams/links";
import { contentFingerprint, nextRevision } from "@/lib/diagrams/revision";
import {
  estimateTextWidth,
  planSheet,
  smallestReadableSize,
  type SheetColoring,
  type SheetInput,
  type SheetOptions,
} from "@/lib/diagrams/sheet";
import { setActiveSymbols } from "@/lib/diagrams/symbols";
import { BUILT_IN_VOLTAGE_COLORS, cleanVoltageColors } from "@/lib/diagrams/voltage";
import type { EquipmentAsset, EquipmentAssetWithCounts } from "@/lib/types/assetTracking";
import type { DiagramContents, DiagramReport, SiteDiagram } from "@/lib/types/siteDiagrams";
import {
  fetchAssetsForJob,
  fetchAssetsForSite,
  fetchEquipmentTypes,
  fetchSiteFieldSuggestions,
  linkAssetsToJob,
  supportsSubAssets,
} from "@/services/equipmentAssetsService";
import {
  archiveDiagram,
  createDiagram,
  deleteDiagram,
  fetchAssetReports,
  fetchAssetStatuses,
  fetchCustomerLogo,
  fetchCustomSymbols,
  fetchDiagramContents,
  fetchDiagramLinkRows,
  fetchDiagramSiteSettings,
  fetchExportStates,
  fetchJobCustomerId,
  fetchVoltageColors,
  fetchSiteDiagrams,
  fetchSymbolChoices,
  isDuplicateName,
  recordExport,
  renameDiagram,
  replaceAsset,
  retireAssets,
  saveDiagramChanges,
  supportsDiagramArchive,
} from "@/services/siteDiagramsService";
import { fetchSite } from "@/services/sitesService";

/** The export starts with whatever coloring is on screen. */
const EXPORT_COLORING: Record<DiagramColorMode, SheetColoring> = {
  off: "none",
  voltage: "voltage",
  status: "status",
};

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-neutral-500 dark:text-neutral-400">
      {children}
    </div>
  );
}

/**
 * A site's single-line diagrams, full screen.
 *
 * Deliberately outside the app <Layout>, so the one-line gets the whole window. `?job=`
 * records which job it was opened from: the drawings are the site's either way, but the
 * job decides which reports show and where Exit goes.
 */
export default function SiteDiagramPage() {
  const { siteId, diagramId } = useParams<{ siteId: string; diagramId?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const jobId = searchParams.get("job");
  const focusSymbolId = searchParams.get("focus");

  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { getUserRole, isAdmin } = usePermissions();
  // The same people who can edit assets.
  const canEdit =
    isAdmin ||
    ["Admin", "Super Admin", "Office Admin", "Manager", "NETA Technician"].includes(
      getUserRole() as string,
    );

  const [siteName, setSiteName] = useState("");
  const [siteAssets, setSiteAssets] = useState<EquipmentAssetWithCounts[]>([]);
  /** Assets on the job this was opened from. Null from the site view. */
  const [jobAssetIds, setJobAssetIds] = useState<Set<string> | null>(null);
  /** undefined while loading. null when this database doesn't have diagrams yet. */
  const [diagrams, setDiagrams] = useState<SiteDiagram[] | null | undefined>(undefined);
  const [contents, setContents] = useState<(DiagramContents & { diagramId: string }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [linkRows, setLinkRows] = useState<DiagramLinkRow[]>([]);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [voltageColors, setVoltageColors] = useState(BUILT_IN_VOLTAGE_COLORS);
  /** Kept here so it carries over when jumping between diagrams. */
  const [colorMode, setColorMode] = useState<DiagramColorMode>("off");
  const [library, setLibrary] = useState<CustomSymbolRow[]>([]);
  const [symbolChoices, setSymbolChoices] = useState<SymbolChoices>({});
  const [archiving, setArchiving] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<EquipmentAsset | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  /** Creating a new asset from the Replace dialog, rather than editing one. */
  const [creatingReplacement, setCreatingReplacement] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [taskbarOpen, setTaskbarOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [naming, setNaming] = useState<"new" | "rename" | "copy" | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [editingAsset, setEditingAsset] = useState<EquipmentAsset | null>(null);
  const [suggestions, setSuggestions] = useState<AssetFieldSuggestions>({
    buildingAreas: [],
    substations: [],
    locations: [],
    equipmentTypes: [],
  });
  const [reportForAsset, setReportForAsset] = useState<EquipmentAssetWithCounts | null>(null);
  const [trendAsset, setTrendAsset] = useState<EquipmentAsset | null>(null);

  /** Set by the open diagram, so nothing leaves it with an edit still unsaved. */
  const workspaceRef = useRef<DiagramWorkspaceHandle | null>(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setDiagrams(undefined);
    setFailed(false);

    Promise.all([
      fetchSite(siteId),
      fetchSiteDiagrams(siteId),
      fetchAssetsForSite(siteId),
      jobId ? fetchAssetsForJob(jobId) : null,
      fetchVoltageColors(siteId),
      fetchCustomSymbols(),
      fetchSymbolChoices(siteId),
    ])
      .then(([site, siteDiagrams, assets, jobAssets, colors, library, choices]) => {
        if (cancelled) return;
        setVoltageColors(cleanVoltageColors(colors));
        setLibrary(library);
        setSymbolChoices(cleanSymbolChoices(choices));
        setSiteName(site?.name ?? "");
        setDiagrams(siteDiagrams);
        setSiteAssets(assets);
        setJobAssetIds(jobAssets ? new Set(jobAssets.map((asset) => asset.id)) : null);
      })
      .catch((error) => {
        console.error("Failed to load site diagrams:", error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, jobId]);

  const liveDiagrams = useMemo(
    () => (diagrams ?? []).filter((diagram) => !diagram.archived_at),
    [diagrams],
  );

  // A link can outlive its diagram, so an unknown id opens the first one instead.
  const activeDiagram =
    diagrams?.find((diagram) => diagram.id === diagramId) ?? liveDiagrams[0] ?? diagrams?.[0] ?? null;
  const activeDiagramId = activeDiagram?.id ?? null;
  const isArchive = !!activeDiagram?.archived_at;
  const snapshot = useMemo(
    () => (activeDiagram?.archived_at ? readArchiveSnapshot(activeDiagram.archive_snapshot) : null),
    [activeDiagram],
  );

  useEffect(() => {
    if (!activeDiagramId) return;
    let cancelled = false;
    setFailed(false);

    fetchDiagramContents(activeDiagramId)
      .then((loaded) => {
        if (cancelled) return;
        // Before the diagram draws, so nothing shows with the wrong symbols. An archive
        // brings its own, so later changes at the site can't reach it.
        setActiveSymbols(
          (snapshot?.custom_symbols ?? library).map(toGeometry),
          snapshot?.symbol_choices ?? symbolChoices,
        );
        setContents({ ...loaded, diagramId: activeDiagramId });
      })
      .catch((error) => {
        console.error("Failed to load diagram:", error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [activeDiagramId, snapshot, library, symbolChoices]);

  const loaded = contents?.diagramId === activeDiagramId ? contents : null;

  // Links are a nice extra on a diagram, so a failure here shouldn't stop it from opening.
  const refreshLinks = useCallback(async () => {
    try {
      setLinkRows(await fetchDiagramLinkRows(liveDiagrams.map((diagram) => diagram.id)));
    } catch (error) {
      console.error("Failed to load diagram links:", error);
    }
  }, [liveDiagrams]);

  useEffect(() => {
    void refreshLinks();
  }, [activeDiagramId, refreshLinks]);

  const saveChanges = useCallback(
    (changes: DiagramChanges) => {
      if (!activeDiagramId) return Promise.resolve();
      return saveDiagramChanges(activeDiagramId, changes, userId);
    },
    [activeDiagramId, userId],
  );

  /** Following a link adds to the browser history, so Back returns to the other sheet. */
  const openDiagram = async (nextId: string, focus?: string) => {
    await workspaceRef.current?.flush();
    const search = new URLSearchParams();
    if (jobId) search.set("job", jobId);
    if (focus) search.set("focus", focus);
    navigate(
      { pathname: `/sites/${siteId}/diagrams/${nextId}`, search: search.toString() },
      { replace: !focus, state: location.state },
    );
  };

  const jump = (target: DiagramLinkTarget) => {
    setOverviewOpen(false);
    void openDiagram(target.diagramId, target.symbolId);
  };

  const showOverview = async () => {
    await workspaceRef.current?.flush();
    await refreshLinks();
    setOverviewOpen(true);
  };

  const exit = async () => {
    await workspaceRef.current?.flush();
    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
    navigate(returnTo ?? (jobId ? `/jobs/${jobId}?tab=assets` : `/sites/${siteId}`));
  };

  /** A new diagram, optionally holding a copy of the one on screen. */
  const startDiagram = async (name: string, copy: boolean) => {
    const source = copy ? workspaceRef.current?.getContents() : null;
    const created = await createDiagram(siteId as string, name, diagrams?.length ?? 0, userId);
    if (source) {
      const copied = copyContents(source, created.id);
      await saveDiagramChanges(created.id, diffContents({ symbols: [], lines: [] }, copied), userId);
    }
    setDiagrams((current) => [...(current ?? []), created]);
    return created;
  };

  const archive = async (choice: ArchiveChoice) => {
    const workspace = workspaceRef.current;
    if (!activeDiagram || !workspace) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      await workspace.flush();
      const archivedSnapshot = buildArchiveSnapshot(
        workspace.getContents(),
        voltageColors,
        symbolChoices,
        library,
      );
      await archiveDiagram(activeDiagram.id, archivedSnapshot, userId);
      setDiagrams((current) =>
        current?.map((diagram) =>
          diagram.id === activeDiagram.id
            ? {
                ...diagram,
                archived_at: new Date().toISOString(),
                archive_snapshot: archivedSnapshot,
              }
            : diagram,
        ),
      );
      await retireAssets(choice.retireIds, userId);
      setSiteAssets((current) =>
        current.map((asset) =>
          choice.retireIds.includes(asset.id) ? { ...asset, status: "retired" } : asset,
        ),
      );

      if (choice.next === "none") {
        setEditing(false);
      } else {
        const created = await startDiagram(choice.newName, choice.next === "copy");
        setEditing(true);
        void openDiagram(created.id);
      }
      setArchiving(false);
    } catch (error) {
      console.error("Failed to archive diagram:", error);
      setArchiveError(
        isDuplicateName(error)
          ? "This site already has a diagram with that name."
          : "That couldn't be finished. Check the diagram picker and try again.",
      );
    } finally {
      setArchiveBusy(false);
    }
  };

  /** What every sheet of an export shares. */
  const sheetBasics = (options: SheetOptions) => {
    const numbers = new Map(liveDiagrams.map((diagram, index) => [diagram.id, index + 1]));
    return {
      options,
      siteId: siteId as string,
      siteName,
      sheetNumbers: numbers,
      sheetCount: liveDiagrams.length,
      links: findLinks(linkRows, liveDiagrams),
      printedAt: new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    };
  };

  const fadedOnJob = (contents: DiagramContents) =>
    new Set(
      contents.symbols.flatMap((symbol) =>
        jobAssetIds && symbol.asset_id && !jobAssetIds.has(symbol.asset_id) ? [symbol.asset_id] : [],
      ),
    );

  /** The AMP logo always, then the end-user, then the job's customer unless they're the same. */
  const logoSources = async () => {
    const sources = [{ key: "AMP", src: AMP_LOGO_URL }];
    if (!siteId) return sources;

    const [settings, customerId] = await Promise.all([
      fetchDiagramSiteSettings(siteId),
      jobId ? fetchJobCustomerId(jobId) : null,
    ]);

    const endUserId = settings?.end_user_customer_id ?? null;
    const endUserLogo = endUserId ? await fetchCustomerLogo(endUserId) : (settings?.end_user_logo ?? null);
    if (endUserLogo) sources.push({ key: "end-user", src: endUserLogo });

    if (customerId && customerId !== endUserId) {
      const customerLogo = await fetchCustomerLogo(customerId);
      if (customerLogo && customerLogo !== endUserLogo) {
        sources.push({ key: "customer", src: customerLogo });
      }
    }
    return sources;
  };

  const exportPdf = async (options: SheetOptions, scope: ExportScope) => {
    if (!activeDiagram || !workspaceRef.current) return;
    setExporting(true);
    try {
      await workspaceRef.current.flush();
      await refreshLinks();

      const targets = scope === "all" ? liveDiagrams : [activeDiagram];
      const open = workspaceRef.current.getContents();
      const contents = await Promise.all(
        targets.map((diagram) =>
          diagram.id === activeDiagram.id ? open : fetchDiagramContents(diagram.id),
        ),
      );

      const states = await fetchExportStates(targets.map((diagram) => diagram.id));
      const assetIds = [
        ...new Set(contents.flatMap((row) => row.symbols.flatMap((s) => (s.asset_id ? [s.asset_id] : [])))),
      ];
      const statuses = options.coloring === "status" ? await loadStatuses(assetIds) : new Map<string, string>();
      const basics = sheetBasics(options);

      const records: Array<() => Promise<void>> = [];
      const sheets = targets.map((diagram, index): Omit<SheetInput, "measure" | "logos"> => {
        const row = contents[index];
        const fingerprint = contentFingerprint(row, diagram.name);
        const state = states?.find((item) => item.id === diagram.id);
        // An archive is finished, so printing it doesn't start a new revision.
        const next = nextRevision(state?.revision ? state : undefined, fingerprint);
        const revision = !states ? null : diagram.archived_at ? (state?.revision ?? 0) : next.revision;
        if (states && !diagram.archived_at && next.changed) {
          records.push(() => recordExport(diagram.id, next.revision, fingerprint));
        }
        return {
          ...basics,
          contents: row,
          diagramId: diagram.id,
          diagramName: diagram.name,
          revision,
          archived: !!diagram.archived_at,
          voltageColors: snapshot?.voltage_colors ?? voltageColors,
          statuses,
          fadedAssetIds: fadedOnJob(row),
        };
      });

      // Loaded here so the PDF library only downloads when someone exports.
      const { buildDiagramPdf } = await import("@/lib/diagrams/pdfExport");
      const { bytes, failedLogos } = await buildDiagramPdf(sheets, await logoSources());

      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      link.download = `${siteName} - ${scope === "all" ? "Single Lines" : activeDiagram.name}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);

      // The PDF is already in hand, so a failure here is about the next revision number.
      await Promise.all(records.map((record) => record())).catch((error) => {
        console.error("Failed to record the export:", error);
        toast.error("The PDF was made, but its revision couldn't be saved.");
      });
      if (failedLogos.length > 0) toast.error(`Exported without the ${failedLogos.join(", ")} logo.`);
      setExportOpen(false);
    } catch (error) {
      console.error("Failed to export PDF:", error);
      toast.error("The PDF couldn't be made.");
    } finally {
      setExporting(false);
    }
  };

  const estimateExport = (options: SheetOptions) => {
    const contents = workspaceRef.current?.getContents();
    if (!contents || !activeDiagram) return { textSize: 12, better: null };
    const input: SheetInput = {
      ...sheetBasics(options),
      contents,
      diagramId: activeDiagram.id,
      diagramName: activeDiagram.name,
      revision: null,
      archived: isArchive,
      voltageColors,
      statuses: new Map(),
      fadedAssetIds: new Set(),
      logos: [],
      measure: estimateTextWidth,
    };
    return { textSize: planSheet(input).textSize, better: smallestReadableSize(input) };
  };

  const finishReplace = async (newAsset: EquipmentAsset) => {
    if (!replacing) return;
    setReplaceBusy(true);
    try {
      await replaceAsset(
        replacing.id,
        newAsset.id,
        liveDiagrams.map((diagram) => diagram.id),
        userId,
      );
      if (jobId && jobAssetIds?.has(replacing.id)) {
        await linkAssetsToJob(jobId, [newAsset.id], userId ?? undefined);
        setJobAssetIds((current) => new Set([...(current ?? []), newAsset.id]));
      }
      setSiteAssets((current) =>
        current.map((asset) =>
          asset.id === replacing.id
            ? { ...asset, status: "retired", replaced_by_asset_id: newAsset.id }
            : asset,
        ),
      );
      workspaceRef.current?.swapAsset(replacing.id, {
        id: newAsset.id,
        identifier: newAsset.identifier,
        equipment_type: newAsset.equipment_type ?? null,
        site_id: newAsset.site_id,
        deleted_at: null,
        status: newAsset.status,
      });
      void refreshLinks();
      toast.success(`${newAsset.identifier} replaced ${replacing.identifier}.`);
      setReplacing(null);
    } catch (error) {
      console.error("Failed to replace asset:", error);
      toast.error("The asset couldn't be replaced.");
    } finally {
      setReplaceBusy(false);
    }
  };

  const submitName = async (name: string) => {
    if (!siteId) return;
    setSavingName(true);
    setNameError(null);
    try {
      if (naming === "new" || naming === "copy") {
        const created = await startDiagram(name, naming === "copy");
        setEditing(true);
        void openDiagram(created.id);
      } else if (activeDiagramId) {
        await renameDiagram(activeDiagramId, name, userId);
        setDiagrams((current) =>
          current?.map((diagram) =>
            diagram.id === activeDiagramId ? { ...diagram, name: name.trim() } : diagram,
          ),
        );
      }
      setNaming(null);
    } catch (error) {
      console.error("Failed to save diagram name:", error);
      setNameError(
        isDuplicateName(error)
          ? "This site already has a diagram with that name."
          : "The diagram couldn't be saved. Try again.",
      );
    } finally {
      setSavingName(false);
    }
  };

  const removeDiagram = async () => {
    if (!activeDiagram) return;
    const ok = await confirmDialog({
      title: `Delete "${activeDiagram.name}"?`,
      description: "Its assets and their reports aren't affected.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await workspaceRef.current?.flush();
      await deleteDiagram(activeDiagram.id, userId);
      setDiagrams((current) => current?.filter((diagram) => diagram.id !== activeDiagram.id));
      setEditing(false);
    } catch (error) {
      console.error("Failed to delete diagram:", error);
      toast.error("The diagram couldn't be deleted.");
    }
  };

  const loadReports = useCallback(
    (assetId: string) => fetchAssetReports(assetId, jobId),
    [jobId],
  );

  const loadStatuses = useCallback(
    (assetIds: string[]) => fetchAssetStatuses(assetIds, jobId),
    [jobId],
  );

  const openReport = async (report: DiagramReport) => {
    const link = reportLink(report.fileUrl);
    if (!link) return;
    if (link.kind === "file") {
      window.open(link.url, "_blank", "noopener");
      return;
    }
    await workspaceRef.current?.flush();
    navigate(link.path);
  };

  const editAsset = async (asset: EquipmentAsset) => {
    setEditingAsset(asset);
    if (!siteId) return;
    try {
      const [fields, equipmentTypes] = await Promise.all([
        fetchSiteFieldSuggestions(siteId),
        fetchEquipmentTypes(),
      ]);
      setSuggestions({ ...fields, equipmentTypes });
    } catch (error) {
      // Only the autocomplete needs these, so the dialog stays usable without them.
      console.error("Failed to load asset suggestions:", error);
    }
  };

  const assetSaved = (saved: EquipmentAsset, wasCreated: boolean) => {
    if (wasCreated) {
      setSiteAssets((current) => [...current, { ...saved, report_count: 0 }]);
      void finishReplace(saved);
      return;
    }
    setSiteAssets((current) =>
      current.map((asset) => (asset.id === saved.id ? { ...asset, ...saved } : asset)),
    );
    workspaceRef.current?.refreshAsset({
      id: saved.id,
      identifier: saved.identifier,
      equipment_type: saved.equipment_type ?? null,
      site_id: saved.site_id,
      deleted_at: null,
      status: saved.status,
    });
  };

  const startReport = (choice: ReportTemplateChoice) => {
    if (!reportForAsset || !jobId) return;
    const path = choice.customFormTemplateId
      ? `/jobs/${jobId}/custom-form/${choice.customFormTemplateId}/new`
      : `/jobs/${jobId}/${choice.slug}`;
    navigate(`${path}?equipmentAssetId=${reportForAsset.id}&returnToAssets=true`);
  };

  const details: DiagramDetailsActions = {
    jobId,
    canEdit: canEdit && !isArchive,
    jobAssetIds,
    loadReports,
    loadStatuses,
    onOpenReport: (report) => void openReport(report),
    onEditAsset: (asset) => void editAsset(asset),
    onAddReport: (asset) =>
      setReportForAsset(siteAssets.find((row) => row.id === asset.id) ?? null),
    onShowTrends: setTrendAsset,
    onReplaceAsset: setReplacing,
  };

  // An asset already on a diagram can't take over, or it would be there twice.
  const replacementCandidates = useMemo(() => {
    const placed = new Set(linkRows.map((row) => row.asset_id));
    return siteAssets
      .filter(
        (asset) =>
          asset.id !== replacing?.id && asset.status !== "retired" && !placed.has(asset.id),
      )
      .map((asset) => ({ id: asset.id, identifier: asset.identifier }))
      .sort((a, b) => a.identifier.localeCompare(b.identifier, undefined, { numeric: true }));
  }, [siteAssets, linkRows, replacing]);

  const pickerDiagrams = useMemo(
    () =>
      [...liveDiagrams, ...(diagrams ?? []).filter((diagram) => diagram.archived_at)].map((diagram) =>
        diagram.archived_at
          ? {
              ...diagram,
              name: `Archived: ${diagram.name} (${new Date(diagram.archived_at).toLocaleDateString()})`,
            }
          : diagram,
      ),
    [diagrams, liveDiagrams],
  );

  const placeableAssets = useMemo(() => siteAssets as unknown as SiteAsset[], [siteAssets]);

  const taskbar = {
    siteName,
    diagrams: pickerDiagrams,
    activeDiagramId,
    open: taskbarOpen,
    onOpenChange: setTaskbarOpen,
    onSelectDiagram: (nextId: string) => void openDiagram(nextId),
    onExit: () => void exit(),
    canEdit: canEdit && !isArchive,
    editing: editing && !isArchive,
    onEditingChange: setEditing,
    onNewDiagram: () => {
      setNameError(null);
      setNaming("new");
    },
    onRenameDiagram: () => {
      setNameError(null);
      setNaming("rename");
    },
    onDeleteDiagram: () => void removeDiagram(),
    onArchiveDiagram: supportsDiagramArchive()
      ? () => {
          setArchiveError(null);
          setArchiving(true);
        }
      : undefined,
    onShowOverview: () => void showOverview(),
    onExport: () => setExportOpen(true),
  };

  const message = (children: React.ReactNode) => (
    <>
      <CenterMessage>{children}</CenterMessage>
      <DiagramTaskbar {...taskbar} canZoom={false} />
    </>
  );

  const renderBody = () => {
    if (failed) return message("This diagram couldn't be loaded. Try again.");
    if (diagrams === null) return message("Single-line diagrams aren't set up on this database yet.");
    if (diagrams?.length === 0) {
      return message(
        <>
          No diagrams at this site yet.
          {canEdit && (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={taskbar.onNewDiagram}>
              New diagram
            </Button>
          )}
        </>,
      );
    }
    if (!loaded || !activeDiagramId || !siteId) return message(<LoadingSpinner />);
    return (
      <DiagramWorkspace
        key={activeDiagramId}
        siteId={siteId}
        diagramId={activeDiagramId}
        initial={loaded}
        siteAssets={placeableAssets}
        taskbar={taskbar}
        onSave={saveChanges}
        details={details}
        workspaceRef={workspaceRef}
        linkRows={linkRows}
        onJump={jump}
        focusSymbolId={focusSymbolId}
        voltageColors={snapshot?.voltage_colors ?? voltageColors}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        archived={isArchive}
        onCopyArchive={
          canEdit
            ? () => {
                setNameError(null);
                setNaming("copy");
              }
            : undefined
        }
      />
    );
  };

  return (
    <div className="fixed inset-0 bg-white text-neutral-900 [--diagram-canvas:#fff] [--diagram-tint:100%] dark:bg-neutral-900 dark:text-neutral-100 dark:[--diagram-canvas:#171717] dark:[--diagram-tint:65%]">
      <ReactFlowProvider>{renderBody()}</ReactFlowProvider>
      <DiagramNameDialog
        open={naming !== null}
        title={
          naming === "new" ? "New diagram" : naming === "copy" ? "Copy to new diagram" : "Rename diagram"
        }
        initialName={naming === "new" ? "" : (activeDiagram?.name ?? "")}
        saving={savingName}
        error={nameError}
        onSubmit={(name) => void submitName(name)}
        onClose={() => setNaming(null)}
      />
      <DiagramOverviewDialog
        open={overviewOpen}
        overview={buildSiteOverview(liveDiagrams, linkRows)}
        activeDiagramId={activeDiagramId}
        onOpenDiagram={(nextId) => {
          setOverviewOpen(false);
          void openDiagram(nextId);
        }}
        onJump={jump}
        onClose={() => setOverviewOpen(false)}
      />
      <DiagramExportDialog
        open={exportOpen}
        diagramCount={liveDiagrams.length}
        archived={isArchive}
        initialColoring={EXPORT_COLORING[colorMode]}
        saving={exporting}
        estimate={estimateExport}
        onExport={(options, scope) => void exportPdf(options, scope)}
        onClose={() => setExportOpen(false)}
      />
      <ArchiveDiagramDialog
        open={archiving}
        diagramName={activeDiagram?.name ?? ""}
        assets={archiving && workspaceRef.current ? archivableAssets(workspaceRef.current.getContents()) : []}
        saving={archiveBusy}
        error={archiveError}
        onConfirm={(choice) => void archive(choice)}
        onClose={() => setArchiving(false)}
      />
      <ReplaceAssetDialog
        open={!!replacing && !creatingReplacement}
        identifier={replacing?.identifier ?? ""}
        candidates={replacementCandidates}
        saving={replaceBusy}
        onReplace={(newId) => {
          const chosen = siteAssets.find((asset) => asset.id === newId);
          if (chosen) void finishReplace(chosen);
        }}
        onCreateNew={() => setCreatingReplacement(true)}
        onClose={() => setReplacing(null)}
      />
      {siteId && (
        <EquipmentAssetDialog
          open={!!editingAsset || creatingReplacement}
          onClose={() => {
            setEditingAsset(null);
            setCreatingReplacement(false);
          }}
          siteId={siteId}
          siteName={siteName}
          asset={editingAsset}
          suggestions={suggestions}
          siteAssets={supportsSubAssets() ? siteAssets : undefined}
          userId={user?.id}
          onSaved={assetSaved}
        />
      )}
      <AddReportDialog
        open={!!reportForAsset}
        onClose={() => setReportForAsset(null)}
        asset={reportForAsset}
        onPickTemplate={startReport}
      />
      {trendAsset && (
        <AssetTrendsDialog
          open
          assetId={trendAsset.id}
          assetName={trendAsset.identifier}
          onClose={() => setTrendAsset(null)}
        />
      )}
    </div>
  );
}
