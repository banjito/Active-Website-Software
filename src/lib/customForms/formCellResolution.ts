/**
 * Resolve "Populate from field" and "Calculate from formula" for custom form table cells.
 * Supports friendly refs like {IR.C1.R2} (Insulation resistance, column 1, row 2).
 */

import type { FieldConfig, SectionConfig } from '@/lib/types/customForms';

/** Abbreviate section title to a short code, e.g. "Insulation Resistance" -> "IR", "Job Details" -> "Job" */
function abbreviateTitle(title: string): string {
  if (!title || !title.trim()) return 'S';
  const words = title.trim().split(/[\s\-/]+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
  return (words[0]?.slice(0, 3) || 'S').toUpperCase();
}

/** Get the reference code for a section (e.g. IR, Job). Used in formulas as {IR.C1.R2}. */
export function getSectionReferenceCode(section: SectionConfig): string {
  if (section.referenceCode && section.referenceCode.trim()) {
    return section.referenceCode.trim().replace(/\s+/g, '');
  }
  return abbreviateTitle(section.title || '');
}

/**
 * Human-readable description for a reference path, e.g.:
 * "IR.C1.R2" → "Insulation resistance, column 1, row 2"
 * "IR.C1" → "Insulation resistance, column 1 (same row)"
 * "Job.temperature" → "Job information » Temperature"
 */
export function getReferenceDescription(path: string, sections: SectionConfig[]): string {
  const parts = path.trim().split('.').filter(Boolean);
  if (parts.length === 0) return '';
  const codeOrId = parts[0];
  const sec = sections.find(
    (s) => getSectionReferenceCode(s) === codeOrId || s.id === codeOrId
  );
  const sectionTitle = sec?.title?.trim() || codeOrId;
  const firstWord = sectionTitle.split(/[\s\-/]+/)[0] || sectionTitle;
  const rest = sectionTitle.slice(firstWord.length).trim();
  const readableSection =
    rest.length > 0
      ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase() + ' ' + rest
      : firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();

  if (parts.length === 1) return readableSection;
  if (parts.length === 2) {
    const second = parts[1];
    const cMatch = second.match(/^C(\d+)$/i);
    if (cMatch && (sec?.columns?.[parseInt(cMatch[1], 10) - 1] != null)) {
      return `${readableSection}, column ${cMatch[1]} (same row)`;
    }
    if (cMatch) return `${readableSection}, column ${cMatch[1]} (same row)`;
    const field = sec?.fields?.find((f) => f.id === second) ?? sec?.field?.id === second ? sec.field : null;
    const fieldLabel = field && 'label' in field ? (field as { label?: string }).label : second;
    return `${readableSection} » ${fieldLabel || second}`;
  }
  if (parts.length === 3) {
    const [, b, c] = parts;
    const cMatch = b.match(/^C(\d+)$/i);
    const rMatch = c?.match(/^R(\d+)$/i);
    if (cMatch && rMatch) {
      return `${readableSection}, column ${cMatch[1]}, row ${rMatch[1]}`;
    }
    if (b === 'sameRow') {
      const field = sec?.fields?.find((f) => f.id === c) ?? (sec?.field?.id === c ? sec.field : null);
      const fieldLabel = field && 'label' in field ? (field as { label?: string }).label : c;
      return `${readableSection} » ${fieldLabel || c} (same row)`;
    }
    if (b === 'row0') {
      const field = sec?.fields?.find((f) => f.id === c) ?? (sec?.field?.id === c ? sec.field : null);
      const fieldLabel = field && 'label' in field ? (field as { label?: string }).label : c;
      return `${readableSection} » ${fieldLabel || c} (row 1)`;
    }
  }
  return path;
}

/** Get value from formData for a given section/field/row */
function getValueAt(
  formData: Record<string, Record<string, any>>,
  sectionId: string,
  fieldId: string,
  rowIndex?: number
): any {
  if (!formData || typeof formData !== 'object') return '';
  const key = rowIndex != null ? `${sectionId}_row${rowIndex}` : sectionId;
  const row = formData[key];
  if (row == null || typeof row !== 'object') return '';
  let v = row[fieldId];
  // Job Details stores TCF as 'tcf'; accept {JD.TCF} or {JD.tcf}
  if ((v === undefined || v === null) && fieldId.toUpperCase() === 'TCF') {
    v = row['tcf'];
  }
  return v !== undefined && v !== null ? v : '';
}

/** Resolve value when field has populateFrom (copy from another field) */
export function getPopulatedValue(
  formData: Record<string, Record<string, any>>,
  populateFrom: { sectionId: string; fieldId: string; rowMode?: 'same' | 'first'; rowIndex?: number },
  currentRowIndex: number
): any {
  let rowIndex: number | undefined;
  if (populateFrom.rowIndex != null) {
    rowIndex = populateFrom.rowIndex;
  } else if (populateFrom.rowMode === 'same') {
    rowIndex = currentRowIndex;
  } else if (populateFrom.rowMode === 'first') {
    rowIndex = 0;
  }
  return getValueAt(formData, populateFrom.sectionId, populateFrom.fieldId, rowIndex);
}

/** Compare section reference code with formula token (case-insensitive). */
function sectionCodeMatches(section: SectionConfig, token: string): boolean {
  const code = getSectionReferenceCode(section);
  return code.toUpperCase() === (token || '').toUpperCase();
}

/**
 * Try to resolve the first part of a reference path to an actual section ID.
 * Checks: (1) exact section ID match, (2) reference code match (case-insensitive).
 * Returns the actual section ID or the raw token if no match found.
 */
function resolveToSectionId(token: string, sections: SectionConfig[]): string {
  if (!sections.length) return token;
  const byId = sections.find((s) => s.id === token);
  if (byId) return byId.id;
  const byCode = sections.find((s) => sectionCodeMatches(s, token));
  if (byCode) return byCode.id;
  return token;
}

/**
 * Resolve a ref path to (sectionId, fieldId, rowIndex?).
 * Supports: {Code.C1.R2}, {Code.C1} (same row), {Code.fieldId}, {sectionId.fieldId},
 * {sectionId.sameRow.fieldId}, {sectionId.row0.fieldId}
 *
 * The first part is always resolved from reference code → actual section ID
 * so that formData lookups work correctly.
 */
function resolveRef(
  parts: string[],
  sections: SectionConfig[],
  currentRowIndex: number
): { sectionId: string; fieldId: string; rowIndex?: number } | null {
  if (parts.length === 2) {
    const [a, b] = parts;
    const cMatch = b.match(/^C(\d+)$/i);
    if (sections.length && cMatch) {
      const colNum = parseInt(cMatch[1], 10);
      const sec = sections.find((s) => sectionCodeMatches(s, a));
      if (sec?.columns?.[colNum - 1]) {
        const fieldId = sec.columns[colNum - 1].field?.id ?? sec.columns[colNum - 1].id;
        return { sectionId: sec.id, fieldId, rowIndex: currentRowIndex };
      }
    }
    const realSectionId = resolveToSectionId(a, sections);
    return { sectionId: realSectionId, fieldId: b, rowIndex: undefined };
  }
  if (parts.length === 3) {
    const [a, b, c] = parts;
    const cMatch = b.match(/^C(\d+)$/i);
    const rMatch = c?.match(/^R(\d+)$/i);
    if (sections.length && cMatch && rMatch) {
      const colNum = parseInt(cMatch[1], 10);
      const rowNum = parseInt(rMatch[1], 10);
      const sec = sections.find((s) => sectionCodeMatches(s, a));
      if (sec?.columns?.[colNum - 1]) {
        const fieldId = sec.columns[colNum - 1].field?.id ?? sec.columns[colNum - 1].id;
        return { sectionId: sec.id, fieldId, rowIndex: rowNum - 1 };
      }
    }
    const realSectionId = resolveToSectionId(a, sections);
    if (b === 'sameRow') return { sectionId: realSectionId, fieldId: c, rowIndex: currentRowIndex };
    if (b === 'row0') return { sectionId: realSectionId, fieldId: c, rowIndex: 0 };
    const rMatchOnly = b.match(/^row(\d+)$/i);
    if (rMatchOnly) return { sectionId: realSectionId, fieldId: c, rowIndex: parseInt(rMatchOnly[1], 10) };
  }
  return null;
}

/** Parse a cell value to a number for formula use (handles "", "10", "1,000", 10, "<2200", ">100", "≤500"). */
function parseNumericValue(val: any): number {
  if (val === undefined || val === null) return NaN;
  if (typeof val === 'number' && isFinite(val)) return val;
  let s = String(val).trim().replace(/,/g, '');
  if (s === '') return NaN;
  s = s.replace(/^[<>≤≥]=?\s*/, '');
  const num = parseFloat(s);
  return isFinite(num) ? num : NaN;
}

/**
 * Replace formula placeholders with values from formData.
 * Tokens: {IR.C1.R2}, {Job.temperature}, {sectionId.fieldId}, {sectionId.row0.fieldId}, {sectionId.sameRow.fieldId}
 */
function substituteRefs(
  formula: string,
  formData: Record<string, Record<string, any>>,
  currentSectionId: string,
  currentRowIndex: number,
  sections: SectionConfig[] = []
): string {
  const re = /\{([^}]+)\}/g;
  return formula.replace(re, (_, path) => {
    const parts = path.trim().split('.').filter(Boolean);
    const resolved = resolveRef(parts, sections, currentRowIndex);
    if (resolved) {
      const val = getValueAt(formData, resolved.sectionId, resolved.fieldId, resolved.rowIndex);
      const num = parseNumericValue(val);
      return isFinite(num) ? String(num) : '0';
    }
    return '0';
  });
}

