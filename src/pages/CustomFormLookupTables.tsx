/**
 * Lookup Tables page (/custom-forms/lookups)
 *
 * Manage the shared tables custom form formulas read with lookup(): NETA
 * acceptance criteria and the like. Each table is a key column plus one or
 * more value columns, edited as a grid or pasted from Excel.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Plus,
  Save,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  LOOKUP_ID_PATTERN,
  MISSING_LOOKUP_TABLE_MESSAGE,
  cacheLookupTable,
  canEditLookupTables,
  deleteLookupTable,
  saveLookupTable,
  useLookupTables,
  type SharedLookupTable,
} from "@/lib/customForms/lookupLibrary";

type Cell = string | number | boolean | null;

const inputCls =
  "h-8 px-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none focus:outline-none focus:ring-1 focus:ring-brand text-neutral-900 dark:text-white";
const cellCls =
  "w-full h-7 px-2 text-xs bg-transparent text-neutral-900 dark:text-white focus:outline-none focus:bg-brand/5";

function blankTable(): SharedLookupTable {
  return {
    id: "",
    name: "New lookup table",
    keyType: "number",
    valueType: "number",
    match: "range",
    keyLabel: "Up to",
    valueLabel: "Value",
    columns: [],
    entries: [{ key: 0, value: 0 }],
    fallback: null,
    engineeringVerified: false,
  };
}

/** Text typed into a cell, as the table's type. Blank → null. */
function parseCell(text: string, type: "number" | "string" | "boolean"): Cell {
  const t = text.trim();
  if (t === "") return null;
  if (type === "number") {
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : t;
  }
  if (type === "boolean") return /^(true|yes|y|1)$/i.test(t);
  return t;
}

/** Turn an id-friendly version of a name: "Table 100.1" → "table_100_1". */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "t$1") || "table"
  );
}

