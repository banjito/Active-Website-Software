/**
 * Custom Form Preview
 * 
 * Test/preview a custom form template as if filling it out.
 * This does NOT save to jobs or create assets - it's just for testing.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Eye } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CustomFormTemplate, SectionConfig } from '@/lib/types/customForms';
import { fahrenheitToCelsius, getTCF } from '@/lib/utils/temperatureCorrection';

export const CustomFormPreview: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<CustomFormTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<'PASS' | 'FAIL'>('PASS');

  useEffect(() => {
    if (templateId) {
      loadTemplate();
    }
  }, [templateId]);

  // Initialize temperature calculations when template loads
  useEffect(() => {
    if (template) {
      // Find job info section and set default temperature calculations
      const jobInfoSection = template.structure.sections.find(s => s.componentType === 'job_info');
      if (jobInfoSection) {
        const tempField = jobInfoSection.fields?.find(f => f.id === 'temperature');
        if (tempField && tempField.defaultValue !== undefined && tempField.defaultValue !== '') {
          const fahrenheit = parseFloat(tempField.defaultValue.toString());
          if (!isNaN(fahrenheit)) {
            const celsius = fahrenheitToCelsius(fahrenheit);
            const tcf = getTCF(celsius);

            setFormData(prev => {
              // Only set if not already set (don't override user changes)
              if (prev[jobInfoSection.id]?.temperature === undefined) {
                return {
                  ...prev,
                  [jobInfoSection.id]: {
                    ...(prev[jobInfoSection.id] || {}),
                    temperature: fahrenheit.toString(),
                    temperatureCelsius: celsius.toFixed(2),
                    tcf: tcf.toFixed(3),
                  },
                };
              }
              return prev;
            });
          }
        }
      }
    }
  }, [template]);

  const loadTemplate = async () => {
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

  const handleFieldChange = (sectionId: string, fieldId: string, value: any) => {
    setFormData(prev => {
      const updatedSection = {
        ...(prev[sectionId] || {}),
        [fieldId]: value,
      };

      // Auto-calculate celsius and TCF when temperature changes
      if (fieldId === 'temperature') {
        if (value === '' || value === null || value === undefined) {
          // Clear calculated fields when temperature is cleared
          updatedSection['temperatureCelsius'] = '';
          updatedSection['tcf'] = '';
        } else if (!isNaN(parseFloat(value))) {
          const fahrenheit = parseFloat(value);
          const celsius = fahrenheitToCelsius(fahrenheit);
          const tcf = getTCF(celsius);
          
          updatedSection['temperatureCelsius'] = celsius.toFixed(2);
          updatedSection['tcf'] = tcf.toFixed(3);
        }
      }

      return {
        ...prev,
        [sectionId]: updatedSection,
      };
    });
  };

  const renderField = (sectionId: string, field: any) => {
    // Use formData value if it exists (even if empty string), otherwise use defaultValue
    const value = formData[sectionId]?.[field.id] !== undefined 
      ? formData[sectionId][field.id] 
      : (field.defaultValue || '');

    const commonClasses = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white";
    const readOnlyClasses = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300";

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleFieldChange(sectionId, field.id, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className={commonClasses}
          />
        );
      
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleFieldChange(sectionId, field.id, e.target.value)}
            className={commonClasses}
          >
            <option value="">Select...</option>
            {field.options?.map((opt: any) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => handleFieldChange(sectionId, field.id, e.target.checked)}
            className="w-4 h-4 text-[#f26722] border-gray-300 rounded focus:ring-[#f26722]"
          />
        );
      
      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(sectionId, field.id, e.target.value)}
            className={commonClasses}
          />
        );
      
      case 'number':
        // Use text input type so users can enter letters, symbols, etc
        // Just like standard reports
        return (
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => handleFieldChange(sectionId, field.id, e.target.value)}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            className={field.readOnly ? readOnlyClasses : commonClasses}
          />
        );
      
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(sectionId, field.id, e.target.value)}
            placeholder={field.placeholder}
            readOnly={field.readOnly}
            className={field.readOnly ? readOnlyClasses : commonClasses}
          />
        );
    }
  };

  const renderSection = (section: SectionConfig) => {
    // For grouped fields (job info, nameplate, etc.)
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
              </label>
              {renderField(section.id, field)}
            </div>
          ))}
        </div>
      );
    }

    // For tables
    if (section.columns && section.columns.length > 0) {
      const rowCount = section.rows || 1;
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
            <thead>
              <tr>
                {section.columns.map(col => (
                  <th
                    key={col.id}
                    className="border border-gray-300 dark:border-gray-600 px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-900 dark:text-white"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {section.columns!.map(col => (
                    <td
                      key={col.id}
                      className="border border-gray-300 dark:border-gray-600 px-2 py-1"
                    >
                      {renderField(`${section.id}_row${rowIndex}`, col.field)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // For single field (comments, custom text)
    if (section.field) {
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {section.field.label}
          </label>
          {renderField(section.id, section.field)}
        </div>
      );
    }

    // For checklists
    if (section.checklistItems && section.checklistItems.length > 0) {
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
            <thead>
              <tr>
                <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium">
                  NETA Section
                </th>
                <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium">
                  Description
                </th>
                <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {section.checklistItems.map(item => (
                <tr key={item.id}>
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm">
                    {item.netaSection || '-'}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm">
                    {item.description}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">
                    <select
                      value={formData[section.id]?.[item.id] || ''}
                      onChange={(e) => handleFieldChange(section.id, item.id, e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-dark-100 text-sm"
                    >
                      <option value="">Select...</option>
                      {item.resultOptions?.map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p>Loading form...</p>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <p className="text-red-600">Template not found</p>
          <Button onClick={() => navigate('/custom-forms/templates')} className="mt-4">
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  const sortedSections = [...template.structure.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-200 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-4 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/custom-forms/templates')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {template.name}
                </h1>
                {template.netaSection && (
                  <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-[#f26722] text-white rounded">
                    {template.netaSection}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => setStatus(status === 'PASS' ? 'FAIL' : 'PASS')}
              className={`px-4 py-2 rounded-md text-white font-medium ${
                status === 'PASS' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {status}
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Eye className="w-4 h-4" />
            <span>Preview Mode - Changes are not saved</span>
          </div>
        </div>

        {/* Form Sections */}
        {sortedSections.map((section) => (
          <div
            key={section.id}
            className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-4 md:p-6 mb-4"
          >
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">
              {section.title}
            </h2>
            {renderSection(section)}
          </div>
        ))}

        {sortedSections.length === 0 && (
          <div className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              This template has no sections yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomFormPreview;

