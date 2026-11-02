/**
 * Edit the equipment types list: add, rename, remove.
 *
 * The list is shared with the asset registry. Renaming or removing a type
 * also updates the custom components tagged with it; assets keep the text
 * they were saved with (their type is free text).
 */

import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  addEquipmentType,
  fetchEquipmentTypeList,
  removeEquipmentType,
  renameEquipmentType,
  retagEquipmentType,
} from "@/lib/customForms/equipmentTypes";
import { fetchSavedComponents, updateSavedComponent } from "@/lib/customForms/savedComponents";

const box =
  "h-8 px-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

/** Re-tag every saved component carrying `from`. */
async function retagComponents(from: string, to: string | null): Promise<number> {
  const saved = await fetchSavedComponents();
  let changed = 0;
  for (const s of saved) {
    const types = s.section_config.equipmentTypes;
    if (!types?.includes(from)) continue;
    await updateSavedComponent(s.id, { ...s.section_config, equipmentTypes: retagEquipmentType(types, from, to) });
    changed += 1;
  }
  return changed;
}

export const EquipmentTypesDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  /** Called after any change, with the new list. */
  onChanged?: (types: string[]) => void;
}> = ({ open, onClose, onChanged }) => {
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const list = await fetchEquipmentTypeList();
    setTypes(list);
    onChanged?.(list);
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    reload()
      .catch((e) => toast.error(e?.message || "Could not load equipment types."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const message = await work();
      await reload();
      if (message) toast.success(message);
    } catch (e: any) {
      toast.error(e?.message || "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    if (types.some((t) => t.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" is already in the list.`);
      return;
    }
    run(async () => {
      await addEquipmentType(name);
      setNewName("");
      return `Added "${name}".`;
    });
  };

  const rename = (from: string) => {
    const to = editName.trim();
    setEditing(null);
    if (!to || to === from) return;
    run(async () => {
      await renameEquipmentType(from, to);
      const n = await retagComponents(from, to);
      return `Renamed to "${to}"${n ? `; ${n} component${n === 1 ? "" : "s"} updated` : ""}.`;
    });
  };

  const remove = async (name: string) => {
    const ok = await confirmDialog({
      title: `Remove "${name}"?`,
      description:
        "Components tagged with it lose that tag. Assets already saved with this type keep it as text.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    run(async () => {
      await removeEquipmentType(name);
      const n = await retagComponents(name, null);
      return `Removed "${name}"${n ? `; ${n} component${n === 1 ? "" : "s"} updated` : ""}.`;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="w-[min(32rem,95vw)] max-w-none max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <div className="px-4 py-3 pr-12 border-b border-neutral-200 dark:border-neutral-700">
          <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-white">Equipment types</DialogTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Shared with the asset registry. Components can be tagged with one or more of these, or as Global.
          </p>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="New equipment type, e.g. Medium Voltage Switch"
              className={`${box} flex-1`}
            />
            <Button size="sm" onClick={add} disabled={busy || !newName.trim()} className="bg-brand hover:bg-brand-dark" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Add
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : types.length === 0 ? (
            <p className="text-sm text-neutral-500">No equipment types yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-dark-200 border border-neutral-200 dark:border-dark-200">
              {types.map((t) => (
                <li key={t} className="flex items-center gap-2 px-3 py-1.5">
                  {editing === t ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => rename(t)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(t);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className={`${box} flex-1`}
                    />
                  ) : (
                    <span className="flex-1 text-sm text-neutral-800 dark:text-neutral-100">{t}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(t);
                      setEditName(t);
                    }}
                    disabled={busy}
                    className="p-1 text-neutral-400 hover:text-brand"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => remove(t)} disabled={busy} className="p-1 text-neutral-400 hover:text-red-600" title="Remove">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EquipmentTypesDialog;
