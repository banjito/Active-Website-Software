import React, { useState } from "react";
import { ChevronRight, Folder, MoreHorizontal, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/Input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import type { SubstationFolder } from "@/lib/types/substationFolders";

/**
 * A folder on the Reports tab: the level above substation.
 *
 * Open state is controlled and defaults to open. The substation accordions inside stay
 * exactly as they were — this only wraps them. A folder that collapsed by default would
 * hide reports behind a level the user never asked for, which is the one outcome this
 * feature must not produce.
 */
export function SubstationFolderShell({
  folder,
  substationCount,
  reportCount,
  inherited,
  open,
  onToggle,
  onRename,
  onDelete,
  canEdit,
  dropRef,
  isOver,
  dragHandleProps,
  onContextMenu,
  children,
}: {
  folder: SubstationFolder;
  substationCount: number;
  reportCount: number;
  /** Defined on the site, shown here read-only. */
  inherited: boolean;
  open: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  canEdit: boolean;
  dropRef?: (node: HTMLElement | null) => void;
  isOver?: boolean;
  dragHandleProps?: Record<string, unknown>;
  /**
   * Right-click on the heading only, not on the whole folder: everything nested inside it
   * has its own menu, and a folder's options appearing over a report row would be wrong.
   */
  onContextMenu?: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  const commitRename = () => {
    const next = draft.trim();
    if (next && next !== folder.name) onRename(next);
    setRenaming(false);
  };

  return (
    /* No border box. A folder wrapping a bordered substation wrapping a bordered table is
       three nested rectangles for two levels of meaning — the heading plus the indent
       below it carries the same information without the claustrophobia. */
    <div
      ref={dropRef}
      className={`rounded-none transition-colors ${
        isOver ? "bg-brand/5 ring-1 ring-brand" : ""
      }`}
    >
      <div
        className="group/folder flex items-center gap-2.5 px-1 py-1.5"
        onContextMenu={onContextMenu}
      >

        {/* While renaming, the input replaces the toggle rather than sitting inside it —
            an input nested in a button is invalid, and every keystroke would fight the
            accordion for the click. */}
        {renaming ? (
          <div className="flex flex-1 items-center gap-2">
            <Folder className="h-4 w-4 shrink-0 text-neutral-500" />
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setDraft(folder.name);
                  setRenaming(false);
                }
              }}
              className="h-7 max-w-xs"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
                open ? "rotate-90" : ""
              }`}
            />

            {/* The folder is the loudest thing in its band, and the only thing above it
                is the page title — so it sits a step above the substations beneath it.
                Three sizes total down the tree: folder 17, substation 15, inner folder 14. */}
            <span className="truncate text-[17px] font-semibold tracking-tight text-neutral-900 dark:text-white">
              {folder.name}
            </span>

            <span className="shrink-0 text-xs text-neutral-400">
              {substationCount === 0
                ? "empty"
                : `${substationCount} · ${reportCount} report${reportCount === 1 ? "" : "s"}`}
            </span>

            {inherited && (
              <span
                title="Defined on the site. Edit it there to change it for every job at this facility."
                className="shrink-0 rounded-none bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
              >
                Site
              </span>
            )}
          </button>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/folder:opacity-100">
          {canEdit && !inherited && dragHandleProps && (
            <span
              {...dragHandleProps}
              title="Drag to reorder"
              className="cursor-grab text-neutral-300 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-300"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
        {canEdit && !inherited && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Folder options"
                className="rounded-none p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setDraft(folder.name);
                  setRenaming(true);
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-destructive focus:text-destructive"
              >
                Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        </span>
      </div>

      {open && (
        /* Indented with a hairline rail rather than boxed. The rail is what ties the
           substations to the folder heading once the border is gone. */
        <div className="ml-[9px] space-y-2 border-l border-neutral-200 pb-1 pl-4 dark:border-neutral-800">
          {substationCount === 0 ? (
            <p className="py-2 text-sm text-neutral-400">
              Empty — drag a substation here.
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

export default SubstationFolderShell;
