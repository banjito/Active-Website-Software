import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  X,
  MapPin,
  ChevronDown,
  ChevronUp,
  ArrowDownWideNarrow,
  Check,
} from "lucide-react";
import { Dialog } from "@headlessui/react";
import { format } from "date-fns";
import { supabase, isConnectionError } from "@/lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { useDemoMode } from "../../lib/DemoModeContext";
import {
  useNavigate,
  useSearchParams,
  useParams,
  useLocation,
} from "react-router-dom";
import { useDivision } from "../../App";
import { JobNotifications } from "./JobNotifications";
import { Database } from "@/types/supabase"; // Assuming this is the correct path to your generated types
import { addDefaultFilesToJob } from "../../lib/services/defaultJobFiles";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { withPgTimeoutRetry } from "../../lib/retryPgTimeout";
import { formatStatusLabel } from "@/utils/formatters";

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  customer_id?: string;
}

interface TMFormData {
  customer_id: string;
  contact_id: string;
  title: string;
  description: string;
  division: string;
}

// Helper function to determine if the division is lab-related
const isLabDivision = (div: string | null | undefined): boolean => {
  if (!div) return false;
  const lowerDiv = div.toLowerCase();
  return ["calibration", "armadillo", "lab"].includes(lowerDiv);
};

interface Job {
  id: string;
  customer_id: string | null;
  title: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  budget: number | null;
  amount_paid?: number | null;
  priority: string;
  job_number: string | null;
  division?: string | null;
  description?: string | null;
  user_id?: string | null;
  notes?: string | null;
  job_type?: string | null;
  portal_type?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null; // Soft delete timestamp
  submittal_job_type?: "standard" | "data_center" | null;
  submittal_window_hours?: number | null;
  opportunity_id?: string | null;
  customers?: {
    id: string;
    name: string;
    company_name: string;
  } | null;
  opportunity?: {
    id: string;
    opportunity_type?: string;
    quote_number?: string | null;
  } | null;
  contractValue?: number; // Remaining balance left to bill (matches JobDetail remainingBalance)
  poNumbers?: string[]; // PO numbers from purchase_order job_contracts (for search)
}

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface JobFormData {
  customer_id: string;
  title: string;
  description: string;
  status: string;
  start_date: string;
  due_date: string;
  budget: string;
  priority: string;
  notes?: string;
  job_number?: string;
}

/** Strip non-alphanumerics + lowercase so "240123" matches "24-0123" and "PO #123" matches "123". */
const normalizeId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type StatusFilter = "all" | "in_progress" | "pending" | "completed" | "billed";
type JobSortField = "status" | "budget" | "priority" | "job_number" | "title";
type SortDirection = "asc" | "desc";

const SORT_FIELD_OPTIONS: Array<{ value: JobSortField; label: string }> = [
  { value: "status", label: "Status" },
  { value: "budget", label: "Quoted Amount" },
  { value: "priority", label: "Priority" },
  { value: "job_number", label: "Job Number" },
  { value: "title", label: "Title" },
];

const SORT_DIRECTION_OPTIONS: Array<{ value: SortDirection; label: string }> = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
];

const initialFormData: JobFormData = {
  customer_id: "",
  title: "",
  description: "",
  status: "pending",
  start_date: "",
  due_date: "",
  budget: "",
  priority: "medium",
  notes: "",
  job_number: "",
};

