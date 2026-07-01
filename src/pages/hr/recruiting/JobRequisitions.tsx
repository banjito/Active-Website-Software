import React, { useState, useEffect } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { RichTextEditor } from "@/components/helpCenter/RichTextEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import {
  Plus,
  Search,
  Filter,
  Briefcase,
  MapPin,
  DollarSign,
  Calendar,
  User,
  Edit,
  Trash2,
  Eye,
  Send,
  CheckCircle,
  XCircle,
  Download,
  ArrowUpDown,
  List,
  Grid,
  Clock,
  TrendingUp,
  FileText,
  Building2,
  Users,
  AlertCircle,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  jobRequisitionsService,
  JobRequisition,
  CreateJobRequisitionInput,
  RequisitionApprover,
  getJobRequisitionDisplayHtml,
} from "../../../services/hr/jobRequisitionsService";
import { toast } from "../../../components/ui/toast";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface AppUser {
  id: string;
  email: string;
  name: string;
  is_active?: boolean;
}

type ViewMode = "grid" | "list";
type SortField = "created_at" | "title" | "department" | "status" | "priority";
type SortDirection = "asc" | "desc";

export const JobRequisitions: React.FC = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] =
    useState<JobRequisition | null>(null);
  const [formData, setFormData] = useState<CreateJobRequisitionInput>({
    title: "",
    department: "",
    location: "",
    employment_type: "Full-time",
    salary_range_min: undefined,
    salary_range_max: undefined,
    status: "draft",
    priority: "medium",
    description: "",
    requirements: "",
    notes: "",
  });

  // Separate state for formatted display values (with commas)
  const [formattedSalary, setFormattedSalary] = useState<{
    min: string;
    max: string;
  }>({
    min: "",
    max: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Approver state
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [approverSearchTerm, setApproverSearchTerm] = useState("");
  const [approversMap, setApproversMap] = useState<
    Record<string, RequisitionApprover[]>
  >({});
  const [isSubmitApprovalModalOpen, setIsSubmitApprovalModalOpen] =
    useState(false);
  const [submitTargetId, setSubmitTargetId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequisitions();
    fetchUsers();
  }, []);

  const fetchRequisitions = async () => {
    try {
      setLoading(true);
      const data = await jobRequisitionsService.getAll();
      setRequisitions(data);

      // Fetch approvers for all requisitions
      const ids = data.map((r) => r.id);
      if (ids.length > 0) {
        const approvers =
          await jobRequisitionsService.getApproversForMultiple(ids);
        setApproversMap(approvers);
      }
    } catch (error: any) {
      console.error("Error fetching requisitions:", error);
      const errorMessage =
        error?.message ||
        error?.error?.message ||
        "Failed to load job requisitions. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      let users: AppUser[] = [];
      // Try admin RPC first (same pattern as OfferApprovals)
      let { data: adminData, error: adminError } = await supabase
        .schema("common")
        .rpc("admin_get_users");

      if (adminError) {
        const fallback = await supabase.rpc("admin_get_users");
        if (!fallback.error) {
          adminData = fallback.data;
          adminError = null;
        }
      }

      if (!adminError && adminData) {
        // Keep all users (names of deactivated approvers must still resolve);
        // the picker itself filters out inactive users below.
        users = adminData.map((u: any) => ({
          id: u.id,
          email: u.email || "",
          name:
            u.raw_user_meta_data?.name ||
            u.user_metadata?.name ||
            u.email?.split("@")[0] ||
            "Unknown",
          is_active: u.is_active !== false,
        }));
      } else {
        // Fallback to profiles
        const { data: profiles } = await supabase
          .schema("common")
          .from("profiles")
          .select("id, email, full_name, user_metadata, is_active");

        if (profiles) {
          users = profiles.map((p: any) => ({
            id: p.id,
            email: p.email || "",
            name:
              p.full_name ||
              p.user_metadata?.name ||
              p.email?.split("@")[0] ||
              "Unknown",
            is_active: p.is_active !== false,
          }));
        }
      }

      setAllUsers(users.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  // Helper function to format number with commas
  const formatNumberWithCommas = (value: string): string => {
    // Remove all non-digit characters
    const numbers = value.replace(/\D/g, "");
    // Add commas for thousands
    return numbers.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Helper function to parse formatted number (remove commas)
  const parseFormattedNumber = (value: string): number | undefined => {
    const numbers = value.replace(/\D/g, "");
    return numbers ? parseFloat(numbers) : undefined;
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    // Handle salary fields with comma formatting
    if (name === "salary_range_min" || name === "salary_range_max") {
      // Format the display value with commas
      const formattedValue = formatNumberWithCommas(value);
      // Parse the actual number for storage
      const numericValue = parseFormattedNumber(value);

      // Update formatted display value
      setFormattedSalary((prev) => ({
        ...prev,
        [name === "salary_range_min" ? "min" : "max"]: formattedValue,
      }));

      // Update actual numeric value in form data
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    if (formErrors[name]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = "Job title is required";
    }
    if (!formData.department.trim()) {
      errors.department = "Department is required";
    }
    if (!formData.location.trim()) {
      errors.location = "Location is required";
    }
    if (!formData.employment_type || !formData.employment_type.trim()) {
      errors.employment_type = "Employment type is required";
    }
    if (
      formData.salary_range_min &&
      formData.salary_range_max &&
      formData.salary_range_min > formData.salary_range_max
    ) {
      errors.salary_range_max =
        "Maximum salary must be greater than minimum salary";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm() || !user?.id) return;

    try {
      setSaving(true);
      const created = await jobRequisitionsService.create(formData, user.id);
      // Save approvers if any were selected
      if (selectedApprovers.length > 0) {
        await jobRequisitionsService.setApprovers(
          created.id,
          selectedApprovers,
        );
      }
      toast({
        title: "Success",
        description: "Job requisition created successfully",
        variant: "success",
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchRequisitions();
    } catch (error: any) {
      console.error("Error creating requisition:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create job requisition",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!validateForm() || !selectedRequisition) return;

    try {
      setSaving(true);
      await jobRequisitionsService.update(selectedRequisition.id, formData);
      // Save approvers (overwrite existing list) — only for draft/pending requisitions
      if (
        selectedRequisition.status === "draft" ||
        selectedRequisition.status === "pending_approval"
      ) {
        if (selectedApprovers.length > 0) {
          await jobRequisitionsService.setApprovers(
            selectedRequisition.id,
            selectedApprovers,
          );
        }
      }
      toast({
        title: "Success",
        description: "Job requisition updated successfully",
        variant: "success",
      });
      setIsEditModalOpen(false);
      setSelectedRequisition(null);
      resetForm();
      fetchRequisitions();
    } catch (error: any) {
      console.error("Error updating requisition:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update job requisition",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this job requisition?"))
      return;

    try {
      await jobRequisitionsService.delete(id);
      toast({
        title: "Success",
        description: "Job requisition deleted successfully",
        variant: "success",
      });
      fetchRequisitions();
    } catch (error: any) {
      console.error("Error deleting requisition:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete job requisition",
        variant: "destructive",
      });
    }
  };

  const openSubmitApprovalModal = (id: string) => {
    // Load existing approvers for this requisition
    const existing = approversMap[id] || [];
    setSubmitTargetId(id);
    setSelectedApprovers(
      existing
        .sort((a, b) => a.step_order - b.step_order)
        .map((a) => a.approver_user_id),
    );
    setApproverSearchTerm("");
    setIsSubmitApprovalModalOpen(true);
  };

  const handleSubmitForApproval = async () => {
    if (!submitTargetId) return;
    if (selectedApprovers.length < 1 || selectedApprovers.length > 3) {
      toast({
        title: "Error",
        description: "Please select between 1 and 3 approvers",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      await jobRequisitionsService.submitForApprovalWithApprovers(
        submitTargetId,
        selectedApprovers,
      );
      toast({
        title: "Success",
        description: "Job requisition submitted for approval",
        variant: "success",
      });
      setIsSubmitApprovalModalOpen(false);
      setSubmitTargetId(null);
      setSelectedApprovers([]);
      fetchRequisitions();
    } catch (error: any) {
      console.error("Error submitting for approval:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit for approval",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const addApprover = (userId: string) => {
    if (selectedApprovers.length >= 3) {
      toast({
        title: "Limit Reached",
        description: "Maximum 3 approvers allowed",
        variant: "destructive",
      });
      return;
    }
    if (selectedApprovers.includes(userId)) return;
    setSelectedApprovers((prev) => [...prev, userId]);
    setApproverSearchTerm("");
  };

  const removeApprover = (userId: string) => {
    setSelectedApprovers((prev) => prev.filter((id) => id !== userId));
  };

  const moveApprover = (index: number, direction: "up" | "down") => {
    const newList = [...selectedApprovers];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newList.length) return;
    [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];
    setSelectedApprovers(newList);
  };

  const getUserName = (userId: string): string => {
    const u = allUsers.find((u) => u.id === userId);
    return u ? u.name : "Unknown User";
  };

  const filteredUsers = allUsers.filter((u) => {
    if (u.is_active === false) return false; // hide deactivated from picker
    if (selectedApprovers.includes(u.id)) return false;
    if (!approverSearchTerm) return true;
    const term = approverSearchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term)
    );
  });

  const handlePost = async (id: string) => {
    try {
      await jobRequisitionsService.post(id);
      toast({
        title: "Success",
        description: "Job requisition posted successfully",
        variant: "success",
      });
      fetchRequisitions();
    } catch (error: any) {
      console.error("Error posting requisition:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to post job requisition",
        variant: "destructive",
      });
    }
  };

  const handleClose = async (id: string) => {
    if (!confirm("Are you sure you want to close this job requisition?"))
      return;

    try {
      await jobRequisitionsService.close(id);
      toast({
        title: "Success",
        description: "Job requisition closed successfully",
        variant: "success",
      });
      fetchRequisitions();
    } catch (error: any) {
      console.error("Error closing requisition:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to close job requisition",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      department: "",
      location: "",
      employment_type: "Full-time",
      salary_range_min: undefined,
      salary_range_max: undefined,
      status: "draft",
      priority: "medium",
      description: "",
      requirements: "",
      notes: "",
    });
    setFormattedSalary({
      min: "",
      max: "",
    });
    setFormErrors({});
    setSelectedApprovers([]);
    setApproverSearchTerm("");
  };

  const openEditModal = (requisition: JobRequisition) => {
    setSelectedRequisition(requisition);
    setFormData({
      title: requisition.title,
      department: requisition.department,
      location: requisition.location,
      employment_type: requisition.employment_type,
      salary_range_min: requisition.salary_range_min,
      salary_range_max: requisition.salary_range_max,
      status: requisition.status,
      priority: requisition.priority,
      description: getJobRequisitionDisplayHtml(requisition),
      requirements: "",
      notes: "",
    });
    setFormattedSalary({
      min: requisition.salary_range_min
        ? requisition.salary_range_min.toLocaleString()
        : "",
      max: requisition.salary_range_max
        ? requisition.salary_range_max.toLocaleString()
        : "",
    });
    // Load existing approvers
    const existing = approversMap[requisition.id] || [];
    setSelectedApprovers(
      existing
        .sort((a, b) => a.step_order - b.step_order)
        .map((a) => a.approver_user_id),
    );
    setApproverSearchTerm("");
    setIsEditModalOpen(true);
  };

  const openViewModal = (requisition: JobRequisition) => {
    setSelectedRequisition(requisition);
    setIsViewModalOpen(true);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredAndSortedRequisitions = requisitions
    .filter((req) => {
      const matchesSearch =
        req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        filterStatus === "all" || req.status === filterStatus;
      const matchesDepartment =
        filterDepartment === "all" || req.department === filterDepartment;
      const matchesPriority =
        filterPriority === "all" || req.priority === filterPriority;
      return (
        matchesSearch && matchesStatus && matchesDepartment && matchesPriority
      );
    })
    .sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === "created_at" || sortField === "updated_at") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortDirection === "asc") {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

  const getStatusColor = (status: JobRequisition["status"]) => {
    switch (status) {
      case "draft":
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200";
      case "pending_approval":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "approved":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "posted":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "closed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-neutral-100 text-neutral-800";
    }
  };

  const getStatusLabel = (status: JobRequisition["status"]) => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatSalaryRange = (min?: number, max?: number) => {
    if (!min && !max) return "Not specified";
    if (min && max)
      return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
    if (min) return `$${min.toLocaleString()}+`;
    if (max) return `Up to $${max.toLocaleString()}`;
    return "Not specified";
  };

  // Statistics
  const stats = {
    total: requisitions.length,
    draft: requisitions.filter((r) => r.status === "draft").length,
    pending: requisitions.filter((r) => r.status === "pending_approval").length,
    approved: requisitions.filter((r) => r.status === "approved").length,
    posted: requisitions.filter((r) => r.status === "posted").length,
    closed: requisitions.filter((r) => r.status === "closed").length,
  };

  const departments = Array.from(
    new Set(requisitions.map((r) => r.department)),
  ).sort();
  const commonDepartmentOptions = [
    "North Alabama Division",
    "Tennessee Division",
    "Georgia Division",
    "International Division",
    "Engineering",
    "Sales",
    "HR",
    "Operations",
  ];
  const departmentOptions = Array.from(
    new Set(
      [...commonDepartmentOptions, ...departments, formData.department].filter(
        Boolean,
      ),
    ),
  ).sort();

  const exportToCSV = () => {
    const headers = [
      "Title",
      "Department",
      "Location",
      "Employment Type",
      "Salary Range",
      "Status",
      "Priority",
      "Created",
      "Updated",
    ];
    const rows = filteredAndSortedRequisitions.map((req) => [
      req.title,
      req.department,
      req.location,
      req.employment_type,
      formatSalaryRange(req.salary_range_min, req.salary_range_max),
      getStatusLabel(req.status),
      req.priority.charAt(0).toUpperCase() + req.priority.slice(1),
      new Date(req.created_at).toLocaleDateString(),
      new Date(req.updated_at).toLocaleDateString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `job-requisitions-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            Job Requisitions
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            Create and manage open job positions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportToCSV}
            disabled={filteredAndSortedRequisitions.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            onClick={() => {
              resetForm();
              setIsCreateModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Requisition
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {stats.total}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Draft
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-600 dark:text-neutral-400">
              {stats.draft}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.pending}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-green-600 dark:text-green-400">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.approved}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-blue-600 dark:text-blue-400">
              Posted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.posted}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-red-600 dark:text-red-400">
              Closed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {stats.closed}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search by title, department, or location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-neutral-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                >
                  <option value="all">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="posted">Posted</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {filteredAndSortedRequisitions.length} of{" "}
                  {requisitions.length} requisitions
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setViewMode(viewMode === "grid" ? "list" : "grid")
                  }
                >
                  {viewMode === "grid" ? (
                    <List className="h-4 w-4" />
                  ) : (
                    <Grid className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requisitions List/Grid */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <LoadingSpinner size="md" />
            </div>
          </CardContent>
        </Card>
      ) : filteredAndSortedRequisitions.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Briefcase className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
                No requisitions found
              </h3>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {searchTerm ||
                filterStatus !== "all" ||
                filterDepartment !== "all" ||
                filterPriority !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by creating a new job requisition"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-dark-100 border-b border-neutral-200 dark:border-dark-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort("title")}
                        className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        Title
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort("department")}
                        className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        Department
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      Salary Range
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort("status")}
                        className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        Status
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort("priority")}
                        className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        Priority
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort("created_at")}
                        className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        Created
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-dark-200">
                  {filteredAndSortedRequisitions.map((req) => (
                    <tr
                      key={req.id}
                      className="hover:bg-neutral-50 dark:hover:bg-dark-100"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-neutral-900 dark:text-white">
                          {req.title}
                        </div>
                        <div className="text-sm text-neutral-500 dark:text-neutral-400">
                          {req.employment_type}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                        {req.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                        {req.location}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                        {formatSalaryRange(
                          req.salary_range_min,
                          req.salary_range_max,
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded-none text-xs font-medium ${getStatusColor(req.status)}`}
                        >
                          {getStatusLabel(req.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            req.priority === "high"
                              ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              : req.priority === "medium"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                          }`}
                        >
                          {req.priority.charAt(0).toUpperCase() +
                            req.priority.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openViewModal(req)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditModal(req)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {req.status === "draft" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(req.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredAndSortedRequisitions.map((req) => (
            <Card key={req.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-xl">{req.title}</CardTitle>
                      <span
                        className={`px-2 py-1 rounded-none text-xs font-medium ${getStatusColor(req.status)}`}
                      >
                        {getStatusLabel(req.status)}
                      </span>
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-4 mt-2">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {req.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        {req.department}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {req.employment_type}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        {formatSalaryRange(
                          req.salary_range_min,
                          req.salary_range_max,
                        )}
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      Created: {new Date(req.created_at).toLocaleDateString()}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        req.priority === "high"
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          : req.priority === "medium"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                      }`}
                    >
                      {req.priority.charAt(0).toUpperCase() +
                        req.priority.slice(1)}{" "}
                      Priority
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Approver chain indicator */}
                {approversMap[req.id] && approversMap[req.id].length > 0 && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-neutral-100 dark:border-dark-200">
                    <Users className="h-4 w-4 text-neutral-400 shrink-0" />
                    <div className="flex items-center gap-1">
                      {approversMap[req.id].map((approver, idx) => {
                        const isCurrentStep =
                          req.status === "pending_approval" &&
                          req.current_approval_step === approver.step_order;
                        return (
                          <React.Fragment key={approver.id}>
                            {idx > 0 && (
                              <span className="text-neutral-300 dark:text-neutral-600 text-xs mx-0.5">
                                &rarr;
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-xs font-medium ${
                                approver.status === "approved"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : approver.status === "rejected"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                    : isCurrentStep
                                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                              }`}
                            >
                              {approver.status === "approved" && (
                                <CheckCircle className="h-3 w-3" />
                              )}
                              {approver.status === "rejected" && (
                                <XCircle className="h-3 w-3" />
                              )}
                              {approver.status === "pending" &&
                                isCurrentStep && <Clock className="h-3 w-3" />}
                              {
                                getUserName(approver.approver_user_id).split(
                                  " ",
                                )[0]
                              }
                            </span>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {req.status === "draft" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openSubmitApprovalModal(req.id)}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Submit for Approval
                      </Button>
                    )}
                    {req.status === "approved" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePost(req.id)}
                        className="bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Post Job
                      </Button>
                    )}
                    {req.status === "posted" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleClose(req.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Close Position
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewModal(req)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(req)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    {req.status === "draft" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(req.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Job Requisition</DialogTitle>
            <DialogDescription>
              Fill in the details to create a new job requisition
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Job Title *"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                error={formErrors.title}
                required
              />
              <Select
                label="Department / Portal *"
                name="department"
                value={formData.department}
                onChange={handleInputChange}
                error={formErrors.department}
                options={[
                  {
                    value: "",
                    label: "Select department/portal...",
                    disabled: true,
                  },
                  ...departmentOptions.map((dept) => ({
                    value: dept,
                    label: dept,
                  })),
                ]}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Location *"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                error={formErrors.location}
                required
              />
              <Select
                label="Employment Type *"
                name="employment_type"
                value={formData.employment_type}
                onChange={handleInputChange}
                error={formErrors.employment_type}
                options={[
                  {
                    value: "",
                    label: "Select employment type...",
                    disabled: true,
                  },
                  { value: "Full-time", label: "Full-time" },
                  { value: "Part-time", label: "Part-time" },
                  { value: "Contract", label: "Contract" },
                  { value: "Temporary", label: "Temporary" },
                  { value: "Internship", label: "Internship" },
                ]}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Min Salary"
                name="salary_range_min"
                type="text"
                value={formattedSalary.min}
                onChange={handleInputChange}
                placeholder="e.g., 40,000"
              />
              <Input
                label="Max Salary"
                name="salary_range_max"
                type="text"
                value={formattedSalary.max}
                onChange={handleInputChange}
                error={formErrors.salary_range_max}
                placeholder="e.g., 80,000"
              />
              <Select
                label="Priority"
                name="priority"
                value={formData.priority}
                onChange={handleInputChange}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Job Description, Requirements & Notes
              </label>
              <RichTextEditor
                value={formData.description || ""}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, description: value }))
                }
                placeholder="Enter job description, requirements, and internal notes. Use the toolbar for bold, italic, underline, lists, and more."
                minHeight="220px"
                className="rounded-none"
              />
            </div>

            {/* Approvers Section */}
            <div className="border-t border-neutral-200 dark:border-dark-200 pt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                <Users className="h-4 w-4" />
                Approval Chain
              </label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                Assign 1-3 approvers who will review this requisition in order
                before it can be posted to the career page.
              </p>

              {/* Selected Approvers */}
              {selectedApprovers.length > 0 && (
                <div className="space-y-2 mb-3">
                  {selectedApprovers.map((uid, idx) => {
                    const u = allUsers.find((u) => u.id === uid);
                    return (
                      <div
                        key={uid}
                        className="flex items-center gap-2 p-2.5 border border-neutral-200 dark:border-dark-200 rounded-none bg-neutral-50 dark:bg-dark-100"
                      >
                        <div className="w-6 h-6 rounded-none bg-[#f26722] text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                            {u?.name || "Unknown"}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                            {u?.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveApprover(idx, "up")}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-dark-200 disabled:opacity-30 transition-colors"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveApprover(idx, "down")}
                            disabled={idx === selectedApprovers.length - 1}
                            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-dark-200 disabled:opacity-30 transition-colors"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeApprover(uid)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Approver Search */}
              {selectedApprovers.length < 3 && (
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
                    <input
                      type="text"
                      placeholder={
                        selectedApprovers.length === 0
                          ? "Search for approvers to add..."
                          : "Add another approver..."
                      }
                      value={approverSearchTerm}
                      onChange={(e) => setApproverSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] text-sm"
                    />
                  </div>
                  {approverSearchTerm && (
                    <div className="mt-1 max-h-40 overflow-y-auto border border-neutral-200 dark:border-dark-200 rounded-none shadow-sm">
                      {filteredUsers.length === 0 ? (
                        <p className="p-3 text-sm text-neutral-500 dark:text-neutral-400">
                          No users found
                        </p>
                      ) : (
                        filteredUsers.slice(0, 8).map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => addApprover(u.id)}
                            className="w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-dark-200 last:border-b-0 transition-colors"
                          >
                            <p className="text-sm font-medium text-neutral-900 dark:text-white">
                              {u.name}
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                              {u.email}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedApprovers.length === 0 && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2 italic">
                  No approvers assigned yet. You can add them now or when
                  submitting for approval.
                </p>
              )}
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
              disabled={saving}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              {saving ? "Creating..." : "Create Requisition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Job Requisition</DialogTitle>
            <DialogDescription>
              Update the job requisition details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Job Title *"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                error={formErrors.title}
                required
              />
              <Select
                label="Department / Portal *"
                name="department"
                value={formData.department}
                onChange={handleInputChange}
                error={formErrors.department}
                options={[
                  {
                    value: "",
                    label: "Select department/portal...",
                    disabled: true,
                  },
                  ...departmentOptions.map((dept) => ({
                    value: dept,
                    label: dept,
                  })),
                ]}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Location *"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                error={formErrors.location}
                required
              />
              <Select
                label="Employment Type *"
                name="employment_type"
                value={formData.employment_type}
                onChange={handleInputChange}
                error={formErrors.employment_type}
                options={[
                  {
                    value: "",
                    label: "Select employment type...",
                    disabled: true,
                  },
                  { value: "Full-time", label: "Full-time" },
                  { value: "Part-time", label: "Part-time" },
                  { value: "Contract", label: "Contract" },
                  { value: "Temporary", label: "Temporary" },
                  { value: "Internship", label: "Internship" },
                ]}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Min Salary"
                name="salary_range_min"
                type="text"
                value={formattedSalary.min}
                onChange={handleInputChange}
                placeholder="e.g., 40,000"
              />
              <Input
                label="Max Salary"
                name="salary_range_max"
                type="text"
                value={formattedSalary.max}
                onChange={handleInputChange}
                error={formErrors.salary_range_max}
                placeholder="e.g., 80,000"
              />
              <Select
                label="Priority"
                name="priority"
                value={formData.priority}
                onChange={handleInputChange}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Job Description, Requirements & Notes
              </label>
              <RichTextEditor
                value={formData.description || ""}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, description: value }))
                }
                placeholder="Enter job description, requirements, and internal notes. Use the toolbar for bold, italic, underline, lists, and more."
                minHeight="220px"
                className="rounded-none"
              />
            </div>

            {/* Approvers Section (editable for draft/pending) */}
            {(selectedRequisition?.status === "draft" ||
              selectedRequisition?.status === "pending_approval") && (
              <div className="border-t border-neutral-200 dark:border-dark-200 pt-4">
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  <Users className="h-4 w-4" />
                  Approval Chain
                </label>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                  Assign 1-3 approvers who will review this requisition in
                  order.
                </p>

                {selectedApprovers.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {selectedApprovers.map((uid, idx) => {
                      const u = allUsers.find((u) => u.id === uid);
                      return (
                        <div
                          key={uid}
                          className="flex items-center gap-2 p-2.5 border border-neutral-200 dark:border-dark-200 rounded-none bg-neutral-50 dark:bg-dark-100"
                        >
                          <div className="w-6 h-6 rounded-none bg-[#f26722] text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                              {u?.name || "Unknown"}
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                              {u?.email}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => moveApprover(idx, "up")}
                              disabled={idx === 0}
                              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-dark-200 disabled:opacity-30 transition-colors"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveApprover(idx, "down")}
                              disabled={idx === selectedApprovers.length - 1}
                              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-dark-200 disabled:opacity-30 transition-colors"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeApprover(uid)}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedApprovers.length < 3 && (
                  <div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
                      <input
                        type="text"
                        placeholder={
                          selectedApprovers.length === 0
                            ? "Search for approvers to add..."
                            : "Add another approver..."
                        }
                        value={approverSearchTerm}
                        onChange={(e) => setApproverSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] text-sm"
                      />
                    </div>
                    {approverSearchTerm && (
                      <div className="mt-1 max-h-40 overflow-y-auto border border-neutral-200 dark:border-dark-200 rounded-none shadow-sm">
                        {filteredUsers.length === 0 ? (
                          <p className="p-3 text-sm text-neutral-500 dark:text-neutral-400">
                            No users found
                          </p>
                        ) : (
                          filteredUsers.slice(0, 8).map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => addApprover(u.id)}
                              className="w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-dark-200 last:border-b-0 transition-colors"
                            >
                              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                                {u.name}
                              </p>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                {u.email}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {selectedApprovers.length === 0 && (
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2 italic">
                    No approvers assigned yet.
                  </p>
                )}
              </div>
            )}

            {/* Read-only approver display for non-draft/pending */}
            {selectedRequisition &&
              selectedRequisition.status !== "draft" &&
              selectedRequisition.status !== "pending_approval" &&
              approversMap[selectedRequisition.id]?.length > 0 && (
                <div className="border-t border-neutral-200 dark:border-dark-200 pt-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    <Users className="h-4 w-4" />
                    Approval Chain
                  </label>
                  <div className="space-y-2">
                    {approversMap[selectedRequisition.id].map(
                      (approver, idx) => (
                        <div
                          key={approver.id}
                          className={`flex items-center gap-2 p-2.5 rounded-none border ${
                            approver.status === "approved"
                              ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                              : approver.status === "rejected"
                                ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                                : "border-neutral-200 bg-neutral-50 dark:border-dark-200 dark:bg-dark-100"
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-none flex items-center justify-center text-xs font-bold ${
                              approver.status === "approved"
                                ? "bg-green-500 text-white"
                                : approver.status === "rejected"
                                  ? "bg-red-500 text-white"
                                  : "bg-neutral-300 text-neutral-600 dark:bg-neutral-600 dark:text-neutral-300"
                            }`}
                          >
                            {approver.status === "approved" ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : approver.status === "rejected" ? (
                              <XCircle className="h-3 w-3" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-neutral-900 dark:text-white">
                              {getUserName(approver.approver_user_id)}
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                              {approver.status === "approved"
                                ? "Approved"
                                : approver.status === "rejected"
                                  ? "Rejected"
                                  : "Pending"}
                            </p>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={saving}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRequisition?.title}</DialogTitle>
            <DialogDescription>View job requisition details</DialogDescription>
          </DialogHeader>
          {selectedRequisition && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Department
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {selectedRequisition.department}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Location
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {selectedRequisition.location}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Employment Type
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {selectedRequisition.employment_type}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Salary Range
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {formatSalaryRange(
                      selectedRequisition.salary_range_min,
                      selectedRequisition.salary_range_max,
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Status
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {getStatusLabel(selectedRequisition.status)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Priority
                  </label>
                  <p className="text-neutral-900 dark:text-white capitalize">
                    {selectedRequisition.priority}
                  </p>
                </div>
              </div>
              {(selectedRequisition.description ||
                selectedRequisition.requirements ||
                selectedRequisition.notes) && (
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2 block">
                    Job Description, Requirements & Notes
                  </label>
                  <div
                    className="text-neutral-900 dark:text-white prose prose-sm dark:prose-invert max-w-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_p]:mb-2"
                    dangerouslySetInnerHTML={{
                      __html: getJobRequisitionDisplayHtml(selectedRequisition),
                    }}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-200 dark:border-dark-200">
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Created
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {new Date(selectedRequisition.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Last Updated
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {new Date(selectedRequisition.updated_at).toLocaleString()}
                  </p>
                </div>
                {selectedRequisition.approved_at && (
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      Approved
                    </label>
                    <p className="text-neutral-900 dark:text-white">
                      {new Date(
                        selectedRequisition.approved_at,
                      ).toLocaleString()}
                    </p>
                  </div>
                )}
                {selectedRequisition.posted_at && (
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      Posted
                    </label>
                    <p className="text-neutral-900 dark:text-white">
                      {new Date(selectedRequisition.posted_at).toLocaleString()}
                    </p>
                  </div>
                )}
                {selectedRequisition.closed_at && (
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      Closed
                    </label>
                    <p className="text-neutral-900 dark:text-white">
                      {new Date(selectedRequisition.closed_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Approval Chain */}
              {approversMap[selectedRequisition.id] &&
                approversMap[selectedRequisition.id].length > 0 && (
                  <div className="pt-4 border-t border-neutral-200 dark:border-dark-200">
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-3 block">
                      Approval Chain
                    </label>
                    <div className="space-y-2">
                      {approversMap[selectedRequisition.id].map(
                        (approver, idx) => {
                          const isCurrentStep =
                            selectedRequisition.status === "pending_approval" &&
                            selectedRequisition.current_approval_step ===
                              approver.step_order;
                          return (
                            <div
                              key={approver.id}
                              className={`flex items-center gap-3 p-3 rounded-none border ${
                                approver.status === "approved"
                                  ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                                  : approver.status === "rejected"
                                    ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                                    : isCurrentStep
                                      ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20"
                                      : "border-neutral-200 bg-neutral-50 dark:border-dark-200 dark:bg-dark-100"
                              }`}
                            >
                              <div
                                className={`w-7 h-7 rounded-none flex items-center justify-center text-xs font-bold ${
                                  approver.status === "approved"
                                    ? "bg-green-500 text-white"
                                    : approver.status === "rejected"
                                      ? "bg-red-500 text-white"
                                      : isCurrentStep
                                        ? "bg-yellow-500 text-white"
                                        : "bg-neutral-300 text-neutral-600 dark:bg-neutral-600 dark:text-neutral-300"
                                }`}
                              >
                                {approver.status === "approved" ? (
                                  <CheckCircle className="h-4 w-4" />
                                ) : approver.status === "rejected" ? (
                                  <XCircle className="h-4 w-4" />
                                ) : (
                                  idx + 1
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                                  {getUserName(approver.approver_user_id)}
                                </p>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                  {approver.status === "approved"
                                    ? `Approved ${approver.decided_at ? new Date(approver.decided_at).toLocaleString() : ""}`
                                    : approver.status === "rejected"
                                      ? `Rejected ${approver.decided_at ? new Date(approver.decided_at).toLocaleString() : ""}`
                                      : isCurrentStep
                                        ? "Awaiting approval..."
                                        : "Pending"}
                                </p>
                                {approver.status === "rejected" &&
                                  approver.rejection_reason && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                      Reason: {approver.rejection_reason}
                                    </p>
                                  )}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
            {selectedRequisition && (
              <Button
                onClick={() => {
                  setIsViewModalOpen(false);
                  openEditModal(selectedRequisition);
                }}
                className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
            {selectedRequisition?.status === "approved" && (
              <Button
                onClick={() => {
                  setIsViewModalOpen(false);
                  handlePost(selectedRequisition.id);
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Post Job
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit for Approval Modal - Approver Selection */}
      <Dialog
        open={isSubmitApprovalModalOpen}
        onOpenChange={setIsSubmitApprovalModalOpen}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-[#f26722]" />
              Submit for Approval
            </DialogTitle>
            <DialogDescription>
              Select 1 to 3 approvers in the order they should review this
              requisition. Each approver must approve before it moves to the
              next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Selected Approvers (ordered) */}
            {selectedApprovers.length > 0 && (
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">
                  Approval Order ({selectedApprovers.length}/3)
                </label>
                <div className="space-y-2">
                  {selectedApprovers.map((uid, idx) => {
                    const u = allUsers.find((u) => u.id === uid);
                    return (
                      <div
                        key={uid}
                        className="flex items-center gap-2 p-3 border border-neutral-200 dark:border-dark-200 rounded-none bg-neutral-50 dark:bg-dark-100"
                      >
                        <div className="w-7 h-7 rounded-none bg-[#f26722] text-white flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                            {u?.name || "Unknown"}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                            {u?.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveApprover(idx, "up")}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-dark-200 disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveApprover(idx, "down")}
                            disabled={idx === selectedApprovers.length - 1}
                            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-dark-200 disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeApprover(uid)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add Approver Search */}
            {selectedApprovers.length < 3 && (
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">
                  {selectedApprovers.length === 0
                    ? "Search for approvers"
                    : "Add another approver"}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={approverSearchTerm}
                    onChange={(e) => setApproverSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  />
                </div>
                {approverSearchTerm && (
                  <div className="mt-2 max-h-48 overflow-y-auto border border-neutral-200 dark:border-dark-200 rounded-none">
                    {filteredUsers.length === 0 ? (
                      <p className="p-3 text-sm text-neutral-500 dark:text-neutral-400">
                        No users found
                      </p>
                    ) : (
                      filteredUsers.slice(0, 10).map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => addApprover(u.id)}
                          className="w-full text-left p-3 hover:bg-neutral-100 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-dark-200 last:border-b-0"
                        >
                          <p className="text-sm font-medium text-neutral-900 dark:text-white">
                            {u.name}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {u.email}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedApprovers.length === 0 && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-none">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  At least 1 approver is required to submit for approval.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSubmitApprovalModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitForApproval}
              disabled={saving || selectedApprovers.length < 1}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              <Send className="mr-2 h-4 w-4" />
              {saving
                ? "Submitting..."
                : `Submit with ${selectedApprovers.length} Approver${selectedApprovers.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
