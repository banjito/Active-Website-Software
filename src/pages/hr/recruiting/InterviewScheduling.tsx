import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  Calendar,
  Clock,
  Users,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Video,
  Phone,
  User,
  MapPin,
  Eye,
  Play,
  Timer,
  Check,
  X,
  ListChecks,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  List,
} from "lucide-react";
import type {
  CreateStageInput,
  CreateQuestionInput,
} from "../../../services/hr/interviewStagesService";
import {
  interviewsService,
  Interview,
  CreateInterviewInput,
} from "../../../services/hr/interviewsService";
import {
  candidatesService,
  Candidate,
} from "../../../services/hr/candidatesService";
import {
  interviewStagesService,
  InterviewStage,
  InterviewStageQuestion,
} from "../../../services/hr/interviewStagesService";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const InterviewScheduling: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const candidateIdFromUrl = searchParams.get("candidateId");

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [stages, setStages] = useState<InterviewStage[]>([]);
  const [users, setUsers] = useState<
    Array<{ id: string; email: string; user_metadata?: { name?: string } }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isStartInterviewModalOpen, setIsStartInterviewModalOpen] =
    useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(
    null,
  );
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showDenyConfirm, setShowDenyConfirm] = useState(false);

  // Interview form state
  const [interviewFormData, setInterviewFormData] = useState<{
    gettingToKnowNotes: string;
    whyApplyingChecked: boolean;
    whyApplyingNotes: string;
    loveJobChecked: boolean;
    loveJobNotes: string;
    notLoveJobChecked: boolean;
    notLoveJobNotes: string;
    fitCultureNotes: string;
    workExperienceNotes: string;
    reactSituationsNotes: string;
    overallFeedback: string;
    rating: number;
  }>({
    gettingToKnowNotes: "",
    whyApplyingChecked: false,
    whyApplyingNotes: "",
    loveJobChecked: false,
    loveJobNotes: "",
    notLoveJobChecked: false,
    notLoveJobNotes: "",
    fitCultureNotes: "",
    workExperienceNotes: "",
    reactSituationsNotes: "",
    overallFeedback: "",
    rating: 0,
  });

  // Template-driven feedback (when stage has a question template)
  const [stageQuestions, setStageQuestions] = useState<
    InterviewStageQuestion[]
  >([]);
  const [templateResponses, setTemplateResponses] = useState<
    Record<string, string | { checked: boolean; notes: string }>
  >({});
  const [viewModalStageQuestions, setViewModalStageQuestions] = useState<
    InterviewStageQuestion[]
  >([]);

  // Timer state
  const [interviewStartTime, setInterviewStartTime] = useState<Date | null>(
    null,
  );
  const [elapsedTime, setElapsedTime] = useState(0); // in seconds
  const [viewMode, setViewMode] = useState<"calendar" | "list">("list");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [formData, setFormData] = useState<CreateInterviewInput>({
    candidate_id: candidateIdFromUrl || "",
    interview_type: "in-person",
    interview_stage: "initial_culture",
    scheduled_date: new Date().toISOString().split("T")[0],
    scheduled_time: "09:00",
    duration_minutes: 30, // Default for initial_culture
    location: "",
    video_link: "",
    interviewer_ids: [],
    notes: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [showCreateStageModal, setShowCreateStageModal] = useState(false);
  const [newStageForm, setNewStageForm] = useState<CreateStageInput>({
    name: "",
    slug: "",
    display_order: 0,
    default_duration_minutes: 60,
    is_final_stage: false,
  });
  const [creatingStage, setCreatingStage] = useState(false);

  const [showManageTemplatesModal, setShowManageTemplatesModal] =
    useState(false);
  const [templateStage, setTemplateStage] = useState<InterviewStage | null>(
    null,
  );
  const [templateQuestions, setTemplateQuestions] = useState<
    InterviewStageQuestion[]
  >([]);
  const [showQuestionFormModal, setShowQuestionFormModal] = useState(false);
  const [questionForm, setQuestionForm] = useState<CreateQuestionInput>({
    stage_id: "",
    label: "",
    question_type: "text",
    display_order: 0,
    required: false,
  });
  const [editingQuestion, setEditingQuestion] =
    useState<InterviewStageQuestion | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);

  const getStageDisplayName = (slug: string) =>
    stages.find((s) => s.slug === slug)?.name ?? slug;
  const getStageIsFinal = (slug: string) =>
    stages.find((s) => s.slug === slug)?.is_final_stage ?? slug === "final";

  useEffect(() => {
    fetchData();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (candidateIdFromUrl) {
      setFormData((prev) => ({ ...prev, candidate_id: candidateIdFromUrl }));
      setIsCreateModalOpen(true);
    }
  }, [candidateIdFromUrl]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [interviewsData, candidatesData, stagesData] = await Promise.all([
        interviewsService.getAll(),
        candidatesService.getAll(),
        interviewStagesService.getStages().catch(() => []),
      ]);
      setInterviews(interviewsData);
      setCandidates(candidatesData);
      setStages(stagesData);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load interviews. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      // Try to fetch from a profiles table if it exists
      const { data: profiles, error: profileError } = await supabase
        .schema("common")
        .from("profiles")
        .select("id, email, user_metadata")
        .limit(100);

      if (!profileError && profiles && profiles.length > 0) {
        setUsers(
          profiles.map((p) => ({
            id: p.id,
            email: p.email || "",
            user_metadata: p.user_metadata,
          })),
        );
        return;
      }

      // Fallback: use current user
      if (user) {
        setUsers([
          {
            id: user.id,
            email: user.email || "",
            user_metadata: user.user_metadata,
          },
        ]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      // Fallback: use current user
      if (user) {
        setUsers([
          {
            id: user.id,
            email: user.email || "",
            user_metadata: user.user_metadata,
          },
        ]);
      }
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;

    // Auto-set duration from stage when stage changes
    if (name === "interview_stage") {
      const stage = stages.find((s) => s.slug === value);
      const defaultDuration = stage?.default_duration_minutes ?? 60;
      setFormData((prev) => ({
        ...prev,
        interview_stage: value,
        duration_minutes: defaultDuration,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]:
          type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
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

  const handleInterviewerToggle = (userId: string) => {
    setFormData((prev) => ({
      ...prev,
      interviewer_ids: prev.interviewer_ids.includes(userId)
        ? prev.interviewer_ids.filter((id) => id !== userId)
        : [...prev.interviewer_ids, userId],
    }));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.candidate_id) {
      errors.candidate_id = "Candidate is required";
    }
    if (!formData.scheduled_date) {
      errors.scheduled_date = "Date is required";
    }
    if (!formData.scheduled_time) {
      errors.scheduled_time = "Time is required";
    }
    if (formData.interviewer_ids.length === 0) {
      errors.interviewer_ids = "At least one interviewer is required";
    }
    if (formData.interview_type === "video" && !formData.video_link) {
      errors.video_link = "Video link is required for video interviews";
    }
    if (formData.interview_type === "in-person" && !formData.location) {
      errors.location = "Location is required for in-person interviews";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm() || !user) return;

    try {
      setSaving(true);
      await interviewsService.create(formData, user.id);
      toast({
        title: "Success",
        description: "Interview scheduled successfully",
        variant: "success",
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchData();
      // Clear URL param if it was set
      if (candidateIdFromUrl) {
        navigate("/hr/recruiting/interview-scheduling", { replace: true });
      }
    } catch (error: any) {
      console.error("Error creating interview:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to schedule interview",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!validateForm() || !selectedInterview) return;

    try {
      setSaving(true);
      await interviewsService.update(selectedInterview.id, formData);
      toast({
        title: "Success",
        description: "Interview updated successfully",
        variant: "success",
      });
      setIsEditModalOpen(false);
      setSelectedInterview(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error("Error updating interview:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update interview",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this interview?")) return;

    try {
      await interviewsService.delete(id);
      toast({
        title: "Success",
        description: "Interview deleted successfully",
        variant: "success",
      });
      fetchData();
    } catch (error: any) {
      console.error("Error deleting interview:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete interview",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (
    id: string,
    status: Interview["status"],
    feedback?: string,
    rating?: number,
  ) => {
    try {
      await interviewsService.updateStatus(id, status, feedback, rating);
      toast({
        title: "Success",
        description: "Interview status updated",
        variant: "success",
      });
      fetchData();
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    const firstStage = stages[0];
    setFormData({
      candidate_id: "",
      interview_type: "in-person",
      interview_stage: firstStage?.slug ?? "initial_culture",
      scheduled_date: new Date().toISOString().split("T")[0],
      scheduled_time: "09:00",
      duration_minutes: firstStage?.default_duration_minutes ?? 30,
      location: "",
      video_link: "",
      interviewer_ids: [],
      notes: "",
    });
    setFormErrors({});
  };

  const openEditModal = (interview: Interview) => {
    setSelectedInterview(interview);
    setFormData({
      candidate_id: interview.candidate_id,
      interview_type: interview.interview_type,
      interview_stage: interview.interview_stage,
      scheduled_date: interview.scheduled_date.split("T")[0],
      scheduled_time: interview.scheduled_time,
      duration_minutes: interview.duration_minutes,
      location: interview.location || "",
      video_link: interview.video_link || "",
      interviewer_ids: interview.interviewer_ids || [],
      notes: interview.notes || "",
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = async (interview: Interview) => {
    setSelectedInterview(interview);
    setIsViewModalOpen(true);
    try {
      const qs = await interviewStagesService.getQuestionsByStageSlug(
        interview.interview_stage,
      );
      setViewModalStageQuestions(qs);
    } catch {
      setViewModalStageQuestions([]);
    }
  };

  const openStartInterviewModal = async (interview: Interview) => {
    setSelectedInterview(interview);
    const startTime = new Date();
    setInterviewStartTime(startTime);

    // Load question template for this stage
    let questions: InterviewStageQuestion[] = [];
    try {
      questions = await interviewStagesService.getQuestionsByStageSlug(
        interview.interview_stage,
      );
    } catch {
      // ignore
    }
    setStageQuestions(questions);

    // Load existing feedback if available
    let initialElapsedTime = 0;
    const initialTemplateResponses: Record<
      string,
      string | { checked: boolean; notes: string }
    > = {};
    if (interview.feedback) {
      try {
        const feedbackData = JSON.parse(interview.feedback);
        if (
          feedbackData.templateResponses &&
          typeof feedbackData.templateResponses === "object"
        ) {
          Object.assign(
            initialTemplateResponses,
            feedbackData.templateResponses,
          );
        }
        setInterviewFormData({
          gettingToKnowNotes: feedbackData.gettingToKnowNotes || "",
          whyApplyingChecked: feedbackData.whyApplyingChecked || false,
          whyApplyingNotes: feedbackData.whyApplyingNotes || "",
          loveJobChecked: feedbackData.loveJobChecked || false,
          loveJobNotes: feedbackData.loveJobNotes || "",
          notLoveJobChecked: feedbackData.notLoveJobChecked || false,
          notLoveJobNotes: feedbackData.notLoveJobNotes || "",
          fitCultureNotes: feedbackData.fitCultureNotes || "",
          workExperienceNotes: feedbackData.workExperienceNotes || "",
          reactSituationsNotes: feedbackData.reactSituationsNotes || "",
          overallFeedback:
            feedbackData.overallFeedback || interview.feedback || "",
          rating: interview.rating || 0,
        });
        if (feedbackData.elapsedTime)
          initialElapsedTime = feedbackData.elapsedTime;
      } catch {
        setInterviewFormData((prev) => ({
          ...prev,
          overallFeedback: interview.feedback || "",
          rating: interview.rating || 0,
        }));
      }
    } else {
      setInterviewFormData({
        gettingToKnowNotes: "",
        whyApplyingChecked: false,
        whyApplyingNotes: "",
        loveJobChecked: false,
        loveJobNotes: "",
        notLoveJobChecked: false,
        notLoveJobNotes: "",
        fitCultureNotes: "",
        workExperienceNotes: "",
        reactSituationsNotes: "",
        overallFeedback: "",
        rating: 0,
      });
    }
    setTemplateResponses(initialTemplateResponses);
    setElapsedTime(initialElapsedTime);
    setIsStartInterviewModalOpen(true);
  };

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isStartInterviewModalOpen && interviewStartTime) {
      // Calculate initial elapsed time from start time
      const initialElapsed = Math.floor(
        (new Date().getTime() - interviewStartTime.getTime()) / 1000,
      );
      setElapsedTime(initialElapsed);

      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor(
          (now.getTime() - interviewStartTime.getTime()) / 1000,
        );
        setElapsedTime(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isStartInterviewModalOpen, interviewStartTime]);

  // Format time helper
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleInterviewFormChange = (field: string, value: any) => {
    setInterviewFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTemplateResponseChange = (
    questionId: string,
    questionType: "text" | "checkbox",
    value: string | { checked: boolean; notes: string },
  ) => {
    setTemplateResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  const slugFromName = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

  const openCreateStageModal = () => {
    setNewStageForm({
      name: "",
      slug: "",
      display_order: stages.length,
      default_duration_minutes: 60,
      is_final_stage: false,
    });
    setShowCreateStageModal(true);
  };

  const handleCreateStage = async () => {
    const name = newStageForm.name?.trim();
    if (!name) {
      toast({
        title: "Validation",
        description: "Stage name is required",
        variant: "destructive",
      });
      return;
    }
    const slug = newStageForm.slug?.trim() || slugFromName(name);
    if (!slug) {
      toast({
        title: "Validation",
        description: "Slug is required",
        variant: "destructive",
      });
      return;
    }
    try {
      setCreatingStage(true);
      const newStage = await interviewStagesService.createStage({
        ...newStageForm,
        name,
        slug,
        display_order: newStageForm.display_order ?? stages.length,
        default_duration_minutes: newStageForm.default_duration_minutes ?? 60,
        is_final_stage: newStageForm.is_final_stage ?? false,
      });
      const updatedStages = await interviewStagesService.getStages();
      setStages(updatedStages);
      setFormData((prev) => ({
        ...prev,
        interview_stage: newStage.slug,
        duration_minutes: newStage.default_duration_minutes,
      }));
      setShowCreateStageModal(false);
      toast({
        title: "Success",
        description: `Stage "${newStage.name}" added`,
        variant: "success",
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to create stage",
        variant: "destructive",
      });
    } finally {
      setCreatingStage(false);
    }
  };

  const openManageTemplatesModal = () => {
    setTemplateStage(null);
    setTemplateQuestions([]);
    setShowManageTemplatesModal(true);
  };

  const openStageQuestions = async (stage: InterviewStage) => {
    setTemplateStage(stage);
    try {
      const qs = await interviewStagesService.getQuestionsForStage(stage.id);
      setTemplateQuestions(qs);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to load questions",
        variant: "destructive",
      });
    }
  };

  const backToStageList = () => {
    setTemplateStage(null);
    setTemplateQuestions([]);
  };

  const openAddQuestion = () => {
    if (!templateStage) return;
    setEditingQuestion(null);
    setQuestionForm({
      stage_id: templateStage.id,
      label: "",
      question_type: "text",
      display_order: templateQuestions.length,
      required: false,
    });
    setShowQuestionFormModal(true);
  };

  const openEditQuestion = (q: InterviewStageQuestion) => {
    setEditingQuestion(q);
    setQuestionForm({
      stage_id: q.stage_id,
      label: q.label,
      question_type: q.question_type,
      display_order: q.display_order,
      required: q.required,
    });
    setShowQuestionFormModal(true);
  };

  const handleSaveQuestion = async () => {
    if (!questionForm.label?.trim()) {
      toast({
        title: "Validation",
        description: "Question is required",
        variant: "destructive",
      });
      return;
    }
    try {
      setSavingQuestion(true);
      if (editingQuestion) {
        await interviewStagesService.updateQuestion(editingQuestion.id, {
          label: questionForm.label,
          question_type: questionForm.question_type,
          required: questionForm.required,
        });
        toast({
          title: "Success",
          description: "Question updated",
          variant: "success",
        });
      } else {
        await interviewStagesService.createQuestion(questionForm);
        toast({
          title: "Success",
          description: "Question added",
          variant: "success",
        });
      }
      setShowQuestionFormModal(false);
      if (templateStage) {
        const qs = await interviewStagesService.getQuestionsForStage(
          templateStage.id,
        );
        setTemplateQuestions(qs);
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to save question",
        variant: "destructive",
      });
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (q: InterviewStageQuestion) => {
    if (!window.confirm("Remove this question from the template?")) return;
    try {
      await interviewStagesService.deleteQuestion(q.id);
      if (templateStage) {
        const qs = await interviewStagesService.getQuestionsForStage(
          templateStage.id,
        );
        setTemplateQuestions(qs);
      }
      toast({
        title: "Success",
        description: "Question removed",
        variant: "success",
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to delete question",
        variant: "destructive",
      });
    }
  };

  const moveTemplateQuestion = async (
    index: number,
    direction: "up" | "down",
  ) => {
    if (!templateStage) return;
    const newOrder = [...templateQuestions];
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= newOrder.length) return;
    [newOrder[index], newOrder[swap]] = [newOrder[swap], newOrder[index]];
    try {
      await interviewStagesService.reorderQuestions(
        templateStage.id,
        newOrder.map((x) => x.id),
      );
      setTemplateQuestions(newOrder);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to reorder",
        variant: "destructive",
      });
    }
  };

  const handleApprovePosition = async () => {
    if (!selectedInterview) return;

    try {
      setSaving(true);

      // Update interview status to completed
      await interviewsService.updateStatus(
        selectedInterview.id,
        "completed",
        JSON.stringify({
          decision: "approved",
          completedAt: new Date().toISOString(),
        }),
        undefined,
      );

      // Update candidate status to 'offer' or 'hired'
      await candidatesService.updateStatus(
        selectedInterview.candidate_id,
        "offer",
      );

      toast({
        title: "Success",
        description: "Candidate approved for position",
        variant: "success",
      });

      setIsStartInterviewModalOpen(false);
      setShowApproveConfirm(false);
      setSelectedInterview(null);
      setInterviewStartTime(null);
      setElapsedTime(0);
      fetchData();
    } catch (error: any) {
      console.error("Error approving position:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve position",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDenyPosition = async () => {
    if (!selectedInterview) return;

    try {
      setSaving(true);

      // Update interview status to completed
      await interviewsService.updateStatus(
        selectedInterview.id,
        "completed",
        JSON.stringify({
          decision: "denied",
          completedAt: new Date().toISOString(),
        }),
        undefined,
      );

      // Update candidate status to 'rejected'
      await candidatesService.updateStatus(
        selectedInterview.candidate_id,
        "rejected",
      );

      toast({
        title: "Success",
        description: "Candidate denied for position",
        variant: "success",
      });

      setIsStartInterviewModalOpen(false);
      setShowDenyConfirm(false);
      setSelectedInterview(null);
      setInterviewStartTime(null);
      setElapsedTime(0);
      fetchData();
    } catch (error: any) {
      console.error("Error denying position:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to deny position",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInterview = async () => {
    if (!selectedInterview) return;

    try {
      setSaving(true);

      // Calculate final elapsed time
      const finalElapsedTime = elapsedTime;
      const interviewDuration = formatTime(finalElapsedTime);

      // Combine all feedback into a structured JSON object (legacy + template responses)
      const feedbackData = {
        ...interviewFormData,
        templateResponses: templateResponses,
        elapsedTime: finalElapsedTime,
        interviewDuration: interviewDuration,
        completedAt: new Date().toISOString(),
      };

      // Save interview feedback
      await interviewsService.updateStatus(
        selectedInterview.id,
        "completed",
        JSON.stringify(feedbackData),
        interviewFormData.rating || undefined,
      );

      // Update candidate notes with interview information
      try {
        const fullCandidate = await candidatesService.getById(
          selectedInterview.candidate_id,
        );
        if (fullCandidate) {
          const interviewDate = new Date(
            `${selectedInterview.scheduled_date}T${selectedInterview.scheduled_time}`,
          ).toLocaleDateString();
          const stageName = getStageDisplayName(
            selectedInterview.interview_stage,
          );

          let templateSection = "";
          if (
            stageQuestions.length > 0 &&
            Object.keys(templateResponses).length > 0
          ) {
            const parts = stageQuestions
              .map((q) => {
                const v = templateResponses[q.id];
                const text =
                  typeof v === "string"
                    ? v
                    : typeof v === "object" &&
                        v !== null &&
                        (v as { checked: boolean }).checked
                      ? (v as { notes: string }).notes
                      : "";
                return text ? `${q.label}:\n${text}` : "";
              })
              .filter(Boolean);
            templateSection =
              parts.join("\n\n") + (parts.length > 0 ? "\n\n" : "");
          }
          const legacySection =
            stageQuestions.length === 0
              ? selectedInterview.interview_stage === "initial_culture"
                ? `
Getting to Know Candidate:
${interviewFormData.gettingToKnowNotes || "N/A"}

${interviewFormData.whyApplyingChecked ? `Why applying to AMP:\n${interviewFormData.whyApplyingNotes || "N/A"}\n\n` : ""}
${interviewFormData.loveJobChecked ? `What they love about their job:\n${interviewFormData.loveJobNotes || "N/A"}\n\n` : ""}
${interviewFormData.notLoveJobChecked ? `What they don't love about their job:\n${interviewFormData.notLoveJobNotes || "N/A"}\n\n` : ""}
Cultural Fit:
${interviewFormData.fitCultureNotes || "N/A"}
`
                : selectedInterview.interview_stage === "technical"
                  ? `
Work Experience:
${interviewFormData.workExperienceNotes || "N/A"}

Reaction to Situations:
${interviewFormData.reactSituationsNotes || "N/A"}
`
                  : ""
              : "";
          const interviewSummary = `
=== ${stageName} - ${interviewDate} ===
Duration: ${interviewDuration}
Type: ${selectedInterview.interview_type}
Rating: ${interviewFormData.rating || "N/A"}/5

${templateSection}${legacySection}

Overall Feedback:
${interviewFormData.overallFeedback || "N/A"}
---
`;

          const updatedNotes = fullCandidate.notes
            ? `${fullCandidate.notes}\n\n${interviewSummary}`
            : interviewSummary;

          // Update notes
          await candidatesService.update(selectedInterview.candidate_id, {
            notes: updatedNotes,
          });

          // Update last_contact_date by updating status (which also updates last_contact_date)
          await candidatesService.updateStatus(
            selectedInterview.candidate_id,
            fullCandidate.status,
          );
        }
      } catch (error) {
        console.error("Error updating candidate notes:", error);
        // Don't fail the whole operation if candidate update fails
      }

      toast({
        title: "Success",
        description:
          "Interview feedback saved successfully and added to candidate notes",
        variant: "success",
      });

      setIsStartInterviewModalOpen(false);
      setSelectedInterview(null);
      setInterviewStartTime(null);
      setElapsedTime(0);
      fetchData();
    } catch (error: any) {
      console.error("Error saving interview:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save interview feedback",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getInterviewTypeIcon = (type: Interview["interview_type"]) => {
    switch (type) {
      case "video":
        return <Video className="h-4 w-4" />;
      case "phone":
        return <Phone className="h-4 w-4" />;
      case "in-person":
        return <MapPin className="h-4 w-4" />;
      case "panel":
        return <Users className="h-4 w-4" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: Interview["status"]) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "no-show":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "rescheduled":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default:
        return "bg-neutral-100 text-neutral-800";
    }
  };

  const upcomingInterviews = interviews
    .filter((i) => {
      const interviewDate = new Date(`${i.scheduled_date}T${i.scheduled_time}`);
      return interviewDate >= new Date() && i.status === "scheduled";
    })
    .slice(0, 5);

  const filteredInterviews = interviews.filter((i) => {
    const interviewDate = new Date(`${i.scheduled_date}T${i.scheduled_time}`);
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);
    return interviewDate >= startOfDay && interviewDate <= endOfDay;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            Interview Scheduling
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setViewMode(viewMode === "list" ? "calendar" : "list")
            }
            leftIcon={
              viewMode === "list" ? (
                <Calendar className="mr-2 h-4 w-4" />
              ) : (
                <List className="mr-2 h-4 w-4" />
              )
            }
          >
            {viewMode === "list" ? "Calendar View" : "List View"}
          </Button>
          <Button
            className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            leftIcon={<Plus className="mr-2 h-4 w-4" />}
            onClick={() => {
              resetForm();
              setIsCreateModalOpen(true);
            }}
          >
            Schedule Interview
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Scheduled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {interviews.filter((i) => i.status === "scheduled").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {interviews.filter((i) => i.status === "completed").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {filteredInterviews.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {upcomingInterviews.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Interviews */}
      {upcomingInterviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Interviews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingInterviews.map((interview) => {
                const interviewDateTime = new Date(
                  `${interview.scheduled_date}T${interview.scheduled_time}`,
                );
                const candidate =
                  interview.candidate ||
                  candidates.find((c) => c.id === interview.candidate_id);
                return (
                  <div
                    key={interview.id}
                    className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-dark-100"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        {getInterviewTypeIcon(interview.interview_type)}
                        <span className="text-sm font-medium text-neutral-900 dark:text-white">
                          {candidate
                            ? `${candidate.first_name} ${candidate.last_name}`
                            : "Unknown Candidate"}
                        </span>
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        {interviewDateTime.toLocaleDateString()} at{" "}
                        {interviewDateTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        {interview.duration_minutes} min
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(interview.status)}`}
                      >
                        {interview.status.charAt(0).toUpperCase() +
                          interview.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {interview.status === "scheduled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openStartInterviewModal(interview)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Start Interview
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openViewModal(interview)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(interview)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interviews List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Interviews</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={selectedDate.toISOString().split("T")[0]}
                onChange={(e) => setSelectedDate(new Date(e.target.value))}
                className="w-auto"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <LoadingSpinner size="md" />
            </div>
          ) : filteredInterviews.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
                No interviews found
              </h3>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {selectedDate.toDateString() === new Date().toDateString()
                  ? "No interviews scheduled for today"
                  : `No interviews scheduled for ${selectedDate.toLocaleDateString()}`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInterviews.map((interview) => {
                const interviewDateTime = new Date(
                  `${interview.scheduled_date}T${interview.scheduled_time}`,
                );
                const candidate =
                  interview.candidate ||
                  candidates.find((c) => c.id === interview.candidate_id);
                return (
                  <div
                    key={interview.id}
                    className="flex items-center justify-between p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-dark-100"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        {getInterviewTypeIcon(interview.interview_type)}
                        <div>
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {candidate
                              ? `${candidate.first_name} ${candidate.last_name}`
                              : "Unknown Candidate"}
                          </div>
                          <div className="text-sm text-neutral-600 dark:text-neutral-400">
                            {candidate?.position_applied}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        <div>{interviewDateTime.toLocaleDateString()}</div>
                        <div>
                          {interviewDateTime.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        {interview.duration_minutes} minutes
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        {getStageDisplayName(interview.interview_stage)}
                      </div>
                      {interview.location && (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                          <MapPin className="h-4 w-4 inline mr-1" />
                          {interview.location}
                        </div>
                      )}
                      {interview.video_link && (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                          <Video className="h-4 w-4 inline mr-1" />
                          <a
                            href={interview.video_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#f26722] hover:underline"
                          >
                            Join Meeting
                          </a>
                        </div>
                      )}
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(interview.status)}`}
                      >
                        {interview.status.charAt(0).toUpperCase() +
                          interview.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {interview.status === "scheduled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openStartInterviewModal(interview)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Start Interview
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openViewModal(interview)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(interview)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(interview.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
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
            setSelectedInterview(null);
            resetForm();
            if (candidateIdFromUrl) {
              navigate("/hr/recruiting/interview-scheduling", {
                replace: true,
              });
            }
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditModalOpen ? "Edit Interview" : "Schedule Interview"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select
              label="Candidate *"
              name="candidate_id"
              value={formData.candidate_id}
              onChange={handleInputChange}
              error={formErrors.candidate_id}
              options={candidates.map((c) => ({
                value: c.id,
                label: `${c.first_name} ${c.last_name} - ${c.position_applied}`,
              }))}
              required
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Interview Type *"
                name="interview_type"
                value={formData.interview_type}
                onChange={handleInputChange}
                options={[
                  { value: "phone", label: "Phone" },
                  { value: "video", label: "Video" },
                  { value: "in-person", label: "In-Person" },
                  { value: "panel", label: "Panel" },
                ]}
                required
              />
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Interview Stage *
                  </label>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openManageTemplatesModal}
                    >
                      <ListChecks className="h-4 w-4 mr-1" />
                      Edit stage questions
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openCreateStageModal}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      New stage
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                  Premade questions for the selected stage are shown when you
                  conduct the interview.
                </p>
                <Select
                  name="interview_stage"
                  value={formData.interview_stage}
                  onChange={handleInputChange}
                  options={
                    stages.length > 0
                      ? stages.map((s) => ({ value: s.slug, label: s.name }))
                      : [
                          {
                            value: "initial_culture",
                            label: "Initial/Culture Interview",
                          },
                          { value: "technical", label: "Technical Interview" },
                          { value: "final", label: "Final Interview" },
                        ]
                  }
                  required
                />
              </div>
            </div>
            <Input
              label="Duration (minutes) *"
              name="duration_minutes"
              type="number"
              value={formData.duration_minutes.toString()}
              onChange={handleInputChange}
              required
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Date *"
                name="scheduled_date"
                type="date"
                value={formData.scheduled_date}
                onChange={handleInputChange}
                error={formErrors.scheduled_date}
                required
              />
              <Input
                label="Time *"
                name="scheduled_time"
                type="time"
                value={formData.scheduled_time}
                onChange={handleInputChange}
                error={formErrors.scheduled_time}
                required
              />
            </div>
            {formData.interview_type === "in-person" && (
              <Input
                label="Location *"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                error={formErrors.location}
                required
              />
            )}
            {formData.interview_type === "video" && (
              <Input
                label="Video Link *"
                name="video_link"
                type="url"
                value={formData.video_link}
                onChange={handleInputChange}
                error={formErrors.video_link}
                placeholder="https://meet.google.com/..."
                required
              />
            )}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Interviewers *{" "}
                {formErrors.interviewer_ids && (
                  <span className="text-red-600 text-xs ml-2">
                    {formErrors.interviewer_ids}
                  </span>
                )}
              </label>
              <div className="border border-neutral-300 dark:border-neutral-600 rounded-md p-3 max-h-40 overflow-y-auto">
                {users.length === 0 ? (
                  <div className="flex justify-center py-4">
                    <LoadingSpinner size="md" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {users.map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.interviewer_ids.includes(user.id)}
                          onChange={() => handleInterviewerToggle(user.id)}
                          className="h-4 w-4 rounded border-neutral-300"
                        />
                        <span className="text-sm text-neutral-900 dark:text-white">
                          {user.user_metadata?.name || user.email}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <Textarea
              label="Notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false);
                setIsEditModalOpen(false);
                setSelectedInterview(null);
                resetForm();
                if (candidateIdFromUrl) {
                  navigate("/hr/recruiting/interview-scheduling", {
                    replace: true,
                  });
                }
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={isEditModalOpen ? handleEdit : handleCreate}
              disabled={saving}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              {saving
                ? "Saving..."
                : isEditModalOpen
                  ? "Update Interview"
                  : "Schedule Interview"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create new stage (from Schedule/Edit Interview modal) */}
      <Dialog
        open={showCreateStageModal}
        onOpenChange={setShowCreateStageModal}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create new stage</DialogTitle>
            <DialogDescription>
              Add a stage to use when scheduling interviews. You can set the
              default duration and mark it as a final stage (approve/deny only).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Stage name"
              value={newStageForm.name}
              onChange={(e) => {
                const name = e.target.value;
                setNewStageForm((prev) => ({
                  ...prev,
                  name,
                  slug: prev.slug || slugFromName(name),
                }));
              }}
              placeholder="e.g. Phone screen"
            />
            <Input
              label="Slug (optional)"
              value={newStageForm.slug}
              onChange={(e) =>
                setNewStageForm((prev) => ({ ...prev, slug: e.target.value }))
              }
              placeholder="e.g. phone_screen"
            />
            <Input
              label="Default duration (minutes)"
              type="number"
              value={newStageForm.default_duration_minutes?.toString() ?? "60"}
              onChange={(e) =>
                setNewStageForm((prev) => ({
                  ...prev,
                  default_duration_minutes: parseInt(e.target.value, 10) || 60,
                }))
              }
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newStageForm.is_final_stage ?? false}
                onChange={(e) =>
                  setNewStageForm((prev) => ({
                    ...prev,
                    is_final_stage: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-neutral-300"
              />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Final stage (approve/deny only)
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateStageModal(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateStage} disabled={creatingStage}>
              {creatingStage ? "Creating..." : "Create stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage question templates (premade questions per stage — used when conducting interview) */}
      <Dialog
        open={showManageTemplatesModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowManageTemplatesModal(false);
            backToStageList();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {templateStage
                ? `Questions for ${templateStage.name}`
                : "Manage question templates"}
            </DialogTitle>
            <DialogDescription>
              {templateStage
                ? "These premade questions are shown when you conduct an interview at this stage. Add, edit, or reorder them."
                : "Select a stage to edit its premade questions. Those questions appear when you start an interview for that stage."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {!templateStage ? (
              <ul className="space-y-2">
                {stages.length === 0 ? (
                  <p className="text-neutral-500 text-sm">
                    No stages yet. Create one with &quot;New stage&quot; first.
                  </p>
                ) : (
                  stages.map((stage) => (
                    <li
                      key={stage.id}
                      className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-700 rounded-md"
                    >
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {stage.name}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openStageQuestions(stage)}
                      >
                        Edit questions
                      </Button>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <Button variant="outline" size="sm" onClick={backToStageList}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back to stages
                  </Button>
                  <Button variant="outline" size="sm" onClick={openAddQuestion}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add question
                  </Button>
                </div>
                {templateQuestions.length === 0 ? (
                  <p className="text-neutral-500 text-sm">
                    No questions yet. Add questions to show when conducting an
                    interview at this stage.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {templateQuestions.map((q, index) => (
                      <li
                        key={q.id}
                        className="flex items-center gap-2 p-3 border border-neutral-200 dark:border-neutral-700 rounded-md"
                      >
                        <div className="flex flex-col gap-0">
                          <button
                            type="button"
                            onClick={() => moveTemplateQuestion(index, "up")}
                            disabled={index === 0}
                            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTemplateQuestion(index, "down")}
                            disabled={index === templateQuestions.length - 1}
                            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-neutral-900 dark:text-white">
                            {q.label}
                          </span>
                          <span className="ml-2 text-xs text-neutral-500">
                            {q.question_type}
                            {q.required ? " · Required" : ""}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditQuestion(q)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteQuestion(q)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit question for template */}
      <Dialog
        open={showQuestionFormModal}
        onOpenChange={setShowQuestionFormModal}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? "Edit question" : "Add question"}
            </DialogTitle>
            <DialogDescription>
              Text = one notes field. Checkbox = optional checkbox with notes
              when checked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Question / prompt"
              value={questionForm.label}
              onChange={(e) =>
                setQuestionForm((prev) => ({ ...prev, label: e.target.value }))
              }
              placeholder="e.g. Getting to know candidate"
            />
            <Select
              label="Type"
              name="question_type"
              value={questionForm.question_type}
              onChange={(e) =>
                setQuestionForm((prev) => ({
                  ...prev,
                  question_type: e.target.value as "text" | "checkbox",
                }))
              }
              options={[
                { value: "text", label: "Text (notes field)" },
                {
                  value: "checkbox",
                  label: "Checkbox (with notes when checked)",
                },
              ]}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={questionForm.required ?? false}
                onChange={(e) =>
                  setQuestionForm((prev) => ({
                    ...prev,
                    required: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-neutral-300"
              />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Required
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowQuestionFormModal(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveQuestion} disabled={savingQuestion}>
              {savingQuestion ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedInterview && selectedInterview.candidate
                ? `Interview with ${selectedInterview.candidate.first_name} ${selectedInterview.candidate.last_name}`
                : "Interview Details"}
            </DialogTitle>
          </DialogHeader>
          {selectedInterview && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Date & Time
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {new Date(
                      `${selectedInterview.scheduled_date}T${selectedInterview.scheduled_time}`,
                    ).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Duration
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {selectedInterview.duration_minutes} minutes
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Type
                  </label>
                  <p className="text-neutral-900 dark:text-white capitalize">
                    {selectedInterview.interview_type}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Stage
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {getStageDisplayName(selectedInterview.interview_stage)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Status
                  </label>
                  <p className="text-neutral-900 dark:text-white capitalize">
                    {selectedInterview.status}
                  </p>
                </div>
                {selectedInterview.location && (
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      Location
                    </label>
                    <p className="text-neutral-900 dark:text-white">
                      {selectedInterview.location}
                    </p>
                  </div>
                )}
                {selectedInterview.video_link && (
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      Video Link
                    </label>
                    <p className="text-neutral-900 dark:text-white">
                      <a
                        href={selectedInterview.video_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#f26722] hover:underline"
                      >
                        {selectedInterview.video_link}
                      </a>
                    </p>
                  </div>
                )}
              </div>
              {selectedInterview.notes && (
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Notes
                  </label>
                  <p className="text-neutral-900 dark:text-white whitespace-pre-wrap">
                    {selectedInterview.notes}
                  </p>
                </div>
              )}
              {selectedInterview.feedback && (
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Feedback
                  </label>
                  <div className="text-neutral-900 dark:text-white whitespace-pre-wrap">
                    {(() => {
                      try {
                        const feedbackData = JSON.parse(
                          selectedInterview.feedback,
                        );
                        // If it's structured feedback, display it nicely
                        if (
                          typeof feedbackData === "object" &&
                          feedbackData !== null
                        ) {
                          const templateResponsesData =
                            feedbackData.templateResponses;
                          const questionLabels = new Map(
                            viewModalStageQuestions.map((q) => [q.id, q.label]),
                          );
                          return (
                            <div className="space-y-4">
                              {templateResponsesData &&
                                typeof templateResponsesData === "object" &&
                                Object.keys(templateResponsesData).length >
                                  0 && (
                                  <>
                                    {Object.entries(templateResponsesData).map(
                                      ([questionId, value]) => {
                                        const label =
                                          questionLabels.get(questionId) ||
                                          questionId;
                                        if (
                                          typeof value === "string" &&
                                          value
                                        ) {
                                          return (
                                            <div key={questionId}>
                                              <strong>{label}:</strong>
                                              <p className="mt-1">{value}</p>
                                            </div>
                                          );
                                        }
                                        if (
                                          typeof value === "object" &&
                                          value !== null &&
                                          (value as { checked: boolean })
                                            .checked &&
                                          (value as { notes: string }).notes
                                        ) {
                                          return (
                                            <div key={questionId}>
                                              <strong>{label}:</strong>
                                              <p className="mt-1">
                                                {
                                                  (value as { notes: string })
                                                    .notes
                                                }
                                              </p>
                                            </div>
                                          );
                                        }
                                        return null;
                                      },
                                    )}
                                  </>
                                )}
                              {feedbackData.overallFeedback && (
                                <div>
                                  <strong>Overall Feedback:</strong>
                                  <p className="mt-1">
                                    {feedbackData.overallFeedback}
                                  </p>
                                </div>
                              )}
                              {!templateResponsesData &&
                                selectedInterview.interview_stage ===
                                  "initial_culture" && (
                                  <>
                                    {feedbackData.gettingToKnowNotes && (
                                      <div>
                                        <strong>
                                          Getting to Know Candidate:
                                        </strong>
                                        <p className="mt-1">
                                          {feedbackData.gettingToKnowNotes}
                                        </p>
                                      </div>
                                    )}
                                    {feedbackData.fitCultureNotes && (
                                      <div>
                                        <strong>Cultural Fit:</strong>
                                        <p className="mt-1">
                                          {feedbackData.fitCultureNotes}
                                        </p>
                                      </div>
                                    )}
                                    {feedbackData.whyApplyingChecked &&
                                      feedbackData.whyApplyingNotes && (
                                        <div>
                                          <strong>Why applying to AMP:</strong>
                                          <p className="mt-1">
                                            {feedbackData.whyApplyingNotes}
                                          </p>
                                        </div>
                                      )}
                                    {feedbackData.loveJobChecked &&
                                      feedbackData.loveJobNotes && (
                                        <div>
                                          <strong>
                                            What they love about their job:
                                          </strong>
                                          <p className="mt-1">
                                            {feedbackData.loveJobNotes}
                                          </p>
                                        </div>
                                      )}
                                    {feedbackData.notLoveJobChecked &&
                                      feedbackData.notLoveJobNotes && (
                                        <div>
                                          <strong>
                                            What they don't love about their
                                            job:
                                          </strong>
                                          <p className="mt-1">
                                            {feedbackData.notLoveJobNotes}
                                          </p>
                                        </div>
                                      )}
                                  </>
                                )}
                              {!templateResponsesData &&
                                selectedInterview.interview_stage ===
                                  "technical" && (
                                  <>
                                    {feedbackData.workExperienceNotes && (
                                      <div>
                                        <strong>Work Experience:</strong>
                                        <p className="mt-1">
                                          {feedbackData.workExperienceNotes}
                                        </p>
                                      </div>
                                    )}
                                    {feedbackData.reactSituationsNotes && (
                                      <div>
                                        <strong>Reaction to Situations:</strong>
                                        <p className="mt-1">
                                          {feedbackData.reactSituationsNotes}
                                        </p>
                                      </div>
                                    )}
                                  </>
                                )}
                            </div>
                          );
                        }
                        return selectedInterview.feedback;
                      } catch {
                        // If not JSON, display as plain text
                        return selectedInterview.feedback;
                      }
                    })()}
                  </div>
                </div>
              )}
              {selectedInterview.rating && (
                <div>
                  <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Rating
                  </label>
                  <p className="text-neutral-900 dark:text-white">
                    {selectedInterview.rating}/5
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
            {selectedInterview && (
              <Button
                onClick={() => {
                  setIsViewModalOpen(false);
                  openEditModal(selectedInterview);
                }}
                className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Interview Modal */}
      <Dialog
        open={isStartInterviewModalOpen}
        onOpenChange={setIsStartInterviewModalOpen}
      >
        <DialogContent className="w-[75vw] max-w-[75vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <DialogTitle>
                  {selectedInterview && selectedInterview.candidate
                    ? `Interview: ${selectedInterview.candidate.first_name} ${selectedInterview.candidate.last_name} - ${getStageDisplayName(
                        selectedInterview.interview_stage,
                      )}`
                    : "Start Interview"}
                </DialogTitle>
                <DialogDescription>
                  Conduct the interview and record feedback
                </DialogDescription>
              </div>
              {selectedInterview &&
                !getStageIsFinal(selectedInterview.interview_stage) && (
                  <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-lg">
                    <Timer className="h-5 w-5 text-[#f26722]" />
                    <span className="text-lg font-mono font-semibold text-neutral-900 dark:text-white">
                      {formatTime(elapsedTime)}
                    </span>
                  </div>
                )}
            </div>
          </DialogHeader>
          {selectedInterview && (
            <div className="space-y-6 py-4">
              {/* Template-driven form (when stage has a question template) */}
              {!getStageIsFinal(selectedInterview.interview_stage) &&
                stageQuestions.length > 0 && (
                  <div className="space-y-4">
                    {stageQuestions.map((q) => (
                      <div key={q.id}>
                        {q.question_type === "text" ? (
                          <>
                            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                              {q.label}
                            </label>
                            <Textarea
                              value={
                                typeof templateResponses[q.id] === "string"
                                  ? (templateResponses[q.id] as string)
                                  : ""
                              }
                              onChange={(e) =>
                                handleTemplateResponseChange(
                                  q.id,
                                  "text",
                                  e.target.value,
                                )
                              }
                              rows={3}
                              placeholder={`Notes for ${q.label}...`}
                            />
                          </>
                        ) : (
                          <div className="mb-4">
                            <label className="flex items-center gap-2 mb-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  typeof templateResponses[q.id] === "object" &&
                                  templateResponses[q.id] !== null &&
                                  (
                                    templateResponses[q.id] as {
                                      checked: boolean;
                                    }
                                  ).checked
                                }
                                onChange={(e) => {
                                  const cur = templateResponses[q.id];
                                  const checked = e.target.checked;
                                  const prev =
                                    typeof cur === "object" && cur !== null
                                      ? cur
                                      : { checked: false, notes: "" };
                                  handleTemplateResponseChange(
                                    q.id,
                                    "checkbox",
                                    { ...prev, checked },
                                  );
                                }}
                                className="h-4 w-4 rounded border-neutral-300"
                              />
                              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                {q.label}
                              </span>
                            </label>
                            {typeof templateResponses[q.id] === "object" &&
                              templateResponses[q.id] !== null &&
                              (templateResponses[q.id] as { checked: boolean })
                                .checked && (
                                <Textarea
                                  value={
                                    typeof templateResponses[q.id] ===
                                      "object" &&
                                    templateResponses[q.id] !== null
                                      ? (
                                          templateResponses[q.id] as {
                                            notes: string;
                                          }
                                        ).notes
                                      : ""
                                  }
                                  onChange={(e) => {
                                    const cur = templateResponses[q.id];
                                    const prev =
                                      typeof cur === "object" && cur !== null
                                        ? cur
                                        : { checked: false, notes: "" };
                                    handleTemplateResponseChange(
                                      q.id,
                                      "checkbox",
                                      { ...prev, notes: e.target.value },
                                    );
                                  }}
                                  rows={3}
                                  placeholder="Notes..."
                                  className="mt-2"
                                />
                              )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              {/* Legacy form (when no template questions for this stage) */}
              {!getStageIsFinal(selectedInterview.interview_stage) &&
                stageQuestions.length === 0 && (
                  <>
                    {selectedInterview.interview_stage ===
                      "initial_culture" && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                            Getting to know candidate
                          </label>
                          <Textarea
                            name="gettingToKnowNotes"
                            value={interviewFormData.gettingToKnowNotes}
                            onChange={(e) =>
                              handleInterviewFormChange(
                                "gettingToKnowNotes",
                                e.target.value,
                              )
                            }
                            rows={4}
                            placeholder="Notes..."
                          />
                        </div>
                        <div className="border-t pt-4">
                          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
                            General Questions
                          </h3>
                          <div className="mb-4">
                            <label className="flex items-center gap-2 mb-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={interviewFormData.whyApplyingChecked}
                                onChange={(e) =>
                                  handleInterviewFormChange(
                                    "whyApplyingChecked",
                                    e.target.checked,
                                  )
                                }
                                className="h-4 w-4 rounded border-neutral-300"
                              />
                              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Why are they applying to AMP?
                              </span>
                            </label>
                            {interviewFormData.whyApplyingChecked && (
                              <Textarea
                                name="whyApplyingNotes"
                                value={interviewFormData.whyApplyingNotes}
                                onChange={(e) =>
                                  handleInterviewFormChange(
                                    "whyApplyingNotes",
                                    e.target.value,
                                  )
                                }
                                rows={3}
                                className="mt-2"
                              />
                            )}
                          </div>
                          <div className="mb-4">
                            <label className="flex items-center gap-2 mb-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={interviewFormData.loveJobChecked}
                                onChange={(e) =>
                                  handleInterviewFormChange(
                                    "loveJobChecked",
                                    e.target.checked,
                                  )
                                }
                                className="h-4 w-4 rounded border-neutral-300"
                              />
                              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                What do they love about their job?
                              </span>
                            </label>
                            {interviewFormData.loveJobChecked && (
                              <Textarea
                                name="loveJobNotes"
                                value={interviewFormData.loveJobNotes}
                                onChange={(e) =>
                                  handleInterviewFormChange(
                                    "loveJobNotes",
                                    e.target.value,
                                  )
                                }
                                rows={3}
                                className="mt-2"
                              />
                            )}
                          </div>
                          <div className="mb-4">
                            <label className="flex items-center gap-2 mb-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={interviewFormData.notLoveJobChecked}
                                onChange={(e) =>
                                  handleInterviewFormChange(
                                    "notLoveJobChecked",
                                    e.target.checked,
                                  )
                                }
                                className="h-4 w-4 rounded border-neutral-300"
                              />
                              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                What do they not love about their job?
                              </span>
                            </label>
                            {interviewFormData.notLoveJobChecked && (
                              <Textarea
                                name="notLoveJobNotes"
                                value={interviewFormData.notLoveJobNotes}
                                onChange={(e) =>
                                  handleInterviewFormChange(
                                    "notLoveJobNotes",
                                    e.target.value,
                                  )
                                }
                                rows={3}
                                className="mt-2"
                              />
                            )}
                          </div>
                        </div>
                        <div className="border-t pt-4">
                          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                            Do they fit and can they get excited about the
                            culture?
                          </label>
                          <Textarea
                            name="fitCultureNotes"
                            value={interviewFormData.fitCultureNotes}
                            onChange={(e) =>
                              handleInterviewFormChange(
                                "fitCultureNotes",
                                e.target.value,
                              )
                            }
                            rows={4}
                          />
                        </div>
                      </>
                    )}
                    {selectedInterview.interview_stage === "technical" && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                            Focus on work experience
                          </label>
                          <Textarea
                            name="workExperienceNotes"
                            value={interviewFormData.workExperienceNotes}
                            onChange={(e) =>
                              handleInterviewFormChange(
                                "workExperienceNotes",
                                e.target.value,
                              )
                            }
                            rows={6}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                            How do they react in situations?
                          </label>
                          <Textarea
                            name="reactSituationsNotes"
                            value={interviewFormData.reactSituationsNotes}
                            onChange={(e) =>
                              handleInterviewFormChange(
                                "reactSituationsNotes",
                                e.target.value,
                              )
                            }
                            rows={6}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

              {/* Final stage - Approve/Deny only */}
              {getStageIsFinal(selectedInterview.interview_stage) && (
                <div className="text-center py-12 space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
                      Final Interview Decision
                    </h3>
                    <p className="text-neutral-600 dark:text-neutral-400">
                      Review the candidate's interview history and make a final
                      decision.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      onClick={() => setShowApproveConfirm(true)}
                      className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg"
                      size="lg"
                    >
                      <Check className="mr-2 h-5 w-5" />
                      Approve Position
                    </Button>
                    <Button
                      onClick={() => setShowDenyConfirm(true)}
                      variant="outline"
                      className="border-red-600 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 px-8 py-6 text-lg"
                      size="lg"
                    >
                      <X className="mr-2 h-5 w-5" />
                      Deny Position
                    </Button>
                  </div>
                </div>
              )}

              {/* Overall Feedback and Rating (non-final stages only) */}
              {!getStageIsFinal(selectedInterview.interview_stage) && (
                <div className="border-t pt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Overall Feedback
                    </label>
                    <Textarea
                      name="overallFeedback"
                      value={interviewFormData.overallFeedback}
                      onChange={(e) =>
                        handleInterviewFormChange(
                          "overallFeedback",
                          e.target.value,
                        )
                      }
                      rows={4}
                      placeholder="Overall interview feedback and observations..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Rating (1-5)
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          onClick={() =>
                            handleInterviewFormChange("rating", rating)
                          }
                          className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-semibold transition-colors ${
                            interviewFormData.rating === rating
                              ? "bg-[#f26722] border-[#f26722] text-white"
                              : "border-neutral-300 text-neutral-700 dark:text-neutral-300 hover:border-[#f26722]"
                          }`}
                        >
                          {rating}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsStartInterviewModalOpen(false);
                setSelectedInterview(null);
                setInterviewStartTime(null);
                setElapsedTime(0);
              }}
            >
              Cancel
            </Button>
            {selectedInterview &&
              !getStageIsFinal(selectedInterview.interview_stage) && (
                <Button
                  onClick={handleSaveInterview}
                  disabled={saving}
                  className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                >
                  {saving ? "Saving..." : "Complete Interview"}
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Position Confirmation */}
      <Dialog open={showApproveConfirm} onOpenChange={setShowApproveConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Position</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve{" "}
              {selectedInterview?.candidate
                ? `${selectedInterview.candidate.first_name} ${selectedInterview.candidate.last_name}`
                : "this candidate"}{" "}
              for the position?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApproveConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprovePosition}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {saving ? "Processing..." : "Yes, Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deny Position Confirmation */}
      <Dialog open={showDenyConfirm} onOpenChange={setShowDenyConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny Position</DialogTitle>
            <DialogDescription>
              Are you sure you want to deny{" "}
              {selectedInterview?.candidate
                ? `${selectedInterview.candidate.first_name} ${selectedInterview.candidate.last_name}`
                : "this candidate"}{" "}
              for the position? This will mark the candidate as rejected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDenyConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDenyPosition}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? "Processing..." : "Yes, Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
