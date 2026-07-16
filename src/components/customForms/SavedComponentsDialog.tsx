/**
 * Saved Components Dialog
 *
 * Popup to view, add, edit, and delete saved components.
 * Shows a preview of each component; click to add to form, or use Edit/Delete.
 */

import React, { useState } from "react";
import { Table2, Plus, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SectionContent } from "./FormPreview";
import type { SavedComponent } from "@/lib/customForms/savedComponents";
import type { SectionConfig } from "@/lib/types/customForms";

/** Normalize saved section_config for preview (ensure id, order, showInPrint). */
function sectionForPreview(
  config: SectionConfig,
  index: number,
): SectionConfig {
  return {
    ...config,
    id: config.id || `preview-${index}`,
    order: config.order ?? index,
    showInPrint: config.showInPrint !== false,
  };
}

interface SavedComponentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedComponents: SavedComponent[];
  onRefetch: () => void;
  /** Add this component to the form. If selectForEdit is true, the new section is selected so the editor opens. */
  onAddToForm: (
    sectionConfig: SectionConfig,
    savedComponentId: string,
    selectForEdit?: boolean,
  ) => void;
  /** Delete from library. */
  onDelete: (id: string) => Promise<void>;
}

export const SavedComponentsDialog: React.FC<SavedComponentsDialogProps> = ({
  open,
  onOpenChange,
  savedComponents,
  onRefetch,
  onAddToForm,
  onDelete,
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleAdd = (saved: SavedComponent, selectForEdit?: boolean) => {
    const config = saved.section_config;
    onAddToForm(config, saved.id, selectForEdit);
    onOpenChange(false);
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeletingId(id);
    try {
      await onDelete(id);
      onRefetch();
      setConfirmDeleteId(null);
      setDeletingId(null);
    } catch {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="w-5 h-5 text-brand" />
            Saved components
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 -mt-2">
          Click a component to add it to your form. Edit or delete from here.
        </p>
        <div className="flex-1 overflow-y-auto min-h-0 mt-4 space-y-4">
          {savedComponents.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 dark:text-neutral-400">
              No saved components yet. Save a section as a new component from
              the section editor.
            </div>
          ) : (
            savedComponents.map((saved) => {
              const section = sectionForPreview(saved.section_config, 0);
              const isConfirmingDelete = confirmDeleteId === saved.id;
              const isDeleting = deletingId === saved.id;
              return (
                <div
                  key={saved.id}
                  className="rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3 p-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-200">
                    <h3 className="font-medium text-neutral-900 dark:text-white truncate">
                      {saved.name}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleAdd(saved, false)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                        Add to form
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleAdd(saved, true)}
                        title="Add to form and open in editor" leftIcon={<Pencil className="w-3.5 h-3.5" />}>
                        Edit
                      </Button>
                      {!isConfirmingDelete ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400"
                          onClick={() => handleDelete(saved.id)}
                          disabled={isDeleting} leftIcon={<Trash2 className="w-3.5 h-3.5" />}>
                          Delete
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            Delete?
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleDelete(saved.id)}
                            disabled={isDeleting}
                          >
                            Yes
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            No
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className="p-4 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 transition-colors"
                    onClick={() => handleAdd(saved, false)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleAdd(saved, false);
                      }
                    }}
                  >
                    <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                      Preview — click to add to form
                    </div>
                    <div className="rounded border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-dark-150 p-3 max-h-48 overflow-y-auto">
                      <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-2 border-b border-neutral-200 dark:border-neutral-600 pb-1">
                        {section.title}
                      </div>
                      <SectionContent section={section} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
