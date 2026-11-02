/**
 * Filling a custom form from its equipment asset.
 *
 * A field (or a table column) can name the asset value it takes:
 * `field.assetSource = "manufacturer"` or `"nameplate.kva"`. A report opened
 * from an asset fills them on open; the "Fill from asset" button fills any
 * still empty later. Fields without a source keep the older behaviour: the
 * equipment sections (Job Information, Nameplate) match by field name.
 */

import type { CustomFormStructure, SectionConfig } from '@/lib/types/customForms';
import type { EquipmentAsset } from '@/lib/types/assetTracking';
import { NAMEPLATE_SCHEMAS } from '@/lib/assetNameplateSchema';
import { rowStateKey } from '@/lib/customForms/runtime/layout';

export interface AssetSourceOption {
  value: string;
  label: string;
  group: string;
}

const CORE: AssetSourceOption[] = [
  { value: 'identifier', label: 'Identifier', group: 'Equipment' },
  { value: 'equipment_type', label: 'Equipment type', group: 'Equipment' },
  { value: 'manufacturer', label: 'Manufacturer', group: 'Equipment' },
  { value: 'model', label: 'Model / catalog no.', group: 'Equipment' },
  { value: 'serial_number', label: 'Serial number', group: 'Equipment' },
  { value: 'substation', label: 'Substation', group: 'Location' },
  { value: 'equipment_location', label: 'Equipment location', group: 'Location' },
  { value: 'building_area', label: 'Building / area', group: 'Location' },
];

/** Every asset value a field can take: core columns, then each nameplate field once. */
export const ASSET_SOURCE_OPTIONS: AssetSourceOption[] = (() => {
  const seen = new Set<string>();
  const nameplate: AssetSourceOption[] = [];
  for (const schema of NAMEPLATE_SCHEMAS) {
    for (const f of schema.fields) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      nameplate.push({
        value: `nameplate.${f.key}`,
        label: f.unit && !f.label.includes(f.unit) ? `${f.label} (${f.unit})` : f.label,
        group: 'Nameplate',
      });
    }
  }
  nameplate.sort((a, b) => a.label.localeCompare(b.label));
  return [...CORE, ...nameplate];
})();

export function assetSourceLabel(source: string): string {
  return ASSET_SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source;
}

const asText = (value: unknown) => (value == null ? '' : String(value).trim());

/** The asset's value for a source, as text ("" when it has none). */
export function assetValue(asset: EquipmentAsset, source: string): string {
  if (source.startsWith('nameplate.')) return asText(asset.nameplate_data?.[source.slice('nameplate.'.length)]);
  return asText((asset as unknown as Record<string, unknown>)[source]);
}

/** True when the template has at least one field or column with an asset source. */
export function hasAssetSources(structure: CustomFormStructure): boolean {
  return structure.sections.some(
    (s) =>
      !!s.field?.assetSource ||
      (s.fields ?? []).some((f) => f.assetSource) ||
      (s.columns ?? []).some((c) => c.field.assetSource),
  );
}

/**
 * The form with every asset-sourced field filled. Empty fields only, unless
 * `overwrite` (a report just opened from the asset, where the asset beats the
 * form's starting defaults). Table columns fill their first row.
 */
export function applyAssetSources(
  sections: readonly SectionConfig[],
  asset: EquipmentAsset,
  form: Record<string, Record<string, any>>,
  overwrite = false,
): { form: Record<string, Record<string, any>>; filled: number } {
  let next = form;
  let filled = 0;
  const put = (key: string, fieldId: string, source: string | undefined) => {
    if (!source) return;
    const value = assetValue(asset, source);
    if (!value) return;
    const current = asText(next[key]?.[fieldId]);
    if (current === value || (current && !overwrite)) return;
    next = { ...next, [key]: { ...(next[key] ?? {}), [fieldId]: value } };
    filled += 1;
  };
  for (const section of sections) {
    if (section.field) put(section.id, section.field.id, section.field.assetSource);
    for (const f of section.fields ?? []) put(section.id, f.id, f.assetSource);
    for (const c of section.columns ?? []) put(rowStateKey(section.id, 0), c.field.id, c.field.assetSource);
  }
  return { form: next, filled };
}
