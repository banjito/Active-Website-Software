import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { REPORT_NAMES } from "@/components/reports/reportMappings";

/**
 * The list of report forms a user can pick.
 *
 * ampOS has no report_template table — a form is either a built-in route slug (a key of
 * REPORT_NAMES) or a row in neta_ops.custom_form_templates. Both shapes are flattened
 * here so callers deal with one list, and so the "create a report" picker and the
 * "schedule a test" picker can never drift apart.
 */
export interface ReportTemplateChoice {
  /** Stable key for lists and for matching a saved scheduled test back to its option. */
  key: string;
  /** Route slug for a built-in report; undefined for a custom form. */
  slug?: string;
  /** Template id for a custom form; undefined for a built-in report. */
  customFormTemplateId?: string;
  name: string;
}

export interface ReportTemplateGroup {
  label: string;
  items: ReportTemplateChoice[];
}

interface CustomFormTemplate {
  id: string;
  name: string;
  neta_section?: string | null;
}

/**
 * Load the published custom forms once per dialog opening.
 *
 * A failure here degrades to built-in reports only rather than emptying the picker: not
 * being able to reach the custom-form table shouldn't stop someone scheduling a standard
 * insulation-resistance test.
 */
export function useReportTemplateChoices(enabled: boolean): {
  choices: ReportTemplateChoice[];
  loading: boolean;
} {
  const [customForms, setCustomForms] = useState<CustomFormTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("custom_form_templates")
          .select("id, name, neta_section")
          .eq("is_active", true)
          .eq("is_published", true)
          .order("name");
        if (!cancelled) setCustomForms(error ? [] : (data ?? []));
      } catch {
        if (!cancelled) setCustomForms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const choices = useMemo(() => {
    const builtIn: ReportTemplateChoice[] = Object.entries(REPORT_NAMES).map(
      ([slug, name]) => ({ key: `slug:${slug}`, slug, name }),
    );
    const custom: ReportTemplateChoice[] = customForms.map((t) => ({
      key: `form:${t.id}`,
      customFormTemplateId: t.id,
      name: t.neta_section ? `${t.name} (${t.neta_section})` : t.name,
    }));
    return [...builtIn, ...custom];
  }, [customForms]);

  return { choices, loading };
}

/**
 * Group choices for display, filtered by a search term.
 *
 * ATS/MTS is carried in the report title itself rather than in a column, so that's what
 * the grouping reads.
 */
export function groupReportTemplates(
  choices: ReportTemplateChoice[],
  search: string,
): ReportTemplateGroup[] {
  const term = search.trim().toLowerCase();
  const ats: ReportTemplateChoice[] = [];
  const mts: ReportTemplateChoice[] = [];
  const other: ReportTemplateChoice[] = [];
  const custom: ReportTemplateChoice[] = [];

  for (const choice of choices) {
    if (term && !choice.name.toLowerCase().includes(term)) continue;
    if (choice.customFormTemplateId) custom.push(choice);
    else if (/\bATS\b/.test(choice.name)) ats.push(choice);
    else if (/\bMTS\b/.test(choice.name)) mts.push(choice);
    else other.push(choice);
  }

  const byName = (a: ReportTemplateChoice, b: ReportTemplateChoice) =>
    a.name.localeCompare(b.name);

  return [
    { label: "ATS Reports", items: ats.sort(byName) },
    { label: "MTS Reports", items: mts.sort(byName) },
    { label: "Other Reports", items: other.sort(byName) },
    { label: "Custom Forms", items: custom.sort(byName) },
  ].filter((g) => g.items.length > 0);
}

/** Human name for whatever a scheduled test points at. Free text is returned as-is. */
export function workScheduledLabel(
  work: {
    report_slug?: string | null;
    custom_form_template_id?: string | null;
    work_scheduled_text?: string | null;
  },
  choices: ReportTemplateChoice[],
): string {
  if (work.report_slug) {
    return REPORT_NAMES[work.report_slug] ?? work.report_slug;
  }
  if (work.custom_form_template_id) {
    const match = choices.find(
      (c) => c.customFormTemplateId === work.custom_form_template_id,
    );
    return match?.name ?? "Custom form";
  }
  return work.work_scheduled_text ?? "—";
}
