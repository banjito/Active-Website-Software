import React, { useState, useEffect } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { Select } from "../../../components/ui/Select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import {
  CheckSquare,
  Plus,
  Edit,
  Trash2,
  Eye,
  X,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PAGE_SIZE = 15;
import {
  onboardingService,
  Checklist,
} from "../../../services/hr/onboardingService";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const Checklists: React.FC = () => {
  const { user } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "templates" | "active" | "archived"
  >("all");
  const [page, setPage] = useState(1);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState<Checklist | null>(
    null,
  );

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    checklist_type: "standard" as const,
    items: [] as Array<{
      id: string;
      title: string;
      description?: string;
      category?: string;
      required: boolean;
      order: number;
      assignee_type?: string;
      due_days?: number;
    }>,
    status: "draft" as const,
    is_template: false,
  });

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const filters: any = {};

      if (filter === "templates") {
        filters.is_template = true;
      } else if (filter === "active") {
        filters.status = "active";
      } else if (filter === "archived") {
        filters.status = "archived";
      }

      const data = await onboardingService.getChecklists(filters);
      setChecklists(data);
    } catch (error: any) {
      console.error("Error fetching checklists:", error);
      toast({
        title: "Error",
        description: "Failed to load checklists. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleItemAdd = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `item_${Date.now()}`,
          title: "",
          required: false,
          order: prev.items.length,
          assignee_type: "employee",
          due_days: 0,
        },
      ],
    }));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const handleItemRemove = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items
        .filter((_, i) => i !== index)
        .map((item, i) => ({
          ...item,
          order: i,
        })),
    }));
  };

  const handleItemMove = (index: number, direction: "up" | "down") => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= newItems.length) return prev;

      [newItems[index], newItems[targetIndex]] = [
        newItems[targetIndex],
        newItems[index],
      ];
      newItems.forEach((item, i) => {
        item.order = i;
      });

      return { ...prev, items: newItems };
    });
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a checklist name",
        variant: "destructive",
      });
      return;
    }

    if (!user) return;

    try {
      await onboardingService.createChecklist({
        ...formData,
        created_by: user.id,
      });

      toast({
        title: "Success",
        description: "Checklist created successfully",
        variant: "success",
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create checklist",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!selectedChecklist) return;

    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a checklist name",
        variant: "destructive",
      });
      return;
    }

    try {
      await onboardingService.updateChecklist(selectedChecklist.id, formData);

      toast({
        title: "Success",
        description: "Checklist updated successfully",
        variant: "success",
      });
      setIsEditModalOpen(false);
      setSelectedChecklist(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update checklist",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this checklist?")) return;

    try {
      await onboardingService.deleteChecklist(id);
      toast({
        title: "Success",
        description: "Checklist deleted successfully",
        variant: "success",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete checklist",
        variant: "destructive",
      });
    }
  };

  const openEditModal = (checklist: Checklist) => {
    setSelectedChecklist(checklist);
    setFormData({
      name: checklist.name,
      description: checklist.description || "",
      checklist_type: checklist.checklist_type,
      items: checklist.items || [],
      status: checklist.status,
      is_template: checklist.is_template,
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (checklist: Checklist) => {
    setSelectedChecklist(checklist);
    setIsViewModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      checklist_type: "standard",
      items: [],
      status: "draft",
      is_template: false,
    });
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      draft: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
      active:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      archived: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
    };
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status as keyof typeof colors] || colors.draft}`}
      >
        {status}
      </span>
    );
  };

  const filteredChecklists = checklists.filter((c) => {
    if (filter === "templates") return c.is_template;
    if (filter === "active") return c.status === "active";
    if (filter === "archived") return c.status === "archived";
    return true;
  });
  const totalPages = Math.max(
    1,
    Math.ceil(filteredChecklists.length / PAGE_SIZE),
  );
  const paginatedChecklists = filteredChecklists.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">
            Onboarding Checklists
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Create and manage onboarding checklists with tasks and items
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateModalOpen(true);
          }}
          className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Checklist
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFilter("all");
            setPage(1);
          }}
        >
          All
        </Button>
        <Button
          variant={filter === "templates" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFilter("templates");
            setPage(1);
          }}
        >
          Templates
        </Button>
        <Button
          variant={filter === "active" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFilter("active");
            setPage(1);
          }}
        >
          Active
        </Button>
        <Button
          variant={filter === "archived" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setFilter("archived");
            setPage(1);
          }}
        >
          Archived
        </Button>
      </div>

      {/* Checklists List */}
      {loading ? (
        <div className="text-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : filteredChecklists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckSquare className="h-12 w-12 mx-auto text-zinc-400 mb-4" />
            <p className="text-zinc-600 dark:text-zinc-400">
              No checklists found
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedChecklists.map((checklist) => (
              <Card
                key={checklist.id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {checklist.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {checklist.description || "No description"}
                      </CardDescription>
                    </div>
                    {getStatusBadge(checklist.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium">Type:</span>{" "}
                      {checklist.checklist_type}
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium">Items:</span>{" "}
                      {checklist.items?.length || 0}
                    </div>
                    {checklist.is_template && (
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs">
                        Template
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewModal(checklist)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(checklist)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(checklist.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredChecklists.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Page {page} of {totalPages} ({filteredChecklists.length} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Checklist</DialogTitle>
            <DialogDescription>
              Create a new onboarding checklist with tasks and items
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., First Day Checklist"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description of this checklist"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Checklist Type
                </label>
                <Select
                  name="checklist_type"
                  value={formData.checklist_type}
                  onChange={handleInputChange}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "pre-start", label: "Pre-Start" },
                    { value: "first-day", label: "First Day" },
                    { value: "first-week", label: "First Week" },
                    { value: "first-month", label: "First Month" },
                    { value: "custom", label: "Custom" },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "active", label: "Active" },
                    { value: "archived", label: "Archived" },
                  ]}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_template"
                name="is_template"
                checked={formData.is_template}
                onChange={handleInputChange}
                className="rounded"
              />
              <label htmlFor="is_template" className="text-sm font-medium">
                Save as Template
              </label>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">
                  Checklist Items
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleItemAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {formData.items.map((item, index) => (
                  <div key={item.id} className="p-3 border rounded space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="Item title"
                        value={item.title}
                        onChange={(e) =>
                          handleItemChange(index, "title", e.target.value)
                        }
                        className="flex-1"
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "required",
                              e.target.checked,
                            )
                          }
                          className="rounded"
                        />
                        Required
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleItemMove(index, "up")}
                        disabled={index === 0}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleItemMove(index, "down")}
                        disabled={index === formData.items.length - 1}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleItemRemove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Item description (optional)"
                      value={item.description || ""}
                      onChange={(e) =>
                        handleItemChange(index, "description", e.target.value)
                      }
                      rows={2}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">
                          Category
                        </label>
                        <Input
                          placeholder="Category"
                          value={item.category || ""}
                          onChange={(e) =>
                            handleItemChange(index, "category", e.target.value)
                          }
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">
                          Assignee Type
                        </label>
                        <Select
                          value={item.assignee_type || "employee"}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "assignee_type",
                              e.target.value,
                            )
                          }
                          className="text-sm"
                          options={[
                            { value: "employee", label: "Employee" },
                            { value: "manager", label: "Manager" },
                            { value: "hr", label: "HR" },
                            { value: "it", label: "IT" },
                          ]}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">
                          Due Days
                        </label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={item.due_days || 0}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "due_days",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {formData.items.length === 0 && (
                  <p className="text-sm text-zinc-500 text-center py-4">
                    No items added. Click "Add Item" to add one.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Create Checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal - Similar structure to Create Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Checklist</DialogTitle>
            <DialogDescription>
              Update the checklist details and items
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Checklist Type
                </label>
                <Select
                  name="checklist_type"
                  value={formData.checklist_type}
                  onChange={handleInputChange}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "pre-start", label: "Pre-Start" },
                    { value: "first-day", label: "First Day" },
                    { value: "first-week", label: "First Week" },
                    { value: "first-month", label: "First Month" },
                    { value: "custom", label: "Custom" },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "active", label: "Active" },
                    { value: "archived", label: "Archived" },
                  ]}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_template_edit"
                name="is_template"
                checked={formData.is_template}
                onChange={handleInputChange}
                className="rounded"
              />
              <label htmlFor="is_template_edit" className="text-sm font-medium">
                Save as Template
              </label>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">
                  Checklist Items
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleItemAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {formData.items.map((item, index) => (
                  <div key={item.id} className="p-3 border rounded space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="Item title"
                        value={item.title}
                        onChange={(e) =>
                          handleItemChange(index, "title", e.target.value)
                        }
                        className="flex-1"
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "required",
                              e.target.checked,
                            )
                          }
                          className="rounded"
                        />
                        Required
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleItemMove(index, "up")}
                        disabled={index === 0}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleItemMove(index, "down")}
                        disabled={index === formData.items.length - 1}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleItemRemove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Item description (optional)"
                      value={item.description || ""}
                      onChange={(e) =>
                        handleItemChange(index, "description", e.target.value)
                      }
                      rows={2}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">
                          Category
                        </label>
                        <Input
                          placeholder="Category"
                          value={item.category || ""}
                          onChange={(e) =>
                            handleItemChange(index, "category", e.target.value)
                          }
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">
                          Assignee Type
                        </label>
                        <Select
                          value={item.assignee_type || "employee"}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "assignee_type",
                              e.target.value,
                            )
                          }
                          className="text-sm"
                          options={[
                            { value: "employee", label: "Employee" },
                            { value: "manager", label: "Manager" },
                            { value: "hr", label: "HR" },
                            { value: "it", label: "IT" },
                          ]}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">
                          Due Days
                        </label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={item.due_days || 0}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "due_days",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Update Checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedChecklist?.name}</DialogTitle>
            <DialogDescription>
              {selectedChecklist?.description || "No description"}
            </DialogDescription>
          </DialogHeader>
          {selectedChecklist && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium">Type:</span>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {selectedChecklist.checklist_type}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium">Status:</span>
                  <div className="mt-1">
                    {getStatusBadge(selectedChecklist.status)}
                  </div>
                </div>
              </div>
              <div>
                <span className="text-sm font-medium">
                  Items ({selectedChecklist.items?.length || 0}):
                </span>
                <div className="mt-2 space-y-2">
                  {selectedChecklist.items?.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="flex items-start gap-2 p-3 border rounded"
                    >
                      <CheckSquare className="h-5 w-5 text-zinc-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {item.title}
                          </span>
                          {item.required && (
                            <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-1 rounded">
                              Required
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                            {item.description}
                          </p>
                        )}
                        <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                          {item.category && (
                            <span>Category: {item.category}</span>
                          )}
                          {item.assignee_type && (
                            <span>Assignee: {item.assignee_type}</span>
                          )}
                          {item.due_days !== undefined && (
                            <span>Due: {item.due_days} days</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
