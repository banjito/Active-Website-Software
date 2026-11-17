/**
 * Breaker Settings section: study settings pasted per report, As-Left typed by
 * the tech, each As-Left cell green when it matches its setting and red when it
 * doesn't. Data lives at formData[section.id].breakers (lib/customForms/breakerSettings.ts).
 *
 * Anyone filling the report may paste breakers, type As-Left, the fill-in
 * boxes and the mini-nameplate. Only reviewers and admins (chrome.canEditSetup)
 * may edit single study settings.
 */

import React from "react";
import { ArrowDown, ArrowUp, ClipboardPaste, Pencil, Plus, Trash2, X } from "lucide-react";
import type { SectionConfig } from "@/lib/types/customForms";
import type { SectionChrome } from "@/lib/customForms/runtime";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { CONTROL_CLASSES } from "./InteractiveControl";
import {
  BREAKERS_KEY,
  GROUP_BY_KEY,
  LIST_TEMPLATE_HEADINGS,
  NO_EQUIPMENT,
  NO_SECTION,
  groupByEquipment,
  readGroupBy,
  NAMEPLATE_FIELDS,
  breakerProgress,
  emptyBreaker,
  newBreakerId,
  parseBreakerPaste,
  readBreakers,
  settingMatch,
  functionLayout,
  splitI2t,
  SET_KEYS,
  type FunctionLayout,
  type SettingMatch,
  type SettingSet,
  type BreakerBlock,
  type BreakerSettingRow,
  type NameplateKey,
  type PasteResult,
} from "@/lib/customForms/breakerSettings";

const BORDER = "border-neutral-300 dark:border-neutral-600";
// Tight padding: this report runs to many breakers.
const HEAD = `border ${BORDER} bg-neutral-50 dark:bg-dark-200 px-1.5 py-0.5 text-left text-sm print:text-xs text-neutral-900 dark:text-white align-top [overflow-wrap:anywhere]`;
const CELL = `border ${BORDER} px-1.5 py-0.5 text-sm print:text-xs text-neutral-900 dark:text-white align-top [overflow-wrap:anywhere]`;
const CELL_INPUT =
  "w-full min-w-0 px-1.5 py-0.5 text-sm border-0 rounded-none bg-transparent text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand";
const BOX_INPUT =
  "w-full min-w-0 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand";
const BRAND_BUTTON =
  "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded-none hover:bg-brand/10 print:hidden";
const PLAIN_BUTTON =
  "inline-flex items-center gap-1 px-2 py-1 text-xs text-neutral-700 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-600 rounded-none hover:bg-neutral-100 dark:hover:bg-dark-200 print:hidden";
const DANGER_BUTTON =
  "inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-300 dark:border-red-700 rounded-none hover:bg-red-50 dark:hover:bg-red-900/20 print:hidden";
const PRINT_EXACT: React.CSSProperties = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

/** Printed value under an on-screen input (inputs don't print well). */
const PrintText: React.FC<{ value?: string }> = ({ value }) => (
  <span className="hidden print:block px-1.5 py-0.5 whitespace-pre-wrap break-words">{value ?? ""}</span>
);

