// Substation folders: the grouping levels above a report or a piece of equipment.
//
//   Reports tab:  Folder -> Substation -> Folder -> ... -> Report
//   Asset list:   Folder -> Building / Area -> Folder -> Substation -> Folder -> ... -> Asset
//
// Folders are purely organisational. They hold normalised substation and building *names*,
// not ids, because neither is an entity in this database — both are free text, substation
// scraped from four different places at render time and Building / Area a column on the
// equipment row. See database/migrations/create_substation_folders.sql and
// add_building_area_folders.sql for the full reasoning.

/**
 * Where a folder or an assignment lives. Exactly one field is set.
 *
 * Site scope is inherited by every job at that site; job scope applies to one job and
 * overrides what it inherited.
 */
export type FolderScope = { siteId: string; jobId?: never } | { jobId: string; siteId?: never };

/**
 * What a folder holds. One table backs all three levels, so the row has to say which.
 *
 * Rows written before add_building_area_folders.sql have no level column at all; the
 * service reads them as "substation" or "item" from their substation_key, exactly as the
 * migration backfills them.
 */
export type FolderLevel = "building" | "substation" | "item";

export interface SubstationFolder {
  id: string;
  site_id: string | null;
  job_id: string | null;
  name: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /**
   * null: this folder holds substations (the outer level).
   * set:  it lives inside that substation and holds reports or equipment.
   */
  substation_key?: string | null;
  /** Nesting, to any depth. null means top of its level. */
  parent_folder_id?: string | null;
  /**
   * What the folder holds. Absent on an instance that hasn't run
   * add_building_area_folders.sql, where it is inferred from substation_key.
   */
  level?: FolderLevel | null;
  /**
   * Only on a substation-level folder: the Building / Area it is pinned inside, so a
   * freshly created (and therefore empty) folder still has somewhere to render. null
   * floats it above every building — what every folder created before the building level
   * existed does.
   */
  building_key?: string | null;
}

/** A report or a piece of equipment filed into an in-substation folder. */
export interface FolderItemAssignment {
  id: string;
  folder_id: string;
  asset_id: string | null;
  equipment_asset_id: string | null;
  sort_order: number;
}

/** One node of an in-substation folder tree, with its children already attached. */
export interface FolderNode {
  folder: SubstationFolder;
  children: FolderNode[];
  /** Ids filed directly in this folder — reports or equipment, whichever the caller asked for. */
  itemIds: string[];
  /** Items in this folder and everything beneath it. Drives the header count. */
  totalItems: number;
}

export interface SubstationFolderAssignment {
  id: string;
  site_id: string | null;
  job_id: string | null;
  substation_key: string;
  substation_label: string;
  /**
   * null is meaningful on a job-scoped row: the substation was deliberately pulled out of
   * the folder the job inherited from its site.
   */
  folder_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Which Building / Area sits in which folder. Mirrors SubstationFolderAssignment. */
export interface BuildingFolderAssignment {
  id: string;
  site_id: string | null;
  job_id: string | null;
  building_key: string;
  building_label: string;
  /** null on a job-scoped row means the building was pulled out of an inherited folder. */
  folder_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** What every surface needs to render the folder level. */
export interface ResolvedFolders {
  /** Outer folders — the ones holding substations — in display order. */
  folders: SubstationFolder[];
  /**
   * Folders holding Building / Area names, in display order. Only the asset list renders
   * this level; the Reports tab has no building to group by and ignores it.
   */
  buildingFolders: SubstationFolder[];
  /** Every in-substation folder, merged across scopes. Shaped into trees per substation. */
  innerFolders: SubstationFolder[];
  /** item id (report or equipment) -> folder id. */
  itemFolderById: Map<string, string>;
  /** normalised substation name -> folder id, or null for explicitly ungrouped. */
  assignmentByKey: Map<string, string | null>;
  /** normalised Building / Area name -> folder id, or null for explicitly ungrouped. */
  buildingAssignmentByKey: Map<string, string | null>;
  /**
   * False when this instance hasn't run add_building_area_folders.sql. The asset list
   * still groups by Building / Area — that comes from the equipment row — but offers no
   * folders at that level.
   */
  buildingLevelAvailable: boolean;
  /**
   * False when this instance hasn't run create_substation_folders.sql. Every surface then
   * renders its pre-folder list and hides the Add Folder button.
   */
  available: boolean;
}

/** A top-level unit in a foldered list: either a folder with substations, or a loose one. */
export type FolderedUnit =
  | { kind: "folder"; folder: SubstationFolder; substations: string[]; count: number }
  | { kind: "substation"; label: string; count: number };
