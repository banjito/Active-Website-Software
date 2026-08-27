import React, { useState } from "react";
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  PencilLine,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { DeleteFolderDialog } from "@/components/folders/FolderControls";
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
  onExpandAll,
  onCollapseAll,
  canEdit,
  isOver,
  dropRef,
  dragHandleProps,
  indentOffset = 0,
  onContextMenu,
}: {
  node: FolderNode;
  depth: number;
  columnCount: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddSubfolder: () => void;
  /** This folder and everything under it. Only offered when it has subfolders. */
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  canEdit: boolean;
  /**
   * Levels above this folder's own tree. The asset list nests substations inside buildings
   * before this row is reached, and without the offset a folder inside Sub 1 would line up
   * with the building heading three levels above it.
   */
  indentOffset?: number;
  isOver?: boolean;
  dropRef?: (node: HTMLElement | null) => void;
  dragHandleProps?: Record<string, unknown>;
  /** Right-click anywhere on the row. Omitted where the surface has no menu to show. */
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState(node.folder.name);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== node.folder.name) onRename(next);
    setRenaming(false);
  };

  return (
    <TableRow
      onContextMenu={onContextMenu}
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
          style={{ paddingLeft: `${(depth + indentOffset) * 1.25}rem` }}
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

          {/* Always visible, unlike the drag handle above: this menu is the only route to
              rename and delete, and a control you have to discover by hovering is one that
              does not exist on a tablet in a plant. */}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title={`Rename or delete “${node.folder.name}”`}
                  aria-label={`Options for folder ${node.folder.name}`}
                  className="rounded-none p-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-white"
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
                  <PencilLine className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                {/* A folder with nothing but items inside has one state, and the chevron
                    already toggles it — the pair only earns its place once there is a
                    subtree to open in one go. */}
                {node.children.length > 0 && onExpandAll && onCollapseAll && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onExpandAll}>
                      <ChevronsUpDown className="mr-2 h-4 w-4" />
                      Expand all
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onCollapseAll}>
                      <ChevronsDownUp className="mr-2 h-4 w-4" />
                      Collapse all
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setDeleting(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DeleteFolderDialog
            open={deleting}
            name={node.folder.name}
            contents="equipment and reports"
            onOpenChange={setDeleting}
            onConfirm={onDelete}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

export default InnerFolderRow;
