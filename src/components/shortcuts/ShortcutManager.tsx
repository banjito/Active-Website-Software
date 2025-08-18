import React, { useState, useEffect } from 'react';
import { PlusCircle, Edit2, Trash2, MoveVertical, Link as LinkIcon } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useAuth } from '@/lib/AuthContext';
import { ShortcutService, Shortcut } from '@/services/ShortcutService';
import { Badge } from '@/components/ui';

interface ShortcutFormData {
  title: string;
  url: string;
  icon?: string;
}

interface ShortcutManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutManager: React.FC<ShortcutManagerProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ShortcutFormData>({ title: '', url: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [currentShortcutId, setCurrentShortcutId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadShortcuts();
    }
  }, [isOpen, user]);

  // Debug logging
  useEffect(() => {
    console.log('ShortcutManager isOpen:', isOpen);
  }, [isOpen]);

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
    } else {
      // Add mode
      setFormData({ title: '', url: '' });
      setCurrentShortcutId(null);
      setIsEditing(false);
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

      if (isEditing && currentShortcutId) {
        // Update
        await ShortcutService.updateShortcut(currentShortcutId, formData);
      } else {
        // Create
        await ShortcutService.createShortcut({
          user_id: user.id,
          ...formData
        });
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

  const handleDragEnd = async (result: DropResult) => {
    console.log('Drag ended with result:', result);
    if (!result.destination || !user) return;

    // If dropped in the same position, do nothing
    if (result.source.index === result.destination.index) return;

    const items = Array.from(shortcuts);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update UI immediately
    setShortcuts(items);

    // Save the new order to the database
    try {
      const shortcutIds = items.map(item => item.id!);
      await ShortcutService.reorderShortcuts(user.id, shortcutIds);
    } catch (err) {
      console.error('Error reordering shortcuts:', err);
      setError('Failed to save new shortcut order.');
      // Revert to original order
      await loadShortcuts();
    }
  };

  // If not open, render nothing
  if (!isOpen) return null;

  // For debugging, render a simple component if isOpen is true
  // This will help us understand if the component is being rendered
  console.log('Rendering ShortcutManager with isOpen:', isOpen);

  // Render directly without using the Dialog component for testing
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
      <div className="bg-white dark:bg-dark-100 rounded-lg shadow-lg w-full max-w-[500px] p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Manage Shortcuts</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Button>
        </div>

        {error && <div className="p-2 mb-4 text-red-500 border border-red-300 bg-red-50 rounded-md dark:bg-red-900/30 dark:border-red-800">{error}</div>}

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Your Shortcuts</h3>
            <Button size="sm" onClick={() => handleOpenForm()}>
              <PlusCircle className="h-4 w-4 mr-2" /> Add Shortcut
            </Button>
          </div>

          {loading && !isFormOpen ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#f26722]"></div>
            </div>
          ) : shortcuts.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-gray-300 rounded-md dark:border-gray-600">
              <LinkIcon className="h-10 w-10 mx-auto text-gray-400 dark:text-gray-500 mb-2" />
              <p className="text-gray-500 dark:text-gray-400">You don't have any shortcuts yet.</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Add shortcuts to quickly access your favorite pages.</p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center bg-gray-50 dark:bg-dark-200 p-3 rounded text-sm border border-orange-100 dark:border-[#f26722]/30">
                <MoveVertical className="h-4 w-4 mr-2 text-[#f26722]" />
                <span><strong>To reorder:</strong> Click and drag any shortcut up or down to change its position</span>
              </div>
              <DragDropContext 
                onDragStart={(start) => console.log('Drag started:', start)}
                onDragUpdate={(update) => console.log('Drag update:', update)}
                onDragEnd={handleDragEnd}
              >
                <Droppable droppableId="shortcuts">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2"
                    >
                      {shortcuts.map((shortcut, index) => {
                        // Ensure the ID is a string and exists
                        const id = shortcut.id || `shortcut-${index}`;
                        return (
                          <Draggable key={id} draggableId={id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                style={provided.draggableProps.style}
                                className={`flex items-center p-3 bg-white dark:bg-dark-100 border cursor-grab ${
                                  snapshot.isDragging 
                                    ? 'border-[#f26722] ring-2 ring-[#f26722]/50 shadow-lg bg-orange-50 dark:bg-[#f26722]/10' 
                                    : 'border-gray-200 dark:border-gray-700 shadow-sm hover:border-orange-200 dark:hover:border-[#f26722]/30'
                                } rounded-md transition-all ${snapshot.isDragging ? 'cursor-grabbing' : ''}`}
                              >
                                <div className="flex items-center w-full">
                                  <MoveVertical className="h-5 w-5 text-[#f26722] mr-3 flex-shrink-0" />
                                  <div className="flex-grow">
                                    <div className="font-medium">{shortcut.title}</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[240px]">
                                      {shortcut.url}
                                    </div>
                                  </div>
                                  <div className="flex space-x-2 ml-2 flex-shrink-0">
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleOpenForm(shortcut);
                                      }}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                      }}
                                      className="p-1.5 h-auto"
                                    >
                                      <Edit2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDeleteShortcut(shortcut.id!);
                                      }}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                      }}
                                      className="p-1.5 h-auto text-red-500 hover:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </>
          )}
        </div>

        {/* Shortcut Form */}
        {isFormOpen && (
          <div 
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              // Close form when clicking the backdrop/overlay
              if (e.target === e.currentTarget) {
                handleCloseForm();
              }
            }}
          >
            <div className="bg-white dark:bg-dark-100 rounded-lg shadow-lg w-full max-w-[425px] p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">{isEditing ? 'Edit Shortcut' : 'Add Shortcut'}</h3>
              </div>
              
              <form onSubmit={handleSaveShortcut} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="title">Shortcut Name</label>
                  <input
                    id="title"
                    name="title"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md dark:border-gray-700 dark:bg-dark-200"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md dark:border-gray-700 dark:bg-dark-200"
                    value={formData.url}
                    onChange={handleInputChange}
                    placeholder="/north_alabama/dashboard or https://example.com"
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Use a relative path like "/north_alabama/dashboard" for internal pages or a full URL for external sites.
                  </p>
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 rounded-md dark:border-gray-700 text-gray-700 dark:text-gray-300"
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 