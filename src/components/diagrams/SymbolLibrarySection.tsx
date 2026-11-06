import React, { useState } from "react";
import { Pencil, PenTool, Trash2, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import CustomSymbolDialog, { type NewCustomSymbol } from "@/components/diagrams/CustomSymbolDialog";
import DiagramSymbol from "@/components/diagrams/DiagramSymbol";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { customSymbolKey, toGeometry, type CustomSymbolRow } from "@/lib/diagrams/customSymbols";

interface SymbolLibrarySectionProps {
  library: CustomSymbolRow[];
  onCreate: (symbol: NewCustomSymbol) => Promise<void>;
  onUpdate: (symbolId: string, symbol: NewCustomSymbol) => Promise<void>;
  onDelete: (symbol: CustomSymbolRow) => Promise<void>;
}

/** The shared symbols every site can pick from. */
export default function SymbolLibrarySection({
  library,
  onCreate,
  onUpdate,
  onDelete,
}: SymbolLibrarySectionProps) {
  const [mode, setMode] = useState<"draw" | "upload" | null>(null);
  /** Set while changing a symbol rather than making a new one. */
  const [editing, setEditing] = useState<CustomSymbolRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = library.filter((symbol) => !symbol.deleted_at);

  const open = (next: "draw" | "upload", symbol: CustomSymbolRow | null = null) => {
    setError(null);
    setEditing(symbol);
    setMode(next);
  };

  const save = async (symbol: NewCustomSymbol) => {
    setSaving(true);
    setError(null);
    try {
      if (editing) await onUpdate(editing.id, symbol);
      else await onCreate(symbol);
      setMode(null);
    } catch (saveError) {
      console.error("Failed to save symbol:", saveError);
      setError(
        (saveError as { code?: string }).code === "23505"
          ? "The library already has a symbol with that name."
          : "The symbol couldn't be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (symbol: CustomSymbolRow) => {
    const ok = await confirmDialog({
      title: `Delete "${symbol.name}"?`,
      description: "It can't be picked anymore. Diagrams already using it keep drawing it.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await onDelete(symbol);
    } catch (deleteError) {
      console.error("Failed to delete symbol:", deleteError);
      toast.error("The symbol couldn't be deleted.");
    }
  };

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          leftIcon={<PenTool className="h-4 w-4" />}
          onClick={() => open("draw")}
        >
          Draw a symbol
        </Button>
        <Button
          type="button"
          variant="outline"
          leftIcon={<Upload className="h-4 w-4" />}
          onClick={() => open("upload")}
        >
          Upload a symbol
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No custom symbols yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.map((symbol) => (
            <li
              key={symbol.id}
              className="flex flex-col items-center gap-1 border border-neutral-200 p-2 dark:border-neutral-700"
            >
              <span className="flex h-20 items-center justify-center overflow-hidden">
                <DiagramSymbol symbolKey={customSymbolKey(symbol.id)} geometry={toGeometry(symbol)} />
              </span>
              <span className="w-full truncate text-center text-sm" title={symbol.name}>
                {symbol.name}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${symbol.name}`}
                  title="Edit"
                  onClick={() => open(symbol.image_data ? "upload" : "draw", symbol)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${symbol.name}`}
                  title="Delete"
                  onClick={() => void remove(symbol)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CustomSymbolDialog
        open={mode !== null}
        mode={mode ?? "draw"}
        existing={editing}
        saving={saving}
        error={error}
        onSave={(symbol) => void save(symbol)}
        onClose={() => setMode(null)}
      />
    </div>
  );
}
