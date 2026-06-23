import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Users,
  ChevronDown,
  Plus,
  Paperclip,
  X,
  FileEdit,
  Pencil,
  Upload,
  FileText,
  Package,
  Trash2,
  ClipboardCheck,
  Calendar,
  DollarSign,
  Building,
  User,
  Phone,
  Mail,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle,
  Image,
  Maximize2,
  Minimize2,
  Save,
  Edit3,
  Download,
  Eye,
  Bookmark,
  MessageCircle,
  SquareArrowOutUpRight,
} from "lucide-react";
import { supabase, isConnectionError } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { isSuperUser } from "../../lib/roles";
import { useDemoMode } from "../../lib/DemoModeContext";
import { useJobDetails } from "../../lib/hooks";
import { formatStatusLabel } from "@/utils/formatters";
import { format } from "date-fns";
import { Button } from "../ui/Button";
import { reportImportService } from "../../services/reportImport";
import { ShortcutService } from "../../services/ShortcutService";
import Card, {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/Table";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { toast } from "@/components/ui/toast";
import { ReportApprovalWorkflow } from "../reports/ReportApprovalWorkflow";
import { getAssetName } from "../reports/reportMappings";
import JobDeliverables from "./JobDeliverables";
import AfterActionReports from "./AfterActionReports";
import { pdfExportService } from "../../services/pdfExportService";

import { JobNotifications } from "./JobNotifications";
import { AssetCommentsDialog } from "@/components/ui/AssetCommentsDialog";
import { SubmittalTracker } from "./SubmittalTracker";
import JobNotes from "./JobNotes";
import JobPictures from "./JobPictures";
import { formatDivisionDisplay } from "../../lib/utils/divisionDisplay";
import {
  compareAlphanumericLabels,
  compareLinkedAssetFolderLabels,
} from "../../utils/sortUtils";
import { SignatureProfileSelector } from "./SignatureProfileSelector";
import {
  getQuickBooksStatus,
  searchQuickBooksProjects,
  getQuickBooksHoursByProject,
} from "../../services/quickbooksService";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { loadAuthorsForUserIds } from "@/lib/communityProfiles";
// TrackingSection is defined locally below

// Inline component to show accepted letter proposal for the job's originating opportunity
const AcceptedLetter: React.FC<{ jobId: string }> = ({ jobId }) => {
  const [link, setLink] = React.useState<{ id: string; title: string } | null>(
    null,
  );
  React.useEffect(() => {
    (async () => {
      try {
        const { data: opp } = await supabase
          .schema("business")
          .from("opportunities")
          .select("id, selected_letter_proposal")
          .eq("job_id", jobId)
          .maybeSingle();
        if (!opp?.id || !opp.selected_letter_proposal) {
          setLink(null);
          return;
        }
        const { data: letter } = await supabase
          .schema("business")
          .from("letter_proposals")
          .select("id, title")
          .eq("id", opp.selected_letter_proposal)
          .maybeSingle();
        if (letter?.id)
          setLink({ id: letter.id, title: letter.title || "Letter Proposal" });
        else setLink(null);
      } catch {
        setLink(null);
      }
    })();
  }, [jobId]);
  if (!link)
    return (
      <p className="text-sm text-neutral-500 dark:text-white">None selected</p>
    );
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        alert("Open the opportunity to view the saved letter.");
      }}
      className="text-[#f26722] hover:underline text-sm"
    >
      {link.title}
    </a>
  );
};

interface Job {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  job_number: string | null;
  start_date: string | null;
  due_date: string | null;
  budget: number | null;
  customer_id: string;
  division?: string | null;
  site_address?: string | null;
  fireteam_lead?: string | null;
  submittal_job_type?: "standard" | "data_center" | null;
  submittal_window_hours?: number | null;
  progress_billing_status?: string | null;
  estimated_man_hours?: number | null;
  quickbooks_project_id?: string | null;
  quickbooks_project_name?: string | null;
  notes?: string | null;
  customers: {
    id: string;
    name: string;
    company_name?: string | null;
    address?: string | null;
  };
}

interface AdjacentJobIds {
  previous: string | null;
  next: string | null;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
}

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface Asset {
  id: string;
  name: string;
  file_url: string;
  created_at: string;
  substation?: string | null;
  template_type?: "MTS" | "ATS" | null;
  status?:
    | "not started"
    | "in_progress"
    | "ready_for_review"
    | "approved"
    | "sent"
    | "issue"
    | "archived";
  urgency?: "normal" | "critical";
  submitted_at?: string | null;
  approved_at?: string | null;
  sent_at?: string | null;
  submitted_by?: string | null;
  approved_by?: string | null;
  sent_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_comments?: string | null;
}

type ReportAuditInfo = {
  submitted_at?: string | null;
  approved_at?: string | null;
  issued_at?: string | null;
  sent_at?: string | null;
  submitted_by?: string | null;
  approved_by?: string | null;
  sent_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_comments?: string | null;
};

interface RelatedOpportunity {
  id: string;
  quote_number: string;
  total_man_hours?: number | null;
}

export type ContractValueOperation =
  | "add_to_total"
  | "subtract_from_total"
  | "subtract_from_remaining"
  | "add_to_remaining";

interface Contract {
  id: string;
  name: string;
  type:
    | "main"
    | "subcontract"
    | "amendment"
    | "change_order"
    | "purchase_order"
    | "invoice"
    | "discount";
  file_url: string | null;
  file_path?: string | null;
  uploaded_date: string;
  status: "pending" | "signed" | "expired" | "cancelled";
  value?: number | null;
  value_operation?: ContractValueOperation | null;
  start_date?: string;
  end_date?: string;
  description?: string;
}

interface OneLineDrawing {
  id: string;
  job_id: string;
  user_id: string;
  name: string;
  description?: string;
  file_url: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  version: string;
  is_current: boolean;
  upload_date: string;
  created_at: string;
  updated_at: string;
}

interface MiscellaneousDocument {
  id: string;
  job_id: string;
  user_id: string;
  name: string;
  description?: string;
  file_url: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  created_at: string;
  updated_at: string;
}

const reportRoutes = {
  "Panelboard Report": "panelboard-report",
  "LV Switch Multi Device Test": "low-voltage-switch-multi-device-test",
  "LV Breaker Electronic Trip ATS Report":
    "low-voltage-circuit-breaker-electronic-trip-ats-report",
  "35-Automatic Transfer Switch ATS": "automatic-transfer-switch-ats-report",
  "2-Large Dry Type Xfmr. Insp. & Test MTS 23":
    "large-dry-type-transformer-mts-report",
  "2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test MTS":
    "large-dry-type-xfmr-mts-report",
};

// Internal Forms: not test reports, but go through the same review workflow.
// When approved they appear in the dedicated "Approved Internal Forms" tab
// instead of the regular "Approved" tab.
interface InternalFormTemplate {
  slug: string;
  name: string;
}
const INTERNAL_FORM_TEMPLATES: InternalFormTemplate[] = [
  { slug: "job-hazard-analysis-form", name: "Job Hazard Analysis Form" },
];
const INTERNAL_FORM_SLUGS = new Set(INTERNAL_FORM_TEMPLATES.map((t) => t.slug));

/** Returns true if an asset's file_url corresponds to an internal form route. */
function isInternalFormAsset(
  asset: { file_url?: string | null } | null | undefined,
): boolean {
  if (!asset?.file_url) return false;
  if (!asset.file_url.startsWith("report:")) return false;
  try {
    const urlContent = asset.file_url.split(":/")[1] || "";
    const parts = urlContent.split("/");
    // Expecting [ 'jobs', jobId, slug, ... ]
    const slug = (parts[2] || "").split("?")[0];
    return INTERNAL_FORM_SLUGS.has(slug);
  } catch {
    return false;
  }
}

/** Report date fields — skip placeholders so we can fall back to created_at. */
function parseReportDateField(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t || /^(dates|\[dates\]|tbd|n\/a|pending)$/i.test(t)) return null;
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Report row id from `report:/jobs/.../.../reportId` (handles grounding substation segment). */
function parseReportIdFromAssetUrl(fileUrl: string): string | null {
  try {
    const urlContent = fileUrl.split(":/")[1] || "";
    const parts = urlContent.split("/");
    if (parts[0] !== "jobs" || !parts[2]) return null;
    const slug = parts[2].split("?")[0];
    const isGroundingReport =
      slug === "grounding-system-master" ||
      slug === "grounding-fall-of-potential-slope-method-test" ||
      slug === "gfi-trip-test-report";
    const reportIdFromUrl =
      isGroundingReport && parts.length >= 5
        ? (parts[4] || "").split("?")[0]
        : (parts[3] || "").split("?")[0];
    return reportIdFromUrl || null;
  } catch {
    return null;
  }
}

const JOB_ASSET_UPLOAD_CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  hex: "text/plain",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  log: "text/plain",
  pdf: "application/pdf",
  png: "image/png",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function getJobAssetUploadContentType(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return (
    JOB_ASSET_UPLOAD_CONTENT_TYPES[ext] ||
    file.type ||
    "application/octet-stream"
  );
}

// Signature sections types for executive summary
export interface SignaturePerson {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
}

export interface SignatureSection {
  title: string;
  people: SignaturePerson[];
}

