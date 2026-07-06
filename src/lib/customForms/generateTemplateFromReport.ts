/**
 * AI-assisted template generation.
 *
 * Reads a hard-coded report (`src/components/reports/*.tsx`), sends its source
 * plus the component catalog to the `generate-form-template` Edge Function
 * (which calls a DeepSeek model), and returns a draft CustomFormTemplate for
 * review in the Form Builder.
 * See src/components/reports/CUSTOM-FORM-BUILDER-REPLICATION.md.
 */

import { supabase } from "@/lib/supabase";
import { COMPONENT_LIBRARY } from "./componentLibrary";
import type { CustomFormTemplate } from "@/lib/types/customForms";

// Raw source of every report, lazily loaded (Vite turns each into a string import).
const reportModules = import.meta.glob("/src/components/reports/*.{tsx,jsx}", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export interface ReportOption {
  /** Full glob path, used as the loader key. */
  path: string;
  /** Bare file name, e.g. "3-LowVoltageCableATS.tsx". */
  fileName: string;
}

/** List of report files available to convert, sorted by name. */
export function listReports(): ReportOption[] {
  return Object.keys(reportModules)
    .map((path) => ({ path, fileName: path.split("/").pop() || path }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

/**
 * Condensed catalog Claude uses to pick componentTypes and seed section config.
 * We ship the full defaultConfig — it shows the exact column/field shapes.
 */
function buildComponentCatalog() {
  return COMPONENT_LIBRARY.map((c) => ({
    componentType: c.id,
    name: c.name,
    category: c.category,
    description: c.description,
    defaultConfig: c.defaultConfig,
  }));
}

/**
 * Generate a draft template from a report file.
 * Returns the template structure (not yet persisted).
 */
export async function generateTemplateFromReport(
  report: ReportOption,
): Promise<CustomFormTemplate> {
  const loader = reportModules[report.path];
  if (!loader) throw new Error(`Report not found: ${report.path}`);

  const reportSource = await loader();

  const { data, error } = await supabase.functions.invoke(
    "generate-form-template",
    {
      body: {
        reportName: report.fileName,
        reportSource,
        componentCatalog: buildComponentCatalog(),
      },
    },
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.template?.structure) {
    throw new Error("The generator did not return a valid template.");
  }

  return data.template as CustomFormTemplate;
}
