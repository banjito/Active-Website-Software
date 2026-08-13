import { compareAlphanumericLabels } from "@/utils/sortUtils";
import type {
  FolderNode,
  FolderedUnit,
  ResolvedFolders,
  SubstationFolder,
  SubstationFolderAssignment,
} from "@/lib/types/substationFolders";

/**
 * The two labels the Reports tab invents when it cannot work out a substation.
 *
 * They are not substations, so they are never keyed, never assigned to a folder and never
 * draggable. Filing "we don't know" under "Building A" would be a lie, and the existing
 * pinning (Imported first, Other last) is what people already navigate by.
 */
export const SYNTHETIC_SUBSTATION_LABELS = ["Imported", "Other"] as const;

export function isSyntheticSubstation(label: string): boolean {
  return (SYNTHETIC_SUBSTATION_LABELS as readonly string[]).includes(label);
}

/**
 * Normalised form used as the folder-membership key.
 *
 * Case and runs of whitespace are ignored, so "  building  A " and "Building A" are one
 * substation. Nothing else is: "Sub 3" and "Substation 3" stay two different substations,
 * exactly as they are everywhere else in the app today. Guessing they are the same is how
 * you silently merge two real substations that happen to be named badly.
 *
 * Must stay identical to the SQL in create_substation_folders.sql.
 */
export function substationKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function compareFolders(a: SubstationFolder, b: SubstationFolder): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return compareAlphanumericLabels(a.name, b.name);
}

/**
 * Merge a site's folders with a job's into what the current screen should show.
 *
 * Job scope wins over site scope twice over: a job folder named the same as a site folder
 * hides it, and a job assignment replaces the inherited one — including a job assignment
 * with a null folder, which is how a substation gets pulled out of an inherited folder for
 * one job without changing the site for everybody else.
 */
export function mergeFolderScopes(input: {
  siteFolders?: SubstationFolder[];
  siteAssignments?: SubstationFolderAssignment[];
  jobFolders?: SubstationFolder[];
  jobAssignments?: SubstationFolderAssignment[];
  itemFolderById?: Map<string, string>;
  available?: boolean;
}): ResolvedFolders {
  // Outer folders hold substations; inner ones live inside a substation and hold items.
  // They come back from the same table and are separated here, once, so no caller has to
  // remember to filter.
  const isOuter = (f: SubstationFolder) => !f.substation_key;
  const innerFolders = [
    ...(input.siteFolders ?? []).filter((f) => !isOuter(f)),
    ...(input.jobFolders ?? []).filter((f) => !isOuter(f)),
  ];
  const siteFolders = (input.siteFolders ?? []).filter(isOuter);
  const jobFolders = (input.jobFolders ?? []).filter(isOuter);

  // Site folders form a fixed leading block, job folders follow. They are not interleaved
  // by sort_order, because sort_order lives on the folder row: letting a job page drag an
  // inherited folder would reorder it for every other job at that facility, which is a
  // change to something nobody on this page asked to touch. Only same-scope folders are
  // draggable, and this ordering is what makes that restriction look deliberate.
  const jobNames = new Set(jobFolders.map((f) => f.name.trim().toLowerCase()));
  const folders = [
    ...siteFolders
      .filter((f) => !jobNames.has(f.name.trim().toLowerCase()))
      .sort(compareFolders),
    ...[...jobFolders].sort(compareFolders),
  ];

  const folderIds = new Set(folders.map((f) => f.id));

  const assignmentByKey = new Map<string, string | null>();
  for (const row of input.siteAssignments ?? []) {
    assignmentByKey.set(row.substation_key, row.folder_id);
  }
  for (const row of input.jobAssignments ?? []) {
    assignmentByKey.set(row.substation_key, row.folder_id);
  }

  // A folder can be soft-deleted after something was filed in it, and a job can point at a
  // site folder that a name clash has just hidden. Fail open: the substation shows up
  // ungrouped rather than disappearing with the folder.
  for (const [key, folderId] of assignmentByKey) {
    if (folderId && !folderIds.has(folderId)) assignmentByKey.set(key, null);
  }

  return {
    folders,
    innerFolders,
    itemFolderById: input.itemFolderById ?? new Map(),
    assignmentByKey,
    available: input.available ?? true,
  };
}

/**
 * Shape one substation's folders into a tree and drop its items into it.
 *
 * `itemIds` is whatever the calling screen is listing — report ids on the Reports tab,
 * equipment ids on the asset tables — so one function serves both. Anything not filed
 * anywhere comes back in `loose`, which is what keeps an unfiled report visible instead of
 * quietly vanishing into a folder that doesn't exist.
 */
export function buildFolderTree(
  substationLabel: string,
  itemIds: string[],
  resolved: ResolvedFolders,
): { roots: FolderNode[]; loose: string[] } {
  const key = substationKey(substationLabel);
  const mine = resolved.innerFolders.filter((f) => f.substation_key === key);
  if (mine.length === 0) return { roots: [], loose: itemIds };

  const byId = new Map(mine.map((f) => [f.id, f]));
  const nodes = new Map<string, FolderNode>(
    mine.map((f) => [f.id, { folder: f, children: [], itemIds: [], totalItems: 0 }]),
  );

  const roots: FolderNode[] = [];
  for (const folder of mine) {
    const node = nodes.get(folder.id)!;
    const parentId = folder.parent_folder_id;
    // A folder whose parent lives in another substation (or was deleted) is promoted to
    // the top rather than disappearing along with its contents.
    if (parentId && byId.has(parentId)) nodes.get(parentId)!.children.push(node);
    else roots.push(node);
  }

  const loose: string[] = [];
  for (const id of itemIds) {
    const folderId = resolved.itemFolderById.get(id);
    const node = folderId ? nodes.get(folderId) : undefined;
    if (node) node.itemIds.push(id);
    else loose.push(id);
  }

  const sortNode = (node: FolderNode): number => {
    node.children.sort(
      (a, b) =>
        a.folder.sort_order - b.folder.sort_order ||
        compareAlphanumericLabels(a.folder.name, b.folder.name),
    );
    node.totalItems =
      node.itemIds.length + node.children.reduce((sum, c) => sum + sortNode(c), 0);
    return node.totalItems;
  };

  roots.sort(
    (a, b) =>
      a.folder.sort_order - b.folder.sort_order ||
      compareAlphanumericLabels(a.folder.name, b.folder.name),
  );
  for (const root of roots) sortNode(root);

  return { roots, loose };
}

