/**
 * Template compiler and validator.
 *
 * Two jobs:
 *
 *  - `validateTemplateDraft` runs while editing. It reports problems without
 *    blocking a save, because a half-built draft is normal.
 *  - `compileTemplate` is the publication gate. It normalises defaults and
 *    refuses to produce a payload when the template has errors, so an
 *    immutable version can never be published broken.
 *
 * Phase 0 scope: stable identity, structural sanity, reference resolution and
 * settings. The typed expression engine, lookup tables and rule packs arrive in
 * phase 3 and extend `validateFormulaReferences`.
 */

import {
  ComponentType,
  type CustomFormStructure,
  type CustomFormTemplate,
  type SectionConfig,
} from "@/lib/types/customForms";
import { classifySection } from "./runtime/sectionKind";
import { resolveRowCount } from "./runtime/layout";
import { getSectionReferenceCode } from "./formCellResolution";
import { documentFromV1 } from "./v2/fromV1";
import { validateDocumentV2 } from "./v2/validate";
import { compileFormExpressions } from "@/lib/customForms/expressions/form-program";

export type IssueSeverity = "error" | "warning";

export interface TemplateIssue {
  severity: IssueSeverity;
  /** Machine-readable, so the UI can group and the tests can assert. */
  code: string;
  message: string;
  sectionId?: string;
  fieldId?: string;
}

export interface ValidationReport {
  issues: TemplateIssue[];
  errors: TemplateIssue[];
  warnings: TemplateIssue[];
  ok: boolean;
}

const KNOWN_COMPONENT_TYPES = new Set<string>(Object.values(ComponentType));

/** `{Code.path}` references inside a formula string. */
const REFERENCE_PATTERN = /\{([^{}]+)\}/g;

function report(issues: TemplateIssue[]): ValidationReport {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { issues, errors, warnings, ok: errors.length === 0 };
}

function pushDuplicate(
  issues: TemplateIssue[],
  seen: Set<string>,
  id: string | undefined,
  code: string,
  what: string,
  sectionId?: string,
) {
  if (!id) {
    issues.push({
      severity: "error",
      code: `${code}.missing`,
      message: `${what} has no id. Every ${what.toLowerCase()} needs a stable id.`,
      sectionId,
    });
    return;
  }
  if (seen.has(id)) {
    issues.push({
      severity: "error",
      code: `${code}.duplicate`,
      message: `${what} id "${id}" is used more than once. Ids must be unique and stable.`,
      sectionId,
      fieldId: id,
    });
    return;
  }
  seen.add(id);
}

/** Every reference code a formula can address, and the fields under it. */
function buildReferenceIndex(sections: SectionConfig[]) {
  const byCode = new Map<string, SectionConfig>();
  for (const section of sections) {
    byCode.set(getSectionReferenceCode(section), section);
  }
  return byCode;
}

function sectionFieldIds(section: SectionConfig): Set<string> {
  const ids = new Set<string>();
  section.fields?.forEach((f) => ids.add(f.id));
  section.aboveTableFields?.forEach((f) => ids.add(f.id));
  section.settingFields?.forEach((f) => ids.add(f.id));
  section.checklistItems?.forEach((item) => ids.add(item.id));
  if (section.field) ids.add(section.field.id);
  section.columns?.forEach((col) => {
    ids.add(col.id);
    if (col.field?.id) ids.add(col.field.id);
  });
  // Job info derives these; they are addressable but not declared as fields.
  if (section.componentType === ComponentType.JOB_INFO) {
    ids.add("temperature");
    ids.add("temperatureCelsius");
    ids.add("tcf");
    ids.add("TCF");
    ids.add("humidity");
  }
  return ids;
}

/**
 * Check one `{...}` path. Accepts `Code.fieldId`, `Code.C1`, `Code.C1.R2`.
 */
