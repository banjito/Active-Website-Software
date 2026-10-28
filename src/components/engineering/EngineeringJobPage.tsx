import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Camera, FileText, LayoutDashboard, Loader2, Pencil, StickyNote } from "lucide-react";
import { useDivision } from "@/App";
import { supabase } from "@/lib/supabase";
import { companyConfig } from "@/lib/companyConfig";
import { fetchEngineeringCompany, setEngineeringCompany } from "@/lib/engineering/engineeringCompany";
import { jobFieldValues } from "@/lib/engineering/reportStore";
import { useDivisions } from "@/hooks/useDivisions";
import { jobDivisionOptions } from "@/services/divisionsService";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "@/components/ui/toast";
import JobNotes from "@/components/jobs/JobNotes";
import JobPictures from "@/components/jobs/JobPictures";
import Constellation from "./Constellation";
import EngineeringJobReports from "./EngineeringJobReports";
import { blueprintStyle, ce } from "./engineeringTheme";
import { COMPANY_PARAM, formatDue, STATUS, statusOf, stepFill, STEPS } from "./EngineeringJobsTab";

type Tab = "overview" | "reports" | "notes" | "pictures";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "pictures", label: "Pictures", icon: Camera },
];

interface EngJob {
  id: string;
  job_number: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  start_date: string | null;
  due_date: string | null;
  location: string | null;
  site_address: string | null;
  division: string | null;
  customerName: string;
  pmName: string | null;
}

type EditForm = Pick<
  EngJob,
  "title" | "description" | "status" | "start_date" | "due_date" | "location" | "site_address" | "division"
>;

/** A DB date or timestamp as "Oct 27"; "—" when empty. */
const showDate = (date: string | null) => (date ? formatDue(date.slice(0, 10)) : "—");
/** A DB date or timestamp as a date input's YYYY-MM-DD. */
const inputDate = (date: string | null) => (date ? date.slice(0, 10) : "");

const labelClass = `text-xs font-semibold ${ce.muted}`;

/**
 * Every engineering-division job's page (AMP or C&E), in the engineering
 * portal's look: Overview, Reports (made from Report builder templates),
 * Notes and Pictures. No NETA reports.
 */
