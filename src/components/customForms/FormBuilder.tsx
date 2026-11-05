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
import {
  getActiveTemplateVersion,
  publicationStatus,
  publishTemplateVersion,
} from "@/lib/customForms/versioning";
import type { TemplatePublicationStatus } from "@/lib/types/customForms";
import { TypedCalculationEditor } from "@/components/customForms/TypedCalculationEditor";
import {
  validateTemplateDraft,
  type ValidationReport,
} from "@/lib/customForms/compile";
import { toast } from "react-hot-toast";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
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

  Globe,
  LayoutPanelTop,
  Lock,
  Trash2,
  AlertTriangle,
  ListOrdered,
  FileCode2,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

import { ReflowDialog } from "./ReflowDialog";
import { EquipmentTypesDialog } from "./EquipmentTypesDialog";
import { fetchEquipmentTypeList } from "@/lib/customForms/equipmentTypes";
import { useLookupTables } from "@/lib/customForms/lookupLibrary";
import type { ComponentVariant } from "@/lib/customForms/componentVariants";
import { FormCanvas } from "./FormCanvas";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  getSectionReferenceCode,
  withFreeReferenceCode,
} from "@/lib/customForms/formCellResolution";
import {
  insertIndexForDrop,
  moveUnit,
  placeAfterSection,
  replaceSectionInLayout,
  tidyLayout,
} from "@/lib/customForms/layoutGroups";
import { SectionEditor } from "./SectionEditor";

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
  type SavedComponent,
} from "@/lib/customForms/savedComponents";
import {
  applyVariant,
  appliedVariantOf,
  stripLibraryMeta,
  keepLibraryMeta,
  variantsOf,
} from "@/lib/customForms/componentVariants";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useReportCssIsolation } from "./runtime/useReportCssIsolation";
import { regenerateSectionWithPrompt } from "@/lib/customForms/excel/generate";


/**
 * What a drag is over: whatever is under the pointer, preferring a section or
 * group to the canvas around them. Plain closest-centre often picked the big
 * canvas, whose middle is nearer than a section's, and dropped at the end.
 * Keyboard drags have no pointer and fall back to closest-centre.
 */
const builderCollisions: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  const specific = under.filter((collision) => collision.id !== "form-canvas");
  if (specific.length > 0) return specific;
  if (under.length > 0) return under;
  return closestCenter(args);
};

/**
 * Where the pointer was when a drag ended, or null for a keyboard drag.
 * `tracked` is the last position the window saw. dnd-kit's own delta also
 * counts scrolling in whichever box the drag is over, which pushed drops on
 * the top half of the first section to after it.
 */
function pointerY(event: DragEndEvent, tracked: number | null): number | null {
  const start = event.activatorEvent as (MouseEvent & TouchEvent) | null;
  const y = start?.touches?.[0]?.clientY ?? start?.clientY;
  if (typeof y !== "number") return null;
  return tracked ?? y + event.delta.y;
}

/** The on-screen box of whatever the drag ended over, measured now. */
function overNode(event: DragEndEvent): HTMLElement | null {
  const hit = event.collisions?.find((collision) => collision.id === event.over?.id);
  return (hit?.data?.droppableContainer?.node?.current as HTMLElement | null) ?? null;
}

