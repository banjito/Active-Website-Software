import React, { useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { TableCell, TableRow } from "@/components/ui/Table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import type { FolderNode } from "@/lib/types/substationFolders";

/**
 * A folder heading inside a substation, as a full-width row of the surrounding table.
 *
 * A row rather than a nested table on purpose: nesting tables at four levels of depth
 * re-computes column widths per folder, and the columns stop lining up down the page,
 * which is the thing a table is for.
 */
export function InnerFolderRow({
  node,
  depth,
  columnCount,
  collapsed,
  onToggle,
  onRename,
  onDelete,
  onAddSubfolder,
  canEdit,
  isOver,
  dropRef,
  dragHandleProps,
}: {
  node: FolderNode;
  depth: number;
  columnCount: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddSubfolder: () => void;
  canEdit: boolean;
  isOver?: boolean;
  dropRef?: (node: HTMLElement | null) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node.folder.name);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== node.folder.name) onRename(next);
    setRenaming(false);
  };

  return (
    <TableRow
      className={`group/folder border-neutral-100 dark:border-neutral-800 ${
        isOver ? "bg-brand/10 hover:bg-brand/10" : "hover:bg-neutral-50 dark:hover:bg-dark-200"
      }`}
    >
      <TableCell
        colSpan={columnCount}
        className={`px-3 py-2 ${
          depth > 0 ? "border-l-2 border-l-neutral-100 dark:border-l-neutral-800" : ""
        }`}
      >
        {/* The drop ref goes here, not on the TableRow: TableRow is a plain function
            component and doesn't forward refs. This div spans the row anyway. */}
        {/* Indent by depth so the nesting reads without drawing tree lines. */}
        <div
          ref={dropRef}
          className="flex items-center gap-2"
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          {/* Separate from the options button on purpose: dnd listens on pointerdown and
              so does the menu trigger, so one element cannot be both. */}
          {canEdit && dragHandleProps && (
            <span
              {...dragHandleProps}
              title="Drag to move this folder"
              className="cursor-grab text-neutral-300 opacity-0 transition-opacity hover:text-neutral-600 group-hover/folder:opacity-100 dark:text-neutral-600"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}

          {renaming ? (
            <div className="flex flex-1 items-center gap-2">
              <Folder className="h-4 w-4 shrink-0 text-neutral-500" />
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") {
                    setDraft(node.folder.name);
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
              aria-expanded={!collapsed}
              className="flex flex-1 items-center gap-2 text-left"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${
                  collapsed ? "" : "rotate-90"
                }`}
              />
              {collapsed ? (
                <Folder className="h-4 w-4 shrink-0 text-neutral-400" />
              ) : (
                <FolderOpen className="h-4 w-4 shrink-0 text-neutral-400" />
              )}
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {node.folder.name}
              </span>
              <span className="text-xs tabular-nums text-neutral-400">
                {node.totalItems === 0 ? "empty" : node.totalItems}
              </span>
            </button>
          )}

          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Folder options"
                  className="rounded-none p-1 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus:opacity-100 group-hover/folder:opacity-100 dark:hover:text-white"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onAddSubfolder}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  New folder inside
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setDraft(node.folder.name);
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
        </div>
      </TableCell>
    </TableRow>
  );
}

export default InnerFolderRow;
