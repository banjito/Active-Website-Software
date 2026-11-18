/**
 * Form files: a template saved as a .json file, and read back in as a new
 * unpublished draft. Lets a form move between accounts, or be handed over as
 * a file, without anyone running SQL.
 *
 * The file holds only the template (name, description, NETA section,
 * structure). Never filled-in reports.
 */

import type { CustomFormStructure, CustomFormTemplate } from "@/lib/types/customForms";
import { validateTemplateDraft } from "./compile";

export const FORM_FILE_FORMAT = "ampos-custom-form";
export const FORM_FILE_VERSION = 1;

export interface FormFile {
  format: typeof FORM_FILE_FORMAT;
  version: number;
  exportedAt?: string;
  name: string;
  description?: string | null;
  netaSection?: string | null;
  structure: CustomFormStructure;
}

export interface ReadFormFileResult {
  form?: {
    name: string;
    description: string | null;
    netaSection: string | null;
    structure: CustomFormStructure;
  };
  /** Why the file can't be imported. */
  error?: string;
  /** Problems the builder will show; the draft still imports. */
  problems: number;
}

export function buildFormFile(
  template: Pick<CustomFormTemplate, "name" | "description" | "netaSection" | "structure">,
  now: Date = new Date(),
): FormFile {
  return {
    format: FORM_FILE_FORMAT,
    version: FORM_FILE_VERSION,
    exportedAt: now.toISOString(),
    name: template.name,
    description: template.description ?? null,
    netaSection: template.netaSection ?? null,
    structure: template.structure,
  };
}

/** A safe file name, e.g. "Breaker Settings Entry Form.json". */
export function formFileName(name: string): string {
  const clean = String(name || "Custom form").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${clean || "Custom form"}.json`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Read a form file. Also takes a bare structure ({ sections, settings }) or a
 * template row ({ name, structure }), so older hand-made files still work.
 */
export function readFormFile(text: string): ReadFormFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(text ?? "").replace(/^﻿/, ""));
  } catch {
    return { error: "This isn't a form file (it isn't valid JSON).", problems: 0 };
  }
  if (!isObject(parsed)) return { error: "This isn't a form file.", problems: 0 };

  if (typeof parsed.format === "string" && parsed.format !== FORM_FILE_FORMAT) {
    return { error: `Unknown file type "${parsed.format}".`, problems: 0 };
  }
  if (typeof parsed.version === "number" && parsed.version > FORM_FILE_VERSION) {
    return { error: "This form file was made by a newer version of the app. Refresh and try again.", problems: 0 };
  }

  const structure = (isObject(parsed.structure) ? parsed.structure : parsed) as Record<string, unknown>;
  if (!Array.isArray(structure.sections)) {
    return { error: "This file has no form sections.", problems: 0 };
  }
  const badSection = structure.sections.findIndex(
    (section) =>
      !isObject(section) || typeof section.id !== "string" || !section.id || typeof section.componentType !== "string",
  );
  if (badSection >= 0) {
    return { error: `Section ${badSection + 1} in the file is damaged (no id or component type).`, problems: 0 };
  }

  const settings = isObject(structure.settings) ? structure.settings : {};
  const cleanStructure = {
    ...structure,
    settings: {
      includePassFail: true,
      includeJobInfo: true,
      includePrintHeader: true,
      ...settings,
    },
  } as unknown as CustomFormStructure;

  const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Imported form";
  const text_ = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  const report = validateTemplateDraft(cleanStructure);

  return {
    form: {
      name,
      description: text_(parsed.description),
      netaSection: text_(parsed.netaSection ?? parsed.neta_section),
      structure: cleanStructure,
    },
    problems: report.issues.length,
  };
}