/**
 * Safe eval for numeric expressions: digits, +, -, *, /, (, ), ., round(x) or round(x, decimals).
 */
function safeEvalNumeric(expr: string): number | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  // Allow numbers, + - * / ( ) . , round (no other letters)
  if (!/^[\d\s+\-*/().,\sround]+$/i.test(trimmed)) return null;
  try {
    const round = (x: number, decimals?: number) => {
      const n = Number(x);
      if (!isFinite(n)) return NaN;
      if (decimals != null) return parseFloat(n.toFixed(decimals));
      return Math.round(n);
    };
    const fn = new Function('round', 'return ' + trimmed);
    const result = fn(round);
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Scan referenced values in a formula and return the first comparison prefix
 * found (e.g. "<", ">", "<=", ">=", "≤", "≥"). Returns "" if none found.
 */
function detectRefPrefix(
  formula: string,
  formData: Record<string, Record<string, any>>,
  currentRowIndex: number,
  sections: SectionConfig[] = []
): string {
  const re = /\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(formula)) !== null) {
    const parts = m[1].trim().split('.').filter(Boolean);
    const resolved = resolveRef(parts, sections, currentRowIndex);
    if (resolved) {
      const val = getValueAt(formData, resolved.sectionId, resolved.fieldId, resolved.rowIndex);
      if (val != null) {
        const pfx = String(val).trim().match(/^([<>≤≥]=?)\s*/);
        if (pfx) return pfx[1];
      }
    }
  }
  return '';
}

