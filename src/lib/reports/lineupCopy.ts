/**
 * Copy a whole substation (a "lineup") of reports into a new substation in one go.
 *
 * Field crews on data-center jobs test the same lineup dozens of times: TADG-PMDC-008,
 * then -009, then -010, each holding the same ~33 breakers, switchboards and panels.
 * Before this they pressed "Copy nameplate data to new report" once per report. This
 * does the same copy for every report in the substation at once, sets the new
 * substation name, and swaps the lineup name inside each equipment name.
 *
 * Each recipe mirrors the "Copy nameplate" button of its report, but works on the
 * saved database row rather than the on-screen form, so it can run without opening
 * the report. Keep the two in step: if a report's copy button starts clearing (or
 * keeping) a field, change its recipe here too.
 *
 * Only the report types below can be copied today. Anything else in the
 * substation is listed as skipped, never silently half-copied.
 */
import { supabase } from "@/lib/supabase";
import { ensureReportAssetLink } from "@/components/reports/linkReportAsset";
import { newReportId } from "@/components/reports/common/reportIdentity";
import { getAssetName } from "@/components/reports/reportMappings";

type Row = Record<string, any>;

interface CopyContext {
  /** The new substation name, written onto every copy. */
  substation: string;
  /** Swaps the old lineup name for the new one inside an equipment name. */
  rename: (value: string) => string;
  /** Today, as the reports store it (YYYY-MM-DD). */
  today: string;
}

interface Recipe {
  table: string;
  /** Saved columns to read from the original. */
  columns: string[];
  /** The copy's saved columns (id, job and user are added by the caller). */
  copy: (row: Row, ctx: CopyContext) => Row;
  /** The equipment name on the copy, for the report's name on the job. */
  identifier: (copied: Row) => string;
  templateType?: string;
}

// ── Small helpers ────────────────────────────────────────────────────────────

const clone = <T>(value: T): T =>
  value == null ? value : (JSON.parse(JSON.stringify(value)) as T);

const asArray = (value: unknown): Row[] =>
  Array.isArray(value) ? (value as Row[]) : [];

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Same keys, every value blanked except the ones named. */
function blankExcept(obj: unknown, keep: string[]): Row {
  const out: Row = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [key, value] of Object.entries(obj as Row)) {
    out[key] = keep.includes(key) ? value : "";
  }
  return out;
}

/** Each entry of a keyed object blanked, e.g. every piece of test equipment. */
function blankEach(obj: unknown): Row {
  const out: Row = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [key, value] of Object.entries(obj as Row)) {
    out[key] = blankExcept(value, []);
  }
  return out;
}

/** Visual and mechanical items keep their wording; only the answer clears. */
const resetVisual = (items: unknown, blank: string): Row[] =>
  asArray(items).map((item) => ({ ...item, result: blank }));

/** Contact resistance evaluation: one row per section, criteria kept. */
const resetEvaluation = (tests: Row[], evaluation: unknown): Row[] =>
  tests.map((_, i) => ({
    deviation: "N/A",
    criteria: asArray(evaluation)[i]?.criteria || "<50%",
    result: "N/A",
  }));

const DEFAULT_TEMPERATURE = { fahrenheit: 68, celsius: 20, tcf: 1, humidity: null };

/** The ATS-25 switchgear and panelboard sheets share one saved shape. */
function copyAssemblyRow(
  row: Row,
  ctx: CopyContext,
  insulationKeep: string,
  resetSetup: boolean,
): Row {
  const info = clone(row.report_info ?? {});
  const insulation = clone(row.insulation_resistance ?? {});
  const contact = clone(row.contact_resistance ?? {});
  const clearInsulation = (r: Row) => blankExcept(r, [insulationKeep]);
  const contactTests = asArray(contact.tests).map((r) => blankExcept(r, ["busSection"]));

  return {
    report_info: {
      ...info,
      date: ctx.today,
      identifier: ctx.rename(text(info.identifier)),
      eqptLocation: ctx.rename(text(info.eqptLocation)),
      substation: ctx.substation,
      serialNumber: "",
      status: "PASS",
      ...(resetSetup
        ? {
            temperature: { ...DEFAULT_TEMPERATURE },
            testEquipment: blankEach(info.testEquipment),
          }
        : {}),
    },
    visual_mechanical: {
      ...(row.visual_mechanical ?? {}),
      items: resetVisual(row.visual_mechanical?.items, "Select One"),
    },
    insulation_resistance: {
      ...insulation,
      tests: asArray(insulation.tests).map(clearInsulation),
      correctedTests: asArray(insulation.correctedTests).map(clearInsulation),
    },
    contact_resistance: {
      ...contact,
      tests: contactTests,
      evaluation: resetEvaluation(contactTests, contact.evaluation),
      dielectricTests: asArray(contact.dielectricTests).map((r) =>
        blankExcept(r, ["busSection"]),
      ),
    },
    comments: "",
  };
}