export const FormBuilder: React.FC = () => {
  useReportCssIsolation();
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

  const [isPublishing, setIsPublishing] = useState(false);
  /**
   * Whether the draft differs from the version forms are created against.
   *
   * Publishing used to be a plain toggle, so once a template was published the
   * button only ever unpublished it and there was no way to release a change.
   * A template could sit at version 1 forever while its draft moved on, and
   * every form kept rendering the old structure with no sign anything was
   * wrong.
   */
  const [publishState, setPublishState] = useState<TemplatePublicationStatus>(
    "unpublished",
  );

  useEffect(() => {
    let cancelled = false;
    if (!template.id) {
      setPublishState("unpublished");
      return;
    }
    (async () => {
      const active = await getActiveTemplateVersion(template.id!);
      const status = await publicationStatus(template, active);
      if (!cancelled) setPublishState(status);
    })();
    return () => {
      cancelled = true;
    };
  }, [template]);
  // Draft validation. Drafts may be saved with errors; publishing may not.
  const [validationReport, setValidationReport] =
    useState<ValidationReport | null>(null);

  useEffect(() => {
    setValidationReport(validateTemplateDraft(template.structure));
  }, [template.structure]);

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [formulaEditingSectionId, setFormulaEditingSectionId] = useState<
    string | null
  >(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // The pointer's last on-screen height, read when a drag ends.
  const lastPointerY = useRef<number | null>(null);
  useEffect(() => {
    const track = (event: PointerEvent) => {
      lastPointerY.current = event.clientY;
    };
    window.addEventListener("pointerdown", track, { capture: true, passive: true });
    window.addEventListener("pointermove", track, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", track, true);
      window.removeEventListener("pointermove", track, true);
    };
  }, []);
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

  /** Saves the draft. Resolves to the template id, or null if it did not save. */
  /** The save in progress, so Preview can wait for it instead of being ignored. */
  const saveInFlight = useRef<Promise<string | null> | null>(null);

  const handleSaveTemplate = (
    options: { quiet?: boolean } = {},
  ): Promise<string | null> => {
    const pending = saveTemplateNow(options);
    saveInFlight.current = pending;
    void pending.finally(() => {
      if (saveInFlight.current === pending) saveInFlight.current = null;
    });
    return pending;
  };

  const saveTemplateNow = async (
    options: { quiet?: boolean } = {},
  ): Promise<string | null> => {
    if (!user?.id) {
      toast.error("You must be logged in to save templates");
      console.error("No user ID found");
      return null;
    }

    if (!template.name.trim()) {
      toast.error("Please enter a template name");
      return null;
    }

    if (template.structure.sections.length === 0) {
      toast.error("Please add at least one section to the form");
      return null;
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
      // Stay in the builder. Saving used to bounce back to the template list a
      // second later, which loses your place mid-edit and reads as though the
      // button did nothing. Leaving is what the Back button is for.
      if (!options.quiet) {
        toast.success(template.id ? "Changes saved" : "Template saved");
      }
      return result.data.id as string;
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
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Open the full-page preview.
   *
   * That page loads the template from the database, and returning from it
   * remounts this editor from the database too. So unsaved edits are saved
   * first: otherwise the preview shows stale content and coming back throws
   * the edits away.
   */
  const handleOpenPreview = async () => {
    let id = template.id ?? null;
    let dirty = isDirty;
    // Clicked while a save is still running: wait for it, and use the id it
    // returns. The button used to be disabled during a save, so a click right
    // after Save did nothing and needed repeating.
    const pending = saveInFlight.current;
    if (pending) {
      const savedId = await pending;
      if (!savedId) return; // save already explained why
      id = savedId;
      dirty = false;
    }
    if (!id || dirty) {
      id = await handleSaveTemplate({ quiet: true });
      if (!id) return; // save already explained why
    }
    navigate(`/custom-forms/preview/${id}`, { state: { from: "builder" } });
  };

  /**
   * Publishing freezes the draft as a new immutable version. Forms created
   * from here on are pinned to it, so later edits to the draft cannot change
   * a report that has already been filled in and signed.
   *
   * Unpublishing only hides the template from jobs. Published versions are
   * never deleted, because instances point at them.
   */
  const handlePublishToggle = async () => {
    if (!template.id) {
      toast.error("Please save the template first before publishing");
      return;
    }

    // Only unpublish when there is nothing waiting to be released. A published
    // template whose draft has changed needs a NEW VERSION, not a toggle off.
    if (template.isPublished && publishState === "published") {
      try {
        const { error } = await supabase
          .schema("neta_ops")
          .from("custom_form_templates")
          .update({ is_published: false })
          .eq("id", template.id);
        if (error) throw error;
        setTemplate((prev) => ({ ...prev, isPublished: false }));
        setPublishState("unpublished");
        toast.success(
          "Template unpublished. It will no longer appear in jobs. Existing forms keep the version they were filled against.",
        );
      } catch (error: any) {
        console.error("Error unpublishing template:", error);
        toast.error("Failed to unpublish template");
      }
      return;
    }

    setIsPublishing(true);
    try {
      const result = await publishTemplateVersion(template, {
        userId: user?.id,
      });

      if (!result.ok) {
        setValidationReport(result.report);
        const firstError = result.report.errors[0];
        toast.error(
          result.error ??
            (firstError
              ? `Cannot publish: ${firstError.message}`
              : "Cannot publish: the template did not compile."),
        );
        return;
      }

      setValidationReport(result.report);
      setTemplate((prev) => ({
        ...prev,
        isPublished: true,
        activeVersionId: result.version!.id,
        latestVersion: result.version!.version,
      }));
      setPublishState("published");
      toast.success(
        `Published version ${result.version!.version}. New forms will use it; forms already filled in keep the version they were made with.`,
      );
    } catch (error: any) {
      console.error("Error publishing template:", error);
      toast.error(error?.message ?? "Failed to publish template");
    } finally {
      setIsPublishing(false);
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
    // Dropped on the lower half of a section: it goes after it, not before.
    // Judged by the pointer, not the dragged card, whose middle can sit well
    // below the pointer depending on where it was picked up.
    // Both measured now, so scrolling during the drag cannot skew them.
    const dropY = pointerY(event, lastPointerY.current);
    const node = overNode(event);
    const overRect = node?.getBoundingClientRect() ?? over.rect;
    const dropAfter =
      dropY !== null && dropY > overRect.top + overRect.height / 2;
    // Dropped on the empty canvas above the first section, such as the hint
    // line: that means the top of the form, not the end.
    const firstUnit =
      over.id === "form-canvas" ? node?.querySelector("[data-layout-unit]") : null;
    const dropIndex =
      firstUnit && dropY !== null && dropY < firstUnit.getBoundingClientRect().top
        ? 0
        : insertIndexForDrop(template.structure, String(over.id), dropAfter);

    if (active.data.current?.type === "library-component") {
      const componentType = active.id as ComponentType;
      addSection(componentType, dropIndex);
    }
    // If dropping a saved component (custom table etc.) — add section from saved config
    else if (active.data.current?.type === "saved-component") {
      const { sectionConfig, name, savedComponentId } = active.data.current as {
        sectionConfig: SectionConfig;
        name: string;
        savedComponentId: string;
      };
      addSectionFromSaved(sectionConfig, dropIndex, savedComponentId);
      toast.success(`Added ${name}`);
    }
    // If reordering: a section or a whole group takes the target's place
    else if (active.id !== over.id) {
      setTemplate((prev) => ({
        ...prev,
        structure: moveUnit(prev.structure, String(active.id), String(over.id)),
      }));
      setIsDirty(true);
    }

    setActiveId(null);
  };

  /** A new section for a built-in (or one of its variants), not yet placed. */
  const buildBuiltinSection = (
    componentType: ComponentType,
    variantId?: string,
  ): SectionConfig | null => {
    const componentDef = getComponentDefinition(componentType);
    if (!componentDef) return null;
    const fullDefault = getMergedDefaultConfig(componentType, componentDefaultOverrides);
    const config = applyVariant(
      fullDefault,
      variantsOf(fullDefault).find((v) => v.id === variantId),
    );
    return {
      ...config,
      id: `section-${Date.now()}`,
      componentType,
      title: (config.title as string) || componentDef.name,
      order: 0,
      showInPrint: config.showInPrint !== false,
    } as SectionConfig;
  };

  /** A new section from a saved component (or one of its variants), not yet placed. */
  const buildSavedSection = (
    saved: SavedComponent,
    variant?: ComponentVariant,
  ): SectionConfig => {
    const config = applyVariant(saved.section_config, variant);
    return {
      ...stripLibraryMeta(config),
      ...(config.appliedVariant ? { appliedVariant: config.appliedVariant } : {}),
      id: `section-${Date.now()}`,
      order: 0,
      showInPrint: config.showInPrint !== false,
      // A variant copy is not linked back: "Update saved component" would
      // overwrite the full component with the trimmed one.
      ...(variant ? {} : { savedComponentId: saved.id }),
    } as SectionConfig;
  };

  const [reflowOpen, setReflowOpen] = useState(false);
  // The equipment types list, for the template's "Equipment" picker.
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  useEffect(() => {
    fetchEquipmentTypeList().then(setEquipmentOptions).catch(() => setEquipmentOptions([]));
  }, []);
  const equipmentType = template.structure.settings?.equipmentType;
  // Formulas may read the shared lookup tables; re-render once they load.
  useLookupTables();

  const addSection = (
    componentType: ComponentType,
    insertAtIndex?: number,
    variantId?: string,
  ) => {
    const componentDef = getComponentDefinition(componentType);
    if (!componentDef) return;

    const fullDefault = getMergedDefaultConfig(
      componentType,
      componentDefaultOverrides,
    );
    // The section gets a plain copy: the chosen variant applied, no variant data.
    const mergedDefault = applyVariant(
      fullDefault,
      variantsOf(fullDefault).find((v) => v.id === variantId),
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
      const sections = [...prev.structure.sections].sort((a, b) => a.order - b.order);
      sections.splice(index, 0, withFreeReferenceCode(newSection, sections));
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
      // Library-only data (variants, category) never goes into a form; a
      // variant, if chosen, was applied by the caller.
      ...stripLibraryMeta(savedConfig),
      ...("appliedVariant" in savedConfig && savedConfig.appliedVariant
        ? { appliedVariant: savedConfig.appliedVariant }
        : {}),
      id: `section-${Date.now()}`,
      order: index,
      showInPrint: savedConfig.showInPrint !== false,
      ...(savedComponentId ? { savedComponentId } : {}),
    } as SectionConfig;

    setTemplate((prev) => {
      const sections = [...prev.structure.sections].sort((a, b) => a.order - b.order);
      sections.splice(index, 0, withFreeReferenceCode(newSection, sections));
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
      structure: tidyLayout({
        ...prev.structure,
        sections: prev.structure.sections
          .filter((section) => section.id !== sectionId)
          .map((section, index) => ({ ...section, order: index })),
      }),
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

  /**
   * Replace a section with one rebuilt from a written instruction.
   *
   * Everything else in the form is left alone, including the section's place in
   * the order and its reference code, which formulas elsewhere may point at.
   */
  const regenerateSection = async (sectionId: string, instruction: string) => {
    const section = template.structure.sections.find((entry) => entry.id === sectionId);
    if (!section) return;
    if (template.structure.expressions !== undefined) {
      throw new Error(
        "This template uses typed calculations. Rebuilding a section would leave its formulas pointing at fields that no longer exist.",
      );
    }
    const rebuilt = await regenerateSectionWithPrompt(section, instruction);
    if (!rebuilt?.length) throw new Error("Nothing usable came back. Try describing the section differently.");

    setTemplate((prev) => ({
      ...prev,
      structure: replaceSectionInLayout(
        {
          ...prev.structure,
          sections: prev.structure.sections
            .flatMap((entry) => (entry.id === sectionId ? rebuilt : [entry]))
            .map((entry, order) => ({ ...entry, order })),
        },
        sectionId,
        rebuilt.map((entry) => entry.id),
      ),
    }));
    setIsDirty(true);
    toast.success(`Rebuilt "${section.title}". Check it before saving.`);
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
      // The copy's code comes from the original's (COM gives COM2), not from
      // the "(Copy)" title, which made codes like "C(".
      referenceCode: getSectionReferenceCode(sectionToDuplicate),
      order: template.structure.sections.length,
    };

    setTemplate((prev) => ({
      ...prev,
      structure: placeAfterSection(
        prev.structure,
        sectionId,
        withFreeReferenceCode(newSection, prev.structure.sections),
      ),
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
  const publishTooltipTitle =
    publishState === "draft_ahead_of_published"
      ? "Publish changes — forms still use the last published version"
      : template.isPublished
        ? "Unpublish"
        : "Publish";
  const previewTooltipTitle = isDirty ? "Save and preview" : "Preview";
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
    // The whole page scrolls (header included), so the top bar can be scrolled past.
    <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-dark-200">
      {/* Top Bar */}
      <div className="bg-white dark:bg-dark-150 border-b dark:border-neutral-700 px-3 md:px-6 py-3 md:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (
                isDirty &&
                !(await confirmDialog({
                  title: "Leave without saving?",
                  description: "Your unsaved changes to this template will be lost.",
                  confirmLabel: "Leave",
                  cancelLabel: "Stay",
                  destructive: true,
                }))
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

          <div className="grid flex-1 min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_clamp(160px,22%,260px)_clamp(160px,22%,260px)] lg:self-center">
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

            {/* Which equipment this form tests: its components are offered first. */}
            <div className="min-w-0 flex flex-col gap-1">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Equipment type
              </label>
              <select
                value={equipmentType ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__manage") {
                    setEquipmentDialogOpen(true);
                    return;
                  }
                  const value = e.target.value || undefined;
                  setTemplate((prev) => ({
                    ...prev,
                    structure: {
                      ...prev.structure,
                      settings: { ...(prev.structure.settings as any), equipmentType: value },
                    },
                  }));
                  setIsDirty(true);
                }}
                className="h-10 px-2 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-700 rounded-none text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand"
                title="Components for this equipment (and Global ones) are offered first when adding"
              >
                <option value="">Any equipment</option>
                {equipmentOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {equipmentType && !equipmentOptions.includes(equipmentType) && (
                  <option value={equipmentType}>{equipmentType}</option>
                )}
                <option value="__manage">Edit the list…</option>
              </select>
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
                          className="opacity-0 touch:opacity-100 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-opacity"
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
                          className="px-3 py-2 cursor-pointer border-t border-neutral-100 bg-orange-50 text-sm font-medium text-brand hover:bg-orange-100 dark:border-neutral-700 dark:bg-orange-900/20"
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
                onClick={handleOpenPreview}
                variant="outline"
                className="!h-10 !w-10 !rounded-none !p-0 flex items-center justify-center border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-white bg-transparent hover:bg-transparent hover:border-purple-600 hover:text-purple-600 dark:hover:border-purple-400 dark:hover:text-purple-400 focus:outline-none focus:border-purple-600 focus:text-purple-600 focus:ring-2 focus:ring-purple-600/30 shadow-none shrink-0 [&>span:first-child]:mr-0"
                size="sm"
                aria-label={previewTooltipTitle}
                leftIcon={<Eye className="w-5 h-5" />}
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
                onClick={() => handleSaveTemplate()}
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
                disabled={!template.id || isPublishing}
                variant="outline"
                className="!h-10 !w-10 !rounded-none !p-0 flex items-center justify-center border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-white bg-transparent hover:bg-transparent hover:border-green-600 hover:text-green-600 dark:hover:border-green-600 dark:hover:text-green-400 focus:outline-none focus:border-green-600 focus:text-green-600 focus:ring-2 focus:ring-green-600/30 shadow-none shrink-0 [&>span:first-child]:mr-0"
                size="sm"
                aria-label={publishTooltipTitle}
                leftIcon={
                  template.isPublished &&
                  publishState !== "draft_ahead_of_published" ? (
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
      <div className="flex-1 flex">
        <DndContext
          sensors={sensors}
          collisionDetection={builderCollisions}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Center - Form Canvas */}
          <div className="flex-1 min-w-0 p-4 md:p-6 lg:min-w-[min(26rem,50%)]">
            {/* Typed calculations, publish and validation notices scroll with
                the canvas instead of staying frozen above it. */}
            <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6 mb-4">
            <TypedCalculationEditor
              structure={template.structure}
              onChange={(structure) => {
                setTemplate((previous) => ({ ...previous, structure }));
                setIsDirty(true);
                setFormulaEditingSectionId(null);
              }}
            />

            {/* Unpublished changes. Forms render the published version, so a draft
                that has moved on is invisible in the app until it is released. */}
            {publishState === "draft_ahead_of_published" && (
              <div className="shrink-0 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">
                  This draft has changes that are not published. New forms still use
                  the last published version.
                </span>
                <button
                  type="button"
                  onClick={handlePublishToggle}
                  disabled={isPublishing}
                  className="shrink-0 px-2 py-1 font-medium rounded border border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
                >
                  {isPublishing ? "Publishing…" : "Publish changes"}
                </button>
              </div>
            )}

            {/* Draft validation. Drafts save with errors; publishing does not. */}
            {validationReport && validationReport.issues.length > 0 && (
              <div
                className={`shrink-0 border-b px-4 py-2 text-xs ${
                  validationReport.ok
                    ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200"
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {validationReport.errors.length > 0
                    ? `${validationReport.errors.length} problem${validationReport.errors.length === 1 ? "" : "s"} blocking publication`
                    : `${validationReport.warnings.length} warning${validationReport.warnings.length === 1 ? "" : "s"}`}
                </div>
                <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                  {[...validationReport.errors, ...validationReport.warnings]
                    .slice(0, 8)
                    .map((issue, index) => (
                      <li key={`${issue.code}-${index}`} className="flex gap-1.5">
                        <span className="font-mono opacity-60 shrink-0">
                          {issue.severity === "error" ? "error" : "warn"}
                        </span>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                  {validationReport.issues.length > 8 && (
                    <li className="opacity-70">
                      and {validationReport.issues.length - 8} more
                    </li>
                  )}
                </ul>
              </div>
            )}
            </div>
            {/* Formulas are edited on the canvas, so the section editor modal
                steps aside meanwhile. "Done" brings it back. */}
            {formulaEditingSectionId && (
              <div className="sticky top-0 z-20 mb-4 flex items-center justify-between gap-3 rounded-none border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-100 min-w-0">
                  <FileCode2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    Editing formulas for "
                    {template.structure.sections.find(
                      (s) => s.id === formulaEditingSectionId,
                    )?.title ?? "section"}
                    "
                  </span>
                </span>
                <Button
                  size="sm"
                  onClick={() => setFormulaEditingSectionId(null)}
                  className="rounded-none bg-brand hover:bg-brand-dark border-none shrink-0"
                >
                  Done
                </Button>
              </div>
            )}
            {template.structure.sections.length > 0 && (
              <div className="mb-3 flex items-center justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReflowOpen(true)}
                  title="Reorder and add components"
                  leftIcon={<ListOrdered className="w-4 h-4" />}
                >
                  Re-flow / add components
                </Button>
              </div>
            )}
            <EquipmentTypesDialog
              open={equipmentDialogOpen}
              onClose={() => setEquipmentDialogOpen(false)}
              onChanged={(list) => {
                setEquipmentOptions(list);
                refetchSavedComponents();
              }}
            />
            <ReflowDialog
              open={reflowOpen}
              structure={template.structure}
              savedComponents={savedComponents}
              builtinOverrides={componentDefaultOverrides}
              equipmentType={equipmentType}
              makeBuiltinSection={buildBuiltinSection}
              makeSavedSection={buildSavedSection}
              onApply={(structure) => {
                setTemplate((prev) => ({ ...prev, structure }));
                setIsDirty(true);
                setSelectedSectionId(null);
                setFormulaEditingSectionId(null);
              }}
              onClose={() => setReflowOpen(false)}
            />
            <FormCanvas
              sections={template.structure.sections}
              structure={template.structure}
              onStructureChange={(update) => {
                setTemplate((prev) => ({ ...prev, structure: update(prev.structure) }));
                setIsDirty(true);
              }}
              selectedSectionId={selectedSectionId}
              onSectionSelect={setSelectedSectionId}
              onSectionDelete={deleteSection}
              onSectionDuplicate={duplicateSection}
              onSectionRegenerate={regenerateSection}
              formulaEditingSectionId={formulaEditingSectionId}
              onCellFormulaChange={handleCellFormulaChange}
              reorderable={false}
              onRequestEditFormulas={(sectionId) => {
                if (template.structure.expressions !== undefined) {
                  toast("Use the Typed calculations panel above to edit stable formulas.");
                  return;
                }
                setSelectedSectionId(sectionId);
                setFormulaEditingSectionId(sectionId);
              }}
            />

            {template.structure.sections.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md px-4">
                  <div className="text-neutral-400 dark:text-neutral-500 mb-4">
                    <LayoutPanelTop className="w-16 h-16 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
                    Start Building Your Form
                  </h3>
                  <Button
                    onClick={() => setReflowOpen(true)}
                    className="bg-brand hover:bg-brand-dark border-none"
                    leftIcon={<Plus className="w-4 h-4" />}
                  >
                    Add components
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Section Editor modal - hidden while that section's formulas are edited on the canvas */}
          {selectedSectionId && formulaEditingSectionId !== selectedSectionId && (
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
                if (template.structure.expressions !== undefined) {
                  toast("Use the Typed calculations panel above to edit stable formulas.");
                  return;
                }
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
                  : async (editedSection) => {
                      if (!editedSection || !user?.id) return;
                      if (appliedVariantOf(editedSection)) {
                        toast.error(
                          `This section is the "${appliedVariantOf(editedSection)}" variant, so it can't become the default. Edit the component in the component editor instead.`,
                          { duration: 6000 },
                        );
                        return;
                      }
                      // Keep the default's variants, which a form section never carries.
                      const sectionFromEditor = keepLibraryMeta(
                        editedSection,
                        componentDefaultOverrides[editedSection.componentType],
                      );
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
                          keepLibraryMeta(
                            editedSection,
                            savedComponents.find(
                              (s) => s.id === sectionFromEditor.savedComponentId,
                            )?.section_config,
                          ),
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
                  // A new component starts fresh, even if this section came from a variant.
                  { ...sectionFromEditor, appliedVariant: undefined } as SectionConfig,
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
                if (appliedVariantOf(sectionFromEditor)) {
                  toast.error(
                    "This section is a variant copy, so it can't overwrite the full component. Edit the component in the component editor instead.",
                  );
                  return;
                }
                const updateErr = await updateSavedComponent(
                  sectionFromEditor.savedComponentId,
                  keepLibraryMeta(
                    sectionFromEditor,
                    savedComponents.find(
                      (s) => s.id === sectionFromEditor.savedComponentId,
                    )?.section_config,
                  ),
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

          <DragOverlay dropAnimation={null}>
            {activeId ? (
              <div className="bg-white dark:bg-dark-150 p-4 rounded-none shadow-lg border-2 border-brand">
                Dragging...
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

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
