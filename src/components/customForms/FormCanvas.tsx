/**
 * Form Canvas
 * 
 * The main drag-and-drop area where form sections are displayed and arranged.
 * Sections can be reordered, selected for editing, duplicated, or deleted.
 */

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Trash2,
  Copy,
  Settings,
  Eye,
  EyeOff,
} from 'lucide-react';

import { SectionConfig } from '@/lib/types/customForms';
import { getComponentDefinition } from '@/lib/customForms/componentLibrary';

interface SortableSectionProps {
  section: SectionConfig;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const SortableSection: React.FC<SortableSectionProps> = ({
  section,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const componentDef = getComponentDefinition(section.componentType);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-dark-150 border-2 rounded-lg transition-all ${
        isSelected
          ? 'border-[#f26722] shadow-lg'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      {/* Section Header */}
      <div
        className={`flex items-center gap-2 md:gap-3 px-2 md:px-4 py-2 md:py-3 border-b ${
          isSelected
            ? 'border-[#f26722] bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-200 dark:border-gray-700'
        }`}
      >
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hidden md:block"
        >
          <GripVertical className="w-4 h-4 md:w-5 md:h-5" />
        </button>

        {/* Section Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs md:text-sm font-semibold text-gray-900 dark:text-white truncate">
              {section.title}
            </h3>
            {!section.showInPrint && (
              <span className="hidden md:flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <EyeOff className="w-3 h-3" />
                Hidden in print
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {componentDef?.name || section.componentType}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-0.5 md:gap-1">
          <button
            onClick={onSelect}
            className="p-1.5 md:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-100 rounded"
            title="Edit section"
          >
            <Settings className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>

          <button
            onClick={onDuplicate}
            className="hidden md:block p-1.5 md:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-100 rounded"
            title="Duplicate section"
          >
            <Copy className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>

          <button
            onClick={onDelete}
            className="p-1.5 md:p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-dark-100 rounded"
            title="Delete section"
          >
            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>
      </div>

      {/* Section Preview */}
      <div className="p-3 md:p-4">
        <SectionPreview section={section} />
      </div>
    </div>
  );
};

/**
 * Preview of what the section will look like
 */
const SectionPreview: React.FC<{ section: SectionConfig }> = ({ section }) => {
  // For table-based components
  if (section.columns && section.columns.length > 0) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-xs">
          <thead>
            <tr>
              {section.columns.map(col => (
                <th
                  key={col.id}
                  className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-dark-200 text-left font-medium"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.min(section.rows || 1, 3) }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {section.columns!.map(col => (
                  <td
                    key={col.id}
                    className="border border-gray-300 dark:border-gray-600 px-2 py-1"
                  >
                    <div className="h-6 bg-gray-100 dark:bg-dark-100 rounded"></div>
                  </td>
                ))}
              </tr>
            ))}
            {(section.rows || 0) > 3 && (
              <tr>
                <td
                  colSpan={section.columns.length}
                  className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-gray-500 dark:text-gray-400"
                >
                  ... {section.rows! - 3} more rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // For grouped fields (nameplate data, job info, etc.)
  if (section.fields && section.fields.length > 0) {
    const columns = section.layout === 'three-column' ? 3 : section.layout === 'two-column' ? 2 : 1;
    return (
      <div className={`grid grid-cols-1 ${columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''} gap-4`}>
        {section.fields.map(field => (
          <div key={field.id} className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label}
              {field.unit && <span className="text-gray-500 ml-1">({field.unit})</span>}
              {field.required && <span className="text-red-500 ml-1">*</span>}
              {field.readOnly && <span className="text-blue-500 ml-1 text-xs">(Auto)</span>}
            </label>
            {field.type === 'textarea' ? (
              <textarea
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                rows={3}
                placeholder={field.placeholder}
                readOnly={field.readOnly}
              />
            ) : field.type === 'select' ? (
              <select
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                disabled={field.readOnly}
              >
                <option value="">Select...</option>
                {field.options?.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : field.type === 'checkbox' ? (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-[#f26722] border-gray-300 rounded focus:ring-[#f26722]"
                  disabled={field.readOnly}
                />
              </div>
            ) : field.type === 'date' ? (
              <input
                type="date"
                className={`w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md ${field.readOnly ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'} text-gray-900 dark:text-white`}
                readOnly={field.readOnly}
              />
            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                className={`w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md ${field.readOnly ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'} text-gray-900 dark:text-white`}
                placeholder={field.placeholder}
                readOnly={field.readOnly}
                value={field.calculation ? '(Calculated)' : ''}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // For single field components (comments, custom text)
  if (section.field) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          {section.field.label}
        </label>
        {section.field.type === 'textarea' ? (
          <div className="h-24 bg-gray-100 dark:bg-dark-100 rounded"></div>
        ) : (
          <div className="h-8 bg-gray-100 dark:bg-dark-100 rounded"></div>
        )}
      </div>
    );
  }

  // For checklist components (visual inspection)
  if (section.checklistItems && section.checklistItems.length > 0) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-xs">
          <thead>
            <tr>
              <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-dark-200 text-left font-medium w-24">
                NETA Section
              </th>
              <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-dark-200 text-left font-medium">
                Description
              </th>
              <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-50 dark:bg-dark-200 text-left font-medium w-32">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {section.checklistItems.slice(0, 3).map(item => (
              <tr key={item.id}>
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                  {item.netaSection || '-'}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                  {item.description}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                  <div className="h-6 bg-gray-100 dark:bg-dark-100 rounded"></div>
                </td>
              </tr>
            ))}
            {section.checklistItems.length > 3 && (
              <tr>
                <td
                  colSpan={3}
                  className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-gray-500 dark:text-gray-400"
                >
                  ... {section.checklistItems.length - 3} more items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">
      No preview available
    </div>
  );
};

interface FormCanvasProps {
  sections: SectionConfig[];
  selectedSectionId: string | null;
  onSectionSelect: (sectionId: string) => void;
  onSectionDelete: (sectionId: string) => void;
  onSectionDuplicate: (sectionId: string) => void;
}

export const FormCanvas: React.FC<FormCanvasProps> = ({
  sections,
  selectedSectionId,
  onSectionSelect,
  onSectionDelete,
  onSectionDuplicate,
}) => {
  const { setNodeRef } = useDroppable({
    id: 'form-canvas',
  });

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div ref={setNodeRef} className="w-full mx-auto">
      <SortableContext
        items={sortedSections.map(s => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3 md:space-y-4">
          {sortedSections.map((section) => (
            <SortableSection
              key={section.id}
              section={section}
              isSelected={section.id === selectedSectionId}
              onSelect={() => onSectionSelect(section.id)}
              onDelete={() => {
                if (confirm(`Are you sure you want to delete "${section.title}"?`)) {
                  onSectionDelete(section.id);
                }
              }}
              onDuplicate={() => onSectionDuplicate(section.id)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
};