function validateReference(
  path: string,
  index: Map<string, SectionConfig>,
  issues: TemplateIssue[],
  sectionId: string,
) {
  const parts = path.trim().split(".");
  if (parts.length < 2) {
    issues.push({
      severity: "error",
      code: "formula.unparseable",
      message: `Reference {${path}} is not in the form {Code.field} or {Code.C1.R2}.`,
      sectionId,
    });
    return;
  }
  const [code, ...rest] = parts;
  const target = index.get(code);
  if (!target) {
    issues.push({
      severity: "error",
      code: "formula.unknownSection",
      message: `Reference {${path}} points at "${code}", which is not a section in this template.`,
      sectionId,
    });
    return;
  }

  const columnMatch = /^C(\d+)$/i.exec(rest[0]);
  if (columnMatch) {
    const columnNumber = Number(columnMatch[1]);
    const columnCount = target.columns?.length ?? 0;
    if (columnNumber < 1 || columnNumber > columnCount) {
      issues.push({
        severity: "error",
        code: "formula.columnOutOfRange",
        message: `Reference {${path}} asks for column ${columnNumber} of "${target.title || code}", which has ${columnCount}.`,
        sectionId,
      });
      return;
    }
    const rowPart = rest[1];
    if (rowPart) {
      const rowMatch = /^R(\d+)$/i.exec(rowPart);
      if (!rowMatch) {
        issues.push({
          severity: "error",
          code: "formula.unparseable",
          message: `Reference {${path}} has "${rowPart}" where a row like R2 was expected.`,
          sectionId,
        });
        return;
      }
      const rowNumber = Number(rowMatch[1]);
      const rowCount =
        classifySection(target) === "conditional-table"
          ? (target.conditionalRows?.length ?? 0)
          : resolveRowCount(target);
      if (rowNumber < 1 || rowNumber > rowCount) {
        issues.push({
          severity: "warning",
          code: "formula.rowOutOfRange",
          message: `Reference {${path}} asks for row ${rowNumber} of "${target.title || code}", which currently has ${rowCount}. It will resolve as blank until a row is added.`,
          sectionId,
        });
      }
    }
    return;
  }

  const fieldId = rest.join(".");
  if (!sectionFieldIds(target).has(fieldId)) {
    issues.push({
      severity: "error",
      code: "formula.unknownField",
      message: `Reference {${path}} points at "${fieldId}", which "${target.title || code}" does not have.`,
      sectionId,
    });
  }
}

function validateFormulaReferences(
  structure: CustomFormStructure,
  issues: TemplateIssue[],
) {
  const index = buildReferenceIndex(structure.sections);

  const check = (formula: string | undefined, sectionId: string) => {
    if (!formula) return;
    REFERENCE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = REFERENCE_PATTERN.exec(formula)) !== null) {
      validateReference(match[1], index, issues, sectionId);
    }
  };

  for (const section of structure.sections) {
    Object.values(section.cellFormulas ?? {}).forEach((formula) =>
      check(formula, section.id),
    );
    section.columns?.forEach((col) =>
      check(col.field?.calculation?.formula, section.id),
    );
    section.fields?.forEach((field) =>
      check(field.calculation?.formula, section.id),
    );
    check(section.field?.calculation?.formula, section.id);
  }
}

/** Cell formula keys must name a row that exists and a column that exists. */
function validateCellKeys(section: SectionConfig, issues: TemplateIssue[]) {
  const columnIds = new Set((section.columns ?? []).map((c) => c.id));
  const rowCount =
    classifySection(section) === "conditional-table"
      ? (section.conditionalRows?.length ?? 0)
      : resolveRowCount(section);

  const checkKeys = (map: Record<string, string> | undefined, what: string) => {
    for (const key of Object.keys(map ?? {})) {
      const match = /^row(\d+)_(.+)$/.exec(key);
      if (!match) {
        issues.push({
          severity: "error",
          code: "cellKey.unparseable",
          message: `${what} key "${key}" in "${section.title}" is not of the form row{N}_{columnId}.`,
          sectionId: section.id,
        });
        continue;
      }
      const rowIndex = Number(match[1]);
      const colId = match[2];
      if (!columnIds.has(colId)) {
        issues.push({
          severity: "error",
          code: "cellKey.unknownColumn",
          message: `${what} key "${key}" in "${section.title}" names column "${colId}", which does not exist.`,
          sectionId: section.id,
        });
      }
      if (rowIndex >= rowCount) {
        issues.push({
          severity: "warning",
          code: "cellKey.orphanRow",
          message: `${what} key "${key}" in "${section.title}" is for row ${rowIndex + 1}, past the current ${rowCount}. It is kept but unused.`,
          sectionId: section.id,
        });
      }
    }
  };

  checkKeys(section.cellFormulas, "Cell formula");
  checkKeys(section.staticCells, "Static cell");
}

