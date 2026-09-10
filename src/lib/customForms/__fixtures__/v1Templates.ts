/**
 * Regression fixtures: representative V1 templates and instances captured
 * before phase 0 changed how they are interpreted.
 *
 * These are the reference for "existing data still renders and saves". Do not
 * edit them to make a test pass. If behaviour must change, add a new fixture
 * and say why the old one is now wrong.
 */

import {
  ComponentType,
  FieldType,
  type CustomFormStructure,
} from "@/lib/types/customForms";

export interface V1Fixture {
  name: string;
  note: string;
  structure: CustomFormStructure;
  /** A saved `data` column exactly as V1 wrote it. */
  storedData: Record<string, unknown>;
}

/** Job info, a plain table with per-cell formulas, and a comments field. */
const insulationResistance: V1Fixture = {
  name: "insulation-resistance",
  note: "The common shape: job info grid, a fixed-row table with per-cell formulas addressing {JD.TCF}, and a single comments field.",
  structure: {
    settings: {
      includePassFail: true,
      includeJobInfo: true,
      includePrintHeader: true,
      pageBreakAfterSection: false,
    },
    sections: [
      {
        id: "sec-job",
        componentType: ComponentType.JOB_INFO,
        title: "Job Details",
        order: 0,
        showInPrint: true,
        referenceCode: "JD",
        layout: "grid",
        fields: [
          { id: "customer", label: "Customer", type: FieldType.TEXT },
          { id: "siteAddress", label: "Address", type: FieldType.TEXT },
          { id: "jobNumber", label: "Job #", type: FieldType.TEXT },
          { id: "date", label: "Date", type: FieldType.DATE },
          {
            id: "temperatureHumidity",
            label: "Temp / Humidity",
            type: FieldType.TEMPERATURE_HUMIDITY,
            defaultTemperature: 68,
            defaultHumidity: 50,
          },
        ],
      },
      {
        id: "sec-ir",
        componentType: ComponentType.INSULATION_TEST,
        title: "Insulation Resistance",
        order: 1,
        showInPrint: true,
        referenceCode: "IR",
        rows: 3,
        allowAddRows: true,
        allowRemoveRows: true,
        minRows: 1,
        maxRows: 10,
        columns: [
          {
            id: "col-test",
            label: "Test",
            field: { id: "test", label: "Test", type: FieldType.TEXT },
          },
          {
            id: "col-reading",
            label: "Reading",
            field: { id: "reading", label: "Reading", type: FieldType.NUMBER },
          },
          {
            id: "col-corrected",
            label: "Corrected",
            field: {
              id: "corrected",
              label: "Corrected",
              type: FieldType.CALCULATED,
              cellBehavior: "calculate",
            },
          },
        ],
        cellFormulas: {
          "row0_col-corrected": "{IR.C2.R1}*{JD.tcf}",
          "row1_col-corrected": "{IR.C2.R2}*{JD.tcf}",
          "row2_col-corrected": "{IR.C2.R3}*{JD.tcf}",
        },
      },
      {
        id: "sec-comments",
        componentType: ComponentType.COMMENTS,
        title: "Comments",
        order: 2,
        showInPrint: true,
        referenceCode: "CM",
        field: { id: "comments", label: "Comments", type: FieldType.TEXTAREA },
      },
    ],
  },
  storedData: {
    sections: {
      "sec-job": {
        customer: "Acme Utilities",
        siteAddress: "1 Substation Way",
        jobNumber: "24-0113",
        date: "2026-03-04",
        temperature: "72",
        temperatureCelsius: "22.22",
        tcf: "1.000",
        humidity: "48",
      },
      "sec-ir_row0": { test: "A-G", reading: "1200" },
      "sec-ir_row1": { test: "B-G", reading: "1180" },
      "sec-ir_row2": { test: "C-G", reading: "1240" },
      "sec-comments": { comments: "All readings within tolerance." },
    },
    status: "PASS",
    templateName: "Insulation Resistance",
    templateId: "tpl-ir",
  },
};

