/**
 * Admin-saved overrides for custom form component defaults.
 * Fetches from neta_ops.custom_form_component_defaults and merges with code defaults.
 */

import { supabase } from '@/lib/supabase';
import { ComponentType } from '@/lib/types/customForms';
import { getComponentDefinition } from './componentLibrary';
import type { SectionConfig } from '@/lib/types/customForms';

/**
 * Keys that should be replaced entirely by override (no deep merge).
 * e.g. cellFormulas: saved per-cell formulas replace any base, don't merge key-by-key.
 */
const REPLACE_KEYS = new Set<string>(['cellFormulas', 'columns', 'aboveTableFields', 'settingFields', 'conditionalRows', 'defaultRowLabels']);

/** Deep merge: override values over base (arrays and objects merged recursively; arrays from override replace base). */
function deepMergeSectionConfig(base: Partial<SectionConfig>, override: Record<string, unknown>): Partial<SectionConfig> {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override)) {
    if (override[key] === undefined) continue;
    const overrideVal = override[key];
    if (REPLACE_KEYS.has(key)) {
      result[key] = overrideVal;
      continue;
    }
    const baseVal = result[key];
    if (overrideVal !== null && typeof overrideVal === 'object' && !Array.isArray(overrideVal)) {
      if (baseVal !== null && typeof baseVal === 'object' && !Array.isArray(baseVal)) {
        result[key] = deepMergeSectionConfig(
          baseVal as Record<string, unknown>,
          overrideVal as Record<string, unknown>
        ) as SectionConfig;
      } else {
        result[key] = overrideVal;
      }
    } else {
      result[key] = overrideVal;
    }
  }
  return result as Partial<SectionConfig>;
}

/**
 * Fetch all component default overrides from the database.
 * Returns a map of component_type -> default_config (partial SectionConfig).
 */
export async function fetchComponentDefaultOverrides(): Promise<Record<string, Partial<SectionConfig>>> {
  const { data, error } = await supabase
    .schema('neta_ops')
    .from('custom_form_component_defaults')
    .select('component_type, default_config');

  if (error) {
    if (error.code === '42P01') return {}; // table does not exist
    console.error('Error fetching component default overrides:', error);
    return {};
  }

  const PROTECTED_TYPES = new Set([ComponentType.CUSTOM_TABLE]);

  const map: Record<string, Partial<SectionConfig>> = {};
  for (const row of data ?? []) {
    if (PROTECTED_TYPES.has(row.component_type as ComponentType)) continue;
    const cfg = row.default_config as Record<string, unknown> | null;
    if (cfg && typeof cfg === 'object') {
      map[row.component_type as string] = cfg as Partial<SectionConfig>;
      console.log(`[fetchComponentDefaultOverrides] ${row.component_type}: aboveTableFields=`, JSON.stringify((cfg as Record<string, unknown>).aboveTableFields ?? 'undefined'));
    }
  }
  return map;
}

/**
 * Get merged default config for a component type: code default + saved override.
 * Use this when adding a new section so admins' saved defaults apply.
 */
export function getMergedDefaultConfig(
  componentType: ComponentType,
  overrides: Record<string, Partial<SectionConfig>>
): Partial<SectionConfig> {
  const def = getComponentDefinition(componentType);
  const base = def ? { ...def.defaultConfig } : {};
  const override = overrides[componentType];
  if (!override || typeof override !== 'object') return base;
  return deepMergeSectionConfig(base, override as Record<string, unknown>) as Partial<SectionConfig>;
}

/** Remove undefined values so JSON is clean for DB (Supabase/Postgres can choke on undefined). */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      out[k] = v;
    } else if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Save current section config as the default for this component type.
 * Only admins can save (enforced by RLS). Pass the section without id/order so
 * we store a reusable default.
 * Persists everything: columns, aboveTableFields, cellFormulas, printLayout, row settings, etc.
 */
