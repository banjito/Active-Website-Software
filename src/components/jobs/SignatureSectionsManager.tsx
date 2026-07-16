import React, { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
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
import {
  SignatureSectionsConfig,
  SignatureSection,
  SignaturePerson,
} from "./JobDetail";
import { emailPlaceholder } from "@/lib/companyConfig";

interface SignatureSectionsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: SignatureSectionsConfig;
  onSave: (sections: SignatureSectionsConfig) => void;
  users?: Array<{
    id: string;
    email?: string;
    user_metadata?: {
      name?: string;
    };
  }>;
}

export const SignatureSectionsManager: React.FC<
  SignatureSectionsManagerProps
> = ({ open, onOpenChange, sections: initialSections, onSave, users = [] }) => {
  const [sections, setSections] =
    useState<SignatureSectionsConfig>(initialSections);

  const addSection = () => {
    setSections([...sections, { title: "", people: [] }]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const updateSectionTitle = (index: number, title: string) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], title };
    setSections(updated);
  };

  const addPerson = (sectionIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex] = {
      ...updated[sectionIndex],
      people: [
        ...updated[sectionIndex].people,
        { name: "", title: "", email: "", phone: "" },
      ],
    };
    setSections(updated);
  };

  const removePerson = (sectionIndex: number, personIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex] = {
      ...updated[sectionIndex],
      people: updated[sectionIndex].people.filter((_, i) => i !== personIndex),
    };
    setSections(updated);
  };

  const updatePerson = (
    sectionIndex: number,
    personIndex: number,
    field: keyof SignaturePerson,
    value: string,
  ) => {
    const updated = [...sections];
    updated[sectionIndex] = {
      ...updated[sectionIndex],
      people: updated[sectionIndex].people.map((p, i) =>
        i === personIndex ? { ...p, [field]: value } : p,
      ),
    };
    setSections(updated);
  };

  const handleSave = () => {
    // Filter out empty sections and people
    const cleaned = sections
      .map((section) => ({
        ...section,
        people: section.people.filter((p) => p.name.trim() !== ""),
      }))
      .filter(
        (section) => section.title.trim() !== "" || section.people.length > 0,
      );

    onSave(cleaned);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setSections(initialSections);
    onOpenChange(false);
  };

  // Helper to find user email by name
  const findUserEmail = (name: string): string => {
    if (!name) return "";
    const nameLower = name.toLowerCase().trim();
    const user = users.find((u) => {
      const userName = (u.user_metadata?.name || u.email || "")
        .toLowerCase()
        .trim();
      return userName === nameLower;
    });
    return user?.email || "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Signature Sections</DialogTitle>
          <DialogDescription>
            Configure signature sections for the executive summary. Add
            sections, rename titles, and add multiple people to each section.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          {sections.length === 0 && (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
              <p>No sections yet. Click "Add Section" to get started.</p>
            </div>
          )}

          {sections.map((section, sectionIndex) => (
            <div
              key={sectionIndex}
              className="border border-neutral-200 dark:border-neutral-700 rounded-none p-4 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={section.title}
                  onChange={(e) =>
                    updateSectionTitle(sectionIndex, e.target.value)
                  }
                  placeholder="Section Title (e.g., Project Manager, Reviewed By, Work Performed By)"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeSection(sectionIndex)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-3 pl-4 border-l-2 border-neutral-200 dark:border-neutral-700">
                {section.people.length === 0 && (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
                    No people in this section. Click "Add Person" below.
                  </p>
                )}

                {section.people.map((person, personIndex) => (
                  <div
                    key={personIndex}
                    className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-neutral-50 dark:bg-dark-200 rounded"
                  >
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Name *
                      </label>
                      <Input
                        value={person.name}
                        onChange={(e) => {
                          updatePerson(
                            sectionIndex,
                            personIndex,
                            "name",
                            e.target.value,
                          );
                          // Auto-fill email if user found
                          if (e.target.value && !person.email) {
                            const email = findUserEmail(e.target.value);
                            if (email) {
                              updatePerson(
                                sectionIndex,
                                personIndex,
                                "email",
                                email,
                              );
                            }
                          }
                        }}
                        placeholder="Full Name"
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Title
                      </label>
                      <Input
                        value={person.title || ""}
                        onChange={(e) =>
                          updatePerson(
                            sectionIndex,
                            personIndex,
                            "title",
                            e.target.value,
                          )
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
                        value={person.email || ""}
                        onChange={(e) =>
                          updatePerson(
                            sectionIndex,
                            personIndex,
                            "email",
                            e.target.value,
                          )
                        }
                        placeholder={emailPlaceholder}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Phone
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={person.phone || ""}
                          onChange={(e) =>
                            updatePerson(
                              sectionIndex,
                              personIndex,
                              "phone",
                              e.target.value,
                            )
                          }
                          placeholder="(256) 123-4567"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            removePerson(sectionIndex, personIndex)
                          }
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addPerson(sectionIndex)}
                  className="w-full" leftIcon={<Plus className="h-4 w-4" />}>
                  Add Person
                </Button>
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addSection} className="w-full" leftIcon={<Plus className="h-4 w-4" />}>
            Add Section
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-brand hover:bg-brand-dark text-white"
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
