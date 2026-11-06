import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Search,
  Filter,
  User,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Calendar,
  FileText,
  TrendingUp,
  Users,
  Plus,
  Edit,
  Eye,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Video,
  Phone as PhoneIcon,
  User as UserIcon,
  MapPin as MapPinIcon,
  Upload,
  X,
  Link2,
  ArrowRightLeft,
  Loader2,
  CheckCircle2,
  UserPlus,
} from "lucide-react";
import {
  candidatesService,
  Candidate,
  CreateCandidateInput,
} from "../../../services/hr/candidatesService";
import {
  applicationQuestionsService,
  CandidateQuestionAnswer,
} from "../../../services/hr/applicationQuestionsService";
import {
  interviewsService,
  Interview,
} from "../../../services/hr/interviewsService";
import { offersService } from "../../../services/hr/offersService";
import {
  jobRequisitionsService,
  JobRequisition,
} from "../../../services/hr/jobRequisitionsService";
import { eeoComplianceService } from "../../../services/hr/eeoComplianceService";
import { onboardingService } from "../../../services/hr/onboardingService";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { supabase } from "../../../lib/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { companyConfig, employeeEmailRegex } from "@/lib/companyConfig";

// Warm palette shared with the HR dashboard (src/pages/HrDashboard.tsx).
const CANVAS = "bg-[#F7F4F0] dark:bg-[#171614]";
const SURFACE = "bg-white dark:bg-dark-150";
const HAIRLINE = "border-[#E7E1DA] dark:border-white/10";
const DIVIDER = "border-[#F0EAE4] dark:border-white/[0.07]";
const INK = "text-[#23201D] dark:text-white";
const MUTED = "text-[#6E655D] dark:text-white/65";
const FAINT = "text-[#948B83] dark:text-white/45";
const SECONDARY_BTN = `inline-flex items-center gap-1.5 border px-3 py-1.5 text-[13px] font-semibold transition-colors ${HAIRLINE} ${SURFACE} text-[#3B352F] hover:bg-[#FCFAF8] dark:text-white dark:hover:bg-white/5`;
const FIELD = `rounded-none border text-sm ${HAIRLINE} ${SURFACE} focus:outline-none focus:ring-2 focus:ring-brand`;

