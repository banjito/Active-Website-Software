import { useEffect, useState } from "react";
import { placementsByAsset, type DiagramLinkTarget } from "@/lib/diagrams/links";
import { fetchDiagramLinkRows, fetchSiteDiagrams } from "@/services/siteDiagramsService";

/**
 * Which diagrams each asset at a site is on, so the asset list can offer "Show on diagram".
 * The list works the same without it, so a failed lookup just leaves the button out.
 */
export function useAssetDiagramPlacements(siteId: string | null | undefined) {
  const [placements, setPlacements] = useState<Map<string, DiagramLinkTarget[]>>(new Map());

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    const load = async () => {
      const diagrams = await fetchSiteDiagrams(siteId);
      if (!diagrams) return;
      const active = diagrams.filter((diagram) => !diagram.archived_at);
      const rows = await fetchDiagramLinkRows(active.map((diagram) => diagram.id));
      if (!cancelled) setPlacements(placementsByAsset(active, rows));
    };

    load().catch((error) => console.error("Failed to load diagram placements:", error));

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return placements;
}
