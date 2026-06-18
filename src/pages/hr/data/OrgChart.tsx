import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import Card, {
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Label } from "../../../components/ui/Label";
import {
  Plus,
  Trash2,
  Loader2,
  Search,
  UserPlus,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Edit2,
  Settings,
  Palette,
} from "lucide-react";
import { toast } from "../../../components/ui/toast";
import { supabase } from "../../../lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/Dialog";
import { ProfileView } from "../../../components/profile/ProfileView";
import { useAuth } from "../../../lib/AuthContext";

// Types
interface OrgPerson {
  id: string;
  full_name: string;
  job_title: string;
  avatar_url: string | null;
  reports_to: string | null;
  reports_to_ids?: string[];
  role?: string;
  level_id?: string | null;
}

interface OrgNode extends OrgPerson {
  children: OrgNode[];
  level: number;
}

// Fallback role options if the database table doesn't exist yet
const DEFAULT_ROLE_OPTIONS: Array<{
  value: string;
  label: string;
  color: string;
}> = [
  { value: "team_member", label: "Team Member", color: "blue" },
  { value: "fire_team_lead", label: "Fire Team Lead", color: "red" },
  { value: "office_admin", label: "Office Admin", color: "purple" },
  { value: "technician", label: "Technician", color: "green" },
];

const getRoleColorFromPalette = (colorName?: string) => {
  const c =
    COLOR_PALETTE.find((p) => p.name === colorName) ||
    COLOR_PALETTE[COLOR_PALETTE.length - 1];
  return `${c.bg} ${c.text} ${c.border}`;
};

const getRoleColor = (
  role?: string,
  dynamicRoles?: Array<{ value: string; color: string }>,
) => {
  if (!role) return "bg-neutral-100 text-neutral-600 border-neutral-300";
  if (dynamicRoles && dynamicRoles.length > 0) {
    const found = dynamicRoles.find((r) => r.value === role);
    if (found) return getRoleColorFromPalette(found.color);
  }
  const fallback = DEFAULT_ROLE_OPTIONS.find((r) => r.value === role);
  if (fallback) return getRoleColorFromPalette(fallback.color);
  return "bg-neutral-100 text-neutral-600 border-neutral-300";
};

const getRoleLabel = (
  role?: string,
  dynamicRoles?: Array<{ value: string; label: string }>,
) => {
  if (!role) return "";
  if (dynamicRoles && dynamicRoles.length > 0) {
    const found = dynamicRoles.find((r) => r.value === role);
    if (found) return found.label;
  }
  const fallback = DEFAULT_ROLE_OPTIONS.find((r) => r.value === role);
  return fallback?.label || role;
};

// Color palette for levels
const COLOR_PALETTE = [
  {
    name: "pink",
    bg: "bg-pink-200",
    border: "border-pink-300",
    text: "text-pink-900",
    ring: "ring-pink-400",
    preview: "bg-pink-400",
  },
  {
    name: "teal",
    bg: "bg-teal-200",
    border: "border-teal-300",
    text: "text-teal-900",
    ring: "ring-teal-400",
    preview: "bg-teal-400",
  },
  {
    name: "amber",
    bg: "bg-amber-200",
    border: "border-amber-300",
    text: "text-amber-900",
    ring: "ring-amber-400",
    preview: "bg-amber-400",
  },
  {
    name: "blue",
    bg: "bg-blue-200",
    border: "border-blue-300",
    text: "text-blue-900",
    ring: "ring-blue-400",
    preview: "bg-blue-400",
  },
  {
    name: "purple",
    bg: "bg-purple-200",
    border: "border-purple-300",
    text: "text-purple-900",
    ring: "ring-purple-400",
    preview: "bg-purple-400",
  },
  {
    name: "green",
    bg: "bg-green-200",
    border: "border-green-300",
    text: "text-green-900",
    ring: "ring-green-400",
    preview: "bg-green-400",
  },
  {
    name: "red",
    bg: "bg-red-200",
    border: "border-red-300",
    text: "text-red-900",
    ring: "ring-red-400",
    preview: "bg-red-400",
  },
  {
    name: "orange",
    bg: "bg-orange-200",
    border: "border-orange-300",
    text: "text-orange-900",
    ring: "ring-orange-400",
    preview: "bg-orange-400",
  },
  {
    name: "cyan",
    bg: "bg-cyan-200",
    border: "border-cyan-300",
    text: "text-cyan-900",
    ring: "ring-cyan-400",
    preview: "bg-cyan-400",
  },
  {
    name: "gray",
    bg: "bg-neutral-100",
    border: "border-neutral-300",
    text: "text-neutral-900",
    ring: "ring-neutral-400",
    preview: "bg-neutral-400",
  },
];

const getColorByName = (colorName?: string) => {
  return (
    COLOR_PALETTE.find((c) => c.name === colorName) ||
    COLOR_PALETTE[COLOR_PALETTE.length - 1]
  );
};

// Default fallback level colors by index
const LEVEL_COLORS: Record<
  number,
  { bg: string; border: string; text: string; ring: string }
> = {
  0: {
    bg: "bg-pink-200",
    border: "border-pink-300",
    text: "text-pink-900",
    ring: "ring-pink-400",
  },
  1: {
    bg: "bg-teal-200",
    border: "border-teal-300",
    text: "text-teal-900",
    ring: "ring-teal-400",
  },
  2: {
    bg: "bg-amber-200",
    border: "border-amber-300",
    text: "text-amber-900",
    ring: "ring-amber-400",
  },
  3: {
    bg: "bg-neutral-100",
    border: "border-neutral-300",
    text: "text-neutral-900",
    ring: "ring-neutral-400",
  },
};

function getLevelColors(level: number, orgLevels?: Array<{ color?: string }>) {
  // If we have orgLevels with colors, use those
  if (orgLevels && orgLevels[level]?.color) {
    return getColorByName(orgLevels[level].color);
  }
  // Fallback to default colors
  return LEVEL_COLORS[level as keyof typeof LEVEL_COLORS] || LEVEL_COLORS[3];
}

// Get all descendant IDs of a node (to prevent dropping on descendants)
function getDescendantIds(node: OrgNode): Set<string> {
  const ids = new Set<string>();
  const traverse = (n: OrgNode) => {
    ids.add(n.id);
    n.children.forEach(traverse);
  };
  traverse(node);
  return ids;
}

