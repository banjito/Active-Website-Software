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
import { Mail, Plus, Edit, Trash2, Eye, Send, X } from "lucide-react";
import {
  onboardingService,
  WelcomeEmail,
} from "../../../services/hr/onboardingService";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const WelcomeEmails: React.FC = () => {
  const { user } = useAuth();
  const [emails, setEmails] = useState<WelcomeEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "templates" | "active" | "archived"
  >("all");

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<WelcomeEmail | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    email_type: "standard" as const,
    subject: "",
    email_body: "",
    email_body_text: "",
    template_variables: [] as Array<{ name: string; description?: string }>,
    send_automatically: false,
    send_days_before_start: 0,
    send_time: "09:00:00",
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

      const data = await onboardingService.getWelcomeEmails(filters);
      setEmails(data);
    } catch (error: any) {
      console.error("Error fetching emails:", error);
      toast({
        title: "Error",
        description: "Failed to load emails. Please try again.",
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
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : type === "number"
            ? parseInt(value) || 0
            : value,
    }));
  };

  const handleVariableAdd = () => {
    setFormData((prev) => ({
      ...prev,
      template_variables: [
        ...prev.template_variables,
        { name: "", description: "" },
      ],
    }));
  };

  const handleVariableChange = (
    index: number,
    field: string,
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      template_variables: prev.template_variables.map((v, i) =>
        i === index ? { ...v, [field]: value } : v,
      ),
    }));
  };

  const handleVariableRemove = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      template_variables: prev.template_variables.filter((_, i) => i !== index),
    }));
  };

  const handleCreate = async () => {
    if (
      !formData.name.trim() ||
      !formData.subject.trim() ||
      !formData.email_body.trim()
    ) {
      toast({
        title: "Error",
        description: "Please enter a name, subject, and email body",
        variant: "destructive",
      });
      return;
    }

    if (!user) return;

    try {
      await onboardingService.createWelcomeEmail({
        ...formData,
        created_by: user.id,
      });

      toast({
        title: "Success",
        description: "Welcome email created successfully",
        variant: "success",
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create email",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!selectedEmail) return;

    if (
      !formData.name.trim() ||
      !formData.subject.trim() ||
      !formData.email_body.trim()
    ) {
      toast({
        title: "Error",
        description: "Please enter a name, subject, and email body",
        variant: "destructive",
      });
      return;
    }

    try {
      await onboardingService.updateWelcomeEmail(selectedEmail.id, formData);

      toast({
        title: "Success",
        description: "Welcome email updated successfully",
        variant: "success",
      });
      setIsEditModalOpen(false);
      setSelectedEmail(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update email",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this email?")) return;

    try {
      await onboardingService.deleteWelcomeEmail(id);
      toast({
        title: "Success",
        description: "Email deleted successfully",
        variant: "success",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete email",
        variant: "destructive",
      });
    }
  };

  const handleSend = async (email: WelcomeEmail) => {
    // In a real implementation, this would trigger sending the email
    toast({
      title: "Info",
      description:
        "Email sending functionality will be implemented with email service integration",
      variant: "default",
    });
  };

  const openEditModal = (email: WelcomeEmail) => {
    setSelectedEmail(email);
    setFormData({
      name: email.name,
      description: email.description || "",
      email_type: email.email_type,
      subject: email.subject,
      email_body: email.email_body,
      email_body_text: email.email_body_text || "",
      template_variables: email.template_variables || [],
      send_automatically: email.send_automatically,
      send_days_before_start: email.send_days_before_start,
      send_time: email.send_time,
      status: email.status,
      is_template: email.is_template,
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (email: WelcomeEmail) => {
    setSelectedEmail(email);
    setIsViewModalOpen(true);
  };

  const openPreviewModal = (email: WelcomeEmail) => {
    setSelectedEmail(email);
    setIsPreviewModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      email_type: "standard",
      subject: "",
      email_body: "",
      email_body_text: "",
      template_variables: [],
      send_automatically: false,
      send_days_before_start: 0,
      send_time: "09:00:00",
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

  const filteredEmails = emails.filter((e) => {
    if (filter === "templates") return e.is_template;
    if (filter === "active") return e.status === "active";
    if (filter === "archived") return e.status === "archived";
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">
            Welcome Emails
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Create and manage welcome emails for new employees
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
          Create Email
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          variant={filter === "templates" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("templates")}
        >
          Templates
        </Button>
        <Button
          variant={filter === "active" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("active")}
        >
          Active
        </Button>
        <Button
          variant={filter === "archived" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("archived")}
        >
          Archived
        </Button>
      </div>

      {/* Emails List */}
      {loading ? (
        <div className="text-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : filteredEmails.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 mx-auto text-zinc-400 mb-4" />
            <p className="text-zinc-600 dark:text-zinc-400">No emails found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEmails.map((email) => (
            <Card key={email.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{email.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {email.subject}
                    </CardDescription>
                  </div>
                  {getStatusBadge(email.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">Type:</span>{" "}
                    {email.email_type}
                  </div>
                  {email.send_automatically && (
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium">Auto-send:</span>{" "}
                      {email.send_days_before_start} days before start
                    </div>
                  )}
                  {email.is_template && (
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs">
                      Template
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openViewModal(email)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPreviewModal(email)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(email)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSend(email)}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Send
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(email.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Welcome Email</DialogTitle>
            <DialogDescription>
              Create a new welcome email template for new employees
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., First Day Welcome Email"
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
                placeholder="Brief description of this email"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Email Type
                </label>
                <Select
                  name="email_type"
                  value={formData.email_type}
                  onChange={handleInputChange}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "pre-start", label: "Pre-Start" },
                    { value: "first-day", label: "First Day" },
                    { value: "first-week", label: "First Week" },
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
              <label className="block text-sm font-medium mb-2">
                Subject *
              </label>
              <Input
                name="subject"
                value={formData.subject}
                onChange={handleInputChange}
                placeholder="Welcome to [Company Name]!"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Email Body (HTML) *
              </label>
              <Textarea
                name="email_body"
                value={formData.email_body}
                onChange={handleInputChange}
                placeholder="Enter HTML email content. Use {{variable_name}} for template variables."
                rows={10}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Email Body (Plain Text)
              </label>
              <Textarea
                name="email_body_text"
                value={formData.email_body_text}
                onChange={handleInputChange}
                placeholder="Plain text version of the email"
                rows={6}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="send_automatically"
                name="send_automatically"
                checked={formData.send_automatically}
                onChange={handleInputChange}
                className="rounded"
              />
              <label
                htmlFor="send_automatically"
                className="text-sm font-medium"
              >
                Send Automatically
              </label>
            </div>
            {formData.send_automatically && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Days Before Start
                  </label>
                  <Input
                    type="number"
                    name="send_days_before_start"
                    value={formData.send_days_before_start}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Send Time
                  </label>
                  <Input
                    type="time"
                    name="send_time"
                    value={formData.send_time}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            )}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">
                  Template Variables
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleVariableAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Variable
                </Button>
              </div>
              <div className="space-y-2">
                {formData.template_variables.map((variable, index) => (
                  <div
                    key={index}
                    className="flex gap-2 items-center p-2 border rounded"
                  >
                    <Input
                      placeholder="Variable name (e.g., employee_name)"
                      value={variable.name}
                      onChange={(e) =>
                        handleVariableChange(index, "name", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Input
                      placeholder="Description"
                      value={variable.description || ""}
                      onChange={(e) =>
                        handleVariableChange(
                          index,
                          "description",
                          e.target.value,
                        )
                      }
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleVariableRemove(index)}
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
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Create Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal - Similar to Create */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Welcome Email</DialogTitle>
            <DialogDescription>
              Update the email details and content
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
                  Email Type
                </label>
                <Select
                  name="email_type"
                  value={formData.email_type}
                  onChange={handleInputChange}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "pre-start", label: "Pre-Start" },
                    { value: "first-day", label: "First Day" },
                    { value: "first-week", label: "First Week" },
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
              <label className="block text-sm font-medium mb-2">
                Subject *
              </label>
              <Input
                name="subject"
                value={formData.subject}
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Email Body (HTML) *
              </label>
              <Textarea
                name="email_body"
                value={formData.email_body}
                onChange={handleInputChange}
                rows={10}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Email Body (Plain Text)
              </label>
              <Textarea
                name="email_body_text"
                value={formData.email_body_text}
                onChange={handleInputChange}
                rows={6}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="send_automatically_edit"
                name="send_automatically"
                checked={formData.send_automatically}
                onChange={handleInputChange}
                className="rounded"
              />
              <label
                htmlFor="send_automatically_edit"
                className="text-sm font-medium"
              >
                Send Automatically
              </label>
            </div>
            {formData.send_automatically && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Days Before Start
                  </label>
                  <Input
                    type="number"
                    name="send_days_before_start"
                    value={formData.send_days_before_start}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Send Time
                  </label>
                  <Input
                    type="time"
                    name="send_time"
                    value={formData.send_time}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            )}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">
                  Template Variables
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleVariableAdd}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Variable
                </Button>
              </div>
              <div className="space-y-2">
                {formData.template_variables.map((variable, index) => (
                  <div
                    key={index}
                    className="flex gap-2 items-center p-2 border rounded"
                  >
                    <Input
                      placeholder="Variable name"
                      value={variable.name}
                      onChange={(e) =>
                        handleVariableChange(index, "name", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Input
                      placeholder="Description"
                      value={variable.description || ""}
                      onChange={(e) =>
                        handleVariableChange(
                          index,
                          "description",
                          e.target.value,
                        )
                      }
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleVariableRemove(index)}
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
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Update Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedEmail?.name}</DialogTitle>
            <DialogDescription>{selectedEmail?.subject}</DialogDescription>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium">Type:</span>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {selectedEmail.email_type}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium">Status:</span>
                  <div className="mt-1">
                    {getStatusBadge(selectedEmail.status)}
                  </div>
                </div>
              </div>
              <div>
                <span className="text-sm font-medium">Subject:</span>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  {selectedEmail.subject}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium">Email Body:</span>
                <div
                  className="mt-2 p-4 border rounded bg-zinc-50 dark:bg-zinc-800 whitespace-pre-wrap text-sm"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.email_body }}
                />
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

      {/* Preview Modal */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview how the email will appear to recipients
            </DialogDescription>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div>
                <span className="text-sm font-medium">To:</span>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  employee@example.com
                </p>
              </div>
              <div>
                <span className="text-sm font-medium">Subject:</span>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {selectedEmail.subject}
                </p>
              </div>
              <div className="border rounded p-4 bg-white dark:bg-zinc-800">
                <div
                  dangerouslySetInnerHTML={{ __html: selectedEmail.email_body }}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPreviewModalOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
