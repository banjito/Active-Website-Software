import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Filter,
  ArrowDownWideNarrow,
  Check,
  Users,
  Phone,
  Mail,
  Blend,
} from "lucide-react";
import { Dialog } from "@headlessui/react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useDemoMode } from "../../lib/DemoModeContext";
import { Pagination } from "../ui/Pagination";
import { supabase } from "../../lib/supabase";
import {
  Customer,
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  mergeCustomers,
  DIVISION_OPTIONS,
} from "../../services/customerService";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface ContactInfo {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
}

interface CustomerFormData {
  company_name: string;
  email: string;
  phone: string;
  address: string;
  divisions: string[];
}

const initialFormData: CustomerFormData = {
  company_name: "",
  email: "",
  phone: "",
  address: "",
  divisions: [],
};

// Function to get initial filter settings from localStorage synchronously
function getInitialFilterSettings() {
  try {
    const savedPage = localStorage.getItem("customerListPage");
    const savedSearch = localStorage.getItem("customerListSearch");
    const savedFilters = localStorage.getItem("customerListFilters");
    const savedSortOrder = localStorage.getItem("customerListSortOrder");
    const savedDivisionTabs = localStorage.getItem("customerListDivisionTabs");

    return {
      page: savedPage ? parseInt(savedPage, 10) : 1,
      searchTerm: savedSearch || "",
      activeFilters: savedFilters ? JSON.parse(savedFilters) : {},
      sortOrder: (savedSortOrder as "asc" | "desc" | null) || null,
      activeDivisionTabs: savedDivisionTabs
        ? JSON.parse(savedDivisionTabs)
        : ([] as string[]),
    };
  } catch (error) {
    console.error(
      "Error loading customer list settings from localStorage:",
      error,
    );
    return {
      page: 1,
      searchTerm: "",
      activeFilters: {},
      sortOrder: null as "asc" | "desc" | null,
      activeDivisionTabs: [] as string[],
    };
  }
}

