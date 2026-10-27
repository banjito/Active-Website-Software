import React, { useEffect, useLayoutEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useDivision } from "@/App";
import { supabase } from "@/lib/supabase";
import { companyConfig } from "@/lib/companyConfig";
import { engineeringJobPath, setEngineeringCompany } from "@/lib/engineering/engineeringCompany";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import Constellation from "./Constellation";
import { blueprintStyle, ce } from "./engineeringTheme";
import { COMPANY_PARAM, formatDue, statusOf, STEPS } from "./EngineeringJobsTab";

const CE_JOBS_PATH = `/engineering/jobs?${COMPANY_PARAM}=ce`;

interface CeJob {
  id: string;
  job_number: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  location: string | null;
  site_address: string | null;
  customerName: string;
  pmName: string | null;
}

/** A DB date or timestamp as "Oct 27"; "—" when empty. */
const showDate = (date: string | null) => (date ? formatDue(date.slice(0, 10)) : "—");

/**
 * A C&E job's page, in the engineering portal's look. No NETA reports; the
 * report tools come next. AMP engineering jobs keep the normal job page.
 */
export default function EngineeringJobPage({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const { setDivision } = useDivision();
  const [job, setJob] = useState<CeJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [jobId]);

  useEffect(() => {
    setDivision("engineering");
  }, [setDivision]);

  const loadJob = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select(
          "id, job_number, title, description, status, start_date, due_date, location, site_address, customer_id, project_manager_id",
        )
        .eq("id", jobId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setJob(null);
        setLoadError("This job doesn't exist or was deleted.");
        return;
      }
      const j: any = data;
      const [customerRes, pmRes] = await Promise.all([
        j.customer_id
          ? supabase
              .schema("common")
              .from("customers")
              .select("name, company_name")
              .eq("id", j.customer_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        j.project_manager_id
          ? supabase
              .schema("common")
              .from("profiles")
              .select("full_name, email")
              .eq("id", j.project_manager_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      // Names are nice-to-have; a failed lookup still shows the job.
      if (customerRes.error) console.warn("Error loading customer:", customerRes.error);
      if (pmRes.error) console.warn("Error loading project manager:", pmRes.error);
      const c: any = customerRes.data;
      const p: any = pmRes.data;
      setJob({
        ...j,
        customerName: c?.company_name || c?.name || "",
        pmName: p ? (p.full_name || "").trim() || p.email : null,
      });
    } catch (err) {
      console.error("Error loading C&E job:", err);
      setLoadError("Could not load this job.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJob();
  }, [jobId]);

  // Back to AMP: the route re-checks the switch and opens the normal job page.
  const switchToAmp = async () => {
    setSwitching(true);
    try {
      await setEngineeringCompany(jobId, false);
      navigate(engineeringJobPath(jobId), { replace: true });
    } catch (err) {
      console.error("Error switching job company:", err);
      toast({
        title: "Error",
        description: "Could not change the company. Please try again.",
        variant: "destructive",
      });
      setSwitching(false);
    }
  };

  const st = statusOf(job?.status ?? null);
  const site = job?.location || job?.site_address;
  const details: { label: string; value: React.ReactNode }[] = job
    ? [
        { label: "Customer", value: job.customerName || "—" },
        { label: "Site", value: job.location || "—" },
        { label: "Site address", value: job.site_address || "—" },
        { label: "Project manager", value: job.pmName || "No PM" },
        { label: "Start date", value: <span className="font-mono">{showDate(job.start_date)}</span> },
        { label: "Due date", value: <span className="font-mono">{showDate(job.due_date)}</span> },
      ]
    : [];

  return (
    // Negative margins undo the layout's padding so the title band runs edge to edge.
    <div className={`-m-3 min-h-full sm:-m-4 lg:-m-6 ${ce.page}`}>
      <div className="relative overflow-hidden print:hidden" style={blueprintStyle}>
        <Constellation />
        <div className="relative mx-auto flex max-w-[1360px] flex-col gap-3 px-4 pb-8 pt-8 sm:px-8">
          <Link
            to={CE_JOBS_PATH}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#c4c8d2] no-underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {companyConfig.engineeringName} jobs
          </Link>
          {job && (
            <>
              <span className="font-mono text-xs text-[#c4c8d2]">{job.job_number || "No job #"}</span>
              <h1 className="m-0 text-2xl font-bold leading-tight text-white sm:text-3xl">
                {job.title || "Untitled job"}
              </h1>
              {(job.customerName || site) && (
                <p className="m-0 text-sm text-[#c4c8d2]">
                  {[job.customerName, site].filter(Boolean).join(" · ")}
                </p>
              )}
            </>
          )}
          <div aria-hidden className={`mt-1 h-[3px] w-14 ${ce.spark}`} />
        </div>
      </div>

      <div className="mx-auto max-w-[1360px] px-4 pb-28 pt-8 sm:px-8">
        {loading ? (
          <div className="flex justify-center py-24">
            <LoadingSpinner size="md" />
          </div>
        ) : loadError || !job ? (
          <div className={`border ${ce.border} p-8 text-center`}>
            <p className={`text-sm ${ce.muted}`}>{loadError}</p>
            <button type="button" onClick={loadJob} className={`${ce.ghostButton} mt-4 h-10 px-4`}>
              Try again
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className={`border ${ce.border} ${ce.surface} ${ce.shadow}`}>
              <h2 className={`m-0 border-b px-6 py-4 ${ce.border} ${ce.eyebrow} ${ce.muted}`}>
                Job details
              </h2>
              <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-5 px-6 py-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <dt className={`text-xs font-semibold ${ce.muted}`}>Status</dt>
                  <dd className="m-0 flex flex-col gap-1.5">
                    <div className="flex items-center gap-[3px]" aria-hidden>
                      {Array.from({ length: STEPS }, (_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-[26px] ${i < st.step ? "bg-brand" : ce.segmentOff}`}
                        />
                      ))}
                    </div>
                    <span className="text-sm">{st.label}</span>
                  </dd>
                </div>
                {details.map((d) => (
                  <div key={d.label} className="flex min-w-0 flex-col gap-1.5">
                    <dt className={`text-xs font-semibold ${ce.muted}`}>{d.label}</dt>
                    <dd className="m-0 break-words text-sm">{d.value}</dd>
                  </div>
                ))}
                {job.description && (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <dt className={`text-xs font-semibold ${ce.muted}`}>Description</dt>
                    <dd className="m-0 whitespace-pre-wrap text-sm">{job.description}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className={`self-start border ${ce.border} ${ce.surface} ${ce.shadow}`}>
              <h2 className={`m-0 border-b px-6 py-4 ${ce.border} ${ce.eyebrow} ${ce.muted}`}>
                Company
              </h2>
              <div className="flex flex-col gap-3 px-6 py-5">
                <label htmlFor="ce-job-company" className={`text-xs font-semibold ${ce.muted}`}>
                  This job belongs to
                </label>
                <select
                  id="ce-job-company"
                  value="ce"
                  disabled={switching}
                  onChange={(e) => e.target.value === "amp" && switchToAmp()}
                  className={`${ce.field} px-3`}
                >
                  <option value="amp">{companyConfig.name}</option>
                  <option value="ce">{companyConfig.engineeringName}</option>
                </select>
                <p className={`m-0 text-[13px] ${ce.muted}`}>
                  {companyConfig.name} jobs open on the standard job page, with NETA reports.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
