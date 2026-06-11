import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ArrowLeft,
  Calendar,
  Award,
  RefreshCw,
  Filter,
  ArrowDownWideNarrow,
  Check,
  ChartGantt,
  ExternalLink,
  MinusCircle,
} from "lucide-react";
import { Dialog } from "@headlessui/react";
import { format } from "date-fns";
import { supabase, isAuthError } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { useDemoMode } from "../../lib/DemoModeContext";
import { useNavigate, Link } from "react-router-dom";
import { DivisionAnalyticsDialog } from "../analytics/DivisionAnalyticsDialog";
import { addDefaultFilesToJob } from "../../lib/services/defaultJobFiles";
import { useUserPreferences } from "../../hooks/useUserPreferences";
import { withPgTimeoutRetry } from "../../lib/retryPgTimeout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  customer_id?: string;
}

interface FormData {
  customer_id: string;
  contact_id: string;
  title: string;
  description: string;
  status: string;
  expected_value: string;
  probability: string;
  proposal_due_date: string;
  estimated_start_date: string;
  estimated_end_date: string;
  notes: string;
  amp_division: string;
  sales_person: string;
  reviewed_by: string;
  prepared_by: string;
  documents_stage?: string;
}

interface TMFormData {
  customer_id: string;
  contact_id: string;
  title: string;
  description: string;
  division: string;
}

function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case "awareness":
      return "bg-gray-100 text-gray-800 dark:bg-dark-150 dark:text-gray-100";
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
      return "bg-gray-500 text-white dark:bg-gray-600";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-dark-150 dark:text-gray-100";
  }
}

function getOpportunityTypeValue(opportunity: any) {
  let type = opportunity?.opportunity_type;

  if (!type) {
    const quotedAmount = Number(opportunity?.quoted_amount);
    if (Number.isFinite(quotedAmount) && quotedAmount > 0) {
      type = quotedAmount >= 100000 ? "large_acceptance" : "small_acceptance";
    }
  }

  return type || "other";
}

function getOpportunityTypeColor(type: string) {
  switch (type) {
    case "large_acceptance":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400";
    case "small_acceptance":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400";
    case "maintenance":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400";
    case "engineering":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-400";
    case "time_materials":
      return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400";
    case "other":
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-400";
  }
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
}

function getEstimateApprovalColor(status: string | null | undefined) {
  if (!status)
    return "bg-gray-100 text-gray-500 dark:bg-dark-200 dark:text-gray-500";
  switch (status) {
    case "in_progress":
      return "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-100";
    case "ready_for_review":
      return "bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100";
    case "approved_to_send":
      return "bg-pink-100 text-pink-800 dark:bg-pink-800 dark:text-pink-100";
    case "sent":
      return "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100";
    case "no_quote":
    case "no quote":
      return "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400";
    default:
      return "bg-gray-100 text-gray-500 dark:bg-dark-200 dark:text-gray-500";
  }
}

function formatEstimateApprovalStatus(
  status: string | null | undefined,
): string {
  if (!status) return "Not Started";
  const labels: Record<string, string> = {
    in_progress: "In Progress",
    ready_for_review: "Ready for Review",
    approved_to_send: "Approved to Send",
    sent: "Sent",
    no_quote: "No Quote",
  };
  return labels[status] || status.replace(/_/g, " ");
}

const initialFormData: FormData = {
  customer_id: "",
  contact_id: "",
  title: "",
  description: "",
  status: "awareness",
  expected_value: "0",
  probability: "0",
  proposal_due_date: "",
  estimated_start_date: "",
  estimated_end_date: "",
  notes: "",
  amp_division: "",
  sales_person: "",
  reviewed_by: "",
  prepared_by: "",
  documents_stage: "",
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

// Default filter settings (now loaded from Supabase via useUserPreferences hook)
const DEFAULT_FILTER_SETTINGS = {
  sortField: "quote_number" as const,
  sortDirection: "desc" as const,
  searchTerm: "",
  divisionFilter: [] as string[],
  opportunityTypeFilter: [] as string[],
  statusFilter: [] as string[],
};

const DIVISION_FILTER_OPTIONS = [
  { value: "north_alabama", label: "Alabama Division" },
  { value: "tennessee", label: "Tennessee Division" },
  { value: "georgia", label: "Georgia Division" },
  { value: "international", label: "International Division" },
  { value: "engineering", label: "Engineering" },
  { value: "scavenger", label: "Scavenger" },
];

const OPPORTUNITY_TYPE_OPTIONS = [
  { value: "large_acceptance", label: "Large Acceptance" },
  { value: "small_acceptance", label: "Small Acceptance" },
  { value: "maintenance", label: "Maintenance" },
  { value: "engineering", label: "Engineering" },
  { value: "time_materials", label: "Time & Materials" },
  { value: "other", label: "Other" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "awareness", label: "Awareness" },
  { value: "interest", label: "Interest" },
  { value: "quote", label: "Quote" },
  { value: "decision", label: "Decision" },
  { value: "decision - forecasted win", label: "Decision - Forecasted Win" },
  { value: "decision - forecast lose", label: "Decision - Forecast Lose" },
  { value: "awarded", label: "Awarded" },
  { value: "lost", label: "Lost" },
  { value: "no quote", label: "No Quote" },
];

const SORT_FIELD_OPTIONS = [
  { value: "quote_number", label: "Quote #" },
  { value: "opportunity_created_date", label: "Opportunity Created Date" },
  { value: "proposal_due_date", label: "Proposal Due Date" },
] as const;

const SORT_DIRECTION_OPTIONS = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
] as const;

function normalizeFilterValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  }

  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  return [];
}

function areFilterArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value) => b.includes(value));
}

function formatDivisionName(division: string): string {
  return (
    DIVISION_FILTER_OPTIONS.find((option) => option.value === division)
      ?.label || division
  );
}

const OPPORTUNITY_MODAL_PANEL_CLASS =
  "relative bg-white dark:bg-dark-150 rounded-lg max-w-xl w-full mx-auto p-6 shadow-xl max-h-[70vh] overflow-y-scroll [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:#d1d5db_#f3f4f6] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-thumb]:hover:bg-gray-500 dark:[scrollbar-color:#4b5563_#262626] dark:[&::-webkit-scrollbar-track]:bg-dark-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600";