function validateSection(section: SectionConfig, issues: TemplateIssue[]) {
  if (!KNOWN_COMPONENT_TYPES.has(section.componentType)) {
    issues.push({
      severity: "error",
      code: "section.unknownComponent",
      message: `Section "${section.title || section.id}" uses component type "${section.componentType}", which the runtime does not know.`,
      sectionId: section.id,
    });
  }

  const kind = classifySection(section);
  if (kind === "empty") {
    issues.push({
      severity: "warning",
      code: "section.empty",
      message: `Section "${section.title || section.id}" has no columns, fields or checklist items, so it renders nothing.`,
      sectionId: section.id,
    });
  }

  // Ids inside a section must be unique per collection.
  const columnIds = new Set<string>();
  section.columns?.forEach((col) =>
    pushDuplicate(issues, columnIds, col.id, "column", "Column", section.id),
  );
  const fieldIds = new Set<string>();
  section.fields?.forEach((field) =>
    pushDuplicate(issues, fieldIds, field.id, "field", "Field", section.id),
  );
  const settingIds = new Set<string>();
  section.settingFields?.forEach((setting) =>
    pushDuplicate(issues, settingIds, setting.id, "setting", "Setting", section.id),
  );
  const rowIds = new Set<string>();
  section.conditionalRows?.forEach((row) =>
    pushDuplicate(issues, rowIds, row.id, "row", "Row", section.id),
  );
  const checklistIds = new Set<string>();
  section.checklistItems?.forEach((item) =>
    pushDuplicate(issues, checklistIds, item.id, "item", "Checklist item", section.id),
  );

  // A conditional row pinned to a setting value nobody can choose never shows.
  const settingsById = new Map(
    (section.settingFields ?? []).map((setting) => [setting.id, setting]),
  );
  section.conditionalRows?.forEach((row) => {
    for (const [settingId, allowed] of Object.entries(row.visibleWhen ?? {})) {
      const setting = settingsById.get(settingId);
      if (!setting) {
        issues.push({
          severity: "error",
          code: "conditional.unknownSetting",
          message: `Row "${row.label}" in "${section.title}" is conditioned on setting "${settingId}", which this section does not have.`,
          sectionId: section.id,
        });
        continue;
      }
      const values = Array.isArray(allowed) ? allowed : [allowed];
      const options = new Set(setting.options.map((o) => o.value));
      for (const value of values) {
        if (!options.has(value)) {
          issues.push({
            severity: "warning",
            code: "conditional.unreachableValue",
            message: `Row "${row.label}" in "${section.title}" only shows when "${setting.label}" is "${value}", which is not one of its options, so the row never appears.`,
            sectionId: section.id,
          });
        }
      }
    }
  });

  // Row bounds have to be satisfiable.
  const rows = resolveRowCount(section);
  const min = section.minRows ?? 1;
  const max = section.maxRows ?? 100;
  if (min > max) {
    issues.push({
      severity: "error",
      code: "rows.impossibleBounds",
      message: `"${section.title}" has a minimum of ${min} rows and a maximum of ${max}.`,
      sectionId: section.id,
    });
  }
  if (kind === "table" || kind === "contact-resistance") {
    if (rows < min || rows > max) {
      issues.push({
        severity: "warning",
        code: "rows.outsideBounds",
        message: `"${section.title}" starts with ${rows} rows, outside its ${min} to ${max} range.`,
        sectionId: section.id,
      });
    }
  }

  // A populate binding has to point somewhere.
  section.columns?.forEach((col) => {
    const from = col.field?.populateFrom;
    if (col.field?.cellBehavior === "populate" && !from?.sectionId) {
      issues.push({
        severity: "error",
        code: "binding.incomplete",
        message: `Column "${col.label}" in "${section.title}" is set to copy a value but has no source field.`,
        sectionId: section.id,
        fieldId: col.id,
      });
    }
  });

  validateCellKeys(section, issues);
}

