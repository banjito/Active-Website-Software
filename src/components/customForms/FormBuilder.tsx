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

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
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
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Save,
  Eye,
  Settings,
  Plus,
  ArrowLeft,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

import { ComponentLibrarySidebar } from './ComponentLibrarySidebar';
import { FormCanvas } from './FormCanvas';
import { SectionEditor } from './SectionEditor';
import { FormPreview } from './FormPreview';

import {
  CustomFormTemplate,
  SectionConfig,
  ComponentType,
} from '@/lib/types/customForms';
import { getComponentDefinition } from '@/lib/customForms/componentLibrary';

export const FormBuilder: React.FC = () => {
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Form builder state
  const [template, setTemplate] = useState<CustomFormTemplate>({
    name: 'Untitled Form',
    description: '',
    netaSection: '',
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

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load existing template if editing
  useEffect(() => {
    if (templateId) {
      loadTemplate();
    }
  }, [templateId]);

  const loadTemplate = async () => {
    if (!templateId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('custom_form_templates')
        .select('*')
        .eq('id', templateId)
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
          structure: data.structure,
        });
      }
    } catch (error) {
      console.error('Error loading template:', error);
      toast.error('Failed to load template');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!user?.id) {
      toast.error('You must be logged in to save templates');
      console.error('No user ID found');
      return;
    }

    console.log('User ID:', user.id);
    console.log('Template name:', template.name);
    console.log('Sections count:', template.structure.sections.length);

    if (!template.name.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    if (template.structure.sections.length === 0) {
      toast.error('Please add at least one section to the form');
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
      };

      console.log('Attempting to save template data:', templateData);

      let result;
      if (template.id) {
        // Update existing template
        result = await supabase
          .schema('neta_ops')
          .from('custom_form_templates')
          .update(templateData)
          .eq('id', template.id)
          .select()
          .single();
      } else {
        // Create new template
        result = await supabase
          .schema('neta_ops')
          .from('custom_form_templates')
          .insert(templateData)
          .select()
          .single();
      }

      if (result.error) {
        console.error('Supabase error details:', result.error);
        throw result.error;
      }

      if (!result.data) {
        throw new Error('No data returned from database');
      }

      setTemplate(prev => ({ ...prev, id: result.data.id }));
      setIsDirty(false);
      toast.success(`Template ${template.id ? 'updated' : 'saved'} successfully!`);

      // Navigate to template list after saving
      setTimeout(() => {
        navigate('/custom-forms/templates');
      }, 1000);
    } catch (error: any) {
      console.error('Error saving template:', error);
      console.error('Error details:', {
        message: error?.message,
        hint: error?.hint,
        details: error?.details,
        code: error?.code,
        fullError: JSON.stringify(error)
      });
      toast.error(`Failed to save template: ${error?.message || error?.hint || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
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

    // If dropping a component from the library
    if (active.data.current?.type === 'library-component') {
      const componentType = active.id as ComponentType;
      addSection(componentType);
    }
    // If reordering existing sections
    else if (active.id !== over.id) {
      const oldIndex = template.structure.sections.findIndex(s => s.id === active.id);
      const newIndex = template.structure.sections.findIndex(s => s.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newSections = arrayMove(template.structure.sections, oldIndex, newIndex);
        // Update order property
        const updatedSections = newSections.map((section, index) => ({
          ...section,
          order: index,
        }));

        setTemplate(prev => ({
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

  const addSection = (componentType: ComponentType) => {
    const componentDef = getComponentDefinition(componentType);
    if (!componentDef) return;

    const newSection: SectionConfig = {
      id: `section-${Date.now()}`,
      componentType: componentType,
      title: componentDef.defaultConfig.title || componentDef.name,
      order: template.structure.sections.length,
      showInPrint: true,
      ...componentDef.defaultConfig,
    };

    setTemplate(prev => ({
      ...prev,
      structure: {
        ...prev.structure,
        sections: [...prev.structure.sections, newSection],
      },
    }));

    setSelectedSectionId(newSection.id);
    setIsDirty(true);
    toast.success(`Added ${componentDef.name}`);
  };

  const updateSection = (sectionId: string, updates: Partial<SectionConfig>) => {
    setTemplate(prev => ({
      ...prev,
      structure: {
        ...prev.structure,
        sections: prev.structure.sections.map(section =>
          section.id === sectionId ? { ...section, ...updates } : section
        ),
      },
    }));
    setIsDirty(true);
  };

  const deleteSection = (sectionId: string) => {
    setTemplate(prev => ({
      ...prev,
      structure: {
        ...prev.structure,
        sections: prev.structure.sections
          .filter(section => section.id !== sectionId)
          .map((section, index) => ({ ...section, order: index })),
      },
    }));

    if (selectedSectionId === sectionId) {
      setSelectedSectionId(null);
    }
    setIsDirty(true);
    toast.success('Section removed');
  };

  const duplicateSection = (sectionId: string) => {
    const sectionToDuplicate = template.structure.sections.find(s => s.id === sectionId);
    if (!sectionToDuplicate) return;

    const newSection: SectionConfig = {
      ...sectionToDuplicate,
      id: `section-${Date.now()}`,
      title: `${sectionToDuplicate.title} (Copy)`,
      order: template.structure.sections.length,
    };

    setTemplate(prev => ({
      ...prev,
      structure: {
        ...prev.structure,
        sections: [...prev.structure.sections, newSection],
      },
    }));
    setIsDirty(true);
    toast.success('Section duplicated');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p>Loading template...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-dark-200">
      {/* Top Bar */}
      <div className="bg-white dark:bg-dark-150 border-b dark:border-gray-700 px-3 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between gap-2 md:gap-4 mb-2 md:mb-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (isDirty && !confirm('You have unsaved changes. Are you sure you want to leave?')) {
                return;
              }
              navigate('/custom-forms/templates');
            }}
            className="shrink-0"
          >
            <ArrowLeft className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Back</span>
          </Button>

          <div className="flex-1 min-w-0 px-2">
            <Input
              value={template.name}
              onChange={(e) => {
                setTemplate(prev => ({ ...prev, name: e.target.value }));
                setIsDirty(true);
              }}
              placeholder="Form Name"
              className="text-sm md:text-lg font-semibold"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSidebar(!showSidebar)}
              title={showSidebar ? 'Hide Components' : 'Show Components'}
              size="sm"
              className="shrink-0"
            >
              {showSidebar ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </Button>

            <Button
              onClick={handleSaveTemplate}
              disabled={isSaving || !isDirty}
              className="bg-[#f26722] hover:bg-[#e55611] shrink-0"
              size="sm"
            >
              <Save className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">{isSaving ? 'Saving...' : 'Save'}</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <select
            value={template.netaSection || ''}
            onChange={(e) => {
              setTemplate(prev => ({ ...prev, netaSection: e.target.value }));
              setIsDirty(true);
            }}
            className="flex-1 px-2 md:px-3 py-1.5 md:py-2 text-sm bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722] text-gray-900 dark:text-white"
          >
            <option value="">NETA Section</option>
            <option value="ATS">ATS</option>
            <option value="MTS">MTS</option>
            <option value="ATS 7.3.3">ATS 7.3.3</option>
            <option value="MTS 4.2">MTS 4.2</option>
            <option value="Custom">Custom</option>
          </select>

          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
            size="sm"
            className="shrink-0"
          >
            <Eye className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">{showPreview ? 'Edit' : 'Preview'}</span>
          </Button>
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
          {showSidebar && <ComponentLibrarySidebar />}

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
              />
            )}

            {template.structure.sections.length === 0 && !showPreview && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md px-4">
                  <div className="text-gray-400 dark:text-gray-500 mb-4">
                    <Plus className="w-16 h-16 mx-auto" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Start Building Your Form
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Click the components button <PanelLeftOpen className="inline w-4 h-4" /> above to add sections to your form.
                  </p>
                  <Button
                    onClick={() => setShowSidebar(true)}
                    className="bg-[#f26722] hover:bg-[#e55611]"
                  >
                    <PanelLeftOpen className="w-4 h-4 mr-2" />
                    Show Components
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar - Section Editor */}
          {selectedSectionId && (
            <SectionEditor
              section={template.structure.sections.find(s => s.id === selectedSectionId)!}
              onUpdate={(updates) => updateSection(selectedSectionId, updates)}
              onClose={() => setSelectedSectionId(null)}
            />
          )}

          <DragOverlay>
            {activeId ? (
              <div className="bg-white dark:bg-dark-150 p-4 rounded-lg shadow-lg border-2 border-[#f26722]">
                Dragging...
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
};

export default FormBuilder;