const TextBox: React.FC<{
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  label: string;
}> = ({ value, onChange, className = CELL_INPUT, placeholder, label }) =>
  onChange ? (
    <>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${className} print:hidden`}
      />
      <PrintText value={value} />
    </>
  ) : (
    <span className="block px-1.5 py-0.5 whitespace-pre-wrap break-words">{value ?? ""}</span>
  );

const MATCH_TONE = {
  match: "bg-green-100 dark:bg-green-900/40",
  mismatch: "bg-red-100 dark:bg-red-900/40",
  none: "",
} as const;

const matchTitle = (state: SettingMatch, setting?: string) =>
  state === "match" ? "Matches the setting" : state === "mismatch" ? `Doesn't match the setting (${setting})` : undefined;

const AsLeftCell: React.FC<{
  setting?: string;
  value?: string;
  label: string;
  onChange?: (value: string) => void;
  className?: string;
}> = ({ setting, value, label, onChange, className }) => {
  const state = settingMatch(setting, value);
  return (
    <td
      className={`border ${BORDER} p-0 align-top ${MATCH_TONE[state]} ${className ?? ""}`}
      style={PRINT_EXACT}
      title={matchTitle(state, setting)}
    >
      <TextBox value={value} onChange={onChange} label={label} className={`${CELL_INPUT} ${className ?? ""}`} />
    </td>
  );
};

/** As-Left I²t: On / Off, checked against the study's I²t. */
const I2tCell: React.FC<{
  setting?: string;
  value?: string;
  label: string;
  onChange?: (value: string) => void;
}> = ({ setting, value, label, onChange }) => {
  const state = settingMatch(setting, value);
  return (
    <td
      className={`border ${BORDER} p-0 align-top text-center ${MATCH_TONE[state]}`}
      style={PRINT_EXACT}
      title={matchTitle(state, setting)}
    >
      {onChange ? (
        <>
          <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className={`${CELL_INPUT} text-center print:hidden`}
          >
            <option value=""></option>
            <option value="On">On</option>
            <option value="Off">Off</option>
          </select>
          <PrintText value={value} />
        </>
      ) : (
        <span className="block px-1.5 py-0.5">{value ?? ""}</span>
      )}
    </td>
  );
};

const DASH = <span className="block px-1.5 py-0.5 text-center text-neutral-400">-</span>;

// ---------------------------------------------------------------------------
// Function table, as on the LV Circuit Breaker ATS report (Function | Setting |
// Delay | I²t), with the study and As Left halves in ONE table so each function
// is one shared row: the two sides can never drift out of line, whatever wraps.
// ---------------------------------------------------------------------------

/** The heavier line between the study half and the As Left half. */
const SPLIT = "border-l-2 border-l-neutral-500 dark:border-l-neutral-400 print:border-l-black";

const FunctionTable: React.FC<{
  block: BreakerBlock;
  layout: FunctionLayout;
  set: SettingSet;
  studyTitle: string;
  asLeftTitle: string;
  onChange?: (next: BreakerBlock) => void;
}> = ({ block, layout, set, studyTitle, asLeftTitle, onChange }) => {
  const keys = SET_KEYS[set];
  const showI2t = layout.hasI2t[set];
  const half = 1 + (layout.hasDelay ? 1 : 0) + (showI2t ? 1 : 0);
  const update = (row: BreakerSettingRow, patch: Partial<BreakerSettingRow>) =>
    onChange?.({ ...block, rows: block.rows.map((r) => (r.id === row.id ? { ...r, ...patch } : r)) });
  const edit = (row: BreakerSettingRow, key: keyof BreakerSettingRow) =>
    onChange ? (value: string) => update(row, { [key]: value }) : undefined;
  const centered = `${CELL} text-center`;
  const valueWidth = `${84 / (half * 2)}%`;
  const subHeads = (split: boolean) => (
    <>
      <th className={`${HEAD} text-center font-medium ${split ? SPLIT : ""}`}>Setting</th>
      {layout.hasDelay && <th className={`${HEAD} text-center font-medium`}>Delay</th>}
      {showI2t && <th className={`${HEAD} text-center font-medium`}>I²t</th>}
    </>
  );

  return (
    <div className="mb-1.5 overflow-x-auto print:overflow-visible">
      <table className={`w-full table-fixed border-collapse border ${BORDER}`} style={{ minWidth: `${8 + half * 2 * 5}rem` }}>
        <colgroup>
          <col style={{ width: "16%" }} />
          {Array.from({ length: half * 2 }).map((_, i) => (
            <col key={i} style={{ width: valueWidth }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className={`${HEAD} font-medium align-bottom`}>
              Function
            </th>
            <th colSpan={half} className={`${HEAD} text-center font-semibold`}>
              {studyTitle}
            </th>
            <th colSpan={half} className={`${HEAD} text-center font-semibold ${SPLIT}`}>
              {asLeftTitle}
            </th>
          </tr>
          <tr>
            {subHeads(false)}
            {subHeads(true)}
          </tr>
        </thead>
        <tbody>
          {layout.rows.map((fnRow) => {
            const pickup = fnRow.pickup?.[keys.study];
            const delay = fnRow.delay ? splitI2t(fnRow.delay[keys.study]) : null;
            return (
              // Every cell centred in the row: text and input boxes sit on one line.
              <tr key={fnRow.fn} className="[&>td]:align-middle">
                <td className={`${CELL} font-medium`}>{fnRow.label}</td>
                {/* Study */}
                <td className={centered}>{pickup || DASH}</td>
                {layout.hasDelay && <td className={centered}>{delay?.value || DASH}</td>}
                {showI2t && <td className={centered}>{delay?.i2t || DASH}</td>}
                {/* As Left */}
                {pickup ? (
                  <AsLeftCell
                    setting={pickup}
                    value={fnRow.pickup![keys.asLeft]}
                    label={`${fnRow.label} setting As Left`}
                    onChange={edit(fnRow.pickup!, keys.asLeft)}
                    className={`text-center ${SPLIT}`}
                  />
                ) : (
                  <td className={`${centered} ${SPLIT}`}>{DASH}</td>
                )}
                {layout.hasDelay &&
                  (delay?.value ? (
                    <AsLeftCell
                      setting={delay.value}
                      value={fnRow.delay![keys.asLeft]}
                      label={`${fnRow.label} delay As Left`}
                      onChange={edit(fnRow.delay!, keys.asLeft)}
                      className="text-center"
                    />
                  ) : (
                    <td className={centered}>{DASH}</td>
                  ))}
                {showI2t &&
                  (delay?.i2t ? (
                    <I2tCell
                      setting={delay.i2t}
                      value={fnRow.delay![keys.asLeftI2t]}
                      label={`${fnRow.label} I²t As Left`}
                      onChange={edit(fnRow.delay!, keys.asLeftI2t)}
                    />
                  ) : (
                    <td className={centered}>{DASH}</td>
                  ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Plain list of settings: Setting | Set A | Set B | As-Left …. Used for
 * reviewers' Edit settings, and for settings that aren't a trip function.
 */
const GenericSettings: React.FC<{
  block: BreakerBlock;
  rows: BreakerSettingRow[];
  setup: boolean;
  canFill: boolean;
  onChange: (next: BreakerBlock) => void;
  title?: string;
}> = ({ block, rows, setup, canFill, onChange, title }) => {
  const erms = block.erms;
  const span = (erms ? 5 : 3) + (setup ? 1 : 0);
  const widths = erms ? ["16%", "21%", "21%", "21%", "21%"] : ["20%", "40%", "40%"];
  const setRow = (id: string, patch: Partial<BreakerSettingRow>) =>
    onChange({ ...block, rows: block.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  const edit = (fn: (value: string) => void) => (setup ? fn : undefined);
  const fill = (fn: (value: string) => void) => (canFill ? fn : undefined);
  const plain = setup ? `border ${BORDER} p-0` : CELL;

  return (
    <div className="mb-1.5 overflow-x-auto print:overflow-visible">
      <table className={`w-full table-fixed border-collapse border ${BORDER}`} style={{ minWidth: `${(erms ? 5 : 3) * 6}rem` }}>
        <colgroup>
          {widths.map((width, i) => (
            <col key={i} style={{ width }} />
          ))}
          {setup && <col className="print:hidden" style={{ width: "2rem" }} />}
        </colgroup>
        <thead>
          {title && (
            <tr>
              <th colSpan={span} className={`${HEAD} text-center font-semibold`}>
                {title}
              </th>
            </tr>
          )}
          <tr>
            <th className={`${HEAD} font-medium`}>Setting</th>
            <th className={`${HEAD} font-medium`}>{erms ? "Set A" : "Set To"}</th>
            {erms && <th className={`${HEAD} font-medium`}>Set B</th>}
            <th className={`${HEAD} font-medium`}>{erms ? "As-Left Set A" : "As-Left"}</th>
            {erms && <th className={`${HEAD} font-medium`}>As-Left Set B</th>}
            {setup && <th className={`${HEAD} print:hidden`} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={`${plain} font-medium`}>
                <TextBox value={row.setting} label="Setting" onChange={edit((v) => setRow(row.id, { setting: v }))} />
              </td>
              <td className={plain}>
                <TextBox value={row.normal} label={erms ? "Set A" : "Set To"} onChange={edit((v) => setRow(row.id, { normal: v }))} />
              </td>
              {erms && (
                <td className={plain}>
                  <TextBox value={row.erms} label="Set B" onChange={edit((v) => setRow(row.id, { erms: v }))} />
                </td>
              )}
              <AsLeftCell
                setting={row.normal}
                value={row.asLeftNormal}
                label={`${row.setting} As-Left${erms ? " Set A" : ""}`}
                onChange={fill((v) => setRow(row.id, { asLeftNormal: v }))}
              />
              {erms && (
                <AsLeftCell
                  setting={row.erms}
                  value={row.asLeftErms}
                  label={`${row.setting} As-Left Set B`}
                  onChange={fill((v) => setRow(row.id, { asLeftErms: v }))}
                />
              )}
              {setup && (
                <td className={`border ${BORDER} text-center print:hidden`}>
                  <button
                    type="button"
                    title="Remove setting row"
                    className="px-1.5 py-0.5 text-xs text-white bg-red-600 hover:bg-red-700 rounded-none"
                    onClick={() => onChange({ ...block, rows: block.rows.filter((r) => r.id !== row.id) })}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mini-nameplate: two rows of five, label inside each cell (a blank cell pads a short row)
// ---------------------------------------------------------------------------

const NAMEPLATE_ROWS: (typeof NAMEPLATE_FIELDS)[number][][] = [
  NAMEPLATE_FIELDS.slice(0, 5),
  NAMEPLATE_FIELDS.slice(5, 10),
];

/**
 * Drawn like the Job Details and Coordination Study blocks: same
 * `job-details-table` (so the same print sizing in ReportWrapper / PaperView),
 * same uppercase label and the same field box, five equal columns.
 */
const NAMEPLATE_INPUT = CONTROL_CLASSES.replace(/\brounded\b/, "rounded-none");
const NAMEPLATE_LABEL = "text-xs font-medium text-neutral-500 dark:text-white uppercase mb-1 [overflow-wrap:anywhere]";

const Nameplate: React.FC<{
  block: BreakerBlock;
  onChange?: (key: NameplateKey, value: string) => void;
}> = ({ block, onChange }) => (
  <div className="mb-1.5 overflow-x-auto">
    <table
      className={`min-w-full border-collapse border ${BORDER} job-details-table`}
      style={{ tableLayout: "fixed", width: "100%" }}
    >
      <colgroup>
        {Array.from({ length: 5 }).map((_, i) => (
          <col key={i} style={{ width: "20%" }} />
        ))}
      </colgroup>
      <tbody>
        {NAMEPLATE_ROWS.map((fields, r) => (
          <tr key={r}>
            {fields.map((f) => (
              <td key={f.key} className={`border ${BORDER} px-3 py-2 align-top`}>
                <div className={NAMEPLATE_LABEL}>{f.label}</div>
                {onChange ? (
                  <>
                    <input
                      type="text"
                      value={block[f.key] ?? ""}
                      onChange={(e) => onChange(f.key, e.target.value)}
                      aria-label={f.label}
                      className={`${NAMEPLATE_INPUT} print:hidden`}
                    />
                    <span className="hidden print:block whitespace-pre-wrap break-words cf-print-text">
                      {block[f.key] ?? ""}
                    </span>
                  </>
                ) : (
                  <span className="block py-1.5 text-sm text-neutral-900 dark:text-white whitespace-pre-wrap break-words">
                    {block[f.key] ?? ""}
                  </span>
                )}
              </td>
            ))}
            {fields.length < 5 && <td className={`border ${BORDER} px-3 py-2`} />}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------------------
// One breaker
// ---------------------------------------------------------------------------

interface BlockProps {
  block: BreakerBlock;
  /** As-Left and fill-in boxes can be typed. */
  canFill: boolean;
  /** Study settings can be changed (office edit mode). */
  setup: boolean;
  onChange: (next: BreakerBlock) => void;
  onMove?: (delta: -1 | 1) => void;
  onDelete?: () => void;
}

const BreakerTable: React.FC<BlockProps> = ({ block, canFill, setup, onChange, onMove, onDelete }) => {
  const erms = block.erms;
  const set = (patch: Partial<BreakerBlock>) => onChange({ ...block, ...patch });
  const fill = (fn: (value: string) => void) => (canFill ? fn : undefined);
  const layout = functionLayout(block);
  const sets: SettingSet[] = erms ? ["a", "b"] : ["a"];
  const tableTitle = (s: SettingSet, kind: "study" | "asLeft") =>
    `${kind === "study" ? "Study Settings" : "Settings As Left"}${erms ? ` — Set ${s.toUpperCase()}` : ""}`;

  return (
    <div className="cf-breaker mb-5 break-inside-avoid">
      {setup ? (
        <div className="mb-2 grid grid-cols-1 sm:grid-cols-2 gap-2 print:hidden">
          <label className="text-xs text-neutral-600 dark:text-neutral-300">
            Group / heading
            <input className={BOX_INPUT} value={block.group ?? ""} onChange={(e) => set({ group: e.target.value })} />
          </label>
          <label className="text-xs text-neutral-600 dark:text-neutral-300">
            Study ID
            <input className={BOX_INPUT} value={block.studyId ?? ""} onChange={(e) => set({ studyId: e.target.value })} />
          </label>
          <label className="sm:col-span-2 text-xs text-neutral-600 dark:text-neutral-300">
            Breaker description (optional)
            <input className={BOX_INPUT} value={block.breaker ?? ""} onChange={(e) => set({ breaker: e.target.value })} />
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-200">
              <input
                type="checkbox"
                className="rounded-none"
                checked={erms}
                onChange={(e) =>
                  set({
                    erms: e.target.checked,
                    rows: block.rows.map((row) =>
                      e.target.checked ? { ...row, erms: row.erms ?? "" } : { ...row, erms: undefined, asLeftErms: undefined },
                    ),
                  })
                }
              />
              Two setting groups (Set A / Set B)
            </label>
            <span className="flex-1" />
            {onMove && (
              <>
                <button type="button" className={PLAIN_BUTTON} onClick={() => onMove(-1)} title="Move up">
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button type="button" className={PLAIN_BUTTON} onClick={() => onMove(1)} title="Move down">
                  <ArrowDown className="w-3 h-3" />
                </button>
              </>
            )}
            {onDelete && (
              <button type="button" className={DANGER_BUTTON} onClick={onDelete}>
                <Trash2 className="w-3 h-3" /> Delete breaker
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
          {block.group && (
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {block.group}
            </span>
          )}
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">{block.title}</h4>
        </div>
      )}

      <Nameplate block={block} onChange={canFill ? (key, value) => set({ [key]: value }) : undefined} />

      {(block.inputs?.length ?? 0) > 0 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {block.inputs!.map((input) => (
            <label key={input.id} className="flex items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200">
              <span>{input.label}:</span>
              <span className="min-w-[8rem] border-b border-neutral-400 dark:border-neutral-500">
                <TextBox
                  value={input.value}
                  label={input.label}
                  className={CELL_INPUT}
                  onChange={fill((value) =>
                    set({ inputs: block.inputs!.map((i) => (i.id === input.id ? { ...i, value } : i)) }),
                  )}
                />
              </span>
            </label>
          ))}
        </div>
      )}

      {(block.studyId || block.breaker) && !setup && (
        <p className="mb-1 text-xs text-neutral-700 dark:text-neutral-300">
          {block.studyId && (
            <>
              <span className="font-semibold">Study ID:</span> {block.studyId}
            </>
          )}
          {block.studyId && block.breaker && <span className="mx-2">·</span>}
          {block.breaker && (
            <>
              <span className="font-semibold">Breaker:</span> {block.breaker}
            </>
          )}
        </p>
      )}

      {setup ? (
        <GenericSettings block={block} rows={block.rows} setup canFill={canFill} onChange={onChange} />
      ) : (
        <>
          {layout.rows.length > 0 &&
            sets.map((s) => (
              <FunctionTable
                key={s}
                block={block}
                layout={layout}
                set={s}
                studyTitle={tableTitle(s, "study")}
                asLeftTitle={tableTitle(s, "asLeft")}
                onChange={canFill ? onChange : undefined}
              />
            ))}
          {layout.others.length > 0 && (
            <GenericSettings
              block={block}
              rows={layout.others}
              setup={false}
              canFill={canFill}
              onChange={onChange}
              title={layout.rows.length ? "Other settings" : undefined}
            />
          )}
        </>
      )}

      {/* Notes: filled by the paste ("Notes" column), typed by anyone filling. Hidden on paper when empty. */}
      {(canFill || block.notes.length > 0) && (
        <div className={`mt-1 flex items-start gap-2 ${block.notes.length ? "" : "print:hidden"}`}>
          <span className="pt-1 text-xs font-semibold text-neutral-700 dark:text-neutral-300">Notes</span>
          <div className="flex-1 min-w-0 text-sm text-neutral-900 dark:text-white">
            {canFill ? (
              <>
                <textarea
                  rows={2}
                  aria-label={`${block.title} notes`}
                  className={`${BOX_INPUT} print:hidden`}
                  value={block.notes.join("\n")}
                  onChange={(e) => set({ notes: e.target.value.split("\n") })}
                  onBlur={(e) => set({ notes: e.target.value.split("\n").map((n) => n.trim()).filter(Boolean) })}
                />
                <PrintText value={block.notes.join("\n")} />
              </>
            ) : (
              <span className="block px-2 py-1 whitespace-pre-wrap break-words">{block.notes.join("\n")}</span>
            )}
          </div>
        </div>
      )}

      {setup && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 print:hidden">
          <div className="sm:col-span-2">
            <button
              type="button"
              className={PLAIN_BUTTON}
              onClick={() =>
                set({
                  rows: [
                    ...block.rows,
                    { id: newBreakerId("row"), setting: "", normal: "", ...(erms ? { erms: "" } : {}) },
                  ],
                })
              }
            >
              <Plus className="w-3 h-3" /> Setting row
            </button>
          </div>
          <label className="sm:col-span-2 text-xs text-neutral-600 dark:text-neutral-300">
            Fill-in boxes for the tech (one label per line, e.g. Ckt #)
            <textarea
              rows={3}
              className={BOX_INPUT}
              value={(block.inputs ?? []).map((i) => i.label).join("\n")}
              onChange={(e) => {
                const labels = e.target.value.split("\n");
                const old = block.inputs ?? [];
                set({
                  inputs: labels.map((label, i) =>
                    old[i] ? { ...old[i], label } : { id: newBreakerId("in"), label },
                  ),
                });
              }}
              onBlur={() => set({ inputs: (block.inputs ?? []).filter((i) => i.label.trim()) })}
            />
          </label>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Paste panel
// ---------------------------------------------------------------------------

/** A blank CSV with the list headings, to fill in and paste back. */
function downloadListTemplate() {
  // The byte-order mark makes Excel read UTF-8, so "I²t" keeps its ².
  const url = URL.createObjectURL(
    new Blob(["﻿" + LIST_TEMPLATE_HEADINGS.join(",") + "\r\n"], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "Breaker settings sheet.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PastePanel: React.FC<{
  hasBreakers: boolean;
  hasAsLeft: boolean;
  onApply: (breakers: BreakerBlock[], mode: "replace" | "append") => void;
  onClose: () => void;
}> = ({ hasBreakers, hasAsLeft, onApply, onClose }) => {
  const [text, setText] = React.useState("");
  const [result, setResult] = React.useState<PasteResult | null>(null);
  const read = (value: string) => setResult(value.trim() ? parseBreakerPaste(value) : null);
  const found = result?.breakers ?? [];
  const settings = found.reduce((n, b) => n + b.rows.length, 0);

  const replace = async () => {
    if (
      hasAsLeft &&
      !(await confirmDialog({
        title: "Replace every breaker?",
        description: "As-Left values already typed on this report will be lost.",
        confirmLabel: "Replace",
        destructive: true,
      }))
    )
      return;
    onApply(found, "replace");
  };

  return (
    <div className="mb-4 p-3 border border-brand/40 bg-brand/5 dark:bg-brand/10 rounded-none print:hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-neutral-700 dark:text-neutral-200 space-y-1">
          <p>
            In the spreadsheet, select the cells including the heading row, copy (Ctrl+C), then paste here (Ctrl+V).
            These work:
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>
              The <b>breaker settings sheet</b>, one row per breaker: the nameplate columns, then Set A and Set B
              Long Time, Short Time, Instantaneous and Ground Fault settings, delays and I²t. Older sheets with
              Phase / ERMS / GF columns still work.{" "}
              <button type="button" className="text-brand underline" onClick={downloadListTemplate}>
                Download a blank sheet
              </button>
            </li>
            <li>
              The SKM <b>LV Breakers</b> table (Name/Type, BusConnectedName, Description, Frame/Model,
              Frame/Sensor/Plug, Settings).
            </li>
            <li>Older layouts (one row per setting, or the entry form with “Study ID:” rows) still work.</li>
          </ul>
        </div>
        <button type="button" className={PLAIN_BUTTON} onClick={onClose} title="Close">
          <X className="w-3 h-3" />
        </button>
      </div>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          read(e.target.value);
        }}
        placeholder="Paste copied cells here"
        className={`${BOX_INPUT} mt-2 font-mono text-xs`}
      />
      {result?.error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{result.error}</p>}
      {found.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-700 dark:text-neutral-200">
            Found {found.length} breaker{found.length === 1 ? "" : "s"}, {settings} setting{settings === 1 ? "" : "s"}.
          </span>
          <button type="button" className={BRAND_BUTTON} onClick={replace}>
            {hasBreakers ? "Replace all breakers" : "Add these breakers"}
          </button>
          {hasBreakers && (
            <button type="button" className={PLAIN_BUTTON} onClick={() => onApply(found, "append")}>
              Add to the end
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

const SAMPLE: BreakerBlock = {
  id: "sample",
  group: "Section 1 (example)",
  title: "CB MCBG",
  equipment: "PMDC-P1.A1-1",
  equipmentSection: "Section 1",
  breakerType: "Static Trip",
  manufacturer: "SCHNEIDER",
  model: "MTZ3-H",
  frame: "5000",
  sensor: "5000",
  plug: "5000",
  erms: true,
  rows: [
    { id: "s1", setting: "Ir", normal: "1 (5000 A)", erms: "1 (5000 A)", asLeftNormal: "1", asLeftErms: "1" },
    {
      id: "s2",
      setting: "tsd",
      normal: "0.4 (I²t On)",
      erms: "0.4 (I²t On)",
      asLeftNormal: "0.4",
      asLeftNormalI2t: "On",
      asLeftErms: "0.2",
      asLeftErmsI2t: "On",
    },
  ],
  notes: ["Breakers and their study settings are pasted into each report, not set here."],
};

export const BreakerSettingsSection: React.FC<{ section: SectionConfig; chrome: SectionChrome }> = ({
  section,
  chrome,
}) => {
  const sectionData = chrome.conditionValues?.()?.[section.id];
  const breakers = readBreakers(sectionData);
  const grouped = readGroupBy(sectionData) === "equipment";
  const groups = grouped ? groupByEquipment(breakers) : [];
  const shown = grouped ? groups.flatMap((g) => g.breakers) : breakers;
  /** Headings drawn before a breaker: its equipment (first of the equipment) and its section (first of the section). */
  const headings = new Map<string, { equipment?: [string, number]; section?: [string, number] }>();
  for (const g of groups) {
    headings.set(g.breakers[0].id, { equipment: [g.equipment, g.breakers.length] });
    for (const s of g.sections) {
      if (!s.section) continue;
      const id = s.breakers[0].id;
      headings.set(id, { ...headings.get(id), section: [s.section, s.breakers.length] });
    }
  }
  /** Where a breaker sits when grouped; moves stay inside it. */
  const placeOf = (b: BreakerBlock) =>
    `${b.equipment?.trim() || NO_EQUIPMENT}\u0000${b.equipmentSection?.trim() || NO_SECTION}`;
  const count = (n: number) => `${n} breaker${n === 1 ? "" : "s"}`;
  const canFill = chrome.mode === "fill" && !!chrome.setSectionValue;
  const canSetup = canFill && !!chrome.canEditSetup;
  const [editing, setEditing] = React.useState(false);
  const [pasting, setPasting] = React.useState(false);
  const setup = canSetup && editing;

  const save = (next: BreakerBlock[]) => chrome.setSectionValue?.(section, BREAKERS_KEY, next);
  const progress = breakerProgress(breakers);

  // The builder and the component editor: no report to hold breakers.
  if (chrome.mode === "edit") {
    return (
      <div>
        <p className="mb-2 text-xs text-neutral-600 dark:text-neutral-300">
          The study's breakers are pasted into each report (SKM LV Breakers table or a list). Techs type As-Left:
          green = matches the setting, red = doesn't.
        </p>
        <BreakerTable block={SAMPLE} canFill={false} setup={false} onChange={() => {}} />
      </div>
    );
  }

  return (
    <div className="cf-breaker-settings">
      <style>{`@media print { .cf-breaker { break-inside: avoid; page-break-inside: avoid; } .cf-breaker-group { break-after: avoid; page-break-after: avoid; } .cf-breaker-settings input { display: none !important; } }`}</style>

      {canFill && (
        <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" className={BRAND_BUTTON} onClick={() => setPasting((v) => !v)}>
            <ClipboardPaste className="w-3.5 h-3.5" /> Paste study settings
          </button>
          {canSetup && (
            <button
              type="button"
              className={editing ? BRAND_BUTTON : PLAIN_BUTTON}
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="w-3.5 h-3.5" /> {editing ? "Done editing settings" : "Edit settings"}
            </button>
          )}
          {breakers.length > 0 && (
            <label className="inline-flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-200">
              <input
                type="checkbox"
                className="rounded-none"
                checked={grouped}
                onChange={(e) => chrome.setSectionValue?.(section, GROUP_BY_KEY, e.target.checked ? "equipment" : "")}
              />
              Group by Equipment Identifier
            </label>
          )}
          {breakers.length > 0 && (
            <span className="text-xs text-neutral-600 dark:text-neutral-300">
              {progress.breakers} breaker{progress.breakers === 1 ? "" : "s"} · {progress.entered} of {progress.cells}{" "}
              As-Left entered
              {progress.mismatched > 0 && (
                <span className="ml-1 font-medium text-red-600 dark:text-red-400">
                  · {progress.mismatched} don't match
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {pasting && canFill && (
        <PastePanel
          hasBreakers={breakers.length > 0}
          hasAsLeft={progress.entered > 0}
          onClose={() => setPasting(false)}
          onApply={(found, mode) => {
            save(mode === "replace" ? found : [...breakers, ...found]);
            setPasting(false);
          }}
        />
      )}

      {breakers.length === 0 ? (
        <p className="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {canFill ? "No breakers yet. Use Paste study settings." : "No breakers."}
        </p>
      ) : (
        shown.map((block, index) => (
          <React.Fragment key={block.id}>
            {grouped && headings.get(block.id)?.equipment && (
              <h3 className="cf-breaker-group mt-4 mb-2 pb-1 border-b-2 border-brand text-base font-semibold text-neutral-900 dark:text-white">
                {headings.get(block.id)!.equipment![0]}
                <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                  {count(headings.get(block.id)!.equipment![1])}
                </span>
              </h3>
            )}
            {grouped && headings.get(block.id)?.section && (
              <h4 className="cf-breaker-group mt-2 mb-2 pl-2 border-l-4 border-brand text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                {headings.get(block.id)!.section![0]}
                <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                  {count(headings.get(block.id)!.section![1])}
                </span>
              </h4>
            )}
          <BreakerTable
            block={block}
            canFill={canFill}
            setup={setup}
            onChange={(next) => save(breakers.map((b) => (b.id === next.id ? next : b)))}
            onMove={(delta) => {
              // Moves follow what's on screen; the shown order becomes the saved order.
              const to = index + delta;
              if (to < 0 || to >= shown.length) return;
              if (grouped && placeOf(shown[to]) !== placeOf(block)) return;
              const next = [...shown];
              [next[index], next[to]] = [next[to], next[index]];
              save(next);
            }}
            onDelete={async () => {
              if (
                await confirmDialog({
                  title: `Delete ${block.title}?`,
                  description: "Its settings and any As-Left values go too.",
                  confirmLabel: "Delete",
                  destructive: true,
                })
              ) {
                save(breakers.filter((b) => b.id !== block.id));
              }
            }}
          />
          </React.Fragment>
        ))
      )}

      {setup && (
        <div className="flex gap-2 print:hidden">
          <button type="button" className={PLAIN_BUTTON} onClick={() => save([...breakers, emptyBreaker(false)])}>
            <Plus className="w-3 h-3" /> Add breaker
          </button>
          <button type="button" className={PLAIN_BUTTON} onClick={() => save([...breakers, emptyBreaker(true)])}>
            <Plus className="w-3 h-3" /> Add two-set breaker
          </button>
        </div>
      )}

      {canFill && !canSetup && breakers.length > 0 && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 print:hidden">
          Only reviewers can edit single study settings. Type the As-Left values: green = matches the setting, red =
          doesn't.
        </p>
      )}
    </div>
  );
};

export default BreakerSettingsSection;
