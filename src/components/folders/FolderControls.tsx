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
}: {
  onCreate: (name: string) => void | Promise<void>;
  scopeLabel: string;
  size?: "sm" | "md";
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
          </DialogHeader>

          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder="e.g. Building A"
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
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            title="Move to a folder"
            className="rounded-none p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
          >
            <FolderInput className="h-4 w-4" />
          </button>
        )}
      </DropdownMenuTrigger>
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
}: {
  folders: SubstationFolder[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
  onNewFolder: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Substation options"
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

        {folders.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="mr-2 h-4 w-4" />
                Move to folder
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    onSelect={() => onMove(folder.id)}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="truncate">{folder.name}</span>
                    {folder.id === currentFolderId && (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    )}
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
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
