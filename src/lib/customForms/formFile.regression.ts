/**
 * Form file checks: download → import round trip, and refusing bad files.
 * Run as part of scripts/custom-forms-regression.ts.
 */

import assert from "node:assert/strict";
import { buildFormFile, formFileName, readFormFile } from "./formFile";
import type { CustomFormStructure } from "@/lib/types/customForms";

let checks = 0;
const check = (fn: () => void) => {
  fn();
  checks += 1;
};

const structure: CustomFormStructure = {
  sections: [
    { id: "breakers", componentType: "breaker-settings", title: "Breaker Settings", order: 0, showInPrint: true },
    {
      id: "comments",
      componentType: "comments",
      title: "Comments",
      order: 1,
      showInPrint: true,
      field: { id: "comments", label: "Comments", type: "textarea" },
    },
  ],
  settings: { includePassFail: true, includeJobInfo: false, includePrintHeader: true },
};

check(() => {
  const file = buildFormFile({ name: "Breaker Settings", description: "d", netaSection: "7.6", structure });
  const result = readFormFile(JSON.stringify(file));
  assert.equal(result.error, undefined);
  assert.equal(result.form?.name, "Breaker Settings");
  assert.equal(result.form?.netaSection, "7.6");
  assert.deepEqual(result.form?.structure.sections, structure.sections);
  assert.equal(result.form?.structure.settings.includeJobInfo, false);
  assert.equal(result.problems, 0);
});

check(() => {
  // A bare structure, with a byte-order mark, still imports with default settings.
  const result = readFormFile("﻿" + JSON.stringify({ sections: structure.sections }));
  assert.equal(result.form?.name, "Imported form");
  assert.equal(result.form?.structure.settings.includePassFail, true);
});

check(() => {
  assert.match(readFormFile("not json").error ?? "", /valid JSON/);
  assert.match(readFormFile(JSON.stringify({ name: "x" })).error ?? "", /no form sections/);
  assert.match(readFormFile(JSON.stringify({ sections: [{ title: "no id" }] })).error ?? "", /Section 1/);
  assert.match(readFormFile(JSON.stringify({ format: "other", sections: [] })).error ?? "", /Unknown file type/);
  assert.match(readFormFile(JSON.stringify({ version: 99, sections: [] })).error ?? "", /newer version/);
});

check(() => {
  assert.equal(formFileName('A/B: "Test"'), "A B Test.json");
  assert.equal(formFileName(""), "Custom form.json");
});

console.log(`\n${checks}/${checks} form file checks passed`);
export const formFileCheckCount = checks;
