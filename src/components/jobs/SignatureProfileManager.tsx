import React, { useState, useEffect } from "react";
import { Plus, Trash2, X, Edit2, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/lib/AuthContext";
import { emailPlaceholder } from "@/lib/companyConfig";

interface SignatureProfile {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  section_title?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface SignatureProfileManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SignatureProfileManager: React.FC<
  SignatureProfileManagerProps
> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<SignatureProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProfile, setNewProfile] = useState<Partial<SignatureProfile>>({
    name: "",
    title: "",
    email: "",
    phone: "",
    section_title: "Reviewed By",
  });
  const [editProfile, setEditProfile] = useState<Partial<SignatureProfile>>({});

  useEffect(() => {
    if (open) {
      loadProfiles();
    }
  }, [open]);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("signature_profiles")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setProfiles((data || []) as SignatureProfile[]);
    } catch (e: any) {
      console.error("Error loading profiles:", e);
      toast({
        title: "Load failed",
        description: e?.message || "Could not load signature profiles",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setIsAdding(true);
    setNewProfile({
      name: "",
      title: "",
      email: "",
      phone: "",
      section_title: "Reviewed By",
    });
  };

  const handleSaveNew = async () => {
    if (!newProfile.name?.trim()) {
      toast({
        title: "Validation error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("signature_profiles")
        .insert({
          name: newProfile.name.trim(),
          title: newProfile.title?.trim() || null,
          email: newProfile.email?.trim() || null,
          phone: newProfile.phone?.trim() || null,
          section_title: newProfile.section_title?.trim() || "Reviewed By",
          created_by: user.id,
        });

      if (error) throw error;

      toast({ title: "Success", description: "Signature profile created" });
      setIsAdding(false);
      loadProfiles();
    } catch (e: any) {
      console.error("Error saving profile:", e);
      toast({
        title: "Save failed",
        description: e?.message || "Could not save profile",
        variant: "destructive",
      });
    }
  };

  const handleStartEdit = (profile: SignatureProfile) => {
    setEditingId(profile.id);
    setEditProfile({ ...profile });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editProfile.name?.trim()) {
      toast({
        title: "Validation error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("signature_profiles")
        .update({
          name: editProfile.name.trim(),
          title: editProfile.title?.trim() || null,
          email: editProfile.email?.trim() || null,
          phone: editProfile.phone?.trim() || null,
          section_title: editProfile.section_title?.trim() || "Reviewed By",
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingId);

      if (error) throw error;

      toast({ title: "Success", description: "Signature profile updated" });
      setEditingId(null);
      loadProfiles();
    } catch (e: any) {
      console.error("Error updating profile:", e);
      toast({
        title: "Update failed",
        description: e?.message || "Could not update profile",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete signature profile "${name}"?`)) return;

    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("signature_profiles")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Signature profile deleted" });
      loadProfiles();
    } catch (e: any) {
      console.error("Error deleting profile:", e);
      toast({
        title: "Delete failed",
        description: e?.message || "Could not delete profile",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Signature Profiles</DialogTitle>
          <DialogDescription>
            Create and manage saved signature profiles. These can be selected
            when generating executive summaries.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-neutral-500">
              <LoadingSpinner size="md" />
            </div>
          ) : profiles.length === 0 && !isAdding ? (
            <div className="text-center py-8 text-neutral-500">
              <p>No signature profiles yet.</p>
              <Button onClick={handleAdd} className="mt-4" variant="outline" leftIcon={<Plus className="h-4 w-4" />}>
                Add First Profile
              </Button>
            </div>
          ) : (
            <>
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="border border-neutral-200 dark:border-neutral-700 rounded-none p-4"
                >
                  {editingId === profile.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                            Name *
                          </label>
                          <Input
                            value={editProfile.name || ""}
                            onChange={(e) =>
                              setEditProfile({
                                ...editProfile,
                                name: e.target.value,
                              })
                            }
                            placeholder="Full Name"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                            Title
                          </label>
                          <Input
                            value={editProfile.title || ""}
                            onChange={(e) =>
                              setEditProfile({
                                ...editProfile,
                                title: e.target.value,
                              })
                            }
                            placeholder="Job Title"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                            Email
                          </label>
                          <Input
                            type="email"
                            value={editProfile.email || ""}
                            onChange={(e) =>
                              setEditProfile({
                                ...editProfile,
                                email: e.target.value,
                              })
                            }
                            placeholder={emailPlaceholder}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                            Phone
                          </label>
                          <Input
                            value={editProfile.phone || ""}
                            onChange={(e) =>
                              setEditProfile({
                                ...editProfile,
                                phone: e.target.value,
                              })
                            }
                            placeholder="(256) 123-4567"
                            className="w-full"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                            Section Title
                          </label>
                          <Input
                            value={editProfile.section_title || "Reviewed By"}
                            onChange={(e) =>
                              setEditProfile({
                                ...editProfile,
                                section_title: e.target.value,
                              })
                            }
                            placeholder="Reviewed By, Project Manager, etc."
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleSaveEdit}
                          size="sm"
                          className="bg-brand hover:bg-brand-dark text-white" leftIcon={<Save className="h-4 w-4" />}>
                          Save
                        </Button>
                        <Button
                          onClick={() => setEditingId(null)}
                          variant="outline"
                          size="sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-neutral-900 dark:text-white">
                          {profile.name}
                        </div>
                        {profile.title && (
                          <div className="text-sm text-neutral-600 dark:text-neutral-400">
                            {profile.title}
                          </div>
                        )}
                        <div className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
                          {profile.email && <span>{profile.email}</span>}
                          {profile.email && profile.phone && <span> • </span>}
                          {profile.phone && <span>{profile.phone}</span>}
                        </div>
                        {profile.section_title && (
                          <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                            Section: {profile.section_title}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartEdit(profile)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(profile.id, profile.name)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isAdding && (
                <div className="border border-neutral-200 dark:border-neutral-700 rounded-none p-4 bg-neutral-50 dark:bg-dark-200">
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Name *
                        </label>
                        <Input
                          value={newProfile.name || ""}
                          onChange={(e) =>
                            setNewProfile({
                              ...newProfile,
                              name: e.target.value,
                            })
                          }
                          placeholder="Full Name"
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Title
                        </label>
                        <Input
                          value={newProfile.title || ""}
                          onChange={(e) =>
                            setNewProfile({
                              ...newProfile,
                              title: e.target.value,
                            })
                          }
                          placeholder="Job Title"
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Email
                        </label>
                        <Input
                          type="email"
                          value={newProfile.email || ""}
                          onChange={(e) =>
                            setNewProfile({
                              ...newProfile,
                              email: e.target.value,
                            })
                          }
                          placeholder={emailPlaceholder}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Phone
                        </label>
                        <Input
                          value={newProfile.phone || ""}
                          onChange={(e) =>
                            setNewProfile({
                              ...newProfile,
                              phone: e.target.value,
                            })
                          }
                          placeholder="(256) 123-4567"
                          className="w-full"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                          Section Title
                        </label>
                        <Input
                          value={newProfile.section_title || "Reviewed By"}
                          onChange={(e) =>
                            setNewProfile({
                              ...newProfile,
                              section_title: e.target.value,
                            })
                          }
                          placeholder="Reviewed By, Project Manager, etc."
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveNew}
                        size="sm"
                        className="bg-brand hover:bg-brand-dark text-white" leftIcon={<Save className="h-4 w-4" />}>
                        Save
                      </Button>
                      <Button
                        onClick={() => setIsAdding(false)}
                        variant="outline"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {!isAdding && (
            <Button onClick={handleAdd} variant="outline" className="mr-auto" leftIcon={<Plus className="h-4 w-4" />}>
              Add Profile
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