// Thin colored edge per pipeline stage.
const STATUS_BAR: Record<string, string> = {
  new: "bg-brand",
  screening: "bg-amber-400",
  interview: "bg-sky-400",
  offer: "bg-lime-500",
  offer_sent: "bg-teal-400",
  offer_accepted: "bg-emerald-500",
  hired: "bg-emerald-500",
  rejected: "bg-[#C3BAB2] dark:bg-white/25",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

// "today", "yesterday", "3 days ago", else "Nov 3".
const friendlyDate = (value: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
};

export const CandidateTracking: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [candidateAnswers, setCandidateAnswers] = useState<
    CandidateQuestionAnswer[]
  >([]);
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(
    null,
  );
  const [candidateInterviews, setCandidateInterviews] = useState<Interview[]>(
    [],
  );
  const [loadingInterviews, setLoadingInterviews] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{
    resume: boolean;
    interviews: boolean;
    coverLetter: boolean;
  }>({
    resume: false,
    interviews: false,
    coverLetter: false,
  });
  const [formData, setFormData] = useState<CreateCandidateInput>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    location: "",
    position_applied: "",
    requisition_id: undefined,
    status: "new",
    source: "",
    resume_url: "",
    cover_letter: "",
    cover_letter_url: "",
    notes: "",
    eeo_gender: "",
    eeo_race: "",
    eeo_veteran: false,
    eeo_disability: false,
    fr_shirt_size: "",
    fr_pant_size: "",
    fr_jacket_size: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const [positions, setPositions] = useState<string[]>([]);
  const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
  const [offerStatusByCandidateId, setOfferStatusByCandidateId] = useState<
    Record<string, "offer_sent" | "offer_accepted">
  >({});
  const [assignUserSearch, setAssignUserSearch] = useState("");
  const [assignUserResults, setAssignUserResults] = useState<
    { id: string; email: string; name: string }[]
  >([]);
  const [assignUserLoading, setAssignUserLoading] = useState(false);
  const [linkingUser, setLinkingUser] = useState(false);
  const [transferringDocs, setTransferringDocs] = useState(false);
  const [sendingToOnboarding, setSendingToOnboarding] = useState<string | null>(
    null,
  );

  useEffect(() => {
    fetchCandidates();
    fetchRequisitions();
  }, []);

  // ?candidateId=… (from Talent Pool promotion) opens that candidate, even
  // when it is not in the loaded list.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkCandidateId = searchParams.get("candidateId");
  useEffect(() => {
    if (!deepLinkCandidateId || loading) return;
    let cancelled = false;
    const clearParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("candidateId");
      setSearchParams(next, { replace: true });
    };
    (async () => {
      let candidate = candidates.find((c) => c.id === deepLinkCandidateId);
      if (!candidate) {
        try {
          candidate = (await candidatesService.getById(deepLinkCandidateId)) ?? undefined;
        } catch {
          candidate = undefined;
        }
      }
      if (cancelled) return;
      clearParam();
      if (candidate) {
        openViewModal(candidate);
      } else {
        toast({
          title: "Candidate unavailable",
          description: "That candidate could not be opened.",
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkCandidateId, loading]);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      const data = await candidatesService.getAll();
      setCandidates(data);
      const offerCandidateIds = data
        .filter((c) => c.status === "offer")
        .map((c) => c.id);
      if (offerCandidateIds.length > 0) {
        const statusMap =
          await offersService.getOfferStatusForCandidates(offerCandidateIds);
        setOfferStatusByCandidateId(statusMap);
      } else {
        setOfferStatusByCandidateId({});
      }
    } catch (error: any) {
      console.error("Error fetching candidates:", error);
      toast({
        title: "Error",
        description: "Failed to load candidates. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRequisitions = async () => {
    try {
      const data = await jobRequisitionsService.getAll();
      setRequisitions(data || []);
    } catch (error) {
      console.error("Error fetching requisitions:", error);
      setRequisitions([]);
    }
  };

  useEffect(() => {
    if (candidates.length > 0) {
      const uniquePositions = Array.from(
        new Set(candidates.map((c) => c.position_applied)),
      );
      setPositions(uniquePositions);
    }
  }, [candidates]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    if (name === "requisition_id") {
      const selectedRequisition = requisitions.find((r) => r.id === value);
      setFormData((prev) => ({
        ...prev,
        requisition_id: value || undefined,
        position_applied: selectedRequisition
          ? selectedRequisition.title
          : prev.position_applied,
      }));
      if (formErrors[name]) {
        setFormErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
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

    if (!formData.first_name.trim()) {
      errors.first_name = "First name is required";
    }
    if (!formData.last_name.trim()) {
      errors.last_name = "Last name is required";
    }
    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Invalid email format";
    }
    if (!formData.position_applied.trim()) {
      errors.position_applied = "Position applied is required";
    }
    if (!formData.source.trim()) {
      errors.source = "Source is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    try {
      setSaving(true);
      let resumeUrl: string | undefined;
      let coverLetterUrl: string | undefined;

      // Upload resume file if provided
      if (resumeFile) {
        const fileExt = resumeFile.name.split(".").pop() || "pdf";
        const fileName = `manual/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(fileName, resumeFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Failed to upload resume: ${uploadError.message}`);
        }
        const {
          data: { publicUrl },
        } = supabase.storage.from("resumes").getPublicUrl(fileName);
        resumeUrl = publicUrl;
      }

      // Upload cover letter file if provided
      if (coverLetterFile) {
        const fileExt = coverLetterFile.name.split(".").pop() || "pdf";
        const fileName = `cover_letters/manual/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(fileName, coverLetterFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(
            `Failed to upload cover letter: ${uploadError.message}`,
          );
        }
        const {
          data: { publicUrl },
        } = supabase.storage.from("resumes").getPublicUrl(fileName);
        coverLetterUrl = publicUrl;
      }

      const {
        eeo_gender,
        eeo_race,
        eeo_veteran,
        eeo_disability,
        ...candidateFields
      } = formData;
      await candidatesService.create({
        ...candidateFields,
        requisition_id: candidateFields.requisition_id || undefined,
        resume_url: resumeUrl,
        cover_letter_url: coverLetterUrl,
      });

      // Save EEO data anonymously to compliance table
      if (eeo_gender || eeo_race || eeo_veteran || eeo_disability) {
        try {
          const matchedReq = requisitions.find(
            (r) => r.id === formData.requisition_id,
          );
          await eeoComplianceService.submit({
            requisition_id: formData.requisition_id || undefined,
            position_title: formData.position_applied || "Unknown",
            department: matchedReq?.department || undefined,
            gender: eeo_gender || undefined,
            race: eeo_race || undefined,
            veteran: eeo_veteran || false,
            disability: eeo_disability || false,
            candidate_status: formData.status || "new",
          });
        } catch (eeoErr) {
          console.error("EEO submission failed (non-blocking):", eeoErr);
        }
      }

      toast({
        title: "Success",
        description: "Candidate added successfully",
        variant: "success",
      });
      setIsCreateModalOpen(false);
      resetForm();
      fetchCandidates();
    } catch (error: any) {
      console.error("Error creating candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add candidate",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!validateForm() || !selectedCandidate) return;

    try {
      setSaving(true);
      let resumeUrl = formData.resume_url || selectedCandidate.resume_url;
      let coverLetterUrl =
        formData.cover_letter_url ?? selectedCandidate.cover_letter_url;

      // Upload new resume file if provided
      if (resumeFile) {
        const fileExt = resumeFile.name.split(".").pop() || "pdf";
        const fileName = `manual/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(fileName, resumeFile, {
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError)
          throw new Error(`Failed to upload resume: ${uploadError.message}`);
        const {
          data: { publicUrl },
        } = supabase.storage.from("resumes").getPublicUrl(fileName);
        resumeUrl = publicUrl;
      }

      // Upload new cover letter file if provided
      if (coverLetterFile) {
        const fileExt = coverLetterFile.name.split(".").pop() || "pdf";
        const fileName = `cover_letters/manual/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(fileName, coverLetterFile, {
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError)
          throw new Error(
            `Failed to upload cover letter: ${uploadError.message}`,
          );
        const {
          data: { publicUrl },
        } = supabase.storage.from("resumes").getPublicUrl(fileName);
        coverLetterUrl = publicUrl;
      }

      await candidatesService.update(selectedCandidate.id, {
        ...formData,
        requisition_id: formData.requisition_id || undefined,
        resume_url: resumeUrl || undefined,
        cover_letter_url: coverLetterUrl,
      });
      toast({
        title: "Success",
        description: "Candidate updated successfully",
        variant: "success",
      });
      setIsEditModalOpen(false);
      setSelectedCandidate(null);
      resetForm();
      fetchCandidates();
    } catch (error: any) {
      console.error("Error updating candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update candidate",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this candidate?")) return;

    try {
      await candidatesService.delete(id);
      toast({
        title: "Success",
        description: "Candidate deleted successfully",
        variant: "success",
      });
      fetchCandidates();
    } catch (error: any) {
      console.error("Error deleting candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete candidate",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (
    id: string,
    newStatus: Candidate["status"],
  ) => {
    try {
      await candidatesService.updateStatus(id, newStatus);
      toast({
        title: "Success",
        description: "Candidate status updated",
        variant: "success",
      });
      fetchCandidates();
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
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      location: "",
      position_applied: "",
      requisition_id: undefined,
      status: "new",
      source: "",
      resume_url: "",
      cover_letter: "",
      cover_letter_url: "",
      notes: "",
      eeo_gender: "",
      eeo_race: "",
      eeo_veteran: false,
      eeo_disability: false,
      fr_shirt_size: "",
      fr_pant_size: "",
      fr_jacket_size: "",
    });
    setFormErrors({});
    setResumeFile(null);
    setCoverLetterFile(null);
  };

  const openEditModal = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setFormData({
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      email: candidate.email,
      phone: candidate.phone || "",
      location: candidate.location || "",
      position_applied: candidate.position_applied,
      requisition_id: candidate.requisition_id,
      status: candidate.status,
      source: candidate.source,
      resume_url: candidate.resume_url || "",
      cover_letter: candidate.cover_letter || "",
      cover_letter_url: candidate.cover_letter_url || "",
      notes: candidate.notes || "",
      eeo_gender: candidate.eeo_gender || "",
      eeo_race: candidate.eeo_race || "",
      eeo_veteran: candidate.eeo_veteran || false,
      eeo_disability: candidate.eeo_disability || false,
      fr_shirt_size: candidate.fr_shirt_size || "",
      fr_pant_size: candidate.fr_pant_size || "",
      fr_jacket_size: candidate.fr_jacket_size || "",
      expected_compensation: candidate.expected_compensation || "",
    });
    setResumeFile(null);
    setCoverLetterFile(null);
    setIsEditModalOpen(true);
  };

  const openViewModal = async (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setIsViewModalOpen(true);
    setExpandedSections({
      resume: false,
      interviews: false,
      coverLetter: false,
    });

    // Fetch answers to the posting's custom application questions
    try {
      setLoadingAnswers(true);
      setCandidateAnswers(
        await applicationQuestionsService.getAnswersForCandidate(candidate.id),
      );
    } catch (error) {
      console.error("Error fetching application answers:", error);
      setCandidateAnswers([]);
    } finally {
      setLoadingAnswers(false);
    }

    // Fetch interviews for this candidate
    try {
      setLoadingInterviews(true);
      const interviews = await interviewsService.getByCandidateId(candidate.id);
      setCandidateInterviews(interviews);
    } catch (error) {
      console.error("Error fetching interviews:", error);
      setCandidateInterviews([]);
    } finally {
      setLoadingInterviews(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const searchAmpOSUsers = async (term: string) => {
    setAssignUserSearch(term);
    if (term.length < 2) {
      setAssignUserResults([]);
      return;
    }
    try {
      setAssignUserLoading(true);
      let rawUsers: any[] = [];
      const { data, error } = await supabase
        .schema("common")
        .rpc("admin_get_users");
      if (error) {
        const fallback = await supabase.rpc("admin_get_users");
        rawUsers = (fallback.data || []) as any[];
      } else {
        rawUsers = (data || []) as any[];
      }
      const users = rawUsers
        .filter((u: any) => {
          const email = (u.email || "").toLowerCase();
          const name = (
            u.raw_user_meta_data?.name ||
            u.user_metadata?.name ||
            ""
          ).toLowerCase();
          const search = term.toLowerCase();
          return (
            (email.includes(search) || name.includes(search)) &&
            employeeEmailRegex.test(email)
          );
        })
        .slice(0, 10)
        .map((u: any) => ({
          id: u.id,
          email: u.email || "",
          name:
            u.raw_user_meta_data?.name ||
            u.user_metadata?.name ||
            u.email?.split("@")[0] ||
            "Unknown",
        }));
      setAssignUserResults(users);
    } catch {
      setAssignUserResults([]);
    } finally {
      setAssignUserLoading(false);
    }
  };

  const handleLinkUser = async (userId: string, userEmail: string) => {
    if (!selectedCandidate) return;
    try {
      setLinkingUser(true);
      const updated = await candidatesService.linkUser(
        selectedCandidate.id,
        userId,
        userEmail,
      );
      setSelectedCandidate(updated);
      setCandidates((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setAssignUserSearch("");
      setAssignUserResults([]);
      toast({ title: "Account linked", description: `Linked to ${userEmail}` });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to link account",
        variant: "destructive",
      });
    } finally {
      setLinkingUser(false);
    }
  };

  const handleUnlinkUser = async () => {
    if (!selectedCandidate) return;
    try {
      setLinkingUser(true);
      const updated = await candidatesService.unlinkUser(selectedCandidate.id);
      setSelectedCandidate(updated);
      setCandidates((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      toast({
        title: "Account unlinked",
        description: "Work account has been removed from this candidate.",
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to unlink account",
        variant: "destructive",
      });
    } finally {
      setLinkingUser(false);
    }
  };

  const handleTransferDocuments = async () => {
    if (!selectedCandidate?.linked_user_id) return;
    try {
      setTransferringDocs(true);
      const result = await candidatesService.transferDocumentsToEmployee(
        selectedCandidate.id,
        selectedCandidate.linked_user_id,
      );
      toast({
        title: "Documents transferred",
        description: `${result.transferred} document(s) transferred to employee profile.`,
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to transfer documents",
        variant: "destructive",
      });
    } finally {
      setTransferringDocs(false);
    }
  };

  const handleSendToOnboarding = async (candidate: Candidate) => {
    if (!user?.id) return;
    setSendingToOnboarding(candidate.id);
    try {
      await onboardingService.createOnboardingFromCandidate(
        candidate.id,
        user.id,
      );
      toast({
        title: "Sent to Onboarding",
        description: `${candidate.first_name} ${candidate.last_name} has been added to onboarding. Go to Onboarding Tracking to assign packets and set up their email.`,
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send to onboarding",
        variant: "destructive",
      });
    } finally {
      setSendingToOnboarding(null);
    }
  };

  const getInterviewTypeIcon = (type: Interview["interview_type"]) => {
    switch (type) {
      case "video":
        return <Video className="h-4 w-4" />;
      case "phone":
        return <PhoneIcon className="h-4 w-4" />;
      case "in-person":
        return <MapPinIcon className="h-4 w-4" />;
      case "panel":
        return <Users className="h-4 w-4" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  };

  const getInterviewStatusColor = (status: Interview["status"]) => {
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

  const getDisplayStatus = (candidate: Candidate): Candidate["status"] => {
    if (
      candidate.status === "offer" &&
      offerStatusByCandidateId[candidate.id]
    ) {
      return offerStatusByCandidateId[candidate.id];
    }
    return candidate.status;
  };

  const getOpenPositionOptions = (currentPosition?: string) => {
    const openStatuses: JobRequisition["status"][] = ["posted", "approved"];
    const openTitles = requisitions
      .filter((r) => openStatuses.includes(r.status))
      .map((r) => r.title)
      .filter(Boolean);
    const uniqueOpenTitles = Array.from(new Set(openTitles));
    const hasCurrent =
      currentPosition && uniqueOpenTitles.includes(currentPosition);
    const options = [
      { value: "", label: "Select an open position..." },
      ...uniqueOpenTitles.map((title) => ({ value: title, label: title })),
    ];
    if (currentPosition && !hasCurrent) {
      options.push({
        value: currentPosition,
        label: `${currentPosition} (current)`,
      });
    }
    return options;
  };

  const filteredCandidates = candidates.filter((candidate) => {
    const matchesSearch =
      candidate.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      candidate.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      candidate.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      candidate.position_applied
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
    const displayStatus = getDisplayStatus(candidate);
    const matchesStatus =
      filterStatus === "all" || displayStatus === filterStatus;
    const matchesPosition =
      filterPosition === "all" || candidate.position_applied === filterPosition;
    return matchesSearch && matchesStatus && matchesPosition;
  });

  const getStatusLabel = (status: Candidate["status"]) => {
    const labels: Record<Candidate["status"], string> = {
      new: "New",
      screening: "Screening",
      interview: "Interview",
      offer: "Offer",
      offer_sent: "Offer Sent",
      offer_accepted: "Offer Accepted",
      hired: "Hired",
      rejected: "Rejected",
    };
    return labels[status] ?? status;
  };

  const getStatusColor = (status: Candidate["status"]) => {
    switch (status) {
      case "new":
        return "bg-brand/10 text-brand";
      case "screening":
        return "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
      case "interview":
        return "bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300";
      case "offer":
        return "bg-lime-50 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300";
      case "offer_sent":
        return "bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300";
      case "offer_accepted":
      case "hired":
        return "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
      case "rejected":
        return "bg-[#EFEAE5] text-[#6E655D] dark:bg-white/10 dark:text-white/60";
      default:
        return "bg-[#EFEAE5] text-[#6E655D] dark:bg-white/10 dark:text-white/60";
    }
  };

  const statusCounts = candidates.reduce(
    (acc, candidate) => {
      const displayStatus = getDisplayStatus(candidate);
      acc[displayStatus] = (acc[displayStatus] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const statusOptions: Array<{ value: Candidate["status"]; label: string }> = [
    { value: "new", label: "New" },
    { value: "screening", label: "Screening" },
    { value: "interview", label: "Interview" },
    { value: "offer", label: "Offer" },
    { value: "offer_sent", label: "Offer Sent" },
    { value: "offer_accepted", label: "Offer Accepted" },
    { value: "hired", label: "Hired" },
    { value: "rejected", label: "Rejected" },
  ];

  const hasFilters =
    searchTerm !== "" || filterStatus !== "all" || filterPosition !== "all";
  const activeCount = candidates.filter(
    (c) => !["hired", "rejected"].includes(getDisplayStatus(c)),
  ).length;
  const weekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = candidates.filter(
    (c) => c.applied_date && new Date(c.applied_date).getTime() >= weekAgo,
  ).length;
  const interviewingCount = statusCounts.interview || 0;
  const pipelineSummary = loading
    ? "Pulling together the pipeline…"
    : candidates.length === 0
      ? "No one in the pipeline yet. Add a candidate to get started."
      : activeCount === 0
        ? "Nobody active in the pipeline right now."
        : [
            `${activeCount} ${activeCount === 1 ? "person" : "people"} in the pipeline`,
            newThisWeek > 0 ? `${newThisWeek} applied this week` : null,
            interviewingCount > 0 ? `${interviewingCount} in interviews` : null,
          ]
            .filter(Boolean)
            .join(", ") + ".";
  return (
    <div className={`-m-6 min-h-[calc(100vh-4rem)] ${CANVAS} ${INK}`}>
      <div className="mx-auto max-w-[1400px] px-6 pb-16 pt-8 md:px-10">
        {/* Masthead */}
        <div
          className={`flex flex-wrap items-end justify-between gap-8 border-b pb-7 ${HAIRLINE}`}
        >
          <div className="min-w-[300px] flex-1">
            <div className="text-[11.5px] font-bold uppercase tracking-[0.11em] text-brand">
              Recruiting
            </div>
            <h1 className="mt-2 font-serif text-[38px] font-normal leading-[1.05] tracking-[-0.02em] md:text-[46px]">
              Candidates
            </h1>
            <p className={`mt-2.5 max-w-[62ch] text-[15.5px] leading-relaxed ${MUTED}`}>
              {pipelineSummary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-brand px-[18px] py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add candidate
            </button>
          </div>
        </div>

        {/* Pipeline strip: one continuous rule. Click a stage to filter. */}
        <div
          className={`mt-7 grid grid-cols-2 gap-px border bg-[#E7E1DA] dark:bg-white/10 ${HAIRLINE} sm:grid-cols-4 xl:grid-cols-8`}
        >
          {statusOptions.map((status) => {
            const active = filterStatus === status.value;
            return (
              <button
                key={status.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilterStatus(active ? "all" : status.value)}
                className={`relative px-4 py-4 text-left transition-colors ${
                  active
                    ? "bg-[#FCFAF8] dark:bg-white/[0.06]"
                    : `${SURFACE} hover:bg-[#FCFAF8] dark:hover:bg-white/[0.04]`
                }`}
              >
                {active && (
                  <span
                    className="absolute inset-x-0 top-0 h-[3px] bg-brand"
                    aria-hidden
                  />
                )}
                <div
                  className={`flex items-center gap-2 text-[12.5px] font-semibold ${MUTED}`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 ${STATUS_BAR[status.value]}`}
                    aria-hidden
                  />
                  {status.label}
                </div>
                <div className="mt-2 text-[30px] font-bold leading-none tracking-[-0.03em]">
                  {loading ? "-" : statusCounts[status.value] || 0}
                </div>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className={`mt-6 flex flex-col border sm:flex-row ${HAIRLINE} ${SURFACE}`}>
          <div className="relative flex-1">
            <Search
              className={`absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 ${FAINT}`}
              aria-hidden
            />
            <input
              type="text"
              placeholder="Search by name, email, or position…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-none border-0 bg-transparent py-3 pl-11 pr-4 text-sm placeholder:text-[#948B83] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand dark:placeholder:text-white/40"
            />
          </div>
          <select
            aria-label="Filter by status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={`rounded-none border-0 border-t px-4 py-3 text-sm sm:border-l sm:border-t-0 ${HAIRLINE} ${SURFACE} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand`}
          >
            <option value="all">All stages</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by position"
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            className={`rounded-none border-0 border-t px-4 py-3 text-sm sm:border-l sm:border-t-0 ${HAIRLINE} ${SURFACE} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand`}
          >
            <option value="all">All positions</option>
            {positions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </div>

        {!loading && candidates.length > 0 && (
          <div
            className={`mt-6 flex items-baseline justify-between text-[12.5px] ${FAINT}`}
          >
            <span>
              Showing {filteredCandidates.length} of {candidates.length}
            </span>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setFilterStatus("all");
                  setFilterPosition("all");
                }}
                className="font-semibold text-brand hover:opacity-80"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Candidates list */}
        {loading ? (
          <div className={`mt-4 border px-6 py-14 text-center ${HAIRLINE} ${SURFACE}`}>
            <LoadingSpinner size="md" />
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className={`mt-4 border border-dashed px-6 py-14 text-center ${HAIRLINE}`}>
            <Users className={`mx-auto h-9 w-9 ${FAINT}`} aria-hidden />
            <h3 className="mt-4 font-serif text-[22px] tracking-[-0.01em]">
              {hasFilters ? "No one matches that" : "No candidates yet"}
            </h3>
            <p className={`mt-1.5 text-sm ${MUTED}`}>
              {hasFilters
                ? "Try a different search, or clear the filters."
                : "Add your first candidate to start the pipeline."}
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {filteredCandidates.map((candidate) => {
              const status = getDisplayStatus(candidate);
              const name = `${candidate.first_name} ${candidate.last_name}`;
              const frSizes = [
                candidate.fr_shirt_size,
                candidate.fr_pant_size,
                candidate.fr_jacket_size,
              ].filter(Boolean);
              return (
                <div
                  key={candidate.id}
                  className={`relative border ${HAIRLINE} ${SURFACE}`}
                >
                  <span
                    className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_BAR[status] ?? "bg-[#C3BAB2]"}`}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-start gap-4 py-4 pl-6 pr-5">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center text-[13.5px] font-bold ${
                        status === "new"
                          ? "bg-brand/10 text-brand"
                          : "bg-[#E9E3DC] text-[#5C554E] dark:bg-white/10 dark:text-white/70"
                      }`}
                    >
                      {initials(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          type="button"
                          onClick={() => openViewModal(candidate)}
                          className="text-left text-[17.5px] font-bold tracking-[-0.01em] transition-colors hover:text-brand"
                        >
                          {name}
                        </button>
                        <span
                          className={`px-2 py-0.5 text-xs font-bold ${getStatusColor(status)}`}
                        >
                          {getStatusLabel(status)}
                        </span>
                      </div>
                      <div className={`mt-0.5 text-sm ${MUTED}`}>
                        {candidate.position_applied}
                        {candidate.source && (
                          <span className={FAINT}> · via {candidate.source}</span>
                        )}
                      </div>
                      <div
                        className={`mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] ${FAINT}`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" aria-hidden />
                          {candidate.email}
                        </span>
                        {candidate.phone && (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" aria-hidden />
                            {candidate.phone}
                          </span>
                        )}
                        {candidate.location && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            {candidate.location}
                          </span>
                        )}
                        {candidate.expected_compensation && (
                          <span
                            className="inline-flex items-center gap-1.5"
                            title="Expected compensation"
                          >
                            <DollarSign className="h-3.5 w-3.5" aria-hidden />
                            {candidate.expected_compensation}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["hired", "offer_accepted"].includes(status) && (
                        <button
                          type="button"
                          onClick={() => handleSendToOnboarding(candidate)}
                          disabled={sendingToOnboarding === candidate.id}
                          className="inline-flex items-center gap-2 bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          {sendingToOnboarding === candidate.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <UserPlus className="h-4 w-4" aria-hidden />
                          )}
                          Send to onboarding
                        </button>
                      )}
                      {!["offer_accepted", "hired"].includes(status) && (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/hr/recruiting/interview-scheduling?candidateId=${candidate.id}`,
                            )
                          }
                          className="inline-flex items-center gap-2 bg-brand px-3.5 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                        >
                          <Calendar className="h-4 w-4" aria-hidden />
                          Schedule interview
                        </button>
                      )}
                    </div>
                  </div>

                  {candidate.notes && (
                    <div
                      className={`mb-4 ml-6 mr-5 border-l-2 border-brand/40 bg-[#FBF8F5] px-3 py-2 text-sm leading-relaxed dark:bg-white/[0.03] ${MUTED}`}
                    >
                      {candidate.notes}
                    </div>
                  )}

                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 border-t py-3 pl-6 pr-5 ${DIVIDER}`}
                  >
                    <div
                      className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] ${FAINT}`}
                    >
                      {candidate.applied_date && (
                        <span>Applied {friendlyDate(candidate.applied_date)}</span>
                      )}
                      {candidate.last_contact_date && (
                        <span>
                          Last contact {friendlyDate(candidate.last_contact_date)}
                        </span>
                      )}
                      {frSizes.length > 0 && <span>FR: {frSizes.join(" / ")}</span>}
                      {candidate.linked_user_email && (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          <Link2 className="h-3 w-3" aria-hidden />
                          {candidate.linked_user_email}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Change stage"
                        value={status}
                        onChange={(e) =>
                          handleStatusChange(
                            candidate.id,
                            e.target.value as Candidate["status"],
                          )
                        }
                        className={`px-2.5 py-1.5 text-[13px] ${FIELD}`}
                      >
                        {statusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => openViewModal(candidate)}
                        className={SECONDARY_BTN}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(candidate)}
                        className={SECONDARY_BTN}
                      >
                        <Edit className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Candidate</DialogTitle>
            <DialogDescription>Enter candidate information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="First Name *"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                error={formErrors.first_name}
                required
              />
              <Input
                label="Last Name *"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                error={formErrors.last_name}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Email *"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                error={formErrors.email}
                required
              />
              <Input
                label="Phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleInputChange}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Requisition"
                name="requisition_id"
                value={formData.requisition_id || ""}
                onChange={handleInputChange}
                options={[
                  { value: "", label: "No requisition selected" },
                  ...requisitions
                    .filter((r) =>
                      [
                        "approved",
                        "posted",
                        "pending_approval",
                        "draft",
                      ].includes(r.status),
                    )
                    .map((r) => ({
                      value: r.id,
                      label: `${r.title} (${r.department})`,
                    })),
                ]}
              />
              <Input
                label="Expected Compensation"
                name="expected_compensation"
                value={formData.expected_compensation ?? ""}
                onChange={handleInputChange}
                placeholder="e.g. $38/hr or $85,000/yr"
                maxLength={255}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
              />
              <Select
                label="Position Applied *"
                name="position_applied"
                value={formData.position_applied}
                onChange={handleInputChange}
                error={formErrors.position_applied}
                options={getOpenPositionOptions(formData.position_applied)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Source *"
                name="source"
                value={formData.source}
                onChange={handleInputChange}
                error={formErrors.source}
                required
              />
              <Select
                label="Status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                options={statusOptions}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-900 dark:text-white">
                Resume (PDF, DOC, DOCX)
              </label>
              <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-none p-4">
                <input
                  type="file"
                  id="resume-upload"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setResumeFile(file || null);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="resume-upload"
                  className="cursor-pointer flex flex-col items-center justify-center"
                >
                  <Upload className="h-8 w-8 text-neutral-400 mb-2" />
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    {resumeFile ? resumeFile.name : "Click to upload resume"}
                  </span>
                  <span className="text-xs text-neutral-500 mt-1">
                    Max 10MB • PDF, DOC, or DOCX
                  </span>
                </label>
                {resumeFile && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{resumeFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setResumeFile(null)}
                      className="ml-auto text-red-500 hover:text-red-700 p-0.5"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-900 dark:text-white">
                Cover Letter (PDF, DOC, DOCX)
              </label>
              <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-none p-4">
                <input
                  type="file"
                  id="cover-letter-upload"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setCoverLetterFile(file || null);
                    if (file)
                      setFormData((prev) => ({ ...prev, cover_letter: "" }));
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="cover-letter-upload"
                  className="cursor-pointer flex flex-col items-center justify-center"
                >
                  <Upload className="h-8 w-8 text-neutral-400 mb-2" />
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    {coverLetterFile
                      ? coverLetterFile.name
                      : "Click to upload cover letter"}
                  </span>
                  <span className="text-xs text-neutral-500 mt-1">
                    Max 10MB • Optional
                  </span>
                </label>
                {coverLetterFile && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{coverLetterFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setCoverLetterFile(null)}
                      className="ml-auto text-red-500 hover:text-red-700 p-0.5"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200 dark:border-neutral-600" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white dark:bg-dark-100 px-2 text-neutral-500">
                    or paste text
                  </span>
                </div>
              </div>
              <Textarea
                label="Cover Letter (text)"
                name="cover_letter"
                value={formData.cover_letter}
                onChange={handleInputChange}
                rows={3}
                placeholder="Optional: paste cover letter text here if not uploading a file"
              />
            </div>
            <Textarea
              label="Notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={2}
            />
            <div className="border-t border-neutral-200 dark:border-dark-200 pt-4">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-2">
                EEO Data (Voluntary)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                Collected for compliance reporting only. This data is stored
                anonymously and will not appear on the candidate profile.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Gender"
                  name="eeo_gender"
                  value={formData.eeo_gender}
                  onChange={handleInputChange}
                  options={[
                    { value: "", label: "Select..." },
                    { value: "Male", label: "Male" },
                    { value: "Female", label: "Female" },
                    { value: "Non-binary", label: "Non-binary" },
                    { value: "Other", label: "Other" },
                  ]}
                />
                <Select
                  label="Race/Ethnicity"
                  name="eeo_race"
                  value={formData.eeo_race}
                  onChange={handleInputChange}
                  options={[
                    { value: "", label: "Select..." },
                    { value: "White", label: "White" },
                    {
                      value: "Black or African American",
                      label: "Black or African American",
                    },
                    { value: "Asian", label: "Asian" },
                    {
                      value: "Hispanic or Latino",
                      label: "Hispanic or Latino",
                    },
                    { value: "Native American", label: "Native American" },
                    { value: "Pacific Islander", label: "Pacific Islander" },
                    { value: "Other", label: "Other" },
                  ]}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="eeo_veteran"
                    name="eeo_veteran"
                    checked={formData.eeo_veteran}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                  <label
                    htmlFor="eeo_veteran"
                    className="text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    Protected Veteran
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="eeo_disability"
                    name="eeo_disability"
                    checked={formData.eeo_disability}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                  <label
                    htmlFor="eeo_disability"
                    className="text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    Individual with Disability
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <Input
                  label="FR shirt size"
                  name="fr_shirt_size"
                  value={formData.fr_shirt_size ?? ""}
                  onChange={handleInputChange}
                  placeholder="e.g. M, L, XL"
                />
                <Input
                  label="FR pant size"
                  name="fr_pant_size"
                  value={formData.fr_pant_size ?? ""}
                  onChange={handleInputChange}
                  placeholder="e.g. 32x30"
                />
                <Input
                  label="FR jacket size"
                  name="fr_jacket_size"
                  value={formData.fr_jacket_size ?? ""}
                  onChange={handleInputChange}
                  placeholder="e.g. L, XL"
                />
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
              disabled={saving}
              className="bg-brand hover:bg-brand/90 text-white"
            >
              {saving ? "Adding..." : "Add Candidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Candidate</DialogTitle>
            <DialogDescription>Update candidate information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="First Name *"
                name="first_name"
                value={formData.first_name}
                onChange={handleInputChange}
                error={formErrors.first_name}
                required
              />
              <Input
                label="Last Name *"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                error={formErrors.last_name}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Email *"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                error={formErrors.email}
                required
              />
              <Input
                label="Phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleInputChange}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Requisition"
                name="requisition_id"
                value={formData.requisition_id || ""}
                onChange={handleInputChange}
                options={[
                  { value: "", label: "No requisition selected" },
                  ...requisitions
                    .filter((r) =>
                      [
                        "approved",
                        "posted",
                        "pending_approval",
                        "draft",
                      ].includes(r.status),
                    )
                    .map((r) => ({
                      value: r.id,
                      label: `${r.title} (${r.department})`,
                    })),
                ]}
              />
              <Input
                label="Expected Compensation"
                name="expected_compensation"
                value={formData.expected_compensation ?? ""}
                onChange={handleInputChange}
                placeholder="e.g. $38/hr or $85,000/yr"
                maxLength={255}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
              />
              <Select
                label="Position Applied *"
                name="position_applied"
                value={formData.position_applied}
                onChange={handleInputChange}
                error={formErrors.position_applied}
                options={getOpenPositionOptions(formData.position_applied)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Source *"
                name="source"
                value={formData.source}
                onChange={handleInputChange}
                error={formErrors.source}
                required
              />
              <Select
                label="Status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                options={statusOptions}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-900 dark:text-white">
                Resume (PDF, DOC, DOCX)
              </label>
              <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-none p-4">
                <input
                  type="file"
                  id="edit-resume-upload"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setResumeFile(file || null);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="edit-resume-upload"
                  className="cursor-pointer flex flex-col items-center justify-center"
                >
                  <Upload className="h-8 w-8 text-neutral-400 mb-2" />
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    {resumeFile
                      ? resumeFile.name
                      : selectedCandidate?.resume_url
                        ? "Upload new file to replace"
                        : "Click to upload resume"}
                  </span>
                  <span className="text-xs text-neutral-500 mt-1">
                    Max 10MB • Optional
                  </span>
                </label>
                {resumeFile && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{resumeFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setResumeFile(null)}
                      className="ml-auto text-red-500 hover:text-red-700 p-0.5"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-900 dark:text-white">
                Cover Letter (PDF, DOC, DOCX)
              </label>
              <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-none p-4">
                <input
                  type="file"
                  id="edit-cover-letter-upload"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setCoverLetterFile(file || null);
                    if (file)
                      setFormData((prev) => ({ ...prev, cover_letter: "" }));
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="edit-cover-letter-upload"
                  className="cursor-pointer flex flex-col items-center justify-center"
                >
                  <Upload className="h-8 w-8 text-neutral-400 mb-2" />
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    {coverLetterFile
                      ? coverLetterFile.name
                      : selectedCandidate?.cover_letter_url
                        ? "Upload new file to replace"
                        : "Click to upload cover letter"}
                  </span>
                  <span className="text-xs text-neutral-500 mt-1">
                    Max 10MB • Optional
                  </span>
                </label>
                {coverLetterFile && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{coverLetterFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setCoverLetterFile(null)}
                      className="ml-auto text-red-500 hover:text-red-700 p-0.5"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <Textarea
                label="Cover Letter (text)"
                name="cover_letter"
                value={formData.cover_letter}
                onChange={handleInputChange}
                rows={2}
                placeholder="Optional: paste cover letter text"
              />
            </div>
            <Textarea
              label="Notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
            />
            <div className="border-t border-neutral-200 dark:border-dark-200 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="FR shirt size"
                  name="fr_shirt_size"
                  value={formData.fr_shirt_size ?? ""}
                  onChange={handleInputChange}
                  placeholder="e.g. M, L, XL"
                />
                <Input
                  label="FR pant size"
                  name="fr_pant_size"
                  value={formData.fr_pant_size ?? ""}
                  onChange={handleInputChange}
                  placeholder="e.g. 32x30"
                />
                <Input
                  label="FR jacket size"
                  name="fr_jacket_size"
                  value={formData.fr_jacket_size ?? ""}
                  onChange={handleInputChange}
                  placeholder="e.g. L, XL"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={saving}
              className="bg-brand hover:bg-brand/90 text-white"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal - Candidate Profile */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="w-[85vw] max-w-[85vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {selectedCandidate &&
                `${selectedCandidate.first_name} ${selectedCandidate.last_name}`}
            </DialogTitle>
            <DialogDescription>Candidate Profile</DialogDescription>
          </DialogHeader>
          {selectedCandidate && (
            <div className="space-y-6 py-4">
              {/* Basic Information */}
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-none p-6">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
                  Contact Information
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </label>
                    <p className="text-neutral-900 dark:text-white mt-1">
                      {selectedCandidate.email}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone
                    </label>
                    <p className="text-neutral-900 dark:text-white mt-1">
                      {selectedCandidate.phone || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Location
                    </label>
                    <p className="text-neutral-900 dark:text-white mt-1">
                      {selectedCandidate.location || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Expected Compensation
                    </label>
                    <p className="text-neutral-900 dark:text-white mt-1">
                      {selectedCandidate.expected_compensation || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      Position Applied
                    </label>
                    <p className="text-neutral-900 dark:text-white mt-1">
                      {selectedCandidate.position_applied}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      Status
                    </label>
                    <p className="mt-1">
                      <span
                        className={`px-2 py-1 rounded-none text-xs font-medium ${getStatusColor(getDisplayStatus(selectedCandidate))}`}
                      >
                        {getStatusLabel(getDisplayStatus(selectedCandidate))}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      Source
                    </label>
                    <p className="text-neutral-900 dark:text-white mt-1">
                      {selectedCandidate.source}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                      Applied Date
                    </label>
                    <p className="text-neutral-900 dark:text-white mt-1">
                      {new Date(
                        selectedCandidate.applied_date,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  {selectedCandidate.last_contact_date && (
                    <div>
                      <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        Last Contact
                      </label>
                      <p className="text-neutral-900 dark:text-white mt-1">
                        {new Date(
                          selectedCandidate.last_contact_date,
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Resume Section - Collapsible */}
              {selectedCandidate.resume_url && (
                <div className="border border-neutral-200 dark:border-neutral-700 rounded-none">
                  <button
                    onClick={() => toggleSection("resume")}
                    className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-brand" />
                      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                        Resume
                      </h2>
                    </div>
                    {expandedSections.resume ? (
                      <ChevronUp className="h-5 w-5 text-neutral-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-neutral-500" />
                    )}
                  </button>
                  {expandedSections.resume && (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-4">
                      <div className="mb-3">
                        <a
                          href={selectedCandidate.resume_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-brand hover:text-brand/80 underline"
                        >
                          <FileText className="h-4 w-4" />
                          Open Resume in New Tab
                        </a>
                      </div>
                      <div
                        className="border border-neutral-200 dark:border-neutral-700 rounded-none overflow-hidden"
                        style={{ height: "600px" }}
                      >
                        <iframe
                          src={selectedCandidate.resume_url}
                          className="w-full h-full"
                          title="Resume Preview"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Interviews Section - Collapsible */}
              {/* Answers to the posting's custom application questions */}
              {(loadingAnswers || candidateAnswers.length > 0) && (
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-none p-6">
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
                    Application Questions
                  </h2>
                  {loadingAnswers ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <div className="space-y-4">
                      {candidateAnswers.map((answer) => (
                        <div key={answer.id}>
                          <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                            {answer.question_label}
                          </label>
                          <p className="text-neutral-900 dark:text-white mt-1 whitespace-pre-wrap">
                            {answer.answer_bool !== null
                              ? answer.answer_bool
                                ? "Yes"
                                : "No"
                              : Array.isArray(answer.answer_json) &&
                                  answer.answer_json.length > 0
                                ? answer.answer_json.join(", ")
                                : answer.answer_text || "No answer"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="border border-neutral-200 dark:border-neutral-700 rounded-none">
                <button
                  onClick={() => toggleSection("interviews")}
                  className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-brand" />
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                      Interviews ({candidateInterviews.length})
                    </h2>
                  </div>
                  {expandedSections.interviews ? (
                    <ChevronUp className="h-5 w-5 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-neutral-500" />
                  )}
                </button>
                {expandedSections.interviews && (
                  <div className="border-t border-neutral-200 dark:border-neutral-700 p-4">
                    {loadingInterviews ? (
                      <div className="text-center py-8">
                        <LoadingSpinner size="sm" />
                      </div>
                    ) : candidateInterviews.length === 0 ? (
                      <div className="text-center py-8">
                        <Calendar className="mx-auto h-12 w-12 text-neutral-400" />
                        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                          No interviews scheduled
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {candidateInterviews.map((interview) => {
                          const interviewDateTime = new Date(
                            `${interview.scheduled_date}T${interview.scheduled_time}`,
                          );
                          const stageName =
                            interview.interview_stage === "initial_culture"
                              ? "Initial/Culture Interview"
                              : interview.interview_stage === "technical"
                                ? "Technical Interview"
                                : interview.interview_stage === "final"
                                  ? "Final Interview"
                                  : interview.interview_stage;

                          let feedbackData: any = null;
                          if (interview.feedback) {
                            try {
                              feedbackData = JSON.parse(interview.feedback);
                            } catch {
                              feedbackData = {
                                overallFeedback: interview.feedback,
                              };
                            }
                          }

                          return (
                            <div
                              key={interview.id}
                              className="border border-neutral-200 dark:border-neutral-700 rounded-none p-4 bg-white dark:bg-neutral-800"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    {getInterviewTypeIcon(
                                      interview.interview_type,
                                    )}
                                    <h3 className="font-semibold text-neutral-900 dark:text-white">
                                      {stageName}
                                    </h3>
                                    <span
                                      className={`px-2 py-1 rounded-none text-xs font-medium ${getInterviewStatusColor(interview.status)}`}
                                    >
                                      {interview.status
                                        .charAt(0)
                                        .toUpperCase() +
                                        interview.status.slice(1)}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-neutral-600 dark:text-neutral-400">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4" />
                                      <span>
                                        {interviewDateTime.toLocaleDateString()}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4" />
                                      <span>
                                        {interviewDateTime.toLocaleTimeString(
                                          [],
                                          {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          },
                                        )}
                                      </span>
                                    </div>
                                    <div>
                                      <span>
                                        Duration: {interview.duration_minutes}{" "}
                                        min
                                      </span>
                                      {feedbackData?.interviewDuration && (
                                        <span className="ml-2 text-brand">
                                          (Actual:{" "}
                                          {feedbackData.interviewDuration})
                                        </span>
                                      )}
                                    </div>
                                    {interview.rating && (
                                      <div>
                                        <span>
                                          Rating: {interview.rating}/5
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {interview.location && (
                                    <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 flex items-center gap-2">
                                      <MapPinIcon className="h-4 w-4" />
                                      <span>{interview.location}</span>
                                    </div>
                                  )}
                                  {interview.video_link && (
                                    <div className="mt-2 text-sm">
                                      <a
                                        href={interview.video_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand hover:underline flex items-center gap-2"
                                      >
                                        <Video className="h-4 w-4" />
                                        Video Link
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Interview Notes/Feedback */}
                              {feedbackData && (
                                <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                                  <h4 className="font-medium text-neutral-900 dark:text-white mb-3">
                                    Interview Notes
                                  </h4>
                                  <div className="space-y-3 text-sm">
                                    {interview.interview_stage ===
                                      "initial_culture" && (
                                      <>
                                        {feedbackData.gettingToKnowNotes && (
                                          <div>
                                            <strong className="text-neutral-700 dark:text-neutral-300">
                                              Getting to Know Candidate:
                                            </strong>
                                            <p className="text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                                              {feedbackData.gettingToKnowNotes}
                                            </p>
                                          </div>
                                        )}
                                        {feedbackData.whyApplyingChecked &&
                                          feedbackData.whyApplyingNotes && (
                                            <div>
                                              <strong className="text-neutral-700 dark:text-neutral-300">
                                                Why applying to AMP:
                                              </strong>
                                              <p className="text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                                                {feedbackData.whyApplyingNotes}
                                              </p>
                                            </div>
                                          )}
                                        {feedbackData.loveJobChecked &&
                                          feedbackData.loveJobNotes && (
                                            <div>
                                              <strong className="text-neutral-700 dark:text-neutral-300">
                                                What they love about their job:
                                              </strong>
                                              <p className="text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                                                {feedbackData.loveJobNotes}
                                              </p>
                                            </div>
                                          )}
                                        {feedbackData.notLoveJobChecked &&
                                          feedbackData.notLoveJobNotes && (
                                            <div>
                                              <strong className="text-neutral-700 dark:text-neutral-300">
                                                What they don't love about their
                                                job:
                                              </strong>
                                              <p className="text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                                                {feedbackData.notLoveJobNotes}
                                              </p>
                                            </div>
                                          )}
                                        {feedbackData.familyValuesChecked &&
                                          feedbackData.familyValuesNotes && (
                                            <div>
                                              <strong className="text-neutral-700 dark:text-neutral-300">
                                                Family/Values/Morals:
                                              </strong>
                                              <p className="text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                                                {feedbackData.familyValuesNotes}
                                              </p>
                                            </div>
                                          )}
                                        {feedbackData.fitCultureNotes && (
                                          <div>
                                            <strong className="text-neutral-700 dark:text-neutral-300">
                                              Cultural Fit:
                                            </strong>
                                            <p className="text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                                              {feedbackData.fitCultureNotes}
                                            </p>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {interview.interview_stage ===
                                      "technical" && (
                                      <>
                                        {feedbackData.workExperienceNotes && (
                                          <div>
                                            <strong className="text-neutral-700 dark:text-neutral-300">
                                              Work Experience:
                                            </strong>
                                            <p className="text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                                              {feedbackData.workExperienceNotes}
                                            </p>
                                          </div>
                                        )}
                                        {feedbackData.reactSituationsNotes && (
                                          <div>
                                            <strong className="text-neutral-700 dark:text-neutral-300">
                                              Reaction to Situations:
                                            </strong>
                                            <p className="text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                                              {
                                                feedbackData.reactSituationsNotes
                                              }
                                            </p>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {feedbackData.overallFeedback && (
                                      <div>
                                        <strong className="text-neutral-700 dark:text-neutral-300">
                                          Overall Feedback:
                                        </strong>
                                        <p className="text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                                          {feedbackData.overallFeedback}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {interview.notes && !feedbackData && (
                                <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                                  <h4 className="font-medium text-neutral-900 dark:text-white mb-2">
                                    Notes
                                  </h4>
                                  <p className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
                                    {interview.notes}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cover Letter Section - Collapsible */}
              {(selectedCandidate.cover_letter ||
                selectedCandidate.cover_letter_url) && (
                <div className="border border-neutral-200 dark:border-neutral-700 rounded-none">
                  <button
                    onClick={() => toggleSection("coverLetter")}
                    className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-brand" />
                      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                        Cover Letter
                      </h2>
                    </div>
                    {expandedSections.coverLetter ? (
                      <ChevronUp className="h-5 w-5 text-neutral-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-neutral-500" />
                    )}
                  </button>
                  {expandedSections.coverLetter && (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 space-y-4">
                      {selectedCandidate.cover_letter_url && (
                        <div>
                          <a
                            href={selectedCandidate.cover_letter_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-brand hover:text-brand/80 underline"
                          >
                            <FileText className="h-4 w-4" />
                            Open Cover Letter (PDF/DOC)
                          </a>
                        </div>
                      )}
                      {selectedCandidate.cover_letter && (
                        <p className="text-neutral-900 dark:text-white whitespace-pre-wrap bg-neutral-50 dark:bg-neutral-800 rounded p-4">
                          {selectedCandidate.cover_letter}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* FR Clothing Sizes */}
              {(selectedCandidate.fr_shirt_size ||
                selectedCandidate.fr_pant_size ||
                selectedCandidate.fr_jacket_size) && (
                <div className="border border-neutral-200 dark:border-neutral-700 rounded-none p-4 bg-neutral-50 dark:bg-neutral-800">
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
                    FR Clothing Sizes
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                    {selectedCandidate.fr_shirt_size && (
                      <div>
                        <label className="text-neutral-500 dark:text-neutral-400">
                          Shirt:
                        </label>
                        <span className="ml-2 text-neutral-900 dark:text-white">
                          {selectedCandidate.fr_shirt_size}
                        </span>
                      </div>
                    )}
                    {selectedCandidate.fr_pant_size && (
                      <div>
                        <label className="text-neutral-500 dark:text-neutral-400">
                          Pants:
                        </label>
                        <span className="ml-2 text-neutral-900 dark:text-white">
                          {selectedCandidate.fr_pant_size}
                        </span>
                      </div>
                    )}
                    {selectedCandidate.fr_jacket_size && (
                      <div>
                        <label className="text-neutral-500 dark:text-neutral-400">
                          Jacket:
                        </label>
                        <span className="ml-2 text-neutral-900 dark:text-white">
                          {selectedCandidate.fr_jacket_size}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Send to Onboarding – visible for offer_accepted or hired candidates */}
              {["offer_accepted", "hired"].includes(
                getDisplayStatus(selectedCandidate),
              ) && (
                <div className="border-2 border-emerald-500/30 rounded-none p-5 bg-emerald-50 dark:bg-emerald-900/10">
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1 flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-emerald-600" />
                    Send to Onboarding
                  </h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                    Create an onboarding record for this candidate. Once
                    created, go to Onboarding Tracking to link their work
                    account and assign packets.
                  </p>
                  <Button
                    onClick={() => handleSendToOnboarding(selectedCandidate)}
                    disabled={sendingToOnboarding === selectedCandidate.id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {sendingToOnboarding === selectedCandidate.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Send to Onboarding
                  </Button>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                    After sending, go to Onboarding Tracking to assign packets
                    and manage their onboarding process.
                  </p>
                </div>
              )}

              {/* Assign Work Account – visible for offer_accepted or hired candidates */}
              {["offer_accepted", "hired"].includes(
                getDisplayStatus(selectedCandidate),
              ) && (
                <div className="border-2 border-brand/30 rounded-none p-5 bg-orange-50 dark:bg-orange-900/10">
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1 flex items-center gap-2">
                    <Link2 className="h-5 w-5 text-brand" />
                    Assign Work Account
                  </h2>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                    Link this candidate to their ampOS employee account
                    ({companyConfig.allowedEmailDomains[0]}) to transfer documents.
                  </p>

                  {selectedCandidate.linked_user_id ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-none">
                        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-neutral-900 dark:text-white">
                            Linked Account
                          </p>
                          <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
                            {selectedCandidate.linked_user_email}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleUnlinkUser}
                          disabled={linkingUser} leftIcon={<X className="h-3.5 w-3.5" />}>
                          Unlink
                        </Button>
                      </div>
                      <Button
                        onClick={handleTransferDocuments}
                        disabled={transferringDocs}
                        className="w-full bg-brand hover:bg-brand/90 text-white"
                      >
                        {transferringDocs ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <ArrowRightLeft className="h-4 w-4 mr-2" />
                        )}
                        Transfer Documents to Employee Profile
                      </Button>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Transfers resume, cover letter, and signed offer letters
                        to the employee's document folder.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative">
                        <Input
                          label={`Search by name or ${companyConfig.allowedEmailDomains[0]} email`}
                          value={assignUserSearch}
                          onChange={(e) => searchAmpOSUsers(e.target.value)}
                          placeholder={`e.g. john.doe${companyConfig.allowedEmailDomains[0]}`}
                        />
                        {assignUserLoading && (
                          <Loader2 className="absolute right-3 top-9 h-4 w-4 animate-spin text-neutral-400" />
                        )}
                      </div>
                      {assignUserResults.length > 0 && (
                        <div className="border border-neutral-200 dark:border-neutral-700 rounded-none overflow-hidden max-h-48 overflow-y-auto">
                          {assignUserResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => handleLinkUser(u.id, u.email)}
                              disabled={linkingUser}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-left border-b last:border-0 border-neutral-100 dark:border-neutral-700"
                            >
                              <User className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                                  {u.name}
                                </p>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                                  {u.email}
                                </p>
                              </div>
                              <Link2 className="h-4 w-4 text-brand flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                      {assignUserSearch.length >= 2 &&
                        assignUserResults.length === 0 &&
                        !assignUserLoading && (
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
                            No matching {companyConfig.allowedEmailDomains[0]} accounts found. Make sure
                            the employee has created their account.
                          </p>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
            {selectedCandidate && (
              <Button
                onClick={() => {
                  setIsViewModalOpen(false);
                  openEditModal(selectedCandidate);
                }}
                className="bg-brand hover:bg-brand/90 text-white" leftIcon={<Edit className="h-4 w-4" />}>
                Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
