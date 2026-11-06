import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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

interface ReplaceAssetDialogProps {
  open: boolean;
  identifier: string;
  /** Assets that could take its place. One already on a diagram can't, or it would be there twice. */
  candidates: Array<{ id: string; identifier: string }>;
  saving: boolean;
  onReplace: (newAssetId: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}

/** Swaps equipment on the diagrams, and retires the old asset with everything intact. */
export default function ReplaceAssetDialog({
  open,
  identifier,
  candidates,
  saving,
  onReplace,
  onCreateNew,
  onClose,
}: ReplaceAssetDialogProps) {
  const [chosen, setChosen] = useState("");

  useEffect(() => {
    if (open) setChosen("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2">
        <DialogHeader>
          <DialogTitle>Replace {identifier}</DialogTitle>
          <DialogDescription>
            {identifier} becomes Retired, and keeps its details and reports. The new asset takes its
            place and connections on every active diagram. Trends stay separate.
          </DialogDescription>
        </DialogHeader>

        <Select
          label="Replace with"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          options={[
            { value: "", label: "Choose an asset" },
            ...candidates.map((asset) => ({ value: asset.id, label: asset.identifier })),
          ]}
        />

        <Button
          type="button"
          variant="outline"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={onCreateNew}
        >
          Create a new asset instead
        </Button>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!chosen || saving} onClick={() => onReplace(chosen)}>
            Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