/**
 * Evaluate a formula string with {ref} placeholders using formData and current row.
 * sections: optional, used to resolve friendly refs like {IR.C1.R2}.
 * Preserves comparison prefixes (<, >, etc.) from referenced values.
 */
export function evaluateFormula(
  formula: string,
  formData: Record<string, Record<string, any>>,
  currentSectionId: string,
  currentRowIndex: number,
  sections: SectionConfig[] = []
): string {
  if (!formula || !formula.trim()) return '';
  const prefix = detectRefPrefix(formula, formData, currentRowIndex, sections);
  const substituted = substituteRefs(formula, formData, currentSectionId, currentRowIndex, sections);
  const result = safeEvalNumeric(substituted);
  return result != null ? prefix + String(result) : '';
}

/**
 * Check if a formula string is a simple single-field reference (no math operators).
 * e.g. "{ND.ratedCurrent}" → true, "{ND.ratedCurrent}*2" → false
 */
function isSingleReference(formula: string): boolean {
  const trimmed = formula.trim();
  const refs = trimmed.match(/\{[^}]+\}/g);
  if (!refs || refs.length !== 1) return false;
  const withoutRef = trimmed.replace(/\{[^}]+\}/g, '').trim();
  return withoutRef === '';
}

/**
 * Evaluate a per-cell formula string. Handles both simple references (populate)
 * and expressions (calculate). Returns the resolved string value.
 */