// ── One recipe per report type ───────────────────────────────────────────────

const RECIPES: Record<string, Recipe> = {
  // Mirrors copyNameplateDataToNewReport in LVMoldedCaseCircuitBreakerATS25Report.
  "lv-molded-case-circuit-breaker-ats25": {
    table: "lv_molded_case_circuit_breaker_ats25",
    columns: ["report_data"],
    templateType: "ATS",
    copy: (row, ctx) => {
      const d: Row = clone(row.report_data ?? {});
      // "User" is the site's end user, so it carries over. Technicians clear.
      d.technicians = "";
      d.date = ctx.today;
      d.substation = ctx.substation;
      d.breakerIdentifier = ctx.rename(text(d.breakerIdentifier));
      d.eqptIdentifier = ctx.rename(text(d.eqptIdentifier));
      d.circuitCellNo = ctx.rename(text(d.circuitCellNo));
      d.serialNumber = "";
      d.visualInspectionItems = resetVisual(d.visualInspectionItems, "");
      if (d.deviceSettings?.asFound) {
        d.deviceSettings.asFound = blankEach(d.deviceSettings.asFound);
      }
      if (d.contactResistance) {
        d.contactResistance = blankExcept(d.contactResistance, [
          "units",
          "criteria",
          "skipDeviation",
          "poleCount",
        ]);
      }
      const ir = d.insulationResistance;
      if (ir) {
        for (const key of ["poleToPole", "poleToFrame", "lineToLoad"]) {
          if (!ir[key]) continue;
          ir[key] = {
            ...ir[key],
            measured: blankExcept(ir[key].measured, []),
            corrected: blankExcept(ir[key].corrected, []),
            result: "",
          };
        }
      }
      if (d.currentSensing && Array.isArray(d.currentSensing.tests)) {
        d.currentSensing.tests = d.currentSensing.tests.map((t: Row) => {
          const cleared: Row = { ...t, result: "" };
          for (const key of Object.keys(t)) {
            if (/^pole\d+$/.test(key)) cleared[key] = "";
          }
          return cleared;
        });
      }
      d.testEquipment = blankEach(d.testEquipment);
      d.comments = "";
      d.status = "PASS";
      d.irDlroOnly = false;
      return { report_data: d };
    },
    identifier: (c) =>
      text(c.report_data?.breakerIdentifier) || text(c.report_data?.eqptIdentifier),
  },

  // Mirrors copyNameplateDataToNewReport in SwitchgearSwitchboardAssembliesATS25Report.
  "switchgear-switchboard-assemblies-ats25": {
    table: "switchgear_switchboard_ats25_reports",
    columns: [
      "report_info",
      "visual_mechanical",
      "insulation_resistance",
      "contact_resistance",
    ],
    copy: (row, ctx) => copyAssemblyRow(row, ctx, "busSection", false),
    identifier: (c) => text(c.report_info?.identifier) || text(c.report_info?.eqptLocation),
  },

  // Mirrors copyNameplateDataToNewReport in PanelboardAssembliesATS25Report.
  "panelboard-assemblies-ats25": {
    table: "panelboard_assemblies_ats25_reports",
    columns: [
      "report_info",
      "visual_mechanical",
      "insulation_resistance",
      "contact_resistance",
    ],
    copy: (row, ctx) => copyAssemblyRow(row, ctx, "section", true),
    identifier: (c) => text(c.report_info?.identifier) || text(c.report_info?.eqptLocation),
  },

  // Mirrors copyNameplateDataToNewReport in SmallLowVoltageDryTypeTransformerATS25Report.
  "small-lv-dry-type-transformer-ats25": {
    table: "small_lv_dry_type_transformer_ats25_reports",
    columns: [
      "report_info",
      "visual_mechanical",
      "insulation_resistance",
      "turns_ratio",
      "test_equipment",
    ],
    copy: (row, ctx) => {
      const info = clone(row.report_info ?? {});
      const insulation = clone(row.insulation_resistance ?? {});
      const turns = clone(row.turns_ratio ?? {});
      const dar = insulation.dielectricAbsorptionRatio;
      return {
        report_info: {
          ...info,
          date: ctx.today,
          identifier: ctx.rename(text(info.identifier)),
          eqptLocation: ctx.rename(text(info.eqptLocation)),
          substation: ctx.substation,
          temperature: { ...DEFAULT_TEMPERATURE },
          status: "PASS",
          nameplate: { ...(info.nameplate ?? {}), serialNumber: "" },
        },
        visual_mechanical: {
          ...(row.visual_mechanical ?? {}),
          items: resetVisual(row.visual_mechanical?.items, "Select One"),
        },
        insulation_resistance: {
          ...insulation,
          insulationTemperature: "",
          rows: asArray(insulation.rows).map((r) => blankExcept(r, ["windingUnderTest"])),
          ...(dar && typeof dar === "object"
            ? {
                dielectricAbsorptionRatio: {
                  ...dar,
                  priToGnd: "",
                  secToGnd: "",
                  priToSec: "",
                  result: "",
                },
              }
            : {}),
        },
        turns_ratio: {
          ...turns,
          rows: asArray(turns.rows).map((r) => blankExcept(r, ["primaryWinding"])),
          differenceBetweenMR: "",
          differenceResult: "",
        },
        test_equipment: blankEach(row.test_equipment),
        comments: "",
      };
    },
    identifier: (c) => text(c.report_info?.identifier) || text(c.report_info?.eqptLocation),
  },
};