export type SignatureSectionsConfig = SignatureSection[];

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isDemoMode, maskCustomerName, maskCustomerAddress, maskJobTitle } =
    useDemoMode();
  const {
    jobDetails,
    loading: jobDetailsLoading,
    error: jobDetailsError,
    refreshJobDetails,
  } = useJobDetails(id);

  // Cache admin status to prevent unmounting ReportApprovalWorkflow during auth flickers
  const isAdminRef = useRef<boolean>(false);
  if (user?.user_metadata?.role === "Admin" || isSuperUser(user?.email)) {
    isAdminRef.current = true;
  }
  const isAdmin =
    isAdminRef.current ||
    user?.user_metadata?.role === "Admin" ||
    isSuperUser(user?.email);

  const [job, setJob] = useState<Job | null>(null);
  const [adjacentJobIds, setAdjacentJobIds] = useState<AdjacentJobIds>({
    previous: null,
    next: null,
  });
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [jobAssets, setJobAssets] = useState<Asset[]>([]);
  const [filteredJobAssets, setFilteredJobAssets] = useState<Asset[]>([]);
  const [reportTimestampsByAsset, setReportTimestampsByAsset] = useState<
    Record<string, ReportAuditInfo>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [assetStatusFilter, setAssetStatusFilter] = useState<
    | "all"
    | "not started"
    | "in_progress"
    | "ready_for_review"
    | "approved"
    | "approved_internal_forms"
    | "sent"
    | "issue"
    | "archived"
  >("all");
  const [reportSearchQuery, setReportSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");
  const [customFormTemplates, setCustomFormTemplates] = useState<
    { id: string; name: string; neta_section?: string | null }[]
  >([]);

  // Client-side folder-aware pagination for linked assets
  const [folderPage, setFolderPage] = useState(1);
  const [totalAssetCount, setTotalAssetCount] = useState(0);

  // Generated document (cover letter / executive summary) state
  const [isDocDialogOpen, setIsDocDialogOpen] = useState(false);
  const [docType, setDocType] = useState<"cover" | "summary" | "both" | null>(
    null,
  );
  const [docHtml, setDocHtml] = useState<string>("");
  const [docHeadHtml, setDocHeadHtml] = useState<string>("");
  // List dialog state for saved generated docs
  const [isDocListOpen, setIsDocListOpen] = useState(false);
  // Substation selector for ToC generation
  const [isSubstationSelectorOpen, setIsSubstationSelectorOpen] =
    useState(false);
  const [selectedSubstations, setSelectedSubstations] = useState<Set<string>>(
    new Set(),
  );
  const [pendingDocType, setPendingDocType] = useState<
    "cover" | "summary" | "both" | null
  >(null);
  // Document name for saving
  const [docSaveName, setDocSaveName] = useState<string>("");
  // Viewer state for viewing saved documents
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerDocId, setViewerDocId] = useState<string | null>(null);
  const [viewerHtml, setViewerHtml] = useState<string>("");
  const [viewerTitle, setViewerTitle] = useState<string>("");
  const [isSavingViewer, setIsSavingViewer] = useState(false);
  const [isEditingViewer, setIsEditingViewer] = useState(false);
  const [viewerFontSize, setViewerFontSize] = useState(16); // Default font size in pixels
  const [isViewerDocLocked, setIsViewerDocLocked] = useState(false); // Track if document is locked
  const viewerIframeRef = useRef<HTMLIFrameElement | null>(null);
  const docUpdateSourceRef = useRef<"user" | "programmatic">("programmatic");
  // Signature profiles state
  const [selectedSignatureProfileIds, setSelectedSignatureProfileIds] =
    useState<Set<string>>(new Set());
  const [isSignatureProfileSelectorOpen, setIsSignatureProfileSelectorOpen] =
    useState(false);
  // QuickBooks project (search, assign, actual hours)
  const [qbConnected, setQbConnected] = useState(false);
  const [qbProjectSearchQuery, setQbProjectSearchQuery] = useState("");
  const [qbProjectSearchResults, setQbProjectSearchResults] = useState<
    { Id: string; Name?: string; DisplayName?: string }[]
  >([]);
  const [qbProjectSearchOpen, setQbProjectSearchOpen] = useState(false);
  const [qbProjectSearching, setQbProjectSearching] = useState(false);
  const [qbAssigning, setQbAssigning] = useState(false);
  const [qbActualHours, setQbActualHours] = useState<number | null>(null);
  const [qbHoursLoading, setQbHoursLoading] = useState(false);
  const [qbProjectError, setQbProjectError] = useState<string | null>(null);

  const formatAddressForLetter = (addr?: string | null) => {
    if (!addr) return "";
    return addr
      .replace(/,\s*/g, ", ")
      .replace(/,?\s*\bUnited States\b\.?/gi, "")
      .replace(/\s+,/g, ", ")
      .replace(/[\s,]+$/g, "")
      .trim();
  };

  const openSubstationSelector = (type: "cover" | "summary" | "both") => {
    setPendingDocType(type);
    // Collect all unique substations from jobAssets
    const substations = new Set<string>();
    jobAssets.forEach((asset) => {
      const sub = assetSubstations[asset.id];
      if (typeof sub === "string" && sub.trim()) {
        substations.add(sub.trim());
      }
    });
    // Pre-select all substations by default
    setSelectedSubstations(new Set(substations));
    setIsSubstationSelectorOpen(true);
  };

  // Helper function to generate signature sections HTML from selected profile IDs
  const generateSignatureSectionsHTML = async (
    profileIds: Set<string>,
  ): Promise<string> => {
    if (!profileIds || profileIds.size === 0) {
      return "";
    }

    try {
      // Load profiles from database
      const { data: profiles, error } = await supabase
        .schema("neta_ops")
        .from("signature_profiles")
        .select("id, name, title, email, phone, section_title")
        .in("id", Array.from(profileIds));

      if (error) throw error;
      if (!profiles || profiles.length === 0) return "";

      // Group profiles by section_title
      interface Profile {
        id: string;
        name: string;
        title?: string;
        email?: string;
        phone?: string;
        section_title?: string;
      }

      const profilesBySection = (profiles as Profile[]).reduce(
        (acc, profile) => {
          const section = profile.section_title || "Reviewed By";
          if (!acc[section]) {
            acc[section] = [];
          }
          acc[section].push(profile);
          return acc;
        },
        {} as Record<string, Profile[]>,
      );

      // Generate HTML for each section
      const sectionsHTML = Object.entries(profilesBySection)
        .map(([sectionTitle, sectionProfiles]: [string, Profile[]]) => {
          const peopleHTML = sectionProfiles
            .map((profile: Profile) => {
              if (!profile.name) return "";

              const parts: string[] = [];
              parts.push(profile.name);
              if (profile.title) parts.push(profile.title);
              if (profile.email) parts.push(profile.email);
              if (profile.phone) parts.push(profile.phone);

              // Format as multi-line (current style)
              return parts.join("<br/>");
            })
            .filter((html: string) => html !== "")
            .join("<br/><br/>");

          if (!peopleHTML) return "";

          // No extra whitespace/newlines between tags - prevents text-node injection
          // that breaks flex layout when serialized through DOMParser.
          // Include inline styles so sig layout survives DOM round-trips (signature selection).
          return `<div class="sig-col" style="flex:1;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;" contenteditable><b style="display:block;margin-bottom:6px;">${sectionTitle}:</b>${peopleHTML}</div>`;
        })
        .filter((html) => html !== "")
        .join("");

      if (!sectionsHTML) return "";

      return `<div class="sig-grid" style="display:flex;gap:28px;margin-top:18px;font-family:Arial,sans-serif;">${sectionsHTML}</div>`;
    } catch (e) {
      console.error("Error generating signature sections:", e);
      return "";
    }
  };

  const generateDoc = async (
    type: "cover" | "summary" | "both",
    filterSubstations?: Set<string>,
    selectedProfileIdsOverride?: Set<string>,
  ) => {
    const jd = jobDetails;
    const company = maskCustomerName(
      jd?.formattedCustomerName ||
        jd?.customer?.company_name ||
        jd?.customer?.name ||
        "",
    );
    const jobNum = jd?.job_number || "";
    const siteAddress = maskCustomerAddress(
      formatAddressForLetter(jd?.site_address || jd?.customer?.address || ""),
    );
    const fireteam = jd?.fireteam_lead || "";
    const fireteamEmail = (() => {
      try {
        const name = (fireteam || "").toLowerCase().trim();
        if (!name) return "";
        const match = (users || []).find(
          (u) =>
            (u.user_metadata?.name || u.email || "").toLowerCase().trim() ===
            name,
        );
        return match?.email || "";
      } catch {
        return "";
      }
    })();

    // Determine reviewer (most recent approver for this job)
    let reviewedByName = "";
    let reviewedByEmail = "";
    let reviewedByPhone = "";
    try {
      if (id) {
        const { data: reviewerRow } = await supabase
          .schema("neta_ops")
          .from("technical_reports")
          .select("reviewed_by, reviewed_at, status")
          .eq("job_id", id)
          .in("status", ["approved", "sent"])
          .order("reviewed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const reviewerId = (reviewerRow as any)?.reviewed_by as
          | string
          | undefined;
        if (reviewerId) {
          const u = (users || []).find((x) => x.id === reviewerId);
          reviewedByEmail = u?.email || "";
          reviewedByName = (
            u?.user_metadata?.name ||
            u?.email ||
            ""
          ).toString();
          // Try to get phone from user metadata if available
          reviewedByPhone = (u?.user_metadata?.phone as string) || "";
        }
      }
    } catch {}
    const today = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Use provided profile IDs or current selection
    const finalSelectedProfileIds =
      selectedProfileIdsOverride !== undefined
        ? selectedProfileIdsOverride
        : selectedSignatureProfileIds;

    // Set the state for the dialog
    if (selectedProfileIdsOverride !== undefined) {
      setSelectedSignatureProfileIds(selectedProfileIdsOverride);
    }

    const sharedStyles = `
      <style>
        @page {
          size: letter;
          margin: 0;
        }
        @media print {
          .print-hidden { display: none !important; }
          body {
            margin: 0 !important;
            padding: 0 !important;
            width: 8.5in;
            height: auto !important;
          }
          html {
            margin: 0 !important;
            padding: 0 !important;
            width: 8.5in;
            height: auto !important;
          }
          .amp-page {
            margin: 0 !important;
            padding: 0.9in 0.9in 0.9in 1.25in !important;
            height: 11in !important;
            width: 8.5in !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            page-break-after: always !important;
          }
          .amp-page:last-child {
            page-break-after: auto !important;
          }
          .amp-stripe {
            position: absolute !important;
          }
          .amp-header {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            flex-shrink: 0 !important;
          }
          .amp-page-content {
            flex: 1 1 auto !important;
            overflow: hidden !important;
            min-height: 0 !important;
          }
          .amp-footer {
            position: relative !important;
            bottom: auto !important;
            left: auto !important;
            right: auto !important;
            flex-shrink: 0 !important;
            margin-top: auto !important;
          }
          .toc-page {
            page-break-before: always !important;
            break-before: page !important;
          }
        }
        .amp-page {
          position: relative;
          height: 11in;
          width: 8.5in;
          margin: 0 auto;
          padding: 0.9in 0.9in 0.9in 1.25in;
          box-sizing: border-box;
          font-family: Arial, sans-serif;
          color: #111;
        }
        .amp-stripe {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 36px;
          background: #f26722;
        }
        .amp-header {
          position: absolute;
          top: 0.9in;
          left: 1.25in;
          right: 0.9in;
          display:flex;
          align-items:center;
          gap:12px;
          margin-bottom: 0;
          z-index: 10;
        }
        .amp-header img { height: 50px; }
        .amp-header .tagline { font-size: 16px; font-weight: 600; color: #5a3a2b; font-style: italic; }
        .amp-page-content {
          padding-top: 80px;
          padding-bottom: 60px;
          min-height: calc(11in - 0.9in - 0.9in - 80px - 60px);
        }
        .cover-block { margin-top: 1.2in; }
        .cover-title { font-size: 44px; font-weight: 900; margin: 0 0 24px; }
        .cover-line { font-size: 18px; font-weight: 800; margin: 12px 0; }
        .amp-footer {
          position: absolute;
          bottom: 0.9in;
          left: 1.25in;
          right: 0.9in;
          display:flex;
          align-items:center;
          gap: 16px;
          z-index: 10;
        }
        .amp-footer .rule { flex: 1; height: 2px; background: #8b7359; margin: 0 12px; }
        .amp-footer .contact { font-weight: 800; color: #5a3a2b; font-size: 16px; }
        .neta-logo { height: 34px; object-fit: contain; }
        .exec-title { font-size: 28px; font-weight: 900; text-decoration: underline; margin-bottom: 6px; }
        .exec-title-rule { height: 3px; background: #f26722; margin: 4px 0 14px; }
        .exec-meta { margin: 6px 0 12px; font-size: 14px; }
        .exec-section { margin: 12px 0; font-size: 14px; }
        .exec-section b { display:block; margin-bottom: 6px; }
        .sig-grid { display:flex; gap: 28px; margin-top: 18px; }
        .sig-col { flex: 1; }
        .sig-col b { display:block; margin-bottom: 6px; }
        .page-break { page-break-after: always; break-after: page; height: 24px; }
        .toc-page { page-break-before: always; break-before: page; }
        .amp-badge { position:absolute; top: 18px; right: 18px; }
        .amp-badge img { height: 48px; }
        .toc-title { font-size: 18px; font-weight: 900; margin: 6px 0 10px; }
        .toc-two-columns { display: flex !important; flex-direction: row !important; gap: 20px !important; }
        .toc-col-left, .toc-col-right { flex: 1 !important; min-width: 0 !important; }
        .toc-group { break-inside: avoid; page-break-inside: avoid; margin-bottom: 3px; }
        .toc-section { font-weight: 700; margin: 2px 0 1px; font-size: 9px; }
        .toc-item { margin-left: 10px; font-size: 8px; line-height: 1.2; }
      </style>
    `;

    const headerHtml = `
      <div class="amp-header">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" height="50" style="height:50px;max-height:50px;width:auto;object-fit:contain;" />
        <span class="tagline">| Quality Energy Services</span>
      </div>
    `;

    const netaLogoUrl = (window as any)?.NETA_LOGO_URL || "/img/NETA_logo.png";
    const footerHtml = `
      <div class="amp-footer">
        <img src="${netaLogoUrl}" alt="NETA" class="neta-logo" height="34" style="height:34px;max-height:34px;width:auto;object-fit:contain;" />
        <div class="rule"></div>
        <div class="contact">(256) 513-8255&nbsp;&nbsp;|&nbsp;&nbsp;ampqes.com</div>
      </div>
    `;

    // Hide company line if it's just "AMP"
    const displayCompany = (company || "").trim();
    const companyHtml =
      displayCompany && displayCompany.toLowerCase() !== "amp"
        ? `<div class="cover-line" contenteditable>${displayCompany}</div>`
        : "";

    const projectTitle =
      maskJobTitle((jd?.title || job?.title || "").trim()) ||
      "[Project/Outage Title]";

    // Work performed: only **approved** report assets (user selection / substation filter), never **sent**.
    // Earliest test/start date → latest "Date Added" (job_assets.created_at). Skips invalid placeholders.
    let workPerformedText = "Work Performed [Dates]";
    try {
      if (id) {
        const dateAddedFromAssets: Date[] = [];
        const allowedReportIds = new Set<string>();
        const approvedReportFileUrls = new Set<string>();
        try {
          let reportAssets = (jobAssets || []).filter(
            (a) =>
              a.file_url &&
              a.file_url.startsWith("report:") &&
              a.status === "approved",
          );
          if (filterSubstations && filterSubstations.size > 0) {
            reportAssets = reportAssets.filter((asset) => {
              const sub = assetSubstations[asset.id];
              return sub && filterSubstations.has(sub);
            });
          }
          reportAssets.forEach((asset) => {
            approvedReportFileUrls.add(asset.file_url);
            const rid = parseReportIdFromAssetUrl(asset.file_url);
            if (rid) allowedReportIds.add(rid);
            const d = parseReportDateField(asset.created_at);
            if (d) dateAddedFromAssets.push(d);
          });
        } catch {}

        const testOrStartDates: Date[] = [];
        const rowCreatedDates: Date[] = [];

        const reportTables = [
          "panelboard_reports",
          "liquid_xfmr_visual_mts_reports",
          "two_small_dry_type_xfmr_mts_reports",
          "two_small_dry_type_xfmr_ats_reports",
          "switchgear_panelboard_mts_reports",
          "potential_transformer_ats_reports",
          "medium_voltage_vlf_mts_reports",
          "medium_voltage_circuit_breaker_reports",
          "medium_voltage_circuit_breaker_mts_reports",
          "medium_voltage_switch_oil_reports",
          "medium_voltage_switch_mts_reports",
          "medium_voltage_switch_sf6_reports",
          "switchgear_reports",
          "low_voltage_switch_reports",
          "low_voltage_circuit_breaker_electronic_trip_ats_reports",
          "low_voltage_circuit_breaker_electronic_trip_mts_reports",
          "low_voltage_circuit_breaker_thermal_magnetic_ats_reports",
          "low_voltage_circuit_breaker_thermal_magnetic_mts_reports",
          "current_transformer_test_ats_reports",
          "current_transformer_test_mts_reports",
          "voltage_potential_transformer_mts_reports",
          "low_voltage_cable_mts_reports",
          "low_voltage_cable_ats_reports",
          "low_voltage_cable_test_12sets",
          "low_voltage_cable_test_3sets",
          "large_dry_type_transformer_mts_reports",
          "large_dry_type_transformer_reports",
          "large_dry_type_xfmr_mts_reports",
          "liquid_filled_transformer_reports",
          "metal_enclosed_busway_reports",
          "switchgear_switchboard_ats25_reports",
          "medium_voltage_motor_starter_mts_reports",
        ];

        if (allowedReportIds.size > 0) {
          await Promise.all(
            reportTables.map(async (table) => {
              try {
                const { data } = await supabase
                  .schema("neta_ops")
                  .from(table)
                  .select(
                    "id, report_info, report_data, created_at, updated_at",
                  )
                  .eq("job_id", id);
                (data || []).forEach((row: any) => {
                  if (!row?.id || !allowedReportIds.has(row.id)) return;
                  const ri = row?.report_info || {};
                  const rd = row?.report_data || {};
                  const info = rd.reportInfo || rd.report_info || ri || {};
                  const testRaw =
                    info.start_date ??
                    info.startDate ??
                    info.date ??
                    info.report_date ??
                    rd.date ??
                    ri.date;
                  const testD = parseReportDateField(testRaw);
                  if (testD) testOrStartDates.push(testD);

                  const rowAdded =
                    parseReportDateField(row.created_at) ??
                    parseReportDateField(row.updated_at);
                  if (rowAdded) rowCreatedDates.push(rowAdded);
                });
              } catch {}
            }),
          );
        }

        try {
          if (approvedReportFileUrls.size > 0) {
            const { data: reports } = await supabase
              .schema("neta_ops")
              .from("technical_reports")
              .select("submitted_at, report_data, created_at, status")
              .eq("job_id", id)
              .eq("status", "approved");
            (reports || []).forEach((r: any) => {
              const fu = r?.report_data?.file_url as string | undefined;
              if (!fu || !approvedReportFileUrls.has(fu)) return;
              const rd = r?.report_data || {};
              const info = rd.reportInfo || rd.report_info || {};
              const testRaw =
                info.start_date ??
                info.startDate ??
                info.date ??
                info.report_date ??
                rd.date;
              const testD = parseReportDateField(testRaw);
              if (testD) testOrStartDates.push(testD);
              const fallback =
                parseReportDateField(r.submitted_at) ??
                parseReportDateField(r.created_at);
              if (fallback) rowCreatedDates.push(fallback);
            });
          }
        } catch {}

        let startMs: number | null =
          testOrStartDates.length > 0
            ? Math.min(...testOrStartDates.map((d) => d.getTime()))
            : dateAddedFromAssets.length > 0
              ? Math.min(...dateAddedFromAssets.map((d) => d.getTime()))
              : rowCreatedDates.length > 0
                ? Math.min(...rowCreatedDates.map((d) => d.getTime()))
                : null;

        let endMs: number | null =
          dateAddedFromAssets.length > 0
            ? Math.max(...dateAddedFromAssets.map((d) => d.getTime()))
            : testOrStartDates.length > 0
              ? Math.max(...testOrStartDates.map((d) => d.getTime()))
              : rowCreatedDates.length > 0
                ? Math.max(...rowCreatedDates.map((d) => d.getTime()))
                : null;

        if (startMs != null && endMs != null && startMs > endMs) {
          const t = startMs;
          startMs = endMs;
          endMs = t;
        }

        if (startMs != null && endMs != null) {
          const first = new Date(startMs);
          const last = new Date(endMs);

          const month = (d: Date) =>
            new Intl.DateTimeFormat("en-US", { month: "short" }).format(d);
          const ordinal = (n: number) => {
            const s = ["th", "st", "nd", "rd"],
              v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
          };

          const sameYear = first.getFullYear() === last.getFullYear();
          const sameMonth = first.getMonth() === last.getMonth() && sameYear;

          if (sameYear && sameMonth) {
            workPerformedText = `Work Performed ${month(first)} ${ordinal(first.getDate())} - ${month(last)} ${ordinal(last.getDate())}, ${first.getFullYear()}`;
          } else if (sameYear) {
            workPerformedText = `Work Performed ${month(first)} ${ordinal(first.getDate())} - ${month(last)} ${ordinal(last.getDate())}, ${first.getFullYear()}`;
          } else {
            workPerformedText = `Work Performed ${month(first)} ${ordinal(first.getDate())}, ${first.getFullYear()} - ${month(last)} ${ordinal(last.getDate())}, ${last.getFullYear()}`;
          }

          workPerformedText = workPerformedText
            .replace(
              /(Work Performed\s+[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)),?\s*\d{1,2}\s*-/,
              "$1 -",
            )
            .replace(/\s{2,}/g, " ")
            .trim();
        }
      }
    } catch {}

    const coverHtml = `
      <div class="amp-page">
        <div class="amp-stripe"></div>
        ${headerHtml}
        <div class="amp-page-content">
          <div class="cover-block">
            <div class="cover-title">Report ${jobNum}</div>
            ${companyHtml}
            <div class="cover-line" contenteditable>${projectTitle}</div>
            <div class="cover-line" contenteditable>${workPerformedText}</div>
          </div>
        </div>
        ${footerHtml}
      </div>
    `;

    const summaryHtml = `
      <div class="amp-page">
        <div class="amp-stripe"></div>
        <div class="amp-page-content" style="padding-top: 0.5in;">
          <div class="exec-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:8px;">
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP" height="48" style="height:48px;max-height:48px;width:auto;object-fit:contain;" />
            <div class="exec-title">Executive Summary</div>
          </div>
          <div class="exec-title-rule"></div>
          <div class="exec-meta"><b>AMP Project #${jobNum}</b></div>
          <div class="exec-meta">${today}</div>
          <div class="exec-section">AMP is pleased to present this executive summary to <b>${company || "[Customer/Company]"}</b>.</div>
          <div class="exec-section"><b>Site Address</b> ${siteAddress || "[Site Address]"}</div>

          <div class="exec-section" contenteditable><b>Summary</b> Enter a brief description of scope, dates, and key outcomes.</div>
          <div class="exec-section" contenteditable><b>Test Result/Discrepancies</b> Enter overall results and any discrepancies.</div>
          <div class="exec-section" style="margin-top: 3em;">Please contact the undersigned if you have questions on this report.</div>
          ${await (async () => {
            if (finalSelectedProfileIds && finalSelectedProfileIds.size > 0) {
              const sigHtml = await generateSignatureSectionsHTML(
                finalSelectedProfileIds,
              );
              if (sigHtml) return sigHtml;
            }
            // Fallback to default if no profiles selected
            return `<div class="sig-grid" style="display:flex;gap:28px;margin-top:18px;font-family:Arial,sans-serif;"><div class="sig-col" style="flex:1;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;" contenteditable><b style="display:block;margin-bottom:6px;">Project Manager:</b>${fireteam || "Name"}<br/>[Title]<br/>${fireteamEmail || "email@ampqes.com"}</div><div class="sig-col" style="flex:1;font-size:14px;line-height:1.5;font-family:Arial,sans-serif;" contenteditable><b style="display:block;margin-bottom:6px;">Reviewed by:</b>${reviewedByName || "Name"}<br/>[Title]<br/>${reviewedByEmail || "email@ampqes.com"}<br/>(xxx) xxx-xxxx</div></div>`;
          })()}
        </div>
        ${footerHtml}
      </div>
    `;

    // Build Table of Contents by scanning per-report tables for identifiers
    let tocHtml = "";
    try {
      const slugToTable: Record<string, string> = {
        "panelboard-report": "panelboard_reports",
        "liquid-xfmr-visual-mts-report": "liquid_xfmr_visual_mts_reports",
        "two-small-dry-typer-xfmr-mts-report":
          "two_small_dry_type_xfmr_mts_reports",
        "two-small-dry-typer-xfmr-ats-report":
          "two_small_dry_type_xfmr_ats_reports",
        "switchgear-panelboard-mts-report": "switchgear_panelboard_mts_reports",
        "potential-transformer-ats-report": "potential_transformer_ats_reports",
        "medium-voltage-vlf-mts-report": "medium_voltage_vlf_mts_reports",
        "medium-voltage-circuit-breaker-report":
          "medium_voltage_circuit_breaker_reports",
        "medium-voltage-circuit-breaker-mts-report":
          "medium_voltage_circuit_breaker_mts_reports",
        "medium-voltage-switch-oil-report": "medium_voltage_switch_oil_reports",
        "switchgear-report": "switchgear_reports",
        "low-voltage-switch-report": "low_voltage_switch_reports",
        "low-voltage-switch-multi-device-test":
          "low_voltage_switch_multi_device_test_reports",
        "low-voltage-circuit-breaker-electronic-trip-ats-report":
          "low_voltage_circuit_breaker_electronic_trip_ats_reports",
        "low-voltage-circuit-breaker-electronic-trip-mts-report":
          "low_voltage_circuit_breaker_electronic_trip_mts_reports",
        "low-voltage-circuit-breaker-thermal-magnetic-ats-report":
          "low_voltage_circuit_breaker_thermal_magnetic_ats_reports",
        "low-voltage-circuit-breaker-thermal-magnetic-mts-report":
          "low_voltage_circuit_breaker_thermal_magnetic_mts_reports",
        "lv-molded-case-circuit-breaker-ats25":
          "lv_molded_case_circuit_breaker_ats25",
        "emergency-systems-engine-generator-ats25":
          "emergency_systems_engine_generator_ats25",
        "6-low-voltage-switch-maint-mts-report":
          "low_voltage_switch_maint_mts_reports",
        "current-transformer-test-ats-report":
          "current_transformer_test_ats_reports",
        "12-current-transformer-test-ats-report":
          "current_transformer_test_ats_reports",
        "12-current-transformer-test-mts-report":
          "current_transformer_test_mts_reports",
        "13-voltage-potential-transformer-test-mts-report":
          "voltage_potential_transformer_mts_reports",
        "3-low-voltage-cable-mts": "low_voltage_cable_mts_reports",
        "3-low-voltage-cable-ats": "low_voltage_cable_ats_reports",
        "large-dry-type-transformer-mts-report":
          "large_dry_type_transformer_mts_reports",
        "large-dry-type-transformer-report":
          "large_dry_type_transformer_reports",
        "large-dry-type-xfmr-mts-report": "large_dry_type_xfmr_mts_reports",
        "liquid-filled-transformer-report": "liquid_filled_transformer_reports",
        "metal-enclosed-busway-report": "metal_enclosed_busway_reports",
        "automatic-transfer-switch-ats-report":
          "automatic_transfer_switch_ats_reports",
        "gfi-trip-test-report": "gfi_trip_test_reports",
        "applied-voltage-test-ats-report": "applied_voltage_test_ats_reports",
      };
      const slugToLabel: Record<string, string> = {
        "panelboard-report": "Panelboard Test Reports",
        "switchgear-panelboard-mts-report":
          "Switchgear / Panelboard Test Reports",
        "switchgear-report": "Switchgear Test Reports",
        "low-voltage-switch-report": "Low Voltage Switch Test Reports",
        "low-voltage-switch-multi-device-test":
          "Low Voltage Switch Test Reports",
        "3-low-voltage-cable-mts": "Low Voltage Cable Test Reports",
        "3-low-voltage-cable-ats": "Low Voltage Cable Test Reports",
        "medium-voltage-vlf-mts-report": "Medium Voltage Cable Test Reports",
        "medium-voltage-circuit-breaker-report":
          "Medium Voltage Circuit Breaker Reports",
        "medium-voltage-circuit-breaker-mts-report":
          "Medium Voltage Circuit Breaker Test Reports",
        "low-voltage-circuit-breaker-electronic-trip-ats-report":
          "Low Voltage Circuit Breaker Test Reports",
        "low-voltage-circuit-breaker-electronic-trip-mts-report":
          "Low Voltage Circuit Breaker Test Reports",
        "low-voltage-circuit-breaker-thermal-magnetic-ats-report":
          "Low Voltage Circuit Breaker Test Reports",
        "low-voltage-circuit-breaker-thermal-magnetic-mts-report":
          "Low Voltage Circuit Breaker Test Reports",
        "6-low-voltage-switch-maint-mts-report":
          "Low Voltage Switch Test Reports",
        "current-transformer-test-ats-report":
          "Current Transformer Test Reports",
        "12-current-transformer-test-ats-report":
          "Current Transformer Test Reports",
        "12-current-transformer-test-mts-report":
          "Current Transformer Test Reports",
        "13-voltage-potential-transformer-test-mts-report":
          "Voltage / Potential Transformer Test Reports",
        "liquid-filled-transformer-report": "Transformer Test Reports",
        "liquid-xfmr-visual-mts-report": "Transformer Test Reports",
        "large-dry-type-transformer-mts-report": "Transformer Test Reports",
        "large-dry-type-transformer-report": "Transformer Test Reports",
        "large-dry-type-xfmr-mts-report": "Transformer Test Reports",
        "metal-enclosed-busway-report": "Metal Enclosed Busway Reports",
        "automatic-transfer-switch-ats-report":
          "Automatic Transfer Switch Test Reports",
      };
      const labelToItems = new Map<string, string[]>();
      const pushItem = (label: string, name: string) => {
        const arr = labelToItems.get(label) || [];
        const trimmedName = (name || "").trim();
        if (trimmedName && !arr.includes(trimmedName)) {
          arr.push(trimmedName);
        }
        labelToItems.set(label, arr);
      };

      // Build TOC from report assets that are approved or sent only
      let reportAssets = (jobAssets || []).filter((a) => {
        const isReport = a.file_url && a.file_url.startsWith("report:");
        if (!isReport) return false;
        const st = (a as any).status;
        const ts = reportTimestampsByAsset[a.id] || {};
        const isApprovedOrSent =
          st === "approved" ||
          st === "sent" ||
          !!ts.approved_at ||
          !!ts.sent_at;
        return isApprovedOrSent;
      });
      // Filter by selected substations if provided
      if (filterSubstations && filterSubstations.size > 0) {
        reportAssets = reportAssets.filter((asset) => {
          const sub = assetSubstations[asset.id];
          return sub && filterSubstations.has(sub);
        });
      }
      if (reportAssets.length > 0) {
        await Promise.all(
          reportAssets.map(async (asset) => {
            const url = asset.file_url as string;
            const parts = url.split("/"); // report:/jobs/{jobId}/{slug}/{reportId}
            const slug = parts[4];
            const reportId = parts[5];
            const table = slugToTable[slug];

            // Derive section label and identifier directly from asset name
            const displayName = dynamicAssetNames[asset.id] || asset.name || "";

            // Extract ATS/MTS designation and identifier
            let testType = ""; // Will be 'ATS' or 'MTS' or empty
            let baseTitle = displayName;
            let identifierFromName: string | undefined;

            // Check for ATS or MTS in the name
            const atsMatch = displayName.match(/\bATS\b/i);
            const mtsMatch = displayName.match(/\bMTS\b/i);
            if (atsMatch) testType = "ATS";
            else if (mtsMatch) testType = "MTS";

            // If dynamic name includes the report title + ' - ' + identifier, split on the last ' - '
            const lastSep = displayName.lastIndexOf(" - ");
            if (lastSep !== -1) {
              baseTitle = displayName.slice(0, lastSep);
              identifierFromName = displayName.slice(lastSep + 3).trim();
            }

            // Normalize base title: drop numeric prefixes and trailing ATS/MTS tokens and the word 'Report'
            let normalizedLabel = baseTitle
              .replace(/^\s*\d+\s*[-.–]?\s*/i, "") // remove leading number like '12-'
              .replace(/\b(ATS|MTS)\b.*$/i, "") // strip trailing 'ATS', 'MTS', and any codes
              .replace(/\bReport\b/gi, "")
              .replace(/\s{2,}/g, " ")
              .trim();
            if (!normalizedLabel)
              normalizedLabel = slugToLabel[slug] || "Other Reports";
            const label = normalizedLabel;

            // Format the item: just "ATS - identifier" or "MTS - identifier" (no report title in the item)
            if (identifierFromName) {
              // Clean identifier - remove any report title portions that leaked through
              const cleanIdentifier = identifierFromName
                .replace(/^.*?(?:ATS|MTS)\s*-?\s*/i, "") // Remove any leading title + ATS/MTS
                .replace(/^\d+\s*-\s*/, "") // Remove leading number prefix like "2-"
                .trim();

              if (cleanIdentifier) {
                const formattedItem = testType
                  ? `${testType} - ${cleanIdentifier}`
                  : cleanIdentifier;
                pushItem(label, formattedItem);
              } else {
                // No identifier after cleaning
                const formattedItem = testType
                  ? `${testType} - No Identifier`
                  : "No Identifier";
                pushItem(label, formattedItem);
              }
            } else {
              // No identifier found in name at all
              const formattedItem = testType
                ? `${testType} - No Identifier`
                : "No Identifier";
              pushItem(label, formattedItem);
            }
          }),
        );
      }

      // If nothing gathered (fallback), use approved/sent technical_reports linked to assets
      if (labelToItems.size === 0) {
        try {
          if (id) {
            const { data: reports } = await supabase
              .schema("neta_ops")
              .from("technical_reports")
              .select("id, report_data, status")
              .eq("job_id", id)
              .in("status", ["approved", "sent"]);

            for (const tr of reports || []) {
              const rd = (tr as any)?.report_data || {};
              const assetId: string | undefined = rd?.asset_id;
              const fileUrl: string | undefined = rd?.file_url;
              const asset =
                (assetId && (jobAssets || []).find((a) => a.id === assetId)) ||
                (fileUrl &&
                  (jobAssets || []).find((a) => a.file_url === fileUrl)) ||
                (typeof (tr as any).id === "string" &&
                  (jobAssets || []).find(
                    (a) =>
                      typeof a.file_url === "string" &&
                      a.file_url.endsWith(`/${(tr as any).id}`),
                  ));

              if (!asset) continue;

              // Respect substation filter if provided
              if (filterSubstations && filterSubstations.size > 0) {
                const sub = assetSubstations[asset.id];
                if (!sub || !filterSubstations.has(sub)) continue;
              }

              // Derive section label and identifier from asset name/dynamic name
              const url = asset.file_url as string;
              const parts = url.split("/"); // report:/jobs/{jobId}/{slug}/{reportId}
              const slug = parts[4];

              const displayName =
                dynamicAssetNames[asset.id] || asset.name || "";
              let testType = "";
              let baseTitle = displayName;
              let identifierFromName: string | undefined;

              const atsMatch = displayName.match(/\bATS\b/i);
              const mtsMatch = displayName.match(/\bMTS\b/i);
              if (atsMatch) testType = "ATS";
              else if (mtsMatch) testType = "MTS";

              const lastSep = displayName.lastIndexOf(" - ");
              if (lastSep !== -1) {
                baseTitle = displayName.slice(0, lastSep);
                identifierFromName = displayName.slice(lastSep + 3).trim();
              }

              let normalizedLabel = baseTitle
                .replace(/^\s*\d+\s*[-.–]?\s*/i, "")
                .replace(/\b(ATS|MTS)\b.*$/i, "")
                .replace(/\bReport\b/gi, "")
                .replace(/\s{2,}/g, " ")
                .trim();
              if (!normalizedLabel)
                normalizedLabel = slugToLabel[slug] || "Other Reports";
              const label = normalizedLabel;

              if (identifierFromName) {
                const cleanIdentifier = identifierFromName
                  .replace(/^.*?(?:ATS|MTS)\s*-?\s*/i, "")
                  .replace(/^\d+\s*-\s*/, "")
                  .trim();
                const formattedItem = cleanIdentifier
                  ? testType
                    ? `${testType} - ${cleanIdentifier}`
                    : cleanIdentifier
                  : testType
                    ? `${testType} - No Identifier`
                    : "No Identifier";
                pushItem(label, formattedItem);
              } else {
                const formattedItem = testType
                  ? `${testType} - No Identifier`
                  : "No Identifier";
                pushItem(label, formattedItem);
              }
            }
          }
        } catch {}
      }
      // Build HTML if we have any items; keep a stable section order
      // Preserve the natural order the sections were encountered; fall back to alphabetical
      const labels = Array.from(labelToItems.keys());
      if (labels.length > 0) {
        // Build all sections with their items, wrapped in a group div to keep together
        const allSections: Array<{ html: string; num: number }> = [];
        labels.forEach((label, idx) => {
          const items = (labelToItems.get(label) || []).sort((a, b) =>
            a.localeCompare(b),
          );
          let sectionHtml = `<div class="toc-group" style="break-inside:avoid;page-break-inside:avoid;margin-bottom:3px;">`;
          sectionHtml += `<div class="toc-section" style="font-weight:700;margin:2px 0 1px;font-size:9px;">${idx + 1}. ${label}</div>`;
          items.forEach((it) => {
            sectionHtml += `<div class="toc-item" style="margin-left:10px;font-size:8px;line-height:1.2;">- ${it}</div>`;
          });
          sectionHtml += `</div>`;
          allSections.push({ html: sectionHtml, num: idx + 1 });
        });

        // Split into two columns: 1-N/2 on left, N/2+1 to N on right
        const midpoint = Math.ceil(allSections.length / 2);
        const col1Sections = allSections.slice(0, midpoint);
        const col2Sections = allSections.slice(midpoint);

        const col1Html = col1Sections.map((s) => s.html).join("");
        const col2Html = col2Sections.map((s) => s.html).join("");

        tocHtml = `
          <div class="amp-page toc-page">
            <div class="amp-stripe"></div>
            ${headerHtml}
            <div class="amp-page-content" style="padding-top:60px !important;">
              <div class="toc-title" style="font-size:18px;font-weight:900;margin:6px 0 10px;">Table of Contents</div>
              <div class="toc-two-columns" style="display:flex !important;flex-direction:row !important;gap:20px !important;font-size:8px;">
                <div class="toc-col-left" style="flex:1 !important;min-width:0 !important;">${col1Html}</div>
                <div class="toc-col-right" style="flex:1 !important;min-width:0 !important;">${col2Html}</div>
              </div>
            </div>
            ${footerHtml}
          </div>
        `;
      }
    } catch {}

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title> </title>
        ${sharedStyles}
      </head>
      <body>
        ${type === "cover" ? coverHtml : type === "summary" ? summaryHtml : `${coverHtml}${summaryHtml}${tocHtml ? tocHtml : ""}`}
      </body>
      </html>
    `;

    setDocType(type);
    setDocHtml(html);
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(html, "text/html");
      const headInner = parsed.head ? parsed.head.innerHTML : "";
      if (headInner) setDocHeadHtml(headInner);
    } catch {}
    setDocSaveName(""); // Clear the name field for new document
    setIsDocDialogOpen(true);
  };
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedApprovedIds, setSelectedApprovedIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(
    new Set(),
  );
  const [isArchiving, setIsArchiving] = useState(false);
  const [isBatchUploading, setIsBatchUploading] = useState(false);

  const [batchUploadProgress, setBatchUploadProgress] = useState(0);
  const [batchUploadStatus, setBatchUploadStatus] = useState<string>("");
  const [opportunity, setOpportunity] = useState<RelatedOpportunity | null>(
    null,
  );
  const [isStatusEditing, setIsStatusEditing] = useState(false);
  const [isPriorityEditing, setIsPriorityEditing] = useState(false);
  const [isDueDateEditing, setIsDueDateEditing] = useState(false);
  const [isProgressBillingStatusEditing, setIsProgressBillingStatusEditing] =
    useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isFireteamLeadSelectorOpen, setIsFireteamLeadSelectorOpen] =
    useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [editFormData, setEditFormData] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempDueDate, setTempDueDate] = useState<string>("");
  const [activeTab, setActiveTab] = useState("assets");
  const [currentTab, setCurrentTab] = useState("details");
  const [selectedAssetType, setSelectedAssetType] =
    useState<string>("document");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const [showDeleteJobConfirm, setShowDeleteJobConfirm] = useState(false);
  // PDF Report upload state
  const [showPdfReportUploadDialog, setShowPdfReportUploadDialog] =
    useState(false);
  const [pdfReportFile, setPdfReportFile] = useState<File | null>(null);
  const [pdfReportName, setPdfReportName] = useState("");
  const [pdfReportSubstation, setPdfReportSubstation] = useState("");
  const [isUploadingPdfReport, setIsUploadingPdfReport] = useState(false);
  const [pdfUploadProgress, setPdfUploadProgress] = useState(0);
  // Edit PDF report state
  const [showEditPdfReportDialog, setShowEditPdfReportDialog] = useState(false);
  const [editingPdfReport, setEditingPdfReport] = useState<Asset | null>(null);
  const [editPdfReportName, setEditPdfReportName] = useState("");
  const [editPdfReportSubstation, setEditPdfReportSubstation] = useState("");
  // Basic manual tracker state
  type TrackingItem = {
    id: string;
    name: string;
    target: number;
    completed: number;
  };
  const [trackingItems, setTrackingItems] = useState<TrackingItem[]>([]);
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [newItemTarget, setNewItemTarget] = useState<number>(1);
  const [selectedReportForTracker, setSelectedReportForTracker] =
    useState<string>("");
  const saveTimerRef = React.useRef<number | null>(null);
  const [selectedBatchFiles, setSelectedBatchFiles] = useState<File[]>([]);
  const [isShortcut, setIsShortcut] = useState<boolean>(false);
  const [shortcutId, setShortcutId] = useState<string | null>(null);
  const [shortcutBusy, setShortcutBusy] = useState<boolean>(false);
  const [mergedTitles, setMergedTitles] = useState<string[] | null>(null);
  const [showCommentsDialog, setShowCommentsDialog] = useState(false);
  const [selectedAssetForComments, setSelectedAssetForComments] =
    useState<Asset | null>(null);
  const [dynamicAssetNames, setDynamicAssetNames] = useState<
    Record<string, string>
  >({});
  const [assetSubstations, setAssetSubstations] = useState<
    Record<string, string>
  >({});
  const [reportAuditUsers, setReportAuditUsers] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    let cancelled = false;
    const ids = new Set<string>();
    const addId = (value?: string | null) => {
      if (value) ids.add(value);
    };

    jobAssets.forEach((asset) => {
      addId(asset.submitted_by);
      addId(asset.approved_by);
      addId(asset.sent_by);
      addId(asset.reviewed_by);
    });

    Object.values(reportTimestampsByAsset).forEach((audit) => {
      addId(audit.submitted_by);
      addId(audit.approved_by);
      addId(audit.sent_by);
      addId(audit.reviewed_by);
    });

    if (ids.size === 0) {
      setReportAuditUsers({});
      return;
    }

    loadAuthorsForUserIds(Array.from(ids)).then((authorMap) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      authorMap.forEach((author, userId) => {
        next[userId] = author.displayName;
      });
      setReportAuditUsers(next);
    });

    return () => {
      cancelled = true;
    };
  }, [jobAssets, reportTimestampsByAsset]);

  // Initialize manual tracker from loaded job (support both old/new shapes)
  useEffect(() => {
    const plan = (jobDetails as any)?.tracking_plan;
    if (!plan) {
      setTrackingItems([]);
      return;
    }
    if (Array.isArray(plan)) {
      const items = plan as any[];
      setTrackingItems(
        items.map((it, i) => ({
          id: it.id || `${i}-${Date.now()}`,
          name: it.name || it.slug || `Item ${i + 1}`,
          target: Number(it.target) || 1,
          completed: Number(it.completed) || 0,
        })),
      );
    } else if (plan && Array.isArray(plan.items)) {
      const items = plan.items as any[];
      setTrackingItems(
        items.map((it, i) => ({
          id: it.id || `${i}-${Date.now()}`,
          name: it.name || it.slug || `Item ${i + 1}`,
          target: Number(it.target) || 1,
          completed: Number(it.completed) || 0,
        })),
      );
    } else if (typeof plan === "object") {
      const entries = Object.entries(plan as Record<string, number>);
      setTrackingItems(
        entries.map(([key, value], i) => ({
          id: `${i}-${Date.now()}`,
          name: key,
          target: Number(value) || 1,
          completed: 0,
        })),
      );
    }
  }, [jobDetails?.tracking_plan]);

  // Compute merged titles from merge group (retroactive and forward)
  useEffect(() => {
    (async () => {
      try {
        if (!job) return;
        // Find any opportunities linked to this job
        const { data: opps } = await supabase
          .schema("business")
          .from("opportunities")
          .select("id, title, job_id")
          .eq("job_id", job.id);
        if (!opps || opps.length === 0) {
          setMergedTitles(null);
          return;
        }

        // If any of these opps are in a merge group, collect all member titles
        const oppIds = opps.map((o) => o.id);
        const { data: memberships } = await supabase
          .schema("business")
          .from("opportunity_merge_members")
          .select("merge_group_id, opportunity_id")
          .in("opportunity_id", oppIds);
        if (!memberships || memberships.length === 0) {
          setMergedTitles(null);
          return;
        }

        const groupIds = Array.from(
          new Set(memberships.map((m) => (m as any).merge_group_id)),
        ).filter(Boolean) as string[];
        if (groupIds.length === 0) {
          setMergedTitles(null);
          return;
        }

        // Fetch all members for these groups
        const { data: allMembers } = await supabase
          .schema("business")
          .from("opportunity_merge_members")
          .select("opportunity_id")
          .in("merge_group_id", groupIds);
        const allIds = Array.from(
          new Set(
            (allMembers || []).map((m) => String((m as any).opportunity_id)),
          ),
        );
        if (allIds.length === 0) {
          setMergedTitles(null);
          return;
        }

        const { data: allOpps } = await supabase
          .schema("business")
          .from("opportunities")
          .select("id, title")
          .in("id", allIds);
        const titles = (allOpps || [])
          .map((o) => o.title)
          .filter(Boolean) as string[];
        setMergedTitles(titles.length > 0 ? titles : null);
      } catch (e) {
        console.warn("Failed to compute merged titles:", e);
        setMergedTitles(null);
      }
    })();
  }, [job?.id]);

  // Manual tracker helpers
  const addItem = () => {
    if (!selectedReportForTracker) return;
    const target = Math.max(1, Math.floor(newItemTarget || 1));
    const asset = defaultAssets.find((a) => a.id === selectedReportForTracker);
    const name = asset ? asset.name : selectedReportForTracker;
    // Avoid duplicate by name
    setTrackingItems((prev) => {
      if (prev.some((it) => it.name === name)) return prev;
      return [...prev, { id: `${Date.now()}`, name, target, completed: 0 }];
    });
    setSelectedReportForTracker("");
    setNewItemTarget(1);
    requestSave();
  };

  const updateItemTarget = (id: string, target: number) => {
    setTrackingItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, target: Math.max(0, Math.floor(target || 0)) }
          : it,
      ),
    );
    requestSave();
  };

  const updateItemCompleted = (id: string, completed: number) => {
    setTrackingItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              completed: Math.max(
                0,
                Math.min(Math.floor(completed || 0), it.target),
              ),
            }
          : it,
      ),
    );
    requestSave();
  };

  const incCompleted = (id: string, delta: number) => {
    setTrackingItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              completed: Math.max(0, Math.min(it.completed + delta, it.target)),
            }
          : it,
      ),
    );
    requestSave();
  };

  const removeItem = (id: string) => {
    setTrackingItems((prev) => prev.filter((it) => it.id !== id));
    requestSave();
  };

  const requestSave = () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      handleSaveTrackingPlan();
    }, 600);
  };

  const handleSaveTrackingPlan = async () => {
    if (!id) return;
    try {
      setIsSavingTracking(true);
      const { error: updateError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update({ tracking_plan: { items: trackingItems } })
        .eq("id", id);
      if (updateError) throw updateError;
      toast({
        title: "Tracking plan saved",
        description: "Your project tracking plan has been updated.",
      });
    } catch (err) {
      console.error("Failed to save tracking plan", err);
      toast({
        title: "Error",
        description: "Failed to save tracking plan",
        variant: "destructive",
      });
    } finally {
      setIsSavingTracking(false);
    }
  };
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Contract and Drawing Management State
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [oneLineDrawings, setOneLineDrawings] = useState<OneLineDrawing[]>([]);
  const [miscellaneousDocuments, setMiscellaneousDocuments] = useState<
    MiscellaneousDocument[]
  >([]);
  const [showContractUpload, setShowContractUpload] = useState(false);
  const [showContractViewer, setShowContractViewer] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(
    null,
  );
  const [showDrawingUpload, setShowDrawingUpload] = useState(false);
  const [showDrawingViewer, setShowDrawingViewer] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<OneLineDrawing | null>(
    null,
  );
  const [showMiscUpload, setShowMiscUpload] = useState(false);
  const [showMiscViewer, setShowMiscViewer] = useState(false);
  const [selectedMiscDocument, setSelectedMiscDocument] =
    useState<MiscellaneousDocument | null>(null);
  const [contractForm, setContractForm] = useState({
    name: "",
    type: "main" as Contract["type"],
    description: "",
    value: "",
    value_operation: "add_to_total" as ContractValueOperation,
    start_date: "",
    end_date: "",
  });
  const [drawingForm, setDrawingForm] = useState({
    name: "",
    description: "",
  });
  const [miscForm, setMiscForm] = useState({
    name: "",
    description: "",
  });
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [miscFile, setMiscFile] = useState<File | null>(null);
  const [isContractUploading, setIsContractUploading] = useState(false);
  const [isDrawingUploading, setIsDrawingUploading] = useState(false);
  const [isMiscUploading, setIsMiscUploading] = useState(false);

  // Default assets that are always available
  const defaultAssets: Asset[] = [
    {
      id: "switchgear-panelboard-mts",
      name: "1-Switchgear, Switchboard, Panelboard Inspection & Test Report MTS",
      file_url: `report:/jobs/${id}/switchgear-panelboard-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "switchgear-switchboard-assemblies-ats25",
      name: "7.1.1 Switchgear & Switchboard Assemblies Test Sheet ATS 25",
      file_url: `report:/jobs/${id}/switchgear-switchboard-assemblies-ats25?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "panelboard-assemblies-ats25",
      name: "7.1.2 Panelboard Assemblies Test Sheet ATS 25",
      file_url: `report:/jobs/${id}/panelboard-assemblies-ats25?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "small-lv-dry-type-transformer-ats25",
      name: "7.2.1.1 Small Low Voltage Dry Type Transformer Test Sheet ATS 25",
      file_url: `report:/jobs/${id}/small-lv-dry-type-transformer-ats25?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "liquid-filled-xfmr-ats25",
      name: "7.2.2 Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 25",
      file_url: `report:/jobs/${id}/liquid-filled-xfmr-ats25?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "lv-molded-case-circuit-breaker-ats25",
      name: "LV Circuit Breaker ATS 25",
      file_url: `report:/jobs/${id}/lv-molded-case-circuit-breaker-ats25?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "emergency-systems-engine-generator-ats25",
      name: "7.22.1 Emergency Systems, Engine Generator Test Sheet ATS 25",
      file_url: `report:/jobs/${id}/emergency-systems-engine-generator-ats25?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "grounding-system-master",
      name: "Grounding System MASTER",
      file_url: `report:/jobs/${id}/grounding-system-master?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "grounding-fall-of-potential-slope-method-test",
      name: "Grounding Fall of Potential Slope Method Test",
      file_url: `report:/jobs/${id}/grounding-fall-of-potential-slope-method-test?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "large-dry-type-transformer-mts-report",
      name: "2-Large Dry Type Xfmr. Inspection and Test MTS 23",
      file_url: `report:/jobs/${id}/large-dry-type-transformer-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "large-dry-type-xfmr-mts-report",
      name: "2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test MTS",
      file_url: `report:/jobs/${id}/large-dry-type-xfmr-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "liquid-xfmr-visual-mts-report",
      name: "2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test MTS",
      file_url: `report:/jobs/${id}/liquid-xfmr-visual-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "low-voltage-cable-test-3sets-mts",
      name: "3-Low Voltage Cable MTS",
      file_url: `report:/jobs/${id}/low-voltage-cable-test-3sets?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "switchgear-inspection-report",
      name: "1-Switchgear, Switchboard, Panelboard Inspection & Test Report ATS 21",
      file_url: `report:/jobs/${id}/switchgear-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "panelboard-inspection-report",
      name: "1-Panelboard Inspection & Test Report ATS 21",
      file_url: `report:/jobs/${id}/panelboard-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "dry-type-transformer-test",
      name: "2-Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21",
      file_url: `report:/jobs/${id}/dry-type-transformer?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "large-dry-type-transformer-test",
      name: "2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21",
      file_url: `report:/jobs/${id}/large-dry-type-transformer-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "liquid-filled-transformer-test",
      name: "2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21",
      file_url: `report:/jobs/${id}/liquid-filled-transformer?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "two-small-dry-typer-xfmr-ats-report",
      name: "2-Small Dry Typer Xfmr. Inspection and Test ATS",
      file_url: `report:/jobs/${id}/two-small-dry-typer-xfmr-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "low-voltage-cable-test-12sets",
      name: "3-Low Voltage Cable Test ATS",
      file_url: `report:/jobs/${id}/low-voltage-cable-test-12sets?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    // Removed from Add Asset dropdown per request; this report will be accessed under Job Details
    {
      id: "medium-voltage-vlf",
      name: "4-Medium Voltage Cable VLF Test ATS",
      file_url: `report:/jobs/${id}/medium-voltage-vlf?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "medium-voltage-cable-vlf-test",
      name: "4-Medium Voltage Cable VLF Test With Tan Delta ATS",
      file_url: `report:/jobs/${id}/medium-voltage-cable-vlf-test?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "metal-enclosed-busway",
      name: "5-Metal Enclosed Busway ATS",
      file_url: `report:/jobs/${id}/metal-enclosed-busway?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "low-voltage-switch-multi-device-test",
      name: "6-Low Voltage Switch - Multi-Device TEST",
      file_url: `report:/jobs/${id}/low-voltage-switch-multi-device-test?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "low-voltage-switch-report",
      name: "6-Low Voltage Switch ATS",
      file_url: `report:/jobs/${id}/low-voltage-switch-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "mv-switch-oil-report",
      name: "7-Medium Voltage Way Switch (OIL) Report ATS 21",
      file_url: `report:/jobs/${id}/medium-voltage-switch-oil-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "medium-voltage-switch-sf6-report",
      name: "Medium Voltage Way Switch (SF6)",
      file_url: `report:/jobs/${id}/medium-voltage-switch-sf6-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "potential-transformer-ats-report",
      name: "Potential Transformer ATS",
      file_url: `report:/jobs/${id}/potential-transformer-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "low-voltage-circuit-breaker-electronic-trip-unit-ats",
      name: "8-Low Voltage Circuit Breaker Electronic Trip Unit ATS - Secondary Injection",
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "low-voltage-circuit-breaker-electronic-trip-ats-primary-injection",
      name: "8-Low Voltage Circuit Breaker Electronic Trip Unit ATS - Primary Injection",
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-electronic-trip-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "low-voltage-circuit-breaker-thermal-magnetic-ats",
      name: "8-Low Voltage Circuit Breaker Thermal-Magnetic ATS",
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-thermal-magnetic-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "low-voltage-panelboard-small-breaker-report",
      name: "8-Low Voltage Panelboard Small Breaker Test ATS (up to 60 individual breakers)",
      file_url: `report:/jobs/${id}/low-voltage-panelboard-small-breaker-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "medium-voltage-circuit-breaker-report",
      name: "9-Medium Voltage Circuit Breaker Test Report ATS",
      file_url: `report:/jobs/${id}/medium-voltage-circuit-breaker-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "current-transformer-test-ats-report",
      name: "12-Current Transformer Test ATS (partial, single CT)",
      file_url: `report:/jobs/${id}/current-transformer-test-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "new-current-transformer-test-ats-report",
      name: "12-Current Transformer Test ATS",
      file_url: `report:/jobs/${id}/12-current-transformer-test-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "automatic-transfer-switch-ats-report",
      name: "35-Automatic Transfer Switch ATS",
      file_url: `report:/jobs/${id}/automatic-transfer-switch-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "medium-voltage-vlf-mts-report",
      name: "4-Medium Voltage Cable VLF Test Report MTS",
      file_url: `report:/jobs/${id}/medium-voltage-vlf-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "medium-voltage-cable-vlf-test-mts",
      name: "4-Medium Voltage Cable VLF Test With Tan Delta MTS",
      file_url: `report:/jobs/${id}/medium-voltage-cable-vlf-test-mts?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "6-low-voltage-switch-maint-mts-report",
      name: "6-Low Voltage Switch Maint. MTS",
      file_url: `report:/jobs/${id}/6-low-voltage-switch-maint-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "low-voltage-circuit-breaker-electronic-trip-mts-report",
      name: "8-Low Voltage Circuit Breaker Electronic Trip Unit MTS - Primary Injection",
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-electronic-trip-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "low-voltage-circuit-breaker-thermal-magnetic-mts-report",
      name: "8-Low Voltage Circuit Breaker Thermal-Magnetic MTS",
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-thermal-magnetic-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "medium-voltage-circuit-breaker-mts-report",
      name: "9-Medium Voltage Circuit Breaker Test Report MTS",
      file_url: `report:/jobs/${id}/medium-voltage-circuit-breaker-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "12-current-transformer-test-mts-report",
      name: "12-Current Transformer Test MTS",
      file_url: `report:/jobs/${id}/12-current-transformer-test-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "13-voltage-potential-transformer-test-mts-report",
      name: "13-Voltage Potential Transformer Test MTS",
      file_url: `report:/jobs/${id}/13-voltage-potential-transformer-test-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "23-medium-voltage-motor-starter-mts-report",
      name: "23-Medium Voltage Motor Starter MTS Report",
      file_url: `report:/jobs/${id}/23-medium-voltage-motor-starter-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "23-medium-voltage-switch-mts-report",
      name: "23-Medium Voltage Switch MTS",
      file_url: `report:/jobs/${id}/23-medium-voltage-switch-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "two-small-dry-typer-xfmr-mts-report",
      name: "2-Small Dry Typer Xfmr. Inspection and Test MTS",
      file_url: `report:/jobs/${id}/two-small-dry-typer-xfmr-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "MTS",
    },
    {
      id: "gfi-trip-test-report",
      name: "Ground Fault Trip Test Report",
      file_url: `report:/jobs/${id}/gfi-trip-test-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
    {
      id: "applied-voltage-test-ats-report",
      name: "Applied Voltage Test ATS",
      file_url: `report:/jobs/${id}/applied-voltage-test-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: "ATS",
    },
  ];

  // (Manual tracker) no report slugs needed

  // Build default tracking types (from Add Asset menu templates)
  const defaultTypes = useMemo(() => {
    const typeSet = new Map<string, string>();
    const extractSlug = (fileUrl: string): string | null => {
      if (!fileUrl?.startsWith("report:/jobs/")) return null;
      const parts = fileUrl.replace("report:/jobs/", "").split("/");
      return parts[1] || null;
    };
    defaultAssets.forEach((a) => {
      const slug = extractSlug(a.file_url);
      if (slug) typeSet.set(slug, a.name);
    });
    return Array.from(typeSet.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [id]);

  // Resolve effective value_operation (legacy: negative value with add_to_total was meant to be subtract_from_remaining)
  const getValueOp = (contract: Contract) => {
    const raw = contract.value ?? 0;
    let op =
      contract.value_operation ??
      (raw >= 0 ? "add_to_total" : "subtract_from_remaining");
    if (op === "add_to_total" && raw < 0) op = "subtract_from_remaining";
    return op;
  };

  // Total Contract Value = sum of adds minus subtract_from_total
  const totalContractValue = useMemo(() => {
    return contracts.reduce((sum, contract) => {
      const raw = contract.value ?? 0;
      const amount = Math.abs(Number(raw));
      const op = getValueOp(contract);
      if (op === "add_to_total") return sum + amount;
      if (op === "subtract_from_total") return sum - amount;
      return sum;
    }, 0);
  }, [contracts]);

  // Remaining Balance Left to Bill = total - subtracts + add_to_remaining
  const remainingBalance = useMemo(() => {
    return contracts.reduce((sum, contract) => {
      const raw = contract.value ?? 0;
      const amount = Math.abs(Number(raw));
      const op = getValueOp(contract);
      if (op === "add_to_total" || op === "add_to_remaining")
        return sum + amount;
      if (op === "subtract_from_remaining" || op === "subtract_from_total")
        return sum - amount;
      return sum;
    }, 0);
  }, [contracts]);

  const [isPrinting, setIsPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState(0);
  const [printStatus, setPrintStatus] = useState("");
  const [isPublishingPortal, setIsPublishingPortal] = useState(false);
  const [portalPublishStatus, setPortalPublishStatus] = useState("");

  // Handle clicking outside the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }

    // Add event listener only if dropdown is open
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    // Clean up
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Check for tab query parameter and update the active tab
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    const filterParam = params.get("filter");

    // Report Approvals tab is admin-only; fall back to filtered Reports list
    if (tabParam === "reports" && !isAdmin && id) {
      setActiveTab("assets");
      setAssetStatusFilter("ready_for_review");
      navigate(`/jobs/${id}?tab=assets&filter=ready_for_review`, {
        replace: true,
      });
      return;
    }

    if (
      tabParam &&
      [
        "overview",
        "assets",
        "deliverables",
        "notes",
        "sla",
        "tracking",
        "reports",
        "report-audit",
        "after-action",
      ].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }

    // Handle asset status filter parameter
    if (
      filterParam &&
      [
        "all",
        "not started",
        "in_progress",
        "ready_for_review",
        "approved",
        "approved_internal_forms",
        "issue",
      ].includes(filterParam)
    ) {
      setAssetStatusFilter(
        filterParam as
          | "all"
          | "not started"
          | "in_progress"
          | "ready_for_review"
          | "approved"
          | "approved_internal_forms"
          | "issue",
      );
    }
  }, [location.search, isAdmin, id, navigate]);

  // Fetch custom form templates for Add Asset dropdown
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("custom_form_templates")
          .select("id, name, neta_section")
          .eq("is_active", true)
          .eq("is_published", true)
          .order("name");
        if (!error && data) setCustomFormTemplates(data);
        else setCustomFormTemplates([]);
      } catch {
        setCustomFormTemplates([]);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (user && id) {
      // If the hook is still loading, wait
      if (jobDetailsLoading) {
        setLoading(true);
        return;
      }

      // If there's an error, stop loading and show error
      if (jobDetailsError) {
        console.error("Error loading job details:", jobDetailsError);
        setLoading(false);
        return;
      }

      // If we have job details from the hook, use them
      if (jobDetails) {
        // Create a compatible job object from jobDetails
        const jobFromDetails: Job = {
          id: jobDetails.id,
          customer_id: jobDetails.customer?.id || "",
          title: jobDetails.title,
          description: jobDetails.description || "",
          status: jobDetails.status,
          priority: jobDetails.priority || "medium",
          job_number: jobDetails.job_number,
          start_date: jobDetails.start_date || null,
          due_date: jobDetails.due_date || null,
          budget: jobDetails.budget || null,
          division: (jobDetails as any).division || null,
          site_address: jobDetails.site_address || null,
          fireteam_lead: jobDetails.fireteam_lead || null,
          progress_billing_status:
            (jobDetails as any).progress_billing_status || null,
          estimated_man_hours: (jobDetails as any).estimated_man_hours ?? null,
          quickbooks_project_id:
            (jobDetails as any).quickbooks_project_id ?? null,
          quickbooks_project_name:
            (jobDetails as any).quickbooks_project_name ?? null,
          customers: jobDetails.customer
            ? {
                id: jobDetails.customer.id,
                name: jobDetails.customer.name,
                company_name: jobDetails.customer.company_name,
                address: (jobDetails.customer as any).address,
              }
            : {
                id: "",
                name: "",
                company_name: null,
              },
        };

        setJob(jobFromDetails);

        if (jobDetails.customer) {
          setCustomer({
            id: jobDetails.customer.id,
            name: jobDetails.customer.name,
            company_name: jobDetails.customer.company_name || "",
          });
        }

        // Still need to fetch contacts
        fetchContacts(jobDetails.customer?.id);
        setLoading(false);
      } else {
        // No job details found - stop loading
        setLoading(false);
      }

      // These fetches might still be needed if useJobDetails doesn't cover them
      fetchAssets();
      setFolderPage(1);
      fetchJobAssets();

      // Fetch related opportunity if exists
      const fetchRelatedOpportunity = async () => {
        const opportunityData = await fetchOpportunityForJob(id);
        setOpportunity(opportunityData);
      };

      fetchRelatedOpportunity();
    }
  }, [user, id, jobDetails, jobDetailsLoading, jobDetailsError]); // Depend on jobDetails and loading/error states from the hook

  useEffect(() => {
    setAdjacentJobIds({ previous: null, next: null });
  }, [id]);

  useEffect(() => {
    if (job?.id) {
      fetchAdjacentJobIds(job.id);
    }
  }, [job?.id, job?.division, location.pathname]);

  // Detect if this job is already in shortcuts
  useEffect(() => {
    const loadShortcutState = async () => {
      if (!user?.id || !id) return;
      try {
        const list = await ShortcutService.getUserShortcuts(user.id);
        const currentPath = `/jobs/${id}`;
        const found = list.find(
          (s) => s.url.endsWith(currentPath) || s.url === currentPath,
        );
        if (found) {
          setIsShortcut(true);
          setShortcutId(found.id || null);
        } else {
          setIsShortcut(false);
          setShortcutId(null);
        }
      } catch (e) {
        // ignore
      }
    };
    loadShortcutState();
  }, [user?.id, id]);

  const toggleShortcut = async () => {
    if (!user?.id || !id || shortcutBusy) return;
    setShortcutBusy(true);
    try {
      if (isShortcut && shortcutId) {
        await ShortcutService.deleteShortcut(shortcutId);
        setIsShortcut(false);
        setShortcutId(null);
        toast({
          title: "Removed from Shortcuts",
          description: "This job was removed from your shortcuts.",
        });
      } else {
        const title = job?.title
          ? `Job: ${maskJobTitle(job.title)}`
          : `Job ${id}`;
        const created = await ShortcutService.createShortcut({
          user_id: user.id,
          title,
          url: `/jobs/${id}`,
        });
        setIsShortcut(true);
        setShortcutId(created.id || null);
        toast({
          title: "Added to Shortcuts",
          description: "Quick link created under My Shortcuts.",
        });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to update shortcut",
        variant: "destructive",
      });
    } finally {
      setShortcutBusy(false);
    }
  };

  useEffect(() => {
    if (job && !editFormData) {
      console.log("Setting edit form data with dates:", {
        start_date: job.start_date,
        due_date: job.due_date,
      });

      // Use normalized dates when initializing edit form
      setEditFormData({
        ...job,
        start_date: normalizeDate(job.start_date),
        due_date: normalizeDate(job.due_date),
      });
    }
  }, [job]);

  // Helper function to normalize date format
  function normalizeDate(dateString: string | null) {
    if (!dateString) return "";
    // Convert to YYYY-MM-DD for input elements
    try {
      const date = new Date(dateString);
      return date.toISOString().split("T")[0];
    } catch (error) {
      console.error("Date normalization error:", error);
      return "";
    }
  }

  useEffect(() => {
    // Filter job assets when search query or status filter changes
    let filtered = jobAssets;

    // Apply search filter
    if (searchQuery.trim() !== "") {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter((asset) => {
        // Search in original asset name
        const matchesName = asset.name.toLowerCase().includes(searchLower);
        // Also search in dynamic name (which includes identifiers from reports)
        const dynamicName = dynamicAssetNames[asset.id] || "";
        const matchesDynamicName = dynamicName
          .toLowerCase()
          .includes(searchLower);
        // Also search in substation name
        const substationName = assetSubstations[asset.id] || "";
        const matchesSubstation = substationName
          .toLowerCase()
          .includes(searchLower);
        return matchesName || matchesDynamicName || matchesSubstation;
      });
    }

    // Apply status filter
    if (assetStatusFilter === "not started") {
      filtered = filtered.filter((asset) => asset.status === "not started");
    } else if (assetStatusFilter === "in_progress") {
      filtered = filtered.filter(
        (asset) => !asset.status || asset.status === "in_progress",
      );
    } else if (assetStatusFilter === "ready_for_review") {
      filtered = filtered.filter(
        (asset) => asset.status === "ready_for_review",
      );
    } else if (assetStatusFilter === "approved") {
      // Approved reports tab excludes internal forms (those have their own tab).
      filtered = filtered.filter(
        (asset) => asset.status === "approved" && !isInternalFormAsset(asset),
      );
    } else if (assetStatusFilter === "approved_internal_forms") {
      // Dedicated tab for approved internal forms.
      filtered = filtered.filter(
        (asset) => asset.status === "approved" && isInternalFormAsset(asset),
      );
    } else if (assetStatusFilter === "sent") {
      filtered = filtered.filter((asset) => asset.status === "sent");
    } else if (assetStatusFilter === "issue") {
      filtered = filtered.filter((asset) => asset.status === "issue");
    } else if (assetStatusFilter === "archived") {
      filtered = filtered.filter((asset) => asset.status === "archived");
    } else if (assetStatusFilter === "all") {
      // 'all' shows everything EXCEPT archived
      filtered = filtered.filter((asset) => asset.status !== "archived");
    }

    setFilteredJobAssets(filtered);
  }, [
    searchQuery,
    jobAssets,
    assetStatusFilter,
    dynamicAssetNames,
    assetSubstations,
  ]);

  // Reset folder page when tab or search changes
  useEffect(() => {
    setFolderPage(1);
  }, [assetStatusFilter, searchQuery]);

  // Filter report templates based on search
  const filteredReportTemplates =
    reportSearchQuery.trim() === ""
      ? defaultAssets
      : defaultAssets.filter((asset) =>
          asset.name.toLowerCase().includes(reportSearchQuery.toLowerCase()),
        );

  const reportAuditRows = useMemo(() => {
    return jobAssets
      .filter((asset) => {
        const fileUrl = asset.file_url || "";
        return (
          fileUrl.startsWith("report:") ||
          fileUrl.toLowerCase().endsWith(".pdf")
        );
      })
      .map((asset) => {
        const audit = reportTimestampsByAsset[asset.id] || {};
        const displayName = dynamicAssetNames[asset.id] || asset.name;

        return {
          asset,
          displayName,
          status: asset.status || "not started",
          substation: assetSubstations[asset.id] || asset.substation || "",
          submittedAt: audit.submitted_at || asset.submitted_at || null,
          submittedBy: asset.submitted_by || audit.submitted_by || null,
          approvedAt:
            audit.issued_at || audit.approved_at || asset.approved_at || null,
          approvedBy:
            asset.approved_by ||
            asset.reviewed_by ||
            audit.approved_by ||
            audit.reviewed_by ||
            null,
          sentAt: audit.sent_at || asset.sent_at || null,
          sentBy: asset.sent_by || audit.sent_by || null,
          reviewComments:
            asset.review_comments || audit.review_comments || null,
        };
      })
      .sort((a, b) => {
        const subCompare = a.substation.localeCompare(b.substation, undefined, {
          sensitivity: "base",
        });
        if (subCompare !== 0) return subCompare;
        return compareAlphanumericLabels(a.displayName, b.displayName);
      });
  }, [jobAssets, dynamicAssetNames, assetSubstations, reportTimestampsByAsset]);

  const formatAuditDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "-";
    return format(date, "MMM d, yyyy h:mm a");
  };

  const getAuditUserName = (userId?: string | null) => {
    if (!userId) return "-";
    const knownUser = users.find((u) => u.id === userId);
    const currentUserName =
      user?.id === userId
        ? user.user_metadata?.name || user.user_metadata?.full_name
        : null;
    const currentUserEmail = user?.id === userId ? user.email : null;
    const loadedName = reportAuditUsers[userId];
    return (
      knownUser?.user_metadata?.name ||
      knownUser?.user_metadata?.full_name ||
      currentUserName ||
      (loadedName && loadedName !== "Member" ? loadedName : null) ||
      knownUser?.email ||
      currentUserEmail ||
      "Unknown"
    );
  };

  const getAuditStatusLabel = (status?: string | null) => {
    switch (status) {
      case "ready_for_review":
        return "Ready for Review";
      case "in_progress":
        return "In Progress";
      case "not started":
        return "Not Started";
      case "issue":
        return "Issue";
      default:
        return status
          ? status.charAt(0).toUpperCase() + status.slice(1)
          : "Not Started";
    }
  };

  async function fetchAdjacentJobIds(currentJobId: string) {
    try {
      const pathParts = location.pathname.split("/").filter(Boolean);
      const jobsIndex = pathParts.indexOf("jobs");
      const routeDivision = jobsIndex > 0 ? pathParts[jobsIndex - 1] : null;
      const activeDivision = routeDivision || job?.division || null;

      const fetchJobsForNavigation = async (divisionFilter?: string | null) => {
        let query = supabase
          .schema("neta_ops")
          .from("jobs")
          .select("id, created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (divisionFilter) {
          if (
            divisionFilter === "field_tech" ||
            divisionFilter === "field-tech"
          ) {
            query = query.in("division", [
              "north_alabama",
              "tennessee",
              "georgia",
              "international",
            ]);
          } else {
            query = query.eq("division", divisionFilter);
          }
        }

        const { data, error } = await query.range(0, 9999);
        if (error) throw error;
        return data || [];
      };

      let jobs = await fetchJobsForNavigation(activeDivision);
      const currentIndex = jobs.findIndex(
        (row: any) => String(row.id) === currentJobId,
      );
      const fallbackToAllJobs = currentIndex === -1 || jobs.length < 2;
      if (fallbackToAllJobs && activeDivision) {
        jobs = await fetchJobsForNavigation(null);
      }

      const navigationIndex = jobs.findIndex(
        (row: any) => String(row.id) === currentJobId,
      );

      if (navigationIndex === -1) {
        return;
      }

      setAdjacentJobIds({
        previous:
          navigationIndex > 0 ? String(jobs[navigationIndex - 1].id) : null,
        next:
          navigationIndex >= 0 && navigationIndex < jobs.length - 1
            ? String(jobs[navigationIndex + 1].id)
            : null,
      });
    } catch (error) {
      console.error("Error fetching adjacent jobs:", error);
    }
  }

  async function fetchAssets() {
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (error) {
      console.error("Error fetching assets:", error);
    }
  }

  const JOB_ASSETS_BATCH_SIZE = 500;
  const FOLDER_PAGE_TARGET = 500;

  async function fetchJobAssets() {
    if (!id) return;
    try {
      // 1. Fetch ALL asset IDs in batches
      let allAssetIds: string[] = [];
      let offset = 0;
      while (true) {
        const { data: batch, error: batchError } = await supabase
          .schema("neta_ops")
          .from("job_assets")
          .select("asset_id")
          .eq("job_id", id)
          .order("asset_id", { ascending: true })
          .range(offset, offset + JOB_ASSETS_BATCH_SIZE - 1);

        if (batchError) throw batchError;
        if (!batch || batch.length === 0) break;
        allAssetIds.push(...batch.map((l) => l.asset_id));
        if (batch.length < JOB_ASSETS_BATCH_SIZE) break;
        offset += JOB_ASSETS_BATCH_SIZE;
      }

      if (allAssetIds.length === 0) {
        setTotalAssetCount(0);
        setJobAssets([]);
        setFilteredJobAssets([]);
        return;
      }

      // 2. Fetch asset details in batches
      const allAssetsData: any[] = [];
      for (let i = 0; i < allAssetIds.length; i += JOB_ASSETS_BATCH_SIZE) {
        const chunk = allAssetIds.slice(i, i + JOB_ASSETS_BATCH_SIZE);
        const { data: assetsData, error: assetsError } = await supabase
          .schema("neta_ops")
          .from("assets")
          .select(
            "id, name, file_url, created_at, status, submitted_at, approved_at, sent_at, submitted_by, approved_by, sent_by, reviewed_by, reviewed_at, review_comments, substation, urgency, template_type",
          )
          .in("id", chunk);

        if (assetsError) throw assetsError;
        if (assetsData) allAssetsData.push(...assetsData);
      }

      // Preserve same order as job_assets (allAssetIds)
      const idToAsset = new Map(allAssetsData.map((a) => [a.id, a]));
      const orderedAssets = allAssetIds
        .map((aid) => idToAsset.get(aid))
        .filter(Boolean) as any[];

      setJobAssets(orderedAssets);
      setTotalAssetCount(
        orderedAssets.filter((asset) => asset.status !== "archived").length,
      );
      setFilteredJobAssets(orderedAssets);
      setDynamicAssetNames({});

      // 3. For report assets, fetch linked report timestamps
      const reportAssetIds = orderedAssets
        .filter((a) => a.file_url?.startsWith("report:"))
        .map((a) => a.id);
      if (reportAssetIds.length > 0) {
        try {
          const { data: links, error: linksErr } = await supabase
            .schema("neta_ops")
            .from("asset_reports")
            .select("asset_id, report_id")
            .in("asset_id", reportAssetIds);
          if (linksErr) throw linksErr;

          const reportIds = Array.from(
            new Set((links || []).map((l) => l.report_id)),
          );
          const repMap = new Map<string, any>();
          for (let i = 0; i < reportIds.length; i += JOB_ASSETS_BATCH_SIZE) {
            const chunk = reportIds.slice(i, i + JOB_ASSETS_BATCH_SIZE);
            const { data: reports, error: repErr } = await supabase
              .schema("neta_ops")
              .from("technical_reports")
              .select(
                "id, submitted_at, approved_at, issued_at, sent_at, submitted_by, approved_by, sent_by, reviewed_by, reviewed_at, review_comments",
              )
              .in("id", chunk);
            if (repErr) throw repErr;
            (reports || []).forEach((r) => repMap.set(r.id, r));
          }

          const tsByAsset: Record<string, ReportAuditInfo> = {};
          (links || []).forEach((link) => {
            const r = repMap.get(link.report_id);
            if (r) {
              tsByAsset[link.asset_id] = {
                submitted_at: (r as any).submitted_at || null,
                approved_at: (r as any).approved_at || null,
                issued_at: (r as any).issued_at || null,
                sent_at: (r as any).sent_at || null,
                submitted_by: (r as any).submitted_by || null,
                approved_by: (r as any).approved_by || null,
                sent_by: (r as any).sent_by || null,
                reviewed_by: (r as any).reviewed_by || null,
                reviewed_at: (r as any).reviewed_at || null,
                review_comments: (r as any).review_comments || null,
              };
            }
          });
          setReportTimestampsByAsset(tsByAsset);
        } catch (e) {
          console.warn("Failed to fetch report timestamps for assets:", e);
        }
      } else {
        setReportTimestampsByAsset({});
      }
    } catch (error) {
      console.error("Error fetching job assets:", error);
    }
  }

  async function fetchContacts(customerId?: string) {
    if (!customerId) {
      setContacts([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .schema("common") // Add schema
        .from("contacts")
        .select("*")
        .eq("customer_id", customerId)
        .order("is_primary", { ascending: false }); // Order by primary contact first

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setContacts([]);
    }
  }

  function computeManHoursFromEstimateData(estimateData: unknown): number {
    if (!estimateData || typeof estimateData !== "object") return 0;
    const data = estimateData as Record<string, unknown>;
    let total = 0;
    const sumItems = (items: unknown): number => {
      if (!Array.isArray(items)) return 0;
      return items.reduce((acc: number, item: any) => {
        const q = Number(item?.quantity) || 0;
        const men = Number(item?.laborMen) || 0;
        const hrs = Number(item?.laborHours) || 0;
        return acc + q * men * hrs;
      }, 0);
    };
    if (data.sovItems) total += sumItems(data.sovItems);
    if (data.nonSovItems) total += sumItems(data.nonSovItems);
    return total;
  }

  async function fetchOpportunityForJob(
    jobId: string,
  ): Promise<RelatedOpportunity | null> {
    if (!jobId) return null;
    try {
      const { data, error } = await supabase
        .schema("business")
        .from("opportunities")
        .select("id, quote_number, total_man_hours")
        .eq("job_id", jobId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching related opportunity:", error);
        return null;
      }
      if (!data) return null;

      const opp = data as RelatedOpportunity;
      const storedHours =
        opp.total_man_hours != null ? Number(opp.total_man_hours) : null;
      if (storedHours != null && storedHours > 0) return opp;

      const { data: estimates, error: estError } = await supabase
        .schema("business")
        .from("estimates")
        .select("id, data")
        .eq("opportunity_id", opp.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (estError || !estimates?.length) return opp;
      const estimate = estimates[0] as { id: string; data: unknown };
      const parsed =
        typeof estimate.data === "string"
          ? (() => {
              try {
                return JSON.parse(estimate.data);
              } catch {
                return null;
              }
            })()
          : estimate.data;
      const computed = computeManHoursFromEstimateData(parsed);
      if (computed > 0) return { ...opp, total_man_hours: computed };
      return opp;
    } catch (error) {
      console.error("Catch block: Error fetching related opportunity:", error);
      return null;
    }
  }

  const handleTabChange = (tabValue: string) => {
    setActiveTab(tabValue);
  };

  const handleEditSubmit = async () => {
    if (!editFormData || !id) return;

    try {
      setError(null);

      const updatePayload: any = {
        title: editFormData.title,
        description: editFormData.description,
        status: editFormData.status,
        priority: editFormData.priority,
        start_date: editFormData.start_date,
        due_date: editFormData.due_date,
        budget: editFormData.budget,
        site_address: editFormData.site_address ?? null,
        fireteam_lead: editFormData.fireteam_lead ?? null,
        division: editFormData.division ?? null,
        submittal_job_type: editFormData.submittal_job_type ?? "standard",
        submittal_window_hours: editFormData.submittal_window_hours ?? 168,
        estimated_man_hours:
          editFormData.estimated_man_hours != null
            ? Number(editFormData.estimated_man_hours)
            : null,
        updated_at: new Date().toISOString(),
      };
      if (
        typeof editFormData.job_number === "string" &&
        editFormData.job_number.trim() !== ""
      ) {
        updatePayload.job_number = editFormData.job_number.trim();
      }

      const { data: updatedJob, error: updateError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update(updatePayload)
        .eq("id", id)
        .select("id, status")
        .single();

      if (updateError) throw updateError;
      if (!updatedJob) {
        throw new Error("Update not permitted or job not found (RLS).");
      }

      // Update the local job state with the new data
      setJob((prev) => (prev ? { ...prev, ...editFormData } : null));

      // Exit edit mode
      setIsEditing(false);
      setEditFormData(null);

      toast({
        title: "Success",
        description: "Job updated successfully!",
        variant: "success",
      });
    } catch (err) {
      console.error("Error updating job:", err);
      setError("Failed to update job. Please try again.");
    }
  };

  const handleDeleteJob = async () => {
    if (!id || !isAdmin) return;

    try {
      const { error: deleteError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (deleteError) throw deleteError;

      toast({
        title: "Success",
        description: "Job deleted successfully!",
        variant: "success",
      });

      // Navigate back to jobs list
      navigate("/jobs");
    } catch (err) {
      console.error("Error deleting job:", err);
      toast({
        title: "Error",
        description: "Failed to delete job. Please try again.",
        variant: "destructive",
      });
    } finally {
      setShowDeleteJobConfirm(false);
    }
  };

  // Handle file change for asset upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Handle file upload for adding a new asset
  const handleFileUpload = async () => {
    if (!id) {
      toast({
        title: "Error",
        description: "Job ID is missing",
        variant: "destructive",
      });
      return;
    }

    // If a report template is selected
    if (selectedAssetType !== "document") {
      const selectedReport = defaultAssets.find(
        (asset) => asset.id === selectedAssetType,
      );
      if (selectedReport) {
        // Navigate to the report page
        navigate(selectedReport.file_url.replace("report:", ""));
        return;
      }
    }

    // For document uploads
    if (!selectedFile || !newAssetName.trim()) {
      toast({
        title: "Error",
        description: "Please provide a file and asset name",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 1. Upload file to Storage
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `job-assets/${id}/${fileName}`;
      const contentType = getJobAssetUploadContentType(selectedFile);

      // Set progress to show activity
      setUploadProgress(10);

      let uploadBucket = "job-documents";
      let uploadError: any = null;

      const { error: jobDocumentsError } = await supabase.storage
        .from(uploadBucket)
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          contentType,
          upsert: false,
        });

      uploadError = jobDocumentsError;

      if (uploadError) {
        console.warn(
          "job-documents bucket failed, trying documents bucket:",
          uploadError,
        );
        uploadBucket = "documents";
        const { error: documentsError } = await supabase.storage
          .from(uploadBucket)
          .upload(filePath, selectedFile, {
            cacheControl: "3600",
            contentType,
            upsert: false,
          });
        uploadError = documentsError;
      }

      if (uploadError) throw uploadError;

      // Update progress after upload
      setUploadProgress(70);

      // 2. Get public URL for the file
      const { data: publicUrlData } = supabase.storage
        .from(uploadBucket)
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      // 3. Create asset record in database
      const { data: assetData, error: assetError } = await supabase
        .schema("neta_ops")
        .from("assets")
        .insert({
          name: newAssetName,
          file_url: publicUrl,
          created_at: new Date().toISOString(),
          status: "not started",
        })
        .select("id")
        .single();

      if (assetError) throw assetError;

      // Update progress
      setUploadProgress(90);

      // 4. Create job-asset link
      const { error: linkError } = await supabase
        .schema("neta_ops")
        .from("job_assets")
        .insert({
          job_id: id,
          asset_id: assetData.id,
        });

      if (linkError) throw linkError;

      // Complete progress
      setUploadProgress(100);

      // 5. Update the UI
      fetchAssets();
      fetchJobAssets();

      // 6. Reset form
      setSelectedFile(null);
      setNewAssetName("");
      setSelectedAssetType("document");
      setIsDropdownOpen(false);
      setShowUploadDialog(false);
      toast({
        title: "Success",
        description: "Asset added successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error uploading asset:", error);
      toast({
        title: "Error",
        description: "Failed to upload asset. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 500); // Reset after a delay to show completion
    }
  };

  // Handle report import function
  const handleImportReport = () => {
    // Create a hidden file input element
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,.amp-report";
    fileInput.style.display = "none";

    fileInput.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];

        try {
          // Read the JSON file
          const text = await file.text();
          const reportData = JSON.parse(text);

          if (!id || !user?.id) {
            toast({
              title: "Error",
              description: "Job ID or user ID is missing",
              variant: "destructive",
            });
            return;
          }

          // Import the report using the report import service
          const result = await reportImportService.importReport(
            reportData,
            id,
            user.id,
          );

          if (result.success && result.reportId) {
            // Create an asset entry for the imported report
            const assetData = {
              name: `Imported ${result.reportType || "Report"} - ${file.name.replace(".json", "").replace(".amp-report", "")}`,
              file_url: `report:/jobs/${id}/${result.reportType || "report"}/${result.reportId}`,
              user_id: user.id,
              created_at: new Date().toISOString(),
            };

            const { data: assetResult, error: assetError } = await supabase
              .schema("neta_ops")
              .from("assets")
              .insert(assetData)
              .select("id")
              .single();

            if (assetError) throw assetError;

            // Link asset to job
            await supabase.schema("neta_ops").from("job_assets").insert({
              job_id: id,
              asset_id: assetResult.id,
              user_id: user.id,
            });

            // Refresh the UI
            fetchJobAssets();

            toast({
              title: "Success",
              description: `Report imported successfully as ${result.reportType || "report"}`,
              variant: "success",
            });
          } else {
            throw new Error(result.error || "Failed to import report");
          }
        } catch (error) {
          console.error("Error importing report:", error);
          toast({
            title: "Error",
            description: `Failed to import report: ${error instanceof Error ? error.message : "Unknown error"}`,
            variant: "destructive",
          });
        }
      }
    };

    // Trigger file selection
    fileInput.click();

    // Clean up
    fileInput.remove();
  };

  // Handle PDF report file change
  const handlePdfReportFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      // Validate it's a PDF
      if (file.type !== "application/pdf") {
        toast({
          title: "Error",
          description: "Please select a PDF file",
          variant: "destructive",
        });
        return;
      }
      setPdfReportFile(file);
      // Auto-fill name from filename if name is empty
      if (!pdfReportName.trim()) {
        setPdfReportName(file.name.replace(".pdf", "").replace(".PDF", ""));
      }
    }
  };

  // Handle PDF report upload
  const handlePdfReportUpload = async () => {
    if (!id) {
      toast({
        title: "Error",
        description: "Job ID is missing",
        variant: "destructive",
      });
      return;
    }

    if (!pdfReportFile || !pdfReportName.trim()) {
      toast({
        title: "Error",
        description: "Please provide a PDF file and asset name",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingPdfReport(true);
    setPdfUploadProgress(0);

    try {
      // 1. Upload PDF file to Storage (use job-documents bucket, same as other job files)
      const fileExt = pdfReportFile.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `job-pdf-reports/${id}/${fileName}`;

      setPdfUploadProgress(10);

      // Try job-documents bucket first (standard for job-related files)
      let bucket = "job-documents";
      let uploadSuccess = false;

      const { error: err1, data: uploadData1 } = await supabase.storage
        .from(bucket)
        .upload(filePath, pdfReportFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (!err1) {
        uploadSuccess = true;
      } else {
        console.warn(
          "job-documents bucket failed, trying documents bucket:",
          err1,
        );
        // If job-documents fails, try documents bucket as fallback
        bucket = "documents";
        const { error: err2, data: uploadData2 } = await supabase.storage
          .from(bucket)
          .upload(filePath, pdfReportFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (err2) {
          console.error(
            "Both buckets failed. job-documents error:",
            err1,
            "documents error:",
            err2,
          );
          // Provide a more helpful error message
          const errorMessage =
            err2.message || err2.toString() || "Unknown storage error";
          throw new Error(
            `Failed to upload PDF: ${errorMessage}. Please check that storage buckets 'job-documents' or 'documents' exist and are accessible.`,
          );
        }
        uploadSuccess = true;
      }

      if (!uploadSuccess) {
        throw new Error("Upload failed but no error was returned");
      }

      setPdfUploadProgress(70);

      // 2. Get public URL for the file
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;
      const now = new Date().toISOString();

      // 3. Create asset record in database with status 'ready_for_review' so it appears in Reports tab
      const { data: assetData, error: assetError } = await supabase
        .schema("neta_ops")
        .from("assets")
        .insert({
          name: pdfReportName.trim(),
          file_url: publicUrl,
          substation: pdfReportSubstation.trim() || null,
          created_at: now,
          status: "ready_for_review", // Start ready for review so it appears in Reports tab
          submitted_at: now,
          submitted_by: user?.id || null,
        })
        .select("id")
        .single();

      if (assetError) throw assetError;

      setPdfUploadProgress(90);

      // 4. Create job-asset link
      const { error: linkError } = await supabase
        .schema("neta_ops")
        .from("job_assets")
        .insert({
          job_id: id,
          asset_id: assetData.id,
          user_id: user?.id || null,
        });

      if (linkError) throw linkError;

      setPdfUploadProgress(100);

      // 5. Update the UI
      fetchAssets();
      fetchJobAssets();

      // 6. Reset form
      setPdfReportFile(null);
      setPdfReportName("");
      setPdfReportSubstation("");
      setShowPdfReportUploadDialog(false);
      toast({
        title: "Success",
        description:
          "PDF report uploaded successfully. It will appear in the Reports tab for review.",
        variant: "success",
      });
    } catch (error: any) {
      console.error("Error uploading PDF report:", error);
      // Extract meaningful error message
      let errorMessage = "Unknown error";
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.error?.message) {
        errorMessage = error.error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error?.toString) {
        errorMessage = error.toString();
      }

      toast({
        title: "Error",
        description: `Failed to upload PDF report: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsUploadingPdfReport(false);
      setTimeout(() => setPdfUploadProgress(0), 500);
    }
  };

  // Handle opening edit dialog for PDF report
  const handleEditPdfReport = (asset: Asset) => {
    // Check if this is a PDF report (not a report:/ URL)
    if (
      asset.file_url &&
      !asset.file_url.startsWith("report:/") &&
      asset.file_url.toLowerCase().endsWith(".pdf")
    ) {
      setEditingPdfReport(asset);
      setEditPdfReportName(asset.name);
      // Get substation from asset if available, or from assetSubstations state
      setEditPdfReportSubstation(assetSubstations[asset.id] || "");
      setShowEditPdfReportDialog(true);
    }
  };

  // Handle saving edited PDF report
  const handleSaveEditedPdfReport = async () => {
    if (!editingPdfReport) return;

    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update({
          name: editPdfReportName.trim(),
          substation: editPdfReportSubstation.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingPdfReport.id);

      if (error) throw error;

      // Update local state
      setAssetSubstations((prev) => ({
        ...prev,
        [editingPdfReport.id]: editPdfReportSubstation.trim() || "",
      }));

      // Refresh assets
      fetchJobAssets();

      setShowEditPdfReportDialog(false);
      setEditingPdfReport(null);
      toast({
        title: "Success",
        description: "PDF report updated successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error updating PDF report:", error);
      toast({
        title: "Error",
        description: `Failed to update PDF report: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    }
  };

  // Handle batch report import function
  const handleBatchImportReport = () => {
    // Show confirmation dialog first
    const confirmed = window.confirm(
      "This will import multiple report files at once. Make sure all files are valid report JSON files. Continue?",
    );

    if (!confirmed) return;

    // Create a hidden file input element for multiple files
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,.amp-report";
    fileInput.multiple = true; // Allow multiple file selection
    fileInput.style.display = "none";

    fileInput.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const files = Array.from(target.files);

        // Update selected files state
        setSelectedBatchFiles(files);

        if (files.length === 0) {
          toast({
            title: "Error",
            description: "No files selected",
            variant: "destructive",
          });
          return;
        }

        if (!id || !user?.id) {
          toast({
            title: "Error",
            description: "Job ID or user ID is missing",
            variant: "destructive",
          });
          return;
        }

        try {
          // Set batch upload state
          setIsBatchUploading(true);
          setBatchUploadProgress(0);
          setBatchUploadStatus("Starting batch import...");

          // Show loading toast
          toast({
            title: "Processing...",
            description: `Starting batch import of ${files.length} reports...`,
            variant: "default",
          });

          // Read and parse all files
          setBatchUploadStatus("Reading and parsing files...");
          setBatchUploadProgress(10);

          const reportDataArray: any[] = [];
          const parseErrors: string[] = [];

          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
              setBatchUploadStatus(
                `Parsing file ${i + 1}/${files.length}: ${file.name}`,
              );
              setBatchUploadProgress(10 + (i / files.length) * 20);

              const text = await file.text();
              const reportData = JSON.parse(text);

              // Basic validation that this looks like a report
              if (!reportData || typeof reportData !== "object") {
                throw new Error("Invalid JSON structure");
              }

              reportDataArray.push(reportData);
            } catch (parseError) {
              const errorMsg = `Failed to parse ${file.name}: ${parseError instanceof Error ? parseError.message : "Unknown error"}`;
              console.error(errorMsg);
              parseErrors.push(errorMsg);

              toast({
                title: "Warning",
                description: `Failed to parse ${file.name}, skipping...`,
                variant: "destructive",
              });
            }
          }

          if (reportDataArray.length === 0) {
            setBatchUploadStatus("No valid report files found");
            setBatchUploadProgress(0);
            setIsBatchUploading(false);

            if (parseErrors.length > 0) {
              toast({
                title: "Error",
                description: `No valid report files found. ${parseErrors.length} files failed to parse.`,
                variant: "destructive",
              });
            } else {
              toast({
                title: "Error",
                description: "No valid report files found",
                variant: "destructive",
              });
            }
            return;
          }

          // Perform batch import
          setBatchUploadStatus("Importing reports...");
          setBatchUploadProgress(30);

          const batchResult = await reportImportService.batchImportReports(
            reportDataArray,
            id,
            user.id,
          );

          // Create asset entries for successful imports
          setBatchUploadStatus("Creating asset entries...");
          setBatchUploadProgress(60);

          for (let i = 0; i < batchResult.successful.length; i++) {
            const successItem = batchResult.successful[i];
            const fileName =
              files.find(
                (_, index) => reportDataArray[index] === successItem.data,
              )?.name || "Unknown";

            setBatchUploadStatus(
              `Creating asset ${i + 1}/${batchResult.successful.length}...`,
            );
            setBatchUploadProgress(
              60 + (i / batchResult.successful.length) * 30,
            );

            const assetData = {
              name: `Imported ${successItem.result.reportType || "Report"} - ${fileName.replace(".json", "").replace(".amp-report", "")}`,
              file_url: `report:/jobs/${id}/${successItem.result.reportType || "report"}/${successItem.result.reportId}`,
              user_id: user.id,
              created_at: new Date().toISOString(),
            };

            try {
              const { data: assetResult, error: assetError } = await supabase
                .schema("neta_ops")
                .from("assets")
                .insert(assetData)
                .select("id")
                .single();

              if (assetError) throw assetError;

              // Link asset to job
              await supabase.schema("neta_ops").from("job_assets").insert({
                job_id: id,
                asset_id: assetResult.id,
                user_id: user.id,
              });
            } catch (assetError) {
              console.error(
                "Error creating asset for imported report:",
                assetError,
              );
            }
          }

          // Complete progress
          setBatchUploadStatus("Finalizing...");
          setBatchUploadProgress(100);

          // Refresh the UI
          fetchJobAssets();

          // Show results
          if (batchResult.failed.length === 0) {
            toast({
              title: "Success",
              description: `All ${batchResult.successful.length} reports imported successfully!`,
              variant: "success",
            });
          } else {
            toast({
              title: "Partial Success",
              description: `${batchResult.successful.length} reports imported, ${batchResult.failed.length} failed. Check console for details.`,
              variant: "default",
            });
          }

          // Log detailed results
          console.log("Batch Import Results:", batchResult);

          // Log any parse errors
          if (parseErrors.length > 0) {
            console.log("Parse Errors:", parseErrors);
          }
        } catch (error) {
          console.error("Error during batch import:", error);
          toast({
            title: "Error",
            description: `Batch import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            variant: "destructive",
          });
        } finally {
          // Reset batch upload state
          setIsBatchUploading(false);
          setBatchUploadProgress(0);
          setBatchUploadStatus("");
          setSelectedBatchFiles([]);
        }
      }
    };

    // Trigger file selection
    fileInput.click();

    // Clean up
    fileInput.remove();
  };

  // Handle delete asset function
  const handleDeleteAsset = async () => {
    if (!assetToDelete || !id) {
      toast({
        title: "Error",
        description: "Unable to delete asset",
        variant: "destructive",
      });
      return;
    }

    try {
      // 1. Remove the job-asset link
      const { error: linkError } = await supabase
        .schema("neta_ops")
        .from("job_assets")
        .delete()
        .eq("job_id", id)
        .eq("asset_id", assetToDelete.id);

      if (linkError) throw linkError;

      // 2. If this is a document (not a report), delete the asset record and file
      if (!assetToDelete.file_url.startsWith("report:")) {
        // Get the storage bucket and file path from the public URL
        const url = new URL(assetToDelete.file_url);
        const publicStoragePrefix = "/storage/v1/object/public/";
        const publicStorageIndex = url.pathname.indexOf(publicStoragePrefix);
        const storagePath =
          publicStorageIndex >= 0
            ? url.pathname.substring(
                publicStorageIndex + publicStoragePrefix.length,
              )
            : "";
        const [bucket, ...filePathParts] = storagePath.split("/");
        const filePath = decodeURIComponent(filePathParts.join("/"));

        if (bucket && filePath) {
          // Delete from storage
          const { error: storageError } = await supabase.storage
            .from(bucket)
            .remove([filePath]);

          if (storageError) {
            console.error("Error deleting file from storage:", storageError);
          }
        }

        // Delete asset record
        const { error: assetError } = await supabase
          .schema("neta_ops")
          .from("assets")
          .delete()
          .eq("id", assetToDelete.id);

        if (assetError) throw assetError;
      }

      // 3. Refresh the UI
      fetchJobAssets();

      // 4. Reset state and notify user
      setAssetToDelete(null);
      setShowDeleteConfirm(false);
      toast({
        title: "Success",
        description: "Asset removed successfully",
        variant: "success",
      });
    } catch (error) {
      console.error("Error deleting asset:", error);
      toast({
        title: "Error",
        description: "Failed to delete asset. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleStatusUpdate = async (
    assetId: string,
    newStatus: Asset["status"],
  ) => {
    try {
      const asset = jobAssets.find((a) => a.id === assetId);
      if (!asset) {
        console.error("Asset not found:", assetId);
        throw new Error("Asset not found");
      }
      const currentStatus = asset?.status;

      console.log(
        `[JobDetail] Status update: ${currentStatus} -> ${newStatus} for asset ${assetId}`,
      );

      // If moving TO "ready_for_review" from Approved or Issue, confirm with the user
      if (
        newStatus === "ready_for_review" &&
        (currentStatus === "approved" || currentStatus === "issue")
      ) {
        const confirmed = confirm(
          'This will resubmit the report for approval. Are you sure you want to change the status to "Ready for Review"?',
        );
        if (!confirmed) {
          console.log("[JobDetail] User cancelled resubmission");
          return;
        }
      }

      // If moving FROM "ready_for_review" back to "in_progress", remove from approval workflow
      if (currentStatus === "ready_for_review" && newStatus === "in_progress") {
        console.log("[JobDetail] Removing asset from approval workflow");

        // Confirm with user before removing from approval workflow
        const confirmed = confirm(
          "This will remove the report from the approval workflow. " +
            'Are you sure you want to change the status back to "In Progress"?',
        );

        if (!confirmed) {
          console.log("[JobDetail] User cancelled status change");
          return; // User cancelled, don't proceed with status change
        }

        // Import the report service functions
        const { getReportByAssetId, deleteReport } =
          await import("@/lib/services/reportService");

        // Find the associated technical report
        console.log("Looking for technical report for asset ID:", assetId);
        const reportResult = await getReportByAssetId(assetId);
        console.log("Report lookup result:", reportResult);

        if (reportResult.data) {
          console.log(
            "Found technical report, attempting to delete:",
            reportResult.data.id,
          );
          // Delete the technical report and its links
          const deleteResult = await deleteReport(reportResult.data.id);
          console.log("Delete result:", deleteResult);

          if (deleteResult.error) {
            console.error(
              "Failed to remove report from approval workflow:",
              deleteResult.error,
            );
            alert(
              `Warning: Failed to remove report from approval workflow: ${deleteResult.error && typeof deleteResult.error === "object" && "message" in deleteResult.error ? (deleteResult.error as any).message : "Unknown error"}`,
            );
            // Don't throw error here - still allow status update to proceed
          } else {
            console.log("Successfully removed report from approval workflow");
            alert("Report has been removed from the approval workflow.");
          }
        } else {
          console.log("No technical report found for this asset");
          if (reportResult.error) {
            console.error(
              "Error looking up technical report:",
              reportResult.error,
            );
          }
        }
      }

      // If moving to "ready_for_review", create or update technical report entry
      if (newStatus === "ready_for_review") {
        if (asset && asset.file_url.startsWith("report:")) {
          // Import the report service functions
          const {
            getReportByAssetId,
            createDraftReport,
            submitReportForApproval,
          } = await import("@/lib/services/reportService");

          // Check if a technical report already exists for this asset
          console.log(
            "Checking for existing technical report for asset ID:",
            assetId,
          );
          const existingReportResult = await getReportByAssetId(assetId);
          console.log("Existing report lookup result:", existingReportResult);

          if (existingReportResult.data) {
            console.log(
              "Found existing technical report:",
              existingReportResult.data.id,
            );

            // If report exists but is not submitted, submit it
            if (existingReportResult.data.status !== "submitted") {
              console.log("Submitting existing report for approval");
              const submitResult = await submitReportForApproval(
                existingReportResult.data.id,
                user?.id || "",
                "Asset resubmitted for review",
              );
              if (submitResult.error) {
                throw new Error(
                  `Failed to submit existing report for approval: ${JSON.stringify(submitResult.error)}`,
                );
              }
              console.log(
                "Successfully resubmitted existing report for approval",
              );
            } else {
              console.log("Report already submitted, no action needed");
            }
          } else {
            console.log(
              "No existing report found, creating new technical report entry",
            );

            // Create a new technical report entry for approval workflow
            const reportData = {
              job_id: id!,
              title: asset.name,
              report_type: asset.template_type || "Technical Report",
              report_data: {
                asset_id: assetId,
                file_url: asset.file_url,
                asset_name: asset.name,
              },
            };

            // Create draft and immediately submit for approval
            const draftResult = await createDraftReport(
              reportData,
              user?.id || "",
            );
            if (draftResult.error) {
              throw new Error(
                `Failed to create report entry: ${JSON.stringify(draftResult.error)}`,
              );
            }

            // Submit for approval
            const submitResult = await submitReportForApproval(
              draftResult.data!.id,
              user?.id || "",
              "Asset submitted for review",
            );
            if (submitResult.error) {
              throw new Error(
                `Failed to submit for approval: ${JSON.stringify(submitResult.error)}`,
              );
            }

            // Check for existing asset_report links and clean up duplicates
            const { data: existingLinks, error: linksCheckError } =
              await supabase
                .schema("neta_ops")
                .from("asset_reports")
                .select("id")
                .eq("asset_id", assetId);

            if (!linksCheckError && existingLinks && existingLinks.length > 0) {
              console.log(
                "Found existing asset_report links, removing duplicates",
              );
              // Remove existing links to prevent duplicates
              const { error: deleteLinksError } = await supabase
                .schema("neta_ops")
                .from("asset_reports")
                .delete()
                .eq("asset_id", assetId);

              if (deleteLinksError) {
                console.warn(
                  "Warning: Failed to clean up existing asset_report links:",
                  deleteLinksError,
                );
              }
            }

            // Link asset to technical report
            const { error: linkError } = await supabase
              .schema("neta_ops")
              .from("asset_reports")
              .insert({
                asset_id: assetId,
                report_id: draftResult.data!.id,
              });

            if (linkError) {
              console.warn(
                "Warning: Failed to link asset to report:",
                linkError,
              );
            }

            console.log(
              "Successfully created and submitted new report for approval",
            );
          }
        }
      }

      // If marking as "sent", update the linked technical report to status sent and stamp sent_at
      if (newStatus === "sent") {
        if (asset && asset.file_url.startsWith("report:")) {
          const { getReportByAssetId, markReportAsSent } =
            await import("@/lib/services/reportService");
          const reportResult = await getReportByAssetId(assetId);
          if (reportResult.data) {
            try {
              const res = await markReportAsSent(
                reportResult.data.id,
                user?.id || "",
                "Report marked as sent from Linked Reports",
              );
              if (res.error) {
                console.warn(
                  "Failed to mark technical report as sent:",
                  res.error,
                );
              } else {
                // Optimistically update timestamp cache so UI reflects immediately
                const nowIso = new Date().toISOString();
                setReportTimestampsByAsset((prev) => ({
                  ...prev,
                  [assetId]: {
                    ...(prev[assetId] || {}),
                    sent_at: nowIso,
                  },
                }));
              }
            } catch (e) {
              console.warn("Error marking technical report as sent:", e);
            }
          }
        }
      }

      // Prepare update payload with timestamps
      const updatePayload: any = { status: newStatus };
      const now = new Date().toISOString();

      // Stamp submitted_at when marking as ready_for_review
      if (newStatus === "ready_for_review") {
        updatePayload.submitted_at = now;
        updatePayload.submitted_by = user?.id || null;
      }

      // Stamp approved_at when marking as approved
      if (newStatus === "approved") {
        updatePayload.approved_at = now;
        updatePayload.approved_by = user?.id || null;
        updatePayload.reviewed_by = user?.id || null;
        updatePayload.reviewed_at = now;
      }

      // Stamp sent_at when marking as sent
      if (newStatus === "sent") {
        updatePayload.sent_at = now;
        updatePayload.sent_by = user?.id || null;
        // If no approved_at exists yet, stamp it now (assume approved at same time)
        if (!asset?.approved_at) {
          updatePayload.approved_at = now;
        }
      }

      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update(updatePayload)
        .eq("id", assetId);

      if (error) {
        console.error("Error updating asset status:", error);
        throw new Error(`Failed to update status: ${error.message}`);
      }

      // Publish the report to the customer portal as a real, print-styled PDF
      // via the publish-report-pdf edge function (headless Chromium / Browserless)
      // — same output as the in-app Print button. Fire-and-forget.
      if (newStatus === "sent" && asset?.file_url?.startsWith("report:")) {
        void publishReportAssetsViaEdge([
          { id: assetId, file_url: asset.file_url, status: "sent" },
        ])
          .then(({ done, errors }) => {
            if (done > 0) toast({ title: "Published to customer portal" });
            else if (errors.length) {
              console.warn("Portal PDF publish failed:", errors[0]);
            }
          })
          .catch((e) =>
            console.warn(
              "Portal PDF publish failed:",
              e instanceof Error ? e.message : e,
            ),
          );
      }

      // Update local state with new status and timestamps
      const updatedAsset = {
        ...asset,
        status: newStatus,
        submitted_at:
          newStatus === "ready_for_review" ? now : asset.submitted_at,
        approved_at:
          newStatus === "approved"
            ? now
            : newStatus === "sent" && !asset.approved_at
              ? now
              : asset.approved_at,
        sent_at: newStatus === "sent" ? now : asset.sent_at,
        submitted_by:
          newStatus === "ready_for_review"
            ? user?.id || null
            : asset.submitted_by,
        approved_by:
          newStatus === "approved" ? user?.id || null : asset.approved_by,
        sent_by: newStatus === "sent" ? user?.id || null : asset.sent_by,
        reviewed_by:
          newStatus === "approved" ? user?.id || null : asset.reviewed_by,
        reviewed_at: newStatus === "approved" ? now : asset.reviewed_at,
      };

      setJobAssets((prev) =>
        prev.map((a) => (a.id === assetId ? updatedAsset : a)),
      );
      setFilteredJobAssets((prev) =>
        prev.map((a) => (a.id === assetId ? updatedAsset : a)),
      );

      // Refetch job assets to get the latest data from database
      await fetchJobAssets();

      // Dispatch custom event to notify other components to refresh
      console.log("[JobDetail] Dispatching assetStatusChanged event");
      window.dispatchEvent(
        new CustomEvent("assetStatusChanged", {
          detail: { assetId, newStatus, jobId: id },
        }),
      );
    } catch (error) {
      console.error("Error in handleStatusUpdate:", error);
      alert(
        `Failed to update status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleUrgencyUpdate = async (
    assetId: string,
    newUrgency: "normal" | "critical",
  ) => {
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update({ urgency: newUrgency })
        .eq("id", assetId);

      if (error) {
        console.error("Error updating asset urgency:", error);
        throw new Error(`Failed to update urgency: ${error.message}`);
      }

      // Update local state
      setJobAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, urgency: newUrgency } : a)),
      );
      setFilteredJobAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, urgency: newUrgency } : a)),
      );

      toast({
        title: "Urgency Updated",
        description: `Asset urgency set to ${newUrgency}`,
        variant: "success",
      });
    } catch (error) {
      console.error("Error in handleUrgencyUpdate:", error);
      toast({
        title: "Error",
        description: `Failed to update urgency: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    }
  };

  const handleViewComments = (asset: Asset) => {
    setSelectedAssetForComments(asset);
    setShowCommentsDialog(true);
  };

  const handleCloseCommentsDialog = () => {
    setShowCommentsDialog(false);
    setSelectedAssetForComments(null);
  };

  const getReportEditPath = (asset: Asset) => {
    const urlContent = asset.file_url.split(":/")[1];
    const pathSegments = urlContent.split("/");

    if (pathSegments[0] !== "jobs" || !pathSegments[1] || !pathSegments[2]) {
      console.error(
        "Unexpected asset.file_url format for report path:",
        asset.file_url,
        'Expected format like "report:/jobs/JOB_ID/report-slug..."',
      );
      return `/jobs/${id}`; // Fallback to current job detail page
    }

    const jobIdSegment = pathSegments[1]; // This is the job ID from the asset's URL
    let reportNameSlug = (pathSegments[2] || "").trim();

    // Clean query parameters from reportNameSlug if it's the last significant path part before query
    if (reportNameSlug.includes("?")) {
      reportNameSlug = reportNameSlug.split("?")[0].trim();
    }

    // Handle grounding reports with substation folder structure
    // Format: ['jobs', jobId, slug, substationFolder, reportId]
    const isGroundingReport =
      reportNameSlug === "grounding-system-master" ||
      reportNameSlug === "grounding-fall-of-potential-slope-method-test" ||
      reportNameSlug === "gfi-trip-test-report";
    let reportIdFromUrl = "";
    let substationFolder = "";

    if (isGroundingReport && pathSegments.length >= 5) {
      substationFolder = pathSegments[3].split("?")[0];
      reportIdFromUrl = pathSegments[4].split("?")[0];
    } else {
      reportIdFromUrl = (pathSegments[3] || "").split("?")[0];
    }

    // Comprehensive map of report slugs to their route segments
    // Keys should match the slug in defaultAssets.file_url (e.g., 'panelboard-report')
    // Values should be the route segment used in App.tsx (usually the same)
    const reportPathMap: { [key: string]: string } = {
      panelboard: "panelboard-report",
      "panelboard-report": "panelboard-report",
      "grounding-system-master": "grounding-system-master",
      "grounding-fall-of-potential-slope-method-test":
        "grounding-fall-of-potential-slope-method-test",
      "low-voltage-switch-multi-device-test":
        "low-voltage-switch-multi-device-test",
      "low-voltage-circuit-breaker-electronic-trip-ats-report":
        "low-voltage-circuit-breaker-electronic-trip-ats-report",
      "low-voltage-circuit-breaker-electronic-trip-mts-report":
        "low-voltage-circuit-breaker-electronic-trip-mts-report",
      "automatic-transfer-switch-ats-report":
        "automatic-transfer-switch-ats-report",
      "large-dry-type-transformer-mts-report":
        "large-dry-type-transformer-mts-report",
      "large-dry-type-xfmr-mts-report": "large-dry-type-xfmr-mts-report",
      "switchgear-panelboard-mts-report": "switchgear-panelboard-mts-report",
      "liquid-xfmr-visual-mts-report": "liquid-xfmr-visual-mts-report",
      "switchgear-report": "switchgear-report",
      "switchgear-switchboard-assemblies-ats25":
        "switchgear-switchboard-assemblies-ats25",
      "panelboard-assemblies-ats25": "panelboard-assemblies-ats25",
      "small-lv-dry-type-transformer-ats25":
        "small-lv-dry-type-transformer-ats25",
      "liquid-filled-xfmr-ats25": "liquid-filled-xfmr-ats25",
      "dry-type-transformer": "dry-type-transformer",
      "large-dry-type-transformer": "large-dry-type-transformer", // Added based on App.tsx routes
      "large-dry-type-transformer-report": "large-dry-type-transformer-report",
      "liquid-filled-transformer": "liquid-filled-transformer",
      "oil-inspection": "oil-inspection",
      "low-voltage-cable-test-12sets": "low-voltage-cable-test-12sets",
      "low-voltage-cable-test-20sets": "low-voltage-cable-test-20sets",
      "low-voltage-cable-test-3sets": "low-voltage-cable-test-3sets",
      "medium-voltage-vlf-tan-delta": "medium-voltage-vlf-tan-delta",
      "medium-voltage-vlf-tan-delta-mts": "medium-voltage-vlf-tan-delta-mts",
      "medium-voltage-vlf": "medium-voltage-vlf",
      "medium-voltage-cable-vlf-test": "medium-voltage-cable-vlf-test",
      "metal-enclosed-busway": "metal-enclosed-busway",
      "low-voltage-switch-report": "low-voltage-switch-report",
      "medium-voltage-switch-oil-report": "medium-voltage-switch-oil-report",
      "medium-voltage-switch-sf6": "medium-voltage-switch-sf6-report",
      "medium-voltage-switch-sf6-report": "medium-voltage-switch-sf6-report",
      "potential-transformer-ats-report": "potential-transformer-ats-report",
      "low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report":
        "low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report",
      "low-voltage-circuit-breaker-thermal-magnetic-ats-report":
        "low-voltage-circuit-breaker-thermal-magnetic-ats-report",
      "low-voltage-circuit-breaker-thermal-magnetic-mts-report":
        "low-voltage-circuit-breaker-thermal-magnetic-mts-report",
      "lv-molded-case-circuit-breaker-ats25":
        "lv-molded-case-circuit-breaker-ats25",
      "emergency-systems-engine-generator-ats25":
        "emergency-systems-engine-generator-ats25",
      "6-low-voltage-switch-maint-mts-report":
        "6-low-voltage-switch-maint-mts-report",
      "low-voltage-panelboard-small-breaker-report":
        "low-voltage-panelboard-small-breaker-report",
      "medium-voltage-circuit-breaker-report":
        "medium-voltage-circuit-breaker-report",
      "current-transformer-test-ats-report":
        "current-transformer-test-ats-report",
      "12-current-transformer-test-ats-report":
        "12-current-transformer-test-ats-report",
      "oil-analysis-report": "oil-analysis-report", // Added based on App.tsx routes
      "cable-hipot-test-report": "cable-hipot-test-report", // Added based on App.tsx routes
      "relay-test-report": "relay-test-report", // Added based on App.tsx routes
      "two-small-dry-typer-xfmr-ats-report":
        "two-small-dry-typer-xfmr-ats-report",
      "medium-voltage-vlf-mts-report": "medium-voltage-vlf-mts-report",
      "electrical-tan-delta-test-mts-form":
        "electrical-tan-delta-test-mts-form",
      "medium-voltage-cable-vlf-test-mts": "medium-voltage-cable-vlf-test-mts",
      "medium-voltage-circuit-breaker-mts-report":
        "medium-voltage-circuit-breaker-mts-report",
      "12-current-transformer-test-mts-report":
        "12-current-transformer-test-mts-report",
      "13-voltage-potential-transformer-test-mts-report":
        "13-voltage-potential-transformer-test-mts-report",
      "23-medium-voltage-motor-starter-mts-report":
        "23-medium-voltage-motor-starter-mts-report",
      "23-medium-voltage-switch-mts-report":
        "23-medium-voltage-switch-mts-report",
      "two-small-dry-typer-xfmr-mts-report":
        "two-small-dry-typer-xfmr-mts-report",
      "gfi-trip-test-report": "gfi-trip-test-report",
      "applied-voltage-test-ats-report": "applied-voltage-test-ats-report",
      "job-hazard-analysis-form": "job-hazard-analysis-form",
    };

    const mappedReportName =
      reportPathMap[reportNameSlug] ??
      (INTERNAL_FORM_SLUGS.has(reportNameSlug) ? reportNameSlug : undefined);

    if (!mappedReportName) {
      console.error(
        "Unknown report type for path mapping. Slug:",
        reportNameSlug,
        "Original URL:",
        asset.file_url,
        "Asset ID:",
        asset.id,
      );
      return `/jobs/${id}`; // Fallback
    }

    // Check if the asset is a template (for creating a new report) or an existing report.
    // Templates from defaultAssets typically won't have a reportId in their file_url path.
    // Existing assets (from jobAssets) will have a file_url like 'report:/jobs/JOB_ID/slug/REPORT_ID'.

    // A simple way to check if it's a template link: if asset.id is one of the predefined template IDs in defaultAssets
    const isTemplate = defaultAssets.some(
      (da) => da.id === asset.id && da.file_url.startsWith("report:"),
    );

    if (isTemplate || !reportIdFromUrl) {
      // For templates (new reports), navigate to the path without a reportId segment.
      // The jobIdSegment here is the current job's ID passed via the template literal in defaultAssets
      return `/jobs/${jobIdSegment}/${mappedReportName}`;
    } else if (reportIdFromUrl) {
      // For existing reports that have an ID in their URL structure.
      // Add returnToAssets=true so that when users navigate back, they go to the assets tab
      // Include substation folder in path if present (for grounding reports)
      if (substationFolder) {
        return `/jobs/${jobIdSegment}/${mappedReportName}/${substationFolder}/${reportIdFromUrl}?returnToAssets=true`;
      } else {
        return `/jobs/${jobIdSegment}/${mappedReportName}/${reportIdFromUrl}?returnToAssets=true`;
      }
    }

    return `/jobs/${jobIdSegment}/${mappedReportName}`;
  };

  // Helper: derive current identifier and substation for a report asset to compute display name and grouping
  useEffect(() => {
    (async () => {
      if (!jobAssets || jobAssets.length === 0) return;
      const nameUpdates: Record<string, string> = {};
      const substationUpdates: Record<string, string> = {};

      // First, load substations from database for PDF reports and other assets that have it stored
      jobAssets.forEach((asset) => {
        // Check if asset has substation field in database (for PDF reports)
        if (
          (asset as any).substation &&
          typeof (asset as any).substation === "string"
        ) {
          const sub = (asset as any).substation.trim();
          if (sub) {
            substationUpdates[asset.id] = sub;
          }
        }
      });

      // Map report route slug to table name used for storage
      const slugToTable: Record<string, string> = {
        "switchgear-switchboard-assemblies-ats25":
          "switchgear_switchboard_ats25_reports",
        "panelboard-assemblies-ats25": "panelboard_assemblies_ats25_reports",
        "small-lv-dry-type-transformer-ats25":
          "small_lv_dry_type_transformer_ats25_reports",
        "liquid-filled-xfmr-ats25": "liquid_filled_xfmr_ats25_reports",
        "panelboard-report": "panelboard_reports",
        "switchgear-report": "switchgear_reports",
        "dry-type-transformer": "transformer_reports",
        "large-dry-type-transformer-report": "large_transformer_reports",
        "large-dry-type-transformer": "large_transformer_reports",
        "large-dry-type-transformer-mts-report":
          "large_dry_type_transformer_mts_reports",
        "large-dry-type-xfmr-mts-report":
          "large_dry_type_transformer_mts_reports",
        "liquid-xfmr-visual-mts-report": "liquid_xfmr_visual_mts_reports",
        "low-voltage-switch-report": "low_voltage_switch_reports",
        "medium-voltage-switch-oil-report": "medium_voltage_switch_oil_reports",
        "medium-voltage-switch-sf6": "medium_voltage_switch_sf6_reports",
        "medium-voltage-switch-sf6-report": "medium_voltage_switch_sf6_reports",
        "potential-transformer-ats-report": "potential_transformer_ats_reports",
        "low-voltage-panelboard-small-breaker-report":
          "low_voltage_panelboard_small_breaker_reports",
        "medium-voltage-circuit-breaker-report":
          "medium_voltage_circuit_breaker_reports",
        "medium-voltage-circuit-breaker-mts-report":
          "medium_voltage_circuit_breaker_mts_reports",
        "medium-voltage-vlf-mts-report": "medium_voltage_vlf_mts_reports",
        "medium-voltage-cable-vlf-test-mts": "medium_voltage_vlf_mts_reports",
        "medium-voltage-vlf": "medium_voltage_vlf_mts_reports",
        "medium-voltage-vlf-tan-delta": "tandelta_reports",
        "medium-voltage-vlf-tan-delta-mts": "tandelta_mts_reports",
        "electrical-tan-delta-test-mts-form": "tandelta_mts_reports",
        "medium-voltage-cable-vlf-test": "medium_voltage_cable_vlf_test",
        "current-transformer-test-ats-report":
          "current_transformer_test_ats_reports",
        "12-current-transformer-test-ats-report":
          "current_transformer_test_ats_reports",
        "12-current-transformer-test-mts-report":
          "current_transformer_test_mts_reports",
        "13-voltage-potential-transformer-test-mts-report":
          "voltage_potential_transformer_mts_reports",
        "23-medium-voltage-motor-starter-mts-report":
          "medium_voltage_motor_starter_mts_reports",
        "23-medium-voltage-switch-mts-report":
          "medium_voltage_switch_mts_reports",
        "metal-enclosed-busway": "metal_enclosed_busway_reports",
        "low-voltage-circuit-breaker-thermal-magnetic-mts-report":
          "low_voltage_circuit_breaker_thermal_magnetic_mts_reports",
        "lv-molded-case-circuit-breaker-ats25":
          "lv_molded_case_circuit_breaker_ats25",
        "emergency-systems-engine-generator-ats25":
          "emergency_systems_engine_generator_ats25",
        // ATS/Primary/Secondary injection variants
        "low-voltage-circuit-breaker-electronic-trip-ats-report":
          "low_voltage_circuit_breaker_electronic_trip_ats",
        "low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report":
          "low_voltage_circuit_breaker_electronic_trip_ats",
        "low-voltage-circuit-breaker-thermal-magnetic-ats-report":
          "low_voltage_circuit_breaker_thermal_magnetic_ats",
        "automatic-transfer-switch-ats-report":
          "automatic_transfer_switch_ats_reports",
        "gfi-trip-test-report": "gfi_trip_test_reports",
        "low-voltage-circuit-breaker-electronic-trip-mts-report":
          "low_voltage_circuit_breaker_electronic_trip_mts",
        "low-voltage-circuit-breaker-electronic-trip-mts":
          "low_voltage_circuit_breaker_electronic_trip_mts",
        "low-voltage-circuit-breaker-electronic-trip-unit-mts":
          "low_voltage_circuit_breaker_electronic_trip_mts",
        "two-small-dry-typer-xfmr-mts-report":
          "two_small_dry_type_xfmr_mts_reports",
        // Best-effort mappings for cable reports stored in legacy tables
        "low-voltage-cable-test-3sets": "low_voltage_cable_test_3sets",
        "low-voltage-cable-test-12sets": "low_voltage_cable_test_12sets",
        "low-voltage-cable-test-20sets": "transformer_reports",
        "low-voltage-switch-multi-device-test":
          "low_voltage_switch_multi_device_reports",
        "two-small-dry-typer-xfmr-ats-report":
          "two_small_dry_type_xfmr_ats_reports",
        "switchgear-panelboard-mts-report": "switchgear_panelboard_mts_reports",
        "liquid-filled-transformer": "liquid_filled_transformer_reports",
        "oil-inspection": "oil_inspection_reports",
        "grounding-system-master": "grounding_system_master_reports",
        "grounding-fall-of-potential-slope-method-test":
          "grounding_fall_of_potential_slope_method_test_reports",
        "standard-report": "standard_reports",
        "6-low-voltage-switch-maint-mts-report":
          "low_voltage_switch_maint_mts_reports",
        "applied-voltage-test-ats-report": "applied_voltage_test_ats_reports",
        // Likely table names (if present). Failures will be ignored.
      };

      // Extract canonical route slug from a computed edit path
      const extractCanonicalSlugFromPath = (path: string): string | null => {
        try {
          const noQuery = path.split("?")[0];
          const parts = noQuery.split("/");
          // Expect: /jobs/{jobId}/{slug}/...
          return parts.length >= 4 ? parts[3] : null;
        } catch {
          return null;
        }
      };

      const slugFallbackTables: Record<string, string[]> = {
        "low-voltage-panelboard-small-breaker-report": [
          "low_voltage_cable_test_3sets",
        ],
        "low-voltage-switch-multi-device-test": [
          "low_voltage_cable_test_3sets",
        ],
        "medium-voltage-vlf-mts-report": ["medium_voltage_cable_vlf_test"],
        "medium-voltage-cable-vlf-test-mts": ["medium_voltage_cable_vlf_test"],
        "low-voltage-circuit-breaker-electronic-trip-mts-report": [
          "low_voltage_cable_test_3sets",
        ],
        "low-voltage-circuit-breaker-thermal-magnetic-ats-report": [
          "low_voltage_cable_test_3sets",
        ],
      };

      const tasks = jobAssets.map(async (asset) => {
        try {
          if (!asset.file_url || !asset.file_url.startsWith("report:")) return;

          // Parse from original file_url first
          const urlContent = asset.file_url.split(":/")[1] || "";
          const parts = urlContent.split("/");
          // parts can be:
          // ['jobs', jobId, slug, reportId] (old format)
          // ['jobs', jobId, slug, substationFolder, reportId] (new format with substation)
          if (parts[0] !== "jobs" || !parts[2]) return;
          let slug = parts[2].split("?")[0];

          // Check if this is a grounding report with substation folder
          const isGroundingReport =
            slug === "grounding-system-master" ||
            slug === "grounding-fall-of-potential-slope-method-test" ||
            slug === "gfi-trip-test-report";
          let reportIdFromUrl = "";
          let substationFromUrl = "";

          if (isGroundingReport && parts.length >= 5) {
            // New format: ['jobs', jobId, slug, substationFolder, reportId]
            substationFromUrl = (parts[3] || "").split("?")[0];
            reportIdFromUrl = (parts[4] || "").split("?")[0];
          } else {
            // Old format: ['jobs', jobId, slug, reportId]
            reportIdFromUrl = (parts[3] || "").split("?")[0];
          }

          if (!reportIdFromUrl) return; // Template-like link, nothing to resolve

          // Canonicalize slug via edit path (handles aliasing)
          const editPath = getReportEditPath(asset);
          const canonicalSlug = extractCanonicalSlugFromPath(editPath) || slug;
          slug = canonicalSlug;

          const primaryTable = slugToTable[slug];
          if (!primaryTable) return;

          const tablesToTry = [
            primaryTable,
            ...(slugFallbackTables[slug] || []),
          ];
          let data: any = null;
          for (const t of tablesToTry) {
            const { data: d } = await supabase
              .schema("neta_ops")
              .from(t)
              .select("*")
              .eq("id", reportIdFromUrl)
              .maybeSingle();
            if (d) {
              data = d;
              break;
            }
          }
          if (!data) return;

          // Heuristics to find current identifier
          // Check direct field first (for GFI Trip Test and similar reports that store identifier directly)
          // Also check variations like breakerIdentifier, eqptIdentifier used by different reports
          const identifier =
            data.identifier ||
            data.eqpt_location ||
            data.breakerIdentifier ||
            data.eqptIdentifier ||
            (data.report_info &&
              (data.report_info.identifier ||
                data.report_info.eqptLocation ||
                data.report_info.location ||
                data.report_info.breakerIdentifier ||
                data.report_info.eqptIdentifier)) ||
            (data.report_data &&
              (data.report_data.identifier ||
                data.report_data.eqptLocation ||
                data.report_data.location ||
                data.report_data.breakerIdentifier ||
                data.report_data.eqptIdentifier ||
                (data.report_data.reportInfo &&
                  (data.report_data.reportInfo.identifier ||
                    data.report_data.reportInfo.eqptLocation ||
                    data.report_data.reportInfo.location ||
                    data.report_data.reportInfo.breakerIdentifier)))) ||
            (data.data &&
              (data.data.identifier ||
                data.data.eqptLocation ||
                data.data.location ||
                data.data.equipment_location ||
                data.data.breakerIdentifier ||
                data.data.eqptIdentifier ||
                (data.data.reportInfo &&
                  (data.data.reportInfo.identifier ||
                    data.data.reportInfo.eqptLocation ||
                    data.data.reportInfo.location ||
                    data.data.reportInfo.breakerIdentifier)))) ||
            "";

          if (identifier && typeof identifier === "string") {
            const display = getAssetName(slug, identifier);
            nameUpdates[asset.id] = display;
          }

          // Derive substation for grouping.
          // First check if we already have it from database (for PDF reports).
          let substation = substationUpdates[asset.id] || "";

          if (!substation) {
            // Always prefer the substation as stored on the report itself — this is the
            // authoritative, unmangled value the technician actually entered (e.g. "P2(I)").
            // The URL folder segment is only a fallback because legacy grounding reports
            // sanitized it lossily (`p2_i_`), which would otherwise create phantom groups
            // like "p2 i" that don't merge with new reports saved as "P2(I)".
            const fromReportData =
              data.substation ||
              (data.report_info &&
                (data.report_info.substation ||
                  data.report_info.location ||
                  (data.report_info.jobInfo &&
                    data.report_info.jobInfo.substation))) ||
              (data.report_data &&
                (data.report_data.substation ||
                  (data.report_data.jobInfo &&
                    data.report_data.jobInfo.substation) ||
                  (data.report_data.reportInfo &&
                    (data.report_data.reportInfo.substation ||
                      data.report_data.reportInfo.location)))) ||
              (data.data &&
                (data.data.substation ||
                  data.data.location ||
                  (data.data.jobInfo && data.data.jobInfo.substation) ||
                  (data.data.reportInfo &&
                    (data.data.reportInfo.substation ||
                      data.data.reportInfo.location)))) ||
              "";

            if (
              fromReportData &&
              typeof fromReportData === "string" &&
              fromReportData.trim()
            ) {
              substation = fromReportData;
            } else if (substationFromUrl && substationFromUrl !== "general") {
              // Fall back to the URL folder segment. Decode both legacy (lossy) and new
              // (encodeURIComponent) formats:
              //   - Legacy: lowercased and stripped of special chars, e.g. "main_substation".
              //   - New: properly URL-encoded, e.g. "P2(I)" or "Main%20Substation".
              if (/^[a-z0-9_-]+$/.test(substationFromUrl)) {
                substation = substationFromUrl.replace(/_/g, " ");
              } else {
                try {
                  substation = decodeURIComponent(substationFromUrl);
                } catch {
                  substation = substationFromUrl;
                }
              }
            }
          }

          if (typeof substation === "string") {
            const normalized = substation.trim();
            if (normalized) {
              substationUpdates[asset.id] = normalized;
            }
          }
        } catch (e) {
          // Ignore per-asset failures; keep original name
        }
      });

      await Promise.all(tasks);
      if (Object.keys(nameUpdates).length > 0) {
        setDynamicAssetNames((prev) => ({ ...prev, ...nameUpdates }));
      }
      if (Object.keys(substationUpdates).length > 0) {
        setAssetSubstations((prev) => ({ ...prev, ...substationUpdates }));
      }
    })();
  }, [jobAssets]);

  // Contract Management Functions
  const fetchContracts = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("job_contracts")
        .select("*")
        .eq("job_id", id)
        .order("uploaded_date", { ascending: false });

      if (error) {
        // Gracefully handle missing relation in environments where migrations haven't run yet
        if ((error as any).code === "42P01") {
          console.warn("job_contracts table not found; treating as empty.");
          setContracts([]);
          return;
        }
        throw error;
      }
      setContracts(data || []);
    } catch (error) {
      console.error("Error fetching contracts:", error);
    }
  };

  const handleContractUpload = async () => {
    if (!user?.id || !id) return;

    // Validate action value when provided
    const numValue = contractForm.value.trim()
      ? parseFloat(contractForm.value)
      : NaN;
    if (contractForm.value.trim() && (isNaN(numValue) || numValue <= 0)) {
      toast({
        title: "Error",
        description: "Please enter a valid action value greater than 0",
        variant: "destructive",
      });
      return;
    }

    setIsContractUploading(true);
    try {
      let publicUrl: string | null = null;
      let filePath: string | null = null;
      let file_type: string | null = null;
      let file_size: number | null = null;

      if (contractFile) {
        const fileExt = contractFile.name.split(".").pop();
        const fileName = `${Date.now()}.${fileExt}`;
        filePath = `contracts/${id}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("job-documents")
          .upload(filePath, contractFile);
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl: url },
        } = supabase.storage.from("job-documents").getPublicUrl(filePath);
        publicUrl = url;
        file_type = contractFile.type;
        file_size = contractFile.size;
      }

      const amount =
        contractForm.value.trim() && !isNaN(numValue)
          ? Math.abs(numValue)
          : null;
      // Always send value_operation so the DB doesn't default to 'add_to_total' (which broke subtract_from_remaining).
      // Store value as positive; meaning comes from value_operation.
      const contractData: Record<string, unknown> = {
        job_id: id,
        user_id: user.id,
        name: contractForm.name.trim() || (contractFile?.name ?? "Action"),
        type: contractForm.type,
        description: contractForm.description || null,
        file_url: publicUrl ?? "",
        file_path: filePath ?? "",
        file_type: file_type,
        file_size: file_size,
        status: "pending",
        value: amount,
        value_operation: contractForm.value_operation,
        start_date: contractForm.start_date || null,
        end_date: contractForm.end_date || null,
      };

      const { error: insertError } = await supabase
        .schema("neta_ops")
        .from("job_contracts")
        .insert(contractData);

      if (insertError) throw insertError;

      setContractForm({
        name: "",
        type: "main",
        description: "",
        value: "",
        value_operation: "add_to_total",
        start_date: "",
        end_date: "",
      });
      setContractFile(null);
      setShowContractUpload(false);
      await fetchContracts();

      toast({
        title: "Success",
        description: "Action added successfully!",
        variant: "success",
      });
    } catch (error: unknown) {
      console.error("Error adding action:", error);
      const message =
        (error as { message?: string })?.message ?? "Failed to add action";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsContractUploading(false);
    }
  };

  // Drawing Management Functions
  const fetchOneLineDrawings = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("one_line_drawings")
        .select("*")
        .eq("job_id", id)
        .order("created_at", { ascending: false });

      if (error) {
        if ((error as any).code === "42P01") {
          console.warn("one_line_drawings table not found; treating as empty.");
          setOneLineDrawings([]);
          return;
        }
        throw error;
      }
      setOneLineDrawings(data || []);
    } catch (error) {
      console.error("Error fetching drawings:", error);
    }
  };

  const handleDrawingUpload = async () => {
    if (!drawingFile || !user?.id || !id) return;

    setIsDrawingUploading(true);
    try {
      // Upload file to Supabase Storage
      const fileExt = drawingFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("one-line-drawings")
        .upload(filePath, drawingFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("one-line-drawings").getPublicUrl(filePath);

      // Save drawing record
      const drawingData = {
        job_id: id,
        user_id: user.id,
        name: drawingForm.name || drawingFile.name,
        description: drawingForm.description || null,
        file_url: publicUrl,
        file_path: filePath,
        file_type: drawingFile.type,
        file_size: drawingFile.size,
        version: "1.0",
        is_current: true,
      };

      const { error: insertError } = await supabase
        .schema("neta_ops")
        .from("one_line_drawings")
        .insert(drawingData);

      if (insertError) throw insertError;

      // Reset form and refresh drawings
      setDrawingForm({
        name: "",
        description: "",
      });
      setDrawingFile(null);
      setShowDrawingUpload(false);
      await fetchOneLineDrawings();

      toast({
        title: "Success",
        description: "Drawing uploaded successfully!",
        variant: "success",
      });
    } catch (error) {
      console.error("Error uploading drawing:", error);
      toast({
        title: "Error",
        description: "Failed to upload drawing",
        variant: "destructive",
      });
    } finally {
      setIsDrawingUploading(false);
    }
  };

  const handleDrawingView = (drawing: OneLineDrawing) => {
    setSelectedDrawing(drawing);
    setShowDrawingViewer(true);
  };

  // Miscellaneous Documents Functions
  const fetchMiscellaneousDocuments = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("miscellaneous_documents")
        .select("*")
        .eq("job_id", id)
        .order("created_at", { ascending: false });

      if (error) {
        if ((error as any).code === "42P01") {
          console.warn(
            "miscellaneous_documents table not found; treating as empty.",
          );
          setMiscellaneousDocuments([]);
          return;
        }
        throw error;
      }
      setMiscellaneousDocuments(data || []);
    } catch (error) {
      console.error("Error fetching miscellaneous documents:", error);
    }
  };

  const handleMiscUpload = async () => {
    if (!miscFile || !user?.id || !id) return;

    setIsMiscUploading(true);
    try {
      // Upload file to Supabase Storage
      const fileExt = miscFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `miscellaneous/${id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("job-documents")
        .upload(filePath, miscFile);

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(
          `Storage error: ${uploadError.message || "Failed to upload file"}`,
        );
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("job-documents").getPublicUrl(filePath);

      // Save document record
      const documentData = {
        job_id: id,
        user_id: user.id,
        name: miscForm.name || miscFile.name,
        description: miscForm.description || null,
        file_url: publicUrl,
        file_path: filePath,
        file_type: miscFile.type,
        file_size: miscFile.size,
      };

      const { error: insertError } = await supabase
        .schema("neta_ops")
        .from("miscellaneous_documents")
        .insert(documentData);

      if (insertError) {
        console.error("Database insert error:", insertError);
        // Check if table doesn't exist
        if ((insertError as any).code === "42P01") {
          throw new Error(
            "The miscellaneous_documents table does not exist. Please create it in the database first.",
          );
        }
        throw new Error(
          `Database error: ${insertError.message || "Failed to save document record"}`,
        );
      }

      // Reset form and refresh documents
      setMiscForm({
        name: "",
        description: "",
      });
      setMiscFile(null);
      setShowMiscUpload(false);
      await fetchMiscellaneousDocuments();

      toast({
        title: "Success",
        description: "Document uploaded successfully!",
        variant: "success",
      });
    } catch (error: any) {
      console.error("Error uploading document:", error);
      const errorMessage =
        error?.message ||
        "Failed to upload document. Please check the console for details.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsMiscUploading(false);
    }
  };

  const handleMiscView = (document: MiscellaneousDocument) => {
    setSelectedMiscDocument(document);
    setShowMiscViewer(true);
  };

  const handleMiscDelete = async (documentId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this document? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      // First get the document to know the file path for storage cleanup
      const documentToDelete = miscellaneousDocuments.find(
        (d) => d.id === documentId,
      );

      // Delete from database
      const { error: deleteError } = await supabase
        .schema("neta_ops")
        .from("miscellaneous_documents")
        .delete()
        .eq("id", documentId);

      if (deleteError) throw deleteError;

      // Try to delete from storage (optional - don't fail if this fails)
      if (documentToDelete?.file_path) {
        try {
          await supabase.storage
            .from("job-documents")
            .remove([documentToDelete.file_path]);
        } catch (storageError) {
          console.warn("Could not delete file from storage:", storageError);
          // Don't throw - database deletion succeeded
        }
      }

      await fetchMiscellaneousDocuments();
      toast({
        title: "Success",
        description: "Document deleted successfully!",
        variant: "success",
      });
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const handleContractDelete = async (contractId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this action? This cannot be undone.",
      )
    ) {
      return;
    }

    try {
      // First get the contract to know the file path for storage cleanup
      const contractToDelete = contracts.find((c) => c.id === contractId);

      // Delete from database
      const { error: deleteError } = await supabase
        .schema("neta_ops")
        .from("job_contracts")
        .delete()
        .eq("id", contractId);

      if (deleteError) throw deleteError;

      // Try to delete from storage (optional - don't fail if this fails)
      if (contractToDelete?.file_path) {
        try {
          await supabase.storage
            .from("job-documents")
            .remove([contractToDelete.file_path]);
        } catch (storageError) {
          console.warn("Could not delete file from storage:", storageError);
          // Don't throw - database deletion succeeded
        }
      }

      // Refresh the contracts list
      await fetchContracts();

      toast({
        title: "Success",
        description: "Contract deleted successfully!",
        variant: "success",
      });
    } catch (error) {
      console.error("Error deleting contract:", error);
      toast({
        title: "Error",
        description: "Failed to delete contract",
        variant: "destructive",
      });
    }
  };

  // Add to useEffect to fetch contracts and drawings
  useEffect(() => {
    if (user && id) {
      fetchContracts();
      fetchOneLineDrawings();
      fetchMiscellaneousDocuments();
      fetchUsers(); // Fetch users for fireteam lead selection
    }
  }, [user, id]);

  // Close fireteam lead selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isFireteamLeadSelectorOpen) {
        const target = event.target as Element;
        if (!target.closest(".fireteam-lead-selector")) {
          setIsFireteamLeadSelectorOpen(false);
          setUserSearchQuery("");
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFireteamLeadSelectorOpen]);

  // Publish report assets to the customer portal as real, print-styled PDFs via
  // the publish-report-pdf edge function (headless Chromium / Browserless) —
  // same output as the in-app Print button. The function resolves the job +
  // customer itself, so we only pass asset ids. Renders sequentially.
  const publishReportAssetsViaEdge = async (
    reportAssets: { id: string; file_url?: string | null; status?: string | null }[],
    onStatus?: (status: string) => void,
  ): Promise<{ done: number; failed: number; errors: string[] }> => {
    const targets = reportAssets.filter(
      (a) =>
        a.file_url?.startsWith("report:") &&
        ["approved", "sent"].includes(String(a.status || "").toLowerCase()),
    );
    let done = 0;
    let failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      onStatus?.(`Publishing ${i + 1} of ${targets.length}…`);
      try {
        const { data, error } = await supabase.functions.invoke(
          "publish-report-pdf",
          { body: { assetId: targets[i].id } },
        );
        if (error) throw error;
        if ((data as { error?: string })?.error) {
          throw new Error((data as { error?: string }).error);
        }
        done++;
      } catch (e) {
        failed++;
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return { done, failed, errors };
  };

  // Backfill: render + upload PDFs for this job's approved/sent reports so the
  // customer portal can display them. Covers reports that were marked Sent before
  // the on-send auto-publish existed.
  const handlePublishReportsToPortal = async () => {
    if (isPublishingPortal) return;
    const customerId = customer?.id || job?.customers?.id;
    if (!customerId || !id) {
      toast({
        title: "Missing customer",
        description: "This job has no linked customer to publish reports for.",
        variant: "destructive",
      });
      return;
    }
    setIsPublishingPortal(true);
    setPortalPublishStatus("Starting…");
    try {
      const { done, failed, errors } = await publishReportAssetsViaEdge(
        jobAssets,
        (status) => setPortalPublishStatus(status),
      );
      if (failed > 0) {
        console.warn("Portal publish errors:", errors);
        toast({
          title: `Published ${done}, ${failed} failed`,
          description: errors[0] || "Some reports could not be published.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Reports published to portal",
          description: `${done} report(s) are now viewable by the customer.`,
        });
      }
    } catch (e) {
      toast({
        title: "Publish failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsPublishingPortal(false);
      setPortalPublishStatus("");
    }
  };

  // Fire-and-forget portal publish used by the bulk "mark as sent" actions so
  // the customer portal (ampOS ACCESS) gets downloadable PDFs without blocking
  // the status UI. Mirrors the on-send publish in handleStatusUpdate.
  const publishSentReportsToPortal = (
    assets: { id: string; file_url?: string | null; status?: string | null }[],
  ) => {
    const customerId = customer?.id || job?.customers?.id;
    const reportAssets = assets.filter((a) => a.file_url?.startsWith("report:"));
    if (!customerId || !id || reportAssets.length === 0) {
      if (!customerId && reportAssets.length > 0) {
        console.warn(
          "Portal publish skipped: job has no linked customer for reports",
        );
      }
      return;
    }
    void publishReportAssetsViaEdge(reportAssets)
      .then(({ done, failed, errors }) => {
        if (failed > 0) console.warn("Portal publish errors:", errors);
        if (done > 0) {
          toast({
            title: "Published to customer portal",
            description: `${done} report PDF(s) are now downloadable in ampOS ACCESS.`,
          });
        }
      })
      .catch((e) =>
        console.warn(
          "Portal PDF publish failed:",
          e instanceof Error ? e.message : e,
        ),
      );
  };

  const handlePrintAllApprovedReports = async () => {
    // Prevent multiple simultaneous print operations
    if (isPrinting) {
      return;
    }

    setIsPrinting(true);
    setPrintProgress(0);
    setPrintStatus("");

    try {
      const approvedAssets = jobAssets.filter(
        (asset) =>
          asset.status === "approved" && asset.file_url?.startsWith("report:"),
      );

      if (approvedAssets.length === 0) {
        toast({
          title: "No Approved Reports",
          description: "There are no approved reports to print.",
          variant: "destructive",
        });
        return;
      }

      await pdfExportService.batchPrintApprovedReports(
        approvedAssets,
        (progress: number, status: string) => {
          setPrintProgress(progress);
          setPrintStatus(status);
        },
        dynamicAssetNames,
      );

      toast({
        title: "PDF Generation Complete",
        description: `Successfully generated ${approvedAssets.length} PDF reports.`,
      });
    } catch (error: any) {
      console.error("Error printing reports:", error);
      toast({
        title: "Print Failed",
        description:
          error.message || "An unknown error occurred during printing.",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
      setPrintProgress(0);
      setPrintStatus("");
    }
  };

  const handleMarkAllApprovedAsSent = async () => {
    const approvedAssets = jobAssets.filter(
      (asset) => asset.status === "approved",
    );

    if (approvedAssets.length === 0) {
      toast({
        title: "No Approved Reports",
        description: "There are no approved reports to mark as sent.",
        variant: "destructive",
      });
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to mark ${approvedAssets.length} approved report${approvedAssets.length !== 1 ? "s" : ""} as sent?`,
    );

    if (!confirmed) return;

    try {
      const now = new Date().toISOString();
      const assetIds = approvedAssets.map((a) => a.id);

      // Batch update all approved assets to 'sent' in one query
      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update({
          status: "sent",
          sent_at: now,
          sent_by: user?.id || null,
        })
        .in("id", assetIds);

      if (error) {
        throw new Error(`Failed to update statuses: ${error.message}`);
      }

      // Update local state
      setJobAssets((prev) =>
        prev.map((a) =>
          assetIds.includes(a.id)
            ? {
                ...a,
                status: "sent" as const,
                sent_at: now,
                sent_by: user?.id || null,
              }
            : a,
        ),
      );
      setFilteredJobAssets((prev) =>
        prev.map((a) =>
          assetIds.includes(a.id)
            ? {
                ...a,
                status: "sent" as const,
                sent_at: now,
                sent_by: user?.id || null,
              }
            : a,
        ),
      );

      // Mark linked technical reports as sent in parallel
      const reportAssets = approvedAssets.filter((a) =>
        a.file_url?.startsWith("report:"),
      );
      if (reportAssets.length > 0) {
        const { getReportByAssetId, markReportAsSent } =
          await import("@/lib/services/reportService");
        await Promise.all(
          reportAssets.map(async (asset) => {
            try {
              const reportResult = await getReportByAssetId(asset.id);
              if (reportResult.data) {
                await markReportAsSent(
                  reportResult.data.id,
                  user?.id || "",
                  "Report marked as sent from Mark All Sent",
                );
              }
            } catch (e) {
              console.warn("Error marking technical report as sent:", e);
            }
          }),
        );
      }

      // Publish the now-sent reports to the customer portal (ampOS ACCESS).
      publishSentReportsToPortal(approvedAssets);

      // Dispatch event to refresh other components
      window.dispatchEvent(
        new CustomEvent("assetStatusChanged", {
          detail: { assetIds, newStatus: "sent", jobId: id },
        }),
      );

      toast({
        title: "Reports Marked as Sent",
        description: `Successfully marked ${approvedAssets.length} report${approvedAssets.length !== 1 ? "s" : ""} as sent.`,
      });
    } catch (error: any) {
      console.error("Error marking reports as sent:", error);
      toast({
        title: "Update Failed",
        description:
          error.message || "An error occurred while marking reports as sent.",
        variant: "destructive",
      });
    }
  };

  // Handle marking only selected approved reports as sent
  const handleMarkSelectedAsSent = async () => {
    // Get selected approved report assets (both report:/ URLs and PDF reports)
    const selectedApprovedAssets = jobAssets.filter(
      (asset) =>
        asset.status === "approved" &&
        (asset.file_url?.startsWith("report:") ||
          (asset.file_url &&
            !asset.file_url.startsWith("report:/") &&
            asset.file_url.toLowerCase().endsWith(".pdf"))) &&
        selectedApprovedIds.has(asset.id),
    );

    if (selectedApprovedAssets.length === 0) {
      toast({
        title: "No Reports Selected",
        description: "Please select approved reports to mark as sent.",
        variant: "destructive",
      });
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to mark ${selectedApprovedAssets.length} selected report${selectedApprovedAssets.length !== 1 ? "s" : ""} as sent?`,
    );

    if (!confirmed) return;

    try {
      const now = new Date().toISOString();
      const assetIds = selectedApprovedAssets.map((a) => a.id);

      // Batch update selected approved assets to 'sent' in one query
      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update({
          status: "sent",
          sent_at: now,
          sent_by: user?.id || null,
        })
        .in("id", assetIds);

      if (error) {
        throw new Error(`Failed to update statuses: ${error.message}`);
      }

      // Update local state
      setJobAssets((prev) =>
        prev.map((a) =>
          assetIds.includes(a.id)
            ? {
                ...a,
                status: "sent" as const,
                sent_at: now,
                sent_by: user?.id || null,
              }
            : a,
        ),
      );
      setFilteredJobAssets((prev) =>
        prev.map((a) =>
          assetIds.includes(a.id)
            ? {
                ...a,
                status: "sent" as const,
                sent_at: now,
                sent_by: user?.id || null,
              }
            : a,
        ),
      );

      // Mark linked technical reports as sent in parallel
      const { getReportByAssetId, markReportAsSent } =
        await import("@/lib/services/reportService");
      await Promise.all(
        selectedApprovedAssets.map(async (asset) => {
          try {
            const reportResult = await getReportByAssetId(asset.id);
            if (reportResult.data) {
              await markReportAsSent(
                reportResult.data.id,
                user?.id || "",
                "Report marked as sent from Mark Selected",
              );
            }
          } catch (e) {
            console.warn("Error marking technical report as sent:", e);
          }
        }),
      );

      // Publish the now-sent reports to the customer portal (ampOS ACCESS).
      publishSentReportsToPortal(selectedApprovedAssets);

      // Clear selections after successful operation
      setSelectedApprovedIds(new Set());

      // Dispatch event to refresh other components
      window.dispatchEvent(
        new CustomEvent("assetStatusChanged", {
          detail: { assetIds, newStatus: "sent", jobId: id },
        }),
      );

      toast({
        title: "Reports Marked as Sent",
        description: `Successfully marked ${selectedApprovedAssets.length} report${selectedApprovedAssets.length !== 1 ? "s" : ""} as sent.`,
      });
    } catch (error: any) {
      console.error("Error marking selected reports as sent:", error);
      toast({
        title: "Update Failed",
        description:
          error.message || "An error occurred while marking reports as sent.",
        variant: "destructive",
      });
    }
  };

  // Handle updating the sent date for a specific asset (admin only)
  const handleUpdateAssetSentDate = async (
    assetId: string,
    newSentDate: string,
  ): Promise<boolean> => {
    try {
      // Find the asset to check if it's a report
      const asset = jobAssets.find((a) => a.id === assetId);

      // Update asset's sent_at
      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update({ sent_at: newSentDate })
        .eq("id", assetId);

      if (error) {
        throw error;
      }

      // If this is a linked report, also update the technical_reports table
      if (asset && asset.file_url.startsWith("report:")) {
        try {
          const { getReportByAssetId, updateReportSentDate } =
            await import("@/lib/services/reportService");
          const reportResult = await getReportByAssetId(assetId);
          if (reportResult.data) {
            const updateRes = await updateReportSentDate(
              reportResult.data.id,
              newSentDate,
            );
            if (updateRes.error) {
              console.warn(
                "Failed to update technical report sent date:",
                updateRes.error,
              );
            }
          }
        } catch (e) {
          console.warn("Error updating technical report sent date:", e);
        }
      }

      // Update local state
      setJobAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, sent_at: newSentDate } : a,
        ),
      );
      setFilteredJobAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, sent_at: newSentDate } : a,
        ),
      );

      // Update reportTimestampsByAsset for consistency with other displays
      setReportTimestampsByAsset((prev) => ({
        ...prev,
        [assetId]: {
          ...(prev[assetId] || {}),
          sent_at: newSentDate,
        },
      }));

      // Dispatch event to notify other components
      window.dispatchEvent(
        new CustomEvent("assetStatusChanged", {
          detail: { assetIds: [assetId], updatedField: "sent_at" },
        }),
      );

      toast({
        title: "Sent Date Updated",
        description: "The report's sent date has been successfully updated.",
      });

      return true;
    } catch (error: any) {
      console.error("Error updating sent date:", error);
      toast({
        title: "Update Failed",
        description:
          error.message || "An error occurred while updating the sent date.",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleToggleApprovedSelection = (assetId: string) => {
    setSelectedApprovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const handleToggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const handleSelectAllVisibleAssets = () => {
    setSelectedAssetIds((prev) => {
      const visibleIds = filteredJobAssets.map((a) => a.id);
      const allSelected =
        visibleIds.length > 0 && visibleIds.every((vid) => prev.has(vid));
      if (allSelected) {
        // Deselect all visible
        const next = new Set(prev);
        visibleIds.forEach((vid) => next.delete(vid));
        return next;
      }
      // Select all visible
      const next = new Set(prev);
      visibleIds.forEach((vid) => next.add(vid));
      return next;
    });
  };

  const handleArchiveSelected = async () => {
    const targetStatus: Asset["status"] =
      assetStatusFilter === "archived" ? "not started" : "archived";
    const actionWord = targetStatus === "archived" ? "archive" : "restore";

    const selectedAssets = jobAssets.filter((a) => selectedAssetIds.has(a.id));
    if (selectedAssets.length === 0) {
      toast({
        title: "No Reports Selected",
        description: `Please select reports to ${actionWord}.`,
        variant: "destructive",
      });
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to ${actionWord} ${selectedAssets.length} selected report${selectedAssets.length !== 1 ? "s" : ""}?`,
    );
    if (!confirmed) return;

    try {
      setIsArchiving(true);
      const assetIds = selectedAssets.map((a) => a.id);

      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update({ status: targetStatus })
        .in("id", assetIds);

      if (error) {
        throw new Error(`Failed to ${actionWord} reports: ${error.message}`);
      }

      setJobAssets((prev) =>
        prev.map((a) =>
          assetIds.includes(a.id) ? { ...a, status: targetStatus } : a,
        ),
      );
      setFilteredJobAssets((prev) =>
        prev.map((a) =>
          assetIds.includes(a.id) ? { ...a, status: targetStatus } : a,
        ),
      );

      setSelectedAssetIds(new Set());

      window.dispatchEvent(
        new CustomEvent("assetStatusChanged", {
          detail: { assetIds, newStatus: targetStatus, jobId: id },
        }),
      );

      await fetchJobAssets();

      toast({
        title:
          targetStatus === "archived" ? "Reports Archived" : "Reports Restored",
        description: `Successfully ${targetStatus === "archived" ? "archived" : "restored"} ${selectedAssets.length} report${selectedAssets.length !== 1 ? "s" : ""}.`,
      });
    } catch (error: any) {
      console.error(`Error during batch ${actionWord}:`, error);
      toast({
        title: "Update Failed",
        description:
          error.message ||
          `An error occurred while trying to ${actionWord} reports.`,
        variant: "destructive",
      });
    } finally {
      setIsArchiving(false);
    }
  };

  const handlePrintSelectedApprovedReports = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    setPrintProgress(0);
    setPrintStatus("");
    try {
      // Get all approved assets (both report:/ URLs and PDF reports)
      const approvedAssets = jobAssets.filter(
        (asset) =>
          asset.status === "approved" &&
          (asset.file_url?.startsWith("report:") ||
            (asset.file_url &&
              !asset.file_url.startsWith("report:/") &&
              asset.file_url.toLowerCase().endsWith(".pdf"))),
      );
      const toPrint = approvedAssets.filter((a) =>
        selectedApprovedIds.has(a.id),
      );
      if (toPrint.length === 0) {
        toast({
          title: "No Reports Selected",
          description: "Please select approved reports to print.",
          variant: "destructive",
        });
        return;
      }

      // Separate PDF reports from regular reports
      const pdfReports = toPrint.filter(
        (a) =>
          a.file_url &&
          !a.file_url.startsWith("report:/") &&
          a.file_url.toLowerCase().endsWith(".pdf"),
      );
      const regularReports = toPrint.filter((a) =>
        a.file_url?.startsWith("report:"),
      );

      // Download PDF reports directly (fetch as blob to ensure download)
      for (let i = 0; i < pdfReports.length; i++) {
        const asset = pdfReports[i];
        const displayName =
          dynamicAssetNames[asset.id] || asset.name || "PDF Report";
        setPrintProgress(((i + 1) / toPrint.length) * 50); // First 50% for PDFs
        setPrintStatus(`Downloading ${displayName}...`);

        try {
          // Fetch the PDF file as a blob to ensure it downloads rather than opens
          const response = await fetch(asset.file_url);
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.statusText}`);
          }

          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);

          // Create a temporary anchor element to trigger download
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = `${displayName.replace(/[^a-z0-9]/gi, "_")}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Clean up the blob URL
          window.URL.revokeObjectURL(blobUrl);
        } catch (error: any) {
          console.error(`Error downloading PDF report ${displayName}:`, error);
          // Continue with other PDFs even if one fails
        }

        // Small delay between downloads
        if (i < pdfReports.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Print regular reports using the service
      if (regularReports.length > 0) {
        await pdfExportService.batchPrintApprovedReports(
          regularReports,
          (progress: number, status: string) => {
            setPrintProgress(50 + progress / 2); // Second 50% for regular reports
            setPrintStatus(status);
          },
          dynamicAssetNames,
        );
      }

      toast({
        title: "PDF Generation Complete",
        description: `Successfully processed ${toPrint.length} report(s).`,
      });
    } catch (error: any) {
      console.error("Error printing selected reports:", error);
      toast({
        title: "Print Failed",
        description:
          error.message || "An unknown error occurred during printing.",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
      setPrintProgress(0);
      setPrintStatus("");
    }
  };

  // Dialog to view/edit and export generated document
  const generatedDocEditorRef = useRef<HTMLDivElement | null>(null);

  // Serialize editor HTML, excluding our editable padding blocks
  const getEditorHTML = (): string => {
    try {
      const editor = generatedDocEditorRef.current;
      if (!editor) return docHtml || "";
      const clone = editor.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll('[data-amp-edit-pad-top="true"]')
        .forEach((n) => n.parentElement?.removeChild(n));
      clone
        .querySelectorAll('[data-amp-edit-pad-bottom="true"]')
        .forEach((n) => n.parentElement?.removeChild(n));
      return clone.innerHTML;
    } catch {
      return docHtml || "";
    }
  };

  // Build a full HTML document for persistence using the original HEAD (styles/meta)
  const buildFullDocumentHTML = (): string => {
    try {
      const bodyMarkup = getEditorHTML();
      // Try to extract the original <head> section from the initially generated doc
      let headInner = docHeadHtml || "";
      try {
        if (!headInner) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(docHtml || "", "text/html");
          headInner = doc.head ? doc.head.innerHTML : "";
        }
      } catch {}
      // Fallback head with simple meta when none found
      if (!headInner) {
        headInner = '<meta charset="utf-8" />';
      }
      return `<!doctype html><html><head>${headInner}</head><body>${bodyMarkup}</body></html>`;
    } catch {
      // Ultimate fallback to whatever we have in the editor
      return getEditorHTML();
    }
  };

  // Ensure non-editable fixed elements (e.g., orange stripe) are present and protected
  const ensureFixedElements = () => {
    try {
      const editor = generatedDocEditorRef.current;
      if (!editor) return;
      const page = editor.querySelector(".amp-page") as HTMLElement | null;
      if (!page) return;

      let stripe = page.querySelector(".amp-stripe") as HTMLElement | null;
      if (!stripe) {
        stripe = document.createElement("div");
        stripe.className = "amp-stripe";
        if (page.firstChild) {
          page.insertBefore(stripe, page.firstChild);
        } else {
          page.appendChild(stripe);
        }
      }
      // Make the stripe non-editable and non-interactive
      try {
        stripe.setAttribute("contenteditable", "false");
      } catch {}
      try {
        stripe.style.pointerEvents = "none";
      } catch {}
      try {
        stripe.style.userSelect = "none";
      } catch {}
    } catch {}
  };

  // Ensure there is editable padding (empty lines) at the top and bottom of the page content
  const ensureEditablePadding = () => {
    try {
      const editor = generatedDocEditorRef.current;
      if (!editor) return;
      const page = editor.querySelector(".amp-page") as HTMLElement | null;
      const host = page || editor;

      const ensurePad = (selector: string, insertAtTop: boolean) => {
        const existing = host.querySelector(selector) as HTMLElement | null;
        if (existing) {
          // Already present; keep user's typed content intact
          return;
        }
        const pad = document.createElement("div");
        if (insertAtTop) {
          pad.setAttribute("data-amp-edit-pad-top", "true");
        } else {
          pad.setAttribute("data-amp-edit-pad-bottom", "true");
        }
        pad.className = "print-hidden";
        pad.contentEditable = "true";
        for (let i = 0; i < 12; i++) {
          const p = document.createElement("p");
          const br = document.createElement("br");
          p.appendChild(br);
          pad.appendChild(p);
        }
        if (insertAtTop && host.firstChild) {
          host.insertBefore(pad, host.firstChild);
        } else {
          host.appendChild(pad);
        }
      };

      ensurePad('[data-amp-edit-pad-top="true"]', true);
      ensurePad('[data-amp-edit-pad-bottom="true"]', false);
    } catch {}
  };

  const placeCaretAtEnd = (el: HTMLElement) => {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch {}
  };

  const placeCaretAtStart = (el: HTMLElement) => {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch {}
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    try {
      const editor = generatedDocEditorRef.current;
      if (!editor) return;
      const target = e.target as HTMLElement;

      // Do not interfere with normal caret placement inside actual content
      if (target !== editor) return;

      // User clicked empty space of the editor container; ensure pads exist and choose a sensible position
      ensureEditablePadding();
      const page = editor.querySelector(".amp-page") as HTMLElement | null;
      const host = page || editor;
      const rect = host.getBoundingClientRect();
      const clickY = e.clientY;
      const midpoint = rect.top + rect.height / 2;
      if (clickY < midpoint) {
        const topPad = host.querySelector(
          '[data-amp-edit-pad-top="true"]',
        ) as HTMLElement | null;
        placeCaretAtStart(topPad || host);
      } else {
        const bottomPad = host.querySelector(
          '[data-amp-edit-pad-bottom="true"]',
        ) as HTMLElement | null;
        placeCaretAtEnd(bottomPad || host);
      }
    } catch {}
  };

  useEffect(() => {
    if (!isDocDialogOpen) return;
    const editor = generatedDocEditorRef.current;
    if (!editor) return;
    // Defer work until after DOM paints, then only add pads if missing
    // Only run on dialog open, not on content changes (we no longer update docHtml on user input)
    const id = requestAnimationFrame(() => {
      try {
        // Reset the source ref when dialog opens so programmatic content can be set
        docUpdateSourceRef.current = "programmatic";
        ensureEditablePadding();
        ensureFixedElements();
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, [isDocDialogOpen]);
  const renderGeneratedDocDialog = () => (
    <Dialog open={isDocDialogOpen} onOpenChange={setIsDocDialogOpen}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {docType === "cover" ? "Cover Letter" : "Executive Summary"}
          </DialogTitle>
          <DialogDescription>
            This document is editable. Make any changes before exporting.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
          {/* Name input field */}
          <div className="px-6 pt-4">
            <label
              htmlFor="doc-save-name"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Document Name (optional)
            </label>
            <input
              id="doc-save-name"
              type="text"
              value={docSaveName}
              onChange={(e) => setDocSaveName(e.target.value)}
              placeholder="e.g., Main Substation Cover Letter"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-100 dark:text-white"
            />
          </div>

          {/* Signature Profile Selector button for executive summaries */}
          {(docType === "summary" || docType === "both") && (
            <div className="px-6">
              <Button
                variant="outline"
                onClick={() => setIsSignatureProfileSelectorOpen(true)}
                className="w-full"
              >
                <Users className="h-4 w-4 mr-2" />
                Select Signatures{" "}
                {selectedSignatureProfileIds.size > 0 &&
                  `(${selectedSignatureProfileIds.size})`}
              </Button>
            </div>
          )}

          {/* Info about which reports will be included */}
          {(docType === "cover" || docType === "both") &&
            selectedSubstations.size > 0 &&
            (() => {
              // Count reports from selected substations
              const reportCount = jobAssets.filter((asset) => {
                if (!asset.file_url?.startsWith("report:")) return false;
                const sub = assetSubstations[asset.id];
                return sub && selectedSubstations.has(sub);
              }).length;

              return (
                <div className="px-6">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                      📋 {reportCount} report{reportCount !== 1 ? "s" : ""} from
                      selected substations will be automatically included
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-400">
                      {selectedSubstations.size} substation(s) selected • These
                      reports will be included in the deliverable for printing
                    </p>
                  </div>
                </div>
              );
            })()}

          {/* Document editor */}
          <div className="max-h-[40vh] overflow-auto border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-sm bg-neutral-50 dark:bg-dark-200 mx-6 p-6">
            <style>{`
              /* Preview-only styles - override print styles for better preview */
              #generated-doc-editor .amp-page {
                height: auto !important;
                min-height: auto !important;
                width: 100% !important;
                max-width: 8.5in !important;
                margin: 0 auto 2rem auto !important;
                padding: 2.5rem 3.5rem !important;
                box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06) !important;
              }
              #generated-doc-editor .amp-header {
                position: relative !important;
                top: auto !important;
                left: auto !important;
                right: auto !important;
                margin-bottom: 2rem !important;
              }
              #generated-doc-editor .amp-footer {
                position: relative !important;
                bottom: auto !important;
                left: auto !important;
                right: auto !important;
                margin-top: 3rem !important;
                padding-top: 1.5rem !important;
                border-top: 1px solid #e5e7eb !important;
              }
              #generated-doc-editor .amp-stripe {
                position: absolute !important;
                height: 100% !important;
                border-radius: 4px 0 0 4px !important;
              }
              #generated-doc-editor .cover-block {
                margin-top: 3rem !important;
              }
              #generated-doc-editor .amp-page-content {
                padding-top: 0 !important;
                padding-bottom: 0 !important;
                min-height: auto !important;
              }
              #generated-doc-editor .cover-title {
                font-size: 36px !important;
              }
              #generated-doc-editor .cover-line {
                font-size: 16px !important;
              }
              /* Force TOC two-column layout */
              #generated-doc-editor .toc-two-columns {
                display: flex !important;
                flex-direction: row !important;
                gap: 30px !important;
              }
              #generated-doc-editor .toc-col-left,
              #generated-doc-editor .toc-col-right {
                flex: 1 !important;
                min-width: 0 !important;
                width: 50% !important;
              }
            `}</style>
            <div
              id="generated-doc-editor"
              ref={generatedDocEditorRef}
              className="prose max-w-none mx-auto bg-white dark:bg-dark-150 rounded-lg shadow-md p-8"
              style={{
                outline: "none",
                cursor: "text",
                minHeight: "50vh",
                boxShadow:
                  "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              }}
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: docHtml }}
              onInput={() => {
                docUpdateSourceRef.current = "user";
                // Don't update docHtml state on every keystroke - this causes React to re-render
                // and replace the innerHTML, which loses cursor position and causes scroll jump.
                // The content is already in the DOM via contentEditable.
                // We read it directly from the DOM when saving.
                requestAnimationFrame(() => {
                  ensureEditablePadding();
                  ensureFixedElements();
                });
              }}
              onClick={handleEditorClick}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              try {
                // expose users for email lookup when printing later too
                try {
                  (window as any).AMP_USERS = users;
                } catch {}
                // Capture latest HTML from editor to include user edits
                ensureFixedElements();
                const htmlToSave = buildFullDocumentHTML();

                // Generate default name if not provided
                const defaultName =
                  docType === "cover"
                    ? "Cover Letter"
                    : docType === "summary"
                      ? "Executive Summary"
                      : "Generated Document";
                const finalName = docSaveName.trim() || defaultName;

                // Auto-collect report IDs from selected substations (for cover letters)
                let reportIds: string[] = [];
                if (docType === "cover" || docType === "both") {
                  reportIds = jobAssets
                    .filter((asset) => {
                      // Include both report assets (report:/ URLs) and PDF reports
                      const isReport = asset.file_url?.startsWith("report:");
                      const isPdfReport =
                        asset.file_url &&
                        !asset.file_url.startsWith("report:/") &&
                        asset.file_url.toLowerCase().endsWith(".pdf");
                      if (!isReport && !isPdfReport) return false;

                      // If substations were selected, filter by substation
                      if (selectedSubstations.size > 0) {
                        const sub = assetSubstations[asset.id];
                        return sub && selectedSubstations.has(sub);
                      }

                      // If no substations selected, include all reports
                      return true;
                    })
                    .map((asset) => asset.id);
                }

                const payload = {
                  job_id: id,
                  doc_type: docType,
                  name: finalName,
                  html: htmlToSave,
                  selected_report_ids: reportIds,
                  selected_signature_profile_ids:
                    (docType === "summary" || docType === "both") &&
                    selectedSignatureProfileIds.size > 0
                      ? Array.from(selectedSignatureProfileIds)
                      : null,
                  created_at: new Date().toISOString(),
                } as any;
                // Save to neta_ops.generated_documents (create table if not existing beforehand per migrations)
                const { error } = await supabase
                  .schema("neta_ops")
                  .from("generated_documents")
                  .insert(payload);
                if (error) throw error;

                // Clear the name field for next save
                setDocSaveName("");

                toast({
                  title: "Saved",
                  description: `"${finalName}" saved to job with ${reportIds.length} report(s).`,
                });

                // Close the dialog after successful save
                setIsDocDialogOpen(false);
              } catch (e: any) {
                console.error("Save failed", e);
                toast({
                  title: "Save failed",
                  description: e?.message || "Unknown error",
                  variant: "destructive",
                });
              }
            }}
            className="bg-[#f26722] hover:bg-[#e55611] text-white"
          >
            Save
          </Button>
          <Button
            onClick={async () => {
              const printWindow = window.open("", "_blank");
              if (!printWindow) return;
              printWindow.document.open();
              ensureFixedElements();
              const fullDoc = buildFullDocumentHTML();
              // Ensure print helper - allow multi-page printing
              const patched = fullDoc.replace(
                "</head>",
                `<style>@media print {
  .print-hidden { display: none !important; }
  html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; }
  .amp-page { display: flex !important; flex-direction: column !important; height: 11in !important; overflow: hidden !important; box-sizing: border-box !important; page-break-after: always !important; }
  .amp-page:last-child { page-break-after: auto !important; }
  .amp-stripe { position: absolute !important; }
  .amp-header { position: relative !important; top: auto !important; left: auto !important; right: auto !important; flex-shrink: 0 !important; }
  .amp-page-content { flex: 1 1 auto !important; overflow: hidden !important; min-height: 0 !important; }
  .amp-footer { position: relative !important; bottom: auto !important; left: auto !important; right: auto !important; flex-shrink: 0 !important; margin-top: auto !important; }
}</style></head>`,
              );
              printWindow.document.write(patched);
              printWindow.document.close();

              const runPrint = async () => {
                try {
                  // Wait for fonts
                  // @ts-ignore
                  if (
                    printWindow.document.fonts &&
                    printWindow.document.fonts.ready
                  ) {
                    // @ts-ignore
                    await printWindow.document.fonts.ready;
                  }
                } catch {}
                // Wait for images
                try {
                  const imgs: HTMLImageElement[] = Array.from(
                    printWindow.document.images,
                  ) as any;
                  await Promise.all(
                    imgs.map((img) =>
                      img.complete
                        ? Promise.resolve()
                        : new Promise((res) => {
                            img.addEventListener("load", res, { once: true });
                            img.addEventListener("error", res, { once: true });
                          }),
                    ),
                  );
                } catch {}
                // Two RAFs to ensure layout is flushed
                printWindow.requestAnimationFrame(() => {
                  printWindow.requestAnimationFrame(() => {
                    printWindow.focus();
                    printWindow.print();
                  });
                });
              };

              if (printWindow.document.readyState === "complete") {
                runPrint();
              } else {
                printWindow.addEventListener("load", runPrint, { once: true });
              }
            }}
            variant="secondary"
          >
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Handle signature profile selection change
  const handleSignatureProfileSelectionChange = async (
    selectedIds: Set<string>,
  ) => {
    setSelectedSignatureProfileIds(selectedIds);

    // Regenerate the document HTML with new signature profiles if this is a summary
    if (docType === "summary" || docType === "both") {
      try {
        // Extract existing content from current HTML
        const parser = new DOMParser();
        const currentDoc = parser.parseFromString(docHtml, "text/html");
        const body = currentDoc.body;

        // Find the executive summary section
        const summaryPage = body
          .querySelector(".amp-page .exec-title")
          ?.closest(".amp-page");
        if (summaryPage) {
          // Replace the signature sections in the summary
          const sigGrid = summaryPage.querySelector(".sig-grid");
          if (sigGrid) {
            const newSigHtml = await generateSignatureSectionsHTML(selectedIds);
            if (newSigHtml) {
              sigGrid.outerHTML = newSigHtml;
            } else if (selectedIds.size === 0) {
              // Remove signature grid if no profiles selected
              sigGrid.remove();
            }
          } else if (selectedIds.size > 0) {
            // Add signature grid if it doesn't exist
            const execSection = summaryPage.querySelector(
              ".exec-section:last-of-type",
            );
            if (execSection) {
              const newSigHtml =
                await generateSignatureSectionsHTML(selectedIds);
              if (newSigHtml) {
                execSection.insertAdjacentHTML("afterend", newSigHtml);
              }
            }
          }

          // Reconstruct the full HTML
          const newBodyHtml = body.innerHTML;
          const headHtml = currentDoc.head.innerHTML;

          const newHtml = `<!doctype html>
