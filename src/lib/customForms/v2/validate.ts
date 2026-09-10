/**
 * V2 document validation.
 *
 * The failures this catches are the ones V1 could not: a merged cell that
 * overlaps its neighbour, a header row that leaves a column uncovered, a
 * condition pointing at a setting that does not exist, a binding naming
 * something outside the registry. All of them render as silently wrong tables
 * rather than as errors, so the compiler has to find them before publication.
 */

import type { TemplateIssue } from "../compile";
import { resolveGrid, implicitHeaderRow } from "./grid";
import { conditionRefs } from "./conditions";
import { isKnownBinding } from "./bindings";
import {
  allSections,
  isLayoutBlock,
  isSectionBlock,
  sectionTable,
  walkBlocks,
  type BlockV2,
  type CellV2,
  type ConditionV2,
  type DocumentV2,
  type SectionBlockV2,
  type TableV2,
  type ValueRefV2,
} from "./schema";

interface Index {
  sectionIds: Set<string>;
  settingsBySection: Map<string, Set<string>>;
  fieldsBySection: Map<string, Set<string>>;
  tables: Map<string, TableV2>;
  columnsByTable: Map<string, Set<string>>;
}

function buildIndex(document: DocumentV2): Index {
  const index: Index = {
    sectionIds: new Set(),
    settingsBySection: new Map(),
    fieldsBySection: new Map(),
    tables: new Map(),
    columnsByTable: new Map(),
  };

  for (const section of allSections(document)) {
    index.sectionIds.add(section.id);
    index.settingsBySection.set(
      section.id,
      new Set((section.settings ?? []).map((s) => s.id)),
    );

    const fieldIds = new Set<string>();
    const content = section.content;
    if (content.kind === "fields") {
      content.fields.forEach((f) => fieldIds.add(f.id));
    } else if (content.kind === "field") {
      fieldIds.add(content.field.id);
    } else if (content.kind === "checklist") {
      content.items.forEach((item) => fieldIds.add(item.id));
    } else if (content.kind === "table") {
      content.table.aboveFields?.forEach((f) => fieldIds.add(f.id));
      index.tables.set(content.table.id, content.table);
      index.columnsByTable.set(
        content.table.id,
        new Set(content.table.columns.map((c) => c.id)),
      );
    } else if (content.kind === "signatures") {
      content.roles.forEach((role) => fieldIds.add(role.id));
    }
    index.fieldsBySection.set(section.id, fieldIds);
  }

  return index;
}

function validateRef(
  ref: ValueRefV2,
  index: Index,
  issues: TemplateIssue[],
  where: string,
  sectionId?: string,
) {
  switch (ref.scope) {
    case "field": {
      if (!index.sectionIds.has(ref.sectionId)) {
        issues.push({
          severity: "error",
          code: "condition.unknownSection",
          message: `${where} reads section "${ref.sectionId}", which does not exist.`,
          sectionId,
        });
        return;
      }
      if (!index.fieldsBySection.get(ref.sectionId)?.has(ref.fieldId)) {
        issues.push({
          severity: "error",
          code: "condition.unknownField",
          message: `${where} reads field "${ref.fieldId}", which section "${ref.sectionId}" does not have.`,
          sectionId,
        });
      }
      return;
    }

    case "setting": {
      const settings = index.settingsBySection.get(ref.sectionId);
      if (!settings) {
        issues.push({
          severity: "error",
          code: "condition.unknownSection",
          message: `${where} reads section "${ref.sectionId}", which does not exist.`,
          sectionId,
        });
        return;
      }
      if (!settings.has(ref.settingId)) {
        issues.push({
          severity: "error",
          code: "condition.unknownSetting",
          message: `${where} reads setting "${ref.settingId}", which section "${ref.sectionId}" does not have.`,
          sectionId,
        });
      }
      return;
    }

    case "cell": {
      const columns = index.columnsByTable.get(ref.tableId);
      if (!columns) {
        issues.push({
          severity: "error",
          code: "condition.unknownTable",
          message: `${where} reads table "${ref.tableId}", which does not exist.`,
          sectionId,
        });
        return;
      }
      if (!columns.has(ref.columnId)) {
        issues.push({
          severity: "error",
          code: "condition.unknownColumn",
          message: `${where} reads column "${ref.columnId}", which table "${ref.tableId}" does not have.`,
          sectionId,
        });
      }
      return;
    }

    case "binding": {
      if (!isKnownBinding(ref.bindingId)) {
        issues.push({
          severity: "error",
          code: "binding.unknown",
          message: `${where} reads binding "${ref.bindingId}", which is not in the binding registry.`,
          sectionId,
        });
      }
      return;
    }
  }
}

function validateConditions(
  node: {
    visibleWhen?: ConditionV2;
    printWhen?: ConditionV2;
    requiredWhen?: ConditionV2;
    readOnlyWhen?: ConditionV2;
  },
  index: Index,
  issues: TemplateIssue[],
  where: string,
  sectionId?: string,
) {
  for (const condition of [
    node.visibleWhen,
    node.printWhen,
    node.requiredWhen,
    node.readOnlyWhen,
  ]) {
    for (const ref of conditionRefs(condition)) {
      validateRef(ref, index, issues, where, sectionId);
    }
  }
}

