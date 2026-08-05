// Equipment-type-specific nameplate fields for the asset registry.
//
// Every field list here was taken from the nameplate section of the matching report form,
// so what you record on an asset is exactly what the report wants. The point is that
// nameplate data is identical across ATS, MTS and a plain visual inspection, so it should
// be entered once on the equipment rather than re-typed into every report.
//
// Universal fields (manufacturer, model, serial number) are NOT here — they are real
// columns on neta_ops.equipment_assets. This catalog covers only the type-specific extras,
// which live in the nameplate_data JSONB column.
//
// Equipment type stays free text. A type with no entry here simply shows no extra fields;
// nothing breaks, and nothing is locked to a report template.

export interface NameplateField {
  key: string;
  label: string;
  /** Shown after the input, e.g. "kVA". */
  unit?: string;
  /** Present for dropdowns; absent means free text. */
  options?: string[];
  placeholder?: string;
}

export interface NameplateSchema {
  /** Canonical equipment type name, matching the seeded neta_ops.equipment_types rows. */
  type: string;
  /** Other spellings that should resolve to this schema. */
  aliases?: string[];
  /** Which report form the fields came from, for anyone wondering why this list. */
  source: string;
  fields: NameplateField[];
}

const CONNECTION_OPTIONS = ["Delta", "Wye", "Single Phase"];
const MATERIAL_OPTIONS = ["Aluminum", "Copper"];

/** Transformers share everything but the fluid, so build the common part once. */
const TRANSFORMER_FIELDS: NameplateField[] = [
  { key: "kva", label: "kVA", unit: "kVA" },
  { key: "kvaSecondary", label: "kVA (secondary)", unit: "kVA" },
  { key: "tempRise", label: "Temp. rise", unit: "°C" },
  { key: "impedance", label: "Impedance", unit: "%" },
  { key: "primaryVolts", label: "Primary volts", unit: "V" },
  { key: "primaryVoltsSecondary", label: "Primary volts 2", unit: "V" },
  { key: "primaryConnection", label: "Primary connection", options: CONNECTION_OPTIONS },
  { key: "primaryMaterial", label: "Primary material", options: MATERIAL_OPTIONS },
  { key: "secondaryVolts", label: "Secondary volts", unit: "V" },
  { key: "secondaryVoltsSecondary", label: "Secondary volts 2", unit: "V" },
  {
    key: "secondaryConnection",
    label: "Secondary connection",
    options: CONNECTION_OPTIONS,
  },
  { key: "secondaryMaterial", label: "Secondary material", options: MATERIAL_OPTIONS },
];

/** Medium-voltage switchgear-class gear shares one nameplate block. */
const MV_GEAR_FIELDS: NameplateField[] = [
  { key: "type", label: "Type" },
  { key: "manufacturingDate", label: "Mfg. date" },
  { key: "icRating", label: "I.C. rating", unit: "kA" },
  { key: "ratedVoltage", label: "Rated voltage", unit: "kV" },
  { key: "operatingVoltage", label: "Operating voltage", unit: "kV" },
  { key: "ampacity", label: "Ampacity", unit: "A" },
  { key: "impulseBil", label: "Impulse rating (BIL)", unit: "kV" },
];

/** Low-voltage assemblies (switchgear, switchboard, panelboard) share one block. */
const LV_ASSEMBLY_FIELDS: NameplateField[] = [
  { key: "type", label: "Type" },
  { key: "systemVoltage", label: "System voltage", unit: "V" },
  { key: "ratedVoltage", label: "Rated voltage", unit: "V" },
  { key: "ratedCurrent", label: "Rated current", unit: "A" },
  {
    key: "phaseConfiguration",
    label: "Phase configuration",
    placeholder: "e.g. 3Ø, 4W",
  },
];

