import React, { useEffect, useMemo, useState } from "react";
import DiagramSymbol from "@/components/diagrams/DiagramSymbol";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  choiceRows,
  customSymbolKey,
  type CustomSymbolRow,
  type SymbolChoices,
} from "@/lib/diagrams/customSymbols";
import { getSymbolGeometry, symbolKeyForEquipmentType } from "@/lib/diagrams/symbols";

interface SymbolChoicesEditorProps {
  choices: SymbolChoices;
  library: CustomSymbolRow[];
  equipmentTypes: string[];
  /** What Reset puts back: the default on a site, nothing on the defaults page. */
  resetTo: SymbolChoices;
  resetLabel: string;
  saving: boolean;
  onSave: (choices: SymbolChoices) => void;
}

/** A symbol small enough to sit in a list row. */
function Thumbnail({ symbolKey }: { symbolKey: string }) {
  const geometry = getSymbolGeometry(symbolKey);
  const scale = Math.min(32 / geometry.width, 32 / geometry.height);
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden">
      <span style={{ transform: `scale(${scale})` }}>
        <DiagramSymbol symbolKey={symbolKey} />
      </span>
    </span>
  );
}

/** Which symbol each built-in symbol and equipment type draws as. */
export default function SymbolChoicesEditor({
  choices,
  library,
  equipmentTypes,
  resetTo,
  resetLabel,
  saving,
  onSave,
}: SymbolChoicesEditorProps) {
  const [draft, setDraft] = useState(choices);
  useEffect(() => setDraft(choices), [choices]);

  const rows = useMemo(() => choiceRows(equipmentTypes, symbolKeyForEquipmentType), [equipmentTypes]);
  const customOptions = library
    .filter((symbol) => !symbol.deleted_at)
    .map((symbol) => ({ value: customSymbolKey(symbol.id), label: symbol.name }));

  const changed = JSON.stringify(draft) !== JSON.stringify(choices);

  const choose = (choiceKey: string, value: string) => {
    const next = { ...draft };
    if (value) next[choiceKey] = value;
    else delete next[choiceKey];
    setDraft(next);
  };

  return (
    <div>
      {customOptions.length === 0 && (
        <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
          The symbol library is empty, so only the built-in symbols are available.
        </p>
      )}
      <ul className="max-h-96 divide-y divide-neutral-200 overflow-y-auto dark:divide-neutral-700">
        {rows.map((row) => (
          <li key={row.choiceKey} className="flex items-center gap-3 py-1 pr-1">
            <Thumbnail symbolKey={draft[row.choiceKey] ?? row.builtIn} />
            <span className="min-w-0 flex-1 truncate text-sm" title={row.label}>
              {row.label}
            </span>
            <div className="w-44 shrink-0 [&>div]:mb-0">
              <Select
                aria-label={`Symbol for ${row.label}`}
                size="sm"
                value={draft[row.choiceKey] ?? ""}
                onChange={(event) => choose(row.choiceKey, event.target.value)}
                options={[
                  { value: "", label: `Built-in (${getSymbolGeometry(row.builtIn).label})` },
                  ...customOptions,
                ]}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => setDraft(resetTo)}>
          {resetLabel}
        </Button>
        <Button type="button" disabled={!changed || saving} onClick={() => onSave(draft)}>
          Save
        </Button>
      </div>
    </div>
  );
}
