/**
 * The mapping tool: say which field on each report type is the same reading.
 * Anyone can compare for now; admins and report reviewers can save a match so
 * it applies to every asset.
 */

import React, { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { TrendEntry } from "@/lib/trends/readings";
import { fieldsOn, type FieldInfo, type MappingMember, type TrendMapping } from "@/lib/trends/trendLines";

const box =
  "h-8 w-full px-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";

interface Draft {
  name: string;
  members: MappingMember[];
  /** The saved match being edited. */
  savedId?: string;
  /** The comparison this draft is showing. */
  tempId?: string;
}

const EMPTY: Draft = { name: "", members: [] };

export const TrendMatchPanel: React.FC<{
  entries: TrendEntry[];
  mappings: TrendMapping[];
  canSave: boolean;
  savingAvailable: boolean;
  onCompare: (mapping: TrendMapping) => void;
  onSave: (mapping: { id?: string; name: string; members: MappingMember[] }, tempId?: string) => Promise<void>;
  onRemove: (mapping: TrendMapping) => Promise<void>;
}> = ({ entries, mappings, canSave, savingAvailable, onCompare, onSave, onRemove }) => {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const fields = useMemo(() => fieldsOn(entries), [entries]);
  const types = useMemo(() => {
    const byType = new Map<string, { name: string; fields: FieldInfo[] }>();
    for (const field of fields) {
      if (!byType.has(field.reportType)) byType.set(field.reportType, { name: field.reportTypeName, fields: [] });
      byType.get(field.reportType)!.fields.push(field);
    }
    return [...byType].map(([reportType, type]) => ({ reportType, ...type }));
  }, [fields]);

  const here = (member: MappingMember) => types.some((type) => type.reportType === member.reportType);
  const relevant = mappings.filter((mapping) => mapping.members.some(here));
  const elsewhere = draft.members.filter((member) => !here(member)).length;
  const name = draft.name.trim() || draft.members[0]?.label || "";
  const ready = draft.members.length >= 2;

  const pick = (reportType: string, fieldKey: string) => {
    const others = draft.members.filter((member) => member.reportType !== reportType);
    const field = fields.find((f) => f.reportType === reportType && f.fieldKey === fieldKey);
    setDraft({
      ...draft,
      members: field
        ? [...others, { reportType, fieldKey, reportTypeName: field.reportTypeName, label: field.label }]
        : others,
    });
  };

  const compare = () => {
    const id = draft.tempId ?? `temp-${Date.now()}`;
    onCompare({ id, name, members: draft.members, saved: false });
    setDraft({ ...draft, tempId: id });
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave({ id: draft.savedId, name, members: draft.members }, draft.tempId);
      setDraft(EMPTY);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (mapping: TrendMapping) => {
    if (mapping.saved && !window.confirm(`Delete "${mapping.name}" for everyone?`)) return;
    setBusy(true);
    try {
      await onRemove(mapping);
      if (draft.savedId === mapping.id || draft.tempId === mapping.id) setDraft(EMPTY);
    } finally {
      setBusy(false);
    }
  };

  if (types.length < 2) {
    return (
      <div className="border border-neutral-200 dark:border-neutral-700 p-3 text-xs text-neutral-600 dark:text-neutral-300">
        This equipment has one report type, so its fields already line up.
      </div>
    );
  }

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 p-3 space-y-3">
      <p className="text-xs text-neutral-600 dark:text-neutral-300">
        Pick the field on each report type that holds the same reading.
      </p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {types.map((type) => (
          <label key={type.reportType} className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1 min-w-0">
            <span className="block font-medium truncate">{type.name}</span>
            <select
              value={draft.members.find((m) => m.reportType === type.reportType)?.fieldKey ?? ""}
              onChange={(e) => pick(type.reportType, e.target.value)}
              className={box}
            >
              <option value="">Leave out</option>
              {[...new Set(type.fields.map((f) => f.group))].map((group) => (
                <optgroup key={group} label={group}>
                  {type.fields
                    .filter((f) => f.group === group)
                    .map((f) => (
                      <option key={f.fieldKey} value={f.fieldKey}>
                        {f.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1 w-64 max-w-full">
          <span className="block font-medium">Name on the chart</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={draft.members[0]?.label ?? "e.g. A-G insulation"}
            className={box}
          />
        </label>
        <Button variant="outline" size="sm" onClick={compare} disabled={!ready || busy}>
          Compare now
        </Button>
        {canSave && savingAvailable && (
          <Button size="sm" onClick={save} disabled={!ready || busy}>
            {draft.savedId ? "Save changes" : "Save match"}
          </Button>
        )}
        {(draft.members.length > 0 || draft.savedId) && (
          <Button variant="ghost" size="sm" onClick={() => setDraft(EMPTY)} disabled={busy}>
            Clear
          </Button>
        )}
      </div>
      {elsewhere > 0 && (
        <p className="text-[11px] text-neutral-500">
          This match also covers {elsewhere} report {elsewhere === 1 ? "type" : "types"} not on this equipment. Those stay as they are.
        </p>
      )}
      {!savingAvailable ? (
        <p className="text-[11px] text-neutral-500">Saving matches isn't set up yet. Compare now still works.</p>
      ) : (
        !canSave && (
          <p className="text-[11px] text-neutral-500">
            Compare now lasts until you close this window. Admins and report reviewers can save a match.
          </p>
        )
      )}

      {relevant.length > 0 && (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-700 border-t border-neutral-200 dark:border-neutral-700">
          {relevant.map((mapping) => (
            <li key={mapping.id} className="flex items-center gap-2 py-1.5 text-xs text-neutral-700 dark:text-neutral-200">
              <span className="min-w-0 flex-1 truncate" title={mapping.members.map((m) => `${m.reportTypeName}: ${m.label}`).join("\n")}>
                {mapping.name}
                <span className="ml-1 text-neutral-500">
                  {mapping.saved ? `· ${mapping.members.length} report types` : "· this window only"}
                </span>
              </span>
              {mapping.saved && canSave && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${mapping.name}`}
                  onClick={() => setDraft({ name: mapping.name, members: mapping.members, savedId: mapping.id })}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}
              {(!mapping.saved || canSave) && (
                <Button variant="ghost" size="icon" aria-label={`Remove ${mapping.name}`} onClick={() => remove(mapping)} disabled={busy}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TrendMatchPanel;
