import type { CustomFormStructure, CustomFormTemplate, CustomFormTemplateVersion } from "@/lib/types/customForms";
import { EXPRESSION_ENGINE_VERSION } from "@/lib/customForms/expressions/types";

export interface RenderVersionRequest {
  templateId?: string | null;
  templateVersionId?: string | null;
  existingInstance?: boolean;
  draft: CustomFormTemplate;
}

/** Separate I/O from version-selection policy so failure behavior can be regression tested. */
export async function resolveVersionForRender(args: RenderVersionRequest, store: {
  loadVersion: (id: string) => Promise<CustomFormTemplateVersion | null>;
  loadActiveVersion: (id: string) => Promise<CustomFormTemplateVersion | null>;
}): Promise<{ structure: CustomFormStructure; version: CustomFormTemplateVersion | null; source: "pinned" | "active" | "draft" }> {
  let version: CustomFormTemplateVersion | null = null;
  let source: "pinned" | "active" | "draft" = "draft";
  if (args.templateVersionId) {
    version = await store.loadVersion(args.templateVersionId);
    if (!version || version.id !== args.templateVersionId) throw new Error("The report's pinned template version could not be loaded. No newer template was substituted. Restore access to that version before opening this report.");
    source = "pinned";
  } else if (args.templateId) {
    version = await store.loadActiveVersion(args.templateId);
    if (version) source = "active";
  }
  if (version && args.templateId && version.templateId !== args.templateId) throw new Error("The loaded template version does not belong to this report's template.");
  const structure = version?.structure ?? args.draft.structure;
  if (structure.expressions !== undefined) {
    if (structure.expressions?.engineVersion !== EXPRESSION_ENGINE_VERSION) throw new Error("This report's calculation engine version is not supported. No legacy fallback was used.");
    if (!version || (args.existingInstance && source !== "pinned")) throw new Error("Typed calculations require a version-pinned report. An older unpinned report cannot be silently upgraded.");
  }
  return { structure, version, source };
}
