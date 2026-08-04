import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, FileSpreadsheet, Plus } from "lucide-react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "react-hot-toast";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchSite } from "@/services/sitesService";
import {
  deleteEquipmentAsset,
  fetchAssetsForSite,
  fetchEquipmentTypes,
  fetchSiteFieldSuggestions,
} from "@/services/equipmentAssetsService";
import EquipmentAssetsTable from "@/components/assets/EquipmentAssetsTable";
import EquipmentAssetDialog, {
  type AssetFieldSuggestions,
} from "@/components/assets/EquipmentAssetDialog";
import DuplicateAssetDialog from "@/components/assets/DuplicateAssetDialog";
import BulkAssetImportDialog from "@/components/assets/BulkAssetImportDialog";
import type {
  EquipmentAsset,
  EquipmentAssetWithCounts,
  Site,
} from "@/lib/types/assetTracking";

/**
 * A facility's master equipment list. This is where a site is loaded up once — normally
 * by importing a spreadsheet — and every job at the site then pulls from it.
 */
export default function SiteDetailPage() {
  const { siteId, division } = useParams<{ siteId: string; division?: string }>();
  const basePath = division ? `/${division}` : "";
  const { user } = useAuth();
  const { getUserRole, isAdmin } = usePermissions();
  const role = getUserRole();
  const canEdit =
    isAdmin ||
    ["Admin", "Super Admin", "Office Admin", "Manager", "NETA Technician"].includes(
      role as string,
    );

  const [site, setSite] = useState<Site | null>(null);
  const [assets, setAssets] = useState<EquipmentAssetWithCounts[]>([]);
  const [suggestions, setSuggestions] = useState<AssetFieldSuggestions>({
    buildingAreas: [],
    substations: [],
    locations: [],
    equipmentTypes: [],
  });
  const [loading, setLoading] = useState(true);

  const [editingAsset, setEditingAsset] = useState<EquipmentAsset | null>(null);
  const [addingAsset, setAddingAsset] = useState(false);
  const [duplicating, setDuplicating] = useState<EquipmentAsset | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const [siteRow, assetRows, fieldSuggestions, types] = await Promise.all([
        fetchSite(siteId),
        fetchAssetsForSite(siteId),
        fetchSiteFieldSuggestions(siteId),
        fetchEquipmentTypes(),
      ]);
      setSite(siteRow);
      setAssets(assetRows);
      setSuggestions({ ...fieldSuggestions, equipmentTypes: types });
    } catch (e) {
      console.error(e);
      toast.error("Failed to load site");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const existingIdentifiers = useMemo(
    () => new Set(assets.map((a) => a.identifier.toLowerCase())),
    [assets],
  );

  const handleDelete = async (asset: EquipmentAssetWithCounts) => {
    if (!window.confirm(`Delete "${asset.identifier}"?`)) return;
    try {
      await deleteEquipmentAsset(asset.id);
      toast.success("Asset deleted");
      void load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete asset");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="p-6">
        <p className="text-neutral-600 dark:text-neutral-300">Site not found.</p>
        <Link to={`${basePath}/sites`} className="text-brand hover:underline">
          Back to sites
        </Link>
      </div>
    );
  }

  const place = [site.city, site.state].filter(Boolean).join(", ");

  return (
    <div className="p-4 sm:p-6">
      <Link
        to={`${basePath}/sites`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-brand dark:text-neutral-400"
      >
        <ArrowLeft className="h-4 w-4" />
        All sites
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {site.name}
            {place && (
              <span className="text-base font-normal text-neutral-500 dark:text-neutral-400">
                {place}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {site.address ? `${site.address} · ` : ""}
            Master equipment list for this facility. Every job here draws from it, so
            identifiers stay consistent from project to project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EquipmentAssetsTable
            assets={assets}
            canEdit={canEdit}
            onEdit={setEditingAsset}
            onDuplicate={setDuplicating}
            onDelete={handleDelete}
            emptyMessage="No equipment registered at this site yet. Import a spreadsheet to load it in one go."
            actions={
              canEdit && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setImporting(true)}
                    leftIcon={<FileSpreadsheet className="h-4 w-4" />}
                  >
                    Import from Excel
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
        </CardContent>
      </Card>

      <EquipmentAssetDialog
        open={addingAsset || !!editingAsset}
        onClose={() => {
          setAddingAsset(false);
          setEditingAsset(null);
        }}
        siteId={site.id}
        siteName={site.name}
        asset={editingAsset}
        suggestions={suggestions}
        userId={user?.id}
        onSaved={() => void load()}
      />

      <DuplicateAssetDialog
        open={!!duplicating}
        onClose={() => setDuplicating(null)}
        asset={duplicating}
        existingIdentifiers={existingIdentifiers}
        userId={user?.id}
        onDone={() => void load()}
      />

      <BulkAssetImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        siteId={site.id}
        siteName={site.name}
        existingIdentifiers={existingIdentifiers}
        knownEquipmentTypes={suggestions.equipmentTypes}
        userId={user?.id}
        onImported={() => void load()}
      />
    </div>
  );
}
