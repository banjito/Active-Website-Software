import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useDemoMode } from "@/lib/DemoModeContext";
import Card from "@/components/ui/Card";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BriefcaseIcon, Plus, X } from "lucide-react";
import { Dialog } from "@headlessui/react";
import { addDefaultFilesToJob } from "@/lib/services/defaultJobFiles";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { withPgTimeoutRetry } from "@/lib/retryPgTimeout";

interface Customer {
  id?: string;
  name?: string;
  company_name?: string;
}

interface JobItem {
  id: string;
  job_number?: string;
  title: string;
  status: string;
  start_date?: string;
  due_date?: string;
  budget?: string;
  customer_id?: string;
  customers?: Customer;
  division?: string;
}

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

const FIELD_TECH_DIVISIONS = [
  "north_alabama",
  "tennessee",
  "nashville",
  "georgia",
  "international",
];

export default function FieldTechJobsPage() {
  const { user } = useAuth();
  const { maskCustomerName, maskJobTitle } = useDemoMode();
  const location = useLocation();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showTMModal, setShowTMModal] = useState(false);
  const [TMFormData, setTMFormData] = useState<TMFormData>({
    customer_id: "",
    contact_id: "",
    title: "",
    description: "",
    division: "",
  });
  const [isCreatingTM, setIsCreatingTM] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContact, setNewContact] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });
  const [creatingContact, setCreatingContact] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    company_name: "",
    name: "",
    email: "",
    phone: "",
    address: "",
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      console.log("fetchJobs called - starting query");
      setLoading(true);
      let { data: jobData, error: jobError } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("*")
        .is("deleted_at", null)
        .in("division", FIELD_TECH_DIVISIONS)
        .order("created_at", { ascending: false });

      console.log("fetchJobs - query result:", {
        count: jobData?.length,
        error: jobError,
      });
      if (jobError) throw jobError;

      // Fallback: if no jobs returned (division label mismatch), fetch without division filter
      if (!jobData || jobData.length === 0) {
        const fallback = await supabase
          .schema("neta_ops")
          .from("jobs")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (!fallback.error && fallback.data) {
          jobData = fallback.data;
        }
      }

      if (!jobData) {
        setJobs([]);
        return;
      }

      const jobsWithCustomers = await Promise.all(
        jobData.map(async (job: any) => {
          if (!job.customer_id) {
            return { ...job, customers: null } as JobItem;
          }
          try {
            const { data: customerData, error: customerError } = await supabase
              .schema("common")
              .from("customers")
              .select("id, name, company_name")
              .eq("id", job.customer_id)
              .single();
            if (customerError) {
              return { ...job, customers: null } as JobItem;
            }
            return { ...job, customers: customerData } as JobItem;
          } catch {
            return { ...job, customers: null } as JobItem;
          }
        }),
      );

      console.log("fetchJobs - setting jobs state:", jobsWithCustomers.length);
      setJobs(jobsWithCustomers);
    } catch (err) {
      console.error("Error fetching jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

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
      setTMFormData((prev) => ({ ...prev, contact_id: "" }));
    } catch (error) {
      console.error("Error fetching contacts:", error);
    }
  }

  async function handleCreateCustomer() {
    if (!user?.id) return;
    if (!newCustomer.company_name && !newCustomer.name) {
      alert("Please enter a Company name or Customer name");
      return;
    }
    setCreatingCustomer(true);
    try {
      const payload = {
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
      setTMFormData((prev) => ({
        ...prev,
        customer_id: data.id,
        contact_id: "",
      }));
      await fetchContacts(data.id);
      setShowNewCustomer(false);
      setNewCustomer({
        company_name: "",
        name: "",
        email: "",
        phone: "",
        address: "",
      });
    } catch (err: unknown) {
      console.error("Error creating customer:", err);
      alert(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function handleCreateContact() {
    if (!user?.id) return;
    if (!TMFormData.customer_id) {
      alert("Please select a customer first");
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
        customer_id: TMFormData.customer_id,
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
      await fetchContacts(TMFormData.customer_id);
      setShowNewContact(false);
      setNewContact({ first_name: "", last_name: "", email: "", phone: "" });
      if (inserted?.id)
        setTMFormData((prev) => ({ ...prev, contact_id: inserted.id }));
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
        amp_division: TMFormData.division,
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
        division: TMFormData.division,
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
        await addDefaultFilesToJob(newJob.id, user.id, TMFormData.division);
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

  useEffect(() => {
    console.log("FieldTechJobsPage useEffect triggered", {
      pathname: location.pathname,
      user: user?.id,
      timestamp: new Date().toISOString(),
    });
    if (!user) return;
    fetchJobs();
    fetchCustomers();
  }, [user, fetchJobs, location.pathname]);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
      <div className="mb-6 sm:mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 dark:text-dark-900">
            All Field Tech Jobs
          </h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-neutral-600 dark:text-dark-400">
            Aggregated from Alabama, Tennessee, Georgia, and International
          </p>
        </div>
        {/* Only show T&M button to authorized users */}
        {(user?.email === "william.sasser@ampqes.com" ||
          user?.email === "john.chambers@ampqes.com" ||
          user?.email === "anthony.masters@ampqes.com" ||
          user?.email === "caleb.hipp@ampqes.com" ||
          user?.email === "zach.freeborn@ampqes.com" ||
          user?.email === "zecahriah.freeborn@ampqes.com" ||
          user?.email === "michael.bland@ampqes.com" ||
          user?.email === "kelly.lawton@ampqes.com") && (
          <button
            type="button"
            onClick={() => {
              setShowTMModal(true);
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

      {loading ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner size="md" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-neutral-500">No jobs found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {jobs.map((job) => (
            <Link to={`/jobs/${job.id}`} key={job.id}>
              <Card className="p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#f26722] truncate">
                      {maskJobTitle(job.title)}
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-white mt-1 truncate">
                      {maskCustomerName(
                        job.customers?.company_name || job.customers?.name,
                      ) || "No customer"}
                    </p>
                    <div className="mt-2 text-xs text-neutral-500 dark:text-white">
                      Division: {job.division}
                    </div>
                  </div>
                  <div className="ml-3 flex items-center text-xs text-neutral-500 dark:text-white">
                    <BriefcaseIcon className="h-4 w-4 mr-1" />
                    {job.job_number || "N/A"}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

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
                onClick={() => {
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
                            contact_id: "",
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
                  onClick={() => {
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
