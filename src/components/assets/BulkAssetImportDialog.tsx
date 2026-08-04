import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import Select from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { toast } from "react-hot-toast";
import {
  bulkInsertEquipmentAssets,
  createEquipmentType,
  setAssetParent,
} from "@/services/equipmentAssetsService";
import {
  IMPORTABLE_ASSET_FIELDS,
  type EquipmentAsset,
  type EquipmentAssetInput,
  type ImportableAssetField,
} from "@/lib/types/assetTracking";

const UNMAPPED = "__unmapped__";

/** Header spellings we auto-match, so a normal spreadsheet needs no mapping at all. */
const HEADER_HINTS: Record<ImportableAssetField, string[]> = {
  identifier: ["identifier", "id", "equipmentid", "tag", "assetid", "name", "equipment"],
  // Deliberately narrow: "lineup" and "assembly" would fight the substation hints and
  // silently steal that column from it.
  parent_identifier: [
    "partof",
    "parent",
    "parentidentifier",
    "parentasset",
    "belongsto",
    "subassetof",
  ],
  building_area: ["building", "area", "buildingarea", "datahall", "hall", "dc", "zone"],
  substation: ["substation", "sub", "switchgear", "lineup"],
  equipment_location: ["equipmentlocation", "location", "room", "eqptlocation", "place"],
  equipment_type: ["equipmenttype", "type", "devicetype", "category", "equipclass"],
  manufacturer: ["manufacturer", "mfr", "make", "vendor", "brand"],
  model: ["model", "catalog", "catalognumber", "modelnumber", "partnumber"],
  serial_number: ["serial", "serialnumber", "sn", "serialno"],
  notes: ["notes", "comment", "comments", "remarks", "description"],
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Best-guess column mapping from the header row. Exact matches win over partial ones. */
function autoMapColumns(headers: string[]): Record<ImportableAssetField, number> {
  const mapping = {} as Record<ImportableAssetField, number>;
  const taken = new Set<number>();
  const normalized = headers.map(normalizeHeader);

  for (const pass of ["exact", "partial"] as const) {
    for (const field of IMPORTABLE_ASSET_FIELDS) {
      if (mapping[field.key] !== undefined) continue;
      const hints = HEADER_HINTS[field.key];
      const index = normalized.findIndex((h, i) => {
        if (!h || taken.has(i)) return false;
        return pass === "exact"
          ? hints.includes(h)
          : hints.some((hint) => h.includes(hint));
      });
      if (index >= 0) {
        mapping[field.key] = index;
        taken.add(index);
      }
    }
  }
  return mapping;
}

/** Rows look like a header when the first row is all text and none of it is numeric. */
function looksLikeHeader(row: string[]): boolean {
  const filled = row.filter((c) => c.trim());
  if (filled.length < 2) return false;
  return filled.every((c) => !/^\d+([.,]\d+)?$/.test(c.trim()));
}

interface ParsedSheet {
  name: string;
  rows: string[][];
}

interface BulkAssetImportDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string;
  /** Lowercased identifiers already at the site, for duplicate flagging. */
  existingIdentifiers: Set<string>;
  /**
   * Every asset at the site, so a "Part of" column can be resolved to real equipment.
   * Omitted where sub-assets aren't available, which hides the field.
   */
  siteAssets?: EquipmentAsset[];
  knownEquipmentTypes: string[];
  userId?: string;
  onImported: (created: EquipmentAsset[]) => void;
  /** Job context: label the confirm button so it's clear assets also join the job. */
  alsoLinksToJob?: boolean;
}

/**
 * Load a site's equipment from a spreadsheet.
 *
 * Everything is parsed in the browser — the file is never uploaded anywhere. Accepts
 * .xlsx / .xls / .csv, or a straight paste from Excel.
 */