export function evaluateCellFormula(
  formula: string,
  formData: Record<string, Record<string, any>>,
  currentSectionId: string,
  currentRowIndex: number,
  sections: SectionConfig[] = []
): string {
  if (!formula || !formula.trim()) return '';

  if (isSingleReference(formula)) {
    const match = formula.match(/\{([^}]+)\}/);
    if (match) {
      const parts = match[1].trim().split('.').filter(Boolean);
      const resolved = resolveRef(parts, sections, currentRowIndex);
      if (resolved) {
        const val = getValueAt(formData, resolved.sectionId, resolved.fieldId, resolved.rowIndex);
        return val !== undefined && val !== null && val !== '' ? String(val) : '';
      }
    }
    const substituted = substituteRefs(formula, formData, currentSectionId, currentRowIndex, sections);
    return substituted === '0' ? '0' : substituted;
  }

  return evaluateFormula(formula, formData, currentSectionId, currentRowIndex, sections);
}

/**
 * Get display value for a table cell: user value, populated value, or calculated value.
 * sections: optional, used to resolve friendly refs like {IR.C1.R2} in formulas.
 * cellFormulas: optional per-cell formula overrides from SectionConfig.cellFormulas.
 * colId: the column ID, used together with currentRowIndex to look up per-cell overrides.
 */
export function getCellValue(
  formData: Record<string, Record<string, any>>,
  field: FieldConfig,
  dataKey: string,
  currentSectionId: string,
  currentRowIndex: number,
  sections: SectionConfig[] = [],
  cellFormulas?: Record<string, string>,
  colId?: string
): any {
  const userVal = formData[dataKey]?.[field.id];
  const hasUserVal = userVal !== undefined && userVal !== null && userVal !== '';

  // Per-cell formula override takes highest priority
  if (cellFormulas && colId) {
    const cellKey = `row${currentRowIndex}_${colId}`;
    const cellFormula = cellFormulas[cellKey];
    if (cellFormula && cellFormula.trim()) {
      const result = evaluateCellFormula(cellFormula, formData, currentSectionId, currentRowIndex, sections);
      return result !== '' ? result : (hasUserVal ? userVal : field.defaultValue ?? '');
    }
  }

  if (field.cellBehavior === 'populate' && field.populateFrom) {
    const populated = getPopulatedValue(formData, field.populateFrom, currentRowIndex);
    const out = hasUserVal ? userVal : (populated !== '' && populated !== undefined && populated !== null ? populated : field.defaultValue ?? '');
    return out !== undefined && out !== null ? out : '';
  }

  if (field.cellBehavior === 'calculate' && field.calculation?.formula) {
    const calculated = evaluateFormula(
      field.calculation.formula,
      formData,
      currentSectionId,
      currentRowIndex,
      sections
    );
    const out = calculated !== '' ? calculated : (hasUserVal ? userVal : field.defaultValue ?? '');
    return out !== undefined && out !== null ? out : '';
  }

  const out = hasUserVal ? userVal : field.defaultValue ?? '';
  return out !== undefined && out !== null ? out : '';
}
