import React, { useState, useEffect, useCallback } from "react";
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
  MessageSquare,
  Loader2,
  Clock,
  CheckCircle,
  Send,
  BarChart3,
  Link2,
  Copy,
  Paperclip,
  Upload,
  X,
} from "lucide-react";
import { toast } from "../../../components/ui/toast";
import { supabase } from "../../../lib/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { onboardingService } from "../../../services/hr/onboardingService";

const ASSIGNMENTS_STORAGE_KEY = "hr_exit_survey_assignments";

function generateToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface ExitSurveyQuestion {
  id: string;
  prompt: string;
  type:
    | "text"
    | "textarea"
    | "scale_1_5"
    | "scale_1_10"
    | "yes_no"
    | "multiple_choice";
  required: boolean;
  order: number;
  options?: string[];
}

export interface ExitSurveyAttachedDoc {
  name: string;
  file_url: string;
  file_path?: string;
}

export interface ExitSurvey {
  id: string;
  name: string;
  description?: string;
  questions: ExitSurveyQuestion[];
  status: "draft" | "active" | "archived";
  is_optional: boolean;
  is_template?: boolean;
  attached_documents?: ExitSurveyAttachedDoc[];
  created_at: string;
  updated_at: string;
}

export interface ExitSurveyResponse {
  id: string;
  survey_id: string;
  assignment_id?: string;
  employee_name?: string;
  employee_id?: string;
  responses: Record<string, string | number | string[]>;
  submitted_at: string;
}

/** Assignment = one survey template sent to one person via unique link */
export interface ExitSurveyAssignment {
  id: string;
  survey_id: string;
  survey_name: string;
  survey_description?: string;
  questions: ExitSurveyQuestion[];
  is_optional: boolean;
  attached_documents?: ExitSurveyAttachedDoc[];
  employee_id: string;
  employee_name: string;
  employee_email: string;
  token: string;
  sent_at: string;
  completed_at?: string;
  response_id?: string;
}

/** Employee option for Send modal */
interface EmployeeOption {
  id: string;
  name: string;
  email: string;
}

const QUESTION_TYPE_OPTIONS = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "scale_1_5", label: "Rating (1-5)" },
  { value: "scale_1_10", label: "Rating (1-10)" },
  { value: "yes_no", label: "Yes / No" },
  { value: "multiple_choice", label: "Multiple Choice" },
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
    color: "text-zinc-500 bg-zinc-100 dark:bg-zinc-800",
  },
];

const defaultSurvey = (): Omit<
  ExitSurvey,
  "id" | "created_at" | "updated_at"
> => ({
  name: "",
  description: "",
  questions: [],
  status: "draft",
  is_optional: true,
  is_template: false,
  attached_documents: [],
});

