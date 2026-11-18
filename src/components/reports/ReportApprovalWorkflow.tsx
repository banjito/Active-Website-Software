import { openFileUrl, resolveFileUrl } from "@/lib/jobFiles";
import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  TechnicalReport,
  ReportStatus,
  ReportFilters,
} from "@/lib/services/reportService";
import Card, {
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/toast";
import {
  ClipboardCheck,
  FilePlus,
  Trash,
  FileX,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  RotateCw,
  Eye,
  Send,
  Download,
  Clock1,
  History,
  UserCheck,
  Flag,
  MessageCircleWarning,
} from "lucide-react";
import Select from "@/components/ui/Select";
import { compareLinkedAssetFolderLabels } from "@/utils/sortUtils";
import { Routes, Route } from "react-router-dom";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { supabase } from "@/lib/supabase";
import { createBatchedRowLookup } from "@/lib/batchedRowLookup";
import { summarizeCustomFormInstance } from "@/lib/customForms/instanceSummary";
import { canApproveReports, canExportReports } from "@/lib/roles";
import { BRAND_COLOR } from "@/lib/companyConfig";
import {
  fetchReportRowInfo,
  type EvaluationResult,
} from "@/lib/reportEvaluations";
import { EvaluationResultBadge } from "./EvaluationResultBadge";
import { splitAssetName } from "./reportMappings";
import {
  fetchReportActivity,
  issueRounds,
  issueRoundsHtml,
} from "@/services/reportActivityService";
import { fetchReportCode } from "@/services/reportNumberService";
import {
  ACTION_ITEMS_CHANGED_EVENT,
  actionItemsHtml,
  fetchActionItems,
  fetchOpenActionItemCounts,
  fetchOpenActionItems,
} from "@/services/reportActionItemService";
import {
  FIELD_FLAGS_CHANGED_EVENT,
  fetchOpenFieldFlagCounts,
  fetchOpenFieldFlags,
} from "@/services/reportFieldFlagService";
import { openActionItemsDialog } from "./common/ActionItemsDialog";
import {
  applyReviewSheet,
  attachReviewZoomKeys,
  clearReviewSheet,
  stepReviewZoom,
} from "./common/reviewSheet";
import { checkFormVersionForFileUrl } from "@/lib/customForms/formVersionStatus";
import confirmDialog from "@/components/ui/confirmDialog";

// A report's title is the stored asset name, "<report type> - <asset identifier>".
// The list shows the identifier as the headline and the report type underneath,
// so several reports on the same asset are easy to tell apart.
const getReportNameParts = (report: TechnicalReport) =>
  splitAssetName(report.title || "", report.report_type);

interface ReportApprovalWorkflowProps {
  division?: string;
  jobId?: string;
  onUpdate?: () => void;
}

const REPORT_APPROVAL_LOAD_LIMIT = 500;

// Built-in reports are saved as "report:/jobs/..." and custom-form reports as
// "custom-form:/jobs/{jobId}/custom-form/{templateId}/{instanceId}". Both must
// show up in approvals, so every query and URL parse here accepts either.
const REPORT_URL_PREFIX = /^(report|custom-form):\/jobs\//;
const REPORT_URL_FILTER = "file_url.like.report:/%,file_url.like.custom-form:/%";

// Inline SVGs (lucide) for the vanilla-JS review modal toolbar buttons.
const EYE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const PRINTER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`;
const PENCIL_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

const FLAG_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;
const CHEVRONS_LEFT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>`;

// ---------------------------------------------------------------------------
// Review sidebar. Three stacked parts: icon toolbar (top, fixed), scrolling
// body (history, action items, notes), and the decision buttons pinned to the
// bottom so they can never be pushed off-screen or covered when zoomed in.
// Collapses to a slim rail so the report gets nearly the full width.
// ---------------------------------------------------------------------------
// Kept for the session, so the next report opens the same way.
let reviewSidebarCollapsed = false;
const REVIEW_SIDEBAR_STYLE_ID = "review-sidebar-style";
const REVIEW_SIDEBAR_CSS = `
  #review-sidebar { width: 300px; transition: width 0.15s ease; }
  #review-sidebar[data-collapsed="true"] { width: 60px; }
  #review-sidebar[data-collapsed="true"] .rs-full { display: none !important; }
  #review-sidebar:not([data-collapsed="true"]) .rs-mini { display: none !important; }
  #review-sidebar[data-collapsed="true"] .rs-toolbar { flex-direction: column; align-items: center; padding: 0.625rem; }
  #review-sidebar[data-collapsed="true"] #review-sidebar-toggle { order: -1; margin: 0; }
  #review-sidebar[data-collapsed="true"] #review-sidebar-toggle svg { transform: rotate(180deg); }

  /* Dark mode. The review window is plain HTML with inline light colors, so
     each light color is matched and swapped here. The report sheet inside the
     iframe stays as-is (white paper, like the printout). */
  .dark #report-view-modal { color: #f5f5f5; }
  .dark #report-view-modal [style*="background:white"] { background: #1e1e1e !important; }
  .dark #report-view-modal [style*="background:#f3f4f6"] { background: #262626 !important; }
  .dark #report-view-modal [style*="background:#f9fafb"] { background: #3f3f3f !important; }
  /* Status pill: dark tinted background + bright text. */
  .dark #report-view-modal [style*="background:#fef3c7"] { background: rgba(245, 158, 11, 0.18) !important; color: #fcd34d !important; }
  .dark #report-view-modal [style*="background:#d1fae5"] { background: rgba(16, 185, 129, 0.18) !important; color: #6ee7b7 !important; }
  .dark #report-view-modal [style*="background:#fee2e2"] { background: rgba(239, 68, 68, 0.18) !important; color: #fca5a5 !important; }
  .dark #report-view-modal [style*="#e5e7eb"],
  .dark #report-view-modal [style*="#d1d5db"] { border-color: #3f3f3f !important; }
  .dark #report-view-modal [style*="color:#111827"],
  .dark #report-view-modal [style*="color:#374151"] { color: #e5e5e5 !important; }
  .dark #report-view-modal [style*="color:#6b7280"] { color: #a3a3a3 !important; }
  .dark #report-view-modal [style*="background:#fffbeb"] { background: rgba(245, 158, 11, 0.1) !important; border-color: #78350f !important; }
  .dark #report-view-modal [style*="color:#92400e"] { color: #fbbf24 !important; }
  .dark #report-view-modal [style*="color:#b91c1c"] { color: #f87171 !important; }
  .dark #report-view-modal [style*="color:#dc2626"] { color: #f87171 !important; }
  .dark #report-view-modal [style*="#fca5a5"] { border-color: #7f1d1d !important; }
  .dark #report-view-modal textarea { background: #262626 !important; color: #f5f5f5 !important; }
  .dark #report-view-modal textarea::placeholder { color: #8a8a8a; }
`;

const APPROVE_OPT_STYLE =
  "display:block;width:100%;text-align:left;padding:0.5rem 0.75rem;background:white;border:none;border-radius:0;cursor:pointer;font-size:0.8125rem;color:#374151;";

// What the main Approve button does. Saved in this browser so the choice
// sticks between reviews and visits.
type ApproveMode = "approve" | "next";
const APPROVE_MODE_KEY = "review-approve-mode";
function getApproveMode(): ApproveMode {
  try {
    return localStorage.getItem(APPROVE_MODE_KEY) === "next" ? "next" : "approve";
  } catch {
    return "approve";
  }
}
function setApproveMode(mode: ApproveMode) {
  try {
    localStorage.setItem(APPROVE_MODE_KEY, mode);
  } catch {
    /* storage blocked; choice lasts for this window only */
  }
}

/**
 * Sets the Approve button label from: the saved mode, whether a next report
 * is waiting (data-has-next) and whether edits still need saving
 * (data-unsaved).
 */
function refreshApproveLabel() {
  const btn = document.getElementById("review-approve-btn");
  if (!btn) return;
  const unsaved = btn.dataset.unsaved === "true";
  const openNext = getApproveMode() === "next" && btn.dataset.hasNext === "true";
  btn.textContent = openNext
    ? unsaved
      ? "✓ Save, Approve & Open Next"
      : "✓ Approve & Open Next"
    : unsaved
      ? "✓ Save & Approve"
      : "✓ Approve";
  const mini = document.getElementById("review-mini-approve");
  if (mini) mini.title = btn.textContent.replace("✓ ", "");
  // Mark the saved choice in the menu.
  document.querySelectorAll<HTMLElement>("[data-approve-mode]").forEach((opt) => {
    const selected = opt.dataset.approveMode === getApproveMode();
    opt.setAttribute("aria-checked", String(selected));
    opt.style.fontWeight = selected ? "600" : "400";
    const base = opt.dataset.approveMode === "next" ? "Approve & Open Next" : "Approve";
    opt.textContent = `${selected ? "✓ " : ""}${base}`;
  });
}

const MINI_BTN_STYLE =
  "width:40px;height:40px;border-radius:0;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;font-weight:600;";

function buildReviewSidebarHtml(opts: {
  toolbarHtml: string;
  bodyHtml: string;
  canReview: boolean;
  readOnlyHtml: string;
}) {
  const { toolbarHtml, bodyHtml, canReview, readOnlyHtml } = opts;
  return `
    <div id="review-sidebar" data-collapsed="${reviewSidebarCollapsed}" style="flex-shrink:0;border-right:1px solid #e5e7eb;background:white;display:flex;flex-direction:column;overflow:hidden;">
      <div class="rs-toolbar" style="flex-shrink:0;display:flex;flex-wrap:wrap;gap:0.5rem;padding:1rem 1rem 0.75rem;">
        ${toolbarHtml}
        <button id="review-sidebar-toggle" title="Collapse / expand panel" aria-label="Collapse or expand review panel" style="margin-left:auto;width:40px;height:40px;border-radius:0;display:flex;align-items:center;justify-content:center;border:1px solid #d1d5db;cursor:pointer;color:#374151;background:white;">
          ${CHEVRONS_LEFT_SVG}
        </button>
      </div>
      <div class="rs-full" style="flex:1;min-height:0;overflow-y:auto;padding:0 1rem 1rem;display:flex;flex-direction:column;gap:1rem;">
        ${bodyHtml}
        ${
          canReview
            ? `
        <div style="display:flex;flex-direction:column;flex:1 0 auto;">
          <label for="review-comments-input" style="display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.5rem;">Review Notes</label>
          <textarea
            id="review-comments-input"
            placeholder="Add comments about this report (required for rejection)..."
            style="width:100%;flex:1;min-height:120px;padding:0.5rem 0.75rem;border:1px solid #d1d5db;border-radius:0;font-size:0.875rem;resize:none;box-sizing:border-box;"
          ></textarea>
        </div>`
            : readOnlyHtml
        }
      </div>
      ${
        canReview
          ? `
      <div class="rs-full" style="flex-shrink:0;padding:0.75rem 1rem 1rem;border-top:1px solid #e5e7eb;display:flex;flex-direction:column;gap:0.5rem;">
        <div style="position:relative;display:flex;">
          <button id="review-approve-btn" style="flex:1;min-width:0;padding:0.625rem 1rem;background:#16a34a;border:none;border-radius:0;cursor:pointer;font-size:0.875rem;color:white;font-weight:500;">
            ✓ Approve
          </button>
          <button id="review-approve-menu-btn" title="Approve options" aria-label="Approve options" aria-haspopup="true" aria-expanded="false" style="width:36px;flex-shrink:0;background:#15803d;border:none;border-left:1px solid rgba(255,255,255,0.35);border-radius:0;cursor:pointer;color:white;font-size:0.75rem;">▾</button>
          <div id="review-approve-menu" role="menu" style="display:none;position:absolute;left:0;right:0;bottom:100%;margin-bottom:4px;z-index:5;background:white;border:1px solid #d1d5db;box-shadow:0 4px 12px rgba(0,0,0,0.15);flex-direction:column;">
            <button role="menuitemradio" data-approve-mode="approve" style="${APPROVE_OPT_STYLE}">Approve</button>
            <button role="menuitemradio" data-approve-mode="next" style="${APPROVE_OPT_STYLE}border-top:1px solid #e5e7eb;">Approve &amp; Open Next</button>
          </div>
        </div>
        <button id="review-reject-btn" style="padding:0.625rem 1rem;background:white;border:1px solid #fca5a5;border-radius:0;cursor:pointer;font-size:0.875rem;color:#dc2626;font-weight:500;">
          ✕ Reject / Mark as Issue
        </button>
        <button id="review-archive-btn" style="padding:0.625rem 1rem;background:white;border:1px solid #d1d5db;border-radius:0;cursor:pointer;font-size:0.875rem;color:#374151;font-weight:500;">
          Archive
        </button>
      </div>
      <div class="rs-mini" style="flex-shrink:0;margin-top:auto;padding:0.625rem;display:flex;flex-direction:column;align-items:center;gap:0.5rem;border-top:1px solid #e5e7eb;">
        <button id="review-mini-approve" title="Approve" aria-label="Approve" style="${MINI_BTN_STYLE}border:none;background:#16a34a;color:white;">✓</button>
        <button id="review-mini-reject" title="Reject (opens notes)" aria-label="Reject, opens notes" style="${MINI_BTN_STYLE}border:1px solid #fca5a5;background:white;color:#dc2626;">✕</button>
      </div>`
          : ""
      }
    </div>`;
}

/** Collapse toggle + the slim-rail shortcut buttons. */
function wireReviewSidebar() {
  if (!document.getElementById(REVIEW_SIDEBAR_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = REVIEW_SIDEBAR_STYLE_ID;
    style.textContent = REVIEW_SIDEBAR_CSS;
    document.head.appendChild(style);
  }
  const sidebar = document.getElementById("review-sidebar");
  if (!sidebar) return;
  const setCollapsed = (collapsed: boolean) => {
    reviewSidebarCollapsed = collapsed;
    sidebar.setAttribute("data-collapsed", String(collapsed));
  };
  const toggle = document.getElementById("review-sidebar-toggle");
  if (toggle) toggle.onclick = () => setCollapsed(!reviewSidebarCollapsed);

  // Approve from the rail runs the real button, so all its checks still apply.
  const miniApprove = document.getElementById("review-mini-approve");
  if (miniApprove)
    miniApprove.onclick = () =>
      (document.getElementById("review-approve-btn") as HTMLButtonElement | null)?.click();
  // Approve dropdown: picks what the main Approve button does, saved for next time.
  const menuBtn = document.getElementById("review-approve-menu-btn");
  const menu = document.getElementById("review-approve-menu");
  if (menuBtn && menu) {
    const setOpen = (open: boolean) => {
      menu.style.display = open ? "flex" : "none";
      menuBtn.setAttribute("aria-expanded", String(open));
    };
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      setOpen(menu.style.display === "none");
    };
    menu.querySelectorAll<HTMLElement>("[data-approve-mode]").forEach((opt) => {
      opt.onclick = (e) => {
        e.stopPropagation();
        setApproveMode(opt.dataset.approveMode === "next" ? "next" : "approve");
        setOpen(false);
        refreshApproveLabel();
      };
    });
    // Click anywhere else in the window closes the menu.
    document.getElementById("report-view-modal")?.addEventListener("click", () => setOpen(false));
  }
  refreshApproveLabel();

  // Reject needs notes, so open the panel and put the cursor in the notes box.
  const miniReject = document.getElementById("review-mini-reject");
  if (miniReject)
    miniReject.onclick = () => {
      setCollapsed(false);
      (document.getElementById("review-comments-input") as HTMLTextAreaElement | null)?.focus();
    };
}

// ---------------------------------------------------------------------------
// Review preview zoom. Zooms the report inside the preview iframe, like the
// PDF viewer, instead of the whole browser page. The zoom sits in a
// screen-only rule injected into the iframe, so printing is never scaled.
// ---------------------------------------------------------------------------
// Kept for the session, so the next report opens at the same zoom.
let reportPreviewZoom = 1;

const ZOOM_BTN_STYLE =
  "width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:white;cursor:pointer;font-size:18px;line-height:1;color:#374151;border-radius:0;";
const REPORT_ZOOM_CONTROLS_HTML = `
  <div id="report-zoom-controls" style="position:absolute;top:12px;right:28px;z-index:2;display:flex;align-items:center;background:white;border:1px solid #d1d5db;box-shadow:0 1px 3px rgba(0,0,0,0.15);border-radius:0;">
    <button id="report-zoom-out" title="Zoom out (Ctrl + scroll)" aria-label="Zoom out" style="${ZOOM_BTN_STYLE}">&minus;</button>
    <button id="report-zoom-reset" title="Reset zoom" aria-label="Reset zoom" style="min-width:52px;height:32px;border:none;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;background:white;cursor:pointer;font-size:12px;color:#374151;border-radius:0;">100%</button>
    <button id="report-zoom-in" title="Zoom in (Ctrl + scroll)" aria-label="Zoom in" style="${ZOOM_BTN_STYLE}">+</button>
  </div>
`;

/** Wires the zoom buttons, Ctrl + scroll and Ctrl +/-/0 to the preview iframe. */
function wireReportZoom() {
  const iframe = document.querySelector(
    'iframe[title="Report Preview"]',
  ) as HTMLIFrameElement | null;
  if (!iframe) return;
  const label = document.getElementById("report-zoom-reset");
  const controls = document.getElementById("report-zoom-controls");

  // The form version compare screen loads in this frame too. It has its own
  // zoom and is not a report sheet, so leave it alone.
  const showsCompare = () => {
    try {
      return !!iframe.contentWindow?.location.pathname.endsWith("/form-version");
    } catch {
      return false;
    }
  };

  const apply = () => {
    if (label) label.textContent = `${Math.round(reportPreviewZoom * 100)}%`;
    if (showsCompare()) {
      clearReviewSheet(iframe);
      if (controls) controls.style.display = "none";
      return;
    }
    if (controls) controls.style.display = "flex";
    applyReviewSheet(iframe, reportPreviewZoom);
  };

  const step = (direction: 1 | -1) => {
    reportPreviewZoom = stepReviewZoom(reportPreviewZoom, direction);
    apply();
  };
  const reset = () => {
    reportPreviewZoom = 1;
    apply();
  };

  const zoomOut = document.getElementById("report-zoom-out");
  const zoomIn = document.getElementById("report-zoom-in");
  if (zoomOut) zoomOut.onclick = () => step(-1);
  if (zoomIn) zoomIn.onclick = () => step(1);
  if (label) label.onclick = reset;

  // Re-attached each time the iframe loads (Edit and Flag swap its address).
  iframe.addEventListener("load", () => {
    apply();
    if (!showsCompare()) attachReviewZoomKeys(iframe, step, reset);
  });
  apply();
}

export function ReportApprovalWorkflow({
  division,
  jobId,
  onUpdate,
}: ReportApprovalWorkflowProps) {
  const { user } = useAuth();
  const [reports, setReports] = useState<TechnicalReport[]>([]);
  // Open action items per report, for the badge beside the status
  const [actionItemCounts, setActionItemCounts] = useState<
    Record<string, number>
  >({});
  // Open reviewer field flags per report, for the "N fields flagged" tag
  const [fieldFlagCounts, setFieldFlagCounts] = useState<
    Record<string, number>
  >({});
  const [selectedReport, setSelectedReport] = useState<TechnicalReport | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [reportSubstations, setReportSubstations] = useState<
    Record<string, string>
  >({});

  // Filter and search state
  const [filters, setFilters] = useState<ReportFilters>({
    status: "submitted",
    job_id: jobId,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [reportTypeFilter, setReportTypeFilter] = useState<string>("");
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>(
    {},
  );

  // Sort: submission_date (default oldest first), alphabetical, or substation
  type SortByOption = "submission_date" | "alphabetical" | "substation";
  const [sort, setSort] = useState<{ by: SortByOption; dir: "asc" | "desc" }>({
    by: "submission_date",
    dir: "asc",
  });
  const sortBy = sort.by;
  const sortDirection = sort.dir;

  // Pagination for global report list (next 500)
  const [reportsOffset, setReportsOffset] = useState(0);
  const [hasMoreReports, setHasMoreReports] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Review dialog state
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewComments, setReviewComments] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"approved" | "rejected">(
    "approved",
  );

  // Metrics state
  const [metrics, setMetrics] = useState({
    total: 0,
    draft: 0,
    submitted: 0,
    inReview: 0,
    approved: 0,
    rejected: 0,
    archived: 0,
    sent: 0,
  });

  // Open customer flags (from the ampOS ACCESS portal), keyed by asset/report id.
  // A flagged report keeps its approved/sent status but is surfaced with a red
  // customer-flag alert until staff view and resolve it.
  interface OpenFlag {
    id: string;
    asset_id: string;
    reason: string;
    flagged_by: string;
    created_at: string;
  }
  const [flagsByAsset, setFlagsByAsset] = useState<Record<string, OpenFlag[]>>(
    {},
  );
  const [selectedFlagReportId, setSelectedFlagReportId] = useState<
    string | null
  >(null);
  const [flagAlertCounts, setFlagAlertCounts] = useState({ total: 0, sent: 0 });

  // Equipment evaluation (PASS / FAIL / LIMITED SERVICE) per report, so
  // reviewers can spot problem reports before opening them.
  const [evaluationsByReport, setEvaluationsByReport] = useState<
    Record<string, EvaluationResult>
  >({});

  // Equipment identifier read off the saved report row. The asset name carries
  // it too, but only as of the last save — reports renamed (or saved before an
  // identifier was entered) show nothing without this.
  const [identifiersByReport, setIdentifiersByReport] = useState<
    Record<string, string>
  >({});

  // Reports whose row has already been looked up, so paging in more reports
  // doesn't re-query the ones resolved (including those with nothing to find).
  const resolvedRowInfoRef = React.useRef<Set<string>>(new Set());

  // Role-based access control
  const [userRole, setUserRole] = useState<string>("");
  const [userPermissions, setUserPermissions] = useState<{
    canView: boolean;
    canReview: boolean;
    canApprove: boolean;
    canExport: boolean;
  }>({
    canView: false,
    canReview: false,
    canApprove: false,
    canExport: false,
  });

  // Open action item badges for the reports on screen; refresh when one changes.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const counts = await fetchOpenActionItemCounts(reports.map((r) => r.id));
      if (!cancelled) setActionItemCounts(counts);
    };
    load();
    window.addEventListener(ACTION_ITEMS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ACTION_ITEMS_CHANGED_EVENT, load);
    };
  }, [reports]);

  // Field flag tags for the reports on screen.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const counts = await fetchOpenFieldFlagCounts(reports);
      if (!cancelled) setFieldFlagCounts(counts);
    };
    load();
    window.addEventListener(FIELD_FLAGS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(FIELD_FLAGS_CHANGED_EVENT, load);
    };
  }, [reports]);

  // When jobId changes, update filters
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      job_id: jobId,
    }));
  }, [jobId]);

  // Resolve PASS / FAIL / LIMITED SERVICE and the equipment identifier for the
  // reports currently listed. Only reports that haven't been looked up yet are
  // queried, so paging in more reports doesn't re-read the resolved ones.
  useEffect(() => {
    let cancelled = false;
    const pending = reports
      .filter((r) => !resolvedRowInfoRef.current.has(r.id))
      .map((r) => ({ id: r.id, file_url: r.report_data?.file_url }));
    if (pending.length === 0) return;
    pending.forEach((r) => resolvedRowInfoRef.current.add(r.id));
    (async () => {
      try {
        const rows = await fetchReportRowInfo(pending);
        if (cancelled) return;
        const evaluations: Record<string, EvaluationResult> = {};
        const identifiers: Record<string, string> = {};
        for (const [reportId, row] of Object.entries(rows)) {
          if (row.evaluation) evaluations[reportId] = row.evaluation;
          if (row.identifier) identifiers[reportId] = row.identifier;
        }
        if (Object.keys(evaluations).length > 0) {
          setEvaluationsByReport((prev) => ({ ...prev, ...evaluations }));
        }
        if (Object.keys(identifiers).length > 0) {
          setIdentifiersByReport((prev) => ({ ...prev, ...identifiers }));
        }
      } catch (e) {
        // Let a failed lookup be retried on the next refresh.
        pending.forEach((r) => resolvedRowInfoRef.current.delete(r.id));
        console.warn("Failed to load report row details:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reports]);

  // Load data on component mount and when filters change
  useEffect(() => {
    setReportsOffset(0);
    fetchReports(0);
    fetchMetrics();
    loadOpenFlags();
    if (user) {
      const role = (user.user_metadata?.role as string) || "";
      const email = user.email;
      setUserRole(role);

      // Permissions derive from the single source of truth in roles.ts.
      // Pass role + email so superusers qualify even without a role set.
      const approver = canApproveReports(role, email);
      setUserPermissions({
        canView: true, // All authenticated users can view
        canReview: approver,
        canApprove: approver,
        canExport: canExportReports(role, email),
      });
    }
  }, [activeTab, filters, jobId, user]);

  // Listen for asset status changes to refresh the component
  useEffect(() => {
    const handleAssetStatusChange = (event: CustomEvent) => {
      const { newStatus } = event.detail;
      // Refresh when a report enters or leaves any approval tab.
      if (
        [
          "ready_for_review",
          "in_progress",
          "approved",
          "issue",
          "rejected",
          "sent",
          "archived",
        ].includes(newStatus)
      ) {
        console.log("Asset status changed, refreshing ReportApprovalWorkflow");
        fetchReports();
        fetchMetrics();
      }
    };

    window.addEventListener(
      "assetStatusChanged",
      handleAssetStatusChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        "assetStatusChanged",
        handleAssetStatusChange as EventListener,
      );
    };
  }, []);

  // The identifier shown for a report: the one stored in its asset name, or the
  // one read off the saved report row when the name doesn't carry it.
  const getReportIdentifier = (report: TechnicalReport) =>
    getReportNameParts(report).assetIdentifier ||
    identifiersByReport[report.id] ||
    "";

  // Compute sorted list on every render so sort changes always apply (avoids stale closure)
  const sortedReports = (() => {
    const list = [...reports];
    const mult = sort.dir === "asc" ? 1 : -1;
    const getSub = (r: TechnicalReport) =>
      (reportSubstations[r.id] || (r.report_data?.substation as string) || "")
        .trim()
        .toLowerCase();
    list.sort((a, b) => {
      if (sort.by === "submission_date") {
        const ta = new Date(a.submitted_at || a.created_at || 0).getTime();
        const tb = new Date(b.submitted_at || b.created_at || 0).getTime();
        return mult * (ta - tb);
      }
      if (sort.by === "alphabetical") {
        // Sort by the identifier shown in the list, then by report type, so all
        // the reports for one asset stay together.
        const pa = getReportNameParts(a);
        const pb = getReportNameParts(b);
        const byIdentifier = (getReportIdentifier(a) || "\uffff").localeCompare(
          getReportIdentifier(b) || "\uffff",
          undefined,
          { sensitivity: "base" },
        );
        if (byIdentifier !== 0) return mult * byIdentifier;
        return (
          mult *
          pa.reportType.localeCompare(pb.reportType, undefined, {
            sensitivity: "base",
          })
        );
      }
      // sort.by === 'substation'
      const sa = getSub(a) || "\uffff";
      const sb = getSub(b) || "\uffff";
      return mult * sa.localeCompare(sb, undefined, { sensitivity: "base" });
    });
    return list;
  })();

  // Fetch open customer flags (optionally scoped to a set of asset ids) as a
  // map keyed by asset/report id. Best-effort: a missing table just yields {}.
  const fetchOpenFlagsMap = async (
    restrictIds?: string[],
  ): Promise<Record<string, OpenFlag[]>> => {
    try {
      let q = supabase
        .schema("common")
        .from("report_flags")
        .select("id, asset_id, reason, flagged_by, created_at")
        .eq("status", "open");
      if (restrictIds && restrictIds.length > 0) {
        q = q.in("asset_id", restrictIds);
      }
      const { data, error } = await q;
      if (error) {
        console.warn("[ReportApproval] Failed to load report flags:", error);
        return {};
      }
      const map: Record<string, OpenFlag[]> = {};
      (data || []).forEach((f: OpenFlag) => {
        (map[f.asset_id] ||= []).push(f);
      });
      return map;
    } catch (e) {
      console.warn("[ReportApproval] report_flags query error:", e);
      return {};
    }
  };

  // Keep the badge map in sync so flagged reports show the red alert badge on any tab.
  const loadOpenFlags = async () => {
    const flagMap = await fetchOpenFlagsMap();
    setFlagsByAsset(flagMap);

    const flaggedAssetIds = Object.keys(flagMap);
    const total = Object.values(flagMap).reduce(
      (sum, flags) => sum + flags.length,
      0,
    );

    if (flaggedAssetIds.length === 0) {
      setFlagAlertCounts({ total: 0, sent: 0 });
      return;
    }

    try {
      let sent = 0;
      const ASSET_STATUS_QUERY_BATCH = 500;
      for (
        let i = 0;
        i < flaggedAssetIds.length;
        i += ASSET_STATUS_QUERY_BATCH
      ) {
        const chunk = flaggedAssetIds.slice(i, i + ASSET_STATUS_QUERY_BATCH);
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("assets")
          .select("id, status")
          .in("id", chunk);

        if (error) throw error;
        (data || []).forEach((asset) => {
          if (asset.status === "sent") {
            sent += flagMap[asset.id]?.length || 0;
          }
        });
      }
      setFlagAlertCounts({ total, sent });
    } catch (e) {
      console.warn(
        "[ReportApproval] Failed to load flagged report statuses:",
        e,
      );
      setFlagAlertCounts({ total, sent: total });
    }
  };

  // Map a neta_ops.assets row to the TechnicalReport shape used by the list
  // (mirrors the global-branch mapping below). Used to inject flagged-but-
  // approved reports into the Rejected/Issue tab without changing their status.
  const assetToReport = (asset: any): TechnicalReport => {
    const urlParts = (asset.file_url || "")
      .replace(REPORT_URL_PREFIX, "")
      .split("/");
    const assetJobId = urlParts.length >= 1 ? urlParts[0] : "";
    const reportSlug = urlParts.length >= 2 ? urlParts[1] : "";
    const reportType = reportSlug
      .split("-")
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return {
      id: asset.id,
      title: asset.name || reportType || "Untitled Report",
      report_type: reportSlug,
      status: asset.status === "ready_for_review" ? "submitted" : asset.status,
      job_id: assetJobId,
      submitted_at: asset.submitted_at || asset.created_at,
      approved_at: asset.approved_at,
      sent_at: asset.sent_at,
      created_at: asset.created_at,
      report_data: { file_url: asset.file_url, urgency: asset.urgency },
    } as unknown as TechnicalReport;
  };

  // On the Rejected/Issue tab, also surface reports that are still approved/sent
  // but have an open customer flag, so staff can triage them in one place. They
  // keep their real status (and the customer keeps seeing them) — we just pull
  // them into this view and badge them. `restrictIds` scopes to a job in job mode.
  const augmentWithFlaggedReports = async (
    base: TechnicalReport[],
    restrictIds?: string[],
  ): Promise<TechnicalReport[]> => {
    if (activeTab !== "rejected") return base;
    const flagMap = await fetchOpenFlagsMap(restrictIds);
    const baseIds = new Set(base.map((r) => r.id));
    const missingIds = Object.keys(flagMap).filter((id) => !baseIds.has(id));
    if (missingIds.length === 0) return base;
    const { data, error } = await supabase
      .schema("neta_ops")
      .from("assets")
      .select(
        "id, name, file_url, status, created_at, submitted_at, approved_at, sent_at, urgency, substation",
      )
      .in("id", missingIds);
    if (error || !data) return base;
    const flagged = data.map(assetToReport);
    return [...flagged, ...base];
  };

  // Resolve every open flag on a report; once all are resolved it drops out of
  // the Rejected/Issue view and the badge clears. The report's status is untouched.
  const handleResolveFlags = async (reportId: string) => {
    const flags = flagsByAsset[reportId] || [];
    if (flags.length === 0) return;
    try {
      for (const f of flags) {
        const { error } = await supabase
          .schema("common")
          .rpc("resolve_report_flag", { p_flag_id: f.id, p_comment: null });
        if (error) throw error;
      }
      toast({
        title: "Flag resolved",
        description: "The customer flag has been cleared.",
        variant: "success",
      });
      await loadOpenFlags();
      fetchReports(0);
      onUpdate?.();
    } catch (e: any) {
      toast({
        title: "Error",
        description: `Failed to resolve flag: ${e?.message || "Unknown error"}`,
        variant: "destructive",
      });
    }
  };

  const openFlagCount = flagAlertCounts.total;
  const sentOpenFlagCount = flagAlertCounts.sent;

  const selectedFlagReport = selectedFlagReportId
    ? reports.find((report) => report.id === selectedFlagReportId)
    : null;
  const selectedFlags = selectedFlagReportId
    ? flagsByAsset[selectedFlagReportId] || []
    : [];

  const renderFlagAlertIndicator = (count: number, label: string) => {
    if (count === 0) return null;
    return (
      <span
        className="ml-2 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-none bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white shadow-sm"
        title={`${count} open customer flag${count === 1 ? "" : "s"} ${label}`}
        aria-label={`${count} open customer flag${count === 1 ? "" : "s"} ${label}`}
      >
        <MessageCircleWarning className="h-3 w-3" />
        {count}
      </span>
    );
  };

  // Customer flag badge (+ notes and resolve controls for reviewers) shown next
  // to a report's status badge when it has open customer flags.
  const renderFlaggedBadge = (reportId: string) => {
    const flags = flagsByAsset[reportId] || [];
    if (flags.length === 0) return null;
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSelectedFlagReportId(reportId)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-200 dark:hover:bg-yellow-900/70"
          title="View customer flag notes"
        >
          <Flag className="w-3 h-3" />
          Flagged
        </button>
        {userPermissions.canReview && (
          <button
            type="button"
            onClick={() => handleResolveFlags(reportId)}
            className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline"
            title="Mark the customer flag(s) as resolved"
          >
            Resolve
          </button>
        )}
      </span>
    );
  };

  const fetchReports = async (loadOffset: number = 0) => {
    const isLoadMore = loadOffset > 0;
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      // A full reload re-reads every report row: an identifier or evaluation
      // may have changed since it was last resolved.
      resolvedRowInfoRef.current = new Set();
      setIsLoading(true);
    }
    try {
      // Map tab names to asset status values
      // Asset statuses: 'ready_for_review', 'approved', 'sent', 'rejected', 'in_progress', etc.
      let assetStatusFilter: string | undefined;
      switch (activeTab) {
        case "pending":
          assetStatusFilter = "ready_for_review";
          break;
        case "approved":
        case "accepted":
          assetStatusFilter = "approved";
          break;
        case "sent":
          assetStatusFilter = "sent";
          break;
        case "rejected":
          assetStatusFilter = "rejected";
          break;
        case "archived":
          assetStatusFilter = "archived";
          break;
        default:
          assetStatusFilter = jobId ? "ready_for_review" : undefined;
      }

      if (jobId) {
        console.log(
          "[ReportApproval] jobId:",
          jobId,
          "assetStatusFilter:",
          assetStatusFilter,
          "loadOffset:",
          loadOffset,
        );

        // Pull ALL asset IDs linked to this job (paginate through job_assets in
        // 1000-row batches). job_assets only stores asset_id + job_id so this
        // is cheap even for jobs with thousands of linked assets, and it is
        // required because we need to apply the status filter against the full
        // set — otherwise a single matching asset whose UUID sorts after page 1
        // would be invisible in tabs like "Pending Approval". This was the
        // root cause of the 7.22.1 Emergency Generator (and any other report)
        // not appearing on jobs with > 500 linked assets.
        const allLinkedIds: string[] = [];
        const JOB_ASSETS_BATCH = 1000;
        let batchOffset = 0;
        while (true) {
          const { data: linkBatch, error: linkBatchErr } = await supabase
            .schema("neta_ops")
            .from("job_assets")
            .select("asset_id")
            .eq("job_id", jobId)
            .order("asset_id", { ascending: true })
            .range(batchOffset, batchOffset + JOB_ASSETS_BATCH - 1);
          if (linkBatchErr) throw linkBatchErr;
          const ids = (linkBatch || []).map((l) => l.asset_id);
          if (ids.length === 0) break;
          allLinkedIds.push(...ids);
          if (ids.length < JOB_ASSETS_BATCH) break;
          batchOffset += JOB_ASSETS_BATCH;
        }
        console.log(
          "[ReportApproval] total linked assets for job:",
          allLinkedIds.length,
        );

        // Now query the assets table filtered by status (and report-style
        // file_url) against the full set of linked IDs. Postgrest's `in()` can
        // handle large arrays but we batch in chunks of 500 to be safe and to
        // avoid URL length limits.
        const assetsData: any[] = [];
        const ASSET_QUERY_BATCH = 500;
        for (let i = 0; i < allLinkedIds.length; i += ASSET_QUERY_BATCH) {
          const chunk = allLinkedIds.slice(i, i + ASSET_QUERY_BATCH);
          if (chunk.length === 0) continue;
          let assetQuery = supabase
            .schema("neta_ops")
            .from("assets")
            .select(
              "id, name, file_url, status, created_at, submitted_at, approved_at, sent_at, urgency, substation",
            )
            .in("id", chunk)
            .or(`${REPORT_URL_FILTER},file_url.ilike.%.pdf`);
          if (assetStatusFilter) {
            assetQuery = assetQuery.eq("status", assetStatusFilter);
          }
          const { data: assets, error: assetsError } = await assetQuery;
          if (assetsError) throw assetsError;
          if (assets && assets.length > 0) assetsData.push(...assets);
        }

        console.log(
          "[ReportApproval] fetched assets count after status filter:",
          assetsData.length,
        );
        // Status-filtered results are already complete after this single pass;
        // disable Load More so the UI doesn't ask for additional pages.
        setHasMoreReports(false);
        setReportsOffset(allLinkedIds.length);

        // Convert assets to TechnicalReport-like format for compatibility with existing UI
        let merged: TechnicalReport[] = assetsData.map((asset) => {
          // Check if this is a PDF report (not a report:/ URL)
          const isPdfReport =
            asset.file_url &&
            !asset.file_url.startsWith("report:/") &&
            asset.file_url.toLowerCase().endsWith(".pdf");

          let reportSlug = "";
          let reportId = asset.id;

          if (isPdfReport) {
            // For PDF reports, use a special type identifier
            reportSlug = "pdf-report";
          } else {
            // Extract report type from file_url: report:/jobs/{jobId}/{reportSlug}/{reportId}
            const urlParts = (asset.file_url || "")
              .replace(REPORT_URL_PREFIX, "")
              .split("/");
            reportSlug = urlParts.length >= 2 ? urlParts[1] : "";
            reportId = urlParts.length >= 3 ? urlParts[2] : asset.id;
          }

          // Convert slug to readable title
          const reportType = reportSlug
            .split("-")
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

          return {
            id: asset.id,
            title: asset.name || reportType || "Untitled Report",
            report_type: reportSlug,
            status:
              asset.status === "ready_for_review" ? "submitted" : asset.status,
            job_id: jobId,
            submitted_at: asset.submitted_at || asset.created_at,
            approved_at: asset.approved_at,
            sent_at: asset.sent_at,
            created_at: asset.created_at,
            report_data: {
              file_url: asset.file_url,
              urgency: asset.urgency,
              substation: asset.substation,
            },
          } as unknown as TechnicalReport;
        });

        console.log("[ReportApproval] converted reports:", merged.length);

        // Client-side filters
        if (dateRange.start) {
          merged = merged.filter(
            (r) =>
              !r.submitted_at ||
              new Date(r.submitted_at) >= new Date(dateRange.start!),
          );
        }
        if (dateRange.end) {
          merged = merged.filter(
            (r) =>
              !r.submitted_at ||
              new Date(r.submitted_at) <= new Date(dateRange.end!),
          );
        }
        if (reportTypeFilter) {
          merged = merged.filter(
            (r) =>
              (r.report_type || "").toLowerCase() ===
              reportTypeFilter.toLowerCase(),
          );
        }
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          merged = merged.filter(
            (r) =>
              (r.title || "").toLowerCase().includes(term) ||
              (r.report_type || "").toLowerCase().includes(term),
          );
        }

        // Sort newest submitted first
        merged.sort(
          (a, b) =>
            new Date(b.submitted_at || "").getTime() -
            new Date(a.submitted_at || "").getTime(),
        );
        console.log(
          "[ReportApproval] after filters count:",
          merged.length,
          "ids:",
          merged.map((r) => r.id),
        );

        // Build map of reportId -> linked asset (for grouping/diagnostics if needed)
        const reportAssetsMap: Record<
          string,
          {
            name?: string;
            file_url?: string;
            urgency?: "normal" | "critical";
          }[]
        > = {};
        if (merged.length > 0) {
          const reportIds = merged.map((r) => r.id);
          const { data: repLinks, error: repLinksErr2 } = await supabase
            .schema("neta_ops")
            .from("asset_reports")
            .select("report_id, asset_id")
            .in("report_id", reportIds);
          if (!repLinksErr2 && repLinks && repLinks.length > 0) {
            const assetIds2 = Array.from(
              new Set(repLinks.map((l) => l.asset_id)),
            );
            const { data: assetsRows, error: assetsErr } = await supabase
              .schema("neta_ops")
              .from("assets")
              .select("id, name, file_url, urgency")
              .in("id", assetIds2);
            if (!assetsErr && assetsRows) {
              const assetById: Record<
                string,
                {
                  name?: string;
                  file_url?: string;
                  urgency?: "normal" | "critical";
                }
              > = {};
              assetsRows.forEach((a) => {
                assetById[a.id] = {
                  name: a.name,
                  file_url: a.file_url,
                  urgency: a.urgency,
                };
              });
              repLinks.forEach((l) => {
                if (!reportAssetsMap[l.report_id])
                  reportAssetsMap[l.report_id] = [];
                const asset = assetById[l.asset_id];
                if (asset) reportAssetsMap[l.report_id].push(asset);
              });
            }
          }
        }
        const existingMap = (window as any).__reportApprovalAssetsMap || {};
        (window as any).__reportApprovalAssetsMap = isLoadMore
          ? { ...existingMap, ...reportAssetsMap }
          : reportAssetsMap;

        if (isLoadMore) {
          setReports((prev) => [...prev, ...merged]);
        } else {
          setReports(await augmentWithFlaggedReports(merged, allLinkedIds));
        }

        // Resolve substation/location per report using underlying saved report rows, similar to Job Details
        try {
          const slugToTable: Record<string, string> = {
            // New ATS25 reports
            "switchgear-switchboard-assemblies-ats25":
              "switchgear_switchboard_ats25_reports",
            "panelboard-assemblies-ats25":
              "panelboard_assemblies_ats25_reports",
            "small-lv-dry-type-transformer-ats25":
              "small_lv_dry_type_transformer_ats25_reports",
            "liquid-filled-xfmr-ats25": "liquid_filled_xfmr_ats25_reports",
            "lv-molded-case-circuit-breaker-ats25":
              "lv_molded_case_circuit_breaker_ats25",
            "lv-circuit-breaker-mts23": "lv_circuit_breaker_mts23_reports",
            "lv-circuit-breaker-mts25": "lv_circuit_breaker_mts25",
            "lv-circuit-breaker-mts": "lv_circuit_breaker_mts25",
            "emergency-systems-engine-generator-ats25":
              "emergency_systems_engine_generator_ats25",
            // Legacy reports
            "panelboard-report": "panelboard_reports",
            "switchgear-report": "switchgear_reports",
            "dry-type-transformer": "transformer_reports",
            "large-dry-type-transformer-report": "large_transformer_reports",
            "large-dry-type-transformer": "large_transformer_reports",
            "large-dry-type-xfmr-mts23": "large_dry_type_xfmr_mts23_reports",
            "large-dry-type-transformer-mts-report":
              "large_dry_type_transformer_mts_reports",
            "large-dry-type-xfmr-mts-report":
              "large_dry_type_transformer_mts_reports",
            "liquid-xfmr-visual-mts-report": "liquid_xfmr_visual_mts_reports",
            "low-voltage-switch-report": "low_voltage_switch_reports",
            "medium-voltage-switch-oil-report":
              "medium_voltage_switch_oil_reports",
            "medium-voltage-switch-sf6": "medium_voltage_switch_sf6_reports",
            "medium-voltage-switch-sf6-report":
              "medium_voltage_switch_sf6_reports",
            "potential-transformer-ats-report":
              "potential_transformer_ats_reports",
            "contactor-vt-test": "contactor_vt_test_reports",
            "low-voltage-panelboard-small-breaker-report":
              "low_voltage_panelboard_small_breaker_reports",
            "medium-voltage-circuit-breaker-report":
              "medium_voltage_circuit_breaker_reports",
            "medium-voltage-vacuum-breaker-mts23":
              "medium_voltage_vacuum_breaker_mts23_reports",
            "medium-voltage-circuit-breaker-mts-report":
              "medium_voltage_circuit_breaker_mts_reports",
            "medium-voltage-cable-vlf-tan-delta-mts23":
              "medium_voltage_cable_vlf_tan_delta_mts23_reports",
            "medium-voltage-vlf-mts-report": "medium_voltage_vlf_mts_reports",
            "medium-voltage-cable-vlf-test-mts":
              "medium_voltage_vlf_mts_reports",
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
            "metal-enclosed-busway-mts23": "metal_enclosed_busway_mts23_reports",
            "metal-enclosed-busway": "metal_enclosed_busway_reports",
            "low-voltage-circuit-breaker-thermal-magnetic-mts-report":
              "low_voltage_circuit_breaker_thermal_magnetic_mts_reports",
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
            "small-dry-type-xfmr-mts23": "small_dry_type_xfmr_mts23_reports",
            "two-small-dry-typer-xfmr-mts-report":
              "two_small_dry_type_xfmr_mts_reports",
            "low-voltage-cable-test-3sets": "low_voltage_cable_test_3sets",
            "low-voltage-cable-mts23": "low_voltage_cable_mts23_reports",
            "low-voltage-cable-test-12sets": "low_voltage_cable_test_12sets",
            "low-voltage-cable-test-20sets": "transformer_reports",
            "low-voltage-switch-multi-device-test":
              "low_voltage_switch_multi_device_reports",
            "two-small-dry-typer-xfmr-ats-report":
              "two_small_dry_type_xfmr_ats_reports",
            "switchgear-switchboard-mts23":
              "switchgear_switchboard_mts23_reports",
            "switchgear-panelboard-mts-report":
              "switchgear_panelboard_mts_reports",
            "liquid-filled-transformer": "liquid_filled_transformer_reports",
            "oil-inspection": "oil_inspection_reports",
            "grounding-system-master": "grounding_system_master_reports",
            "grounding-fall-of-potential-slope-method-test":
              "grounding_fall_of_potential_slope_method_test_reports",
            "standard-report": "standard_reports",
            "low-voltage-air-switch-mts23": "low_voltage_air_switch_mts23_reports",
            "6-low-voltage-switch-maint-mts-report":
              "low_voltage_switch_maint_mts_reports",
          };
          const slugFallbackTables: Record<string, string[]> = {
            "low-voltage-panelboard-small-breaker-report": [
              "low_voltage_cable_test_3sets",
            ],
            "low-voltage-switch-multi-device-test": [
              "low_voltage_cable_test_3sets",
            ],
            "medium-voltage-vlf-mts-report": ["medium_voltage_cable_vlf_test"],
            "medium-voltage-cable-vlf-test-mts": [
              "medium_voltage_cable_vlf_test",
            ],
            "low-voltage-circuit-breaker-electronic-trip-mts-report": [
              "low_voltage_cable_test_3sets",
            ],
            "low-voltage-circuit-breaker-thermal-magnetic-ats-report": [
              "low_voltage_cable_test_3sets",
            ],
          };

          const subMap: Record<string, string> = {};
          const nameMap: Record<string, string> = {};
          // Rows are fetched a hundred at a time. One request per report timed out on
          // the biggest jobs, and a report with no answer was filed under 'Other'.
          const reportRows = createBatchedRowLookup();
          await Promise.all(
            merged.map(async (r) => {
              // Get file_url from linked asset (more reliable than technical_reports.report_data.file_url)
              const linkedAssets = reportAssetsMap[r.id] || [];
              const linkedAssetFileUrl =
                linkedAssets.length > 0 ? linkedAssets[0].file_url : undefined;
              // Fall back to technical_reports.report_data.file_url if no linked asset found
              const fileUrl =
                linkedAssetFileUrl ||
                ((r as any)?.report_data?.file_url as string | undefined);
              // Custom forms keep substation + identifier in their saved form
              // data (same lookup as the job's Reports tab).
              if (fileUrl?.startsWith("custom-form:/jobs/")) {
                // ['jobId', 'custom-form', templateId, instanceId]
                const cfParts = fileUrl.replace(REPORT_URL_PREFIX, "").split("/");
                const instanceId = (cfParts[3] || "").split("?")[0];
                if (!instanceId) return;
                const inst = await reportRows
                  .load("custom_form_instances", instanceId, "id, data")
                  .catch(() => null);
                if (!inst) return;
                const { substation, identifier, templateName } =
                  summarizeCustomFormInstance((inst as any).data);
                if (substation) subMap[r.id] = substation;
                if (identifier) {
                  // Saved as "<template> – <date>"; show "<template> - <identifier>"
                  const baseName =
                    templateName || (r.title || "").split(" – ")[0].trim();
                  if (baseName) nameMap[r.id] = `${baseName} - ${identifier}`;
                }
                return;
              }
              if (!fileUrl || !fileUrl.startsWith("report:/jobs/")) return;
              const parts = fileUrl.replace(REPORT_URL_PREFIX, "").split("/");
              // parts can be:
              // ['jobId', 'slug', 'reportId'] (standard format)
              // ['jobId', 'slug', 'substationFolder', 'reportId'] (grounding reports with substation)
              if (parts.length < 3) return;
              const slug = (parts[1] || "").split("?")[0];
              // Check if this is a report with substation folder (4 parts)
              const isGroundingReport =
                slug === "grounding-system-master" ||
                slug === "grounding-fall-of-potential-slope-method-test" ||
                slug === "gfi-trip-test-report";
              let repId = "";
              if (parts.length >= 4 && isGroundingReport) {
                // substationFolder is parts[2], reportId is parts[3]
                repId = (parts[3] || "").split("?")[0];
              } else {
                // Standard format: reportId is parts[2]
                repId = (parts[2] || "").split("?")[0];
              }
              if (!repId) return;
              const primaryTable = slugToTable[slug];
              if (!primaryTable) return;
              const tablesToTry = [
                primaryTable,
                ...(slugFallbackTables[slug] || []),
              ];
              let data: any = null;
              for (const t of tablesToTry) {
                // A lookup that could not be completed is skipped here and counted by
                // reportRows, so the substations already on screen are kept below.
                const d = await reportRows.load(t, repId).catch(() => null);
                if (d) {
                  data = d;
                  break;
                }
              }
              if (!data) return;
              // Extract substation - check direct field first, then nested paths
              const substation =
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
              if (typeof substation === "string" && substation.trim()) {
                subMap[r.id] = substation.trim();
              }
            }),
          );
          if (isLoadMore || reportRows.failedCount() > 0) {
            setReportSubstations((prev) => ({ ...prev, ...subMap }));
          } else {
            setReportSubstations(subMap);
          }
          if (Object.keys(nameMap).length > 0) {
            setReports((prev) =>
              prev.map((r) =>
                nameMap[r.id] ? { ...r, title: nameMap[r.id] } : r,
              ),
            );
          }
        } catch {}

        setError(null);
      } else {
        // Global mode - Query assets table directly with the correct status
        console.log(
          "[ReportApproval] Global mode - assetStatusFilter:",
          assetStatusFilter,
        );

        let assetQuery = supabase
          .schema("neta_ops")
          .from("assets")
          .select(
            "id, name, file_url, status, created_at, submitted_at, approved_at, sent_at, urgency",
          )
          .or(REPORT_URL_FILTER); // Only get report assets

        if (assetStatusFilter) {
          assetQuery = assetQuery.eq("status", assetStatusFilter);
        }

        // Apply date filters
        if (dateRange.start) {
          assetQuery = assetQuery.gte("submitted_at", dateRange.start);
        }
        if (dateRange.end) {
          assetQuery = assetQuery.lte("submitted_at", dateRange.end);
        }

        // Apply search filter
        if (searchTerm) {
          assetQuery = assetQuery.ilike("name", `%${searchTerm}%`);
        }

        assetQuery = assetQuery
          .order("submitted_at", { ascending: false, nullsFirst: false })
          .range(loadOffset, loadOffset + REPORT_APPROVAL_LOAD_LIMIT - 1);

        const { data: assetsData, error: assetsError } = await assetQuery;

        if (assetsError) {
          if (
            assetsError.code === "PGRST106" ||
            assetsError.message?.includes("does not exist")
          ) {
            console.warn("Assets table does not exist yet");
            setReports([]);
            setError(null);
          } else {
            setError(
              `Failed to load reports: ${assetsError.message || "Unknown error"}`,
            );
          }
        } else {
          // Convert assets to TechnicalReport-like format
          let reports: TechnicalReport[] = (assetsData || []).map((asset) => {
            // Extract job_id and report type from file_url
            const urlParts = (asset.file_url || "")
              .replace(REPORT_URL_PREFIX, "")
              .split("/");
            const assetJobId = urlParts.length >= 1 ? urlParts[0] : "";
            const reportSlug = urlParts.length >= 2 ? urlParts[1] : "";

            const reportType = reportSlug
              .split("-")
              .map(
                (word: string) => word.charAt(0).toUpperCase() + word.slice(1),
              )
              .join(" ");

            return {
              id: asset.id,
              title: asset.name || reportType || "Untitled Report",
              report_type: reportSlug,
              status:
                asset.status === "ready_for_review"
                  ? "submitted"
                  : asset.status,
              job_id: assetJobId,
              submitted_at: asset.submitted_at || asset.created_at,
              approved_at: asset.approved_at,
              sent_at: asset.sent_at,
              created_at: asset.created_at,
              report_data: {
                file_url: asset.file_url,
                urgency: asset.urgency,
              },
            } as unknown as TechnicalReport;
          });

          // Apply report type filter if specified
          if (reportTypeFilter) {
            reports = reports.filter(
              (r) =>
                (r.report_type || "").toLowerCase() ===
                reportTypeFilter.toLowerCase(),
            );
          }

          setHasMoreReports(
            (assetsData || []).length === REPORT_APPROVAL_LOAD_LIMIT,
          );
          setReportsOffset(loadOffset + (assetsData || []).length);
          if (isLoadMore) {
            setReports((prev) => [...prev, ...reports]);
          } else {
            setReports(await augmentWithFlaggedReports(reports));
          }
          console.log(
            "[ReportApproval] Global mode - Reports count:",
            isLoadMore ? reports.length + " (appended)" : reports.length,
          );
          setError(null);
        }
      }
    } catch (err) {
      console.error("Error fetching reports:", err);
      setError("An unexpected error occurred while fetching reports.");
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      let assets: { id: string; status: string }[] = [];

      if (jobId) {
        // For job-specific metrics, get asset IDs in batches of 500
        const assetIds: string[] = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: jobAssetLinks, error: linksError } = await supabase
            .schema("neta_ops")
            .from("job_assets")
            .select("asset_id")
            .eq("job_id", jobId)
            .order("asset_id", { ascending: true })
            .range(offset, offset + REPORT_APPROVAL_LOAD_LIMIT - 1);
          if (linksError) {
            console.error("Error fetching job asset links:", linksError);
            return;
          }
          if (!jobAssetLinks || jobAssetLinks.length === 0) break;
          jobAssetLinks.forEach((l) => assetIds.push(l.asset_id));
          hasMore = jobAssetLinks.length === REPORT_APPROVAL_LOAD_LIMIT;
          offset += REPORT_APPROVAL_LOAD_LIMIT;
        }
        if (assetIds.length === 0) {
          setMetrics({
            total: 0,
            draft: 0,
            submitted: 0,
            inReview: 0,
            approved: 0,
            rejected: 0,
            archived: 0,
            sent: 0,
          });
          return;
        }
        // Fetch assets in batches of 500
        for (let i = 0; i < assetIds.length; i += REPORT_APPROVAL_LOAD_LIMIT) {
          const chunk = assetIds.slice(i, i + REPORT_APPROVAL_LOAD_LIMIT);
          const { data: assetsData, error: assetsError } = await supabase
            .schema("neta_ops")
            .from("assets")
            .select("id, status")
            .or(REPORT_URL_FILTER)
            .in("id", chunk);
          if (assetsError) {
            console.error("Error fetching assets for metrics:", assetsError);
            return;
          }
          if (assetsData && assetsData.length > 0) assets.push(...assetsData);
        }
      } else {
        // Global metrics: cap at 500 to match list
        const { data: assetsData, error: assetsError } = await supabase
          .schema("neta_ops")
          .from("assets")
          .select("id, status")
          .or(REPORT_URL_FILTER)
          .limit(REPORT_APPROVAL_LOAD_LIMIT);
        if (assetsError) {
          console.error("Error fetching assets for metrics:", assetsError);
          return;
        }
        assets = assetsData || [];
      }

      // Map asset statuses to report metrics
      // Asset statuses: ready_for_review, approved, sent, rejected, in_progress, etc.
      const metricCounts = {
        total: assets.length,
        draft: assets.filter(
          (a) => a.status === "in_progress" || a.status === "draft",
        ).length,
        submitted: assets.filter((a) => a.status === "ready_for_review").length, // ready_for_review = submitted
        inReview: 0, // Not used
        approved: assets.filter((a) => a.status === "approved").length,
        rejected: assets.filter(
          (a) => a.status === "rejected" || a.status === "issue",
        ).length,
        archived: assets.filter((a) => a.status === "archived").length,
        sent: assets.filter((a) => a.status === "sent").length,
      };

      setMetrics(metricCounts);
    } catch (err) {
      console.error("Error fetching metrics:", err);
    }
  };

  const handleReviewReport = (report: TechnicalReport) => {
    setSelectedReport(report);
    setReviewComments("");
    setReviewStatus("approved");
    setShowReviewDialog(true);
  };

  // Handle downloading/printing PDF reports
  const handleDownloadPdfReport = async (report: TechnicalReport) => {
    const fileUrl = report.report_data?.file_url as string;
    if (
      fileUrl &&
      !fileUrl.startsWith("report:/") &&
      fileUrl.toLowerCase().endsWith(".pdf")
    ) {
      try {
        // Fetch the PDF file as a blob to ensure it downloads rather than opens
        const response = await fetch(await resolveFileUrl(fileUrl));
        if (!response.ok) {
          throw new Error("Failed to fetch PDF file");
        }

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        // Create a temporary anchor element to trigger download
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `${report.title.replace(/[^a-z0-9]/gi, "_")}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the blob URL
        window.URL.revokeObjectURL(blobUrl);

        toast({
          title: "Success",
          description: "PDF report downloaded",
          variant: "success",
        });
      } catch (error: any) {
        console.error("Error downloading PDF report:", error);
        toast({
          title: "Error",
          description: `Failed to download PDF: ${error.message || "Unknown error"}`,
          variant: "destructive",
        });
      }
    }
  };

  // Uploaded PDFs have nothing to edit, so they can be approved straight from
  // the list row as well as from the View popup.
  const handleApprovePdfReport = async (
    report: TechnicalReport,
    comments: string | null,
  ): Promise<boolean> => {
    if (!user) return false;
    const now = new Date().toISOString();

    const { error } = await supabase
      .schema("neta_ops")
      .from("assets")
      .update({
        status: "approved",
        reviewed_by: user.id,
        approved_by: user.id,
        reviewed_at: now,
        approved_at: now,
        review_comments: comments,
      })
      .eq("id", report.id);

    if (error) {
      console.error("Error approving PDF report:", error);
      toast({
        title: "Error",
        description: `Failed to approve report: ${error.message || "Unknown error"}`,
        variant: "destructive",
      });
      return false;
    }

    window.dispatchEvent(
      new CustomEvent("assetStatusChanged", {
        detail: { assetIds: [report.id], newStatus: "approved" },
      }),
    );
    toast({
      title: "Success",
      description: "Report approved successfully",
      variant: "success",
    });
    fetchReports();
    fetchMetrics();
    if (onUpdate) {
      try {
        onUpdate();
      } catch {
        /* noop */
      }
    }
    return true;
  };

  // navList: the table the report was opened from, in on-screen order. Drives
  // the Previous / Next buttons so a reviewer can walk the queue without
  // closing the window.
  const handleViewReport = async (
    report: TechnicalReport,
    navList: TechnicalReport[] = [],
  ) => {
    console.log("[ViewDialog] handleViewReport called for:", report.id);

    const navIndex = navList.findIndex((r) => r.id === report.id);
    const navHtml =
      navIndex === -1 || navList.length < 2
        ? ""
        : `
              <div style="display:flex;align-items:center;border:1px solid #d1d5db;">
                <button id="report-nav-prev" title="Previous report" aria-label="Previous report" ${navIndex === 0 ? "disabled" : ""} style="height:34px;padding:0 0.75rem;border:none;background:#f3f4f6;cursor:${navIndex === 0 ? "default" : "pointer"};font-size:0.875rem;border-radius:0;opacity:${navIndex === 0 ? 0.4 : 1};">‹ Prev</button>
                <span style="padding:0 0.75rem;font-size:0.8125rem;color:#374151;white-space:nowrap;">${navIndex + 1} of ${navList.length}</span>
                <button id="report-nav-next" title="Next report" aria-label="Next report" ${navIndex === navList.length - 1 ? "disabled" : ""} style="height:34px;padding:0 0.75rem;border:none;background:#f3f4f6;cursor:${navIndex === navList.length - 1 ? "default" : "pointer"};font-size:0.875rem;border-radius:0;opacity:${navIndex === navList.length - 1 ? 0.4 : 1};">Next ›</button>
              </div>`;
    // Goes through the Close button so its unsaved-changes prompt and cleanup
    // still run; if the reviewer cancels, the modal stays and we stop.
    const wireReviewNav = () => {
      const go = (delta: number) => {
        const target = navList[navIndex + delta];
        if (!target) return;
        document.getElementById("report-view-close-btn")?.click();
        if (document.getElementById("report-view-modal")) return;
        handleViewReport(target, navList);
      };
      const prev = document.getElementById("report-nav-prev");
      const next = document.getElementById("report-nav-next");
      if (prev) prev.onclick = () => go(-1);
      if (next) next.onclick = () => go(1);

      // Each Approve click reads the saved dropdown choice at that moment.
      // "Open next" only applies when a later report is still waiting.
      const approveBtn = document.getElementById("review-approve-btn");
      if (!approveBtn) return;
      approveBtn.dataset.hasNext = String(!!nextReviewable);
      refreshApproveLabel();
      approveBtn.addEventListener("click", () => {
        advanceAfterApprove = getApproveMode() === "next" && !!nextReviewable;
      });
    };
    // Next report after this one that still needs review.
    const nextReviewable =
      navIndex === -1
        ? undefined
        : navList.slice(navIndex + 1).find((r) => r.status === "submitted");
    let advanceAfterApprove = false;
    // Called after a successful approve. The list was captured when the
    // window opened, so mark this report approved in it; going back with
    // Prev then shows it as approved, not still waiting.
    const afterApproved = () => {
      const updatedList = navList.map((r) =>
        r.id === report.id ? { ...r, status: "approved" as TechnicalReport["status"] } : r,
      );
      if (advanceAfterApprove && nextReviewable) {
        advanceAfterApprove = false;
        handleViewReport(nextReviewable, updatedList);
      }
    };

    // Build the report URL
    if (!report.report_data?.file_url) {
      toast({
        title: "Error",
        description: "No report URL found",
        variant: "destructive",
      });
      return;
    }

    const fileUrl = report.report_data.file_url as string;

    // Check if this report can be reviewed (status is submitted)
    const canReview =
      report.status === "submitted" && userPermissions.canReview;

    // Approved and sent reports stay locked, but an approver can still open
    // them in edit mode; the report itself only releases its job information
    // block (see jobInfoEditAccess).
    const canEditLocked =
      !canReview &&
      userPermissions.canReview &&
      (report.status === "approved" || report.status === "sent");
    const showEditToggle = canReview || canEditLocked;
    // Reviewers can flag exact fields on a report waiting for review, or add
    // more to one already sent back as an Issue.
    const canFlagFields =
      canReview ||
      (userPermissions.canReview &&
        // Asset rows carry "issue" through untyped.
        ["issue", "rejected"].includes(String(report.status)));

    // Resolve the human-readable Job # (e.g. 26015) so it can be appended to
    // the modal title: "LV Circuit Breaker ATS 25 - C/B#1 - #26015".
    let jobNumber = "";
    try {
      if (report.job_id) {
        const { data: jobRow } = await supabase
          .schema("neta_ops")
          .from("jobs")
          .select("job_number")
          .eq("id", report.job_id)
          .maybeSingle();
        jobNumber = jobRow?.job_number || "";
      }
    } catch {
      /* job number is best-effort */
    }
    // Report number within the job ("26015-203") when it has one; it already
    // starts with the job number.
    const reportCode = await fetchReportCode(report.id);
    const displayTitle = reportCode
      ? `${report.title} - #${reportCode}`
      : jobNumber
        ? `${report.title} - #${jobNumber}`
        : report.title;

    // Header: identifier as the headline, report type under it, then a strip
    // of details (urgency, substation, submitted...) so each report is easy
    // to place while clicking through with Prev / Next.
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
      );
    const nameParts = getReportNameParts(report);
    const headIdentifier = getReportIdentifier(report);
    const headline = headIdentifier || nameParts.reportType || report.title;
    const subline = headIdentifier ? nameParts.reportType || "" : "";
    const linkedAssets: ReportLinkedAsset[] =
      ((window as any).__reportApprovalAssetsMap || {})[report.id] || [];
    const isCriticalReport =
      linkedAssets.some((a) => a.urgency === "critical") ||
      (report.report_data as any)?.urgency === "critical";
    const substationName = String(
      reportSubstations[report.id] || report.report_data?.substation || "",
    ).trim();
    const evaluation = evaluationsByReport[report.id];
    const statusLabel =
      String(report.status).charAt(0).toUpperCase() + String(report.status).slice(1);
    const statusBg =
      report.status === "submitted" ? "#fef3c7" : report.status === "approved" ? "#d1fae5" : "#fee2e2";
    const statusFg =
      report.status === "submitted" ? "#92400e" : report.status === "approved" ? "#065f46" : "#991b1b";
    const PILL = "display:inline-block;padding:0.125rem 0.5rem;border-radius:0;font-size:0.75rem;font-weight:600;";
    const detail = (label: string, valueHtml: string) => `
      <div style="display:flex;flex-direction:column;gap:0.125rem;padding:0 1rem;border-left:1px solid #e5e7eb;min-width:0;">
        <span style="font-size:0.625rem;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">${label}</span>
        <span style="font-size:0.8125rem;color:#111827;white-space:nowrap;">${valueHtml}</span>
      </div>`;
    const detailsHtml = [
      detail(
        "Urgency",
        isCriticalReport
          ? `<span style="${PILL}background:#fee2e2;color:#991b1b;">⚠ Critical</span>`
          : `<span style="${PILL}background:#f3f4f6;color:#374151;">Normal</span>`,
      ),
      detail("Substation", substationName ? esc(substationName) : "—"),
      detail("Submitted", esc(report.submitted_at ? formatDate(report.submitted_at) : "—")),
      evaluation
        ? detail(
            "Result",
            `<span style="${PILL}background:${evaluation === "PASS" ? "#d1fae5" : evaluation === "FAIL" ? "#fee2e2" : "#fef3c7"};color:${evaluation === "PASS" ? "#065f46" : evaluation === "FAIL" ? "#991b1b" : "#92400e"};">${esc(evaluation)}</span>`,
          )
        : "",
      reportCode ? detail("Report #", esc(reportCode)) : "",
      jobNumber ? detail("Job #", esc(jobNumber)) : "",
      report.approved_at ? detail("Approved", esc(formatDate(report.approved_at))) : "",
    ].join("");
    // Uses navHtml, built above from the Prev / Next list.
    const buildHeaderHtml = () => `
      <div style="flex-shrink:0;border-bottom:1px solid #e5e7eb;background:white;">
        <div style="padding:0.75rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
          <div style="min-width:0;">
            <h2 title="${esc(displayTitle)}" style="font-size:1.125rem;font-weight:600;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(headline)}</h2>
            ${subline ? `<div style="font-size:0.8125rem;color:#6b7280;margin-top:0.125rem;">${esc(subline)}</div>` : ""}
          </div>
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            ${navHtml}
            <span style="padding:0.25rem 0.75rem;border-radius:0;font-size:0.75rem;font-weight:600;background:${statusBg};color:${statusFg};">${esc(statusLabel)}</span>
            <button id="report-view-close-btn" style="padding:0.5rem 1rem;background:#f3f4f6;border:1px solid #d1d5db;border-radius:0;cursor:pointer;font-size:0.875rem;">Close</button>
          </div>
        </div>
        <div style="padding:0 0 0.75rem;margin-left:-1px;display:flex;flex-wrap:wrap;row-gap:0.5rem;overflow:hidden;">
          ${detailsHtml}
        </div>
      </div>`;

    // Earlier send-backs to Issue and the tech's fix notes, so the reviewer can
    // check the old comments were dealt with. Best effort.
    let reviewHistoryHtml = "";
    try {
      reviewHistoryHtml = issueRoundsHtml(
        issueRounds(await fetchReportActivity(report.id)),
      );
    } catch (e) {
      console.warn("[ViewDialog] Review history unavailable:", e);
    }

    // Action items on this report. The box's button opens the full dialog;
    // wireActionItems() hooks it up once the modal markup is in the page.
    const buildActionItemsHtml = async () => {
      try {
        return actionItemsHtml(await fetchActionItems(report.id), !!reportCode);
      } catch (e) {
        console.warn("[ViewDialog] Action items unavailable:", e);
        return "";
      }
    };
    const actionItemsSectionHtml = `<div id="review-action-items-section">${await buildActionItemsHtml()}</div>`;

    // Custom form report on an older version of its form? Unfinished reports
    // get a Compare & update button; approved and sent ones are only told.
    let formVersion: Awaited<ReturnType<typeof checkFormVersionForFileUrl>> = null;
    if (String(fileUrl).startsWith("custom-form:/")) {
      try {
        formVersion = await checkFormVersionForFileUrl(fileUrl, report.status);
      } catch (e) {
        console.warn("[ViewDialog] Form version check unavailable:", e);
      }
    }
    const formVersionHtml = !formVersion
      ? ""
      : formVersion.locked
        ? `<div id="review-form-version" style="padding:0.75rem;border:1px solid #e5e7eb;background:#f9fafb;font-size:0.8125rem;color:#374151;">
            <div style="font-weight:600;margin-bottom:0.25rem;">&#128274; Newer form version exists</div>
            Form v${formVersion.latest.version} is published. This report keeps v${formVersion.current}, the version it was ${report.status === "sent" ? "sent" : "approved"} with.
          </div>`
        : `<div id="review-form-version" style="padding:0.75rem;border:1px solid #e5e7eb;background:#fffbeb;display:flex;flex-direction:column;gap:0.5rem;">
            <div style="font-size:0.8125rem;font-weight:600;color:#92400e;">Newer form version</div>
            <div id="review-form-version-text" style="font-size:0.8125rem;color:#374151;">This report uses form v${formVersion.current}. v${formVersion.latest.version} is published.</div>
            <button id="review-form-version-btn" style="padding:0.5rem 0.75rem;background:${BRAND_COLOR};border:none;border-radius:0;cursor:pointer;font-size:0.8125rem;color:white;font-weight:500;">Compare &amp; update</button>
          </div>`;
    const wireActionItems = () => {
      const btn = document.getElementById("review-action-items-btn");
      if (!btn) return;
      btn.onclick = async () => {
        await openActionItemsDialog({
          assetId: report.id,
          jobId: report.job_id,
          reportCode,
          reportName: report.title,
          userId: user?.id || "",
        });
        const section = document.getElementById("review-action-items-section");
        if (section) {
          section.innerHTML = await buildActionItemsHtml();
          wireActionItems();
        }
      };
    };

    // Create modal completely outside of React
    // This survives component unmounts
    let modalContainer = document.getElementById("report-view-modal-root");
    if (!modalContainer) {
      modalContainer = document.createElement("div");
      modalContainer.id = "report-view-modal-root";
      document.body.appendChild(modalContainer);
    }

    // Handle PDF reports (direct file URLs, not report:/ URLs)
    if (
      fileUrl &&
      !fileUrl.startsWith("report:/") &&
      fileUrl.toLowerCase().endsWith(".pdf")
    ) {
      // Create modal for PDF report
      modalContainer.innerHTML = `
        <div id="report-view-modal" style="position:fixed;inset:0;z-index:99999;isolation:isolate;">
          <div style="position:absolute;inset:0;background:rgba(0,0,0,0.75);"></div>
          <div style="position:absolute;inset:0.75rem;background:white;border-radius:0;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden;">
            <!-- Header -->
            ${buildHeaderHtml()}

            <!-- Body: review sidebar + PDF preview -->
            <div style="flex:1;display:flex;overflow:hidden;">
              ${buildReviewSidebarHtml({
                toolbarHtml: `
                  <button id="report-preview-btn" title="Open in new tab" style="width:40px;height:40px;border-radius:0;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;color:white;background:#2563eb;">
                    ${EYE_ICON_SVG}
                  </button>
                  <button id="report-print-btn" title="Print" style="width:40px;height:40px;border-radius:0;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;color:white;background:#525252;">
                    ${PRINTER_ICON_SVG}
                  </button>`,
                bodyHtml: `${reviewHistoryHtml}${actionItemsSectionHtml}`,
                canReview,
                readOnlyHtml: `<p style="font-size:0.8125rem;color:#6b7280;margin:0;">This is a read-only preview.</p>`,
              })}

              <!-- PDF Content -->
              <div style="flex:1;overflow:hidden;background:#f9fafb;">
                <iframe
                  src="${fileUrl}"
                  style="width:100%;height:100%;border:none;"
                  title="PDF Report Preview"
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      `;

      wireActionItems();
      wireReviewSidebar();
      wireReviewNav();

      // Add close handler
      const closeBtn = document.getElementById("report-view-close-btn");
      if (closeBtn) {
        closeBtn.onclick = () => {
          const modal = document.getElementById("report-view-modal");
          if (modal) modal.remove();
        };
      }

      // Preview (open in new tab) + Print toolbar handlers
      const previewBtn = document.getElementById("report-preview-btn");
      if (previewBtn) {
        previewBtn.onclick = () =>
          openFileUrl(fileUrl);
      }
      const printBtn = document.getElementById("report-print-btn");
      if (printBtn) {
        printBtn.onclick = () => {
          const iframe = document.querySelector(
            'iframe[title="PDF Report Preview"]',
          ) as HTMLIFrameElement | null;
          try {
            if (iframe?.contentWindow) {
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
              return;
            }
          } catch {
            /* fall back to opening the PDF in a new tab to print */
          }
          openFileUrl(fileUrl);
        };
      }

      // Add review action handlers if canReview
      if (canReview) {
        const approveBtn = document.getElementById("review-approve-btn");
        const rejectBtn = document.getElementById("review-reject-btn");
        const archiveBtn = document.getElementById("review-archive-btn");
        const commentsInput = document.getElementById(
          "review-comments-input",
        ) as HTMLTextAreaElement;

        if (approveBtn) {
          approveBtn.onclick = async () => {
            approveBtn.setAttribute("disabled", "true");
            approveBtn.textContent = "Approving...";
            const ok = await handleApprovePdfReport(
              report,
              commentsInput?.value || null,
            );
            if (ok) {
              const modal = document.getElementById("report-view-modal");
              if (modal) modal.remove();
              afterApproved();
            } else {
              approveBtn.removeAttribute("disabled");
              refreshApproveLabel();
            }
          };
        }

        if (rejectBtn) {
          rejectBtn.onclick = async () => {
            if (!user) return;
            // Get fresh reference to comments input to ensure we have the current value
            const commentsEl = document.getElementById(
              "review-comments-input",
            ) as HTMLTextAreaElement;
            const comments = commentsEl?.value?.trim() || "";

            if (!comments) {
              toast({
                title: "Error",
                description: "Comments are required when rejecting a report",
                variant: "destructive",
              });
              commentsEl?.focus();
              return;
            }

            const now = new Date().toISOString();
            const updateData: any = {
              status: "issue",
              reviewed_by: user.id,
              reviewed_at: now,
              review_comments: comments,
            };

            const { error } = await supabase
              .schema("neta_ops")
              .from("assets")
              .update(updateData)
              .eq("id", report.id);

            if (error) {
              toast({
                title: "Error",
                description: `Failed to reject report: ${error.message || "Unknown error"}`,
                variant: "destructive",
              });
            } else {
              window.dispatchEvent(
                new CustomEvent("assetStatusChanged", {
                  detail: { assetIds: [report.id], newStatus: "issue" },
                }),
              );
              toast({
                title: "Success",
                description: "Report rejected and marked as issue",
                variant: "success",
              });
              const modal = document.getElementById("report-view-modal");
              if (modal) modal.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) {
                try {
                  onUpdate();
                } catch {
                  /* noop */
                }
              }
            }
          };
        }

        if (archiveBtn) {
          archiveBtn.onclick = async () => {
            if (!user) return;
            const now = new Date().toISOString();

            const updateData: any = {
              status: "archived",
              reviewed_by: user.id,
              reviewed_at: now,
              review_comments: commentsInput?.value || null,
            };

            const { error } = await supabase
              .schema("neta_ops")
              .from("assets")
              .update(updateData)
              .eq("id", report.id);

            if (error) {
              toast({
                title: "Error",
                description: `Failed to archive report: ${error.message || "Unknown error"}`,
                variant: "destructive",
              });
            } else {
              window.dispatchEvent(
                new CustomEvent("assetStatusChanged", {
                  detail: { assetIds: [report.id], newStatus: "archived" },
                }),
              );
              toast({
                title: "Success",
                description: "Report archived successfully",
                variant: "success",
              });
              const modal = document.getElementById("report-view-modal");
              if (modal) modal.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) {
                try {
                  onUpdate();
                } catch {
                  /* noop */
                }
              }
            }
          };
        }
      }

      return;
    }

    if (!REPORT_URL_PREFIX.test(fileUrl)) {
      toast({
        title: "Error",
        description: "Invalid report URL format",
        variant: "destructive",
      });
      return;
    }

    const urlParts = fileUrl.replace(REPORT_URL_PREFIX, "").split("/");
    if (urlParts.length < 2) {
      toast({
        title: "Error",
        description: "Invalid report URL structure",
        variant: "destructive",
      });
      return;
    }

    const reportJobId = urlParts[0];
    const reportSlug = urlParts[1];

    // URL structure can be:
    // /jobs/{jobId}/{reportSlug}/{reportId} (3 parts)
    // /jobs/{jobId}/{reportSlug}/{substation}/{reportId} (4 parts)
    let basePath: string;
    if (urlParts.length === 4) {
      // Has substation: urlParts[2] is substation, urlParts[3] is reportId
      const substation = urlParts[2];
      const reportId = urlParts[3];
      basePath = `/jobs/${reportJobId}/${reportSlug}/${substation}/${reportId}`;
      console.log("[ViewDialog] URL parsing (4 parts):", {
        fileUrl,
        urlParts,
        reportJobId,
        reportSlug,
        substation,
        reportId,
      });
    } else if (urlParts.length === 3) {
      // No substation: urlParts[2] is reportId
      const reportId = urlParts[2];
      basePath = `/jobs/${reportJobId}/${reportSlug}/${reportId}`;
      console.log("[ViewDialog] URL parsing (3 parts):", {
        fileUrl,
        urlParts,
        reportJobId,
        reportSlug,
        reportId,
      });
    } else {
      // Just the slug, no reportId
      basePath = `/jobs/${reportJobId}/${reportSlug}`;
      console.log("[ViewDialog] URL parsing (2 parts):", {
        fileUrl,
        urlParts,
        reportJobId,
        reportSlug,
      });
    }

    const openReportUrl = `${window.location.origin}${basePath}?fromApproval=true`;
    const fullReportUrl = `${openReportUrl}&print=true&embedded=true`;

    console.log("[ViewDialog] Opening report at:", fullReportUrl);

    modalContainer.innerHTML = `
      <div id="report-view-modal" style="position:fixed;inset:0;z-index:99999;isolation:isolate;">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.75);"></div>
        <div style="position:absolute;inset:0.75rem;background:white;border-radius:0;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden;">
          <!-- Header -->
            ${buildHeaderHtml()}

          <!-- Body: review sidebar + report preview -->
          <div style="flex:1;display:flex;overflow:hidden;">
            ${buildReviewSidebarHtml({
              toolbarHtml: `
                <button id="report-preview-btn" title="Open in new tab" style="width:40px;height:40px;border-radius:0;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;color:white;background:#2563eb;">
                  ${EYE_ICON_SVG}
                </button>
                <button id="report-print-btn" title="Print" style="width:40px;height:40px;border-radius:0;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;color:white;background:#525252;">
                  ${PRINTER_ICON_SVG}
                </button>
                ${
                  showEditToggle
                    ? `
                <button id="report-edit-btn" title="Edit report" style="width:40px;height:40px;border-radius:0;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;color:white;background:${BRAND_COLOR};">
                  ${PENCIL_ICON_SVG}
                </button>
                `
                    : ""
                }
                ${
                  canFlagFields
                    ? `
                <button id="report-flag-btn" title="Flag fields" style="position:relative;width:40px;height:40px;border-radius:0;display:flex;align-items:center;justify-content:center;border:1px solid #fca5a5;cursor:pointer;color:#dc2626;background:white;">
                  ${FLAG_ICON_SVG}
                  <span id="report-flag-count" style="display:none;position:absolute;top:-7px;right:-7px;min-width:18px;height:18px;padding:0 4px;border-radius:0;background:#171717;color:white;font-size:11px;font-weight:600;line-height:18px;text-align:center;"></span>
                </button>
                `
                    : ""
                }`,
              bodyHtml: `${formVersionHtml}${reviewHistoryHtml}${actionItemsSectionHtml}${
                canReview
                  ? `<p id="report-edit-hint" style="display:none;font-size:0.8125rem;color:#6b7280;margin:0;">Editing — use Save &amp; Approve to save your changes.</p>`
                  : ""
              }`,
              canReview,
              readOnlyHtml: showEditToggle
                ? ""
                : `<p style="font-size:0.8125rem;color:#6b7280;margin:0;">This is a read-only preview.</p>`,
            })}

            <!-- Report Content -->
            <div style="flex:1;overflow:hidden;background:#f9fafb;position:relative;">
              ${REPORT_ZOOM_CONTROLS_HTML}
              <iframe
                src="${fullReportUrl}"
                style="width:100%;height:100%;border:none;"
                title="Report Preview"
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    `;

    wireReportZoom();
    wireReviewSidebar();
    wireReviewNav();

    // Whether the reviewer has swapped the preview iframe for the live,
    // editable report, and whether that report currently has an open edit
    // session (reported by ReportWrapper via postMessage).
    let inEditMode = false;
    let hasUnsavedChanges = false;

    wireActionItems();

    // Add close handler
    const closeBtn = document.getElementById("report-view-close-btn");
    if (closeBtn) {
      closeBtn.onclick = () => {
        if (
          inEditMode &&
          hasUnsavedChanges &&
          !window.confirm(
            "Close this report? Any unsaved changes will be lost.",
          )
        ) {
          return;
        }
        window.removeEventListener("message", messageHandler);
        const modal = document.getElementById("report-view-modal");
        if (modal) modal.remove();
      };
    }

    // Preview (open in new tab) + Print toolbar handlers
    const previewBtn = document.getElementById("report-preview-btn");
    if (previewBtn) {
      previewBtn.onclick = () =>
        window.open(openReportUrl, "_blank", "noopener,noreferrer");
    }
    const printBtn = document.getElementById("report-print-btn");
    if (printBtn) {
      printBtn.onclick = () => {
        const iframe = document.querySelector(
          'iframe[title="Report Preview"]',
        ) as HTMLIFrameElement | null;
        if (iframe?.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
      };
    }

    // Edit toggle: reload the preview iframe as the live (non-print) report
    // with ?edit=true, which drops the reviewer straight into edit mode. On a
    // report pending review that is then saved by "Save & Approve" (see
    // requestSave below); on an approved one the report saves itself.
    let onEditStateChange = () => {};

    const editBtn = document.getElementById("report-edit-btn");
    const editHint = document.getElementById("report-edit-hint");

    const getPreviewIframe = () =>
      document.querySelector(
        'iframe[title="Report Preview"]',
      ) as HTMLIFrameElement | null;

    const applyEditModeChrome = () => {
      if (editBtn) {
        editBtn.setAttribute(
          "title",
          inEditMode ? "Back to preview" : "Edit report",
        );
        editBtn.style.background = inEditMode ? "#525252" : BRAND_COLOR;
      }
      if (editHint) {
        editHint.style.display = inEditMode ? "block" : "none";
      }
    };

    // Flag toggle: field flags need the live report (the preview is a print
    // copy without the real fields), so load it with ?flag=true, which turns
    // flag mode on. In edit mode the report is already live: just toggle.
    let inFlagView = false;
    const flagBtn = document.getElementById("report-flag-btn");
    let flagModeOn = false;
    const flagCountBadge = document.getElementById("report-flag-count");
    const setFlagCount = (count: number) => {
      if (!flagCountBadge) return;
      flagCountBadge.textContent = String(count);
      flagCountBadge.style.display = count > 0 ? "block" : "none";
    };
    if (canFlagFields) {
      fetchOpenFieldFlags(report.id)
        .then((rows) => {
          // Flags from before the last approval belong to an old round.
          const approvedAt = report.approved_at ? Date.parse(report.approved_at) : null;
          setFlagCount(
            approvedAt
              ? rows.filter((r) => Date.parse(r.created_at) > approvedAt).length
              : rows.length,
          );
        })
        .catch((e) => console.warn("[ViewDialog] Field flags unavailable:", e));
    }

    const applyFlagChrome = () => {
      if (flagBtn) {
        const on = inFlagView || flagModeOn;
        flagBtn.style.background = on ? "#dc2626" : "white";
        flagBtn.style.color = on ? "white" : "#dc2626";
        flagBtn.setAttribute("title", inFlagView ? "Back to preview" : "Flag fields");
      }
    };

    if (flagBtn) {
      flagBtn.onclick = () => {
        const iframe = getPreviewIframe();
        if (!iframe) return;
        if (inEditMode) {
          iframe.contentWindow?.postMessage(
            { type: "fieldFlagsToggle" },
            window.location.origin,
          );
          return;
        }
        inFlagView = !inFlagView;
        flagModeOn = false;
        iframe.src = inFlagView ? `${openReportUrl}&flag=true` : fullReportUrl;
        applyFlagChrome();
      };
    }

    if (editBtn) {
      editBtn.onclick = () => {
        const iframe = getPreviewIframe();
        if (!iframe) return;

        if (inEditMode) {
          if (
            hasUnsavedChanges &&
            !window.confirm(
              "Leave edit mode? Any unsaved changes to this report will be lost.",
            )
          ) {
            return;
          }
          inEditMode = false;
          hasUnsavedChanges = false;
          onEditStateChange();
          iframe.src = fullReportUrl;
        } else {
          inEditMode = true;
          iframe.src = `${openReportUrl}&edit=true`;
        }
        // Either way the frame reloads with flag mode off.
        inFlagView = false;
        flagModeOn = false;
        applyFlagChrome();
        applyEditModeChrome();
      };
    }

    const messageHandler = (e: MessageEvent) => {
      if (
        e.data?.type === "fieldFlagsState" &&
        e.origin === window.location.origin
      ) {
        flagModeOn = !!e.data.on;
        setFlagCount(Number(e.data.count) || 0);
        applyFlagChrome();
      }
      if (e.data?.type === "reportEditState") {
        hasUnsavedChanges = !!e.data.isEditing;
        onEditStateChange();
      }
      // From the compare screen loaded in the preview frame.
      if (e.origin === window.location.origin && e.data?.type === "formVersionUpdated") {
        const box = document.getElementById("review-form-version");
        if (box) {
          box.style.background = "#d1fae5";
          box.innerHTML = `<div style="font-size:0.8125rem;font-weight:600;color:#065f46;">Updated to form v${Number(e.data.version) || ""}</div>`;
        }
        const iframe = getPreviewIframe();
        if (iframe) iframe.src = fullReportUrl;
      }
      if (e.origin === window.location.origin && e.data?.type === "formVersionCompareClose") {
        const iframe = getPreviewIframe();
        if (iframe) iframe.src = fullReportUrl;
      }
      if (e.data?.type === "saveComplete") {
        const pa = (window as any).__pendingApprove;
        if (pa) {
          (window as any).__pendingApprove = null;
          e.data.success
            ? pa.resolve()
            : pa.reject(new Error(e.data.reason || "Save failed."));
        }
      }
    };
    window.addEventListener("message", messageHandler);

    // Compare & update: the compare screen takes the preview frame's place, so
    // the review panel and the decision buttons stay where they are.
    const formVersionBtn = document.getElementById("review-form-version-btn");
    if (formVersionBtn && formVersion) {
      const compareUrl = `${window.location.origin}${formVersion.comparePath}?embedded=true`;
      const showingCompare = () => {
        try {
          return !!getPreviewIframe()?.contentWindow?.location.pathname.endsWith("/form-version");
        } catch {
          return false;
        }
      };
      const syncCompareButton = () => {
        formVersionBtn.textContent = showingCompare() ? "Back to report" : "Compare & update";
        formVersionBtn.style.background = showingCompare() ? "#525252" : BRAND_COLOR;
      };
      getPreviewIframe()?.addEventListener("load", syncCompareButton);
      formVersionBtn.onclick = () => {
        const iframe = getPreviewIframe();
        if (!iframe) return;
        if (showingCompare()) {
          iframe.src = fullReportUrl;
          return;
        }
        if (
          inEditMode &&
          hasUnsavedChanges &&
          !window.confirm("Leave edit mode? Any unsaved changes to this report will be lost.")
        ) {
          return;
        }
        inEditMode = false;
        hasUnsavedChanges = false;
        onEditStateChange();
        inFlagView = false;
        flagModeOn = false;
        applyFlagChrome();
        applyEditModeChrome();
        iframe.src = compareUrl;
      };
    }

    // Add review action handlers if canReview
    if (canReview) {
      const approveBtn = document.getElementById("review-approve-btn");
      const rejectBtn = document.getElementById("review-reject-btn");
      const archiveBtn = document.getElementById("review-archive-btn");
      const commentsInput = document.getElementById(
        "review-comments-input",
      ) as HTMLTextAreaElement;

      const updateApproveBtnText = () => {
        if (approveBtn) {
          // "Save &" only while there are edits that still need saving.
          approveBtn.dataset.unsaved = String(hasUnsavedChanges);
          refreshApproveLabel();
        }
      };
      onEditStateChange = updateApproveBtnText;

      if (approveBtn) {
        approveBtn.onclick = async () => {
          if (!user) return;
          const comments = commentsInput?.value || "Report approved";
          const now = new Date().toISOString();

          const doApprove = async () => {
            try {
              approveBtn.textContent = "Approving...";
              approveBtn.setAttribute("disabled", "true");
              const { error } = await supabase
                .schema("neta_ops")
                .from("assets")
                .update({
                  status: "approved",
                  reviewed_by: user.id,
                  approved_by: user.id,
                  reviewed_at: now,
                  approved_at: now,
                  review_comments: comments,
                })
                .eq("id", report.id);
              if (error) {
                toast({
                  title: "Error",
                  description: `Failed to approve: ${error.message}`,
                  variant: "destructive",
                });
                updateApproveBtnText();
                approveBtn.removeAttribute("disabled");
              } else {
                window.dispatchEvent(
                  new CustomEvent("assetStatusChanged", {
                    detail: { assetIds: [report.id], newStatus: "approved" },
                  }),
                );
                toast({
                  title: "Success",
                  description: hasUnsavedChanges
                    ? "Report saved and approved"
                    : "Report approved",
                  variant: "success",
                });
                window.removeEventListener("message", messageHandler);
                document.getElementById("report-view-modal")?.remove();
                fetchReports();
                fetchMetrics();
                if (onUpdate) onUpdate();
                afterApproved();
              }
            } catch (err) {
              console.error("Error approving:", err);
              toast({
                title: "Error",
                description: "Failed to approve report",
                variant: "destructive",
              });
              updateApproveBtnText();
              approveBtn.removeAttribute("disabled");
            }
          };

          if (hasUnsavedChanges) {
            approveBtn.textContent = "Saving...";
            approveBtn.setAttribute("disabled", "true");
            const iframe = getPreviewIframe();
            if (iframe?.contentWindow) {
              iframe.contentWindow.postMessage({ type: "requestSave" }, "*");
            } else {
              toast({
                title: "Error",
                description: "Could not find the report preview to save.",
                variant: "destructive",
              });
              updateApproveBtnText();
              approveBtn.removeAttribute("disabled");
              return;
            }
            const savePromise = new Promise<void>((resolve, reject) => {
              (window as any).__pendingApprove = { resolve, reject };
              setTimeout(() => {
                if ((window as any).__pendingApprove) {
                  (window as any).__pendingApprove = null;
                  reject(new Error("The report did not finish saving."));
                }
              }, 10000);
            });
            try {
              await savePromise;
            } catch (err) {
              toast({
                title: "Error",
                description:
                  err instanceof Error
                    ? err.message
                    : "Could not save the report before approving.",
                variant: "destructive",
              });
              updateApproveBtnText();
              approveBtn.removeAttribute("disabled");
              return;
            }
            await doApprove();
          } else {
            await doApprove();
          }
        };
      }

      if (rejectBtn) {
        rejectBtn.onclick = async () => {
          if (!user) return;
          // Get fresh reference to comments input to ensure we have the current value
          const commentsEl = document.getElementById(
            "review-comments-input",
          ) as HTMLTextAreaElement;
          const comments = commentsEl?.value?.trim() || "";
          if (!comments) {
            toast({
              title: "Error",
              description: "Comments are required when rejecting a report",
              variant: "destructive",
            });
            commentsEl?.focus();
            return;
          }
          const now = new Date().toISOString();
          try {
            rejectBtn.textContent = "Rejecting...";
            rejectBtn.setAttribute("disabled", "true");
            // Update asset status directly
            const { error } = await supabase
              .schema("neta_ops")
              .from("assets")
              .update({
                status: "issue",
                reviewed_by: user.id,
                reviewed_at: now,
                review_comments: comments,
              })
              .eq("id", report.id);
            if (error) {
              toast({
                title: "Error",
                description: `Failed to reject: ${error.message}`,
                variant: "destructive",
              });
              rejectBtn.textContent = "✕ Reject / Mark as Issue";
              rejectBtn.removeAttribute("disabled");
            } else {
              window.dispatchEvent(
                new CustomEvent("assetStatusChanged", {
                  detail: { assetIds: [report.id], newStatus: "issue" },
                }),
              );
              toast({
                title: "Success",
                description: "Report rejected / marked as issue",
                variant: "success",
              });
              document.getElementById("report-view-modal")?.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) onUpdate();
            }
          } catch (err) {
            console.error("Error rejecting:", err);
            toast({
              title: "Error",
              description: "Failed to reject report",
              variant: "destructive",
            });
            rejectBtn.textContent = "✕ Reject / Mark as Issue";
            rejectBtn.removeAttribute("disabled");
          }
        };
      }

      if (archiveBtn) {
        archiveBtn.onclick = async () => {
          if (!user) return;
          const comments = commentsInput?.value || "Report archived";
          const now = new Date().toISOString();
          try {
            archiveBtn.textContent = "Archiving...";
            archiveBtn.setAttribute("disabled", "true");
            // Update asset status directly
            const { error } = await supabase
              .schema("neta_ops")
              .from("assets")
              .update({
                status: "archived",
                reviewed_by: user.id,
                reviewed_at: now,
                review_comments: comments,
              })
              .eq("id", report.id);
            if (error) {
              toast({
                title: "Error",
                description: `Failed to archive: ${error.message}`,
                variant: "destructive",
              });
              archiveBtn.textContent = "Archive";
              archiveBtn.removeAttribute("disabled");
            } else {
              window.dispatchEvent(
                new CustomEvent("assetStatusChanged", {
                  detail: { assetIds: [report.id], newStatus: "archived" },
                }),
              );
              toast({
                title: "Success",
                description: "Report archived",
                variant: "success",
              });
              document.getElementById("report-view-modal")?.remove();
              fetchReports();
              fetchMetrics();
              if (onUpdate) onUpdate();
            }
          } catch (err) {
            console.error("Error archiving:", err);
            toast({
              title: "Error",
              description: "Failed to archive report",
              variant: "destructive",
            });
            archiveBtn.textContent = "Archive";
            archiveBtn.removeAttribute("disabled");
          }
        };
      }
    }

    // Store report for review actions
    setSelectedReport(report);
  };

  const handleMarkAsSent = async (report: TechnicalReport) => {
    console.log(
      "handleMarkAsSent called with report:",
      report.id,
      "user:",
      user?.id,
    );
    if (!user) return;

    // Sending is allowed with open action items, but say which ones first.
    const openItems = await fetchOpenActionItems([report.id]);
    if (
      openItems.length > 0 &&
      !(await confirmDialog({
        title: `Send with ${openItems.length} action item${openItems.length === 1 ? "" : "s"} not yet formally notified?`,
        description: openItems
          .map((i) => `#${i.item_code}: ${i.title}`)
          .join(" · "),
        confirmLabel: "Send anyway",
      }))
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const now = new Date().toISOString();

      // Update asset status directly
      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update({
          status: "sent",
          sent_at: now,
          sent_by: user.id,
        })
        .eq("id", report.id);

      if (error) {
        toast({
          title: "Error",
          description: `Failed to mark report as sent: ${error.message || "Unknown error"}`,
          variant: "destructive",
        });
      } else {
        window.dispatchEvent(
          new CustomEvent("assetStatusChanged", {
            detail: { assetIds: [report.id], newStatus: "sent" },
          }),
        );
        toast({
          title: "Success",
          description: "Report marked as sent successfully",
          variant: "success",
        });

        // Publish the report to the customer portal (ampOS ACCESS) as a real,
        // print-styled PDF via the publish-report-pdf edge function (headless
        // Chromium / Browserless) — same output as the in-app Print button.
        // Fire-and-forget so it doesn't block the status UI.
        const fileUrl = report.report_data?.file_url as string | undefined;
        if (fileUrl?.startsWith("report:")) {
          void (async () => {
            try {
              const { data, error } = await supabase.functions.invoke(
                "publish-report-pdf",
                { body: { assetId: report.id } },
              );
              if (error) throw error;
              if ((data as { error?: string })?.error) {
                throw new Error((data as { error?: string }).error);
              }
              toast({
                title: "Published to customer portal",
                description: "The report PDF is now available in ampOS ACCESS.",
                variant: "success",
              });
            } catch (e) {
              console.warn(
                "Portal PDF publish failed:",
                e instanceof Error ? e.message : e,
              );
              toast({
                title: "Portal publish failed",
                description:
                  "Report was marked as sent, but the downloadable PDF could not be generated. Try re-sending.",
                variant: "destructive",
              });
            }
          })();
        }

        fetchReports();
        fetchMetrics();
        if (onUpdate) {
          try {
            onUpdate();
          } catch {
            /* noop */
          }
        }
      }
    } catch (err) {
      console.error("Error marking report as sent:", err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsApproved = async (report: TechnicalReport) => {
    console.log(
      "handleMarkAsApproved called with report:",
      report.id,
      "user:",
      user?.id,
    );
    if (!user) return;

    setIsLoading(true);
    try {
      const now = new Date().toISOString();

      // Update asset status directly
      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update({
          status: "approved",
          reviewed_by: user.id,
          approved_by: user.id,
          reviewed_at: now,
          approved_at: now,
          review_comments: "Report marked as approved from sent status",
        })
        .eq("id", report.id);

      if (error) {
        toast({
          title: "Error",
          description: `Failed to mark report as approved: ${error.message || "Unknown error"}`,
          variant: "destructive",
        });
      } else {
        window.dispatchEvent(
          new CustomEvent("assetStatusChanged", {
            detail: { assetIds: [report.id], newStatus: "approved" },
          }),
        );
        toast({
          title: "Success",
          description: "Report marked as approved successfully",
          variant: "success",
        });

        // Unsending pulls the report back from the customer portal (ampOS
        // ACCESS): delete the published PDF and clear published_pdf_path so the
        // customer can no longer view or download it. Mirror of the on-send
        // publish in handleMarkAsSent. Fire-and-forget so it doesn't block the
        // status UI. Only meaningful for internal reports (file_url "report:").
        const fileUrl = report.report_data?.file_url as string | undefined;
        if (fileUrl?.startsWith("report:")) {
          void (async () => {
            try {
              const { data, error } = await supabase.functions.invoke(
                "unpublish-report-pdf",
                { body: { assetId: report.id } },
              );
              if (error) throw error;
              if ((data as { error?: string })?.error) {
                throw new Error((data as { error?: string }).error);
              }
              toast({
                title: "Removed from customer portal",
                description:
                  "The report is no longer viewable in ampOS ACCESS.",
                variant: "success",
              });
            } catch (e) {
              console.warn(
                "Portal PDF unpublish failed:",
                e instanceof Error ? e.message : e,
              );
              toast({
                title: "Portal access not removed",
                description:
                  "Report was marked as approved, but its ampOS ACCESS viewing access could not be removed. Try unsending again.",
                variant: "destructive",
              });
            }
          })();
        }

        fetchReports();
        fetchMetrics();
        if (onUpdate) {
          try {
            onUpdate();
          } catch {
            /* noop */
          }
        }
      }
    } catch (err) {
      console.error("Error marking report as approved:", err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const submitReview = async () => {
    if (!selectedReport || !user) return;

    setIsLoading(true);
    try {
      const now = new Date().toISOString();

      // Update asset status directly (selectedReport.id is the asset ID)
      // Map 'rejected' to 'issue' for assets table (which doesn't support 'rejected' status)
      const assetStatus = reviewStatus === "rejected" ? "issue" : reviewStatus;
      const updateData: any = {
        status: assetStatus,
        reviewed_by: user.id,
        reviewed_at: now,
        review_comments: reviewComments || null,
      };

      // Add approved_at timestamp if approved
      if (reviewStatus === "approved") {
        updateData.approved_at = now;
        updateData.approved_by = user.id;
      }

      const { error } = await supabase
        .schema("neta_ops")
        .from("assets")
        .update(updateData)
        .eq("id", selectedReport.id);

      if (error) {
        toast({
          title: "Error",
          description: `Failed to submit review: ${error.message || "Unknown error"}`,
          variant: "destructive",
        });
      } else {
        // Dispatch event to notify other components
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("assetStatusChanged", {
              detail: { assetIds: [selectedReport.id], newStatus: assetStatus },
            }),
          );
        }

        toast({
          title: "Success",
          description: `Report ${reviewStatus === "approved" ? "approved" : "rejected"}`,
          variant: "success",
        });
        setShowReviewDialog(false);
        fetchReports();
        fetchMetrics();
        if (onUpdate) {
          try {
            onUpdate();
          } catch {
            /* noop */
          }
        }
      }
    } catch (err) {
      console.error("Error submitting review:", err);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchReports();
    fetchMetrics();
  };

  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "submitted":
        return <Badge variant="default">Pending</Badge>;
      case "approved":
        return <Badge variant="secondary">Approved</Badge>;
      case "sent":
        return (
          <Badge
            variant="default"
            className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100"
          >
            Sent
          </Badge>
        );
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "archived":
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Linked asset rows carry the urgency flag the approvals list shows.
  type ReportLinkedAsset = {
    name?: string;
    file_url?: string;
    urgency?: "normal" | "critical";
  };

  const isPdfReport = (report: TechnicalReport) => {
    const url = report.report_data?.file_url;
    return (
      !!url &&
      !url.startsWith("report:/") &&
      url.toLowerCase().endsWith(".pdf")
    );
  };

  // The approvals list is laid out like the job's Reports tab — same columns in
  // the same order — so moving between the two tabs doesn't mean relearning the
  // page. Approved/Sent columns only appear once a report in view has them, so
  // the Pending tab stays narrow.
  // navList: what Prev / Next walks. Defaults to this table; the substation
  // view passes every report on screen so review isn't stuck in one folder.
  const renderReportTable = (
    list: TechnicalReport[],
    assetsMap: Record<string, ReportLinkedAsset[]>,
    navList: TechnicalReport[] = list,
  ) => {
    const showApproved = list.some((r) => !!r.approved_at);
    const showSent = list.some((r) => !!r.sent_at);
    const columnCount = 7 + (showApproved ? 1 : 0) + (showSent ? 1 : 0);
    return (
      <Table>
        <TableHeader>
          <TableRow className="border-b border-neutral-100 hover:bg-transparent dark:border-neutral-800 dark:hover:bg-transparent [&>th]:h-auto [&>th]:px-3 [&>th]:py-2 [&>th]:text-[10px] [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-neutral-400 dark:[&>th]:text-neutral-500">
            <TableHead>Report Type</TableHead>
            <TableHead>Identifier</TableHead>
            <TableHead>Urgency</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Submitted</TableHead>
            {showApproved && <TableHead>Approved</TableHead>}
            {showSent && <TableHead>Sent</TableHead>}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((report) => {
            // Urgency lives on the asset. The linked-asset map is the richer
            // source (a report can have more than one asset), but the report
            // row carries its own asset's urgency when no link exists.
            const linkedAssets = assetsMap[report.id] || [];
            const isCritical =
              linkedAssets.some((a) => a.urgency === "critical") ||
              (report.report_data as any)?.urgency === "critical";
            const identifier = getReportIdentifier(report);
            const isApprovedTab =
              activeTab === "approved" || activeTab === "accepted";
            // A PDF report is marked sent by printing it, so it gets the print
            // button instead of the status button.
            const showStatusButton =
              !isPdfReport(report) &&
              ((isApprovedTab && report.status === "approved") ||
                (activeTab === "sent" && report.status === "sent"));
            return (
              <React.Fragment key={report.id}>
                <TableRow className="border-neutral-100 dark:border-neutral-800 [&>td]:px-3 [&>td]:py-2.5">
                  <TableCell>
                    {getReportNameParts(report).reportType ||
                      "Untitled Report"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {identifier || (
                      <span className="text-neutral-400 dark:text-neutral-500">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isCritical ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                        <AlertTriangle className="w-3 h-3" />
                        Critical
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
                        Normal
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(report.status)}
                      {renderFlaggedBadge(report.id)}
                      {(actionItemCounts[report.id] || 0) > 0 && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded-none text-xs font-semibold bg-brand/10 text-brand whitespace-nowrap"
                          title="Open action items: not yet formally notified to the customer"
                        >
                          {actionItemCounts[report.id]} action
                          {actionItemCounts[report.id] === 1 ? "" : "s"}
                        </span>
                      )}
                      {(fieldFlagCounts[report.id] || 0) > 0 && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded-none text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 whitespace-nowrap"
                          title="Fields the reviewer flagged for the tech to fix"
                        >
                          {fieldFlagCounts[report.id]}{" "}
                          {fieldFlagCounts[report.id] === 1
                            ? "field flagged"
                            : "fields flagged"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <EvaluationResultBadge
                      result={evaluationsByReport[report.id]}
                      fallback={<span className="text-neutral-400">-</span>}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(report.submitted_at)}
                  </TableCell>
                  {showApproved && (
                    <TableCell className="whitespace-nowrap">
                      {report.approved_at ? formatDate(report.approved_at) : "-"}
                    </TableCell>
                  )}
                  {showSent && (
                    <TableCell className="whitespace-nowrap">
                      {report.sent_at ? formatDate(report.sent_at) : "-"}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewReport(report, navList)}
                        leftIcon={<Eye className="h-4 w-4" />}
                        className="border-none"
                      >
                        View
                      </Button>
                      {isPdfReport(report) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPdfReport(report)}
                          title="Download/Print PDF"
                          leftIcon={<Download className="h-4 w-4" />}
                        >
                          {isApprovedTab ? "Print" : "Download"}
                        </Button>
                      )}
                      {isPdfReport(report) &&
                        report.status === "submitted" &&
                        userPermissions.canApprove && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprovePdfReport(report, null)}
                            className="border-none text-green-600 hover:text-green-700"
                            leftIcon={<CheckCircle className="h-4 w-4" />}
                          >
                            Approve
                          </Button>
                        )}
                      {showStatusButton && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (report.status === "approved") {
                              handleMarkAsSent(report);
                            } else if (report.status === "sent") {
                              handleMarkAsApproved(report);
                            }
                          }}
                          className={`border-none ${
                            report.status === "approved"
                              ? "text-blue-600 hover:text-blue-700"
                              : "text-red-600 hover:text-red-700"
                          }`}
                          leftIcon={<Send className="h-4 w-4" />}
                        >
                          {report.status === "approved"
                            ? "Mark as Sent"
                            : "Unsend"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {report.review_comments && (
                  <TableRow className="border-neutral-100 hover:bg-transparent dark:border-neutral-800 dark:hover:bg-transparent">
                    <TableCell colSpan={columnCount} className="px-3 pb-2.5 pt-0">
                      <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-dark-200 dark:text-neutral-300">
                        {report.review_comments}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const isManager =
    user?.user_metadata?.role === "Manager" ||
    user?.user_metadata?.role === "Admin";

  // Generate PDF report
  const generatePDF = (report: TechnicalReport) => {
    try {
      const doc = new jsPDF();

      // Add header with logo (would need to import logo)
      // doc.addImage(logo, 'PNG', 10, 10, 50, 15);

      // Add title
      doc.setFontSize(20);
      doc.text("Technical Report", 105, 20, { align: "center" });

      doc.setFontSize(16);
      doc.text(report.title, 105, 30, { align: "center" });

      // Add metadata
      doc.setFontSize(12);
      doc.text(`Report ID: ${report.id}`, 14, 45);
      doc.text(`Type: ${report.report_type}`, 14, 55);
      doc.text(`Status: ${report.status.toUpperCase()}`, 14, 65);
      doc.text(`Submitted: ${formatDate(report.submitted_at)}`, 14, 75);

      if (report.reviewed_at && report.reviewed_by) {
        doc.text(`Reviewed: ${formatDate(report.reviewed_at)}`, 14, 85);
        doc.text(
          `Reviewer: ${
            typeof report.reviewed_by === "object"
              ? (report.reviewed_by as any)?.display_name || "Unknown"
              : "Unknown"
          }`,
          14,
          95,
        );
      }

      // Add revision history
      doc.setFontSize(14);
      doc.text("Revision History", 14, 115);

      const revisionData = report.revision_history.map((rev) => [
        `v${rev.version}`,
        rev.status,
        formatDate(rev.timestamp),
        rev.user_name || "Unknown",
      ]);

      (doc as any).autoTable({
        startY: 120,
        head: [["Version", "Status", "Date", "User"]],
        body: revisionData,
      });

      // Add report data
      const reportDataY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFontSize(14);
      doc.text("Report Details", 14, reportDataY);

      // Format report data as needed
      let reportTextY = reportDataY + 10;
      const reportDataStr = JSON.stringify(report.report_data, null, 2);
      const reportLines = reportDataStr.split("\n");

      doc.setFontSize(10);
      reportLines.forEach((line, index) => {
        if (reportTextY > 280) {
          doc.addPage();
          reportTextY = 20;
        }
        doc.text(line, 14, reportTextY);
        reportTextY += 5;
      });

      // Add approval signature for approved reports
      if (report.status === "approved") {
        doc.addPage();
        doc.setFontSize(14);
        doc.text("Approval Certification", 105, 20, { align: "center" });

        doc.setFontSize(12);
        doc.text(
          "This report has been reviewed and approved according to",
          105,
          40,
          { align: "center" },
        );
        doc.text("company standards and procedures.", 105, 50, {
          align: "center",
        });

        doc.text(
          `Approved by: ${
            typeof report.reviewed_by === "object"
              ? (report.reviewed_by as any)?.display_name || "Unknown"
              : "Unknown"
          }`,
          105,
          70,
          { align: "center" },
        );
        doc.text(`Approval date: ${formatDate(report.reviewed_at)}`, 105, 80, {
          align: "center",
        });

        // Add signature line
        doc.line(60, 100, 150, 100);
        doc.text("Authorized Signature", 105, 110, { align: "center" });
      }

      // Save the PDF
      doc.save(`Report_${report.id}_${report.title.replace(/\s+/g, "_")}.pdf`);

      toast({
        title: "Success",
        description: "Report PDF has been generated and downloaded",
        variant: "success",
      });
    } catch (err) {
      console.error("Error generating PDF:", err);
      toast({
        title: "Error",
        description: "Failed to generate PDF report",
        variant: "destructive",
      });
    }
  };

  // Customize the UI based on whether we're showing all reports or just job-specific reports
  const isJobSpecific = !!jobId;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          Report Approvals
        </h2>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          leftIcon={<RotateCw className="h-5 w-5" />}
        >
          <span className="text-md mr-2">Refresh</span>
        </Button>
      </div>

      {/* Metrics Summary Cards - Only show if not job-specific */}
      {!isJobSpecific && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Pending Approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {metrics.submitted}
                <span className="text-sm text-neutral-500 font-normal ml-2">
                  reports
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {metrics.approved}
                <span className="text-sm text-neutral-500 font-normal ml-2">
                  reports
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {metrics.sent}
                <span className="text-sm text-neutral-500 font-normal ml-2">
                  reports
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {metrics.rejected}
                <span className="text-sm text-neutral-500 font-normal ml-2">
                  reports
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}

      {/* Tabs for report status filter */}
      <Tabs
        defaultValue="pending"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList className="inline-flex h-auto flex-wrap bg-neutral-100 dark:bg-dark-150 p-1.5 rounded-none gap-1">
          <TabsTrigger
            value="pending"
            className="px-6 py-2.5 rounded-none text-sm font-medium text-neutral-700 dark:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Clock className="mr-2 h-4 w-4" />
            Pending Approval
          </TabsTrigger>

          <TabsTrigger
            value="approved"
            className="px-6 py-2.5 rounded-none text-sm font-medium text-neutral-700 dark:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Approved
          </TabsTrigger>
          <TabsTrigger
            value="sent"
            className="px-6 py-2.5 rounded-none text-sm font-medium text-neutral-700 dark:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Send className="mr-2 h-4 w-4" />
            Sent
            {renderFlagAlertIndicator(
              sentOpenFlagCount,
              "on sent reports needing attention",
            )}
          </TabsTrigger>
          <TabsTrigger
            value="rejected"
            className="px-6 py-2.5 rounded-none text-sm font-medium text-neutral-700 dark:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Rejected
          </TabsTrigger>
          <TabsTrigger
            value="accepted"
            className="px-6 py-2.5 rounded-none text-sm font-medium text-neutral-700 dark:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <UserCheck className="mr-2 h-4 w-4" />
            Accepted
          </TabsTrigger>
          <TabsTrigger
            value="archived"
            className="px-6 py-2.5 rounded-none text-sm font-medium text-neutral-700 dark:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:text-neutral-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Trash className="mr-2 h-4 w-4" />
            Archived
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-10">
              <div className="flex justify-center py-6">
                <LoadingSpinner size="md" />
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <p>{error}</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-10 border rounded-none">
              <h3 className="mt-2 text-sm font-medium text-neutral-900">
                No reports found
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                There are no reports with the current filter criteria.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <label
                  htmlFor="report-sort"
                  className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Sort by
                </label>
                <select
                  id="report-sort"
                  value={`${sortBy}_${sortDirection}`}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Split on last underscore only (submission_date has an underscore)
                    const lastUnderscore = v.lastIndexOf("_");
                    const by = v.slice(0, lastUnderscore) as SortByOption;
                    const dir = v.slice(lastUnderscore + 1) as "asc" | "desc";
                    if (
                      by &&
                      (by === "submission_date" ||
                        by === "alphabetical" ||
                        by === "substation") &&
                      (dir === "asc" || dir === "desc")
                    ) {
                      setSort({ by, dir });
                    }
                  }}
                  className="rounded-none border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm min-w-[220px]"
                >
                  <option value="submission_date_asc">
                    Submission date (oldest first)
                  </option>
                  <option value="submission_date_desc">
                    Submission date (newest first)
                  </option>
                  <option value="alphabetical_asc">
                    Asset Identifier (A–Z)
                  </option>
                  <option value="alphabetical_desc">
                    Asset Identifier (Z–A)
                  </option>
                  <option value="substation_asc">Substation (A–Z)</option>
                  <option value="substation_desc">Substation (Z–A)</option>
                </select>
              </div>
              {(() => {
                // In job context, group like Linked Assets: Imported, numeric folders, Other
                if (jobId) {
                  const assetsMap: Record<
                    string,
                    {
                      name?: string;
                      file_url?: string;
                      urgency?: "normal" | "critical";
                    }[]
                  > = (window as any).__reportApprovalAssetsMap || {};
                  const getFolder = (r: TechnicalReport): string => {
                    // Prefer grouping by Substation/Location from report_data (match Job Details Reports tab)
                    try {
                      const data: any = (r as any).report_data || {};
                      const candidates: Array<any> = [
                        data?.report_info?.substation,
                        data?.report_info?.location,
                        data?.report_info?.jobInfo?.substation,
                        data?.report_info?.job_info?.substation,
                        data?.reportInfo?.substation,
                        data?.reportInfo?.location,
                        data?.reportInfo?.jobInfo?.substation,
                        data?.job_info?.substation,
                        data?.job_info?.location,
                        data?.jobInfo?.substation,
                        data?.jobInfo?.location,
                        data?.substation,
                        data?.location,
                        data?.data?.report_info?.substation,
                        data?.data?.report_info?.location,
                        data?.data?.reportInfo?.substation,
                        data?.data?.reportInfo?.location,
                        data?.data?.job_info?.substation,
                        data?.data?.jobInfo?.substation,
                        data?.data?.substation,
                        data?.data?.location,
                      ];
                      const found = candidates.find(
                        (v) => typeof v === "string" && v.trim(),
                      );
                      if (typeof found === "string") {
                        return found.trim();
                      }
                    } catch (_) {}

                    // If we have pre-resolved substation from underlying report rows, use it
                    const pre = reportSubstations[r.id];
                    if (typeof pre === "string" && pre.trim())
                      return pre.trim();

                    // Fallbacks: mark Imported if any linked asset indicates import; else Other
                    const linked = assetsMap[r.id] || [];
                    if (linked.length > 0) {
                      const primary = linked[0];
                      const imported =
                        /import/i.test(primary?.name || "") ||
                        /import/i.test(primary?.file_url || "");
                      if (imported) return "Imported";
                    }
                    return "Other";
                  };
                  const groups: Record<string, TechnicalReport[]> = {};
                  sortedReports.forEach((r) => {
                    const key = getFolder(r);
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(r);
                  });
                  const orderKeys = Object.keys(groups).sort(
                    compareLinkedAssetFolderLabels,
                  );
                  // Every report in folder order, so Prev / Next crosses substations.
                  const allInOrder = orderKeys.flatMap((k) => groups[k]);
                  return (
                    <>
                      {hasMoreReports && (
                        <div className="flex justify-center py-3 mb-2 rounded-none border border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-dark-200">
                          <Button
                            variant="outline"
                            onClick={() => fetchReports(reportsOffset)}
                            disabled={loadingMore}
                            className="min-w-[200px] bg-white dark:bg-dark-150"
                          >
                            {loadingMore ? (
                              <>
                                <RotateCw className="h-4 w-4 mr-2 animate-spin inline-block" />
                                <LoadingSpinner size="md" />
                              </>
                            ) : (
                              <>Load next 500 reports</>
                            )}
                          </Button>
                        </div>
                      )}
                      {orderKeys.map((folderKey) => (
                        <details
                          key={folderKey}
                          className="group border rounded-none overflow-hidden"
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
                            {renderReportTable(groups[folderKey], assetsMap, allInOrder)}
                          </div>
                        </details>
                      ))}
                      {hasMoreReports && (
                        <div className="flex justify-center pt-4 pb-2">
                          <Button
                            variant="outline"
                            onClick={() => fetchReports(reportsOffset)}
                            disabled={loadingMore}
                            className="min-w-[180px]"
                          >
                            {loadingMore ? (
                              <>
                                <RotateCw className="h-4 w-4 mr-2 animate-spin inline-block" />
                                <LoadingSpinner size="md" />
                              </>
                            ) : (
                              <>Load next 500 reports</>
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  );
                }
                // Global view fallback
                const globalAssetsMap: Record<
                  string,
                  {
                    name?: string;
                    file_url?: string;
                    urgency?: "normal" | "critical";
                  }[]
                > = (window as any).__reportApprovalAssetsMap || {};
                return (
                  <div
                    key={`list-${sortBy}-${sortDirection}`}
                    className="space-y-2"
                  >
                    {hasMoreReports && (
                      <div className="flex justify-center py-3 mb-2 rounded-none border border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-dark-200">
                        <Button
                          variant="outline"
                          onClick={() => fetchReports(reportsOffset)}
                          disabled={loadingMore}
                          className="min-w-[200px] bg-white dark:bg-dark-150"
                        >
                          {loadingMore ? (
                            <>
                              <RotateCw className="h-4 w-4 mr-2 animate-spin inline-block" />
                              <LoadingSpinner size="md" />
                            </>
                          ) : (
                            <>Load next 500 reports</>
                          )}
                        </Button>
                      </div>
                    )}
                    <div className="border bg-white dark:bg-dark-150">
                      {renderReportTable(sortedReports, globalAssetsMap)}
                    </div>
                    {hasMoreReports && (
                      <div className="flex justify-center pt-4 pb-2">
                        <Button
                          variant="outline"
                          onClick={() => fetchReports(reportsOffset)}
                          disabled={loadingMore}
                          className="min-w-[180px]"
                        >
                          {loadingMore ? (
                            <>
                              <RotateCw className="h-4 w-4 mr-2 animate-spin inline-block" />
                              <LoadingSpinner size="md" />
                            </>
                          ) : (
                            <>Load next 500 reports</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      {selectedReport && (
        <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Review Report: {selectedReport.title}</DialogTitle>
              <DialogDescription>
                Review and set the approval status for this report.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-1">Report Status</h4>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant={
                        reviewStatus === "approved" ? "secondary" : "outline"
                      }
                      onClick={() => setReviewStatus("approved")}
                      className="flex-1" leftIcon={<CheckCircle className="h-4 w-4" />}>
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant={
                        reviewStatus === "rejected" ? "secondary" : "outline"
                      }
                      onClick={() => setReviewStatus("rejected")}
                      className="flex-1" leftIcon={<XCircle className="h-4 w-4" />}>
                      Reject
                    </Button>
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-1">Review Comments</h4>
                  <Textarea
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    placeholder={
                      reviewStatus === "rejected"
                        ? "Explanation for rejection is required..."
                        : "Add comments about this report..."
                    }
                    rows={4}
                    required={reviewStatus === "rejected"}
                  />
                  {reviewStatus === "rejected" && !reviewComments && (
                    <p className="text-sm text-red-500 mt-1">
                      Comments are required when rejecting a report
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowReviewDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={submitReview}
                    disabled={
                      isLoading ||
                      (reviewStatus === "rejected" && !reviewComments)
                    }
                  >
                    Submit Review
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={!!selectedFlagReportId}
        onOpenChange={(open) => {
          if (!open) setSelectedFlagReportId(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-yellow-600" />
              Customer Flag Notes
            </DialogTitle>
            <DialogDescription>
              {selectedFlagReport?.title || "This report"} has been flagged by a
              customer and needs staff attention.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {selectedFlags.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No open flag notes were found for this report.
              </p>
            ) : (
              selectedFlags.map((flag) => (
                <div
                  key={flag.id}
                  className="rounded-none border border-yellow-200 bg-yellow-50 p-3 text-sm dark:border-yellow-900/60 dark:bg-yellow-950/30"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                    <span>Flagged by {flag.flagged_by || "customer"}</span>
                    <span>{formatDate(flag.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-neutral-900 dark:text-neutral-100">
                    {flag.reason || "No note provided."}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedFlagReportId(null)}
            >
              Close
            </Button>
            {userPermissions.canReview &&
              selectedFlagReportId &&
              selectedFlags.length > 0 && (
                <Button
                  type="button"
                  onClick={async () => {
                    await handleResolveFlags(selectedFlagReportId);
                    setSelectedFlagReportId(null);
                  }}
                >
                  Resolve Flag{selectedFlags.length === 1 ? "" : "s"}
                </Button>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
