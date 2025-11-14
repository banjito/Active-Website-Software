import React, { useState, useEffect } from 'react';
import { PlusCircle, Edit2, Trash2, MoveVertical, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/AuthContext';
import { ShortcutService, Shortcut } from '@/services/ShortcutService';
import { BUILTIN_PORTALS } from '@/components/shortcuts/builtins';
import { Search } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ShortcutFormData {
  title: string;
  url: string;
  icon?: string;
}

interface ShortcutManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

// Sortable shortcut item component
const SortableShortcutItem = ({ shortcut, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shortcut.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center px-2 py-1 bg-white dark:bg-dark-150 border ${
        isDragging
          ? 'border-[#f26722] ring-1 ring-[#f26722]/50 shadow-lg bg-orange-50 dark:bg-[#f26722]/10 scale-[1.02]'
          : 'border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-[#f26722]/30 hover:bg-gray-50 dark:hover:bg-dark-100'
      } rounded cursor-grab transition-all duration-150 ${isDragging ? 'cursor-grabbing z-50' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center w-full min-w-0 gap-2">
        <MoveVertical className="h-3 w-3 text-[#f26722] flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
        <div className="flex-grow min-w-0 py-0.5">
          <div className="text-xs font-medium truncate leading-tight">{shortcut.title}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">
            {shortcut.url}
          </div>
        </div>
        <div className="flex space-x-0.5 ml-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(shortcut);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            className="p-0.5 h-auto hover:bg-gray-200 dark:hover:bg-dark-200 rounded"
          >
            <Edit2 className="h-3 w-3 text-gray-600 dark:text-gray-300" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(shortcut.id);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            className="p-0.5 h-auto text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export const ShortcutManagerDndKit: React.FC<ShortcutManagerProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ShortcutFormData>({ title: '', url: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [currentShortcutId, setCurrentShortcutId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuick, setSelectedQuick] = useState<Record<string, boolean>>({});
  const [useBuiltin, setUseBuiltin] = useState<boolean>(true);
  const [selectedPortal, setSelectedPortal] = useState<string>('sales');
  const [selectedOption, setSelectedOption] = useState<string>('');

  // Set up the sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required to start drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (isOpen && user) {
      loadShortcuts();
    }
  }, [isOpen, user]);

  const loadShortcuts = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      const data = await ShortcutService.getUserShortcuts(user.id);
      console.log('Loaded shortcuts:', data);
      setShortcuts(data);
    } catch (err) {
      console.error('Error loading shortcuts:', err);
      setError('Failed to load shortcuts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (shortcut?: Shortcut) => {
    if (shortcut) {
      // Edit mode
      setFormData({
        title: shortcut.title,
        url: shortcut.url,
        icon: shortcut.icon
      });
      setCurrentShortcutId(shortcut.id!);
      setIsEditing(true);
      setUseBuiltin(false);
    } else {
      // Add mode
      setFormData({ title: '', url: '' });
      setCurrentShortcutId(null);
      setIsEditing(false);
      setUseBuiltin(true);
      setSelectedPortal('sales');
      const defaultFirst = BUILTIN_PORTALS.find(p => p.key === 'sales')?.options[0]?.path || '';
      setSelectedOption(defaultFirst);
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setFormData({ title: '', url: '' });
    setCurrentShortcutId(null);
    setIsEditing(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveShortcut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const payload = useBuiltin
        ? // Save a GROUP entry if destination not chosen; otherwise a direct path
          (selectedOption
            ? { title: BUILTIN_PORTALS.find(p => p.key === selectedPortal)?.options.find(o => o.path === selectedOption)?.label || 'Shortcut', url: selectedOption }
            : { title: BUILTIN_PORTALS.find(p => p.key === selectedPortal)?.label || 'Portal', url: `portal:${selectedPortal}` }
          )
        : formData;

      if (isEditing && currentShortcutId) {
        // Update
        await ShortcutService.updateShortcut(currentShortcutId, payload);
      } else {
        // Create
        await ShortcutService.createShortcut({ user_id: user.id, ...payload });
      }

      // Reload shortcuts
      await loadShortcuts();
      handleCloseForm();
    } catch (err) {
      console.error('Error saving shortcut:', err);
      setError('Failed to save shortcut. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickAddItems = React.useMemo(() => {
    const items: Array<{ key: string; label: string; path: string }> = [];
    BUILTIN_PORTALS.forEach(p => {
      p.options.forEach(opt => {
        items.push({ key: `${p.key}:${opt.path}`, label: `${p.label} • ${opt.label}`, path: opt.path });
      });
    });
    return items.filter(it => it.label.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery]);

  const toggleQuickSelect = (key: string) => {
    setSelectedQuick(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleQuickAdd = async () => {
    if (!user) return;
    const chosen = quickAddItems.filter(it => selectedQuick[it.key]);
    if (!chosen.length) {
      setQuickAddOpen(false);
      return;
    }
    try {
      setLoading(true);
      await ShortcutService.bulkCreateShortcuts(user.id, chosen.map(c => ({ title: c.label, url: c.path })));
    } finally {
      setLoading(false);
      setQuickAddOpen(false);
      setSelectedQuick({});
      setSearchQuery('');
      await loadShortcuts();
    }
  };

  const handleDeleteShortcut = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this shortcut?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await ShortcutService.deleteShortcut(id);
      await loadShortcuts();
    } catch (err) {
      console.error('Error deleting shortcut:', err);
      setError('Failed to delete shortcut. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !user) return;
    
    // If items are different, reorder the array
    if (active.id !== over.id) {
      setShortcuts((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        
        // If either index is not found, don't change anything
        if (oldIndex === -1 || newIndex === -1) return items;
        
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Save the new order to the database
        try {
          const shortcutIds = newItems.map(item => item.id!);
          ShortcutService.reorderShortcuts(user.id, shortcutIds).catch(err => {
            console.error('Error reordering shortcuts:', err);
            setError('Failed to save new shortcut order.');
            // We should reload shortcuts if there's an error
            loadShortcuts();
          });
        } catch (err) {
          console.error('Error in handleDragEnd:', err);
        }
        
        return newItems;
      });
    }
  };

  // If not open, render nothing
  if (!isOpen) return null;

  // Render the manager
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        // Close when clicking the backdrop/overlay
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-dark-150 rounded-lg shadow-lg w-full max-w-[500px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Fixed Header */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">Manage Shortcuts</h2>
            <Button variant="ghost" size="sm" onClick={onClose} className="p-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </Button>
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {shortcuts.length} {shortcuts.length === 1 ? 'shortcut' : 'shortcuts'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setQuickAddOpen(true)} className="text-xs px-2 py-1 h-7">
                <Search className="h-3 w-3 mr-1" /> Quick Add
              </Button>
              <Button size="sm" onClick={() => handleOpenForm()} className="text-xs px-2 py-1 h-7">
                <PlusCircle className="h-3 w-3 mr-1" /> Custom
              </Button>
            </div>
          </div>
        </div>

        {error && <div className="flex-shrink-0 mx-4 mt-3 p-2 text-sm text-red-500 border border-red-300 bg-red-50 rounded-md dark:bg-red-900/30 dark:border-red-800">{error}</div>}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollBehavior: 'smooth' }}>
          {loading && !isFormOpen ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#f26722]"></div>
            </div>
          ) : shortcuts.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-gray-300 rounded-md dark:border-gray-600">
              <LinkIcon className="h-10 w-10 mx-auto text-gray-400 dark:text-white mb-2" />
              <p className="text-gray-500 dark:text-white">You don't have any shortcuts yet.</p>
              <p className="text-gray-500 dark:text-white text-sm mt-1">Add shortcuts to quickly access your favorite pages.</p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center bg-gray-50 dark:bg-dark-150 px-2 py-1.5 rounded text-xs border border-orange-100 dark:border-[#f26722]/30 sticky top-0 z-10">
                <MoveVertical className="h-3 w-3 mr-1.5 text-[#f26722] flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300"><strong>Drag to reorder</strong></span>
              </div>
              
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={shortcuts.map(s => s.id!)} 
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {shortcuts.map((shortcut) => (
                      <SortableShortcutItem 
                        key={shortcut.id}
                        shortcut={shortcut} 
                        onEdit={handleOpenForm}
                        onDelete={handleDeleteShortcut}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}
        </div>

        {/* Shortcut Form */}
        {(isFormOpen || quickAddOpen) && (
          <div 
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              // Close form when clicking the backdrop/overlay
              if (e.target === e.currentTarget) {
                if (isFormOpen) handleCloseForm();
                if (quickAddOpen) {
                  setQuickAddOpen(false);
                  setSelectedQuick({});
                  setSearchQuery('');
                }
              }
            }}
          >
            <div className="bg-white dark:bg-dark-150 rounded-lg shadow-lg w-full max-w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
              {quickAddOpen ? (
                <>
                  {/* Fixed Header */}
                  <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold mb-3">Quick Add Shortcuts</h3>
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <input
                        autoFocus
                        placeholder="Search portals and links..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md dark:border-gray-700 dark:bg-dark-150 focus:outline-none focus:ring-1 focus:ring-[#f26722]"
                      />
                    </div>
                    {Object.keys(selectedQuick).filter(k => selectedQuick[k]).length > 0 && (
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                        {Object.keys(selectedQuick).filter(k => selectedQuick[k]).length} selected
                      </div>
                    )}
                  </div>

                  {/* Scrollable List */}
                  <div className="flex-1 overflow-y-auto" style={{ scrollBehavior: 'smooth' }}>
                    {quickAddItems.length === 0 ? (
                      <div className="p-8 text-center text-sm text-gray-500">No matches found</div>
                    ) : (
                      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {quickAddItems.map(it => (
                          <li key={it.key} className="hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors">
                            <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!selectedQuick[it.key]}
                                onChange={() => toggleQuickSelect(it.key)}
                                className="h-4 w-4 text-[#f26722] border-gray-300 rounded focus:ring-[#f26722]"
                              />
                              <span className="text-sm flex-1">{it.label}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Fixed Footer */}
                  <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { setQuickAddOpen(false); setSelectedQuick({}); setSearchQuery(''); }} size="sm">
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleQuickAdd} 
                        disabled={loading || Object.keys(selectedQuick).filter(k => selectedQuick[k]).length === 0}
                        size="sm"
                        className="bg-[#f26722] hover:bg-[#f26722]/90"
                      >
                        {loading ? 'Adding...' : 'Add Selected'}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">{isEditing ? 'Edit Shortcut' : 'Add Shortcut'}</h3>
                  </div>
                  <form onSubmit={handleSaveShortcut} className="space-y-4">
                    {/* Mode toggle */}
                    <div className="flex items-center gap-2 text-sm">
                      <button type="button" className={`${useBuiltin ? 'font-semibold' : ''}`} onClick={() => setUseBuiltin(true)}>Built-in</button>
                      <span className="text-gray-400">/</span>
                      <button type="button" className={`${!useBuiltin ? 'font-semibold' : ''}`} onClick={() => setUseBuiltin(false)}>Custom URL</button>
                    </div>
                    {useBuiltin ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Portal</label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md dark:border-gray-700 dark:bg-dark-150"
                            value={selectedPortal}
                            onChange={(e) => {
                              setSelectedPortal(e.target.value);
                              const first = BUILTIN_PORTALS.find(p => p.key === e.target.value as any)?.options[0]?.path || '';
                              setSelectedOption(first);
                            }}
                          >
                            {BUILTIN_PORTALS.map(p => (
                              <option key={p.key} value={p.key}>{p.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Destination</label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md dark:border-gray-700 dark:bg-dark-150"
                            value={selectedOption}
                            onChange={(e) => setSelectedOption(e.target.value)}
                          >
                            <option value="">(Add as portal group)</option>
                            {BUILTIN_PORTALS.find(p => p.key === selectedPortal as any)?.options.map(opt => (
                              <option key={opt.path} value={opt.path}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor="title">Shortcut Name</label>
                          <input
                            id="title"
                            name="title"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md dark:border-gray-700 dark:bg-dark-150"
                            value={formData.title}
                            onChange={handleInputChange}
                            placeholder="My Shortcut"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor="url">URL or Path</label>
                          <input
                            id="url"
                            name="url"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md dark:border-gray-700 dark:bg-dark-150"
                            value={formData.url}
                            onChange={handleInputChange}
                            placeholder="/north_alabama/dashboard or https://example.com"
                            required
                          />
                        </div>
                      </>
                    )}
                    <div className="flex justify-end space-x-2 pt-4">
                      <button
                        type="button"
                        className="px-4 py-2 border border-gray-300 rounded-md dark:border-gray-700 text-gray-700 dark:text-white"
                        onClick={handleCloseForm}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#f26722] text-white rounded-md hover:bg-[#f26722]/90"
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <span className="inline-block h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></span>
                            Saving...
                          </>
                        ) : isEditing ? 'Update' : 'Add'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 