export default function JobList() {
  const { user, loading: authLoading } = useAuth();
  const { maskCustomerName, maskJobTitle } = useDemoMode();
  const navigate = useNavigate();
  const location = useLocation();
  const { division: contextDivision } = useDivision();
  const { division: urlDivision } = useParams();
  const [searchParams] = useSearchParams();

  const division =
    urlDivision || contextDivision || searchParams.get("division");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<JobFormData>(initialFormData);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<JobSortField>("job_number");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [showTMModal, setShowTMModal] = useState(false);
  const [TMFormData, setTMFormData] = useState<TMFormData>({
    customer_id: "",
    contact_id: "",
    title: "",
    description: "",
    division: "",
  });
  const [isCreatingTM, setIsCreatingTM] = useState(false);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);

  // New customer/contact creation state
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

  // Date range filter - load from localStorage or default to one week
  const [dateRangeStart, setDateRangeStart] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("jobList-dateRangeStart");
      if (saved) return saved;
    } catch {}
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return oneWeekAgo.toISOString().split("T")[0];
  });
  const [dateRangeEnd, setDateRangeEnd] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("jobList-dateRangeEnd");
      if (saved) return saved;
    } catch {}
    return new Date().toISOString().split("T")[0];
  });

  // Show/hide totals section - default to hidden
  const [showTotals, setShowTotals] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("jobList-showTotals");
      return saved === "true";
    } catch {
      return false;
    }
  });

  // All Time filter - load from localStorage or default to false
  const [allTime, setAllTime] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("jobList-allTime");
      return saved === "true";
    } catch {
      return false;
    }
  });

  // Save date range to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem("jobList-dateRangeStart", dateRangeStart);
      localStorage.setItem("jobList-dateRangeEnd", dateRangeEnd);
    } catch {}
  }, [dateRangeStart, dateRangeEnd]);

  // Save showTotals to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem("jobList-showTotals", showTotals.toString());
    } catch {}
  }, [showTotals]);

  // Save allTime to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem("jobList-allTime", allTime.toString());
    } catch {}
  }, [allTime]);

  useEffect(() => {
    if (!user?.id) return;

    try {
      const saved = localStorage.getItem(`jobList-sort-${user.id}`);
      if (!saved) return;

      const parsed = JSON.parse(saved) as {
        sortField?: JobSortField;
        sortDirection?: SortDirection;
      };
      if (
        parsed.sortField &&
        SORT_FIELD_OPTIONS.some((option) => option.value === parsed.sortField)
      ) {
        setSortField(parsed.sortField);
      }
      if (
        parsed.sortDirection &&
        SORT_DIRECTION_OPTIONS.some(
          (option) => option.value === parsed.sortDirection,
        )
      ) {
        setSortDirection(parsed.sortDirection);
      }
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    try {
      localStorage.setItem(
        `jobList-sort-${user.id}`,
        JSON.stringify({ sortField, sortDirection }),
      );
    } catch {}
  }, [user?.id, sortField, sortDirection]);

  useEffect(() => {
    if (!isSortMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(event.target as Node)
      ) {
        setIsSortMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSortMenuOpen]);

  function sortJobsForDisplay(list: Job[]) {
    const priorityRank: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
    };
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...list].sort((a, b) => {
      if (sortField === "budget") {
        return ((a.budget ?? 0) - (b.budget ?? 0)) * direction;
      }

      if (sortField === "priority") {
        const aRank = priorityRank[(a.priority || "").toLowerCase()] ?? 0;
        const bRank = priorityRank[(b.priority || "").toLowerCase()] ?? 0;
        return (aRank - bRank) * direction;
      }

      if (sortField === "job_number") {
        const aNum = parseInt(
          String(a.job_number ?? "").replace(/\D/g, ""),
          10,
        );
        const bNum = parseInt(
          String(b.job_number ?? "").replace(/\D/g, ""),
          10,
        );
        const aValue = Number.isNaN(aNum) ? Number.MAX_SAFE_INTEGER : aNum;
        const bValue = Number.isNaN(bNum) ? Number.MAX_SAFE_INTEGER : bNum;

        return (aValue - bValue) * direction;
      }

      const aValue = String(a[sortField] || "").toLowerCase();
      const bValue = String(b[sortField] || "").toLowerCase();
      return aValue.localeCompare(bValue) * direction;
    });
  }

  function renderSortOptions<T extends string>(
    options: Array<{ value: T; label: string }>,
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
              onClick={() => setValue(option.value)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                checked
                  ? "bg-orange-50 text-[#f26722] dark:bg-orange-900/20"
                  : "text-neutral-700 hover:bg-neutral-50 dark:text-white dark:hover:bg-dark-100"
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

  useEffect(() => {
    if (user) {
      fetchJobs();
      fetchCustomers();
    } else if (!authLoading) {
      // Auth finished but no user - stop loading
      setLoading(false);
    }
  }, [user, authLoading, division, location.pathname]);

  useEffect(() => {
    let base = jobs;

    // Apply date range filter only if totals section is visible and allTime is not selected
    if (showTotals && !allTime) {
      const startDate = new Date(dateRangeStart);
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999); // Include the entire end date

      base = base.filter((job) => {
        if (!job.start_date) return false;
        const jobDate = new Date(job.start_date);
        return jobDate >= startDate && jobDate <= endDate;
      });
    }

    if (statusFilter !== "all") {
      if (statusFilter === "completed") {
        base = base.filter((j) => {
          const s = (j.status || "").toLowerCase();
          return (
            s === "completed" || s === "ready_to_bill" || s === "ready to bill"
          );
        });
      } else if (statusFilter === "billed") {
        base = base.filter((j) => (j.status || "").toLowerCase() === "billed");
      } else {
        base = base.filter(
          (j) => (j.status || "").toLowerCase() === statusFilter,
        );
      }
    }

    if (searchTerm.trim() === "") {
      setFilteredJobs(sortJobsForDisplay(base));
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    // Format-forgiving variant for IDs (job/PO numbers): ignore dashes, spaces, "#", etc.
    const searchNormalized = normalizeId(searchTerm);
    const filtered = base.filter((job) => {
      return (
        maskJobTitle(job.title)?.toLowerCase().includes(searchLower) ||
        job.customers?.company_name?.toLowerCase().includes(searchLower) ||
        job.customers?.name?.toLowerCase().includes(searchLower) ||
        job.job_number?.toLowerCase().includes(searchLower) ||
        (searchNormalized !== "" &&
          normalizeId(job.job_number || "").includes(searchNormalized)) ||
        job.opportunity?.quote_number?.toLowerCase().includes(searchLower) ||
        (searchNormalized !== "" &&
          normalizeId(job.opportunity?.quote_number || "").includes(
            searchNormalized,
          )) ||
        (job.status || "").toLowerCase().includes(searchLower) ||
        job.description?.toLowerCase().includes(searchLower) ||
        job.poNumbers?.some((po) => po.toLowerCase().includes(searchLower)) ||
        (searchNormalized !== "" &&
          job.poNumbers?.some((po) =>
            normalizeId(po).includes(searchNormalized),
          ))
      );
    });
    setFilteredJobs(sortJobsForDisplay(filtered));
  }, [
    searchTerm,
    statusFilter,
    sortField,
    sortDirection,
    jobs,
    dateRangeStart,
    dateRangeEnd,
    showTotals,
    allTime,
  ]);

  // Calculate totals for each status
  const calculateStatusTotals = () => {
    // Only filter by date range if totals section is visible and allTime is not selected
    let jobsInRange = jobs;

    if (showTotals && !allTime) {
      const startDate = new Date(dateRangeStart);
      const endDate = new Date(dateRangeEnd);
      endDate.setHours(23, 59, 59, 999);

      jobsInRange = jobs.filter((job) => {
        if (!job.start_date) return false;
        const jobDate = new Date(job.start_date);
        return jobDate >= startDate && jobDate <= endDate;
      });
    }

    const totals: Record<string, { count: number; total: number }> = {
      all: { count: 0, total: 0 },
      pending: { count: 0, total: 0 },
      in_progress: { count: 0, total: 0 },
      completed: { count: 0, total: 0 },
      billed: { count: 0, total: 0 },
    };

    // Calculate total contract value from ALL jobs - just sum all contract values
    let contractValueLeftToBill = 0;
    jobs.forEach((job) => {
      const contractValue = job.contractValue ?? 0;
      contractValueLeftToBill += contractValue;
    });

    jobsInRange.forEach((job) => {
      const budget = job.budget || 0;
      const status = (job.status || "").toLowerCase();

      // All jobs
      totals.all.count++;
      totals.all.total += budget;

      // By status
      if (status === "pending") {
        totals.pending.count++;
        totals.pending.total += budget;
      } else if (status === "in_progress" || status === "in-progress") {
        totals.in_progress.count++;
        totals.in_progress.total += budget;
      } else if (
        status === "completed" ||
        status === "ready_to_bill" ||
        status === "ready to bill"
      ) {
        totals.completed.count++;
        totals.completed.total += budget;
      } else if (status === "billed") {
        totals.billed.count++;
        totals.billed.total += budget;
      }
    });

    return {
      ...totals,
      contractValueLeftToBill,
    } as typeof totals & { contractValueLeftToBill: number };
  };

  const statusTotals = calculateStatusTotals();

  async function fetchJobs() {
    setLoadError(null);
    setLoading(true);

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.error("JobList: fetchJobs timed out after 30 seconds");
      setLoadError("This is taking longer than expected. Please try again.");
      setLoading(false);
    }, 30000);

    try {
      const currentSchema = isLabDivision(division) ? "lab_ops" : "neta_ops";
      const currentTable = isLabDivision(division) ? "lab_jobs" : "jobs";

      let jobQuery = supabase
        .schema(currentSchema)
        .from(currentTable)
        .select("*")
        .is("deleted_at", null) // Only fetch non-deleted jobs
        .order("created_at", { ascending: false });

      if (division) {
        if (division === "field_tech" || division === "field-tech") {
          jobQuery = jobQuery.in("division", [
            "north_alabama",
            "tennessee",
            "georgia",
            "international",
          ]);
        } else {
          jobQuery = jobQuery.eq("division", division);
        }
      }

      const { data: jobData, error: jobError } = await jobQuery;

      if (jobError) {
        console.error("Error fetching base job data:", jobError);
        if (isConnectionError(jobError)) {
          throw new Error(
            "Unable to connect to the database. Please check your connection.",
          );
        }
        throw jobError;
      }

      if (!jobData) {
        setJobs([]);
        return;
      }

      // Fetch opportunities for jobs that have opportunity_id
      const opportunityIds = [
        ...new Set(
          jobData
            .filter((j: any) => j.opportunity_id)
            .map((j: any) => j.opportunity_id),
        ),
      ];
      let opportunityMap: Record<string, any> = {};
      if (opportunityIds.length > 0) {
        try {
          const { data: opportunitiesData } = await supabase
            .schema("business")
            .from("opportunities")
            .select("id, opportunity_type, quote_number")
            .in("id", opportunityIds);

          if (opportunitiesData) {
            opportunitiesData.forEach((opp: any) => {
              opportunityMap[opp.id] = opp;
            });
          }
        } catch (err) {
          console.warn("Error fetching opportunities:", err);
        }
      }

      // Batch-fetch all customers in one query (avoids N+1)
      const customerIds = [
        ...new Set(
          jobData
            .filter((j: any) => j.customer_id)
            .map((j: any) => j.customer_id),
        ),
      ];
      let customerMap: Record<string, any> = {};
      if (customerIds.length > 0) {
        try {
          const { data: customersData } = await supabase
            .schema("common")
            .from("customers")
            .select("id, name, company_name")
            .in("id", customerIds);
          if (customersData) {
            customersData.forEach((c: any) => {
              customerMap[c.id] = c;
            });
          }
        } catch (err) {
          console.warn("Error batch-fetching customers:", err);
        }
      }

      const jobsWithCustomers = jobData.map((job) => ({
        ...job,
        customers: job.customer_id
          ? customerMap[job.customer_id] || null
          : null,
        opportunity: job.opportunity_id
          ? opportunityMap[job.opportunity_id] || null
          : null,
      }));

      // Fetch contract values for all jobs
      const jobIds = jobsWithCustomers.map((job) => job.id);
      let contractValueMap: Record<string, number> = {};
      const poNumbersMap: Record<string, string[]> = {};

      if (jobIds.length > 0) {
        try {
          const { data: contractsData, error: contractsError } = await supabase
            .schema("neta_ops")
            .from("job_contracts")
            .select("job_id, value, value_operation, name, type")
            .in("job_id", jobIds);

          if (contractsError) {
            console.error("Error fetching contract values:", contractsError);
          }

          if (contractsData && contractsData.length > 0) {
            // Remaining balance per job (same logic as JobDetail remainingBalance)
            const getValueOp = (row: {
              value_operation?: string | null;
              value?: number | null;
            }) => {
              const raw = row.value ?? 0;
              let op =
                row.value_operation ??
                (raw >= 0 ? "add_to_total" : "subtract_from_remaining");
              if (op === "add_to_total" && raw < 0)
                op = "subtract_from_remaining";
              return op;
            };
            contractsData.forEach((row: any) => {
              const jobId = row.job_id;
              // Collect PO numbers (purchase_order contracts) for search
              if (row.type === "purchase_order" && row.name) {
                if (!poNumbersMap[jobId]) poNumbersMap[jobId] = [];
                poNumbersMap[jobId].push(String(row.name));
              }
              const raw = row.value;
              if (raw === null || raw === undefined) return;
              const amount = Math.abs(
                typeof raw === "number" ? raw : parseFloat(raw),
              );
              if (isNaN(amount)) return;
              const op = getValueOp(row);
              if (!contractValueMap[jobId]) contractValueMap[jobId] = 0;
              if (op === "add_to_total" || op === "add_to_remaining")
                contractValueMap[jobId] += amount;
              else if (
                op === "subtract_from_remaining" ||
                op === "subtract_from_total"
              )
                contractValueMap[jobId] -= amount;
            });

            // Log the contract value map
            const jobsWithPositiveValues = Object.entries(
              contractValueMap,
            ).filter(([_, val]) => val > 0);
            if (jobsWithPositiveValues.length > 0) {
              console.log(
                "Jobs with positive contract values:",
                jobsWithPositiveValues,
              );
            } else {
              console.log(
                "No jobs with positive contract values found. Contract value map:",
                contractValueMap,
              );
            }
          } else {
            console.log("No contracts found for jobs");
          }
        } catch (err) {
          console.error("Error fetching contract values:", err);
        }
      }

      // Add contract values to jobs
      const jobsWithContractValues = jobsWithCustomers.map((job) => ({
        ...job,
        contractValue: contractValueMap[job.id] ?? 0,
        poNumbers: poNumbersMap[job.id] ?? [],
      }));

      // Debug: log jobs with contract values
      const jobsWithContracts = jobsWithContractValues.filter(
        (j) => (j.contractValue ?? 0) !== 0,
      );
      if (jobsWithContracts.length > 0) {
        console.log(
          "Jobs with contract values attached:",
          jobsWithContracts.map((j) => ({
            id: j.id,
            title: j.title?.substring(0, 30),
            contractValue: j.contractValue,
            status: j.status,
          })),
        );
      }

      setJobs(jobsWithContractValues as Job[]); // Cast to Job[]
      setFilteredJobs(jobsWithContractValues as Job[]); // Initialize filtered jobs
    } catch (error) {
      console.error("Error in fetchJobs function:", error);
      setLoadError("Failed to load jobs. Please try again.");
    } finally {
      clearTimeout(timeoutId);
      // Always clear loading state - ensures loading is cleared in all scenarios
      setLoading(false);
    }
  }

  async function fetchCustomers() {
    try {
      console.log("Fetching customers");
      const { data, error } = await supabase
        .schema("common")
        .from("customers")
        .select("id, name, company_name")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching customers:", error);
        if (isConnectionError(error)) {
          throw new Error(
            "Unable to connect to the database. Please check your connection.",
          );
        }
        throw error;
      }

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
      setTMFormData((prev) => ({ ...prev, contact_id: "" }));
    } catch (error) {
      console.error("Error fetching contacts:", error);
    }
  }

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

  useEffect(() => {
    if (TMFormData.customer_id) {
      fetchContacts(TMFormData.customer_id);
    }
  }, [TMFormData.customer_id]);

  function handleTMChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    const { name, value } = e.target;
    setTMFormData((prev) => ({ ...prev, [name]: value }));
  }

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
      // Refresh customers and set selected
      await fetchCustomers();
      setTMFormData((prev) => ({ ...prev, customer_id: data.id }));
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
    if (!TMFormData.customer_id) {
      alert("Please select or create a customer first");
      return;
    }
    if (!newContact.first_name || !newContact.last_name) {
      alert("Please enter first and last name");
      return;
    }
    setCreatingContact(true);
    try {
      const contactPayload: any = {
        first_name: newContact.first_name,
        last_name: newContact.last_name,
        email: newContact.email || null,
        phone: newContact.phone || null,
        customer_id: TMFormData.customer_id,
        user_id: user.id,
        is_primary: false,
      };
      const { error } = await supabase
        .schema("common")
        .from("contacts")
        .insert([contactPayload]);
      if (error) throw error;
      // Refresh contacts for selected customer and close form
      await fetchContacts(TMFormData.customer_id);
      setShowNewContact(false);
      setNewContact({ first_name: "", last_name: "", email: "", phone: "" });
    } catch (err: any) {
      console.error("Error creating contact:", err);
      alert(err.message || "Failed to create contact");
    } finally {
      setCreatingContact(false);
    }
  }

  async function handleTMSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!user?.id) {
      alert("User not authenticated");
      return;
    }

    const fieldTechDivisions = [
      "north_alabama",
      "tennessee",
      "georgia",
      "international",
    ];
    const activeDivision = fieldTechDivisions.includes(division || "")
      ? division
      : TMFormData.division;

    if (!TMFormData.customer_id || !TMFormData.title || !activeDivision) {
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
        const { data: fnResult } = await withPgTimeoutRetry(() =>
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
        status: "awarded",
        expected_value: 0,
        probability: 100,
        notes: "Created from T&M form",
        amp_division: activeDivision,
        sales_person: user.email,
        user_id: user.id,
        quote_number: String(nextQuoteNumber),
        reviewed_by: null,
        prepared_by: null,
        opportunity_type: "time_materials", // Mark as T&M opportunity
      };

      const { data: newOpportunity, error: opportunityError } =
        await withPgTimeoutRetry(() =>
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
        division: activeDivision,
        job_number: nextJobNumberStr,
        opportunity_id: newOpportunity.id,
      };

      const { data: newJob, error: jobError } = await withPgTimeoutRetry(() =>
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
      }

      // Add default files to the newly created job
      try {
        await addDefaultFilesToJob(newJob.id, user.id, activeDivision);
        console.log("Default files added successfully to job:", newJob.id);
      } catch (fileError) {
        console.error("Error adding default files to job:", fileError);
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
      setShowNewCustomer(false);
      setShowNewContact(false);
      setNewCustomer({
        company_name: "",
        name: "",
        email: "",
        phone: "",
        address: "",
      });
      setNewContact({ first_name: "", last_name: "", email: "", phone: "" });

      // Refresh jobs list and navigate to the new job
      fetchJobs();
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    let payloadToLog: any = null; // For logging

    try {
      const currentSchema = isLabDivision(division) ? "lab_ops" : "neta_ops";
      const currentTable = isLabDivision(division) ? "lab_jobs" : "jobs";
      const activeDivision = division;

      console.log(
        `Saving job to schema: ${currentSchema}, table: ${currentTable} for division: ${activeDivision}`,
      );

      let finalBudget: number | undefined;
      if (formData.budget) {
        const parsedBudget = parseFloat(formData.budget);
        if (!isNaN(parsedBudget)) {
          finalBudget = parsedBudget;
        }
      }

      if (
        activeDivision?.toLowerCase() === "calibration" ||
        activeDivision?.toLowerCase() === "armadillo"
      ) {
        finalBudget = undefined;
      }

      let result;

      if (currentSchema === "lab_ops") {
        const labJobData: Database["lab_ops"]["Tables"]["lab_jobs"]["Insert"] =
          {
            title: formData.title,
            customer_id: formData.customer_id || null,
            description: formData.description || undefined,
            status: formData.status || "pending",
            priority: formData.priority || "medium",
            start_date: formData.start_date || null,
            due_date: formData.due_date || null,
            notes: formData.notes || undefined,
            job_number: formData.job_number || null,
            user_id: user.id,
            division: activeDivision,
            budget: finalBudget === undefined ? null : finalBudget,
            portal_type: "lab",
          };
        payloadToLog = labJobData;

        result = await supabase
          .schema("lab_ops")
          .from("lab_jobs")
          .insert(labJobData)
          .select("id")
          .single();
      } else {
        // neta_ops
        if (!formData.customer_id) {
          console.error("Customer ID is required for neta_ops jobs.");
          alert("Customer ID is required.");
          return;
        }

        const netaJobData: Database["neta_ops"]["Tables"]["jobs"]["Insert"] = {
          title: formData.title,
          customer_id: formData.customer_id, // Must be string
          description: formData.description || undefined,
          status: formData.status || "pending",
          priority: formData.priority || "medium",
          start_date: formData.start_date || undefined,
          due_date: formData.due_date || undefined,
          notes: formData.notes || undefined,
          job_number: formData.job_number || undefined,
          user_id: user.id,
          division: activeDivision || undefined,
          budget: finalBudget,
          // amount_paid is intentionally removed as it's not in the Insert type
        };
        payloadToLog = netaJobData;

        result = await supabase
          .schema("neta_ops")
          .from("jobs")
          .insert(netaJobData)
          .select("id")
          .single();
      }

      if (result.error) {
        console.error(
          `Error creating job in ${currentSchema}.${currentTable}:`,
          result.error,
        );
        console.error("Payload sent for " + currentSchema + ":", payloadToLog);
        throw result.error;
      }

      console.log(
        `Job created successfully in ${currentSchema}.${currentTable}:`,
        result.data,
      );

      // Add default files to the newly created job
      try {
        await addDefaultFilesToJob(
          result.data.id,
          user.id,
          activeDivision || undefined,
        );
        console.log("Default files added successfully to job:", result.data.id);
      } catch (fileError) {
        console.error("Error adding default files to job:", fileError);
        // Don't fail the job creation if default files fail
        alert("Job created but some default files could not be added");
      }

      setIsOpen(false);
      setFormData(initialFormData);
      setSearchTerm(""); // Clear search when adding new job
      fetchJobs();
    } catch (error) {
      console.error("Caught error in handleSubmit:", error);
      // Log payloadToLog here as well if an error is caught after payload construction but before/during Supabase call
      if (payloadToLog) {
        console.error("Payload at time of error:", payloadToLog);
      }
    }
  }

  function handleInputChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function getStatusColor(status: string) {
    switch (status.toLowerCase()) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-neutral-100 text-neutral-800";
    }
  }

  function formatDivisionName(divisionValue: string | null): string {
    if (!divisionValue) return "";

    const divisionMap: { [key: string]: string } = {
      north_alabama: "Alabama Division",
      tennessee: "Tennessee Division",
      georgia: "Georgia Division",
      international: "International Division",
      engineering: "Engineering",
      scavenger: "Scavenger",
      Decatur: "Alabama Division (Decatur)",
      calibration: "Calibration Lab",
      armadillo: "Armadillo Lab",
      lab: "Lab Portal",
    };

    return divisionMap[divisionValue.toLowerCase()] || divisionValue;
  }

  if (loadError) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
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
        <div className="text-neutral-900 dark:text-neutral-100 mb-4">
          {loadError}
        </div>
        <button
          onClick={() => {
            setLoadError(null);
            setLoading(true);
            fetchJobs();
          }}
          className="px-4 py-2 bg-[#f26722] hover:bg-[#e55611] text-white font-medium rounded-md"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            {division === "field_tech"
              ? "Field Tech Jobs"
              : `Jobs ${formatDivisionName(division)}`}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <JobNotifications />

          {/* T&M button for Field Tech divisions - only visible to authorized users */}
          {(division === "field_tech" ||
            division === "field-tech" ||
            division === "north_alabama" ||
            division === "tennessee" ||
            division === "georgia" ||
            division === "international") &&
            (user?.email === "william.sasser@ampqes.com" ||
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
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add T&M or Emergency Job
              </button>
            )}

          {(division?.toLowerCase() === "calibration" ||
            division?.toLowerCase() === "armadillo" ||
            division?.toLowerCase() === "scavenger") && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center p-2 border border-transparent rounded-md shadow-sm text-white bg-[#f26722] hover:bg-[#d94e00] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722]"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Totals and Date Range Section Toggle */}
      <div className="mt-6">
        <button
          onClick={() => setShowTotals(!showTotals)}
          className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
        >
          {showTotals ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {showTotals ? "Hide" : "Show"} Totals & Date Range
        </button>

        {showTotals && (
          <div className="mt-4 bg-white dark:bg-dark-150">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-neutral-700 dark:text-white">
                  Date Range:
                </label>
                <button
                  type="button"
                  onClick={() => setAllTime(!allTime)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    allTime
                      ? "bg-[#f26722] text-white"
                      : "bg-neutral-100 dark:bg-dark-100 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-200"
                  }`}
                >
                  All Time
                </button>
                {!allTime && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dateRangeStart}
                      onChange={(e) => setDateRangeStart(e.target.value)}
                      className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
                    />
                    <span className="text-neutral-500 dark:text-neutral-400">
                      to
                    </span>
                    <input
                      type="date"
                      value={dateRangeEnd}
                      onChange={(e) => setDateRangeEnd(e.target.value)}
                      className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm bg-white dark:bg-dark-100 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className="bg-neutral-50 dark:bg-dark-100 rounded-md p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                  All Jobs
                </div>
                <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
                  $
                  {statusTotals.all.total.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {statusTotals.all.count} jobs
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-md p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                  Pending
                </div>
                <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
                  $
                  {statusTotals.pending.total.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {statusTotals.pending.count} jobs
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                  In Progress
                </div>
                <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
                  $
                  {statusTotals.in_progress.total.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {statusTotals.in_progress.count} jobs
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-md p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                  Completed
                </div>
                <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
                  $
                  {statusTotals.completed.total.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {statusTotals.completed.count} jobs
                </div>
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-md p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                  Billed
                </div>
                <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
                  $
                  {statusTotals.billed.total.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {statusTotals.billed.count} jobs
                </div>
              </div>
            </div>

            {/* Remaining Balance Left to Bill */}
            <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-md p-3">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                  Remaining Balance Left to Bill
                </div>
                <div
                  className={`mt-1 text-2xl font-semibold ${
                    (statusTotals.contractValueLeftToBill || 0) > 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-neutral-900 dark:text-white"
                  }`}
                >
                  $
                  {(statusTotals.contractValueLeftToBill || 0).toLocaleString(
                    "en-US",
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status Tabs */}
      <div className="mt-6">
        <div
          className="inline-flex rounded-md shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden"
          role="tablist"
          aria-label="Job status filter"
        >
          {(
            [
              { key: "all", label: "All Jobs" },
              { key: "pending", label: "Pending" },
              { key: "in_progress", label: "In Progress" },
              { key: "completed", label: "Completed / Ready to Bill" },
              { key: "billed", label: "Billed" },
            ] as { key: StatusFilter; label: string }[]
          ).map((t) => {
            const active = statusFilter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={
                  `px-4 py-2 text-sm font-medium focus:outline-none transition-colors ${
                    active
                      ? "bg-[#f26722] text-white"
                      : "bg-white dark:bg-dark-150 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-dark-100"
                  }` +
                  (t.key !== "billed"
                    ? " border-r border-neutral-200 dark:border-neutral-700"
                    : "")
                }
                onClick={() => setStatusFilter(t.key)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Section */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <div className="relative shrink-0" ref={sortMenuRef}>
            <button
              type="button"
              onClick={() => setIsSortMenuOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 hover:text-[#f26722] focus:outline-none focus:ring-2 focus:ring-[#f26722] dark:text-white dark:hover:text-[#f26722]"
              aria-expanded={isSortMenuOpen}
              aria-label="Sort jobs"
              title="Sort"
            >
              <ArrowDownWideNarrow className="h-5 w-5" />
            </button>
            {isSortMenuOpen && (
              <div className="absolute left-0 z-20 mt-2 w-72 rounded-md border border-neutral-200 dark:border-dark-300 bg-white dark:bg-dark-150 p-3 shadow-lg">
                <div>
                  <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                    Sort by
                  </div>
                  {renderSortOptions(
                    SORT_FIELD_OPTIONS,
                    sortField,
                    setSortField,
                  )}
                </div>
                <div className="mt-2">
                  <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                    Order
                  </div>
                  {renderSortOptions(
                    SORT_DIRECTION_OPTIONS,
                    sortDirection,
                    setSortDirection,
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search jobs by title, customer, job number, quote number, PO number, status, or description..."
              className="w-full px-4 py-2 pl-10 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-[#f26722]"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <X className="h-5 w-5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300" />
              </button>
            )}
          </div>
        </div>
        {searchTerm && (
          <div className="mt-2 text-sm text-neutral-600 dark:text-white">
            Found {filteredJobs.length} job
            {filteredJobs.length !== 1 ? "s" : ""} matching "{searchTerm}"
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="-mx-4 overflow-x-auto shadow ring-1 ring-black ring-opacity-5 sm:-mx-6 md:mx-0 md:rounded-lg">
          <table className="min-w-[1180px] divide-y divide-neutral-300">
            <thead className="bg-neutral-50 dark:bg-dark-150">
              <tr>
                <th
                  scope="col"
                  className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 dark:text-neutral-200 sm:pl-6"
                >
                  Job #
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-neutral-200"
                >
                  Title
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-neutral-200"
                >
                  Customer
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-neutral-200"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-neutral-200"
                >
                  Remaining Balance
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-neutral-200"
                >
                  Quoted Amount
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-neutral-200"
                >
                  Division
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-neutral-200"
                >
                  Priority
                </th>
                <th
                  scope="col"
                  className="px-3 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-neutral-200"
                >
                  Source
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-600 bg-white dark:bg-dark-150">
              {filteredJobs.map((job) => {
                // Check if job is from T&M or from opportunity
                const isTM =
                  job.opportunity?.opportunity_type === "time_materials" ||
                  (job.notes && /T&M|time.*material/i.test(job.notes));
                const isFromOpportunity = !!job.opportunity_id;

                return (
                  <tr
                    key={job.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors duration-150 ease-in-out cursor-pointer"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-neutral-900 dark:text-neutral-200 sm:pl-6">
                      {job.job_number || "Pending"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-600 dark:text-white">
                      {maskJobTitle(job.title)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-600 dark:text-white">
                      {maskCustomerName(
                        job.customers?.company_name || job.customers?.name,
                      ) || "No customer"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-500 dark:text-white">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusColor(job.status)}`}
                      >
                        {formatStatusLabel(job.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-500 dark:text-white">
                      {job.contractValue !== undefined &&
                      job.contractValue !== 0 ? (
                        <span
                          className={
                            job.contractValue < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-green-600 dark:text-green-400"
                          }
                        >
                          {job.contractValue < 0 ? "-" : ""}$
                          {Math.abs(job.contractValue).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-500 dark:text-white">
                      ${job.budget?.toLocaleString() ?? "N/A"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-500 dark:text-white">
                      {formatDivisionName(job.division || null)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-500 dark:text-white">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          job.priority === "high"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400"
                            : job.priority === "medium"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400"
                              : "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400"
                        }`}
                      >
                        {formatStatusLabel(job.priority)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-500 dark:text-white">
                      {isTM ? (
                        <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400 font-semibold text-xs">
                          T&M
                        </span>
                      ) : isFromOpportunity ? (
                        <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400 text-xs">
                          From Opportunity
                        </span>
                      ) : (
                        <span className="text-neutral-400 dark:text-neutral-500 text-xs">
                          Direct Entry
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Job Creation Form Dialog */}
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className="fixed inset-0 z-50 overflow-y-auto"
      >
        <div className="flex items-center justify-center min-h-screen">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-xl w-full mx-auto p-6 shadow-xl">
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-500"
                onClick={() => setIsOpen(false)}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>

            <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white mb-4">
              Create New Job
            </Dialog.Title>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="customer_id"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Customer *
                  </label>
                  <div className="mt-1">
                    <select
                      id="customer_id"
                      name="customer_id"
                      required
                      value={formData.customer_id}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                    >
                      <option value="">Select a customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.company_name || customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="title"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Job Title *
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="title"
                      id="title"
                      required
                      value={formData.title}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Description
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="description"
                      name="description"
                      rows={3}
                      value={formData.description}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="status"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Status
                  </label>
                  <div className="mt-1">
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="billed">Billed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="priority"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Priority
                  </label>
                  <div className="mt-1">
                    <select
                      id="priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="start_date"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Start Date
                  </label>
                  <div className="mt-1">
                    <input
                      type="date"
                      name="start_date"
                      id="start_date"
                      value={formData.start_date}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="due_date"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Due Date
                  </label>
                  <div className="mt-1">
                    <input
                      type="date"
                      name="due_date"
                      id="due_date"
                      value={formData.due_date}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>

                {/* Quoted Amount field visibility: always hidden if division is calibration or armadillo */}
                {!(
                  division?.toLowerCase() === "calibration" ||
                  division?.toLowerCase() === "armadillo"
                ) && (
                  <div className="sm:col-span-1">
                    <label
                      htmlFor="budget"
                      className="block text-sm font-medium text-neutral-700 dark:text-white"
                    >
                      Quoted Amount
                    </label>
                    <div className="mt-1">
                      <input
                        type="number"
                        name="budget"
                        id="budget"
                        step="0.01"
                        value={formData.budget}
                        onChange={handleInputChange}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                      />
                    </div>
                  </div>
                )}

                {/* Optional notes field */}
                <div className="sm:col-span-2">
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Notes
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="notes"
                      name="notes"
                      rows={3}
                      value={formData.notes}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div>

                {/* Optional Job Number field - if it can be manually entered */}
                {/* <div className="sm:col-span-1">
                  <label htmlFor="job_number" className="block text-sm font-medium text-neutral-700 dark:text-white">
                    Job Number (Optional)
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="job_number"
                      id="job_number"
                      value={formData.job_number}
                      onChange={handleInputChange}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-neutral-300 dark:border-neutral-600 dark:bg-dark-150 dark:text-white rounded-md"
                    />
                  </div>
                </div> */}
              </div>

              <div className="mt-5 flex justify-end space-x-3">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-white bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Create Job
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
        <div className="flex items-center justify-center min-h-screen">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />

          <div className="relative bg-white dark:bg-dark-150 rounded-lg max-w-md w-full mx-auto p-6 shadow-xl">
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-500 dark:text-white dark:hover:text-neutral-200"
                onClick={() => setShowTMModal(false)}
              >
                <span className="sr-only">Close</span>
                <X className="h-6 w-6" />
              </button>
            </div>

            <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white mb-4">
              Add T&M Opportunity
            </Dialog.Title>

            <form onSubmit={handleTMSubmit} className="space-y-4">
              {showNewCustomer && (
                <div className="border rounded-md p-3 bg-orange-50/60 dark:bg-orange-900/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-neutral-800 dark:text-white">
                      New Customer
                    </div>
                    <button
                      type="button"
                      className="text-xs text-neutral-600 dark:text-neutral-400"
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
                    <div className="text-sm font-medium text-neutral-800 dark:text-white">
                      New Contact
                    </div>
                    <button
                      type="button"
                      className="text-xs text-neutral-600 dark:text-neutral-400"
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
                      onClick={handleCreateContact}
                      disabled={creatingContact}
                      className="px-3 py-1 text-sm rounded bg-[#f26722] text-white hover:bg-[#f26722]/90"
                    >
                      {creatingContact ? "Creating..." : "Create contact"}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Customer *
                </label>
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers (name or company)"
                  className="mt-1 mb-2 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                />
                {TMFormData.customer_id && (
                  <div className="text-xs text-neutral-600 dark:text-white mb-1">
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
                <div className="max-h-48 overflow-y-auto border border-neutral-300 dark:border-neutral-600 rounded-md">
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
                          }));
                          fetchContacts(customer.id);
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
                  {filteredCustomers.length === 0 && (
                    <div className="px-3 py-2 text-sm text-neutral-500 dark:text-white">
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
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Contact
                </label>
                <select
                  name="contact_id"
                  value={TMFormData.contact_id}
                  onChange={handleTMChange}
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
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
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={TMFormData.title}
                  onChange={handleTMChange}
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Division *
                </label>
                <select
                  name="division"
                  value={TMFormData.division}
                  onChange={handleTMChange}
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
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
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-white">
                  Description
                </label>
                <textarea
                  name="description"
                  value={TMFormData.description}
                  onChange={handleTMChange}
                  rows={3}
                  className="mt-1 block w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white"
                  placeholder="Optional description"
                />
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="mr-3 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-white bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm hover:bg-neutral-50 dark:hover:bg-dark-200 focus:outline-none"
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
    </div>
  );
}
