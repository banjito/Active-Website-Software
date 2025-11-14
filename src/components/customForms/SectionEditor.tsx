/**
 * Section Editor
 * 
 * Right sidebar for editing selected section properties.
 * Allows customization of:
 * - Section title
 * - Show/hide in print
 * - Table rows and columns
 * - Field labels and units
 * - Checklist items
 */

import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  GripVertical,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { SectionConfig, ColumnConfig, FieldConfig, FieldType } from '@/lib/types/customForms';

interface SectionEditorProps {
  section: SectionConfig;
  onUpdate: (updates: Partial<SectionConfig>) => void;
  onClose: () => void;
}

export const SectionEditor: React.FC<SectionEditorProps> = ({
  section,
  onUpdate,
  onClose,
}) => {
  return (
    <div className="w-96 bg-white dark:bg-dark-150 border-l dark:border-gray-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Edit Section
        </h2>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Basic Settings */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Basic Settings
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Section Title
              </label>
              <Input
                value={section.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                placeholder="Enter section title"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showInPrint"
                checked={section.showInPrint}
                onChange={(e) => onUpdate({ showInPrint: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="showInPrint" className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                {section.showInPrint ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                Show in printed report
              </label>
            </div>
          </div>
        </div>

        {/* Table Settings (for table-based components) */}
        {section.columns && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Table Settings
            </h3>

            <div className="space-y-3">
              {/* Number of Rows */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Number of Rows
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={section.rows || 1}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      const min = section.minRows || 1;
                      const max = section.maxRows || 100;
                      onUpdate({ rows: Math.max(min, Math.min(max, value)) });
                    }}
                    min={section.minRows || 1}
                    max={section.maxRows || 100}
                    className="w-24"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({section.minRows || 1} - {section.maxRows || 100})
                  </span>
                </div>
              </div>

              {/* Allow Add/Remove Rows */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowAddRows"
                    checked={section.allowAddRows}
                    onChange={(e) => onUpdate({ allowAddRows: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="allowAddRows" className="text-sm text-gray-700 dark:text-gray-300">
                    Allow adding rows
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowRemoveRows"
                    checked={section.allowRemoveRows}
                    onChange={(e) => onUpdate({ allowRemoveRows: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="allowRemoveRows" className="text-sm text-gray-700 dark:text-gray-300">
                    Allow removing rows
                  </label>
                </div>
              </div>

              {/* Columns */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Columns
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newColumn: ColumnConfig = {
                        id: `col-${Date.now()}`,
                        label: `Column ${(section.columns?.length || 0) + 1}`,
                        width: '25%',
                        field: {
                          id: `field-${Date.now()}`,
                          label: `Column ${(section.columns?.length || 0) + 1}`,
                          type: FieldType.TEXT,
                        },
                      };
                      onUpdate({ columns: [...(section.columns || []), newColumn] });
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Column
                  </Button>
                </div>

                <div className="space-y-2">
                  {section.columns?.map((column, index) => (
                    <ColumnEditor
                      key={column.id}
                      column={column}
                      onUpdate={(updates) => {
                        const newColumns = [...(section.columns || [])];
                        newColumns[index] = { ...column, ...updates };
                        onUpdate({ columns: newColumns });
                      }}
                      onDelete={() => {
                        const newColumns = section.columns?.filter(c => c.id !== column.id);
                        onUpdate({ columns: newColumns });
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fields Settings (for grouped field components) */}
        {section.fields && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Fields
            </h3>

            <div className="space-y-3">
              {/* Layout */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Layout
                </label>
                <select
                  value={section.layout || 'single-column'}
                  onChange={(e) => onUpdate({ layout: e.target.value as any })}
                  className="w-full px-3 py-2 bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722] text-gray-900 dark:text-white text-sm"
                >
                  <option value="single-column">Single Column</option>
                  <option value="two-column">Two Columns</option>
                  <option value="three-column">Three Columns</option>
                  <option value="grid">Grid</option>
                </select>
              </div>

              {/* Field List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Fields
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newField: FieldConfig = {
                        id: `field-${Date.now()}`,
                        label: `Field ${(section.fields?.length || 0) + 1}`,
                        type: FieldType.TEXT,
                      };
                      onUpdate({ fields: [...(section.fields || []), newField] });
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Field
                  </Button>
                </div>

                <div className="space-y-2">
                  {section.fields?.map((field, index) => (
                    <FieldEditor
                      key={field.id}
                      field={field}
                      onUpdate={(updates) => {
                        const newFields = [...(section.fields || [])];
                        newFields[index] = { ...field, ...updates };
                        onUpdate({ fields: newFields });
                      }}
                      onDelete={() => {
                        const newFields = section.fields?.filter(f => f.id !== field.id);
                        onUpdate({ fields: newFields });
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Single Field Settings */}
        {section.field && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Field Settings
            </h3>

            <FieldEditor
              field={section.field}
              onUpdate={(updates) => onUpdate({ field: { ...section.field!, ...updates } })}
              onDelete={() => {}}
              hideDelete
            />
          </div>
        )}

        {/* Checklist Items (for inspection components) */}
        {section.checklistItems && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Checklist Items
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {section.checklistItems.length} items
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newItem = {
                      id: `item-${Date.now()}`,
                      netaSection: '',
                      description: 'New inspection item',
                      resultOptions: ['satisfactory', 'unsatisfactory', 'Not Applicable'],
                    };
                    onUpdate({ checklistItems: [...(section.checklistItems || []), newItem] });
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-2">
                {section.checklistItems?.map((item, index) => (
                  <ChecklistItemEditor
                    key={item.id}
                    item={item}
                    onUpdate={(updates) => {
                      const newItems = [...(section.checklistItems || [])];
                      newItems[index] = { ...item, ...updates };
                      onUpdate({ checklistItems: newItems });
                    }}
                    onDelete={() => {
                      const newItems = section.checklistItems?.filter(i => i.id !== item.id);
                      onUpdate({ checklistItems: newItems });
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Column Editor for table columns
 */
const ColumnEditor: React.FC<{
  column: ColumnConfig;
  onUpdate: (updates: Partial<ColumnConfig>) => void;
  onDelete: () => void;
}> = ({ column, onUpdate, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-gray-50 dark:bg-dark-100 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 text-left text-sm font-medium text-gray-900 dark:text-white"
        >
          {column.label}
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t dark:border-gray-700">
          <Input
            value={column.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Column label"
            className="text-xs"
          />

          <FieldEditor
            field={column.field}
            onUpdate={(updates) => onUpdate({ field: { ...column.field, ...updates } })}
            onDelete={() => {}}
            hideDelete
            compact
          />
        </div>
      )}
    </div>
  );
};

/**
 * Field Editor for individual fields
 */
const FieldEditor: React.FC<{
  field: FieldConfig;
  onUpdate: (updates: Partial<FieldConfig>) => void;
  onDelete: () => void;
  hideDelete?: boolean;
  compact?: boolean;
}> = ({ field, onUpdate, onDelete, hideDelete, compact }) => {
  const [isExpanded, setIsExpanded] = useState(!compact);

  return (
    <div className="bg-gray-50 dark:bg-dark-100 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 text-left text-sm font-medium text-gray-900 dark:text-white"
        >
          {field.label}
        </button>
        {!hideDelete && (
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t dark:border-gray-700">
          <Input
            value={field.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Field label"
            className="text-xs"
          />

          <select
            value={field.type}
            onChange={(e) => onUpdate({ type: e.target.value as FieldType })}
            className="px-2 py-1 bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722] text-gray-900 dark:text-white text-xs"
          >
            <option value={FieldType.TEXT}>Text</option>
            <option value={FieldType.NUMBER}>Number</option>
            <option value={FieldType.DATE}>Date</option>
            <option value={FieldType.SELECT}>Select</option>
            <option value={FieldType.TEXTAREA}>Text Area</option>
            <option value={FieldType.CHECKBOX}>Checkbox</option>
          </select>

          {field.unit !== undefined && (
            <Input
              value={field.unit}
              onChange={(e) => onUpdate({ unit: e.target.value })}
              placeholder="Unit (e.g., kV, A, Ω)"
              className="text-xs"
            />
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`required-${field.id}`}
              checked={field.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="rounded text-xs"
            />
            <label htmlFor={`required-${field.id}`} className="text-xs text-gray-700 dark:text-gray-300">
              Required
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Checklist Item Editor
 */
const ChecklistItemEditor: React.FC<{
  item: any;
  onUpdate: (updates: any) => void;
  onDelete: () => void;
}> = ({ item, onUpdate, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-gray-50 dark:bg-dark-100 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 text-left text-sm font-medium text-gray-900 dark:text-white"
        >
          {item.netaSection || 'No section'}: {item.description.substring(0, 40)}...
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2 pt-2 border-t dark:border-gray-700">
          <Input
            value={item.netaSection}
            onChange={(e) => onUpdate({ netaSection: e.target.value })}
            placeholder="NETA Section (e.g., 7.3.3.A.1)"
            className="text-xs"
          />

          <Textarea
            value={item.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Description"
            rows={3}
            className="text-xs"
          />
        </div>
      )}
    </div>
  );
};


