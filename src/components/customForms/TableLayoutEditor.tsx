/**
 * Table Layout Editor
 *
 * Rearranges the tables inside one component (see lib/customForms/tableLayout).
 * Each table is a card: drag it onto another row to sit side by side, or onto
 * a gap between rows to give it a row of its own. Cards can be split by
 * column, combined, widened, and can repeat a column (e.g. the row label)
 * from another piece.
 */

import React, { useState } from "react";
import { GripVertical, LayoutGrid, RotateCcw, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { SectionContent } from "./FormPreview";
import type { SectionConfig } from "@/lib/types/customForms";
import {
  PIECE_LABELS,
  canCombine,
  pieceFlex,
  combinePieces,
  isDefaultLayout,
  movePiece,
  resolveTableLayout,
  splitPiece,
  updatePiece,
  type TableLayout,
  type TablePiece,
} from "@/lib/customForms/tableLayout";
import { inlineInputCls } from "./SectionEditor";

const DRAG_TYPE = "application/x-table-piece";

export const TableLayoutEditor: React.FC<{
  section: SectionConfig;
  onUpdate: (updates: Partial<SectionConfig>) => void;
  /** Just the button (for a toolbar), without the "N tables" note. */
  compact?: boolean;
}> = ({ section, onUpdate, compact = false }) => {
  const layout = resolveTableLayout(section);
  const pieces = layout.rows.flat();
  const columns = section.columns ?? [];
  const labelOf = (id: string) => columns.find((c) => c.id === id)?.label || id;
  const [dropAt, setDropAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Nothing to arrange with a single, unsplittable table.
  const tableColumns = pieces.find((p) => p.kind === "columns")?.columnIds?.length ?? 0;
  if (pieces.length < 2 && tableColumns < 2) return null;

  const commit = (next: TableLayout) =>
    onUpdate({ tableLayout: isDefaultLayout(section, next) ? undefined : next });

  const dropProps = (key: string, onDrop: (pieceId: string) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropAt(key);
    },
    onDragLeave: () => setDropAt((k) => (k === key ? null : k)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropAt(null);
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (id) onDrop(id);
    },
  });

  const rowGap = (index: number) => (
    <div
      key={`gap-${index}`}
      {...dropProps(`gap-${index}`, (id) => commit(movePiece(layout, id, index, 0, true)))}
      className={`h-3 -my-0.5 flex items-center ${dropAt === `gap-${index}` ? "bg-brand/20" : ""}`}
    >
      {dropAt === `gap-${index}` && (
        <span className="mx-auto text-[10px] text-brand">New row here</span>
      )}
    </div>
  );

  const select = `${inlineInputCls} h-6 text-[11px]`;

  const card = (piece: TablePiece, r: number, c: number) => {
    const others = pieces.filter((p) => canCombine(piece, p));
    const own = piece.columnIds ?? [];
    const repeat = piece.repeatColumnIds ?? [];
    const repeatable = columns.filter((col) => !own.includes(col.id) && !repeat.includes(col.id));
    return (
      <div
        key={piece.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, piece.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        {...dropProps(`card-${piece.id}`, (id) => id !== piece.id && commit(movePiece(layout, id, r, c)))}
        style={pieceFlex(piece)}
        className={`border bg-white dark:bg-dark-150 rounded-none p-2 space-y-1.5 ${
          dropAt === `card-${piece.id}`
            ? "border-brand border-l-4"
            : "border-neutral-300 dark:border-neutral-600"
        }`}
        title="Drag to move"
      >
        <div className="flex items-center gap-1">
          <GripVertical className="w-3.5 h-3.5 shrink-0 text-neutral-400 cursor-grab" />
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-100 truncate">
            {PIECE_LABELS[piece.kind]}
          </span>
          <select
            value={piece.grow ?? 1}
            onChange={(e) => commit(updatePiece(layout, piece.id, { grow: Number(e.target.value) }))}
            title="Width compared with tables beside it in the same row (no effect on a table alone in its row)"
            className={`${select} ml-auto w-14`}
          >
            {[1, 2, 3, 4].map((g) => (
              <option key={g} value={g}>
                {g}× wide
              </option>
            ))}
          </select>
        </div>

        {piece.kind === "columns" && (
          <div className="flex flex-wrap gap-1">
            {repeat.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-0.5 px-1 text-[10px] italic border border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-500"
                title="Repeated from another table"
              >
                {labelOf(id)}
                <button
                  type="button"
                  onClick={() =>
                    commit(updatePiece(layout, piece.id, { repeatColumnIds: repeat.filter((x) => x !== id) }))
                  }
                  className="hover:text-red-600"
                  aria-label="Stop repeating"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {own.map((id) => (
              <span
                key={id}
                className="px-1 text-[10px] border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200"
              >
                {labelOf(id)}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1">
          {piece.kind === "columns" && own.length > 1 && (
            <select
              value=""
              onChange={(e) => e.target.value && commit(splitPiece(layout, piece.id, e.target.value))}
              className={`${select} w-28`}
              title="Split this table into two"
            >
              <option value="">Split after…</option>
              {own.slice(0, -1).map((id) => (
                <option key={id} value={id}>
                  {labelOf(id)}
                </option>
              ))}
            </select>
          )}
          {piece.kind === "columns" && repeatable.length > 0 && pieces.filter((p) => p.kind === "columns").length > 1 && (
            <select
              value=""
              onChange={(e) =>
                e.target.value &&
                commit(updatePiece(layout, piece.id, { repeatColumnIds: [...repeat, e.target.value] }))
              }
              className={`${select} w-28`}
              title="Also show a column from another table here (e.g. the row label)"
            >
              <option value="">Repeat column…</option>
              {repeatable.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.label}
                </option>
              ))}
            </select>
          )}
          {others.length > 0 && (
            <select
              value=""
              onChange={(e) =>
                e.target.value &&
                commit(combinePieces(layout, piece.id, e.target.value, columns.map((col) => col.id)))
              }
              className={`${select} w-32`}
              title="Merge another table into this one"
            >
              <option value="">Combine with…</option>
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.kind === "columns"
                    ? `Table: ${(p.columnIds ?? []).slice(0, 2).map(labelOf).join(", ")}${(p.columnIds?.length ?? 0) > 2 ? "…" : ""}`
                    : PIECE_LABELS[p.kind]}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  };

  const tableCount = pieces.length;
  return (
    <>
    {/* Opener: the layout itself is edited in a dialog, to keep the page short. */}
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={section.tableLayout ? "Custom arrangement" : "Arrange, split and combine tables"}
        className={`${compact ? "h-8 px-3 text-sm" : "h-7 px-2 text-xs"} flex items-center gap-1.5 border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-700 dark:text-neutral-200 hover:border-brand hover:text-brand`}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Table layout…
      </button>
      {!compact && (
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {tableCount} table{tableCount === 1 ? "" : "s"}
          {section.tableLayout ? " · custom arrangement" : ""}
        </span>
      )}
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent
      aria-describedby={undefined}
      className="w-[min(72rem,95vw)] max-w-none max-h-[90vh] overflow-y-auto p-4 space-y-3"
    >
      <div className="flex items-center gap-2 pr-8">
        <LayoutGrid className="w-4 h-4 text-neutral-400" />
        <DialogTitle className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Table layout
        </DialogTitle>
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Drag a table onto another row to put them side by side, or onto a gap to stack it.
        </span>
        {section.tableLayout && (
          <button
            type="button"
            onClick={() => onUpdate({ tableLayout: undefined })}
            className="ml-auto flex items-center gap-1 text-[11px] text-neutral-500 hover:text-brand"
          >
            <RotateCcw className="w-3 h-3" />
            Reset layout
          </button>
        )}
      </div>
      <div className="bg-neutral-50 dark:bg-dark-100 p-2">
        {rowGap(0)}
        {layout.rows.map((row, r) => (
          <React.Fragment key={r}>
            <div
              {...dropProps(`row-${r}`, (id) => commit(movePiece(layout, id, r, row.length)))}
              className={`flex flex-wrap items-stretch gap-2 p-1 border border-dashed ${
                dropAt === `row-${r}` ? "border-brand bg-brand/5" : "border-transparent"
              }`}
            >
              {row.map((piece, c) => card(piece, r, c))}
            </div>
            {rowGap(r + 1)}
          </React.Fragment>
        ))}
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">Preview</div>
        <div className="border border-neutral-200 dark:border-neutral-700 rounded-none p-3">
          <SectionContent section={section} />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-8 px-4 text-sm text-white bg-brand hover:bg-brand-dark rounded-none"
        >
          Done
        </button>
      </div>
    </DialogContent>
    </Dialog>
    </>
  );
};

export default TableLayoutEditor;
