import React from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Download,
  FilePlus2,
  ListPlus,
  Loader2,
  Map as MapIcon,
  Maximize,
  Minus,
  Pencil,
  Plus,
  Redo2,
  TextCursorInput,
  Trash2,
  Undo2,
} from "lucide-react";
import { FIT_VIEW_OPTIONS } from "@/components/diagrams/DiagramCanvas";
import type { SaveStatus } from "@/components/diagrams/useDiagramEditor";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { SiteDiagram } from "@/lib/types/siteDiagrams";

const BAR_POSITION = "absolute left-1/2 top-3 z-10 -translate-x-1/2 print:hidden";
const BAR_SURFACE =
  "border border-neutral-200 bg-white shadow-md dark:border-neutral-700 dark:bg-neutral-800";

/** The tools that belong to one open diagram. */
export interface DiagramEditTools {
  status: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  addPanelOpen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRetrySave: () => void;
  onToggleAddPanel: () => void;
}

export interface DiagramTaskbarProps {
  siteName: string;
  diagrams: SiteDiagram[];
  activeDiagramId: string | null;
  /** False while there's nothing on the canvas to zoom. */
  canZoom: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDiagram: (diagramId: string) => void;
  onExit: () => void;
  canEdit: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onNewDiagram: () => void;
  onRenameDiagram: () => void;
  onDeleteDiagram: () => void;
  /** Left out until the database can hold archives. */
  onArchiveDiagram?: () => void;
  onShowOverview: () => void;
  onExport: () => void;
  /** Tools for the open diagram, such as search. */
  viewTools?: React.ReactNode;
  editTools?: DiagramEditTools;
  /** Fields for whatever is selected, shown on a second row. */
  children?: React.ReactNode;
}

function IconButton({
  label,
  ...props
}: { label: string } & Omit<React.ComponentProps<typeof Button>, "aria-label" | "title">) {
  return <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} {...props} />;
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "failed") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-red-600 dark:text-red-400"
        leftIcon={<CloudOff className="h-4 w-4" />}
        onClick={onRetry}
      >
        Not saved. Retry
      </Button>
    );
  }
  return (
    <span className="flex w-20 items-center gap-1 px-1 text-xs text-neutral-500 dark:text-neutral-400">
      {status === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Saving
        </>
      ) : (
        <>
          <Check className="h-3 w-3" /> Saved
        </>
      )}
    </span>
  );
}

/**
 * The only fixed thing on the diagram screen, and it can fold away. Tools go here rather
 * than in side panels, so the one-line keeps the whole window.
 */
export default function DiagramTaskbar({
  siteName,
  diagrams,
  activeDiagramId,
  canZoom,
  open,
  onOpenChange,
  onSelectDiagram,
  onExit,
  canEdit,
  editing,
  onEditingChange,
  onNewDiagram,
  onRenameDiagram,
  onDeleteDiagram,
  onArchiveDiagram,
  onShowOverview,
  onExport,
  viewTools,
  editTools,
  children,
}: DiagramTaskbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);

  if (!open) {
    return (
      <div className={`${BAR_POSITION} ${BAR_SURFACE}`}>
        <IconButton label="Show tools" onClick={() => onOpenChange(true)}>
          <ChevronDown className="h-4 w-4" />
        </IconButton>
      </div>
    );
  }

  return (
    <div className={`${BAR_POSITION} ${BAR_SURFACE} w-max max-w-[calc(100vw-1.5rem)] p-1`}>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          onClick={onExit}
        >
          Exit
        </Button>

        <span
          className="hidden max-w-[12rem] truncate px-2 text-sm font-medium sm:inline"
          title={siteName}
        >
          {siteName}
        </span>

        {diagrams.length > 0 && (
          <div className="w-36 sm:w-56">
            <Select
              aria-label="Diagram"
              size="sm"
              value={activeDiagramId ?? ""}
              onChange={(event) => onSelectDiagram(event.target.value)}
              options={diagrams.map((diagram) => ({ value: diagram.id, label: diagram.name }))}
            />
          </div>
        )}

        {diagrams.length > 0 && (
          <IconButton label="Site overview" onClick={onShowOverview}>
            <MapIcon className="h-4 w-4" />
          </IconButton>
        )}

        {viewTools}

        {activeDiagramId && (
          <IconButton label="Export PDF" disabled={!canZoom} onClick={onExport}>
            <Download className="h-4 w-4" />
          </IconButton>
        )}

        <IconButton label="Zoom out" disabled={!canZoom} onClick={() => void zoomOut()}>
          <Minus className="h-4 w-4" />
        </IconButton>
        <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <IconButton label="Zoom in" disabled={!canZoom} onClick={() => void zoomIn()}>
          <Plus className="h-4 w-4" />
        </IconButton>
        <IconButton label="Fit to screen" disabled={!canZoom} onClick={() => void fitView(FIT_VIEW_OPTIONS)}>
          <Maximize className="h-4 w-4" />
        </IconButton>

        {canEdit && activeDiagramId && (
          <Button
            type="button"
            variant={editing ? "primary" : "ghost"}
            size="sm"
            leftIcon={editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            onClick={() => onEditingChange(!editing)}
          >
            {editing ? "Done" : "Edit"}
          </Button>
        )}

        <IconButton label="Hide tools" onClick={() => onOpenChange(false)}>
          <ChevronUp className="h-4 w-4" />
        </IconButton>
      </div>

      {editing && (
        <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-neutral-200 pt-1 dark:border-neutral-700">
          {editTools && (
            <>
              <Button
                type="button"
                variant={editTools.addPanelOpen ? "secondary" : "ghost"}
                size="sm"
                leftIcon={<ListPlus className="h-4 w-4" />}
                onClick={editTools.onToggleAddPanel}
              >
                Add
              </Button>
              <IconButton label="Undo" disabled={!editTools.canUndo} onClick={editTools.onUndo}>
                <Undo2 className="h-4 w-4" />
              </IconButton>
              <IconButton label="Redo" disabled={!editTools.canRedo} onClick={editTools.onRedo}>
                <Redo2 className="h-4 w-4" />
              </IconButton>
              <SaveIndicator status={editTools.status} onRetry={editTools.onRetrySave} />
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <IconButton label="New diagram" onClick={onNewDiagram}>
              <FilePlus2 className="h-4 w-4" />
            </IconButton>
            <IconButton label="Rename diagram" onClick={onRenameDiagram}>
              <TextCursorInput className="h-4 w-4" />
            </IconButton>
            {onArchiveDiagram && (
              <IconButton label="Archive diagram" onClick={onArchiveDiagram}>
                <Archive className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton label="Delete diagram" onClick={onDeleteDiagram}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      )}

      {editing && children && (
        <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-neutral-200 p-1 dark:border-neutral-700">
          {children}
        </div>
      )}
    </div>
  );
}
