/** Finding a symbol by name, on this diagram or any other at the site. */

export interface DiagramSearchItem {
  symbolId: string;
  diagramId: string;
  diagramName: string;
  name: string;
}

const MAX_RESULTS = 8;

/** Names that start with the search come first, then the open diagram's matches. */
export function searchSymbols(
  items: DiagramSearchItem[],
  query: string,
  activeDiagramId: string,
): DiagramSearchItem[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];

  const score = (item: DiagramSearchItem) =>
    (item.name.toLowerCase().startsWith(term) ? 0 : 2) + (item.diagramId === activeDiagramId ? 0 : 1);

  return items
    .filter((item) => item.name.toLowerCase().includes(term))
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    .slice(0, MAX_RESULTS);
}
