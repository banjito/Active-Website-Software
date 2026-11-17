/**
 * Per-form keyboard movement: what the arrow keys and Enter do while a
 * technician fills the form in (settings.keyboard, lib/customForms/formNavigation.ts).
 */

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { KeyboardNavSettings } from "@/lib/types/customForms";
import { resolveKeyboardNav } from "@/lib/customForms/formNavigation";

type ChoiceKey = "enter" | "arrows" | "leftRight";
type Choice<K extends ChoiceKey> = {
  value: NonNullable<KeyboardNavSettings[K]>;
  label: string;
  help: string;
  /** Needs a fill order to be set. */
  needsOrder?: boolean;
};

const ENTER: Choice<"enter">[] = [
  { value: "across", label: "Across the row", help: "Next cell to the right, then the start of the next row." },
  { value: "down", label: "Down the column", help: "Next cell below, then the top of the next column." },
  { value: "order", label: "Follow the fill order", help: "The order you numbered in Fill order.", needsOrder: true },
  { value: "off", label: "Stay put", help: "Enter does not move." },
];
const ARROWS: Choice<"arrows">[] = [
  { value: "cells", label: "Move between cells", help: "One cell at a time, by the table's rows and columns." },
  {
    value: "order",
    label: "Follow the fill order",
    help: "Down / Right go to the next numbered field, Up / Left back.",
    needsOrder: true,
  },
  { value: "off", label: "Off", help: "Arrows only move the cursor inside the text. Use Tab / click to move." },
];
const LEFT_RIGHT: Choice<"leftRight">[] = [
  { value: "edge", label: "At the end of the text", help: "Left/Right first move through the typed text, then to the next cell." },
  { value: "always", label: "Always", help: "Left/Right always jump to the next cell, like a spreadsheet." },
];

function Group<K extends ChoiceKey>({
  name,
  title,
  choices,
  value,
  onChange,
  disabled,
  hasOrder,
}: {
  name: K;
  title: string;
  choices: Choice<K>[];
  value: NonNullable<KeyboardNavSettings[K]>;
  onChange: (v: NonNullable<KeyboardNavSettings[K]>) => void;
  disabled?: boolean;
  hasOrder: boolean;
}) {
  return (
    <fieldset className={`space-y-1.5 ${disabled ? "opacity-50" : ""}`} disabled={disabled}>
      <legend className="text-sm font-semibold text-neutral-900 dark:text-white mb-1">{title}</legend>
      {choices.map((choice) => {
        const off = !!choice.needsOrder && !hasOrder;
        return (
          <label key={choice.value} className={`flex items-start gap-2 ${off ? "opacity-50" : "cursor-pointer"}`}>
            <input
              type="radio"
              name={`kbd-${name}`}
              checked={value === choice.value}
              disabled={off}
              onChange={() => onChange(choice.value)}
              className="mt-0.5 accent-brand"
            />
            <span className="text-sm text-neutral-800 dark:text-neutral-200">
              {choice.label}
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                {off ? "Set a fill order first." : choice.help}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export const KeyboardNavDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  value: KeyboardNavSettings | undefined;
  onSave: (next: KeyboardNavSettings | undefined) => void;
  /** Open the Fill order view (this dialog closes first). */
  onOpenFillOrder?: () => void;
}> = ({ open, onClose, value, onSave, onOpenFillOrder }) => {
  const [draft, setDraft] = useState(resolveKeyboardNav(value));
  useEffect(() => {
    if (open) setDraft(resolveKeyboardNav(value));
  }, [open, value]);

  const hasOrder = !!value?.order?.length;

  const save = () => {
    const defaults = resolveKeyboardNav(undefined);
    // Keep only what differs from the defaults, so a later default change still
    // applies. The fill order itself is edited in its own view and kept as is.
    const next: KeyboardNavSettings = { order: value?.order, addedRows: value?.addedRows };
    (["enter", "arrows", "leftRight"] as const).forEach((k) => {
      if (draft[k] !== defaults[k]) (next as Record<string, unknown>)[k] = draft[k];
    });
    const kept = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as KeyboardNavSettings;
    onSave(Object.keys(kept).length ? kept : undefined);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[min(30rem,95vw)] max-w-none max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden rounded-none"
      >
        <div className="px-4 py-3 pr-12 border-b border-neutral-200 dark:border-neutral-700">
          <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-white">
            Keyboard movement
          </DialogTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            How arrow keys and Enter move between fields on this form. Shift + Enter goes back. Cells that can't be
            typed in are skipped.
          </p>
        </div>
        <div className="px-4 py-3 space-y-4 overflow-y-auto">
          <Group
            name="enter"
            title="Enter moves"
            choices={ENTER}
            value={draft.enter}
            onChange={(enter) => setDraft((d) => ({ ...d, enter }))}
            hasOrder={hasOrder}
          />
          <Group
            name="arrows"
            title="Arrow keys"
            choices={ARROWS}
            value={draft.arrows}
            onChange={(arrows) => setDraft((d) => ({ ...d, arrows }))}
            hasOrder={hasOrder}
          />
          <Group
            name="leftRight"
            title="Left / Right leave a cell"
            choices={LEFT_RIGHT}
            value={draft.leftRight}
            onChange={(leftRight) => setDraft((d) => ({ ...d, leftRight }))}
            disabled={draft.arrows === "off"}
            hasOrder={hasOrder}
          />
          {onOpenFillOrder && (
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-3">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {hasOrder
                  ? `Fill order set: ${value!.order!.length} fields numbered.`
                  : "Number every field on the sheet in your own order."}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Keep the choices made here, then switch views.
                  save();
                  onOpenFillOrder();
                }}
              >
                {hasOrder ? "Edit fill order…" : "Set fill order…"}
              </Button>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