export default function CustomerList() {
  const { user, loading: authLoading } = useAuth();
  const { maskCustomerName } = useDemoMode();
  const navigate = useNavigate();
  const location = useLocation();

  // Load initial settings synchronously before first render
  const initialSettings = getInitialFilterSettings();

  // Default to "All" divisions regardless of the current portal; only honor a
  // selection the user previously made (persisted in localStorage).
  const getInitialDivisionTabs = (): string[] => {
    if (initialSettings.activeDivisionTabs.length > 0) {
      return initialSettings.activeDivisionTabs;
    }
    return [];
  };

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState<number>(initialSettings.page);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>(
    initialSettings.searchTerm,
  );
  const [debouncedSearch, setDebouncedSearch] = useState<string>(
    initialSettings.searchTerm,
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<{
    status?: string | null;
  }>(initialSettings.activeFilters);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>(
    initialSettings.sortOrder,
  );
  const [startsWithFilter, setStartsWithFilter] = useState<string>("");
  const [activeDivisionTabs, setActiveDivisionTabs] = useState<string[]>(
    getInitialDivisionTabs,
  );
  const [contactsPopupOpen, setContactsPopupOpen] = useState(false);
  const [contactsPopupCustomer, setContactsPopupCustomer] =
    useState<Customer | null>(null);
  const [contactsPopupData, setContactsPopupData] = useState<ContactInfo[]>([]);
  const [contactsPopupLoading, setContactsPopupLoading] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(
    new Set(),
  );
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);
  const [mergeName, setMergeName] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  const pageSize = 50;
  const totalPages = Math.ceil(totalCount / pageSize);
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  useEffect(() => {
    if (user) {
      fetchData();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [
    user,
    authLoading,
    activeFilters,
    page,
    debouncedSearch,
    sortOrder,
    startsWithFilter,
    activeDivisionTabs,
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchTerm !== debouncedSearch) {
        setDebouncedSearch(searchTerm.trim());
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, debouncedSearch]);

  // Save page to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("customerListPage", page.toString());
  }, [page]);

  // Save search term to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("customerListSearch", searchTerm);
  }, [searchTerm]);

  // Save active filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("customerListFilters", JSON.stringify(activeFilters));
  }, [activeFilters]);

  // Save sort order to localStorage whenever it changes
  useEffect(() => {
    if (sortOrder) {
      localStorage.setItem("customerListSortOrder", sortOrder);
    } else {
      localStorage.removeItem("customerListSortOrder");
    }
  }, [sortOrder]);

  // Save division tabs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(
      "customerListDivisionTabs",
      JSON.stringify(activeDivisionTabs),
    );
  }, [activeDivisionTabs]);

  useEffect(() => {
    if (!isFilterMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(event.target as Node)
      ) {
        setIsFilterMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFilterMenuOpen]);

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

  function renderSingleChoiceOptions<T extends string>(
    options: Array<{ value: T; label: string }>,
    selectedValue: T | null | undefined,
    setValue: (nextValue: T | null) => void,
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
                setValue(checked ? null : option.value);
                setPage(1);
              }}
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

  function toggleDivisionTab(divisionValue: string) {
    setActiveDivisionTabs((prev) => {
      const next = prev.includes(divisionValue)
        ? prev.filter((d) => d !== divisionValue)
        : [...prev, divisionValue];
      return next;
    });
    setPage(1);
  }

  function clearDivisionTabs() {
    setActiveDivisionTabs([]);
    setPage(1);
  }

  async function fetchData() {
    setLoadError(null);
    // Reset merge selection when the visible list changes, so a merge only ever
    // acts on customers currently shown.
    setSelectedForMerge(new Set());
    if (debouncedSearch || startsWithFilter) {
      setSearchLoading(true);
    } else {
      setLoading(true);
    }

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.error("CustomerList: fetchData timed out after 30 seconds");
      setLoadError("This is taking longer than expected. Please try again.");
      setLoading(false);
      setSearchLoading(false);
    }, 30000);

    try {
      const filters = {
        ...activeFilters,
        startsWith: startsWithFilter || null,
        divisions: activeDivisionTabs.length > 0 ? activeDivisionTabs : null,
      };
      const effectiveSortOrder =
        activeDivisionTabs.length > 0 && !sortOrder ? "asc" : sortOrder;
      let customersData;
      let count;
      try {
        const result = await getCustomers(filters, {
          page,
          pageSize,
          search: debouncedSearch,
          sortBy: effectiveSortOrder || sortOrder ? "company_name" : undefined,
          sortOrder: effectiveSortOrder || sortOrder || undefined,
        });
        customersData = result.data;
        count = result.totalCount;
      } catch {
        // Fallback: query without divisions filter if column doesn't exist
        const { divisions: _d, ...filtersWithoutDiv } = filters;
        const result = await getCustomers(filtersWithoutDiv, {
          page,
          pageSize,
          search: debouncedSearch,
          sortBy: sortOrder ? "company_name" : undefined,
          sortOrder: sortOrder || undefined,
        });
        customersData = result.data;
        count = result.totalCount;
      }
      setTotalCount(count);

      // Get categories
      setCustomers(customersData);
    } catch (error) {
      console.error("CustomerList: Error fetching data:", error);
      setLoadError("Failed to load customers. Please try again.");
    } finally {
      clearTimeout(timeoutId);
      // Always clear loading state - BOTH states to handle all scenarios
      setLoading(false);
      setSearchLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!user) return;

      setFormLoading(true);

      const { divisions, ...baseData } = formData;
      const dataWithDivisions = { ...baseData, name: baseData.company_name, divisions: divisions.length > 0 ? divisions : null };
      const dataWithoutDivisions = { ...baseData, name: baseData.company_name };

      if (isEditing && customerToEdit) {
        try {
          await updateCustomer(customerToEdit, dataWithDivisions);
        } catch {
          await updateCustomer(customerToEdit, dataWithoutDivisions);
        }
      } else {
        try {
          await createCustomer({
            ...dataWithDivisions,
            status: "active",
            user_id: user.id,
          });
        } catch {
          await createCustomer({
            ...dataWithoutDivisions,
            status: "active",
            user_id: user.id,
          });
        }
      }

      setIsOpen(false);
      setFormData(initialFormData);
      setIsEditing(false);
      setCustomerToEdit(null);
      fetchData();
    } catch (error) {
      console.error("Error saving customer:", error);
      alert("Failed to save customer. Please try again.");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(customerId: string) {
    try {
      await deleteCustomer(customerId);
      setDeleteConfirmOpen(false);
      setCustomerToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting customer:", error);
    }
  }

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function confirmDelete(customerId: string) {
    setCustomerToDelete(customerId);
    setDeleteConfirmOpen(true);
  }

  function toggleMergeSelection(customerId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedForMerge((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  function openMergeModal() {
    const ids = Array.from(selectedForMerge);
    if (ids.length < 2) return;
    setMergePrimaryId(ids[0]);
    const first = customers.find((c) => c.id === ids[0]);
    setMergeName(first?.company_name || "");
    setMergeModalOpen(true);
  }

  function selectMergePrimary(customerId: string) {
    setMergePrimaryId(customerId);
    const c = customers.find((x) => x.id === customerId);
    setMergeName(c?.company_name || "");
  }

  async function handleConfirmMerge() {
    if (!mergePrimaryId || isMerging) return;
    const duplicateIds = Array.from(selectedForMerge).filter(
      (id) => id !== mergePrimaryId,
    );
    if (duplicateIds.length === 0) return;
    try {
      setIsMerging(true);
      await mergeCustomers(mergePrimaryId, duplicateIds, mergeName);
      setMergeModalOpen(false);
      setSelectedForMerge(new Set());
      setMergePrimaryId(null);
      await fetchData();
    } catch (err: any) {
      console.error("Error merging customers:", err);
      alert(
        `Failed to merge customers: ${err?.details || err?.message || "Unknown error"}`,
      );
    } finally {
      setIsMerging(false);
    }
  }

  // Customers currently selected, resolved to the loaded customer objects.
  const selectedCustomers = customers.filter((c) => selectedForMerge.has(c.id));

  function handleEdit(customer: Customer, e: React.MouseEvent) {
    e.stopPropagation();
    setIsEditing(true);
    setCustomerToEdit(customer.id);
    setFormData({
      company_name: customer.company_name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      divisions: customer.divisions || [],
    });
    setIsOpen(true);
  }

  const handleRowClick = (customerId: string) => {
    const currentPath = location.pathname;
    let targetPath = "";

    if (currentPath.startsWith("/sales-dashboard")) {
      targetPath = `/sales-dashboard/customers/${customerId}`;
    } else {
      // Check if we are in a division context (e.g., /north_alabama/customers)
      const pathParts = currentPath.split("/").filter((part) => part !== ""); // filter empty strings
      if (pathParts.length >= 2 && pathParts[1] === "customers") {
        const division = pathParts[0];
        targetPath = `/${division}/customers/${customerId}`;
      } else {
        // Fallback or default behavior if context is unclear (shouldn't happen with current routes)
        console.warn(
          `[CustomerList] Unclear navigation context from path: ${currentPath}. Falling back to generic path.`,
        );
        targetPath = `/customers/${customerId}`; // This path might not exist anymore, leading to redirect
      }
    }

    console.log(
      `[CustomerList] handleRowClick: Current Path = ${currentPath}, Target Path = ${targetPath}`,
    );
    navigate(targetPath);
  };

  function handleFilterChange(
    type: "status",
    value: string | null,
  ) {
    setActiveFilters((prev) => ({
      ...prev,
      [type]: value,
    }));
  }

  function clearFilters() {
    setActiveFilters({});
    setPage(1);
    setFilterOpen(false);
  }

  function toggleSortOrder() {
    setSortOrder((prev) => {
      if (prev === null) return "asc";
      if (prev === "asc") return "desc";
      return null;
    });
    setPage(1);
  }

  async function openContactsPopup(customer: Customer, e: React.MouseEvent) {
    e.stopPropagation();
    setContactsPopupCustomer(customer);
    setContactsPopupOpen(true);
    setContactsPopupLoading(true);
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("contacts")
        .select("id, first_name, last_name, email, phone, position, is_primary")
        .eq("customer_id", customer.id)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      setContactsPopupData(data || []);
    } catch (err) {
      console.error("Error fetching contacts for popup:", err);
      setContactsPopupData([]);
    } finally {
      setContactsPopupLoading(false);
    }
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
            fetchData();
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

  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "lead", label: "Lead" },
    { value: "prospect", label: "Prospect" },
    { value: "customer", label: "Customer" },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Customers
          </h2>
        </div>
        <div className="flex space-x-2 flex-wrap gap-y-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search customers by name, company, email"
            className="w-72 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
          />
          <div className="relative">
            <input
              type="text"
              value={startsWithFilter}
              onChange={(e) => {
                setStartsWithFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Starts with..."
              className="w-32 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
            />
            {startsWithFilter && (
              <button
                type="button"
                onClick={() => {
                  setStartsWithFilter("");
                  setPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchLoading && (
            <div className="flex items-center">
              <LoadingSpinner size="xs" />
            </div>
          )}
          <div className="relative" ref={sortMenuRef}>
            <button
              type="button"
              onClick={() => setIsSortMenuOpen((prev) => !prev)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                sortOrder
                  ? "text-[#f26722]"
                  : "text-neutral-700 hover:text-[#f26722] dark:text-white dark:hover:text-[#f26722]"
              }`}
              aria-expanded={isSortMenuOpen}
              aria-label="Sort customers"
              title="Sort"
            >
              <ArrowDownWideNarrow className="h-5 w-5" />
            </button>
            {isSortMenuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-md border border-neutral-200 dark:border-dark-300 bg-white dark:bg-dark-150 p-3 shadow-lg">
                <div>
                  <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                    Sort by
                  </div>
                  <div className="rounded-md bg-orange-50 px-2.5 py-1.5 text-sm text-[#f26722] dark:bg-orange-900/20">
                    Company Name
                  </div>
                </div>
                <div className="mt-2">
                  <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                    Order
                  </div>
                  {renderSingleChoiceOptions(
                    [
                      { value: "asc", label: "Ascending" },
                      { value: "desc", label: "Descending" },
                    ],
                    sortOrder,
                    setSortOrder,
                  )}
                </div>
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
                  : "text-neutral-700 hover:text-[#f26722] dark:text-white dark:hover:text-[#f26722]"
              }`}
              aria-expanded={isFilterMenuOpen}
              aria-label="Filter customers"
              title="Filter"
            >
              <Filter className="h-5 w-5" />
            </button>
            {isFilterMenuOpen && (
              <div className="absolute right-0 z-20 mt-2 max-h-[70vh] w-72 overflow-y-scroll rounded-md border border-neutral-200 dark:border-dark-300 bg-white dark:bg-dark-150 p-3 shadow-lg [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:#f26722_#f3f4f6] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-neutral-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#f26722] [&::-webkit-scrollbar-thumb]:hover:bg-[#e55611] dark:[scrollbar-color:#f26722_#262626] dark:[&::-webkit-scrollbar-track]:bg-dark-200">
                <div className="">
                  <div className="mb-1 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-400">
                    Status
                  </div>
                  {renderSingleChoiceOptions(
                    statusOptions,
                    activeFilters.status,
                    (nextValue) => handleFilterChange("status", nextValue),
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 w-full rounded-md border border-neutral-300 dark:border-dark-300 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-white hover:bg-neutral-50 dark:hover:bg-dark-100 focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setCustomerToEdit(null);
              setFormData(initialFormData);
              setIsOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add customer
          </button>
        </div>
      </div>

      {/* Division Tabs */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={clearDivisionTabs}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeDivisionTabs.length === 0
              ? "bg-[#f26722] text-white"
              : "bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-100"
          }`}
        >
          All
        </button>
        {DIVISION_OPTIONS.map((div) => (
          <button
            key={div.value}
            type="button"
            onClick={() => toggleDivisionTab(div.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeDivisionTabs.includes(div.value)
                ? "bg-[#f26722] text-white"
                : "bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-100"
            }`}
          >
            {div.label}
          </button>
        ))}
        {activeDivisionTabs.length > 0 && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
            Sorted A-Z by default
          </span>
        )}

        {/* Merge action — only appears once 2+ customers are selected, in this
            always-present row so it never shifts the list down */}
        {selectedForMerge.size >= 2 && (
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-neutral-200 dark:border-dark-300">
            <button
              type="button"
              onClick={openMergeModal}
              title="Merge selected customers"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors bg-[#f26722] text-white hover:bg-[#f26722]/90"
            >
              <Blend className="h-4 w-4" />
              Merge customers ({selectedForMerge.size})
            </button>
            <button
              type="button"
              onClick={() => setSelectedForMerge(new Set())}
              className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-300"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Active Filters */}
      {Object.keys(activeFilters).length > 0 && (
        <div className="mb-4 bg-neutral-50 dark:bg-dark-150 p-3 rounded-md">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-neutral-500 dark:text-white">
              Active filters:
            </span>

            {activeFilters.status && (
              <div className="flex items-center bg-white dark:bg-neutral-800 rounded-full px-3 py-1 text-sm">
                <span className="mr-1">Status: {activeFilters.status}</span>
                <button
                  onClick={() => handleFilterChange("status", null)}
                  className="text-neutral-400 hover:text-neutral-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <button
              onClick={clearFilters}
              className="text-sm text-[#f26722] hover:text-[#f26722]/80"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-dark-150 shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {customers.length === 0 ? (
            <li className="px-6 py-4">
              <div className="text-center py-8">
                <div className="mx-auto h-12 w-12 text-neutral-400 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-dark-150 mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
                  No customers found
                </h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-white">
                  You don't have any customers yet. Get started by adding your
                  first customer.
                </p>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setCustomerToEdit(null);
                      setFormData(initialFormData);
                      setIsOpen(true);
                    }}
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 sm:w-auto"
                  >
                    Add your first customer
                  </button>
                </div>
              </div>
            </li>
          ) : (
            customers.map((customer) => (
              <li
                key={customer.id}
                onClick={() => handleRowClick(customer.id)}
                className="px-6 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-700 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedForMerge.has(customer.id)}
                      onClick={(e) => toggleMergeSelection(customer.id, e)}
                      onChange={() => {}}
                      title="Select to merge"
                      className="mr-4 h-4 w-4 shrink-0 accent-[#f26722] cursor-pointer"
                    />
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center">
                        <span className="text-neutral-500 dark:text-white text-lg font-medium">
                          {maskCustomerName(customer.company_name)?.charAt(0) ||
                            "C"}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-neutral-900 dark:text-white">
                        {maskCustomerName(customer.company_name)}
                      </div>
                      {customer.divisions && customer.divisions.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {customer.divisions.map((d) => {
                            const divOption = DIVISION_OPTIONS.find(
                              (o) => o.value === d,
                            );
                            return divOption ? (
                              <span
                                key={d}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#f26722]/10 text-[#f26722]"
                              >
                                {divOption.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                      <div className="text-sm text-neutral-500 dark:text-white">
                        {customer.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        customer.status === "active"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : customer.status === "inactive"
                            ? "bg-neutral-100 text-neutral-800 dark:bg-dark-150 dark:text-neutral-200"
                            : customer.status === "lead"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : customer.status === "prospect"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                      }`}
                    >
                      {customer.status}
                    </span>
                    <div className="flex space-x-1">
                      <button
                        type="button"
                        onClick={(e) => openContactsPopup(customer, e)}
                        className="text-neutral-400 hover:text-[#f26722] dark:hover:text-[#f26722]"
                        title="View contacts"
                      >
                        <Users className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleEdit(customer, e)}
                        className="text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300"
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(customer.id);
                        }}
                        className="text-neutral-400 hover:text-red-500 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Pagination Controls */}
      {totalPages > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-neutral-600 dark:text-white">
            Showing {(page - 1) * pageSize + 1} -{" "}
            {Math.min(page * pageSize, totalCount)} of {totalCount} customers
          </div>
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(newPage) => setPage(newPage)}
            />
          )}
        </div>
      )}

      {/* Filter Dialog */}
      <Dialog
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-md rounded bg-white dark:bg-neutral-900 p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
                Filter Customers
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="status_filter"
                  className="block text-sm font-medium text-neutral-700 dark:text-white"
                >
                  Status
                </label>
                <select
                  id="status_filter"
                  value={activeFilters.status || ""}
                  onChange={(e) =>
                    handleFilterChange("status", e.target.value || null)
                  }
                  className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] sm:text-sm dark:bg-dark-150 dark:border-neutral-600 dark:text-white"
                >
                  <option value="">All Statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 sm:mt-6 flex space-x-2 justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex justify-center rounded-md border border-neutral-300 bg-white dark:bg-dark-150 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="inline-flex justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
              >
                Apply Filters
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Add/Edit Customer Dialog */}
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-md rounded bg-white dark:bg-neutral-900 p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white">
                {isEditing ? "Edit Customer" : "Add New Customer"}
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="company_name"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Company Name
                  </label>
                  <input
                    type="text"
                    name="company_name"
                    id="company_name"
                    value={formData.company_name}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] sm:text-sm dark:bg-dark-150 dark:border-neutral-600 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] sm:text-sm dark:bg-dark-150 dark:border-neutral-600 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Phone Number
                  </label>
                  <input
                    type="text"
                    name="phone"
                    id="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] sm:text-sm dark:bg-dark-150 dark:border-neutral-600 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="address"
                    className="block text-sm font-medium text-neutral-700 dark:text-white"
                  >
                    Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    id="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] sm:text-sm dark:bg-dark-150 dark:border-neutral-600 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-white mb-2">
                    Divisions
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DIVISION_OPTIONS.map((div) => (
                      <button
                        key={div.value}
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            divisions: prev.divisions.includes(div.value)
                              ? prev.divisions.filter((d) => d !== div.value)
                              : [...prev.divisions, div.value],
                          }));
                        }}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          formData.divisions.includes(div.value)
                            ? "bg-[#f26722] text-white"
                            : "bg-neutral-100 dark:bg-dark-200 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-dark-100 border border-neutral-300 dark:border-neutral-600"
                        }`}
                      >
                        {div.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 sm:mt-6 flex space-x-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex justify-center rounded-md border border-neutral-300 bg-white dark:bg-dark-150 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
                  disabled={formLoading}
                >
                  {formLoading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
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
                      {isEditing ? "Updating..." : "Creating..."}
                    </>
                  ) : isEditing ? (
                    "Update"
                  ) : (
                    "Create"
                  )}
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-sm rounded bg-white dark:bg-dark-150 p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white mb-4">
              Confirm Delete
            </Dialog.Title>
            <p className="text-sm text-neutral-500 dark:text-white">
              Are you sure you want to delete this customer? This action cannot
              be undone.
            </p>
            <div className="mt-5 sm:mt-6 flex space-x-2 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="inline-flex justify-center rounded-md border border-neutral-300 bg-white dark:bg-dark-150 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  customerToDelete && handleDelete(customerToDelete)
                }
                className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Merge Customers Dialog */}
      <Dialog
        open={mergeModalOpen}
        onClose={() => !isMerging && setMergeModalOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-lg rounded bg-white dark:bg-dark-150 p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white mb-1">
              Merge {selectedForMerge.size} customers
            </Dialog.Title>
            <p className="text-sm text-neutral-500 dark:text-neutral-300">
              Choose the customer to keep. The others' contacts, jobs,
              opportunities, interactions, and documents move onto it, then the
              duplicates are deleted. This cannot be undone.
            </p>

            <div className="mt-4">
              <label
                htmlFor="merge-name"
                className="block text-sm font-medium text-neutral-700 dark:text-white"
              >
                Merged company name
              </label>
              <input
                id="merge-name"
                value={mergeName}
                onChange={(e) => setMergeName(e.target.value)}
                placeholder="Company name to keep"
                className="mt-1 block w-full rounded-md border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm text-neutral-900 dark:bg-dark-150 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Defaults to the kept customer's name. Edit it to use any name.
              </p>
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {selectedCustomers.map((c) => (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                    mergePrimaryId === c.id
                      ? "border-[#f26722] bg-[#f26722]/5"
                      : "border-neutral-200 dark:border-neutral-600 hover:border-[#f26722]/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="merge-primary"
                    checked={mergePrimaryId === c.id}
                    onChange={() => selectMergePrimary(c.id)}
                    className="mt-0.5 h-4 w-4 accent-[#f26722]"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                      {maskCustomerName(c.company_name) || "No Company Name"}
                      {mergePrimaryId === c.id && (
                        <span className="ml-2 rounded-full bg-[#f26722] px-2 py-0.5 text-xs font-medium text-white">
                          Keep
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {[c.email, c.phone, c.address]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMergeModalOpen(false)}
                disabled={isMerging}
                className="inline-flex justify-center rounded-md border border-neutral-300 bg-white dark:bg-dark-150 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMerge}
                disabled={isMerging || !mergePrimaryId}
                className="inline-flex items-center gap-1.5 justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 disabled:opacity-50"
              >
                <Blend className="h-4 w-4" />
                {isMerging ? "Merging..." : "Merge"}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Contacts Popup Dialog */}
      <Dialog
        open={contactsPopupOpen}
        onClose={() => setContactsPopupOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-md rounded-lg bg-white dark:bg-neutral-900 p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <Dialog.Title className="text-lg font-medium text-neutral-900 dark:text-white flex items-center">
                <Users className="h-5 w-5 text-[#f26722] mr-2" />
                Contacts{" "}
                {contactsPopupCustomer
                  ? `- ${maskCustomerName(contactsPopupCustomer.company_name)}`
                  : ""}
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setContactsPopupOpen(false)}
                className="text-neutral-400 hover:text-neutral-500 dark:hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {contactsPopupLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="sm" />
                <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-300">
                  <LoadingSpinner size="md" />
                </span>
              </div>
            ) : contactsPopupData.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No contacts found for this customer.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {contactsPopupData.map((contact) => (
                  <div
                    key={contact.id}
                    className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <div className="h-9 w-9 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center mr-3">
                          <span className="text-neutral-500 dark:text-white text-sm font-medium">
                            {contact.first_name?.charAt(0)}
                            {contact.last_name?.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-white">
                            {contact.first_name} {contact.last_name}
                          </p>
                          {contact.position && (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                              {contact.position}
                            </p>
                          )}
                        </div>
                      </div>
                      {contact.is_primary && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="ml-12 space-y-1">
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="flex items-center text-sm text-[#f26722] hover:text-[#f26722]/80 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
                          {contact.phone}
                        </a>
                      )}
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="flex items-center text-sm text-[#f26722] hover:text-[#f26722]/80 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Mail className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
                          {contact.email}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setContactsPopupOpen(false)}
                className="inline-flex justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
              >
                Close
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
