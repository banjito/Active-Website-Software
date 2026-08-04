import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  toPrefill,
  type EquipmentAsset,
  type EquipmentAssetPrefill,
} from "@/lib/types/assetTracking";

const EMPTY_PREFILL: EquipmentAssetPrefill = {
  identifier: "",
  substation: "",
  eqptLocation: "",
  equipmentType: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
};

interface UseEquipmentAssetPrefillResult {
  /** The registry asset this report belongs to, if any. */
  equipmentAssetId: string | null;
  asset: EquipmentAsset | null;
  /** Report-form field values taken from the asset. Empty strings when unknown. */
  prefill: EquipmentAssetPrefill;
  /** True until we know whether there is an asset — hold off prefilling before then. */
  loading: boolean;
  /** True only for a brand-new report opened from an asset row. */
  shouldPrefill: boolean;
}

/**
 * Resolve the equipment asset a report belongs to.
 *
 * Two ways in:
 *  - `?equipmentAssetId=…` — a new report started from an asset row in the Assets tab.
 *  - an existing report — looked up through its own neta_ops.assets row.
 *
 * A report form calls this, then copies `prefill` into its state when `shouldPrefill` is
 * true, and passes `equipmentAssetId` to `createReportAsset` on first save.
 */
export function useEquipmentAssetPrefill(
  reportId?: string,
): UseEquipmentAssetPrefillResult {
  const [searchParams] = useSearchParams();
  const fromUrl = searchParams.get("equipmentAssetId");

  const [asset, setAsset] = useState<EquipmentAsset | null>(null);
  const [equipmentAssetId, setEquipmentAssetId] = useState<string | null>(fromUrl);
  const [loading, setLoading] = useState(Boolean(fromUrl) || Boolean(reportId));

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let targetId = fromUrl;

      // Existing report: find the equipment link through its document row.
      if (!targetId && reportId) {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("assets")
          .select("equipment_asset_id")
          .like("file_url", `%/${reportId}%`)
          .limit(1)
          .maybeSingle();
        if (!error) targetId = (data as any)?.equipment_asset_id ?? null;
      }

      if (!targetId) {
        if (!cancelled) {
          setAsset(null);
          setEquipmentAssetId(null);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .schema("neta_ops")
        .from("equipment_assets")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      if (cancelled) return;
      // Missing table/column just means the migration hasn't run — behave as before.
      setAsset(error ? null : ((data as EquipmentAsset) ?? null));
      setEquipmentAssetId(error ? null : targetId);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fromUrl, reportId]);

  return {
    equipmentAssetId,
    asset,
    prefill: asset ? toPrefill(asset) : EMPTY_PREFILL,
    loading,
    // Only seed a new report. An existing one already holds whatever was typed.
    shouldPrefill: Boolean(asset) && Boolean(fromUrl) && !reportId,
  };
}

export default useEquipmentAssetPrefill;
