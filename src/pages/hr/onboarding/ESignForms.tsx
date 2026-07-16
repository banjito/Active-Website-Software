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
  FileCheck,
  Plus,
  Edit,
  Trash2,
  Eye,
  X,
  CheckCircle,
  Upload,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PAGE_SIZE = 15;
import {
  onboardingService,
  ESignForm,
} from "../../../services/hr/onboardingService";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { supabase } from "../../../lib/supabase";
import type { SignatureFieldPosition } from "../../../components/pdf/PDFSignatureFieldPlacer";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const ESignForms: React.FC = () => {
  const { user } = useAuth();
  const [forms, setForms] = useState<ESignForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "templates" | "active" | "archived"
  >("all");
  const [page, setPage] = useState(1);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<ESignForm | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    form_type: "standard" as const,
    form_content: "",
    form_fields: [] as Array<{
      name: string;
      type: string;
      required: boolean;
      label: string;
      placeholder?: string;
    }>,
    signature_fields: [] as Array<{
      name: string;
      label: string;
      required: boolean;
      signer_type: string;
    }>,
    status: "draft" as const,
    is_template: false,
    requires_acknowledgment: true,
    attached_documents: [] as Array<{
      name: string;
      file_url?: string;
      file_path?: string;
      signature_fields?: SignatureFieldPosition[];
    }>,
  });

  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{
    name: string;
    file_url?: string;
    file_path?: string;
  } | null>(null);

  /** Default signature field at bottom of first page (used for all attached documents). */
  const defaultBottomSignatureField = (): SignatureFieldPosition => ({
    id: `field_${Date.now()}`,
    name: "Signature",
    page: 1,
    x: 10,
    y: 85,
    width: 80,
    height: 8,
    required: true,
    signer_type: "employee",
  });
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentError, setDocumentError] = useState(false);

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

      const data = await onboardingService.getESignForms(filters);
      setForms(data);
    } catch (error: any) {
      console.error("Error fetching forms:", error);
      toast({
        title: "Error",
        description: "Failed to load forms. Please try again.",
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

  const handleFormFieldAdd = () => {
    setFormData((prev) => ({
      ...prev,
      form_fields: [
        ...prev.form_fields,
        {
          name: `field_${Date.now()}`,
          type: "text",
          required: false,
          label: "",
          placeholder: "",
        },
      ],
    }));
  };

  const handleFormFieldChange = (index: number, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      form_fields: prev.form_fields.map((f, i) =>
        i === index ? { ...f, [field]: value } : f,
      ),
    }));
  };

  const handleFormFieldRemove = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      form_fields: prev.form_fields.filter((_, i) => i !== index),
    }));
  };

  const handleSignatureFieldAdd = () => {
    setFormData((prev) => ({
      ...prev,
      signature_fields: [
        ...prev.signature_fields,
        {
          name: `signature_${Date.now()}`,
          label: "",
          required: true,
          signer_type: "employee",
        },
      ],
    }));
  };

  const handleSignatureFieldChange = (
    index: number,
    field: string,
    value: any,
  ) => {
    setFormData((prev) => ({
      ...prev,
      signature_fields: prev.signature_fields.map((f, i) =>
        i === index ? { ...f, [field]: value } : f,
      ),
    }));
  };

  const handleSignatureFieldRemove = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      signature_fields: prev.signature_fields.filter((_, i) => i !== index),
    }));
  };

  const handleDocumentAdd = () => {
    setFormData((prev) => ({
      ...prev,
      attached_documents: [...prev.attached_documents, { name: "" }],
    }));
  };

  const handleDocumentChange = (index: number, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      attached_documents: prev.attached_documents.map((doc, i) =>
        i === index ? { ...doc, [field]: value } : doc,
      ),
    }));
  };

  const handleDocumentRemove = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      attached_documents: prev.attached_documents.filter((_, i) => i !== index),
    }));
  };

  const handleFileUpload = async (index: number, file: File) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to upload files",
        variant: "destructive",
      });
      return;
    }

    setUploadingIndex(index);

    try {
      // Validate file size (50MB limit)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        toast({
          title: "Error",
          description: "File size exceeds 50MB limit",
          variant: "destructive",
        });
        setUploadingIndex(null);
        return;
      }

      // Create unique file name
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `onboarding-documents/e-sign-forms/${fileName}`;

      // Upload to Supabase Storage (using 'documents' bucket)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(filePath);

      // Update document with file info and add default signature at bottom
      setFormData((prev) => ({
        ...prev,
        attached_documents: prev.attached_documents.map((doc, i) =>
          i === index
            ? {
                ...doc,
                file_path: filePath,
                file_url: publicUrl,
                name: doc.name || file.name,
                signature_fields: [defaultBottomSignatureField()],
              }
            : doc,
        ),
      }));

      toast({
        title: "Success",
        description: "File uploaded successfully",
        variant: "success",
      });
    } catch (error: any) {
      console.error("File upload error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploadingIndex(null);
    }
  };

  const openDocumentViewer = (doc: {
    name: string;
    file_url?: string;
    file_path?: string;
  }) => {
    setSelectedDocument(doc);
    setIsDocumentViewerOpen(true);
    setDocumentLoading(true);
    setDocumentError(false);
  };

  const handleDocumentViewerClose = () => {
    setIsDocumentViewerOpen(false);
    setSelectedDocument(null);
    setDocumentLoading(false);
    setDocumentError(false);
  };

  const handleDocumentDownload = (doc: {
    name: string;
    file_url?: string;
    file_path?: string;
  }) => {
    if (doc.file_url) {
      const link = document.createElement("a");
      link.href = doc.file_url;
      link.download = doc.name;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDocumentOpenInNewTab = (doc: {
    name: string;
    file_url?: string;
    file_path?: string;
  }) => {
    if (doc.file_url) {
      window.open(doc.file_url, "_blank");
    }
  };

  const isPdfFile = (url?: string) => {
    if (!url) return false;
    return url.toLowerCase().endsWith(".pdf");
  };

  const isImageFile = (url?: string) => {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.form_content.trim()) {
      toast({
        title: "Error",
        description: "Please enter a form name and content",
        variant: "destructive",
      });
      return;
    }

    if (!user) return;

    try {
      // Ensure each attached document with a file has a signature at bottom
      const attachedWithSignatures = formData.attached_documents.map(
        (doc: any) =>
          doc.file_url &&
          (!doc.signature_fields || doc.signature_fields.length === 0)
            ? { ...doc, signature_fields: [defaultBottomSignatureField()] }
            : doc,
      );
      const customFields = {
        attached_documents: attachedWithSignatures,
      };

      await onboardingService.createESignForm({
        ...formData,
        custom_fields: customFields as any,
        created_by: user.id,
      } as any);

      toast({
        title: "Success",
        description: "E-sign form created successfully",
        variant: "success",
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create form",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!selectedForm) return;

    if (!formData.name.trim() || !formData.form_content.trim()) {
      toast({
        title: "Error",
        description: "Please enter a form name and content",
        variant: "destructive",
      });
      return;
    }

    try {
      // Ensure each attached document with a file has a signature at bottom
      const attachedWithSignatures = formData.attached_documents.map(
        (doc: any) =>
          doc.file_url &&
          (!doc.signature_fields || doc.signature_fields.length === 0)
            ? { ...doc, signature_fields: [defaultBottomSignatureField()] }
            : doc,
      );
      const customFields = {
        attached_documents: attachedWithSignatures,
      };

      await onboardingService.updateESignForm(selectedForm.id, {
        ...formData,
        custom_fields: customFields as any,
      } as any);

      toast({
        title: "Success",
        description: "E-sign form updated successfully",
        variant: "success",
      });
      setIsEditModalOpen(false);
      setSelectedForm(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update form",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this form?")) return;

    try {
      await onboardingService.deleteESignForm(id);
      toast({
        title: "Success",
        description: "Form deleted successfully",
        variant: "success",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete form",
        variant: "destructive",
      });
    }
  };

  const openEditModal = (form: ESignForm) => {
    setSelectedForm(form);
    // Try to get attached_documents from custom_fields or create empty array
    const customFields = (form as any).custom_fields || {};
    const attachedDocs = customFields.attached_documents || [];

    setFormData({
      name: form.name,
      description: form.description || "",
      form_type: form.form_type,
      form_content: form.form_content,
      form_fields: form.form_fields || [],
      signature_fields: form.signature_fields || [],
      status: form.status,
      is_template: form.is_template,
      requires_acknowledgment: form.requires_acknowledgment,
      attached_documents: attachedDocs,
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (form: ESignForm) => {
    setSelectedForm(form);
    setIsViewModalOpen(true);
    // Debug: log the form data to see what we're getting
    console.log("Viewing form:", form);
    console.log("Custom fields:", (form as any).custom_fields);
    console.log(
      "Attached documents:",
      (form as any).custom_fields?.attached_documents,
    );
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      form_type: "standard",
      form_content: "",
      form_fields: [],
      signature_fields: [],
      status: "draft",
      is_template: false,
      requires_acknowledgment: true,
      attached_documents: [],
    });
    setUploadingIndex(null);
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      draft:
        "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
      active:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      archived:
        "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
    };
    return (
      <span
        className={`px-2 py-1 rounded-none text-xs font-medium ${colors[status as keyof typeof colors] || colors.draft}`}
      >
        {status}
      </span>
    );
  };

  const filteredForms = forms.filter((f) => {
    if (filter === "templates") return f.is_template;
    if (filter === "active") return f.status === "active";
    if (filter === "archived") return f.status === "archived";
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredForms.length / PAGE_SIZE));
  const paginatedForms = filteredForms.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            E-Sign Forms
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            Create and manage electronic signature forms for onboarding
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateModalOpen(true);
          }}
          className="bg-brand hover:bg-brand/90 text-white" leftIcon={<Plus className="h-4 w-4" />}>
          Create Form
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

      {/* Forms List */}
      {loading ? (
        <div className="text-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : filteredForms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileCheck className="h-12 w-12 mx-auto text-neutral-400 mb-4" />
            <p className="text-neutral-600 dark:text-neutral-400">
              No forms found
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedForms.map((form) => (
              <Card key={form.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{form.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {form.description || "No description"}
                      </CardDescription>
                    </div>
                    {getStatusBadge(form.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium">Type:</span>{" "}
                      {form.form_type}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium">Fields:</span>{" "}
                      {form.form_fields?.length || 0}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium">Signatures:</span>{" "}
                      {form.signature_fields?.length || 0}
                    </div>
                    {form.is_template && (
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs">
                        Template
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewModal(form)} leftIcon={<Eye className="h-4 w-4" />}>
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(form)} leftIcon={<Edit className="h-4 w-4" />}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(form.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredForms.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                Page {page} of {totalPages} ({filteredForms.length} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1} leftIcon={<ChevronLeft className="h-4 w-4" />}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages} rightIcon={<ChevronRight className="h-4 w-4" />}>
                  Next
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
            <DialogTitle>Create E-Sign Form</DialogTitle>
            <DialogDescription>
              Create a new electronic signature form for onboarding
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Employee Handbook Acknowledgment"
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
                placeholder="Brief description of this form"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Form Type
                </label>
                <Select
                  name="form_type"
                  value={formData.form_type}
                  onChange={handleInputChange}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "policy", label: "Policy" },
                    { value: "agreement", label: "Agreement" },
                    { value: "disclosure", label: "Disclosure" },
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requires_acknowledgment"
                name="requires_acknowledgment"
                checked={formData.requires_acknowledgment}
                onChange={handleInputChange}
                className="rounded"
              />
              <label
                htmlFor="requires_acknowledgment"
                className="text-sm font-medium"
              >
                Requires Acknowledgment
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Form Content *
              </label>
              <Textarea
                name="form_content"
                value={formData.form_content}
                onChange={handleInputChange}
                placeholder="Enter the form content (HTML or plain text)"
                rows={8}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">
                  Attached Documents (PDFs)
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDocumentAdd} leftIcon={<Plus className="h-4 w-4" />}>
                  Add Document
                </Button>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Upload tax documents, policy documents, and other PDFs that need
                to be signed
              </p>
              <div className="space-y-2">
                {formData.attached_documents.map((doc, index) => (
                  <div
                    key={index}
                    className="flex gap-2 items-center p-2 border rounded"
                  >
                    <Input
                      placeholder="Document name (e.g., W-4 Form, Employee Handbook)"
                      value={doc.name}
                      onChange={(e) =>
                        handleDocumentChange(index, "name", e.target.value)
                      }
                      className="flex-1"
                    />
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileUpload(index, file);
                        }
                        e.target.value = "";
                      }}
                      className="hidden"
                      id={`file-${index}`}
                      accept=".pdf"
                      disabled={uploadingIndex === index}
                    />
                    <label
                      htmlFor={`file-${index}`}
                      className={`cursor-pointer ${uploadingIndex === index ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span className="inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-none border border-dark-accent/30 hover:bg-dark-accent/10 text-dark-primary focus:ring-dark-accent dark:border-dark-700 dark:hover:bg-dark-700/20 dark:text-white">
                        {uploadingIndex === index ? (
                          <svg
                            className="animate-spin h-4 w-4"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </span>
                    </label>
                    {doc.file_url && (
                      <span
                        className="text-xs text-green-600 dark:text-green-400"
                        title="File uploaded"
                      >
                        ✓
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDocumentRemove(index)}
                      disabled={uploadingIndex === index}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {formData.attached_documents.length === 0 && (
                  <p className="text-sm text-neutral-500 text-center py-4">
                    No documents attached. Click "Add Document" to upload PDFs.
                  </p>
                )}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Form Fields</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFormFieldAdd} leftIcon={<Plus className="h-4 w-4" />}>
                  Add Field
                </Button>
              </div>
              <div className="space-y-2">
                {formData.form_fields.map((field, index) => (
                  <div
                    key={index}
                    className="flex gap-2 items-center p-2 border rounded"
                  >
                    <Input
                      placeholder="Field name"
                      value={field.name}
                      onChange={(e) =>
                        handleFormFieldChange(index, "name", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Input
                      placeholder="Label"
                      value={field.label}
                      onChange={(e) =>
                        handleFormFieldChange(index, "label", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Select
                      value={field.type}
                      onChange={(e) =>
                        handleFormFieldChange(index, "type", e.target.value)
                      }
                      options={[
                        { value: "text", label: "Text" },
                        { value: "email", label: "Email" },
                        { value: "date", label: "Date" },
                        { value: "number", label: "Number" },
                        { value: "textarea", label: "Textarea" },
                      ]}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          handleFormFieldChange(
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
                      onClick={() => handleFormFieldRemove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">
                  Signature Fields
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSignatureFieldAdd} leftIcon={<Plus className="h-4 w-4" />}>
                  Add Signature
                </Button>
              </div>
              <div className="space-y-2">
                {formData.signature_fields.map((field, index) => (
                  <div
                    key={index}
                    className="flex gap-2 items-center p-2 border rounded"
                  >
                    <Input
                      placeholder="Signature name"
                      value={field.name}
                      onChange={(e) =>
                        handleSignatureFieldChange(
                          index,
                          "name",
                          e.target.value,
                        )
                      }
                      className="flex-1"
                    />
                    <Input
                      placeholder="Label"
                      value={field.label}
                      onChange={(e) =>
                        handleSignatureFieldChange(
                          index,
                          "label",
                          e.target.value,
                        )
                      }
                      className="flex-1"
                    />
                    <Select
                      value={field.signer_type}
                      onChange={(e) =>
                        handleSignatureFieldChange(
                          index,
                          "signer_type",
                          e.target.value,
                        )
                      }
                      options={[
                        { value: "employee", label: "Employee" },
                        { value: "manager", label: "Manager" },
                        { value: "hr", label: "HR" },
                      ]}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          handleSignatureFieldChange(
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
                      onClick={() => handleSignatureFieldRemove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
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
              className="bg-brand hover:bg-brand/90 text-white"
            >
              Create Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal - Similar structure to Create Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit E-Sign Form</DialogTitle>
            <DialogDescription>
              Update the form details and fields
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
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Form Type
                </label>
                <Select
                  name="form_type"
                  value={formData.form_type}
                  onChange={handleInputChange}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "policy", label: "Policy" },
                    { value: "agreement", label: "Agreement" },
                    { value: "disclosure", label: "Disclosure" },
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requires_acknowledgment_edit"
                name="requires_acknowledgment"
                checked={formData.requires_acknowledgment}
                onChange={handleInputChange}
                className="rounded"
              />
              <label
                htmlFor="requires_acknowledgment_edit"
                className="text-sm font-medium"
              >
                Requires Acknowledgment
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Form Content *
              </label>
              <Textarea
                name="form_content"
                value={formData.form_content}
                onChange={handleInputChange}
                rows={8}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">
                  Attached Documents (PDFs)
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDocumentAdd} leftIcon={<Plus className="h-4 w-4" />}>
                  Add Document
                </Button>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Upload tax documents, policy documents, and other PDFs that need
                to be signed
              </p>
              <div className="space-y-2">
                {formData.attached_documents.map((doc, index) => (
                  <div
                    key={index}
                    className="flex gap-2 items-center p-2 border rounded"
                  >
                    <Input
                      placeholder="Document name (e.g., W-4 Form, Employee Handbook)"
                      value={doc.name}
                      onChange={(e) =>
                        handleDocumentChange(index, "name", e.target.value)
                      }
                      className="flex-1"
                    />
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileUpload(index, file);
                        }
                        e.target.value = "";
                      }}
                      className="hidden"
                      id={`file-edit-${index}`}
                      accept=".pdf"
                      disabled={uploadingIndex === index}
                    />
                    <label
                      htmlFor={`file-edit-${index}`}
                      className={`cursor-pointer ${uploadingIndex === index ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span className="inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-none border border-dark-accent/30 hover:bg-dark-accent/10 text-dark-primary focus:ring-dark-accent dark:border-dark-700 dark:hover:bg-dark-700/20 dark:text-white">
                        {uploadingIndex === index ? (
                          <svg
                            className="animate-spin h-4 w-4"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </span>
                    </label>
                    {doc.file_url && (
                      <span
                        className="text-xs text-green-600 dark:text-green-400"
                        title="File uploaded"
                      >
                        ✓
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDocumentRemove(index)}
                      disabled={uploadingIndex === index}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Form Fields</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleFormFieldAdd} leftIcon={<Plus className="h-4 w-4" />}>
                  Add Field
                </Button>
              </div>
              <div className="space-y-2">
                {formData.form_fields.map((field, index) => (
                  <div
                    key={index}
                    className="flex gap-2 items-center p-2 border rounded"
                  >
                    <Input
                      placeholder="Field name"
                      value={field.name}
                      onChange={(e) =>
                        handleFormFieldChange(index, "name", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Input
                      placeholder="Label"
                      value={field.label}
                      onChange={(e) =>
                        handleFormFieldChange(index, "label", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Select
                      value={field.type}
                      onChange={(e) =>
                        handleFormFieldChange(index, "type", e.target.value)
                      }
                      options={[
                        { value: "text", label: "Text" },
                        { value: "email", label: "Email" },
                        { value: "date", label: "Date" },
                        { value: "number", label: "Number" },
                        { value: "textarea", label: "Textarea" },
                      ]}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          handleFormFieldChange(
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
                      onClick={() => handleFormFieldRemove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">
                  Signature Fields
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSignatureFieldAdd} leftIcon={<Plus className="h-4 w-4" />}>
                  Add Signature
                </Button>
              </div>
              <div className="space-y-2">
                {formData.signature_fields.map((field, index) => (
                  <div
                    key={index}
                    className="flex gap-2 items-center p-2 border rounded"
                  >
                    <Input
                      placeholder="Signature name"
                      value={field.name}
                      onChange={(e) =>
                        handleSignatureFieldChange(
                          index,
                          "name",
                          e.target.value,
                        )
                      }
                      className="flex-1"
                    />
                    <Input
                      placeholder="Label"
                      value={field.label}
                      onChange={(e) =>
                        handleSignatureFieldChange(
                          index,
                          "label",
                          e.target.value,
                        )
                      }
                      className="flex-1"
                    />
                    <Select
                      value={field.signer_type}
                      onChange={(e) =>
                        handleSignatureFieldChange(
                          index,
                          "signer_type",
                          e.target.value,
                        )
                      }
                      options={[
                        { value: "employee", label: "Employee" },
                        { value: "manager", label: "Manager" },
                        { value: "hr", label: "HR" },
                      ]}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          handleSignatureFieldChange(
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
                      onClick={() => handleSignatureFieldRemove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
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
              className="bg-brand hover:bg-brand/90 text-white"
            >
              Update Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedForm?.name}</DialogTitle>
            <DialogDescription>
              {selectedForm?.description || "No description"}
            </DialogDescription>
          </DialogHeader>
          {selectedForm && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium">Type:</span>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {selectedForm.form_type}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium">Status:</span>
                  <div className="mt-1">
                    {getStatusBadge(selectedForm.status)}
                  </div>
                </div>
              </div>
              <div>
                <span className="text-sm font-medium">Form Content:</span>
                <div className="mt-2 p-4 border rounded bg-neutral-50 dark:bg-neutral-800 whitespace-pre-wrap text-sm">
                  {selectedForm.form_content}
                </div>
              </div>
              {((selectedForm as any).custom_fields?.attached_documents || [])
                .length > 0 ? (
                <div>
                  <span className="text-sm font-medium">
                    Attached Documents (
                    {(selectedForm as any).custom_fields?.attached_documents
                      ?.length || 0}
                    ):
                  </span>
                  <div className="mt-2 space-y-2">
                    {(
                      (selectedForm as any).custom_fields?.attached_documents ||
                      []
                    ).map((doc: any, index: number) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-3 border rounded-none hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                      >
                        <FileText className="h-5 w-5 text-neutral-400 flex-shrink-0" />
                        <span className="text-sm flex-1 font-medium">
                          {doc.name || "Unnamed Document"}
                        </span>
                        {doc.file_url ? (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDocumentViewer(doc)}
                              className="flex items-center gap-1" leftIcon={<Eye className="h-4 w-4" />}>
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDocumentDownload(doc)}
                              className="flex items-center gap-1"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDocumentOpenInNewTab(doc)}
                              className="flex items-center gap-1"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            No file uploaded
                          </span>
                        )}
                        {(doc as any).signature_fields &&
                          (doc as any).signature_fields.length > 0 && (
                            <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                              {(doc as any).signature_fields.length} signature
                              field
                              {(doc as any).signature_fields.length !== 1
                                ? "s"
                                : ""}{" "}
                              defined
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-sm font-medium">
                    Attached Documents:
                  </span>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                    No documents attached to this form.
                  </p>
                </div>
              )}
              <div>
                <span className="text-sm font-medium">
                  Form Fields ({selectedForm.form_fields?.length || 0}):
                </span>
                <div className="mt-2 space-y-2">
                  {selectedForm.form_fields?.map((field, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 border rounded"
                    >
                      <span className="text-sm flex-1">
                        {field.label} ({field.type})
                      </span>
                      {field.required && (
                        <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-1 rounded">
                          Required
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-sm font-medium">
                  Signature Fields ({selectedForm.signature_fields?.length || 0}
                  ):
                </span>
                <div className="mt-2 space-y-2">
                  {selectedForm.signature_fields?.map((field, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 border rounded"
                    >
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm flex-1">
                        {field.label} ({field.signer_type})
                      </span>
                      {field.required && (
                        <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-1 rounded">
                          Required
                        </span>
                      )}
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

      {/* Document Viewer Modal */}
      <Dialog
        open={isDocumentViewerOpen}
        onOpenChange={handleDocumentViewerClose}
      >
        <DialogContent className="w-[75vw] max-w-none h-[95vh] max-h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
            <DialogTitle className="text-base">
              {selectedDocument?.name || "Document Viewer"}
            </DialogTitle>
          </DialogHeader>
          {selectedDocument && selectedDocument.file_url && (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b bg-neutral-50 dark:bg-neutral-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-neutral-500" />
                  <span className="text-sm font-medium">
                    {selectedDocument.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDocumentOpenInNewTab(selectedDocument)}
                    className="flex items-center gap-1" leftIcon={<ExternalLink className="h-4 w-4" />}>
                    Open in New Tab
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDocumentDownload(selectedDocument)}
                    className="flex items-center gap-1" leftIcon={<Download className="h-4 w-4" />}>
                    Download
                  </Button>
                </div>
              </div>

              {/* Document Content */}
              <div className="flex-1 relative bg-neutral-100 dark:bg-neutral-900 overflow-hidden m-0">
                {documentLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 z-10">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-brand animate-spin" />
                      <div className="flex justify-center py-6">
                        <LoadingSpinner size="md" />
                      </div>
                    </div>
                  </div>
                )}

                {documentError ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center p-8">
                      <p className="text-red-600 dark:text-red-400 mb-4">
                        Failed to load document
                      </p>
                      <div className="flex items-center justify-center gap-3">
                        <Button
                          variant="outline"
                          onClick={() =>
                            handleDocumentOpenInNewTab(selectedDocument)
                          }
                          className="flex items-center gap-2" leftIcon={<ExternalLink className="w-4 h-4" />}>
                          Open in New Tab
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            handleDocumentDownload(selectedDocument)
                          }
                          className="flex items-center gap-2" leftIcon={<Download className="w-4 h-4" />}>
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {isPdfFile(selectedDocument.file_url) ? (
                      <iframe
                        src={`${selectedDocument.file_url}#toolbar=1&navpanes=1&scrollbar=1`}
                        className="w-full h-full border-0 m-0"
                        title={selectedDocument.name}
                        onLoad={() => setDocumentLoading(false)}
                        onError={() => {
                          setDocumentLoading(false);
                          setDocumentError(true);
                        }}
                      />
                    ) : isImageFile(selectedDocument.file_url) ? (
                      <div className="w-full h-full flex items-center justify-center p-2">
                        <img
                          src={selectedDocument.file_url}
                          alt={selectedDocument.name}
                          className="max-w-full max-h-full object-contain"
                          onLoad={() => setDocumentLoading(false)}
                          onError={() => {
                            setDocumentLoading(false);
                            setDocumentError(true);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center p-8">
                          <FileText className="h-16 w-16 mx-auto mb-4 text-neutral-400" />
                          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                            Preview not available for this file type
                          </p>
                          <div className="flex items-center justify-center gap-3">
                            <Button
                              variant="outline"
                              onClick={() =>
                                handleDocumentOpenInNewTab(selectedDocument)
                              }
                              className="flex items-center gap-2" leftIcon={<ExternalLink className="w-4 h-4" />}>
                              Open in New Tab
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                handleDocumentDownload(selectedDocument)
                              }
                              className="flex items-center gap-2" leftIcon={<Download className="w-4 h-4" />}>
                              Download to View
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {selectedDocument && !selectedDocument.file_url && (
            <div className="flex items-center justify-center p-8">
              <div className="text-center">
                <FileText className="h-16 w-16 mx-auto mb-4 text-neutral-400" />
                <p className="text-neutral-600 dark:text-neutral-400">
                  No file available for this document
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="px-4 pb-4 pt-2 flex-shrink-0">
            <Button
              variant="outline"
              onClick={handleDocumentViewerClose}
              size="sm"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
