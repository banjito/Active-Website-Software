import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "react-hot-toast";
import {
  fetchAssetsForSite,
  linkAssetsToJob,
} from "@/services/equipmentAssetsService";
import { compareAlphanumericLabels } from "@/utils/sortUtils";
import type { EquipmentAssetWithCounts } from "@/lib/types/assetTracking";

interface AddAssetsFromSiteDialogProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  siteId: string;
  siteName: string;
  /** Asset ids already on this job — shown but not selectable. */
  alreadyOnJob: Set<string>;
  userId?: string;
  onAdded: () => void;
}

/**
 * Pull a subset of a site's assets into this job.
 *
 * This is the flow that makes the registry worth having: ATL2's full equipment list is
 * loaded once, and each project scopes itself to the part it covers (e.g. just DC7).
 */
export function AddAssetsFromSiteDialog({
  open,
  onClose,
  jobId,
  siteId,
  siteName,
  alreadyOnJob,
  userId,
  onAdded,
}: AddAssetsFromSiteDialogProps) {
  const [assets, setAssets] = useState<EquipmentAssetWithCounts[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [substationFilter, setSubstationFilter] = useState("all");

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSearch("");
    setBuildingFilter("all");
    setSubstationFilter("all");
    setLoading(true);
    fetchAssetsForSite(siteId)
      .then(setAssets)
      .catch((e) => {
        console.error(e);
        toast.error("Failed to load site assets");
      })
      .finally(() => setLoading(false));
  }, [open, siteId]);

  const available = useMemo(
    () => assets.filter((a) => !alreadyOnJob.has(a.id)),
    [assets, alreadyOnJob],
  );

  const buildingOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of available) if (a.building_area?.trim()) set.add(a.building_area.trim());
    return [
      { value: "all", label: "All buildings / areas" },
      ...Array.from(set).sort(compareAlphanumericLabels).map((s) => ({ value: s, label: s })),
    ];
  }, [available]);

  const substationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of available) if (a.substation?.trim()) set.add(a.substation.trim());
    return [
      { value: "all", label: "All substations" },
      ...Array.from(set).sort(compareAlphanumericLabels).map((s) => ({ value: s, label: s })),
    ];
  }, [available]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return available
      .filter((a) => {
        if (buildingFilter !== "all" && (a.building_area ?? "") !== buildingFilter)
          return false;
        if (substationFilter !== "all" && (a.substation ?? "") !== substationFilter)
          return false;
        if (!term) return true;
        return [a.identifier, a.equipment_type, a.equipment_location, a.substation]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));
      })
      .sort((a, b) => compareAlphanumericLabels(a.identifier, b.identifier));
  }, [available, search, buildingFilter, substationFilter]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((a) => selected.has(a.id));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const a of visible) next.delete(a.id);
      else for (const a of visible) next.add(a.id);
      return next;
    });
  };

  const add = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const count = await linkAssetsToJob(jobId, Array.from(selected), userId);
      toast.success(`Added ${count || selected.size} assets to this job`);
      onAdded();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to add assets");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Add assets from {siteName}</DialogTitle>
          <DialogDescription>
            Pick the equipment this job covers. Assets stay registered at the site and
            remain available to other projects.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full sm:w-48"
            />
            <div className="w-full sm:w-48">
              <Select
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
                options={buildingOptions}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                value={substationFilter}
                onChange={(e) => setSubstationFilter(e.target.value)}
                options={substationOptions}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          ) : available.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {assets.length === 0
                ? "This site has no assets yet. Add or import them first."
                : "Every asset at this site is already on this job."}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-neutral-700 dark:text-neutral-200">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                  />
                  Select all {visible.length} shown
                </label>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {selected.size} selected
                </span>
              </div>

              <div className="max-h-[45vh] overflow-y-auto border border-neutral-200 dark:border-neutral-700">
                {visible.map((a) => (
                  <label
                    key={a.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2 text-sm last:border-b-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(a.id)) next.delete(a.id);
                          else next.add(a.id);
                          return next;
                        })
                      }
                    />
                    <span className="font-medium">{a.identifier}</span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {[a.building_area, a.substation, a.equipment_location]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                    {a.equipment_type && (
                      <span className="ml-auto text-xs text-neutral-400">
                        {a.equipment_type}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={add} disabled={saving || selected.size === 0}>
            {saving ? "Adding…" : `Add ${selected.size} to job`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddAssetsFromSiteDialog;
