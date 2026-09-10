import {
  ComponentType,
  FieldType,
  type ColumnConfig,
  type CustomFormTemplate,
  type FieldConfig,
  type SectionConfig,
} from "@/lib/types/customForms";
import { formSlotId } from "@/lib/customForms/expressions/form-program";
import type { BodyRowV2, HeaderRowV2 } from "@/lib/customForms/v2/schema";

/** Source: src/components/reports/LowVoltageSwitchReport.tsx. Not an approved engineering standard. */
export const LOW_VOLTAGE_SWITCH_GAPS = [
  "Engineering review: the source print heading says NETA - ATS 7.6.1.2, but its inspection criteria are 7.5.1.1.A.*. Both are preserved; neither is silently corrected. No electrical acceptance thresholds or automatic PASS/FAIL rules are supplied by the source.",
  "Output review: corrected readings use the source's two-decimal rounding, but the shared renderer drops trailing zeroes and shows an em dash for missing calculations instead of an empty cell. Raw readings remain saved; corrected values are recomputed, not stored in the legacy temp_corrected_insulation record. Celsius is recomputed rather than retaining the source screen's potentially stale Celsius value.",
  "Workflow review: equipment Model, Serial Number, AMP ID and Calibration Date are manual fields here; the original EquipmentAutocomplete selection and automatic companion-field fill are not reproduced.",
  "Workflow review: job/customer/user/date autofill, legacy report import, asset linking, save/close/delete/submit and database persistence belong to the host application, not this draft. Date is blank rather than baking today's date into a deterministic template. The source's manual PASS/FAIL/LIMITED SERVICE choice is retained as Report Result, not wired to host result or approval status.",
  "Output review: shared controls still declare rounded corners; the V1/V2 template envelope cannot override their border radius. Square-corner compliance needs a shared-runtime change by its owner, not a pilot-only renderer workaround.",
  "Output/workflow review: original print branding, pagination and hiding empty Comments still need browser/PDF review. Switch and Fuse retain the source UI's one row; all typed table rows have fixed identities. Runtime add/remove rows are not supported by this calculation bridge. Clearing temperature leaves calculations blank rather than coercing an empty input to 0 °F.",
] as const;

// One value for EVERY integer Celsius point -24..110, transcribed verbatim.
// In particular 34 °C = 1.872, 45 °C = 3.15 and 95 °C = 31.6 are not smoothed.
const TCF_MULTIPLIERS = [
  0.054, 0.068, 0.082, 0.096, 0.11, 0.124, 0.138, 0.152, 0.166, 0.18,
  0.194, 0.208, 0.222, 0.236, 0.25, 0.264, 0.278, 0.292, 0.306, 0.32,
  0.336, 0.352, 0.368, 0.384, 0.4, 0.42, 0.44, 0.46, 0.48, 0.5,
  0.526, 0.552, 0.578, 0.604, 0.63, 0.666, 0.702, 0.738, 0.774, 0.81,
  0.848, 0.886, 0.924, 0.962, 1, 1.05, 1.1, 1.15, 1.2, 1.25,
  1.316, 1.382, 1.448, 1.514, 1.58, 1.664, 1.748, 1.832, 1.872, 2,
  2.1, 2.2, 2.3, 2.4, 2.5, 2.628, 2.756, 2.884, 3.012, 3.15,
  3.316, 3.482, 3.648, 3.814, 3.98, 4.184, 4.388, 4.592, 4.796, 5,
  5.26, 5.52, 5.78, 6.04, 6.3, 6.62, 6.94, 7.26, 7.58, 7.9,
  8.32, 8.74, 9.16, 9.58, 10, 10.52, 11.04, 11.56, 12.08, 12.6,
  13.24, 13.88, 14.52, 15.16, 15.8, 16.64, 17.48, 18.32, 19.16, 20,
  21.04, 22.08, 23.12, 24.16, 25.2, 26.45, 27.7, 28.95, 30.2, 31.6,
  33.28, 34.96, 36.64, 38.32, 40, 42.08, 44.16, 46.24, 48.32, 50.4,
  52.96, 55.52, 58.08, 60.64, 63.2,
] as const;

const INSPECTIONS = [
  ["7.5.1.1.A.1", "Compare equipment nameplate data with drawings and specifications."],
  ["7.5.1.1.A.2", "Inspect physical and mechanical condition."],
  ["7.5.1.1.A.3", "Inspect anchorage, alignment, grounding, and required clearances."],
  ["7.5.1.1.A.4", "Verify the unit is clean."],
  ["7.5.1.1.A.5", "Verify correct blade alignment, blade penetration, travel stops, and mechanical operation."],
  ["7.5.1.1.A.6", "Verify that fuse sizes and types are in accordance with drawings, short-circuit studies, and coordination study."],
  ["7.5.1.1.A.7", "Verify that each fuse has adequate mechanical support and contact integrity."],
  ["7.5.1.1.A.8.1", "Use of a low-resistance ohmmeter in accordance with Section 7.5.1.1.B.1."],
  ["7.5.1.1.A.9", "Verify operation and sequencing of interlocking systems."],
  ["7.5.1.1.A.10", "Verify correct phase barrier installation."],
  ["7.5.1.1.A.11", "Verify correct operation of all indicating and control devices."],
  ["7.5.1.1.A.12", "Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces."],
] as const;

const READING_FIELDS = [
  ["poleToPoleP1P2", "P1-P2"], ["poleToPoleP2P3", "P2-P3"], ["poleToPoleP3P1", "P3-P1"],
  ["poleToFrameP1", "P1"], ["poleToFrameP2", "P2"], ["poleToFrameP3", "P3"],
  ["lineToLoadP1", "P1"], ["lineToLoadP2", "P2"], ["lineToLoadP3", "P3"],
] as const;

const options = (values: readonly string[]) => values.map((value) => ({ value, label: value }));
const text = (id: string, label: string): FieldConfig => ({ id, label, type: FieldType.TEXT });
const calculated = (id: string, label: string): FieldConfig => ({ id, label, type: FieldType.CALCULATED, readOnly: true });
const select = (id: string, label: string, values: readonly string[], defaultValue: string): FieldConfig => ({
  id, label, type: FieldType.SELECT, options: options(values), defaultValue,
});
const column = (field: FieldConfig, width?: string): ColumnConfig => ({
  id: `col-${field.id}`, label: field.label, field, ...(width ? { width } : {}),
});

function section(id: string, title: string, componentType: SectionConfig["componentType"]): SectionConfig {
  return { id: `lv-switch-${id}`, title, componentType, referenceCode: `LVS_${id.replace(/-/g, "_").toUpperCase()}`, order: 0, showInPrint: true };
}

function table(id: string, title: string, fields: FieldConfig[], rows = 1): SectionConfig {
  return {
    ...section(id, title, ComponentType.CUSTOM_TABLE),
    columns: fields.map((field) => column(field)),
    rows, minRows: rows, maxRows: rows, allowAddRows: false, allowRemoveRows: false,
    calculationRowIds: Array.from({ length: rows }, (_, index) => `lv-switch-${id}-row-${index + 1}`),
    v2: { print: { repeatHeader: true, rowSplit: "avoid" } },
  };
}

function records(section: SectionConfig): BodyRowV2 {
  return {
    id: `${section.id}-records`, kind: "records",
    policy: { initial: section.rows!, min: section.rows!, max: section.rows!, allowAdd: false, allowRemove: false, allowReorder: false, allowCopy: false },
  };
}

/** Exact two-row source headers, including the blank merged cell below identifying columns. */
function ratedHeader(section: SectionConfig, identifyingColumns: number): HeaderRowV2[] {
  const columns = section.columns!;
  return [
    {
      id: `${section.id}-header-1`,
      cells: [
        ...columns.slice(0, identifyingColumns).map((col) => ({ id: `${section.id}-heading-${col.id}`, columnId: col.id, label: col.label })),
        { id: `${section.id}-rated`, columnId: columns[identifyingColumns].id, label: "Rated", colSpan: columns.length - identifyingColumns, align: "center" },
      ],
    },
    {
      id: `${section.id}-header-2`,
      cells: [
        { id: `${section.id}-blank`, columnId: columns[0].id, label: "", colSpan: identifyingColumns },
        ...columns.slice(identifyingColumns).map((col) => ({ id: `${section.id}-rated-${col.id}`, columnId: col.id, label: col.label })),
      ],
    },
  ];
}

function readings(id: string, title: string, derived = false): SectionConfig {
  const result = table(id, title, READING_FIELDS.map(([fieldId, label]) => derived
    ? calculated(fieldId, label)
    : { id: fieldId, label, type: FieldType.NUMBER }));
  result.v2!.header = [
    {
      id: `${result.id}-groups`,
      cells: ["Pole-to-Pole", "Pole-to-Frame", "Line-to-Load"].map((label, index) => ({
        id: `${result.id}-group-${index}`, columnId: result.columns![index * 3].id, label, colSpan: 3, align: "center",
      })),
    },
    {
      id: `${result.id}-poles`,
      cells: result.columns!.map((col) => ({ id: `${result.id}-heading-${col.id}`, columnId: col.id, label: col.label, align: "center" })),
    },
  ];
  return result;
}

