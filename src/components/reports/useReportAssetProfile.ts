import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  applyAssetValuesToForm,
  getReportAssetProfile,
  type ReportAssetProfile,
} from "@/lib/reportAssetProfiles";
import type { EquipmentAsset } from "@/lib/types/assetTracking";
import { useEquipmentAssetPrefill } from "./useEquipmentAssetPrefill";

/**
 * Asset link for a report that has a profile in src/lib/reportAssetProfiles.ts.
 *
 * Fills a new report's equipment-level fields from the asset it was opened from (blanks
 * only), and hands back what the report needs to link itself to that asset on first save
 * and to offer "Save to asset" afterwards.
 *
 * `adjust` runs after the prefill, for reports whose fields drive other state (the breaker
 * reports rebuild their inspection list from the breaker type).
 */
export function useReportAssetProfile<T>(
  reportSlug: string,
  reportId: string | undefined,
  setFormData: Dispatch<SetStateAction<T>>,
  adjust?: (next: T, prev: T) => T,
): {
  profile: ReportAssetProfile;
  equipmentAssetId: string | null;
  /** For save callbacks memoised before the asset lookup finished. */
  equipmentAssetIdRef: MutableRefObject<string | null>;
  /** The asset as last saved, refreshed after "Save to asset". */
  linkedAsset: EquipmentAsset | null;
  setLinkedAsset: (asset: EquipmentAsset) => void;
} {
  const profile = getReportAssetProfile(reportSlug);
  if (!profile) throw new Error(`No asset profile for report "${reportSlug}"`);

  const { equipmentAssetId, asset, shouldPrefill } = useEquipmentAssetPrefill(reportId);

  const [linkedAsset, setLinkedAsset] = useState<EquipmentAsset | null>(asset);
  useEffect(() => setLinkedAsset(asset), [asset]);

  const equipmentAssetIdRef = useRef<string | null>(equipmentAssetId);
  equipmentAssetIdRef.current = equipmentAssetId;

  const adjustRef = useRef(adjust);
  adjustRef.current = adjust;

  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!shouldPrefill || !asset || prefilledRef.current) return;
    prefilledRef.current = true;
    setFormData((prev) => {
      const next = applyAssetValuesToForm(profile, asset, prev);
      return adjustRef.current ? adjustRef.current(next, prev) : next;
    });
    // profile is a module constant per slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPrefill, asset, setFormData]);

  return { profile, equipmentAssetId, equipmentAssetIdRef, linkedAsset, setLinkedAsset };
}

export default useReportAssetProfile;
