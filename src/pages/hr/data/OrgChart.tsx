import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import { Plus, Trash2, Loader2, Search, UserPlus, ZoomIn, ZoomOut, ChevronDown, ChevronRight, GripVertical, Edit2, Settings, Palette } from 'lucide-react';
import { toast } from '../../../components/ui/toast';
import { supabase } from '../../../lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { ProfileView } from '../../../components/profile/ProfileView';
import { useAuth } from '../../../lib/AuthContext';

// Types
interface OrgPerson {
  id: string;
  full_name: string;
  job_title: string;
  avatar_url: string | null;
  reports_to: string | null;
  role?: string;
  level_id?: string | null;
}

interface OrgNode extends OrgPerson {
  children: OrgNode[];
  level: number;
}

// Fallback role options if the database table doesn't exist yet
const DEFAULT_ROLE_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: 'team_member', label: 'Team Member', color: 'blue' },
  { value: 'fire_team_lead', label: 'Fire Team Lead', color: 'red' },
  { value: 'office_admin', label: 'Office Admin', color: 'purple' },
  { value: 'technician', label: 'Technician', color: 'green' },
];

const getRoleColorFromPalette = (colorName?: string) => {
  const c = COLOR_PALETTE.find(p => p.name === colorName) || COLOR_PALETTE[COLOR_PALETTE.length - 1];
  return `${c.bg} ${c.text} ${c.border}`;
};

const getRoleColor = (role?: string, dynamicRoles?: Array<{ value: string; color: string }>) => {
  if (!role) return 'bg-gray-100 text-gray-600 border-gray-300';
  if (dynamicRoles && dynamicRoles.length > 0) {
    const found = dynamicRoles.find(r => r.value === role);
    if (found) return getRoleColorFromPalette(found.color);
  }
  const fallback = DEFAULT_ROLE_OPTIONS.find(r => r.value === role);
  if (fallback) return getRoleColorFromPalette(fallback.color);
  return 'bg-gray-100 text-gray-600 border-gray-300';
};

const getRoleLabel = (role?: string, dynamicRoles?: Array<{ value: string; label: string }>) => {
  if (!role) return '';
  if (dynamicRoles && dynamicRoles.length > 0) {
    const found = dynamicRoles.find(r => r.value === role);
    if (found) return found.label;
  }
  const fallback = DEFAULT_ROLE_OPTIONS.find(r => r.value === role);
  return fallback?.label || role;
};

