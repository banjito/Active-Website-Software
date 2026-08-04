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
} from "@/services/equipmentAssetsService";
import {
  IMPORTABLE_ASSET_FIELDS,
  type EquipmentAsset,
  type EquipmentAssetInput,
  type ImportableAssetField,
} from "@/lib/types/assetTracking";

const UNMAPPED = "__unmapped__";
const PREVIEW_ROWS = 8;

/** Header spellings we auto-match, so a normal spreadsheet needs no mapping at all. */
const HEADER_HINTS: Record<ImportableAssetField, string[]> = {
  identifier: ["identifier", "id", "equipmentid", "tag", "assetid", "name", "equipment"],
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setSheets([]);
    setSheetIndex(0);
    setHasHeader(true);
    setMapping({});
    setPasteText("");
    setSourceLabel("");
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

  /** Rows turned into asset inputs, each flagged with why it might not import. */
  const candidates = useMemo(() => {
    if (identifierColumn === undefined) return [];
    const seenInFile = new Set<string>();

    return dataRows.map((row) => {
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

      return {
        issue,
        input: {
          site_id: siteId,
          identifier,
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
  }, [dataRows, mapping, identifierColumn, existingIdentifiers, siteId]);

  const importable = useMemo(() => candidates.filter((c) => !c.issue), [candidates]);
  const skipped = candidates.length - importable.length;

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

      const extra = result.skipped.length
        ? `, ${result.skipped.length} skipped as duplicates`
        : "";
      toast.success(`Imported ${result.inserted.length} assets${extra}`);
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
              <div className="grid gap-3 sm:grid-cols-3">
                {IMPORTABLE_ASSET_FIELDS.map((field) => (
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
                <p className="mb-2 text-sm">
                  <strong>{importable.length}</strong> ready to import
                  {skipped > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {" "}
                      · {skipped} will be skipped
                    </span>
                  )}
                </p>
                <div className="max-h-64 overflow-auto rounded-none border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Building / Area</TableHead>
                        <TableHead>Substation</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidates.slice(0, PREVIEW_ROWS).map((c, i) => (
                        <TableRow key={i} className={c.issue ? "opacity-60" : ""}>
                          <TableCell>{c.input.building_area || "—"}</TableCell>
                          <TableCell>{c.input.substation || "—"}</TableCell>
                          <TableCell className="font-medium">
                            {c.input.identifier || "—"}
                          </TableCell>
                          <TableCell>{c.input.equipment_location || "—"}</TableCell>
                          <TableCell>{c.input.equipment_type || "—"}</TableCell>
                          <TableCell>
                            {c.issue ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {c.issue}
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
                {candidates.length > PREVIEW_ROWS && (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    Showing the first {PREVIEW_ROWS} of {candidates.length} rows.
                  </p>
                )}
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
