/**
 * Form Preview
 * 
 * Shows a preview of what the custom form will look like when filled out.
 * This is a read-only view for the form builder.
 */

import React from 'react';
import { CustomFormTemplate } from '@/lib/types/customForms';

interface FormPreviewProps {
  template: CustomFormTemplate;
}

export const FormPreview: React.FC<FormPreviewProps> = ({ template }) => {
  const sortedSections = [...template.structure.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-5xl mx-auto bg-white dark:bg-dark-150 rounded-lg shadow-lg p-8">
      {/* Preview Header */}
      <div className="mb-6 pb-6 border-b dark:border-gray-700">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {template.name}
            </h1>
            {template.description && (
              <p className="text-gray-600 dark:text-gray-400">
                {template.description}
              </p>
            )}
          </div>
          {template.netaSection && (
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                NETA Standard
              </div>
              <div className="text-xl font-bold text-[#f26722]">
                {template.netaSection}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {sortedSections.map((section) => (
          section.showInPrint && (
            <div key={section.id}>
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">
                {section.title}
              </h2>

              {/* Render section content based on type */}
              {section.columns && section.columns.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
                    <thead>
                      <tr>
                        {section.columns.map(col => (
                          <th
                            key={col.id}
                            className="border border-gray-300 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-500 dark:text-white uppercase"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: section.rows || 1 }).map((_, rowIndex) => (
                        <tr key={rowIndex}>
                          {section.columns!.map(col => (
                            <td
                              key={col.id}
                              className="border border-gray-300 dark:border-gray-700 px-3 py-2"
                            >
                              <div className="h-8 bg-gray-100 dark:bg-dark-100 rounded"></div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {section.fields && section.fields.length > 0 && (
                <div className={`grid gap-4 ${
                  section.layout === 'three-column' ? 'grid-cols-3' :
                  section.layout === 'two-column' ? 'grid-cols-2' :
                  'grid-cols-1'
                }`}>
                  {section.fields.map(field => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                        {field.label}
                        {field.unit && <span className="text-gray-500 ml-1">({field.unit})</span>}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {field.type === 'textarea' ? (
                        <div className="h-24 bg-gray-100 dark:bg-dark-100 rounded border border-gray-300 dark:border-gray-700"></div>
                      ) : (
                        <div className="h-10 bg-gray-100 dark:bg-dark-100 rounded border border-gray-300 dark:border-gray-700"></div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {section.field && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                    {section.field.label}
                    {section.field.unit && <span className="text-gray-500 ml-1">({section.field.unit})</span>}
                    {section.field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {section.field.type === 'textarea' ? (
                    <div className="h-32 bg-gray-100 dark:bg-dark-100 rounded border border-gray-300 dark:border-gray-700"></div>
                  ) : (
                    <div className="h-10 bg-gray-100 dark:bg-dark-100 rounded border border-gray-300 dark:border-gray-700"></div>
                  )}
                </div>
              )}

              {section.checklistItems && section.checklistItems.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
                    <thead>
                      <tr>
                        <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-500 dark:text-white uppercase w-32">
                          NETA Section
                        </th>
                        <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-500 dark:text-white uppercase">
                          Description
                        </th>
                        <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-500 dark:text-white uppercase w-40">
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.checklistItems.map(item => (
                        <tr key={item.id}>
                          <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white">
                            {item.netaSection || '-'}
                          </td>
                          <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-white">
                            {item.description}
                          </td>
                          <td className="border border-gray-300 dark:border-gray-700 px-3 py-2">
                            <div className="h-8 bg-gray-100 dark:bg-dark-100 rounded"></div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        ))}
      </div>

      {sortedSections.filter(s => s.showInPrint).length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            No sections to display in preview
          </p>
        </div>
      )}
    </div>
  );
};


