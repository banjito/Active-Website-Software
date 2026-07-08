import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../AuthContext";

interface CustomerData {
  id: string;
  name: string;
  company_name?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface JobDetails {
  id: string;
  title: string;
  job_number: string;
  description?: string;
  status: string;
  start_date?: string;
  due_date?: string;
  budget?: number;
  priority?: string;
  division?: string;
  tracking_plan?: Record<string, number>;
  site_address?: string | null;
  fireteam_lead?: string | null;
  progress_billing_status?: string | null;
  estimated_man_hours?: number | null;
  quickbooks_project_id?: string | null;
  quickbooks_project_name?: string | null;
  customer?: {
    id: string;
    name: string;
    company_name?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  formattedCustomerName?: string;
}

export function useJobDetails(jobId: string | undefined) {
  console.log("useJobDetails: Hook initializing", { jobId });

  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { user } = useAuth();
  const userId = user?.id;

  console.log("useJobDetails: Current state", {
    hasJobDetails: !!jobDetails,
    loading,
    hasError: !!error,
    jobId,
    hasUser: !!userId,
  });

  useEffect(() => {
    console.log("useJobDetails: useEffect triggered", {
      jobId,
      hasUser: !!userId,
    });

    if (!jobId || !userId) {
      console.log("useJobDetails: Missing jobId or user, skipping fetch");
      setJobDetails((prev) => (prev === null ? prev : null));
      setError((prev) => (prev === null ? prev : null));
      setLoading((prev) => (prev ? false : prev));
      return;
    }

    async function fetchJobDetails() {
      try {
        console.log(`useJobDetails: Fetching job details for jobId=${jobId}`, {
          hasUser: !!userId,
          userId,
        });
        setLoading(true);
        setError(null);

        // Verify user is authenticated
        if (!userId) {
          throw new Error("User not authenticated. Please log in.");
        }

        // Try neta_ops.jobs first (primary schema for most jobs)
        // Use .single() instead of .maybeSingle() to get better error messages
        let { data: jobData, error: netaJobError }: { data: any; error: any } =
          await supabase
            .schema("neta_ops")
            .from("jobs")
            .select(
              `
            id,
            title,
            job_number,
            description,
            status,
            start_date,
            due_date,
            budget,
            priority,
            customer_id,
            division,
            site_address,
            tracking_plan,
            fireteam_lead,
            estimated_man_hours,
            quickbooks_project_id,
            quickbooks_project_name,
            notes,
            opportunity_id,
            deleted_at
          `,
            )
            .eq("id", jobId)
            .maybeSingle();

        // Check if job is deleted
        if (jobData && jobData.deleted_at) {
          throw new Error(
            "This job has been deleted and is no longer accessible.",
          );
        }

        // If we got null data but no error, it might be an RLS issue
        // Try a diagnostic query to see if we can access the table at all
        if (!jobData && !netaJobError) {
          console.warn(
            "useJobDetails: Got null data with no error - possible RLS issue. Testing table access...",
          );
          const { data: testData, error: testError } = await supabase
            .schema("neta_ops")
            .from("jobs")
            .select("id")
            .limit(1);

          if (testError) {
            console.error(
              "useJobDetails: Cannot access neta_ops.jobs table:",
              testError,
            );
            netaJobError = testError;
          } else {
            console.log(
              "useJobDetails: Table is accessible, job just not found",
            );
          }
        }

        // Log detailed error information for debugging
        if (netaJobError) {
          console.error("useJobDetails: Error fetching from neta_ops.jobs:", {
            error: netaJobError,
            code: netaJobError.code,
            message: netaJobError.message,
            details: netaJobError.details,
            hint: netaJobError.hint,
            jobId,
          });
        }

        // If not found in neta_ops, try lab_ops.lab_jobs as fallback
        if (netaJobError || !jobData) {
          console.log(
            "Job not found in neta_ops.jobs, trying lab_ops.lab_jobs",
            {
              netaJobError: netaJobError?.message,
              hasJobData: !!jobData,
              errorCode: netaJobError?.code,
            },
          );
          const { data: labJobData, error: labJobError } = await supabase
            .schema("lab_ops")
            .from("lab_jobs")
            .select(
              `
              id,
              title,
              job_number,
              description,
              status,
              start_date,
              due_date,
              budget,
              priority,
              customer_id,
              division,
              deleted_at
            `,
            )
            .eq("id", jobId)
            .maybeSingle();

          // Check if lab job is deleted
          if (labJobData && labJobData.deleted_at) {
            throw new Error(
              "This job has been deleted and is no longer accessible.",
            );
          }

          if (labJobError) {
            console.error(
              `useJobDetails: Error fetching job data from lab_ops.lab_jobs:`,
              {
                error: labJobError,
                code: labJobError.code,
                message: labJobError.message,
              },
            );
            // If lab_ops table doesn't exist, that's okay - just use neta_ops error
            if (
              labJobError.code === "PGRST116" ||
              labJobError.message?.includes("404") ||
              labJobError.message?.includes("not found")
            ) {
              // Lab table doesn't exist, use the original neta_ops error
              if (netaJobError) {
                // Check for RLS/permission errors
                if (
                  netaJobError.code === "42501" ||
                  netaJobError.message?.includes("permission denied") ||
                  netaJobError.message?.includes("row-level security")
                ) {
                  throw new Error(
                    `Permission denied: Unable to access job ${jobId}. Please check your authentication and permissions.`,
                  );
                }
                if (
                  netaJobError.code === "PGRST116" ||
                  netaJobError.message?.includes("404")
                ) {
                  throw new Error(`Job ${jobId} not found in database`);
                }
                throw new Error(
                  `Error loading job: ${netaJobError.message || "Unknown error"}`,
                );
              }
              throw new Error(`Job ${jobId} not found in database`);
            }
            throw labJobError;
          }

          if (labJobData) {
            jobData = labJobData;
          } else if (!jobData) {
            // Neither schema has the job - but check if it was an RLS error
            if (netaJobError) {
              if (
                netaJobError.code === "42501" ||
                netaJobError.message?.includes("permission denied") ||
                netaJobError.message?.includes("row-level security")
              ) {
                throw new Error(
                  `Permission denied: Unable to access job ${jobId}. Please check your authentication and permissions.`,
                );
              }
            }
            throw new Error(`Job ${jobId} not found in database`);
          }
        }

        if (!jobData) {
          // Check if the original error was a permission issue
          if (netaJobError) {
            if (
              netaJobError.code === "42501" ||
              netaJobError.message?.includes("permission denied") ||
              netaJobError.message?.includes("row-level security")
            ) {
              throw new Error(
                `Permission denied: Unable to access job ${jobId}. Please check your authentication and permissions.`,
              );
            }
          }
          throw new Error("No job data found");
        }

        console.log(`useJobDetails: Job data fetched:`, jobData);

        if (!jobData.customer_id) {
          console.warn(`useJobDetails: No customer_id found for job ${jobId}`);
        }

        // Now fetch the customer data directly
        let customerData: CustomerData | null = null;
        if (jobData.customer_id) {
          const { data: customer, error: customerError } = await supabase
            .schema("common")
            .from("customers")
            .select(
              `
              id,
              name,
              company_name,
              address,
              phone,
              email
            `,
            )
            .eq("id", jobData.customer_id)
            .single();

          if (customerError) {
            console.error(
              `useJobDetails: Error fetching customer data: ${customerError.message}`,
            );
          } else {
            customerData = customer;
            console.log(`useJobDetails: Customer data fetched:`, customerData);
          }
        }

        // Create the formatted customer name with robust fallbacks
        let formattedCustomerName = "";
        if (customerData) {
          if (customerData.company_name) {
            formattedCustomerName = customerData.company_name;
          } else {
            formattedCustomerName = "No Company Name";
          }
        }

        if (!formattedCustomerName) {
          console.warn(
            `useJobDetails: Unable to create formatted customer name for job ${jobId}`,
          );
        }

        console.log(
          `useJobDetails: Formatted customer name: "${formattedCustomerName}"`,
        );

        const jobDetailsData: JobDetails = {
          id: jobData.id,
          title: jobData.title || "",
          job_number: jobData.job_number || `JOB-${jobData.id.substring(0, 6)}`, // Fallback if job_number not available
          description: jobData.description,
          status: jobData.status || "pending",
          start_date: jobData.start_date,
          due_date: jobData.due_date,
          budget: jobData.budget,
          priority: jobData.priority || "medium",
          division: jobData.division,
          tracking_plan: (jobData as any).tracking_plan || undefined,
          site_address: (jobData as any).site_address || null,
          fireteam_lead: (jobData as any).fireteam_lead || null,
          progress_billing_status:
            (jobData as any).progress_billing_status || null,
          estimated_man_hours: (jobData as any).estimated_man_hours ?? null,
          quickbooks_project_id: (jobData as any).quickbooks_project_id ?? null,
          quickbooks_project_name:
            (jobData as any).quickbooks_project_name ?? null,
          customer: customerData
            ? {
                id: customerData.id,
                name: customerData.name,
                company_name: customerData.company_name,
                address: customerData.address,
                phone: customerData.phone,
                email: customerData.email,
              }
            : undefined,
          formattedCustomerName,
        };

        console.log(`useJobDetails: Setting job details:`, jobDetailsData);
        setJobDetails(jobDetailsData);
      } catch (err) {
        console.error("Error fetching job details:", err);
        setError(
          err instanceof Error ? err : new Error("Failed to fetch job details"),
        );
      } finally {
        setLoading(false);
      }
    }

    fetchJobDetails();
  }, [jobId, userId, refreshTrigger]);

  /**
   * Get formatted customer and job information suitable for report forms
   * This provides consistent formatting with fallbacks for missing data
   */
  const getFormattedInfoForReports = () => {
    if (!jobDetails) return null;

    // Add debug log for customer info
    console.log("getFormattedInfoForReports - jobDetails:", {
      id: jobDetails.id,
      hasCustomer: !!jobDetails.customer,
      formattedName: jobDetails.formattedCustomerName,
      customerName: jobDetails.customer?.name,
      companyName: jobDetails.customer?.company_name,
      address: jobDetails.customer?.address,
      jobNumber: jobDetails.job_number,
    });

    // Build customer name with additional fallbacks
    let customerName = jobDetails.formattedCustomerName;
    if (!customerName && jobDetails.customer) {
      if (jobDetails.customer.company_name) {
        customerName = jobDetails.customer.company_name;
      } else {
        customerName = "No Company Name";
      }
    }

    // Default customer name instead of "Customer information not available"
    const defaultCustomerName =
      "Customer (Job #" +
      (jobDetails.job_number || jobDetails.id.substring(0, 8)) +
      ")";

    const preferredAddress =
      jobDetails.site_address ||
      jobDetails.customer?.address ||
      "No address provided";
    return {
      customer: customerName || defaultCustomerName,
      address: preferredAddress,
      jobNumber:
        jobDetails.job_number || `JOB-${jobDetails.id.substring(0, 6)}`,
      title: jobDetails.title || "Untitled Job",
    };
  };

  const refreshJobDetails = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return {
    jobDetails,
    loading,
    error,
    getFormattedInfoForReports,
    refreshJobDetails,
  };
}