/**
 * Every region of a table, laid onto its grid. This is the check that catches
 * merged cells silently pushing a column out of alignment.
 */
function validateTableGrid(
  table: TableV2,
  section: SectionBlockV2,
  issues: TemplateIssue[],
) {
  const columns = table.columns;
  if (columns.length === 0) {
    issues.push({
      severity: "error",
      code: "table.noColumns",
      message: `Table in "${section.title}" has no columns.`,
      sectionId: section.id,
    });
    return;
  }

  const header = table.header.length > 0 ? table.header : [implicitHeaderRow(columns)];
  const headerGrid = resolveGrid(header, columns, { regionLabel: "header" });
  for (const problem of headerGrid.problems) {
    issues.push({
      severity: "error",
      code: problem.code,
      message: `"${section.title}": ${problem.message}`,
      sectionId: section.id,
    });
  }

  // Literal body rows are validated one at a time: each is its own grid,
  // because a row span between two fixed rows would be a different report.
  const literalRows = table.body.filter(
    (entry): entry is Extract<typeof entry, { cells: CellV2[] }> =>
      "cells" in entry && Array.isArray((entry as any).cells),
  );
  if (literalRows.length > 0) {
    const bodyGrid = resolveGrid(
      literalRows.map((row) => ({ id: row.id, cells: row.cells })),
      columns,
      { regionLabel: "body" },
    );
    for (const problem of bodyGrid.problems) {
      issues.push({
        severity: "error",
        code: problem.code,
        message: `"${section.title}": ${problem.message}`,
        sectionId: section.id,
      });
    }
  }

  if (table.footer.length > 0) {
    const footerGrid = resolveGrid(table.footer, columns, {
      regionLabel: "footer",
    });
    for (const problem of footerGrid.problems) {
      issues.push({
        severity: "error",
        code: problem.code,
        message: `"${section.title}": ${problem.message}`,
        sectionId: section.id,
      });
    }
  }

  // Row policies have to be satisfiable.
  for (const entry of table.body) {
    if (entry.kind !== "records") continue;
    const { min, max, initial } = entry.policy;
    if (min > max) {
      issues.push({
        severity: "error",
        code: "rows.impossibleBounds",
        message: `"${section.title}" allows a minimum of ${min} rows and a maximum of ${max}.`,
        sectionId: section.id,
      });
    }
    const rowsPerRecord = entry.policy.rowsPerRecord ?? 1;
    if (!Number.isInteger(rowsPerRecord) || rowsPerRecord < 1) {
      issues.push({
        severity: "error",
        code: "rows.badRowsPerRecord",
        message: `"${section.title}" says a record is ${rowsPerRecord} rows; it has to be a whole number of at least 1.`,
        sectionId: section.id,
      });
    }
    const columnIds = new Set(table.columns.map((c) => c.id));
    for (const columnId of entry.policy.spanningColumns ?? []) {
      if (!columnIds.has(columnId)) {
        issues.push({
          severity: "error",
          code: "rows.unknownSpanningColumn",
          message: `"${section.title}" spans column "${columnId}" across each record, but the table has no such column.`,
          sectionId: section.id,
        });
      }
    }
    if (initial < min || initial > max) {
      issues.push({
        severity: "warning",
        code: "rows.outsideBounds",
        message: `"${section.title}" starts with ${initial} rows, outside its ${min} to ${max} range.`,
        sectionId: section.id,
      });
    }
  }
}

function checkUnique(
  ids: Iterable<string | undefined>,
  code: string,
  what: string,
  issues: TemplateIssue[],
  sectionId?: string,
) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) {
      issues.push({
        severity: "error",
        code: `${code}.missing`,
        message: `A ${what} has no id. Every ${what} needs a stable id.`,
        sectionId,
      });
      continue;
    }
    if (seen.has(id)) {
      issues.push({
        severity: "error",
        code: `${code}.duplicate`,
        message: `${what} id "${id}" is used more than once.`,
        sectionId,
        fieldId: id,
      });
    }
    seen.add(id);
  }
}