// Color palette for levels
const COLOR_PALETTE = [
  { name: 'pink', bg: 'bg-pink-200', border: 'border-pink-300', text: 'text-pink-900', ring: 'ring-pink-400', preview: 'bg-pink-400' },
  { name: 'teal', bg: 'bg-teal-200', border: 'border-teal-300', text: 'text-teal-900', ring: 'ring-teal-400', preview: 'bg-teal-400' },
  { name: 'amber', bg: 'bg-amber-200', border: 'border-amber-300', text: 'text-amber-900', ring: 'ring-amber-400', preview: 'bg-amber-400' },
  { name: 'blue', bg: 'bg-blue-200', border: 'border-blue-300', text: 'text-blue-900', ring: 'ring-blue-400', preview: 'bg-blue-400' },
  { name: 'purple', bg: 'bg-purple-200', border: 'border-purple-300', text: 'text-purple-900', ring: 'ring-purple-400', preview: 'bg-purple-400' },
  { name: 'green', bg: 'bg-green-200', border: 'border-green-300', text: 'text-green-900', ring: 'ring-green-400', preview: 'bg-green-400' },
  { name: 'red', bg: 'bg-red-200', border: 'border-red-300', text: 'text-red-900', ring: 'ring-red-400', preview: 'bg-red-400' },
  { name: 'orange', bg: 'bg-orange-200', border: 'border-orange-300', text: 'text-orange-900', ring: 'ring-orange-400', preview: 'bg-orange-400' },
  { name: 'cyan', bg: 'bg-cyan-200', border: 'border-cyan-300', text: 'text-cyan-900', ring: 'ring-cyan-400', preview: 'bg-cyan-400' },
  { name: 'gray', bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-900', ring: 'ring-gray-400', preview: 'bg-gray-400' },
];

const getColorByName = (colorName?: string) => {
  return COLOR_PALETTE.find(c => c.name === colorName) || COLOR_PALETTE[COLOR_PALETTE.length - 1];
};

// Default fallback level colors by index
const LEVEL_COLORS: Record<number, { bg: string; border: string; text: string; ring: string }> = {
  0: { bg: 'bg-pink-200', border: 'border-pink-300', text: 'text-pink-900', ring: 'ring-pink-400' },
  1: { bg: 'bg-teal-200', border: 'border-teal-300', text: 'text-teal-900', ring: 'ring-teal-400' },
  2: { bg: 'bg-amber-200', border: 'border-amber-300', text: 'text-amber-900', ring: 'ring-amber-400' },
  3: { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-900', ring: 'ring-gray-400' },
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
    if (!addedAsChild.has(p.id) && !roots.some(r => r.id === p.id)) {
      const node = map.get(p.id)!;
      roots.push(node);
    }
  });

  const assignLevels = (nodes: OrgNode[], level: number, visited: Set<string> = new Set()) => {
    nodes.forEach((n) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      n.level = level;
      assignLevels(n.children, level + 1, visited);
    });
  };
  assignLevels(roots, 0);

  const sortChildren = (nodes: OrgNode[], visited: Set<string> = new Set()) => {
    nodes.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
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
  orgRoles?: Array<{ id: string; value: string; label: string; color: string; display_order: number }>;
  canEdit?: boolean;
}> = ({ node, orgTree, onSelect, onEdit, onDelete, onAddUnder, onDrop, collapsedNodes, toggleCollapse, draggedId, setDraggedId, dataVersion = 0, orgLevels, orgRoles, canEdit = true }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  // Use assigned level color if set, otherwise depth-based
  const assignedLevel = node.level_id && orgLevels ? orgLevels.find(l => l.id === node.level_id) : null;
  const colors = assignedLevel ? getColorByName(assignedLevel.color) : getLevelColors(node.level, orgLevels);
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedNodes.has(node.id);
  const isRoot = node.level === 0;

  const initials = (node.full_name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
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
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
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
      e.dataTransfer.dropEffect = 'move';
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
    const droppedId = e.dataTransfer.getData('text/plain');
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
              <img src={node.avatar_url} alt="" className="w-full h-full object-cover" draggable="false" />
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
        style={{ userSelect: 'none' }}
        className={`
          relative group rounded-lg border-2 shadow-sm select-none
          transition-all duration-200
          ${colors.bg} ${colors.border}
          min-w-[160px] max-w-[200px]
          ${isDragging ? 'opacity-50 scale-95 cursor-grabbing' : canEdit ? 'cursor-grab hover:shadow-md hover:scale-[1.02]' : 'cursor-pointer hover:shadow-md hover:scale-[1.02]'}
          ${isDragOver && isValidDropTarget ? `ring-4 ${colors.ring} ring-opacity-60 scale-105` : ''}
          ${draggedId && !isValidDropTarget && draggedId !== node.id ? 'opacity-40' : ''}
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
            <GripVertical className="h-4 w-4 text-gray-500" />
          </div>
        )}

        {/* Edit & Delete buttons */}
        {canEdit && (
          <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-auto flex gap-1">
            <button
              draggable="false"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(node); }}
              className="p-1.5 rounded-full bg-white shadow-md border border-gray-200 hover:bg-blue-50"
              title="Edit title"
            >
              <Edit2 className="h-3 w-3 text-gray-600 hover:text-blue-500" />
            </button>
            <button
              draggable="false"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(node.id); }}
              className="p-1.5 rounded-full bg-white shadow-md border border-gray-200 hover:bg-red-50"
              title="Remove from chart"
            >
              <Trash2 className="h-3 w-3 text-gray-600 hover:text-red-500" />
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
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ring-2 ring-white dark:ring-gray-600">
                {node.avatar_url ? (
                  <img src={node.avatar_url} alt="" className="w-full h-full object-cover" draggable="false" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-gray-500 dark:text-gray-300">
                    {initials}
                  </div>
                )}
              </div>
            </div>
          )}
          <h3 className={`font-semibold text-sm leading-tight ${colors.text}`}>
            {node.full_name || 'Unknown'}
          </h3>
          {node.job_title && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate px-1">
              {node.job_title}
            </p>
          )}
          <div className="flex flex-wrap gap-1 justify-center mt-1">
            {assignedLevel && (
              <span className={`text-xs px-1.5 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                {assignedLevel.label}
              </span>
            )}
            {node.role && (
              <span className={`text-xs px-1.5 py-0.5 rounded border ${getRoleColor(node.role, orgRoles)}`}>
                {getRoleLabel(node.role, orgRoles)}
              </span>
            )}
          </div>
        </div>

        {/* Collapse toggle */}
        {hasChildren && (
          <button
            draggable="false"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleCollapse(node.id); }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 p-0.5 rounded-full bg-white shadow border border-gray-200 hover:bg-gray-50 z-10 pointer-events-auto"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
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
          className="mt-4 text-xs text-gray-400 hover:text-[#f26722] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      )}

      {/* Connector line down */}
      {hasChildren && !isCollapsed && (
        <div className="w-px h-8 bg-gray-300 dark:bg-gray-600" />
      )}

      {/* Children row */}
      {hasChildren && !isCollapsed && (
        <div className="relative">
          {node.children.length > 1 && (
            <div 
              className="absolute top-0 left-0 right-0 h-px bg-gray-300 dark:bg-gray-600"
              style={{
                left: `calc(50% / ${node.children.length})`,
                right: `calc(50% / ${node.children.length})`,
              }}
            />
          )}

          <div className="flex gap-4">
            {node.children.map((child) => (
              <div key={`${child.id}-${dataVersion}`} className="flex flex-col items-center">
                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
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
                  canEdit={canEdit}
                />
              </div>
            ))}
          </div>
        </div>
      )}
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
    .schema('common')
    .from('org_chart_levels')
    .select('id, label, display_order, color')
    .order('display_order', { ascending: true });

  if (levels && levels.length > 0) {
    // Return the first (lowest display_order) level as default
    return levels[0].id;
  }

  // No levels exist, create default ones
  const defaultLevels = [
    { label: 'Executive', display_order: 0, tier: 'executive' },
    { label: 'Director', display_order: 1, tier: 'director' },
    { label: 'Manager', display_order: 2, tier: 'manager' },
    { label: 'Team Member', display_order: 3, tier: 'staff' },
  ];

  const { data: newLevels, error } = await supabase
    .schema('common')
    .from('org_chart_levels')
    .insert(defaultLevels)
    .select('id, display_order')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error creating default levels:', error);
    throw new Error('Could not create org chart levels');
  }

  return newLevels[0].id;
}

