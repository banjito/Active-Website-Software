import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { computeTravelTotals } from "../../lib/travelExpenses";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Edit,
  Award,
  X,
  ChevronDown,
  Pencil,
  Save,
  Trash2,
  Upload,
  FileText,
  Download,
  Eye,
  ExternalLink,
  Copy,
  Settings,
  Building2,
  FilePlus2,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { Dialog } from "@headlessui/react";
import { format } from "date-fns";
import {
  supabase,
  ensureValidSession,
  isCookieAuthError,
  isAuthError,
} from "../../lib/supabase";
import { withPgTimeoutRetry } from "@/lib/retryPgTimeout";
import { useAuth } from "../../lib/AuthContext";
import {
  Opportunity,
  OpportunityFormData,
  SubcontractorAgreement,
} from "../../lib/types/index";
import EstimateSheet from "../estimates/EstimateSheet";
import { Button } from "@/components/ui/Button";
import { useJobDetails } from "../../lib/hooks/useJobDetails";
import { DivisionAnalyticsDialog } from "../analytics/DivisionAnalyticsDialog";
import { SupabaseClient } from "@supabase/supabase-js";
import { addDefaultFilesToJob } from "../../lib/services/defaultJobFiles";
import { PDFEditor } from "../pdf/PDFEditor";
import OpportunityNotes from "./OpportunityNotes";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import CopyEstimateToOpportunityModal, {
  type CopyTargetOpportunity,
} from "../estimates/CopyEstimateToOpportunityModal";
import { toast } from "../ui/toast";

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface CustomerInfo {
  id: string;
  name: string;
  company_name?: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  customer_id: string;
}

interface OpportunityWithCustomer extends Opportunity {
  customers: CustomerInfo | null;
  proposal_due_date?: string | null;
  estimated_end_date?: string | null;
  quoted_amount?: number | null;
}

interface AdjacentOpportunityIds {
  previous: string | null;
  next: string | null;
}

function formatOpportunityCreator(
  profile: any,
  fallbackEmail?: string | null,
): string | null {
  const name = profile?.full_name || profile?.name || profile?.display_name;
  if (typeof name === "string" && name.trim()) return name.trim();

  const email = profile?.email || fallbackEmail;
  if (typeof email === "string" && email.trim()) return email.trim();

  return null;
}

const initialFormData: OpportunityFormData = {
  customer_id: "",
  contact_id: null,
  title: "",
  description: "",
  status: "awareness",
  expected_value: "",
  probability: "0",
  opportunity_created_date: "",
  letter_proposal_date: "",
  proposal_due_date: "",
  notes: "",
  sales_person: "",
  amp_division: "",
  quoted_amount: "",
  selected_letter_proposal: "",
  reviewed_by: "",
  prepared_by: "",
  jobsite_location: "",
  estimated_start_date: "",
  estimated_end_date: "",
  period_of_performance: "",
  total_man_hours: "0",
  opportunity_type: "other",
};

// Add this utility function to handle date formatting consistently
function formatDateSafe(dateString: string | null | undefined): string {
  if (!dateString) return "Not specified";

  // For YYYY-MM-DD format strings, parse them in a timezone-safe way
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    // Split the date parts and construct a new date
    const [year, month, day] = dateString.split("-").map(Number);
    // Note: month is 0-indexed in JavaScript Date
    return format(new Date(year, month - 1, day), "MMM d, yyyy");
  }

  // For ISO strings or other formats, use a different approach
  // Add 12 hours to avoid timezone day boundary issues
  const date = new Date(dateString);
  date.setHours(12, 0, 0, 0);
  return format(date, "MMM d, yyyy");
}

function parseMoneyValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100) / 100;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 100) / 100;
    }
  }

  return null;
}

function extractNet30FromLetterHtml(
  html: string | null | undefined,
): number | null {
  if (!html) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const grandElement = doc.querySelector('.grand-price[data-kind="net30"]');
    const grandAmount = parseMoneyValue(
      grandElement?.getAttribute("data-base"),
    );
    if (grandAmount) return grandAmount;

    const headers = Array.from(doc.querySelectorAll("b"));
    const grandHeader = headers.find(
      (el) => (el.textContent || "").trim() === "Grand Total Pricing",
    );
    if (grandHeader) {
      const block =
        grandHeader.closest(".amp-scope-block") ||
        grandHeader.parentElement?.parentElement ||
        grandHeader.parentElement;
      const liNet30 = block
        ? Array.from(block.querySelectorAll("li")).find((li) =>
            /NET\s*30/i.test(li.textContent || ""),
          )
        : null;
      const match = (liNet30?.textContent || "").match(/\$([0-9,]+\.?[0-9]*)/);
      const amount = parseMoneyValue(match?.[1]);
      if (amount) return amount;
    }

    const scopePrices = Array.from(
      doc.querySelectorAll('.scope-price[data-kind="net30"]'),
    );
    if (scopePrices.length > 0) {
      let sum = 0;
      scopePrices.forEach((el) => {
        const base = parseMoneyValue(el.getAttribute("data-base")) || 0;
        const block =
          el.closest(".amp-section")?.parentElement || el.parentElement;
        let qtyEl = block?.querySelector(
          "input.scope-qty",
        ) as HTMLInputElement | null;
        if (!qtyEl)
          qtyEl = doc.querySelector(
            "input.scope-qty",
          ) as HTMLInputElement | null;
        const qtyRaw = qtyEl?.getAttribute("value") || qtyEl?.value || "1";
        const qty = Math.max(1, parseInt(qtyRaw || "1", 10) || 1);
        sum += base * qty;
      });
      const amount = parseMoneyValue(sum);
      if (amount) return amount;
    }

    let best = 0;
    Array.from(doc.querySelectorAll("li")).forEach((li) => {
      if (/NET\s*30/i.test(li.textContent || "")) {
        const match = (li.textContent || "").match(/\$([0-9,]+\.?[0-9]*)/);
        const amount = parseMoneyValue(match?.[1]) || 0;
        if (amount > best) best = amount;
      }
    });

    return parseMoneyValue(best);
  } catch (error) {
    console.error("Error extracting NET 30 amount from letter:", error);
    return null;
  }
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getEstimateTravelData(estimateData: any): any {
  return estimateData?.travel_data || estimateData?.travelData || {};
}

function getEstimateMobilizationFactor(
  finalValue: number,
  estimateData: any,
): number {
  const factors = estimateData?.mobilizationFactors || {};
  if (finalValue > 1000000) return toNumber(factors.over1m) || 0.05;
  if (finalValue > 500000) return toNumber(factors.over500k) || 0.05;
  if (finalValue > 100000) return toNumber(factors.over100k) || 0.1;
  return toNumber(factors.base);
}

function calculateEstimateNet30Amount(estimateData: any): number | null {
  if (!estimateData) return null;

  const directAmount =
    parseMoneyValue(estimateData?.net30) ||
    parseMoneyValue(estimateData?.net_30) ||
    parseMoneyValue(estimateData?.quoted_amount) ||
    parseMoneyValue(estimateData?.quotedAmount);
  if (directAmount) return directAmount;

  const calculatedValues = estimateData.calculatedValues || {};
  const hoursSummary = estimateData.hoursSummary || {};
  const hourlyRates = estimateData.hourlyRates || {};
  const paymentTermFactors = estimateData.paymentTermFactors || {};
  const travelData = getEstimateTravelData(estimateData);
  const materialMarkup = toNumber(estimateData.materialMarkup) || 1.3;

  const straightTimeRate = toNumber(hourlyRates.straightTime) || 240;
  const overtimeRate = toNumber(hourlyRates.overtime) || 360;
  const doubleTimeRate = toNumber(hourlyRates.doubleTime) || 480;

  const travelNonLabor = computeTravelTotals(travelData).nonLaborCost;

  const travelLabor =
    toNumber(hoursSummary.travelStraightTimeHours) * straightTimeRate +
    toNumber(hoursSummary.travelOvertimeHours) * overtimeRate +
    toNumber(hoursSummary.travelDoubleTimeHours) * doubleTimeRate;

  const workLabor =
    toNumber(hoursSummary.straightTimeHours) * straightTimeRate +
    toNumber(hoursSummary.overtimeHours) * overtimeRate +
    toNumber(hoursSummary.doubleTimeHours) * doubleTimeRate;

  const materialExpenseBase =
    toNumber(calculatedValues.totalMaterial) * 1.09 * materialMarkup +
    toNumber(calculatedValues.totalExpense) * 1.09 +
    toNumber(calculatedValues.nonSovExpense);

  const baseValue =
    materialExpenseBase + workLabor + travelLabor + travelNonLabor;
  if (baseValue <= 0) return parseMoneyValue(calculatedValues.grandTotal);

  const finalValue = Math.ceil(baseValue / 0.96);
  const net30Factor = toNumber(paymentTermFactors.net30) || 1;
  const mobilization = Math.ceil(
    finalValue * getEstimateMobilizationFactor(finalValue, estimateData),
  );

  return parseMoneyValue(Math.ceil(finalValue * net30Factor) + mobilization);
}

// Add this function after the imports but before the component definition
// Helper function to extract quoted amount from letter proposal HTML (same logic as display)
async function extractQuotedAmountFromLetterProposal(
  letterProposalId: string | null,
  opportunityId: string,
  supabase: SupabaseClient<any, "common" | "public", any>,
): Promise<number | null> {
  if (!letterProposalId) return null;

  try {
    const { data: letter, error } = await supabase
      .schema("business")
      .from("letter_proposals")
      .select("html")
      .eq("id", letterProposalId)
      .maybeSingle();

    if (error || !letter?.html) return null;

    return extractNet30FromLetterHtml(letter.html);
  } catch (e) {
    console.error("Error extracting quoted amount from letter proposal:", e);
    return null;
  }
}

