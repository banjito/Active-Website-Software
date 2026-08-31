import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/lib/AuthContext";
import {
  assignBuilding,
  assignItemsToFolder,
  assignSubstation,
  createFolder,
  deleteFolder,
  fetchFolderData,
  moveFolder,
  renameFolder,
  reorderFolders,
  resolveJobSiteId,
} from "@/services/substationFoldersService";
import {
  buildFolderTree,
  groupKey,
  isSyntheticSubstation,
  orderFolderedGroups,
  substationKey,
} from "@/utils/substationFolders";
import type {
  FolderNode,
  FolderScope,
  FolderedUnit,
  ResolvedFolders,
  SubstationFolder,
} from "@/lib/types/substationFolders";

const EMPTY: ResolvedFolders = {
  folders: [],
  buildingFolders: [],
  innerFolders: [],
  itemFolderById: new Map(),
  assignmentByKey: new Map(),
  buildingAssignmentByKey: new Map(),
  available: false,
  buildingLevelAvailable: false,
};

/**
 * The folder level above substation, for whichever screen is asking.
 *
 * A job passes its id and picks up its site's folders as well; the site page passes only
 * the site. Writes are optimistic and never refetch on success: a refetch would remount
 * the Reports tab and slam every open accordion shut, which is a worse outcome than the
 * rare stale row.
 *
 * When this instance hasn't run create_substation_folders.sql, `available` is false and
 * `folders` is empty — every caller then renders exactly what it rendered before folders
 * existed.
 */
