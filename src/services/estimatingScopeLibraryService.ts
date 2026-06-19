/**
 * Estimating Scope Item Library Service
 *
 * Handles CRUD operations for reusable estimating scope items and test
 * equipment associations. Scope library items can be selected from an
 * estimate to populate a single editable estimate row.
 */

import { supabase } from "../lib/supabase";

export interface EstimatingTestEquipment {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface EstimatingScopeLibraryItem {
  id: string;
  item_name: string;
  activity: string | null;
  material_cost: number;
  tech_count: number;
  hours: number;
  estimate_notes: string | null;
  library_notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  equipment?: EstimatingTestEquipment[];
}

export type EstimatingTestEquipmentInput = {
  name: string;
  description?: string | null;
  is_active?: boolean;
};

export type EstimatingScopeLibraryItemInput = {
  item_name: string;
  activity?: string | null;
  material_cost?: number;
  tech_count?: number;
  hours?: number;
  estimate_notes?: string | null;
  library_notes?: string | null;
  is_active?: boolean;
  equipment_ids?: string[];
};

type ScopeLibraryEquipmentLink = {
  scope_item_id: string;
  equipment_id: string;
};

type ScopeLibraryItemRow = Omit<EstimatingScopeLibraryItem, "equipment">;

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const cleanNullableText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeEquipment = (equipment: any): EstimatingTestEquipment => ({
  ...equipment,
  description: equipment.description ?? null,
  created_by: equipment.created_by ?? null,
  updated_by: equipment.updated_by ?? null,
});

const normalizeScopeItemRow = (item: any): ScopeLibraryItemRow => ({
  ...item,
  activity: item.activity ?? null,
  material_cost: toNumber(item.material_cost),
  tech_count: toNumber(item.tech_count),
  hours: toNumber(item.hours),
  estimate_notes: item.estimate_notes ?? null,
  library_notes: item.library_notes ?? null,
  created_by: item.created_by ?? null,
  updated_by: item.updated_by ?? null,
});

const hydrateScopeItemsWithEquipment = async (
  rows: ScopeLibraryItemRow[],
): Promise<EstimatingScopeLibraryItem[]> => {
  if (rows.length === 0) return [];

  const itemIds = rows.map((item) => item.id);
  const { data: links, error: linksError } = await supabase
    .schema("business")
    .from("estimating_scope_library_item_equipment")
    .select("scope_item_id, equipment_id")
    .in("scope_item_id", itemIds);

  if (linksError) {
    console.error("Error fetching scope library equipment links:", linksError);
    throw linksError;
  }

  const equipmentIds = Array.from(
    new Set((links || []).map((link) => link.equipment_id).filter(Boolean)),
  );

  if (equipmentIds.length === 0) {
    return rows.map((item) => ({ ...item, equipment: [] }));
  }

  const { data: equipmentRows, error: equipmentError } = await supabase
    .schema("business")
    .from("estimating_test_equipment")
    .select("*")
    .in("id", equipmentIds)
    .order("name", { ascending: true });

  if (equipmentError) {
    console.error("Error fetching estimating test equipment:", equipmentError);
    throw equipmentError;
  }

  const equipmentById = new Map(
    (equipmentRows || [])
      .map(normalizeEquipment)
      .map((equipment) => [equipment.id, equipment]),
  );

  const equipmentIdsByItemId = new Map<string, string[]>();
  ((links || []) as ScopeLibraryEquipmentLink[]).forEach((link) => {
    const existing = equipmentIdsByItemId.get(link.scope_item_id) || [];
    existing.push(link.equipment_id);
    equipmentIdsByItemId.set(link.scope_item_id, existing);
  });

  return rows.map((item) => ({
    ...item,
    equipment: (equipmentIdsByItemId.get(item.id) || [])
      .map((equipmentId) => equipmentById.get(equipmentId))
      .filter(Boolean) as EstimatingTestEquipment[],
  }));
};

const getScopeLibraryItemById = async (
  id: string,
): Promise<EstimatingScopeLibraryItem> => {
  const { data, error } = await supabase
    .schema("business")
    .from("estimating_scope_library_items")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching scope library item:", error);
    throw error;
  }

