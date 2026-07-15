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
  FileText,
  Plus,
  Edit,
  Trash2,
  Eye,
  Search,
  Loader2,
  Clock,
  CheckCircle,
  FileCheck,
  AlertCircle,
  Upload,
  Download,
  X,
} from "lucide-react";
import { toast } from "../../../components/ui/toast";

export type FinalDocType =
  | "release"
  | "return_of_property"
  | "confidentiality"
  | "final_pay_ack"
  | "cobra_notice"
  | "benefits_termination"
  | "other";

export interface FinalDocTemplate {
  id: string;
  name: string;
  description?: string;
  doc_type: FinalDocType;
  required: boolean;
  instructions?: string;
  status: "draft" | "active" | "archived";
  /** Uploaded file: name and base64 data (e.g. .doc, .docx, .pdf) */
  attachment_name?: string;
  attachment_data?: string;
  created_at: string;
  updated_at: string;
}

export interface FinalDocAssignment {
  id: string;
  template_id: string;
  employee_name?: string;
  employee_id?: string;
  status: "pending" | "signed" | "declined" | "waived";
  signed_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

const DOC_TYPE_OPTIONS = [
  { value: "release", label: "Separation / Release Agreement" },
  { value: "return_of_property", label: "Return of Property" },
  { value: "confidentiality", label: "Confidentiality / NDA" },
  { value: "final_pay_ack", label: "Final Pay Acknowledgment" },
  { value: "cobra_notice", label: "COBRA Notice" },
  { value: "benefits_termination", label: "Benefits Termination" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  {
    value: "draft",
    label: "Draft",
    color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
  },
  {
    value: "active",
    label: "Active",
    color: "text-green-600 bg-green-50 dark:bg-green-900/20",
  },
  {
    value: "archived",
    label: "Archived",
    color: "text-neutral-500 bg-neutral-100 dark:bg-neutral-800",
  },
];

const ASSIGNMENT_STATUS_OPTIONS = [
  {
    value: "pending",
    label: "Pending",
    icon: Clock,
    color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
  },
  {
    value: "signed",
    label: "Signed",
    icon: CheckCircle,
    color: "text-green-600 bg-green-50 dark:bg-green-900/20",
  },
  {
    value: "declined",
    label: "Declined",
    icon: AlertCircle,
    color: "text-red-600 bg-red-50 dark:bg-red-900/20",
  },
  {
    value: "waived",
    label: "Waived",
    icon: FileCheck,
    color: "text-neutral-500 bg-neutral-100 dark:bg-neutral-800",
  },
];

const defaultTemplate = (): Omit<
  FinalDocTemplate,
  "id" | "created_at" | "updated_at"
> => ({
  name: "",
  description: "",
  doc_type: "release",
  required: true,
  instructions: "",
  status: "draft",
  attachment_name: undefined,
  attachment_data: undefined,
});

const ACCEPTED_FILE_TYPES = ".doc,.docx,.pdf,.txt";
const MAX_FILE_MB = 5;

function downloadAttachment(name: string, base64Data: string) {
  try {
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } catch (_) {
    console.error("Download failed");
  }
}

export const FinalDocs: React.FC = () => {
  const [templates, setTemplates] = useState<FinalDocTemplate[]>([]);
  const [assignments, setAssignments] = useState<FinalDocAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<FinalDocTemplate | null>(null);
  const [formData, setFormData] = useState(defaultTemplate());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const storedT = localStorage.getItem("hr_final_doc_templates");
      const storedA = localStorage.getItem("hr_final_doc_assignments");
      setTemplates(storedT ? JSON.parse(storedT) : []);
      setAssignments(storedA ? JSON.parse(storedA) : []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveTemplates = (list: FinalDocTemplate[]) => {
    localStorage.setItem("hr_final_doc_templates", JSON.stringify(list));
    setTemplates(list);
  };

  const filteredTemplates = templates.filter((t) => {
    if (filterType !== "all" && t.doc_type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openCreate = () => {
    setFormData(defaultTemplate());
    setIsCreateModalOpen(true);
  };

  const openEdit = (t: FinalDocTemplate) => {
    setSelectedTemplate(t);
    setFormData({
      name: t.name,
      description: t.description || "",
      doc_type: t.doc_type,
      required: t.required,
      instructions: t.instructions || "",
      status: t.status,
      attachment_name: t.attachment_name,
      attachment_data: t.attachment_data,
    });
    setIsEditModalOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast({
        title: "File too large",
        description: `Keep files under ${MAX_FILE_MB} MB.`,
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 =
        dataUrl.indexOf(",") >= 0 ? dataUrl.split(",")[1] : dataUrl;
      setFormData((p) => ({
        ...p,
        attachment_name: file.name,
        attachment_data: base64,
      }));
      toast({ title: "File attached", description: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removeAttachment = () => {
    setFormData((p) => ({
      ...p,
      attachment_name: undefined,
      attachment_data: undefined,
    }));
  };

  const openView = (t: FinalDocTemplate) => {
    setSelectedTemplate(t);
    setIsViewModalOpen(true);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation",
        description: "Document name is required.",
        variant: "destructive",
      });
      return;
    }
    const now = new Date().toISOString();
    const newT: FinalDocTemplate = {
      id: `fd_${Date.now()}`,
      ...formData,
      created_at: now,
      updated_at: now,
    };
    saveTemplates([...templates, newT]);
    setIsCreateModalOpen(false);
    toast({ title: "Created", description: "Document template created." });
  };

  const handleUpdate = () => {
    if (!selectedTemplate || !formData.name.trim()) {
      toast({
        title: "Validation",
        description: "Document name is required.",
        variant: "destructive",
      });
      return;
    }
    const updated = templates.map((t) =>
      t.id === selectedTemplate.id
        ? { ...t, ...formData, updated_at: new Date().toISOString() }
        : t,
    );
    saveTemplates(updated);
    setIsEditModalOpen(false);
    setSelectedTemplate(null);
    toast({ title: "Updated", description: "Template updated." });
  };

  const handleDelete = (t: FinalDocTemplate) => {
    if (!confirm("Delete this template?")) return;
    saveTemplates(templates.filter((x) => x.id !== t.id));
    toast({ title: "Deleted", description: "Template removed." });
  };

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find((o) => o.value === status);
    if (!opt) return null;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-medium ${opt.color}`}
      >
        {status === "active" ? (
          <CheckCircle className="h-3 w-3" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        {opt.label}
      </span>
    );
  };

  const getDocTypeLabel = (type: FinalDocType) => {
    return DOC_TYPE_OPTIONS.find((o) => o.value === type)?.label || type;
  };

  // Stats
  const stats = {
    total: templates.length,
    active: templates.filter((t) => t.status === "active").length,
    required: templates.filter((t) => t.required).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-brand" />
            Final Documents
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Release agreements, property returns, and other offboarding
            documents
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-none bg-neutral-100 dark:bg-neutral-800">
                <FileText className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {stats.total}
                </p>
                <p className="text-sm text-neutral-500">Total Templates</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-none bg-green-100 dark:bg-green-900/20">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {stats.active}
                </p>
                <p className="text-sm text-neutral-500">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-none bg-amber-100 dark:bg-amber-900/20">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">
                  {stats.required}
                </p>
                <p className="text-sm text-neutral-500">Required</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-10 px-3 rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm min-w-[180px]"
            >
              <option value="all">All Types</option>
              {DOC_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Templates Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Document Templates ({filteredTemplates.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12 px-4">
              <FileText className="h-12 w-12 mx-auto mb-3 text-neutral-300 dark:text-neutral-600" />
              <p className="text-neutral-500 dark:text-neutral-400 font-medium">
                No documents found
              </p>
              <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-1">
                {search || filterType !== "all"
                  ? "Try adjusting your filters"
                  : "Create your first document template"}
              </p>
              {!search && filterType === "all" && (
                <Button variant="outline" className="mt-4" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                    <th className="text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-6 py-3">
                      Document
                    </th>
                    <th className="text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-6 py-3">
                      Type
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
                  {filteredTemplates.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-white">
                            {t.name}
                          </p>
                          {t.description && (
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">
                              {t.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {t.attachment_name && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300"
                                title={t.attachment_name}
                              >
                                <FileText className="h-3 w-3" />
                                {t.attachment_name.length > 20
                                  ? t.attachment_name.slice(0, 17) + "…"
                                  : t.attachment_name}
                              </span>
                            )}
                            {t.required && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                                Required
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-neutral-600 dark:text-neutral-300">
                          {getDocTypeLabel(t.doc_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(t.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openView(t)}
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(t)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(t)}
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
            setSelectedTemplate(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEditModalOpen ? "Edit Template" : "New Document Template"}
            </DialogTitle>
            <DialogDescription>
              Configure a document template for offboarding.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Document Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Separation Agreement"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Document Type
              </label>
              <select
                value={formData.doc_type}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    doc_type: e.target.value as FinalDocType,
                  }))
                }
                className="w-full h-10 px-3 rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Description
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Brief description of this document"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Instructions for Employee
              </label>
              <Textarea
                value={formData.instructions}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, instructions: e.target.value }))
                }
                placeholder="e.g. Sign and return by your last day"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Upload document (optional)
              </label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Attach a file if you don’t want to create the document here —
                e.g. .doc, .docx, .pdf, .txt (max {MAX_FILE_MB} MB).
              </p>
              {formData.attachment_name ? (
                <div className="flex items-center justify-between gap-2 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-none border border-neutral-200 dark:border-neutral-700">
                  <span className="text-sm font-medium text-neutral-900 dark:text-white truncate flex items-center gap-2">
                    <FileText className="h-4 w-4 flex-shrink-0 text-neutral-500" />
                    {formData.attachment_name}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeAttachment}
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-24 border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-none cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <Upload className="h-5 w-5 text-neutral-400" />
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    Choose file to upload
                  </span>
                  <input
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="flex items-center gap-6">
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
                  className="h-10 px-3 rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.required}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, required: e.target.checked }))
                    }
                    className="rounded border-neutral-300 text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    Required for offboarding
                  </span>
                </label>
              </div>
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
              {isEditModalOpen ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              {selectedTemplate?.description || "No description provided"}
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                {getStatusBadge(selectedTemplate.status)}
                {selectedTemplate.required && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-none text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                    Required
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-neutral-500 dark:text-neutral-400">Type</p>
                  <p className="font-medium text-neutral-900 dark:text-white mt-0.5">
                    {getDocTypeLabel(selectedTemplate.doc_type)}
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500 dark:text-neutral-400">
                    Created
                  </p>
                  <p className="font-medium text-neutral-900 dark:text-white mt-0.5">
                    {new Date(selectedTemplate.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {selectedTemplate.instructions && (
                <div>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">
                    Instructions
                  </p>
                  <p className="text-sm text-neutral-900 dark:text-white bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-none">
                    {selectedTemplate.instructions}
                  </p>
                </div>
              )}

              {selectedTemplate.attachment_name &&
                selectedTemplate.attachment_data && (
                  <div>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">
                      Attached file
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadAttachment(
                          selectedTemplate.attachment_name!,
                          selectedTemplate.attachment_data!,
                        )
                      }
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download {selectedTemplate.attachment_name}
                    </Button>
                  </div>
                )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setIsViewModalOpen(false);
                if (selectedTemplate) openEdit(selectedTemplate);
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