function validateSettings(
  structure: CustomFormStructure,
  issues: TemplateIssue[],
) {
  const settings = structure.settings;
  if (!settings) {
    issues.push({
      severity: "warning",
      code: "settings.missing",
      message:
        "Template has no settings block. Print header, pass/fail and page breaks fall back to their defaults.",
    });
    return;
  }
  const allowed = new Set([
    "includePassFail",
    "includeJobInfo",
    "includePrintHeader",
    "pageBreakAfterSection",
  ]);
  for (const key of Object.keys(settings)) {
    if (!allowed.has(key)) {
      issues.push({
        severity: "warning",
        code: "settings.unsupported",
        message: `Setting "${key}" is stored but nothing reads it.`,
      });
    }
  }
  if (settings.includeJobInfo) {
    const hasJobInfo = structure.sections.some(
      (s) => s.componentType === ComponentType.JOB_INFO,
    );
    if (!hasJobInfo) {
      issues.push({
        severity: "warning",
        code: "settings.jobInfoMissing",
        message:
          'Settings ask for job information but the template has no Job Info section.',
      });
    }
  }
}

/** Validation for a draft in the builder. Never blocks saving. */
export function validateTemplateDraft(
  structure: CustomFormStructure,
): ValidationReport {
  const issues: TemplateIssue[] = [];

  if (!structure?.sections) {
    return report([
      {
        severity: "error",
        code: "structure.missing",
        message: "Template has no sections array.",
      },
    ]);
  }

  const sectionIds = new Set<string>();
  const referenceCodes = new Map<string, string>();
  for (const section of structure.sections) {
    pushDuplicate(issues, sectionIds, section.id, "section", "Section");

    const code = getSectionReferenceCode(section);
    const owner = referenceCodes.get(code);
    if (owner && owner !== section.id) {
      issues.push({
        severity: "error",
        code: "section.duplicateReferenceCode",
        message: `Sections "${owner}" and "${section.title}" both answer to the formula code "${code}". Give one of them a different reference code.`,
        sectionId: section.id,
      });
    } else {
      referenceCodes.set(code, section.title || section.id);
    }

    validateSection(section, issues);
  }

  if (structure.expressions === undefined) validateFormulaReferences(structure, issues);
  const expressions = compileFormExpressions(structure);
  if (!expressions.ok) {
    issues.push(...expressions.issues.map((entry) => ({
      severity: "error" as const,
      code: `expression.${entry.code}`,
      // Carry the character range so the builder can point at the part of the
      // formula that is wrong, not just the calculation it belongs to.
      message:
        entry.end > entry.start
          ? `${entry.message} (characters ${entry.start + 1}-${entry.end})`
          : entry.message,
      fieldId: entry.calculationId ?? entry.referenceId,
    })));
  }
  validateSettings(structure, issues);

  // The V2 pass is where merged-cell and binding problems surface. Running it
  // on the adapted document means a V1 template gets the same checks a V2 one
  // does, which is how an overlapping span stops being invisible.
  issues.push(...validateDocumentV2(documentFromV1(structure)));

  return report(dedupeIssues(issues));
}

/** The V1 and V2 passes overlap on identity checks; report each problem once. */
function dedupeIssues(issues: TemplateIssue[]): TemplateIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${issue.sectionId ?? ""}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

