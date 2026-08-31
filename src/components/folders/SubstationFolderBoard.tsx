import React, { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, FolderOutput } from "lucide-react";
import { SubstationFolderShell } from "./SubstationFolderShell";
import { InnerFolderRow } from "./InnerFolderRow";
import { substationKey } from "@/utils/substationFolders";
import type { FolderedUnit, SubstationFolder } from "@/lib/types/substationFolders";
import type { SubstationFoldersApi } from "@/hooks/useSubstationFolders";

const SUB_PREFIX = "sub:";
const FOLDER_PREFIX = "folder:";
const REPORT_PREFIX = "report:";
const INNER_PREFIX = "inner:";
const SUBROOT_PREFIX = "subroot:";
const UNGROUPED_ID = "ungrouped";

/**
 * The grip on a substation header.
 *
 * The handle *is* the draggable node — there's no wrapper around the substation accordion
 * to attach to, and a DragOverlay chip means the visual never depends on the node anyway.
 */
export function SubstationDragHandle({ label }: { label: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${SUB_PREFIX}${label}`,
  });

  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title="Drag into a folder"
      onClick={(e) => {
        // Inside a <summary>: cancel the accordion toggle a click would otherwise cause.
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`cursor-grab text-neutral-400 hover:text-neutral-700 dark:hover:text-white ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <GripVertical className="h-4 w-4" />
    </span>
  );
}

/**
 * The grip on a report row, for dragging it into one of its substation's folders.
 *
 * Deliberately does not carry the substation: a report can only be filed inside the
 * substation it already belongs to, and the drop target is what decides where it lands.
 */
