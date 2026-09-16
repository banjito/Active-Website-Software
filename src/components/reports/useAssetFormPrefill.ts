import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { applyAssetToForm } from "@/lib/assetFormPrefill";
import { useEquipmentAssetPrefill } from "./useEquipmentAssetPrefill";

/**
 * For a report without an asset profile: when it was started from an asset in the Assets
 * tab (`?equipmentAssetId=…`), fill its identifier, substation, location and nameplate from
 * that asset. The report is linked to the asset on first save by ensureReportAssetLink,
 * which reads the same query parameter.
 *
 * Reports with a profile in src/lib/reportAssetProfiles.ts use useReportAssetProfile instead.
 */
export function useAssetFormPrefill<T>(
  reportId: string | null | undefined,
  setFormData: Dispatch<SetStateAction<T>>,
): string | null {
  const { equipmentAssetId, asset, shouldPrefill } = useEquipmentAssetPrefill(
    reportId ?? undefined,
  );

  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!shouldPrefill || !asset || prefilledRef.current) return;
    prefilledRef.current = true;
    setFormData((prev) => applyAssetToForm(asset, prev));
  }, [shouldPrefill, asset, setFormData]);

  return equipmentAssetId;
}

export default useAssetFormPrefill;