export const ExitSurveys: React.FC = () => {
  const [surveys, setSurveys] = useState<ExitSurvey[]>([]);
  const [responses, setResponses] = useState<ExitSurveyResponse[]>([]);
  const [assignments, setAssignments] = useState<ExitSurveyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isResponsesModalOpen, setIsResponsesModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<ExitSurvey | null>(null);
  const [surveyToSend, setSurveyToSend] = useState<ExitSurvey | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [sendEmployeeId, setSendEmployeeId] = useState<string>("");
  const [sendEmployeeSearch, setSendEmployeeSearch] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultSurvey());
  const [availableDocs, setAvailableDocs] = useState<
    { id: string; name: string; file_url: string | null }[]
  >([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [docUploading, setDocUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isCreateModalOpen && !isEditModalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const forms = await onboardingService.getESignForms({});
        const docs = (forms || [])
          .filter((f: any) => f.status !== "archived")
          .map((f: any) => {
            const custom = f.custom_fields?.attached_documents;
            const fileUrl =
              Array.isArray(custom) && custom[0]?.file_url
                ? custom[0].file_url
                : null;
            return { id: f.id, name: f.name || "Document", file_url: fileUrl };
          })
          .filter((d: any) => d.file_url);
        if (!cancelled) setAvailableDocs(docs);
      } catch {
        if (!cancelled) setAvailableDocs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCreateModalOpen, isEditModalOpen]);

  const addAttachedDoc = (doc: ExitSurveyAttachedDoc) => {
    const list = formData.attached_documents ?? [];
    if (list.some((d) => d.file_url === doc.file_url)) return;
    setFormData((p) => ({ ...p, attached_documents: [...list, doc] }));
    setShowDocPicker(false);
  };

  const removeAttachedDoc = (index: number) => {
    setFormData((p) => ({
      ...p,
      attached_documents: (p.attached_documents ?? []).filter(
        (_, i) => i !== index,
      ),
    }));
  };

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setDocUploading(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `exit-surveys/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const { error } = await supabase.storage
        .from("documents")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(path);
      addAttachedDoc({ name: file.name, file_url: publicUrl, file_path: path });
      toast({
        title: "Added",
        description: "Document attached to survey.",
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload file.",
        variant: "destructive",
      });
    } finally {
      setDocUploading(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const storedSurveys = localStorage.getItem("hr_exit_surveys");
      const storedResponses = localStorage.getItem("hr_exit_survey_responses");
      const storedAssignments = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
      setSurveys(storedSurveys ? JSON.parse(storedSurveys) : []);
      setResponses(storedResponses ? JSON.parse(storedResponses) : []);
      setAssignments(storedAssignments ? JSON.parse(storedAssignments) : []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load surveys",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveAssignments = (list: ExitSurveyAssignment[]) => {
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(list));
    setAssignments(list);
  };

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      let { data: usersData, error } = await supabase
        .schema("common")
        .rpc("admin_get_users");
      if (error) {
        const fallback = await supabase.rpc("admin_get_users");
        usersData = fallback.data;
        error = fallback.error;
      }
      const users: any[] = usersData || [];
      const { data: profilesData } = await supabase
        .schema("common")
        .from("profiles")
        .select("id, full_name");
      const profilesMap: Record<string, { full_name?: string }> = {};
      (profilesData || []).forEach((p: any) => {
        profilesMap[p.id] = p;
      });
      const list: EmployeeOption[] = users
        .map((u: any) => ({
          id: u.id,
          name:
            profilesMap[u.id]?.full_name ||
            u.raw_user_meta_data?.name ||
            u.user_metadata?.name ||
            u.email?.split("@")[0] ||
            "Unknown",
          email: u.email || "",
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setEmployees(list);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load employees",
        variant: "destructive",
      });
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  const saveSurveys = (list: ExitSurvey[]) => {
    localStorage.setItem("hr_exit_surveys", JSON.stringify(list));
    setSurveys(list);
  };

  const filteredSurveys = surveys.filter((s) => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getResponseCount = (surveyId: string) =>
    responses.filter((r) => r.survey_id === surveyId).length;

  const addQuestion = () => {
    setFormData((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          id: `q_${Date.now()}`,
          prompt: "",
          type: "text",
          required: false,
          order: prev.questions.length,
        },
      ],
    }));
  };

  const updateQuestion = (
    index: number,
    field: keyof ExitSurveyQuestion,
    value: any,
  ) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === index ? { ...q, [field]: value } : q,
      ),
    }));
  };

  const removeQuestion = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  };

  const openCreate = () => {
    setFormData(defaultSurvey());
    setIsCreateModalOpen(true);
  };

  const openEdit = (s: ExitSurvey) => {
    setSelectedSurvey(s);
    setFormData({
      name: s.name,
      description: s.description || "",
      questions: s.questions.map((q) => ({ ...q })),
      status: s.status,
      is_optional: s.is_optional,
      is_template: s.is_template ?? false,
      attached_documents: s.attached_documents ? [...s.attached_documents] : [],
    });
    setIsEditModalOpen(true);
  };

  const openView = (s: ExitSurvey) => {
    setSelectedSurvey(s);
    setIsViewModalOpen(true);
  };

  const openResponses = (s: ExitSurvey) => {
    setSelectedSurvey(s);
    setIsResponsesModalOpen(true);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation",
        description: "Survey name is required.",
        variant: "destructive",
      });
      return;
    }
    const now = new Date().toISOString();
    const newS: ExitSurvey = {
      id: `survey_${Date.now()}`,
      ...formData,
      created_at: now,
      updated_at: now,
    };
    saveSurveys([...surveys, newS]);
    setIsCreateModalOpen(false);
    toast({ title: "Created", description: "Exit survey created." });
  };

  const handleUpdate = () => {
    if (!selectedSurvey || !formData.name.trim()) {
      toast({
        title: "Validation",
        description: "Survey name is required.",
        variant: "destructive",
      });
      return;
    }
    const updated = surveys.map((s) =>
      s.id === selectedSurvey.id
        ? { ...s, ...formData, updated_at: new Date().toISOString() }
        : s,
    );
    saveSurveys(updated);
    setIsEditModalOpen(false);
    setSelectedSurvey(null);
    toast({ title: "Updated", description: "Survey updated." });
  };

  const handleDelete = (s: ExitSurvey) => {
    if (!confirm("Delete this survey?")) return;
    saveSurveys(surveys.filter((x) => x.id !== s.id));
    toast({ title: "Deleted", description: "Survey removed." });
  };

  const openSendModal = (s: ExitSurvey) => {
    setSurveyToSend(s);
    setSendEmployeeId("");
    setSendEmployeeSearch("");
    setGeneratedLink(null);
    setIsSendModalOpen(true);
    fetchEmployees();
  };

  const handleCreateLink = () => {
    if (!surveyToSend || !sendEmployeeId) {
      toast({
        title: "Select employee",
        description: "Choose an employee to send this survey to.",
        variant: "destructive",
      });
      return;
    }
    const employee = employees.find((e) => e.id === sendEmployeeId);
    if (!employee) return;
    const token = generateToken();
    const assignment: ExitSurveyAssignment = {
      id: `assign_${Date.now()}`,
      survey_id: surveyToSend.id,
      survey_name: surveyToSend.name,
      survey_description: surveyToSend.description,
      questions: surveyToSend.questions.map((q) => ({ ...q })),
      is_optional: surveyToSend.is_optional,
      attached_documents: surveyToSend.attached_documents
        ? [...surveyToSend.attached_documents]
        : [],
      employee_id: employee.id,
      employee_name: employee.name,
      employee_email: employee.email,
      token,
      sent_at: new Date().toISOString(),
    };
    const next = [...assignments, assignment];
    saveAssignments(next);
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${baseUrl}/exit-survey/${token}`;
    setGeneratedLink(link);
    toast({
      title: "Link created",
      description: "Copy the link and send it to the employee (e.g. by email).",
    });
  };

  const copyLinkToClipboard = () => {
    if (!generatedLink) return;
    navigator.clipboard
      .writeText(generatedLink)
      .then(() => {
        toast({ title: "Copied", description: "Link copied to clipboard." });
      })
      .catch(() => {
        toast({
          title: "Copy failed",
          description: "Please select and copy the link manually.",
          variant: "destructive",
        });
      });
  };

  const closeSendModal = () => {
    setIsSendModalOpen(false);
    setSurveyToSend(null);
    setSendEmployeeId("");
    setGeneratedLink(null);
  };

  const getAssignmentCount = (surveyId: string) =>
    assignments.filter((a) => a.survey_id === surveyId).length;
  const getCompletedCount = (surveyId: string) =>
    assignments.filter((a) => a.survey_id === surveyId && a.completed_at)
      .length;

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find((o) => o.value === status);
    if (!opt) return null;
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${opt.color}`}
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

  const formatResponseValue = (
    val: string | number | string[] | undefined,
  ): string => {
    if (val === undefined || val === "") return "—";
    if (Array.isArray(val)) return val.join(", ") || "—";
    return String(val);
  };

  const surveyResponses = selectedSurvey
    ? responses.filter((r) => r.survey_id === selectedSurvey.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-[#f26722]" />
            Exit Surveys
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Collect optional feedback from departing employees
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Survey
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Exit surveys are optional
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
              Employees may choose to skip or submit anonymously. To see how
              people filled out a survey, click the <strong>Responses</strong>{" "}
              (chart) icon on that survey’s row.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search surveys..."
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

      {/* Surveys Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Surveys ({filteredSurveys.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#f26722]" />
            </div>
          ) : filteredSurveys.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-zinc-300 dark:text-zinc-600" />
              <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                No surveys found
              </p>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
                {search || filterStatus !== "all"
                  ? "Try adjusting your filters"
                  : "Create your first exit survey"}
              </p>
              {!search && filterStatus === "all" && (
                <Button variant="outline" className="mt-4" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Survey
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                    <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-6 py-3">
                      Survey
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-6 py-3">
                      Questions
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-6 py-3">
                      Sent
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-6 py-3">
                      Responses
                    </th>
                    <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-6 py-3">
                      Status
                    </th>
                    <th className="text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-6 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  {filteredSurveys.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-white">
                            {s.name}
                          </p>
                          {s.description && (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                              {s.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(s.is_template ?? false) && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                                Template
                              </span>
                            )}
                            {s.is_optional && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                Optional
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                          <FileText className="h-4 w-4 text-zinc-400" />
                          {s.questions.length}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300"
                          title={`${getCompletedCount(s.id)} of ${getAssignmentCount(s.id)} completed`}
                        >
                          <Send className="h-4 w-4 text-zinc-400" />
                          {getAssignmentCount(s.id)} sent
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => openResponses(s)}
                          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:text-[#f26722] hover:underline"
                          title="View who filled it out and their answers"
                        >
                          <BarChart3 className="h-4 w-4 text-zinc-400" />
                          {getResponseCount(s.id)} response
                          {getResponseCount(s.id) !== 1 ? "s" : ""}
                        </button>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(s.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSendModal(s)}
                          >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            Send
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openView(s)}
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openResponses(s)}
                            title="Responses"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(s)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(s)}
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
            setSelectedSurvey(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditModalOpen ? "Edit Survey" : "New Exit Survey"}
            </DialogTitle>
            <DialogDescription>
              Configure the questions for departing employees.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Survey Name *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Employee Exit Feedback"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Description
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Brief description shown to employees"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
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
                  className="w-full h-10 px-3 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_template ?? false}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        is_template: e.target.checked,
                      }))
                    }
                    className="rounded border-zinc-300 text-[#f26722] focus:ring-[#f26722]"
                  />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Save as template
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_optional}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        is_optional: e.target.checked,
                      }))
                    }
                    className="rounded border-zinc-300 text-[#f26722] focus:ring-[#f26722]"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    Optional (recommended)
                  </span>
                </label>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Templates are reusable surveys you can send to individual
                employees via unique links.
              </p>
            </div>

            {/* Attached documents */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4 text-[#f26722]" />
                  Attached documents (optional)
                </label>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                Add policy PDFs, handbooks, or e-sign documents for the employee
                to view when taking the survey.
              </p>
              {(formData.attached_documents ?? []).length > 0 && (
                <ul className="space-y-2 mb-3">
                  {(formData.attached_documents ?? []).map((doc, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 py-2 px-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg"
                    >
                      <span
                        className="text-sm truncate flex-1"
                        title={doc.name}
                      >
                        {doc.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachedDoc(i)}
                      >
                        <X className="h-4 w-4 text-zinc-400 hover:text-red-500" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDocPicker(!showDocPicker)}
                  className="border-[#f26722] text-[#f26722] hover:bg-[#f26722]/10"
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  Add from document library
                </Button>
                <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-zinc-300 dark:border-zinc-600 rounded-md cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="sr-only"
                    onChange={handleUploadDoc}
                    disabled={docUploading}
                  />
                  {docUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {docUploading ? "Uploading…" : "Upload new document"}
                </label>
              </div>
              {showDocPicker && availableDocs.length > 0 && (
                <div className="mt-3 p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                    Select a document to attach
                  </p>
                  <div className="space-y-1">
                    {availableDocs.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() =>
                          addAttachedDoc({
                            name: d.name,
                            file_url: d.file_url!,
                          })
                        }
                        className="w-full text-left px-3 py-2 text-sm rounded hover:bg-[#f26722]/10 text-zinc-700 dark:text-zinc-300"
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Questions Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Questions ({formData.questions.length})
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addQuestion}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Question
                </Button>
              </div>
              {formData.questions.length === 0 ? (
                <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg p-6 text-center">
                  <FileText className="h-8 w-8 mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-500">
                    No questions yet. Add questions to collect feedback.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.questions.map((q, i) => (
                    <div
                      key={q.id}
                      className="flex gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg"
                    >
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <Input
                          value={q.prompt}
                          onChange={(e) =>
                            updateQuestion(i, "prompt", e.target.value)
                          }
                          placeholder="Question text"
                          className="sm:col-span-2"
                        />
                        <select
                          value={q.type}
                          onChange={(e) =>
                            updateQuestion(i, "type", e.target.value)
                          }
                          className="h-10 px-3 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm"
                        >
                          {QUESTION_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) =>
                              updateQuestion(i, "required", e.target.checked)
                            }
                            className="rounded border-zinc-300 text-[#f26722] focus:ring-[#f26722]"
                          />
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">
                            Required
                          </span>
                        </label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(i)}
                      >
                        <Trash2 className="h-4 w-4 text-zinc-400 hover:text-red-500" />
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
              {isEditModalOpen ? "Save Changes" : "Create Survey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedSurvey?.name}</DialogTitle>
            <DialogDescription>
              {selectedSurvey?.description || "No description provided"}
            </DialogDescription>
          </DialogHeader>
          {selectedSurvey && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-3 flex-wrap">
                {getStatusBadge(selectedSurvey.status)}
                {(selectedSurvey.is_template ?? false) && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                    Template
                  </span>
                )}
                {selectedSurvey.is_optional && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    Optional
                  </span>
                )}
              </div>

              {(selectedSurvey.attached_documents?.length ?? 0) > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-zinc-900 dark:text-white mb-2">
                    Attached documents (
                    {selectedSurvey.attached_documents!.length})
                  </h4>
                  <ul className="space-y-1">
                    {selectedSurvey.attached_documents!.map((d, i) => (
                      <li
                        key={i}
                        className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4 text-[#f26722]" />
                        {d.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h4 className="text-sm font-medium text-zinc-900 dark:text-white mb-3">
                  Questions ({selectedSurvey.questions.length})
                </h4>
                {selectedSurvey.questions.length === 0 ? (
                  <p className="text-sm text-zinc-500">No questions defined</p>
                ) : (
                  <ol className="space-y-3">
                    {selectedSurvey.questions.map((q, i) => (
                      <li key={q.id} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm text-zinc-900 dark:text-white">
                            {q.prompt}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {
                              QUESTION_TYPE_OPTIONS.find(
                                (o) => o.value === q.type,
                              )?.label
                            }
                            {q.required && (
                              <span className="ml-2 text-amber-600">
                                Required
                              </span>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
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
                if (selectedSurvey) openEdit(selectedSurvey);
              }}
            >
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Responses Modal — who filled it out, when, and question-by-question answers */}
      <Dialog
        open={isResponsesModalOpen}
        onOpenChange={setIsResponsesModalOpen}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Survey Responses</DialogTitle>
            <DialogDescription>
              {selectedSurvey?.name} — who responded and how they answered
            </DialogDescription>
          </DialogHeader>
          {surveyResponses.length === 0 ? (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 text-zinc-300 dark:text-zinc-600" />
              <p className="text-zinc-500 dark:text-zinc-400">
                No responses yet
              </p>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
                Responses will appear here as employees complete the survey via
                their unique link.
              </p>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              {surveyResponses.map((r) => (
                <div
                  key={r.id}
                  className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-200 dark:border-zinc-700">
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {r.employee_name || "Anonymous"}
                    </span>
                    <span className="text-sm text-zinc-500">
                      Submitted {new Date(r.submitted_at).toLocaleDateString()}{" "}
                      at{" "}
                      {new Date(r.submitted_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {selectedSurvey?.questions
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((q) => {
                        const val = r.responses[q.id];
                        const display = formatResponseValue(val);
                        return (
                          <div key={q.id} className="text-sm">
                            <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-0.5">
                              {q.prompt}
                            </p>
                            <p className="text-zinc-600 dark:text-zinc-400 pl-0">
                              {display}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsResponsesModalOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Survey Modal — create individual link for one employee */}
      <Dialog
        open={isSendModalOpen}
        onOpenChange={(open) => !open && closeSendModal()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send survey to employee</DialogTitle>
            <DialogDescription>
              {surveyToSend?.name}. Select an employee to generate their unique
              survey link. Copy the link and share it (e.g. by email). Links
              work when opened in this app; for links opened from another
              device, integrate with your backend to load the survey by token.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!generatedLink ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Employee
                  </label>
                  {loadingEmployees ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <LoadingSpinner size="md" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="Search by name or email..."
                        value={sendEmployeeSearch}
                        onChange={(e) => setSendEmployeeSearch(e.target.value)}
                        className="w-full"
                      />
                      <select
                        value={sendEmployeeId}
                        onChange={(e) => setSendEmployeeId(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm"
                      >
                        <option value="">Select an employee</option>
                        {employees
                          .filter(
                            (e) =>
                              !sendEmployeeSearch.trim() ||
                              e.name
                                .toLowerCase()
                                .includes(sendEmployeeSearch.toLowerCase()) ||
                              e.email
                                .toLowerCase()
                                .includes(sendEmployeeSearch.toLowerCase()),
                          )
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name} — {e.email}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeSendModal}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateLink}
                    disabled={!sendEmployeeId || loadingEmployees}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Create link
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 border border-zinc-200 dark:border-zinc-700">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    Individual survey link
                  </p>
                  <p className="text-sm text-zinc-900 dark:text-white break-all font-mono">
                    {generatedLink}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={copyLinkToClipboard} className="flex-1">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy link
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setGeneratedLink(null);
                      setSendEmployeeId("");
                    }}
                  >
                    Create another link
                  </Button>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeSendModal}>
                    Done
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
