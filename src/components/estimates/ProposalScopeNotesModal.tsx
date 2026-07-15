/**
 * ProposalScopeNotesModal
 *
 * A modal component for managing and selecting pre-defined scope notes
 * to insert into letter proposals. Supports:
 * - Browsing notes grouped by category
 * - Searching/filtering notes
 * - Selecting multiple notes to insert
 * - Creating, editing, and deleting note presets
 */

import React, { useState, useEffect, useCallback } from "react";
import { Dialog } from "@headlessui/react";
import { X } from "lucide-react";
import { Button } from "../ui/Button";
import {
  getScopeNotes,
  createScopeNote,
  updateScopeNote,
  deleteScopeNote,
  ProposalScopeNote,
  ProposalScopeNoteInput,
} from "../../services/proposalScopeNotesService";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BRAND_COLOR } from "@/lib/companyConfig";

interface ProposalScopeNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (notesHtml: string) => void;
  userId?: string;
}

type ModalView = "select" | "create" | "edit";

export const ProposalScopeNotesModal: React.FC<
  ProposalScopeNotesModalProps
> = ({ isOpen, onClose, onInsert, userId }) => {
  // Data state
  const [notes, setNotes] = useState<ProposalScopeNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // View state
  const [view, setView] = useState<ModalView>("select");
  const [editingNote, setEditingNote] = useState<ProposalScopeNote | null>(
    null,
  );

  // Form state for create/edit
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("General");
  const [formSaving, setFormSaving] = useState(false);

  // Load scope notes when modal opens
  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getScopeNotes();
      setNotes(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load scope notes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadNotes();
      setSelectedNoteIds(new Set());
      setSearchQuery("");
      setSelectedCategory("All");
      setView("select");
    }
  }, [isOpen, loadNotes]);

  // Derive categories from notes
  const categories = [
    "All",
    ...Array.from(new Set(notes.map((n) => n.category).filter(Boolean))).sort(),
  ];

  // Filter notes by search and category
  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "All" || note.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group filtered notes by category
  const groupedNotes: Record<string, ProposalScopeNote[]> = {};
  filteredNotes.forEach((note) => {
    const cat = note.category || "General";
    if (!groupedNotes[cat]) groupedNotes[cat] = [];
    groupedNotes[cat].push(note);
  });

  // Toggle note selection
  const toggleNoteSelection = (id: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Build HTML for selected notes and insert
  const handleInsert = () => {
    const selectedNotes = notes.filter((n) => selectedNoteIds.has(n.id));
    if (selectedNotes.length === 0) return;

    const notesListHtml = selectedNotes
      .map((note) => `<li style="margin-bottom: 6px;">${note.content}</li>`)
      .join("\n            ");

    const scopeNotesHtml = `
        <div class="amp-section scope-notes-section scope-notes-draggable" style="margin: 12px 0; border-left: 3px solid ${BRAND_COLOR}; background: #fff7f2; border-radius: 4px; position: relative;">
          <div class="scope-notes-drag-handle" contenteditable="false" draggable="true" style="position: absolute; left: 2px; top: 50%; transform: translateY(-50%); width: 14px; cursor: grab; color: ${BRAND_COLOR}; font-size: 14px; line-height: 1; user-select: none; padding: 4px 2px;" title="Drag to move">⋮⋮</div>
          <div style="padding: 10px 10px 10px 22px;">
            <div style="font-weight: bold; margin-bottom: 6px; color: #333;">Scope Notes:</div>
            <ul style="margin: 4px 0 4px 20px; color: #444;">
              ${notesListHtml}
            </ul>
          </div>
        </div>`;

    onInsert(scopeNotesHtml);
    onClose();
  };

  // Handle create new note
  const handleStartCreate = () => {
    setFormTitle("");
    setFormContent("");
    setFormCategory("General");
    setEditingNote(null);
    setView("create");
  };

  // Handle edit note
  const handleStartEdit = (note: ProposalScopeNote) => {
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormCategory(note.category || "General");
    setEditingNote(note);
    setView("edit");
  };

  // Save new or edited note
  const handleSaveNote = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setFormSaving(true);
    try {
      if (view === "edit" && editingNote) {
        await updateScopeNote(editingNote.id, {
          title: formTitle,
          content: formContent,
          category: formCategory,
        });
      } else {
        await createScopeNote(
          {
            title: formTitle,
            content: formContent,
            category: formCategory,
          },
          userId,
        );
      }
      await loadNotes();
      setView("select");
    } catch (err: any) {
      setError(err?.message || "Failed to save scope note");
    } finally {
      setFormSaving(false);
    }
  };

  // Delete a note
  const handleDeleteNote = async (note: ProposalScopeNote) => {
    if (!confirm(`Delete scope note "${note.title}"? This cannot be undone.`))
      return;
    try {
      await deleteScopeNote(note.id);
      setSelectedNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(note.id);
        return next;
      });
      await loadNotes();
    } catch (err: any) {
      setError(err?.message || "Failed to delete scope note");
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center"
    >
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[59]"
        onClick={onClose}
      />
      <div className="relative z-[60] bg-white rounded-none shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-neutral-900">
            {view === "select"
              ? "Scope Notes"
              : view === "create"
                ? "Create Scope Note"
                : "Edit Scope Note"}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 ml-2"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Selection View */}
        {view === "select" && (
          <>
            {/* Search & Filter Bar */}
            <div className="p-4 border-b space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search scope notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 border border-neutral-300 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand text-sm"
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 border border-neutral-300 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand text-sm bg-white"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              {selectedNoteIds.size > 0 && (
                <div className="text-sm text-brand font-medium">
                  {selectedNoteIds.size} note
                  {selectedNoteIds.size !== 1 ? "s" : ""} selected
                </div>
              )}
            </div>

            {/* Notes List */}
            <div className="flex-1 overflow-auto p-4">
              {loading ? (
                <div className="text-center text-neutral-500 py-8">
                  <LoadingSpinner size="md" />
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="text-center text-neutral-500 py-8">
                  {notes.length === 0
                    ? 'No scope notes yet. Click "New Note" to create one.'
                    : "No notes match your search."}
                </div>
              ) : (
                Object.entries(groupedNotes)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([category, categoryNotes]) => (
                    <div key={category} className="mb-4">
                      <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 px-1">
                        {category}
                      </div>
                      <div className="space-y-2">
                        {categoryNotes.map((note) => (
                          <div
                            key={note.id}
                            className={`border rounded-none p-3 cursor-pointer transition-all ${
                              selectedNoteIds.has(note.id)
                                ? "border-brand bg-orange-50 ring-1 ring-brand"
                                : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                            }`}
                            onClick={() => toggleNoteSelection(note.id)}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedNoteIds.has(note.id)}
                                onChange={() => toggleNoteSelection(note.id)}
                                className="mt-1 h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-neutral-900">
                                  {note.title}
                                </div>
                                <div className="text-sm text-neutral-600 mt-1 leading-relaxed">
                                  {note.content}
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0 ml-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEdit(note);
                                  }}
                                  className="text-neutral-400 hover:text-brand p-1 rounded transition-colors"
                                  title="Edit note"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                    <path d="m15 5 4 4" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteNote(note);
                                  }}
                                  className="text-neutral-400 hover:text-red-600 p-1 rounded transition-colors"
                                  title="Delete note"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t flex items-center justify-between gap-2">
              <Button onClick={handleStartCreate} variant="outline" size="sm">
                + New Note
              </Button>
              <div className="flex gap-2">
                <Button onClick={onClose} variant="outline" size="sm">
                  Cancel
                </Button>
                <Button
                  onClick={handleInsert}
                  disabled={selectedNoteIds.size === 0}
                  size="sm"
                  className="bg-brand text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  Insert{" "}
                  {selectedNoteIds.size > 0 ? `(${selectedNoteIds.size})` : ""}{" "}
                  into Letter
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Create / Edit View */}
        {(view === "create" || view === "edit") && (
          <>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g., Breaker Testing Size Threshold"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Note Content
                </label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="e.g., Circuit breaker testing is required only for breakers rated 100A and above per project specifications."
                  rows={4}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand text-sm resize-vertical"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  This text will be inserted into the letter proposal. You can
                  edit it directly in the letter after inserting.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="e.g., Circuit Breakers, Transformers, General"
                  list="scope-note-categories"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand text-sm"
                />
                <datalist id="scope-note-categories">
                  {categories
                    .filter((c) => c !== "All")
                    .map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                </datalist>
              </div>
            </div>

            {/* Form Footer */}
            <div className="p-4 border-t flex items-center justify-end gap-2">
              <Button
                onClick={() => setView("select")}
                variant="outline"
                size="sm"
              >
                Back
              </Button>
              <Button
                onClick={handleSaveNote}
                disabled={
                  !formTitle.trim() || !formContent.trim() || formSaving
                }
                isLoading={formSaving}
                size="sm"
                className="bg-brand text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {view === "edit" ? "Save Changes" : "Create Note"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};

export default ProposalScopeNotesModal;