export default function OpportunityList() {
  const { user, loading: authLoading, softRefresh } = useAuth();
  const { maskCustomerName } = useDemoMode();
  const navigate = useNavigate();
  const hasAttemptedRecovery = useRef(false); // Prevent infinite retry loops

  // Load filter settings from Supabase user preferences
  const {
    preferences,
    updatePreference,
    isLoading: prefsLoading,
  } = useUserPreferences();
  const savedFilters = preferences.filters?.opportunityList;

  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // Debug logging for loading issues (after state declarations)
  console.log("[OpportunityList] State:", {
    hasUser: !!user,
    authLoading,
    prefsLoading,
    loading,
    opportunitiesCount: opportunities.length,
    hasSavedFilters: !!savedFilters,
  });

  // Diagnostic: Test Supabase connectivity on mount
  useEffect(() => {
    const testSupabase = async () => {
      console.log("[OpportunityList] Testing Supabase connectivity...");
      try {
        const start = Date.now();
        const { data, error } = await supabase
          .schema("business")
          .from("opportunities")
          .select("id")
          .limit(1);
        console.log("[OpportunityList] Supabase test result:", {
          success: !error,
          time: Date.now() - start + "ms",
          error: error?.message,
        });
      } catch (e: any) {
        console.error("[OpportunityList] Supabase test FAILED:", e.message);
      }
    };
    if (user) testSupabase();
  }, [user]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [showDivisionAnalytics, setShowDivisionAnalytics] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  // Initialize with defaults - will be updated when preferences load
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [sortField, setSortField] = useState<
    "quote_number" | "opportunity_created_date" | "proposal_due_date"
  >("quote_number");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [divisionFilters, setDivisionFilters] = useState<string[]>([]);
  const [opportunityTypeFilters, setOpportunityTypeFilters] = useState<
    string[]
  >([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const filtersInitializedRef = useRef<boolean>(false);
  const prefsSyncedRef = useRef<boolean>(false); // Track if we've synced from Supabase
  const loadingStartTimeRef = useRef<number>(Date.now()); // Track when loading started
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topScrollbarRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const [tableScrollLeft, setTableScrollLeft] = useState(0);
  const [isScrollbarDragging, setIsScrollbarDragging] = useState(false);
  const scrollbarDragStartXRef = useRef(0);
  const scrollbarDragStartScrollLeftRef = useRef(0);

  // Emergency fallback: if loading takes more than 10 seconds, force fetch
  useEffect(() => {
    if (!loading) {
      loadingStartTimeRef.current = Date.now();
      return;
    }

    const checkTimeout = () => {
      const elapsed = Date.now() - loadingStartTimeRef.current;
      if (loading && elapsed > 10000 && user && !prefsSyncedRef.current) {
        console.warn(
          "[OpportunityList] Loading timeout after 10s, forcing fetch",
        );
        prefsSyncedRef.current = true;
        filtersInitializedRef.current = true;
        fetchOpportunities();
        fetchCustomers();
      }
    };

    const timer = setTimeout(checkTimeout, 10000);
    return () => clearTimeout(timer);
  }, [loading, user]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<{
    company_name: string;
    name: string;
    email: string;
    phone: string;
    address: string;
  }>({
    company_name: "",
    name: "",
    email: "",
    phone: "",
    address: "",
  });
  const [showNewContact, setShowNewContact] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContact, setNewContact] = useState<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  }>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(
    new Set(),
  );
  const [projectionOpportunityIds, setProjectionOpportunityIds] = useState<
    Set<string>
  >(new Set());
  const [openProjectionMenuId, setOpenProjectionMenuId] = useState<
    string | null
  >(null);
  const [projectionPopupPos, setProjectionPopupPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const projectionMenuRef = useRef<HTMLDivElement>(null);

  // Close the projection popup on outside click
  useEffect(() => {
    if (!openProjectionMenuId) return;
    function handleClick(e: MouseEvent) {
      if (
        projectionMenuRef.current &&
        projectionMenuRef.current.contains(e.target as Node)
      ) {
        return;
      }
      setOpenProjectionMenuId(null);
      setProjectionPopupPos(null);
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [openProjectionMenuId]);

  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const activeFilterCount =
    divisionFilters.length +
    opportunityTypeFilters.length +
    statusFilters.length;
  const [showTMModal, setShowTMModal] = useState(false);
  const [TMFormData, setTMFormData] = useState<TMFormData>({
    customer_id: "",
    contact_id: "",
    title: "",
    description: "",
    division: "",
  });
  const [isCreatingTM, setIsCreatingTM] = useState(false);

  function toggleFilterValue(
    currentValues: string[],
    setValues: (nextValues: string[]) => void,
    value: string,
  ) {
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((currentValue) => currentValue !== value)
      : [...currentValues, value];

    setValues(nextValues);
    setPage(1);
  }

  function renderFilterOptions(
    options: { value: string; label: string }[],
    selectedValues: string[],
    setValues: (nextValues: string[]) => void,
  ) {
    return (
      <div className="space-y-0.5">
        {options.map((option) => {
          const checked = selectedValues.includes(option.value);

          return (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                toggleFilterValue(selectedValues, setValues, option.value)
              }
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                checked
                  ? "text-[#f26722]"
                  : "text-gray-700 hover:bg-gray-50 dark:text-white dark:hover:bg-dark-100"
              }`}
              aria-pressed={checked}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  checked
                    ? "border-[#f26722] bg-[#f26722] text-white"
                    : "border-gray-300 dark:border-dark-300"
                }`}
                aria-hidden
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderSingleChoiceOptions<T extends string>(
    options: ReadonlyArray<{ value: T; label: string }>,
    selectedValue: T,
    setValue: (nextValue: T) => void,
  ) {
    return (
      <div className="space-y-0.5">
        {options.map((option) => {
          const checked = selectedValue === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setValue(option.value);
                setPage(1);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                checked
                  ? "bg-orange-50 text-[#f26722] dark:bg-orange-900/20"
                  : "text-gray-700 hover:bg-gray-50 dark:text-white dark:hover:bg-dark-100"
              }`}
              aria-pressed={checked}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {checked && <Check className="h-4 w-4" />}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Open detail or merged view if this opportunity is in a merge group
  async function openOpportunity(opportunityId: string) {
    try {
      const { data: membership } = await supabase
        .schema("business")
        .from("opportunity_merge_members")
        .select("merge_group_id")
        .eq("opportunity_id", opportunityId)
        .maybeSingle();

      const groupId = (membership as any)?.merge_group_id as string | undefined;
      if (!groupId) {
        navigate(`/sales-dashboard/opportunities/${opportunityId}`);
        return;
      }

      const [{ data: group }, { data: members }] = await Promise.all([
        supabase
          .schema("business")
          .from("opportunity_merge_groups")
          .select("primary_opportunity_id")
          .eq("id", groupId)
          .maybeSingle(),
        supabase
          .schema("business")
          .from("opportunity_merge_members")
          .select("opportunity_id, is_primary")
          .eq("merge_group_id", groupId),
      ]);

      const ids = (members || []).map((m: any) => String(m.opportunity_id));
      if (!ids || ids.length < 2) {
        navigate(`/sales-dashboard/opportunities/${opportunityId}`);
        return;
      }
      const params = new URLSearchParams();
      params.set("ids", ids.join(","));
      params.set(
        "primary",
        String(
          opportunityId || (group as any)?.primary_opportunity_id || ids[0],
        ),
      );
      navigate(`/sales-dashboard/opportunities/merge?${params.toString()}`);
    } catch (e) {
      console.warn("Merge group check failed, opening single view:", e);
      navigate(`/sales-dashboard/opportunities/${opportunityId}`);
    }
  }

  async function handleMergeSelected() {
    const ids = Array.from(selectedForMerge);
    if (ids.length < 2) return;

    try {
      await supabase
        .schema("business")
        .from("opportunity_merge_members")
        .delete()
        .in("opportunity_id", ids);

      const { data: group, error: groupErr } = await supabase
        .schema("business")
        .from("opportunity_merge_groups")
        .insert({
          primary_opportunity_id: ids[0],
          created_by: user?.id || null,
        })
        .select("id")
        .single();
      if (groupErr) throw groupErr;

      const rows = ids.map((opId, idx) => ({
        merge_group_id: group.id,
        opportunity_id: opId,
        is_primary: idx === 0,
      }));
      const { error: memErr } = await supabase
        .schema("business")
        .from("opportunity_merge_members")
        .upsert(rows, { onConflict: "opportunity_id" });
      if (memErr) throw memErr;

      try {
        localStorage.setItem(
          "opportunity-merge-group",
          JSON.stringify({
            ids,
            createdAt: new Date().toISOString(),
            groupId: group.id,
          }),
        );
      } catch {}

      const params = new URLSearchParams();
      params.set("ids", ids.join(","));
      params.set("primary", ids[0]);
      navigate(`/sales-dashboard/opportunities/merge?${params.toString()}`);
    } catch (e) {
      console.error("Failed to create merge group:", e);
      alert("Failed to merge opportunities. Please try again.");
    }
  }

  async function handleMoveSelectedToProjection() {
    const ids = Array.from(selectedForMerge);
    if (ids.length === 0) return;

    try {
      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ in_pipeline_projection: true })
        .in("id", ids);

      if (error) throw error;

      setProjectionOpportunityIds((currentIds) => {
        const nextIds = new Set(currentIds);
        ids.forEach((id) => nextIds.add(id));
        return nextIds;
      });
      setOpportunities((currentOpportunities) =>
        currentOpportunities.map((opportunity) =>
          ids.includes(opportunity.id)
            ? { ...opportunity, in_pipeline_projection: true }
            : opportunity,
        ),
      );
      setSelectedForMerge(new Set());
      window.dispatchEvent(new Event("pipelineProjectionChanged"));
    } catch (error) {
      console.error(
        "Error moving opportunities to Pipeline Projection:",
        error,
      );
      alert("Failed to move opportunities to Pipeline Projection.");
    }
  }

  async function handleRemoveFromProjection(opportunityId: string) {
    try {
      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ in_pipeline_projection: false })
        .eq("id", opportunityId);

      if (error) throw error;

      setProjectionOpportunityIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(opportunityId);
        return nextIds;
      });
      setOpportunities((currentOpportunities) =>
        currentOpportunities.map((opportunity) =>
          opportunity.id === opportunityId
            ? { ...opportunity, in_pipeline_projection: false }
            : opportunity,
        ),
      );
      setOpenProjectionMenuId(null);
      window.dispatchEvent(new Event("pipelineProjectionChanged"));
    } catch (error) {
      console.error(
        "Error removing opportunity from Pipeline Projection:",
        error,
      );
      alert("Failed to remove opportunity from Pipeline Projection.");
    }
  }

  useEffect(() => {
    if (!isSortMenuOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(event.target as Node)
      ) {
        setIsSortMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isSortMenuOpen]);

  useEffect(() => {
    if (!isFilterMenuOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(event.target as Node)
      ) {
        setIsFilterMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isFilterMenuOpen]);

  async function handleOpportunityStatusChange(
    opportunityId: string,
    newStatus: string,
  ) {
    try {
      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ status: newStatus })
        .eq("id", opportunityId);
      if (error) throw error;
      setOpportunities((prev) =>
        prev.map((o) =>
          o.id === opportunityId ? { ...o, status: newStatus } : o,
        ),
      );
    } catch (err) {
      console.error("Error updating opportunity status:", err);
      alert("Failed to update opportunity status. Please try again.");
    }
  }

  async function handleEstimateApprovalStatusChange(
    opportunityId: string,
    newStatus: string,
  ) {
    const opp = opportunities.find((o) => o.id === opportunityId) as any;
    const latestEstimateId = opp?.latest_estimate_id;
    if (!latestEstimateId) {
      alert(
        "No estimate found for this opportunity. Create an estimate in the opportunity detail to set approval status.",
      );
      return;
    }
    const raw = newStatus === "" ? null : newStatus;
    const value = raw === "no quote" ? "no_quote" : raw;
    const previous = opp?.estimate_approval_status ?? null;
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === opportunityId
          ? { ...o, estimate_approval_status: value ?? null }
          : o,
      ),
    );
    try {
      const { error } = await supabase
        .schema("business")
        .from("estimates")
        .update({ status: value })
        .eq("id", latestEstimateId);
      if (error) throw error;
      if (value === "sent") {
        const { error: oppError } = await supabase
          .schema("business")
          .from("opportunities")
          .update({ status: "decision" })
          .eq("id", opportunityId);
        if (!oppError) {
          setOpportunities((prev) =>
            prev.map((o) =>
              o.id === opportunityId ? { ...o, status: "decision" } : o,
            ),
          );
        }
      }
      window.dispatchEvent(
        new CustomEvent("estimateSaved", { detail: { opportunityId } }),
      );
    } catch (err) {
      console.error("Error updating estimate approval status:", err);
      setOpportunities((prev) =>
        prev.map((o) =>
          o.id === opportunityId
            ? { ...o, estimate_approval_status: previous }
            : o,
        ),
      );
      const msg = err instanceof Error ? err.message : String(err);
      const hint =
        msg.includes("check") ||
        msg.includes("constraint") ||
        msg.includes("violates")
          ? ' The database may need the migration that allows "No Quote" (2025-02_add_no_quote_estimate_status.sql).'
          : "";
      alert("Failed to update estimate approval status." + hint);
    }
  }

  async function handleOpportunityTypeChange(
    opportunityId: string,
    newOpportunityType: string,
  ) {
    const previousType =
      opportunities.find((o) => o.id === opportunityId)?.opportunity_type ??
      null;

    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === opportunityId
          ? { ...o, opportunity_type: newOpportunityType }
          : o,
      ),
    );

    try {
      const { error } = await supabase
        .schema("business")
        .from("opportunities")
        .update({ opportunity_type: newOpportunityType || null })
        .eq("id", opportunityId);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating opportunity type:", err);
      setOpportunities((prev) =>
        prev.map((o) =>
          o.id === opportunityId ? { ...o, opportunity_type: previousType } : o,
        ),
      );
      alert("Failed to update opportunity type. Please try again.");
    }
  }

  useEffect(() => {
    console.log("[OpportunityList] Main effect:", {
      hasUser: !!user,
      authLoading,
      prefsLoading,
      prefsSynced: prefsSyncedRef.current,
    });

    if (user) {
      // Wait for preferences to finish loading AND be synced before fetching
      if (prefsLoading || !prefsSyncedRef.current) {
        console.log("[OpportunityList] Waiting for prefs...", {
          prefsLoading,
          prefsSynced: prefsSyncedRef.current,
        });
        return;
      }
      console.log("[OpportunityList] Calling fetchOpportunities...");
      fetchOpportunities();
      fetchCustomers();
    } else if (!authLoading) {
      // Auth has finished loading but no user - stop the loading state
      console.log("[OpportunityList] No user, stopping loading");
      setLoading(false);
    }
  }, [
    user,
    authLoading,
    prefsLoading,
    page,
    debouncedSearch,
    sortField,
    sortDirection,
    divisionFilters,
    opportunityTypeFilters,
    statusFilters,
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchTerm !== debouncedSearch) {
        setDebouncedSearch(searchTerm.trim());
        setPage(1); // Only reset page when search actually changes
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, debouncedSearch]);

  // Sync filter state from Supabase when preferences load
  useEffect(() => {
    console.log("[OpportunityList] Sync effect:", {
      prefsLoading,
      prefsSynced: prefsSyncedRef.current,
      hasSavedFilters: !!savedFilters,
    });

    // Wait until preferences have finished loading
    if (prefsLoading) {
      console.log("[OpportunityList] Sync: still loading prefs");
      return;
    }
    // Only sync once
    if (prefsSyncedRef.current) {
      console.log("[OpportunityList] Sync: already synced");
      return;
    }

    console.log("[OpportunityList] Sync: marking as synced and processing");
    // Mark as synced - even if no saved filters exist, we're ready to proceed
    prefsSyncedRef.current = true;
    filtersInitializedRef.current = true;

    // If we have saved filter preferences, apply them
    let hasStateUpdates = false;
    if (savedFilters) {
      if (savedFilters.sortField && savedFilters.sortField !== sortField) {
        setSortField(savedFilters.sortField);
        hasStateUpdates = true;
      }
      if (
        savedFilters.sortDirection &&
        savedFilters.sortDirection !== sortDirection
      ) {
        setSortDirection(savedFilters.sortDirection);
        hasStateUpdates = true;
      }
      if (savedFilters.searchTerm && savedFilters.searchTerm !== searchTerm) {
        setSearchTerm(savedFilters.searchTerm);
        setDebouncedSearch(savedFilters.searchTerm);
        hasStateUpdates = true;
      }
      const savedDivisionFilters = normalizeFilterValue(
        savedFilters.divisionFilter,
      );
      if (!areFilterArraysEqual(savedDivisionFilters, divisionFilters)) {
        setDivisionFilters(savedDivisionFilters);
        hasStateUpdates = true;
      }
      const savedOpportunityTypeFilters = normalizeFilterValue(
        savedFilters.opportunityTypeFilter,
      );
      if (
        !areFilterArraysEqual(
          savedOpportunityTypeFilters,
          opportunityTypeFilters,
        )
      ) {
        setOpportunityTypeFilters(savedOpportunityTypeFilters);
        hasStateUpdates = true;
      }
      const savedStatusFilters = normalizeFilterValue(
        savedFilters.statusFilter,
      );
      if (!areFilterArraysEqual(savedStatusFilters, statusFilters)) {
        setStatusFilters(savedStatusFilters);
        hasStateUpdates = true;
      }
    }

    // If no state updates occurred, the main effect won't re-run automatically
    // (since prefsSyncedRef is a ref, not state). We need to trigger fetch manually.
    if (!hasStateUpdates && user) {
      console.log(
        "[OpportunityList] Sync: No state updates, calling fetch directly",
      );
      fetchOpportunities();
      fetchCustomers();
    } else {
      console.log(
        "[OpportunityList] Sync: State updates will trigger main effect",
        { hasStateUpdates, hasUser: !!user },
      );
    }
  }, [prefsLoading, savedFilters]);

  // Persist filters to Supabase (debounced in the service)
  useEffect(() => {
    if (!user?.id) return;
    // Skip during initial load to avoid overwriting with empty/default values
    if (!filtersInitializedRef.current) return;

    updatePreference("filters.opportunityList", {
      searchTerm,
      sortField,
      sortDirection,
      divisionFilter: divisionFilters,
      opportunityTypeFilter: opportunityTypeFilters,
      statusFilter: statusFilters,
    });
  }, [
    user?.id,
    searchTerm,
    sortField,
    sortDirection,
    divisionFilters,
    opportunityTypeFilters,
    statusFilters,
    updatePreference,
  ]);

  useEffect(() => {
    if (formData.customer_id) {
      fetchContacts(formData.customer_id);
    }
  }, [formData.customer_id]);

  useEffect(() => {
    if (customers.length > 0) {
      const filtered = customers.filter((customer) => {
        const searchTerm = customerSearch.toLowerCase();
        return (
          customer.name.toLowerCase().includes(searchTerm) ||
          customer.company_name.toLowerCase().includes(searchTerm)
        );
      });
      setFilteredCustomers(filtered);
    } else {
      setFilteredCustomers([]);
    }
  }, [customerSearch, customers]);

  function applyOpportunityFilters(query: any) {
    let filteredQuery = query;

    if (divisionFilters.length > 0) {
      filteredQuery = filteredQuery.in("amp_division", divisionFilters);
    }

    if (statusFilters.length > 0) {
      filteredQuery = filteredQuery.in("status", statusFilters);
    }

    if (opportunityTypeFilters.length > 0) {
      const typeConditions = opportunityTypeFilters.flatMap((filterValue) => {
        if (filterValue === "large_acceptance") {
          return [
            "opportunity_type.eq.large_acceptance",
            "and(opportunity_type.is.null,quoted_amount.gte.100000)",
          ];
        }

        if (filterValue === "small_acceptance") {
          return [
            "opportunity_type.eq.small_acceptance",
            "and(opportunity_type.is.null,quoted_amount.gt.0,quoted_amount.lt.100000)",
          ];
        }

        if (filterValue === "other") {
          return [
            "opportunity_type.eq.other",
            "and(opportunity_type.is.null,quoted_amount.is.null)",
            "and(opportunity_type.is.null,quoted_amount.lte.0)",
          ];
        }

        return [`opportunity_type.eq.${filterValue}`];
      });

      filteredQuery = filteredQuery.or(typeConditions.join(","));
    }

    return filteredQuery;
  }

  async function fetchOpportunities() {
    console.log("[OpportunityList] fetchOpportunities START");
    setLoadError(null); // Clear any previous error
    if (debouncedSearch) {
      setSearchLoading(true);
    } else {
      setLoading(true);
    }

    try {
      // 1. Fetch opportunities (with optional search including customer matches)
      console.log("[OpportunityList] Building query...");
      const pageSize = debouncedSearch ? 1000 : 50;
      const from = debouncedSearch ? 0 : (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let opportunityData: any[] = [];

      if (debouncedSearch) {
        console.log(
          "[OpportunityList] Search branch - searching for:",
          debouncedSearch,
        );
        const like = `%${debouncedSearch}%`;

        // Build the order clause based on sort settings
        let orderColumn = "created_at";
        const ascending = sortDirection === "asc";
        let nullsLast = false; // Flag to indicate if we need NULLS LAST handling

        if (sortField === "quote_number") {
          // For numeric quote numbers, cast to integer for proper sorting
          orderColumn = "quote_number";
        } else if (sortField === "proposal_due_date") {
          orderColumn = "proposal_due_date";
          nullsLast = true; // Always show null dates at the end
        } else if (sortField === "opportunity_created_date") {
          orderColumn = "opportunity_created_date";
          nullsLast = true; // Always show null dates at the end
        }

        // Query 1: match opportunity fields on server for performance
        let q1 = supabase
          .schema("business")
          .from("opportunities")
          .select("*")
          .or(
            `quote_number.ilike.${like},title.ilike.${like},description.ilike.${like},sales_person.ilike.${like}`,
          );

        q1 = applyOpportunityFilters(q1);

        // Apply ordering with NULLS LAST for date fields
        if (nullsLast) {
          q1 = q1.order(orderColumn, { ascending, nullsFirst: false });
        } else {
          q1 = q1.order(orderColumn, { ascending });
        }

        q1 = q1.range(from, to);

        console.log("[OpportunityList] Search query 1 executing...");
        const q1Start = Date.now();
        const { data: data1, error: err1 } = await q1;
        console.log("[OpportunityList] Search query 1 complete:", {
          time: Date.now() - q1Start + "ms",
          count: data1?.length,
          error: err1?.message,
        });
        if (err1) throw err1;

        // Query 2: find customers that match, then fetch their opportunities
        const { data: matchingCustomers, error: custErr } = await supabase
          .schema("common")
          .from("customers")
          .select("id")
          .or(`name.ilike.${like},company_name.ilike.${like}`)
          .limit(1000);

        if (custErr) {
          console.warn("Customer search error (ignored):", custErr);
        }

        let data2: any[] = [];
        if (matchingCustomers && matchingCustomers.length) {
          const ids = matchingCustomers.map((c: any) => c.id);
          let q2 = supabase
            .schema("business")
            .from("opportunities")
            .select("*")
            .in("customer_id", ids);

          q2 = applyOpportunityFilters(q2);

          // Apply ordering with NULLS LAST for date fields
          if (nullsLast) {
            q2 = q2.order(orderColumn, { ascending, nullsFirst: false });
          } else {
            q2 = q2.order(orderColumn, { ascending });
          }

          q2 = q2.range(0, 1000);

          const { data: byCustomer, error: err2 } = await q2;
          if (!err2 && byCustomer) data2 = byCustomer;
        }

        // Merge and de-duplicate
        const map = new Map<string, any>();
        [...(data1 || []), ...(data2 || [])].forEach((o: any) =>
          map.set(String(o.id), o),
        );
        opportunityData = Array.from(map.values());
      } else {
        // Build the order clause based on sort settings
        let orderColumn = "created_at";
        const ascending = sortDirection === "asc";
        let nullsLast = false; // Flag to indicate if we need NULLS LAST handling

        if (sortField === "quote_number") {
          // For numeric quote numbers, cast to integer for proper sorting
          orderColumn = "quote_number";
        } else if (sortField === "proposal_due_date") {
          orderColumn = "proposal_due_date";
          nullsLast = true; // Always show null dates at the end
        } else if (sortField === "opportunity_created_date") {
          orderColumn = "opportunity_created_date";
          nullsLast = true; // Always show null dates at the end
        }

        let query = supabase
          .schema("business")
          .from("opportunities")
          .select("*");

        query = applyOpportunityFilters(query);

        // Apply ordering with NULLS LAST for date fields
        if (nullsLast) {
          query = query.order(orderColumn, { ascending, nullsFirst: false });
        } else {
          query = query.order(orderColumn, { ascending });
        }

        query = query.range(from, to);

        console.log("[OpportunityList] Executing Supabase query...");
        const queryStart = Date.now();
        const { data, error } = await query;
        console.log(
          "[OpportunityList] Query completed in",
          Date.now() - queryStart,
          "ms",
          {
            hasData: !!data,
            dataLength: data?.length,
            error: error?.message,
          },
        );
        if (error) throw error;
        opportunityData = data || [];
      }

      const opportunityError = null;

      if (!opportunityData) {
        console.log(
          "[OpportunityList] No opportunity data returned, setting empty array",
        );
        setOpportunities([]);
        return; // No opportunities found
      }
      console.log("[OpportunityList] Got opportunity data:", {
        count: opportunityData.length,
      });

      setHasMore(
        !debouncedSearch && (opportunityData || []).length === pageSize,
      );

      // Fetch letter proposals for all opportunities
      try {
        const opportunityIds = opportunityData.map((o: any) => o.id);
        if (opportunityIds.length > 0) {
          const { data: letterProposalsData, error: letterError } =
            await supabase
              .schema("business")
              .from("letter_proposals")
              .select("id, opportunity_id, html, created_at")
              .in("opportunity_id", opportunityIds)
              .order("created_at", { ascending: false });

          if (!letterError && letterProposalsData) {
            // Group letter proposals by opportunity_id
            const letterProposalsByOpportunity: Record<string, any[]> = {};
            letterProposalsData.forEach((letter: any) => {
              if (!letterProposalsByOpportunity[letter.opportunity_id]) {
                letterProposalsByOpportunity[letter.opportunity_id] = [];
              }
              letterProposalsByOpportunity[letter.opportunity_id].push(letter);
            });

            // Add letter proposals to opportunities
            opportunityData = opportunityData.map((o: any) => ({
              ...o,
              letter_proposals: letterProposalsByOpportunity[o.id] || [],
            }));
          }
        }
      } catch (error) {
        console.error("Error fetching letter proposals:", error);
      }

      // Fetch job details for opportunities that have been converted to jobs
      try {
        const jobIds = opportunityData
          .filter((o: any) => o.job_id)
          .map((o: any) => o.job_id);
        if (jobIds.length > 0) {
          const { data: jobsData, error: jobsError } = await supabase
            .schema("neta_ops")
            .from("jobs")
            .select("id, job_number")
            .in("id", jobIds);

          if (!jobsError && jobsData) {
            // Create a map of job_id to job_number
            const jobNumberMap: Record<string, string> = {};
            jobsData.forEach((job: any) => {
              jobNumberMap[job.id] = job.job_number;
            });

            // Add job numbers to opportunities
            opportunityData = opportunityData.map((o: any) => ({
              ...o,
              job_number: o.job_id ? jobNumberMap[o.job_id] : null,
            }));
          }
        }
      } catch (error) {
        console.error("Error fetching job details:", error);
      }

      // Fetch latest estimate approval status per opportunity (Ready for Review, Approved to Send, Sent, etc.)
      try {
        const opportunityIds = opportunityData.map((o: any) => o.id);
        if (opportunityIds.length > 0) {
          const { data: estimatesData, error: estimatesError } = await supabase
            .schema("business")
            .from("estimates")
            .select("id, opportunity_id, status, created_at")
            .in("opportunity_id", opportunityIds)
            .order("created_at", { ascending: false });

          if (!estimatesError && estimatesData && estimatesData.length > 0) {
            // One status and latest estimate id per opportunity: use the most recent estimate
            const estimateStatusByOpportunity: Record<string, string> = {};
            const latestEstimateIdByOpportunity: Record<string, string> = {};
            estimatesData.forEach((row: any) => {
              if (
                row.opportunity_id &&
                estimateStatusByOpportunity[row.opportunity_id] == null
              ) {
                estimateStatusByOpportunity[row.opportunity_id] =
                  row.status || "";
                latestEstimateIdByOpportunity[row.opportunity_id] =
                  row.id || "";
              }
            });
            opportunityData = opportunityData.map((o: any) => ({
              ...o,
              estimate_approval_status:
                estimateStatusByOpportunity[o.id] || null,
              latest_estimate_id: latestEstimateIdByOpportunity[o.id] || null,
            }));
          } else {
            opportunityData = opportunityData.map((o: any) => ({
              ...o,
              estimate_approval_status: null,
              latest_estimate_id: null,
            }));
          }
        }
      } catch (error) {
        console.error("Error fetching estimate status:", error);
        opportunityData = opportunityData.map((o: any) => ({
          ...o,
          estimate_approval_status: null,
          latest_estimate_id: null,
        }));
      }

      // 2a. Try to load proposal_due_date explicitly to ensure availability across environments
      try {
        const ids = opportunityData.map((o: any) => o.id);
        if (ids.length > 0) {
          const { data: pdList } = await supabase
            .schema("business")
            .from("opportunities")
            .select("id, proposal_due_date")
            .in("id", ids);
          const idToPd: Record<string, any> = {};
          (pdList || []).forEach((row: any) => {
            idToPd[String(row.id)] = row.proposal_due_date;
          });
          opportunityData = opportunityData.map((o: any) => ({
            ...o,
            proposal_due_date:
              o.proposal_due_date ?? idToPd[String(o.id)] ?? null,
          }));
        }
      } catch (_e) {
        // Best-effort; ignore
      }

      // 2b. Fetch customer data for all opportunities in a single batched query
      // Instead of N individual queries, we batch them into one query for better performance
      const customerIds = [
        ...new Set(
          opportunityData
            .filter((o: any) => o.customer_id)
            .map((o: any) => o.customer_id),
        ),
      ];

      const customerMap: Record<string, any> = {};

      if (customerIds.length > 0) {
        try {
          const { data: customersData, error: customersError } = await supabase
            .schema("common")
            .from("customers")
            .select("id, name, company_name")
            .in("id", customerIds);

          if (customersError) {
            console.warn("Error fetching customers batch:", customersError);
          } else if (customersData) {
            // Create a map for O(1) lookup
            customersData.forEach((customer: any) => {
              customerMap[customer.id] = customer;
            });
          }
        } catch (err) {
          console.warn("Error processing customers batch:", err);
        }
      }

      // Map customers to opportunities using the batch result
      const opportunitiesWithCustomers = opportunityData.map(
        (opportunity: any) => {
          if (!opportunity.customer_id) {
            return { ...opportunity, customers: null };
          }
          return {
            ...opportunity,
            customers: customerMap[opportunity.customer_id] || null,
          };
        },
      );

      // Client-side sort function (only used when merging search results from multiple queries)
      const sortOpportunities = (list: any[]) => {
        const copy = [...list];
        copy.sort((a, b) => {
          const dir = sortDirection === "asc" ? 1 : -1;
          if (sortField === "quote_number") {
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
            return (aNum - bNum) * dir;
          } else if (sortField === "proposal_due_date") {
            // Handle null dates: always push to end regardless of sort direction
            const hasA = !!a.proposal_due_date;
            const hasB = !!b.proposal_due_date;

            if (!hasA && !hasB) return 0; // Both null, equal
            if (!hasA) return 1; // a is null, push to end
            if (!hasB) return -1; // b is null, push to end

            // Both have dates, sort normally
            const ad = new Date(a.proposal_due_date).getTime();
            const bd = new Date(b.proposal_due_date).getTime();
            return (ad - bd) * dir;
          } else {
            // opportunity_created_date: nulls at end, then sort by date
            const hasA = !!a.opportunity_created_date;
            const hasB = !!b.opportunity_created_date;
            if (!hasA && !hasB) return 0;
            if (!hasA) return 1;
            if (!hasB) return -1;
            const ad = new Date(a.opportunity_created_date).getTime();
            const bd = new Date(b.opportunity_created_date).getTime();
            return (ad - bd) * dir;
          }
        });
        return copy;
      };

      // 2c. If searching, also match against customer fields in addition to server-side fields
      let finalList = opportunitiesWithCustomers;
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        finalList = opportunitiesWithCustomers.filter((o: any) => {
          const fields = [
            o.quote_number,
            o.title,
            o.description,
            o.sales_person,
            o.customers?.name,
            o.customers?.company_name,
          ];
          return fields.some((v: any) =>
            String(v || "")
              .toLowerCase()
              .includes(s),
          );
        });
        // When searching, we merge results from multiple queries, so we need to sort client-side
        finalList = sortOpportunities(finalList);
      } else if (sortField === "quote_number") {
        // DB orders quote_number as text (e.g. "10" before "9"); always apply numeric sort for correct order
        finalList = sortOpportunities(opportunitiesWithCustomers);
      }

      console.log("[OpportunityList] Setting opportunities:", {
        count: finalList?.length || 0,
      });
      setOpportunities(finalList);
      setProjectionOpportunityIds(
        new Set(
          finalList
            .filter((opportunity: any) => !!opportunity.in_pipeline_projection)
            .map((opportunity: any) => opportunity.id),
        ),
      );

      // Reset recovery flag on successful fetch
      hasAttemptedRecovery.current = false;
    } catch (error: any) {
      console.error("Error in fetchOpportunities function:", error);

      // If this looks like an auth error and we haven't tried recovery yet, attempt soft refresh
      if (isAuthError(error) && !hasAttemptedRecovery.current) {
        console.log(
          "🔄 Auth error detected - attempting automatic session recovery...",
        );
        hasAttemptedRecovery.current = true;

        try {
          const recovered = await softRefresh();
          if (recovered) {
            console.log("✅ Session recovered - retrying fetch...");
            // Clear loading state before retry
            setLoading(false);
            setSearchLoading(false);
            // Re-fetch after a small delay to let state settle
            setTimeout(() => {
              fetchOpportunities();
            }, 100);
            return; // Don't set error, we're retrying
          } else {
            console.warn(
              "❌ Session recovery failed - user may need to sign in again",
            );
            setLoadError("Session expired. Please sign out and sign back in.");
          }
        } catch (recoveryError) {
          console.error("Session recovery error:", recoveryError);
          setLoadError("Session error. Please sign out and sign back in.");
        }
      } else {
        setLoadError(
          "Failed to load opportunities. Please try again or refresh the page.",
        );
      }
    } finally {
      // Always clear loading state - BOTH states to handle all scenarios
      console.log(
        "[OpportunityList] fetchOpportunities FINALLY - clearing loading state",
      );
      setLoading(false);
      setSearchLoading(false);
    }
  }

  // Note: Sorting is now handled at the database level in fetchOpportunities()
  // No need for a separate useEffect to re-sort since changing sortField/sortDirection
  // triggers a refetch with the new sort order

  // Reset to page 1 when sort settings change
  useEffect(() => {
    if (filtersInitializedRef.current) {
      setPage(1);
    }
  }, [sortField, sortDirection]);

  useEffect(() => {
    const updateScrollMetrics = () => {
      if (scrollContainerRef.current) {
        setTableScrollWidth(scrollContainerRef.current.scrollWidth);
        setTableViewportWidth(scrollContainerRef.current.clientWidth);
        setTableScrollLeft(scrollContainerRef.current.scrollLeft);
      }
    };

    updateScrollMetrics();
    window.addEventListener("resize", updateScrollMetrics);

    const resizeObserver = new ResizeObserver(updateScrollMetrics);
    if (tableRef.current) {
      resizeObserver.observe(tableRef.current);
    }
    if (scrollContainerRef.current) {
      resizeObserver.observe(scrollContainerRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateScrollMetrics);
      resizeObserver.disconnect();
    };
  }, [opportunities.length]);

  const maxTableScrollLeft = Math.max(0, tableScrollWidth - tableViewportWidth);
  const thumbWidthPct =
    tableScrollWidth > 0
      ? Math.min(
          100,
          Math.max((tableViewportWidth / tableScrollWidth) * 100, 10),
        )
      : 100;
  const thumbLeftPct =
    maxTableScrollLeft > 0
      ? (tableScrollLeft / maxTableScrollLeft) * (100 - thumbWidthPct)
      : 0;

  const setTableScrollPosition = (nextScrollLeft: number) => {
    if (!scrollContainerRef.current) return;
    const clamped = Math.max(0, Math.min(nextScrollLeft, maxTableScrollLeft));
    scrollContainerRef.current.scrollLeft = clamped;
    setTableScrollLeft(clamped);
  };

  const handleCustomScrollbarMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!topScrollbarRef.current || maxTableScrollLeft <= 0) return;
    const rect = topScrollbarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const targetRatio = rect.width > 0 ? clickX / rect.width : 0;
    setTableScrollPosition(targetRatio * maxTableScrollLeft);
  };

  const handleCustomThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (maxTableScrollLeft <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsScrollbarDragging(true);
    scrollbarDragStartXRef.current = e.clientX;
    scrollbarDragStartScrollLeftRef.current = tableScrollLeft;
  };

  useEffect(() => {
    if (!isScrollbarDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!topScrollbarRef.current || maxTableScrollLeft <= 0) return;
      const rect = topScrollbarRef.current.getBoundingClientRect();
      const trackWidth = rect.width;
      if (trackWidth <= 0) return;

      const deltaX = event.clientX - scrollbarDragStartXRef.current;
      const thumbWidthPx = trackWidth * (thumbWidthPct / 100);
      const thumbTravel = Math.max(1, trackWidth - thumbWidthPx);
      const scrollDelta = (deltaX / thumbTravel) * maxTableScrollLeft;
      setTableScrollPosition(
        scrollbarDragStartScrollLeftRef.current + scrollDelta,
      );
    };

    const handleMouseUp = () => {
      setIsScrollbarDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isScrollbarDragging, maxTableScrollLeft, thumbWidthPct, tableScrollLeft]);

  async function handleCreateCustomer() {
    if (!user) return;
    if (!newCustomer.company_name && !newCustomer.name) {
      alert("Please enter a Company name or Customer name");
      return;
    }
    setCreatingCustomer(true);
    try {
      const payload: any = {
        company_name: newCustomer.company_name || newCustomer.name,
        name: newCustomer.name || newCustomer.company_name,
        email: newCustomer.email || null,
        phone: newCustomer.phone || null,
        address: newCustomer.address || null,
        status: "active",
        user_id: user.id,
      };
      const { data, error } = await supabase
        .schema("common")
        .from("customers")
        .insert([payload])
        .select("id, name, company_name")
        .single();
      if (error) throw error;
      await fetchCustomers();
      if (showTMModal) {
        setTMFormData((prev) => ({
          ...prev,
          customer_id: data.id,
          contact_id: "",
        }));
        await fetchContacts(data.id);
      } else {
        setFormData((prev) => ({ ...prev, customer_id: data.id }));
        await fetchContacts(data.id);
      }
      setShowNewCustomer(false);
      setNewCustomer({
        company_name: "",
        name: "",
        email: "",
        phone: "",
        address: "",
      });
    } catch (err: any) {
      console.error("Error creating customer:", err);
      alert(err.message || "Failed to create customer");
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function handleCreateContact() {
    if (!user) return;
    const customerId = TMFormData.customer_id || formData.customer_id;
    if (!customerId) {
      alert("Please select or create a customer first");
      return;
    }
    if (!newContact.first_name || !newContact.last_name) {
      alert("Please enter first and last name");
      return;
    }
    setCreatingContact(true);
    try {
      const contactPayload: Record<string, unknown> = {
        first_name: newContact.first_name,
        last_name: newContact.last_name,
        email: newContact.email || null,
        phone: newContact.phone || null,
        customer_id: customerId,
        user_id: user.id,
        is_primary: false,
      };
      const { data: inserted, error } = await supabase
        .schema("common")
        .from("contacts")
        .insert([contactPayload])
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("Contact insert error:", error);
        throw error;
      }
      await fetchContacts(customerId);
      setShowNewContact(false);
      setNewContact({ first_name: "", last_name: "", email: "", phone: "" });
      if (inserted?.id) {
        if (TMFormData.customer_id === customerId)
          setTMFormData((prev) => ({ ...prev, contact_id: inserted.id }));
        if (formData.customer_id === customerId)
          setFormData((prev) => ({ ...prev, contact_id: inserted.id }));
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to create contact";
      console.error("Error creating contact:", err);
      alert(message);
    } finally {
      setCreatingContact(false);
    }
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
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("contacts")
        .select("id, first_name, last_name, customer_id")
        .eq("customer_id", customerId)
        .order("first_name");

      if (error) throw error;
      setContacts(data || []);
      setFormData((prev) => ({ ...prev, contact_id: "" }));
      setTMFormData((prev) => ({ ...prev, contact_id: "" }));
    } catch (error) {
      console.error("Error fetching contacts:", error);
    }
  }

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log("Form submitted");

    if (!user) {
      console.error("No user found");
      alert("You must be logged in to create an opportunity");
      return;
    }

    try {
      // Check if the opportunities table exists in the correct schema
      const { data: tableCheck, error: tableError } = await supabase
        .schema("business") // Specify schema
        .from("opportunities")
        .select("count", { head: true, count: "exact" }); // Use head:true for faster count check

      if (tableError) {
        console.error("Table check error:", tableError);
        // Check if the error specifically indicates the relation doesn't exist
        if (tableError.code === "42P01") {
          alert(
            "The opportunities table is not properly set up in the business schema. Please contact support.",
          );
        } else {
          alert(
            "Error checking opportunities table setup. Please contact support.",
          );
        }
        return;
      }

      // Log the count result (optional)
      // console.log('Table check count:', tableCheck?.count);

      console.log("Processing form data:", formData);

      // Validate required fields
      if (!formData.customer_id) {
        console.error("Missing customer");
        alert("Please select a customer");
        return;
      }

      // First check if the customer exists in the common schema
      const { data: customerData, error: customerError } = await supabase
        .schema("common") // Specify schema
        .from("customers")
        .select("id") // Explicitly select 'id' instead of using head:true
        .eq("id", formData.customer_id)
        .maybeSingle(); // Use maybeSingle to handle null without error

      // Add detailed logging for the customer check
      console.log("[handleSubmit] Customer Check:", {
        customerIdToCheck: formData.customer_id,
        customerDataResult: customerData, // Will be null if not found
        customerErrorResult: customerError,
      });

      if (customerError) {
        console.error("Customer validation database error:", customerError);
        alert("Error validating customer. Please try again.");
        return;
      }
      if (!customerData) {
        // CustomerData will be null if not found
        console.error(
          "Selected customer does not exist:",
          formData.customer_id,
        );
        alert(
          "Selected customer does not exist. Please refresh and try again.",
        );
        return;
      }

      // Compute the next sequential quote number (numeric, starting at 3803)
      async function computeNextQuoteNumber(): Promise<number> {
        // Fetch recent opportunities and compute max numeric quote_number
        const { data: recent, error: recentError } = await supabase
          .schema("business")
          .from("opportunities")
          .select("quote_number")
          .order("created_at", { ascending: false })
          .limit(500);

        if (recentError) {
          console.warn(
            "Error reading existing quote numbers, defaulting seed:",
            recentError,
          );
        }

        const nums: number[] = (recent || [])
          .map((r) => (r as any)?.quote_number)
          .filter((q: any) => typeof q === "string" && /^[0-9]+$/.test(q))
          .map((q: string) => parseInt(q, 10))
          .filter((n) => Number.isFinite(n));

        const maxNumeric = nums.length ? Math.max(...nums) : 0;
        const base = 3802; // so next becomes 3803 if none exist
        return Math.max(maxNumeric, base) + 1;
      }

      let nextQuoteNumber = await computeNextQuoteNumber();

      // Create a new object with processed data
      const opportunityDataBase: any = {
        customer_id: formData.customer_id,
        contact_id: formData.contact_id || null, // Ensure contact_id can be null
        title: formData.title || "",
        description: formData.description || "",
        status: formData.status || "awareness",
        expected_value: formData.expected_value
          ? parseFloat(formData.expected_value)
          : 0,
        probability: formData.probability ? parseInt(formData.probability) : 0, // Parse probability
        notes: formData.notes || "",
        amp_division: formData.amp_division,
        sales_person: user.email, // Automatically set to the user's email
        user_id: user.id,
        quote_number: String(nextQuoteNumber),
        proposal_due_date: formData.proposal_due_date || null,
        estimated_start_date: formData.estimated_start_date || null,
        estimated_end_date: formData.estimated_end_date || null,
        reviewed_by: formData.reviewed_by || null,
        prepared_by: formData.prepared_by || null,
        documents_stage: formData.documents_stage || null,
        // opportunity_created_date will be auto-generated by the database trigger
      };

      console.log("Sending to Supabase:", opportunityDataBase);

      // Try to insert into the business schema with retry on unique conflict
      let data: any = null;
      let error: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        ({ data, error } = await supabase
          .schema("business")
          .from("opportunities")
          .insert({
            ...opportunityDataBase,
            quote_number: String(nextQuoteNumber),
          })
          .select()
          .single());

        if (!error) break;
        // If optional date columns don't exist in this environment yet, drop and retry once
        if (error?.code === "42703") {
          const optionalDateColumns = [
            "proposal_due_date",
            "estimated_start_date",
            "estimated_end_date",
          ];
          const missingOptionalColumn =
            optionalDateColumns.find(
              (column) =>
                column in opportunityDataBase &&
                (error?.message?.includes(`'${column}'`) ||
                  error?.message?.includes(`"${column}"`)),
            ) ||
            optionalDateColumns.find((column) => column in opportunityDataBase);
          if (missingOptionalColumn) {
            delete opportunityDataBase[missingOptionalColumn];
            continue;
          }
        }
        if (error?.code === "23505") {
          // Unique violation on quote_number: increment and retry
          nextQuoteNumber += 1;
          continue;
        }
        break;
      }

      if (error) {
        console.error("Detailed Supabase error:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          error: error,
        });

        // Handle specific error cases
        if (error.code === "23505") {
          // Unique violation
          alert("A quote number conflict occurred. Please try again.");
        } else if (error.code === "23503") {
          // Foreign key violation
          alert("Invalid customer or contact selected. Please try again.");
        } else if (error.code === "42P01") {
          // Table does not exist
          alert(
            "The opportunities table is not properly set up. Please contact support.",
          );
        } else {
          alert(
            `Error creating opportunity: ${error.message || "Unknown error"}`,
          );
        }
        throw error;
      }

      // --- Add default subcontractor agreement PDF ---
      try {
        const publicURL = "/templates/subcontractor-agreement-template.pdf";
        await supabase
          .schema("business")
          .from("subcontractor_agreements")
          .insert({
            opportunity_id: data.id,
            user_id: user.id,
            name: "Default Document",
            file_url: publicURL,
            status: "pending",
            upload_date: new Date().toISOString(),
          });
      } catch (err) {
        console.error("Error adding default subcontractor agreement:", err);
        // Don't block opportunity creation if this fails
      }

      console.log("Created opportunity:", data);
      alert("Opportunity created successfully!");
      setIsOpen(false);
      setFormData(initialFormData);
      fetchOpportunities();
    } catch (error: any) {
      console.error("Error creating opportunity:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        error: error,
      });

      // Try to get more specific error information
      let errorMessage = "Database error";
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (error?.hint) {
        errorMessage = error.hint;
      }

      alert(`Error creating opportunity: ${errorMessage}`);
    }
  }

  // T&M form handlers
  function handleTMChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    const { name, value } = e.target;
    setTMFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleTMSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!user?.id) {
      alert("User not authenticated");
      return;
    }

    if (!TMFormData.customer_id || !TMFormData.title || !TMFormData.division) {
      alert("Please fill in all required fields (Customer, Title, Division)");
      return;
    }

    setIsCreatingTM(true);

    try {
      // Get the next quote number for the opportunity
      const { data: recent } = await supabase
        .schema("business")
        .from("opportunities")
        .select("quote_number")
        .order("created_at", { ascending: false })
        .limit(500);

      const nums: number[] = (recent || [])
        .map((r) => (r as any)?.quote_number)
        .filter((q: any) => typeof q === "string" && /^[0-9]+$/.test(q))
        .map((q: string) => parseInt(q, 10))
        .filter((n) => Number.isFinite(n));

      const maxNumeric = nums.length ? Math.max(...nums) : 0;
      const base = 3802;
      const nextQuoteNumber = Math.max(maxNumeric, base) + 1;

      // Get the next job number: try RPC first, then fall back to client scan
      let nextJobNumberNumeric = 26001;
      let gotFromRpc = false;
      try {
        const { data: fnResult } = await withPgTimeoutRetry(async () =>
          supabase.rpc("get_max_job_number"),
        );
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
      if (!gotFromRpc) {
        try {
          const { data: jobsScan } = await supabase
            .schema("neta_ops")
            .from("jobs")
            .select("job_number")
            .limit(2000);
          const jobNums = (jobsScan || [])
            .map((j: any) => j?.job_number)
            .filter((s: any) => s != null && s !== "")
            .map((s: any) => {
              const str = typeof s === "string" ? s : String(s);
              if (/^[0-9]+$/.test(str)) return parseInt(str, 10);
              const digits = str.replace(/\D/g, "");
              return digits ? parseInt(digits, 10) : 0;
            })
            .filter((n: number) => Number.isFinite(n));
          const maxLocal = jobNums.length ? Math.max(...jobNums) : 0;
          nextJobNumberNumeric = maxLocal < 26000 ? 26001 : maxLocal + 1;
        } catch {}
      }
      const nextJobNumberStr = String(nextJobNumberNumeric);

      // Create the opportunity first
      const opportunityData = {
        customer_id: TMFormData.customer_id,
        contact_id: TMFormData.contact_id || null,
        title: TMFormData.title,
        description: TMFormData.description || "",
        status: "awarded", // T&M opportunities are considered awarded
        expected_value: 0,
        probability: 100,
        notes: "Created from T&M form",
        amp_division: TMFormData.division,
        sales_person: user.email,
        user_id: user.id,
        quote_number: String(nextQuoteNumber),
        reviewed_by: null,
        prepared_by: null,
        opportunity_type: "time_materials", // Mark as T&M opportunity
      };

      const { data: newOpportunity, error: opportunityError } =
        await withPgTimeoutRetry<{ id: string }>(async () =>
          supabase
            .schema("business")
            .from("opportunities")
            .insert(opportunityData)
            .select("id")
            .single(),
        );

      if (opportunityError || !newOpportunity) {
        throw (
          opportunityError || new Error("Opportunity insert returned no row")
        );
      }

      // Create the job — minimal RETURNING + retries for PG 57014 (statement timeout)
      const jobPayload = {
        user_id: user.id,
        customer_id: TMFormData.customer_id,
        title: TMFormData.title,
        description: TMFormData.description || "",
        status: "pending",
        start_date: new Date().toISOString().substring(0, 10),
        budget: null,
        notes: "Created from T&M opportunity",
        priority: "medium",
        division: TMFormData.division,
        job_number: nextJobNumberStr,
        opportunity_id: newOpportunity.id,
      };

      const { data: newJob, error: jobError } = await withPgTimeoutRetry<{
        id: string;
      }>(async () =>
        supabase
          .schema("neta_ops")
          .from("jobs")
          .insert(jobPayload)
          .select("id")
          .single(),
      );

      if (jobError || !newJob) {
        throw jobError || new Error("Job insert returned no row");
      }

      // Link the opportunity to the job
      try {
        await supabase
          .schema("business")
          .from("opportunities")
          .update({ job_id: newJob.id })
          .eq("id", newOpportunity.id);
      } catch (linkError) {
        console.warn("Could not link opportunity to job:", linkError);
        // Don't fail the process if linking fails
      }

      // Add default files to the newly created job
      try {
        await addDefaultFilesToJob(newJob.id, user.id, TMFormData.division);
        console.log("Default files added successfully to job:", newJob.id);
      } catch (fileError) {
        console.error("Error adding default files to job:", fileError);
        // Don't fail the job creation if default files fail
      }

      alert("T&M opportunity and job created successfully!");
      setShowTMModal(false);
      setTMFormData({
        customer_id: "",
        contact_id: "",
        title: "",
        description: "",
        division: "",
      });

      // Navigate to the new job
      navigate(`/jobs/${newJob.id}`);
    } catch (error: any) {
      console.error("Error creating T&M opportunity and job:", error);
      alert(
        `Error creating T&M opportunity and job: ${error?.message || "Unknown error"}`,
      );
    } finally {
      setIsCreatingTM(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 flex flex-col items-center justify-center">
        <div className="text-red-600 dark:text-red-400 mb-4">
          <svg
            className="w-12 h-12"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div className="text-gray-900 dark:text-gray-100 mb-4">{loadError}</div>
        <button
          onClick={() => {
            setLoadError(null);
            setLoading(true);
            fetchOpportunities();
          }}
          className="px-4 py-2 bg-[#f26722] hover:bg-[#e55611] text-white font-medium rounded-md flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-dark-900">
              Opportunities
            </h1>
            {selectedForMerge.size > 0 && (
              <div className="mt-3 flex items-center gap-3 text-sm">
                <span className="text-gray-600 dark:text-dark-400">
                  {selectedForMerge.size} selected
                </span>
                <button
                  type="button"
                  onClick={handleMoveSelectedToProjection}
                  className="rounded-md bg-[#f26722] px-3 py-1.5 font-medium text-white hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                >
                  Move to Projection
                </button>
                <button
                  type="button"
                  disabled={selectedForMerge.size < 2}
                  onClick={handleMergeSelected}
                  className={`rounded-md px-3 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                    selectedForMerge.size < 2
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-dark-200 dark:text-dark-400"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  Merge selected
                </button>
                {selectedForMerge.size < 2 && (
                  <span className="text-xs text-gray-500 dark:text-dark-400">
                    Pick at least 2 opportunities.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              to="/sales-dashboard/opportunities/calendar"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#f26722] dark:border-dark-300 dark:bg-dark-150 dark:text-white dark:hover:bg-dark-100"
            >
              <Calendar className="h-4 w-4 text-[#f26722]" />
              Calendar
            </Link>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by quote #, title, description, sales person, or customer"
                className={`w-72 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                  searchTerm
                    ? "border-[#f26722] bg-orange-50 dark:bg-orange-900/20"
                    : "border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150"
                } text-gray-900 dark:text-white`}
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <LoadingSpinner size="xs" />
                </div>
              )}
              {searchTerm && !searchLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="w-2 h-2 bg-[#f26722] rounded-full"></div>
                </div>
              )}
            </div>
            <div className="relative" ref={filterMenuRef}>
              <button
                type="button"
                onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                  activeFilterCount > 0
                    ? "text-[#f26722]"
                    : "text-gray-700 hover:text-[#f26722] dark:text-white dark:hover:text-[#f26722]"
                }`}
                aria-expanded={isFilterMenuOpen}
                aria-label="Filter opportunities"
                title="Filter"
              >
                <Filter className="h-5 w-5" />
              </button>
              {isFilterMenuOpen && (
                <div className="absolute right-0 z-20 mt-2 max-h-[70vh] w-72 overflow-y-scroll rounded-md border border-gray-200 dark:border-dark-300 bg-white dark:bg-dark-150 p-3 shadow-lg [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:#f26722_#f3f4f6] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#f26722] [&::-webkit-scrollbar-thumb]:hover:bg-[#e55611] dark:[scrollbar-color:#f26722_#262626] dark:[&::-webkit-scrollbar-track]:bg-dark-200">
                  <div>
                    <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                      Division
                    </div>
                    {renderFilterOptions(
                      DIVISION_FILTER_OPTIONS,
                      divisionFilters,
                      setDivisionFilters,
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                      Type
                    </div>
                    {renderFilterOptions(
                      OPPORTUNITY_TYPE_OPTIONS,
                      opportunityTypeFilters,
                      setOpportunityTypeFilters,
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                      Status
                    </div>
                    {renderFilterOptions(
                      STATUS_FILTER_OPTIONS,
                      statusFilters,
                      setStatusFilters,
                    )}
                  </div>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDivisionFilters([]);
                        setOpportunityTypeFilters([]);
                        setStatusFilters([]);
                        setPage(1);
                      }}
                      className="mt-3 w-full rounded-md border border-gray-300 dark:border-dark-300 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-dark-100 focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="relative" ref={sortMenuRef}>
              <button
                type="button"
                onClick={() => setIsSortMenuOpen((prev) => !prev)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-700 hover:text-[#f26722] focus:outline-none focus:ring-2 focus:ring-[#f26722] dark:text-white dark:hover:text-[#f26722]"
                aria-expanded={isSortMenuOpen}
                aria-label="Sort opportunities"
                title="Sort"
              >
                <ArrowDownWideNarrow className="h-5 w-5" />
              </button>
              {isSortMenuOpen && (
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-md border border-gray-200 dark:border-dark-300 bg-white dark:bg-dark-150 p-3 shadow-lg">
                  <div>
                    <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                      Sort by
                    </div>
                    {renderSingleChoiceOptions(
                      SORT_FIELD_OPTIONS,
                      sortField,
                      setSortField,
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                      Order
                    </div>
                    {renderSingleChoiceOptions(
                      SORT_DIRECTION_OPTIONS,
                      sortDirection,
                      setSortDirection,
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(true);
                setFormData(initialFormData);
              }}
              className="inline-flex items-center justify-center rounded-md bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </button>
            {/* Only show T&M button to authorized users */}
            {(user?.email === "william.sasser@ampqes.com" ||
              user?.email === "john.chambers@ampqes.com" ||
              user?.email === "anthony.masters@ampqes.com" ||
              user?.email === "caleb.hipp@ampqes.com" ||
              user?.email === "zach.freeborn@ampqes.com" ||
              user?.email === "zecahriah.freeborn@ampqes.com" ||
              user?.email === "ethan.thoenes@ampqes.com" ||
              user?.email === "greg.pellerito@ampqes.com" ||
              user?.email === "michael.bland@ampqes.com" ||
              user?.email === "kelly.lawton@ampqes.com") && (
              <button
                type="button"
                onClick={() => {
                  setShowTMModal(true);
                  setTMFormData({
                    customer_id: "",
                    contact_id: "",
                    title: "",
                    description: "",
                    division: "",
                  });
                }}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add T&M or Emergency Job
              </button>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-dark-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 dark:border-dark-200">
            <div
              ref={topScrollbarRef}
              className="relative min-w-0 flex-1 h-2 bg-gray-200 dark:bg-dark-200 cursor-pointer"
              onMouseDown={handleCustomScrollbarMouseDown}
              aria-label="Horizontal table scrollbar"
            >
              <div
                className={`absolute top-0 h-2 bg-[#f26722] ${isScrollbarDragging ? "cursor-grabbing" : "cursor-grab"}`}
                style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
                onMouseDown={handleCustomThumbMouseDown}
                aria-hidden
              />
            </div>
          </div>
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto"
            onScroll={(e) => setTableScrollLeft(e.currentTarget.scrollLeft)}
          >
            <table
              ref={tableRef}
              className="min-w-full divide-y divide-gray-200 dark:divide-dark-200"
            >
              <thead className="bg-gray-50 dark:bg-dark-150">
                <tr>
                  <th
                    scope="col"
                    className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  ></th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Quote
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Due
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Created
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Customer
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Opportunity
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Est. Approval
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Job
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Division
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Amount
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                  >
                    Probability
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-dark-200">
                {opportunities.length === 0 ? (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-6 py-4 text-center text-gray-500 dark:text-dark-400"
                    >
                      {activeFilterCount > 0 || searchTerm
                        ? "No opportunities match the current filters."
                        : 'No opportunities found. Click "Add Opportunity" to create one.'}
                    </td>
                  </tr>
                ) : (
                  opportunities.map((opportunity) => (
                    <tr
                      key={opportunity.id}
                      onClick={() => {
                        openOpportunity(opportunity.id);
                      }}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors"
                    >
                      <td
                        className="px-3 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedForMerge.has(opportunity.id)}
                          onChange={(e) => {
                            setSelectedForMerge((prev) => {
                              const copy = new Set(prev);
                              if (e.target.checked) copy.add(opportunity.id);
                              else copy.delete(opportunity.id);
                              return copy;
                            });
                          }}
                          aria-label={`Select quote ${opportunity.quote_number ?? ""}`}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-dark-900">
                          {opportunity.quote_number}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-400">
                        {opportunity.proposal_due_date
                          ? formatDateSafe(opportunity.proposal_due_date)
                          : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-400">
                        {formatDateSafe(opportunity.opportunity_created_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-dark-900">
                          {maskCustomerName(
                            opportunity.customers?.company_name ||
                              opportunity.customers?.name,
                          ) || "Unknown Customer"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">
                          {opportunity.title}
                        </div>
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={opportunity.status || ""}
                          onChange={(e) =>
                            handleOpportunityStatusChange(
                              opportunity.id,
                              e.target.value,
                            )
                          }
                          className={`min-w-[140px] px-2 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-[#f26722] focus:ring-offset-0 dark:bg-transparent ${getStatusColor(
                            opportunity.status,
                          )}`}
                          onClick={(e) => e.stopPropagation()}
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
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={
                            ((opportunity as any).estimate_approval_status ===
                            "no quote"
                              ? "no_quote"
                              : (opportunity as any)
                                  .estimate_approval_status) ?? ""
                          }
                          onChange={(e) =>
                            handleEstimateApprovalStatusChange(
                              opportunity.id,
                              e.target.value,
                            )
                          }
                          disabled={!(opportunity as any).latest_estimate_id}
                          className={`min-w-[140px] px-2 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-[#f26722] focus:ring-offset-0 disabled:opacity-70 disabled:cursor-not-allowed dark:bg-transparent ${getEstimateApprovalColor(
                            (opportunity as any).estimate_approval_status,
                          )}`}
                          onClick={(e) => e.stopPropagation()}
                          title={
                            (opportunity as any).latest_estimate_id
                              ? "Change estimate approval status"
                              : "No estimate — create one in opportunity detail to set status"
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
                            title="Not submitting a quote"
                          >
                            No Quote — not submitting
                          </option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">
                          {(opportunity as any).job_number ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/jobs/${opportunity.job_id}`);
                              }}
                              className="text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90 font-medium"
                              title="View Job"
                            >
                              {(opportunity as any).job_number}
                            </button>
                          ) : (
                            "-"
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">
                          {opportunity.amp_division ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDivision(opportunity.amp_division);
                                setShowDivisionAnalytics(true);
                              }}
                              className="text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                            >
                              {formatDivisionName(opportunity.amp_division)}
                            </button>
                          ) : (
                            "-"
                          )}
                        </div>
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={getOpportunityTypeValue(opportunity)}
                          onChange={(e) =>
                            handleOpportunityTypeChange(
                              opportunity.id,
                              e.target.value,
                            )
                          }
                          className={`min-w-[160px] px-2 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-[#f26722] focus:ring-offset-0 dark:bg-transparent ${getOpportunityTypeColor(
                            getOpportunityTypeValue(opportunity),
                          )}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="large_acceptance">
                            Large Acceptance
                          </option>
                          <option value="small_acceptance">
                            Small Acceptance
                          </option>
                          <option value="maintenance">Maintenance</option>
                          <option value="engineering">Engineering</option>
                          <option value="time_materials">
                            Time & Materials
                          </option>
                          <option value="other">Other</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">
                          {(() => {
                            // Use quoted_amount field (same as shown in Opportunity Overview)
                            // This is the "Quoted Amount (NET 30)" from the opportunity record
                            return (opportunity as any).quoted_amount
                              ? `$${Number(
                                  (opportunity as any).quoted_amount,
                                ).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : "-";
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-dark-900">
                          {opportunity.probability !== null &&
                          opportunity.probability !== undefined
                            ? `${opportunity.probability}%`
                            : "-"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div
                          className="flex justify-end space-x-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {projectionOpportunityIds.has(opportunity.id) && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setProjectionPopupPos({
                                    x: e.clientX,
                                    y: e.clientY,
                                  });
                                  setOpenProjectionMenuId((currentId) =>
                                    currentId === opportunity.id
                                      ? null
                                      : opportunity.id,
                                  );
                                }}
                                className="text-gray-600 hover:text-[#f26722] dark:text-gray-300 dark:hover:text-[#f26722]"
                                title="In Pipeline Projection"
                                aria-label="In Pipeline Projection"
                              >
                                <ChartGantt className="h-5 w-5" />
                              </button>
                              {openProjectionMenuId === opportunity.id &&
                                projectionPopupPos && (
                                  <div
                                    ref={projectionMenuRef}
                                    className="fixed z-50 w-48 rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900 dark:ring-white/10"
                                    style={{
                                      left: projectionPopupPos.x - 200,
                                      top: projectionPopupPos.y - 4,
                                    }}
                                  >
                                    <Link
                                      to="/sales/pipeline-calendar"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenProjectionMenuId(null);
                                        setProjectionPopupPos(null);
                                      }}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                      <ExternalLink className="h-4 w-4 shrink-0 text-gray-400" />
                                      Go to pipeline
                                    </Link>
                                    <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveFromProjection(
                                          opportunity.id,
                                        );
                                        setProjectionPopupPos(null);
                                      }}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                    >
                                      <MinusCircle className="h-4 w-4 shrink-0" />
                                      Remove from Pipeline
                                    </button>
                                  </div>
                                )}
                            </div>
                          )}
                          {!opportunity.job_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openOpportunity(opportunity.id);
                                // The opportunity detail page will show the Convert to Job button
                              }}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              title="Convert to Job"
                            >
                              <Award className="h-5 w-5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openOpportunity(opportunity.id);
                            }}
                            className="text-[#f26722] hover:text-[#f26722]/90 dark:text-[#f26722] dark:hover:text-[#f26722]/90"
                          >
                            <Pencil className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Controls */}
        <div className="mt-4 flex items-center justify-between">
          <button
            className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 text-gray-700 dark:text-gray-200 disabled:opacity-50"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600 dark:text-white">
            Page {page}
          </span>
          <button
            className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 text-gray-700 dark:text-gray-200 disabled:opacity-50"
            disabled={!hasMore || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {/* Add Opportunity Modal */}
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className="fixed inset-0 z-50 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen p-4">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className={OPPORTUNITY_MODAL_PANEL_CLASS}>
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500 dark:text-white dark:hover:text-gray-200"
                onClick={() => setIsOpen(false)}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>

            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Add New Opportunity
            </Dialog.Title>

            <form onSubmit={handleSubmit} className="space-y-4">
              {showNewCustomer && (
                <div className="border rounded-md p-3 bg-orange-50/60 dark:bg-orange-900/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">
                      New Customer
                    </div>
                    <button
                      type="button"
                      className="text-xs text-gray-600"
                      onClick={() => setShowNewCustomer(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      placeholder="Company name"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.company_name}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          company_name: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Customer name"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.name}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Email"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.email}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Phone"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.phone}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Address"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.address}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreateCustomer}
                      disabled={creatingCustomer}
                      className="px-3 py-1 text-sm rounded bg-[#f26722] text-white hover:bg-[#f26722]/90"
                    >
                      {creatingCustomer ? "Creating..." : "Create customer"}
                    </button>
                  </div>
                </div>
              )}

              {showNewContact && (
                <div className="border rounded-md p-3 bg-orange-50/60 dark:bg-orange-900/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">
                      New Contact
                    </div>
                    <button
                      type="button"
                      className="text-xs text-gray-600"
                      onClick={() => setShowNewContact(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="First name"
                      className="border rounded px-2 py-1 text-sm col-span-1 dark:bg-dark-150 dark:text-white"
                      value={newContact.first_name}
                      onChange={(e) =>
                        setNewContact((prev) => ({
                          ...prev,
                          first_name: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Last name"
                      className="border rounded px-2 py-1 text-sm col-span-1 dark:bg-dark-150 dark:text-white"
                      value={newContact.last_name}
                      onChange={(e) =>
                        setNewContact((prev) => ({
                          ...prev,
                          last_name: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Email"
                      className="border rounded px-2 py-1 text-sm col-span-2 dark:bg-dark-150 dark:text-white"
                      value={newContact.email}
                      onChange={(e) =>
                        setNewContact((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Phone"
                      className="border rounded px-2 py-1 text-sm col-span-2 dark:bg-dark-150 dark:text-white"
                      value={newContact.phone}
                      onChange={(e) =>
                        setNewContact((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCreateContact();
                      }}
                      disabled={creatingContact}
                      className="px-3 py-1 text-sm rounded bg-[#f26722] text-white hover:bg-[#f26722]/90"
                    >
                      {creatingContact ? "Creating..." : "Create contact"}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Sales Person
                </label>
                <input
                  type="text"
                  name="sales_person"
                  value={user?.email || ""}
                  disabled
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-dark-150 focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:text-white cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Sales Stage
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
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
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Customer
                </label>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers (name or company)"
                  className="mt-1 mb-2 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
                {formData.customer_id && (
                  <div className="text-xs text-gray-600 dark:text-white mb-1">
                    Selected:{" "}
                    {customers.find((c) => c.id === formData.customer_id)
                      ?.company_name ||
                      customers.find((c) => c.id === formData.customer_id)
                        ?.name ||
                      "Unknown"}
                    <button
                      type="button"
                      className="ml-2 underline text-[#f26722] hover:text-[#f26722]/90"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, customer_id: "" }))
                      }
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md">
                  {filteredCustomers.slice(0, 20).map((customer) => {
                    const isSelected = formData.customer_id === customer.id;
                    return (
                      <button
                        type="button"
                        key={customer.id}
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            customer_id: customer.id,
                          }));
                          fetchContacts(customer.id);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm ${
                          isSelected
                            ? "bg-orange-50 text-gray-900 dark:bg-orange-900/20 dark:text-white"
                            : "hover:bg-gray-50 dark:hover:bg-dark-200 text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {maskCustomerName(
                          customer.company_name || customer.name,
                        )}
                      </button>
                    );
                  })}
                  {filteredCustomers.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-white">
                      No matches
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewCustomer((prev) => ({
                        ...prev,
                        company_name:
                          customerSearch.trim() || prev.company_name,
                        name: customerSearch.trim() || prev.name,
                      }));
                      setShowNewCustomer(true);
                    }}
                    className="text-sm text-[#f26722] hover:text-[#f26722]/90"
                  >
                    + Add new customer
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Contact
                </label>
                <select
                  name="contact_id"
                  value={formData.contact_id}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  disabled={!formData.customer_id}
                >
                  <option value="" className="dark:bg-dark-150 dark:text-white">
                    No Contact
                  </option>
                  {contacts.map((contact) => (
                    <option
                      key={contact.id}
                      value={contact.id}
                      className="dark:bg-dark-150 dark:text-white"
                    >
                      {contact.first_name} {contact.last_name}
                    </option>
                  ))}
                </select>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewContact(true)}
                    className="text-sm text-[#f26722] hover:text-[#f26722]/90"
                    disabled={!formData.customer_id}
                  >
                    + Add new contact
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Opportunity Title
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Opportunity Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.shiftKey) {
                      e.stopPropagation();
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart ?? 0;
                      const end = target.selectionEnd ?? 0;
                      const current = formData.description || "";
                      const nextVal =
                        current.slice(0, start) + "\n" + current.slice(end);
                      setFormData((prev) => ({
                        ...prev,
                        description: nextVal,
                      }));
                      setTimeout(() => {
                        if (descriptionRef.current) {
                          const pos = start + 1;
                          descriptionRef.current.selectionStart = pos;
                          descriptionRef.current.selectionEnd = pos;
                        }
                      }, 0);
                      return;
                    }
                    if (e.key === "Tab" && e.shiftKey) {
                      e.preventDefault();
                      const target = e.currentTarget;
                      const start = target.selectionStart ?? 0;
                      const end = target.selectionEnd ?? 0;
                      const current = formData.description || "";
                      const nextVal =
                        current.slice(0, start) + "\n" + current.slice(end);
                      setFormData((prev) => ({
                        ...prev,
                        description: nextVal,
                      }));
                      // Restore caret after React updates value
                      setTimeout(() => {
                        if (descriptionRef.current) {
                          const pos = start + 1;
                          descriptionRef.current.selectionStart = pos;
                          descriptionRef.current.selectionEnd = pos;
                        }
                      }, 0);
                    }
                  }}
                  ref={descriptionRef}
                  rows={3}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white">
                    Expected Value ($)
                  </label>
                  <input
                    type="number"
                    name="expected_value"
                    value={formData.expected_value}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white">
                    Probability (%)
                  </label>
                  <input
                    type="number"
                    name="probability"
                    value={formData.probability}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                    min="0"
                    max="100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Proposal Due Date
                </label>
                <input
                  type="date"
                  name="proposal_due_date"
                  value={formData.proposal_due_date}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white">
                    Start Date
                  </label>
                  <input
                    type="date"
                    name="estimated_start_date"
                    value={formData.estimated_start_date}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white">
                    End Date
                  </label>
                  <input
                    type="date"
                    name="estimated_end_date"
                    value={formData.estimated_end_date}
                    onChange={handleChange}
                    min={formData.estimated_start_date || undefined}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  AMP Division
                </label>
                <select
                  name="amp_division"
                  value={formData.amp_division}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
                >
                  <option value="" className="dark:bg-dark-150 dark:text-white">
                    Select a division
                  </option>
                  <option
                    value="north_alabama"
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    Alabama Division
                  </option>
                  <option
                    value="tennessee"
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    Tennessee Division
                  </option>
                  <option
                    value="georgia"
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    Georgia Division
                  </option>
                  <option
                    value="international"
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    International Division
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
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Documents Stage
                </label>
                <select
                  name="documents_stage"
                  value={formData.documents_stage || ""}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                >
                  <option value="" className="dark:bg-dark-150 dark:text-white">
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white">
                    Reviewed By
                  </label>
                  <input
                    type="text"
                    name="reviewed_by"
                    value={formData.reviewed_by}
                    onChange={handleChange}
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                    placeholder="Enter reviewer name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white">
                    Quote Prepared By (Auto-populated)
                  </label>
                  <input
                    type="text"
                    name="prepared_by"
                    value={formData.prepared_by}
                    onChange={handleChange}
                    readOnly
                    className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-200 dark:text-white cursor-not-allowed"
                    placeholder="Auto-populated from quote creators"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-[#f26722] border border-transparent rounded-md shadow-sm hover:bg-[#f26722]/90 focus:outline-none"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      </Dialog>

      {/* T&M Modal */}
      <Dialog
        open={showTMModal}
        onClose={() => {
          setShowTMModal(false);
          setShowNewCustomer(false);
          setShowNewContact(false);
          setNewCustomer({
            company_name: "",
            name: "",
            email: "",
            phone: "",
            address: "",
          });
          setNewContact({
            first_name: "",
            last_name: "",
            email: "",
            phone: "",
          });
        }}
        className="fixed inset-0 z-50 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen p-4">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className={OPPORTUNITY_MODAL_PANEL_CLASS}>
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500 dark:text-white dark:hover:text-gray-200"
                onClick={() => setShowTMModal(false)}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>

            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Add T&M Opportunity
            </Dialog.Title>

            <form onSubmit={handleTMSubmit} className="space-y-4">
              {showNewCustomer && (
                <div className="border rounded-md p-3 bg-orange-50/60 dark:bg-orange-900/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">
                      New Customer
                    </div>
                    <button
                      type="button"
                      className="text-xs text-gray-600 dark:text-gray-400"
                      onClick={() => setShowNewCustomer(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      placeholder="Company name"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.company_name}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          company_name: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Customer name"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.name}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Email"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.email}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Phone"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.phone}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Address"
                      className="border rounded px-2 py-1 text-sm dark:bg-dark-150 dark:text-white"
                      value={newCustomer.address}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCreateCustomer();
                      }}
                      disabled={creatingCustomer}
                      className="px-3 py-1 text-sm rounded bg-[#f26722] text-white hover:bg-[#f26722]/90"
                    >
                      {creatingCustomer ? "Creating..." : "Create customer"}
                    </button>
                  </div>
                </div>
              )}
              {showNewContact && (
                <div className="border rounded-md p-3 bg-orange-50/60 dark:bg-orange-900/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">
                      New Contact
                    </div>
                    <button
                      type="button"
                      className="text-xs text-gray-600 dark:text-gray-400"
                      onClick={() => setShowNewContact(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="First name"
                      className="border rounded px-2 py-1 text-sm col-span-1 dark:bg-dark-150 dark:text-white"
                      value={newContact.first_name}
                      onChange={(e) =>
                        setNewContact((prev) => ({
                          ...prev,
                          first_name: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Last name"
                      className="border rounded px-2 py-1 text-sm col-span-1 dark:bg-dark-150 dark:text-white"
                      value={newContact.last_name}
                      onChange={(e) =>
                        setNewContact((prev) => ({
                          ...prev,
                          last_name: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Email"
                      className="border rounded px-2 py-1 text-sm col-span-2 dark:bg-dark-150 dark:text-white"
                      value={newContact.email}
                      onChange={(e) =>
                        setNewContact((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Phone"
                      className="border rounded px-2 py-1 text-sm col-span-2 dark:bg-dark-150 dark:text-white"
                      value={newContact.phone}
                      onChange={(e) =>
                        setNewContact((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCreateContact();
                      }}
                      disabled={creatingContact}
                      className="px-3 py-1 text-sm rounded bg-[#f26722] text-white hover:bg-[#f26722]/90"
                    >
                      {creatingContact ? "Creating..." : "Create contact"}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Customer *
                </label>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers (name or company)"
                  className="mt-1 mb-2 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
                {TMFormData.customer_id && (
                  <div className="text-xs text-gray-600 dark:text-white mb-1">
                    Selected:{" "}
                    {customers.find((c) => c.id === TMFormData.customer_id)
                      ?.company_name ||
                      customers.find((c) => c.id === TMFormData.customer_id)
                        ?.name ||
                      "Unknown"}
                    <button
                      type="button"
                      className="ml-2 underline text-[#f26722] hover:text-[#f26722]/90"
                      onClick={() =>
                        setTMFormData((prev) => ({ ...prev, customer_id: "" }))
                      }
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md">
                  {filteredCustomers.slice(0, 20).map((customer) => {
                    const isSelected = TMFormData.customer_id === customer.id;
                    return (
                      <button
                        type="button"
                        key={customer.id}
                        onClick={() => {
                          setTMFormData((prev) => ({
                            ...prev,
                            customer_id: customer.id,
                            contact_id: "",
                          }));
                          fetchContacts(customer.id);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm ${
                          isSelected
                            ? "bg-orange-50 text-gray-900 dark:bg-orange-900/20 dark:text-white"
                            : "hover:bg-gray-50 dark:hover:bg-dark-200 text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {maskCustomerName(
                          customer.company_name || customer.name,
                        )}
                      </button>
                    );
                  })}
                  {filteredCustomers.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-white">
                      No matches
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewCustomer((prev) => ({
                        ...prev,
                        company_name:
                          customerSearch.trim() || prev.company_name,
                        name: customerSearch.trim() || prev.name,
                      }));
                      setShowNewCustomer(true);
                    }}
                    className="text-sm text-[#f26722] hover:text-[#f26722]/90"
                  >
                    + Add new customer
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Contact
                </label>
                <select
                  name="contact_id"
                  value={TMFormData.contact_id}
                  onChange={handleTMChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  disabled={!TMFormData.customer_id}
                >
                  <option value="" className="dark:bg-dark-150 dark:text-white">
                    No Contact
                  </option>
                  {contacts.map((contact) => (
                    <option
                      key={contact.id}
                      value={contact.id}
                      className="dark:bg-dark-150 dark:text-white"
                    >
                      {contact.first_name} {contact.last_name}
                    </option>
                  ))}
                </select>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewContact(true)}
                    className="text-sm text-[#f26722] hover:text-[#f26722]/90"
                    disabled={!TMFormData.customer_id}
                  >
                    + Add new contact
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={TMFormData.title}
                  onChange={handleTMChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Division *
                </label>
                <select
                  name="division"
                  value={TMFormData.division}
                  onChange={handleTMChange}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
                >
                  <option value="" className="dark:bg-dark-150 dark:text-white">
                    Select a division
                  </option>
                  <option
                    value="north_alabama"
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    Alabama Division
                  </option>
                  <option
                    value="tennessee"
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    Tennessee Division
                  </option>
                  <option
                    value="georgia"
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    Georgia Division
                  </option>
                  <option
                    value="international"
                    className="dark:bg-dark-150 dark:text-white"
                  >
                    International Division
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
                <label className="block text-sm font-medium text-gray-700 dark:text-white">
                  Description
                </label>
                <textarea
                  name="description"
                  value={TMFormData.description}
                  onChange={handleTMChange}
                  rows={3}
                  className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  placeholder="Optional description"
                />
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-dark-200 focus:outline-none"
                  onClick={() => setShowTMModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTM}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50"
                >
                  {isCreatingTM ? "Creating..." : "Create T&M or Emergency Job"}
                </button>
              </div>
            </form>
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
    </>
  );
}