export function ReportDragHandle({ assetId }: { assetId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${REPORT_PREFIX}${assetId}`,
  });

  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title="Drag into a folder"
      className={`cursor-grab text-neutral-300 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-300 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * A whole substation, as a place to drop a report that should sit loose in it.
 *
 * Wraps the substation accordion rather than sitting inside it so the heading counts too:
 * dragging a report onto "Zech Bug Fix" is the obvious way to take it out of a folder
 * nested under that substation. Inner folder rows are smaller, so pointer collision picks
 * them first whenever the cursor is actually over one.
 */
export function DroppableSubstation({
  label,
  enabled = true,
  children,
}: {
  label: string;
  /** Off until folders are installed; on for every group, Imported and Other included. */
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${SUBROOT_PREFIX}${label}`,
    disabled: !enabled,
  });
  const { active } = useDndContext();
  // Only a report can land loose in a substation, so only a report lights it up.
  const highlight = isOver && String(active?.id ?? "").startsWith(REPORT_PREFIX);

  return (
    <div
      ref={setNodeRef}
      className={highlight ? "outline outline-2 outline-offset-[-1px] outline-brand" : undefined}
    >
      {children}
    </div>
  );
}

/**
 * An in-substation folder heading that reports can be dropped onto.
 *
 * A separate wrapper from InnerFolderRow because the equipment tables render the same row
 * with no DndContext around it — the hook lives here, where a context is guaranteed.
 */
export function DroppableInnerFolderRow(
  props: React.ComponentProps<typeof InnerFolderRow> & { folderId: string },
) {
  const { folderId, ...rest } = props;
  const { setNodeRef, isOver } = useDroppable({ id: `${INNER_PREFIX}${folderId}` });
  return <InnerFolderRow {...rest} dropRef={setNodeRef} isOver={isOver} />;
}

/**
 * A folder that can be reordered and dropped into.
 *
 * useSortable registers the node as draggable *and* droppable, so one hook covers both.
 * Inherited site folders pass `disabled` — still a drop target, but not draggable, because
 * their sort_order is shared with every other job at that site.
 */
function SortableFolder({
  unit,
  api,
  isClosed,
  onToggle,
  onContextMenu,
  children,
}: {
  unit: Extract<FolderedUnit, { kind: "folder" }>;
  api: SubstationFoldersApi;
  isClosed: boolean;
  onToggle: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const inherited = !api.isOwnScope(unit.folder);
  const { attributes, listeners, setNodeRef, transform, transition, isOver } = useSortable({
    id: `${FOLDER_PREFIX}${unit.folder.id}`,
    disabled: inherited,
  });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <SubstationFolderShell
        folder={unit.folder}
        substationCount={unit.substations.length}
        reportCount={unit.count}
        inherited={inherited}
        open={!isClosed}
        onToggle={onToggle}
        onRename={(name) => void api.renameFolder(unit.folder.id, name)}
        onDelete={() => void api.deleteFolder(unit.folder.id)}
        canEdit
        isOver={isOver}
        onContextMenu={onContextMenu}
        dragHandleProps={inherited ? undefined : { ...listeners, ...attributes }}
      >
        {children}
      </SubstationFolderShell>
    </div>
  );
}

/** Somewhere to drop a substation, or a report, to take it back out of a folder. */
function UngroupedDropZone({ what }: { what: "substation" | "report" }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNGROUPED_ID });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center gap-2 border border-dashed px-3 py-4 text-sm ${
        isOver
          ? "border-brand bg-brand/5 text-brand"
          : "border-neutral-300 text-neutral-500 dark:border-neutral-600 dark:text-neutral-400"
      }`}
    >
      <FolderOutput className="h-4 w-4" />
      Drop here to take this {what} out of its folder
    </div>
  );
}

/**
 * The Reports tab's folder level, drag included.
 *
 * Owns the DndContext so JobDetail keeps rendering substation tables exactly as it did —
 * it hands them in through `renderSubstation` and nothing about them changes.
 */
export function SubstationFolderBoard({
  units,
  api,
  closedFolders,
  onToggleFolder,
  onFolderContextMenu,
  renderSubstation,
}: {
  units: FolderedUnit[];
  api: SubstationFoldersApi;
  closedFolders: string[];
  onToggleFolder: (folderId: string) => void;
  /** Right-click on a folder heading. Omitted where the surface has no menu to show. */
  onFolderContextMenu?: (event: React.MouseEvent, folder: SubstationFolder) => void;
  renderSubstation: (label: string) => React.ReactNode;
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<SubstationFolder | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  const sensors = useSensors(
    // Without a distance threshold, clicking a substation header to expand it starts a
    // drag instead.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * pointerWithin first: folders are big nested containers, and closestCenter alone
   * happily picks a folder whose centre is nearer than the one the cursor is actually in.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : closestCenter(args);
  };

  const sortableFolderIds = useMemo(
    () =>
      units
        .filter((u): u is Extract<FolderedUnit, { kind: "folder" }> => u.kind === "folder")
        .map((u) => `${FOLDER_PREFIX}${u.folder.id}`),
    [units],
  );

  const hasFolders = sortableFolderIds.length > 0;

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith(SUB_PREFIX)) {
      setActiveLabel(id.slice(SUB_PREFIX.length));
      return;
    }
    if (id.startsWith(REPORT_PREFIX)) {
      setActiveReportId(id.slice(REPORT_PREFIX.length));
      return;
    }
    const folderId = id.slice(FOLDER_PREFIX.length);
    setActiveFolder(api.folders.find((f) => f.id === folderId) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveLabel(null);
    setActiveFolder(null);
    setActiveReportId(null);
    if (!overId) return;

    // A report into one of its substation's folders, or back out of all of them.
    if (activeId.startsWith(REPORT_PREFIX)) {
      const assetId = activeId.slice(REPORT_PREFIX.length);
      if (overId.startsWith(INNER_PREFIX)) {
        void api.moveItems([assetId], overId.slice(INNER_PREFIX.length), "report");
      } else if (overId === UNGROUPED_ID) {
        void api.moveItems([assetId], null, "report");
      } else if (overId.startsWith(SUBROOT_PREFIX)) {
        // Dropped on the substation itself: out of every folder, still in the substation.
        // A report belongs to one substation and can't be dragged to another, so a drop on
        // somebody else's substation is a miss, not a move.
        const label = overId.slice(SUBROOT_PREFIX.length);
        const current = api.itemFolder(assetId);
        const home = current
          ? api.innerFolders.find((f) => f.id === current)?.substation_key
          : null;
        if (home && home !== substationKey(label)) return;
        void api.moveItems([assetId], null, "report");
      }
      return;
    }

    // A substation body under the cursor stands in for whatever folder holds it, so
    // dropping onto one keeps meaning what it did before there was a target there.
    const overUnitId = overId.startsWith(SUBROOT_PREFIX)
      ? (() => {
          const label = overId.slice(SUBROOT_PREFIX.length);
          if (activeId === `${SUB_PREFIX}${label}`) return null;
          const folder = api.folderFor(label);
          return folder ? `${FOLDER_PREFIX}${folder.id}` : UNGROUPED_ID;
        })()
      : overId;
    if (!overUnitId) return;

    if (activeId.startsWith(SUB_PREFIX)) {
      const label = activeId.slice(SUB_PREFIX.length);
      if (overUnitId === UNGROUPED_ID) {
        void api.moveSubstation(label, null);
      } else if (overUnitId.startsWith(FOLDER_PREFIX)) {
        void api.moveSubstation(label, overUnitId.slice(FOLDER_PREFIX.length));
      }
      return;
    }

    if (activeId.startsWith(FOLDER_PREFIX) && overUnitId.startsWith(FOLDER_PREFIX)) {
      if (activeId === overUnitId) return;
      const from = sortableFolderIds.indexOf(activeId);
      const to = sortableFolderIds.indexOf(overUnitId);
      if (from < 0 || to < 0) return;
      void api.reorderFolders(
        arrayMove(sortableFolderIds, from, to).map((id) => id.slice(FOLDER_PREFIX.length)),
      );
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveLabel(null);
        setActiveFolder(null);
        setActiveReportId(null);
      }}
    >
      <SortableContext items={sortableFolderIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {units.map((unit) =>
            unit.kind === "substation" ? (
              <React.Fragment key={unit.label}>{renderSubstation(unit.label)}</React.Fragment>
            ) : (
              <SortableFolder
                key={unit.folder.id}
                unit={unit}
                api={api}
                isClosed={closedFolders.includes(unit.folder.id)}
                onToggle={() => onToggleFolder(unit.folder.id)}
                onContextMenu={
                  onFolderContextMenu
                    ? (e) => onFolderContextMenu(e, unit.folder)
                    : undefined
                }
              >
                {unit.substations.map((label) => (
                  <React.Fragment key={label}>{renderSubstation(label)}</React.Fragment>
                ))}
              </SortableFolder>
            ),
          )}

          {/* Only while something is in the air — a permanent dashed strip below every
              reports list would be clutter on the jobs that never use folders. */}
          {(activeLabel || activeReportId) && (
            <UngroupedDropZone what={activeReportId ? "report" : "substation"} />
          )}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeLabel && (
          <div className="border border-brand bg-white px-3 py-2 text-sm font-semibold shadow-lg dark:bg-dark-150 dark:text-white">
            {activeLabel}
          </div>
        )}
        {activeFolder && (
          <div className="border border-brand bg-white px-3 py-2 text-sm font-semibold shadow-lg dark:bg-dark-150 dark:text-white">
            {activeFolder.name}
          </div>
        )}
        {activeReportId && (
          <div className="border border-brand bg-white px-3 py-2 text-sm shadow-lg dark:bg-dark-150 dark:text-white">
            Moving 1 report
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default SubstationFolderBoard;
