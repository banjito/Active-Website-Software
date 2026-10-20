import { supabase } from "@/lib/supabase";

/**
 * Plain (non-AI) search across ampOS for the home page search bar. Each record type is a
 * "contains" match on its few identifying columns, all run side by side. One type failing
 * (a table missing on a fresh instance, a permission error) leaves the others standing.
 */

export type SearchResultType =
  | "job"
  | "report"
  | "equipment"
  | "site"
  | "customer"
  | "contact"
  | "quote";

export interface GlobalSearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export interface GlobalSearchOptions {
  /** Customers, contacts and quotes are sales data; only roles with the Sales portal see them. */
  includeSales: boolean;
}

/** Rows shown per type. More are fetched so the best matches can be ranked to the top. */
const PER_TYPE = 6;
const FETCH_LIMIT = 20;

/**
 * Values in PostgREST's .or() are wrapped in double quotes so commas, periods and
 * parentheses typed by the user can't break the filter. Quotes and backslashes are dropped
 * for the same reason, and % / * because they'd act as wildcards.
 */
function cleanTerm(raw: string): string {
  return raw.replace(/["\\%*]/g, " ").replace(/\s+/g, " ").trim();
}

const contains = (column: string, term: string) => `${column}.ilike."%${term}%"`;

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

const humanize = (value: string | null | undefined) => (value ? value.replace(/_/g, " ") : null);

const uniqueIds = (ids: unknown[]) =>
  Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && !!id)));

/** Exact matches first, then ones starting with the term, then the rest in query order. */
function byMatch<T>(rows: T[], text: (row: T) => string | null | undefined, term: string): T[] {
  const q = term.toLowerCase();
  const score = (row: T) => {
    const t = (text(row) ?? "").toLowerCase();
    return t === q ? 0 : t.startsWith(q) ? 1 : 2;
  };
  return [...rows].sort((a, b) => score(a) - score(b)).slice(0, PER_TYPE);
}

/** Customer display names by id. Only feeds subtitles, so a failed lookup returns none. */
async function customerNames(ids: unknown[]): Promise<Record<string, string>> {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .schema("common")
    .from("customers")
    .select("id, name, company_name")
    .in("id", unique);
  if (error) {
    console.error("Search: customer name lookup failed:", error);
    return {};
  }
  return Object.fromEntries((data ?? []).map((c: any) => [c.id, c.company_name || c.name || ""]));
}

async function searchJobs(term: string): Promise<GlobalSearchResult[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("id, job_number, title, status, customer_id")
    .is("deleted_at", null)
    .or([contains("job_number", term), contains("title", term)].join(","))
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);
  if (error) throw error;

  const rows = byMatch(data ?? [], (j: any) => j.job_number, term);
  const names = await customerNames(rows.map((j: any) => j.customer_id));
  return rows.map((j: any) => ({
    type: "job",
    id: j.id,
    title: join(j.job_number, j.title) || "Untitled job",
    subtitle: join(names[j.customer_id], humanize(j.status)),
    href: `/jobs/${j.id}`,
  }));
}

/**
 * Report rows live in neta_ops.assets. Built-in and custom-form reports carry their route,
 * job id included, in file_url ("report:/jobs/<id>/...", "custom-form:/jobs/<id>/...").
 * Uploaded files don't, so they're left out.
 */
async function searchReports(term: string): Promise<GlobalSearchResult[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("assets")
    .select("id, name, file_url")
    .ilike("name", `%${term}%`)
    .or('file_url.like."report:%",file_url.like."custom-form:%"')
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);
  if (error) throw error;

  const reports = (data ?? [])
    .map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      path: String(r.file_url).replace(/^(report|custom-form):/, ""),
      jobId: String(r.file_url).match(/^[a-z-]+:\/jobs\/([^/?]+)/)?.[1],
    }))
    .filter((r) => r.jobId);
  if (reports.length === 0) return [];

  const { data: jobs, error: jobsError } = await supabase
    .schema("neta_ops")
    .from("jobs")
    .select("id, job_number, title")
    .in("id", uniqueIds(reports.map((r) => r.jobId)))
    .is("deleted_at", null);
  if (jobsError) throw jobsError;
  const jobById = Object.fromEntries((jobs ?? []).map((j: any) => [j.id, j]));

  // Reports on deleted jobs drop out with their job.
  return byMatch(
    reports.filter((r) => jobById[r.jobId!]),
    (r) => r.name,
    term,
  ).map((r) => {
    const job = jobById[r.jobId!];
    return {
      type: "report",
      id: r.id,
      title: r.name || "Untitled report",
      subtitle: join(job.job_number ? `Job ${job.job_number}` : null, job.title),
      href: r.path,
    };
  });
}

