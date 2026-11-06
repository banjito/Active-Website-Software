/** Single-line diagrams. See database/migrations/create_site_diagrams.sql. */

export interface SiteDiagram {
  id: string;
  site_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Set once archived, which makes the diagram read-only. */
  archived_at?: string | null;
  archive_snapshot?: unknown;
}

/** The asset fields a diagram draws from. */
export interface DiagramAsset {
  id: string;
  identifier: string;
  equipment_type: string | null;
  site_id: string;
  deleted_at: string | null;
  status?: string | null;
}

export interface DiagramSymbolRow {
  id: string;
  diagram_id: string;
  asset_id: string | null;
  symbol_key: string | null;
  label: string | null;
  /** Width the label wraps at. Null keeps it on one line. */
  label_width: number | null;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  asset: DiagramAsset | null;
}

export interface DiagramLineRow {
  id: string;
  diagram_id: string;
  from_symbol_id: string;
  to_symbol_id: string;
  from_port: string;
  to_port: string;
  asset_id: string | null;
  voltage_volts: number | null;
  voltage_kind: "ac" | "dc";
  label: string | null;
  asset: DiagramAsset | null;
}

/** A report attached to an asset, as the details panel lists it. */
export interface DiagramReport {
  id: string;
  name: string;
  status: string | null;
  fileUrl: string | null;
  /** The job it was written on. Shown from the site view, where reports span jobs. */
  jobLabel: string | null;
}

export interface DiagramContents {
  symbols: DiagramSymbolRow[];
  lines: DiagramLineRow[];
}
