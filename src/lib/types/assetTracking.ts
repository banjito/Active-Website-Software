// Asset tracking: Site -> Asset.
//
// Customer is deliberately absent from this hierarchy. AMP works for multiple customers at
// the same jobsite on the same equipment, so an asset belongs to a site only; the customer
// stays on the job (neta_ops.jobs.customer_id).
//
// Not to be confused with the three similarly-named existing tables:
//   neta_ops.assets     = report documents (name + "report:/jobs/..." file_url)
//   neta_ops.job_assets = job <-> report-document link
//   neta_ops.equipment  = AMP's own tool/test-equipment inventory

export interface Site {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  status: "active" | "inactive";
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EquipmentAsset {
  id: string;
  site_id: string;
  /**
   * The equipment this asset is a component of — a switch/CT/relay inside a switchgear
   * lineup. One layer only: an asset with a parent can never itself be a parent, which is
   * enforced by a trigger in add_equipment_asset_parent.sql.
   */
  parent_asset_id?: string | null;
  building_area?: string | null;
  substation?: string | null;
  identifier: string;
  equipment_location?: string | null;
  equipment_type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  notes?: string | null;
  status: "active" | "removed";
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/** An asset plus how many report documents point at it. Drives the delete guard. */
export interface EquipmentAssetWithCounts extends EquipmentAsset {
  report_count: number;
}

/** The editable half of an asset — what the add/edit dialog and the importer produce. */
export type EquipmentAssetInput = Pick<
  EquipmentAsset,
  | "site_id"
  | "parent_asset_id"
  | "building_area"
  | "substation"
  | "identifier"
  | "equipment_location"
  | "equipment_type"
  | "manufacturer"
  | "model"
  | "serial_number"
  | "notes"
>;

/** Fields the bulk importer can map spreadsheet columns onto. */
export const IMPORTABLE_ASSET_FIELDS = [
  { key: "identifier", label: "Identifier", required: true },
  { key: "building_area", label: "Building / Area", required: false },
  { key: "substation", label: "Substation", required: false },
  { key: "equipment_location", label: "Equipment Location", required: false },
  { key: "equipment_type", label: "Equipment Type", required: false },
  { key: "manufacturer", label: "Manufacturer", required: false },
  { key: "model", label: "Model", required: false },
  { key: "serial_number", label: "Serial Number", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

export type ImportableAssetField = (typeof IMPORTABLE_ASSET_FIELDS)[number]["key"];

/** Prefill handed to a report form when it is opened from an asset row. */
export interface EquipmentAssetPrefill {
  identifier: string;
  substation: string;
  eqptLocation: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
}

export function toPrefill(asset: EquipmentAsset): EquipmentAssetPrefill {
  return {
    identifier: asset.identifier ?? "",
    substation: asset.substation ?? "",
    eqptLocation: asset.equipment_location ?? "",
    equipmentType: asset.equipment_type ?? "",
    manufacturer: asset.manufacturer ?? "",
    model: asset.model ?? "",
    serialNumber: asset.serial_number ?? "",
  };
}

/** "QTS ATL2 — Atlanta, GA" for pickers and headers. */
export function formatSiteLabel(site: Pick<Site, "name" | "city" | "state">): string {
  const place = [site.city, site.state].filter(Boolean).join(", ");
  return place ? `${site.name} — ${place}` : site.name;
}
