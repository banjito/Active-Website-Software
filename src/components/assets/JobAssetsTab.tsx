import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, FileSpreadsheet, ListPlus, Plus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchSites, type SiteWithCounts } from "@/services/sitesService";
import {
  deleteEquipmentAsset,
  fetchAssetsForJob,
  fetchAssetsForSite,
  fetchEquipmentTypes,
  fetchSiteFieldSuggestions,
  linkAssetsToJob,
  linkReportDocumentToAsset,
  setAssetParent,
  supportsSubAssets,
  unlinkAssetFromJob,
} from "@/services/equipmentAssetsService";
import {
  fetchScheduledTestsForSite,
  supportsScheduling,
} from "@/services/scheduledTestsService";
import EquipmentAssetsTable, { type LinkedReport } from "./EquipmentAssetsTable";
import EquipmentAssetDialog, {
  type AssetFieldSuggestions,
} from "./EquipmentAssetDialog";
import DuplicateAssetDialog from "./DuplicateAssetDialog";
import BulkAssetImportDialog from "./BulkAssetImportDialog";
import AddAssetsFromSiteDialog from "./AddAssetsFromSiteDialog";
import AdoptExistingReportsDialog, {
  type ExistingReportAsset,
} from "./AdoptExistingReportsDialog";
import AddReportDialog from "./AddReportDialog";
import ScheduleTestDialog from "./ScheduleTestDialog";
import type { ReportTemplateChoice } from "./useReportTemplateChoices";
import type { ScheduledTest } from "@/lib/types/testScheduling";
import type {
  EquipmentAsset,
  EquipmentAssetWithCounts,
} from "@/lib/types/assetTracking";

interface JobAssetsTabProps {
  jobId: string;
  customerName?: string;
  /** Report documents already on this job, with the identifiers the job page derived. */
  reportAssets: ExistingReportAsset[];
  /**
   * Called when this tab changes which equipment a report points at, so the job page can
   * refresh the reports list it owns.
   */
  onReportLinksChanged?: () => void;
}

/**
 * The project's asset skeleton.
 *
 * Assets live at the site, not on the job and not under a customer — we work for
 * different customers at the same facility on the same equipment. This tab scopes the
 * site's registry down to what this project covers.
 */