/** Validate a V2 document. Errors block publication; warnings do not. */
export function validateDocumentV2(document: DocumentV2): TemplateIssue[] {
  const issues: TemplateIssue[] = [];

  if (!Array.isArray(document.blocks)) {
    return [
      {
        severity: "error",
        code: "document.noBlocks",
        message: "Document has no blocks array.",
      },
    ];
  }

  const blocks = walkBlocks(document.blocks);
  checkUnique(
    blocks.map((b) => b.id),
    "block",
    "block",
    issues,
  );

  const index = buildIndex(document);

  for (const block of blocks) {
    if (isLayoutBlock(block)) {
      validateConditions(block, index, issues, `Layout "${block.id}"`);
      if (block.kind === "grid" && (!block.columns || block.columns < 1)) {
        issues.push({
          severity: "error",
          code: "layout.badColumnCount",
          message: `Grid layout "${block.id}" needs a column count of at least 1.`,
        });
      }
      if (
        block.kind === "side-by-side" &&
        block.widths &&
        block.widths.length !== block.children.length
      ) {
        issues.push({
          severity: "warning",
          code: "layout.widthMismatch",
          message: `Side-by-side layout "${block.id}" declares ${block.widths.length} widths for ${block.children.length} children.`,
        });
      }
      continue;
    }

    if (!isSectionBlock(block)) continue;
    const section = block;
    const where = `Section "${section.title || section.id}"`;
    validateConditions(section, index, issues, where, section.id);

    checkUnique(
      (section.settings ?? []).map((s) => s.id),
      "setting",
      "setting",
      issues,
      section.id,
    );

    const content = section.content;
    if (content.kind === "fields") {
      checkUnique(
        content.fields.map((f) => f.id),
        "field",
        "field",
        issues,
        section.id,
      );
      for (const field of content.fields) {
        validateConditions(
          field,
          index,
          issues,
          `${where} field "${field.label || field.id}"`,
          section.id,
        );
        validateBinding(field.binding?.bindingId, issues, where, section.id);
      }
      if (content.columns < 1) {
        issues.push({
          severity: "error",
          code: "fields.badColumnCount",
          message: `${where} lays fields out in ${content.columns} columns.`,
          sectionId: section.id,
        });
      }
    }

    if (content.kind === "field") {
      validateConditions(
        content.field,
        index,
        issues,
        `${where} field`,
        section.id,
      );
      validateBinding(
        content.field.binding?.bindingId,
        issues,
        where,
        section.id,
      );
    }

    if (content.kind === "checklist") {
      checkUnique(
        content.items.map((i) => i.id),
        "item",
        "checklist item",
        issues,
        section.id,
      );
    }

    const table = sectionTable(section);
    if (table) {
      checkUnique(
        table.columns.map((c) => c.id),
        "column",
        "column",
        issues,
        section.id,
      );
      checkUnique(
        table.body.map((r) => r.id),
        "row",
        "row",
        issues,
        section.id,
      );
      checkUnique(
        table.header.map((r) => r.id),
        "headerRow",
        "header row",
        issues,
        section.id,
      );

      validateTableGrid(table, section, issues);

      for (const column of table.columns) {
        validateConditions(
          column,
          index,
          issues,
          `${where} column "${column.label || column.id}"`,
          section.id,
        );
      }
      for (const entry of table.body) {
        validateConditions(
          entry,
          index,
          issues,
          `${where} row "${entry.id}"`,
          section.id,
        );
        if ("cells" in entry && Array.isArray(entry.cells)) {
          for (const cell of entry.cells) {
            validateConditions(
              cell,
              index,
              issues,
              `${where} cell "${cell.id}"`,
              section.id,
            );
            validateBinding(
              cell.binding?.bindingId,
              issues,
              where,
              section.id,
            );
          }
        }
      }
      for (const field of table.aboveFields ?? []) {
        validateBinding(field.binding?.bindingId, issues, where, section.id);
      }
      validateUnits(table, section, issues);
    }
  }

  return issues;
}

function validateBinding(
  bindingId: string | undefined,
  issues: TemplateIssue[],
  where: string,
  sectionId?: string,
) {
  if (!bindingId) return;
  if (!isKnownBinding(bindingId)) {
    issues.push({
      severity: "error",
      code: "binding.unknown",
      message: `${where} binds to "${bindingId}", which is not in the binding registry.`,
      sectionId,
    });
  }
}

function validateUnits(
  table: TableV2,
  section: SectionBlockV2,
  issues: TemplateIssue[],
) {
  const check = (
    units: { options: string[]; default?: string; scope: string } | undefined,
    label: string,
  ) => {
    if (!units) return;
    if (units.options.length === 0) {
      issues.push({
        severity: "error",
        code: "units.noOptions",
        message: `${label} in "${section.title}" declares units with no options.`,
        sectionId: section.id,
      });
      return;
    }
    if (units.default && !units.options.includes(units.default)) {
      issues.push({
        severity: "error",
        code: "units.badDefault",
        message: `${label} in "${section.title}" defaults to "${units.default}", which is not one of its unit options.`,
        sectionId: section.id,
      });
    }
  };

  check(table.units, "The table");
  for (const column of table.columns) {
    check(column.units, `Column "${column.label || column.id}"`);
  }

  if (table.units?.scope === "table" && table.columns.some((c) => c.units)) {
    issues.push({
      severity: "warning",
      code: "units.conflictingScope",
      message: `"${section.title}" has both a table-level unit selector and column-level ones; the column selectors win.`,
      sectionId: section.id,
    });
  }
}

/** Blocks in a document, for callers that want the flat list. */
export function documentBlocks(document: DocumentV2): BlockV2[] {
  return walkBlocks(document.blocks);
}