/** Fill in the defaults a version payload is expected to carry explicitly. */
export function normalizeStructure(
  structure: CustomFormStructure,
): CustomFormStructure {
  return {
    ...(structure.expressions !== undefined ? { expressions: structuredClone(structure.expressions) } : {}),
    settings: {
      includePassFail: structure.settings?.includePassFail !== false,
      includeJobInfo: structure.settings?.includeJobInfo !== false,
      includePrintHeader: structure.settings?.includePrintHeader !== false,
      pageBreakAfterSection:
        structure.settings?.pageBreakAfterSection === true,
    },
    sections: [...structure.sections]
      .sort((a, b) => a.order - b.order)
      .map((section, index) => ({
        ...section,
        order: index,
        showInPrint: section.showInPrint !== false,
      })),
  };
}

export interface CompileResult {
  ok: boolean;
  report: ValidationReport;
  /** Only present when `ok`. This is what gets frozen into a version. */
  structure?: CustomFormStructure;
}

/**
 * The publication gate. A template version cannot be created unless this
 * returns `ok`.
 */
export function compileTemplate(
  template: Pick<CustomFormTemplate, "name" | "structure">,
): CompileResult {
  const issues: TemplateIssue[] = [];
  if (!template.name?.trim()) {
    issues.push({
      severity: "error",
      code: "template.nameRequired",
      message: "A template needs a name before it can be published.",
    });
  }
  if (!template.structure?.sections?.length) {
    issues.push({
      severity: "error",
      code: "template.noSections",
      message: "A template needs at least one section before it can be published.",
    });
  }

  const normalized = template.structure?.sections
    ? normalizeStructure(template.structure)
    : template.structure;

  const draftReport = normalized
    ? validateTemplateDraft(normalized)
    : { issues: [], errors: [], warnings: [], ok: true };

  const combined = report([...issues, ...draftReport.issues]);
  return combined.ok
    ? { ok: true, report: combined, structure: normalized }
    : { ok: false, report: combined };
}

// ---------------------------------------------------------------------------
// Instance structure validation
// ---------------------------------------------------------------------------

export interface InstanceIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  sectionId?: string;
  fieldId?: string;
}

/**
 * Structural validation for a draft save. It rejects corrupt state and reports
 * missing required fields without blocking the save, per section 12.3.
 */
export function validateInstanceStructure(
  runtime: Record<string, any>,
  structure: CustomFormStructure,
): { issues: InstanceIssue[]; corrupt: boolean; missingRequired: string[] } {
  const issues: InstanceIssue[] = [];
  const missingRequired: string[] = [];
  let corrupt = false;

  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    return {
      issues: [
        {
          severity: "error",
          code: "instance.notAnObject",
          message: "Form data is not an object.",
        },
      ],
      corrupt: true,
      missingRequired,
    };
  }

  for (const [key, value] of Object.entries(runtime)) {
    if (value === null || value === undefined) continue;
    if (typeof value !== "object" || Array.isArray(value)) {
      corrupt = true;
      issues.push({
        severity: "error",
        code: "instance.badStateKey",
        message: `Form data at "${key}" is a ${Array.isArray(value) ? "array" : typeof value}; every entry must be a field map.`,
      });
    }
  }

  const isBlank = (value: unknown) =>
    value === undefined || value === null || value === "";

  for (const section of structure.sections) {
    for (const field of section.fields ?? []) {
      if (!field.required) continue;
      if (isBlank(runtime[section.id]?.[field.id])) {
        missingRequired.push(`${section.title}: ${field.label}`);
      }
    }
    if (section.field?.required && isBlank(runtime[section.id]?.[section.field.id])) {
      missingRequired.push(`${section.title}: ${section.field.label}`);
    }
  }

  if (missingRequired.length > 0) {
    issues.push({
      severity: "warning",
      code: "instance.missingRequired",
      message: `${missingRequired.length} required field${missingRequired.length === 1 ? "" : "s"} not filled in.`,
    });
  }

  return { issues, corrupt, missingRequired };
}
