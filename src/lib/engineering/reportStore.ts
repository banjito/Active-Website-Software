import { supabase } from "@/lib/supabase";
import { BUILT_IN_TEMPLATES, templateFields } from "./typst/templates";

// Saved engineering report templates and the reports made from them on each
// job: database/migrations/engineering_reports.sql. A report keeps its own
// copy of the template's files.

const TEMPLATES = "engineering_report_templates";
const REPORTS = "engineering_job_reports";

/** Built-in template ids look like "builtin:power-system-study". */
export const BUILT_IN_PREFIX = "builtin:";

export interface TemplateSummary {
  id: string;
  name: string;
  builtIn: boolean;
  baseTemplate: string;
  updatedAt: string | null;
}

export interface TemplateDoc extends TemplateSummary {
  sources: Record<string, string>;
}

export interface JobReportSummary {
  id: string;
  name: string;
  templateId: string | null;
  baseTemplate: string;
  updatedAt: string;
}

export interface JobReportDoc extends JobReportSummary {
  sources: Record<string, string>;
  values: Record<string, string>;
}

/** The tables don't exist yet: engineering_reports.sql hasn't been run. */
export const isMissingTable = (error: any) =>
  error?.code === "42P01" || error?.code === "PGRST205";

export const STORAGE_NOT_SET_UP =
  "Saving reports isn't set up yet. Run database/migrations/engineering_reports.sql.";

const table = (name: string) => supabase.schema("neta_ops").from(name);

const builtInSummaries = (): TemplateSummary[] =>
  BUILT_IN_TEMPLATES.map((t) => ({
    id: `${BUILT_IN_PREFIX}${t.id}`,
    name: t.name,
    builtIn: true,
    baseTemplate: t.id,
    updatedAt: null,
  }));

/** Built-in templates first, then saved ones, newest first. */
export async function listTemplates(): Promise<{ templates: TemplateSummary[]; setUp: boolean }> {
  const { data, error } = await table(TEMPLATES)
    .select("id, name, base_template, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error && !isMissingTable(error)) throw error;
  const saved: TemplateSummary[] = (data || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    builtIn: false,
    baseTemplate: t.base_template,
    updatedAt: t.updated_at,
  }));
  return { templates: [...builtInSummaries(), ...saved], setUp: !error };
}

export async function getTemplate(id: string): Promise<TemplateDoc | null> {
  if (id.startsWith(BUILT_IN_PREFIX)) {
    const t = BUILT_IN_TEMPLATES.find((b) => `${BUILT_IN_PREFIX}${b.id}` === id);
    return t ? { ...builtInSummaries().find((s) => s.id === id)!, sources: { ...t.sources } } : null;
  }
  const { data, error } = await table(TEMPLATES)
    .select("id, name, base_template, updated_at, sources")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const t: any = data;
  return {
    id: t.id,
    name: t.name,
    builtIn: false,
    baseTemplate: t.base_template,
    updatedAt: t.updated_at,
    sources: t.sources || {},
  };
}

export async function createTemplate(
  name: string,
  baseTemplate: string,
  sources: Record<string, string>,
): Promise<string> {
  const { data, error } = await table(TEMPLATES)
    .insert({ name, base_template: baseTemplate, sources })
    .select("id")
    .single();
  if (error) throw error;
  return (data as any).id;
}

export async function saveTemplate(
  id: string,
  changes: { name?: string; sources?: Record<string, string> },
  userId?: string,
): Promise<void> {
  const { data, error } = await table(TEMPLATES)
    .update({ ...changes, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Update not permitted or template not found (RLS).");
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await table(TEMPLATES)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listJobReports(
  jobId: string,
): Promise<{ reports: JobReportSummary[]; setUp: boolean }> {
  const { data, error } = await table(REPORTS)
    .select("id, name, template_id, base_template, updated_at")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error && !isMissingTable(error)) throw error;
  return {
    reports: (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      templateId: r.template_id,
      baseTemplate: r.base_template,
      updatedAt: r.updated_at,
    })),
    setUp: !error,
  };
}

export async function getJobReport(id: string): Promise<JobReportDoc | null> {
  const { data, error } = await table(REPORTS)
    .select("id, name, template_id, base_template, updated_at, sources, field_values")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r: any = data;
  return {
    id: r.id,
    name: r.name,
    templateId: r.template_id,
    baseTemplate: r.base_template,
    updatedAt: r.updated_at,
    sources: r.sources || {},
    values: r.field_values || {},
  };
}

/** A new report on a job: a copy of the template, filled from the job. */
export async function createJobReport(
  jobId: string,
  template: TemplateDoc,
  jobValues: Record<string, string>,
): Promise<string> {
  const known = new Set(templateFields(template.sources["/project.typ"] ?? "").map((f) => f.key));
  const { data, error } = await table(REPORTS)
    .insert({
      job_id: jobId,
      name: template.name,
      template_id: template.builtIn ? null : template.id,
      base_template: template.baseTemplate,
      sources: template.sources,
      field_values: Object.fromEntries(Object.entries(jobValues).filter(([key]) => known.has(key))),
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as any).id;
}

export async function saveJobReport(
  id: string,
  changes: { name?: string; sources?: Record<string, string>; values?: Record<string, string> },
  userId?: string,
): Promise<void> {
  const { values, ...rest } = changes;
  const { data, error } = await table(REPORTS)
    .update({
      ...rest,
      ...(values ? { field_values: values } : {}),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Update not permitted or report not found (RLS).");
}

export async function deleteJobReport(id: string): Promise<void> {
  const { error } = await table(REPORTS)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

const today = () =>
  new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** "616 Church St NE, Decatur, AL 35601" -> "Decatur, AL". */
const cityState = (address?: string | null) => {
  const m = address?.trim().match(/(?:^|,)\s*([^,]+?)\s*,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
  return m ? `${m[1]}, ${m[2]}` : "";
};

/** What a job fills in: project.typ keys -> values. */
export const jobFieldValues = (job: {
  job_number?: string | null;
  title?: string | null;
  location?: string | null;
  site_address?: string | null;
  customerName?: string | null;
}): Record<string, string> => ({
  projectnumber: job.job_number || "",
  sitename: job.location || job.title || "",
  sitelocation: cityState(job.site_address),
  preparedfor: job.customerName || "",
  mydate: today(),
});