/**
 * "3-Low Voltage Cable Test ATS" (12sets.tsx). It has no copy-nameplate button, so this
 * recipe is its own rule: cable runs, sizes and settings carry over; inspection answers,
 * readings, results, test equipment and comments clear. Run names (From / To) get the
 * new lineup name like every other equipment name.
 */
RECIPES["low-voltage-cable-test-12sets"] = {
  table: "low_voltage_cable_test_12sets",
  columns: ["data"],
  copy: (row, ctx) => {
    const d: Row = clone(row.data ?? {});
    d.date = ctx.today;
    d.substation = ctx.substation;
    d.identifier = ctx.rename(text(d.identifier));
    d.eqptLocation = ctx.rename(text(d.eqptLocation));
    if (d.inspectionResults && typeof d.inspectionResults === "object") {
      for (const key of Object.keys(d.inspectionResults)) {
        d.inspectionResults[key] = "Select One";
      }
    }
    d.testSets = asArray(d.testSets).map((set) => ({
      ...set,
      from: ctx.rename(text(set.from)),
      to: ctx.rename(text(set.to)),
      result: "",
      readings: blankExcept(set.readings, []),
      correctedReadings: blankExcept(set.correctedReadings, []),
    }));
    d.testEquipment = blankExcept(d.testEquipment, []);
    d.status = "PASS";
    return { data: d };
  },
  identifier: (c) => text(c.data?.identifier) || text(c.data?.eqptLocation),
};

// ── Names ────────────────────────────────────────────────────────────────────

/**
 * The next lineup's name: the last number in the name, plus one, same zero padding.
 * "TADG-PMDC-008" → "TADG-PMDC-009", "opt-1a" → "opt-2a". Empty when there's no number.
 */
export function suggestNextLineupName(label: string): string {
  const match = label.match(/(\d+)(?!.*\d)/);
  if (!match || match.index == null) return "";
  const next = String(Number(match[1]) + 1).padStart(match[1].length, "0");
  return label.slice(0, match.index) + next + label.slice(match.index + match[1].length);
}

/**
 * Swap one piece of text for another inside equipment names. Ignores case when
 * matching, then follows the case it found: "1a" → "2b" turns "RPP-1A" into "RPP-2B".
 */
export function makeRenamer(find: string, replace: string): (value: string) => string {
  const needle = find.trim();
  if (!needle) return (value) => value;
  const swap = replace.trim();
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const hasLetters = (s: string) => s.toUpperCase() !== s.toLowerCase();
  return (value) =>
    value.replace(pattern, (found) => {
      if (!hasLetters(found)) return swap;
      if (found === found.toUpperCase()) return swap.toUpperCase();
      if (found === found.toLowerCase()) return swap.toLowerCase();
      return swap;
    });
}