  const hydrated = await hydrateScopeItemsWithEquipment([
    normalizeScopeItemRow(data),
  ]);
  return hydrated[0];
};

const syncScopeItemEquipment = async (
  scopeItemId: string,
  equipmentIds: string[] = [],
): Promise<void> => {
  const uniqueEquipmentIds = Array.from(new Set(equipmentIds.filter(Boolean)));

  const { error: deleteError } = await supabase
    .schema("business")
    .from("estimating_scope_library_item_equipment")
    .delete()
    .eq("scope_item_id", scopeItemId);

  if (deleteError) {
    console.error("Error clearing scope library equipment links:", deleteError);
    throw deleteError;
  }

  if (uniqueEquipmentIds.length === 0) return;

  const rows = uniqueEquipmentIds.map((equipmentId) => ({
    scope_item_id: scopeItemId,
    equipment_id: equipmentId,
  }));

  const { error: insertError } = await supabase
    .schema("business")
    .from("estimating_scope_library_item_equipment")
    .insert(rows);

  if (insertError) {
    console.error("Error saving scope library equipment links:", insertError);
    throw insertError;
  }
};

/**
 * Fetch scope library items, ordered by item name.
 */
export async function getEstimatingScopeLibraryItems(
  includeInactive = false,
): Promise<EstimatingScopeLibraryItem[]> {
  try {
    let query = supabase
      .schema("business")
      .from("estimating_scope_library_items")
      .select("*")
      .order("item_name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching estimating scope library items:", error);
      throw error;
    }

    return hydrateScopeItemsWithEquipment(
      ((data || []) as any[]).map(normalizeScopeItemRow),
    );
  } catch (error) {
    console.error("Error in getEstimatingScopeLibraryItems:", error);
    throw error;
  }
}

/**
 * Search active scope library items locally across display fields and equipment.
 */
export async function searchEstimatingScopeLibraryItems(
  searchTerm: string,
  includeInactive = false,
): Promise<EstimatingScopeLibraryItem[]> {
  const items = await getEstimatingScopeLibraryItems(includeInactive);
  const term = searchTerm.trim().toLowerCase();

  if (!term) return items;

  return items.filter((item) => {
    const searchable = [
      item.item_name,
      item.activity,
      item.estimate_notes,
      item.library_notes,
      ...(item.equipment || []).map((equipment) => equipment.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(term);
  });
}

/**
 * Create a new scope library item and optional test equipment associations.
 */
export async function createEstimatingScopeLibraryItem(
  input: EstimatingScopeLibraryItemInput,
  userId?: string,
): Promise<EstimatingScopeLibraryItem> {
  const itemName = input.item_name.trim();
  if (!itemName) {
    throw new Error("Scope library item name is required.");
  }

  const payload = {
    item_name: itemName,
    activity: cleanNullableText(input.activity),
    material_cost: toNumber(input.material_cost),
    tech_count: toNumber(input.tech_count),
    hours: toNumber(input.hours),
    estimate_notes: cleanNullableText(input.estimate_notes),
    library_notes: cleanNullableText(input.library_notes),
    is_active: input.is_active ?? true,
    created_by: userId || null,
    updated_by: userId || null,
  };

  const { data, error } = await supabase
    .schema("business")
    .from("estimating_scope_library_items")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("Error creating estimating scope library item:", error);
    throw error;
  }

  await syncScopeItemEquipment(data.id, input.equipment_ids || []);
  return getScopeLibraryItemById(data.id);
}

/**
 * Update a scope library item and, when provided, replace equipment links.
 */
export async function updateEstimatingScopeLibraryItem(
  id: string,
  input: Partial<EstimatingScopeLibraryItemInput>,
  userId?: string,
): Promise<EstimatingScopeLibraryItem> {
  const payload: Record<string, unknown> = {
    updated_by: userId || null,
  };

  if (input.item_name !== undefined) {
    const itemName = input.item_name.trim();
    if (!itemName) throw new Error("Scope library item name is required.");
    payload.item_name = itemName;
  }
  if (input.activity !== undefined) {
    payload.activity = cleanNullableText(input.activity);
  }
  if (input.material_cost !== undefined) {
    payload.material_cost = toNumber(input.material_cost);
  }
  if (input.tech_count !== undefined) {
    payload.tech_count = toNumber(input.tech_count);
  }
  if (input.hours !== undefined) {
    payload.hours = toNumber(input.hours);
  }
  if (input.estimate_notes !== undefined) {
    payload.estimate_notes = cleanNullableText(input.estimate_notes);
  }
  if (input.library_notes !== undefined) {
    payload.library_notes = cleanNullableText(input.library_notes);
  }
  if (input.is_active !== undefined) {
    payload.is_active = input.is_active;
  }

  const { error } = await supabase
    .schema("business")
    .from("estimating_scope_library_items")
    .update(payload)
    .eq("id", id);

  if (error) {
    console.error("Error updating estimating scope library item:", error);
    throw error;
  }

  if (input.equipment_ids !== undefined) {
    await syncScopeItemEquipment(id, input.equipment_ids);
  }

  return getScopeLibraryItemById(id);
}

/**
 * Soft-delete/archive a scope library item.
 */
export async function archiveEstimatingScopeLibraryItem(
  id: string,
  userId?: string,
): Promise<EstimatingScopeLibraryItem> {
  return updateEstimatingScopeLibraryItem(id, { is_active: false }, userId);
}

/**
 * Permanently delete a scope library item.
 */
export async function deleteEstimatingScopeLibraryItem(
  id: string,
): Promise<void> {
  const { error } = await supabase
    .schema("business")
    .from("estimating_scope_library_items")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting estimating scope library item:", error);
    throw error;
  }
}