export async function saveComponentDefaultOverride(
  componentType: ComponentType,
  sectionConfig: Partial<SectionConfig>,
  userId: string
): Promise<{ error: Error | null }> {
  const PROTECTED_TYPES = new Set([ComponentType.CUSTOM_TABLE]);
  if (PROTECTED_TYPES.has(componentType)) {
    return { error: new Error(`Cannot override the default for "${componentType}". Use "Save as new component" instead.`) };
  }

  const { id, order, ...rest } = sectionConfig as SectionConfig & { id?: string; order?: number };
  const defaultConfig = rest as Record<string, unknown>;

  // Explicitly persist all table/section keys so nothing is ever dropped
  if (sectionConfig.cellFormulas != null && typeof sectionConfig.cellFormulas === 'object') {
    defaultConfig.cellFormulas = sectionConfig.cellFormulas;
  }
  if (Array.isArray(sectionConfig.aboveTableFields)) {
    defaultConfig.aboveTableFields = sectionConfig.aboveTableFields;
  }
  if (sectionConfig.columns != null && Array.isArray(sectionConfig.columns)) {
    defaultConfig.columns = sectionConfig.columns;
  }
  if (sectionConfig.printLayout != null && typeof sectionConfig.printLayout === 'object') {
    defaultConfig.printLayout = sectionConfig.printLayout;
  }
  if (sectionConfig.rows != null) defaultConfig.rows = sectionConfig.rows;
  if (sectionConfig.allowAddRows != null) defaultConfig.allowAddRows = sectionConfig.allowAddRows;
  if (sectionConfig.allowRemoveRows != null) defaultConfig.allowRemoveRows = sectionConfig.allowRemoveRows;
  if (sectionConfig.minRows != null) defaultConfig.minRows = sectionConfig.minRows;
  if (sectionConfig.maxRows != null) defaultConfig.maxRows = sectionConfig.maxRows;
  if (sectionConfig.showDeviation != null) defaultConfig.showDeviation = sectionConfig.showDeviation;
  if (sectionConfig.defaultRowLabels != null && Array.isArray(sectionConfig.defaultRowLabels)) {
    defaultConfig.defaultRowLabels = sectionConfig.defaultRowLabels;
  }
  if (sectionConfig.rowCountLinkGroupId != null) defaultConfig.rowCountLinkGroupId = sectionConfig.rowCountLinkGroupId;
  if (sectionConfig.settingFields != null && Array.isArray(sectionConfig.settingFields)) {
    defaultConfig.settingFields = sectionConfig.settingFields;
  }
  if (sectionConfig.conditionalRows != null && Array.isArray(sectionConfig.conditionalRows)) {
    defaultConfig.conditionalRows = sectionConfig.conditionalRows;
  }
  if (sectionConfig.title != null) defaultConfig.title = sectionConfig.title;
  if (sectionConfig.referenceCode != null) defaultConfig.referenceCode = sectionConfig.referenceCode;

  const cleanConfig = stripUndefined(defaultConfig);

  console.log('[saveComponentDefaultOverride] componentType:', componentType);
  console.log('[saveComponentDefaultOverride] cleanConfig keys:', Object.keys(cleanConfig));
  console.log('[saveComponentDefaultOverride] aboveTableFields:', JSON.stringify(cleanConfig.aboveTableFields));

  const { data: rows, error } = await supabase
    .schema('neta_ops')
    .from('custom_form_component_defaults')
    .upsert(
      {
        component_type: componentType,
        default_config: cleanConfig,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: 'component_type' }
    )
    .select('component_type, default_config');

  if (error) {
    const msg = (error as { message?: string }).message ?? String(error);
    const code = (error as { code?: string }).code;
    const status = (error as { status?: number }).status;
    const details = (error as { details?: string }).details;
    console.error('Error saving component default override:', { message: msg, code, status, details, error });

    if (status === 404 || (typeof msg === 'string' && (msg.includes('404') || msg.toLowerCase().includes('not found')))) {
      return {
        error: new Error(
          'Component defaults table is missing. Run the migration in Supabase SQL Editor: ' +
          'Database Scripts/Setup & Configuration/create_custom_form_component_defaults_table.sql'
        ),
      };
    }
    return { error: new Error(code ? `${msg} (${code})` : msg) };
  }

  if (!rows || rows.length === 0) {
    console.error('[saveComponentDefaultOverride] Upsert returned 0 rows — RLS is likely blocking writes. Run the updated SQL script to add RLS policies.');
    return {
      error: new Error(
        'Save appeared to succeed but no data was written (RLS policies may be missing). ' +
        'Run the updated SQL script in Supabase SQL Editor: Database Scripts/Setup & Configuration/create_custom_form_component_defaults_table.sql'
      ),
    };
  }

  const savedConfig = rows[0]?.default_config as Record<string, unknown> | null;
  console.log('[saveComponentDefaultOverride] Verified saved aboveTableFields:', JSON.stringify(savedConfig?.aboveTableFields));

  return { error: null };
}