export default function JobAssetsTab({
  jobId,
  customerName,
  reportAssets,
  onReportLinksChanged,
}: JobAssetsTabProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getUserRole, isAdmin } = usePermissions();
  const role = getUserRole();
  const canEdit =
    isAdmin ||
    ["Admin", "Super Admin", "Office Admin", "Manager", "NETA Technician"].includes(
      role as string,
    );

  const [siteId, setSiteId] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [sites, setSites] = useState<SiteWithCounts[]>([]);
  const [assets, setAssets] = useState<EquipmentAssetWithCounts[]>([]);
  /** The whole site's registry — backs duplicate checks and the parent-asset picker. */
  const [siteAssets, setSiteAssets] = useState<EquipmentAssetWithCounts[]>([]);
  const [siteAssetIds, setSiteAssetIds] = useState<Map<string, string>>(new Map());
  const [siteIdentifiers, setSiteIdentifiers] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<AssetFieldSuggestions>({
    buildingAreas: [],
    substations: [],
    locations: [],
    equipmentTypes: [],
  });
  const [loading, setLoading] = useState(true);
  const [savingSite, setSavingSite] = useState(false);

  const [addingAsset, setAddingAsset] = useState(false);
  const [editingAsset, setEditingAsset] = useState<EquipmentAsset | null>(null);
  const [duplicating, setDuplicating] = useState<EquipmentAsset | null>(null);
  const [importing, setImporting] = useState(false);
  const [addingFromSite, setAddingFromSite] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [reportForAsset, setReportForAsset] =
    useState<EquipmentAssetWithCounts | null>(null);
  /** Assets the Schedule test modal is open for — one row, or a whole ticked selection. */
  const [schedulingFor, setSchedulingFor] = useState<EquipmentAssetWithCounts[]>([]);
  /** The site's existing schedule, so the modal can warn about scheduling a scope twice. */
  const [scheduledTests, setScheduledTests] = useState<ScheduledTest[]>([]);

  /** Identifier by asset id, so the attach dialog can name whoever owns a report today. */
  const assetNamesById = useMemo(
    () => new Map(siteAssets.map((a) => [a.id, a.identifier])),
    [siteAssets],
  );

  /** The reports pointing at each asset, so a row can list them rather than just count them. */
  const reportsByAsset = useMemo(() => {
    const map = new Map<string, LinkedReport[]>();
    for (const report of reportAssets) {
      if (!report.equipmentAssetId) continue;
      map.set(report.equipmentAssetId, [
        ...(map.get(report.equipmentAssetId) ?? []),
        { id: report.id, name: report.name, url: report.url },
      ]);
    }
    return map;
  }, [reportAssets]);

  const site = useMemo(() => sites.find((s) => s.id === siteId) ?? null, [sites, siteId]);

  useEffect(() => {
    fetchSites()
      .then(setSites)
      .catch((e) => {
        console.error(e);
        toast.error("Failed to load sites");
      });
  }, []);

  // Read the job's site here rather than through the shared job fetch, so a job page
  // still loads normally on an instance where the asset-tracking migration hasn't run.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("site_id")
        .eq("id", jobId)
        .maybeSingle();

      // 42703 = column missing, i.e. migration not applied yet.
      if (error?.code === "42703" || error?.code === "42P01") {
        setMigrationMissing(true);
        setLoading(false);
        return;
      }
      if (error) {
        console.error(error);
        return;
      }
      setSiteId((data as any)?.site_id ?? null);
    })();
  }, [jobId]);

  /**
   * `silent` refetches in the background: the table stays mounted, so the search box,
   * sort and filters the user set up are still there afterwards. Only the first load of
   * the tab is allowed to blank the page out with a spinner.
   */
  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const jobAssets = await fetchAssetsForJob(jobId);
        setAssets(jobAssets);

        if (siteId) {
          // The whole site's assets back the duplicate/import duplicate checks — an
          // identifier can clash with equipment that isn't on this job.
          const [all, fieldSuggestions, types, tests] = await Promise.all([
            fetchAssetsForSite(siteId),
            fetchSiteFieldSuggestions(siteId),
            fetchEquipmentTypes(),
            fetchScheduledTestsForSite(siteId),
          ]);
          setSiteAssets(all);
          setSiteIdentifiers(new Set(all.map((a) => a.identifier.toLowerCase())));
          setSiteAssetIds(new Map(all.map((a) => [a.identifier.toLowerCase(), a.id])));
          setSuggestions({ ...fieldSuggestions, equipmentTypes: types });
          setScheduledTests(tests);
        } else {
          setSiteAssets([]);
          setSiteIdentifiers(new Set());
          setSiteAssetIds(new Map());
          setScheduledTests([]);
        }
      } catch (e) {
        console.error(e);
        toast.error("Failed to load job assets");
      } finally {
        setLoading(false);
      }
    },
    [jobId, siteId],
  );

  /** Write an edited asset straight into the list — no refetch, no spinner, no scroll jump. */
  const applyLocalEdit = useCallback((saved: EquipmentAsset) => {
    const merge = (list: EquipmentAssetWithCounts[]): EquipmentAssetWithCounts[] =>
      list.map((a) => (a.id === saved.id ? { ...a, ...saved } : a));
    setAssets(merge);
    setSiteAssets(merge);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assignSite = async (nextSiteId: string) => {
    if (!nextSiteId) return;
    setSavingSite(true);
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update({ site_id: nextSiteId })
        .eq("id", jobId);
      if (error) throw error;
      toast.success("Site set for this job");
      setSiteId(nextSiteId);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to set site");
    } finally {
      setSavingSite(false);
    }
  };

  /** New assets created from this tab join the job as well as the site. */
  const linkAndReload = async (created: EquipmentAsset[]) => {
    try {
      if (created.length > 0) {
        await linkAssetsToJob(jobId, created.map((a) => a.id), user?.id);
      }
    } catch (e) {
      console.error(e);
      toast.error("Assets were saved but could not be added to this job");
    } finally {
      void load({ silent: true });
    }
  };

  const handleDelete = async (asset: EquipmentAssetWithCounts) => {
    if (
      !window.confirm(
        `Delete "${asset.identifier}" from ${site?.name ?? "the site"}? This removes it everywhere, not just from this job.`,
      )
    )
      return;
    try {
      await deleteEquipmentAsset(asset.id);
      toast.success("Asset deleted");
      // Drop the row now; the background refetch picks up any sub-assets it detached.
      setAssets((current) => current.filter((a) => a.id !== asset.id));
      void load({ silent: true });
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete asset");
    }
  };

  const handleRemoveFromJob = async (asset: EquipmentAssetWithCounts) => {
    try {
      await unlinkAssetFromJob(jobId, asset.id);
      toast.success(`${asset.identifier} removed from this job`);
      setAssets((current) => current.filter((a) => a.id !== asset.id));
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove asset");
      void load({ silent: true });
    }
  };

  /**
   * Break the link between a report and the equipment it claims to describe. The report
   * itself is untouched and stays on the job, so this is the fix for a report attached to
   * the wrong asset: unlink here, then attach it to the right one.
   */
  const handleDetachReport = async (
    asset: EquipmentAssetWithCounts,
    report: LinkedReport,
  ) => {
    if (
      !window.confirm(
        `Unlink "${report.name || "this report"}" from ${asset.identifier}?\n\nThe report is kept and stays on this job. It just stops being attached to this asset.`,
      )
    )
      return;
    try {
      await linkReportDocumentToAsset(report.id, null);
      toast.success(`Unlinked from ${asset.identifier}`);
      onReportLinksChanged?.();
      void load({ silent: true });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to unlink report");
    }
  };

  const handleDetachFromParent = async (asset: EquipmentAssetWithCounts) => {
    try {
      const saved = await setAssetParent(asset.id, null, user?.id);
      applyLocalEdit(saved);
      toast.success(`${asset.identifier} is no longer a sub-asset`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to detach sub-asset");
    }
  };

  const openReport = (choice: ReportTemplateChoice) => {
    const asset = reportForAsset;
    if (!asset) return;
    const path = choice.customFormTemplateId
      ? `/jobs/${jobId}/custom-form/${choice.customFormTemplateId}/new`
      : `/jobs/${jobId}/${choice.slug}`;
    navigate(`${path}?equipmentAssetId=${asset.id}&returnToAssets=true`);
  };

  // ── Migration not applied ──────────────────────────────────────────────────
  if (migrationMissing) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700 dark:bg-amber-950">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Asset tracking isn't set up on this database yet. Run{" "}
            <code className="font-mono">
              database/migrations/create_asset_tracking_tables.sql
            </code>{" "}
            in the Supabase SQL editor, then reload.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // ── No site yet ────────────────────────────────────────────────────────────
  if (!siteId) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-lg border border-neutral-200 p-6 text-center dark:border-neutral-700">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-neutral-400" />
          <h3 className="mb-1 text-lg font-medium">Which facility is this job at?</h3>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            Assets belong to the site, so the same equipment list serves every project
            there
            {customerName ? ` — including work for customers other than ${customerName}` : ""}.
          </p>
          <div className="mx-auto max-w-xs">
            <Select
              value=""
              disabled={savingSite}
              onChange={(e) => void assignSite(e.target.value)}
              options={[
                { value: "", label: "Select a site…" },
                ...sites.map((s) => ({
                  value: s.id,
                  label: [s.name, [s.city, s.state].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" — "),
                })),
              ]}
            />
          </div>
          <p className="mt-4 text-sm">
            <Link to="/sites" className="text-brand hover:underline">
              Manage sites
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const onJobIds = new Set(assets.map((a) => a.id));
  const adoptable = reportAssets.filter(
    (r) => !r.equipmentAssetId && r.identifier?.trim(),
  ).length;

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3 dark:border-neutral-700">
        <Building2 className="h-4 w-4 text-neutral-400" />
        <span className="text-sm text-neutral-500 dark:text-neutral-400">Site:</span>
        <Link
          to={`/sites/${siteId}`}
          className="text-sm font-medium text-brand hover:underline"
        >
          {site?.name ?? "Unknown site"}
        </Link>
        {customerName && (
          <span className="text-sm text-neutral-400">· Customer: {customerName}</span>
        )}
        {canEdit && (
          <div className="ml-auto w-56">
            <Select
              value={siteId}
              disabled={savingSite}
              onChange={(e) => void assignSite(e.target.value)}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
        )}
      </div>

      <EquipmentAssetsTable
        assets={assets}
        canEdit={canEdit}
        storageKey={`job-assets:${jobId}`}
        onEdit={setEditingAsset}
        onDuplicate={setDuplicating}
        onDelete={handleDelete}
        onAddReport={setReportForAsset}
        onScheduleTest={
          canEdit && supportsScheduling()
            ? (asset) => setSchedulingFor([asset])
            : undefined
        }
        onBatchSchedule={
          canEdit && supportsScheduling() ? (picked) => setSchedulingFor(picked) : undefined
        }
        reportsByAsset={reportsByAsset}
        onOpenReport={(report) => report.url && navigate(report.url)}
        onDetachReport={canEdit ? handleDetachReport : undefined}
        onRemoveFromJob={canEdit ? handleRemoveFromJob : undefined}
        onDetachFromParent={
          canEdit && supportsSubAssets() ? handleDetachFromParent : undefined
        }
        emptyMessage="No assets on this job yet. Add them from the site's list, import a spreadsheet, or build them from the reports already here."
        actions={
          canEdit && (
            <>
              {adoptable > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setAdopting(true)}
                  leftIcon={<Wand2 className="h-4 w-4" />}
                >
                  Build from existing reports ({adoptable})
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setImporting(true)}
                leftIcon={<FileSpreadsheet className="h-4 w-4" />}
              >
                Import from Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => setAddingFromSite(true)}
                leftIcon={<ListPlus className="h-4 w-4" />}
              >
                Add from site
              </Button>
              <Button
                onClick={() => setAddingAsset(true)}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add asset
              </Button>
            </>
          )
        }
      />

      <EquipmentAssetDialog
        open={addingAsset || !!editingAsset}
        onClose={() => {
          setAddingAsset(false);
          setEditingAsset(null);
        }}
        siteId={siteId}
        siteName={site?.name ?? ""}
        asset={editingAsset}
        suggestions={suggestions}
        siteAssets={supportsSubAssets() ? siteAssets : undefined}
        userId={user?.id}
        onSaved={(asset, wasCreated) => {
          // An edit is patched straight into the list; only a brand-new asset needs the
          // round trip, because it has to be linked to the job first.
          if (wasCreated) void linkAndReload([asset]);
          else applyLocalEdit(asset);
        }}
      />

      <DuplicateAssetDialog
        open={!!duplicating}
        onClose={() => setDuplicating(null)}
        asset={duplicating}
        existingIdentifiers={siteIdentifiers}
        userId={user?.id}
        onDone={(created) => void linkAndReload(created)}
      />

      <BulkAssetImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        siteId={siteId}
        siteName={site?.name ?? ""}
        existingIdentifiers={siteIdentifiers}
        siteAssets={supportsSubAssets() ? siteAssets : undefined}
        knownEquipmentTypes={suggestions.equipmentTypes}
        userId={user?.id}
        alsoLinksToJob
        onImported={(created) => void linkAndReload(created)}
      />

      <AddAssetsFromSiteDialog
        open={addingFromSite}
        onClose={() => setAddingFromSite(false)}
        jobId={jobId}
        siteId={siteId}
        siteName={site?.name ?? ""}
        alreadyOnJob={onJobIds}
        userId={user?.id}
        onAdded={() => void load({ silent: true })}
      />

      <AdoptExistingReportsDialog
        open={adopting}
        onClose={() => setAdopting(false)}
        jobId={jobId}
        siteId={siteId}
        siteName={site?.name ?? ""}
        reportAssets={reportAssets}
        existingIdentifiers={siteIdentifiers}
        assetIdByIdentifier={siteAssetIds}
        userId={user?.id}
        onDone={() => void load({ silent: true })}
      />

      <AddReportDialog
        open={!!reportForAsset}
        onClose={() => setReportForAsset(null)}
        asset={reportForAsset}
        onPickTemplate={openReport}
        reportAssets={canEdit ? reportAssets : undefined}
        assetNamesById={assetNamesById}
        onLinksChanged={() => {
          // The report list lives on the job page; the counts live here.
          onReportLinksChanged?.();
          void load({ silent: true });
        }}
      />

      <ScheduleTestDialog
        open={schedulingFor.length > 0}
        onClose={() => setSchedulingFor([])}
        siteId={siteId}
        jobId={jobId}
        assets={schedulingFor}
        siteAssets={supportsSubAssets() ? siteAssets : undefined}
        existingTests={scheduledTests}
        userId={user?.id}
        onScheduled={(created) => {
          setScheduledTests((current) => [...current, ...created]);
          setSchedulingFor([]);
        }}
      />
    </div>
  );
}
