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
  Briefcase,
  Plus,
  Edit,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  onboardingService,
  OfficeAdminTask,
} from "../../../services/hr/onboardingService";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const PAGE_SIZE = 15;

const TASK_TYPE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "workspace", label: "Workspace Setup" },
  { value: "supplies", label: "Supplies" },
  { value: "access_badge", label: "Access Badge" },
  { value: "phone", label: "Phone / Desk Phone" },
  { value: "mail", label: "Mail / Mailbox" },
  { value: "travel", label: "Travel / Logistics" },
  { value: "custom", label: "Custom" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

type FormState = {
  name: string;
  description: string;
  task_type: OfficeAdminTask["task_type"];
  status: OfficeAdminTask["status"];
  priority: OfficeAdminTask["priority"];
  is_template: boolean;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  task_type: "standard",
  status: "pending",
  priority: "medium",
  is_template: true,
  notes: "",
};

export const OfficeAdminTasks: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<OfficeAdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "pending" | "in_progress" | "completed"
  >("all");
  const [page, setPage] = useState(1);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<OfficeAdminTask | null>(
    null,
  );
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Show templates by default — per-person assigned copies are visible on the Office Admin Onboarding dashboard.
      const filters: any = { is_template: true };
      if (filter !== "all") filters.status = filter;
      const data = await onboardingService.getOfficeAdminTasks(filters);
      setTasks(data);
    } catch (error: any) {
      console.error("Error fetching Office Admin tasks:", error);
      toast({
        title: "Error",
        description: "Failed to load tasks.",
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
    const { name, value, type } = e.target as any;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => setFormData(EMPTY_FORM);

  const handleCreate = async () => {
    if (!user?.id) return;
    if (!formData.name.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter a name.",
        variant: "destructive",
      });
      return;
    }
    try {
      await onboardingService.createOfficeAdminTask({
        ...formData,
        created_by: user.id,
      } as any);
      toast({
        title: "Success",
        description: "Office Admin task created.",
        variant: "success",
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create task",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!selectedTask) return;
    try {
      await onboardingService.updateOfficeAdminTask(selectedTask.id, {
        ...formData,
      });
      toast({
        title: "Success",
        description: "Task updated.",
        variant: "success",
      });
      setIsEditModalOpen(false);
      setSelectedTask(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update task",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Delete this task template? Already-assigned copies on employees are kept.",
      )
    )
      return;
    try {
      await onboardingService.deleteOfficeAdminTask(id);
      toast({
        title: "Deleted",
        description: "Task template deleted.",
        variant: "success",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete task",
        variant: "destructive",
      });
    }
  };

  const openEditModal = (task: OfficeAdminTask) => {
    setSelectedTask(task);
    setFormData({
      name: task.name,
      description: task.description || "",
      task_type: task.task_type,
      status: task.status,
      priority: task.priority,
      is_template: task.is_template ?? true,
      notes: task.notes || "",
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (task: OfficeAdminTask) => {
    setSelectedTask(task);
    setIsViewModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      in_progress:
        "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      completed:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      cancelled:
        "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
    };
    return (
      <span
        className={`px-2 py-1 rounded-none text-xs font-medium ${colors[status] || colors.pending}`}
      >
        {status.replace("_", " ")}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
      medium: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return (
      <span
        className={`px-2 py-1 rounded-none text-xs font-medium ${colors[priority] || colors.medium}`}
      >
        {priority}
      </span>
    );
  };

  const filteredTasks = tasks.filter((t) =>
    filter === "all" ? true : t.status === filter,
  );
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const paginatedTasks = filteredTasks.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const renderFormFields = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Name *</label>
        <Input
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          placeholder="e.g., Set up desk and monitor"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <Textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          placeholder="Brief description of what needs to be done"
          rows={3}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Task Type</label>
          <Select
            name="task_type"
            value={formData.task_type}
            onChange={handleInputChange}
            options={TASK_TYPE_OPTIONS}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Status</label>
          <Select
            name="status"
            value={formData.status}
            onChange={handleInputChange}
            options={STATUS_OPTIONS}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Priority</label>
          <Select
            name="priority"
            value={formData.priority}
            onChange={handleInputChange}
            options={PRIORITY_OPTIONS}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Notes</label>
        <Textarea
          name="notes"
          value={formData.notes}
          onChange={handleInputChange}
          rows={2}
          placeholder="Optional notes / instructions"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="office-admin-is-template"
          type="checkbox"
          name="is_template"
          checked={formData.is_template}
          onChange={handleInputChange}
          className="h-4 w-4 rounded border-neutral-300 text-[#f26722] focus:ring-[#f26722]"
        />
        <label
          htmlFor="office-admin-is-template"
          className="text-sm text-neutral-700 dark:text-neutral-300"
        >
          Save as template (reusable for assigning to new hires)
        </label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Briefcase className="h-8 w-8 text-[#f26722]" />
            Office Admin Tasks
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            Create and manage office admin task templates (workspace setup,
            supplies, badges, etc.) used when onboarding new hires.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateModalOpen(true);
          }}
          className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
        >
          <Plus className="h-4 w-4 mr-2" /> Create Task
        </Button>
      </div>

      <div className="flex gap-2">
        {(["all", "pending", "in_progress", "completed"] as const).map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilter(s);
              setPage(1);
            }}
          >
            {s === "all"
              ? "All"
              : s === "in_progress"
                ? "In Progress"
                : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="h-12 w-12 mx-auto text-neutral-400 mb-4" />
            <p className="text-neutral-600 dark:text-neutral-400">
              No tasks found. Create a template to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedTasks.map((task) => (
              <Card key={task.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg">{task.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {task.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <div className="flex gap-2 flex-wrap">
                      {getStatusBadge(task.status)}
                      {getPriorityBadge(task.priority)}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium">Type:</span>{" "}
                      {task.task_type.replace("_", " ")}
                    </div>
                    {task.is_template && (
                      <div className="text-xs inline-block px-2 py-0.5 rounded bg-[#f26722]/10 text-[#f26722] font-medium">
                        Template
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewModal(task)}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(task)}
                    >
                      <Edit className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(task.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredTasks.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                Page {page} of {totalPages} ({filteredTasks.length} total)
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

      {/* Create modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Office Admin Task</DialogTitle>
            <DialogDescription>
              Create a reusable task for office admin onboarding work.
            </DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog
        open={isEditModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditModalOpen(false);
            setSelectedTask(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Office Admin Task</DialogTitle>
            <DialogDescription>Update this task template.</DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setSelectedTask(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View modal */}
      <Dialog
        open={isViewModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsViewModalOpen(false);
            setSelectedTask(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-[#f26722]" />
              {selectedTask?.name}
            </DialogTitle>
            {selectedTask?.description && (
              <DialogDescription>{selectedTask.description}</DialogDescription>
            )}
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-3 pt-2 text-sm">
              <div className="flex gap-2 flex-wrap">
                {getStatusBadge(selectedTask.status)}
                {getPriorityBadge(selectedTask.priority)}
                {selectedTask.is_template && (
                  <span className="px-2 py-0.5 rounded bg-[#f26722]/10 text-[#f26722] text-xs font-medium">
                    Template
                  </span>
                )}
              </div>
              <div>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  Type:
                </span>{" "}
                {selectedTask.task_type.replace("_", " ")}
              </div>
              {selectedTask.due_date && (
                <div>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    Due:
                  </span>{" "}
                  {selectedTask.due_date}
                </div>
              )}
              {selectedTask.notes && (
                <div>
                  <div className="font-medium text-neutral-700 dark:text-neutral-300">
                    Notes
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
                    {selectedTask.notes}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsViewModalOpen(false);
                setSelectedTask(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OfficeAdminTasks;
