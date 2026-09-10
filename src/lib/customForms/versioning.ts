/**
 * Template versioning.
 *
 * Publishing compiles the draft and freezes it as a new immutable version.
 * Filling a form always renders from a version, never from the draft, so
 * editing a template cannot change a report that was signed last year.
 */

import { supabase } from "@/lib/supabase";
import type {
  CustomFormStructure,
  CustomFormTemplate,
  CustomFormTemplateVersion,
  TemplatePublicationStatus,
} from "@/lib/types/customForms";
import { compileTemplate, type ValidationReport } from "./compile";
import { canonicalJson, structureChecksum } from "./checksum";
import { resolveVersionForRender, type RenderVersionRequest } from "@/lib/customForms/expressions/render-version";

export { canonicalJson, structureChecksum };

const SCHEMA = "neta_ops";
const VERSIONS_TABLE = "custom_form_template_versions";
const TEMPLATES_TABLE = "custom_form_templates";

/** Structure schema this build writes. Instance schema is separate. */
export const CURRENT_TEMPLATE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToVersion(row: any): CustomFormTemplateVersion {
  return {
    id: row.id,
    templateId: row.template_id,
    version: row.version,
    schemaVersion: row.schema_version ?? 1,
    name: row.name,
    description: row.description ?? undefined,
    netaSection: row.neta_section ?? undefined,
    structure: row.structure,
    checksum: row.checksum ?? null,
    releaseNotes: row.release_notes ?? null,
    origin: row.origin ?? "published",
    createdBy: row.created_by ?? null,
    publishedBy: row.published_by ?? null,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getTemplateVersion(
  versionId: string,
): Promise<CustomFormTemplateVersion | null> {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(VERSIONS_TABLE)
    .select("*")
    .eq("id", versionId)
    .single();
  if (error || !data) return null;
  return rowToVersion(data);
}

/** The version new instances of this template should be created against. */
export async function getActiveTemplateVersion(
  templateId: string,
): Promise<CustomFormTemplateVersion | null> {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(VERSIONS_TABLE)
    .select("*")
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return rowToVersion(data[0]);
}

export async function listTemplateVersions(
  templateId: string,
): Promise<CustomFormTemplateVersion[]> {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(VERSIONS_TABLE)
    .select("*")
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  if (error || !data) return [];
  return data.map(rowToVersion);
}

/**
 * Whether the draft has moved on since the last publication. Compares the
 * checksum when the version has one, and falls back to the canonical text.
 */
export async function publicationStatus(
  template: CustomFormTemplate,
  active: CustomFormTemplateVersion | null,
): Promise<TemplatePublicationStatus> {
  if (!active) return "unpublished";
  const draftChecksum = await structureChecksum(template.structure);
  if (active.checksum && draftChecksum) {
    return active.checksum === draftChecksum
      ? "published"
      : "draft_ahead_of_published";
  }
  return canonicalJson(active.structure) === canonicalJson(template.structure)
    ? "published"
    : "draft_ahead_of_published";
}

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

export interface PublishResult {
  ok: boolean;
  version?: CustomFormTemplateVersion;
  report: ValidationReport;
  error?: string;
}

/**
 * Compile the draft and freeze it as the next version.
 *
 * Refuses to publish a template with errors: an immutable version that nobody
 * can fix is worse than an unpublished one.
 */
export async function publishTemplateVersion(
  template: CustomFormTemplate,
  options: { userId?: string; releaseNotes?: string } = {},
): Promise<PublishResult> {
  if (!template.id) {
    return {
      ok: false,
      report: { issues: [], errors: [], warnings: [], ok: false },
      error: "Save the template before publishing it.",
    };
  }

  const compiled = compileTemplate(template);
  if (!compiled.ok || !compiled.structure) {
    return { ok: false, report: compiled.report };
  }

  const latest = await getActiveTemplateVersion(template.id);
  const nextVersion = (latest?.version ?? 0) + 1;
  const checksum = await structureChecksum(compiled.structure);

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(VERSIONS_TABLE)
    .insert({
      template_id: template.id,
      version: nextVersion,
      schema_version: CURRENT_TEMPLATE_SCHEMA_VERSION,
      name: template.name,
      description: template.description ?? null,
      neta_section: template.netaSection ?? null,
      structure: compiled.structure,
      checksum,
      release_notes: options.releaseNotes ?? null,
      origin: "published",
      created_by: options.userId ?? null,
      published_by: options.userId ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      report: compiled.report,
      error: error?.message ?? "Could not create the template version.",
    };
  }

  const version = rowToVersion(data);

  const { error: pointerError } = await supabase
    .schema(SCHEMA)
    .from(TEMPLATES_TABLE)
    .update({
      active_version_id: version.id,
      latest_version: version.version,
      is_published: true,
    })
    .eq("id", template.id);

  if (pointerError) {
    // The version exists and is immutable; only the pointer failed. Say so
    // rather than pretending the publish did not happen.
    return {
      ok: false,
      version,
      report: compiled.report,
      error: `Version ${version.version} was created but the template still points at the previous one: ${pointerError.message}`,
    };
  }

  return { ok: true, version, report: compiled.report };
}

/**
 * The version an instance should render from.
 *
 * A missing pinned version is an error, never permission to substitute a newer
 * template. Legacy unpinned reports retain their old fallback only when the
 * selected definition still uses the legacy engine.
 */
export async function resolveRenderStructure(args: RenderVersionRequest): Promise<{
  structure: CustomFormStructure;
  version: CustomFormTemplateVersion | null;
  source: "pinned" | "active" | "draft";
}> {
  return resolveVersionForRender(args, {
    loadVersion: getTemplateVersion,
    loadActiveVersion: getActiveTemplateVersion,
  });
}