const CABLE_FIELDS: NameplateField[] = [
  { key: "conductorSize", label: "Conductor size", placeholder: "e.g. 500 MCM" },
  { key: "conductorMaterial", label: "Conductor material", options: MATERIAL_OPTIONS },
  { key: "insulationType", label: "Insulation type", placeholder: "e.g. EPR, XLPE" },
  { key: "insulationThickness", label: "Insulation thickness", unit: "mils" },
  { key: "voltageRating", label: "Voltage rating", unit: "kV" },
  { key: "length", label: "Length", unit: "ft" },
  { key: "yearInstalled", label: "Year installed" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
];

export const NAMEPLATE_SCHEMAS: NameplateSchema[] = [
  {
    type: "Low Voltage Circuit Breaker",
    aliases: ["LV Circuit Breaker", "LV Breaker", "Low Voltage Breaker", "Molded Case Circuit Breaker"],
    source: "8-LV Circuit Breaker Thermal-Magnetic / Electronic Trip ATS & MTS",
    fields: [
      { key: "type", label: "Type" },
      { key: "style", label: "Style / series" },
      { key: "frameSize", label: "Frame size", unit: "A" },
      { key: "ratingPlug", label: "Rating plug", unit: "A" },
      { key: "tripUnitType", label: "Trip unit type" },
      { key: "icRating", label: "I.C. rating", unit: "kA" },
      { key: "curveNo", label: "Curve no." },
      { key: "poles", label: "Poles" },
      { key: "operation", label: "Operation", placeholder: "e.g. Manual, Electrical" },
      { key: "mounting", label: "Mounting", placeholder: "e.g. Fixed, Draw-out" },
    ],
  },
  {
    type: "Medium Voltage Circuit Breaker",
    aliases: ["MV Circuit Breaker", "MV Breaker"],
    source: "9-Medium Voltage Circuit Breaker Test Report ATS & MTS",
    fields: [
      { key: "type", label: "Type" },
      { key: "manufacturingDate", label: "Mfg. date" },
      { key: "icRating", label: "I.C. rating", unit: "kA" },
      { key: "ratedVoltage", label: "Rated voltage", unit: "kV" },
      { key: "operatingVoltage", label: "Operating voltage", unit: "kV" },
      { key: "ampacity", label: "Ampacity", unit: "A" },
      { key: "mvaRating", label: "MVA rating", unit: "MVA" },
    ],
  },
  {
    type: "Switchgear",
    aliases: ["Switchboard", "Switchgear Assembly", "Switchgear & Switchboard Assemblies"],
    source: "1-Switchgear, Switchboard, Panelboard Inspection & Test Report",
    fields: LV_ASSEMBLY_FIELDS,
  },
  {
    type: "Panelboard",
    aliases: ["Panelboard Assemblies"],
    source: "1-Panelboard Inspection & Test Report ATS 21",
    fields: LV_ASSEMBLY_FIELDS,
  },
  {
    type: "Dry Type Transformer",
    aliases: ["Dry-Type Transformer", "Small Dry Type Transformer"],
    source: "2-Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test",
    fields: TRANSFORMER_FIELDS,
  },
  {
    type: "Large Dry Type Transformer",
    aliases: ["Large Dry-Type Transformer"],
    source: "2-Large Dry Type Xfmr. Inspection and Test",
    fields: TRANSFORMER_FIELDS,
  },
  {
    type: "Liquid Filled Transformer",
    aliases: ["Liquid-Filled Transformer", "Oil Transformer", "Oil Filled Transformer"],
    source: "2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test",
    fields: [
      ...TRANSFORMER_FIELDS,
      { key: "fluidType", label: "Fluid type", placeholder: "e.g. Mineral oil" },
      { key: "fluidVolume", label: "Fluid volume", unit: "gal" },
    ],
  },
  {
    type: "Automatic Transfer Switch",
    aliases: ["ATS", "Transfer Switch"],
    source: "35-Automatic Transfer Switch ATS",
    fields: [
      { key: "modelType", label: "Model / type" },
      { key: "systemVoltage", label: "System voltage", unit: "V" },
      { key: "ratedVoltage", label: "Rated voltage", unit: "V" },
      { key: "ratedCurrent", label: "Rated current", unit: "A" },
      { key: "sccr", label: "SCCR", unit: "kA" },
      { key: "poles", label: "Poles" },
    ],
  },
  {
    type: "Low Voltage Switch",
    aliases: ["LV Switch"],
    source: "6-Low Voltage Switch ATS / Maint. MTS",
    fields: [
      { key: "series", label: "Series" },
      { key: "type", label: "Type" },
      { key: "systemVoltage", label: "System voltage", unit: "V" },
      { key: "ratedVoltage", label: "Rated voltage", unit: "V" },
      { key: "ratedCurrent", label: "Rated current", unit: "A" },
    ],
  },
  {
    type: "Medium Voltage Switch",
    aliases: ["MV Switch", "Medium Voltage Way Switch"],
    source: "23-Medium Voltage Switch MTS",
    fields: MV_GEAR_FIELDS,
  },
  {
    type: "Motor Starter",
    aliases: ["Medium Voltage Motor Starter", "MV Motor Starter"],
    source: "23-Medium Voltage Motor Starter MTS Report",
    fields: MV_GEAR_FIELDS,
  },
  {
    type: "Current Transformer",
    aliases: ["CT"],
    source: "12-Current Transformer Test ATS & MTS",
    fields: [
      { key: "ctRatio", label: "CT ratio", placeholder: "e.g. 600:5" },
      { key: "class", label: "Class" },
      { key: "voltageRating", label: "Voltage rating", unit: "kV" },
      { key: "type", label: "Type" },
      { key: "polarityFacing", label: "Polarity facing" },
      { key: "frequency", label: "Frequency", unit: "Hz" },
    ],
  },
  {
    type: "Potential Transformer",
    aliases: ["PT", "Voltage Transformer", "Voltage Potential Transformer"],
    source: "13-Voltage Potential Transformer Test MTS",
    fields: [
      { key: "ratio", label: "Ratio", placeholder: "e.g. 14400:120" },
      { key: "accuracyClass", label: "Accuracy class" },
      { key: "voltageRating", label: "Voltage rating", unit: "kV" },
      { key: "insulationClass", label: "Insulation class" },
      { key: "manufacturedYear", label: "Year manufactured" },
      { key: "frequency", label: "Frequency", unit: "Hz" },
    ],
  },
  {
    type: "Medium Voltage Cable",
    aliases: ["MV Cable"],
    source: "4-Medium Voltage Cable VLF Test",
    fields: CABLE_FIELDS,
  },
  {
    type: "Low Voltage Cable",
    aliases: ["LV Cable"],
    source: "3-Low Voltage Cable Test",
    fields: CABLE_FIELDS,
  },
  {
    type: "Metal Enclosed Busway",
    aliases: ["Busway", "Bus Duct"],
    source: "5-Metal Enclosed Busway ATS",
    fields: [
      { key: "fedFrom", label: "Fed from" },
      { key: "conductorMaterial", label: "Conductor material", options: MATERIAL_OPTIONS },
      { key: "ratedVoltage", label: "Rated voltage", unit: "V" },
      { key: "operatingVoltage", label: "Operating voltage", unit: "V" },
      { key: "ampacity", label: "Ampacity", unit: "A" },
    ],
  },
  {
    type: "Engine Generator",
    aliases: ["Generator", "Emergency Generator"],
    source: "7.22.1 Emergency Systems, Engine Generator Test Sheet ATS 25",
    fields: [
      { key: "yearMfd", label: "Year mfd." },
      { key: "ratedKva", label: "Rated kVA", unit: "kVA" },
      { key: "ratedKw", label: "Rated kW", unit: "kW" },
      { key: "powerFactor", label: "Power factor" },
      { key: "hp", label: "HP" },
      { key: "voltages", label: "Voltages", unit: "V" },
      { key: "currentRating", label: "Current rating", unit: "A" },
      { key: "frequency", label: "Frequency", unit: "Hz" },
      { key: "connections", label: "Connections" },
    ],
  },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Canonical type name and every alias, pointing at the schema. Built once. */
const SCHEMA_BY_NORMALIZED_NAME = new Map<string, NameplateSchema>();
for (const schema of NAMEPLATE_SCHEMAS) {
  SCHEMA_BY_NORMALIZED_NAME.set(normalize(schema.type), schema);
  for (const alias of schema.aliases ?? []) {
    SCHEMA_BY_NORMALIZED_NAME.set(normalize(alias), schema);
  }
}

/**
 * The nameplate fields for an equipment type, or null when we have no schema for it.
 *
 * Matching is forgiving about punctuation and case ("LV Breaker", "lv-breaker") because
 * equipment type is free text by design.
 */
export function getNameplateSchema(
  equipmentType?: string | null,
): NameplateSchema | null {
  if (!equipmentType?.trim()) return null;
  return SCHEMA_BY_NORMALIZED_NAME.get(normalize(equipmentType)) ?? null;
}

export function getNameplateFields(equipmentType?: string | null): NameplateField[] {
  return getNameplateSchema(equipmentType)?.fields ?? [];
}

export type NameplateData = Record<string, string>;

/** Keys holding an actual value, ignoring blanks. */
export function filledNameplateKeys(data: NameplateData | null | undefined): string[] {
  if (!data) return [];
  return Object.keys(data).filter((key) => String(data[key] ?? "").trim() !== "");
}

/**
 * What happens to existing nameplate data if the equipment type changes.
 *
 * Fields shared by both types keep their values (a rated voltage is a rated voltage), and
 * only the ones that don't exist on the new type are lost. Callers use `cleared` to warn
 * before committing the change.
 */
export function reconcileNameplateData(
  data: NameplateData,
  nextType: string | null | undefined,
): { kept: NameplateData; cleared: { key: string; label: string; value: string }[] } {
  const nextFields = getNameplateFields(nextType);
  const nextKeys = new Set(nextFields.map((f) => f.key));

  const kept: NameplateData = {};
  const cleared: { key: string; label: string; value: string }[] = [];

  for (const key of filledNameplateKeys(data)) {
    const value = String(data[key]).trim();
    if (nextKeys.has(key)) kept[key] = value;
    else cleared.push({ key, label: labelForKey(key), value });
  }
  return { kept, cleared };
}

/** Human label for a key, searching every schema. Falls back to the raw key. */
export function labelForKey(key: string): string {
  for (const schema of NAMEPLATE_SCHEMAS) {
    const field = schema.fields.find((f) => f.key === key);
    if (field) return field.label;
  }
  return key;
}

/** "1000 kVA · 5.75 %" for a compact summary in the asset list. */
export function summarizeNameplate(
  equipmentType: string | null | undefined,
  data: NameplateData | null | undefined,
  limit = 3,
): string {
  const fields = getNameplateFields(equipmentType);
  if (fields.length === 0 || !data) return "";
  const parts: string[] = [];
  for (const field of fields) {
    const value = String(data[field.key] ?? "").trim();
    if (!value) continue;
    parts.push(field.unit ? `${value} ${field.unit}` : `${field.label}: ${value}`);
    if (parts.length >= limit) break;
  }
  return parts.join(" · ");
}