/** Conditional table: settings dropdowns decide which rows appear. */
const conditionalWindings: V1Fixture = {
  name: "conditional-windings",
  note: "Rows are addressed by their position in the FULL definition list, not by which ones the settings currently show. Row 3 holds data while hidden.",
  structure: {
    settings: {
      includePassFail: true,
      includeJobInfo: false,
      includePrintHeader: true,
    },
    sections: [
      {
        id: "sec-wind",
        componentType: ComponentType.CONDITIONAL_TABLE,
        title: "Winding Tests",
        order: 0,
        showInPrint: true,
        referenceCode: "WD",
        settingFields: [
          {
            id: "winding",
            label: "Winding",
            options: [
              { value: "primary", label: "Primary" },
              { value: "secondary", label: "Secondary" },
            ],
            defaultValue: "primary",
          },
        ],
        conditionalRows: [
          { id: "row0", label: "H1-H2", visibleWhen: { winding: "primary" } },
          { id: "row1", label: "H2-H3", visibleWhen: { winding: "primary" } },
          { id: "row2", label: "X1-X2", visibleWhen: { winding: "secondary" } },
          { id: "row3", label: "X2-X3", visibleWhen: { winding: "secondary" } },
        ],
        columns: [
          {
            id: "col-label",
            label: "Terminals",
            field: { id: "label", label: "Terminals", type: FieldType.TEXT },
          },
          {
            id: "col-value",
            label: "Value",
            field: { id: "value", label: "Value", type: FieldType.NUMBER },
          },
        ],
      },
    ],
  },
  storedData: {
    sections: {
      "sec-wind": { winding: "primary" },
      "sec-wind_row0": { value: "3.41" },
      "sec-wind_row1": { value: "3.39" },
      "sec-wind_row3": { value: "0.88" },
    },
    status: "FAIL",
    templateName: "Winding Tests",
    templateId: "tpl-wind",
  },
};

/** Contact resistance: named rows, value deviation, and a LIMITED SERVICE result. */
const contactResistance: V1Fixture = {
  name: "contact-resistance-limited-service",
  note: "Carries the result the old database CHECK constraint rejected, plus the per-row and per-section value-deviation keys the runtime owns rather than the template.",
  structure: {
    settings: {
      includePassFail: true,
      includeJobInfo: false,
      includePrintHeader: true,
    },
    sections: [
      {
        id: "sec-cr",
        componentType: ComponentType.CONTACT_RESISTANCE,
        title: "Contact Resistance",
        order: 0,
        showInPrint: true,
        referenceCode: "CR",
        rows: 2,
        allowAddRows: true,
        allowRemoveRows: true,
        showDeviation: true,
        defaultRowLabels: ["Section 1", "Section 2"],
        columns: [
          {
            id: "busSection",
            label: "Bus Section",
            field: { id: "busSection", label: "Bus Section", type: FieldType.TEXT },
          },
          {
            id: "aPhase",
            label: "A Phase",
            field: { id: "aPhase", label: "A Phase", type: FieldType.NUMBER },
          },
          {
            id: "unit",
            label: "Units",
            field: {
              id: "unit",
              label: "Units",
              type: FieldType.SELECT,
              defaultValue: "μΩ",
              options: [
                { label: "μΩ", value: "μΩ" },
                { label: "mΩ", value: "mΩ" },
              ],
            },
          },
        ],
      },
    ],
  },
  storedData: {
    sections: {
      "sec-cr": {
        neutralCriteria: "N/A",
        neutralResult: "N/A",
        groundCriteria: "<50%",
        groundResult: "PASS",
      },
      "sec-cr_row0": {
        busSection: "Section 1",
        aPhase: "142",
        unit: "μΩ",
        phaseCriteria: "<50%",
        phaseResult: "PASS",
      },
      "sec-cr_row1": {
        busSection: "Section 2",
        aPhase: "410",
        unit: "μΩ",
        phaseCriteria: "<50%",
        phaseResult: "LIMITED SERVICE",
      },
    },
    status: "LIMITED SERVICE",
    templateName: "Contact Resistance",
    templateId: "tpl-cr",
  },
};

/** A template with real problems, to check the compiler actually catches them. */
const brokenTemplate: V1Fixture = {
  name: "broken",
  note: "Every issue here must be reported. Publication must be refused.",
  structure: {
    settings: {
      includePassFail: true,
      includeJobInfo: true,
      includePrintHeader: true,
    },
    sections: [
      {
        id: "dupe",
        componentType: ComponentType.CUSTOM_TABLE,
        title: "First",
        order: 0,
        showInPrint: true,
        referenceCode: "DUP",
        rows: 1,
        columns: [
          {
            id: "a",
            label: "A",
            field: { id: "a", label: "A", type: FieldType.TEXT },
          },
          {
            id: "a",
            label: "A again",
            field: { id: "a", label: "A again", type: FieldType.TEXT },
          },
        ],
        cellFormulas: { row9_a: "{NOPE.field}" },
      },
      {
        id: "dupe",
        componentType: ComponentType.CUSTOM_TABLE,
        title: "Second with the same id",
        order: 1,
        showInPrint: true,
        referenceCode: "DUP",
        rows: 1,
        minRows: 5,
        maxRows: 2,
        columns: [
          {
            id: "b",
            label: "B",
            field: { id: "b", label: "B", type: FieldType.TEXT },
          },
        ],
      },
    ],
  },
  storedData: { sections: {}, status: "PASS" },
};

export const V1_FIXTURES: V1Fixture[] = [
  insulationResistance,
  conditionalWindings,
  contactResistance,
  brokenTemplate,
];

export const VALID_FIXTURES = V1_FIXTURES.filter((f) => f.name !== "broken");
export const BROKEN_FIXTURE = brokenTemplate;