export default function EngineeringJobPage({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const { setDivision } = useDivision();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "overview") as Tab;
  const reportId = params.get("report");
  const [job, setJob] = useState<EngJob | null>(null);
  // null = the company column doesn't exist yet, so the switch is hidden.
  const [ceJob, setCeJob] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      const [{ data, error }, company] = await Promise.all([
        supabase
          .schema("neta_ops")
          .from("jobs")
          .select(
            "id, job_number, title, description, status, start_date, due_date, location, site_address, division, customer_id, project_manager_id",
          )
          .eq("id", jobId)
          .is("deleted_at", null)
          .maybeSingle(),
        fetchEngineeringCompany(jobId).catch((err) => {
          console.warn("Error checking job company:", err);
          return null;
        }),
      ]);
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
      setCeJob(company);
    } catch (err) {
      console.error("Error loading engineering job:", err);
      setLoadError("Could not load this job.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJob();
  }, [jobId]);

  const jobValues = useMemo(() => (job ? jobFieldValues(job) : {}), [job]);

  const setTab = (id: Tab) => setParams(id === "overview" ? {} : { tab: id });
  const openReport = (id: string | null) =>
    setParams(id ? { tab: "reports", report: id } : { tab: "reports" });

  // An open report gets the full window width, like the Report builder.
  const wide = tab === "reports" && !!reportId && reportId !== "new";
  const site = job?.location || job?.site_address;
  const companyName = ceJob ? companyConfig.engineeringName : companyConfig.name;

  return (
    // Negative margins undo the layout's padding so the title band runs edge to edge.
    <div className={`-m-3 min-h-full sm:-m-4 lg:-m-6 ${ce.page}`}>
      <div className="relative overflow-hidden print:hidden" style={blueprintStyle}>
        <Constellation />
        <div className="relative mx-auto flex max-w-[1360px] flex-col gap-3 px-4 pt-8 sm:px-8">
          <Link
            to={ceJob ? `/engineering/jobs?${COMPANY_PARAM}=ce` : "/engineering/jobs"}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#c4c8d2] no-underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Engineering jobs
          </Link>
          {job && (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs text-[#c4c8d2]">{job.job_number || "No job #"}</span>
                {ceJob !== null && (
                  <span className="border border-white/25 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#c4c8d2]">
                    {companyName}
                  </span>
                )}
              </div>
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
          <div role="tablist" aria-label="Job sections" className="mt-3 flex flex-wrap gap-0.5">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2.5 px-5 py-3.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${
                    active
                      ? `${ce.surface} ${ce.ink} shadow-[inset_0_2px_0_rgb(var(--brand-rgb))]`
                      : "text-[#c4c8d2] hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={wide ? "px-3 pb-6 pt-4 sm:px-4" : "mx-auto max-w-[1360px] px-4 pb-28 pt-8 sm:px-8"}>
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
        ) : tab === "reports" ? (
          <EngineeringJobReports
            jobId={job.id}
            jobValues={jobValues}
            openId={reportId}
            onOpen={openReport}
          />
        ) : tab === "notes" ? (
          <JobNotes jobId={job.id} />
        ) : tab === "pictures" ? (
          <JobPictures jobId={job.id} />
        ) : (
          <Overview
            job={job}
            ceJob={ceJob}
            onCeJobChange={setCeJob}
            onSaved={(form) => {
              // Moved out of engineering: open it where it now lives.
              if (form.division !== "engineering") {
                navigate(form.division ? `/${form.division}/jobs/${job.id}` : `/jobs/${job.id}`);
                return;
              }
              setJob({ ...job, ...form });
            }}
          />
        )}
      </div>
    </div>
  );
}

function Overview({
  job,
  ceJob,
  onCeJobChange,
  onSaved,
}: {
  job: EngJob;
  ceJob: boolean | null;
  onCeJobChange: (value: boolean) => void;
  onSaved: (form: EditForm) => void;
}) {
  const divisionOptions = jobDivisionOptions(useDivisions());
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);

  const startEdit = () =>
    setForm({
      title: job.title,
      description: job.description,
      status: job.status ?? "pending",
      start_date: inputDate(job.start_date),
      due_date: inputDate(job.due_date),
      location: job.location,
      site_address: job.site_address,
      division: job.division,
    });

  const set = (key: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const changes: EditForm = {
        ...form,
        title: form.title?.trim() || job.title,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        location: form.location?.trim() || null,
        site_address: form.site_address?.trim() || null,
        description: form.description?.trim() || null,
      };
      const { data, error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Update not permitted or job not found (RLS).");
      setForm(null);
      toast({ title: "Saved", description: "Job updated.", variant: "success" });
      onSaved(changes);
    } catch (err) {
      console.error("Error updating engineering job:", err);
      toast({ title: "Error", description: "Couldn't save the job. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const switchCompany = async (value: boolean) => {
    setSwitching(true);
    try {
      await setEngineeringCompany(job.id, value);
      onCeJobChange(value);
    } catch (err) {
      console.error("Error switching job company:", err);
      toast({ title: "Error", description: "Couldn't change the company. Please try again.", variant: "destructive" });
    } finally {
      setSwitching(false);
    }
  };

  const st = statusOf(job.status);
  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Customer", value: job.customerName || "—" },
    { label: "Project manager", value: job.pmName || "No PM" },
    { label: "Site", value: job.location || "—" },
    { label: "Site address", value: job.site_address || "—" },
    { label: "Start date", value: <span className="font-mono">{showDate(job.start_date)}</span> },
    { label: "Due date", value: <span className="font-mono">{showDate(job.due_date)}</span> },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className={`border ${ce.border} ${ce.surface} ${ce.shadow}`}>
        <div className={`flex items-center justify-between border-b px-6 py-3 ${ce.border}`}>
          <h2 className={`m-0 ${ce.eyebrow} ${ce.muted}`}>Job details</h2>
          {!form && (
            <button type="button" onClick={startEdit} className={`${ce.ghostButton} h-9 px-3`}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </button>
          )}
        </div>

        {form ? (
          <form onSubmit={save} className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={labelClass}>Title</span>
              <input value={form.title ?? ""} onChange={set("title")} className={`${ce.field} px-3`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Status</span>
              <select value={form.status ?? "pending"} onChange={set("status")} className={`${ce.field} px-3`}>
                {Object.entries(STATUS).map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Division</span>
              <select value={form.division ?? ""} onChange={set("division")} className={`${ce.field} px-3`}>
                {divisionOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
                {/* Keep a retired or legacy division selectable so the form doesn't blank it. */}
                {form.division && !divisionOptions.some((d) => d.id === form.division) && (
                  <option value={form.division}>{form.division}</option>
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Start date</span>
              <input type="date" value={form.start_date ?? ""} onChange={set("start_date")} className={`${ce.field} px-3`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Due date</span>
              <input type="date" value={form.due_date ?? ""} onChange={set("due_date")} className={`${ce.field} px-3`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Site</span>
              <input value={form.location ?? ""} onChange={set("location")} className={`${ce.field} px-3`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Site address</span>
              <input value={form.site_address ?? ""} onChange={set("site_address")} className={`${ce.field} px-3`} />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={labelClass}>Description</span>
              <textarea
                rows={4}
                value={form.description ?? ""}
                onChange={set("description")}
                className={`${ce.field} h-auto px-3 py-2`}
              />
            </label>
            {form.division !== "engineering" && (
              <p className={`m-0 text-[13px] sm:col-span-2 ${ce.accentInk}`}>
                Saving moves this job out of engineering, to the standard job page.
              </p>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setForm(null)} className={`${ce.ghostButton} h-10 px-4`}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={`${ce.primaryButton} h-10 px-4`}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Save
              </button>
            </div>
          </form>
        ) : (
          <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-5 px-6 py-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <dt className={labelClass}>Status</dt>
              <dd className="m-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-[3px]" aria-hidden>
                  {Array.from({ length: STEPS }, (_, i) => (
                    <span key={i} className={`h-1.5 w-[26px] ${i < st.step ? stepFill(st) : ce.segmentOff}`} />
                  ))}
                </div>
                <span className="text-sm">{st.label}</span>
              </dd>
            </div>
            {details.map((d) => (
              <div key={d.label} className="flex min-w-0 flex-col gap-1.5">
                <dt className={labelClass}>{d.label}</dt>
                <dd className="m-0 break-words text-sm">{d.value}</dd>
              </div>
            ))}
            {job.description && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <dt className={labelClass}>Description</dt>
                <dd className="m-0 whitespace-pre-wrap text-sm">{job.description}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {ceJob !== null && (
        <section className={`self-start border ${ce.border} ${ce.surface} ${ce.shadow}`}>
          <h2 className={`m-0 border-b px-6 py-4 ${ce.border} ${ce.eyebrow} ${ce.muted}`}>Company</h2>
          <div className="flex flex-col gap-3 px-6 py-5">
            <label htmlFor="eng-job-company" className={labelClass}>
              This job belongs to
            </label>
            <select
              id="eng-job-company"
              value={ceJob ? "ce" : "amp"}
              disabled={switching}
              onChange={(e) => switchCompany(e.target.value === "ce")}
              className={`${ce.field} px-3`}
            >
              <option value="amp">{companyConfig.name}</option>
              <option value="ce">{companyConfig.engineeringName}</option>
            </select>
          </div>
        </section>
      )}
    </div>
  );
}
