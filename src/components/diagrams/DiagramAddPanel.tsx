import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import DiagramSymbol from "@/components/diagrams/DiagramSymbol";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SiteAsset } from "@/lib/diagrams/editing";
import {
  BUILT_IN_SYMBOL_KEYS,
  getSymbolGeometry,
  placeableCustomSymbols,
  symbolKeyForEquipmentType,
} from "@/lib/diagrams/symbols";

/** What's being dragged onto the canvas. */
export const DRAG_TYPE = "application/x-diagram-item";
/**
 * Marks a drag as a cable. A drag's contents can't be read until it's dropped, but its types
 * can, and that's what lets a line light up under a cable before the drop.
 */
export const CABLE_DRAG_TYPE = "application/x-diagram-cable";

export type DiagramAddItem = { kind: "asset"; assetId: string } | { kind: "symbol"; symbolKey: string };

/** Drawn on their own, without an asset. Equipment comes in from the Assets list. */
const STAND_ALONE_KEYS = BUILT_IN_SYMBOL_KEYS.filter((key) => key !== "generic");

interface DiagramAddPanelProps {
  /** The site's assets that can still be placed on this diagram. */
  assets: SiteAsset[];
  onAdd: (item: DiagramAddItem) => void;
  onClose: () => void;
}

const startDrag = (item: DiagramAddItem, isCable: boolean) => (event: React.DragEvent) => {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
  if (isCable) event.dataTransfer.setData(CABLE_DRAG_TYPE, "true");
  event.dataTransfer.effectAllowed = "copy";
};

/** Drag an item onto the diagram, or click it to drop it in the middle of the view. */
export default function DiagramAddPanel({ assets, onAdd, onClose }: DiagramAddPanelProps) {
  const [tab, setTab] = useState<"assets" | "symbols">("assets");
  const [search, setSearch] = useState("");

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return assets;
    return assets.filter((asset) =>
      `${asset.identifier} ${asset.equipment_type ?? ""}`.toLowerCase().includes(term),
    );
  }, [assets, search]);

  const tabClass = (active: boolean) =>
    `flex-1 border-b-2 px-3 py-2 text-sm font-medium ${
      active ? "border-brand text-brand" : "border-transparent text-neutral-500 dark:text-neutral-400"
    }`;

  return (
    <div className="absolute left-3 top-44 z-10 flex max-h-[calc(100vh-12rem)] print:hidden w-72 max-w-[calc(100vw-1.5rem)] flex-col border border-neutral-200 bg-white shadow-md dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-center">
        <button type="button" className={tabClass(tab === "assets")} onClick={() => setTab("assets")}>
          Assets
        </button>
        <button type="button" className={tabClass(tab === "symbols")} onClick={() => setTab("symbols")}>
          Symbols
        </button>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" title="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {tab === "assets" ? (
        <>
          <div className="p-2">
            <Input
              aria-label="Search assets"
              placeholder="Search assets"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {matches.length === 0 && (
              <p className="p-3 text-sm text-neutral-500 dark:text-neutral-400">
                {assets.length === 0 ? "Every asset is on this diagram." : "No matches."}
              </p>
            )}
            {matches.map((asset) => (
              <button
                key={asset.id}
                type="button"
                draggable
                onDragStart={startDrag(
                  { kind: "asset", assetId: asset.id },
                  symbolKeyForEquipmentType(asset.equipment_type) === "cable",
                )}
                onClick={() => onAdd({ kind: "asset", assetId: asset.id })}
                className="block w-full cursor-grab px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <span className="block truncate text-sm font-medium">{asset.identifier}</span>
                <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {asset.equipment_type || "No equipment type"}
                  {symbolKeyForEquipmentType(asset.equipment_type) === "bus" && " · adds as a bus"}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-1 overflow-y-auto p-2">
          {[...STAND_ALONE_KEYS, ...placeableCustomSymbols().map((symbol) => symbol.key)].map((key) => (
            <button
              key={key}
              type="button"
              draggable
              onDragStart={startDrag({ kind: "symbol", symbolKey: key }, key === "cable")}
              onClick={() => onAdd({ kind: "symbol", symbolKey: key })}
              className="flex cursor-grab flex-col items-center gap-1 p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              <span className="flex h-16 items-center justify-center overflow-hidden">
                <DiagramSymbol symbolKey={key} width={key === "bus" ? 60 : undefined} />
              </span>
              <span className="w-full truncate text-center text-xs">{getSymbolGeometry(key).label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
