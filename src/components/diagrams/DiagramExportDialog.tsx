import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import {
  ARCH_SIZES,
  MIN_TEXT_SIZE,
  type ArchSize,
  type SheetColoring,
  type SheetOptions,
} from "@/lib/diagrams/sheet";

export type ExportScope = "this" | "all";

interface DiagramExportDialogProps {
  open: boolean;
  /** How many active diagrams a full set holds. Under two, there's no choice to offer. */
  diagramCount: number;
  /** Archives print on their own. */
  archived: boolean;
  initialColoring: SheetColoring;
  saving: boolean;
  /** Label size on paper for these settings, and the sheet that would fix it if too small. */
  estimate: (options: SheetOptions) => { textSize: number; better: ArchSize | null };
  onExport: (options: SheetOptions, scope: ExportScope) => void;
  onClose: () => void;
}

const SIZE_OPTIONS = (Object.keys(ARCH_SIZES) as ArchSize[]).map((size) => ({
  value: size,
  label: ARCH_SIZES[size].label,
}));

const COLORING_OPTIONS = [
  { value: "voltage", label: "Voltage level" },
  { value: "status", label: "Report status" },
  { value: "none", label: "Black and white" },
];

export default function DiagramExportDialog({
  open,
  diagramCount,
  archived,
  initialColoring,
  saving,
  estimate,
  onExport,
  onClose,
}: DiagramExportDialogProps) {
  const [size, setSize] = useState<ArchSize>("D");
  const [orientation, setOrientation] = useState<SheetOptions["orientation"]>("landscape");
  const [coloring, setColoring] = useState<SheetColoring>(initialColoring);
  const [scope, setScope] = useState<ExportScope>("this");

  useEffect(() => {
    if (open) {
      setColoring(initialColoring);
      setScope("this");
    }
  }, [open, initialColoring]);

  const options = useMemo(() => ({ size, orientation, coloring }), [size, orientation, coloring]);
  const result = useMemo(() => (open ? estimate(options) : null), [open, estimate, options]);
  const tooSmall = !!result && result.textSize < MIN_TEXT_SIZE;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2">
        <DialogHeader>
          <DialogTitle>Export PDF</DialogTitle>
          <DialogDescription>
            Lines and text stay sharp at any zoom. The PDF shows the diagram as it is now, and won't
            update afterward.
          </DialogDescription>
        </DialogHeader>

        <Select
          label="Page size"
          value={size}
          onChange={(event) => setSize(event.target.value as ArchSize)}
          options={SIZE_OPTIONS}
        />
        <Select
          label="Page direction"
          value={orientation}
          onChange={(event) => setOrientation(event.target.value as SheetOptions["orientation"])}
          options={[
            { value: "landscape", label: "Landscape" },
            { value: "portrait", label: "Portrait" },
          ]}
        />
        <Select
          label="Coloring"
          value={coloring}
          onChange={(event) => setColoring(event.target.value as SheetColoring)}
          options={COLORING_OPTIONS}
        />
        {diagramCount > 1 && !archived && (
          <Select
            label="Include"
            value={scope}
            onChange={(event) => setScope(event.target.value as ExportScope)}
            options={[
              { value: "this", label: "This diagram" },
              { value: "all", label: `All ${diagramCount} diagrams, one per sheet` },
            ]}
          />
        )}

        {tooSmall && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Labels would print at about {result.textSize.toFixed(1)} pt, which is hard to read.
            {result.better
              ? ` ${ARCH_SIZES[result.better].label} keeps them readable.`
              : " Try splitting this diagram into linked diagrams."}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => onExport(options, scope)}>
            {saving ? "Exporting" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
