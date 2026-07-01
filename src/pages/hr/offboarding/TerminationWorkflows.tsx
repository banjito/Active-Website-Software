import React, { useState, useEffect } from "react";
import Card, {
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import {
  DoorOpen,
  Plus,
  Edit,
  Trash2,
  Eye,
  Search,
  CheckSquare,
  FileText,
  Loader2,
  Clock,
  CheckCircle,
  Archive,
} from "lucide-react";
import { toast } from "../../../components/ui/toast";

export interface TerminationTask {
  id: string;
  title: string;
  description?: string;
  category: "hr" | "it" | "facilities" | "manager" | "other";
  required: boolean;
  order: number;
  assignee_type: "hr" | "manager" | "employee" | "it";
  due_days_after_notice?: number;
}

export interface TerminationDocument {
  id: string;
  name: string;
  doc_type:
    | "release"
    | "return_property"
    | "confidentiality"
    | "final_pay"
    | "other";
  required: boolean;
  order: number;
}

export interface TerminationWorkflow {
  id: string;
  name: string;
  description?: string;
  tasks: TerminationTask[];
  documents: TerminationDocument[];
  status: "draft" | "active" | "archived";
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORY_OPTIONS = [
  { value: "hr", label: "HR" },
  { value: "it", label: "IT" },
  { value: "facilities", label: "Facilities" },
  { value: "manager", label: "Manager" },
  { value: "other", label: "Other" },
];

const DOC_TYPE_OPTIONS = [
  { value: "release", label: "Separation / Release" },
  { value: "return_property", label: "Return of Property" },
  { value: "confidentiality", label: "Confidentiality / NDA" },
  { value: "final_pay", label: "Final Pay Acknowledgment" },
  { value: "other", label: "Other" },
];

const ASSIGNEE_OPTIONS = [
  { value: "hr", label: "HR" },
  { value: "manager", label: "Manager" },
  { value: "employee", label: "Employee" },
  { value: "it", label: "IT" },
];

const STATUS_OPTIONS = [
  {
    value: "draft",
    label: "Draft",
    icon: Clock,
    color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
  },
  {
    value: "active",
    label: "Active",
    icon: CheckCircle,
    color: "text-green-600 bg-green-50 dark:bg-green-900/20",
  },
  {
    value: "archived",
    label: "Archived",
    icon: Archive,
    color: "text-neutral-500 bg-neutral-100 dark:bg-neutral-800",
  },
];

const defaultWorkflow = (): Omit<
  TerminationWorkflow,
  "id" | "created_at" | "updated_at"
> => ({
  name: "",
  description: "",
  tasks: [],
  documents: [],
  status: "draft",
  is_template: true,
});

export const TerminationWorkflows: React.FC = () => {
  const [workflows, setWorkflows] = useState<TerminationWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<TerminationWorkflow | null>(null);
  const [formData, setFormData] = useState(defaultWorkflow());

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      const stored = localStorage.getItem("hr_termination_workflows");
      const parsed = stored ? JSON.parse(stored) : [];
      setWorkflows(Array.isArray(parsed) ? parsed : []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load workflows",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveWorkflows = (list: TerminationWorkflow[]) => {
    localStorage.setItem("hr_termination_workflows", JSON.stringify(list));
    setWorkflows(list);
  };

  const filteredWorkflows = workflows.filter((w) => {
    if (filterStatus !== "all" && w.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        w.name.toLowerCase().includes(q) ||
        (w.description || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const addTask = () => {
    setFormData((prev) => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        {
          id: `task_${Date.now()}`,
          title: "",
          category: "hr",
          required: true,
          order: prev.tasks.length,
          assignee_type: "hr",
        },
      ],
    }));
  };

  const updateTask = (
    index: number,
    field: keyof TerminationTask,
    value: any,
  ) => {
    setFormData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t, i) =>
        i === index ? { ...t, [field]: value } : t,
      ),
    }));
  };

  const removeTask = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((_, i) => i !== index),
    }));
  };

  const addDocument = () => {
    setFormData((prev) => ({
      ...prev,
      documents: [
        ...prev.documents,
        {
          id: `doc_${Date.now()}`,
          name: "",
          doc_type: "release",
          required: true,
          order: prev.documents.length,
        },
      ],
    }));
  };

  const updateDocument = (
    index: number,
    field: keyof TerminationDocument,
    value: any,
  ) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.map((d, i) =>
        i === index ? { ...d, [field]: value } : d,
      ),
    }));
  };

  const removeDocument = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));
  };

  const openCreate = () => {
    setFormData(defaultWorkflow());
    setIsCreateModalOpen(true);
  };

  const openEdit = (w: TerminationWorkflow) => {
    setSelectedWorkflow(w);
    setFormData({
      name: w.name,
      description: w.description || "",
      tasks: w.tasks.map((t) => ({ ...t })),
      documents: w.documents.map((d) => ({ ...d })),
      status: w.status,
      is_template: w.is_template,
    });
    setIsEditModalOpen(true);
  };

  const openView = (w: TerminationWorkflow) => {
    setSelectedWorkflow(w);
    setIsViewModalOpen(true);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation",
        description: "Workflow name is required.",
        variant: "destructive",
      });
      return;
    }
    const now = new Date().toISOString();
    const newW: TerminationWorkflow = {
      id: `wf_${Date.now()}`,
      ...formData,
      created_at: now,
      updated_at: now,
    };
    saveWorkflows([...workflows, newW]);
    setIsCreateModalOpen(false);
    toast({ title: "Created", description: "Termination workflow created." });
  };

  const handleUpdate = () => {
    if (!selectedWorkflow || !formData.name.trim()) {
      toast({
        title: "Validation",
        description: "Workflow name is required.",
        variant: "destructive",
      });
      return;
    }
    const updated = workflows.map((w) =>
      w.id === selectedWorkflow.id
        ? { ...w, ...formData, updated_at: new Date().toISOString() }
        : w,
    );
    saveWorkflows(updated);
    setIsEditModalOpen(false);
    setSelectedWorkflow(null);
    toast({ title: "Updated", description: "Workflow updated." });
  };

  const handleDelete = (w: TerminationWorkflow) => {
    if (!confirm("Delete this workflow?")) return;
    saveWorkflows(workflows.filter((x) => x.id !== w.id));
    toast({ title: "Deleted", description: "Workflow removed." });
  };

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find((s) => s.value === status);
    if (!opt) return null;
    const Icon = opt.icon;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-medium ${opt.color}`}
      >
        <Icon className="h-3 w-3" />
        {opt.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <DoorOpen className="h-6 w-6 text-[#f26722]" />
            Termination Workflows
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Define tasks and documents for employee offboarding
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search workflows..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {["all", "draft", "active", "archived"].map((status) => (
                <Button
                  key={status}
                  variant={filterStatus === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus(status)}
                  className="capitalize"
                >
                  {status === "all" ? "All" : status}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflows Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Workflows ({filteredWorkflows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#f26722]" />
            </div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="text-center py-12 px-4">
              <DoorOpen className="h-12 w-12 mx-auto mb-3 text-neutral-300 dark:text-neutral-600" />
              <p className="text-neutral-500 dark:text-neutral-400 font-medium">
                No workflows found
              </p>
              <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1">
                {search || filterStatus !== "all"
                  ? "Try adjusting your filters"
                  : "Create your first termination workflow"}
              </p>
              {!search && filterStatus === "all" && (
                <Button variant="outline" className="mt-4" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Workflow
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                    <th className="text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-6 py-3">
                      Workflow
                    </th>
                    <th className="text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-6 py-3">
                      Tasks
                    </th>
                    <th className="text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-6 py-3">
                      Documents
                    </th>
                    <th className="text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-6 py-3">
                      Status
                    </th>
                    <th className="text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-6 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {filteredWorkflows.map((w) => (
                    <tr
                      key={w.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-white">
                            {w.name}
                          </p>
                          {w.description && (
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">
                              {w.description}
                            </p>
                          )}
                          {w.is_template && (
                            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                              Template
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
                          <CheckSquare className="h-4 w-4 text-neutral-400" />
                          {w.tasks.length}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
                          <FileText className="h-4 w-4 text-neutral-400" />
                          {w.documents.length}
                        </span>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(w.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openView(w)}
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(w)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(w)}
                            title="Delete"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog
        open={isCreateModalOpen || isEditModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateModalOpen(false);
            setIsEditModalOpen(false);
            setSelectedWorkflow(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditModalOpen ? "Edit Workflow" : "New Termination Workflow"}
            </DialogTitle>
            <DialogDescription>
              Configure the tasks and documents for this workflow.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Workflow Name *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Standard Voluntary Exit"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Description
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Brief description of this workflow"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      status: e.target.value as any,
                    }))
                  }
                  className="w-full h-10 px-3 rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_template}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        is_template: e.target.checked,
                      }))
                    }
                    className="rounded border-neutral-300 text-[#f26722] focus:ring-[#f26722]"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    Save as template
                  </span>
                </label>
              </div>
            </div>

            {/* Tasks Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Tasks ({formData.tasks.length})
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTask}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Task
                </Button>
              </div>
              {formData.tasks.length === 0 ? (
                <div className="border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-none p-6 text-center">
                  <CheckSquare className="h-8 w-8 mx-auto text-neutral-300 dark:text-neutral-600 mb-2" />
                  <p className="text-sm text-neutral-500">
                    No tasks yet. Add tasks that need to be completed during
                    offboarding.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.tasks.map((task, i) => (
                    <div
                      key={task.id}
                      className="flex gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-none"
                    >
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Input
                          value={task.title}
                          onChange={(e) =>
                            updateTask(i, "title", e.target.value)
                          }
                          placeholder="Task title"
                          className="sm:col-span-3"
                        />
                        <select
                          value={task.assignee_type}
                          onChange={(e) =>
                            updateTask(i, "assignee_type", e.target.value)
                          }
                          className="h-10 px-3 rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                        >
                          {ASSIGNEE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={task.category}
                          onChange={(e) =>
                            updateTask(i, "category", e.target.value)
                          }
                          className="h-10 px-3 rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                        >
                          {CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={task.required}
                            onChange={(e) =>
                              updateTask(i, "required", e.target.checked)
                            }
                            className="rounded border-neutral-300 text-[#f26722] focus:ring-[#f26722]"
                          />
                          <span className="text-sm text-neutral-600 dark:text-neutral-400">
                            Required
                          </span>
                        </label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTask(i)}
                      >
                        <Trash2 className="h-4 w-4 text-neutral-400 hover:text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Documents Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Documents ({formData.documents.length})
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDocument}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Document
                </Button>
              </div>
              {formData.documents.length === 0 ? (
                <div className="border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-none p-6 text-center">
                  <FileText className="h-8 w-8 mx-auto text-neutral-300 dark:text-neutral-600 mb-2" />
                  <p className="text-sm text-neutral-500">
                    No documents yet. Add documents required for offboarding.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.documents.map((doc, i) => (
                    <div
                      key={doc.id}
                      className="flex gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-none"
                    >
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Input
                          value={doc.name}
                          onChange={(e) =>
                            updateDocument(i, "name", e.target.value)
                          }
                          placeholder="Document name"
                          className="sm:col-span-1"
                        />
                        <select
                          value={doc.doc_type}
                          onChange={(e) =>
                            updateDocument(i, "doc_type", e.target.value)
                          }
                          className="h-10 px-3 rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                        >
                          {DOC_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={doc.required}
                            onChange={(e) =>
                              updateDocument(i, "required", e.target.checked)
                            }
                            className="rounded border-neutral-300 text-[#f26722] focus:ring-[#f26722]"
                          />
                          <span className="text-sm text-neutral-600 dark:text-neutral-400">
                            Required
                          </span>
                        </label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocument(i)}
                      >
                        <Trash2 className="h-4 w-4 text-neutral-400 hover:text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false);
                setIsEditModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={isEditModalOpen ? handleUpdate : handleCreate}>
              {isEditModalOpen ? "Save Changes" : "Create Workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedWorkflow?.name}</DialogTitle>
            <DialogDescription>
              {selectedWorkflow?.description || "No description provided"}
            </DialogDescription>
          </DialogHeader>
          {selectedWorkflow && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-3">
                {getStatusBadge(selectedWorkflow.status)}
                {selectedWorkflow.is_template && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-none text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                    Template
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-neutral-400" />
                  Tasks ({selectedWorkflow.tasks.length})
                </h4>
                {selectedWorkflow.tasks.length === 0 ? (
                  <p className="text-sm text-neutral-500">No tasks defined</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedWorkflow.tasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-none bg-[#f26722] mt-2 flex-shrink-0" />
                        <div>
                          <span className="text-neutral-900 dark:text-white">
                            {t.title}
                          </span>
                          <span className="text-neutral-500 ml-2">
                            (
                            {
                              ASSIGNEE_OPTIONS.find(
                                (a) => a.value === t.assignee_type,
                              )?.label
                            }
                            )
                          </span>
                          {t.required && (
                            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                              Required
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-neutral-400" />
                  Documents ({selectedWorkflow.documents.length})
                </h4>
                {selectedWorkflow.documents.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    No documents defined
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedWorkflow.documents.map((d) => (
                      <li key={d.id} className="flex items-start gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-none bg-[#f26722] mt-2 flex-shrink-0" />
                        <div>
                          <span className="text-neutral-900 dark:text-white">
                            {d.name || "Unnamed"}
                          </span>
                          <span className="text-neutral-500 ml-2">
                            (
                            {
                              DOC_TYPE_OPTIONS.find(
                                (o) => o.value === d.doc_type,
                              )?.label
                            }
                            )
                          </span>
                          {d.required && (
                            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                              Required
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setIsViewModalOpen(false);
                if (selectedWorkflow) openEdit(selectedWorkflow);
              }}
            >
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