// ── Planning and copying ─────────────────────────────────────────────────────

export interface LineupSource {
  assetId: string;
  fileUrl: string;
  /** The name shown on the Reports tab, for previews and the skipped list. */
  name: string;
}

export interface CopyableSource extends LineupSource {
  slug: string;
  reportId: string;
}

export interface LineupPlan {
  copyable: CopyableSource[];
  /** Reports whose type can't be copied yet (uploaded PDFs, other report types). */
  skipped: LineupSource[];
}

/** `report:/jobs/<jobId>/<slug>/<reportId>` → slug and report id. */
function parseReportUrl(fileUrl: string): { slug: string; reportId: string } | null {
  if (!fileUrl?.startsWith("report:")) return null;
  const parts = (fileUrl.split(":/")[1] || "").split("/");
  if (parts[0] !== "jobs" || !parts[2] || !parts[3]) return null;
  return { slug: parts[2].split("?")[0], reportId: parts[3].split("?")[0] };
}

export function planLineupCopy(sources: LineupSource[]): LineupPlan {
  const copyable: CopyableSource[] = [];
  const skipped: LineupSource[] = [];
  for (const source of sources) {
    const parsed = parseReportUrl(source.fileUrl);
    if (parsed && RECIPES[parsed.slug]) copyable.push({ ...source, ...parsed });
    else skipped.push(source);
  }
  return { copyable, skipped };
}

export interface LineupCopyResult {
  /** Original report's asset id → its copy's asset id. */
  created: Map<string, string>;
  failed: { name: string; message: string }[];
}

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === "object" && e && "message" in e
    ? String((e as { message: unknown }).message)
    : String(e);

/** Run `work` over `items`, a few at a time. */
async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
    }
  });
  await Promise.all(lanes);
}

export async function copyLineup(options: {
  jobId: string;
  userId: string;
  sources: CopyableSource[];
  substation: string;
  rename: (value: string) => string;
  onProgress?: (done: number, total: number) => void;
}): Promise<LineupCopyResult> {
  const { jobId, userId, sources, substation, rename, onProgress } = options;
  const ctx: CopyContext = {
    substation: substation.trim(),
    rename,
    today: new Date().toISOString().split("T")[0],
  };
  const created = new Map<string, string>();
  const failed: LineupCopyResult["failed"] = [];
  let done = 0;
  const tick = () => onProgress?.(++done, sources.length);

  // Read the originals a hundred at a time per table, not one request per report.
  const rows = new Map<string, Row>();
  const bySlug = new Map<string, CopyableSource[]>();
  for (const source of sources) {
    bySlug.set(source.slug, [...(bySlug.get(source.slug) ?? []), source]);
  }
  for (const [slug, group] of bySlug) {
    const recipe = RECIPES[slug];
    for (let i = 0; i < group.length; i += 100) {
      const ids = group.slice(i, i + 100).map((s) => s.reportId);
      const { data, error } = await supabase
        .schema("neta_ops")
        .from(recipe.table)
        .select(["id", ...recipe.columns].join(", "))
        .in("id", ids);
      if (error) throw error;
      for (const row of (data ?? []) as unknown as Row[]) rows.set(row.id, row);
    }
  }

  onProgress?.(0, sources.length);

  await inBatches(sources, 4, async (source) => {
    try {
      const recipe = RECIPES[source.slug];
      const original = rows.get(source.reportId);
      if (!original) throw new Error("The original report could not be found.");

      const columns = recipe.copy(original, ctx);
      const reportId = newReportId();
      const { error } = await supabase
        .schema("neta_ops")
        .from(recipe.table)
        .upsert(
          {
            id: reportId,
            job_id: jobId,
            user_id: userId,
            ...columns,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      if (error) throw error;

      const assetId = await ensureReportAssetLink(
        jobId,
        {
          name: getAssetName(source.slug, recipe.identifier(columns)),
          file_url: `report:/jobs/${jobId}/${source.slug}/${reportId}`,
          user_id: userId,
          template_type: recipe.templateType ?? null,
          status: "in_progress",
        },
        userId,
      );
      created.set(source.assetId, assetId);
    } catch (e) {
      failed.push({ name: source.name, message: errorText(e) });
    } finally {
      tick();
    }
  });

  return { created, failed };
}