export const OrgChart: React.FC = () => {
  const { user } = useAuth();
  const userRole = user?.user_metadata?.role || '';
  const canEdit = ['Admin', 'Super Admin', 'HR Representative', 'HR Rep'].includes(userRole);

  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [allEmployees, setAllEmployees] = useState<OrgPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isTopLevelDropOver, setIsTopLevelDropOver] = useState(false);
  const [orgLevels, setOrgLevels] = useState<Array<{ id: string; label: string; display_order: number; color?: string }>>([]);
  const [orgRoles, setOrgRoles] = useState<Array<{ id: string; label: string; value: string; color: string; display_order: number }>>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newLevelLabel, setNewLevelLabel] = useState('');
  const [newLevelColor, setNewLevelColor] = useState('gray');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('blue');
  const [dataVersion, setDataVersion] = useState(0); // Force re-render when data changes

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addUnderManagerId, setAddUnderManagerId] = useState<string | null>(null);
  const [addLevelId, setAddLevelId] = useState<string | null>(null);
  const [addRole, setAddRole] = useState('');
  const [search, setSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<OrgPerson | null>(null);
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editLevelId, setEditLevelId] = useState<string | null>(null);

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
        containerRef.current.style.cursor = 'grab';
        containerRef.current.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
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
        setZoom(z => Math.max(0.2, Math.min(1.5, z + delta)));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handlePanMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('[draggable="true"]') ||
      target.closest('button') ||
      target.closest('[role="button"]') ||
      target.closest('a')
    ) return;

    e.preventDefault();
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY, offsetX: panOffset.x, offsetY: panOffset.y };
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grabbing';
      containerRef.current.style.userSelect = 'none';
    }
  }, [panOffset]);

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
        .schema('common')
        .from('org_chart_levels')
        .select('id, label, display_order, color')
        .order('display_order', { ascending: true });
      
      setOrgLevels(levelsData || []);

      // Fetch org chart roles (gracefully handle missing table)
      try {
        const { data: rolesData, error: rolesError } = await supabase
          .schema('common')
          .from('org_chart_roles')
          .select('id, label, value, color, display_order')
          .order('display_order', { ascending: true });
        
        if (!rolesError && rolesData) {
          setOrgRoles(rolesData);
        }
      } catch {
        // Table may not exist yet; fall back to defaults
      }

      // Get all users
      const { data: usersData } = await supabase.schema('common').rpc('admin_get_users');
      const allUsers: any[] = usersData || [];
      const usersMap: Record<string, any> = {};
      allUsers.forEach(u => { usersMap[u.id] = u; });

      // Get all profiles (for allEmployees list)
      const { data: profilesData } = await supabase
        .schema('common')
        .from('profiles')
        .select('id, full_name, job_title, avatar_url, profile_image');

      const profilesMap: Record<string, any> = {};
      (profilesData || []).forEach((p: any) => { 
        profilesMap[p.id] = p; 
      });

      // Get org chart assignments (level_id, role, reports_to)
      const { data: assignmentsData } = await supabase
        .schema('common')
        .from('org_chart_assignments')
        .select('profile_id, reports_to_profile_id, level_id, role');

      const assignmentsMap: Record<string, string | null> = {};
      const rolesMap: Record<string, string> = {};
      const levelsMap: Record<string, string | null> = {};
      const onChartIds: string[] = [];
      (assignmentsData || []).forEach((a: any) => {
        assignmentsMap[a.profile_id] = a.reports_to_profile_id;
        rolesMap[a.profile_id] = a.role || '';
        levelsMap[a.profile_id] = a.level_id ?? null;
        onChartIds.push(a.profile_id);
      });

      // Build allEmployees list (for add modal)
      // If admin_get_users returned data, merge with profiles; otherwise fall back to profiles only
      let employees: OrgPerson[];
      if (allUsers.length > 0) {
        employees = allUsers
          .filter((u: any) => {
            const email = (u.email || '').toLowerCase();
            return email.endsWith('@ampqes.com') || profilesMap[u.id];
          })
          .map((u: any) => {
            const profile = profilesMap[u.id];
            const avatarUrl = profile?.avatar_url || profile?.profile_image
              || u?.raw_user_meta_data?.profileImage || u?.user_metadata?.profileImage
              || u?.raw_user_meta_data?.avatar_url || u?.user_metadata?.avatar_url || null;
            return {
              id: u.id,
              full_name: profile?.full_name || u.raw_user_meta_data?.name || u.user_metadata?.name || u.email?.split('@')[0] || 'Unknown',
              job_title: profile?.job_title || '',
              avatar_url: avatarUrl,
              reports_to: assignmentsMap[u.id] ?? null,
            };
          });
      } else {
        employees = (profilesData || []).map((p: any) => ({
          id: p.id,
          full_name: p.full_name || 'Unknown',
          job_title: p.job_title || '',
          avatar_url: p.avatar_url || p.profile_image || null,
          reports_to: assignmentsMap[p.id] ?? null,
        }));
      }
      employees.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

      setAllEmployees([...employees]);

      // Get job titles from employee history (most recent per person), with fallback to profiles.job_title
      const { data: jobHistoryData } = await supabase
        .schema('common')
        .from('job_title_history')
        .select('profile_id, title')
        .in('profile_id', onChartIds)
        .order('effective_from', { ascending: false });
      const latestJobTitleByProfile: Record<string, string> = {};
      (jobHistoryData || []).forEach((row: any) => {
        if (!latestJobTitleByProfile[row.profile_id]) {
          latestJobTitleByProfile[row.profile_id] = row.title || '';
        }
      });

      // Build people on chart using profiles data first, then fill gaps from user metadata
      const chartPeople: OrgPerson[] = [];
      // For people whose name is missing from profiles, fetch from auth metadata via RPC
      const metadataMap: Record<string, any> = {};
      const idsNeedingMetadata = onChartIds.filter(id => {
        const p = profilesMap[id];
        return !p?.full_name;
      });
      // Batch fetch metadata for people missing names (only if admin_get_users didn't already provide it)
      if (idsNeedingMetadata.length > 0 && allUsers.length === 0) {
        const metaResults = await Promise.all(
          idsNeedingMetadata.map(id =>
            supabase.schema('common').rpc('get_user_metadata', { p_user_id: id }).then(({ data }) => ({ id, data })).catch(() => ({ id, data: null }))
          )
        );
        metaResults.forEach(({ id, data }) => { if (data) metadataMap[id] = data; });
      }

      for (const profileId of onChartIds) {
        const profile = profilesMap[profileId];
        const user = usersMap[profileId];
        const meta = metadataMap[profileId];
        const resolvedName = profile?.full_name || user?.raw_user_meta_data?.name || user?.user_metadata?.name || meta?.name || meta?.full_name || user?.email?.split('@')[0] || 'Unknown';
        const jobTitle = latestJobTitleByProfile[profileId] || profile?.job_title || '';
        const avatarUrl = profile?.avatar_url || profile?.profile_image
          || user?.raw_user_meta_data?.profileImage || user?.user_metadata?.profileImage
          || meta?.profile_image || meta?.avatar_url
          || user?.raw_user_meta_data?.avatar_url || user?.user_metadata?.avatar_url || null;
        
        chartPeople.push({
          id: profileId,
          full_name: resolvedName,
          job_title: jobTitle,
          avatar_url: avatarUrl,
          reports_to: assignmentsMap[profileId] ?? null,
          role: rolesMap[profileId] || '',
          level_id: levelsMap[profileId] ?? null,
        });
      }

      setPeople([...chartPeople]);
      setDataVersion(v => v + 1);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Error', description: e?.message || 'Failed to load org chart', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Rebuild tree on every render to ensure fresh data (dataVersion forces parent re-render)
  const orgTree = buildOrgTree(people);

  // Handle drop - update reporting structure
  const handleDrop = async (draggedPersonId: string, newManagerId: string | null) => {
    const draggedPerson = people.find(p => p.id === draggedPersonId);
    if (!draggedPerson) return;

    // Check if it's actually a change
    if (draggedPerson.reports_to === newManagerId) {
      toast({ title: 'No change', description: 'Already reports to this person' });
      return;
    }

    setSaving(true);
    try {
      await supabase
        .schema('common')
        .from('org_chart_assignments')
        .update({ reports_to_profile_id: newManagerId })
        .eq('profile_id', draggedPersonId);

      const managerName = newManagerId 
        ? people.find(p => p.id === newManagerId)?.full_name || 'manager'
        : 'top level';
      
      toast({ 
        title: 'Moved', 
        description: `${draggedPerson.full_name} now reports to ${managerName}`,
        variant: 'success' 
      });
      await fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to update', variant: 'destructive' });
    } finally {
      setSaving(false);
      setDraggedId(null);
    }
  };

  // Handlers
  const handleAddPerson = async () => {
    if (!selectedEmployeeId) {
      toast({ title: 'Select a person', description: 'Please select an employee from the list first', variant: 'destructive' });
      return;
    }

    const employee = allEmployees.find((e) => e.id === selectedEmployeeId);
    if (!employee) {
      toast({ title: 'Error', description: 'Employee not found', variant: 'destructive' });
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
          .schema('common')
          .from('org_chart_levels')
          .select('id, label, display_order, color')
          .order('display_order', { ascending: true });
        setOrgLevels(newLevels || []);
      }

      // Ensure profile exists
      const { error: profileError } = await supabase
        .schema('common')
        .from('profiles')
        .upsert({
          id: selectedEmployeeId,
          full_name: employee.full_name || null,
          job_title: employee.job_title || null,
          avatar_url: employee.avatar_url || null,
        }, { onConflict: 'id' });

      if (profileError) {
        console.error('Profile upsert error:', profileError);
        // Continue anyway - profile might already exist
      }

      // Create org chart assignment (level_id and role can be null)
      const { error: assignmentError } = await supabase
        .schema('common')
        .from('org_chart_assignments')
        .upsert({
          profile_id: selectedEmployeeId,
          reports_to_profile_id: addUnderManagerId,
          level_id: levelId,
          role: addRole === '' ? null : addRole,
          grid_column: 0,
        }, { onConflict: 'profile_id' });

      if (assignmentError) {
        throw assignmentError;
      }

      toast({ title: 'Added to chart', description: `${employee.full_name} has been added`, variant: 'success' });
      setAddModalOpen(false);
      setSelectedEmployeeId(null);
      setAddUnderManagerId(null);
      setAddLevelId(null);
      setAddRole('');
      setSearch('');
      await fetchData();
    } catch (e: any) {
      console.error('Add person error:', e);
      toast({ title: 'Error', description: e?.message || 'Failed to add person to chart', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePerson = async (personId: string) => {
    if (!confirm('Remove this person from the org chart?')) return;
    
    setSaving(true);
    try {
      await supabase
        .schema('common')
        .from('org_chart_assignments')
        .delete()
        .eq('profile_id', personId);

      toast({ title: 'Removed from chart', variant: 'success' });
      await fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to remove', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Level management functions
  const handleAddLevel = async () => {
    if (!newLevelLabel.trim()) return;
    
    setSaving(true);
    try {
      const newOrder = orgLevels.length > 0 ? Math.max(...orgLevels.map(l => l.display_order)) + 1 : 0;
      
      const { error } = await supabase
        .schema('common')
        .from('org_chart_levels')
        .insert({
          label: newLevelLabel.trim(),
          display_order: newOrder,
          color: newLevelColor,
        });

      if (error) throw error;

      toast({ title: 'Level added', variant: 'success' });
      setNewLevelLabel('');
      setNewLevelColor('gray');
      await fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to add level', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLevel = async (levelId: string) => {
    if (!confirm('Delete this level? People assigned to it will need to be reassigned.')) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .schema('common')
        .from('org_chart_levels')
        .delete()
        .eq('id', levelId);

      if (error) throw error;

      toast({ title: 'Level deleted', variant: 'success' });
      await fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to delete level', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLevelColor = async (levelId: string, color: string) => {
    try {
      const { error } = await supabase
        .schema('common')
        .from('org_chart_levels')
        .update({ color })
        .eq('id', levelId);

      if (error) throw error;

      setOrgLevels(prev => prev.map(l => l.id === levelId ? { ...l, color } : l));
      setDataVersion(v => v + 1);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to update color', variant: 'destructive' });
    }
  };

  // Role management functions
  const handleAddRole = async () => {
    if (!newRoleLabel.trim()) return;
    const value = newRoleLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!value) return;

    setSaving(true);
    try {
      const newOrder = orgRoles.length > 0 ? Math.max(...orgRoles.map(r => r.display_order)) + 1 : 0;
      const { error } = await supabase
        .schema('common')
        .from('org_chart_roles')
        .insert({ label: newRoleLabel.trim(), value, color: newRoleColor, display_order: newOrder });

      if (error) throw error;

      toast({ title: 'Role added', variant: 'success' });
      setNewRoleLabel('');
      setNewRoleColor('blue');
      await fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to add role', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Delete this role? People assigned to it will keep their current role value until reassigned.')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .schema('common')
        .from('org_chart_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;

      toast({ title: 'Role deleted', variant: 'success' });
      await fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to delete role', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRoleColor = async (roleId: string, color: string) => {
    try {
      const { error } = await supabase
        .schema('common')
        .from('org_chart_roles')
        .update({ color })
        .eq('id', roleId);

      if (error) throw error;

      setOrgRoles(prev => prev.map(r => r.id === roleId ? { ...r, color } : r));
      setDataVersion(v => v + 1);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to update role color', variant: 'destructive' });
    }
  };

  const openAddModal = (managerId: string | null = null) => {
    setAddUnderManagerId(managerId);
    setAddLevelId(null);
    setAddRole('');
    setSelectedEmployeeId(null);
    setSearch('');
    setAddModalOpen(true);
  };

  const openEditModal = (person: OrgPerson) => {
    setEditingPerson(person);
    setEditJobTitle(person.job_title || '');
    setEditRole(person.role || '');
    setEditLevelId(person.level_id || null);
    setEditModalOpen(true);
  };

  const handleUpdatePerson = async () => {
    if (!editingPerson) return;

    setSaving(true);
    try {
      const userId = editingPerson.id;
      const newRole = editRole === '' ? null : (editRole || null);
      const newLevelId = editLevelId || null;
      
      // Update level and role in org_chart_assignments (level_id and role can both be null)
      const updatePayload: { role?: string | null; level_id?: string | null } = { role: newRole, level_id: newLevelId };

      const { error } = await supabase
        .schema('common')
        .from('org_chart_assignments')
        .update(updatePayload)
        .eq('profile_id', userId);

      if (error) throw error;

      // Update local state immediately for instant feedback
      setPeople(prev => prev.map(p => 
        p.id === userId ? { ...p, role: newRole || '', level_id: newLevelId } : p
      ));
      setDataVersion(v => v + 1);

      toast({ title: 'Updated', description: `Updated ${editingPerson.full_name}`, variant: 'success' });
      setEditModalOpen(false);
      setEditingPerson(null);
      setEditJobTitle('');
      setEditRole('');
      setEditLevelId(null);
      
      // Refetch to ensure consistency
      await fetchData();
    } catch (e: any) {
      console.error('Update error:', e);
      toast({ title: 'Error', description: e?.message || 'Failed to update', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const availableEmployees = allEmployees.filter(
    (e) => !people.some((p) => p.id === e.id) &&
    (search.trim() === '' || 
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.job_title.toLowerCase().includes(search.toLowerCase()))
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
    const draggedPersonId = e.dataTransfer.getData('text/plain');
    if (draggedPersonId) {
      handleDrop(draggedPersonId, null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Organization Chart</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {canEdit ? 'Drag and drop people to rearrange the hierarchy' : 'View your organization\'s structure'}
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
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {canEdit && <GripVertical className="h-4 w-4" />}
        <span>{canEdit ? 'Drag cards to rearrange · Click & drag background to pan' : 'Click a person to view their profile · Click & drag background to pan'}</span>
      </div>

      {/* Chart Card */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <CardTitle className="text-base font-medium">
            {people.length} people {saving && <Loader2 className="inline h-4 w-4 animate-spin ml-2" />}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))} title="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-500 w-14 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} title="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={resetView} title="Reset view">
              Reset
            </Button>
            {canEdit && (
              <>
                <div className="w-px h-6 bg-gray-200 mx-1" />
                <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} title="Manage levels & colors">
                  <Settings className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </CardHeader>

        {/* Levels & Roles Legend */}
        <div className="px-6 py-3 flex flex-wrap gap-3 items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {orgLevels.length > 0 && (
            <>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Levels:</span>
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
              <span className="text-xs text-gray-300 mx-1">|</span>
            </>
          )}
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Roles:</span>
          {(orgRoles.length > 0 ? orgRoles : DEFAULT_ROLE_OPTIONS).map((role) => (
            <span
              key={role.value}
              className={`text-xs px-2.5 py-1 rounded border ${getRoleColorFromPalette(role.color)}`}
            >
              {role.label}
            </span>
          ))}
        </div>

        {/* Top level drop zone */}
        {canEdit && draggedId && (
          <div
            onDragOver={handleTopLevelDragOver}
            onDragLeave={handleTopLevelDragLeave}
            onDrop={handleTopLevelDrop}
            className={`
              mx-4 mt-4 p-4 border-2 border-dashed rounded-lg text-center transition-all
              ${isTopLevelDropOver 
                ? 'border-[#f26722] bg-[#f26722]/10 text-[#f26722]' 
                : 'border-gray-300 dark:border-gray-600 text-gray-400'}
            `}
          >
            <span className="text-sm font-medium">Drop here to make top-level (no manager)</span>
          </div>
        )}

        <div
          ref={containerRef}
          className="p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 relative"
          style={{
            backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            minHeight: 'calc(100vh - 300px)',
            maxHeight: 'calc(100vh - 200px)',
            cursor: 'grab',
            overflow: 'hidden',
          }}
          onMouseDown={handlePanMouseDown}
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#f26722]" />
            </div>
          ) : people.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <UserPlus className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No one on the org chart yet
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {canEdit ? 'Start by adding people to build your organization\'s structure' : 'The organization chart has not been set up yet'}
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
              style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`, transformOrigin: 'top center' }}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {addUnderManagerId 
                ? `Add report under ${people.find((p) => p.id === addUnderManagerId)?.full_name || 'manager'}`
                : 'Add Person to Chart'
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Search employees</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or job title..."
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>Select a person ({availableEmployees.length} available)</Label>
              <div className="mt-1.5 max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                {availableEmployees.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 text-center">
                    {search ? 'No matching employees found' : 'All employees are already on the chart'}
                  </p>
                ) : (
                  availableEmployees.slice(0, 50).map((emp) => {
                    const isSelected = selectedEmployeeId === emp.id;
                    return (
                      <div
                        key={emp.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedEmployeeId(isSelected ? null : emp.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedEmployeeId(isSelected ? null : emp.id);
                          }
                        }}
                        className={`w-full flex items-center gap-3 p-3 text-left cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-[#f26722]/10 ring-2 ring-inset ring-[#f26722]' 
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                          {emp.avatar_url ? (
                            <img src={emp.avatar_url} alt="" className="w-full h-full object-cover" draggable="false" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm font-medium text-gray-500">
                              {(emp.full_name || '?')[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 dark:text-white truncate">{emp.full_name}</p>
                          {emp.job_title && (
                            <p className="text-xs text-gray-500 truncate">{emp.job_title}</p>
                          )}
                        </div>
                        {isSelected && (
                          <div className="flex-shrink-0 text-[#f26722]">
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {!addUnderManagerId && (
              <div>
                <Label>Reports to (optional)</Label>
                <select
                  value={addUnderManagerId || ''}
                  onChange={(e) => setAddUnderManagerId(e.target.value || null)}
                  className="mt-1.5 w-full h-10 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                >
                  <option value="">No manager (top level)</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>
            )}
            {orgLevels.length > 0 && (
              <div>
                <Label>Level (optional)</Label>
                <select
                  value={addLevelId ?? ''}
                  onChange={(e) => setAddLevelId(e.target.value || null)}
                  className="mt-1.5 w-full h-10 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                >
                  <option value="">No level</option>
                  {orgLevels.map((level) => (
                    <option key={level.id} value={level.id}>{level.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label>Role (optional)</Label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="mt-1.5 w-full h-10 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              >
                <option value="">No Role</option>
                {(orgRoles.length > 0 ? orgRoles : DEFAULT_ROLE_OPTIONS).map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddPerson} disabled={saving || !selectedEmployeeId}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add to Chart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Person Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Level & Role</DialogTitle>
          </DialogHeader>
          {editingPerson && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                  {editingPerson.avatar_url ? (
                    <img src={editingPerson.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-medium text-gray-500">
                      {(editingPerson.full_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{editingPerson.full_name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {editingPerson.level_id && orgLevels.find(l => l.id === editingPerson.level_id) && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${getColorByName(orgLevels.find(l => l.id === editingPerson.level_id)?.color).bg} ${getColorByName(orgLevels.find(l => l.id === editingPerson.level_id)?.color).text} ${getColorByName(orgLevels.find(l => l.id === editingPerson.level_id)?.color).border}`}>
                        {orgLevels.find(l => l.id === editingPerson.level_id)?.label}
                      </span>
                    )}
                    {editingPerson.role && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${getRoleColor(editingPerson.role, orgRoles)}`}>
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
                    value={editLevelId || ''}
                    onChange={(e) => setEditLevelId(e.target.value || null)}
                    className="mt-1.5 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
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
                  className="mt-1.5 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                >
                  <option value="">No Role</option>
                  {(orgRoles.length > 0 ? orgRoles : DEFAULT_ROLE_OPTIONS).map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
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
                  <p className="text-sm text-gray-500">No levels defined yet. Add one below.</p>
                ) : (
                  orgLevels.map((level) => {
                    const colorStyle = getColorByName(level.color);
                    return (
                      <div
                        key={level.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${colorStyle.bg} ${colorStyle.border}`}
                      >
                        <span className={`font-medium ${colorStyle.text}`}>{level.label}</span>
                        <div className="flex items-center gap-2">
                          {/* Color picker */}
                          <div className="flex gap-1">
                            {COLOR_PALETTE.map((c) => (
                              <button
                                key={c.name}
                                onClick={() => handleUpdateLevelColor(level.id, c.name)}
                                className={`w-5 h-5 rounded-full ${c.preview} ${level.color === c.name ? 'ring-2 ring-offset-1 ring-gray-800' : ''}`}
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
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
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
                      className={`w-6 h-6 rounded-full ${c.preview} ${newLevelColor === c.name ? 'ring-2 ring-offset-1 ring-gray-800' : ''}`}
                      title={c.name}
                    />
                  ))}
                </div>
                <Button onClick={handleAddLevel} disabled={!newLevelLabel.trim() || saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Role Management */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <Label className="text-sm font-medium">Current Roles</Label>
              <div className="mt-2 space-y-2">
                {(orgRoles.length > 0 ? orgRoles : DEFAULT_ROLE_OPTIONS).length === 0 ? (
                  <p className="text-sm text-gray-500">No roles defined yet. Add one below.</p>
                ) : (
                  (orgRoles.length > 0 ? orgRoles : DEFAULT_ROLE_OPTIONS.map((r, i) => ({ ...r, id: r.value, display_order: i }))).map((role) => {
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
                                onClick={() => orgRoles.length > 0 ? handleUpdateRoleColor(role.id, c.name) : null}
                                className={`w-4 h-4 rounded-full ${c.preview} ${role.color === c.name ? 'ring-2 ring-offset-1 ' + c.ring : 'opacity-60 hover:opacity-100'}`}
                                title={c.name}
                                disabled={orgRoles.length === 0}
                              />
                            ))}
                          </div>
                        </div>
                        <span className={`font-medium text-sm flex-1 ${colorStyle.text}`}>{role.label}</span>
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
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                  className="flex-1"
                />
                <div className="flex gap-1 items-center">
                  {COLOR_PALETTE.slice(0, 5).map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setNewRoleColor(c.name)}
                      className={`w-5 h-5 rounded-full ${c.preview} ${newRoleColor === c.name ? 'ring-2 ring-offset-1 ' + c.ring : 'opacity-60 hover:opacity-100'}`}
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
              <p className="text-xs text-gray-500 mt-2">
                Click the edit button on any person's card to assign them a role.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button>
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
