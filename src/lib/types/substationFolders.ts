// Substation folders: one grouping level above substation.
//
//   Folder -> Substation -> Report
//
// Folders are purely organisational. They hold normalised substation *names*, not ids,
// because substation is not an entity in this database — it is free text scraped from
// four different places at render time. See database/migrations/create_substation_folders.sql
// for the full reasoning.

/**
 * Where a folder or an assignment lives. Exactly one field is set.
 *
 * Site scope is inherited by every job at that site; job scope applies to one job and
 * overrides what it inherited.
 */
export type FolderScope = { siteId: string; jobId?: never } | { jobId: string; siteId?: never };

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

/** What every surface needs to render the folder level. */
export interface ResolvedFolders {
  /** Outer folders — the ones holding substations — in display order. */
  folders: SubstationFolder[];
  /** Every in-substation folder, merged across scopes. Shaped into trees per substation. */
  innerFolders: SubstationFolder[];
  /** item id (report or equipment) -> folder id. */
  itemFolderById: Map<string, string>;
  /** normalised substation name -> folder id, or null for explicitly ungrouped. */
  assignmentByKey: Map<string, string | null>;
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
