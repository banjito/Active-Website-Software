import React, { useState, useEffect } from 'react';
import { Users, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { supabase } from '@/lib/supabase';
import { SignatureProfileManager } from './SignatureProfileManager';

interface SignatureProfile {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  section_title?: string;
}

interface SignatureProfileSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProfileIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

export const SignatureProfileSelector: React.FC<SignatureProfileSelectorProps> = ({
  open,
  onOpenChange,
  selectedProfileIds,
  onSelectionChange,
}) => {
  const [profiles, setProfiles] = useState<SignatureProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      loadProfiles();
    }
  }, [open]);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('signature_profiles')
        .select('id, name, title, email, phone, section_title')
        .order('name', { ascending: true });
      
      if (error) throw error;
      setProfiles((data || []) as SignatureProfile[]);
    } catch (e: any) {
      console.error('Error loading profiles:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (profileId: string) => {
    const updated = new Set(selectedProfileIds);
    if (updated.has(profileId)) {
      updated.delete(profileId);
    } else {
      updated.add(profileId);
    }
    onSelectionChange(updated);
  };

  const handleSelectAll = () => {
    const allIds = new Set(profiles.map(p => p.id));
    onSelectionChange(allIds);
  };

  const handleDeselectAll = () => {
    onSelectionChange(new Set());
  };

  // Group profiles by section title
  const profilesBySection = profiles.reduce((acc, profile) => {
    const section = profile.section_title || 'Reviewed By';
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(profile);
    return acc;
  }, {} as Record<string, SignatureProfile[]>);

  const sections = Object.keys(profilesBySection).sort();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Signatures</DialogTitle>
            <DialogDescription>
              Choose which signatures to include in the executive summary. You can select multiple.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Select All / Deselect All buttons */}
            <div className="flex gap-2 px-4 pt-4">
              <Button
                onClick={handleSelectAll}
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={profiles.length === 0}
              >
                Select All
              </Button>
              <Button
                onClick={handleDeselectAll}
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={selectedProfileIds.size === 0}
              >
                Deselect All
              </Button>
              <Button
                onClick={() => setIsManagerOpen(true)}
                variant="outline"
                size="sm"
                title="Manage signature profiles"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Profile checkboxes grouped by section */}
            <div className="max-h-[50vh] overflow-auto space-y-4 px-4 pb-4">
              {loading ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading...</p>
              ) : profiles.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p>No signature profiles yet.</p>
                  <Button onClick={() => setIsManagerOpen(true)} variant="outline" className="mt-4">
                    <Users className="h-4 w-4 mr-2" />
                    Create Profile
                  </Button>
                </div>
              ) : (
                sections.map(section => (
                  <div key={section} className="space-y-2">
                    <div className="font-medium text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-1">
                      {section}
                    </div>
                    {profilesBySection[section].map(profile => {
                      const isSelected = selectedProfileIds.has(profile.id);
                      return (
                        <label
                          key={profile.id}
                          className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-dark-100 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggle(profile.id)}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          <div className="flex-1">
                            <div className="text-gray-900 dark:text-white font-medium">{profile.name}</div>
                            {profile.title && (
                              <div className="text-xs text-gray-600 dark:text-gray-400">{profile.title}</div>
                            )}
                            {(profile.email || profile.phone) && (
                              <div className="text-xs text-gray-500 dark:text-gray-500">
                                {profile.email}
                                {profile.email && profile.phone && ' • '}
                                {profile.phone}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} className="bg-[#f26722] hover:bg-[#e55611] text-white">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature Profile Manager */}
      <SignatureProfileManager
        open={isManagerOpen}
        onOpenChange={(open) => {
          setIsManagerOpen(open);
          if (!open) {
            // Reload profiles when manager closes
            loadProfiles();
          }
        }}
      />
    </>
  );
};