export const CustomFormLookupTables: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tables, missing } = useLookupTables();
  // Admins and report reviewers edit; everyone else can look.
  const canEdit = canEditLookupTables(user);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SharedLookupTable | null>(null);
  const [isNew, setIsNew] = useState(false);
  // Once the id is typed by hand, renaming the table stops suggesting one.
  const [dirtyId, setDirtyId] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const filtered = useMemo(
    () =>
      tables
        .filter((t) =>
          [t.name, t.id, t.description ?? ""].some((v) => v.toLowerCase().includes(search.toLowerCase())),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [tables, search],
  );

  useEffect(() => {
    if (!selectedId && !draft && filtered[0]) open(filtered[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  const confirmDiscard = async () =>
    !dirty ||
    (await confirmDialog({
      title: "Discard unsaved changes?",
      description: "Your changes to this table will be lost.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      destructive: true,
    }));

  function open(t: SharedLookupTable) {
    setSelectedId(t.id);
    setDraft(JSON.parse(JSON.stringify(t)));
    setIsNew(false);
    setDirtyId(false);
    setDirty(false);
    setPasteOpen(false);
  }

  const openSafely = async (t: SharedLookupTable) => {
    if (await confirmDiscard()) open(t);
  };

  const startNew = async (from?: SharedLookupTable) => {
    if (!(await confirmDiscard())) return;
    const base = from
      ? { ...JSON.parse(JSON.stringify(from)), builtIn: false, engineeringVerified: false, verifiedAt: null }
      : blankTable();
    const name = from ? `${from.name} (copy)` : base.name;
    setDraft({ ...base, name, id: from ? `${from.id}_copy` : "" });
    setSelectedId(null);
    setIsNew(true);
    setDirtyId(!!from);
    setDirty(true);
  };

  const update = (patch: Partial<SharedLookupTable>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  const readOnly = !!draft?.builtIn || !canEdit;
  const columns = draft?.columns ?? [];
  const valueType = draft?.valueType ?? "number";
  const keyType = draft?.match === "range" ? "number" : draft?.keyType ?? "number";

  const setEntry = (i: number, patch: Partial<SharedLookupTable["entries"][number]>) =>
    update({ entries: draft!.entries.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setExtra = (i: number, column: string, value: Cell) =>
    setEntry(i, { values: { ...(draft!.entries[i].values ?? {}), [column]: value } });

  const renameColumn = (oldName: string, next: string) => {
    const name = next.trim();
    if (!name || name === oldName || columns.includes(name)) return;
    update({
      columns: columns.map((c) => (c === oldName ? name : c)),
      entries: draft!.entries.map((e) => {
        const { [oldName]: v, ...rest } = (e.values ?? {}) as Record<string, Cell>;
        return { ...e, values: { ...rest, [name]: v ?? null } };
      }),
    });
  };

  /** Rows pasted from Excel (tab-separated); first column is the key. */
  const applyPaste = () => {
    const rows = pasteText
      .split(/\r?\n/)
      .map((line) => line.split("\t"))
      .filter((cells) => cells.some((c) => c.trim() !== ""));
    if (!rows.length || !draft) return;
    // A first row that isn't a number in the key column is treated as headings.
    let header: string[] | null = null;
    if (keyType === "number" && !Number.isFinite(Number(rows[0][0]?.replace(/,/g, "")))) {
      header = rows.shift()!;
    }
    const width = Math.max(...rows.map((r) => r.length));
    const extraNames =
      width > 2
        ? Array.from({ length: width - 2 }, (_, i) => header?.[i + 2]?.trim() || columns[i] || `column${i + 2}`)
        : [];
    const entries = rows.map((cells) => ({
      key: parseCell(cells[0] ?? "", keyType) as string | number,
      value: parseCell(cells[1] ?? "", valueType) as string | number | boolean,
      values: Object.fromEntries(extraNames.map((n, i) => [n, parseCell(cells[i + 2] ?? "", valueType)])),
    }));
    update({
      entries,
      columns: extraNames,
      ...(header
        ? { keyLabel: header[0]?.trim() || draft.keyLabel, valueLabel: header[1]?.trim() || draft.valueLabel }
        : {}),
    });
    setPasteOpen(false);
    setPasteText("");
    toast.success(`Pasted ${entries.length} rows.`);
  };

  const validate = (t: SharedLookupTable): string | null => {
    if (!t.name.trim()) return "Give the table a name.";
    if (!LOOKUP_ID_PATTERN.test(t.id))
      return 'The formula id may only use lower-case letters, numbers, dots and underscores, e.g. "neta.table100_1".';
    if (isNew && tables.some((x) => x.id === t.id)) return `A table with the id "${t.id}" already exists.`;
    if (!t.entries.length) return "Add at least one row.";
    if (t.entries.some((e) => e.key === null || e.key === ("" as any))) return "Every row needs a key.";
    if (t.match === "range" && t.entries.some((e) => typeof e.key !== "number"))
      return "An “up to” table needs numbers in the key column.";
    return null;
  };

  const handleSave = async () => {
    if (!draft) return;
    const problem = validate(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const toSave: SharedLookupTable = {
        ...draft,
        keyType: draft.match === "range" ? "number" : draft.keyType,
        // Range tables read in key order; keep them sorted so the grid reads the same way.
        entries:
          draft.match === "range"
            ? [...draft.entries].sort((a, b) => Number(a.key) - Number(b.key))
            : draft.entries,
        verifiedAt: draft.engineeringVerified ? draft.verifiedAt ?? new Date().toISOString() : null,
      };
      await saveLookupTable(toSave, user?.id);
      cacheLookupTable(toSave);
      setDraft(toSave);
      setSelectedId(toSave.id);
      setIsNew(false);
      setDirty(false);
      toast.success(`"${toSave.name}" saved.`);
    } catch (err: any) {
      toast.error(err?.message || "Could not save the table.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!draft || isNew || draft.builtIn) return;
    const ok = await confirmDialog({
      title: `Delete "${draft.name}"?`,
      description: `Formulas using lookup("${draft.id}", …) will show blank until a table with that id exists again.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteLookupTable(draft.id);
      cacheLookupTable({ id: draft.id, deleted: true });
      setDraft(null);
      setSelectedId(null);
      setDirty(false);
      toast.success("Table deleted.");
    } catch (err: any) {
      toast.error(err?.message || "Could not delete the table.");
    }
  };

  const example = draft
    ? `lookup("${draft.id || "table.id"}", {JD.voltage}${columns[0] ? `, "${columns[0]}"` : ""})`
    : "";

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-dark-200 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => (await confirmDiscard()) && navigate("/custom-forms/templates")}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Templates
            </Button>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Lookup tables</h1>
          </div>
          <Button
            onClick={() => startNew()}
            disabled={missing || !canEdit}
            title={canEdit ? undefined : "Only admins and report reviewers can add lookup tables"}
            className="bg-brand hover:bg-brand-dark"
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New table
          </Button>
        </div>

        {!canEdit && (
          <div className="mb-4 px-4 py-2 text-sm bg-neutral-100 dark:bg-dark-150 border border-neutral-200 dark:border-dark-200 text-neutral-700 dark:text-neutral-300 rounded-none">
            View only. Only admins and report reviewers can change lookup tables.
          </div>
        )}
        {missing && (
          <div className="mb-4 px-4 py-3 text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-none">
            {MISSING_LOOKUP_TABLE_MESSAGE} Built-in tables still work in formulas.
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* List */}
          <aside className="w-full lg:w-72 shrink-0 bg-white dark:bg-dark-150 border border-neutral-200 dark:border-dark-200 rounded-none">
            <div className="p-2 border-b border-neutral-200 dark:border-dark-200 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tables"
                className={`${inputCls} w-full pl-8`}
              />
            </div>
            <div className="max-h-[70vh] overflow-y-auto py-1">
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openSafely(t)}
                  className={`block w-full text-left px-3 py-2 text-sm rounded-none ${
                    t.id === selectedId
                      ? "bg-brand/10 text-brand"
                      : "text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-dark-100"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Table2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate font-medium">{t.name}</span>
                  </span>
                  <span className="flex items-center gap-1.5 mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span className="font-mono truncate">{t.id}</span>
                    {t.builtIn && <span className="shrink-0">· built-in</span>}
                    {t.engineeringVerified ? (
                      <CheckCircle2 className="w-3 h-3 shrink-0 text-green-600" />
                    ) : (
                      <span className="shrink-0 text-amber-600">· unverified</span>
                    )}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-neutral-500">No tables match.</p>
              )}
            </div>
          </aside>

          {/* Editor */}
          <main className="flex-1 min-w-0 w-full bg-white dark:bg-dark-150 border border-neutral-200 dark:border-dark-200 rounded-none p-4 space-y-4">
            {!draft ? (
              <p className="py-12 text-center text-sm text-neutral-500">
                Pick a table, or create a new one.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={draft.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      update({ name, ...(isNew && !dirtyId ? { id: slugify(name) } : {}) });
                    }}
                    disabled={readOnly}
                    className={`${inputCls} w-72 font-semibold`}
                    placeholder="Table name"
                  />
                  {draft.builtIn && canEdit && (
                    <span className="text-xs px-2 py-0.5 bg-neutral-100 dark:bg-dark-100 text-neutral-600 dark:text-neutral-300">
                      Built-in · copy it to change it
                    </span>
                  )}
                  {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
                  <div className="ml-auto flex flex-wrap gap-2">
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => startNew(draft)} leftIcon={<Copy className="w-3.5 h-3.5" />}>
                        Duplicate
                      </Button>
                    )}
                    {!readOnly && !isNew && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDelete}
                        className="text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400"
                        leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                      >
                        Delete
                      </Button>
                    )}
                    {!readOnly && (
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!dirty || saving || missing}
                        className="bg-brand hover:bg-brand-dark"
                        leftIcon={<Save className="w-3.5 h-3.5" />}
                      >
                        {saving ? "Saving…" : "Save"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                    <span className="block font-medium">Formula id</span>
                    <input
                      value={draft.id}
                      onChange={(e) => {
                        setDirtyId(true);
                        update({ id: e.target.value.trim() });
                      }}
                      disabled={readOnly || !isNew}
                      className={`${inputCls} w-full font-mono`}
                      placeholder="neta.table100_1"
                      title={isNew ? "Used in formulas. Can't be changed after saving." : "Can't be changed: formulas use it."}
                    />
                  </label>
                  <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                    <span className="block font-medium">Description</span>
                    <input
                      value={draft.description ?? ""}
                      onChange={(e) => update({ description: e.target.value || undefined })}
                      disabled={readOnly}
                      className={`${inputCls} w-full`}
                      placeholder="Where the numbers come from, e.g. NETA ATS-2025 Table 100.1"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-700 dark:text-neutral-200">
                  <label className="flex items-center gap-1.5">
                    How rows match
                    <select
                      value={draft.match ?? "exact"}
                      onChange={(e) => update({ match: e.target.value as "exact" | "range" })}
                      disabled={readOnly}
                      className={`${inputCls} h-7 text-xs`}
                    >
                      <option value="range">“Up to” ranges (numbers)</option>
                      <option value="exact">Exact match</option>
                    </select>
                  </label>
                  {draft.match !== "range" && (
                    <label className="flex items-center gap-1.5">
                      Keys are
                      <select
                        value={draft.keyType}
                        onChange={(e) => update({ keyType: e.target.value as "number" | "string" })}
                        disabled={readOnly}
                        className={`${inputCls} h-7 text-xs`}
                      >
                        <option value="number">Numbers</option>
                        <option value="string">Text (e.g. 600V)</option>
                      </select>
                    </label>
                  )}
                  <label className="flex items-center gap-1.5">
                    Values are
                    <select
                      value={draft.valueType}
                      onChange={(e) => update({ valueType: e.target.value as "number" | "string" | "boolean" })}
                      disabled={readOnly}
                      className={`${inputCls} h-7 text-xs`}
                    >
                      <option value="number">Numbers</option>
                      <option value="string">Text</option>
                      <option value="boolean">Yes / No</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5" title="Returned when no row matches. Leave blank for an empty cell.">
                    If nothing matches
                    <input
                      value={draft.fallback == null ? "" : String(draft.fallback)}
                      onChange={(e) => update({ fallback: parseCell(e.target.value, valueType) })}
                      disabled={readOnly}
                      className={`${inputCls} h-7 w-24 text-xs`}
                      placeholder="blank"
                    />
                  </label>
                </div>

                {draft.match === "range" && (
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Each row covers values up to and including its key. With keys 250, 600 and 5000,
                    480 reads the 600 row. Values above the last key use “If nothing matches”.
                  </p>
                )}

                {/* Grid */}
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-neutral-100 dark:bg-dark-200">
                        <th className="border border-neutral-300 dark:border-neutral-600 p-0 w-40">
                          <input
                            value={draft.keyLabel ?? ""}
                            onChange={(e) => update({ keyLabel: e.target.value })}
                            disabled={readOnly}
                            placeholder={draft.match === "range" ? "Up to" : "Key"}
                            className={`${cellCls} font-semibold`}
                          />
                        </th>
                        <th className="border border-neutral-300 dark:border-neutral-600 p-0 w-40">
                          <input
                            value={draft.valueLabel ?? ""}
                            onChange={(e) => update({ valueLabel: e.target.value })}
                            disabled={readOnly}
                            placeholder="Value"
                            className={`${cellCls} font-semibold`}
                            title='The main value: lookup("id", key)'
                          />
                        </th>
                        {columns.map((col) => (
                          <th key={col} className="border border-neutral-300 dark:border-neutral-600 p-0 w-40">
                            <div className="flex items-center">
                              <input
                                defaultValue={col}
                                onBlur={(e) => renameColumn(col, e.target.value)}
                                disabled={readOnly}
                                className={`${cellCls} font-semibold font-mono`}
                                title={`Read with lookup("id", key, "${col}")`}
                              />
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => update({ columns: columns.filter((c) => c !== col) })}
                                  className="p-1 text-neutral-400 hover:text-red-600"
                                  title="Remove column"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </th>
                        ))}
                        {!readOnly && (
                          <th className="border border-dashed border-neutral-300 dark:border-neutral-600 p-0 w-28">
                            <button
                              type="button"
                              onClick={() => {
                                let n = columns.length + 2;
                                while (columns.includes(`column${n}`)) n++;
                                update({ columns: [...columns, `column${n}`] });
                              }}
                              className="w-full h-7 flex items-center justify-center gap-1 text-brand hover:bg-brand/10"
                            >
                              <Plus className="w-3 h-3" /> Column
                            </button>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.entries.map((entry, i) => (
                        <tr key={i}>
                          <td className="border border-neutral-300 dark:border-neutral-600 p-0">
                            <input
                              value={entry.key == null ? "" : String(entry.key)}
                              onChange={(e) => setEntry(i, { key: parseCell(e.target.value, keyType) as any })}
                              disabled={readOnly}
                              className={`${cellCls} font-medium`}
                            />
                          </td>
                          <td className="border border-neutral-300 dark:border-neutral-600 p-0">
                            <input
                              value={entry.value == null ? "" : String(entry.value)}
                              onChange={(e) => setEntry(i, { value: parseCell(e.target.value, valueType) as any })}
                              disabled={readOnly}
                              className={cellCls}
                            />
                          </td>
                          {columns.map((col) => (
                            <td key={col} className="border border-neutral-300 dark:border-neutral-600 p-0">
                              <input
                                value={entry.values?.[col] == null ? "" : String(entry.values[col])}
                                onChange={(e) => setExtra(i, col, parseCell(e.target.value, valueType))}
                                disabled={readOnly}
                                className={cellCls}
                              />
                            </td>
                          ))}
                          {!readOnly && (
                            <td className="border border-neutral-300 dark:border-neutral-600 text-center">
                              <button
                                type="button"
                                onClick={() => update({ entries: draft.entries.filter((_, k) => k !== i) })}
                                className="p-1 text-neutral-400 hover:text-red-600"
                                title="Remove row"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!readOnly && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => update({ entries: [...draft.entries, { key: null as any, value: null as any }] })}
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Row
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPasteOpen((v) => !v)}
                      leftIcon={<ClipboardPaste className="w-3.5 h-3.5" />}
                    >
                      Paste from Excel
                    </Button>
                  </div>
                )}

                {pasteOpen && !readOnly && (
                  <div className="space-y-2 border border-brand/40 bg-brand/5 p-3">
                    <p className="text-xs text-neutral-600 dark:text-neutral-300">
                      Copy the cells in Excel (key column first, then values) and paste them here.
                      A heading row is fine. This replaces the rows above.
                    </p>
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      rows={6}
                      autoFocus
                      className="w-full p-2 text-xs font-mono bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none text-neutral-900 dark:text-white"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={applyPaste} disabled={!pasteText.trim()} className="bg-brand hover:bg-brand-dark">
                        Use these rows
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPasteOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Verification */}
                <div
                  className={`flex flex-wrap items-center gap-2 px-3 py-2 text-xs border rounded-none ${
                    draft.engineeringVerified
                      ? "border-green-300 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800"
                      : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800"
                  }`}
                >
                  {draft.engineeringVerified ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  <label className="flex items-center gap-1.5 font-medium">
                    <input
                      type="checkbox"
                      checked={draft.engineeringVerified}
                      onChange={(e) =>
                        update({ engineeringVerified: e.target.checked, verifiedAt: e.target.checked ? new Date().toISOString() : null })
                      }
                      disabled={readOnly}
                      className="rounded-none"
                    />
                    Engineer verified
                  </label>
                  <span>
                    {draft.engineeringVerified
                      ? `Checked against the standard${draft.verifiedAt ? ` on ${new Date(draft.verifiedAt).toLocaleDateString()}` : ""}.`
                      : "Not yet checked against the governing standard. Forms can use it, but results should be reviewed."}
                  </span>
                </div>

                {/* How to use */}
                <div className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                  <div className="font-medium">Use it in a formula</div>
                  <code className="block px-2 py-1 font-mono bg-neutral-100 dark:bg-dark-100 text-amber-700 dark:text-amber-300">
                    {example}
                  </code>
                  <div className="text-[11px] text-neutral-500">
                    Replace {"{JD.voltage}"} with the cell or field holding the key
                    {columns.length ? `; drop the last part to get the "${draft.valueLabel || "Value"}" column` : ""}.
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default CustomFormLookupTables;