/**
 * Fetch estimating test equipment.
 */
export async function getEstimatingTestEquipment(
  includeInactive = false,
): Promise<EstimatingTestEquipment[]> {
  try {
    let query = supabase
      .schema("business")
      .from("estimating_test_equipment")
      .select("*")
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching estimating test equipment:", error);
      throw error;
    }

    return ((data || []) as any[]).map(normalizeEquipment);
  } catch (error) {
    console.error("Error in getEstimatingTestEquipment:", error);
    throw error;
  }
}

/**
 * Create a test equipment library entry.
 */
export async function createEstimatingTestEquipment(
  input: EstimatingTestEquipmentInput,
  userId?: string,
): Promise<EstimatingTestEquipment> {
  const name = input.name.trim();
  if (!name) throw new Error("Test equipment name is required.");

  const payload = {
    name,
    description: cleanNullableText(input.description),
    is_active: input.is_active ?? true,
    created_by: userId || null,
    updated_by: userId || null,
  };

  const { data, error } = await supabase
    .schema("business")
    .from("estimating_test_equipment")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("Error creating estimating test equipment:", error);
    throw error;
  }

  return normalizeEquipment(data);
}

/**
 * Update a test equipment library entry.
 */
export async function updateEstimatingTestEquipment(
  id: string,
  input: Partial<EstimatingTestEquipmentInput>,
  userId?: string,
): Promise<EstimatingTestEquipment> {
  const payload: Record<string, unknown> = {
    updated_by: userId || null,
  };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Test equipment name is required.");
    payload.name = name;
  }
  if (input.description !== undefined) {
    payload.description = cleanNullableText(input.description);
  }
  if (input.is_active !== undefined) {
    payload.is_active = input.is_active;
  }

  const { data, error } = await supabase
    .schema("business")
    .from("estimating_test_equipment")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating estimating test equipment:", error);
    throw error;
  }

  return normalizeEquipment(data);
}

/**
 * Soft-delete/archive a test equipment entry.
 */
export async function archiveEstimatingTestEquipment(
  id: string,
  userId?: string,
): Promise<EstimatingTestEquipment> {
  return updateEstimatingTestEquipment(id, { is_active: false }, userId);
}

/**
 * Permanently delete a test equipment entry.
 */
export async function deleteEstimatingTestEquipment(id: string): Promise<void> {
  const { error } = await supabase
    .schema("business")
    .from("estimating_test_equipment")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting estimating test equipment:", error);
    throw error;
  }
}