export function BulkAssetImportDialog({
  open,
  onClose,
  siteId,
  siteName,
  existingIdentifiers,
  siteAssets,
  knownEquipmentTypes,
  userId,
  onImported,
  alsoLinksToJob,
}: BulkAssetImportDialogProps) {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  const [previewFilter, setPreviewFilter] = useState<"all" | "skipped">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setSheets([]);
    setSheetIndex(0);
    setHasHeader(true);
    setMapping({});
    setPasteText("");
    setSourceLabel("");
    setPreviewFilter("all");
  };

  const close = () => {
    reset();
    onClose();
  };

  const loadRows = (parsed: ParsedSheet[], label: string) => {
    const nonEmpty = parsed.filter((s) => s.rows.length > 0);
    if (nonEmpty.length === 0) {
      toast.error("No rows found in that file");
      return;
    }
    setSheets(nonEmpty);
    setSheetIndex(0);
    setSourceLabel(label);

    const first = nonEmpty[0].rows;
    const header = looksLikeHeader(first[0] ?? []);
    setHasHeader(header);
    setMapping(header ? autoMapColumns(first[0]) : {});
  };

  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const parsed: ParsedSheet[] = workbook.SheetNames.map((name) => {
        const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], {
          header: 1,
          blankrows: false,
          defval: "",
          raw: false,
        });
        return {
          name,
          rows: rows
            .map((r) => (r ?? []).map((c) => String(c ?? "")))
            .filter((r) => r.some((c) => c.trim())),
        };
      });
      loadRows(parsed, file.name);
    } catch (e: any) {
      console.error(e);
      toast.error("Could not read that file. Is it a valid Excel or CSV file?");
    }
  };

  const handlePaste = () => {
    const lines = pasteText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) {
      toast.error("Nothing to import");
      return;
    }
    // Tab-separated is what Excel puts on the clipboard; fall back to comma.
    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const rows = lines.map((l) => l.split(delimiter).map((c) => c.trim()));
    loadRows([{ name: "Pasted", rows }], "pasted rows");
  };

  const activeSheet = sheets[sheetIndex];
  const headerRow = hasHeader ? (activeSheet?.rows[0] ?? []) : [];
  const dataRows = useMemo(
    () => (activeSheet ? activeSheet.rows.slice(hasHeader ? 1 : 0) : []),
    [activeSheet, hasHeader],
  );

  const columnCount = useMemo(
    () => activeSheet?.rows.reduce((max, r) => Math.max(max, r.length), 0) ?? 0,
    [activeSheet],
  );

  const columnOptions = useMemo(() => {
    const opts = [{ value: UNMAPPED, label: "— not imported —" }];
    for (let i = 0; i < columnCount; i++) {
      const name = hasHeader && headerRow[i]?.trim() ? headerRow[i].trim() : `Column ${i + 1}`;
      opts.push({ value: String(i), label: name });
    }
    return opts;
  }, [columnCount, hasHeader, headerRow]);

  const identifierColumn = mapping.identifier;
  /** "Part of" only makes sense where sub-assets exist on this database. */
  const subAssetsAvailable = Boolean(siteAssets);
  const parentColumnMapped =
    subAssetsAvailable && mapping.parent_identifier !== undefined;

  /** Site equipment by lowercased identifier, for resolving the "Part of" column. */
  const siteAssetsByIdentifier = useMemo(() => {
    const map = new Map<string, EquipmentAsset>();
    for (const a of siteAssets ?? []) map.set(a.identifier.trim().toLowerCase(), a);
    return map;
  }, [siteAssets]);

  /**
   * What this file itself declares: each row's identifier mapped to the parent it names.
   * A parent can therefore be created by the same import — and a row that points at one
   * which is itself a sub-asset can be caught before the database rejects it.
   */
  const parentsInFile = useMemo(() => {
    const idColumn = mapping.identifier;
    const parentColumn = mapping.parent_identifier;
    const map = new Map<string, string>();
    if (idColumn === undefined) return map;
    for (const row of dataRows) {
      const identifier = (row[idColumn] ?? "").trim().toLowerCase();
      if (!identifier || map.has(identifier)) continue;
      map.set(
        identifier,
        parentColumn === undefined ? "" : (row[parentColumn] ?? "").trim(),
      );
    }
    return map;
  }, [dataRows, mapping]);

  /** Rows turned into asset inputs, each flagged with why it might not import. */
  const candidates = useMemo(() => {
    if (identifierColumn === undefined) return [];
    const seenInFile = new Set<string>();

    return dataRows.map((row, index) => {
      const valueOf = (field: ImportableAssetField): string => {
        const col = mapping[field];
        if (col === undefined) return "";
        return (row[col] ?? "").trim();
      };

      const identifier = valueOf("identifier");
      const key = identifier.toLowerCase();
      let issue: string | null = null;

      if (!identifier) issue = "No identifier";
      else if (existingIdentifiers.has(key)) issue = "Already at this site";
      else if (seenInFile.has(key)) issue = "Duplicate row in file";

      if (identifier) seenInFile.add(key);

      // ── Resolve "Part of" ──────────────────────────────────────────────────
      // Three outcomes: an asset already at the site (linked immediately), another row
      // of this same file (linked in a second pass, once it has an id), or nothing —
      // which imports the row as top-level rather than guessing.
      const parentIdentifier = subAssetsAvailable ? valueOf("parent_identifier") : "";
      const parentKey = parentIdentifier.toLowerCase();
      const existingParent = parentKey ? siteAssetsByIdentifier.get(parentKey) : undefined;
      let parentAssetId: string | null = null;
      let pendingParentIdentifier: string | null = null;
      let warning: string | null = null;

      if (parentIdentifier) {
        if (parentKey === key) {
          warning = "Listed as its own parent — imported as top-level";
        } else if (existingParent) {
          if (existingParent.parent_asset_id) {
            warning = `"${parentIdentifier}" is itself a sub-asset — imported as top-level`;
          } else {
            parentAssetId = existingParent.id;
          }
        } else if (parentsInFile.has(parentKey)) {
          if (parentsInFile.get(parentKey)) {
            warning = `"${parentIdentifier}" is itself a sub-asset in this file — imported as top-level`;
          } else {
            pendingParentIdentifier = parentIdentifier;
          }
        } else {
          warning = `No asset named "${parentIdentifier}" — imported as top-level`;
        }
      }

      return {
        issue,
        warning,
        parentIdentifier,
        pendingParentIdentifier,
        // The row's line in the source spreadsheet, so a flagged row can be found there.
        rowNumber: index + (hasHeader ? 2 : 1),
        input: {
          site_id: siteId,
          identifier,
          parent_asset_id: parentAssetId,
          building_area: valueOf("building_area") || null,
          substation: valueOf("substation") || null,
          equipment_location: valueOf("equipment_location") || null,
          equipment_type: valueOf("equipment_type") || null,
          manufacturer: valueOf("manufacturer") || null,
          model: valueOf("model") || null,
          serial_number: valueOf("serial_number") || null,
          notes: valueOf("notes") || null,
        } as EquipmentAssetInput,
      };
    });
  }, [
    dataRows,
    mapping,
    identifierColumn,
    existingIdentifiers,
    siteId,
    hasHeader,
    subAssetsAvailable,
    siteAssetsByIdentifier,
    parentsInFile,
  ]);

  const importable = useMemo(() => candidates.filter((c) => !c.issue), [candidates]);
  const skipped = candidates.length - importable.length;
  const flagged = useMemo(
    () => candidates.filter((c) => c.issue || c.warning).length,
    [candidates],
  );
  const nestedCount = useMemo(
    () =>
      importable.filter((c) => c.input.parent_asset_id || c.pendingParentIdentifier)
        .length,
    [importable],
  );

  // Falls back to every row once a re-mapping clears the flags, so the toggle can't
  // leave you staring at an empty list.
  const previewRows = useMemo(
    () =>
      previewFilter === "skipped" && flagged > 0
        ? candidates.filter((c) => c.issue || c.warning)
        : candidates,
    [candidates, previewFilter, flagged],
  );

  const runImport = async () => {
    if (importable.length === 0) return;
    setImporting(true);
    try {
      const result = await bulkInsertEquipmentAssets(
        importable.map((c) => c.input),
        userId,
      );

      // Remember any new equipment-type wording from the spreadsheet.
      const newTypes = new Set(
        importable
          .map((c) => c.input.equipment_type?.trim())
          .filter((t): t is string => Boolean(t) && !knownEquipmentTypes.includes(t!)),
      );
      for (const t of newTypes) void createEquipmentType(t);

      // Second pass: rows whose parent was created by this same import only have an id to
      // point at now that the insert has happened.
      const createdByIdentifier = new Map(
        result.inserted.map((a) => [a.identifier.trim().toLowerCase(), a]),
      );
      let nested = 0;
      let failedToNest = 0;
      for (const candidate of importable) {
        if (!candidate.pendingParentIdentifier) continue;
        const child = createdByIdentifier.get(
          candidate.input.identifier.trim().toLowerCase(),
        );
        const parent = createdByIdentifier.get(
          candidate.pendingParentIdentifier.trim().toLowerCase(),
        );
        if (!child || !parent) {
          failedToNest++;
          continue;
        }
        try {
          await setAssetParent(child.id, parent.id, userId);
          nested++;
        } catch (e) {
          console.error(e);
          failedToNest++;
        }
      }

      const extra = result.skipped.length
        ? `, ${result.skipped.length} skipped as duplicates`
        : "";
      const nestedNote = nested > 0 ? `, ${nested} nested under a parent` : "";
      toast.success(`Imported ${result.inserted.length} assets${extra}${nestedNote}`);
      if (failedToNest > 0) {
        toast.error(
          `${failedToNest} row${failedToNest === 1 ? "" : "s"} imported but could not be nested — set "Part of" on them by hand.`,
        );
      }
      onImported(result.inserted);
      close();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle>Import assets into {siteName}</DialogTitle>
          <DialogDescription>
            Drop an Excel or CSV file, or paste rows straight from your spreadsheet. The
            file is read in your browser — nothing is uploaded.
          </DialogDescription>
        </DialogHeader>

        {sheets.length === 0 ? (
          <div className="grid gap-4 py-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-neutral-300 p-8 text-center dark:border-neutral-600"
            >
              <FileSpreadsheet className="h-8 w-8 text-neutral-400" />
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Drop a <strong>.xlsx</strong>, <strong>.xls</strong> or{" "}
                <strong>.csv</strong> here
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                leftIcon={<Upload className="h-4 w-4" />}
              >
                Choose file
              </Button>
            </div>

            <div>
              <Label htmlFor="paste-rows">…or paste rows</Label>
              <Textarea
                id="paste-rows"
                rows={4}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  "Building\tSubstation\tIdentifier\tLocation\tType\nDC7\tSub 3\tCB-101\tElec Rm 2\tLV Breaker"
                }
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                className="mt-2"
                onClick={handlePaste}
                disabled={!pasteText.trim()}
              >
                Use pasted rows
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="flex flex-wrap items-end gap-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                <strong>{sourceLabel}</strong> — {dataRows.length} row
                {dataRows.length === 1 ? "" : "s"}
              </p>
              {sheets.length > 1 && (
                <div className="w-56">
                  <Label htmlFor="sheet-pick">Sheet</Label>
                  <Select
                    id="sheet-pick"
                    value={String(sheetIndex)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setSheetIndex(next);
                      const rows = sheets[next].rows;
                      const header = looksLikeHeader(rows[0] ?? []);
                      setHasHeader(header);
                      setMapping(header ? autoMapColumns(rows[0]) : {});
                    }}
                    options={sheets.map((s, i) => ({
                      value: String(i),
                      label: `${s.name} (${s.rows.length})`,
                    }))}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => {
                    setHasHeader(e.target.checked);
                    setMapping(
                      e.target.checked ? autoMapColumns(activeSheet.rows[0] ?? []) : {},
                    );
                  }}
                />
                First row is a header
              </label>
              <Button variant="ghost" onClick={reset} className="ml-auto">
                Start over
              </Button>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Match your columns</p>
              {subAssetsAvailable && (
                <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <strong>Part of</strong> takes the parent's identifier — either equipment
                  already at this site or another row in this same file.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {IMPORTABLE_ASSET_FIELDS.filter(
                  (field) => field.key !== "parent_identifier" || subAssetsAvailable,
                ).map((field) => (
                  <div key={field.key}>
                    <Label htmlFor={`map-${field.key}`}>
                      {field.label}
                      {field.required && <span className="ml-1 text-brand">*</span>}
                    </Label>
                    <Select
                      id={`map-${field.key}`}
                      value={
                        mapping[field.key] === undefined
                          ? UNMAPPED
                          : String(mapping[field.key])
                      }
                      onChange={(e) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (e.target.value === UNMAPPED) delete next[field.key];
                          else next[field.key] = Number(e.target.value);
                          return next;
                        })
                      }
                      options={columnOptions}
                    />
                  </div>
                ))}
              </div>
            </div>

            {identifierColumn === undefined ? (
              <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Pick which column holds the <strong>Identifier</strong> — it's the one
                  field every asset needs.
                </span>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <p className="text-sm">
                    <strong>{importable.length}</strong> ready to import
                    {nestedCount > 0 && (
                      <span className="text-neutral-500 dark:text-neutral-400">
                        {" "}
                        · {nestedCount} nested under a parent
                      </span>
                    )}
                    {skipped > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {" "}
                        · {skipped} will be skipped
                      </span>
                    )}
                  </p>
                  {flagged > 0 && (
                    <div className="ml-auto flex border border-neutral-200 dark:border-neutral-600">
                      {(
                        [
                          { value: "all", label: `All ${candidates.length}` },
                          { value: "skipped", label: `Needs attention ${flagged}` },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setPreviewFilter(option.value)}
                          aria-pressed={previewFilter === option.value}
                          className={`px-3 py-1 text-xs font-medium ${
                            previewFilter === option.value
                              ? "bg-brand text-white"
                              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-dark-100"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Every row is listed — a skipped row buried at line 400 is exactly the
                    one you need to see before importing. */}
                <div className="max-h-[24rem] overflow-auto rounded-none border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Row</TableHead>
                        <TableHead>Building / Area</TableHead>
                        <TableHead>Substation</TableHead>
                        <TableHead>Identifier</TableHead>
                        {parentColumnMapped && <TableHead>Part of</TableHead>}
                        <TableHead>Location</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((c) => (
                        <TableRow
                          key={c.rowNumber}
                          className={
                            c.issue || c.warning
                              ? "bg-amber-50/60 dark:bg-amber-950/30"
                              : ""
                          }
                        >
                          <TableCell className="text-xs text-neutral-400">
                            {c.rowNumber}
                          </TableCell>
                          <TableCell>{c.input.building_area || "—"}</TableCell>
                          <TableCell>{c.input.substation || "—"}</TableCell>
                          <TableCell className="font-medium">
                            {c.input.identifier || "—"}
                          </TableCell>
                          {parentColumnMapped && (
                            <TableCell>
                              {c.parentIdentifier ? (
                                <span
                                  className={
                                    c.warning
                                      ? "text-amber-600 dark:text-amber-400"
                                      : undefined
                                  }
                                >
                                  {c.parentIdentifier}
                                  {c.pendingParentIdentifier && (
                                    <span className="ml-1 text-xs text-neutral-400">
                                      (in this file)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          )}
                          <TableCell>{c.input.equipment_location || "—"}</TableCell>
                          <TableCell>{c.input.equipment_type || "—"}</TableCell>
                          <TableCell>
                            {c.issue ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {c.issue}
                              </span>
                            ) : c.warning ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {c.warning}
                              </span>
                            ) : (
                              <span className="text-green-600 dark:text-green-400">
                                Ready
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Showing all {previewRows.length} row
                  {previewRows.length === 1 ? "" : "s"}
                  {previewFilter === "skipped" ? " that need a look" : ""} — scroll the
                  list to review them.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={runImport}
            disabled={importing || importable.length === 0}
          >
            {importing
              ? "Importing…"
              : `Import ${importable.length} asset${importable.length === 1 ? "" : "s"}${alsoLinksToJob ? " into this job" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkAssetImportDialog;
