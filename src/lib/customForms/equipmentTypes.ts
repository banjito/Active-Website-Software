/**
 * Equipment types for components.
 *
 * The list is the asset registry's own (neta_ops.equipment_types), so a
 * component tagged "Medium Voltage Switch" lines up with assets of that type.
 * A component can belong to several types, or be Global: shared by every
 * report (Job Information, Test Equipment Used, Comments...).
 *
 * The tag is library-only (`section.equipmentTypes`); it is dropped when the
 * component is added to a form, like variants and category.
 */

import type { SectionConfig } from '@/lib/types/customForms';
import { ComponentType } from '@/lib/types/customForms';

/** Stored in `equipmentTypes` to mean "every equipment type". */
export const GLOBAL_EQUIPMENT_TYPE = '*';

/** Built-ins every report shares, Global unless an admin says otherwise. */
const GLOBAL_BUILT_INS = new Set<string>([
  ComponentType.JOB_INFO,
  ComponentType.TEST_EQUIPMENT,
  ComponentType.COMMENTS,
  ComponentType.SIGNATURES,
  ComponentType.PHOTOS,
]);

/** A component's equipment types (its own tag, else the built-in default). */
export function equipmentTypesOf(config: Partial<SectionConfig> | undefined): string[] {
  if (config?.equipmentTypes) return config.equipmentTypes;
  return config?.componentType && GLOBAL_BUILT_INS.has(config.componentType) ? [GLOBAL_EQUIPMENT_TYPE] : [];
}

export const isGlobal = (types: readonly string[]) => types.includes(GLOBAL_EQUIPMENT_TYPE);

/** Does a component belong on a report for this equipment type? Global ones always do. */
export function fitsEquipmentType(config: Partial<SectionConfig> | undefined, equipmentType: string | undefined): boolean {
  const types = equipmentTypesOf(config);
  if (isGlobal(types)) return true;
  if (!equipmentType) return true;
  return types.some((t) => t.toLowerCase() === equipmentType.toLowerCase());
}

/** "Global", "Medium Voltage Switch", "Unassigned"... for lists. */
export function equipmentTypesLabel(types: readonly string[]): string {
  if (isGlobal(types)) return 'Global';
  return types.length ? types.join(', ') : 'Unassigned';
}

// ---------------------------------------------------------------------------
// The list (shared with the asset registry)
// ---------------------------------------------------------------------------

const missing = (error: { code?: string } | null) =>
  error?.code === '42P01' || error?.code === 'PGRST205';

const supabaseClient = async () => (await import('@/lib/supabase')).supabase;

export async function fetchEquipmentTypeList(): Promise<string[]> {
  const supabase = await supabaseClient();
  const { data, error } = await supabase.schema('neta_ops').from('equipment_types').select('name').order('name');
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r: { name: string }) => r.name);
}

export async function addEquipmentType(name: string): Promise<void> {
  const supabase = await supabaseClient();
  const { error } = await supabase.schema('neta_ops').from('equipment_types').insert({ name: name.trim() });
  // 23505: already in the list, which is what was wanted.
  if (error && error.code !== '23505') throw new Error(error.message);
}

/** A write the database's rules refused: no error, just no row back. */
const refused = 'The database did not allow that change. Ask an admin to allow editing equipment types.';

export async function renameEquipmentType(oldName: string, newName: string): Promise<void> {
  const supabase = await supabaseClient();
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('equipment_types')
    .update({ name: newName.trim() })
    .eq('name', oldName)
    .select('name');
  if (error) throw new Error(error.code === '23505' ? `"${newName}" is already in the list.` : error.message);
  if (!data?.length) throw new Error(refused);
}

export async function removeEquipmentType(name: string): Promise<void> {
  const supabase = await supabaseClient();
  const { data, error } = await supabase.schema('neta_ops').from('equipment_types').delete().eq('name', name).select('name');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(refused);
}

/** A component's tags with one type renamed (or removed, when `to` is null). */
export function retagEquipmentType(types: readonly string[], from: string, to: string | null): string[] {
  const out = types.flatMap((t) => (t === from ? (to ? [to] : []) : [t]));
  return [...new Set(out)];
}