/**
 * Unsaved, builder-editable Phase 6 pilot. Pure data: no report import, clock,
 * random IDs, database calls, publication, or dependency on a mutable rule pack.
 * V1 sections retain edit controls; V2 overlays retain the merged document shape.
 */
export function createLowVoltageSwitchDraft(): CustomFormTemplate {
  const job: SectionConfig = {
    ...section("job", "Job Information", ComponentType.JOB_INFO), layout: "two-column",
    fields: [
      text("customer", "Customer"), text("jobNumber", "Job #"), text("address", "Address"),
      text("identifier", "Identifier"), text("technicians", "Technicians"), text("substation", "Substation"),
      { id: "date", label: "Date", type: FieldType.DATE }, text("eqptLocation", "Eqpt. Location"), text("user", "User"),
    ],
  };
  // Do not use the generic temperature/humidity composite: its shared TCF is
  // not the source report's rounded-Celsius lookup. Separate fields can own formulas.
  const environment: SectionConfig = {
    ...section("environment", "Environmental Data", ComponentType.NAMEPLATE_DATA), layout: "four-column",
    fields: [
      { id: "fahrenheit", label: "Temp", type: FieldType.NUMBER, unit: "°F", defaultValue: 68 },
      { ...calculated("celsius", "Temp"), unit: "°C" },
      calculated("tcf", "TCF"),
      { id: "humidity", label: "Humidity", type: FieldType.NUMBER, unit: "%", defaultValue: 0 },
    ],
  };
  const enclosure: SectionConfig = {
    ...section("enclosure", "Enclosure Data", ComponentType.NAMEPLATE_DATA), layout: "two-column",
    fields: [
      text("manufacturer", "Manufacturer"), text("catalogNo", "Catalog No"), text("serialNumber", "Serial Number"),
      text("series", "Series"), text("type", "Type"), text("systemVoltage", "System Voltage"),
      text("ratedVoltage", "Rated Voltage"), text("ratedCurrent", "Rated Current"), text("aicRating", "SCCR"),
      text("phaseConfiguration", "Phase Configuration"),
    ],
  };
  // VOLTAGE_OPTIONS exists in the source but is unused: these are free text there.
  const switchData = table("switch", "Switch Data", [
    text("position", "Position / Identifier"), text("manufacturer", "Manufacturer"), text("catalogNo", "Catalog No."),
    text("serialNo", "Serial No."), text("type", "Type"), text("ratedAmperage", "Amperage"), text("ratedVoltage", "Voltage"),
  ]);
  switchData.v2!.header = ratedHeader(switchData, 5);
  const fuse = table("fuse", "Fuse Data", [
    text("position", "Position / Identifier"), text("manufacturer", "Manufacturer"), text("catalogNo", "Catalog No."),
    text("class", "Class"), text("amperage", "Amperage"), text("aic", "AIC"), text("voltage", "Voltage"),
  ]);
  fuse.v2!.header = ratedHeader(fuse, 4);
  const ir = readings("ir", "Measured Insulation Resistance Values");
  ir.aboveTableFields = [
    select("testVoltage", "Test Voltage", ["250V", "500V", "1000V", "2500V", "5000V"], "1000V"),
    select("units", "Units", ["kΩ", "MΩ", "GΩ"], "MΩ"),
  ];
  const corrected = readings("corrected", "Temperature Corrected Insulation Resistance Values", true);
  corrected.aboveTableFields = [calculated("tcf", "Temperature Correction Factor (TCF)"), calculated("units", "Units")];
  corrected.v2!.body = [
    records(corrected),
    { id: "lv-switch-correction-note", kind: "note", text: "Source calculation: measured value × TCF, rounded to two decimal places. Units follow the measured table; selecting units does not convert entered numbers." },
  ];
  // A generic table intentionally avoids the stock contact-resistance deviation
  // block: the source has nine readings but no deviation/acceptance calculation.
  const contact = readings("contact", "Contact Resistance");
  contact.aboveTableFields = [select("units", "Units", ["μΩ", "mΩ", "Ω"], "μΩ")];
  contact.v2!.body = [
    records(contact),
    { id: "lv-switch-contact-note", kind: "note", text: "Source scope: no automatic contact-resistance deviation or electrical acceptance threshold. Report Result is a manual selection, not a calculated verdict." },
  ];
  const inspection = table("inspection", "Visual & Mechanical Inspection", [
    { ...text("netaSection", "Section"), cellBehavior: "static" },
    { ...text("description", "Description"), cellBehavior: "static" },
    {
      id: "result", label: "Results", type: FieldType.SELECT, defaultValue: "",
      options: [{ label: "Select One", value: "" }, ...options(["Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"])],
    },
  ], INSPECTIONS.length);
  inspection.columns![0].width = "16%";
  inspection.columns![1].width = "60%";
  inspection.columns![2].width = "24%";
  inspection.staticCells = Object.fromEntries(INSPECTIONS.flatMap(([neta, description], index) => [
    [`row${index}_col-netaSection`, neta], [`row${index}_col-description`, description],
  ]));
  const equipment = table("equipment", "Test Equipment Used", [
    { ...text("instrument", "Instrument"), cellBehavior: "static" },
    text("model", "Model"), text("serialNumber", "Serial Number"), text("ampId", "AMP ID"), text("calDate", "Calibration Date"),
  ], 2);
  equipment.staticCells = { "row0_col-instrument": "Megohmmeter", "row1_col-instrument": "Low Resistance" };
  const comments: SectionConfig = {
    ...section("comments", "Comments", ComponentType.COMMENTS), field: { id: "enclosure", label: "Enclosure", type: FieldType.TEXTAREA },
  };
  const result: SectionConfig = {
    ...section("result", "Report Result", ComponentType.NAMEPLATE_DATA), layout: "single-column",
    fields: [select("status", "Result (manual)", ["PASS", "FAIL", "LIMITED SERVICE"], "PASS")],
  };
  // The review disclosure stays in the form so nobody can use the draft
  // without seeing it, but it never prints: these are notes for whoever
  // certifies the template, not content for a customer's report. Delete this
  // section once the review is done.
  const review: SectionConfig = {
    ...section("review", "Review notes: pending engineering, output and workflow review", ComponentType.CUSTOM_TEXT),
    showInPrint: false,
    field: { id: "notice", label: "Review notes (not engineering criteria)", type: FieldType.TEXTAREA, readOnly: true, defaultValue: LOW_VOLTAGE_SWITCH_GAPS.join("\n\n") },
  };
  const fieldId = (owner: SectionConfig, id: string) => formSlotId(owner, id)!;
  const ref = (owner: SectionConfig, id: string) => `{${fieldId(owner, id)}}`;
  const celsius = ref(environment, "celsius");
  const tcf = ref(environment, "tcf");
  const fahrenheit = ref(environment, "fahrenheit");
  const formulas: Record<string, string> = {
    // Recreate the exact source table coordinates, interpolation and out-of-range formula.
    [fieldId(environment, "celsius")]: `coalesce(interpolate("lvs-fahrenheit-celsius", ${fahrenheit}), (${fahrenheit} - 32) * (5 / 9))`,
    // The source checks Math.round(C) BEFORE attempting interpolation. Using
    // only a smooth curve (or the common TCF helper) would change real results.
    [fieldId(environment, "tcf")]: `coalesce(lookup("lvs-tcf-rounded-celsius", round(${celsius})), interpolate("lvs-tcf-clamped", ${celsius}))`,
    [fieldId(corrected, "tcf")]: tcf,
    [fieldId(corrected, "units")]: ref(ir, "units"),
  };
  READING_FIELDS.forEach(([id]) => {
    const cell = { rowIndex: 0, colId: `col-${id}` };
    formulas[formSlotId(corrected, id, cell)!] = `round({${formSlotId(ir, id, cell)!}} * ${tcf}, 2)`;
  });
  return {
    name: "Low Voltage Switch",
    // No description: the review notes live in their own non-printing section,
    // and anything here shows at the top of every preview.
    description: undefined,
    netaSection: "ATS 7.6.1.2",
    isPublished: false,
    structure: {
      sections: [job, environment, enclosure, switchData, fuse, ir, corrected, contact, inspection, equipment, comments, result, review]
        .map((entry, order) => ({ ...entry, order })),
      // Keep the source's exact three manual result choices in an editable field,
      // not the host's separate result/workflow picker (which also offers N/A).
      settings: { includePassFail: false, includeJobInfo: true, includePrintHeader: true, pageBreakAfterSection: false },
      expressions: {
        engineVersion: "typed-1", formulas,
        lookups: [{
          id: "lvs-tcf-rounded-celsius", keyType: "number", valueType: "number",
          entries: TCF_MULTIPLIERS.map((value, index) => ({ key: index - 24, value })),
        }],
        curves: [
          {
            id: "lvs-fahrenheit-celsius", outOfRange: "null",
            points: TCF_MULTIPLIERS.map((_, index) => ({ x: Number(((index - 24) * 1.8 + 32).toFixed(1)), y: index - 24 })),
          },
          { id: "lvs-tcf-clamped", outOfRange: "clamp", points: TCF_MULTIPLIERS.map((y, index) => ({ x: index - 24, y })) },
        ],
      },
    },
  };
}