/** One line of a rendered folder tree: a heading, or an item sitting under one. */
export type FolderDisplayRow =
  | { kind: "folder"; node: FolderNode; depth: number }
  | { kind: "item"; id: string; depth: number };

/**
 * Walk a folder tree into the flat row list a table renders.
 *
 * Depth-first, folders before their items, loose items last at depth 0 — so anything not
 * filed stays visible at the bottom of the substation rather than hiding inside a folder.
 * A collapsed folder keeps its heading and drops everything beneath it.
 */
export function flattenFolderRows(
  roots: FolderNode[],
  loose: string[],
  isCollapsed: (folderId: string) => boolean,
): FolderDisplayRow[] {
  const out: FolderDisplayRow[] = [];

  const walk = (node: FolderNode, depth: number) => {
    out.push({ kind: "folder", node, depth });
    if (isCollapsed(node.folder.id)) return;
    for (const child of node.children) walk(child, depth + 1);
    for (const id of node.itemIds) out.push({ kind: "item", id, depth: depth + 1 });
  };

  for (const root of roots) walk(root, 0);
  for (const id of loose) out.push({ kind: "item", id, depth: 0 });
  return out;
}

/** Every folder in a tree, flattened depth-first with its depth — for menus and pickers. */
export function flattenFolderTree(
  roots: FolderNode[],
  depth = 0,
): { folder: SubstationFolder; depth: number }[] {
  return roots.flatMap((node) => [
    { folder: node.folder, depth },
    ...flattenFolderTree(node.children, depth + 1),
  ]);
}

/** A folder plus everything under it — what a move must refuse to drop itself into. */
export function folderSubtreeIds(roots: FolderNode[], folderId: string): Set<string> {
  const out = new Set<string>();
  const walk = (node: FolderNode, collecting: boolean) => {
    const active = collecting || node.folder.id === folderId;
    if (active) out.add(node.folder.id);
    for (const child of node.children) walk(child, active);
  };
  for (const root of roots) walk(root, false);
  return out;
}

/**
 * Lay a list of substation groups out as folders and loose substations.
 *
 * Order is chosen to leave the pre-folder page recognisable: Imported stays first, Other
 * stays last, and the folder band sits between them ahead of whatever is still ungrouped.
 * Empty folders are kept — a folder you just created has to be visible to drag into.
 */
export function orderFolderedGroups(
  groups: { label: string; count: number }[],
  resolved: ResolvedFolders,
): FolderedUnit[] {
  const synthetic = new Map(
    groups.filter((g) => isSyntheticSubstation(g.label)).map((g) => [g.label, g.count]),
  );
  const real = groups.filter((g) => !isSyntheticSubstation(g.label));

  const byFolder = new Map<string, { label: string; count: number }[]>();
  const ungrouped: { label: string; count: number }[] = [];

  for (const group of real) {
    const folderId = resolved.assignmentByKey.get(substationKey(group.label));
    if (!folderId) {
      ungrouped.push(group);
      continue;
    }
    const bucket = byFolder.get(folderId) ?? [];
    bucket.push(group);
    byFolder.set(folderId, bucket);
  }

  const units: FolderedUnit[] = [];

  const imported = synthetic.get("Imported");
  if (imported !== undefined) units.push({ kind: "substation", label: "Imported", count: imported });

  for (const folder of resolved.folders) {
    const bucket = (byFolder.get(folder.id) ?? []).sort((a, b) =>
      compareAlphanumericLabels(a.label, b.label),
    );
    units.push({
      kind: "folder",
      folder,
      substations: bucket.map((g) => g.label),
      count: bucket.reduce((sum, g) => sum + g.count, 0),
    });
  }

  for (const group of ungrouped.sort((a, b) => compareAlphanumericLabels(a.label, b.label))) {
    units.push({ kind: "substation", label: group.label, count: group.count });
  }

  const other = synthetic.get("Other");
  if (other !== undefined) units.push({ kind: "substation", label: "Other", count: other });

  return units;
}

/**
 * Pack units into pages without splitting a folder.
 *
 * Same rule the Reports tab already applied to substation groups, lifted one level: the
 * unit is now a whole folder, so its substations stay together. A folder bigger than the
 * target gets a page to itself rather than being cut in half.
 */
export function packUnitsIntoPages(units: FolderedUnit[], target: number): FolderedUnit[][] {
  if (units.length === 0) return [[]];

  const pages: FolderedUnit[][] = [];
  let current: FolderedUnit[] = [];
  let count = 0;

  for (const unit of units) {
    if (count > 0 && count + unit.count > target) {
      pages.push(current);
      current = [unit];
      count = unit.count;
    } else {
      current.push(unit);
      count += unit.count;
    }
  }
  if (current.length > 0) pages.push(current);

  return pages;
}
