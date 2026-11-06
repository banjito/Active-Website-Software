/**
 * How a site's diagrams connect. Two items on different diagrams are the same point when
 * they're the same asset, such as the transformer between an MV and an LV one-line, or when
 * they're link symbols with the same name, for splits that aren't at an asset.
 *
 * Matching links by name is how off-page connectors work on a drawing, so a sheet reads the
 * same on paper. It also means a link is nothing more than a labelled symbol.
 */

import type { SiteDiagram } from "@/lib/types/siteDiagrams";

/** The parts of a symbol that decide what it links to. */
export interface DiagramLinkRow {
  id: string;
  diagram_id: string;
  asset_id: string | null;
  symbol_key: string | null;
  label: string | null;
  asset: { identifier: string } | null;
}

/** Where a link leads. */
export interface DiagramLinkTarget {
  diagramId: string;
  diagramName: string;
  symbolId: string;
}

export interface DiagramConnection extends DiagramLinkTarget {
  /** What the two diagrams share, by name. */
  through: string[];
}

export interface DiagramOverview {
  diagram: SiteDiagram;
  connections: DiagramConnection[];
  /** Link symbols with no partner on another diagram, which usually means a typo. */
  unmatchedLinks: string[];
}

const linkName = (row: DiagramLinkRow) =>
  row.symbol_key === "link" ? (row.label ?? "").trim() : "";

/** Rows with the same key are the same point. Ignores case, so "A1" finds "a1". */
function matchKey(row: DiagramLinkRow): string | null {
  if (row.asset_id) return `asset:${row.asset_id}`;
  const name = linkName(row).toLowerCase();
  return name ? `link:${name}` : null;
}

function groupByKey(rows: DiagramLinkRow[]): Map<string, DiagramLinkRow[]> {
  const groups = new Map<string, DiagramLinkRow[]>();
  for (const row of rows) {
    const key = matchKey(row);
    if (key) groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

/** Each symbol's links to other diagrams, in picker order, one per diagram. */
export function findLinks(
  rows: DiagramLinkRow[],
  diagrams: SiteDiagram[],
): Map<string, DiagramLinkTarget[]> {
  const groups = groupByKey(rows);
  const links = new Map<string, DiagramLinkTarget[]>();

  for (const row of rows) {
    const key = matchKey(row);
    const group = key ? groups.get(key) : undefined;
    if (!group) continue;

    const targets = diagrams.flatMap((diagram) => {
      if (diagram.id === row.diagram_id) return [];
      const match = group.find((other) => other.diagram_id === diagram.id);
      return match
        ? [{ diagramId: diagram.id, diagramName: diagram.name, symbolId: match.id }]
        : [];
    });
    if (targets.length > 0) links.set(row.id, targets);
  }

  return links;
}

/** Which diagrams each asset is on, in picker order. */
export function placementsByAsset(
  diagrams: SiteDiagram[],
  rows: DiagramLinkRow[],
): Map<string, DiagramLinkTarget[]> {
  const placements = new Map<string, DiagramLinkTarget[]>();
  for (const diagram of diagrams) {
    for (const row of rows) {
      if (row.diagram_id !== diagram.id || !row.asset_id) continue;
      placements.set(row.asset_id, [
        ...(placements.get(row.asset_id) ?? []),
        { diagramId: diagram.id, diagramName: diagram.name, symbolId: row.id },
      ]);
    }
  }
  return placements;
}

/** Every diagram, what it connects to, and through what. */
export function buildSiteOverview(
  diagrams: SiteDiagram[],
  rows: DiagramLinkRow[],
): DiagramOverview[] {
  const links = findLinks(rows, diagrams);

  return diagrams.map((diagram) => {
    const own = rows.filter((row) => row.diagram_id === diagram.id);
    const connections = new Map<string, DiagramConnection>();

    for (const row of own) {
      const through = row.asset?.identifier ?? linkName(row);
      for (const target of links.get(row.id) ?? []) {
        const existing = connections.get(target.diagramId);
        if (existing) existing.through.push(through);
        else connections.set(target.diagramId, { ...target, through: [through] });
      }
    }

    return {
      diagram,
      connections: [...connections.values()],
      unmatchedLinks: own
        .filter((row) => linkName(row) && !links.has(row.id))
        .map((row) => linkName(row)),
    };
  });
}