<html>
<head>
${headHtml}
</head>
<body>
${newBodyHtml}
</body>
</html>`;

          setDocHtml(newHtml);
          docUpdateSourceRef.current = "programmatic";

          // Update the editor content
          setTimeout(() => {
            const editor = generatedDocEditorRef.current;
            if (editor) {
              const editorDoc = editor.ownerDocument || document;
              const tempDiv = editorDoc.createElement("div");
              tempDiv.innerHTML = newHtml;
              const bodyContent =
                tempDiv.querySelector("body")?.innerHTML || newBodyHtml;
              editor.innerHTML = bodyContent;
              ensureEditablePadding();
              ensureFixedElements();
            }
          }, 100);
        }
      } catch (e) {
        console.error("Error updating signature profiles:", e);
        toast({
          title: "Update failed",
          description: "Could not update signature profiles in preview",
          variant: "destructive",
        });
      }
    }
  };

  const handleQuickStatusSave = async (
    newStatus:
      | "pending"
      | "in_progress"
      | "completed"
      | "ready_to_bill"
      | "progress_billing"
      | "billed",
  ) => {
    if (!id) return;
    try {
      console.log("Attempting to update job status to:", newStatus);
      // Use returning select() + single() to detect RLS no-op updates (0 rows)
      const { data: updatedRow, error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, status")
        .single();

      if (error) {
        console.error("Database error:", error);
        throw error;
      }
      if (!updatedRow) {
        // RLS likely filtered the row for this user; surface as error instead of silently "reverting"
        throw new Error(
          "Update not permitted by current permissions (RLS) or job not found.",
        );
      }

      // Update local state from the row returned by DB
      setJob((prev) =>
        prev ? { ...prev, status: updatedRow.status as any } : prev,
      );

      // Refresh job details from database
      if (refreshJobDetails) {
        refreshJobDetails();
      }

      setIsStatusEditing(false);
      toast({
        title: "Status updated",
        description: `Job status set to ${newStatus.replace("_", " ")}`,
        variant: "success",
      });

      // Send email notification if status changed to ready_to_bill
      if (newStatus === "ready_to_bill") {
        try {
          console.log(
            "Triggering ready-to-bill email notification for job:",
            id,
          );
          const { error: emailError } = await supabase.functions.invoke(
            "ready-to-bill-notification",
            {
              body: { jobId: id },
            },
          );

          if (emailError) {
            console.error(
              "Failed to send ready-to-bill notification:",
              emailError,
            );
            // Don't show error to user as the status update was successful
          } else {
            console.log("Ready-to-bill notification sent successfully");
          }
        } catch (emailErr) {
          console.error(
            "Error triggering ready-to-bill notification:",
            emailErr,
          );
          // Don't show error to user as the status update was successful
        }
      }
    } catch (e) {
      console.error("Quick status update failed:", e);
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      toast({
        title: "Update failed",
        description: `Could not update job status: ${errorMessage}`,
        variant: "destructive",
      });
    }
  };

  // Fetch users for fireteam lead selection
  const fetchUsers = async () => {
    try {
      const { data: adminData, error: adminError } = await supabase
        .schema("common")
        .rpc("admin_get_users");

      if (adminError) {
        console.error("Error fetching users:", adminError);
        return;
      }

      if (adminData) {
        const mappedUsers = adminData.map((user: any) => ({
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          user_metadata: user.raw_user_meta_data || {},
        }));
        setUsers(mappedUsers);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  const deriveNameFromEmail = (email?: string | null): string | null => {
    if (!email) return null;
    const lower = String(email).toLowerCase();
    const m = lower.match(/^([a-z]+)\.([a-z]+)@ampqes\.com$/i);
    if (!m) return null;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(m[1])} ${cap(m[2])}`;
  };

  const displayUserName = (u: any): string => {
    const raw = u?.user_metadata?.name as string | undefined;
    if (raw && raw.includes(" ")) return raw;
    const derived = deriveNameFromEmail(u?.email);
    return derived || raw || u?.email || "Unnamed User";
  };

  // Handle fireteam lead selection
  const handleFireteamLeadSelect = async (selectedUser: any) => {
    if (!id || !user?.id) return;

    try {
      const fireteamLeadName = displayUserName(selectedUser);

      const { error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update({
          fireteam_lead: fireteamLeadName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      // Update local state
      setJob((prev) =>
        prev ? { ...prev, fireteam_lead: fireteamLeadName } : prev,
      );

      // Refresh job details from database
      if (refreshJobDetails) {
        refreshJobDetails();
      }

      setIsFireteamLeadSelectorOpen(false);
      setUserSearchQuery("");
      toast({
        title: "Fireteam Lead updated",
        description: `${fireteamLeadName} assigned as fireteam lead`,
        variant: "success",
      });
    } catch (e) {
      console.error("Failed to update fireteam lead:", e);
      toast({
        title: "Update failed",
        description: "Could not update fireteam lead.",
        variant: "destructive",
      });
    }
  };

  // QuickBooks: check connection when Overview tab is shown
  useEffect(() => {
    if (!id || activeTab !== "overview") return;
    getQuickBooksStatus()
      .then((s) => setQbConnected(s.connected))
      .catch(() => setQbConnected(false));
  }, [id, activeTab]);

  // QuickBooks: fetch actual hours when job has a linked project
  useEffect(() => {
    if (!job?.quickbooks_project_id || activeTab !== "overview") {
      if (!job?.quickbooks_project_id) setQbActualHours(null);
      return;
    }
    let cancelled = false;
    setQbHoursLoading(true);
    getQuickBooksHoursByProject(job.quickbooks_project_id)
      .then((hours) => {
        if (!cancelled) setQbActualHours(hours);
      })
      .catch(() => {
        if (!cancelled) setQbActualHours(null);
      })
      .finally(() => {
        if (!cancelled) setQbHoursLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job?.quickbooks_project_id, activeTab]);

  // QuickBooks: search projects when dropdown opens
  useEffect(() => {
    if (!qbProjectSearchOpen) return;
    setQbProjectError(null);
    setQbProjectSearching(true);
    searchQuickBooksProjects(qbProjectSearchQuery)
      .then((list) => {
        setQbProjectSearchResults(list);
        setQbProjectError(null);
      })
      .catch((err: any) => {
        setQbProjectSearchResults([]);
        setQbProjectError(
          err?.message ||
            err?.error ||
            err?.details ||
            (typeof err === "string" ? err : String(err)).slice(0, 200),
        );
      })
      .finally(() => setQbProjectSearching(false));
  }, [qbProjectSearchQuery, qbProjectSearchOpen]);

  const handleAssignQuickBooksProject = async (
    projectId: string,
    projectName: string,
  ) => {
    if (!id) return;
    setQbAssigning(true);
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update({
          quickbooks_project_id: projectId,
          quickbooks_project_name: projectName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      setJob((prev) =>
        prev
          ? {
              ...prev,
              quickbooks_project_id: projectId,
              quickbooks_project_name: projectName,
            }
          : null,
      );
      refreshJobDetails?.();
      setQbProjectSearchOpen(false);
      setQbProjectSearchQuery("");
      setQbProjectSearchResults([]);
      toast({
        title: "QuickBooks project linked",
        description: `"${projectName}" is now linked to this job.`,
        variant: "success",
      });
    } catch (e: any) {
      toast({
        title: "Link failed",
        description: e?.message || "Could not link project.",
        variant: "destructive",
      });
    } finally {
      setQbAssigning(false);
    }
  };

  const handleUnlinkQuickBooksProject = async () => {
    if (!id) return;
    setQbAssigning(true);
    try {
      const { error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update({
          quickbooks_project_id: null,
          quickbooks_project_name: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      setJob((prev) =>
        prev
          ? {
              ...prev,
              quickbooks_project_id: null,
              quickbooks_project_name: null,
            }
          : null,
      );
      setQbActualHours(null);
      refreshJobDetails?.();
      setQbProjectSearchOpen(false);
      toast({ title: "QuickBooks project unlinked", variant: "success" });
    } catch (e: any) {
      toast({
        title: "Unlink failed",
        description: e?.message || "Could not unlink.",
        variant: "destructive",
      });
    } finally {
      setQbAssigning(false);
    }
  };

  // Load and view a saved document
  const handleViewDocument = async (
    docId: string,
    docName?: string,
    docType?: string,
  ) => {
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("generated_documents")
        .select("html, name, doc_type, selected_signature_profile_ids")
        .eq("id", docId)
        .single();

      if (error) throw error;

      const loadedHtml = (data as any)?.html || "";
      setViewerHtml(loadedHtml);
      setViewerDocId(docId);
      setViewerTitle(
        (data as any)?.name ||
          ((data as any)?.doc_type === "cover"
            ? "Cover Letter"
            : (data as any)?.doc_type === "summary"
              ? "Executive Summary"
              : "Generated Document"),
      );
      setIsViewerDocLocked(false);
      setIsEditingViewer(false); // Start in view-only mode

      // Restore saved font size from the persisted style block if it exists
      try {
        const match = loadedHtml.match(
          /id="amp-saved-font-sizes"[^>]*>[\s\S]*?\.exec-section\s*\{\s*font-size:\s*([\d.]+)px/,
        );
        if (match) {
          const savedExecSize = parseFloat(match[1]);
          const restoredFontSize = Math.round((savedExecSize / 14) * 16);
          setViewerFontSize(Math.max(8, Math.min(32, restoredFontSize)));
        } else {
          setViewerFontSize(16);
        }
      } catch {
        setViewerFontSize(16);
      }

      // Load selected signature profile IDs if present
      const profileIds = (data as any)?.selected_signature_profile_ids;
      if (profileIds && Array.isArray(profileIds)) {
        setSelectedSignatureProfileIds(new Set(profileIds));
      } else {
        setSelectedSignatureProfileIds(new Set());
      }

      setIsViewerOpen(true);
    } catch (e: any) {
      console.error("Error loading document:", e);
      toast({
        title: "Load failed",
        description: e?.message || "Could not load document",
        variant: "destructive",
      });
    }
  };

  // Effect to control iframe editability and font size based on edit mode
  useEffect(() => {
    if (!isViewerOpen || !viewerIframeRef.current) return;

    // Small delay to ensure iframe is fully loaded
    const timer = setTimeout(() => {
      const iframe = viewerIframeRef.current;
      if (!iframe) return;

      const iframeDoc =
        iframe.contentDocument || iframe.contentWindow?.document;

      if (iframeDoc?.body) {
        if (isEditingViewer) {
          iframeDoc.body.contentEditable = "true";
          iframeDoc.body.style.cursor = "text";
          iframeDoc.body.style.outline = "none";
        } else {
          iframeDoc.body.contentEditable = "false";
          iframeDoc.body.style.cursor = "default";
          iframeDoc.body.style.outline = "none";
        }

        // Create or update a style element for viewport scaling and font scaling
        let styleEl = iframeDoc.getElementById("amp-viewer-override");
        if (!styleEl) {
          styleEl = iframeDoc.createElement("style");
          styleEl.id = "amp-viewer-override";
          iframeDoc.head.appendChild(styleEl);
        }

        // Calculate scale factor based on default font size (16px)
        const scaleFactor = viewerFontSize / 16;

        // Apply viewport scaling to fix the "smushed" appearance
        // Calculate scale based on iframe width vs 8.5in (816px at 96dpi)
        const iframeWidth = iframe.offsetWidth || 800;
        const targetWidth = 816; // 8.5in at 96dpi
        const scale = Math.min(1, iframeWidth / targetWidth);

        // Viewport-only styles (transform/scaling) go in @media screen;
        // font size scaling applies to both screen and print so the user's
        // font size adjustment is reflected when printing.
        styleEl.textContent = `
          @media screen {
            html, body {
              width: 100% !important;
              max-width: 100% !important;
              overflow-x: auto !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .amp-page {
              width: ${targetWidth}px !important;
              max-width: 100% !important;
              min-width: 0 !important;
              margin: 0 auto !important;
              box-sizing: border-box !important;
              transform: scale(${scale}) !important;
              transform-origin: top center !important;
            }
            .amp-page-content {
              width: 100% !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            .amp-page img, .amp-page svg {
              max-width: 100% !important;
              height: auto !important;
            }
            .amp-stripe {
              width: 36px !important;
              height: 100% !important;
            }
          }

          /* Font size scaling applies to both screen AND print */
          .exec-title {
            font-size: ${28 * scaleFactor}px !important;
          }
          .exec-title-rule {
            height: ${3 * scaleFactor}px !important;
            margin: ${4 * scaleFactor}px 0 ${14 * scaleFactor}px !important;
          }
          .exec-meta {
            font-size: ${14 * scaleFactor}px !important;
            margin: ${6 * scaleFactor}px 0 ${12 * scaleFactor}px !important;
          }
          .exec-section {
            font-size: ${14 * scaleFactor}px !important;
            margin: ${12 * scaleFactor}px 0 !important;
          }
          .exec-section b {
            margin-bottom: ${6 * scaleFactor}px !important;
          }
          .sig-grid {
            gap: ${28 * scaleFactor}px !important;
            margin-top: ${18 * scaleFactor}px !important;
            font-size: ${14 * scaleFactor}px !important;
          }
          .sig-col b {
            margin-bottom: ${6 * scaleFactor}px !important;
          }
          .sig-col {
            font-size: ${14 * scaleFactor}px !important;
            line-height: 1.5 !important;
          }

          @media print {
            html, body {
              height: auto !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .amp-page {
              display: flex !important;
              flex-direction: column !important;
              height: 11in !important;
              width: 8.5in !important;
              overflow: hidden !important;
              box-sizing: border-box !important;
              transform: none !important;
              page-break-after: always !important;
            }
            .amp-page:last-child { page-break-after: auto !important; }
            .amp-stripe { position: absolute !important; }
            .amp-header {
              position: relative !important;
              top: auto !important;
              left: auto !important;
              right: auto !important;
              flex-shrink: 0 !important;
            }
            .amp-page-content {
              flex: 1 1 auto !important;
              overflow: hidden !important;
              min-height: 0 !important;
            }
            .amp-footer {
              position: relative !important;
              bottom: auto !important;
              left: auto !important;
              right: auto !important;
              flex-shrink: 0 !important;
              margin-top: auto !important;
            }
          }
        `;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isEditingViewer, isViewerOpen, viewerHtml, viewerFontSize]);

  const handleEnableEdit = () => {
    setIsEditingViewer(true);
    // The useEffect will handle setting contentEditable
  };

  const handleSaveViewerDocument = async () => {
    if (!viewerDocId) return;

    try {
      setIsSavingViewer(true);

      // Get the edited HTML from the iframe
      const iframe = viewerIframeRef.current;
      if (!iframe) {
        throw new Error("Could not access document");
      }

      const iframeDoc =
        iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error("Could not access document content");
      }

      // Remove the runtime viewer-override styles (viewport transform/scaling)
      const viewerOverride = iframeDoc.getElementById("amp-viewer-override");
      if (viewerOverride) viewerOverride.remove();

      // Persist font size adjustments: if the user changed the font size,
      // bake the computed font rules into a saved style block so they survive reload.
      const scaleFactor = viewerFontSize / 16;
      let fontStyleEl = iframeDoc.getElementById("amp-saved-font-sizes");
      if (scaleFactor !== 1) {
        if (!fontStyleEl) {
          fontStyleEl = iframeDoc.createElement("style");
          fontStyleEl.id = "amp-saved-font-sizes";
          iframeDoc.head.appendChild(fontStyleEl);
        }
        fontStyleEl.textContent = `
          .exec-title { font-size: ${28 * scaleFactor}px !important; }
          .exec-title-rule { height: ${3 * scaleFactor}px !important; margin: ${4 * scaleFactor}px 0 ${14 * scaleFactor}px !important; }
          .exec-meta { font-size: ${14 * scaleFactor}px !important; margin: ${6 * scaleFactor}px 0 ${12 * scaleFactor}px !important; }
          .exec-section { font-size: ${14 * scaleFactor}px !important; margin: ${12 * scaleFactor}px 0 !important; }
          .exec-section b { margin-bottom: ${6 * scaleFactor}px !important; }
          .sig-grid { gap: ${28 * scaleFactor}px !important; margin-top: ${18 * scaleFactor}px !important; font-size: ${14 * scaleFactor}px !important; }
          .sig-col b { margin-bottom: ${6 * scaleFactor}px !important; }
          .sig-col { font-size: ${14 * scaleFactor}px !important; line-height: 1.5 !important; }
        `;
      } else if (fontStyleEl) {
        fontStyleEl.remove();
      }

      // Remove contentEditable artifacts before persisting
      iframeDoc.body.contentEditable = "false";
      iframeDoc.body.querySelectorAll("[contenteditable]").forEach((el) => {
        el.removeAttribute("contenteditable");
      });

      // Remove any browser-injected elements/attributes that inflate payload
      iframeDoc
        .querySelectorAll("style:empty, script:empty")
        .forEach((el) => el.remove());

      const editedHtml = iframeDoc.documentElement.outerHTML;
      console.log("Saving document HTML:", {
        docId: viewerDocId,
        length: editedHtml.length,
      });

      // Skip .select() to reduce query cost and avoid statement timeout on large HTML payloads
      const { error } = await supabase
        .schema("neta_ops")
        .from("generated_documents")
        .update({
          html: editedHtml,
          selected_signature_profile_ids:
            selectedSignatureProfileIds.size > 0
              ? Array.from(selectedSignatureProfileIds)
              : null,
        })
        .eq("id", viewerDocId);

      if (error) {
        console.error("Error updating document:", error);
        throw error;
      }

      // Update local state and exit edit mode
      setViewerHtml(editedHtml);
      setIsEditingViewer(false);
      // The useEffect will handle disabling contentEditable

      toast({ title: "Success", description: "Document saved successfully" });
    } catch (e: any) {
      console.error("Failed to update document:", e);
      toast({
        title: "Save failed",
        description: e?.message || "Could not save document",
        variant: "destructive",
      });
    } finally {
      setIsSavingViewer(false);
    }
  };

  // Lightweight component to fetch and show saved generated documents
  const GeneratedDocs: React.FC<{ jobId: string }> = ({ jobId }) => {
    const [items, setItems] = useState<
      Array<{
        id: string;
        doc_type: string;
        name?: string;
        created_at: string;
        status?: string;
      }>
    >([]);
    const [loadingList, setLoadingList] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState<string>("");

    const loadItems = async () => {
      try {
        setLoadingList(true);
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("generated_documents")
          .select("id, doc_type, name, created_at, status")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setItems((data || []) as any);
      } catch (e: any) {
        setErr(e?.message || "Failed to load documents");
      } finally {
        setLoadingList(false);
      }
    };

    useEffect(() => {
      let mounted = true;
      (async () => {
        await loadItems();
      })();
      return () => {
        mounted = false;
      };
    }, [jobId]);

    const handleDeleteDocument = async (docId: string, docName: string) => {
      if (!confirm(`Delete "${docName}"? This cannot be undone.`)) return;

      try {
        const { error } = await supabase
          .schema("neta_ops")
          .from("generated_documents")
          .delete()
          .eq("id", docId);

        if (error) throw error;

        // Remove from local state
        setItems((prev) => prev.filter((item) => item.id !== docId));
        alert("Document deleted successfully");
      } catch (e: any) {
        alert(`Failed to delete document: ${e?.message || "Unknown error"}`);
      }
    };

    const handleStartEdit = (doc: (typeof items)[0]) => {
      setEditingId(doc.id);
      setEditingName(doc.name || "");
    };

    const handleSaveName = async (docId: string) => {
      try {
        const newName = editingName.trim() || null;
        console.log("Updating document name:", { docId, newName });

        const { data, error } = await supabase
          .schema("neta_ops")
          .from("generated_documents")
          .update({ name: newName })
          .eq("id", docId)
          .select();

        if (error) {
          console.error("Error updating document name:", error);
          throw error;
        }

        console.log("Update response:", data);

        // Update local state
        setItems((prev) =>
          prev.map((item) =>
            item.id === docId ? { ...item, name: newName || undefined } : item,
          ),
        );
        setEditingId(null);
        setEditingName("");
        alert("Document name updated successfully");
      } catch (e: any) {
        console.error("Failed to update name:", e);
        alert(`Failed to update name: ${e?.message || "Unknown error"}`);
      }
    };

    const handleCancelEdit = () => {
      setEditingId(null);
      setEditingName("");
    };

    if (loadingList)
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner size="md" />
        </div>
      );
    if (err) return <div className="p-4 text-red-600">{err}</div>;
    if (!items.length)
      return (
        <div className="p-4 text-neutral-600 dark:text-white">
          No saved documents yet.
        </div>
      );

    return (
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
        {items.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between p-3 gap-3"
          >
            <div className="flex flex-col flex-1">
              {editingId === d.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder={
                      d.doc_type === "cover"
                        ? "Cover Letter"
                        : d.doc_type === "summary"
                          ? "Executive Summary"
                          : "Document Name"
                    }
                    className="flex-1 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-dark-100 text-neutral-900 dark:text-white"
                    autoFocus
                  />
                  <Button
                    onClick={() => handleSaveName(d.id)}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={handleCancelEdit}
                    size="sm"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {d.name ||
                        (d.doc_type === "cover"
                          ? "Cover Letter"
                          : d.doc_type === "summary"
                            ? "Executive Summary"
                            : "Generated Document")}
                    </span>
                    <button
                      onClick={() => handleStartEdit(d)}
                      className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                      title="Edit name"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  </div>
                  <span className="text-sm text-neutral-500">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => handleViewDocument(d.id, d.name, d.doc_type)}
                variant="secondary"
                size="sm"
              >
                View
              </Button>
              <Button
                onClick={() =>
                  window.open(
                    `/jobs/${jobId}/generated-document/${d.id}?print=true`,
                    "_blank",
                  )
                }
                variant="secondary"
                size="sm"
              >
                Print
              </Button>
              <Button
                onClick={() =>
                  handleDeleteDocument(
                    d.id,
                    d.name ||
                      (d.doc_type === "cover"
                        ? "Cover Letter"
                        : "Executive Summary"),
                  )
                }
                variant="secondary"
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  // Check if job was deleted (from useJobDetails error)
  useEffect(() => {
    if (jobDetailsError && jobDetailsError.message?.includes("deleted")) {
      toast({
        title: "Job Deleted",
        description: "This job has been deleted and is no longer accessible.",
        variant: "destructive",
      });
      // Navigate back to jobs list after a short delay
      setTimeout(() => {
        navigate("/jobs");
      }, 2000);
    }
  }, [jobDetailsError, navigate]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-center items-center h-64">
          <div className="flex justify-center py-6">
            <LoadingSpinner size="md" />
          </div>
        </div>
      </div>
    );
  }

  if (
    !job ||
    (jobDetailsError && jobDetailsError.message?.includes("deleted"))
  ) {
    return (
      <div className="p-8">
        <div className="flex flex-col justify-center items-center h-64">
          <p className="text-neutral-500 dark:text-white text-lg mb-2">
            Job not found or has been deleted
          </p>
          <p className="text-neutral-400 dark:text-neutral-500 text-sm mb-4">
            Redirecting to jobs list...
          </p>
          <Link
            to="/jobs"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Go to Jobs List
          </Link>
        </div>
      </div>
    );
  }

  const isEmbed = new URLSearchParams(location.search).get("embed") === "true";
  const getJobsListPath = () => {
    const pathParts = location.pathname.split("/").filter(Boolean);
    const jobsIndex = pathParts.indexOf("jobs");

    if (jobsIndex > 0) {
      return `/${pathParts.slice(0, jobsIndex + 1).join("/")}`;
    }

    if (job?.division) {
      return `/${job.division}/jobs`;
    }

    return "/jobs";
  };

  const getJobDetailPath = (jobId: string) => {
    const pathParts = location.pathname.split("/").filter(Boolean);
    const jobsIndex = pathParts.indexOf("jobs");

    if (jobsIndex > 0) {
      return `/${pathParts.slice(0, jobsIndex + 1).join("/")}/${jobId}`;
    }

    if (job?.division) {
      return `/${job.division}/jobs/${jobId}`;
    }

    return `/jobs/${jobId}`;
  };

  const getCustomerPath = (customerId: string) => {
    const pathParts = location.pathname.split("/").filter(Boolean);
    const jobsIndex = pathParts.indexOf("jobs");

    if (jobsIndex > 0) {
      return `/${pathParts.slice(0, jobsIndex).join("/")}/customers/${customerId}`;
    }

    if (job?.division) {
      return `/${job.division}/customers/${customerId}`;
    }

    return `/sales-dashboard/customers/${customerId}`;
  };

  return (
    <div className="p-8">
      {renderGeneratedDocDialog()}

      {/* Document Viewer Dialog */}
      <Dialog
        open={isViewerOpen}
        onOpenChange={(open) => {
          setIsViewerOpen(open);
          if (!open) {
            setIsEditingViewer(false); // Reset edit mode when closing
            setViewerFontSize(16); // Reset font size when closing
            setIsViewerDocLocked(false); // Reset locked state
          }
        }}
      >
        <DialogContent className="sm:max-w-[95vw] max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{viewerTitle}</DialogTitle>
            <DialogDescription>
              {isEditingViewer
                ? "Click directly in the document to edit text and content, then click Save to keep changes"
                : "Click Edit to make changes to this document"}
            </DialogDescription>
            {isEditingViewer && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Font Size:
                </span>
                <button
                  onClick={() =>
                    setViewerFontSize((prev) => Math.max(8, prev - 1))
                  }
                  className="px-2 py-1 text-sm bg-neutral-200 dark:bg-dark-100 hover:bg-neutral-300 dark:hover:bg-dark-200 rounded text-neutral-900 dark:text-white"
                  title="Decrease font size"
                >
                  -
                </button>
                <span className="text-sm font-mono min-w-[3rem] text-center text-neutral-900 dark:text-white">
                  {viewerFontSize}px
                </span>
                <button
                  onClick={() =>
                    setViewerFontSize((prev) => Math.min(32, prev + 1))
                  }
                  className="px-2 py-1 text-sm bg-neutral-200 dark:bg-dark-100 hover:bg-neutral-300 dark:hover:bg-dark-200 rounded text-neutral-900 dark:text-white"
                  title="Increase font size"
                >
                  +
                </button>
                <button
                  onClick={() => setViewerFontSize(16)}
                  className="px-2 py-1 text-xs bg-neutral-200 dark:bg-dark-100 hover:bg-neutral-300 dark:hover:bg-dark-200 rounded text-neutral-900 dark:text-white"
                  title="Reset to default"
                >
                  Reset
                </button>
              </div>
            )}
            {isEditingViewer &&
              (() => {
                // Check if this is an executive summary
                const docTypeFromViewer = viewerHtml.includes("exec-title")
                  ? "summary"
                  : null;
                return docTypeFromViewer === "summary" ? (
                  <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                    <Button
                      variant="outline"
                      onClick={() => setIsSignatureProfileSelectorOpen(true)}
                      className="w-full"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Select Signatures{" "}
                      {selectedSignatureProfileIds.size > 0 &&
                        `(${selectedSignatureProfileIds.size})`}
                    </Button>
                  </div>
                ) : null;
              })()}
          </DialogHeader>
          <div className="overflow-auto flex-1 min-h-0">
            {viewerHtml && (
              <iframe
                ref={viewerIframeRef}
                srcDoc={viewerHtml}
                title={viewerTitle}
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: "calc(95vh - 200px)",
                  border: "none",
                }}
              />
            )}
          </div>
          <DialogFooter className="flex-shrink-0">
            {isEditingViewer ? (
              <Button
                onClick={handleSaveViewerDocument}
                disabled={isSavingViewer}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isSavingViewer ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
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
                    Saving...
                  </span>
                ) : (
                  "Save"
                )}
              </Button>
            ) : (
              <Button
                onClick={handleEnableEdit}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Edit
              </Button>
            )}
            <Button
              onClick={() => {
                const iframe = viewerIframeRef.current;
                if (iframe?.contentWindow) {
                  iframe.contentWindow.focus();
                  iframe.contentWindow.print();
                } else {
                  window.open(
                    `/jobs/${id}/generated-document/${viewerDocId}?print=true`,
                    "_blank",
                  );
                }
              }}
              className="bg-[#f26722] hover:bg-[#e55611] text-white"
            >
              Print
            </Button>
            <Button onClick={() => setIsViewerOpen(false)} variant="secondary">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved generated doc list dialog */}
      <Dialog open={isDocListOpen} onOpenChange={setIsDocListOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Saved Cover Letters & Executive Summaries</DialogTitle>
            <DialogDescription>
              All generated documents for this job. Click to view or print.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {isDocListOpen && id && <GeneratedDocs jobId={id as string} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Signature Profile Selector */}
      <SignatureProfileSelector
        open={isSignatureProfileSelectorOpen}
        onOpenChange={setIsSignatureProfileSelectorOpen}
        selectedProfileIds={selectedSignatureProfileIds}
        onSelectionChange={handleSignatureProfileSelectionChange}
      />
      {/* Substation selector dialog */}
      <Dialog
        open={isSubstationSelectorOpen}
        onOpenChange={setIsSubstationSelectorOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Substations for Table of Contents</DialogTitle>
            <DialogDescription>
              Choose which substations to include in the generated document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Select All / Deselect All buttons */}
            <div className="flex gap-2 px-4 pt-4">
              <Button
                onClick={() => {
                  const substations = new Set<string>();
                  jobAssets.forEach((asset) => {
                    const sub = assetSubstations[asset.id];
                    if (typeof sub === "string" && sub.trim()) {
                      substations.add(sub.trim());
                    }
                  });
                  setSelectedSubstations(new Set(substations));
                }}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Select All
              </Button>
              <Button
                onClick={() => setSelectedSubstations(new Set())}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Deselect All
              </Button>
            </div>

            {/* Substation checkboxes */}
            <div className="max-h-[50vh] overflow-auto space-y-2 px-4 pb-4">
              {(() => {
                const substations = new Set<string>();
                jobAssets.forEach((asset) => {
                  const sub = assetSubstations[asset.id];
                  if (typeof sub === "string" && sub.trim()) {
                    substations.add(sub.trim());
                  }
                });
                const sortedSubs = Array.from(substations).sort(
                  compareAlphanumericLabels,
                );
                if (sortedSubs.length === 0) {
                  return (
                    <p className="text-neutral-500 dark:text-neutral-400">
                      No substations found for this job.
                    </p>
                  );
                }
                return sortedSubs.map((sub) => (
                  <label
                    key={sub}
                    className="flex items-center gap-2 p-2 hover:bg-neutral-100 dark:hover:bg-dark-100 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSubstations.has(sub)}
                      onChange={(e) => {
                        const updated = new Set(selectedSubstations);
                        if (e.target.checked) {
                          updated.add(sub);
                        } else {
                          updated.delete(sub);
                        }
                        setSelectedSubstations(updated);
                      }}
                      className="rounded border-neutral-300 dark:border-neutral-600"
                    />
                    <span className="text-neutral-900 dark:text-white">
                      {sub}
                    </span>
                  </label>
                ));
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setIsSubstationSelectorOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingDocType) {
                  setDocType(pendingDocType);
                  generateDoc(pendingDocType, selectedSubstations);
                }
                setIsSubstationSelectorOpen(false);
              }}
              disabled={selectedSubstations.size === 0}
              className="bg-[#f26722] hover:bg-[#e55611] text-white"
            >
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mb-6 flex items-center justify-between">
        {!isEmbed && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(getJobsListPath())}
              className="text-neutral-600 hover:text-neutral-900 dark:text-dark-400 dark:hover:text-dark-900 flex items-center"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Jobs
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  adjacentJobIds.previous &&
                  navigate(getJobDetailPath(adjacentJobIds.previous))
                }
                disabled={!adjacentJobIds.previous}
                aria-label="Previous Job"
                title="Previous Job"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-300 dark:text-dark-500 dark:hover:bg-dark-200 dark:hover:text-dark-900"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  adjacentJobIds.next &&
                  navigate(getJobDetailPath(adjacentJobIds.next))
                }
                disabled={!adjacentJobIds.next}
                aria-label="Next Job"
                title="Next Job"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-300 dark:text-dark-500 dark:hover:bg-dark-200 dark:hover:text-dark-900"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2 items-center">
          {/* Job notifications (bell icon) */}
          {!isEmbed && id && <JobNotifications jobId={id} />}

          {/* Shortcut toggle */}
          {!isEmbed && (
            <Button
              variant="outline"
              onClick={toggleShortcut}
              disabled={shortcutBusy}
              className={
                isShortcut
                  ? "border-yellow-400 text-yellow-600 dark:text-yellow-400"
                  : ""
              }
              title={
                isShortcut ? "Remove from My Shortcuts" : "Add to My Shortcuts"
              }
              leftIcon={
                <Bookmark
                  className={`h-5 w-5 shrink-0 ${isShortcut ? "fill-current" : "fill-none"}`}
                />
              }
            >
              {isShortcut ? "In Shortcuts" : "Add to Shortcuts"}
            </Button>
          )}

          {/* Edit job */}
          {!isEmbed && (
            <Button
              variant="outline"
              onClick={() => {
                setIsEditing(true);
                setEditFormData(job);
              }}
              leftIcon={<Pencil className="h-5 w-5 shrink-0" />}
            >
              Edit Job
            </Button>
          )}
        </div>
      </div>

      <Card className="shadow-lg">
        {isEditing ? (
          <div>
            {/* Edit Form Header */}
            <CardHeader className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#f26722]/10 rounded-lg">
                  <Edit3 className="h-5 w-5 text-[#f26722]" />
                </div>
                <div>
                  <CardTitle className="text-xl text-neutral-900 dark:text-white">
                    Edit Job Details
                  </CardTitle>
                  <CardDescription className="text-neutral-600 dark:text-white">
                    Update job information and settings
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEditSubmit();
                }}
                className="space-y-6"
              >
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="w-1 h-5 bg-[#f26722] rounded-full"></div>
                    <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                      Basic Information
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="job_number"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Job Number
                      </label>
                      <input
                        type="text"
                        id="job_number"
                        value={editFormData?.job_number || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev
                              ? { ...prev, job_number: e.target.value }
                              : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white font-mono text-sm"
                        placeholder="JOB-0000"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="division"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Division
                      </label>
                      <select
                        id="division"
                        value={editFormData?.division || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev ? { ...prev, division: e.target.value } : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                      >
                        <option value="">Select Division</option>
                        <option value="north_alabama">Alabama Division</option>
                        <option value="tennessee">Tennessee Division</option>
                        <option value="georgia">Georgia Division</option>
                        <option value="international">
                          International Division
                        </option>
                        <option value="engineering">Engineering</option>
                        <option value="scavenger">Scavenger</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="fireteam_lead"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Fireteam Lead
                      </label>
                      <input
                        type="text"
                        id="fireteam_lead"
                        value={editFormData?.fireteam_lead || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev
                              ? { ...prev, fireteam_lead: e.target.value }
                              : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                        placeholder="Enter fireteam lead name"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label
                        htmlFor="title"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Job Title *
                      </label>
                      <input
                        type="text"
                        id="title"
                        value={editFormData?.title || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev ? { ...prev, title: e.target.value } : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                        placeholder="Enter job title"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label
                        htmlFor="description"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Description
                      </label>
                      <textarea
                        id="description"
                        rows={2}
                        value={editFormData?.description || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev
                              ? { ...prev, description: e.target.value }
                              : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white resize-vertical text-sm"
                        placeholder="Enter job description"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label
                        htmlFor="site_address"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Site Address{" "}
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          (for reports)
                        </span>
                      </label>
                      <textarea
                        id="site_address"
                        rows={2}
                        value={editFormData?.site_address || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev
                              ? { ...prev, site_address: e.target.value }
                              : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white resize-vertical text-sm"
                        placeholder="Enter physical site address"
                      />
                    </div>
                  </div>
                </div>

                {/* Status, Priority, Timeline & Quoted Amount Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="w-1 h-5 bg-blue-500 rounded-full"></div>
                    <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                      Status, Timeline & Quoted Amount
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <label
                        htmlFor="status"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Status *
                      </label>
                      <select
                        id="status"
                        value={editFormData?.status || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev ? { ...prev, status: e.target.value } : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="ready_to_bill">Ready to Bill</option>
                        <option value="progress_billing">
                          Progress Billing
                        </option>
                        <option value="billed">Billed</option>
                        <option value="on_hold">On Hold</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="priority"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Priority *
                      </label>
                      <select
                        id="priority"
                        value={editFormData?.priority || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev ? { ...prev, priority: e.target.value } : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="start_date"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Start Date
                      </label>
                      <input
                        type="date"
                        id="start_date"
                        value={editFormData?.start_date?.substring(0, 10) || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev
                              ? { ...prev, start_date: e.target.value }
                              : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="due_date"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Due Date
                      </label>
                      <input
                        type="date"
                        id="due_date"
                        value={editFormData?.due_date?.substring(0, 10) || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev ? { ...prev, due_date: e.target.value } : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="budget"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Quoted Amount ($)
                      </label>
                      <input
                        type="number"
                        id="budget"
                        step="0.01"
                        min="0"
                        value={editFormData?.budget || ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  budget: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                }
                              : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="estimated_man_hours"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Estimated Man Hours
                      </label>
                      <input
                        type="number"
                        id="estimated_man_hours"
                        step="0.1"
                        min="0"
                        value={editFormData?.estimated_man_hours ?? ""}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  estimated_man_hours: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                }
                              : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                        placeholder="From estimate or enter manually"
                      />
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        From linked opportunity estimate when set; otherwise
                        enter manually (e.g. when no letter proposal).
                      </p>
                    </div>
                  </div>

                  {/* Accepted Letter Proposal display */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                      Accepted Letter Proposal
                    </label>
                    <AcceptedLetter jobId={job.id} />
                  </div>
                </div>

                {/* Submittal Tracking Configuration Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-neutral-700">
                    <div className="w-1 h-5 bg-purple-500 rounded-full"></div>
                    <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                      Remote Submittal Tracking
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="submittal_job_type"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Job Type
                      </label>
                      <select
                        id="submittal_job_type"
                        value={editFormData?.submittal_job_type || "standard"}
                        onChange={(e) => {
                          const newType = e.target.value as
                            | "standard"
                            | "data_center";
                          const defaultHours =
                            newType === "data_center" ? 72 : 168;
                          setEditFormData((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  submittal_job_type: newType,
                                  submittal_window_hours: defaultHours,
                                }
                              : null,
                          );
                        }}
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                      >
                        <option value="standard">Standard (7 days)</option>
                        <option value="data_center">
                          Data Center (48-72 hours)
                        </option>
                      </select>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Determines the default submittal timeline window
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="submittal_window_hours"
                        className="block text-sm font-medium text-neutral-700 dark:text-white mb-1"
                      >
                        Submittal Window (hours)
                      </label>
                      <select
                        id="submittal_window_hours"
                        value={editFormData?.submittal_window_hours || 168}
                        onChange={(e) =>
                          setEditFormData((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  submittal_window_hours: Number(
                                    e.target.value,
                                  ),
                                }
                              : null,
                          )
                        }
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 shadow-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-sm"
                      >
                        {editFormData?.submittal_job_type === "data_center" ? (
                          <>
                            <option value="48">48 hours (2 days)</option>
                            <option value="72">72 hours (3 days)</option>
                          </>
                        ) : (
                          <>
                            <option value="168">168 hours (7 days)</option>
                            <option value="120">120 hours (5 days)</option>
                            <option value="240">240 hours (10 days)</option>
                          </>
                        )}
                      </select>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Time allowed between report approval and sending
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      <strong>Note:</strong> Reports will be tracked against
                      this timeline. If a report takes longer than the specified
                      window to send after approval, it will be marked as late
                      in the submittal tracking KPI.
                    </p>
                  </div>
                </div>
              </form>
            </CardContent>

            <CardFooter className="border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-150 px-6 py-4">
              <div className="flex justify-between items-center w-full">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  * Required fields
                </p>
                <div className="flex gap-2">
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowDeleteJobConfirm(true)}
                      className="px-4 py-2 text-sm border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Delete Job
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditFormData(null);
                    }}
                    className="px-4 py-2 text-sm border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-dark-100"
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    onClick={handleEditSubmit}
                    className="px-4 py-2 text-sm bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                  >
                    <Save className="h-4 w-4 mr-1.5" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardFooter>
          </div>
        ) : (
          <div>
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
                    {mergedTitles && mergedTitles.length > 0
                      ? mergedTitles.map((t) => maskJobTitle(t)).join(", ")
                      : maskJobTitle(job.title)}
                  </h1>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-white">
                    Job #{job.job_number || "Pending"}
                  </p>
                </div>
                {/* Additional job header details would go here */}
              </div>

              {/* Global Batch Upload Progress Indicator */}
              {isBatchUploading && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Batch Import in Progress
                        </span>
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                          {batchUploadProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${batchUploadProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        {batchUploadStatus}
                      </p>
                      {selectedBatchFiles.length > 0 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Processing {selectedBatchFiles.length} file
                          {selectedBatchFiles.length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Additional job overview content would go here */}
            </div>

            <div className="border-t border-neutral-200 dark:border-neutral-700">
              <div className="px-6">
                <div className="flex border-b border-neutral-200 dark:border-neutral-700">
                  <button
                    onClick={() => handleTabChange("assets")}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === "assets"
                        ? "border-b-2 border-[#f26722] text-[#f26722]"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300"
                    }`}
                  >
                    Reports
                  </button>
                  <button
                    onClick={() => handleTabChange("reports")}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === "reports"
                        ? "border-b-2 border-[#f26722] text-[#f26722]"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300"
                    } ${user?.user_metadata?.role !== "Admin" ? "opacity-50 cursor-not-allowed" : ""}`}
                    disabled={user?.user_metadata?.role !== "Admin"}
                  >
                    <ClipboardCheck className="h-5 w-5 min-w-[20px] flex-shrink-0 inline-block mr-1" />
                    Report Approvals
                  </button>
                  <button
                    onClick={() => handleTabChange("report-audit")}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === "report-audit"
                        ? "border-b-2 border-[#f26722] text-[#f26722]"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300"
                    }`}
                  >
                    Report Audit
                  </button>
                  <button
                    onClick={() => handleTabChange("tracking")}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === "tracking"
                        ? "border-b-2 border-[#f26722] text-[#f26722]"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300"
                    }`}
                  >
                    Tracking
                  </button>
                  <button
                    onClick={() => handleTabChange("overview")}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === "overview"
                        ? "border-b-2 border-[#f26722] text-[#f26722]"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300"
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => handleTabChange("deliverables")}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === "deliverables"
                        ? "border-b-2 border-[#f26722] text-[#f26722]"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300"
                    }`}
                  >
                    Deliverables
                  </button>
                  <button
                    onClick={() => handleTabChange("notes")}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === "notes"
                        ? "border-b-2 border-[#f26722] text-[#f26722]"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300"
                    }`}
                  >
                    Job Notes
                  </button>
                  <button
                    onClick={() => handleTabChange("pictures")}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === "pictures"
                        ? "border-b-2 border-[#f26722] text-[#f26722]"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300"
                    }`}
                  >
                    Pictures
                  </button>
                  <button
                    onClick={() => handleTabChange("after-action")}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === "after-action"
                        ? "border-b-2 border-[#f26722] text-[#f26722]"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300"
                    }`}
                  >
                    After-Action Reports
                  </button>
                </div>
              </div>

              <div className="p-6">
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    {/* QuickBooks project & hours - hidden per request */}
                    {false && (
                      <Card className="border-[#f26722]/30 bg-neutral-50/50 dark:bg-dark-200/50">
                        <CardHeader>
                          <CardTitle className="text-base font-semibold text-neutral-900 dark:text-white">
                            QuickBooks project & hours
                          </CardTitle>
                          <CardDescription className="text-sm text-neutral-600 dark:text-neutral-400">
                            Link a QuickBooks project or customer to compare
                            estimated vs actual hours worked.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {!qbConnected ? (
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                              Connect QuickBooks in{" "}
                              <strong>Admin Dashboard → Integrations</strong> to
                              search and link projects.
                            </p>
                          ) : job.quickbooks_project_id ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <span className="text-sm font-medium text-neutral-600 dark:text-white">
                                    Linked:{" "}
                                  </span>
                                  <span className="text-neutral-900 dark:text-white font-medium">
                                    {job.quickbooks_project_name ||
                                      job.quickbooks_project_id}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleUnlinkQuickBooksProject}
                                  disabled={qbAssigning}
                                  className="px-3 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-100 dark:hover:bg-dark-100 text-neutral-700 dark:text-white disabled:opacity-50"
                                >
                                  {qbAssigning ? "Unlinking..." : "Unlink"}
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                                <div>
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    Estimated hours
                                  </span>
                                  <p className="font-mono text-neutral-900 dark:text-white">
                                    {job.estimated_man_hours != null &&
                                    !Number.isNaN(
                                      Number(job.estimated_man_hours),
                                    )
                                      ? Number(job.estimated_man_hours)
                                      : "—"}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    Actual hours (QuickBooks)
                                  </span>
                                  <p className="font-mono text-neutral-900 dark:text-white">
                                    {qbHoursLoading
                                      ? "..."
                                      : qbActualHours != null
                                        ? qbActualHours
                                        : "—"}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    Difference
                                  </span>
                                  <p className="font-mono">
                                    {qbHoursLoading ||
                                    (qbActualHours == null &&
                                      job.estimated_man_hours == null)
                                      ? "—"
                                      : (() => {
                                          const est =
                                            job.estimated_man_hours != null
                                              ? Number(job.estimated_man_hours)
                                              : null;
                                          const act = qbActualHours ?? null;
                                          const diff = (act ?? 0) - (est ?? 0);
                                          const color =
                                            diff > 0
                                              ? "text-amber-600 dark:text-amber-400"
                                              : diff < 0
                                                ? "text-green-600 dark:text-green-400"
                                                : "text-neutral-700 dark:text-neutral-300";
                                          return (
                                            <span className={color}>
                                              {diff >= 0 ? "+" : ""}
                                              {diff.toFixed(2)}
                                            </span>
                                          );
                                        })()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="relative">
                              <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                                Search and assign
                              </label>
                              <input
                                type="text"
                                placeholder="Search QuickBooks projects or customers..."
                                value={qbProjectSearchQuery}
                                onChange={(e) => {
                                  setQbProjectSearchQuery(e.target.value);
                                  setQbProjectSearchOpen(true);
                                }}
                                onFocus={() => setQbProjectSearchOpen(true)}
                                className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
                              />
                              {qbProjectSearchOpen && (
                                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-lg">
                                  {qbProjectSearching ? (
                                    <div className="p-3 text-sm text-neutral-500 dark:text-neutral-400">
                                      Searching...
                                    </div>
                                  ) : qbProjectError ? (
                                    <div className="p-3 text-sm text-amber-600 dark:text-amber-400">
                                      Error: {qbProjectError}
                                    </div>
                                  ) : qbProjectSearchResults.length === 0 ? (
                                    <div className="p-3 text-sm text-neutral-500 dark:text-neutral-400">
                                      {qbProjectSearchQuery.trim()
                                        ? "No results."
                                        : "Type to search or click a result to assign."}
                                    </div>
                                  ) : (
                                    qbProjectSearchResults.map((p) => (
                                      <button
                                        key={p.Id}
                                        type="button"
                                        disabled={qbAssigning}
                                        onClick={() =>
                                          handleAssignQuickBooksProject(
                                            p.Id,
                                            p.Name || p.DisplayName || p.Id,
                                          )
                                        }
                                        className="w-full text-left px-3 py-2 hover:bg-neutral-50 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0 text-neutral-900 dark:text-white disabled:opacity-50"
                                      >
                                        {p.Name || p.DisplayName || p.Id}
                                      </button>
                                    ))
                                  )}
                                  <div className="p-2 border-t border-neutral-200 dark:border-neutral-700">
                                    <button
                                      type="button"
                                      className="w-full text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
                                      onClick={() => {
                                        setQbProjectSearchOpen(false);
                                        setQbProjectSearchQuery("");
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Project Status Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-neutral-600 dark:text-white">
                            Project Status
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center space-x-2">
                              <div
                                className={`h-3 w-3 rounded-full ${
                                  job.status === "completed"
                                    ? "bg-green-500"
                                    : job.status === "in_progress"
                                      ? "bg-blue-500"
                                      : job.status === "pending"
                                        ? "bg-yellow-500"
                                        : job.status === "ready_to_bill"
                                          ? "bg-purple-500"
                                          : job.status === "progress_billing"
                                            ? "bg-orange-500"
                                            : job.status === "billed"
                                              ? "bg-indigo-500"
                                              : "bg-neutral-500"
                                }`}
                              />
                              <span className="text-lg font-semibold capitalize text-neutral-900 dark:text-white">
                                {job.status.replace("_", " ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {!isStatusEditing ? (
                                <button
                                  className="px-3 py-1 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-100 text-neutral-700 dark:text-white"
                                  onClick={() => setIsStatusEditing(true)}
                                >
                                  Change
                                </button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <select
                                    defaultValue={job.status}
                                    onChange={(e) =>
                                      setJob((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              status: e.target.value as any,
                                            }
                                          : prev,
                                      )
                                    }
                                    className="mt-0 block w-full p-2 bg-neutral-100 dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded-md text-neutral-900 dark:text-white"
                                  >
                                    <option value="pending">Pending</option>
                                    <option value="in_progress">
                                      In Progress
                                    </option>
                                    <option value="completed">Completed</option>
                                    <option value="ready_to_bill">
                                      Ready to Bill
                                    </option>
                                    <option value="progress_billing">
                                      Progress Billing
                                    </option>
                                    <option value="billed">Billed</option>
                                  </select>
                                  <button
                                    className="px-3 py-1 text-sm text-white bg-[#f26722] rounded-md hover:bg-[#e55611]"
                                    onClick={() =>
                                      handleQuickStatusSave(
                                        (job.status as any) || "pending",
                                      )
                                    }
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="px-3 py-1 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-100 text-neutral-700 dark:text-white"
                                    onClick={() => setIsStatusEditing(false)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-neutral-600 dark:text-white">
                            Priority
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center space-x-2">
                            {job.priority === "high" ? (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            ) : job.priority === "medium" ? (
                              <Clock className="h-4 w-4 text-yellow-500" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                            <span className="text-lg font-semibold text-neutral-900 dark:text-white">
                              {formatStatusLabel(job.priority)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-neutral-600 dark:text-white">
                            Fireteam Lead
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center space-x-2">
                              <User className="h-4 w-4 text-[#f26722]" />
                              <span className="text-lg font-semibold text-neutral-900 dark:text-white">
                                {job.fireteam_lead || "Not assigned"}
                              </span>
                            </div>
                            <div className="relative fireteam-lead-selector">
                              <button
                                className="px-3 py-1 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-100 text-neutral-700 dark:text-white"
                                onClick={() =>
                                  setIsFireteamLeadSelectorOpen(
                                    !isFireteamLeadSelectorOpen,
                                  )
                                }
                              >
                                {job.fireteam_lead ? "Change" : "Assign"}
                              </button>

                              {/* User Selection Dropdown */}
                              {isFireteamLeadSelectorOpen && (
                                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-lg shadow-lg z-50">
                                  <div className="p-3">
                                    <input
                                      type="text"
                                      placeholder="Search users..."
                                      value={userSearchQuery}
                                      onChange={(e) =>
                                        setUserSearchQuery(e.target.value)
                                      }
                                      className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                                    />
                                  </div>
                                  <div className="max-h-60 overflow-y-auto">
                                    {users
                                      .filter((u) => {
                                        const searchLower =
                                          userSearchQuery.toLowerCase();
                                        const email =
                                          u.email?.toLowerCase() || "";
                                        if (!/@ampqes\.com$/i.test(email))
                                          return false;
                                        const name =
                                          displayUserName(u).toLowerCase();
                                        return (
                                          email.includes(searchLower) ||
                                          name.includes(searchLower)
                                        );
                                      })
                                      .map((u) => (
                                        <div
                                          key={u.id}
                                          className="px-3 py-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-100 border-b border-neutral-100 dark:border-neutral-700 last:border-b-0"
                                          onClick={() =>
                                            handleFireteamLeadSelect(u)
                                          }
                                        >
                                          <div className="flex flex-col">
                                            <span className="font-medium text-neutral-900 dark:text-white">
                                              {displayUserName(u)}
                                            </span>
                                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                              {u.email}
                                            </span>
                                            {u.user_metadata?.role && (
                                              <span className="text-xs text-neutral-600 dark:text-neutral-300">
                                                Role: {u.user_metadata.role}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    {users.filter((u) => {
                                      const searchLower =
                                        userSearchQuery.toLowerCase();
                                      const email =
                                        u.email?.toLowerCase() || "";
                                      if (!/@ampqes\.com$/i.test(email))
                                        return false;
                                      const name =
                                        displayUserName(u).toLowerCase();
                                      return (
                                        email.includes(searchLower) ||
                                        name.includes(searchLower)
                                      );
                                    }).length === 0 && (
                                      <div className="px-3 py-4 text-center text-neutral-500 dark:text-neutral-400">
                                        No users found
                                      </div>
                                    )}
                                  </div>
                                  <div className="p-2 border-t border-neutral-200 dark:border-neutral-700">
                                    <button
                                      className="w-full px-3 py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
                                      onClick={() => {
                                        setIsFireteamLeadSelectorOpen(false);
                                        setUserSearchQuery("");
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Job Details & Customer Information */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Job Information */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center space-x-2">
                            <Building className="h-5 w-5 text-[#f26722]" />
                            <span>Job Information</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-neutral-600 dark:text-white">
                              Job Number
                            </label>
                            <p className="text-neutral-900 dark:text-white font-mono">
                              {job.job_number || "Pending"}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-neutral-600 dark:text-white">
                              Title
                            </label>
                            <p className="text-neutral-900 dark:text-white">
                              {maskJobTitle(job.title)}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-neutral-600 dark:text-white">
                              Job Site Address
                            </label>
                            <div className="flex items-start space-x-2">
                              <MapPin className="h-4 w-4 text-neutral-500 mt-0.5" />
                              <p className="text-neutral-900 dark:text-white text-sm">
                                {maskCustomerAddress(job.site_address) ||
                                  "Not set"}
                              </p>
                            </div>
                          </div>
                          {job.description && !isDemoMode && (
                            <div>
                              <label className="text-sm font-medium text-neutral-600 dark:text-white">
                                Description
                              </label>
                              <p className="text-neutral-900 dark:text-white text-sm">
                                {job.description}
                              </p>
                            </div>
                          )}
                          {opportunity && (
                            <div>
                              <label className="text-sm font-medium text-neutral-600 dark:text-white">
                                Opportunity
                              </label>
                              <div className="flex items-center gap-2">
                                <a
                                  href={`/opportunities/${opportunity.id}`}
                                  className="text-[#f26722] hover:underline"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    navigate(
                                      `/sales-dashboard/opportunities/${opportunity.id}`,
                                    );
                                  }}
                                >
                                  {opportunity.quote_number ||
                                    `Opportunity #${opportunity.id}`}
                                </a>
                                {(opportunity as any).opportunity_type ===
                                  "time_materials" && (
                                  <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400 font-semibold text-xs">
                                    T&M
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          <div>
                            <label className="text-sm font-medium text-neutral-600 dark:text-white">
                              Estimated Man Hours
                            </label>
                            <p className="text-neutral-900 dark:text-white">
                              {(() => {
                                const fromJob =
                                  job.estimated_man_hours != null
                                    ? Number(job.estimated_man_hours)
                                    : null;
                                const fromOpp =
                                  opportunity?.total_man_hours != null
                                    ? typeof opportunity.total_man_hours ===
                                      "number"
                                      ? opportunity.total_man_hours
                                      : Number(opportunity.total_man_hours)
                                    : null;
                                const val = fromJob ?? fromOpp;
                                return val != null && !Number.isNaN(val)
                                  ? `${val} hours`
                                  : "Not set";
                              })()}
                            </p>
                          </div>
                          {job.notes &&
                            /T&M|time.*material/i.test(job.notes) &&
                            !opportunity && (
                              <div>
                                <label className="text-sm font-medium text-neutral-600 dark:text-white">
                                  Source
                                </label>
                                <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400 font-semibold text-xs">
                                  T&M
                                </span>
                              </div>
                            )}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-neutral-600 dark:text-white">
                                Start Date
                              </label>
                              <div className="flex items-center space-x-2">
                                <Calendar className="h-4 w-4 text-neutral-500" />
                                <p className="text-neutral-900 dark:text-white text-sm">
                                  {job.start_date
                                    ? format(
                                        new Date(job.start_date),
                                        "MMM d, yyyy",
                                      )
                                    : "Not set"}
                                </p>
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-neutral-600 dark:text-white">
                                Due Date
                              </label>
                              <div className="flex items-center space-x-2">
                                <Calendar className="h-4 w-4 text-neutral-500" />
                                <p className="text-neutral-900 dark:text-white text-sm">
                                  {job.due_date
                                    ? format(
                                        new Date(job.due_date),
                                        "MMM d, yyyy",
                                      )
                                    : "Not set"}
                                </p>
                              </div>
                            </div>
                          </div>
                          {job.division && (
                            <div>
                              <label className="text-sm font-medium text-neutral-600 dark:text-white">
                                Division
                              </label>
                              <p className="text-neutral-900 dark:text-white">
                                {formatDivisionDisplay(job.division)}
                              </p>
                            </div>
                          )}
                          <div>
                            <label className="text-sm font-medium text-neutral-600 dark:text-white">
                              Fireteam Lead
                            </label>
                            <div className="flex items-center space-x-2">
                              <User className="h-4 w-4 text-neutral-500" />
                              <p className="text-neutral-900 dark:text-white text-sm">
                                {job.fireteam_lead || "Not assigned"}
                              </p>
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-neutral-600 dark:text-white">
                              Progress Billing Status
                            </label>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              {!isProgressBillingStatusEditing ? (
                                <>
                                  <p className="text-neutral-900 dark:text-white text-sm capitalize">
                                    {job.progress_billing_status
                                      ? job.progress_billing_status.replace(
                                          "_",
                                          " ",
                                        )
                                      : "Not set"}
                                  </p>
                                  <button
                                    className="px-3 py-1 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-100 text-neutral-700 dark:text-white"
                                    onClick={() =>
                                      setIsProgressBillingStatusEditing(true)
                                    }
                                  >
                                    {job.progress_billing_status
                                      ? "Change"
                                      : "Set"}
                                  </button>
                                </>
                              ) : (
                                <div className="flex items-center gap-2 w-full">
                                  <select
                                    defaultValue={
                                      job.progress_billing_status || ""
                                    }
                                    onChange={(e) =>
                                      setJob((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              progress_billing_status:
                                                e.target.value || null,
                                            }
                                          : prev,
                                      )
                                    }
                                    className="flex-1 p-2 bg-neutral-100 dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600 rounded-md text-neutral-900 dark:text-white text-sm"
                                  >
                                    <option value="">Not set</option>
                                    <option value="not_started">
                                      Not Started
                                    </option>
                                    <option value="in_progress">
                                      In Progress
                                    </option>
                                    <option value="completed">Completed</option>
                                    <option value="on_hold">On Hold</option>
                                    <option value="cancelled">Cancelled</option>
                                  </select>
                                  <button
                                    className="px-3 py-1 text-sm text-white bg-[#f26722] rounded-md hover:bg-[#e55611]"
                                    onClick={async () => {
                                      if (!id || !job) return;
                                      try {
                                        const newStatus =
                                          job.progress_billing_status || null;
                                        const {
                                          data: updatedRow,
                                          error: updateError,
                                        } = await supabase
                                          .schema("neta_ops")
                                          .from("jobs")
                                          .update({
                                            progress_billing_status: newStatus,
                                            updated_at:
                                              new Date().toISOString(),
                                          })
                                          .eq("id", id)
                                          .select()
                                          .single();

                                        if (updateError) throw updateError;
                                        if (!updatedRow) {
                                          throw new Error(
                                            "Update not permitted by current permissions (RLS) or job not found.",
                                          );
                                        }

                                        setJob((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                progress_billing_status:
                                                  newStatus,
                                              }
                                            : prev,
                                        );
                                        if (refreshJobDetails) {
                                          refreshJobDetails();
                                        }
                                        setIsProgressBillingStatusEditing(
                                          false,
                                        );
                                        toast({
                                          title:
                                            "Progress billing status updated",
                                          description: newStatus
                                            ? `Status set to ${newStatus.replace("_", " ")}`
                                            : "Status cleared",
                                          variant: "success",
                                        });
                                      } catch (error: any) {
                                        const errorMessage =
                                          error?.message || "Unknown error";
                                        console.error(
                                          "Failed to update progress billing status:",
                                          error,
                                        );
                                        toast({
                                          title: "Update failed",
                                          description: `Could not update progress billing status: ${errorMessage}`,
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="px-3 py-1 text-sm bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-md hover:bg-neutral-50 dark:hover:bg-dark-100 text-neutral-700 dark:text-white"
                                    onClick={() => {
                                      setIsProgressBillingStatusEditing(false);
                                      // Reset to original value
                                      setJob((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              progress_billing_status:
                                                (jobDetails as any)
                                                  ?.progress_billing_status ||
                                                null,
                                            }
                                          : prev,
                                      );
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Customer Information */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center space-x-2">
                            <User className="h-5 w-5 text-[#f26722]" />
                            <span>Customer Information</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-neutral-600 dark:text-white">
                              Company
                            </label>
                            <Link
                              to={getCustomerPath(job.customers.id)}
                              className="text-neutral-900 dark:text-white font-semibold hover:text-[#f26722] hover:underline"
                            >
                              {maskCustomerName(
                                job.customers.company_name ||
                                  job.customers.name,
                              )}
                            </Link>
                          </div>
                          {job.customers.address && (
                            <div>
                              <label className="text-sm font-medium text-neutral-600 dark:text-white">
                                Customer Address
                              </label>
                              <div className="flex items-start space-x-2">
                                <MapPin className="h-4 w-4 text-neutral-500 mt-0.5" />
                                <p className="text-neutral-900 dark:text-white text-sm">
                                  {maskCustomerAddress(job.customers.address)}
                                </p>
                              </div>
                            </div>
                          )}
                          {contacts.length > 0 && (
                            <div>
                              <label className="text-sm font-medium text-neutral-600 dark:text-white">
                                Primary Contact
                              </label>
                              {contacts
                                .filter((c) => c.is_primary)
                                .map((contact) => (
                                  <div key={contact.id} className="space-y-2">
                                    <p className="text-neutral-900 dark:text-white font-medium">
                                      {contact.first_name} {contact.last_name}
                                    </p>
                                    <div className="space-y-1">
                                      <div className="flex items-center space-x-2">
                                        <Mail className="h-4 w-4 text-neutral-500" />
                                        <p className="text-neutral-900 dark:text-white text-sm">
                                          {contact.email}
                                        </p>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <Phone className="h-4 w-4 text-neutral-500" />
                                        <p className="text-neutral-900 dark:text-white text-sm">
                                          {contact.phone}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Contracts Section */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center space-x-2">
                            <FileText className="h-5 w-5 text-[#f26722]" />
                            <span>Contracts / Agreements / Invoices / etc</span>
                          </CardTitle>
                          <div className="flex items-center gap-4 flex-wrap">
                            <span className="text-sm text-neutral-600 dark:text-neutral-400">
                              Total Contract Value:{" "}
                              <span
                                className={`font-semibold ${totalContractValue < 0 ? "text-red-600 dark:text-red-400" : totalContractValue > 0 ? "text-green-600 dark:text-green-400" : "text-neutral-900 dark:text-white"}`}
                              >
                                {totalContractValue < 0 ? "-" : ""}$
                                {Math.abs(totalContractValue).toLocaleString(
                                  "en-US",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </span>
                            </span>
                            <span className="text-sm text-neutral-600 dark:text-neutral-400">
                              Remaining Balance Left to Bill:{" "}
                              <span
                                className={`font-semibold ${remainingBalance < 0 ? "text-red-600 dark:text-red-400" : remainingBalance > 0 ? "text-green-600 dark:text-green-400" : "text-neutral-900 dark:text-white"}`}
                              >
                                {remainingBalance < 0 ? "-" : ""}$
                                {Math.abs(remainingBalance).toLocaleString(
                                  "en-US",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </span>
                            </span>
                            <Button
                              onClick={() => setShowContractUpload(true)}
                              className="flex items-center space-x-2"
                            >
                              <Upload className="h-4 w-4" />
                              <span>Add Action</span>
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {contracts.length === 0 ? (
                          <div className="text-center py-8 text-neutral-500 dark:text-white">
                            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No actions added yet</p>
                            <p className="text-sm">
                              Add your first action to get started
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {contracts.map((contract) => {
                              const rawVal = contract.value ?? 0;
                              const amount = Math.abs(Number(rawVal));
                              const op = getValueOp(contract);
                              const valueLabel =
                                op === "add_to_total"
                                  ? `+$${amount.toLocaleString()}`
                                  : op === "subtract_from_total"
                                    ? `-$${amount.toLocaleString()} (from contract)`
                                    : op === "subtract_from_remaining"
                                      ? `-$${amount.toLocaleString()}`
                                      : op === "add_to_remaining"
                                        ? `+$${amount.toLocaleString()} (to remaining)`
                                        : `-$${amount.toLocaleString()}`;
                              const hasFile =
                                contract.file_url != null &&
                                contract.file_url !== "";
                              return (
                                <div
                                  key={contract.id}
                                  className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-3">
                                        <FileText className="h-5 w-5 text-[#f26722]" />
                                        <div>
                                          <h4 className="font-medium text-neutral-900 dark:text-white">
                                            {contract.name}
                                          </h4>
                                          <div className="flex items-center space-x-4 text-sm text-neutral-500 dark:text-white flex-wrap gap-y-1">
                                            <span className="capitalize">
                                              {contract.type.replace("_", " ")}
                                            </span>
                                            <Badge
                                              className={
                                                contract.status === "signed"
                                                  ? "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"
                                                  : contract.status ===
                                                      "pending"
                                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100"
                                                    : contract.status ===
                                                        "expired"
                                                      ? "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100"
                                                      : "bg-neutral-100 text-neutral-800 dark:bg-dark-150 dark:text-neutral-100"
                                              }
                                            >
                                              {contract.status}
                                            </Badge>
                                            {contract.value !== null &&
                                              contract.value !== undefined && (
                                                <span
                                                  className={
                                                    op ===
                                                      "subtract_from_remaining" ||
                                                    op === "subtract_from_total"
                                                      ? "text-red-600 dark:text-red-400"
                                                      : ""
                                                  }
                                                >
                                                  {valueLabel}
                                                </span>
                                              )}
                                            <span>
                                              {format(
                                                new Date(
                                                  contract.uploaded_date,
                                                ),
                                                "MMM d, yyyy",
                                              )}
                                            </span>
                                          </div>
                                          {contract.description && (
                                            <p className="text-sm text-neutral-600 dark:text-white mt-1">
                                              {contract.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      {hasFile && (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              setSelectedContract(contract);
                                              setShowContractViewer(true);
                                            }}
                                          >
                                            <Eye className="h-4 w-4 mr-1" />
                                            View
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              if (contract.file_url) {
                                                const link =
                                                  document.createElement("a");
                                                link.href = contract.file_url;
                                                link.download = contract.name;
                                                link.click();
                                              }
                                            }}
                                          >
                                            <Download className="h-4 w-4 mr-1" />
                                            Download
                                          </Button>
                                        </>
                                      )}
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          handleContractDelete(contract.id)
                                        }
                                        className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                                      >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Delete
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* One-Line Drawings Section */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center space-x-2">
                            <Image className="h-5 w-5 text-[#f26722]" />
                            <span>One-Line Drawings</span>
                          </CardTitle>
                          <Button
                            onClick={() => setShowDrawingUpload(true)}
                            className="flex items-center space-x-2"
                          >
                            <Upload className="h-4 w-4" />
                            <span>Upload Drawing</span>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {oneLineDrawings.length === 0 ? (
                          <div className="text-center py-8 text-neutral-500 dark:text-white">
                            <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No drawings uploaded yet</p>
                            <p className="text-sm">
                              Upload your first one-line drawing to get started
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {oneLineDrawings.map((drawing) => (
                              <div
                                key={drawing.id}
                                className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                              >
                                <div className="aspect-video bg-neutral-100 dark:bg-dark-150 rounded-lg mb-3 flex items-center justify-center">
                                  <Image className="h-8 w-8 text-neutral-400" />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-medium text-neutral-900 dark:text-white text-sm truncate">
                                      {drawing.name}
                                    </h4>
                                    <Badge
                                      className={
                                        drawing.is_current
                                          ? "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"
                                          : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
                                      }
                                    >
                                      {drawing.is_current
                                        ? "Current"
                                        : "Previous"}
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-neutral-500 dark:text-white">
                                    <p>Version {drawing.version}</p>
                                    <p>
                                      {format(
                                        new Date(drawing.created_at),
                                        "MMM d, yyyy",
                                      )}
                                    </p>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDrawingView(drawing)}
                                      className="flex-1"
                                    >
                                      <Maximize2 className="h-3 w-3 mr-1" />
                                      View
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        window.open(drawing.file_url, "_blank")
                                      }
                                    >
                                      <Edit3 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Miscellaneous Documents Section */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center space-x-2">
                            <FileText className="h-5 w-5 text-[#f26722]" />
                            <span>Miscellaneous</span>
                          </CardTitle>
                          <Button
                            onClick={() => setShowMiscUpload(true)}
                            className="flex items-center space-x-2"
                          >
                            <Upload className="h-4 w-4" />
                            <span>Upload Document</span>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {miscellaneousDocuments.length === 0 ? (
                          <div className="text-center py-8 text-neutral-500 dark:text-white">
                            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No documents uploaded yet</p>
                            <p className="text-sm">
                              Upload your first document to get started
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {miscellaneousDocuments.map((document) => (
                              <div
                                key={document.id}
                                className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-3">
                                      <FileText className="h-5 w-5 text-[#f26722]" />
                                      <div>
                                        <h4 className="font-medium text-neutral-900 dark:text-white">
                                          {document.name}
                                        </h4>
                                        <div className="flex items-center space-x-4 text-sm text-neutral-500 dark:text-white">
                                          <span>
                                            {format(
                                              new Date(document.created_at),
                                              "MMM d, yyyy",
                                            )}
                                          </span>
                                          {document.file_size && (
                                            <span>
                                              {Math.round(
                                                document.file_size / 1024,
                                              )}{" "}
                                              KB
                                            </span>
                                          )}
                                        </div>
                                        {document.description && (
                                          <p className="text-sm text-neutral-600 dark:text-white mt-1">
                                            {document.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleMiscView(document)}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      View
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        window.open(document.file_url, "_blank")
                                      }
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        handleMiscDelete(document.id)
                                      }
                                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {activeTab === "assets" && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium">
                        Reports & Linked Reports
                      </h3>
                      <div
                        className="flex space-x-2 relative"
                        ref={dropdownRef}
                      >
                        <Button
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          leftIcon={<Plus className="h-5 w-5 shrink-0" />}
                        >
                          Add Asset
                        </Button>

                        {isDropdownOpen && (
                          <div className="absolute right-0 top-10 w-[32rem] rounded-md shadow-lg bg-white dark:bg-dark-150 ring-1 ring-black ring-opacity-5 z-10">
                            <div
                              className="py-1"
                              role="menu"
                              aria-orientation="vertical"
                            >
                              <div className="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-white">
                                Upload Document
                              </div>
                              <button
                                className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                onClick={() => {
                                  setShowUploadDialog(true);
                                  setIsDropdownOpen(false);
                                }}
                              >
                                <div className="flex items-center">
                                  <Upload className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                  Upload File
                                </div>
                              </button>

                              <button
                                className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                onClick={() => {
                                  handleImportReport();
                                  setIsDropdownOpen(false);
                                }}
                              >
                                <div className="flex items-center">
                                  <Download className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                  Upload Report
                                </div>
                              </button>

                              <button
                                className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                onClick={() => {
                                  handleBatchImportReport();
                                  setIsDropdownOpen(false);
                                }}
                              >
                                <div className="flex items-center">
                                  <Upload className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                  Batch Upload Reports
                                </div>
                              </button>

                              <button
                                className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                onClick={() => {
                                  setShowPdfReportUploadDialog(true);
                                  setIsDropdownOpen(false);
                                }}
                              >
                                <div className="flex items-center">
                                  <FileText className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                  Upload PDF Report
                                </div>
                              </button>

                              <div className="border-t border-neutral-100 dark:border-neutral-700 my-1"></div>

                              <div className="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-white">
                                Create Report
                              </div>

                              <div className="px-4 py-2">
                                <Input
                                  placeholder="Search reports..."
                                  value={reportSearchQuery}
                                  onChange={(e) =>
                                    setReportSearchQuery(e.target.value)
                                  }
                                  className="w-full mb-2"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>

                              <div className="max-h-60 overflow-y-auto">
                                {filteredReportTemplates.length === 0 ? (
                                  <div className="px-4 py-2 text-sm text-neutral-500">
                                    No matching reports found
                                  </div>
                                ) : (
                                  <>
                                    {/* ATS Reports Section */}
                                    <div className="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-white bg-neutral-50 dark:bg-dark-150">
                                      ATS Reports
                                    </div>
                                    {filteredReportTemplates
                                      .filter(
                                        (asset) =>
                                          asset.template_type === "ATS",
                                      )
                                      .map((asset) => (
                                        <Link
                                          key={asset.id}
                                          to={getReportEditPath(asset)}
                                          className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                          onClick={() =>
                                            setIsDropdownOpen(false)
                                          }
                                        >
                                          <div className="flex items-center">
                                            <FileText className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                            <span className="truncate">
                                              {asset.id ===
                                              "low-voltage-cable-test-12sets"
                                                ? "3-Low Voltage Cable Test ATS"
                                                : asset.name}
                                            </span>
                                          </div>
                                        </Link>
                                      ))}

                                    {/* MTS Reports Section */}
                                    <div className="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-white bg-neutral-50 dark:bg-dark-150">
                                      MTS Reports
                                    </div>
                                    {filteredReportTemplates
                                      .filter(
                                        (asset) =>
                                          asset.template_type === "MTS",
                                      )
                                      .map((asset) => (
                                        <Link
                                          key={asset.id}
                                          to={getReportEditPath(asset)}
                                          className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                          onClick={() =>
                                            setIsDropdownOpen(false)
                                          }
                                        >
                                          <div className="flex items-center">
                                            <FileText className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                            <span className="truncate">
                                              {asset.id ===
                                              "low-voltage-cable-test-12sets"
                                                ? "3-Low Voltage Cable Test ATS"
                                                : asset.name}
                                            </span>
                                          </div>
                                        </Link>
                                      ))}

                                    {/* Other Reports (if any without specific template_type) */}
                                    {filteredReportTemplates.some(
                                      (asset) => !asset.template_type,
                                    ) && (
                                      <>
                                        <div className="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-white bg-neutral-50 dark:bg-dark-150">
                                          Other Reports
                                        </div>
                                        {filteredReportTemplates
                                          .filter(
                                            (asset) => !asset.template_type,
                                          )
                                          .map((asset) => (
                                            <Link
                                              key={asset.id}
                                              to={getReportEditPath(asset)}
                                              className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                              onClick={() =>
                                                setIsDropdownOpen(false)
                                              }
                                            >
                                              <div className="flex items-center">
                                                <FileText className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                                <span className="truncate">
                                                  {asset.id ===
                                                  "low-voltage-cable-test-12sets"
                                                    ? "3-Low Voltage Cable Test ATS"
                                                    : asset.name}
                                                </span>
                                              </div>
                                            </Link>
                                          ))}
                                      </>
                                    )}

                                    {/* Custom Forms */}
                                    {customFormTemplates.length > 0 && (
                                      <>
                                        <div className="border-t border-neutral-100 dark:border-neutral-700 my-1" />
                                        <div className="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-white bg-neutral-50 dark:bg-dark-150">
                                          Custom Forms
                                        </div>
                                        {customFormTemplates.map((t) => (
                                          <Link
                                            key={t.id}
                                            to={`/jobs/${id}/custom-form/${t.id}/new`}
                                            className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                            onClick={() =>
                                              setIsDropdownOpen(false)
                                            }
                                          >
                                            <div className="flex items-center">
                                              <FileText className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                              <span className="truncate">
                                                {t.name}
                                              </span>
                                              {t.neta_section && (
                                                <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                                                  ({t.neta_section})
                                                </span>
                                              )}
                                            </div>
                                          </Link>
                                        ))}
                                      </>
                                    )}

                                    {/* Internal Forms */}
                                    {INTERNAL_FORM_TEMPLATES.length > 0 && (
                                      <>
                                        <div className="border-t border-neutral-100 dark:border-neutral-700 my-1" />
                                        <div className="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-white bg-neutral-50 dark:bg-dark-150">
                                          Internal Forms
                                        </div>
                                        {INTERNAL_FORM_TEMPLATES.map((t) => (
                                          <Link
                                            key={t.slug}
                                            to={`/jobs/${id}/${t.slug}`}
                                            className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                            onClick={() =>
                                              setIsDropdownOpen(false)
                                            }
                                          >
                                            <div className="flex items-center">
                                              <FileText className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                              <span className="truncate">
                                                {t.name}
                                              </span>
                                            </div>
                                          </Link>
                                        ))}
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Linked assets section */}
                    <CardHeader>
                      <div className="flex justify-between">
                        <div>
                          <CardTitle>Linked Reports</CardTitle>
                        </div>
                        <div className="w-1/3">
                          <Input
                            placeholder="Search assets..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full"
                          />
                        </div>
                      </div>

                      {/* Status filter tabs */}
                      <div className="mt-4">
                        <div className="flex space-x-1 bg-neutral-100 dark:bg-dark-150 p-1 rounded-lg">
                          <button
                            onClick={() => setAssetStatusFilter("all")}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              assetStatusFilter === "all"
                                ? "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
                                : "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            All ({totalAssetCount})
                          </button>
                          <button
                            onClick={() => setAssetStatusFilter("not started")}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              assetStatusFilter === "not started"
                                ? "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
                                : "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            Not Started (
                            {
                              jobAssets.filter(
                                (asset) => asset.status === "not started",
                              ).length
                            }
                            )
                          </button>
                          <button
                            onClick={() => setAssetStatusFilter("in_progress")}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              assetStatusFilter === "in_progress"
                                ? "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
                                : "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            In Progress (
                            {
                              jobAssets.filter(
                                (asset) =>
                                  !asset.status ||
                                  asset.status === "in_progress",
                              ).length
                            }
                            )
                          </button>
                          <button
                            onClick={() =>
                              setAssetStatusFilter("ready_for_review")
                            }
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              assetStatusFilter === "ready_for_review"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            Ready for Review (
                            {
                              jobAssets.filter(
                                (asset) => asset.status === "ready_for_review",
                              ).length
                            }
                            )
                          </button>
                          <button
                            onClick={() => setAssetStatusFilter("approved")}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              assetStatusFilter === "approved"
                                ? "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
                                : "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            Approved (
                            {
                              jobAssets.filter(
                                (asset) =>
                                  asset.status === "approved" &&
                                  !isInternalFormAsset(asset),
                              ).length
                            }
                            )
                          </button>
                          <button
                            onClick={() =>
                              setAssetStatusFilter("approved_internal_forms")
                            }
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              assetStatusFilter === "approved_internal_forms"
                                ? "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
                                : "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            Approved Internal Forms (
                            {
                              jobAssets.filter(
                                (asset) =>
                                  asset.status === "approved" &&
                                  isInternalFormAsset(asset),
                              ).length
                            }
                            )
                          </button>
                          <button
                            onClick={() => setAssetStatusFilter("sent")}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              assetStatusFilter === "sent"
                                ? "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
                                : "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            Sent (
                            {
                              jobAssets.filter(
                                (asset) => asset.status === "sent",
                              ).length
                            }
                            )
                          </button>
                          <button
                            onClick={() => setAssetStatusFilter("issue")}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              assetStatusFilter === "issue"
                                ? "bg-white dark:bg-dark-150 text-neutral-900 dark:text-white shadow-sm"
                                : "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            Issues (
                            {
                              jobAssets.filter(
                                (asset) => asset.status === "issue",
                              ).length
                            }
                            )
                          </button>
                          <button
                            onClick={() => setAssetStatusFilter("archived")}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              assetStatusFilter === "archived"
                                ? "bg-neutral-500 text-white shadow-sm"
                                : "text-neutral-600 dark:text-white hover:text-neutral-900 dark:hover:text-white"
                            }`}
                          >
                            Archived (
                            {
                              jobAssets.filter(
                                (asset) => asset.status === "archived",
                              ).length
                            }
                            )
                          </button>
                        </div>

                        {/* Print Controls - Only show on Approved tab */}
                        {assetStatusFilter === "approved" && (
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                onClick={() => openSubstationSelector("both")}
                                disabled={isPrinting}
                                variant="secondary"
                              >
                                Generate Cover + Executive Summary
                              </Button>
                              <Button
                                onClick={() => setIsDocListOpen(true)}
                                variant="secondary"
                              >
                                View Cover Letters
                              </Button>

                              {/* Report Print Buttons - Only show when there are approved reports */}
                              {jobAssets.filter(
                                (asset) =>
                                  asset.status === "approved" &&
                                  asset.file_url?.startsWith("report:"),
                              ).length > 0 && (
                                <>
                                  <Button
                                    onClick={handlePrintSelectedApprovedReports}
                                    disabled={isPrinting}
                                    className="bg-[#f26722] hover:bg-[#e55611] text-white"
                                  >
                                    {selectedApprovedIds.size > 0
                                      ? `Print Selected (${selectedApprovedIds.size})`
                                      : "Print Selected"}
                                  </Button>
                                  <Button
                                    onClick={handlePrintAllApprovedReports}
                                    disabled={isPrinting}
                                    variant="secondary"
                                  >
                                    Print All Approved
                                  </Button>
                                  {selectedApprovedIds.size > 0 && (
                                    <Button
                                      onClick={handleMarkSelectedAsSent}
                                      disabled={isPrinting}
                                      className="bg-green-600 hover:bg-green-700 text-white"
                                    >
                                      Mark Selected as Sent (
                                      {selectedApprovedIds.size})
                                    </Button>
                                  )}
                                  <Button
                                    onClick={handleMarkAllApprovedAsSent}
                                    disabled={isPrinting}
                                    variant="secondary"
                                  >
                                    Mark All Sent
                                  </Button>
                                </>
                              )}
                              {/* Publish to customer portal — shows for approved OR sent reports */}
                              {jobAssets.filter(
                                (asset) =>
                                  asset.file_url?.startsWith("report:") &&
                                  ["approved", "sent"].includes(
                                    String(asset.status || "").toLowerCase(),
                                  ),
                              ).length > 0 && (
                                <Button
                                  onClick={handlePublishReportsToPortal}
                                  disabled={isPublishingPortal || isPrinting}
                                  variant="secondary"
                                  title="Render and upload these reports so the customer can view them in the portal"
                                >
                                  {isPublishingPortal
                                    ? "Publishing…"
                                    : "Publish to Portal"}
                                </Button>
                              )}
                            </div>
                            {isPublishingPortal && (
                              <p className="text-sm text-neutral-600 dark:text-white">
                                {portalPublishStatus || "Publishing…"}
                              </p>
                            )}
                            {isPrinting && (
                              <div className="text-sm text-neutral-600 dark:text-white">
                                <div className="w-full bg-neutral-200 dark:bg-dark-150 rounded-full h-2 mb-1">
                                  <div
                                    className="bg-[#f26722] h-2 rounded-full"
                                    style={{ width: `${printProgress}%` }}
                                  ></div>
                                </div>
                                <p className="text-center">
                                  {printStatus || "Preparing..."}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Publish-to-portal control on the Sent tab (backfill already-sent reports) */}
                        {assetStatusFilter === "sent" &&
                          jobAssets.filter(
                            (asset) =>
                              asset.file_url?.startsWith("report:") &&
                              String(asset.status || "").toLowerCase() === "sent",
                          ).length > 0 && (
                            <div className="mt-4 space-y-2">
                              <Button
                                onClick={handlePublishReportsToPortal}
                                disabled={isPublishingPortal || isPrinting}
                                variant="secondary"
                                title="Render and upload these reports so the customer can view them in the portal"
                              >
                                {isPublishingPortal
                                  ? "Publishing…"
                                  : "Publish to Portal"}
                              </Button>
                              {isPublishingPortal && (
                                <p className="text-sm text-neutral-600 dark:text-white">
                                  {portalPublishStatus || "Publishing…"}
                                </p>
                              )}
                            </div>
                          )}

                        {/* Batch archive controls - appear once at least one report is selected */}
                        {selectedAssetIds.size > 0 && (
                          <div className="mt-4 flex items-center gap-2 flex-wrap">
                            <Button
                              variant="secondary"
                              onClick={() => setSelectedAssetIds(new Set())}
                            >
                              Cancel Selection
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={handleSelectAllVisibleAssets}
                            >
                              {filteredJobAssets.length > 0 &&
                              filteredJobAssets.every((a) =>
                                selectedAssetIds.has(a.id),
                              )
                                ? "Deselect All"
                                : "Select All"}
                            </Button>
                            <Button
                              onClick={handleArchiveSelected}
                              disabled={isArchiving}
                              className={
                                assetStatusFilter === "archived"
                                  ? "bg-green-600 hover:bg-green-700 text-white"
                                  : "bg-red-600 hover:bg-red-700 text-white"
                              }
                            >
                              {isArchiving
                                ? "Working..."
                                : assetStatusFilter === "archived"
                                  ? `Restore Selected (${selectedAssetIds.size})`
                                  : `Archive Selected (${selectedAssetIds.size})`}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {jobAssets.length === 0 ? (
                        <div className="text-center py-4 text-neutral-500 dark:text-white">
                          <p>No assets have been linked to this job yet.</p>
                        </div>
                      ) : filteredJobAssets.length === 0 ? (
                        <div className="text-center py-4 text-neutral-500 dark:text-white">
                          <p>No matching assets found</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {(() => {
                            const getFolder = (asset: Asset): string => {
                              const name = asset.name || "";
                              const sub = assetSubstations[asset.id];
                              if (typeof sub === "string" && sub.trim())
                                return sub.trim();
                              if (
                                /import/i.test(name) ||
                                /import/i.test(asset.file_url || "")
                              )
                                return "Imported";
                              return "Other";
                            };

                            const groups: Record<string, Asset[]> = {};
                            filteredJobAssets.forEach((asset) => {
                              const key = getFolder(asset);
                              if (!groups[key]) groups[key] = [];
                              groups[key].push(asset);
                            });

                            const orderKeys = Object.keys(groups).sort(
                              compareLinkedAssetFolderLabels,
                            );

                            const isPaginatedTab =
                              assetStatusFilter === "all" ||
                              assetStatusFilter === "in_progress" ||
                              assetStatusFilter === "sent";

                            // Compute folder-aware pages: group folders into pages without splitting any folder
                            let folderPages: string[][] = [orderKeys];
                            if (isPaginatedTab && orderKeys.length > 0) {
                              folderPages = [];
                              let currentPageKeys: string[] = [];
                              let currentCount = 0;
                              for (const key of orderKeys) {
                                const folderSize = groups[key].length;
                                if (
                                  currentCount > 0 &&
                                  currentCount + folderSize > FOLDER_PAGE_TARGET
                                ) {
                                  folderPages.push(currentPageKeys);
                                  currentPageKeys = [key];
                                  currentCount = folderSize;
                                } else {
                                  currentPageKeys.push(key);
                                  currentCount += folderSize;
                                }
                              }
                              if (currentPageKeys.length > 0) {
                                folderPages.push(currentPageKeys);
                              }
                            }

                            const totalFolderPages = folderPages.length;
                            const safePage =
                              Math.min(folderPage, totalFolderPages) || 1;
                            const visibleKeys =
                              folderPages[safePage - 1] || orderKeys;

                            const renderFolderTable = (folderKey: string) => (
                              <details
                                key={folderKey}
                                className="group border rounded-md overflow-hidden"
                              >
                                <summary className="cursor-pointer select-none bg-neutral-50 dark:bg-dark-150 px-3 py-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-neutral-800 dark:text-white">
                                      {folderKey === "Imported"
                                        ? "Imported"
                                        : folderKey === "Other"
                                          ? "Other"
                                          : `${folderKey}`}
                                    </span>
                                    <span className="text-xs text-neutral-500">
                                      ({groups[folderKey].length})
                                    </span>
                                  </div>
                                  <svg
                                    className="w-4 h-4 text-neutral-500 transform group-open:rotate-180 transition-transform"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 9l-7 7-7-7"
                                    />
                                  </svg>
                                </summary>
                                <div className="bg-white dark:bg-dark-150">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Asset Name</TableHead>
                                        <TableHead>Urgency</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Date Added</TableHead>
                                        <TableHead>Submitted</TableHead>
                                        <TableHead>Approved/Issued</TableHead>
                                        <TableHead>Sent</TableHead>
                                        <TableHead className="text-right">
                                          Open
                                        </TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {groups[folderKey]
                                        .slice()
                                        .sort((a, b) => {
                                          const nameA =
                                            dynamicAssetNames[a.id] || a.name;
                                          const nameB =
                                            dynamicAssetNames[b.id] || b.name;
                                          return compareAlphanumericLabels(
                                            nameA,
                                            nameB,
                                          );
                                        })
                                        .map((asset) => (
                                          <TableRow key={asset.id}>
                                            <TableCell className="font-medium">
                                              <input
                                                type="checkbox"
                                                className="mr-2"
                                                title="Select for archive"
                                                checked={selectedAssetIds.has(
                                                  asset.id,
                                                )}
                                                onChange={() =>
                                                  handleToggleAssetSelection(
                                                    asset.id,
                                                  )
                                                }
                                              />
                                              {asset.status === "approved" &&
                                                (asset.file_url?.startsWith(
                                                  "report:",
                                                ) ||
                                                  (asset.file_url &&
                                                    !asset.file_url.startsWith(
                                                      "report:/",
                                                    ) &&
                                                    asset.file_url
                                                      .toLowerCase()
                                                      .endsWith(".pdf"))) && (
                                                  <input
                                                    type="checkbox"
                                                    className="mr-2"
                                                    title="Select for print/sent"
                                                    checked={selectedApprovedIds.has(
                                                      asset.id,
                                                    )}
                                                    onChange={() =>
                                                      handleToggleApprovedSelection(
                                                        asset.id,
                                                      )
                                                    }
                                                  />
                                                )}
                                              {dynamicAssetNames[asset.id] ||
                                                (asset.id ===
                                                "low-voltage-cable-test-12sets"
                                                  ? "3-Low Voltage Cable Test ATS"
                                                  : asset.name)}
                                            </TableCell>
                                            <TableCell>
                                              <select
                                                value={
                                                  asset.urgency || "normal"
                                                }
                                                onChange={(e) =>
                                                  handleUrgencyUpdate(
                                                    asset.id,
                                                    e.target.value as
                                                      | "normal"
                                                      | "critical",
                                                  )
                                                }
                                                className={`px-2 py-1 rounded text-xs font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                                                  asset.urgency === "critical"
                                                    ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                    : "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300"
                                                }`}
                                              >
                                                <option value="normal">
                                                  Normal
                                                </option>
                                                <option value="critical">
                                                  Critical
                                                </option>
                                              </select>
                                            </TableCell>
                                            <TableCell>
                                              {asset.status ===
                                              "not started" ? (
                                                <select
                                                  value={asset.status}
                                                  onChange={(e) =>
                                                    handleStatusUpdate(
                                                      asset.id,
                                                      e.target
                                                        .value as Asset["status"],
                                                    )
                                                  }
                                                  className="px-2 py-1 rounded text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#f26722] bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
                                                >
                                                  <option value="not started">
                                                    Not Started
                                                  </option>
                                                  <option value="in_progress">
                                                    In Progress
                                                  </option>
                                                  <option value="archived">
                                                    Archived
                                                  </option>
                                                </select>
                                              ) : asset.status ===
                                                "approved" ? (
                                                <select
                                                  value={asset.status}
                                                  onChange={(e) =>
                                                    handleStatusUpdate(
                                                      asset.id,
                                                      e.target
                                                        .value as Asset["status"],
                                                    )
                                                  }
                                                  className="px-2 py-1 rounded text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#f26722] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                                >
                                                  <option value="approved">
                                                    Approved
                                                  </option>
                                                  <option value="ready_for_review">
                                                    Ready for Review
                                                  </option>
                                                  <option value="sent">
                                                    Sent
                                                  </option>
                                                  <option value="archived">
                                                    Archived
                                                  </option>
                                                </select>
                                              ) : asset.status === "sent" ? (
                                                <select
                                                  value={asset.status}
                                                  onChange={(e) =>
                                                    handleStatusUpdate(
                                                      asset.id,
                                                      e.target
                                                        .value as Asset["status"],
                                                    )
                                                  }
                                                  className="px-2 py-1 rounded text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#f26722] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                                >
                                                  <option value="sent">
                                                    Sent
                                                  </option>
                                                  <option value="approved">
                                                    Approved
                                                  </option>
                                                  <option value="archived">
                                                    Archived
                                                  </option>
                                                </select>
                                              ) : asset.status === "issue" ? (
                                                <select
                                                  value={asset.status}
                                                  onChange={(e) =>
                                                    handleStatusUpdate(
                                                      asset.id,
                                                      e.target
                                                        .value as Asset["status"],
                                                    )
                                                  }
                                                  className="px-2 py-1 rounded text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#f26722] bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                                >
                                                  <option value="issue">
                                                    Issue
                                                  </option>
                                                  <option value="ready_for_review">
                                                    Ready for Review
                                                  </option>
                                                  <option value="in_progress">
                                                    In Progress
                                                  </option>
                                                  <option value="not started">
                                                    Not Started
                                                  </option>
                                                  <option value="archived">
                                                    Archived
                                                  </option>
                                                </select>
                                              ) : asset.status ===
                                                "archived" ? (
                                                <select
                                                  value={asset.status}
                                                  onChange={(e) =>
                                                    handleStatusUpdate(
                                                      asset.id,
                                                      e.target
                                                        .value as Asset["status"],
                                                    )
                                                  }
                                                  className="px-2 py-1 rounded text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#f26722] bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
                                                >
                                                  <option value="archived">
                                                    Archived
                                                  </option>
                                                  <option value="not started">
                                                    Not Started
                                                  </option>
                                                  <option value="in_progress">
                                                    In Progress
                                                  </option>
                                                  <option value="ready_for_review">
                                                    Ready for Review
                                                  </option>
                                                  <option value="approved">
                                                    Approved
                                                  </option>
                                                </select>
                                              ) : (
                                                <select
                                                  value={
                                                    asset.status ||
                                                    "not started"
                                                  }
                                                  onChange={(e) =>
                                                    handleStatusUpdate(
                                                      asset.id,
                                                      e.target
                                                        .value as Asset["status"],
                                                    )
                                                  }
                                                  className={`px-2 py-1 rounded text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                                                    (asset.status ||
                                                      "not started") ===
                                                    "ready_for_review"
                                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                                      : (asset.status ||
                                                            "not started") ===
                                                          "not started"
                                                        ? "bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
                                                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                                  }`}
                                                >
                                                  <option value="not started">
                                                    Not Started
                                                  </option>
                                                  <option value="in_progress">
                                                    In Progress
                                                  </option>
                                                  <option value="ready_for_review">
                                                    Ready for Review
                                                  </option>
                                                  <option value="archived">
                                                    Archived
                                                  </option>
                                                </select>
                                              )}
                                            </TableCell>
                                            <TableCell>
                                              {format(
                                                new Date(asset.created_at),
                                                "MMM d, yyyy h:mm a",
                                              )}
                                            </TableCell>
                                            <TableCell>
                                              {(() => {
                                                const ts =
                                                  reportTimestampsByAsset[
                                                    asset.id
                                                  ]?.submitted_at ||
                                                  asset.submitted_at;
                                                return ts
                                                  ? format(
                                                      new Date(ts),
                                                      "MMM d, yyyy h:mm a",
                                                    )
                                                  : "-";
                                              })()}
                                            </TableCell>
                                            <TableCell>
                                              {(() => {
                                                const ts =
                                                  reportTimestampsByAsset[
                                                    asset.id
                                                  ]?.issued_at ||
                                                  reportTimestampsByAsset[
                                                    asset.id
                                                  ]?.approved_at ||
                                                  asset.approved_at;
                                                return ts
                                                  ? format(
                                                      new Date(ts),
                                                      "MMM d, yyyy h:mm a",
                                                    )
                                                  : "-";
                                              })()}
                                            </TableCell>
                                            <TableCell>
                                              {(() => {
                                                const ts =
                                                  reportTimestampsByAsset[
                                                    asset.id
                                                  ]?.sent_at || asset.sent_at;
                                                return ts
                                                  ? format(
                                                      new Date(ts),
                                                      "MMM d, yyyy h:mm a",
                                                    )
                                                  : "-";
                                              })()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                              <div className="flex items-center justify-end space-x-2">
                                                {asset.file_url.startsWith(
                                                  "custom-form:",
                                                ) ? (
                                                  <Link
                                                    to={asset.file_url.replace(
                                                      /^custom-form:/,
                                                      "",
                                                    )}
                                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                  >
                                                    Open Form
                                                  </Link>
                                                ) : asset.file_url.startsWith(
                                                    "report:",
                                                  ) ? (
                                                  <Link
                                                    to={getReportEditPath(
                                                      asset,
                                                    )}
                                                    className="inline-flex text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                    aria-label="Open"
                                                  >
                                                    <SquareArrowOutUpRight className="h-5 w-5" />
                                                  </Link>
                                                ) : (
                                                  <>
                                                    <a
                                                      href={asset.file_url}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                    >
                                                      View
                                                    </a>
                                                    {asset.file_url &&
                                                      !asset.file_url.startsWith(
                                                        "report:/",
                                                      ) &&
                                                      asset.file_url
                                                        .toLowerCase()
                                                        .endsWith(".pdf") && (
                                                        <Button
                                                          variant="ghost"
                                                          size="sm"
                                                          className="text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 p-0 h-auto"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEditPdfReport(
                                                              asset,
                                                            );
                                                          }}
                                                          title="Edit report name and substation"
                                                        >
                                                          <Pencil className="h-4 w-4" />
                                                        </Button>
                                                      )}
                                                  </>
                                                )}
                                                {asset.status === "issue" && (
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-orange-500 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 p-0 h-auto"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleViewComments(asset);
                                                    }}
                                                    title="View issue comments"
                                                  >
                                                    <MessageCircle className="h-4 w-4" />
                                                  </Button>
                                                )}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </details>
                            );

                            return (
                              <>
                                {visibleKeys.map((folderKey) =>
                                  renderFolderTable(folderKey),
                                )}
                                {isPaginatedTab && totalFolderPages > 1 && (
                                  <div className="flex items-center justify-center gap-2 pt-4 pb-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setFolderPage((p) => Math.max(1, p - 1))
                                      }
                                      disabled={safePage <= 1}
                                    >
                                      Previous
                                    </Button>
                                    {Array.from(
                                      { length: totalFolderPages },
                                      (_, i) => i + 1,
                                    ).map((p) => (
                                      <Button
                                        key={p}
                                        variant="outline"
                                        size="sm"
                                        className={
                                          p === safePage
                                            ? "bg-[#f26722] hover:bg-[#e55611] text-white border-[#f26722]"
                                            : ""
                                        }
                                        onClick={() => setFolderPage(p)}
                                      >
                                        {p}
                                      </Button>
                                    ))}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setFolderPage((p) =>
                                          Math.min(totalFolderPages, p + 1),
                                        )
                                      }
                                      disabled={safePage >= totalFolderPages}
                                    >
                                      Next
                                    </Button>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </CardContent>
                  </div>
                )}

                {activeTab === "reports" &&
                  job &&
                  (isAdmin ? (
                    <div className="space-y-6">
                      <CardHeader>
                        <CardTitle>Report Approvals</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ReportApprovalWorkflow
                          division={job.division || undefined}
                          jobId={job.id}
                          onUpdate={() => {
                            // Refresh assets and approved counts when approvals change
                            fetchJobAssets();
                          }}
                        />
                      </CardContent>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <CardHeader>
                        <CardTitle>Technical Reports</CardTitle>
                        <CardDescription>
                          Report approval requires Admin role.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md text-sm text-yellow-800 dark:text-yellow-200">
                          You do not have permission to access the report
                          approval view. Please contact an administrator if you
                          believe this is an error.
                        </div>
                      </CardContent>
                    </div>
                  ))}

                {activeTab === "report-audit" && job && (
                  <div className="space-y-6">
                    <CardHeader>
                      <CardTitle>Report Audit</CardTitle>
                      <CardDescription>
                        Dates and people for report review steps.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {reportAuditRows.length === 0 ? (
                        <div className="text-center py-6 text-neutral-500 dark:text-white">
                          <p>No reports found for this project.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Report</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Submitted for Review</TableHead>
                                <TableHead>Approved</TableHead>
                                <TableHead>Sent</TableHead>
                                <TableHead>Reviewer Comments</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {reportAuditRows.map((row) => (
                                <TableRow key={row.asset.id}>
                                  <TableCell className="font-medium min-w-[240px]">
                                    <div>{row.displayName}</div>
                                    {row.substation && (
                                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                        {row.substation}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {getAuditStatusLabel(row.status)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="min-w-[180px]">
                                    <div>
                                      {formatAuditDate(row.submittedAt)}
                                    </div>
                                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                      {getAuditUserName(row.submittedBy)}
                                    </div>
                                  </TableCell>
                                  <TableCell className="min-w-[180px]">
                                    <div>{formatAuditDate(row.approvedAt)}</div>
                                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                      {getAuditUserName(row.approvedBy)}
                                    </div>
                                  </TableCell>
                                  <TableCell className="min-w-[180px]">
                                    <div>{formatAuditDate(row.sentAt)}</div>
                                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                      {getAuditUserName(row.sentBy)}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {row.reviewComments ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        leftIcon={
                                          <MessageCircle className="h-4 w-4" />
                                        }
                                        onClick={() =>
                                          handleViewComments(row.asset)
                                        }
                                      >
                                        View
                                      </Button>
                                    ) : (
                                      <span className="text-sm text-neutral-500 dark:text-neutral-400">
                                        None
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </div>
                )}

                {activeTab === "deliverables" && job && (
                  <JobDeliverables jobId={job.id} />
                )}

                {activeTab === "notes" && job && <JobNotes jobId={job.id} />}

                {activeTab === "pictures" && job && (
                  <JobPictures jobId={job.id} />
                )}

                {activeTab === "tracking" && job && (
                  <SubmittalTracker
                    submittalJobType={job.submittal_job_type}
                    submittalWindowHours={job.submittal_window_hours}
                    assets={jobAssets}
                    dynamicAssetNames={dynamicAssetNames}
                    isAdmin={isAdmin}
                    onUpdateSentDate={handleUpdateAssetSentDate}
                  />
                )}

                {activeTab === "after-action" && job && (
                  <AfterActionReports
                    jobId={job.id}
                    jobNumber={job.job_number || undefined}
                    clientName={
                      customer?.company_name || customer?.name || undefined
                    }
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Upload file dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload a document to associate with this job.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="document-name" className="text-sm font-medium">
                Document Name
              </label>
              <Input
                id="document-name"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                placeholder="Technical Documentation"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="document-file" className="text-sm font-medium">
                Select File
              </label>
              <Input
                id="document-file"
                type="file"
                onChange={handleFileChange}
              />
              {selectedFile && (
                <p className="text-xs text-neutral-500">
                  {selectedFile.name} ({Math.round(selectedFile.size / 1024)}{" "}
                  KB)
                </p>
              )}
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-center">
                  {uploadProgress}% Uploaded
                </p>
              </div>
            )}

            {isBatchUploading && (
              <div className="space-y-2">
                <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 rounded-full"
                    style={{ width: `${batchUploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-center">
                  {batchUploadProgress}% Complete
                </p>
                <p className="text-xs text-neutral-500 text-center">
                  {batchUploadStatus}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUploadDialog(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleFileUpload}
              disabled={isUploading || !selectedFile || !newAssetName.trim()}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Report Upload Dialog */}
      <Dialog
        open={showPdfReportUploadDialog}
        onOpenChange={setShowPdfReportUploadDialog}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload PDF Report</DialogTitle>
            <DialogDescription>
              Upload a PDF report from test set / manufacturer's software to be
              reviewed and approved.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="pdf-report-name" className="text-sm font-medium">
                Report Name / Identifier *
              </label>
              <Input
                id="pdf-report-name"
                value={pdfReportName}
                onChange={(e) => setPdfReportName(e.target.value)}
                placeholder="e.g., Transformer Test Report - Unit 1"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="pdf-report-substation"
                className="text-sm font-medium"
              >
                Substation
              </label>
              <Input
                id="pdf-report-substation"
                value={pdfReportSubstation}
                onChange={(e) => setPdfReportSubstation(e.target.value)}
                placeholder="e.g., Main Substation"
              />
              <p className="text-xs text-neutral-500">
                You can edit this later if needed
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="pdf-report-file" className="text-sm font-medium">
                PDF File *
              </label>
              <Input
                id="pdf-report-file"
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePdfReportFileChange}
              />
              {pdfReportFile && (
                <p className="text-xs text-neutral-500">
                  {pdfReportFile.name} ({Math.round(pdfReportFile.size / 1024)}{" "}
                  KB)
                </p>
              )}
            </div>

            {isUploadingPdfReport && (
              <div className="space-y-2">
                <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{ width: `${pdfUploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-center">
                  {pdfUploadProgress}% Uploaded
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPdfReportUploadDialog(false);
                setPdfReportFile(null);
                setPdfReportName("");
                setPdfReportSubstation("");
              }}
              disabled={isUploadingPdfReport}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handlePdfReportUpload}
              disabled={
                isUploadingPdfReport || !pdfReportFile || !pdfReportName.trim()
              }
            >
              {isUploadingPdfReport ? "Uploading..." : "Upload Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit PDF Report Dialog */}
      <Dialog
        open={showEditPdfReportDialog}
        onOpenChange={setShowEditPdfReportDialog}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit PDF Report</DialogTitle>
            <DialogDescription>
              Update the report name and substation assignment.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label
                htmlFor="edit-pdf-report-name"
                className="text-sm font-medium"
              >
                Report Name / Identifier *
              </label>
              <Input
                id="edit-pdf-report-name"
                value={editPdfReportName}
                onChange={(e) => setEditPdfReportName(e.target.value)}
                placeholder="e.g., Transformer Test Report - Unit 1"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="edit-pdf-report-substation"
                className="text-sm font-medium"
              >
                Substation
              </label>
              <Input
                id="edit-pdf-report-substation"
                value={editPdfReportSubstation}
                onChange={(e) => setEditPdfReportSubstation(e.target.value)}
                placeholder="e.g., Main Substation"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditPdfReportDialog(false);
                setEditingPdfReport(null);
                setEditPdfReportName("");
                setEditPdfReportSubstation("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleSaveEditedPdfReport}
              disabled={!editPdfReportName.trim()}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this{" "}
              {assetToDelete?.file_url.startsWith("report:")
                ? "report"
                : "document"}{" "}
              from the job?
            </DialogDescription>
          </DialogHeader>

          {assetToDelete && (
            <div className="py-4">
              <div className="flex items-center p-3 bg-neutral-50 dark:bg-dark-150 rounded">
                <FileText className="h-5 w-5 min-w-[20px] flex-shrink-0 text-neutral-500 mr-2" />
                <span className="font-medium">{assetToDelete.name}</span>
              </div>

              {assetToDelete.file_url.startsWith("report:") ? (
                <p className="mt-2 text-sm text-neutral-500">
                  This will only remove the link between the report and this
                  job. The report will still be accessible from its direct URL.
                </p>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">
                  This will permanently delete this document from the system.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setAssetToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAsset}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Job Confirmation Dialog */}
      <Dialog
        open={showDeleteJobConfirm}
        onOpenChange={setShowDeleteJobConfirm}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Job Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this job? This action cannot be
              undone. The job will be soft deleted and hidden from the jobs
              list.
            </DialogDescription>
          </DialogHeader>

          {job && (
            <div className="py-4">
              <div className="flex items-center p-3 bg-neutral-50 dark:bg-dark-150 rounded">
                <Building className="h-5 w-5 min-w-[20px] flex-shrink-0 text-neutral-500 mr-2" />
                <div>
                  <span className="font-medium">{maskJobTitle(job.title)}</span>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Job #{job.job_number || "Pending"}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                This will permanently remove the job from the system. All
                associated data will be hidden but preserved in the database.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteJobConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteJob}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            >
              Delete Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Action Dialog */}
      <Dialog open={showContractUpload} onOpenChange={setShowContractUpload}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add Action</DialogTitle>
            <DialogDescription>
              Add a contract, agreement, invoice, or other action for this job.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 -mr-1">
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label htmlFor="contract-name" className="text-sm font-medium">
                  Action Name
                </label>
                <Input
                  id="contract-name"
                  value={contractForm.name}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder="e.g. Main Contract, PO #12345"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="contract-type" className="text-sm font-medium">
                  Action Type
                </label>
                <select
                  id="contract-type"
                  value={contractForm.type}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      type: e.target.value as Contract["type"],
                    }))
                  }
                  className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-dark-150 text-neutral-900 dark:text-white"
                >
                  <option value="main">Main Contract</option>
                  <option value="subcontract">Subcontract</option>
                  <option value="amendment">Amendment</option>
                  <option value="change_order">Change Order</option>
                  <option value="purchase_order">Purchase Order</option>
                  <option value="invoice">Invoice</option>
                  <option value="discount">Discount</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="contract-value" className="text-sm font-medium">
                  Action Value ($)
                </label>
                <Input
                  id="contract-value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={contractForm.value}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      value: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                />
                <p className="text-xs text-neutral-500">
                  Optional. Leave blank if you only have a PO number or
                  reference.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Value Operation</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="value-operation"
                      value="add_to_total"
                      checked={contractForm.value_operation === "add_to_total"}
                      onChange={(e) =>
                        setContractForm((prev) => ({
                          ...prev,
                          value_operation: e.target
                            .value as ContractValueOperation,
                        }))
                      }
                      className="w-4 h-4 text-[#f26722] focus:ring-[#f26722]"
                    />
                    <span className="text-sm">Add to total contract value</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="value-operation"
                      value="subtract_from_total"
                      checked={
                        contractForm.value_operation === "subtract_from_total"
                      }
                      onChange={(e) =>
                        setContractForm((prev) => ({
                          ...prev,
                          value_operation: e.target
                            .value as ContractValueOperation,
                        }))
                      }
                      className="w-4 h-4 text-[#f26722] focus:ring-[#f26722]"
                    />
                    <span className="text-sm">
                      Subtract from contract value
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="value-operation"
                      value="subtract_from_remaining"
                      checked={
                        contractForm.value_operation ===
                        "subtract_from_remaining"
                      }
                      onChange={(e) =>
                        setContractForm((prev) => ({
                          ...prev,
                          value_operation: e.target
                            .value as ContractValueOperation,
                        }))
                      }
                      className="w-4 h-4 text-[#f26722] focus:ring-[#f26722]"
                    />
                    <span className="text-sm">
                      Subtract from remaining balance (e.g. invoices)
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="value-operation"
                      value="add_to_remaining"
                      checked={
                        contractForm.value_operation === "add_to_remaining"
                      }
                      onChange={(e) =>
                        setContractForm((prev) => ({
                          ...prev,
                          value_operation: e.target
                            .value as ContractValueOperation,
                        }))
                      }
                      className="w-4 h-4 text-[#f26722] focus:ring-[#f26722]"
                    />
                    <span className="text-sm">
                      Add to remaining balance (book corrections only)
                    </span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="contract-start"
                    className="text-sm font-medium"
                  >
                    Start Date
                  </label>
                  <Input
                    id="contract-start"
                    type="date"
                    value={contractForm.start_date}
                    onChange={(e) =>
                      setContractForm((prev) => ({
                        ...prev,
                        start_date: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="contract-end" className="text-sm font-medium">
                    End Date
                  </label>
                  <Input
                    id="contract-end"
                    type="date"
                    value={contractForm.end_date}
                    onChange={(e) =>
                      setContractForm((prev) => ({
                        ...prev,
                        end_date: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="contract-description"
                  className="text-sm font-medium"
                >
                  Description
                </label>
                <textarea
                  id="contract-description"
                  value={contractForm.description}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Brief description (optional)"
                  className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-dark-150 text-neutral-900 dark:text-white resize-none"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="contract-file" className="text-sm font-medium">
                  Attachment (optional)
                </label>
                <Input
                  id="contract-file"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setContractFile(e.target.files?.[0] || null)}
                />
                {contractFile && (
                  <p className="text-xs text-neutral-500">
                    {contractFile.name} ({Math.round(contractFile.size / 1024)}{" "}
                    KB)
                  </p>
                )}
                <p className="text-xs text-neutral-500">
                  Attach a file if you have one; not required (e.g. PO number
                  only).
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button
              variant="outline"
              onClick={() => setShowContractUpload(false)}
              disabled={isContractUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleContractUpload}
              disabled={
                isContractUploading ||
                !contractForm.name.trim() ||
                (!!contractForm.value.trim() &&
                  (isNaN(parseFloat(contractForm.value)) ||
                    parseFloat(contractForm.value) <= 0))
              }
            >
              {isContractUploading ? "Adding..." : "Add Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action / Contract Viewer Dialog */}
      <Dialog open={showContractViewer} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[90vw] sm:max-h-[90vh] max-w-none w-full h-full [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{selectedContract?.name}</DialogTitle>
                <DialogDescription>
                  {selectedContract?.type.replace("_", " ")} •{" "}
                  {selectedContract?.status}
                </DialogDescription>
              </div>
              <div className="flex items-center space-x-2">
                {selectedContract?.file_url && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        selectedContract &&
                        window.open(selectedContract.file_url!, "_blank")
                      }
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Open in New Tab
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedContract?.file_url) {
                          const link = document.createElement("a");
                          link.href = selectedContract.file_url;
                          link.download = selectedContract.name;
                          link.click();
                        }
                      }}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowContractViewer(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {selectedContract?.file_url && (
              <div className="w-full h-full bg-neutral-100 dark:bg-dark-150 rounded-lg">
                <iframe
                  src={selectedContract.file_url}
                  className="w-full h-full rounded-lg border-0"
                  title={selectedContract.name}
                  style={{ minHeight: "70vh" }}
                />
              </div>
            )}
            {selectedContract && !selectedContract.file_url && (
              <div className="flex items-center justify-center p-8 text-neutral-500 dark:text-neutral-400">
                No attachment for this action.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawing Upload Dialog */}
      <Dialog open={showDrawingUpload} onOpenChange={setShowDrawingUpload}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload One-Line Drawing</DialogTitle>
            <DialogDescription>
              Upload a one-line electrical drawing for this job.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="drawing-name" className="text-sm font-medium">
                Drawing Name
              </label>
              <Input
                id="drawing-name"
                value={drawingForm.name}
                onChange={(e) =>
                  setDrawingForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Main Electrical One-Line"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="drawing-description"
                className="text-sm font-medium"
              >
                Description
              </label>
              <textarea
                id="drawing-description"
                value={drawingForm.description}
                onChange={(e) =>
                  setDrawingForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Brief description of the drawing..."
                className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-dark-150 text-neutral-900 dark:text-white resize-none"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="drawing-file" className="text-sm font-medium">
                Drawing File
              </label>
              <Input
                id="drawing-file"
                type="file"
                accept=".pdf,.dwg,.png,.jpg,.jpeg,.svg"
                onChange={(e) => setDrawingFile(e.target.files?.[0] || null)}
              />
              {drawingFile && (
                <p className="text-xs text-neutral-500">
                  {drawingFile.name} ({Math.round(drawingFile.size / 1024)} KB)
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDrawingUpload(false)}
              disabled={isDrawingUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDrawingUpload}
              disabled={
                isDrawingUploading || !drawingFile || !drawingForm.name.trim()
              }
            >
              {isDrawingUploading ? "Uploading..." : "Upload Drawing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawing Viewer Dialog */}
      <Dialog open={showDrawingViewer} onOpenChange={setShowDrawingViewer}>
        <DialogContent className="sm:max-w-[90vw] sm:h-[90vh] max-w-none w-full flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{selectedDrawing?.name}</DialogTitle>
                <DialogDescription>
                  Version {selectedDrawing?.version} •{" "}
                  {selectedDrawing?.is_current ? "Current" : "Previous"}
                </DialogDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    selectedDrawing &&
                    window.open(selectedDrawing.file_url, "_blank")
                  }
                >
                  <Edit3 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedDrawing) {
                      const link = document.createElement("a");
                      link.href = selectedDrawing.file_url;
                      link.download = selectedDrawing.name;
                      link.click();
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDrawingViewer(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            {selectedDrawing && (
              <div className="w-full h-full bg-neutral-100 dark:bg-dark-150 rounded-lg">
                {selectedDrawing.file_url.toLowerCase().endsWith(".pdf") ? (
                  <iframe
                    src={selectedDrawing.file_url}
                    className="w-full h-full rounded-lg border-0"
                    title={selectedDrawing.name}
                    style={{ minHeight: "100%" }}
                  />
                ) : (
                  <img
                    src={selectedDrawing.file_url}
                    alt={selectedDrawing.name}
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Miscellaneous Document Upload Dialog */}
      <Dialog open={showMiscUpload} onOpenChange={setShowMiscUpload}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload Miscellaneous Document</DialogTitle>
            <DialogDescription>
              Upload a miscellaneous document for this job.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="misc-name" className="text-sm font-medium">
                Document Name
              </label>
              <Input
                id="misc-name"
                value={miscForm.name}
                onChange={(e) =>
                  setMiscForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Document Name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="misc-description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="misc-description"
                value={miscForm.description}
                onChange={(e) =>
                  setMiscForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Brief description of the document..."
                className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-dark-150 text-neutral-900 dark:text-white resize-none"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="misc-file" className="text-sm font-medium">
                Document File
              </label>
              <Input
                id="misc-file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                onChange={(e) => setMiscFile(e.target.files?.[0] || null)}
              />
              {miscFile && (
                <p className="text-xs text-neutral-500">
                  {miscFile.name} ({Math.round(miscFile.size / 1024)} KB)
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMiscUpload(false)}
              disabled={isMiscUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMiscUpload}
              disabled={isMiscUploading || !miscFile || !miscForm.name.trim()}
            >
              {isMiscUploading ? "Uploading..." : "Upload Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Miscellaneous Document Viewer Dialog */}
      <Dialog open={showMiscViewer} onOpenChange={setShowMiscViewer}>
        <DialogContent className="sm:max-w-[90vw] sm:h-[90vh] max-w-none w-full flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{selectedMiscDocument?.name}</DialogTitle>
                <DialogDescription>
                  {selectedMiscDocument &&
                    format(
                      new Date(selectedMiscDocument.created_at),
                      "MMM d, yyyy",
                    )}
                </DialogDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    selectedMiscDocument &&
                    window.open(selectedMiscDocument.file_url, "_blank")
                  }
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMiscViewer(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            {selectedMiscDocument && (
              <div className="w-full h-full bg-neutral-100 dark:bg-dark-150 rounded-lg">
                {selectedMiscDocument.file_url
                  .toLowerCase()
                  .endsWith(".pdf") ? (
                  <iframe
                    src={selectedMiscDocument.file_url}
                    className="w-full h-full rounded-lg border-0"
                    title={selectedMiscDocument.name}
                    style={{ minHeight: "100%" }}
                  />
                ) : selectedMiscDocument.file_url
                    .toLowerCase()
                    .match(/\.(jpg|jpeg|png|gif)$/i) ? (
                  <img
                    src={selectedMiscDocument.file_url}
                    alt={selectedMiscDocument.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <FileText className="h-16 w-16 mx-auto mb-4 text-neutral-400" />
                      <p className="text-neutral-600 dark:text-neutral-400">
                        Preview not available
                      </p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() =>
                          window.open(selectedMiscDocument.file_url, "_blank")
                        }
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download to View
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Asset Comments Dialog */}
      <AssetCommentsDialog
        isOpen={showCommentsDialog}
        onClose={handleCloseCommentsDialog}
        assetId={selectedAssetForComments?.id || ""}
        assetName={selectedAssetForComments?.name || ""}
      />
    </div>
  );
}