async function createJobManually(
  opportunity: any,
  supabase: SupabaseClient<any, "common" | "public", any>,
  userId: string,
): Promise<string> {
  if (!opportunity) {
    throw new Error("Cannot create job: opportunity data is missing");
  }

  if (!opportunity.customer_id) {
    throw new Error("Cannot create job: customer_id is required");
  }

  if (!userId) {
    throw new Error("Cannot create job: user ID is missing");
  }

  // Check if a job already exists for this opportunity (prevent duplicates)
  const { data: existingJob } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("id")
    .eq("opportunity_id", opportunity.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingJob) {
    console.warn("Job already exists for this opportunity:", existingJob.id);
    // Update the opportunity to link to the existing job if not already linked
    try {
      const { data: oppData } = await supabase
        .schema("business")
        .from("opportunities")
        .select("job_id")
        .eq("id", opportunity.id)
        .maybeSingle();

      if (!oppData?.job_id) {
        await supabase
          .schema("business")
          .from("opportunities")
          .update({ job_id: existingJob.id, status: "awarded" })
          .eq("id", opportunity.id);
      }
    } catch (e) {
      console.error("Error updating opportunity with existing job:", e);
    }
    return existingJob.id;
  }

  // Determine next job number: try DB RPC first, then fall back to client scan
  // RPC returns bigint which may be number or string in JSON
  let nextJobNumberNumeric = 26001; // default if both paths fail
  let gotFromRpc = false;
  try {
    const { data: fnResult, error: fnError } = await withPgTimeoutRetry<any>(
      () => supabase.rpc("get_max_job_number"),
      { maxAttempts: 2 },
    );
    if (fnError) throw fnError;
    const raw = Array.isArray(fnResult) ? (fnResult[0] as any) : fnResult;
    const value =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw)
          ? parseInt(raw, 10)
          : typeof (raw as any)?.get_max_job_number === "number"
            ? (raw as any).get_max_job_number
            : null;
    if (value != null && Number.isFinite(value)) {
      nextJobNumberNumeric = value < 26000 ? 26001 : value + 1;
      gotFromRpc = true;
    }
  } catch {}
  // Whenever RPC didn't return a valid value, use client-side max from jobs table
  if (!gotFromRpc) {
    try {
      const { data: jobsScan } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("job_number")
        .limit(2000);
      const nums = (jobsScan || [])
        .map((j: any) => j?.job_number)
        .filter((s: any) => s != null && s !== "")
        .map((s: any) => {
          const str = typeof s === "string" ? s : String(s);
          if (/^[0-9]+$/.test(str)) return parseInt(str, 10);
          const digits = str.replace(/\D/g, "");
          return digits ? parseInt(digits, 10) : 0;
        })
        .filter((n: number) => Number.isFinite(n));
      const maxLocal = nums.length ? Math.max(...nums) : 0;
      nextJobNumberNumeric = maxLocal < 26000 ? 26001 : maxLocal + 1;
    } catch {}
  }
  const nextJobNumberString = String(nextJobNumberNumeric);

  // Get quoted amount - try letter proposal first (selected or first available), then fallback to manually entered value
  // This matches the display logic on the opportunity detail page
  let quotedAmount: number | null = null;

  // First, try selected letter proposal
  let letterProposalId = opportunity.selected_letter_proposal;

  // If no selected letter proposal, try to get the first/most recent one (matching display logic)
  if (!letterProposalId) {
    try {
      const { data: letters } = await supabase
        .schema("business")
        .from("letter_proposals")
        .select("id")
        .eq("opportunity_id", opportunity.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (letters && letters.length > 0) {
        letterProposalId = letters[0].id;
      }
    } catch (e) {
      console.error("Error fetching letter proposals:", e);
    }
  }

  // Extract amount from letter proposal if available
  if (letterProposalId) {
    const letterAmount = await extractQuotedAmountFromLetterProposal(
      letterProposalId,
      opportunity.id,
      supabase,
    );
    if (letterAmount && letterAmount > 0) {
      quotedAmount = letterAmount;
    }
  }

  // Fallback to manually entered quoted_amount if no letter proposal value found
  if (
    !quotedAmount &&
    opportunity.quoted_amount &&
    Number(opportunity.quoted_amount) > 0
  ) {
    quotedAmount = Number(opportunity.quoted_amount);
  }

  // Re-check for existing job right before insert (prevents race from double-submit)
  const { data: recheck } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("id")
    .eq("opportunity_id", opportunity.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (recheck?.id) {
    return recheck.id;
  }

  // Create the job in neta_ops schema, using quoted_amount from opportunity as budget
  const jobPayload = {
    user_id: userId,
    customer_id: opportunity.customer_id,
    title: opportunity.title,
    description: opportunity.description,
    status: "pending",
    start_date:
      (opportunity as any).estimated_start_date ||
      new Date().toISOString().substring(0, 10),
    due_date: (opportunity as any).estimated_end_date || null,
    site_address: (opportunity as any).jobsite_location || "",
    budget: quotedAmount,
    notes:
      (opportunity.notes || "") +
      "\n\nConverted from opportunity: " +
      opportunity.quote_number,
    priority: "medium",
    division:
      opportunity.amp_division === "Decatur"
        ? "north_alabama"
        : opportunity.amp_division,
    job_number: nextJobNumberString,
    opportunity_id: opportunity.id, // Add the opportunity link
  };

  const { data: newJob, error: jobError } = await withPgTimeoutRetry<{
    id: string;
  }>(() =>
    supabase
      .schema("neta_ops")
      .from("jobs")
      .insert(jobPayload)
      .select("id")
      .single(),
  );

  if (jobError || !newJob) {
    console.error("Manual job creation error:", jobError);
    throw new Error(
      `Manual job creation failed: ${
        jobError?.message || "Job insert returned no row"
      }`,
    );
  }

  try {
    // First check if job_id column exists in business.opportunities
    const { error: checkError } = await supabase
      .schema("business")
      .from("opportunities")
      .select("job_id")
      .limit(1);

    if (checkError) {
      // Column doesn't exist - log warning but don't fail
      console.warn(
        "Warning: job_id column not found in opportunities table:",
        checkError.message,
      );
      console.warn(
        "Job was created successfully but opportunity could not be linked to it.",
      );
    } else {
      // Column exists, so update the opportunity in business schema
      const { error: updateError } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ job_id: newJob.id })
        .eq("id", opportunity.id);

      if (updateError) {
        console.error("Opportunity update error:", updateError);
        // Don't throw, just log the error
        console.warn(
          "Job was created successfully but opportunity could not be linked to it.",
        );
      }
    }
  } catch (error) {
    console.error("Error updating opportunity:", error);
    // Don't throw, just log the error
    console.warn(
      "Job was created successfully but opportunity could not be linked to it.",
    );
  }

  // Add default files to the newly created job
  try {
    const division =
      opportunity.amp_division === "Decatur"
        ? "north_alabama"
        : opportunity.amp_division;
    await addDefaultFilesToJob(newJob.id, userId, division);
    console.log("Default files added successfully to job:", newJob.id);
  } catch (fileError) {
    console.error("Error adding default files to job:", fileError);
    // Don't fail the job creation if default files fail
    console.warn(
      "Job was created successfully but some default files could not be added",
    );
  }

  return newJob.id;
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const mergedIdsParam = search.get("ids");
  const primaryIdParam = search.get("primary");
  const mergedIds = mergedIdsParam
    ? mergedIdsParam.split(",").filter(Boolean)
    : [];
  const { user, softRefresh } = useAuth();
  const [opportunity, setOpportunity] =
    useState<OpportunityWithCustomer | null>(null);
  const [adjacentOpportunityIds, setAdjacentOpportunityIds] =
    useState<AdjacentOpportunityIds>({ previous: null, next: null });
  const [opportunityCreator, setOpportunityCreator] = useState<string | null>(
    null,
  );
  const [quotePreparedBy, setQuotePreparedBy] = useState<string | null>(null);
  const [mergedList, setMergedList] = useState<OpportunityWithCustomer[]>([]);
  const [groupLockJobId, setGroupLockJobId] = useState<string | null>(null);
  const [savedMergeIds, setSavedMergeIds] = useState<string[]>([]);
  const [savedPrimaryId, setSavedPrimaryId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] =
    useState<OpportunityFormData>(initialFormData);
  const [confirmConvertToJobOpen, setConfirmConvertToJobOpen] = useState(false);
  const [letterPickerOpen, setLetterPickerOpen] = useState(false);
  const [isSavingLetterSelection, setIsSavingLetterSelection] = useState(false);
  const [isConvertingToJob, setIsConvertingToJob] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isStatusEditing, setIsStatusEditing] = useState(false);
  const [isEstimateApprovalEditing, setIsEstimateApprovalEditing] =
    useState(false);
  const [isDocumentsStageEditing, setIsDocumentsStageEditing] = useState(false);
  const [isOpportunityTypeEditing, setIsOpportunityTypeEditing] =
    useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState<string | null>(
    null,
  );
  const [editFormData, setEditFormData] = useState<OpportunityFormData>({
    customer_id: "",
    contact_id: null,
    title: "",
    description: "",
    expected_value: "",
    status: "awareness",
    sales_person: "",
    notes: "",
    probability: "0",
    amp_division: "",
    quoted_amount: "",
    selected_letter_proposal: "",
    reviewed_by: "",
    prepared_by: "",
    jobsite_location: "",
    estimated_start_date: "",
    estimated_end_date: "",
    period_of_performance: "",
    total_man_hours: "0",
    opportunity_type: "other",
    documents_stage: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showJobDialog, setShowJobDialog] = useState(false);
  const [selectedLetterId, setSelectedLetterId] = useState<string>("");
  const [lettersForSelect, setLettersForSelect] = useState<
    Array<{ id: string; title: string; created_at: string }>
  >([]);
  const { jobDetails } = useJobDetails(jobId || undefined);
  const [showDivisionAnalytics, setShowDivisionAnalytics] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [showEstimate, setShowEstimate] = useState<
    "new" | "view" | "letter" | "letters" | "combined-letter" | false
  >(false);
  const [activeEstimateId, setActiveEstimateId] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  // Keep a ref in sync so the (id, showEstimate)-scoped estimateSaved listener
  // can read the latest draft state without re-subscribing on every toggle.
  const isDraftRef = useRef(false);
  useEffect(() => {
    isDraftRef.current = isDraft;
  }, [isDraft]);
  // Draft-estimate assignment flow: after a draft estimate is saved we prompt
  // the user to file it under an existing opportunity or promote this draft
  // into a brand-new one.
  const [showAssignDraftPrompt, setShowAssignDraftPrompt] = useState(false);
  const [showAssignExistingPicker, setShowAssignExistingPicker] =
    useState(false);
  const [isAssigningDraft, setIsAssigningDraft] = useState(false);

  const resolveQuotePreparedByNames = async (
    opportunityId: string,
    existingPreparedBy = "",
  ) => {
    const fallbackParts = existingPreparedBy
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    try {
      const { data: estimates, error } = await supabase
        .schema("business")
        .from("estimates")
        .select("user_id")
        .eq("opportunity_id", opportunityId);

      if (error) throw error;

      const userIds = [
        ...new Set(
          (estimates || []).map((est: any) => est.user_id).filter(Boolean),
        ),
      ];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .schema("common")
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

        const profileById = new Map(
          (profiles || []).map((profile: any) => [profile.id, profile]),
        );
        const names = userIds
          .map((estimateUserId: string) => {
            const currentUserFallback =
              estimateUserId === user?.id
                ? user?.user_metadata?.full_name ||
                  user?.user_metadata?.name ||
                  user?.email
                : null;
            return formatOpportunityCreator(
              profileById.get(estimateUserId),
              currentUserFallback,
            );
          })
          .filter(Boolean) as string[];

        if (names.length > 0) {
          return [...new Set(names)].join(", ");
        }
      }

      const emails = fallbackParts.filter((part) => part.includes("@"));
      if (emails.length > 0) {
        const { data: profiles } = await supabase
          .schema("common")
          .from("profiles")
          .select("full_name, email")
          .in("email", emails);

        const profileByEmail = new Map(
          (profiles || []).map((profile: any) => [
            String(profile.email || "").toLowerCase(),
            profile,
          ]),
        );

        const resolved = fallbackParts.map((part) => {
          const profile = profileByEmail.get(part.toLowerCase());
          return formatOpportunityCreator(profile, part) || part;
        });

        return [...new Set(resolved)].join(", ");
      }
    } catch (error) {
      console.error("Error resolving quote prepared by names:", error);
    }

    return fallbackParts.join(", ");
  };

  // Function to update prepared_by field based on estimate creators
  const updatePreparedByFromEstimates = async (
    opportunityId: string,
    existingPreparedBy = (opportunity as any)?.prepared_by || "",
  ) => {
    try {
      const preparedByValue = await resolveQuotePreparedByNames(
        opportunityId,
        existingPreparedBy,
      );
      setQuotePreparedBy(preparedByValue || null);

      if (preparedByValue) {
        // Update the opportunity's prepared_by field
        const { error: updateError } = await supabase
          .schema("business")
          .from("opportunities")
          .update({ prepared_by: preparedByValue })
          .eq("id", opportunityId);

        if (updateError) {
          console.error("Error updating prepared_by:", updateError);
        } else {
          console.log("Updated prepared_by:", preparedByValue);
        }
      }
    } catch (error) {
      console.error("Error in updatePreparedByFromEstimates:", error);
    }
  };

  // Load latest estimate approval status when viewing an opportunity
  useEffect(() => {
    if (id && opportunity?.id === id) {
      fetchLatestEstimateStatus(id);
    } else if (!id) {
      setLatestEstimateId(null);
      setEstimateApprovalStatus(null);
    }
  }, [id, opportunity?.id]);

  // Listen for estimate save events to update prepared_by field
  useEffect(() => {
    const handleEstimateSaved = (event: CustomEvent) => {
      const { opportunityId, estimateId, preparedBy } = event.detail || {};
      if (opportunityId === id) {
        if (typeof estimateId === "string") {
          setActiveEstimateId(estimateId);
        }

        if (typeof preparedBy === "string") {
          setQuotePreparedBy(preparedBy || null);
          setOpportunity((prev) =>
            prev
              ? ({
                  ...prev,
                  prepared_by: preparedBy,
                } as OpportunityWithCustomer)
              : prev,
          );
        }

        // Refresh estimate approval status so the dropdown reflects the latest estimate
        if (id) fetchLatestEstimateStatus(id);
        // Switch to view mode to show the saved estimate in read mode
        if (showEstimate === "new") {
          setShowEstimate("view");
        }

        // If this estimate was built from a fresh "New Estimate" draft, prompt
        // the user to assign it to an opportunity now that it exists.
        if (isDraftRef.current) {
          setShowAssignDraftPrompt(true);
        }
      }
    };

    const handleLetterProposalGenerated = (event: CustomEvent) => {
      const { opportunityId } = event.detail;
      if (opportunityId === id && id) {
        // Quiet save: refresh only the fields affected by saving a letter
        // proposal instead of calling fetchOpportunity(), which flips the
        // full-page loading spinner and feels like a page reload.
        (async () => {
          try {
            const { data, error } = await supabase
              .schema("business")
              .from("opportunities")
              .select(
                "letter_proposal_date, selected_letter_proposal, quoted_amount",
              )
              .eq("id", id)
              .single();
            if (!error && data) {
              setOpportunity((prev) =>
                prev ? ({ ...prev, ...data } as OpportunityWithCustomer) : prev,
              );
            }
            // Refresh the letter proposals list only when the list UI is open.
            // Saving a letter updates opportunity fields above; fetching the full
            // letters/estimates set while the editor is open causes visible churn.
            if (showEstimate === "letters") {
              await fetchLetterProposals(id);
            }
          } catch (e) {
            console.error("Error during quiet letter proposal refresh:", e);
          }
        })();
      }
    };

    window.addEventListener(
      "estimateSaved",
      handleEstimateSaved as EventListener,
    );
    window.addEventListener(
      "letterProposalGenerated",
      handleLetterProposalGenerated as EventListener,
    );

    return () => {
      window.removeEventListener(
        "estimateSaved",
        handleEstimateSaved as EventListener,
      );
      window.removeEventListener(
        "letterProposalGenerated",
        handleLetterProposalGenerated as EventListener,
      );
    };
    // fetchLetterProposals is intentionally omitted: it is a function declaration
    // recreated each render, and the handler only needs current id/showEstimate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, showEstimate]);

  // Clear any persisted estimate mode/draft when leaving the page
  useEffect(() => {
    return () => {
      try {
        if (id) {
          localStorage.removeItem(`estimate-last-mode-${id}`);
          localStorage.removeItem(`estimate-draft-${id}`);
          // Clean up letter proposal persistence when leaving the page
          localStorage.removeItem(`letter-proposal-draft-${id}`);
          localStorage.removeItem(`letter-proposal-open-${id}`);
          localStorage.removeItem(`letter-quote-index-${id}`);
          localStorage.removeItem(`letter-neta-standard-${id}`);
        }
        localStorage.removeItem("AMP_SUSPEND_REFRESH");
      } catch {}
    };
  }, [id]);
  const [estimateOpenSignal, setEstimateOpenSignal] = useState(0);
  const [subcontractorAgreements, setSubcontractorAgreements] = useState<
    SubcontractorAgreement[]
  >([]);
  const [showSubcontractorDialog, setShowSubcontractorDialog] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<SubcontractorAgreement | null>(
    null,
  );
  const [isEditingPDF, setIsEditingPDF] = useState(false);
  const [isSavingPDF, setIsSavingPDF] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [letterProposals, setLetterProposals] = useState<
    Array<{
      id: string;
      letter_number: string;
      net_30_price: number;
      opportunity_id: string;
      title?: string;
      html?: string;
    }>
  >([]);
  const [availableQuotes, setAvailableQuotes] = useState<
    Array<{
      id: string;
      title: string;
      totalManHours: number;
      data: any;
    }>
  >([]);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const [latestEstimateId, setLatestEstimateId] = useState<string | null>(null);
  const [estimateApprovalStatus, setEstimateApprovalStatus] = useState<
    string | null
  >(null);
  const [isSavingEstimateStatus, setIsSavingEstimateStatus] = useState(false);

  // Only fetch when ID or URL params change, use user ID instead of user object to prevent unnecessary re-renders
  const userId = user?.id;
  useEffect(() => {
    if (userId && id) {
      // Reset state when navigating to a different opportunity to prevent stale data
      setOpportunity(null);
      setAdjacentOpportunityIds({ previous: null, next: null });
      setOpportunityCreator(null);
      setQuotePreparedBy(null);
      setLoadError(null);
      setMergedList([]);
      setGroupLockJobId(null);
      setSavedMergeIds([]);
      setSavedPrimaryId(null);
      setJobId(null);
      setContacts([]);
      setSubcontractorAgreements([]);
      setLetterProposals([]);
      setAvailableQuotes([]);
      setSelectedQuoteIds([]);
      setShowEstimate(false);
      setActiveEstimateId(null);
      setIsEditing(false);

      fetchOpportunity();
      fetchCustomers();
    }
  }, [userId, id, mergedIdsParam, primaryIdParam]);

  useEffect(() => {
    if (opportunity?.id) {
      fetchAdjacentOpportunityIds(opportunity.id);
    } else {
      setAdjacentOpportunityIds({ previous: null, next: null });
    }
  }, [opportunity?.id]);

  // Listen for estimate mode reset events
  useEffect(() => {
    const handleResetEstimateMode = () => {
      setShowEstimate(false);
      setActiveEstimateId(null);
    };

    window.addEventListener("resetEstimateMode", handleResetEstimateMode);
    return () => {
      window.removeEventListener("resetEstimateMode", handleResetEstimateMode);
    };
  }, []);

  // Auto-open estimate editor when navigated with ?autoEstimate=true
  useEffect(() => {
    const autoEstimate = search.get("autoEstimate");
    const draftParam = search.get("isDraft");
    if (autoEstimate === "true" && opportunity && !loading && id) {
      setActiveEstimateId(null);
      setShowEstimate("new");
      setEstimateOpenSignal((s) => s + 1);
      if (draftParam === "true") {
        setIsDraft(true);
      }

      // Clean the URL params so they do not re-trigger on refresh
      const params = new URLSearchParams(location.search);
      params.delete("autoEstimate");
      params.delete("isDraft");
      const newSearch = params.toString();
      navigate(location.pathname + (newSearch ? "?" + newSearch : ""), {
        replace: true,
      });
    }
  }, [opportunity, loading, id]);

  // Read any existing merge lock for this group from localStorage
  useEffect(() => {
    if (id === "merge" && mergedIds.length > 0) {
      try {
        const key = `opportunity-merge-lock-${mergedIds.slice().sort().join(",")}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.jobId) {
            setGroupLockJobId(String(parsed.jobId));
          }
        }
      } catch {}
    }
  }, [id, mergedIdsParam]);

  useEffect(() => {
    if (opportunity) {
      console.log("Updating editFormData with opportunity:", {
        id: opportunity.id,
        title: opportunity.title,
      });

      // Determine opportunity_type - infer from quoted_amount if not set (matches list view behavior)
      let opportunityType = (opportunity as any).opportunity_type;
      if (!opportunityType) {
        const quotedAmount = (opportunity as any).quoted_amount;
        if (quotedAmount && Number(quotedAmount) > 0) {
          opportunityType =
            Number(quotedAmount) >= 100000
              ? "large_acceptance"
              : "small_acceptance";
        } else {
          opportunityType = "other";
        }
      }

      const nextEditFormData = {
        customer_id: opportunity.customer_id || "",
        title: opportunity.title || "",
        description: opportunity.description || "",
        expected_value: opportunity.expected_value?.toString() || "",
        status: opportunity.status || "",
        opportunity_created_date: opportunity.opportunity_created_date
          ? opportunity.opportunity_created_date.substring(0, 10)
          : "",
        letter_proposal_date: opportunity.letter_proposal_date
          ? opportunity.letter_proposal_date.substring(0, 10)
          : "",
        proposal_due_date: opportunity.proposal_due_date
          ? opportunity.proposal_due_date.substring(0, 10)
          : "",
        sales_person: opportunity.sales_person || "",
        notes: opportunity.notes || "",
        probability: opportunity.probability?.toString() || "0",
        amp_division: opportunity.amp_division || "",
        quoted_amount: (opportunity as any).quoted_amount?.toString() || "",
        selected_letter_proposal:
          (opportunity as any).selected_letter_proposal || "",
        reviewed_by: (opportunity as any).reviewed_by || "",
        prepared_by: (opportunity as any).prepared_by || "",
        jobsite_location: (opportunity as any).jobsite_location || "",
        estimated_start_date: (opportunity as any).estimated_start_date
          ? (opportunity as any).estimated_start_date.substring(0, 10)
          : "",
        estimated_end_date: (opportunity as any).estimated_end_date
          ? (opportunity as any).estimated_end_date.substring(0, 10)
          : "",
        period_of_performance: (opportunity as any).period_of_performance || "",
        total_man_hours:
          (opportunity as any).total_man_hours?.toString() || "0",
        opportunity_type: opportunityType,
        documents_stage: (opportunity as any).documents_stage || "",
      };

      setEditFormData((prev) =>
        JSON.stringify(prev) === JSON.stringify(nextEditFormData)
          ? prev
          : nextEditFormData,
      );
      // Fetch all documents for this opportunity
      (async () => {
        const { data: agreements, error } = await supabase
          .schema("business")
          .from("subcontractor_agreements")
          .select("*")
          .eq("opportunity_id", opportunity.id)
          .order("upload_date", { ascending: false });
        if (!error && agreements) {
          setSubcontractorAgreements((prev) =>
            JSON.stringify(prev) === JSON.stringify(agreements)
              ? prev
              : agreements,
          );
        }
      })();
    }
    // Only resync the edit form and documents when the selected opportunity changes;
    // live letter-save updates are handled directly to avoid full fetch churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity?.id]);

  useEffect(() => {
    if (showEstimate === "letters" && opportunity?.id) {
      fetchLetterProposals(opportunity.id);
    }
    // fetchLetterProposals is intentionally omitted to keep this effect keyed
    // only to the UI open state and selected opportunity id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEstimate, opportunity?.id]);

  async function fetchLetterProposals(opportunityId: string) {
    try {
      console.log("Fetching letter proposals for opportunity:", opportunityId);
      const { data, error } = await supabase
        .schema("business")
        .from("letter_proposals")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      console.log("Letter proposals fetched:", data);
      console.log("First letter proposal structure:", data?.[0]);
      const nextLetters = data || [];
      setLetterProposals((prev) =>
        JSON.stringify(prev) === JSON.stringify(nextLetters)
          ? prev
          : nextLetters,
      );

      // Also fetch quotes for man hours calculation
      await fetchQuotesForManHours(opportunityId);
    } catch (error) {
      console.error("Error fetching letter proposals:", error);
    }
  }

  // Function to calculate total man hours from quote data
  const calculateManHoursFromQuoteData = (quoteData: any): number => {
    if (!quoteData) return 0;

    let totalHours = 0;

    // Calculate from SOV items
    if (quoteData.sovItems && Array.isArray(quoteData.sovItems)) {
      totalHours += quoteData.sovItems.reduce((total: number, item: any) => {
        const quantity = Number(item.quantity) || 0;
        const laborMen = Number(item.laborMen) || 0;
        const laborHours = Number(item.laborHours) || 0;
        return total + quantity * laborMen * laborHours;
      }, 0);
    }

    // Calculate from non-SOV items
    if (quoteData.nonSovItems && Array.isArray(quoteData.nonSovItems)) {
      totalHours += quoteData.nonSovItems.reduce((total: number, item: any) => {
        const quantity = Number(item.quantity) || 0;
        const laborMen = Number(item.laborMen) || 0;
        const laborHours = Number(item.laborHours) || 0;
        return total + quantity * laborMen * laborHours;
      }, 0);
    }

    return totalHours;
  };

  async function fetchQuotesForManHours(opportunityId: string) {
    try {
      console.log(
        "Fetching estimates for man hours calculation:",
        opportunityId,
      );
      const { data, error } = await supabase
        .schema("business")
        .from("estimates")
        .select("id, created_at, data, travel_data")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const processedQuotes = (data || []).map((estimate: any) => {
        let estimateData: any = null;
        let title = `Estimate ${estimate.id?.slice(0, 6)}`;

        try {
          estimateData =
            typeof estimate.data === "string"
              ? JSON.parse(estimate.data)
              : estimate.data;
          const travelData: any =
            typeof estimate.travel_data === "string"
              ? JSON.parse(estimate.travel_data || "{}")
              : estimate.travel_data;
          estimateData = {
            ...(estimateData || {}),
            travel_data: estimateData?.travel_data || travelData || {},
          };
          if (estimateData?.title && estimateData.title.trim()) {
            title = estimateData.title.trim();
          }
        } catch (error) {
          console.error("Error parsing estimate data:", error);
        }

        const totalManHours = calculateManHoursFromQuoteData(estimateData);

        return {
          id: estimate.id,
          title,
          totalManHours,
          data: estimateData,
        };
      });

      setAvailableQuotes((prev) =>
        JSON.stringify(prev) === JSON.stringify(processedQuotes)
          ? prev
          : processedQuotes,
      );
      console.log("Available estimates for man hours:", processedQuotes);
    } catch (error) {
      console.error("Error fetching estimates for man hours:", error);
      setAvailableQuotes((prev) => (prev.length === 0 ? prev : []));
    }
  }

  async function fetchLatestEstimateStatus(opportunityId: string) {
    try {
      const { data, error } = await supabase
        .schema("business")
        .from("estimates")
        .select("id, status")
        .eq("opportunity_id", opportunityId)
        // Secondary sort by id so the "latest" estimate is chosen
        // deterministically when two estimates share the same created_at.
        // Must match OpportunitiesCalendarView and OpportunityList.
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching latest estimate status:", error);
        setLatestEstimateId(null);
        setEstimateApprovalStatus(null);
        return;
      }
      if (data) {
        setLatestEstimateId(data.id);
        setEstimateApprovalStatus(data.status || null);
      } else {
        setLatestEstimateId(null);
        setEstimateApprovalStatus(null);
      }
    } catch (err) {
      console.error("Error in fetchLatestEstimateStatus:", err);
      setLatestEstimateId(null);
      setEstimateApprovalStatus(null);
    }
  }

  async function handleToggleExcludeFromTotal(exclude: boolean) {
    if (!id) return;
    // Optimistically update both the view and the edit form
    setOpportunity((prev) =>
      prev ? { ...prev, exclude_from_quoted_total: exclude } : prev,
    );
    setEditFormData((prev) => ({
      ...prev,
      exclude_from_quoted_total: exclude,
    }));

    const { error } = await supabase
      .schema("business")
      .from("opportunities")
      .update({ exclude_from_quoted_total: exclude })
      .eq("id", id);

    if (error) {
      console.error("Failed to update exclude_from_quoted_total:", error);
      // Revert on failure
      setOpportunity((prev) =>
        prev ? { ...prev, exclude_from_quoted_total: !exclude } : prev,
      );
      setEditFormData((prev) => ({
        ...prev,
        exclude_from_quoted_total: !exclude,
      }));
    }
  }

  async function handleEstimateApprovalStatusChange(newStatus: string) {
    if (!id) return;
    const raw = newStatus === "" ? null : newStatus;
    const value = raw === "no quote" ? "no_quote" : raw;
    const previous = estimateApprovalStatus;
    setEstimateApprovalStatus(value);
    setIsSavingEstimateStatus(true);
    try {
      let changedEstimateId = latestEstimateId;

      if (latestEstimateId) {
        const { error } = await supabase
          .schema("business")
          .from("estimates")
          .update({ status: value })
          .eq("id", latestEstimateId);
        if (error) throw error;
      } else {
        // No estimate yet: create a placeholder estimate with this status so it can be marked e.g. Sent
        const minimalData = {
          client:
            opportunity?.customers?.company_name ||
            opportunity?.customers?.name ||
            "",
          jobDescription: opportunity?.description || "",
          dateDue: "",
          location: "",
          periodOfPerformance: "",
          estimatedStartDate: "",
          poNumber: "",
          notes: "",
          sovItems: [],
          nonSovItems: [],
          calculatedValues: {
            subtotalMaterial: 0,
            subtotalExpense: 0,
            subtotalLabor: 0,
            totalMaterial: 0,
            totalExpense: 0,
            totalLabor: 0,
            grandTotal: 0,
            nonSovMaterial: 0,
            nonSovExpense: 0,
            nonSovLabor: 0,
            sovLaborHours: 0,
            nonSovLaborHours: 0,
            totalLaborHours: 0,
          },
          hoursSummary: {
            men: 1,
            hoursPerDay: 8,
            daysOnsite: 0,
            workHours: 0,
            nonSovHours: 0,
            travelHours: 0,
            totalHours: 0,
            straightTimeHours: 0,
            overtimeHours: 0,
            doubleTimeHours: 0,
          },
          travel_data: {},
          hourlyRates: {},
          // Real defaults, not {} — the estimate sheet multiplies prices by these
          // factors, and an empty object made every NET price render as $0.00
          paymentTermFactors: { net30: 1.0, net60: 1.06, net90: 1.09 },
          mobilizationFactors: {
            base: 0.0,
            over100k: 0.1,
            over500k: 0.05,
            over1m: 0.05,
          },
          isManualLaborHours: false,
          materialMarkup: 0,
        };
        const { data: newEstimate, error } = await supabase
          .schema("business")
          .from("estimates")
          .insert({
            opportunity_id: id,
            data: JSON.stringify(minimalData),
            travel_data: JSON.stringify({}),
            quote_number: "v1",
            user_id: user?.id ?? null,
            status: value,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (newEstimate?.id) {
          changedEstimateId = newEstimate.id;
          setLatestEstimateId(newEstimate.id);
        }
      }
      if (value === "sent") {
        const { error: oppError } = await supabase
          .schema("business")
          .from("opportunities")
          .update({ status: "decision" })
          .eq("id", id);
        if (!oppError && opportunity) {
          setOpportunity((prev) =>
            prev ? { ...prev, status: "decision" } : prev,
          );
        }
      }
      setIsEstimateApprovalEditing(false);
      window.dispatchEvent(
        new CustomEvent("estimateSaved", {
          detail: { opportunityId: id, estimateId: changedEstimateId },
        }),
      );
    } catch (err) {
      console.error("Error updating estimate approval status:", err);
      setEstimateApprovalStatus(previous);
      const msg = err instanceof Error ? err.message : String(err);
      const hint =
        msg.includes("check") ||
        msg.includes("constraint") ||
        msg.includes("violates")
          ? ' The database may need the migration that allows "No Quote" (2025-02_add_no_quote_estimate_status.sql).'
          : "";
      alert("Failed to update estimate approval status." + hint);
    } finally {
      setIsSavingEstimateStatus(false);
    }
  }

  // Handle quote selection changes and recalculate total man hours
  const handleQuoteSelectionChange = (quoteId: string, isSelected: boolean) => {
    let newSelectedIds: string[];

    if (isSelected) {
      newSelectedIds = [...selectedQuoteIds, quoteId];
    } else {
      newSelectedIds = selectedQuoteIds.filter((id) => id !== quoteId);
    }

    setSelectedQuoteIds(newSelectedIds);

    // Calculate total man hours from selected quotes
    const totalHours = newSelectedIds.reduce((total, id) => {
      const quote = availableQuotes.find((q) => q.id === id);
      return total + (quote?.totalManHours || 0);
    }, 0);

    // Update the form data
    setEditFormData((prev) => ({
      ...prev,
      total_man_hours: totalHours.toFixed(1),
    }));
  };

  async function fetchContactsForCustomer(customerId: string) {
    if (!customerId) {
      setAvailableContacts([]);
      return;
    }

    try {
      const { data: contactsData, error } = await supabase
        .schema("common")
        .from("contacts")
        .select("id, first_name, last_name, email, phone, customer_id")
        .eq("customer_id", customerId);

      if (error) throw error;

      const formattedContacts = contactsData.map((contact) => ({
        id: contact.id,
        name: `${contact.first_name} ${contact.last_name}`,
        email: contact.email || "",
        phone: contact.phone,
        customer_id: contact.customer_id,
      }));

      setAvailableContacts(formattedContacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setAvailableContacts([]);
    }
  }

  async function fetchAdjacentOpportunityIds(currentOpportunityId: string) {
    try {
      const { data, error } = await withPgTimeoutRetry(() =>
        supabase
          .schema("business")
          .from("opportunities")
          .select("id, quote_number, created_at")
          .range(0, 9999),
      );
      if (error) throw error;

      const sorted = (data || []).slice().sort((a: any, b: any) => {
        const an = parseInt(
          String(a.quote_number ?? "").replace(/\D/g, ""),
          10,
        );
        const bn = parseInt(
          String(b.quote_number ?? "").replace(/\D/g, ""),
          10,
        );
        const aNum = Number.isNaN(an) ? Number.MAX_SAFE_INTEGER : an;
        const bNum = Number.isNaN(bn) ? Number.MAX_SAFE_INTEGER : bn;

        if (aNum !== bNum) return bNum - aNum;

        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;

        return String(b.id).localeCompare(String(a.id));
      });

      const currentIndex = sorted.findIndex(
        (row: any) => String(row.id) === currentOpportunityId,
      );

      setAdjacentOpportunityIds({
        previous: currentIndex > 0 ? String(sorted[currentIndex - 1].id) : null,
        next:
          currentIndex >= 0 && currentIndex < sorted.length - 1
            ? String(sorted[currentIndex + 1].id)
            : null,
      });
    } catch (error) {
      console.error("Error fetching adjacent opportunities:", error);
      setAdjacentOpportunityIds({ previous: null, next: null });
    }
  }

  async function fetchOpportunity(retryOnCookieError = true) {
    setLoading(true);
    setLoadError(null);

    // Track the fetched opportunity ID locally to avoid stale closure issues
    let fetchedOpportunityId: string | null = null;
    let fetchedPreparedBy = "";

    try {
      // Ensure valid session/cookies before fetching - fixes stale cookie issues
      const sessionValid = await ensureValidSession();
      if (!sessionValid) {
        console.warn("Session invalid, but continuing with fetch attempt");
      }

      // Use select('*') to include all columns including opportunity_type if it exists
      // This avoids errors if the opportunity_type column hasn't been added yet
      const opportunityColumns = "*";

      let opportunityData: Opportunity | null = null;
      let primaryId: string | null = null;

      if (id === "merge" && mergedIds.length > 0) {
        // Merged view: fetch all listed opportunities and pick primary (most recent if not provided)
        const { data: list, error } = await supabase
          .schema("business")
          .from("opportunities")
          .select(opportunityColumns)
          .in("id", mergedIds);
        if (error) throw error;
        // Determine primary
        let primary = null as any;
        if (primaryIdParam) {
          primary = list?.find((o) => String(o.id) === primaryIdParam) || null;
        }
        if (!primary) {
          primary =
            (list || []).slice().sort((a: any, b: any) => {
              const at = a.created_at ? new Date(a.created_at).getTime() : 0;
              const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
              return bt - at; // most recent first
            })[0] || null;
        }
        opportunityData = (primary as any) || null;
        primaryId = primary ? String(primary.id) : null;

        // Batch-fetch all customers for merged opportunities (avoids N+1 queries)
        const customerIds = [
          ...new Set(
            (list || []).map((o: any) => o.customer_id).filter(Boolean),
          ),
        ];
        const customerMap: Record<string, CustomerInfo> = {};
        if (customerIds.length > 0) {
          const { data: customersData } = await supabase
            .schema("common")
            .from("customers")
            .select("id, name, company_name")
            .in("id", customerIds);
          if (customersData) {
            customersData.forEach((c: any) => {
              customerMap[c.id] = c as CustomerInfo;
            });
          }
        }
        const withCustomers = (list || []).map(
          (o: any) =>
            ({
              ...(o as Opportunity),
              customers: o.customer_id
                ? customerMap[o.customer_id] || null
                : null,
            }) as OpportunityWithCustomer,
        );
        setMergedList(withCustomers);
        const existingJob = withCustomers.find((m) => !!m.job_id)?.job_id;
        if (existingJob) {
          setGroupLockJobId(String(existingJob));
          try {
            const key = `opportunity-merge-lock-${mergedIds.slice().sort().join(",")}`;
            localStorage.setItem(
              key,
              JSON.stringify({
                jobId: existingJob,
                ids: mergedIds,
                lockedAt: new Date().toISOString(),
              }),
            );
          } catch {}
        }
      } else {
        // Normal view: fetch by id
        const { data, error } = await supabase
          .schema("business")
          .from("opportunities")
          .select(opportunityColumns)
          .eq("id", id)
          .single<Opportunity>();
        if (error) throw error;
        opportunityData = data || null;
        primaryId = opportunityData ? String(opportunityData.id) : null;

        // Prefer DB-backed merge groups if present
        try {
          const { data: membership } = await supabase
            .schema("business")
            .from("opportunity_merge_members")
            .select("merge_group_id, opportunity_id, is_primary")
            .eq("opportunity_id", id)
            .maybeSingle();

          if (membership && membership.merge_group_id) {
            const groupId = membership.merge_group_id as string;
            const [{ data: group }, { data: members }] = await Promise.all([
              supabase
                .schema("business")
                .from("opportunity_merge_groups")
                .select("primary_opportunity_id, job_id")
                .eq("id", groupId)
                .maybeSingle(),
              supabase
                .schema("business")
                .from("opportunity_merge_members")
                .select("opportunity_id, is_primary")
                .eq("merge_group_id", groupId),
            ]);

            const ids = (members || []).map((m) =>
              String((m as any).opportunity_id),
            );
            if (ids.length > 1) {
              setSavedMergeIds(ids);
              const pId = (group as any)?.primary_opportunity_id
                ? String((group as any).primary_opportunity_id)
                : (members || []).find((m) => (m as any).is_primary)
                      ?.opportunity_id
                  ? String(
                      (members as any[]).find((m) => (m as any).is_primary)!
                        .opportunity_id,
                    )
                  : primaryId;
              setSavedPrimaryId(pId || primaryId);
              if ((group as any)?.job_id)
                setGroupLockJobId(String((group as any).job_id));

              // Fetch peers and batch-fetch customers (avoids N+1 queries)
              const { data: peers } = await supabase
                .schema("business")
                .from("opportunities")
                .select(opportunityColumns)
                .in("id", ids);
              const peerCustomerIds = [
                ...new Set(
                  (peers || []).map((o: any) => o.customer_id).filter(Boolean),
                ),
              ];
              const peerCustomerMap: Record<string, CustomerInfo> = {};
              if (peerCustomerIds.length > 0) {
                const { data: peerCustomersData } = await supabase
                  .schema("common")
                  .from("customers")
                  .select("id, name, company_name")
                  .in("id", peerCustomerIds);
                if (peerCustomersData) {
                  peerCustomersData.forEach((c: any) => {
                    peerCustomerMap[c.id] = c as CustomerInfo;
                  });
                }
              }
              const withCustomers = (peers || []).map(
                (o: any) =>
                  ({
                    ...(o as Opportunity),
                    customers: o.customer_id
                      ? peerCustomerMap[o.customer_id] || null
                      : null,
                  }) as OpportunityWithCustomer,
              );
              setMergedList(withCustomers);
            }
          }
        } catch (e) {
          console.warn("Merge group lookup failed (non-fatal):", e);
        }

        // Parse saved merge info from notes for non-merge route
        if (opportunityData && typeof opportunityData.notes === "string") {
          const meta = extractMergeMetaFromNotes(opportunityData.notes);
          if (meta && meta.ids && meta.ids.length > 1) {
            setSavedMergeIds(meta.ids);
            setSavedPrimaryId(meta.primary || primaryId);
            // Fetch merged peers and batch-fetch customers (avoids N+1 queries)
            const { data: peers } = await supabase
              .schema("business")
              .from("opportunities")
              .select(opportunityColumns)
              .in("id", meta.ids);
            const metaCustomerIds = [
              ...new Set(
                (peers || []).map((o: any) => o.customer_id).filter(Boolean),
              ),
            ];
            const metaCustomerMap: Record<string, CustomerInfo> = {};
            if (metaCustomerIds.length > 0) {
              const { data: metaCustomersData } = await supabase
                .schema("common")
                .from("customers")
                .select("id, name, company_name")
                .in("id", metaCustomerIds);
              if (metaCustomersData) {
                metaCustomersData.forEach((c: any) => {
                  metaCustomerMap[c.id] = c as CustomerInfo;
                });
              }
            }
            const withCustomers = (peers || []).map(
              (o: any) =>
                ({
                  ...(o as Opportunity),
                  customers: o.customer_id
                    ? metaCustomerMap[o.customer_id] || null
                    : null,
                }) as OpportunityWithCustomer,
            );
            setMergedList(withCustomers);
            const existingJob = withCustomers.find((m) => !!m.job_id)?.job_id;
            if (existingJob) {
              setGroupLockJobId(String(existingJob));
            }
          } else {
            setSavedMergeIds([]);
            setSavedPrimaryId(null);
          }
        }
      }

      if (!opportunityData) throw new Error("Opportunity not found");
      fetchedPreparedBy = (opportunityData as any).prepared_by || "";
      setQuotePreparedBy(fetchedPreparedBy || null);

      const creatorId = opportunityData.user_id;
      let creatorDisplay = formatOpportunityCreator(
        null,
        opportunityData.sales_person,
      );
      if (creatorId) {
        if (creatorId === user?.id) {
          creatorDisplay = formatOpportunityCreator(
            {
              full_name:
                user?.user_metadata?.full_name || user?.user_metadata?.name,
              email: user?.email,
            },
            opportunityData.sales_person,
          );
        }

        const { data: profileData, error: profileError } = await supabase
          .schema("common")
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", creatorId)
          .maybeSingle();

        if (!profileError && profileData) {
          creatorDisplay = formatOpportunityCreator(
            profileData,
            opportunityData.sales_person,
          );
        }
      }
      setOpportunityCreator(creatorDisplay);

      // Then fetch the customer data from common schema if we have a customer_id
      let customerInfo: CustomerInfo | null = null;
      if (opportunityData.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .schema("common")
          .from("customers")
          .select("id, name, company_name")
          .eq("id", opportunityData.customer_id)
          .single<CustomerInfo>();

        if (!customerError && customerData) {
          customerInfo = customerData;
        }
      }

      // Optionally fetch the linked contact
      let contactInfo: Contact | null = null;
      if (opportunityData.contact_id) {
        const { data: cData, error: cErr } = await supabase
          .schema("common")
          .from("contacts")
          .select("id, first_name, last_name, email, phone, customer_id")
          .eq("id", opportunityData.contact_id)
          .maybeSingle();
        if (!cErr && cData) {
          contactInfo = {
            id: cData.id,
            name: `${cData.first_name} ${cData.last_name}`,
            email: cData.email || "",
            phone: cData.phone,
            customer_id: cData.customer_id,
          };
        }
      }

      // Combine the data
      fetchedOpportunityId = opportunityData.id;
      setOpportunity({
        ...opportunityData,
        customers: customerInfo,
      });
      if (contactInfo) {
        setContacts((prev) => {
          const exists = prev.some((c) => c.id === contactInfo!.id);
          return exists ? prev : [contactInfo!, ...prev];
        });
      }

      // Safely try to fetch optional proposal_due_date without breaking if it doesn't exist
      try {
        const pdTargetId = primaryId || id;
        const { data: pd, error: pdError } = await supabase
          .schema("business")
          .from("opportunities")
          .select("proposal_due_date")
          .eq("id", pdTargetId)
          .maybeSingle();
        if (!pdError && pd && "proposal_due_date" in (pd as any)) {
          setOpportunity((prev) =>
            prev
              ? { ...prev, proposal_due_date: (pd as any).proposal_due_date }
              : prev,
          );
        }
      } catch (e: any) {
        // If column doesn't exist (42703) or any other error, ignore gracefully
        if (e?.code !== "42703") {
          console.warn("Optional proposal_due_date fetch warning:", e);
        }
      }

      // Check if linked job exists and is not deleted
      if (opportunityData.job_id) {
        const { data: linkedJob } = await supabase
          .schema("neta_ops")
          .from("jobs")
          .select("id, deleted_at")
          .eq("id", opportunityData.job_id)
          .maybeSingle();

        if (linkedJob && !linkedJob.deleted_at) {
          // Job exists and is not deleted
          setJobId(opportunityData.job_id.toString());
        } else {
          // Job is deleted or doesn't exist - clear the job_id from opportunity
          console.log(
            "Linked job is deleted or missing, clearing job_id from opportunity",
          );
          await supabase
            .schema("business")
            .from("opportunities")
            .update({ job_id: null })
            .eq("id", opportunityData.id);

          // Update local state to remove job_id
          setOpportunity((prev) =>
            prev
              ? ({ ...prev, job_id: null } as OpportunityWithCustomer)
              : null,
          );
          setJobId(null);
        }
      }
    } catch (error: any) {
      console.error("Error fetching opportunity:", error);

      // If it's an auth error and we haven't retried yet, try soft refresh (like sign-out/sign-in) and retry
      if (
        (isCookieAuthError(error) || isAuthError(error)) &&
        retryOnCookieError
      ) {
        console.log(
          "🔄 Auth error detected - attempting automatic session recovery (soft refresh)...",
        );
        try {
          // Use softRefresh from AuthContext which clears cache and refreshes session
          const recovered = await softRefresh();
          if (recovered) {
            // Retry the fetch once after recovering session (with retry flag disabled to prevent infinite loop)
            console.log(
              "✅ Session recovered via soft refresh, retrying opportunity fetch...",
            );
            await fetchOpportunity(false);
            return; // Exit early on successful retry
          } else {
            // Fallback to ensureValidSession if softRefresh failed
            console.log("  ↳ softRefresh failed, trying ensureValidSession...");
            const refreshed = await ensureValidSession();
            if (refreshed) {
              await fetchOpportunity(false);
              return;
            }
          }
        } catch (retryError) {
          console.error("Retry after session recovery failed:", retryError);
        }
      }

      setLoadError(
        error?.message ||
          "Failed to load opportunity. Please try refreshing the page.",
      );
    } finally {
      setLoading(false);

      // Update prepared_by field based on existing estimates
      // Use the locally tracked ID to avoid stale closure issues
      if (fetchedOpportunityId) {
        updatePreparedByFromEstimates(fetchedOpportunityId, fetchedPreparedBy);
      }
    }
  }

  // --- Merge metadata helpers ---
  function buildMergeMeta(
    ids: string[],
    primary: string | null,
    jobId?: string | null,
  ) {
    return `[MERGE_GROUP]primary=${primary || ""};ids=${ids.join(",")};locked_job=${jobId || ""};[/MERGE_GROUP]`;
  }

  function extractMergeMetaFromNotes(notes: string | null | undefined): {
    ids: string[];
    primary: string | null;
    locked_job: string | null;
  } | null {
    if (!notes) return null;
    const start = notes.indexOf("[MERGE_GROUP]");
    const end = notes.indexOf("[/MERGE_GROUP]");
    if (start === -1 || end === -1 || end <= start) return null;
    const block = notes.substring(start + 13, end).trim();
    // format: primary=...;ids=a,b,c;locked_job=...
    const parts = block.split(";").map((s) => s.trim());
    const map: Record<string, string> = {};
    parts.forEach((p) => {
      const idx = p.indexOf("=");
      if (idx > -1) {
        map[p.substring(0, idx)] = p.substring(idx + 1);
      }
    });
    const ids = (map["ids"] || "").split(",").filter(Boolean);
    const primary = map["primary"] || null;
    const locked_job = map["locked_job"] || null;
    if (ids.length < 2) return null;
    return { ids, primary, locked_job };
  }

  async function fetchCustomers() {
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("customers")
        .select("id, name, company_name")
        .order("name");

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  }

  async function fetchContacts(customerId: string) {
    if (!customerId) {
      setContacts([]); // Ensure setContacts exists in component state
      return;
    }
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("contacts")
        .select("id, first_name, last_name, email, phone, customer_id") // Select all needed fields
        .eq("customer_id", customerId);

      if (error) throw error;

      // Transform the data to match the Contact interface
      const transformedContacts = (data || []).map((contact) => ({
        id: contact.id,
        name: `${contact.first_name} ${contact.last_name}`,
        email: contact.email || "",
        phone: contact.phone,
        customer_id: contact.customer_id,
      }));

      setContacts(transformedContacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setContacts([]); // Set to empty array on error
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!opportunity) return;
    setIsSubmitting(true);

    try {
      const proposalDueDate = editFormData.proposal_due_date
        ? editFormData.proposal_due_date + "T12:00:00.000Z" // Add noon UTC to prevent timezone shifts
        : null;

      const opportunityCreatedDate = editFormData.opportunity_created_date
        ? editFormData.opportunity_created_date + "T12:00:00.000Z" // Add noon UTC to prevent timezone shifts
        : null;

      const letterProposalDate = editFormData.letter_proposal_date
        ? editFormData.letter_proposal_date + "T12:00:00.000Z" // Add noon UTC to prevent timezone shifts
        : null;

      console.log("Updating opportunity with editFormData:", {
        id: opportunity.id,
        title: editFormData.title,
        originalTitle: opportunity.title,
      });

      // Auto-adjust opportunity_type based on quoted_amount for acceptance categories
      let opportunityType = editFormData.opportunity_type || "other";
      const quotedAmount = editFormData.quoted_amount
        ? parseFloat(editFormData.quoted_amount)
        : null;
      if (
        opportunityType === "large_acceptance" ||
        opportunityType === "small_acceptance"
      ) {
        if (quotedAmount !== null) {
          opportunityType =
            quotedAmount >= 100000 ? "large_acceptance" : "small_acceptance";
        }
      }

      const updatePayload: any = {
        customer_id: editFormData.customer_id,
        contact_id: editFormData.contact_id || null,
        title: editFormData.title,
        description: editFormData.description,
        expected_value: editFormData.expected_value
          ? parseFloat(editFormData.expected_value)
          : null,
        status: editFormData.status,
        sales_person: editFormData.sales_person,
        notes: editFormData.notes,
        probability: editFormData.probability
          ? parseFloat(editFormData.probability)
          : 0,
        amp_division: editFormData.amp_division,
        quoted_amount: quotedAmount,
        selected_letter_proposal: editFormData.selected_letter_proposal || null,
        reviewed_by: editFormData.reviewed_by || null,
        prepared_by: editFormData.prepared_by || null,
        jobsite_location: editFormData.jobsite_location || null,
        estimated_start_date: editFormData.estimated_start_date || null,
        estimated_end_date: editFormData.estimated_end_date || null,
        period_of_performance: editFormData.period_of_performance || null,
        total_man_hours: editFormData.total_man_hours
          ? parseFloat(editFormData.total_man_hours)
          : null,
        opportunity_type: opportunityType,
        documents_stage: editFormData.documents_stage || null,
      };
      updatePayload.proposal_due_date = proposalDueDate;
      updatePayload.opportunity_created_date = opportunityCreatedDate;
      updatePayload.letter_proposal_date = letterProposalDate;

      // Helper to check if error is about a missing column
      const isColumnMissingError = (err: any) => {
        if (!err) return false;
        // PostgreSQL error code for undefined column
        if (err.code === "42703") return true;
        // Supabase schema cache error
        if (
          err.message &&
          err.message.includes("Could not find the") &&
          err.message.includes("column")
        )
          return true;
        return false;
      };

      // Helper to check if error mentions a specific column
      const errorMentionsColumn = (err: any, columnName: string) => {
        if (!err || !err.message) return false;
        return (
          err.message.includes(`'${columnName}'`) ||
          err.message.includes(`"${columnName}"`)
        );
      };

      // Start with payload without opportunity_type if we suspect the column might not exist.
      // We'll add it back in if it succeeds, or handle the error gracefully.
      const { opportunity_type: oppType, ...basePayload } = updatePayload;
      const mainPayload = { ...basePayload };
      const optionalDateColumns = [
        "proposal_due_date",
        "estimated_start_date",
        "estimated_end_date",
      ];

      let updateError = null as any;
      for (
        let attempt = 0;
        attempt < optionalDateColumns.length + 1;
        attempt++
      ) {
        const res = await supabase
          .schema("business")
          .from("opportunities")
          .update(mainPayload)
          .eq("id", opportunity.id)
          .select();
        updateError = res.error;

        if (!updateError) break;

        if (isColumnMissingError(updateError)) {
          const missingOptionalColumn = optionalDateColumns.find(
            (column) =>
              column in mainPayload && errorMentionsColumn(updateError, column),
          );

          if (missingOptionalColumn) {
            console.log(
              `${missingOptionalColumn} column missing, retrying without it...`,
            );
            delete (mainPayload as any)[missingOptionalColumn];
            continue;
          }
        }

        break;
      }

      // If that succeeded, try to update opportunity_type separately (if column exists)
      if (!updateError && oppType) {
        const typeRes = await supabase
          .schema("business")
          .from("opportunities")
          .update({ opportunity_type: oppType })
          .eq("id", opportunity.id)
          .select();
        // If opportunity_type column doesn't exist, just log and continue (data was already saved)
        if (typeRes.error && isColumnMissingError(typeRes.error)) {
          console.log(
            "opportunity_type column does not exist yet, skipping...",
          );
        } else if (typeRes.error) {
          console.warn("Could not update opportunity_type:", typeRes.error);
        }
      }

      const error = updateError;

      if (error) {
        console.error("Database update error:", error);
        throw error;
      }

      // Sync customer_id to linked job(s)
      if (editFormData.customer_id) {
        try {
          console.log("🔄 Starting customer sync to linked job...");
          console.log("  - Opportunity ID:", opportunity.id);
          console.log("  - Opportunity job_id:", opportunity.job_id);
          console.log("  - New customer_id:", editFormData.customer_id);

          // Find jobs linked to this opportunity (by job_id on opportunity OR opportunity_id on job)
          let linkedJobId = opportunity.job_id;

          // If no job_id on opportunity, look for job by opportunity_id
          if (!linkedJobId) {
            console.log(
              "  - No job_id on opportunity, searching jobs by opportunity_id...",
            );
            const { data: linkedJob, error: searchError } = await supabase
              .schema("neta_ops")
              .from("jobs")
              .select("id, customer_id")
              .eq("opportunity_id", String(opportunity.id))
              .maybeSingle();

            if (searchError) {
              console.warn("  - Error searching for linked job:", searchError);
            }

            if (linkedJob) {
              linkedJobId = linkedJob.id;
              console.log(
                "  - Found linked job by opportunity_id:",
                linkedJobId,
                "current customer:",
                linkedJob.customer_id,
              );
            } else {
              console.log("  - No linked job found by opportunity_id");
            }
          }

          if (linkedJobId) {
            console.log(
              "  - Updating job",
              linkedJobId,
              "with customer_id:",
              editFormData.customer_id,
            );
            const { data: updateData, error: jobUpdateError } = await supabase
              .schema("neta_ops")
              .from("jobs")
              .update({ customer_id: editFormData.customer_id })
              .eq("id", linkedJobId)
              .select("id, customer_id");

            if (jobUpdateError) {
              console.warn(
                "  - ❌ Could not sync customer to linked job:",
                jobUpdateError,
              );
            } else {
              console.log(
                "  - ✅ Customer synced to linked job:",
                linkedJobId,
                "result:",
                updateData,
              );
            }
          } else {
            console.log("  - No linked job found to sync customer to");
          }
        } catch (syncError) {
          console.warn("Error syncing customer to linked job:", syncError);
        }
      }

      setIsEditing(false);

      // Force refresh the opportunity data from database
      await fetchOpportunity();

      // Show success message
      console.log("Opportunity updated successfully");
      setShowSuccessMessage("Opportunity saved successfully!");
      setTimeout(() => setShowSuccessMessage(null), 3000);
    } catch (error: any) {
      console.error("Error updating opportunity:", error);
      // Show error to user
      alert(
        `Failed to save changes: ${error?.message || "Unknown error"}. Please try again.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Populate the edit form from the current opportunity and switch into edit
  // mode. `overrides` lets callers blank out specific fields (used when
  // promoting a draft into a brand-new opportunity).
  function beginEditOpportunity(overrides?: Partial<OpportunityFormData>) {
    if (!opportunity) return;
    let opportunityType = (opportunity as any).opportunity_type;
    if (!opportunityType) {
      const quotedAmount = (opportunity as any).quoted_amount;
      if (quotedAmount && Number(quotedAmount) > 0) {
        opportunityType =
          Number(quotedAmount) >= 100000
            ? "large_acceptance"
            : "small_acceptance";
      } else {
        opportunityType = "other";
      }
    }
    const nextFormData: OpportunityFormData = {
      customer_id: opportunity.customer_id || "",
      contact_id: opportunity.contact_id || null,
      title: opportunity.title || "",
      description: opportunity.description || "",
      expected_value: opportunity.expected_value?.toString() || "",
      status: opportunity.status || "",
      opportunity_created_date: opportunity.opportunity_created_date
        ? opportunity.opportunity_created_date.substring(0, 10)
        : "",
      letter_proposal_date: opportunity.letter_proposal_date
        ? opportunity.letter_proposal_date.substring(0, 10)
        : "",
      proposal_due_date: opportunity.proposal_due_date
        ? opportunity.proposal_due_date.substring(0, 10)
        : "",
      sales_person: opportunity.sales_person || "",
      notes: opportunity.notes || "",
      probability: opportunity.probability?.toString() || "0",
      amp_division: opportunity.amp_division || "",
      quoted_amount: (opportunity as any).quoted_amount?.toString() || "",
      selected_letter_proposal:
        (opportunity as any).selected_letter_proposal || "",
      reviewed_by: (opportunity as any).reviewed_by || "",
      prepared_by: (opportunity as any).prepared_by || "",
      jobsite_location: (opportunity as any).jobsite_location || "",
      estimated_start_date: (opportunity as any).estimated_start_date
        ? (opportunity as any).estimated_start_date.substring(0, 10)
        : "",
      estimated_end_date: (opportunity as any).estimated_end_date
        ? (opportunity as any).estimated_end_date.substring(0, 10)
        : "",
      period_of_performance: (opportunity as any).period_of_performance || "",
      total_man_hours:
        (opportunity as any).total_man_hours?.toString() || "0",
      opportunity_type: opportunityType,
      documents_stage: (opportunity as any).documents_stage || "",
      ...overrides,
    };
    setEditFormData(nextFormData);
    setIsEditing(true);
    if (nextFormData.customer_id) {
      fetchContactsForCustomer(nextFormData.customer_id);
    }
  }

  // "Add to New Opportunity": promote the current draft in place. Clear the
  // placeholder customer/title so the user fills in real values, drop the draft
  // banner, and open the edit form. The estimate stays attached.
  function handlePromoteDraftToNew() {
    setShowAssignDraftPrompt(false);
    setIsDraft(false);
    beginEditOpportunity({
      customer_id: "",
      contact_id: null,
      title:
        opportunity?.title && opportunity.title !== "Draft Estimate"
          ? opportunity.title
          : "",
      description:
        opportunity?.description &&
        opportunity.description !== "Draft created for new estimate"
          ? opportunity.description
          : "",
    });
    toast({
      title: "Fill in the opportunity details",
      description:
        "Choose a customer and title, then save. Your estimate is already attached.",
      variant: "info",
    });
  }

  // "Add to Existing Opportunity": move this draft's estimate(s) onto the chosen
  // opportunity, delete the now-empty draft opportunity, and navigate there.
  async function handleMoveDraftToExisting(target: CopyTargetOpportunity) {
    if (!id || isAssigningDraft) return;
    if (target.id === id) {
      alert("That estimate already belongs to this opportunity.");
      return;
    }
    setIsAssigningDraft(true);
    try {
      // Move estimates from the draft opportunity to the target.
      const { error: estimatesError } = await supabase
        .schema("business")
        .from("estimates")
        .update({ opportunity_id: target.id })
        .eq("opportunity_id", id);
      if (estimatesError) throw estimatesError;

      // Move any letter proposals as well (best effort).
      const { error: lettersError } = await supabase
        .schema("business")
        .from("letter_proposals")
        .update({ opportunity_id: target.id })
        .eq("opportunity_id", id);
      if (lettersError) {
        console.warn(
          "Could not move letter proposals to target opportunity:",
          lettersError,
        );
      }

      // Delete the now-empty draft opportunity. The shared "Draft Estimate"
      // customer is intentionally left alone since it is reused across drafts.
      const { error: deleteError } = await supabase
        .schema("business")
        .from("opportunities")
        .delete()
        .eq("id", id);
      if (deleteError) {
        console.warn("Could not delete draft opportunity:", deleteError);
      }

      // Let the destination opportunity refresh its estimate list.
      window.dispatchEvent(
        new CustomEvent("estimateSaved", {
          detail: { opportunityId: target.id },
        }),
      );

      const targetLabel =
        target.quote_number ||
        target.title ||
        target.customer_name ||
        "the selected opportunity";
      setShowAssignExistingPicker(false);
      setIsDraft(false);
      toast({
        title: "Estimate assigned",
        description: `Moved to ${targetLabel}.`,
        variant: "success",
      });
      navigate(`/sales-dashboard/opportunities/${target.id}`);
    } catch (error: any) {
      console.error("Error assigning draft estimate to opportunity:", error);
      alert(
        `Failed to assign estimate: ${error?.message || "Unknown error"}. Please try again.`,
      );
    } finally {
      setIsAssigningDraft(false);
    }
  }

  function handleInputChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    const { name, value } = e.target;
    console.log("Input changed:", { name, value });

    setEditFormData((prev) => {
      const updated = { ...prev, [name]: value };

      // Auto-adjust opportunity_type based on quoted_amount for acceptance categories
      // This happens in real-time as the user types
      if (name === "quoted_amount") {
        const amount = value ? parseFloat(value) : null;
        if (
          (prev.opportunity_type === "large_acceptance" ||
            prev.opportunity_type === "small_acceptance") &&
          amount !== null
        ) {
          updated.opportunity_type =
            amount >= 100000 ? "large_acceptance" : "small_acceptance";
        }
      }

      // When user switches TO an acceptance category, auto-adjust based on current quoted amount
      if (
        name === "opportunity_type" &&
        (value === "large_acceptance" || value === "small_acceptance")
      ) {
        const amount = prev.quoted_amount
          ? parseFloat(prev.quoted_amount)
          : null;
        if (amount !== null) {
          updated.opportunity_type =
            amount >= 100000 ? "large_acceptance" : "small_acceptance";
        }
      }

      if (
        name === "estimated_start_date" &&
        value &&
        updated.estimated_end_date &&
        updated.estimated_end_date < value
      ) {
        updated.estimated_end_date = "";
      }

      return updated;
    });
  }

  function handleLetterProposalChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedProposalId = e.target.value;
    const selectedProposal = letterProposals.find(
      (p) => p.id === selectedProposalId,
    ) as any;
    const newQuotedAmount = selectedProposal
      ? parseMoneyValue(selectedProposal.net_30_price) ||
        extractNet30FromLetterHtml(selectedProposal.html)
      : null;

    setEditFormData((prev) => {
      const updated = {
        ...prev,
        selected_letter_proposal: selectedProposalId,
        quoted_amount: newQuotedAmount ? newQuotedAmount.toString() : "",
      };

      // Auto-adjust opportunity_type based on the new quoted amount for acceptance categories
      if (
        (prev.opportunity_type === "large_acceptance" ||
          prev.opportunity_type === "small_acceptance") &&
        newQuotedAmount !== null
      ) {
        updated.opportunity_type =
          newQuotedAmount >= 100000 ? "large_acceptance" : "small_acceptance";
      }

      return updated;
    });
  }

  function getStatusColor(status: string) {
    switch (status.toLowerCase()) {
      case "awareness":
        return "bg-neutral-100 text-neutral-800 dark:bg-dark-150 dark:text-neutral-100";
      case "interest":
        return "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100";
      case "quote":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-100";
      case "decision":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100";
      case "decision - forecasted win":
        return "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100";
      case "decision - forecast lose":
        return "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100";
      case "awarded":
        return "bg-green-500 text-white dark:bg-green-600";
      case "lost":
        return "bg-red-500 text-white dark:bg-red-600";
      case "no quote":
        return "bg-neutral-500 text-white dark:bg-neutral-600";
      default:
        return "bg-neutral-100 text-neutral-800 dark:bg-dark-150 dark:text-neutral-100";
    }
  }

  function formatStatus(status: string) {
    return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
  }

  function getEstimateApprovalColor(status: string | null) {
    if (!status)
      return "bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400";
    switch (status) {
      case "sent":
        return "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100";
      case "approved_to_send":
        return "bg-pink-100 text-pink-800 dark:bg-pink-800 dark:text-pink-100";
      case "ready_for_review":
        return "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100";
      case "in_progress":
        return "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100";
      case "no_quote":
      case "no quote":
        return "bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400";
      default:
        return "bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400";
    }
  }

  function formatEstimateApprovalStatus(status: string | null) {
    if (!status) return "Not Started";
    switch (status) {
      case "sent":
        return "Sent";
      case "approved_to_send":
        return "Approved to Send";
      case "ready_for_review":
        return "Ready for Review";
      case "in_progress":
        return "In Progress";
      case "no_quote":
      case "no quote":
        return "No Quote";
      default:
        return status.replace(/_/g, " ");
    }
  }

  const handleConvertToJob = async () => {
    if (!opportunity?.id || !user || isConvertingToJob) return;

    setIsConvertingToJob(true);
    try {
      // Check if opportunity has required fields
      if (!opportunity?.customer_id) {
        throw new Error(
          "Opportunity is missing customer_id which is required for job creation",
        );
      }

      // Check if opportunity already has a job_id (prevent duplicates)
      const { data: currentOpportunity } = await supabase
        .schema("business")
        .from("opportunities")
        .select("job_id")
        .eq("id", opportunity.id)
        .maybeSingle();

      if (currentOpportunity?.job_id) {
        // Job already exists - check if it's still valid
        const { data: existingJob } = await supabase
          .schema("neta_ops")
          .from("jobs")
          .select("id")
          .eq("id", currentOpportunity.job_id)
          .is("deleted_at", null)
          .maybeSingle();

        if (existingJob) {
          // Job exists and is not deleted - use it
          setJobId(currentOpportunity.job_id);
          setOpportunity((prev) =>
            prev
              ? ({
                  ...prev,
                  job_id: currentOpportunity.job_id,
                  status: "awarded" as any,
                } as OpportunityWithCustomer)
              : null,
          );
          setConfirmConvertToJobOpen(false);
          setIsConvertingToJob(false);
          setShowSuccessMessage(
            `Job already exists! Job ID: ${currentOpportunity.job_id}`,
          );
          setTimeout(() => setShowSuccessMessage(null), 5000);
          return;
        } else {
          // Job was deleted or doesn't exist - clear the job_id and create a new one
          await supabase
            .schema("business")
            .from("opportunities")
            .update({ job_id: null })
            .eq("id", opportunity.id);
        }
      }

      // Also check if a job with this opportunity_id already exists (prevent duplicates)
      const { data: existingJobByOpportunityId } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("id")
        .eq("opportunity_id", opportunity.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (existingJobByOpportunityId) {
        // Job already exists with this opportunity_id - link it back to the opportunity
        const existingJobId = existingJobByOpportunityId.id;
        await supabase
          .schema("business")
          .from("opportunities")
          .update({ status: "awarded", job_id: existingJobId })
          .eq("id", opportunity.id);

        setJobId(existingJobId);
        setOpportunity((prev) =>
          prev
            ? ({
                ...prev,
                job_id: existingJobId,
                status: "awarded" as any,
              } as OpportunityWithCustomer)
            : null,
        );
        setConfirmConvertToJobOpen(false);
        setIsConvertingToJob(false);
        setShowSuccessMessage(`Job already exists! Job ID: ${existingJobId}`);
        setTimeout(() => setShowSuccessMessage(null), 5000);
        return;
      }

      // If a letter proposal was selected in the dialog, persist it on the opportunity
      try {
        if (selectedLetterId) {
          await supabase
            .schema("business")
            .from("opportunities")
            .update({ selected_letter_proposal: selectedLetterId })
            .eq("id", opportunity.id);
        }
      } catch {}

      // Create the job
      const newJobId = await createJobManually(opportunity, supabase, user.id);
      setJobId(newJobId);

      // Update the opportunity status to "awarded" and set job_id
      try {
        const { error: statusError } = await supabase
          .schema("business")
          .from("opportunities")
          .update({ status: "awarded", job_id: newJobId })
          .eq("id", opportunity.id);

        if (statusError) {
          console.error("Error updating opportunity status:", statusError);
          // Continue anyway - job was created successfully
        }
      } catch (e) {
        console.error("Error updating opportunity status:", e);
        // Continue anyway - job was created successfully
      }

      // Update the opportunity in state to include the job_id and status
      setOpportunity((prev) =>
        prev
          ? ({
              ...prev,
              job_id: newJobId,
              status: "awarded" as any,
            } as OpportunityWithCustomer)
          : null,
      );

      // If this is a merged view, lock the group so others cannot convert
      if (id === "merge" && mergedIds.length > 0) {
        try {
          const key = `opportunity-merge-lock-${mergedIds.slice().sort().join(",")}`;
          localStorage.setItem(
            key,
            JSON.stringify({
              jobId: newJobId,
              ids: mergedIds,
              lockedAt: new Date().toISOString(),
            }),
          );
          setGroupLockJobId(String(newJobId));
        } catch {}
      }

      // Persist merge metadata into notes so future loads show merged grouping
      try {
        const idsToPersist =
          id === "merge" && mergedIds.length > 0
            ? mergedIds
            : savedMergeIds.length > 0
              ? savedMergeIds
              : [];
        if (idsToPersist.length > 1) {
          const { data: currentRow } = await supabase
            .schema("business")
            .from("opportunities")
            .select("notes")
            .eq("id", opportunity.id)
            .maybeSingle();

          const currentNotes = (currentRow?.notes as string) || "";
          const withoutOld = currentNotes
            .replace(/\[MERGE_GROUP\][\s\S]*?\[\/MERGE_GROUP\]/g, "")
            .trim();
          const newMeta = buildMergeMeta(
            idsToPersist,
            String(opportunity.id),
            newJobId,
          );
          const combined = (withoutOld ? withoutOld + "\n\n" : "") + newMeta;
          await supabase
            .schema("business")
            .from("opportunities")
            .update({ notes: combined })
            .eq("id", opportunity.id);
        }
      } catch (e) {
        console.warn("Failed to persist merge metadata:", e);
      }

      setConfirmConvertToJobOpen(false);
      setShowSuccessMessage(`Job successfully created! Job ID: ${newJobId}`);

      // Refresh the opportunity data to show all updated fields
      await fetchOpportunity();

      // Auto-hide success message after 5 seconds
      setTimeout(() => setShowSuccessMessage(null), 5000);
    } catch (error) {
      console.error("Error creating job:", error);
      alert(
        "Failed to create job: " +
          (error instanceof Error
            ? error.message
            : "Please try again. If the problem persists, contact support."),
      );
    } finally {
      setIsConvertingToJob(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!opportunity?.id || !user) return;

    try {
      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ status: newStatus })
        .eq("id", opportunity.id);

      if (error) throw error;

      // Update the local state for all status changes
      setOpportunity((prev) =>
        prev ? { ...prev, status: newStatus as any } : null,
      );

      setIsStatusEditing(false);
    } catch (error) {
      console.error("Error updating opportunity status:", error);
      alert(
        "Failed to update opportunity status: " +
          (error instanceof Error ? error.message : "Please try again."),
      );
    }
  };

  const handleDocumentsStageChange = async (newDocumentsStage: string) => {
    if (!opportunity?.id || !user) return;

    try {
      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ documents_stage: newDocumentsStage || null })
        .eq("id", opportunity.id);

      if (error) throw error;

      // Update the local state
      setOpportunity((prev) =>
        prev
          ? ({
              ...prev,
              documents_stage: newDocumentsStage || undefined,
            } as any)
          : null,
      );

      setIsDocumentsStageEditing(false);
    } catch (error) {
      console.error("Error updating documents stage:", error);
      alert(
        "Failed to update documents stage: " +
          (error instanceof Error ? error.message : "Please try again."),
      );
    }
  };

  const handleOpportunityTypeChange = async (newOpportunityType: string) => {
    if (!opportunity?.id || !user) return;

    try {
      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ opportunity_type: newOpportunityType || null })
        .eq("id", opportunity.id);

      if (error) throw error;

      // Update the local state
      setOpportunity((prev) =>
        prev
          ? ({
              ...prev,
              opportunity_type: newOpportunityType || undefined,
            } as any)
          : null,
      );

      setIsOpportunityTypeEditing(false);
    } catch (error) {
      console.error("Error updating opportunity type:", error);
      alert(
        "Failed to update opportunity type: " +
          (error instanceof Error ? error.message : "Please try again."),
      );
    }
  };

  // Select which letter proposal the quoted amount is pulled from (from view mode)
  const handleSelectLetterProposalSource = async (letterId: string) => {
    if (!opportunity?.id || !user) return;

    const selectedProposal = letterProposals.find(
      (p) => p.id === letterId,
    ) as any;
    const newQuotedAmount = selectedProposal
      ? parseMoneyValue(selectedProposal.net_30_price) ||
        extractNet30FromLetterHtml(selectedProposal.html)
      : null;

    setIsSavingLetterSelection(true);
    try {
      const updatePayload: Record<string, any> = {
        selected_letter_proposal: letterId || null,
        quoted_amount: newQuotedAmount,
      };

      // Keep opportunity_type in sync for acceptance categories
      let nextOpportunityType = (opportunity as any).opportunity_type;
      if (
        (nextOpportunityType === "large_acceptance" ||
          nextOpportunityType === "small_acceptance") &&
        newQuotedAmount !== null
      ) {
        nextOpportunityType =
          newQuotedAmount >= 100000 ? "large_acceptance" : "small_acceptance";
        updatePayload.opportunity_type = nextOpportunityType;
      }

      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .update(updatePayload)
        .eq("id", opportunity.id);

      if (error) throw error;

      setOpportunity((prev) =>
        prev
          ? ({
              ...prev,
              selected_letter_proposal: letterId || null,
              quoted_amount: newQuotedAmount ?? undefined,
              opportunity_type: nextOpportunityType,
            } as any)
          : null,
      );

      // Keep the edit form in sync in case the user opens edit mode next
      setEditFormData((prev) => ({
        ...prev,
        selected_letter_proposal: letterId || "",
        quoted_amount: newQuotedAmount ? newQuotedAmount.toString() : "",
        opportunity_type: nextOpportunityType ?? prev.opportunity_type,
      }));

      setLetterPickerOpen(false);
    } catch (error) {
      console.error("Error selecting letter proposal:", error);
      alert(
        "Failed to update letter proposal: " +
          (error instanceof Error ? error.message : "Please try again."),
      );
    } finally {
      setIsSavingLetterSelection(false);
    }
  };

  // Load saved letter proposals for this opportunity when the convert dialog opens
  useEffect(() => {
    (async () => {
      if (!confirmConvertToJobOpen || !opportunity?.id) return;
      try {
        const { data } = await supabase
          .schema("business")
          .from("letter_proposals")
          .select("id, title, created_at")
          .eq("opportunity_id", opportunity.id)
          .order("created_at", { ascending: false });
        setLettersForSelect(
          (data || []).map((l: any) => ({
            id: l.id,
            title: l.title || "Letter Proposal",
            created_at: l.created_at,
          })),
        );
      } catch {
        setLettersForSelect([]);
      }
    })();
  }, [confirmConvertToJobOpen, opportunity?.id]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !opportunity?.id) return;

    console.log("Starting file upload...", {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    setUploadingFile(true);
    try {
      // Upload file to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${opportunity.id}/${fileName}`;

      console.log("Uploading to path:", filePath);

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("job-documents")
        .upload(filePath, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      if (!uploadData) {
        throw new Error("Upload completed but no data returned");
      }

      console.log("Upload successful:", uploadData);

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("job-documents").getPublicUrl(filePath);

      console.log("Public URL generated:", publicUrl);

      // Save to database first to get the proper ID
      const { data: savedAgreement, error } = await supabase
        .schema("business")
        .from("subcontractor_agreements")
        .insert({
          opportunity_id: opportunity.id,
          user_id: user?.id,
          name: file.name,
          file_url: publicUrl,
          upload_date: new Date().toISOString(),
          status: "pending",
          description: "",
        })
        .select()
        .single();

      if (error) {
        console.error("Database insert error:", error);
        throw error;
      }

      console.log("Document saved to database:", savedAgreement);

      // Create new agreement object with the database-generated ID
      const newAgreement: SubcontractorAgreement = {
        id: savedAgreement.id,
        name: file.name,
        file_url: publicUrl,
        upload_date: new Date().toISOString(),
        status: "pending",
        description: "",
      };

      // Update agreements array
      const updatedAgreements = [...subcontractorAgreements, newAgreement];
      setSubcontractorAgreements(updatedAgreements);

      alert("Document uploaded successfully!");
    } catch (error) {
      console.error("Error uploading file:", error);
      alert(
        "Failed to upload document: " +
          (error instanceof Error ? error.message : "Please try again."),
      );
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteAgreement = async (agreementId: string) => {
    if (
      !opportunity?.id ||
      !confirm("Are you sure you want to delete this document?")
    )
      return;

    try {
      const updatedAgreements = subcontractorAgreements.filter(
        (agreement) => agreement.id !== agreementId,
      );
      setSubcontractorAgreements(updatedAgreements);

      const { error } = await supabase
        .schema("business")
        .from("subcontractor_agreements")
        .delete()
        .eq("id", agreementId);

      if (error) throw error;

      alert("Document deleted successfully!");
    } catch (error) {
      console.error("Error deleting agreement:", error);
      alert(
        "Failed to delete document: " +
          (error instanceof Error ? error.message : "Please try again."),
      );
    }
  };

  const handleUpdateAgreementStatus = async (
    agreementId: string,
    newStatus: SubcontractorAgreement["status"],
  ) => {
    if (!opportunity?.id) return;

    try {
      const updatedAgreements = subcontractorAgreements.map((agreement) =>
        agreement.id === agreementId
          ? { ...agreement, status: newStatus }
          : agreement,
      );
      setSubcontractorAgreements(updatedAgreements);

      const { error } = await supabase
        .schema("business")
        .from("subcontractor_agreements")
        .update({ status: newStatus })
        .eq("id", agreementId);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating agreement status:", error);
      alert(
        "Failed to update agreement status: " +
          (error instanceof Error ? error.message : "Please try again."),
      );
    }
  };

  const handlePreviewFile = (agreement: SubcontractorAgreement) => {
    setPreviewFile(agreement);
    setShowPreviewModal(true);
  };

  const getFileExtension = (fileName: string) => {
    return fileName.split(".").pop()?.toLowerCase() || "";
  };

  const isPreviewable = (fileName: string) => {
    const ext = getFileExtension(fileName);
    return ["pdf", "jpg", "jpeg", "png", "gif", "txt"].includes(ext);
  };

  const handleSavePDF = async (editedBlob: Blob) => {
    if (!previewFile || !opportunity?.id) {
      console.error("Missing previewFile or id:", { previewFile, id });
      return;
    }

    console.log("Starting PDF save to storage...", {
      fileName: previewFile.name,
      blobSize: editedBlob.size,
      blobType: editedBlob.type,
    });

    try {
      // Generate new filename for the updated version
      const fileExt = previewFile.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${opportunity.id}/${fileName}`;

      console.log("Uploading to path:", filePath);

      // Upload the modified PDF back to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("job-documents")
        .upload(filePath, editedBlob, {
          upsert: true,
          contentType: "application/pdf",
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      console.log("Upload successful:", uploadData);

      // Get the new public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("job-documents").getPublicUrl(filePath);

      console.log("Generated public URL:", publicUrl);

      // Update the agreement with the new file URL
      const updatedAgreements = subcontractorAgreements.map((agreement) =>
        agreement.id === previewFile.id
          ? {
              ...agreement,
              file_url: publicUrl,
              upload_date: new Date().toISOString(),
            }
          : agreement,
      );
      setSubcontractorAgreements(updatedAgreements);

      console.log("Updated agreements array:", updatedAgreements);

      // Save to database
      const { error: dbError } = await supabase
        .schema("business")
        .from("subcontractor_agreements")
        .update({ file_url: publicUrl, upload_date: new Date().toISOString() })
        .eq("id", previewFile.id);

      if (dbError) {
        console.error("Database update error:", dbError);
        throw dbError;
      }

      console.log("Database updated successfully");

      // Update the preview file state with the new URL
      const updatedPreviewFile = {
        ...previewFile,
        file_url: publicUrl,
        upload_date: new Date().toISOString(),
      };
      setPreviewFile(updatedPreviewFile);

      console.log("PDF save process completed successfully");
      console.log("Updated preview file URL:", publicUrl);

      // Close and reopen the preview to show the updated PDF
      setShowPreviewModal(false);

      // Small delay then reopen with updated file
      setTimeout(() => {
        setPreviewFile(updatedPreviewFile);
        setShowPreviewModal(true);
      }, 500);

      alert(
        "PDF saved successfully! The preview will refresh with the updated version.",
      );
    } catch (error) {
      console.error("Error saving PDF:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Failed to save PDF: ${errorMessage}`);
      throw error;
    }
  };

  async function handleDeleteOpportunity() {
    if (!opportunity || !user) return;
    try {
      // Unlink any jobs that reference this opportunity so the delete can succeed
      const { error: unlinkError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update({ opportunity_id: null })
        .eq("opportunity_id", opportunity.id);
      if (unlinkError) throw unlinkError;

      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .delete()
        .eq("id", opportunity.id);
      if (error) throw error;
      alert("Opportunity deleted.");
      navigate("/sales-dashboard/opportunities");
    } catch (err: any) {
      console.error("Error deleting opportunity:", err);
      alert(`Failed to delete: ${err?.message || "Unknown error"}`);
    } finally {
      setShowDeleteConfirm(false);
    }
  }

  async function handleDuplicateOpportunity() {
    if (!opportunity || !user) return;
    setIsDuplicating(true);
    try {
      const { data: recent, error: recentError } = await supabase
        .schema("business")
        .from("opportunities")
        .select("quote_number")
        .order("created_at", { ascending: false })
        .limit(500);

      if (recentError)
        console.warn("Error reading quote numbers:", recentError);

      const nums: number[] = (recent || [])
        .map((r: any) => r?.quote_number)
        .filter((q: any) => typeof q === "string" && /^[0-9]+$/.test(q))
        .map((q: string) => parseInt(q, 10))
        .filter((n: number) => Number.isFinite(n));

      const maxNumeric = nums.length ? Math.max(...nums) : 0;
      let nextQuoteNumber = Math.max(maxNumeric, 3802) + 1;

      const duplicateData: any = {
        customer_id: opportunity.customer_id,
        contact_id: opportunity.contact_id || null,
        title: `${opportunity.title || "Untitled"} (Copy)`,
        description: opportunity.description || "",
        status: "awareness",
        expected_value: opportunity.expected_value || 0,
        probability: opportunity.probability || 0,
        notes: opportunity.notes || "",
        amp_division: opportunity.amp_division || "",
        sales_person: user.email,
        user_id: user.id,
        quote_number: String(nextQuoteNumber),
        proposal_due_date: opportunity.proposal_due_date || null,
        reviewed_by: (opportunity as any).reviewed_by || null,
        prepared_by: (opportunity as any).prepared_by || null,
        jobsite_location: (opportunity as any).jobsite_location || null,
        estimated_start_date: (opportunity as any).estimated_start_date || null,
        estimated_end_date: (opportunity as any).estimated_end_date || null,
        period_of_performance:
          (opportunity as any).period_of_performance || null,
        total_man_hours: (opportunity as any).total_man_hours || null,
        opportunity_type: (opportunity as any).opportunity_type || "other",
        documents_stage: (opportunity as any).documents_stage || null,
        quoted_amount: (opportunity as any).quoted_amount || null,
      };

      let data: any = null;
      let error: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        ({ data, error } = await supabase
          .schema("business")
          .from("opportunities")
          .insert({ ...duplicateData, quote_number: String(nextQuoteNumber) })
          .select()
          .single());

        if (!error) break;
        if (error?.code === "42703") {
          const optionalDateColumns = [
            "proposal_due_date",
            "estimated_start_date",
            "estimated_end_date",
          ];
          const missingOptionalColumn =
            optionalDateColumns.find(
              (column) =>
                column in duplicateData &&
                (error?.message?.includes(`'${column}'`) ||
                  error?.message?.includes(`"${column}"`)),
            ) || optionalDateColumns.find((column) => column in duplicateData);
          if (missingOptionalColumn) {
            delete duplicateData[missingOptionalColumn];
            continue;
          }
        }
        if (error?.code === "23505") {
          nextQuoteNumber += 1;
          continue;
        }
        break;
      }

      if (error) throw error;

      const newOppId = data.id;
      const newQuoteNum = data.quote_number || String(nextQuoteNumber);

      // Duplicate estimates
      try {
        const { data: estimates } = await supabase
          .schema("business")
          .from("estimates")
          .select("data, travel_data, quote_number, status")
          .eq("opportunity_id", opportunity.id)
          .order("created_at", { ascending: true });

        if (estimates && estimates.length > 0) {
          const estimateInserts = estimates.map((est: any) => ({
            opportunity_id: newOppId,
            data: est.data,
            travel_data: est.travel_data,
            quote_number: est.quote_number,
            user_id: user.id,
            status: est.status || null,
          }));
          const { error: estErr } = await supabase
            .schema("business")
            .from("estimates")
            .insert(estimateInserts);
          if (estErr) console.warn("Could not duplicate estimates:", estErr);
        }
      } catch (estErr) {
        console.warn("Error duplicating estimates:", estErr);
      }

      // Duplicate letter proposals and remap selected_letter_proposal
      try {
        const { data: letters } = await supabase
          .schema("business")
          .from("letter_proposals")
          .select("id, title, html, neta_standard, quote_number")
          .eq("opportunity_id", opportunity.id)
          .order("created_at", { ascending: true });

        if (letters && letters.length > 0) {
          const oldSelectedId = (opportunity as any).selected_letter_proposal;
          let newSelectedId: string | null = null;

          for (const ltr of letters) {
            const { data: inserted, error: ltrErr } = await supabase
              .schema("business")
              .from("letter_proposals")
              .insert({
                opportunity_id: newOppId,
                title: ltr.title,
                html: ltr.html,
                neta_standard: (ltr as any).neta_standard || null,
                quote_number: newQuoteNum,
                created_at: new Date().toISOString(),
              })
              .select("id")
              .single();

            if (ltrErr) {
              console.warn("Could not duplicate letter proposal:", ltrErr);
              continue;
            }
            if (oldSelectedId && ltr.id === oldSelectedId && inserted) {
              newSelectedId = inserted.id;
            }
          }

          if (newSelectedId) {
            await supabase
              .schema("business")
              .from("opportunities")
              .update({ selected_letter_proposal: newSelectedId })
              .eq("id", newOppId);
          }
        }
      } catch (ltrErr) {
        console.warn("Error duplicating letter proposals:", ltrErr);
      }

      alert(
        "Opportunity duplicated successfully (including estimates & letter proposals)!",
      );
      navigate(`/sales-dashboard/opportunities/${newOppId}`);
    } catch (err: any) {
      console.error("Error duplicating opportunity:", err);
      alert(`Failed to duplicate: ${err?.message || "Unknown error"}`);
    } finally {
      setIsDuplicating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!opportunity) {
    return <div>Opportunity not found</div>;
  }

  const customer = customers.find((c) => c.id === opportunity.customer_id);

  const isEmbed = new URLSearchParams(location.search).get("embed") === "true";

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-dark-background">
      {!isEmbed && (
        <div className="bg-white shadow-sm p-4 mb-6 dark:bg-dark-150 dark:border-b dark:border-dark-200">
          <div className="flex items-center gap-3">
            <Link
              to="/sales-dashboard/opportunities"
              className="text-neutral-600 hover:text-neutral-900 dark:text-dark-400 dark:hover:text-dark-900 flex items-center"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Opportunities
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  adjacentOpportunityIds.previous &&
                  navigate(
                    `/sales-dashboard/opportunities/${adjacentOpportunityIds.previous}`,
                  )
                }
                disabled={!adjacentOpportunityIds.previous}
                aria-label="Previous Opportunity"
                title="Previous Opportunity"
                className="inline-flex h-9 w-9 items-center justify-center rounded-none border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-300 dark:text-dark-500 dark:hover:bg-dark-200 dark:hover:text-dark-900"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  adjacentOpportunityIds.next &&
                  navigate(
                    `/sales-dashboard/opportunities/${adjacentOpportunityIds.next}`,
                  )
                }
                disabled={!adjacentOpportunityIds.next}
                aria-label="Next Opportunity"
                title="Next Opportunity"
                className="inline-flex h-9 w-9 items-center justify-center rounded-none border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-dark-300 dark:text-dark-500 dark:hover:bg-dark-200 dark:hover:text-dark-900"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft estimate banner */}
      {isDraft && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-none mx-4 sm:mx-6 lg:mx-8 mb-4">
          <div className="flex items-center gap-3 py-3 px-4">
            <Pencil className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Draft Estimate
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This estimate isn't filed under an opportunity yet. Assign it to
                an existing opportunity or turn this draft into a new one.
              </p>
            </div>
            <button
              onClick={() => setShowAssignDraftPrompt(true)}
              className="flex-shrink-0 inline-flex items-center rounded-none bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
            >
              Assign to Opportunity
            </button>
            <button
              onClick={() => setIsDraft(false)}
              className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Assign draft estimate: pick existing opportunity or promote to new */}
      {showAssignDraftPrompt && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setShowAssignDraftPrompt(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-[71] w-full max-w-md mx-4 rounded-none bg-white dark:bg-dark-150 shadow-xl border border-neutral-200 dark:border-neutral-700 p-6"
          >
            <button
              type="button"
              onClick={() => setShowAssignDraftPrompt(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
              Assign this estimate
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Your estimate is saved. Where should it live?
            </p>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setShowAssignDraftPrompt(false);
                  setShowAssignExistingPicker(true);
                }}
                className="flex w-full items-center gap-3 rounded-none border border-neutral-200 dark:border-dark-300 p-4 text-left hover:border-brand hover:bg-orange-50 dark:hover:bg-dark-100 transition-colors"
              >
                <Building2 className="h-5 w-5 text-brand flex-shrink-0" />
                <div>
                  <div className="font-medium text-neutral-900 dark:text-white">
                    Add to Existing Opportunity
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Move this estimate onto one already in the pipeline
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={handlePromoteDraftToNew}
                className="flex w-full items-center gap-3 rounded-none border border-neutral-200 dark:border-dark-300 p-4 text-left hover:border-brand hover:bg-orange-50 dark:hover:bg-dark-100 transition-colors"
              >
                <FilePlus2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <div className="font-medium text-neutral-900 dark:text-white">
                    Add to New Opportunity
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Turn this draft into a new opportunity
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <CopyEstimateToOpportunityModal
        open={showAssignExistingPicker}
        onClose={() => setShowAssignExistingPicker(false)}
        currentOpportunityId={id || ""}
        isSaving={isAssigningDraft}
        onSelect={handleMoveDraftToExisting}
        title="Add Estimate to Opportunity"
        selectLabel="Add here"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-dark-150 shadow-md rounded-none overflow-hidden">
          {mergedIds.length > 0 && (
            <div className="px-4 py-3 border-b border-blue-200 bg-blue-50 text-blue-900">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  Merged Opportunities: {mergedIds.join(", ")}
                </div>
                <div className="text-xs">
                  Primary:{" "}
                  <span className="font-semibold">
                    {primaryIdParam || opportunity.id}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-blue-800">
                Converting to a job will bundle these into a single job (based
                on primary).
              </p>
            </div>
          )}
          <div className="flex justify-between items-center p-4 border-b border-neutral-300 dark:border-dark-300">
            <div className="flex items-center">
              <h2 className="text-xl font-semibold text-neutral-800 dark:text-dark-800">
                {opportunity.quote_number}: {opportunity.title}
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              {mergedIds.length > 0 && !!groupLockJobId && (
                <Link
                  to={`/jobs/${groupLockJobId}`}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View Shared Job #{groupLockJobId}
                </Link>
              )}
              {opportunity.job_id && (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2 bg-green-100 text-green-800 rounded-none text-sm font-medium dark:bg-green-900 dark:text-green-200">
                    ✓ Converted to Job
                  </span>
                  <Link
                    to={`/jobs/${opportunity.job_id}`}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    View Job
                  </Link>
                </div>
              )}
              {!isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-800 transition-colors flex items-center">
                      Manage Opportunity
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => beginEditOpportunity()}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Opportunity
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={isDuplicating}
                      onSelect={handleDuplicateOpportunity}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {isDuplicating
                        ? "Duplicating..."
                        : "Duplicate Opportunity"}
                    </DropdownMenuItem>
                    {!opportunity.job_id && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer"
                          disabled={mergedIds.length > 0 && !!groupLockJobId}
                          onSelect={() => setConfirmConvertToJobOpen(true)}
                        >
                          <Award className="h-4 w-4 mr-2" />
                          {mergedIds.length > 0 && !!groupLockJobId
                            ? "Locked (already converted)"
                            : "Convert to Job"}
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                      onSelect={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Opportunity
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {(mergedIds.length > 0 || savedMergeIds.length > 1) &&
            mergedList.length > 0 && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Merged Opportunities
                  </div>
                  <div className="space-x-2">
                    {mergedList.map((m) => {
                      const isPrimary =
                        String(m.id) ===
                        (primaryIdParam ||
                          savedPrimaryId ||
                          String(opportunity.id));
                      return (
                        <button
                          key={String(m.id)}
                          onClick={() => {
                            if (id === "merge") {
                              const params = new URLSearchParams(
                                location.search,
                              );
                              params.set("primary", String(m.id));
                              navigate(
                                `/sales-dashboard/opportunities/merge?${params.toString()}`,
                              );
                            } else if (savedMergeIds.length > 1) {
                              // Navigate to merge view using saved IDs when in normal view
                              const params = new URLSearchParams();
                              params.set("ids", savedMergeIds.join(","));
                              params.set("primary", String(m.id));
                              navigate(
                                `/sales-dashboard/opportunities/merge?${params.toString()}`,
                              );
                            }
                          }}
                          className={`text-xs px-3 py-1 rounded ${isPrimary ? "bg-blue-600 text-white" : "bg-neutral-100 dark:bg-dark-150 text-neutral-700 dark:text-neutral-200"}`}
                        >
                          {m.quote_number}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {mergedList.map((m) => {
                    const isPrimary =
                      String(m.id) ===
                      (primaryIdParam || String(opportunity.id));
                    return (
                      <div
                        key={String(m.id)}
                        className={`border rounded-none p-3 bg-white dark:bg-dark-150 ${isPrimary ? "ring-2 ring-blue-400" : ""}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                            {m.quote_number}
                          </div>
                          {isPrimary ? (
                            <span className="text-xs px-2 py-0.5 rounded-none bg-blue-100 text-blue-800">
                              Primary
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                const params = new URLSearchParams(
                                  location.search,
                                );
                                params.set("primary", String(m.id));
                                navigate(
                                  `/sales-dashboard/opportunities/merge?${params.toString()}`,
                                );
                              }}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Make Primary
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-neutral-600 dark:text-white mb-2">
                          {m.customers?.company_name ||
                            m.customers?.name ||
                            "Unknown Customer"}
                        </div>
                        <div className="text-sm text-neutral-800 dark:text-neutral-200 line-clamp-2">
                          {m.title}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-neutral-600 dark:text-white">
                          <div>
                            <span className="text-neutral-500 dark:text-white">
                              Status:
                            </span>{" "}
                            {m.status}
                          </div>
                          <div>
                            <span className="text-neutral-500 dark:text-white">
                              Created:
                            </span>{" "}
                            {m.opportunity_created_date
                              ? formatDateSafe(m.opportunity_created_date)
                              : "-"}
                          </div>
                          {/* Removed Expected Value from merge cards */}
                          <div>
                            <span className="text-neutral-500 dark:text-white">
                              Probability:
                            </span>{" "}
                            {m.probability != null ? `${m.probability}%` : "-"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Success Message */}
          {showSuccessMessage && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-none p-4 mb-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-green-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    {showSuccessMessage}
                  </p>
                  {jobId && (
                    <div className="mt-2">
                      <Link
                        to={`/jobs/${jobId}`}
                        className="text-sm text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 underline"
                      >
                        View Job #{jobId} →
                      </Link>
                    </div>
                  )}
                </div>
                <div className="ml-auto pl-3">
                  <button
                    type="button"
                    className="inline-flex text-green-400 hover:text-green-600 dark:text-green-300 dark:hover:text-green-100"
                    onClick={() => setShowSuccessMessage(null)}
                  >
                    <span className="sr-only">Dismiss</span>
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="p-6">
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                    Customer
                  </label>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customers (name or company)"
                    className="mt-1 mb-2 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                  />
                  {editFormData.customer_id && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                      Selected:{" "}
                      {customers.find((c) => c.id === editFormData.customer_id)
                        ?.company_name ||
                        customers.find((c) => c.id === editFormData.customer_id)
                          ?.name ||
                        "Unknown"}
                      <button
                        type="button"
                        className="ml-2 underline text-brand hover:text-brand/90"
                        onClick={() => {
                          setEditFormData((prev) => ({
                            ...prev,
                            customer_id: "",
                            contact_id: null,
                          }));
                          setAvailableContacts([]);
                          setCustomerSearch("");
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  <div className="max-h-48 overflow-y-auto border border-neutral-300 dark:border-neutral-600 rounded-none">
                    {customers
                      .filter(
                        (customer) =>
                          customer.company_name
                            ?.toLowerCase()
                            .includes(customerSearch.toLowerCase()) ||
                          customer.name
                            ?.toLowerCase()
                            .includes(customerSearch.toLowerCase()),
                      )
                      .slice(0, 20)
                      .map((customer) => {
                        const isSelected =
                          editFormData.customer_id === customer.id;
                        return (
                          <button
                            type="button"
                            key={customer.id}
                            onClick={() => {
                              setEditFormData((prev) => ({
                                ...prev,
                                customer_id: customer.id,
                                contact_id: null,
                              }));
                              fetchContactsForCustomer(customer.id);
                              setCustomerSearch("");
                            }}
                            className={`w-full text-left px-3 py-2 text-sm ${
                              isSelected
                                ? "bg-orange-50 text-neutral-900 dark:bg-orange-900/20 dark:text-white"
                                : "hover:bg-neutral-50 dark:hover:bg-dark-200 text-neutral-700 dark:text-neutral-200"
                            }`}
                          >
                            {customer.company_name || customer.name}
                          </button>
                        );
                      })}
                    {customers.filter(
                      (customer) =>
                        customer.company_name
                          ?.toLowerCase()
                          .includes(customerSearch.toLowerCase()) ||
                        customer.name
                          ?.toLowerCase()
                          .includes(customerSearch.toLowerCase()),
                    ).length === 0 &&
                      customerSearch && (
                        <div className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
                          No matches
                        </div>
                      )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                    Contact
                  </label>
                  <select
                    name="contact_id"
                    value={editFormData.contact_id || ""}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        contact_id: e.target.value || null,
                      }))
                    }
                    className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    disabled={!editFormData.customer_id}
                  >
                    <option
                      value=""
                      className="dark:bg-dark-150 dark:text-white"
                    >
                      No Contact
                    </option>
                    {availableContacts.map((contact) => (
                      <option
                        key={contact.id}
                        value={contact.id}
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        {contact.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="title"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Title
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={editFormData.title}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={editFormData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="expected_value"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Expected Value ($)
                    </label>
                    <input
                      type="number"
                      id="expected_value"
                      name="expected_value"
                      value={editFormData.expected_value}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="probability"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Probability (%)
                    </label>
                    <input
                      type="number"
                      id="probability"
                      name="probability"
                      value={editFormData.probability}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="status"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={editFormData.status}
                      onChange={handleInputChange}
                      required
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    >
                      <option
                        value="awareness"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Awareness
                      </option>
                      <option
                        value="interest"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Interest
                      </option>
                      <option
                        value="quote"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Quote
                      </option>
                      <option
                        value="decision"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Decision
                      </option>
                      <option
                        value="decision - forecasted win"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Decision - Forecasted Win
                      </option>
                      <option
                        value="decision - forecast lose"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Decision - Forecast Lose
                      </option>
                      <option
                        value="awarded"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Awarded
                      </option>
                      <option
                        value="lost"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Lost
                      </option>
                      <option
                        value="no quote"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        No Quote
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="opportunity_created_date"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Opportunity Created Date
                    </label>
                    <input
                      type="date"
                      id="opportunity_created_date"
                      name="opportunity_created_date"
                      value={editFormData.opportunity_created_date || ""}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="letter_proposal_date"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Letter Proposal Date
                    </label>
                    <input
                      type="date"
                      id="letter_proposal_date"
                      name="letter_proposal_date"
                      value={editFormData.letter_proposal_date || ""}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="proposal_due_date"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Proposal Due Date
                    </label>
                    <input
                      type="date"
                      id="proposal_due_date"
                      name="proposal_due_date"
                      value={editFormData.proposal_due_date || ""}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="amp_division"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      AMP Division
                    </label>
                    <select
                      id="amp_division"
                      name="amp_division"
                      value={editFormData.amp_division}
                      onChange={handleInputChange}
                      required
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    >
                      <option
                        value=""
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Select a division
                      </option>
                      <option
                        value="north_alabama"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Decatur
                      </option>
                      <option
                        value="tennessee"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Nashville
                      </option>
                      <option
                        value="georgia"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Atlanta
                      </option>
                      <option
                        value="international"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        International
                      </option>
                      <option
                        value="engineering"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Engineering
                      </option>
                      <option
                        value="scavenger"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Scavenger
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="opportunity_type"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Opportunity Type
                    </label>
                    <select
                      id="opportunity_type"
                      name="opportunity_type"
                      value={editFormData.opportunity_type}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    >
                      <option
                        value="large_acceptance"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Large Acceptance Project
                      </option>
                      <option
                        value="small_acceptance"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Small Acceptance Project
                      </option>
                      <option
                        value="maintenance"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Maintenance Project
                      </option>
                      <option
                        value="engineering"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Engineering
                      </option>
                      <option
                        value="other"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Other
                      </option>
                    </select>
                    {(editFormData.opportunity_type === "large_acceptance" ||
                      editFormData.opportunity_type === "small_acceptance") && (
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Auto-adjusts based on quoted amount (Small &lt;$100k,
                        Large ≥$100k)
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="documents_stage"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Documents Stage
                    </label>
                    <select
                      id="documents_stage"
                      name="documents_stage"
                      value={editFormData.documents_stage || ""}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    >
                      <option
                        value=""
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Select Documents Stage
                      </option>
                      <option
                        value="Budgetary"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Budgetary
                      </option>
                      <option
                        value="Not available"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Not available
                      </option>
                      <option
                        value="Design Development"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Design Development
                      </option>
                      <option
                        value="Issue for Proposal"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Issue for Proposal
                      </option>
                      <option
                        value="Issue for Construction"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Issue for Construction
                      </option>
                      <option
                        value="Post Construction"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        Post Construction
                      </option>
                      <option
                        value="30%"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        30%
                      </option>
                      <option
                        value="60%"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        60%
                      </option>
                      <option
                        value="90%"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        90%
                      </option>
                      <option
                        value="95%"
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        95%
                      </option>
                    </select>
                  </div>
                </div>

                {letterProposals.length > 0 && (
                  <div>
                    <label
                      htmlFor="selected_letter_proposal"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Letter Proposal Source
                    </label>
                    <select
                      id="selected_letter_proposal"
                      name="selected_letter_proposal"
                      value={editFormData.selected_letter_proposal}
                      onChange={handleLetterProposalChange}
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    >
                      <option
                        value=""
                        className="dark:bg-dark-150 dark:text-white"
                      >
                        None (manual entry)
                      </option>
                      {letterProposals.map((lp) => {
                        const lpAmount =
                          parseMoneyValue(lp.net_30_price) ||
                          extractNet30FromLetterHtml(lp.html);
                        const label = [
                          lp.title ||
                            `Letter ${lp.letter_number || lp.id?.slice(0, 8)}`,
                          lpAmount ? `(${formatMoney(lpAmount)})` : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <option
                            key={lp.id}
                            value={lp.id}
                            className="dark:bg-dark-150 dark:text-white"
                          >
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Selecting a letter proposal will auto-fill the quoted
                      amount below. You can still adjust it manually.
                    </p>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="quoted_amount"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Quoted Amount (NET 30) ($)
                  </label>
                  <input
                    type="number"
                    id="quoted_amount"
                    name="quoted_amount"
                    value={editFormData.quoted_amount}
                    onChange={handleInputChange}
                    className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                    placeholder="Enter NET 30 price"
                  />
                  {editFormData.selected_letter_proposal &&
                    !editFormData.quoted_amount && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Selected letter proposal has no NET 30 amount. Please
                        enter manually.
                      </p>
                    )}
                </div>

                <div>
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={editFormData.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="reviewed_by"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Reviewed By
                    </label>
                    <input
                      type="text"
                      id="reviewed_by"
                      name="reviewed_by"
                      value={editFormData.reviewed_by}
                      onChange={handleInputChange}
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                      placeholder="Enter reviewer name"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="prepared_by"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Quote Prepared By (Auto-populated)
                    </label>
                    <input
                      type="text"
                      id="prepared_by"
                      name="prepared_by"
                      value={quotePreparedBy || editFormData.prepared_by}
                      onChange={handleInputChange}
                      readOnly
                      className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm bg-neutral-100 dark:bg-dark-200 dark:text-white cursor-not-allowed"
                      placeholder="Auto-populated from quote creators"
                    />
                  </div>
                </div>

                {/* Job Information Section */}
                <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                  <h4 className="text-lg font-medium text-neutral-900 dark:text-white mb-4">
                    Job Information
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="jobsite_location"
                        className="block text-sm font-medium text-neutral-700 dark:text-white"
                      >
                        Jobsite Location / Address
                      </label>
                      <input
                        type="text"
                        id="jobsite_location"
                        name="jobsite_location"
                        value={editFormData.jobsite_location}
                        onChange={handleInputChange}
                        className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                        placeholder="Enter jobsite address"
                      />
                    </div>

                    {/* Accepted Letter Proposal */}
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Accepted Letter Proposal
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {(() => {
                          const selectedId =
                            (opportunity as any).selected_letter_proposal || "";
                          let sel = selectedId
                            ? letterProposals.find((lp) => lp.id === selectedId)
                            : undefined;
                          // Regressive fallback: if not set, show most recent saved letter for this opportunity
                          if (!sel && letterProposals.length > 0) {
                            sel = letterProposals[0];
                          }
                          return sel
                            ? sel.title ||
                                `Letter ${sel.letter_number || sel.id?.slice(0, 8)}${selectedId ? "" : " (latest)"}`
                            : "Not specified";
                        })()}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="estimated_start_date"
                          className="block text-sm font-medium text-neutral-700 dark:text-white"
                        >
                          Start Date
                        </label>
                        <input
                          type="date"
                          id="estimated_start_date"
                          name="estimated_start_date"
                          value={editFormData.estimated_start_date}
                          onChange={handleInputChange}
                          className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="estimated_end_date"
                          className="block text-sm font-medium text-neutral-700 dark:text-white"
                        >
                          End Date
                        </label>
                        <input
                          type="date"
                          id="estimated_end_date"
                          name="estimated_end_date"
                          value={editFormData.estimated_end_date}
                          onChange={handleInputChange}
                          min={editFormData.estimated_start_date || undefined}
                          className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="period_of_performance"
                        className="block text-sm font-medium text-neutral-700 dark:text-white"
                      >
                        Period of Performance
                      </label>
                      <input
                        type="text"
                        id="period_of_performance"
                        name="period_of_performance"
                        value={editFormData.period_of_performance}
                        onChange={handleInputChange}
                        className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                        placeholder="e.g., 2 weeks, 30 days"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                        Total Man Hours
                      </label>
                      <div className="space-y-3">
                        {/* Quote Selection */}
                        {availableQuotes.length > 0 ? (
                          <div className="border border-neutral-300 dark:border-neutral-600 rounded-none p-3">
                            <p className="text-sm font-medium text-neutral-700 dark:text-white mb-2">
                              Select Estimates to Calculate Hours:
                            </p>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {availableQuotes.map((quote) => (
                                <label
                                  key={quote.id}
                                  className="flex items-center space-x-2"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedQuoteIds.includes(
                                      quote.id,
                                    )}
                                    onChange={(e) =>
                                      handleQuoteSelectionChange(
                                        quote.id,
                                        e.target.checked,
                                      )
                                    }
                                    className="h-4 w-4 text-brand focus:ring-brand border-neutral-300 rounded"
                                  />
                                  <span className="text-sm text-neutral-700 dark:text-white">
                                    {quote.title} (
                                    {quote.totalManHours.toFixed(1)} hours)
                                  </span>
                                </label>
                              ))}
                            </div>
                            {selectedQuoteIds.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-600">
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                  {selectedQuoteIds.length} estimate
                                  {selectedQuoteIds.length !== 1
                                    ? "s"
                                    : ""}{" "}
                                  selected
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
                            No estimates available. Create an estimate to
                            calculate man hours automatically.
                          </p>
                        )}

                        {/* Manual Input Field */}
                        <div>
                          <label
                            htmlFor="total_man_hours"
                            className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1"
                          >
                            Total Hours (calculated from selected estimates or
                            enter manually):
                          </label>
                          <input
                            type="number"
                            id="total_man_hours"
                            name="total_man_hours"
                            value={editFormData.total_man_hours}
                            onChange={handleInputChange}
                            className="block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm focus:outline-none focus:ring-brand focus:border-brand dark:bg-dark-150 dark:text-white"
                            placeholder="0"
                            min="0"
                            step="0.1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    className="mr-3 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-white bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm hover:bg-neutral-50 dark:hover:bg-dark-200 focus:outline-none disabled:opacity-50"
                    onClick={() => setIsEditing(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand border border-transparent rounded-none shadow-sm hover:bg-brand/90 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-neutral-900 dark:text-dark-900 mb-3">
                    Opportunity Details
                  </h3>
                  <div className="bg-white dark:bg-dark-150 shadow-sm rounded-none border border-neutral-200 dark:border-dark-300 p-4">
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Quote Number
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {opportunity.quote_number}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Customer
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {customer?.company_name || customer?.name}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Contact
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {(() => {
                          const c = contacts.find(
                            (c) => c.id === (opportunity as any).contact_id,
                          );
                          return c ? (
                            <span>
                              {c.name} {c.email ? `• ${c.email}` : ""}
                            </span>
                          ) : (
                            "No contact linked"
                          );
                        })()}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Title
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {opportunity.title}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Description
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900 whitespace-pre-line">
                        {opportunity.description || "No description"}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Estimate Approval
                      </p>
                      <p className="text-xs text-neutral-400 dark:text-dark-500 mt-0.5 mb-1">
                        In Progress = working on the estimate. No Quote = not
                        submitting a quote for this opportunity.
                      </p>
                      {latestEstimateId && !isEstimateApprovalEditing ? (
                        <button
                          onClick={() => setIsEstimateApprovalEditing(true)}
                          className="mt-1"
                        >
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-none ${getEstimateApprovalColor(estimateApprovalStatus)}`}
                          >
                            {formatEstimateApprovalStatus(
                              estimateApprovalStatus,
                            )}
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </span>
                        </button>
                      ) : (
                        <div className="relative mt-1">
                          <select
                            value={
                              estimateApprovalStatus === "no quote"
                                ? "no_quote"
                                : (estimateApprovalStatus ?? "")
                            }
                            onChange={(e) =>
                              handleEstimateApprovalStatusChange(e.target.value)
                            }
                            disabled={isSavingEstimateStatus}
                            className="block w-full pl-3 pr-10 py-1 text-xs rounded-none appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500 border border-neutral-200 dark:border-neutral-600 dark:bg-dark-150 dark:text-white"
                            autoFocus={latestEstimateId != null}
                            onBlur={() =>
                              latestEstimateId &&
                              !isSavingEstimateStatus &&
                              setIsEstimateApprovalEditing(false)
                            }
                          >
                            <option value="">Not Started</option>
                            <option
                              value="in_progress"
                              title="Working on the estimate"
                            >
                              In Progress — working on estimate
                            </option>
                            <option value="ready_for_review">
                              Ready for Review
                            </option>
                            <option value="approved_to_send">
                              Approved to Send
                            </option>
                            <option value="sent">Sent</option>
                            <option
                              value="no_quote"
                              title="Not submitting a quote for this opportunity"
                            >
                              No Quote — not submitting
                            </option>
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none text-neutral-500" />
                          {isSavingEstimateStatus && (
                            <span className="text-xs text-neutral-500 dark:text-dark-400 ml-2">
                              Saving...
                            </span>
                          )}
                        </div>
                      )}
                      {!latestEstimateId && (
                        <p className="text-neutral-500 dark:text-dark-500 text-xs mt-1.5">
                          Set status above or{" "}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveEstimateId(null);
                              setShowEstimate("new");
                            }}
                            className="text-brand hover:underline font-medium"
                          >
                            Open Estimate
                          </button>{" "}
                          to build a full quote.
                        </p>
                      )}
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Status
                      </p>
                      {isStatusEditing ? (
                        <div className="relative mt-1">
                          <select
                            value={opportunity.status}
                            onChange={(e) => handleStatusChange(e.target.value)}
                            className="block w-full pl-3 pr-10 py-1 text-xs rounded-none appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500 border border-neutral-200"
                            autoFocus
                            onBlur={() => setIsStatusEditing(false)}
                          >
                            <option value="awareness">Awareness</option>
                            <option value="interest">Interest</option>
                            <option value="quote">Quote</option>
                            <option value="decision">Decision</option>
                            <option value="decision - forecasted win">
                              Decision - Forecasted Win
                            </option>
                            <option value="decision - forecast lose">
                              Decision - Forecast Lose
                            </option>
                            <option value="awarded">Awarded</option>
                            <option value="lost">Lost</option>
                            <option value="no quote">No Quote</option>
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none text-neutral-500" />
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsStatusEditing(true)}
                          className="mt-1"
                        >
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-none ${getStatusColor(opportunity.status)}`}
                          >
                            {formatStatus(opportunity.status)}
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </span>
                        </button>
                      )}
                      {opportunity.status !== "awarded" &&
                        opportunity.status !== "lost" &&
                        !opportunity.job_id && (
                          <p className="text-xs text-neutral-500 dark:text-white mt-1">
                            Change status above or use "Convert to Job" button
                            to create a job
                          </p>
                        )}
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Accepted Letter Proposal
                      </p>
                      <p className="text-sm text-neutral-900 dark:text-dark-900">
                        {(() => {
                          const selectedId =
                            (opportunity as any).selected_letter_proposal || "";
                          let sel = selectedId
                            ? letterProposals.find((lp) => lp.id === selectedId)
                            : undefined;
                          if (!sel && letterProposals.length > 0)
                            sel = letterProposals[0];
                          return sel
                            ? sel.title ||
                                `Letter ${sel.letter_number || sel.id?.slice(0, 8)}${selectedId ? "" : " (latest)"}`
                            : "Not specified";
                        })()}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        AMP Division
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {opportunity.amp_division ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              if (opportunity.amp_division) {
                                setSelectedDivision(opportunity.amp_division);
                                setShowDivisionAnalytics(true);
                              }
                            }}
                            className="text-brand hover:text-brand/90 dark:text-brand dark:hover:text-brand/90"
                          >
                            {formatDivisionName(opportunity.amp_division)}
                          </button>
                        ) : (
                          "Not specified"
                        )}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Opportunity Type
                      </p>
                      {isOpportunityTypeEditing ? (
                        <div className="relative mt-1">
                          <select
                            value={(() => {
                              let type = (opportunity as any).opportunity_type;
                              // If no type is set, infer from quoted amount
                              if (!type) {
                                const quotedAmount = (opportunity as any)
                                  .quoted_amount;
                                if (quotedAmount && Number(quotedAmount) > 0) {
                                  type =
                                    Number(quotedAmount) >= 100000
                                      ? "large_acceptance"
                                      : "small_acceptance";
                                }
                              }
                              return type || "other";
                            })()}
                            onChange={(e) =>
                              handleOpportunityTypeChange(e.target.value)
                            }
                            className="block w-full pl-3 pr-10 py-1 text-sm rounded-none appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500 border border-neutral-200 dark:border-neutral-600 dark:bg-dark-150 dark:text-white"
                            autoFocus
                            onBlur={() => setIsOpportunityTypeEditing(false)}
                          >
                            <option value="large_acceptance">
                              Large Acceptance Project
                            </option>
                            <option value="small_acceptance">
                              Small Acceptance Project
                            </option>
                            <option value="maintenance">
                              Maintenance Project
                            </option>
                            <option value="engineering">Engineering</option>
                            <option value="time_materials">
                              Time & Materials (T&M)
                            </option>
                            <option value="other">Other</option>
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none text-neutral-500" />
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsOpportunityTypeEditing(true)}
                          className="mt-1 text-left"
                        >
                          <span className="text-neutral-900 dark:text-dark-900 hover:text-brand dark:hover:text-brand">
                            {(() => {
                              let type = (opportunity as any).opportunity_type;

                              // If no type is set, infer from quoted amount
                              if (!type) {
                                const quotedAmount = (opportunity as any)
                                  .quoted_amount;
                                if (quotedAmount && Number(quotedAmount) > 0) {
                                  type =
                                    Number(quotedAmount) >= 100000
                                      ? "large_acceptance"
                                      : "small_acceptance";
                                }
                              }

                              switch (type) {
                                case "large_acceptance":
                                  return "Large Acceptance Project";
                                case "small_acceptance":
                                  return "Small Acceptance Project";
                                case "maintenance":
                                  return "Maintenance Project";
                                case "engineering":
                                  return "Engineering";
                                case "time_materials":
                                  return "Time & Materials (T&M)";
                                case "other":
                                  return "Other";
                                default:
                                  return "Not specified";
                              }
                            })()}
                            <ChevronDown className="ml-1 h-3 w-3 inline" />
                          </span>
                        </button>
                      )}
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Documents Stage
                      </p>
                      {isDocumentsStageEditing ? (
                        <div className="relative mt-1">
                          <select
                            value={(opportunity as any).documents_stage || ""}
                            onChange={(e) =>
                              handleDocumentsStageChange(e.target.value)
                            }
                            className="block w-full pl-3 pr-10 py-1 text-sm rounded-none appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500 border border-neutral-200 dark:border-neutral-600 dark:bg-dark-150 dark:text-white"
                            autoFocus
                            onBlur={() => setIsDocumentsStageEditing(false)}
                          >
                            <option value="">Not specified</option>
                            <option value="Budgetary">Budgetary</option>
                            <option value="Not available">Not available</option>
                            <option value="Design Development">
                              Design Development
                            </option>
                            <option value="Issue for Proposal">
                              Issue for Proposal
                            </option>
                            <option value="Issue for Construction">
                              Issue for Construction
                            </option>
                            <option value="Post Construction">
                              Post Construction
                            </option>
                            <option value="30%">30%</option>
                            <option value="60%">60%</option>
                            <option value="90%">90%</option>
                            <option value="95%">95%</option>
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none text-neutral-500" />
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsDocumentsStageEditing(true)}
                          className="mt-1 text-left"
                        >
                          <span className="text-neutral-900 dark:text-dark-900 hover:text-brand dark:hover:text-brand">
                            {(opportunity as any).documents_stage ||
                              "Not specified"}
                            <ChevronDown className="ml-1 h-3 w-3 inline" />
                          </span>
                        </button>
                      )}
                    </div>
                    {(() => {
                      // Only show job status if job_id exists and job is not deleted
                      if (opportunity.job_id) {
                        return (
                          <div className="mb-4">
                            <p className="text-sm text-neutral-500 dark:text-dark-400">
                              Job Status
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-none bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                Converted to Job
                              </span>
                              <Link
                                to={`/jobs/${opportunity.job_id}`}
                                className="text-brand hover:text-brand/90 dark:text-brand dark:hover:text-brand/90 text-sm"
                              >
                                View Job #{opportunity.job_id}
                              </Link>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-neutral-900 dark:text-dark-900 mb-3">
                    Financial & Timeline
                  </h3>
                  <div className="bg-white dark:bg-dark-150 shadow-sm rounded-none border border-neutral-200 dark:border-dark-300 p-4">
                    {/* Expected Value removed from details view */}
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Probability
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {opportunity.probability !== null &&
                        opportunity.probability !== undefined
                          ? `${opportunity.probability}%`
                          : "Not specified"}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Quoted Amount (NET 30)
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          letterProposals.length > 0 &&
                          setLetterPickerOpen(true)
                        }
                        disabled={letterProposals.length === 0}
                        title={
                          letterProposals.length > 0
                            ? "Click to choose which letter proposal this amount is pulled from"
                            : undefined
                        }
                        className={`group flex w-full items-center gap-1 rounded-none px-1 -mx-1 text-left text-neutral-900 dark:text-dark-900 ${
                          letterProposals.length > 0
                            ? "cursor-pointer hover:bg-neutral-50 dark:hover:bg-dark-200"
                            : "cursor-default"
                        }`}
                      >
                        <span className="flex-1">
                        {(() => {
                          const selectedId =
                            (opportunity as any).selected_letter_proposal || "";
                          const selectedLetter = selectedId
                            ? letterProposals.find(
                                (letter) => letter.id === selectedId,
                              )
                            : null;

                          // If a specific letter is selected, use it
                          const sourceLetter =
                            selectedLetter ||
                            (letterProposals.length > 0
                              ? letterProposals[0]
                              : null);

                          if (!sourceLetter) {
                            return (
                              <span className="text-neutral-400 dark:text-neutral-500 italic">
                                No letter proposal generated
                              </span>
                            );
                          }

                          const letterAmount =
                            parseMoneyValue(sourceLetter.net_30_price) ||
                            extractNet30FromLetterHtml(sourceLetter.html);

                          const letterLabel =
                            sourceLetter.title ||
                            `Letter ${sourceLetter.letter_number || sourceLetter.id?.slice(0, 8)}`;

                          const isSelected = !!selectedLetter;

                          if (!letterAmount) {
                            return (
                              <span className="text-amber-600 dark:text-amber-400">
                                No NET 30 amount found in{" "}
                                {isSelected ? "selected" : "latest"} letter
                                proposal
                              </span>
                            );
                          }

                          return (
                            <>
                              <span className="text-lg font-semibold">
                                {formatMoney(letterAmount)}
                              </span>
                              <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">
                                from {isSelected ? "" : "latest "}
                                {letterLabel}
                                {letterProposals.length > 1
                                  ? " (click to change)"
                                  : ""}
                              </span>
                            </>
                          );
                        })()}
                        </span>
                        {letterProposals.length > 0 && (
                          <ChevronDown className="h-4 w-4 flex-shrink-0 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </button>
                    </div>
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-neutral-500 dark:text-dark-400">
                          Include in weekly bid total
                        </p>
                        <p className="text-xs text-neutral-400 dark:text-neutral-500">
                          Turn off to exclude this quote from the Sales
                          Dashboard total (e.g. same project quoted to another
                          customer).
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!opportunity.exclude_from_quoted_total}
                        onClick={() =>
                          handleToggleExcludeFromTotal(
                            !opportunity.exclude_from_quoted_total,
                          )
                        }
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-none transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:focus:ring-offset-dark-150 ${
                          opportunity.exclude_from_quoted_total
                            ? "bg-neutral-300 dark:bg-neutral-600"
                            : "bg-brand"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-none bg-white transition-transform ${
                            opportunity.exclude_from_quoted_total
                              ? "translate-x-1"
                              : "translate-x-6"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm text-neutral-500 dark:text-dark-400">
                          Opportunity Created Date
                        </p>
                        <p className="text-neutral-900 dark:text-dark-900">
                          {opportunity.opportunity_created_date
                            ? formatDateSafe(
                                opportunity.opportunity_created_date,
                              )
                            : "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-neutral-500 dark:text-dark-400">
                          Opportunity Created By
                        </p>
                        <p className="text-neutral-900 dark:text-dark-900">
                          {opportunityCreator || "Not specified"}
                        </p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Letter Proposal Date
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {opportunity.letter_proposal_date
                          ? formatDateSafe(opportunity.letter_proposal_date)
                          : "Not generated yet"}
                      </p>
                    </div>
                    {opportunity.proposal_due_date && (
                      <div className="mb-4">
                        <p className="text-sm text-neutral-500 dark:text-dark-400">
                          Proposal Due Date
                        </p>
                        <p className="text-neutral-900 dark:text-dark-900">
                          {formatDateSafe(opportunity.proposal_due_date)}
                        </p>
                      </div>
                    )}
                    {opportunity.awarded_date && (
                      <div className="mb-4">
                        <p className="text-sm text-neutral-500 dark:text-dark-400">
                          Awarded Date
                        </p>
                        <p className="text-neutral-900 dark:text-dark-900">
                          {formatDateSafe(opportunity.awarded_date)}
                        </p>
                      </div>
                    )}
                    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-sm text-neutral-500 dark:text-dark-400">
                          Start Date
                        </p>
                        <p className="text-neutral-900 dark:text-dark-900">
                          {(opportunity as any).estimated_start_date
                            ? formatDateSafe(
                                (opportunity as any).estimated_start_date,
                              )
                            : "Not specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-neutral-500 dark:text-dark-400">
                          End Date
                        </p>
                        <p className="text-neutral-900 dark:text-dark-900">
                          {(opportunity as any).estimated_end_date
                            ? formatDateSafe(
                                (opportunity as any).estimated_end_date,
                              )
                            : "Not specified"}
                        </p>
                      </div>
                    </div>
                    {/* Removed duplicate Proposal Due Date block (already shown above) */}
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Reviewed By
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {(opportunity as any).reviewed_by || "Not specified"}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Quote Prepared By
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {quotePreparedBy ||
                          (opportunity as any).prepared_by ||
                          "Not specified"}
                      </p>
                    </div>

                    {/* Job Information Fields */}
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Jobsite Location
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {(opportunity as any).jobsite_location ||
                          "Not specified"}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Period of Performance
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {(opportunity as any).period_of_performance ||
                          "Not specified"}
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-sm text-neutral-500 dark:text-dark-400">
                        Total Man Hours
                      </p>
                      <p className="text-neutral-900 dark:text-dark-900">
                        {(opportunity as any).total_man_hours
                          ? `${(opportunity as any).total_man_hours} hours`
                          : "Not specified"}
                      </p>
                    </div>

                    {/* Documents Section */}
                    <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-sm text-neutral-500 dark:text-dark-400">
                          Documents
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="file"
                            id="subcontractor-file"
                            className="hidden"
                            accept=".pdf,.doc,.docx"
                            onChange={handleFileUpload}
                            disabled={uploadingFile}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              document
                                .getElementById("subcontractor-file")
                                ?.click()
                            }
                            disabled={uploadingFile}
                            className="text-brand border-brand hover:bg-brand hover:text-white"
                          >
                            <Upload className="h-4 w-4 mr-1" />
                            {uploadingFile ? "Uploading..." : "Upload"}
                          </Button>
                        </div>
                      </div>

                      {subcontractorAgreements.length > 0 ? (
                        <div className="space-y-2">
                          {subcontractorAgreements.map((agreement) => (
                            <div
                              key={agreement.id}
                              className="flex items-center justify-between p-2 bg-neutral-50 dark:bg-dark-150 rounded-none"
                            >
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-neutral-500" />
                                <div className="flex-1">
                                  <button
                                    onClick={() => handlePreviewFile(agreement)}
                                    className="text-sm font-medium text-brand hover:text-brand/90 hover:underline text-left"
                                  >
                                    {agreement.name}
                                  </button>
                                  <p className="text-xs text-neutral-500 dark:text-white">
                                    {formatDateSafe(agreement.upload_date)} •
                                    <span
                                      className={`ml-1 px-2 py-0.5 rounded-none text-xs ${
                                        agreement.status === "signed"
                                          ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                                          : agreement.status === "pending"
                                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                                            : agreement.status === "expired"
                                              ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                                              : "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/20 dark:text-white"
                                      }`}
                                    >
                                      {agreement.status}
                                    </span>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <select
                                  value={agreement.status}
                                  onChange={(e) =>
                                    handleUpdateAgreementStatus(
                                      agreement.id,
                                      e.target
                                        .value as SubcontractorAgreement["status"],
                                    )
                                  }
                                  className="text-xs p-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-900 dark:text-white"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="signed">Signed</option>
                                  <option value="expired">Expired</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePreviewFile(agreement)}
                                  className="p-1 h-6 w-6 text-blue-500 hover:bg-blue-500 hover:text-white"
                                  title="Preview"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const link = document.createElement("a");
                                    link.href = agreement.file_url;
                                    link.download = agreement.name;
                                    link.target = "_blank";
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                  className="p-1 h-6 w-6 text-brand hover:bg-brand hover:text-white"
                                  title="Download"
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleDeleteAgreement(agreement.id)
                                  }
                                  className="p-1 h-6 w-6 text-red-500 hover:bg-red-500 hover:text-white"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-neutral-500 dark:text-white italic">
                          No documents uploaded yet.
                        </p>
                      )}
                    </div>

                    {jobId && (
                      <div className="mt-6">
                        <Button
                          variant="outline"
                          className="bg-brand text-white hover:bg-brand/90"
                          onClick={() => setShowJobDialog(true)}
                        >
                          View Associated Job
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {opportunity.notes && (
                  <div className="col-span-1 md:col-span-2">
                    <h3 className="text-lg font-medium text-neutral-900 dark:text-dark-900 mb-3">
                      Notes
                    </h3>
                    <div className="bg-white dark:bg-dark-150 p-4 rounded-none">
                      <p className="text-neutral-900 dark:text-dark-900 whitespace-pre-line">
                        {opportunity.notes}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Add Estimate Sheet section */}
              <div className="mt-8">
                <h3 className="text-lg font-medium text-neutral-900 dark:text-dark-900 mb-3">
                  Estimate
                </h3>
                <div className="bg-white dark:bg-dark-150 p-4 rounded-none text-center">
                  {/* Always show the action buttons horizontally */}
                  <div className="flex flex-row justify-center gap-4 mb-4">
                    <button
                      onClick={() => {
                        setActiveEstimateId(null);
                        setShowEstimate("new");
                        setEstimateOpenSignal((s) => s + 1);
                      }}
                      className="bg-brand text-white hover:bg-brand/90 px-4 py-2 rounded-none font-medium transition-colors"
                    >
                      Generate Estimate
                    </button>
                    <button
                      onClick={() => {
                        setShowEstimate("view");
                        setEstimateOpenSignal((s) => s + 1);
                      }}
                      className="bg-brand text-white hover:bg-brand/90 px-4 py-2 rounded-none font-medium transition-colors"
                    >
                      Show Estimates
                    </button>
                    <button
                      onClick={() => {
                        setShowEstimate((current) =>
                          current === "letters" ? current : "letters",
                        );
                      }}
                      className="bg-brand text-white hover:bg-brand/90 px-4 py-2 rounded-none font-medium transition-colors"
                    >
                      Show Letter Proposals
                    </button>
                    <button
                      onClick={() => {
                        setShowEstimate("letter");
                      }}
                      className="bg-brand text-white hover:bg-brand/90 px-4 py-2 rounded-none font-medium transition-colors"
                    >
                      Generate Letter Proposal
                    </button>
                    <button
                      onClick={() => {
                        setShowEstimate("combined-letter");
                      }}
                      className="bg-brand text-white hover:bg-brand/90 px-4 py-2 rounded-none font-medium transition-colors"
                    >
                      Generate Combined Letter Proposal
                    </button>
                  </div>
                  {/* Show EstimateSheet only if an action is selected */}
                  {showEstimate !== false && (
                    <EstimateSheet
                      opportunityId={id || ""}
                      mode={showEstimate}
                      openSignal={estimateOpenSignal}
                      preferredEstimateId={activeEstimateId}
                      onActiveEstimateChange={setActiveEstimateId}
                    />
                  )}
                </div>
              </div>

              {/* Opportunity notes (chat-style): who left the note and when */}
              {id && (
                <div className="mt-8">
                  <OpportunityNotes opportunityId={id} />
                </div>
              )}
            </div>
          )}

          {/* Convert to Job Confirmation Dialog */}
          <Dialog
            open={confirmConvertToJobOpen}
            onClose={() => setConfirmConvertToJobOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <div className="flex items-center justify-center min-h-screen">
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

              <div className="relative bg-white dark:bg-dark-150 rounded-none max-w-md w-full mx-auto p-6 shadow-xl">
                <div className="absolute top-0 right-0 pt-4 pr-4">
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-neutral-500 dark:text-white dark:hover:text-neutral-200"
                    onClick={() => setConfirmConvertToJobOpen(false)}
                  >
                    <span className="sr-only">Close</span>
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white mb-4">
                  Convert Opportunity to Job
                </Dialog.Title>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-1">
                    Select Accepted Letter Proposal
                  </label>
                  {lettersForSelect.length === 0 ? (
                    <p className="text-xs text-neutral-500 dark:text-white">
                      No saved letters found for this opportunity. You can
                      continue without selecting one.
                    </p>
                  ) : (
                    <select
                      value={selectedLetterId}
                      onChange={(e) => setSelectedLetterId(e.target.value)}
                      className="w-full border border-neutral-300 dark:border-neutral-600 rounded-none px-3 py-2 bg-white dark:bg-dark-150 text-neutral-900 dark:text-white"
                    >
                      <option value="">-- Select Letter --</option>
                      {lettersForSelect.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title} ({l.created_at?.slice(0, 10)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <p className="text-neutral-700 dark:text-white mb-4">
                  Are you sure you want to create a job from this opportunity?
                  This action will:
                </p>

                <ul className="text-sm text-neutral-600 dark:text-white mb-4 space-y-1">
                  <li>• Create a new job record in the system</li>
                  <li>• Link the opportunity to the new job</li>
                  <li>• Keep the opportunity status unchanged</li>
                </ul>

                <p className="text-neutral-700 dark:text-white mb-4">
                  The opportunity will remain in its current status. You can
                  change the status separately if needed.
                </p>

                <div className="mt-5 flex justify-end space-x-3">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-white bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm hover:bg-neutral-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
                    onClick={() => setConfirmConvertToJobOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isConvertingToJob}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand border border-transparent rounded-none shadow-sm hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleConvertToJob}
                  >
                    {isConvertingToJob ? "Creating..." : "Convert to Job"}
                  </button>
                </div>
              </div>
            </div>
          </Dialog>

          {/* Letter Proposal Source Picker */}
          <Dialog
            open={letterPickerOpen}
            onClose={() => setLetterPickerOpen(false)}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <div className="flex items-center justify-center min-h-screen">
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

              <div className="relative bg-white dark:bg-dark-150 rounded-none max-w-lg w-full mx-auto p-6 shadow-xl">
                <div className="absolute top-0 right-0 pt-4 pr-4">
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-neutral-500 dark:text-white dark:hover:text-neutral-200"
                    onClick={() => setLetterPickerOpen(false)}
                  >
                    <span className="sr-only">Close</span>
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white mb-1">
                  Select Letter Proposal
                </Dialog.Title>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                  Choose which letter proposal the quoted amount is pulled
                  from.
                </p>

                {letterProposals.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-white">
                    No letter proposals found for this opportunity.
                  </p>
                ) : (
                  <div className="max-h-80 overflow-y-auto -mx-1 space-y-2">
                    {letterProposals.map((lp: any) => {
                      const lpAmount =
                        parseMoneyValue(lp.net_30_price) ||
                        extractNet30FromLetterHtml(lp.html);
                      const lpLabel =
                        lp.title ||
                        `Letter ${lp.letter_number || lp.id?.slice(0, 8)}`;
                      const isCurrent =
                        (opportunity as any).selected_letter_proposal ===
                        lp.id;
                      return (
                        <button
                          key={lp.id}
                          type="button"
                          disabled={isSavingLetterSelection}
                          onClick={() =>
                            handleSelectLetterProposalSource(lp.id)
                          }
                          className={`flex w-full items-center justify-between gap-3 rounded-none border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                            isCurrent
                              ? "border-brand bg-brand/5"
                              : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-dark-200"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                              {lpLabel}
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                              {lp.created_at
                                ? lp.created_at.slice(0, 10)
                                : ""}
                            </p>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                              {lpAmount ? formatMoney(lpAmount) : "—"}
                            </span>
                            {isCurrent && (
                              <Check className="h-4 w-4 text-brand" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-white bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm hover:bg-neutral-50 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
                    onClick={() => setLetterPickerOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </Dialog>

          {/* Job Details Dialog */}
          <Dialog
            open={showJobDialog}
            onClose={() => setShowJobDialog(false)}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <div className="flex items-center justify-center min-h-screen">
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

              <div className="relative bg-white dark:bg-dark-150 rounded-none max-w-4xl w-full mx-auto p-6 shadow-xl">
                <div className="absolute top-0 right-0 pt-4 pr-4">
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-neutral-500"
                    onClick={() => setShowJobDialog(false)}
                  >
                    <span className="sr-only">Close</span>
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-dark-900 mb-4">
                  Job Details
                </Dialog.Title>

                {jobDetails ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 dark:text-white">
                        Job Title
                      </h3>
                      <p className="mt-1 text-sm text-neutral-900 dark:text-white">
                        {jobDetails.title}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 dark:text-white">
                        Job Number
                      </h3>
                      <p className="mt-1 text-sm text-neutral-900 dark:text-white">
                        {jobDetails.job_number}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 dark:text-white">
                        Status
                      </h3>
                      <p className="mt-1 text-sm text-neutral-900 dark:text-white">
                        {jobDetails.status}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 dark:text-white">
                        Customer
                      </h3>
                      <p className="mt-1 text-sm text-neutral-900 dark:text-white">
                        {jobDetails.customer?.company_name ||
                          jobDetails.customer?.name ||
                          "No customer assigned"}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 dark:text-white">
                        Start Date
                      </h3>
                      <p className="mt-1 text-sm text-neutral-900 dark:text-white">
                        {jobDetails.start_date
                          ? formatDateSafe(jobDetails.start_date)
                          : "Not set"}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 dark:text-white">
                        Due Date
                      </h3>
                      <p className="mt-1 text-sm text-neutral-900 dark:text-white">
                        {jobDetails.due_date
                          ? formatDateSafe(jobDetails.due_date)
                          : "Not set"}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 dark:text-white">
                        Quoted Amount
                      </h3>
                      <p className="mt-1 text-sm text-neutral-900 dark:text-white">
                        ${jobDetails.budget?.toLocaleString() || "0"}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 dark:text-white">
                        Division
                      </h3>
                      <p className="mt-1 text-sm text-neutral-900 dark:text-white">
                        {formatDivisionName(jobDetails.division || "")}
                      </p>
                    </div>

                    {jobDetails.description && (
                      <div>
                        <h3 className="text-sm font-medium text-neutral-500 dark:text-white">
                          Description
                        </h3>
                        <p className="mt-1 text-sm text-neutral-900 dark:text-white whitespace-pre-wrap">
                          {jobDetails.description}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-neutral-500 dark:text-white">
                      <LoadingSpinner size="md" />
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Dialog>

          {/* Division Analytics Dialog */}
          {selectedDivision && (
            <DivisionAnalyticsDialog
              division={selectedDivision}
              isOpen={showDivisionAnalytics}
              onClose={() => {
                setShowDivisionAnalytics(false);
                setSelectedDivision(null);
              }}
            />
          )}

          {/* File Preview Modal */}
          <Dialog
            open={showPreviewModal}
            onClose={() => setShowPreviewModal(false)}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <div className="flex items-center justify-center min-h-screen px-4">
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

              <div className="relative bg-white dark:bg-dark-150 rounded-none max-w-4xl w-full mx-auto shadow-xl max-h-[90vh] flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-neutral-500" />
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-white">
                        {previewFile?.name}
                      </Dialog.Title>
                      <p className="text-sm text-neutral-500 dark:text-white">
                        {previewFile && formatDateSafe(previewFile.upload_date)}{" "}
                        •
                        <span
                          className={`ml-1 px-2 py-0.5 rounded-none text-xs ${
                            previewFile?.status === "signed"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                              : previewFile?.status === "pending"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                                : previewFile?.status === "expired"
                                  ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                                  : "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/20 dark:text-white"
                          }`}
                        >
                          {previewFile?.status}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        previewFile &&
                        window.open(previewFile.file_url, "_blank")
                      }
                      className="text-brand border-brand hover:bg-brand hover:text-white"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Open in New Tab
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreviewModal(false)}
                      className="text-neutral-500 hover:text-neutral-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="flex-1 p-4 overflow-hidden">
                  {previewFile && (
                    <div className="h-full">
                      {getFileExtension(previewFile.name) === "pdf" ? (
                        <PDFEditor
                          fileUrl={previewFile.file_url}
                          fileName={previewFile.name}
                          onSave={handleSavePDF}
                          onClose={() => setShowPreviewModal(false)}
                        />
                      ) : ["jpg", "jpeg", "png", "gif"].includes(
                          getFileExtension(previewFile.name),
                        ) ? (
                        <div className="flex items-center justify-center h-full">
                          <img
                            src={previewFile.file_url}
                            alt={previewFile.name}
                            className="max-w-full max-h-full object-contain rounded"
                          />
                        </div>
                      ) : getFileExtension(previewFile.name) === "txt" ? (
                        <div className="h-full">
                          <iframe
                            src={previewFile.file_url}
                            className="w-full h-full min-h-[600px] border border-neutral-200 dark:border-neutral-700 rounded bg-white"
                            title={previewFile.name}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <FileText className="h-16 w-16 text-neutral-400 mb-4" />
                          <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
                            Preview not available
                          </h3>
                          <p className="text-neutral-500 dark:text-white mb-4">
                            This file type cannot be previewed in the browser.
                          </p>
                          <Button
                            onClick={() =>
                              previewFile &&
                              window.open(previewFile.file_url, "_blank")
                            }
                            className="bg-brand hover:bg-brand/90 text-white"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download File
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Dialog>

          {/* Delete Opportunity Confirmation Dialog */}
          <Dialog
            open={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <div className="flex items-center justify-center min-h-screen">
              <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

              <div className="relative bg-white dark:bg-dark-150 rounded-none max-w-md w-full mx-auto p-6 shadow-xl">
                <div className="absolute top-0 right-0 pt-4 pr-4">
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-neutral-500 dark:text-white dark:hover:text-neutral-200"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    <span className="sr-only">Close</span>
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white mb-4">
                  Delete Opportunity
                </Dialog.Title>
                <p className="text-sm text-neutral-600 dark:text-white mb-6">
                  Are you sure you want to delete this opportunity? This action
                  cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-white bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none shadow-sm hover:bg-neutral-50 dark:hover:bg-dark-200 focus:outline-none"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-none hover:bg-red-700"
                    onClick={handleDeleteOpportunity}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

function formatDivisionName(division: string): string {
  const divisionMap: { [key: string]: string } = {
    north_alabama: "Decatur",
    tennessee: "Nashville",
    georgia: "Atlanta",
    international: "International",
    engineering: "Engineering",
    scavenger: "Scavenger",
  };
  return divisionMap[division] || division;
}
