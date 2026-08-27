import React, { useState } from "react";
import {
  FolderPlus,
  FolderInput,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import type { SubstationFolder } from "@/lib/types/substationFolders";

/**
 * Create a folder in the current scope.
 *
 * The scope is the page you're on — a job's tabs file into the job, the site page files
 * into the site — so there's no scope picker to get wrong. `scopeLabel` says which it is
 * in the dialog copy, because "everyone at this facility will see this" is the part worth
 * being explicit about.
 */
export function AddFolderButton({
  onCreate,
  scopeLabel,
  size = "md",
  description,
  placeholder = "e.g. Building A",
}: {
  onCreate: (name: string) => void | Promise<void>;
  scopeLabel: string;
  size?: "sm" | "md";
  /** What this folder holds. The asset list's top folder holds buildings, not substations. */
  description?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onCreate(name);
      setName("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        leftIcon={<FolderPlus className="h-4 w-4" />}
        className="whitespace-nowrap"
      >
        Add Folder
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              {description ? `${description} ` : ""}
              Created on {scopeLabel}.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder={placeholder}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!name.trim() || saving}>
              Create folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Name a new folder, opened from somewhere other than a button — the "New folder inside"
 * item on a folder's menu, or the folder icon on a substation header.
 */
export function NameFolderDialog({
  open,
  onOpenChange,
  onSubmit,
  title = "New folder",
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void | Promise<void>;
  title?: string;
  description?: string;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(name);
      setName("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setName("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="e.g. Relays"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!name.trim() || saving}>
            Create folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * File items into a folder inside a substation. Handles one row or a whole selection —
 * the caller passes whichever ids it means.
 */
export function MoveToInnerFolderMenu({
  folders,
  currentFolderId,
  onMove,
  trigger,
  align = "end",
}: {
  folders: { folder: SubstationFolder; depth: number }[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
  trigger?: React.ReactNode;
  align?: "start" | "end";
}) {
  if (folders.length === 0) return null;

  return (
    <DropdownMenu>
      {/* Tooltip outside the menu trigger, not inside it: both clone onto their child,
          so the trigger has to be the thing the tooltip wraps, not the reverse. A caller
          passing its own trigger labels it itself. */}
      {trigger ? (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      ) : (
        <Tooltip content="Move to a folder">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Move to a folder"
              className="rounded-none p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
            >
              <FolderInput className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
      )}
      <DropdownMenuContent align={align} className="max-h-80 overflow-y-auto">
        {folders.map(({ folder, depth }) => (
          <DropdownMenuItem
            key={folder.id}
            onSelect={() => onMove(folder.id)}
            className="flex items-center justify-between gap-4"
          >
            {/* Indent mirrors the tree, so "Zone 1" under "Line Protection" is
                distinguishable from a "Zone 1" somewhere else. */}
            <span className="truncate" style={{ paddingLeft: `${depth * 0.75}rem` }}>
              {folder.name}
            </span>
            {folder.id === currentFolderId && <Check className="h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
        {currentFolderId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onMove(null)}>
              Remove from folder
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Move to folder" as a submenu, for menus that have other items around it.
 *
 * Shared by the header menus and by the right-click menu on the asset list, so a folder
 * list looks and indents the same however it was opened. Returns nothing when there is
 * nowhere to move to and the thing isn't already filed — an empty submenu is worse than
 * no submenu.
 */
export function MoveToFolderSubmenu({
  folders,
  currentFolderId,
  onMove,
  label = "Move to folder",
}: {
  folders: { folder: SubstationFolder; depth: number }[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
  label?: string;
}) {
  if (folders.length === 0 && !currentFolderId) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderInput className="mr-2 h-4 w-4" />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
        {folders.map(({ folder, depth }) => (
          <DropdownMenuItem
            key={folder.id}
            onSelect={() => onMove(folder.id)}
            className="flex items-center justify-between gap-4"
          >
            {/* Indent mirrors the tree, so "Zone 1" under "Line Protection" is
                distinguishable from a "Zone 1" somewhere else. */}
            <span className="truncate" style={{ paddingLeft: `${depth * 0.75}rem` }}>
              {folder.name}
            </span>
            {folder.id === currentFolderId && <Check className="h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
        {currentFolderId && (
          <>
            {folders.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => onMove(null)}>
              Remove from folder
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * Rename a folder, from wherever the rename was asked for.
 *
 * A dialog rather than an inline field on the heading: the headings are full-width table
 * rows, and swapping one for an input mid-list shoves everything under it down the page.
 */
export function RenameFolderDialog({
  open,
  name,
  onOpenChange,
  onRename,
}: {
  open: boolean;
  name: string;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);

  // The dialog outlives one folder — it's mounted once per surface and pointed at
  // whichever folder was just clicked, so the draft has to follow the name in.
  React.useEffect(() => {
    if (open) setDraft(name);
  }, [open, name]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
          <DialogDescription>
            Only the folder is renamed. Nothing filed inside it changes.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onOpenChange(false);
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={!draft.trim()}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Everything you can do to a substation header, behind one button.
 *
 * Previously two loose icons sat next to the title competing with the name, the count and
 * the drag grip. Four affordances in a header that exists to say one word is three too
 * many — they live in here now and the header reads as a label again.
 *
 * `onExpandAll`/`onCollapseAll` are omitted when the substation has no folders inside it,
 * which is what keeps the pair off the menus where there is nothing to expand.
 */
export function SubstationHeaderMenu({
  folders,
  currentFolderId,
  onMove,
  onNewFolder,
  onExpandAll,
  onCollapseAll,
  label = "Substation",
}: {
  folders: SubstationFolder[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
  onNewFolder: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  /**
   * What kind of heading this is on. The asset list puts the same menu on a Building /
   * Area heading, where "Substation options" would be a lie.
   */
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`${label} options`}
          // Inside a <summary>: preventDefault stops the accordion toggling under the
          // menu. Radix opens on pointerdown, so cancelling the click costs nothing.
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="rounded-none p-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-white"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onNewFolder}>
          <FolderPlus className="mr-2 h-4 w-4" />
          New folder here
        </DropdownMenuItem>

        {onExpandAll && onCollapseAll && (
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

        {(folders.length > 0 || currentFolderId) && (
          <>
            <DropdownMenuSeparator />
            <MoveToFolderSubmenu
              folders={folders.map((folder) => ({ folder, depth: 0 }))}
              currentFolderId={currentFolderId}
              onMove={onMove}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Everything you can do to an *outer* folder heading — one holding buildings, or one
 * holding substations — from the asset list.
 *
 * The Reports tab manages those folders on its drag-and-drop board; the asset list is a
 * table, where the board's affordances have nowhere to go. Rename and delete live here
 * instead, so a folder created on the site page can also be fixed there rather than only
 * from some job's Reports tab.
 */
export function FolderHeaderMenu({
  name,
  onRename,
  onDelete,
  onNewSubfolder,
  newSubfolderLabel = "New folder inside",
  onExpandAll,
  onCollapseAll,
}: {
  name: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  onNewSubfolder?: () => void;
  newSubfolderLabel?: string;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}) {
  const [renaming, setRenaming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Folder options"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="rounded-none p-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-white"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {onNewSubfolder && (
            <DropdownMenuItem onSelect={onNewSubfolder}>
              <FolderPlus className="mr-2 h-4 w-4" />
              {newSubfolderLabel}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>

          {onExpandAll && onCollapseAll && (
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
            onSelect={onDelete}
            className="text-destructive focus:text-destructive"
          >
            Delete folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameFolderDialog
        open={renaming}
        name={name}
        onOpenChange={setRenaming}
        onRename={onRename}
      />
    </>
  );
}

/**
 * Move a substation into a folder from a menu.
 *
 * Ships before drag-and-drop and stays afterwards: it's the keyboard-reachable path, and
 * the one that still works when a drag lands somewhere unexpected.
 */
export function MoveToFolderMenu({
  folders,
  currentFolderId,
  onMove,
  label,
}: {
  folders: SubstationFolder[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
  label: string;
}) {
  if (folders.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // This sits inside a <summary>, so a plain click would toggle the accordion
          // shut underneath the menu that just opened. preventDefault is what suppresses
          // that — stopPropagation would not, since React's synthetic bubbling isn't what
          // triggers the <details> default action. Radix opens the menu on pointerdown,
          // so cancelling the click costs nothing here.
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          title={`Move ${label} to a folder`}
          className="rounded-none p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
        >
          <FolderInput className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {folders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            onSelect={() => onMove(folder.id)}
            className="flex items-center justify-between gap-4"
          >
            <span className="truncate">{folder.name}</span>
            {folder.id === currentFolderId && <Check className="h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
        {currentFolderId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onMove(null)}>
              Remove from folder
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
