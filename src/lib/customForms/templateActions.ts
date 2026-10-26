/**
 * Template list actions for the Custom Form Templates page. The Engineering
 * portal's LaTeX report builder is separate and never uses these.
 */

import { supabase } from "@/lib/supabase";
import { publishTemplateVersion } from "@/lib/customForms/versioning";
import { reviewAsDescription } from "@/lib/customForms/excel/import";
import type { ExcelImportDraft } from "@/lib/customForms/excel/types";

const templates = () =>
  supabase.schema("neta_ops").from("custom_form_templates");

export async function fetchActiveTemplates() {
  const { data, error } = await templates()
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Copies a template as a new unpublished draft. */
export async function duplicateTemplate(templateId: string, userId?: string) {
  const { data: original, error: loadError } = await templates()
    .select("*")
    .eq("id", templateId)
    .single();
  if (loadError) throw loadError;

  const { error } = await templates().insert({
    name: `${original.name} (Copy)`,
    description: original.description,
    neta_section: original.neta_section,
    created_by: userId,
    structure: original.structure,
    is_active: true,
    is_published: false,
  });
  if (error) throw error;
}

/** Soft delete: hides the template; filled-in forms keep their version. */
export async function deactivateTemplate(templateId: string) {
  const { error } = await templates()
    .update({ is_active: false })
    .eq("id", templateId);
  if (error) throw error;
}

export async function unpublishTemplate(templateId: string) {
  const { error } = await templates()
    .update({ is_published: false })
    .eq("id", templateId);
  if (error) throw error;
}

/**
 * Compiles the draft and freezes it as a new immutable version.
 * Returns the toast message to show; throws when publishing fails.
 */
export async function publishTemplate(
  templateId: string,
  userId?: string,
): Promise<string> {
  const { data, error } = await templates()
    .select("*")
    .eq("id", templateId)
    .single();
  if (error || !data) throw error ?? new Error("Template not found");

  const result = await publishTemplateVersion(
    {
      id: data.id,
      name: data.name,
      description: data.description ?? undefined,
      netaSection: data.neta_section ?? undefined,
      structure: data.structure,
    },
    { userId },
  );

  if (!result.ok) {
    const firstError = result.report.errors[0];
    throw new Error(
      result.error ??
        (firstError
          ? `Cannot publish: ${firstError.message}`
          : "Cannot publish: the template did not compile."),
    );
  }

  return `Published version ${result.version!.version}. It will now appear in jobs.`;
}

/** Saves a draft built from a spreadsheet and returns its id. */
export async function saveImportedDraft(
  draft: ExcelImportDraft,
  userId?: string,
): Promise<string> {
  const { data, error } = await templates()
    .insert({
      name: draft.template.name || "Imported form",
      description: reviewAsDescription(draft.review),
      neta_section: null,
      created_by: userId,
      structure: draft.template.structure,
      is_active: true,
      is_published: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data.id as string;
}