export function useSubstationFolders(scopeInput: { jobId?: string | null; siteId?: string | null }) {
  const { user } = useAuth();
  const jobId = scopeInput.jobId ?? null;
  const explicitSiteId = scopeInput.siteId ?? null;

  const [siteId, setSiteId] = useState<string | null>(explicitSiteId);
  const [resolved, setResolved] = useState<ResolvedFolders>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => setSiteId(explicitSiteId), [explicitSiteId]);

  // A job that wasn't handed a site looks its own up, so inherited folders work on the
  // Reports tab without that tab having to know about sites.
  useEffect(() => {
    if (!jobId || explicitSiteId) return;
    let cancelled = false;
    resolveJobSiteId(jobId)
      .then((id) => {
        if (!cancelled) setSiteId(id);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [jobId, explicitSiteId]);

  const refresh = useCallback(async () => {
    if (!jobId && !siteId) {
      setResolved(EMPTY);
      setLoading(false);
      return;
    }
    try {
      setResolved(await fetchFolderData({ jobId, siteId }));
    } catch (e) {
      console.error(e);
      setResolved(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [jobId, siteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Writes land in the scope of the page you're on: the job's tabs, or the site page. */
  const writeScope: FolderScope | null = useMemo(() => {
    if (jobId) return { jobId };
    if (siteId) return { siteId };
    return null;
  }, [jobId, siteId]);

  /**
   * Roll the UI forward now, put it back if the write loses. Folders are a convenience —
   * a failed drop must never take the reports list down with it.
   */
  const optimistic = useCallback(
    async (apply: (current: ResolvedFolders) => ResolvedFolders, write: () => Promise<void>, failure: string) => {
      let snapshot: ResolvedFolders = EMPTY;
      setResolved((current) => {
        snapshot = current;
        return apply(current);
      });
      try {
        await write();
      } catch (e) {
        console.error(e);
        setResolved(snapshot);
        toast.error(failure);
      }
    },
    [],
  );

  /**
   * A folder of substations. `buildingLabel` pins it inside one Building / Area on the
   * asset list, which is what keeps a folder you just created visible before anything has
   * been filed into it; without one it floats above every building, as every folder made
   * before the building level existed does.
   */
  const addFolder = useCallback(
    async (name: string, options?: { buildingLabel?: string | null }) => {
      if (!writeScope || !name.trim()) return;
      const sortOrder = resolved.folders.length;
      try {
        const folder = await createFolder(writeScope, name, sortOrder, user?.id, {
          level: "substation",
          buildingLabel: options?.buildingLabel ?? null,
        });
        setResolved((current) => ({ ...current, folders: [...current.folders, folder] }));
      } catch (e: any) {
        console.error(e);
        // 23505 = the scope's unique-name index. Worth naming: "already exists" is a
        // different problem from "the save failed".
        toast.error(
          e?.code === "23505" ? `A folder named "${name.trim()}" already exists here.` : "Couldn't create that folder.",
        );
      }
    },
    [writeScope, resolved.folders.length, user?.id],
  );

  /** A folder of Building / Area names — the top level of the asset list. */
  const addBuildingFolder = useCallback(
    async (name: string) => {
      if (!writeScope || !name.trim() || !resolved.buildingLevelAvailable) return;
      const sortOrder = resolved.buildingFolders.length;
      try {
        const folder = await createFolder(writeScope, name, sortOrder, user?.id, {
          level: "building",
        });
        setResolved((current) => ({
          ...current,
          buildingFolders: [...current.buildingFolders, folder],
        }));
      } catch (e: any) {
        console.error(e);
        toast.error(
          e?.code === "23505"
            ? `A folder named "${name.trim()}" already exists here.`
            : "Couldn't create that folder.",
        );
      }
    },
    [writeScope, resolved.buildingFolders.length, resolved.buildingLevelAvailable, user?.id],
  );

  // Rename and delete take a folder id and don't care which level it came from: one folder
  // row backs all three, and the caller already knows which list it clicked in.
  const rename = useCallback(
    (folderId: string, name: string) =>
      optimistic(
        (current) => {
          const applyName = (f: SubstationFolder) =>
            f.id === folderId ? { ...f, name: name.trim() } : f;
          return {
            ...current,
            folders: current.folders.map(applyName),
            buildingFolders: current.buildingFolders.map(applyName),
          };
        },
        () => renameFolder(folderId, name),
        "Couldn't rename that folder.",
      ),
    [optimistic],
  );

  /**
   * Removes the folder only. Whatever was in it — substations, buildings — falls back to
   * ungrouped; no report, asset or equipment name is touched.
   */
  const remove = useCallback(
    (folderId: string) =>
      optimistic(
        (current) => {
          const without = (map: Map<string, string | null>) => {
            const next = new Map(map);
            for (const [key, id] of next) {
              if (id === folderId) next.delete(key);
            }
            return next;
          };
          return {
            ...current,
            folders: current.folders.filter((f) => f.id !== folderId),
            buildingFolders: current.buildingFolders.filter((f) => f.id !== folderId),
            assignmentByKey: without(current.assignmentByKey),
            buildingAssignmentByKey: without(current.buildingAssignmentByKey),
          };
        },
        () => deleteFolder(folderId),
        "Couldn't delete that folder.",
      ),
    [optimistic],
  );

  /** File a Building / Area into a folder of buildings, or `null` to take it back out. */
  const moveBuilding = useCallback(
    (label: string, folderId: string | null) => {
      if (!writeScope || !label.trim()) return Promise.resolve();
      return optimistic(
        (current) => {
          const buildingAssignmentByKey = new Map(current.buildingAssignmentByKey);
          buildingAssignmentByKey.set(groupKey(label), folderId);
          return { ...current, buildingAssignmentByKey };
        },
        () => assignBuilding(writeScope, label, folderId, user?.id),
        "Couldn't move that building.",
      );
    },
    [optimistic, writeScope, user?.id],
  );

  const moveSubstation = useCallback(
    (label: string, folderId: string | null) => {
      if (!writeScope || isSyntheticSubstation(label)) return Promise.resolve();
      return optimistic(
        (current) => {
          const assignmentByKey = new Map(current.assignmentByKey);
          assignmentByKey.set(substationKey(label), folderId);
          return { ...current, assignmentByKey };
        },
        () => assignSubstation(writeScope, label, folderId, user?.id),
        "Couldn't move that substation.",
      );
    },
    [optimistic, writeScope, user?.id],
  );

  /**
   * Reorder folders in the current scope only. sort_order lives on the folder row, so a
   * job page dragging an inherited site folder would reorder it for every other job at
   * that site — those keep their position and their handle is hidden.
   */
  const reorder = useCallback(
    (orderedIds: string[]) => {
      const ownScope = (f: SubstationFolder) => (jobId ? f.job_id === jobId : f.site_id === siteId);
      const own = orderedIds.filter((id) => resolved.folders.some((f) => f.id === id && ownScope(f)));
      return optimistic(
        (current) => {
          const position = new Map(own.map((id, index) => [id, index]));
          return {
            ...current,
            folders: current.folders.map((f) =>
              position.has(f.id) ? { ...f, sort_order: position.get(f.id)! } : f,
            ),
          };
        },
        () => reorderFolders(own),
        "Couldn't reorder the folders.",
      );
    },
    [optimistic, resolved.folders, jobId, siteId],
  );

  const folderById = useMemo(
    () => new Map(resolved.folders.map((f) => [f.id, f])),
    [resolved.folders],
  );

  /** The folder a substation label currently sits in, or null when it's loose. */
  const folderFor = useCallback(
    (label: string): SubstationFolder | null => {
      if (isSyntheticSubstation(label)) return null;
      const id = resolved.assignmentByKey.get(substationKey(label));
      return id ? (folderById.get(id) ?? null) : null;
    },
    [resolved.assignmentByKey, folderById],
  );

  const buildingFolderById = useMemo(
    () => new Map(resolved.buildingFolders.map((f) => [f.id, f])),
    [resolved.buildingFolders],
  );

  /** The folder a Building / Area currently sits in, or null when it's loose. */
  const folderForBuilding = useCallback(
    (label: string): SubstationFolder | null => {
      const id = resolved.buildingAssignmentByKey.get(groupKey(label));
      return id ? (buildingFolderById.get(id) ?? null) : null;
    },
    [resolved.buildingAssignmentByKey, buildingFolderById],
  );

  /**
   * The folders of substations that belong to one building: the ones pinned inside it,
   * plus any floating folder that holds a substation present in that building.
   *
   * A floating folder therefore shows up under every building whose substations it holds.
   * That is deliberate — the same folder legitimately spans two buildings, and hiding it
   * from one of them would hide equipment.
   */
  const substationFoldersInBuilding = useCallback(
    (buildingLabel: string, substationLabels: string[]): SubstationFolder[] => {
      const key = groupKey(buildingLabel);
      const holders = new Set(
        substationLabels
          .map((label) => resolved.assignmentByKey.get(substationKey(label)))
          .filter((id): id is string => Boolean(id)),
      );
      return resolved.folders.filter(
        (f) => (f.building_key ? f.building_key === key : false) || holders.has(f.id),
      );
    },
    [resolved.folders, resolved.assignmentByKey],
  );

  const unitsFor = useCallback(
    (groups: { label: string; count: number }[]): FolderedUnit[] =>
      orderFolderedGroups(groups, resolved),
    [resolved],
  );

  /** Whether this folder can be renamed, deleted or dragged from the page you're on. */
  const isOwnScope = useCallback(
    (folder: SubstationFolder) => (jobId ? folder.job_id === jobId : folder.site_id === siteId),
    [jobId, siteId],
  );

  // ── Folders inside a substation ────────────────────────────────────────────

  /** Which in-substation folder a report or piece of equipment is filed in. */
  const itemFolder = useCallback(
    (itemId: string): string | null => resolved.itemFolderById.get(itemId) ?? null,
    [resolved.itemFolderById],
  );

  /** One substation's folder tree, with `itemIds` dropped into it and the rest loose. */
  const treeFor = useCallback(
    (substationLabel: string, itemIds: string[]): { roots: FolderNode[]; loose: string[] } =>
      buildFolderTree(substationLabel, itemIds, resolved),
    [resolved],
  );

  const addInnerFolder = useCallback(
    async (substationLabel: string, name: string, parentFolderId?: string | null) => {
      // No synthetic-label guard: 'Imported' and 'Other' can't be filed into a folder of
      // substations, but they can hold folders of their own. See SYNTHETIC_SUBSTATION_LABELS.
      if (!writeScope || !name.trim()) return;
      const siblings = resolved.innerFolders.filter(
        (f) =>
          f.substation_key === substationKey(substationLabel) &&
          (f.parent_folder_id ?? null) === (parentFolderId ?? null),
      );
      try {
        const folder = await createFolder(writeScope, name, siblings.length, user?.id, {
          substationLabel,
          parentFolderId: parentFolderId ?? null,
        });
        setResolved((current) => ({
          ...current,
          innerFolders: [...current.innerFolders, folder],
        }));
      } catch (e: any) {
        console.error(e);
        toast.error(
          e?.code === "23505"
            ? `A folder named "${name.trim()}" already exists here.`
            : "Couldn't create that folder.",
        );
      }
    },
    [writeScope, resolved.innerFolders, user?.id],
  );

  const renameInnerFolder = useCallback(
    (folderId: string, name: string) =>
      optimistic(
        (current) => ({
          ...current,
          innerFolders: current.innerFolders.map((f) =>
            f.id === folderId ? { ...f, name: name.trim() } : f,
          ),
        }),
        () => renameFolder(folderId, name),
        "Couldn't rename that folder.",
      ),
    [optimistic],
  );

  /**
   * Delete a folder inside a substation. Its children and the items in it fall back to
   * loose; nothing about a report or a piece of equipment changes.
   */
  const deleteInnerFolder = useCallback(
    (folderId: string) =>
      optimistic(
        (current) => {
          // Everything under it goes too, matching the ON DELETE CASCADE in the database.
          const doomed = new Set<string>([folderId]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const f of current.innerFolders) {
              if (f.parent_folder_id && doomed.has(f.parent_folder_id) && !doomed.has(f.id)) {
                doomed.add(f.id);
                grew = true;
              }
            }
          }
          const itemFolderById = new Map(current.itemFolderById);
          for (const [itemId, id] of itemFolderById) {
            if (doomed.has(id)) itemFolderById.delete(itemId);
          }
          return {
            ...current,
            innerFolders: current.innerFolders.filter((f) => !doomed.has(f.id)),
            itemFolderById,
          };
        },
        () => deleteFolder(folderId),
        "Couldn't delete that folder.",
      ),
    [optimistic],
  );

  const moveInnerFolder = useCallback(
    (folderId: string, parentFolderId: string | null) =>
      optimistic(
        (current) => ({
          ...current,
          innerFolders: current.innerFolders.map((f) =>
            f.id === folderId ? { ...f, parent_folder_id: parentFolderId } : f,
          ),
        }),
        () => moveFolder(folderId, parentFolderId),
        "Couldn't move that folder.",
      ),
    [optimistic],
  );

  /** File one item or fifty. `folderId: null` takes them back out. */
  const moveItems = useCallback(
    (itemIds: string[], folderId: string | null, kind: "report" | "equipment") => {
      if (itemIds.length === 0) return Promise.resolve();
      return optimistic(
        (current) => {
          const itemFolderById = new Map(current.itemFolderById);
          for (const id of itemIds) {
            if (folderId) itemFolderById.set(id, folderId);
            else itemFolderById.delete(id);
          }
          return { ...current, itemFolderById };
        },
        () => assignItemsToFolder(itemIds, folderId, kind, user?.id),
        itemIds.length > 1 ? "Couldn't move those." : "Couldn't move that.",
      );
    },
    [optimistic, user?.id],
  );

  return {
    loading,
    available: resolved.available,
    folders: resolved.folders,
    folderFor,
    isOwnScope,
    unitsFor,
    addFolder,
    renameFolder: rename,
    deleteFolder: remove,
    moveSubstation,
    reorderFolders: reorder,
    refresh,
    // The Building / Area level. Only the asset list renders it — the Reports tab has no
    // building to group by and ignores every one of these.
    buildingLevelAvailable: resolved.buildingLevelAvailable,
    buildingFolders: resolved.buildingFolders,
    folderForBuilding,
    addBuildingFolder,
    moveBuilding,
    substationFoldersInBuilding,
    // Folders inside a substation.
    innerFolders: resolved.innerFolders,
    itemFolder,
    treeFor,
    addInnerFolder,
    renameInnerFolder,
    deleteInnerFolder,
    moveInnerFolder,
    moveItems,
  };
}

export type SubstationFoldersApi = ReturnType<typeof useSubstationFolders>;

export default useSubstationFolders;
