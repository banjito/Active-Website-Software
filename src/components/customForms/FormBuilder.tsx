/**
 * Form Builder Component
 *
 * Main interface for creating and editing custom form templates.
 * Features:
 * - Drag & drop components from library
 * - Live preview
 * - Section customization
 * - Save templates
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "react-hot-toast";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Save,
  Eye,
  Edit,
  Settings,
  Plus,
  ArrowLeft,
  PanelLeftOpen,
  Globe,
  LayoutPanelTop,
  Lock,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

import { ComponentLibrarySidebar } from "./ComponentLibrarySidebar";
import { FormCanvas } from "./FormCanvas";
import { SectionEditor } from "./SectionEditor";
import { FormPreview } from "./FormPreview";

import {
  CustomFormTemplate,
  SectionConfig,
  ComponentType,
} from "@/lib/types/customForms";
import { getComponentDefinition } from "@/lib/customForms/componentLibrary";
import {
  fetchComponentDefaultOverrides,
  getMergedDefaultConfig,
  saveComponentDefaultOverride,
} from "@/lib/customForms/componentDefaultOverrides";
import {
  fetchSavedComponents,
  saveSavedComponent,
  updateSavedComponent,
  deleteSavedComponent,
  type SavedComponent,
} from "@/lib/customForms/savedComponents";
import { SavedComponentsDialog } from "./SavedComponentsDialog";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const FormBuilder: React.FC = () => {
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin =
    (user?.user_metadata?.role as string) === "Admin" ||
    (user?.user_metadata?.role as string) === "Super Admin";

  // Admin-saved component default overrides (merged when adding a section)
  const [componentDefaultOverrides, setComponentDefaultOverrides] = useState<
    Record<string, Partial<SectionConfig>>
  >({});

  // User-saved components (custom tables etc.) that appear in the library
  const [savedComponents, setSavedComponents] = useState<SavedComponent[]>([]);
  const [viewingSavedComponent, setViewingSavedComponent] =
    useState<SavedComponent | null>(null);
  const refetchSavedComponents = useCallback(() => {
    fetchSavedComponents().then(setSavedComponents);
  }, []);

  // Form builder state
  const [template, setTemplate] = useState<CustomFormTemplate>({
    name: "Untitled Form",
    description: "",
    netaSection: "",
    structure: {
      sections: [],
      settings: {
        includePassFail: true,
        includeJobInfo: true,
        includePrintHeader: true,
        pageBreakAfterSection: false,
      },
    },
  });

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [formulaEditingSectionId, setFormulaEditingSectionId] = useState<
    string | null
  >(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true); // open by default so component library is visible when editing
  const [activeId, setActiveId] = useState<string | null>(null);
  const [actionTooltip, setActionTooltip] = useState<{
    text: string;
    x: number;
    y: number;
    borderClass: string;
  } | null>(null);

  // NETA section: saved sections (like equipment location)
  const [netaSections, setNetaSections] = useState<string[]>([]);
  const [netaSectionInput, setNetaSectionInput] = useState("");
  const [showNetaSectionDropdown, setShowNetaSectionDropdown] = useState(false);
  const netaSectionInputRef = useRef<HTMLDivElement>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Load existing template if editing
  useEffect(() => {
    if (templateId) {
      loadTemplate();
    }
  }, [templateId]);

  // Sync NETA section input when template loads or changes
  useEffect(() => {
    setNetaSectionInput(template.netaSection || "");
  }, [template.netaSection, template.id]);

  // Fetch saved NETA sections (like equipment_locations)
  const fetchNetaSections = async () => {
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("neta_sections")
        .select("name")
        .order("name", { ascending: true });

      if (error) {
        if (
          error.code === "42P01" ||
          error.message?.includes("does not exist")
        ) {
          setNetaSections([]);
          return;
        }
        console.error("Error fetching neta sections:", error);
        setNetaSections([]);
        return;
      }
      setNetaSections((data ?? []).map((row: { name: string }) => row.name));
    } catch (err) {
      console.error("Error fetching neta sections:", err);
      setNetaSections([]);
    }
  };

  const createNetaSection = async (name: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("neta_sections")
        .insert([{ name: name.trim() }]);

      if (error) {
        if (error.code === "23505") return true; // already exists
        console.error("Error creating neta section:", error);
        return false;
      }
      await fetchNetaSections();
      return true;
    } catch (err) {
      console.error("Error creating neta section:", err);
      return false;
    }
  };

  const deleteNetaSection = async (name: string) => {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("neta_sections")
        .delete()
        .eq("name", name.trim());

      if (error) {
        console.error("Error deleting neta section:", error);
        toast.error("Could not remove NETA section");
        return;
      }
      if (
        (netaSectionInput || "").trim().toLowerCase() ===
        name.trim().toLowerCase()
      ) {
        setNetaSectionInput("");
        setTemplate((prev) => ({ ...prev, netaSection: "" }));
        setIsDirty(true);
      }
      await fetchNetaSections();
      toast.success(`"${name}" removed from saved sections`);
    } catch (err) {
      console.error("Error deleting neta section:", err);
      toast.error("Could not remove NETA section");
    }
  };

  useEffect(() => {
    fetchNetaSections();
  }, []);

  // Fetch saved component defaults on mount and when switching templates so "add to another report" gets latest
  useEffect(() => {
    fetchComponentDefaultOverrides().then(setComponentDefaultOverrides);
  }, [templateId]);

  // Fetch saved components (custom tables etc.) for the library sidebar
  useEffect(() => {
    refetchSavedComponents();
  }, [refetchSavedComponents]);

  const loadTemplate = async () => {
    if (!templateId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (error) throw error;

      if (data) {
        setTemplate({
          id: data.id,
          name: data.name,
          description: data.description,
          netaSection: data.neta_section,
          createdBy: data.created_by,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          isActive: data.is_active,
          isPublished: data.is_published ?? false,
          structure: data.structure,
        });
      }
    } catch (error) {
      console.error("Error loading template:", error);
      toast.error("Failed to load template");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!user?.id) {
      toast.error("You must be logged in to save templates");
      console.error("No user ID found");
      return;
    }

    console.log("User ID:", user.id);
    console.log("Template name:", template.name);
    console.log("Sections count:", template.structure.sections.length);

    if (!template.name.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    if (template.structure.sections.length === 0) {
      toast.error("Please add at least one section to the form");
      return;
    }

    setIsSaving(true);
    try {
      const templateData = {
        name: template.name,
        description: template.description || null,
        neta_section: template.netaSection || null,
        created_by: user.id,
        structure: template.structure,
        is_active: true,
        is_published: template.isPublished ?? false,
      };

      console.log("Attempting to save template data:", templateData);

      let result;
      if (template.id) {
        // Update existing template
        result = await supabase
          .schema("neta_ops")
          .from("custom_form_templates")
          .update(templateData)
          .eq("id", template.id)
          .select()
          .single();
      } else {
        // Create new template
        result = await supabase
          .schema("neta_ops")
          .from("custom_form_templates")
          .insert(templateData)
          .select()
          .single();
      }

      if (result.error) {
        console.error("Supabase error details:", result.error);
        throw result.error;
      }

      if (!result.data) {
        throw new Error("No data returned from database");
      }

      setTemplate((prev) => ({
        ...prev,
        id: result.data.id,
        isPublished: result.data.is_published ?? false,
      }));
      setIsDirty(false);
      toast.success(
        `Template ${template.id ? "updated" : "saved"} successfully!`,
      );

      // Navigate to template list after saving
      setTimeout(() => {
        navigate("/custom-forms/templates");
      }, 1000);
    } catch (error: any) {
      console.error("Error saving template:", error);
      console.error("Error details:", {
        message: error?.message,
        hint: error?.hint,
        details: error?.details,
        code: error?.code,
        fullError: JSON.stringify(error),
      });
      toast.error(
        `Failed to save template: ${error?.message || error?.hint || "Unknown error"}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishToggle = async () => {
    if (!template.id) {
      toast.error("Please save the template first before publishing");
      return;
    }

    const newPublished = !template.isPublished;
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("custom_form_templates")
        .update({ is_published: newPublished })
        .eq("id", template.id);

      if (error) throw error;

      setTemplate((prev) => ({ ...prev, isPublished: newPublished }));
      toast.success(
        newPublished
          ? "Template published! It will now appear in jobs."
          : "Template unpublished. It will no longer appear in jobs.",
      );
    } catch (error: any) {
      console.error("Error toggling publish:", error);
      toast.error(
        `Failed to ${newPublished ? "publish" : "unpublish"} template`,
      );
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    // If dropping a component from the library — insert at drop position
    if (active.data.current?.type === "library-component") {
      const componentType = active.id as ComponentType;
      const dropIndex = template.structure.sections.findIndex(
        (s) => s.id === over.id,
      );
      const insertAtIndex =
        dropIndex >= 0 ? dropIndex : template.structure.sections.length;
      addSection(componentType, insertAtIndex);
    }
    // If dropping a saved component (custom table etc.) — add section from saved config
    else if (active.data.current?.type === "saved-component") {
      const { sectionConfig, name, savedComponentId } = active.data.current as {
        sectionConfig: SectionConfig;
        name: string;
        savedComponentId: string;
      };
      const dropIndex = template.structure.sections.findIndex(
        (s) => s.id === over.id,
      );
      const insertAtIndex =
        dropIndex >= 0 ? dropIndex : template.structure.sections.length;
      addSectionFromSaved(sectionConfig, insertAtIndex, savedComponentId);
      toast.success(`Added ${name}`);
    }
    // If reordering existing sections
    else if (active.id !== over.id) {
      const oldIndex = template.structure.sections.findIndex(
        (s) => s.id === active.id,
      );
      const newIndex = template.structure.sections.findIndex(
        (s) => s.id === over.id,
      );

      if (oldIndex !== -1 && newIndex !== -1) {
        const newSections = arrayMove(
          template.structure.sections,
          oldIndex,
          newIndex,
        );
        // Update order property
        const updatedSections = newSections.map((section, index) => ({
          ...section,
          order: index,
        }));

        setTemplate((prev) => ({
          ...prev,
          structure: {
            ...prev.structure,
            sections: updatedSections,
          },
        }));
        setIsDirty(true);
      }
    }

    setActiveId(null);
  };

  const addSection = (componentType: ComponentType, insertAtIndex?: number) => {
    const componentDef = getComponentDefinition(componentType);
    if (!componentDef) return;

    const mergedDefault = getMergedDefaultConfig(
      componentType,
      componentDefaultOverrides,
    );
    const index = insertAtIndex ?? template.structure.sections.length;
    const newSection: SectionConfig = {
      ...mergedDefault,
      id: `section-${Date.now()}`,
      componentType: componentType,
      title: (mergedDefault.title as string) || componentDef.name,
      order: index,
      showInPrint: mergedDefault.showInPrint !== false,
    } as SectionConfig;

    setTemplate((prev) => {
      const sections = [...prev.structure.sections];
      sections.splice(index, 0, newSection);
      const withOrder = sections.map((s, i) => ({ ...s, order: i }));
      return {
        ...prev,
        structure: {
          ...prev.structure,
          sections: withOrder,
        },
      };
    });

    setSelectedSectionId(newSection.id);
    setIsDirty(true);
    toast.success(`Added ${componentDef.name}`);
  };

  const addSectionFromSaved = (
    savedConfig: SectionConfig,
    insertAtIndex?: number,
    savedComponentId?: string,
    selectAfterAdd = true,
  ) => {
    const index = insertAtIndex ?? template.structure.sections.length;
    const newSection: SectionConfig = {
      ...savedConfig,
      id: `section-${Date.now()}`,
      order: index,
      showInPrint: savedConfig.showInPrint !== false,
      ...(savedComponentId ? { savedComponentId } : {}),
    } as SectionConfig;

    setTemplate((prev) => {
      const sections = [...prev.structure.sections];
      sections.splice(index, 0, newSection);
      const withOrder = sections.map((s, i) => ({ ...s, order: i }));
      return {
        ...prev,
        structure: {
          ...prev.structure,
          sections: withOrder,
        },
      };
    });

    if (selectAfterAdd) setSelectedSectionId(newSection.id);
    setIsDirty(true);
  };

  const updateSection = (
    sectionId: string,
    updates: Partial<SectionConfig>,
  ) => {
    setTemplate((prev) => {
      const section = prev.structure.sections.find((s) => s.id === sectionId);
      const groupId = section?.rowCountLinkGroupId;
      const newRows = updates.rows;
      const oldRows = section?.rows ?? 1;

      /** Copy cellFormulas from the last existing row to each new row */
      const copyCellFormulasForNewRows = (
        s: SectionConfig,
        prevRows: number,
        nextRows: number,
      ): SectionConfig => {
        if (nextRows <= prevRows || !s.cellFormulas || !s.columns?.length)
          return s;
        const nextCellFormulas = { ...s.cellFormulas };
        const templateRowIdx = prevRows - 1;
        for (let newIdx = prevRows; newIdx < nextRows; newIdx++) {
          s.columns.forEach((col) => {
            const srcKey = `row${templateRowIdx}_${col.id}`;
            const destKey = `row${newIdx}_${col.id}`;
            if (nextCellFormulas[srcKey] !== undefined) {
              nextCellFormulas[destKey] = nextCellFormulas[srcKey];
            }
          });
        }
        return { ...s, cellFormulas: nextCellFormulas };
      };

      if (groupId != null && newRows !== undefined) {
        return {
          ...prev,
          structure: {
            ...prev.structure,
            sections: prev.structure.sections.map((s) => {
              if (s.id === sectionId) {
                const merged = { ...s, ...updates };
                return copyCellFormulasForNewRows(merged, oldRows, newRows);
              }
              if (s.rowCountLinkGroupId === groupId) {
                const prevR = s.rows ?? 1;
                return copyCellFormulasForNewRows(
                  { ...s, rows: newRows },
                  prevR,
                  newRows,
                );
              }
              return s;
            }),
          },
        };
      }

      return {
        ...prev,
        structure: {
          ...prev.structure,
          sections: prev.structure.sections.map((s) => {
            if (s.id !== sectionId) return s;
            const merged = { ...s, ...updates };
            if (newRows !== undefined) {
              return copyCellFormulasForNewRows(merged, oldRows, newRows);
            }
            return merged;
          }),
        },
      };
    });
    setIsDirty(true);
  };

  /** Link this section's row count with another table; both will stay in sync when adding/removing rows. */
  const linkRowCountWith = (
    currentSectionId: string,
    otherSectionId: string | null,
  ) => {
    if (!otherSectionId) {
      updateSection(currentSectionId, { rowCountLinkGroupId: undefined });
      return;
    }
    setTemplate((prev) => {
      const groupId = currentSectionId;
      const currentSection = prev.structure.sections.find(
        (s) => s.id === currentSectionId,
      );
      const otherSection = prev.structure.sections.find(
        (s) => s.id === otherSectionId,
      );
      const otherGroupId = otherSection?.rowCountLinkGroupId;
      const syncedRows = Math.max(
        currentSection?.rows ?? 1,
        otherSection?.rows ?? 1,
      );
      return {
        ...prev,
        structure: {
          ...prev.structure,
          sections: prev.structure.sections.map((s) => {
            if (s.id === currentSectionId)
              return { ...s, rowCountLinkGroupId: groupId, rows: syncedRows };
            if (s.id === otherSectionId)
              return { ...s, rowCountLinkGroupId: groupId, rows: syncedRows };
            if (otherGroupId != null && s.rowCountLinkGroupId === otherGroupId)
              return { ...s, rowCountLinkGroupId: groupId, rows: syncedRows };
            return s;
          }),
        },
      };
    });
    setIsDirty(true);
  };

  /** Append exactly one option to a table column's select field. Single setState so one click = one option. */
  const appendFieldOption = useCallback(
    (sectionId: string, columnIndex: number) => {
      setTemplate((prev) => {
        const sections = prev.structure.sections.map((s) => {
          if (s.id !== sectionId) return s;
          const columns = [...(s.columns || [])];
          const col = columns[columnIndex];
          if (!col?.field) return s;
          const currentOptions = col.field.options || [];
          columns[columnIndex] = {
            ...col,
            field: {
              ...col.field,
              options: [
                ...currentOptions,
                { label: "New option", value: "new-option" },
              ],
            },
          };
          return { ...s, columns };
        });
        return { ...prev, structure: { ...prev.structure, sections } };
      });
      setIsDirty(true);
    },
    [],
  );

  const appendOptionToSectionField = useCallback((sectionId: string) => {
    setTemplate((prev) => {
      const sections = prev.structure.sections.map((s) => {
        if (s.id !== sectionId || !s.field) return s;
        const currentOptions = s.field.options || [];
        return {
          ...s,
          field: {
            ...s.field,
            options: [
              ...currentOptions,
              { label: "New option", value: "new-option" },
            ],
          },
        };
      });
      return { ...prev, structure: { ...prev.structure, sections } };
    });
    setIsDirty(true);
  }, []);

  const appendOptionToSectionFieldsField = useCallback(
    (sectionId: string, fieldIndex: number) => {
      setTemplate((prev) => {
        const sections = prev.structure.sections.map((s) => {
          if (s.id !== sectionId || !s.fields?.[fieldIndex]) return s;
          const newFields = [...s.fields];
          const f = newFields[fieldIndex];
          newFields[fieldIndex] = {
            ...f,
            options: [
              ...(f.options || []),
              { label: "New option", value: "new-option" },
            ],
          };
          return { ...s, fields: newFields };
        });
        return { ...prev, structure: { ...prev.structure, sections } };
      });
      setIsDirty(true);
    },
    [],
  );

  const deleteSection = (sectionId: string) => {
    setTemplate((prev) => ({
      ...prev,
      structure: {
        ...prev.structure,
        sections: prev.structure.sections
          .filter((section) => section.id !== sectionId)
          .map((section, index) => ({ ...section, order: index })),
      },
    }));

    if (selectedSectionId === sectionId) {
      setSelectedSectionId(null);
    }
    setIsDirty(true);
    toast.success("Section removed");
  };

  const handleCellFormulaChange = (
    sectionId: string,
    rowIndex: number,
    colId: string,
    formula: string,
  ) => {
    setTemplate((prev) => {
      const sections = prev.structure.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const cellFormulas = { ...(s.cellFormulas || {}) };
        const key = `row${rowIndex}_${colId}`;
        if (formula.trim()) {
          cellFormulas[key] = formula;
        } else {
          delete cellFormulas[key];
        }
        return {
          ...s,
          cellFormulas:
            Object.keys(cellFormulas).length > 0 ? cellFormulas : undefined,
        };
      });
      return { ...prev, structure: { ...prev.structure, sections } };
    });
    setIsDirty(true);
  };

  const duplicateSection = (sectionId: string) => {
    const sectionToDuplicate = template.structure.sections.find(
      (s) => s.id === sectionId,
    );
    if (!sectionToDuplicate) return;

    const newSection: SectionConfig = {
      ...sectionToDuplicate,
      id: `section-${Date.now()}`,
      title: `${sectionToDuplicate.title} (Copy)`,
      order: template.structure.sections.length,
    };

    setTemplate((prev) => ({
      ...prev,
      structure: {
        ...prev.structure,
        sections: [...prev.structure.sections, newSection],
      },
    }));
    setIsDirty(true);
    toast.success("Section duplicated");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <div className="flex justify-center py-6">
            <LoadingSpinner size="md" />
          </div>
        </div>
      </div>
    );
  }

  const saveTooltipTitle = isSaving ? "Saving..." : "Save";
  const publishTooltipTitle = template.isPublished ? "Unpublish" : "Publish";
  const previewTooltipTitle = showPreview ? "Edit" : "Preview";
  const filteredNetaSections = netaSections.filter(
    (section) =>
      !netaSectionInput ||
      section.toLowerCase().includes(netaSectionInput.toLowerCase()),
  );
  const updateActionTooltip = (
    event: React.MouseEvent<HTMLElement>,
    text: string,
    borderClass = "border-green-600",
  ) => {
    setActionTooltip({
      text,
      x: event.clientX - 12,
      y: event.clientY + 14,
      borderClass,
    });
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-50 dark:bg-dark-200">
      {/* Top Bar */}
      <div className="bg-white dark:bg-dark-150 border-b dark:border-neutral-700 px-3 md:px-6 py-3 md:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (
                isDirty &&
                !confirm(
                  "You have unsaved changes. Are you sure you want to leave?",
                )
              ) {
                return;
              }
              navigate("/custom-forms/templates");
            }}
            className="!h-10 shrink-0 [&>span:first-child]:mr-0 md:[&>span:first-child]:mr-2"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            <span className="hidden md:inline">Back</span>
          </Button>

          <div className="grid flex-1 min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] lg:self-center">
            <div className="min-w-0 flex flex-col gap-1">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Form title
              </label>
              <Input
                value={template.name}
                onChange={(e) => {
                  setTemplate((prev) => ({ ...prev, name: e.target.value }));
                  setIsDirty(true);
                }}
                placeholder="Untitled form"
                className="h-10 text-base font-semibold md:text-lg"
              />
            </div>

            <div
              className="relative min-w-0 flex flex-col gap-1"
              ref={netaSectionInputRef}
            >
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                NETA section
              </label>
              <Input
                type="text"
                value={netaSectionInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setNetaSectionInput(value);
                  setTemplate((prev) => ({ ...prev, netaSection: value }));
                  setIsDirty(true);
                  setShowNetaSectionDropdown(true);
                }}
                onFocus={() => setShowNetaSectionDropdown(true)}
                onBlur={() => {
                  setTimeout(() => {
                    if (
                      !netaSectionInputRef.current?.contains(
                        document.activeElement,
                      )
                    ) {
                      setShowNetaSectionDropdown(false);
                    }
                  }, 200);
                }}
                className="h-10 w-full"
                placeholder="7.3.3, ATS, etc."
              />
              {showNetaSectionDropdown && (
                <div className="absolute z-50 w-full mt-1 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-dark-150">
                  <div className="max-h-60 overflow-y-auto py-1">
                    {filteredNetaSections.map((section) => (
                      <div
                        key={section}
                        className="group flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100"
                        onClick={() => {
                          setNetaSectionInput(section);
                          setTemplate((prev) => ({
                            ...prev,
                            netaSection: section,
                          }));
                          setIsDirty(true);
                          setShowNetaSectionDropdown(false);
                        }}
                      >
                        <span className="text-sm font-medium text-neutral-900 dark:text-white">
                          {section}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNetaSection(section);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-opacity"
                          title="Remove from saved sections"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {netaSectionInput.trim() &&
                      !netaSections.some(
                        (section) =>
                          section.toLowerCase() ===
                          netaSectionInput.trim().toLowerCase(),
                      ) && (
                        <div
                          className="px-3 py-2 cursor-pointer border-t border-neutral-100 bg-orange-50 text-sm font-medium text-[#f26722] hover:bg-orange-100 dark:border-neutral-700 dark:bg-orange-900/20"
                          onClick={async () => {
                            const success = await createNetaSection(
                              netaSectionInput.trim(),
                            );
                            if (success) {
                              setTemplate((prev) => ({
                                ...prev,
                                netaSection: netaSectionInput.trim(),
                              }));
                              setShowNetaSectionDropdown(false);
                              toast.success(
                                `"${netaSectionInput.trim()}" saved for future use`,
                              );
                            } else {
                              toast.error("Could not save NETA section");
                            }
                          }}
                        >
                          Save &quot;{netaSectionInput.trim()}&quot;
                        </div>
                      )}
                    {filteredNetaSections.length === 0 &&
                      !netaSectionInput.trim() && (
                        <div className="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                          No saved sections yet.
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex h-10 items-center gap-2 self-end lg:self-auto">
            <span
              className="inline-flex"
              onMouseEnter={(event) =>
                updateActionTooltip(
                  event,
                  previewTooltipTitle,
                  "border-purple-600",
                )
              }
              onMouseMove={(event) =>
                updateActionTooltip(
                  event,
                  previewTooltipTitle,
                  "border-purple-600",
                )
              }
              onMouseLeave={() => setActionTooltip(null)}
            >
              <Button
                onClick={() => setShowPreview(!showPreview)}
                variant="outline"
                className="!h-10 !w-10 !rounded-none !p-0 flex items-center justify-center border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-white bg-transparent hover:bg-transparent hover:border-purple-600 hover:text-purple-600 dark:hover:border-purple-400 dark:hover:text-purple-400 focus:outline-none focus:border-purple-600 focus:text-purple-600 focus:ring-2 focus:ring-purple-600/30 shadow-none shrink-0 [&>span:first-child]:mr-0"
                size="sm"
                aria-label={previewTooltipTitle}
                leftIcon={
                  showPreview ? (
                    <Edit className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )
                }
              />
            </span>

            <span
              className="inline-flex"
              onMouseEnter={(event) =>
                updateActionTooltip(event, saveTooltipTitle)
              }
              onMouseMove={(event) =>
                updateActionTooltip(event, saveTooltipTitle)
              }
              onMouseLeave={() => setActionTooltip(null)}
            >
              <Button
                onClick={handleSaveTemplate}
                disabled={isSaving || !isDirty}
                variant="outline"
                className="!h-10 !w-10 !rounded-none !p-0 flex items-center justify-center border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-white bg-transparent hover:bg-transparent hover:border-green-600 hover:text-green-600 dark:hover:border-green-600 dark:hover:text-green-400 focus:outline-none focus:border-green-600 focus:text-green-600 focus:ring-2 focus:ring-green-600/30 shadow-none shrink-0 [&>span:first-child]:mr-0"
                size="sm"
                aria-label={saveTooltipTitle}
                leftIcon={<Save className="w-5 h-5" />}
              />
            </span>

            <span
              className="inline-flex"
              onMouseEnter={(event) =>
                updateActionTooltip(event, publishTooltipTitle)
              }
              onMouseMove={(event) =>
                updateActionTooltip(event, publishTooltipTitle)
              }
              onMouseLeave={() => setActionTooltip(null)}
            >
              <Button
                onClick={handlePublishToggle}
                disabled={!template.id}
                variant="outline"
                className="!h-10 !w-10 !rounded-none !p-0 flex items-center justify-center border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-white bg-transparent hover:bg-transparent hover:border-green-600 hover:text-green-600 dark:hover:border-green-600 dark:hover:text-green-400 focus:outline-none focus:border-green-600 focus:text-green-600 focus:ring-2 focus:ring-green-600/30 shadow-none shrink-0 [&>span:first-child]:mr-0"
                size="sm"
                aria-label={template.isPublished ? "Unpublish" : "Publish"}
                leftIcon={
                  template.isPublished ? (
                    <Lock className="w-5 h-5" />
                  ) : (
                    <Globe className="w-5 h-5" />
                  )
                }
              />
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Left Sidebar - Component Library (Toggleable) */}
          {showSidebar ? (
            <ComponentLibrarySidebar
              savedComponents={savedComponents}
              onViewSavedComponent={(saved) => setViewingSavedComponent(saved)}
              onHide={() => setShowSidebar(false)}
            />
          ) : (
            <div className="w-12 shrink-0 bg-white dark:bg-dark-150 p-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSidebar(true)}
                title="Show component library"
                aria-label="Show component library"
                className="h-9 w-9 rounded-none p-0 [&>span:first-child]:mr-0 border-none"
                leftIcon={<PanelLeftOpen className="w-4 h-4" />}
              />
            </div>
          )}

          {/* Center - Form Canvas */}
          <div className="flex-1 overflow-auto p-4 md:p-6">
            {showPreview ? (
              <FormPreview template={template} />
            ) : (
              <FormCanvas
                sections={template.structure.sections}
                selectedSectionId={selectedSectionId}
                onSectionSelect={setSelectedSectionId}
                onSectionDelete={deleteSection}
                onSectionDuplicate={duplicateSection}
                formulaEditingSectionId={formulaEditingSectionId}
                onCellFormulaChange={handleCellFormulaChange}
                onRequestEditFormulas={(sectionId) => {
                  setSelectedSectionId(sectionId);
                  setFormulaEditingSectionId(sectionId);
                }}
              />
            )}

            {template.structure.sections.length === 0 && !showPreview && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md px-4">
                  <div className="text-neutral-400 dark:text-neutral-500 mb-4">
                    <LayoutPanelTop className="w-16 h-16 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
                    Start Building Your Form
                  </h3>
                  <Button
                    onClick={() => setShowSidebar(true)}
                    className="bg-[#f26722] hover:bg-[#e55611] border-none"
                    leftIcon={<PanelLeftOpen className="w-4 h-4" />}
                  >
                    Show Components
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar - Section Editor */}
          {selectedSectionId && (
            <SectionEditor
              section={
                template.structure.sections.find(
                  (s) => s.id === selectedSectionId,
                )!
              }
              allSections={template.structure.sections}
              onUpdate={(updates) => updateSection(selectedSectionId, updates)}
              onLinkRowCountWith={(otherSectionId) =>
                linkRowCountWith(selectedSectionId, otherSectionId)
              }
              onAppendFieldOption={appendFieldOption}
              onAppendOptionToSectionField={appendOptionToSectionField}
              onAppendOptionToSectionFieldsField={
                appendOptionToSectionFieldsField
              }
              onClose={() => {
                setSelectedSectionId(null);
                setFormulaEditingSectionId(null);
              }}
              isAdmin={isAdmin}
              isFormulaEditing={formulaEditingSectionId === selectedSectionId}
              onToggleFormulaEditing={() => {
                setFormulaEditingSectionId((prev) =>
                  prev === selectedSectionId ? null : selectedSectionId,
                );
              }}
              onSaveAsDefault={
                // Never allow overriding the CUSTOM_TABLE default — it must remain the original blank template.
                // Users should use "Save as new component" / "Update saved component" for their custom tables.
                template.structure.sections.find(
                  (s) => s.id === selectedSectionId,
                )?.componentType === ComponentType.CUSTOM_TABLE
                  ? undefined
                  : async (sectionFromEditor) => {
                      if (!sectionFromEditor || !user?.id) return;
                      const { error } = await saveComponentDefaultOverride(
                        sectionFromEditor.componentType,
                        sectionFromEditor,
                        user.id,
                      );
                      if (error) {
                        toast.error(
                          error.message ||
                            "Could not save as default. Only admins can save component defaults.",
                        );
                      } else {
                        const { id, order, ...rest } = sectionFromEditor;
                        setComponentDefaultOverrides((prev) => ({
                          ...prev,
                          [sectionFromEditor.componentType]:
                            rest as Partial<SectionConfig>,
                        }));
                        toast.success(
                          `Component default saved. "${sectionFromEditor.title}" will be used for new instances.`,
                          { duration: 5000 },
                        );
                      }
                      if (sectionFromEditor.savedComponentId) {
                        const updateErr = await updateSavedComponent(
                          sectionFromEditor.savedComponentId,
                          sectionFromEditor,
                        );
                        if (updateErr.error) {
                          toast.error(
                            updateErr.error.message ||
                              "Could not update saved component in library.",
                          );
                        } else {
                          refetchSavedComponents();
                        }
                      }
                    }
              }
              onSaveAsNewComponent={async (sectionFromEditor) => {
                if (!sectionFromEditor || !user?.id) {
                  if (!user?.id)
                    toast.error(
                      "You must be logged in to save a component to the library.",
                    );
                  return;
                }
                const defaultName =
                  (sectionFromEditor.title as string) || "Custom table";
                const name = window.prompt(
                  'Name this component for the library (e.g. "Insulation Resistance Table")',
                  defaultName,
                );
                if (!name?.trim()) return;
                const result = await saveSavedComponent(
                  name.trim(),
                  sectionFromEditor,
                  user.id,
                );
                if ("error" in result) {
                  toast.error(result.error.message);
                  return;
                }
                updateSection(sectionFromEditor.id, {
                  savedComponentId: result.id,
                } as Partial<SectionConfig>);
                refetchSavedComponents();
                toast.success(
                  `"${name}" saved to the library. Use "Update saved component" to push future edits.`,
                  { duration: 5000 },
                );
              }}
              onUpdateSavedComponent={async (sectionFromEditor) => {
                if (!sectionFromEditor?.savedComponentId || !user?.id) return;
                const updateErr = await updateSavedComponent(
                  sectionFromEditor.savedComponentId,
                  sectionFromEditor,
                );
                if (updateErr.error) {
                  toast.error(
                    updateErr.error.message ||
                      "Could not update saved component.",
                  );
                  return;
                }
                refetchSavedComponents();
                toast.success(
                  `Saved component "${sectionFromEditor.title}" updated in the library.`,
                  { duration: 5000 },
                );
              }}
            />
          )}

          <DragOverlay>
            {activeId ? (
              <div className="bg-white dark:bg-dark-150 p-4 rounded-none shadow-lg border-2 border-[#f26722]">
                Dragging...
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <SavedComponentsDialog
        open={!!viewingSavedComponent}
        onOpenChange={(open) => !open && setViewingSavedComponent(null)}
        savedComponents={viewingSavedComponent ? [viewingSavedComponent] : []}
        onRefetch={refetchSavedComponents}
        onAddToForm={(sectionConfig, savedComponentId, selectForEdit) => {
          addSectionFromSaved(
            sectionConfig,
            undefined,
            savedComponentId,
            selectForEdit ?? false,
          );
        }}
        onDelete={async (id) => {
          const { error } = await deleteSavedComponent(id);
          if (error) {
            toast.error(error.message || "Could not delete component.");
            throw error;
          }
          toast.success("Saved component removed from library.");
          setViewingSavedComponent(null);
        }}
      />

      {actionTooltip && (
        <div
          className={`pointer-events-none fixed z-[100] rounded-none border ${actionTooltip.borderClass} bg-white px-3 py-1 text-xs font-medium text-neutral-900 shadow-sm dark:bg-dark-150 dark:text-white`}
          style={{
            left: actionTooltip.x,
            top: actionTooltip.y,
            transform: "translateX(-100%)",
          }}
        >
          {actionTooltip.text}
        </div>
      )}
    </div>
  );
};

export default FormBuilder;
