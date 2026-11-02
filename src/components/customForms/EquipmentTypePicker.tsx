/**
 * Pick which equipment types a component belongs to (or Global).
 */

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import {
  GLOBAL_EQUIPMENT_TYPE,
  equipmentTypesLabel,
  isGlobal,
} from "@/lib/customForms/equipmentTypes";

export const EquipmentTypePicker: React.FC<{
  value: string[];
  options: string[];
  onChange: (types: string[]) => void;
  onManage?: () => void;
  disabled?: boolean;
}> = ({ value, options, onChange, onManage, disabled }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const global = isGlobal(value);
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value.filter((x) => x !== GLOBAL_EQUIPMENT_TYPE), t]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="h-7 max-w-[16rem] px-2 flex items-center gap-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded-none bg-white dark:bg-dark-150 text-neutral-800 dark:text-neutral-100 hover:border-brand disabled:opacity-60"
        title="Which equipment this component is for"
      >
        <span className="truncate">{equipmentTypesLabel(value)}</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-64 max-h-80 overflow-y-auto bg-white dark:bg-dark-150 border border-neutral-200 dark:border-dark-200 shadow-lg rounded-none p-1">
          <label className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-dark-100 cursor-pointer">
            <input
              type="checkbox"
              checked={global}
              onChange={() => onChange(global ? [] : [GLOBAL_EQUIPMENT_TYPE])}
              className="rounded-none"
            />
            Global (every report)
          </label>
          <div className="my-1 border-t border-neutral-100 dark:border-dark-200" />
          {options.length === 0 && <p className="px-2 py-1 text-xs text-neutral-500">No equipment types yet.</p>}
          {options.map((t) => (
            <label
              key={t}
              className={`flex items-center gap-2 px-2 py-1 text-xs hover:bg-neutral-50 dark:hover:bg-dark-100 cursor-pointer ${
                global ? "text-neutral-400" : "text-neutral-800 dark:text-neutral-100"
              }`}
            >
              <input type="checkbox" checked={!global && value.includes(t)} onChange={() => toggle(t)} disabled={global} className="rounded-none" />
              {t}
            </label>
          ))}
          {onManage && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="mt-1 w-full flex items-center gap-1 px-2 py-1 text-xs text-brand hover:bg-brand/10"
            >
              <Settings2 className="w-3.5 h-3.5" /> Edit the equipment types list…
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EquipmentTypePicker;
