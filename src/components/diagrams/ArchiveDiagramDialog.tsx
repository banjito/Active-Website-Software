import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

export interface ArchiveChoice {
  retireIds: string[];
  next: "none" | "blank" | "copy";
  newName: string;
}

interface ArchiveDiagramDialogProps {
  open: boolean;
  diagramName: string;
  assets: Array<{ id: string; identifier: string }>;
  saving: boolean;
  error: string | null;
  onConfirm: (choice: ArchiveChoice) => void;
  onClose: () => void;
}

const NEXT_OPTIONS: Array<{ value: ArchiveChoice["next"]; label: string }> = [
  { value: "copy", label: "Start a new diagram from a copy of this one" },
  { value: "blank", label: "Start a new, blank diagram" },
  { value: "none", label: "Don't start a new diagram" },
];

/** Freezes a diagram when the system it shows has been redesigned. */
export default function ArchiveDiagramDialog({
  open,
  diagramName,
  assets,
  saving,
  error,
  onConfirm,
  onClose,
}: ArchiveDiagramDialogProps) {
  const [retire, setRetire] = useState<Set<string>>(new Set());
  const [next, setNext] = useState<ArchiveChoice["next"]>("copy");
  const [newName, setNewName] = useState(diagramName);

  useEffect(() => {
    if (!open) return;
    setRetire(new Set());
    setNext("copy");
    setNewName(diagramName);
  }, [open, diagramName]);

  const toggle = (id: string) => {
    const updated = new Set(retire);
    if (updated.has(id)) updated.delete(id);
    else updated.add(id);
    setRetire(updated);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="left-1/2 top-1/2 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Archive {diagramName}</DialogTitle>
          <DialogDescription>
            It becomes read-only and stays available under Archived in the diagram picker. Its
            assets and reports aren't deleted.
          </DialogDescription>
        </DialogHeader>

        {assets.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-semibold">Retire these assets</h3>
            <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
              Tick the equipment that's gone. The rest stays as it is.
            </p>
            <ul className="max-h-48 overflow-y-auto border border-neutral-200 p-2 dark:border-neutral-700">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <label className="flex items-center gap-2 py-0.5 text-sm">
                    <input
                      type="checkbox"
                      checked={retire.has(asset.id)}
                      onChange={() => toggle(asset.id)}
                    />
                    {asset.identifier}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold">What comes next</h3>
          {NEXT_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 py-0.5 text-sm">
              <input
                type="radio"
                name="after-archive"
                checked={next === option.value}
                onChange={() => setNext(option.value)}
              />
              {option.label}
            </label>
          ))}
        </section>

        {next !== "none" && (
          <Input
            label="New diagram name"
            value={newName}
            error={error ?? undefined}
            onChange={(event) => setNewName(event.target.value)}
          />
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || (next !== "none" && !newName.trim())}
            onClick={() => onConfirm({ retireIds: [...retire], next, newName: newName.trim() })}
          >
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
