import React, { useState, useEffect } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
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
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  FileCheck,
  Search,
  Filter,
  AlertCircle,
  Briefcase,
  MapPin,
  User,
  DollarSign,
  Calendar,
  RefreshCw,
  Users,
  ArrowRight,
} from "lucide-react";
import {
  jobRequisitionsService,
  JobRequisition,
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

export const RequisitionApprovals: React.FC = () => {
  const { user } = useAuth();
  const [myPendingItems, setMyPendingItems] = useState<
    { requisition: JobRequisition; approverRecord: RequisitionApprover }[]
  >([]);
  const [allPending, setAllPending] = useState<JobRequisition[]>([]);
  const [allApproversMap, setAllApproversMap] = useState<
    Record<string, RequisitionApprover[]>
  >({});
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] =
    useState<JobRequisition | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [viewTab, setViewTab] = useState<"mine" | "all">("mine");

  useEffect(() => {
    fetchData();
    fetchUsers();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const all = await jobRequisitionsService.getAll();
      const pending = all.filter((req) => req.status === "pending_approval");
      setAllPending(pending);

      if (pending.length > 0) {
        const approvers = await jobRequisitionsService.getApproversForMultiple(
          pending.map((r) => r.id),
        );
        setAllApproversMap(approvers);
      }

      if (user?.id) {
        const myItems = await jobRequisitionsService.getPendingForUser(user.id);
        setMyPendingItems(myItems);
      }
    } catch (error: any) {
      console.error("Error fetching pending requisitions:", error);
      toast({
        title: "Error",
        description: "Failed to load pending requisitions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      let users: AppUser[] = [];
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
        // Keep all users so existing approvers' names still resolve; the
        // picker hides deactivated users at render time.
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

  const getUserName = (userId: string): string => {
    const u = allUsers.find((u) => u.id === userId);
    return u ? u.name : "Unknown User";
  };

  const handleApprove = async (requisitionId: string) => {
    if (!user?.id) return;

    try {
      setApproving(true);
      const { allApproved } = await jobRequisitionsService.approveStep(
        requisitionId,
        user.id,
      );
      if (allApproved) {
        toast({
          title: "Fully Approved",
          description:
            "All approvers have approved. Requisition is now ready to post to the career page.",
          variant: "success",
        });
      } else {
        toast({
          title: "Approved",
          description:
            "Your approval has been recorded. The requisition has been sent to the next approver.",
          variant: "success",
        });
      }
      fetchData();
      setIsViewModalOpen(false);
    } catch (error: any) {
      console.error("Error approving requisition:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve requisition",
        variant: "destructive",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequisition || !user?.id) return;

    if (!rejectReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for rejection",
        variant: "destructive",
      });
      return;
    }

    try {
      setRejecting(true);
      await jobRequisitionsService.rejectStep(
        selectedRequisition.id,
        user.id,
        rejectReason,
      );
      toast({
        title: "Rejected",
        description: "Requisition has been rejected and closed",
        variant: "success",
      });
      fetchData();
      setIsRejectModalOpen(false);
      setIsViewModalOpen(false);
      setRejectReason("");
      setSelectedRequisition(null);
    } catch (error: any) {
      console.error("Error rejecting requisition:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject requisition",
        variant: "destructive",
      });
    } finally {
      setRejecting(false);
    }
  };

  const openViewModal = (requisition: JobRequisition) => {
    setSelectedRequisition(requisition);
    setIsViewModalOpen(true);
  };

  const openRejectModal = (requisition: JobRequisition) => {
    setSelectedRequisition(requisition);
    setRejectReason("");
    setIsRejectModalOpen(true);
  };

  const getTimeSinceSubmission = (date: string) => {
    const now = new Date();
    const submitted = new Date(date);
    const diffMs = now.getTime() - submitted.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    if (diffHours > 0)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffMinutes > 0)
      return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
    return "Just now";
  };

  const formatSalaryRange = (min?: number, max?: number) => {
    if (!min && !max) return "Not specified";
    if (min && max)
      return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
    if (min) return `$${min.toLocaleString()}+`;
    if (max) return `Up to $${max.toLocaleString()}`;
    return "Not specified";
  };

  const getPriorityColor = (priority: JobRequisition["priority"]) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "low":
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200";
      default:
        return "bg-neutral-100 text-neutral-800";
    }
  };

  const isMyTurn = (reqId: string): boolean => {
    return myPendingItems.some((item) => item.requisition.id === reqId);
  };

  const displayRequisitions =
    viewTab === "mine"
      ? myPendingItems.map((item) => item.requisition)
      : allPending;

  const filteredRequisitions = displayRequisitions.filter((req) => {
    const matchesSearch =
      req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment =
      filterDepartment === "all" || req.department === filterDepartment;
    const matchesPriority =
      filterPriority === "all" || req.priority === filterPriority;
    return matchesSearch && matchesDepartment && matchesPriority;
  });

  const departments = Array.from(
    new Set(allPending.map((req) => req.department)),
  ).sort();

  const ApprovalChain: React.FC<{
    approvers: RequisitionApprover[];
    currentStep: number;
    compact?: boolean;
  }> = ({ approvers, currentStep, compact }) => (
    <div className={`flex items-center gap-${compact ? "1" : "2"} flex-wrap`}>
      {approvers.map((approver, idx) => {
        const isCurrentStep = approver.step_order === currentStep;
        return (
          <React.Fragment key={approver.id}>
            {idx > 0 && (
              <ArrowRight
                className={`${compact ? "h-3 w-3" : "h-4 w-4"} text-neutral-300 dark:text-neutral-600 shrink-0`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-none text-xs font-medium ${
                approver.status === "approved"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : approver.status === "rejected"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : isCurrentStep
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 ring-2 ring-yellow-300 dark:ring-yellow-700"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {approver.status === "approved" && (
                <CheckCircle className="h-3 w-3" />
              )}
              {approver.status === "rejected" && (
                <XCircle className="h-3 w-3" />
              )}
              {approver.status === "pending" && isCurrentStep && (
                <Clock className="h-3 w-3 animate-pulse" />
              )}
              <span>{getUserName(approver.approver_user_id)}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            Requisition Approvals
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            Review and approve job requisitions assigned to you
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-brand">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Assigned to Me
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-brand">
              {myPendingItems.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
              Total Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {allPending.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-red-600 dark:text-red-400">
              High Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {allPending.filter((r) => r.priority === "high").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 dark:bg-dark-100 p-1 rounded-none w-fit">
        <button
          onClick={() => setViewTab("mine")}
          className={`px-4 py-2 rounded-none text-sm font-medium transition-colors ${
            viewTab === "mine"
              ? "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          }`}
        >
          My Approvals ({myPendingItems.length})
        </button>
        <button
          onClick={() => setViewTab("all")}
          className={`px-4 py-2 rounded-none text-sm font-medium transition-colors ${
            viewTab === "all"
              ? "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          }`}
        >
          All Pending ({allPending.length})
        </button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by title, department, or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-neutral-400" />
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="all">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
            Showing {filteredRequisitions.length}{" "}
            {viewTab === "mine" ? "assigned to you" : "pending"} requisition
            {filteredRequisitions.length !== 1 ? "s" : ""}
          </div>
        </CardContent>
      </Card>

      {/* Requisitions List */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <LoadingSpinner size="md" />
            </div>
          </CardContent>
        </Card>
      ) : filteredRequisitions.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <FileCheck className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
                {viewTab === "mine"
                  ? "No approvals assigned to you"
                  : "No pending approvals"}
              </h3>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {viewTab === "mine"
                  ? "You have no requisitions waiting for your approval"
                  : "All requisitions have been reviewed"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredRequisitions.map((req) => {
            const submittedAt = req.submitted_for_approval_at || req.created_at;
            const approvers = allApproversMap[req.id] || [];
            const canApprove = isMyTurn(req.id);
            const currentStep = req.current_approval_step || 1;
            return (
              <Card
                key={req.id}
                className={`hover:shadow-lg transition-all border-l-4 ${canApprove ? "border-l-brand" : "border-l-yellow-400"}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">{req.title}</CardTitle>
                        <span
                          className={`px-2 py-1 rounded-none text-xs font-medium ${getPriorityColor(req.priority)}`}
                        >
                          {req.priority.charAt(0).toUpperCase() +
                            req.priority.slice(1)}{" "}
                          Priority
                        </span>
                        {canApprove && (
                          <span className="px-2 py-1 rounded-none text-xs font-medium bg-brand/10 text-brand ring-1 ring-brand/30">
                            Your Turn
                          </span>
                        )}
                        <span className="px-2 py-1 rounded-none text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                          Step {currentStep} of {approvers.length || "?"}
                        </span>
                      </div>
                      <CardDescription className="flex flex-wrap items-center gap-4 mt-2">
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-4 w-4" />
                          {req.department}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {req.location}
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
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Approval Chain */}
                  {approvers.length > 0 && (
                    <div className="mb-4 pb-3 border-b border-neutral-100 dark:border-dark-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-neutral-400" />
                        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                          Approval Chain
                        </span>
                      </div>
                      <ApprovalChain
                        approvers={approvers}
                        currentStep={currentStep}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Submitted {getTimeSinceSubmission(submittedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Created {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openViewModal(req)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Review
                      </Button>
                      {canApprove && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(req.id)}
                            disabled={approving}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {approving ? "Approving..." : "Approve"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRejectModal(req)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* View/Review Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {selectedRequisition?.title}
            </DialogTitle>
            <DialogDescription>
              Review all details before making your decision
            </DialogDescription>
          </DialogHeader>
          {selectedRequisition && (
            <div className="space-y-6 py-4">
              {/* Key Information Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-neutral-50 dark:bg-dark-100 rounded-none">
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                    Department
                  </label>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white mt-1">
                    {selectedRequisition.department}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                    Location
                  </label>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white mt-1">
                    {selectedRequisition.location}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                    Employment Type
                  </label>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white mt-1">
                    {selectedRequisition.employment_type}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                    Priority
                  </label>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white mt-1 capitalize">
                    {selectedRequisition.priority}
                  </p>
                </div>
              </div>

              {/* Salary Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Salary Range
                  </label>
                  <p className="text-neutral-900 dark:text-white font-medium">
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
                  <p className="text-neutral-900 dark:text-white font-medium">
                    {selectedRequisition.status
                      .split("_")
                      .map(
                        (word) => word.charAt(0).toUpperCase() + word.slice(1),
                      )
                      .join(" ")}
                  </p>
                </div>
              </div>

              {/* Approval Chain in Detail */}
              {allApproversMap[selectedRequisition.id] &&
                allApproversMap[selectedRequisition.id].length > 0 && (
                  <div className="p-4 bg-neutral-50 dark:bg-dark-100 rounded-none">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-neutral-500" />
                      <label className="text-sm font-semibold text-neutral-900 dark:text-white">
                        Approval Chain Progress
                      </label>
                    </div>
                    <div className="space-y-3">
                      {allApproversMap[selectedRequisition.id].map(
                        (approver, idx) => {
                          const isCurrentStep =
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
                                      : "border-neutral-200 bg-white dark:border-dark-200 dark:bg-dark-150"
                              }`}
                            >
                              <div
                                className={`w-8 h-8 rounded-none flex items-center justify-center text-xs font-bold ${
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
                                  {approver.approver_user_id === user?.id && (
                                    <span className="ml-2 text-xs text-brand">
                                      (You)
                                    </span>
                                  )}
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

              {/* Description, Requirements & Notes */}
              {(selectedRequisition.description ||
                selectedRequisition.requirements ||
                selectedRequisition.notes) && (
                <div>
                  <label className="text-sm font-semibold text-neutral-900 dark:text-white mb-2 block">
                    Job Description, Requirements & Notes
                  </label>
                  <div className="p-4 bg-neutral-50 dark:bg-dark-100 rounded-none">
                    <div
                      className="text-neutral-900 dark:text-white prose prose-sm dark:prose-invert max-w-none leading-relaxed [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_p]:mb-2"
                      dangerouslySetInnerHTML={{
                        __html:
                          getJobRequisitionDisplayHtml(selectedRequisition),
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Timeline Information */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-200 dark:border-dark-200">
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Created
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-white">
                    {new Date(selectedRequisition.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Last Updated
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-white">
                    {new Date(selectedRequisition.updated_at).toLocaleString()}
                  </p>
                </div>
                {selectedRequisition.submitted_for_approval_at && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Submitted for Approval
                    </label>
                    <p className="text-sm text-neutral-900 dark:text-white">
                      {new Date(
                        selectedRequisition.submitted_for_approval_at,
                      ).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
            {selectedRequisition && isMyTurn(selectedRequisition.id) && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsViewModalOpen(false);
                    openRejectModal(selectedRequisition);
                  }}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button
                  onClick={() => handleApprove(selectedRequisition.id)}
                  disabled={approving}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {approving ? "Approving..." : "Approve Requisition"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              Reject Requisition
            </DialogTitle>
            <DialogDescription>
              Rejecting will close this requisition for all approvers. Please
              provide a reason.
            </DialogDescription>
          </DialogHeader>
          {selectedRequisition && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-neutral-50 dark:bg-dark-100 rounded-none">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                  Rejecting:{" "}
                  <span className="font-semibold">
                    {selectedRequisition.title}
                  </span>
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {selectedRequisition.department} &bull;{" "}
                  {selectedRequisition.location}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-900 dark:text-white mb-2 block">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Please explain why this requisition is being rejected..."
                  rows={5}
                  className="w-full"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  This reason will be visible to the requisition creator and all
                  approvers
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRejectModalOpen(false);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejecting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <XCircle className="mr-2 h-4 w-4" />
              {rejecting ? "Rejecting..." : "Reject Requisition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
