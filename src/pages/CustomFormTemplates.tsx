/**
 * Custom Form Templates List
 * 
 * Displays all custom form templates and allows users to:
 * - Create new templates
 * - Edit existing templates
 * - Delete/deactivate templates (admin only)
 * - Use templates to create form instances
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import {
  Plus,
  Edit,
  Trash2,
  Copy,
  FileText,
  Search,
  Eye,
  Globe,
  Lock,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Template {
  id: string;
  name: string;
  description: string | null;
  neta_section: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_published: boolean;
}

export const CustomFormTemplates: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('custom_form_templates')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (!confirm(`Are you sure you want to delete "${templateName}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .schema('neta_ops')
        .from('custom_form_templates')
        .update({ is_active: false })
        .eq('id', templateId);

      if (error) throw error;

      toast.success('Template deleted successfully');
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const handleDuplicateTemplate = async (templateId: string) => {
    try {
      // Load the template to duplicate
      const { data: originalTemplate, error: loadError } = await supabase
        .schema('neta_ops')
        .from('custom_form_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (loadError) throw loadError;

      // Create a copy (always starts as unpublished draft)
      const { error: insertError } = await supabase
        .schema('neta_ops')
        .from('custom_form_templates')
        .insert({
          name: `${originalTemplate.name} (Copy)`,
          description: originalTemplate.description,
          neta_section: originalTemplate.neta_section,
          created_by: user?.id,
          structure: originalTemplate.structure,
          is_active: true,
          is_published: false,
        });

      if (insertError) throw insertError;

      toast.success('Template duplicated successfully');
      loadTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast.error('Failed to duplicate template');
    }
  };

  const handleTogglePublish = async (templateId: string, currentlyPublished: boolean) => {
    try {
      const { error } = await supabase
        .schema('neta_ops')
        .from('custom_form_templates')
        .update({ is_published: !currentlyPublished })
        .eq('id', templateId);

      if (error) throw error;

      toast.success(currentlyPublished ? 'Template unpublished' : 'Template published! It will now appear in jobs.');
      loadTemplates();
    } catch (error) {
      console.error('Error toggling publish:', error);
      toast.error('Failed to update publish status');
    }
  };

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.neta_section?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <div className="flex justify-center py-6"><LoadingSpinner size="md" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-200 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Custom Form Templates
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Create and manage reusable form templates
              </p>
            </div>
            <Button
              onClick={() => navigate('/custom-forms/builder')}
              className="bg-[#f26722] hover:bg-[#e55611]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Templates Grid */}
        {filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <FileText className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {searchQuery ? 'No templates found' : 'No templates yet'}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  {searchQuery
                    ? 'Try adjusting your search criteria'
                    : 'Create your first custom form template to get started'}
                </p>
                {!searchQuery && (
                  <Button
                    onClick={() => navigate('/custom-forms/builder')}
                    className="bg-[#f26722] hover:bg-[#e55611]"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Template
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg truncate">
                          {template.name}
                        </CardTitle>
                        {template.is_published ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                            <Globe className="w-3 h-3" />
                            Published
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded-full">
                            <Lock className="w-3 h-3" />
                            Draft
                          </span>
                        )}
                      </div>
                      {template.neta_section && (
                        <span className="inline-block px-2 py-1 text-xs font-medium bg-[#f26722] text-white rounded">
                          {template.neta_section}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {template.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Updated {new Date(template.updated_at).toLocaleDateString()}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => navigate(`/custom-forms/preview/${template.id}`)}
                        className="flex-1 bg-[#f26722] hover:bg-[#e55611]"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Preview
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleTogglePublish(template.id, template.is_published)}
                        variant={template.is_published ? 'outline' : 'default'}
                        className={`flex-1 ${template.is_published ? 'border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                        title={template.is_published ? 'Unpublish — hide from jobs' : 'Publish — make available in jobs'}
                      >
                        {template.is_published ? <Globe className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                        {template.is_published ? 'Unpublish' : 'Publish'}
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/custom-forms/builder/${template.id}`)}
                        className="flex-1"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDuplicateTemplate(template.id)}
                        title="Duplicate template"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteTemplate(template.id, template.name)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Delete template"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomFormTemplates;