// Build tree from flat list with level tracking
function buildOrgTree(people: OrgPerson[]): OrgNode[] {
  const map = new Map<string, OrgNode>();
  const roots: OrgNode[] = [];
  const addedAsChild = new Set<string>();

  people.forEach((p) => {
    map.set(p.id, { ...p, children: [], level: 0 });
  });

  people.forEach((p) => {
    const node = map.get(p.id)!;
    if (p.reports_to && map.has(p.reports_to) && p.reports_to !== p.id) {
      let current = p.reports_to;
      let isCycle = false;
      const visited = new Set<string>();
      while (current && map.has(current)) {
        if (visited.has(current)) break;
        visited.add(current);
        const parent = map.get(current)!;
        if (parent.reports_to === p.id) {
          isCycle = true;
          break;
        }
        current = parent.reports_to;
      }

      if (!isCycle) {
        map.get(p.reports_to)!.children.push(node);
        addedAsChild.add(p.id);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  people.forEach((p) => {
    if (!addedAsChild.has(p.id) && !roots.some((r) => r.id === p.id)) {
      const node = map.get(p.id)!;
      roots.push(node);
    }
  });

  const assignLevels = (
    nodes: OrgNode[],
    level: number,
    visited: Set<string> = new Set(),
  ) => {
    nodes.forEach((n) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      n.level = level;
      assignLevels(n.children, level + 1, visited);
    });
  };
  assignLevels(roots, 0);

  const sortChildren = (nodes: OrgNode[], visited: Set<string> = new Set()) => {
    nodes.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    nodes.forEach((n) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      sortChildren(n.children, visited);
    });
  };
  sortChildren(roots);

  return roots;
}

// Find node by ID in tree
function findNodeById(nodes: OrgNode[], id: string): OrgNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

/** Group sibling nodes that share a manager group so we can render their cards flush, side by side. */
function clusterChildrenByManagerGroup(
  children: OrgNode[],
  profileToGroup: Record<string, string>,
  groupMembers: Record<string, string[]>,
): OrgNode[][] {
  const used = new Set<string>();
  const out: OrgNode[][] = [];
  for (const child of children) {
    if (used.has(child.id)) continue;
    const gid = profileToGroup[child.id];
    const gmem = gid ? groupMembers[gid] : undefined;
    if (gid && gmem && gmem.length > 1) {
      const set = new Set(gmem);
      const peers = children.filter((c) => set.has(c.id));
      if (peers.length > 1) {
        peers.sort((a, b) =>
          (a.full_name || "").localeCompare(b.full_name || ""),
        );
        peers.forEach((p) => used.add(p.id));
        out.push(peers);
        continue;
      }
    }
    used.add(child.id);
    out.push([child]);
  }
  return out;
}

/** Deduplicate and sort all direct reports of a cluster of co-managers (one visual row, shared connector). */
function mergeDirectReportsForManagerCluster(cluster: OrgNode[]): OrgNode[] {
  const seen = new Set<string>();
  const out: OrgNode[] = [];
  for (const m of cluster) {
    for (const ch of m.children) {
      if (!seen.has(ch.id)) {
        seen.add(ch.id);
        out.push(ch);
      }
    }
  }
  return out.sort((a, b) =>
    (a.full_name || "").localeCompare(b.full_name || ""),
  );
}

/**
 * Replaces all org_chart_assignments rows for a profile. Required after the multi-manager
 * migration (PK is `id`, not `profile_id` — upsert on profile_id is invalid).
 */
async function replaceProfileOrgChartAssignments(
  profileId: string,
  managerIds: string[],
  common: {
    level_id?: string | null;
    role?: string | null;
    grid_column: number;
  },
) {
  const { error: delErr } = await supabase
    .schema("common")
    .from("org_chart_assignments")
    .delete()
    .eq("profile_id", profileId);
  if (delErr) throw delErr;

  const unique = Array.from(new Set(managerIds.filter(Boolean)));
  if (unique.length === 0) {
    const { error } = await supabase
      .schema("common")
      .from("org_chart_assignments")
      .insert({
        profile_id: profileId,
        reports_to_profile_id: null,
        level_id: common.level_id ?? null,
        role: common.role ?? null,
        grid_column: common.grid_column,
      });
    if (error) throw error;
  } else {
    const rows = unique.map((managerId) => ({
      profile_id: profileId,
      reports_to_profile_id: managerId,
      level_id: common.level_id ?? null,
      role: common.role ?? null,
      grid_column: common.grid_column,
    }));
    const { error: insErr } = await supabase
      .schema("common")
      .from("org_chart_assignments")
      .insert(rows);
    if (insErr) {
      if ((insErr.message || "").toLowerCase().includes("duplicate")) {
        throw new Error(
          "Run the multi-manager org chart SQL migration to assign to multiple managers.",
        );
      }
      throw insErr;
    }
  }
}

// ============================================================================
// Draggable Flowchart Node Component
// ============================================================================
const FlowchartNode: React.FC<{
  node: OrgNode;
  orgTree: OrgNode[];
  onSelect: (id: string) => void;
  onEdit: (person: OrgPerson) => void;
  onDelete: (id: string) => void;
  onAddUnder: (managerId: string) => void;
  onDrop: (draggedId: string, targetId: string | null) => void;
  collapsedNodes: Set<string>;
  toggleCollapse: (id: string) => void;
  draggedId: string | null;
  setDraggedId: (id: string | null) => void;
  dataVersion?: number;
  orgLevels?: Array<{ id: string; label: string; color?: string }>;
  orgRoles?: Array<{
    id: string;
    value: string;
    label: string;
    color: string;
    display_order: number;
  }>;
  peopleLookup?: Record<string, OrgPerson>;
  profileToGroup?: Record<string, string>;
  groupMembers?: Record<string, string[]>;
  groupColors?: Record<string, string>;
  onUngroup?: (profileId: string) => void;
  /** When set, this card is part of a side-by-side manager group — drop extra labels/rings. */
  inManagerCluster?: boolean;
  /** Merged with other peers: render only the card; direct reports are drawn in one row under the group. */
  suppressSubtree?: boolean;
  canEdit?: boolean;
}> = ({
  node,
  orgTree,
  onSelect,
  onEdit,
  onDelete,
  onAddUnder,
  onDrop,
  collapsedNodes,
  toggleCollapse,
  draggedId,
  setDraggedId,
  dataVersion = 0,
  orgLevels,
  orgRoles,
  peopleLookup = {},
  profileToGroup = {},
  groupMembers = {},
  groupColors = {},
  onUngroup,
  inManagerCluster = false,
  suppressSubtree = false,
  canEdit = true,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  // Use assigned level color if set, otherwise depth-based
  const assignedLevel =
    node.level_id && orgLevels
      ? orgLevels.find((l) => l.id === node.level_id)
      : null;
  const colors = assignedLevel
    ? getColorByName(assignedLevel.color)
    : getLevelColors(node.level, orgLevels);
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedNodes.has(node.id);
  const showOwnSubtree = hasChildren && !isCollapsed && !suppressSubtree;
  const isRoot = node.level === 0;
  const secondaryManagerNames = (node.reports_to_ids || [])
    .filter((id) => id && id !== node.reports_to)
    .map((id) => peopleLookup[id]?.full_name || "Unknown")
    .slice(0, 2);

  const groupId = profileToGroup[node.id];
  const groupColorName = groupId ? groupColors[groupId] : undefined;
  const groupPalette =
    !inManagerCluster && groupColorName ? getColorByName(groupColorName) : null;

  const initials = (node.full_name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Check if this node is a valid drop target for the currently dragged item
  const isValidDropTarget = useMemo(() => {
    if (!draggedId || draggedId === node.id) return false;
    const draggedNode = findNodeById(orgTree, draggedId);
    if (!draggedNode) return false;
    // Can't drop on descendant (would create cycle)
    const descendants = getDescendantIds(draggedNode);
    return !descendants.has(node.id);
  }, [draggedId, node.id, orgTree]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", node.id);
    e.dataTransfer.effectAllowed = "move";
    // Set a drag image
    if (e.currentTarget) {
      e.dataTransfer.setDragImage(e.currentTarget, 80, 40);
    }
    // Use setTimeout to allow the drag image to be captured before changing state
    setTimeout(() => {
      setDraggedId(node.id);
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setDraggedId(null);
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isValidDropTarget) {
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedId = e.dataTransfer.getData("text/plain");
    if (droppedId && droppedId !== node.id && isValidDropTarget) {
      onDrop(droppedId, node.id);
    }
  };

  const isDragging = draggedId === node.id;

  return (
    <div className="flex flex-col items-center">
      {/* Avatar circle above root node */}
      {isRoot && (
        <div className="mb-2 pointer-events-none">
          <div className="w-16 h-16 rounded-full overflow-hidden ring-4 ring-pink-300 shadow-lg">
            {node.avatar_url ? (
              <img
                src={node.avatar_url}
                alt=""
                className="w-full h-full object-cover"
                draggable="false"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl font-bold bg-pink-400 text-white">
                {initials}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Node Card - Draggable */}
      <div
        draggable={canEdit ? "true" : "false"}
        onDragStart={canEdit ? handleDragStart : undefined}
        onDragEnd={canEdit ? handleDragEnd : undefined}
        onDragOver={canEdit ? handleDragOver : undefined}
        onDragLeave={canEdit ? handleDragLeave : undefined}
        onDrop={canEdit ? handleDrop : undefined}
        style={{ userSelect: "none" }}
        className={`
          relative group border-2 shadow-sm select-none
          ${inManagerCluster ? "rounded-none" : "rounded-lg"}
          transition-all duration-200
          ${colors.bg} ${colors.border}
          min-w-[160px] max-w-[200px]
          ${groupPalette ? `ring-2 ${groupPalette.ring} ring-offset-2 ring-offset-white dark:ring-offset-neutral-800` : ""}
          ${isDragging ? "opacity-50 scale-95 cursor-grabbing" : canEdit ? "cursor-grab hover:shadow-md hover:scale-[1.02]" : "cursor-pointer hover:shadow-md hover:scale-[1.02]"}
          ${isDragOver && isValidDropTarget ? `ring-4 ${colors.ring} ring-opacity-60 scale-105` : ""}
          ${draggedId && !isValidDropTarget && draggedId !== node.id ? "opacity-40" : ""}
        `}
        onClick={(e) => {
          if (!draggedId) {
            e.stopPropagation();
            onSelect(node.id);
          }
        }}
      >
        {/* Drag handle indicator */}
        {canEdit && (
          <div className="absolute top-1 left-1 opacity-40 group-hover:opacity-70 transition-opacity pointer-events-none">
            <GripVertical className="h-4 w-4 text-neutral-500" />
          </div>
        )}

        {/* Edit & Delete buttons */}
        {canEdit && (
          <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-auto flex gap-1">
            <button
              draggable="false"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEdit(node);
              }}
              className="p-1.5 rounded-full bg-white shadow-md border border-neutral-200 hover:bg-blue-50"
              title="Edit title"
            >
              <Edit2 className="h-3 w-3 text-neutral-600 hover:text-blue-500" />
            </button>
            <button
              draggable="false"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete(node.id);
              }}
              className="p-1.5 rounded-full bg-white shadow-md border border-neutral-200 hover:bg-red-50"
              title="Remove from chart"
            >
              <Trash2 className="h-3 w-3 text-neutral-600 hover:text-red-500" />
            </button>
          </div>
        )}

        {/* Drop indicator */}
        {isDragOver && isValidDropTarget && (
          <div className="absolute inset-0 bg-[#f26722]/20 rounded-lg flex items-center justify-center pointer-events-none z-20">
            <span className="text-xs font-medium text-[#f26722] bg-white px-2 py-1 rounded shadow">
              Drop here
            </span>
          </div>
        )}

        {/* Card content */}
        <div className="px-4 py-3 text-center pointer-events-none">
          {!isRoot && (
            <div className="flex justify-center mb-2">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 ring-2 ring-white dark:ring-neutral-600">
                {node.avatar_url ? (
                  <img
                    src={node.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable="false"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-neutral-500 dark:text-neutral-300">
                    {initials}
                  </div>
                )}
              </div>
            </div>
          )}
          <h3 className={`font-semibold text-sm leading-tight ${colors.text}`}>
            {node.full_name || "Unknown"}
          </h3>
          {node.job_title && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5 truncate px-1">
              {node.job_title}
            </p>
          )}
          <div className="flex flex-wrap gap-1 justify-center mt-1">
            {assignedLevel && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}
              >
                {assignedLevel.label}
              </span>
            )}
            {node.role && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded border ${getRoleColor(node.role, orgRoles)}`}
              >
                {getRoleLabel(node.role, orgRoles)}
              </span>
            )}
          </div>
          {secondaryManagerNames.length > 0 && (
            <p
              className="text-[10px] text-neutral-600 dark:text-neutral-300 mt-1 px-1"
              title={(node.reports_to_ids || [])
                .filter((id) => id && id !== node.reports_to)
                .map((id) => peopleLookup[id]?.full_name || "Unknown")
                .join(", ")}
            >
              Also reports to: {secondaryManagerNames.join(", ")}
              {(node.reports_to_ids || []).filter(
                (id) => id && id !== node.reports_to,
              ).length > secondaryManagerNames.length
                ? "…"
                : ""}
            </p>
          )}
        </div>
        {canEdit && groupId && onUngroup && (
          <button
            draggable="false"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onUngroup(node.id);
            }}
            className="absolute -bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white shadow border border-neutral-200 hover:bg-neutral-50 pointer-events-auto z-10"
            title="Remove from manager group"
          >
            Ungroup
          </button>
        )}

        {/* Collapse (hidden when this node's subtree is merged under the group row) */}
        {hasChildren && !suppressSubtree && (
          <button
            draggable="false"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              toggleCollapse(node.id);
            }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 p-0.5 rounded-full bg-white shadow border border-neutral-200 hover:bg-neutral-50 z-10 pointer-events-auto"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
            )}
          </button>
        )}
      </div>

      {/* Add subordinate */}
      {canEdit && (
        <button
          draggable="false"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAddUnder(node.id);
          }}
          className="mt-4 text-xs text-neutral-400 hover:text-[#f26722] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      )}

      {/* Connector line down from parent to horizontal bus (own subtree only) */}
      {showOwnSubtree && (
        <div className="h-4 w-[2px] shrink-0 rounded-sm bg-neutral-500 dark:bg-neutral-400" />
      )}

      {/* Children row — group peers in the same manager group side by side with shared lines */}
      {showOwnSubtree &&
        (() => {
          const childClusters = clusterChildrenByManagerGroup(
            node.children,
            profileToGroup,
            groupMembers,
          );
          const nClusters = childClusters.length;
          return (
            <div
              className={
                nClusters === 1
                  ? "flex items-start justify-center"
                  : "flex items-start"
              }
            >
              {childClusters.map((cluster, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === nClusters - 1;
                const onlyCluster = nClusters === 1;
                const key =
                  cluster.map((c) => c.id).join("-") + `-${dataVersion}`;

                if (cluster.length === 1) {
                  const child = cluster[0];
                  return (
                    <div
                      key={key}
                      className="flex flex-col items-center px-1.5"
                    >
                      <div className="relative h-[2px] w-full -mx-1.5">
                        {!onlyCluster && (
                          <>
                            <div
                              className={`absolute top-0 left-0 right-1/2 h-[2px] ${
                                isFirst
                                  ? ""
                                  : "bg-neutral-500 dark:bg-neutral-400"
                              }`}
                            />
                            <div
                              className={`absolute top-0 left-1/2 right-0 h-[2px] ${
                                isLast
                                  ? ""
                                  : "bg-neutral-500 dark:bg-neutral-400"
                              }`}
                            />
                          </>
                        )}
                      </div>
                      <div className="h-4 w-[2px] shrink-0 rounded-sm bg-neutral-500 dark:bg-neutral-400" />
                      <FlowchartNode
                        node={child}
                        orgTree={orgTree}
                        onSelect={onSelect}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onAddUnder={onAddUnder}
                        onDrop={onDrop}
                        collapsedNodes={collapsedNodes}
                        toggleCollapse={toggleCollapse}
                        draggedId={draggedId}
                        setDraggedId={setDraggedId}
                        dataVersion={dataVersion}
                        orgLevels={orgLevels}
                        orgRoles={orgRoles}
                        peopleLookup={peopleLookup}
                        profileToGroup={profileToGroup}
                        groupMembers={groupMembers}
                        groupColors={groupColors}
                        onUngroup={onUngroup}
                        canEdit={canEdit}
                      />
                    </div>
                  );
                }

                const mergedDirects =
                  mergeDirectReportsForManagerCluster(cluster);
                const groupId = profileToGroup[cluster[0].id];
                const mergeCollapseKey = groupId
                  ? `__mgrgrp__${groupId}`
                  : `__mgrgrp__${cluster.map((c) => c.id).join("_")}`;
                const mergeCollapsed = collapsedNodes.has(mergeCollapseKey);

                return (
                  <div
                    key={key}
                    className={
                      onlyCluster
                        ? "flex w-max max-w-full flex-col items-center gap-0 px-1.5"
                        : "flex w-full min-w-0 max-w-full flex-col items-stretch px-1.5"
                    }
                  >
                    {/*
                    Put "Greg → T → Chad/Ryan" in a w-fit block only as wide as two cards.
                    If merged team lives in the *same* flex column, w-max includes the 5-wide row and the top bar stretches to that width.
                  */}
                    <div
                      className={
                        onlyCluster
                          ? "flex w-max max-w-full flex-col items-stretch"
                          : "flex w-full min-w-0 max-w-full flex-col items-stretch"
                      }
                    >
                      <div
                        className={`relative h-[2px] w-full ${
                          onlyCluster ? "" : "-mx-1.5"
                        }`}
                      >
                        {onlyCluster ? (
                          <div className="absolute inset-0 h-[2px] bg-neutral-500 dark:bg-neutral-400" />
                        ) : (
                          <>
                            <div
                              className={`absolute top-0 left-0 right-1/2 h-[2px] ${
                                isFirst
                                  ? ""
                                  : "bg-neutral-500 dark:bg-neutral-400"
                              }`}
                            />
                            <div
                              className={`absolute top-0 left-1/2 right-0 h-[2px] ${
                                isLast
                                  ? ""
                                  : "bg-neutral-500 dark:bg-neutral-400"
                              }`}
                            />
                          </>
                        )}
                      </div>
                      <div className="flex w-full min-w-0 flex-row items-start justify-center gap-0">
                        {cluster.map((child) => (
                          <div
                            key={child.id}
                            className="flex w-[200px] min-w-[160px] max-w-[200px] shrink-0 flex-col items-center"
                          >
                            <div className="h-4 w-[2px] shrink-0 rounded-sm bg-neutral-500 dark:bg-neutral-400" />
                            <FlowchartNode
                              node={child}
                              orgTree={orgTree}
                              onSelect={onSelect}
                              onEdit={onEdit}
                              onDelete={onDelete}
                              onAddUnder={onAddUnder}
                              onDrop={onDrop}
                              collapsedNodes={collapsedNodes}
                              toggleCollapse={toggleCollapse}
                              draggedId={draggedId}
                              setDraggedId={setDraggedId}
                              dataVersion={dataVersion}
                              orgLevels={orgLevels}
                              orgRoles={orgRoles}
                              peopleLookup={peopleLookup}
                              profileToGroup={profileToGroup}
                              groupMembers={groupMembers}
                              groupColors={groupColors}
                              onUngroup={onUngroup}
                              inManagerCluster
                              suppressSubtree
                              canEdit={canEdit}
                            />
                            {mergedDirects.length > 0 && !mergeCollapsed && (
                              <div className="h-4 w-[2px] shrink-0 rounded-sm bg-neutral-500 dark:bg-neutral-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {mergedDirects.length > 0 && (
                      <div
                        className={
                          onlyCluster
                            ? "relative -mt-px w-max min-w-0 max-w-full self-center"
                            : "relative -mt-px w-full min-w-0"
                        }
                      >
                        <button
                          type="button"
                          draggable={false}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            toggleCollapse(mergeCollapseKey);
                          }}
                          className="absolute -top-1 right-0 z-20 rounded-full border border-neutral-200 bg-white p-0.5 shadow hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800"
                          title={
                            mergeCollapsed ? "Expand team" : "Collapse team"
                          }
                        >
                          {mergeCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
                          )}
                        </button>
                        {!mergeCollapsed && (
                          <>
                            <div
                              className="grid w-full min-w-0 max-w-full gap-0"
                              style={{
                                gridTemplateColumns: `repeat(${mergedDirects.length}, minmax(160px, 200px))`,
                              }}
                            >
                              <div
                                className="h-[2px] bg-neutral-500 dark:bg-neutral-400"
                                style={{ gridColumn: "1 / -1" }}
                              />
                              {mergedDirects.map((sub) => {
                                return (
                                  <div
                                    key={`${sub.id}-${dataVersion}-mg`}
                                    className="flex min-w-0 flex-col items-center px-1.5"
                                  >
                                    <div className="h-4 w-[2px] shrink-0 rounded-sm bg-neutral-500 dark:bg-neutral-400" />
                                    <FlowchartNode
                                      node={sub}
                                      orgTree={orgTree}
                                      onSelect={onSelect}
                                      onEdit={onEdit}
                                      onDelete={onDelete}
                                      onAddUnder={onAddUnder}
                                      onDrop={onDrop}
                                      collapsedNodes={collapsedNodes}
                                      toggleCollapse={toggleCollapse}
                                      draggedId={draggedId}
                                      setDraggedId={setDraggedId}
                                      dataVersion={dataVersion}
                                      orgLevels={orgLevels}
                                      orgRoles={orgRoles}
                                      peopleLookup={peopleLookup}
                                      profileToGroup={profileToGroup}
                                      groupMembers={groupMembers}
                                      groupColors={groupColors}
                                      onUngroup={onUngroup}
                                      canEdit={canEdit}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
    </div>
  );
};

// ============================================================================
// Searchable Manager Picker
// ============================================================================
const ManagerPicker: React.FC<{
  people: OrgPerson[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  excludeId?: string;
  label?: string;
  helperText?: string;
}> = ({
  people,
  selectedIds,
  onChange,
  excludeId,
  label = "Reports to (search & select one or more)",
  helperText = "Leave empty to keep at top level.",
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => (excludeId ? p.id !== excludeId : true))
      .filter((p) => !selectedIds.includes(p.id))
      .filter((p) =>
        q === ""
          ? true
          : (p.full_name || "").toLowerCase().includes(q) ||
            (p.job_title || "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [people, query, selectedIds, excludeId]);

  const selected = selectedIds
    .map((id) => people.find((p) => p.id === id))
    .filter(Boolean) as OrgPerson[];

  return (
    <div ref={wrapperRef} className="relative">
      <Label>{label}</Label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 mb-1.5">
          {selected.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-[#f26722]/10 text-[#f26722] border border-[#f26722]/40 rounded-full"
            >
              {p.full_name}
              <button
                type="button"
                onClick={() =>
                  onChange(selectedIds.filter((id) => id !== p.id))
                }
                className="ml-0.5 hover:text-[#f26722]/70"
                aria-label={`Remove ${p.full_name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative mt-1.5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
        <Input
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder="Search by name or title..."
          className="pl-10"
        />
      </div>
      {isOpen && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 shadow-lg divide-y divide-neutral-100 dark:divide-neutral-700">
          {filtered.length === 0 ? (
            <p className="p-3 text-sm text-neutral-500">
              {query
                ? "No matches"
                : selected.length === people.length
                  ? "All options selected"
                  : "Start typing to search…"}
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(Array.from(new Set([...selectedIds, p.id])));
                  setQuery("");
                }}
                className="w-full flex items-center gap-2 p-2 text-sm text-left hover:bg-neutral-50 dark:hover:bg-neutral-700"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex-shrink-0">
                  {p.avatar_url ? (
                    <img
                      src={p.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-medium text-neutral-500">
                      {(p.full_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-neutral-900 dark:text-white">
                    {p.full_name}
                  </p>
                  {p.job_title && (
                    <p className="truncate text-xs text-neutral-500">
                      {p.job_title}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
      <p className="mt-1 text-xs text-neutral-500">{helperText}</p>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================
// Helper to get or create a default level
async function getOrCreateDefaultLevel(): Promise<string> {
  // First try to get existing levels
  const { data: levels } = await supabase
    .schema("common")
    .from("org_chart_levels")
    .select("id, label, display_order, color")
    .order("display_order", { ascending: true });

  if (levels && levels.length > 0) {
    // Return the first (lowest display_order) level as default
    return levels[0].id;
  }

  // No levels exist, create default ones
  const defaultLevels = [
    { label: "Executive", display_order: 0, tier: "executive" },
    { label: "Director", display_order: 1, tier: "director" },
    { label: "Manager", display_order: 2, tier: "manager" },
    { label: "Team Member", display_order: 3, tier: "staff" },
  ];

  const { data: newLevels, error } = await supabase
    .schema("common")
    .from("org_chart_levels")
    .insert(defaultLevels)
    .select("id, display_order")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("Error creating default levels:", error);
    throw new Error("Could not create org chart levels");
  }

  return newLevels[0].id;
}

export const OrgChart: React.FC = () => {
  const { user } = useAuth();
  const userRole = user?.user_metadata?.role || "";
  const canEdit = [
    "Admin",
    "Super Admin",
    "HR Representative",
    "HR Rep",
  ].includes(userRole);

  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [allEmployees, setAllEmployees] = useState<OrgPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isTopLevelDropOver, setIsTopLevelDropOver] = useState(false);
  const [orgLevels, setOrgLevels] = useState<
    Array<{ id: string; label: string; display_order: number; color?: string }>
  >([]);
  const [orgRoles, setOrgRoles] = useState<
    Array<{
      id: string;
      label: string;
      value: string;
      color: string;
      display_order: number;
    }>
  >([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newLevelLabel, setNewLevelLabel] = useState("");
  const [newLevelColor, setNewLevelColor] = useState("gray");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newRoleColor, setNewRoleColor] = useState("blue");
  const [dataVersion, setDataVersion] = useState(0); // Force re-render when data changes

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addUnderManagerId, setAddUnderManagerId] = useState<string | null>(
    null,
  );
  const [addLevelId, setAddLevelId] = useState<string | null>(null);
  const [addRole, setAddRole] = useState("");
  const [addManagerIds, setAddManagerIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<OrgPerson | null>(null);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editLevelId, setEditLevelId] = useState<string | null>(null);
  const [editManagerIds, setEditManagerIds] = useState<string[]>([]);

  // Manager groups: profile_id -> group_id, and group_id -> profile_id[]
  const [profileToGroup, setProfileToGroup] = useState<Record<string, string>>(
    {},
  );
  const [groupMembers, setGroupMembers] = useState<Record<string, string[]>>(
    {},
  );
  const [groupColors, setGroupColors] = useState<Record<string, string>>({});
  const [managerGroupsSupported, setManagerGroupsSupported] =
    useState<boolean>(true);

  // Drop choice dialog state (Group Together vs Move Under)
  const [dropDialogOpen, setDropDialogOpen] = useState(false);
  const [pendingDrop, setPendingDrop] = useState<{
    draggedId: string;
    targetId: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Pan (click-and-drag background) state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  // Global document listeners for reliable panning (mouseup/mousemove never get lost)
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      e.preventDefault();
      setPanOffset({
        x: panStartRef.current.offsetX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.offsetY + (e.clientY - panStartRef.current.y),
      });
    };

    const onMouseUp = () => {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      if (containerRef.current) {
        containerRef.current.style.cursor = "grab";
        containerRef.current.style.userSelect = "";
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Scroll-wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setZoom((z) => Math.max(0.2, Math.min(1.5, z + delta)));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handlePanMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('[draggable="true"]') ||
        target.closest("button") ||
        target.closest('[role="button"]') ||
        target.closest("a")
      )
        return;

      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX: panOffset.x,
        offsetY: panOffset.y,
      };
      if (containerRef.current) {
        containerRef.current.style.cursor = "grabbing";
        containerRef.current.style.userSelect = "none";
      }
    },
    [panOffset],
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Fetch data - simplified approach
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch org chart levels
      const { data: levelsData } = await supabase
        .schema("common")
        .from("org_chart_levels")
        .select("id, label, display_order, color")
        .order("display_order", { ascending: true });

      setOrgLevels(levelsData || []);

      // Fetch org chart roles (gracefully handle missing table)
      try {
        const { data: rolesData, error: rolesError } = await supabase
          .schema("common")
          .from("org_chart_roles")
          .select("id, label, value, color, display_order")
          .order("display_order", { ascending: true });

        if (!rolesError && rolesData) {
          setOrgRoles(rolesData);
        }
      } catch {
        // Table may not exist yet; fall back to defaults
      }

      // Get all users
      const { data: usersData } = await supabase
        .schema("common")
        .rpc("admin_get_users");
      const allUsers: any[] = usersData || [];
      const usersMap: Record<string, any> = {};
      allUsers.forEach((u) => {
        usersMap[u.id] = u;
      });

      // Get all profiles (for allEmployees list)
      const { data: profilesData } = await supabase
        .schema("common")
        .from("profiles")
        .select("id, full_name, job_title, avatar_url, profile_image");

      const profilesMap: Record<string, any> = {};
      (profilesData || []).forEach((p: any) => {
        profilesMap[p.id] = p;
      });

      // Get manager groups (gracefully handle missing tables)
      try {
        const [
          { data: groupsData, error: groupsError },
          { data: groupMembersData, error: groupMembersError },
        ] = await Promise.all([
          supabase
            .schema("common")
            .from("org_chart_manager_groups")
            .select("id, color"),
          supabase
            .schema("common")
            .from("org_chart_manager_group_members")
            .select("group_id, profile_id"),
        ]);

        if (groupsError || groupMembersError) {
          setManagerGroupsSupported(false);
          setProfileToGroup({});
          setGroupMembers({});
          setGroupColors({});
        } else {
          const colorMap: Record<string, string> = {};
          (groupsData || []).forEach((g: any) => {
            colorMap[g.id] = g.color || "orange";
          });

          const pToG: Record<string, string> = {};
          const gToP: Record<string, string[]> = {};
          (groupMembersData || []).forEach((m: any) => {
            pToG[m.profile_id] = m.group_id;
            if (!gToP[m.group_id]) gToP[m.group_id] = [];
            gToP[m.group_id].push(m.profile_id);
          });

          setProfileToGroup(pToG);
          setGroupMembers(gToP);
          setGroupColors(colorMap);
          setManagerGroupsSupported(true);
        }
      } catch {
        setManagerGroupsSupported(false);
      }

      // Get org chart assignments (level_id, role, reports_to)
      const { data: assignmentsData } = await supabase
        .schema("common")
        .from("org_chart_assignments")
        .select("profile_id, reports_to_profile_id, level_id, role");

      const assignmentsMap: Record<string, string | null> = {};
      const assignmentManagerIdsMap: Record<string, string[]> = {};
      const rolesMap: Record<string, string> = {};
      const levelsMap: Record<string, string | null> = {};
      const onChartIds = new Set<string>();
      (assignmentsData || []).forEach((a: any) => {
        if (!assignmentManagerIdsMap[a.profile_id]) {
          assignmentManagerIdsMap[a.profile_id] = [];
        }
        if (a.reports_to_profile_id) {
          assignmentManagerIdsMap[a.profile_id].push(a.reports_to_profile_id);
        }
        if (!(a.profile_id in rolesMap)) {
          rolesMap[a.profile_id] = a.role || "";
        }
        if (!(a.profile_id in levelsMap)) {
          levelsMap[a.profile_id] = a.level_id ?? null;
        }
        if (!(a.profile_id in assignmentsMap)) {
          assignmentsMap[a.profile_id] = a.reports_to_profile_id;
        }
        onChartIds.add(a.profile_id);
      });

      Object.entries(assignmentManagerIdsMap).forEach(
        ([profileId, managerIds]) => {
          assignmentsMap[profileId] = managerIds[0] || null;
        },
      );

      // Build allEmployees list (for add modal)
      // If admin_get_users returned data, merge with profiles; otherwise fall back to profiles only
      let employees: OrgPerson[];
      if (allUsers.length > 0) {
        employees = allUsers
          .filter((u: any) => {
            const email = (u.email || "").toLowerCase();
            return email.endsWith("@ampqes.com") || profilesMap[u.id];
          })
          .map((u: any) => {
            const profile = profilesMap[u.id];
            const avatarUrl =
              profile?.avatar_url ||
              profile?.profile_image ||
              u?.raw_user_meta_data?.profileImage ||
              u?.user_metadata?.profileImage ||
              u?.raw_user_meta_data?.avatar_url ||
              u?.user_metadata?.avatar_url ||
              null;
            return {
              id: u.id,
              full_name:
                profile?.full_name ||
                u.raw_user_meta_data?.name ||
                u.user_metadata?.name ||
                u.email?.split("@")[0] ||
                "Unknown",
              job_title: profile?.job_title || "",
              avatar_url: avatarUrl,
              reports_to: assignmentsMap[u.id] ?? null,
              reports_to_ids: assignmentManagerIdsMap[u.id] || [],
            };
          });
      } else {
        employees = (profilesData || []).map((p: any) => ({
          id: p.id,
          full_name: p.full_name || "Unknown",
          job_title: p.job_title || "",
          avatar_url: p.avatar_url || p.profile_image || null,
          reports_to: assignmentsMap[p.id] ?? null,
          reports_to_ids: assignmentManagerIdsMap[p.id] || [],
        }));
      }
      employees.sort((a, b) =>
        (a.full_name || "").localeCompare(b.full_name || ""),
      );

      setAllEmployees([...employees]);

      // Get job titles from employee history (most recent per person), with fallback to profiles.job_title
      const { data: jobHistoryData } = await supabase
        .schema("common")
        .from("job_title_history")
        .select("profile_id, title")
        .in("profile_id", Array.from(onChartIds))
        .order("effective_from", { ascending: false });
      const latestJobTitleByProfile: Record<string, string> = {};
      (jobHistoryData || []).forEach((row: any) => {
        if (!latestJobTitleByProfile[row.profile_id]) {
          latestJobTitleByProfile[row.profile_id] = row.title || "";
        }
      });

      // Build people on chart using profiles data first, then fill gaps from user metadata
      const chartPeople: OrgPerson[] = [];
      // For people whose name is missing from profiles, fetch from auth metadata via RPC
      const metadataMap: Record<string, any> = {};
      const idsNeedingMetadata = Array.from(onChartIds).filter((id) => {
        const p = profilesMap[id];
        return !p?.full_name;
      });
      // Batch fetch metadata for people missing names (only if admin_get_users didn't already provide it)
      if (idsNeedingMetadata.length > 0 && allUsers.length === 0) {
        const metaResults = await Promise.all(
          idsNeedingMetadata.map((id) =>
            supabase
              .schema("common")
              .rpc("get_user_metadata", { p_user_id: id })
              .then(({ data }) => ({ id, data }))
              .catch(() => ({ id, data: null })),
          ),
        );
        metaResults.forEach(({ id, data }) => {
          if (data) metadataMap[id] = data;
        });
      }

      for (const profileId of Array.from(onChartIds)) {
        const profile = profilesMap[profileId];
        const user = usersMap[profileId];
        const meta = metadataMap[profileId];
        const resolvedName =
          profile?.full_name ||
          user?.raw_user_meta_data?.name ||
          user?.user_metadata?.name ||
          meta?.name ||
          meta?.full_name ||
          user?.email?.split("@")[0] ||
          "Unknown";
        const jobTitle =
          latestJobTitleByProfile[profileId] || profile?.job_title || "";
        const avatarUrl =
          profile?.avatar_url ||
          profile?.profile_image ||
          user?.raw_user_meta_data?.profileImage ||
          user?.user_metadata?.profileImage ||
          meta?.profile_image ||
          meta?.avatar_url ||
          user?.raw_user_meta_data?.avatar_url ||
          user?.user_metadata?.avatar_url ||
          null;

        chartPeople.push({
          id: profileId,
          full_name: resolvedName,
          job_title: jobTitle,
          avatar_url: avatarUrl,
          reports_to: assignmentsMap[profileId] ?? null,
          reports_to_ids: assignmentManagerIdsMap[profileId] || [],
          role: rolesMap[profileId] || "",
          level_id: levelsMap[profileId] ?? null,
        });
      }

      setPeople([...chartPeople]);
      setDataVersion((v) => v + 1);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Error",
        description: e?.message || "Failed to load org chart",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Rebuild tree on every render to ensure fresh data (dataVersion forces parent re-render)
  const orgTree = buildOrgTree(people);
  const peopleLookup = useMemo(() => {
    const lookup: Record<string, OrgPerson> = {};
    people.forEach((person) => {
      lookup[person.id] = person;
    });
    return lookup;
  }, [people]);

  // Drop entry: top-level and leaf employees move immediately; only manager→manager shows Group vs Move.
  const handleDrop = (draggedPersonId: string, newManagerId: string | null) => {
    if (!newManagerId) {
      void handleMoveUnder(draggedPersonId, null);
      return;
    }
    const draggedInTree = findNodeById(orgTree, draggedPersonId);
    const draggedIsLeaf = !draggedInTree || draggedInTree.children.length === 0;
    if (draggedIsLeaf) {
      void handleMoveUnder(draggedPersonId, newManagerId);
      return;
    }
    setPendingDrop({ draggedId: draggedPersonId, targetId: newManagerId });
    setDropDialogOpen(true);
  };

  // "Move Under": standard reporting reassignment, group-aware for target.
  // If target is in a manager group, employee reports to every member of the group.
  const handleMoveUnder = async (
    draggedPersonId: string,
    newManagerId: string | null,
  ) => {
    const draggedPerson = people.find((p) => p.id === draggedPersonId);
    if (!draggedPerson) return;

    // Expand to full group if target is in one
    let targetManagerIds: string[] = [];
    if (newManagerId) {
      const groupId = profileToGroup[newManagerId];
      if (groupId && groupMembers[groupId]?.length) {
        targetManagerIds = groupMembers[groupId];
      } else {
        targetManagerIds = [newManagerId];
      }
    }

    const existingList =
      draggedPerson.reports_to_ids && draggedPerson.reports_to_ids.length > 0
        ? Array.from(new Set(draggedPerson.reports_to_ids.filter(Boolean)))
        : draggedPerson.reports_to
          ? [draggedPerson.reports_to]
          : [];
    const existing = existingList.sort();
    const proposed = [...targetManagerIds].sort();
    if (
      existing.length === proposed.length &&
      existing.every((id, i) => id === proposed[i])
    ) {
      toast({
        title: "No change",
        description: "Already reports to this manager",
      });
      setDraggedId(null);
      return;
    }

    setSaving(true);
    try {
      await replaceProfileOrgChartAssignments(
        draggedPersonId,
        newManagerId ? targetManagerIds : [],
        {
          level_id: draggedPerson.level_id ?? null,
          role: draggedPerson.role || null,
          grid_column: 0,
        },
      );

      const description =
        targetManagerIds.length === 0
          ? `${draggedPerson.full_name} moved to top level`
          : targetManagerIds.length === 1
            ? `${draggedPerson.full_name} now reports to ${people.find((p) => p.id === targetManagerIds[0])?.full_name || "manager"}`
            : `${draggedPerson.full_name} now reports to ${targetManagerIds.length} managers (group)`;

      toast({ title: "Moved", description, variant: "success" });
      await fetchData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setDraggedId(null);
    }
  };

  // "Group Together": add both managers to a shared manager group.
  const handleGroupTogether = async (a: string, b: string) => {
    if (!managerGroupsSupported) {
      toast({
        title: "Setup required",
        description:
          "Run enable_org_chart_manager_groups.sql in Supabase to enable grouping.",
        variant: "destructive",
      });
      setDraggedId(null);
      return;
    }
    if (a === b) return;

    setSaving(true);
    try {
      const groupA = profileToGroup[a];
      const groupB = profileToGroup[b];

      // Decide target group
      let targetGroupId = groupA || groupB || null;

      if (groupA && groupB && groupA !== groupB) {
        // Merge: move all members of groupA into groupB
        const { error: mergeError } = await supabase
          .schema("common")
          .from("org_chart_manager_group_members")
          .update({ group_id: groupB })
          .eq("group_id", groupA);
        if (mergeError) throw mergeError;

        // Delete empty group A
        await supabase
          .schema("common")
          .from("org_chart_manager_groups")
          .delete()
          .eq("id", groupA);

        targetGroupId = groupB;
      } else if (!targetGroupId) {
        // Create a new group
        const palette = [
          "orange",
          "teal",
          "purple",
          "green",
          "amber",
          "cyan",
          "red",
        ];
        const pickColor = palette[Math.floor(Math.random() * palette.length)];
        const { data: newGroup, error: newGroupError } = await supabase
          .schema("common")
          .from("org_chart_manager_groups")
          .insert({ color: pickColor })
          .select("id")
          .single();
        if (newGroupError || !newGroup)
          throw newGroupError || new Error("Could not create group");
        targetGroupId = newGroup.id;
      }

      // Add both members (idempotent via upsert on profile_id PK)
      const rows = [a, b].map((profile_id) => ({
        profile_id,
        group_id: targetGroupId,
      }));
      const { error: memberError } = await supabase
        .schema("common")
        .from("org_chart_manager_group_members")
        .upsert(rows, { onConflict: "profile_id" });
      if (memberError) throw memberError;

      const nameA = people.find((p) => p.id === a)?.full_name || "Manager";
      const nameB = people.find((p) => p.id === b)?.full_name || "Manager";
      toast({
        title: "Grouped",
        description: `${nameA} and ${nameB} now share reports. Assigning someone to either assigns them to both.`,
        variant: "success",
      });

      await fetchData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to group managers",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setDraggedId(null);
    }
  };

  const handleUngroup = async (profileId: string) => {
    if (!managerGroupsSupported) return;
    const groupId = profileToGroup[profileId];
    if (!groupId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .schema("common")
        .from("org_chart_manager_group_members")
        .delete()
        .eq("profile_id", profileId);
      if (error) throw error;

      // If group is now empty or has <2 members, delete it
      const remaining = (groupMembers[groupId] || []).filter(
        (id) => id !== profileId,
      );
      if (remaining.length < 2) {
        await supabase
          .schema("common")
          .from("org_chart_manager_group_members")
          .delete()
          .eq("group_id", groupId);
        await supabase
          .schema("common")
          .from("org_chart_manager_groups")
          .delete()
          .eq("id", groupId);
      }

      toast({ title: "Removed from group", variant: "success" });
      await fetchData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to leave group",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handlers
  const handleAddPerson = async () => {
    if (!selectedEmployeeId) {
      toast({
        title: "Select a person",
        description: "Please select an employee from the list first",
        variant: "destructive",
      });
      return;
    }

    const employee = allEmployees.find((e) => e.id === selectedEmployeeId);
    if (!employee) {
      toast({
        title: "Error",
        description: "Employee not found",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Level: use selected level or null (no level). Only create default levels if we need one and none exist.
      let levelId: string | null = addLevelId ?? null;
      if (levelId === null && orgLevels.length === 0) {
        // No levels at all – ensure at least one exists for display, but assignment can still have no level
        await getOrCreateDefaultLevel();
        const { data: newLevels } = await supabase
          .schema("common")
          .from("org_chart_levels")
          .select("id, label, display_order, color")
          .order("display_order", { ascending: true });
        setOrgLevels(newLevels || []);
      }

      // Ensure profile exists
      const { error: profileError } = await supabase
        .schema("common")
        .from("profiles")
        .upsert(
          {
            id: selectedEmployeeId,
            full_name: employee.full_name || null,
            job_title: employee.job_title || null,
            avatar_url: employee.avatar_url || null,
          },
          { onConflict: "id" },
        );

      if (profileError) {
        console.error("Profile upsert error:", profileError);
        // Continue anyway - profile might already exist
      }

      const selectedManagerIds = Array.from(
        new Set(addManagerIds.filter(Boolean)),
      );
      try {
        await replaceProfileOrgChartAssignments(
          selectedEmployeeId,
          selectedManagerIds,
          {
            level_id: levelId,
            role: addRole === "" ? null : addRole,
            grid_column: 0,
          },
        );
      } catch (assignmentError: any) {
        if (
          (assignmentError?.message || "").toLowerCase().includes("duplicate")
        ) {
          throw new Error(
            "This database may need the multi-manager org chart SQL migration. Run it, then try again.",
          );
        }
        throw assignmentError;
      }

      toast({
        title: "Added to chart",
        description: `${employee.full_name} has been added`,
        variant: "success",
      });
      setAddModalOpen(false);
      setSelectedEmployeeId(null);
      setAddUnderManagerId(null);
      setAddManagerIds([]);
      setAddLevelId(null);
      setAddRole("");
      setSearch("");
      await fetchData();
    } catch (e: any) {
      console.error("Add person error:", e);
      toast({
        title: "Error",
        description: e?.message || "Failed to add person to chart",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePerson = async (personId: string) => {
    if (!confirm("Remove this person from the org chart?")) return;

    setSaving(true);
    try {
      await supabase
        .schema("common")
        .from("org_chart_assignments")
        .delete()
        .eq("profile_id", personId);

      toast({ title: "Removed from chart", variant: "success" });
      await fetchData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to remove",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Level management functions
  const handleAddLevel = async () => {
    if (!newLevelLabel.trim()) return;

    setSaving(true);
    try {
      const newOrder =
        orgLevels.length > 0
          ? Math.max(...orgLevels.map((l) => l.display_order)) + 1
          : 0;

      const { error } = await supabase
        .schema("common")
        .from("org_chart_levels")
        .insert({
          label: newLevelLabel.trim(),
          display_order: newOrder,
          color: newLevelColor,
        });

      if (error) throw error;

      toast({ title: "Level added", variant: "success" });
      setNewLevelLabel("");
      setNewLevelColor("gray");
      await fetchData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to add level",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLevel = async (levelId: string) => {
    if (
      !confirm(
        "Delete this level? People assigned to it will need to be reassigned.",
      )
    )
      return;

    setSaving(true);
    try {
      const { error } = await supabase
        .schema("common")
        .from("org_chart_levels")
        .delete()
        .eq("id", levelId);

      if (error) throw error;

      toast({ title: "Level deleted", variant: "success" });
      await fetchData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to delete level",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLevelColor = async (levelId: string, color: string) => {
    try {
      const { error } = await supabase
        .schema("common")
        .from("org_chart_levels")
        .update({ color })
        .eq("id", levelId);

      if (error) throw error;

      setOrgLevels((prev) =>
        prev.map((l) => (l.id === levelId ? { ...l, color } : l)),
      );
      setDataVersion((v) => v + 1);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update color",
        variant: "destructive",
      });
    }
  };

  // Role management functions
  const handleAddRole = async () => {
    if (!newRoleLabel.trim()) return;
    const value = newRoleLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    if (!value) return;

    setSaving(true);
    try {
      const newOrder =
        orgRoles.length > 0
          ? Math.max(...orgRoles.map((r) => r.display_order)) + 1
          : 0;
      const { error } = await supabase
        .schema("common")
        .from("org_chart_roles")
        .insert({
          label: newRoleLabel.trim(),
          value,
          color: newRoleColor,
          display_order: newOrder,
        });

      if (error) throw error;

      toast({ title: "Role added", variant: "success" });
      setNewRoleLabel("");
      setNewRoleColor("blue");
      await fetchData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to add role",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (
      !confirm(
        "Delete this role? People assigned to it will keep their current role value until reassigned.",
      )
    )
      return;

    setSaving(true);
    try {
      const { error } = await supabase
        .schema("common")
        .from("org_chart_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;

      toast({ title: "Role deleted", variant: "success" });
      await fetchData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to delete role",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRoleColor = async (roleId: string, color: string) => {
    try {
      const { error } = await supabase
        .schema("common")
        .from("org_chart_roles")
        .update({ color })
        .eq("id", roleId);

      if (error) throw error;

      setOrgRoles((prev) =>
        prev.map((r) => (r.id === roleId ? { ...r, color } : r)),
      );
      setDataVersion((v) => v + 1);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update role color",
        variant: "destructive",
      });
    }
  };

  const openAddModal = (managerId: string | null = null) => {
    setAddUnderManagerId(managerId);
    setAddManagerIds(managerId ? [managerId] : []);
    setAddLevelId(null);
    setAddRole("");
    setSelectedEmployeeId(null);
    setSearch("");
    setAddModalOpen(true);
  };

  const openEditModal = (person: OrgPerson) => {
    setEditingPerson(person);
    setEditJobTitle(person.job_title || "");
    setEditRole(person.role || "");
    setEditLevelId(person.level_id || null);
    setEditManagerIds(
      person.reports_to_ids && person.reports_to_ids.length > 0
        ? person.reports_to_ids
        : person.reports_to
          ? [person.reports_to]
          : [],
    );
    setEditModalOpen(true);
  };

  const handleUpdatePerson = async () => {
    if (!editingPerson) return;

    setSaving(true);
    try {
      const userId = editingPerson.id;
      const newRole = editRole === "" ? null : editRole || null;
      const newLevelId = editLevelId || null;
      const managerIdsToSave = Array.from(
        new Set(editManagerIds.filter(Boolean)),
      );
      await replaceProfileOrgChartAssignments(userId, managerIdsToSave, {
        level_id: newLevelId,
        role: newRole,
        grid_column: 0,
      });

      // Update local state immediately for instant feedback
      setPeople((prev) =>
        prev.map((p) =>
          p.id === userId
            ? {
                ...p,
                role: newRole || "",
                level_id: newLevelId,
                reports_to: managerIdsToSave[0] || null,
                reports_to_ids: managerIdsToSave,
              }
            : p,
        ),
      );
      setDataVersion((v) => v + 1);

      toast({
        title: "Updated",
        description: `Updated ${editingPerson.full_name}`,
        variant: "success",
      });
      setEditModalOpen(false);
      setEditingPerson(null);
      setEditJobTitle("");
      setEditRole("");
      setEditLevelId(null);
      setEditManagerIds([]);

      // Refetch to ensure consistency
      await fetchData();
    } catch (e: any) {
      console.error("Update error:", e);
      toast({
        title: "Error",
        description: e?.message || "Failed to update",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const availableEmployees = allEmployees.filter(
    (e) =>
      !people.some((p) => p.id === e.id) &&
      (search.trim() === "" ||
        e.full_name.toLowerCase().includes(search.toLowerCase()) ||
        e.job_title.toLowerCase().includes(search.toLowerCase())),
  );

  // Top level drop zone handlers
  const handleTopLevelDragOver = (e: React.DragEvent) => {
    if (draggedId) {
      e.preventDefault();
      setIsTopLevelDropOver(true);
    }
  };

  const handleTopLevelDragLeave = () => {
    setIsTopLevelDropOver(false);
  };

  const handleTopLevelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsTopLevelDropOver(false);
    const draggedPersonId = e.dataTransfer.getData("text/plain");
    if (draggedPersonId) {
      handleDrop(draggedPersonId, null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Organization Chart
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {canEdit
              ? "Drag and drop people to rearrange the hierarchy"
              : "View your organization's structure"}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => openAddModal()}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Person
          </Button>
        )}
      </div>

      {/* Instructions */}
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        {canEdit && <GripVertical className="h-4 w-4" />}
        <span>
          {canEdit
            ? "Drag to reorganize: anyone with no one below them moves in one step; if you drag a manager, you choose Group or Under. Click & drag empty background to pan."
            : "Click a person to view their profile · Click & drag background to pan"}
        </span>
      </div>

      {/* Chart Card */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
          <CardTitle className="text-base font-medium">
            {people.length} people{" "}
            {saving && <Loader2 className="inline h-4 w-4 animate-spin ml-2" />}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-neutral-500 w-14 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resetView}
              title="Reset view"
            >
              Reset
            </Button>
            {canEdit && (
              <>
                <div className="w-px h-6 bg-neutral-200 mx-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  title="Manage levels & colors"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </CardHeader>

        {/* Levels & Roles Legend */}
        <div className="px-6 py-3 flex flex-wrap gap-3 items-center border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
          {orgLevels.length > 0 && (
            <>
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Levels:
              </span>
              {orgLevels.map((level) => {
                const colorStyle = getColorByName(level.color);
                return (
                  <span
                    key={level.id}
                    className={`text-xs px-2.5 py-1 rounded ${colorStyle.bg} ${colorStyle.text} ${colorStyle.border} border`}
                  >
                    {level.label}
                  </span>
                );
              })}
              <span className="text-xs text-neutral-300 mx-1">|</span>
            </>
          )}
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Roles:
          </span>
          {(orgRoles.length > 0 ? orgRoles : DEFAULT_ROLE_OPTIONS).map(
            (role) => (
              <span
                key={role.value}
                className={`text-xs px-2.5 py-1 rounded border ${getRoleColorFromPalette(role.color)}`}
              >
                {role.label}
              </span>
            ),
          )}
        </div>

        {/* Top level drop zone */}
        {canEdit && draggedId && (
          <div
            onDragOver={handleTopLevelDragOver}
            onDragLeave={handleTopLevelDragLeave}
            onDrop={handleTopLevelDrop}
            className={`
              mx-4 mt-4 p-4 border-2 border-dashed rounded-lg text-center transition-all
              ${
                isTopLevelDropOver
                  ? "border-[#f26722] bg-[#f26722]/10 text-[#f26722]"
                  : "border-neutral-300 dark:border-neutral-600 text-neutral-400"
              }
            `}
          >
            <span className="text-sm font-medium">
              Drop here to make top-level (no manager)
            </span>
          </div>
        )}

        <div
          ref={containerRef}
          className="p-6 bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-900 dark:to-neutral-800 relative"
          style={{
            backgroundImage:
              "radial-gradient(circle, #e5e7eb 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            minHeight: "calc(100vh - 300px)",
            maxHeight: "calc(100vh - 200px)",
            cursor: "grab",
            overflow: "hidden",
          }}
          onMouseDown={handlePanMouseDown}
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#f26722]" />
            </div>
          ) : people.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                <UserPlus className="h-10 w-10 text-neutral-400" />
              </div>
              <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
                No one on the org chart yet
              </h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                {canEdit
                  ? "Start by adding people to build your organization's structure"
                  : "The organization chart has not been set up yet"}
              </p>
              {canEdit && (
                <Button onClick={() => openAddModal()}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add First Person
                </Button>
              )}
            </div>
          ) : (
            <div
              ref={contentRef}
              className="flex justify-center pt-4 pb-8"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                transformOrigin: "top center",
              }}
            >
              <div className="flex gap-8" key={`tree-${dataVersion}`}>
                {orgTree.map((root) => (
                  <FlowchartNode
                    key={`${root.id}-${dataVersion}`}
                    node={root}
                    orgTree={orgTree}
                    onSelect={setProfileUserId}
                    onEdit={openEditModal}
                    onDelete={handleDeletePerson}
                    onAddUnder={openAddModal}
                    onDrop={handleDrop}
                    collapsedNodes={collapsedNodes}
                    toggleCollapse={toggleCollapse}
                    draggedId={draggedId}
                    setDraggedId={setDraggedId}
                    dataVersion={dataVersion}
                    orgLevels={orgLevels}
                    orgRoles={orgRoles}
                    peopleLookup={peopleLookup}
                    profileToGroup={profileToGroup}
                    groupMembers={groupMembers}
                    groupColors={groupColors}
                    onUngroup={handleUngroup}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Add Person Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {addUnderManagerId
                ? `Add report under ${people.find((p) => p.id === addUnderManagerId)?.full_name || "manager"}`
                : "Add Person to Chart"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Search employees</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or job title..."
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>
                Select a person ({availableEmployees.length} available)
              </Label>
              <div className="mt-1.5 max-h-72 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800">
                {availableEmployees.length === 0 ? (
                  <p className="p-4 text-sm text-neutral-500 text-center">
                    {search
                      ? "No matching employees found"
                      : "All employees are already on the chart"}
                  </p>
                ) : (
                  availableEmployees.slice(0, 50).map((emp) => {
                    const isSelected = selectedEmployeeId === emp.id;
                    return (
                      <div
                        key={emp.id}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setSelectedEmployeeId(isSelected ? null : emp.id)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSelectedEmployeeId(isSelected ? null : emp.id);
                          }
                        }}
                        className={`w-full flex items-center gap-3 p-3 text-left cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[#f26722]/10 ring-2 ring-inset ring-[#f26722]"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex-shrink-0">
                          {emp.avatar_url ? (
                            <img
                              src={emp.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                              draggable="false"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm font-medium text-neutral-500">
                              {(emp.full_name || "?")[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-neutral-900 dark:text-white truncate">
                            {emp.full_name}
                          </p>
                          {emp.job_title && (
                            <p className="text-xs text-neutral-500 truncate">
                              {emp.job_title}
                            </p>
                          )}
                        </div>
                        {isSelected && (
                          <div className="flex-shrink-0 text-[#f26722]">
                            <svg
                              className="h-5 w-5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <ManagerPicker
              people={people}
              selectedIds={addManagerIds}
              onChange={setAddManagerIds}
              helperText="Type to search. Leave empty to place at top level."
            />
            {orgLevels.length > 0 && (
              <div>
                <Label>Level (optional)</Label>
                <select
                  value={addLevelId ?? ""}
                  onChange={(e) => setAddLevelId(e.target.value || null)}
                  className="mt-1.5 w-full h-10 px-3 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                >
                  <option value="">No level</option>
                  {orgLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label>Role (optional)</Label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="mt-1.5 w-full h-10 px-3 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
              >
                <option value="">No Role</option>
                {(orgRoles.length > 0 ? orgRoles : DEFAULT_ROLE_OPTIONS).map(
                  (role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddPerson}
              disabled={saving || !selectedEmployeeId}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add to Chart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Person Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Level & Role</DialogTitle>
          </DialogHeader>
          {editingPerson && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex-shrink-0">
                  {editingPerson.avatar_url ? (
                    <img
                      src={editingPerson.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-medium text-neutral-500">
                      {(editingPerson.full_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">
                    {editingPerson.full_name}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {editingPerson.level_id &&
                      orgLevels.find(
                        (l) => l.id === editingPerson.level_id,
                      ) && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border ${getColorByName(orgLevels.find((l) => l.id === editingPerson.level_id)?.color).bg} ${getColorByName(orgLevels.find((l) => l.id === editingPerson.level_id)?.color).text} ${getColorByName(orgLevels.find((l) => l.id === editingPerson.level_id)?.color).border}`}
                        >
                          {
                            orgLevels.find(
                              (l) => l.id === editingPerson.level_id,
                            )?.label
                          }
                        </span>
                      )}
                    {editingPerson.role && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded border ${getRoleColor(editingPerson.role, orgRoles)}`}
                      >
                        {getRoleLabel(editingPerson.role, orgRoles)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {orgLevels.length > 0 && (
                <div>
                  <Label htmlFor="level">Level</Label>
                  <select
                    id="level"
                    value={editLevelId || ""}
                    onChange={(e) => setEditLevelId(e.target.value || null)}
                    className="mt-1.5 w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  >
                    <option value="">No level</option>
                    {orgLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="mt-1.5 w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                >
                  <option value="">No Role</option>
                  {(orgRoles.length > 0 ? orgRoles : DEFAULT_ROLE_OPTIONS).map(
                    (role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <ManagerPicker
                people={people}
                selectedIds={editManagerIds}
                onChange={setEditManagerIds}
                excludeId={editingPerson.id}
                helperText="Type to search. Leave empty to make this person top level."
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePerson} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Manage Levels & Colors
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Existing Levels */}
            <div>
              <Label className="text-sm font-medium">Current Levels</Label>
              <div className="mt-2 space-y-2">
                {orgLevels.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    No levels defined yet. Add one below.
                  </p>
                ) : (
                  orgLevels.map((level) => {
                    const colorStyle = getColorByName(level.color);
                    return (
                      <div
                        key={level.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${colorStyle.bg} ${colorStyle.border}`}
                      >
                        <span className={`font-medium ${colorStyle.text}`}>
                          {level.label}
                        </span>
                        <div className="flex items-center gap-2">
                          {/* Color picker */}
                          <div className="flex gap-1">
                            {COLOR_PALETTE.map((c) => (
                              <button
                                key={c.name}
                                onClick={() =>
                                  handleUpdateLevelColor(level.id, c.name)
                                }
                                className={`w-5 h-5 rounded-full ${c.preview} ${level.color === c.name ? "ring-2 ring-offset-1 ring-neutral-800" : ""}`}
                                title={c.name}
                              />
                            ))}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLevel(level.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Add New Level */}
            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <Label className="text-sm font-medium">Add New Level</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="e.g. Executive, Director, Manager..."
                  value={newLevelLabel}
                  onChange={(e) => setNewLevelLabel(e.target.value)}
                  className="flex-1"
                />
                <div className="flex gap-1 items-center">
                  {COLOR_PALETTE.slice(0, 5).map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setNewLevelColor(c.name)}
                      className={`w-6 h-6 rounded-full ${c.preview} ${newLevelColor === c.name ? "ring-2 ring-offset-1 ring-neutral-800" : ""}`}
                      title={c.name}
                    />
                  ))}
                </div>
                <Button
                  onClick={handleAddLevel}
                  disabled={!newLevelLabel.trim() || saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Role Management */}
            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <Label className="text-sm font-medium">Current Roles</Label>
              <div className="mt-2 space-y-2">
                {(orgRoles.length > 0 ? orgRoles : DEFAULT_ROLE_OPTIONS)
                  .length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    No roles defined yet. Add one below.
                  </p>
                ) : (
                  (orgRoles.length > 0
                    ? orgRoles
                    : DEFAULT_ROLE_OPTIONS.map((r, i) => ({
                        ...r,
                        id: r.value,
                        display_order: i,
                      }))
                  ).map((role) => {
                    const colorStyle = getColorByName(role.color);
                    return (
                      <div
                        key={role.id || role.value}
                        className={`flex items-center gap-2 p-2 rounded-md border ${colorStyle.border} ${colorStyle.bg}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {COLOR_PALETTE.map((c) => (
                              <button
                                key={c.name}
                                onClick={() =>
                                  orgRoles.length > 0
                                    ? handleUpdateRoleColor(role.id, c.name)
                                    : null
                                }
                                className={`w-4 h-4 rounded-full ${c.preview} ${role.color === c.name ? "ring-2 ring-offset-1 " + c.ring : "opacity-60 hover:opacity-100"}`}
                                title={c.name}
                                disabled={orgRoles.length === 0}
                              />
                            ))}
                          </div>
                        </div>
                        <span
                          className={`font-medium text-sm flex-1 ${colorStyle.text}`}
                        >
                          {role.label}
                        </span>
                        {orgRoles.length > 0 && (
                          <button
                            onClick={() => handleDeleteRole(role.id)}
                            className="text-red-400 hover:text-red-600 p-1"
                            title="Delete role"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Add New Role */}
            <div className="pt-2">
              <Label className="text-sm font-medium">Add New Role</Label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  placeholder="e.g. Inspector, Foreman"
                  value={newRoleLabel}
                  onChange={(e) => setNewRoleLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddRole()}
                  className="flex-1"
                />
                <div className="flex gap-1 items-center">
                  {COLOR_PALETTE.slice(0, 5).map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setNewRoleColor(c.name)}
                      className={`w-5 h-5 rounded-full ${c.preview} ${newRoleColor === c.name ? "ring-2 ring-offset-1 " + c.ring : "opacity-60 hover:opacity-100"}`}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={handleAddRole}
                  disabled={saving || !newRoleLabel.trim()}
                  className="bg-[#f26722] hover:bg-[#e55611] text-white"
                >
                  +
                </Button>
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Click the edit button on any person's card to assign them a
                role.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drop Choice Dialog: Group Together vs Move Under */}
      <Dialog
        open={dropDialogOpen}
        onOpenChange={(open) => {
          setDropDialogOpen(open);
          if (!open) {
            setPendingDrop(null);
            setDraggedId(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose relationship</DialogTitle>
          </DialogHeader>
          {pendingDrop &&
            (() => {
              const draggedP = people.find(
                (p) => p.id === pendingDrop.draggedId,
              );
              const targetP = people.find((p) => p.id === pendingDrop.targetId);
              const targetGroupId = profileToGroup[pendingDrop.targetId];
              const targetGroupSize = targetGroupId
                ? (groupMembers[targetGroupId] || []).length
                : 0;
              return (
                <div className="space-y-4 py-2">
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">
                    What should happen with{" "}
                    <span className="font-medium">
                      {draggedP?.full_name || "this person"}
                    </span>{" "}
                    and{" "}
                    <span className="font-medium">
                      {targetP?.full_name || "the target"}
                    </span>
                    ?
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      if (pendingDrop) {
                        void handleMoveUnder(
                          pendingDrop.draggedId,
                          pendingDrop.targetId,
                        );
                      }
                      setDropDialogOpen(false);
                      setPendingDrop(null);
                    }}
                    className="w-full text-left p-3 rounded-lg border border-neutral-300 dark:border-neutral-600 hover:border-[#f26722] hover:bg-[#f26722]/5"
                  >
                    <p className="font-medium text-neutral-900 dark:text-white">
                      Move Under
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {targetGroupSize > 1
                        ? `${draggedP?.full_name || "This person"} will report to all ${targetGroupSize} managers in ${targetP?.full_name}'s group.`
                        : `${draggedP?.full_name || "This person"} will report to ${targetP?.full_name || "the target"}.`}
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={!managerGroupsSupported}
                    onClick={() => {
                      if (pendingDrop) {
                        void handleGroupTogether(
                          pendingDrop.draggedId,
                          pendingDrop.targetId,
                        );
                      }
                      setDropDialogOpen(false);
                      setPendingDrop(null);
                    }}
                    className={`w-full text-left p-3 rounded-lg border border-neutral-300 dark:border-neutral-600 ${
                      managerGroupsSupported
                        ? "hover:border-[#f26722] hover:bg-[#f26722]/5"
                        : "opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <p className="font-medium text-neutral-900 dark:text-white">
                      Group Together
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {managerGroupsSupported
                        ? "Make them peers who share reports. Anyone dropped on either will report to both."
                        : "Run enable_org_chart_manager_groups.sql to enable grouping."}
                    </p>
                  </button>
                </div>
              );
            })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDropDialogOpen(false);
                setPendingDrop(null);
                setDraggedId(null);
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile View */}
      <ProfileView
        isOpen={!!profileUserId}
        onClose={() => setProfileUserId(null)}
        userId={profileUserId ?? undefined}
      />
    </div>
  );
};