/** Equipment has no page of its own; results open the site it belongs to. */
async function searchEquipment(term: string): Promise<GlobalSearchResult[]> {
  const { data, error } = await supabase
    .schema("neta_ops")
    .from("equipment_assets")
    .select("id, site_id, identifier, equipment_type, serial_number")
    .is("deleted_at", null)
    .or(
      [
        contains("identifier", term),
        contains("serial_number", term),
        contains("equipment_location", term),
      ].join(","),
    )
    .limit(FETCH_LIMIT);
  if (error) throw error;

  const rows = byMatch(data ?? [], (a: any) => a.identifier, term);
  const siteIds = uniqueIds(rows.map((a: any) => a.site_id));
  let siteNames: Record<string, string> = {};
  if (siteIds.length > 0) {
    const { data: sites, error: sitesError } = await supabase
      .schema("common")
      .from("sites")
      .select("id, name")
      .in("id", siteIds);
    if (sitesError) console.error("Search: site name lookup failed:", sitesError);
    siteNames = Object.fromEntries((sites ?? []).map((s: any) => [s.id, s.name]));
  }

  return rows.map((a: any) => ({
    type: "equipment",
    id: a.id,
    title: a.identifier || "Unnamed equipment",
    subtitle: join(
      a.equipment_type,
      a.serial_number ? `S/N ${a.serial_number}` : null,
      siteNames[a.site_id],
    ),
    href: `/sites/${a.site_id}`,
  }));
}

async function searchSites(term: string): Promise<GlobalSearchResult[]> {
  const { data, error } = await supabase
    .schema("common")
    .from("sites")
    .select("id, name, city, state")
    .or([contains("name", term), contains("city", term), contains("address", term)].join(","))
    .order("name")
    .limit(FETCH_LIMIT);
  if (error) throw error;

  return byMatch(data ?? [], (s: any) => s.name, term).map((s: any) => ({
    type: "site",
    id: s.id,
    title: s.name || "Unnamed site",
    subtitle: [s.city, s.state].filter(Boolean).join(", ") || undefined,
    href: `/sites/${s.id}`,
  }));
}

async function searchCustomers(term: string): Promise<GlobalSearchResult[]> {
  const { data, error } = await supabase
    .schema("common")
    .from("customers")
    .select("id, name, company_name")
    .or([contains("company_name", term), contains("name", term)].join(","))
    .order("name")
    .limit(FETCH_LIMIT);
  if (error) throw error;

  return byMatch(data ?? [], (c: any) => c.company_name || c.name, term).map((c: any) => ({
    type: "customer",
    id: c.id,
    title: c.company_name || c.name || "Unnamed customer",
    subtitle: c.company_name && c.name && c.name !== c.company_name ? c.name : undefined,
    href: `/sales-dashboard/customers/${c.id}`,
  }));
}

async function searchContacts(term: string): Promise<GlobalSearchResult[]> {
  const filters = [
    contains("first_name", term),
    contains("last_name", term),
    contains("email", term),
  ];
  // "John Smith" won't match either name column alone, so try first + last too.
  const words = term.split(" ");
  if (words.length >= 2) {
    filters.push(
      `and(${contains("first_name", words[0])},${contains("last_name", words.slice(1).join(" "))})`,
    );
  }

  const { data, error } = await supabase
    .schema("common")
    .from("contacts")
    .select("id, first_name, last_name, email, customer_id")
    .or(filters.join(","))
    .order("last_name")
    .limit(FETCH_LIMIT);
  if (error) throw error;

  const rows = byMatch(data ?? [], (c: any) => join(c.first_name, c.last_name), term);
  const names = await customerNames(rows.map((c: any) => c.customer_id));
  return rows.map((c: any) => ({
    type: "contact",
    id: c.id,
    title: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unnamed contact",
    subtitle: join(names[c.customer_id], c.email),
    href: `/sales-dashboard/contacts/${c.id}`,
  }));
}

async function searchQuotes(term: string): Promise<GlobalSearchResult[]> {
  const { data, error } = await supabase
    .schema("business")
    .from("opportunities")
    .select("id, quote_number, title, status, customer_id")
    .or([contains("quote_number", term), contains("title", term)].join(","))
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);
  if (error) throw error;

  const rows = byMatch(data ?? [], (o: any) => o.quote_number, term);
  const names = await customerNames(rows.map((o: any) => o.customer_id));
  return rows.map((o: any) => ({
    type: "quote",
    id: o.id,
    title: join(o.quote_number, o.title) || "Untitled quote",
    subtitle: join(names[o.customer_id], humanize(o.status)),
    href: `/sales-dashboard/opportunities/${o.id}`,
  }));
}

export async function searchEverything(
  raw: string,
  { includeSales }: GlobalSearchOptions,
): Promise<GlobalSearchResult[]> {
  const term = cleanTerm(raw);
  if (term.length < 2) return [];

  const searchers = [searchJobs, searchReports, searchEquipment, searchSites];
  if (includeSales) searchers.push(searchCustomers, searchContacts, searchQuotes);

  const settled = await Promise.allSettled(searchers.map((search) => search(term)));
  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`Search: ${searchers[i].name} failed:`, result.reason);
    }
  });
  if (settled.every((result) => result.status === "rejected")) {
    throw new Error("Every search failed");
  }
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}
