/**
 * Breaker Settings checks: the paste reader and the As-Left match rule.
 * Run as part of scripts/custom-forms-regression.ts.
 */

import assert from "node:assert/strict";
import {
  LIST_TEMPLATE_HEADINGS,
  NO_EQUIPMENT,
  NO_SECTION,
  breakerProgress,
  classifySetting,
  functionLayout,
  groupByEquipment,
  splitI2t,
  type BreakerBlock,
  parseBreakerPaste,
  settingMatch,
  splitSettingLine,
} from "./breakerSettings";

let checks = 0;
const check = (name: string, fn: () => void) => {
  fn();
  checks += 1;
  void name;
};

check("smart match ignores format, amps in parentheses and REV", () => {
  const same: [string, string][] = [
    ["0.4, I²t ON", "0.4 i2t on"],
    ["0.0, I²t OFF", "0 I2T off"],
    ["1 (4000 A)", "1"],
    ["Plug A, 1 (800 A)", "A, 1"],
    ["2 (1600 A) REV", "2"],
    ["20 A", "20"],
    ["1120 A", "1120A"],
    ["A (160 A)", "A"],
    [".4", "0.40"],
  ];
  for (const [setting, asLeft] of same) assert.equal(settingMatch(setting, asLeft), "match", `${setting} vs ${asLeft}`);
});

check("smart match still catches real differences", () => {
  assert.equal(settingMatch("0.4, I²t ON", "0.4 i2t off"), "mismatch");
  assert.equal(settingMatch("3.5 (2800 A)", "3"), "mismatch");
  assert.equal(settingMatch("A (160 A)", "B"), "mismatch");
});

check("nothing to compare: blank As-Left, N/A or Verify settings", () => {
  assert.equal(settingMatch("1 (4000 A)", ""), "none");
  assert.equal(settingMatch("N/A", "x"), "none");
  assert.equal(settingMatch("Verify 30 A fixed", "30"), "none");
});

const entryForm = [
  "SECTION 1\t\t\t\t",
  "\t\t\t\t",
  "52LB1\t\t\t\t",
  "Study ID:  CB MCBLB1\t\t\t\t",
  "Breaker:  MTZ3-H 5000AF, Micrologic 6.0X (LSIG), ERMS\t\t\t\t",
  "Setting\tNormal\tERMS\tAs-Left Normal\tAs-Left ERMS",
  "Ir\t1 (4000 A)\t1 (4000 A)\t\t",
  "Ii\t5 (20000 A)\t2 (8000 A)\t\t",
  "Notes\t\t\t\t",
  "•  REV: from the RFI response.\t\t\t\t",
  "\t\t\t\t",
  "DP-P1.A1-1  —  FEEDERS  (cont.)\t\t\t\t",
  "Feeder — CDU     Ckt # ______\t\t\t\t",
  "Study ID:  CB MTR CDU\t\t\t\t",
  "Breaker:  HL 150AF\t\t\t\t",
  "Setting\tSet To\t\tAs-Left\t",
  "Ir\t60 A\t\t\t",
  "Ground fault\tN/A\t\t\t",
].join("\r\n");

check("entry-form layout: blocks, ERMS, notes, groups, fill-in boxes", () => {
  const result = parseBreakerPaste(entryForm);
  assert.equal(result.layout, "blocks");
  assert.equal(result.breakers.length, 2);
  const [main, feeder] = result.breakers;
  assert.equal(main.group, "SECTION 1");
  assert.equal(main.title, "52LB1");
  assert.equal(main.studyId, "CB MCBLB1");
  assert.equal(main.erms, true);
  assert.deepEqual(main.rows.map((r) => [r.setting, r.normal, r.erms]), [
    ["Ir", "1 (4000 A)", "1 (4000 A)"],
    ["Ii", "5 (20000 A)", "2 (8000 A)"],
  ]);
  assert.deepEqual(main.notes, ["REV: from the RFI response."]);
  assert.equal(feeder.group, "DP-P1.A1-1 — FEEDERS");
  assert.equal(feeder.title, "Feeder — CDU");
  assert.equal(feeder.erms, false);
  assert.deepEqual(feeder.inputs?.map((i) => i.label), ["Ckt #"]);
  assert.deepEqual(feeder.rows.map((r) => [r.setting, r.normal]), [["Ir", "60 A"], ["Ground fault", "N/A"]]);
});

check("list layout: one row per setting, grouped by breaker", () => {
  const list = "Group\tBreaker\tStudy ID\tSetting\tNormal\tERMS\nSec 1\t52LB1\tCB X\tIr\t1 (4000 A)\t1\nSec 1\t52LB1\t\ttr\t4\t4\nSec 2\t52F8\tCB Y\tTrip\tVerify 30 A\t\n";
  const result = parseBreakerPaste(list);
  assert.equal(result.layout, "list");
  assert.deepEqual(result.breakers.map((b) => [b.group, b.title, b.studyId, b.erms, b.rows.length]), [
    ["Sec 1", "52LB1", "CB X", true, 2],
    ["Sec 2", "52F8", "CB Y", false, 1],
  ]);
  assert.equal(result.breakers[1].rows[0].erms, undefined);
});

check("SKM bracketed I²t still counts; amps in brackets don't", () => {
  assert.equal(settingMatch("0.0 (I^2 T Off)", "0 I2t off"), "match");
  assert.equal(settingMatch("0.0 (I^2 T Off)", "0 I2t on"), "mismatch");
  assert.equal(settingMatch("1; 0.98 (2940A)", "1, 0.98"), "match");
  assert.equal(settingMatch("1; 0.98 (2940A)", "10.98"), "mismatch");
  assert.equal(settingMatch("Fixed (2277A)", "fixed"), "match");
});

check("SKM settings lines split into setting and value", () => {
  assert.deepEqual(splitSettingLine("LTPU (lo x Ir x S) 1; 0.98 (2940A)"), { setting: "LTPU (lo x Ir x S)", value: "1; 0.98 (2940A)" });
  assert.deepEqual(splitSettingLine("LTD (Fixed) Fixed"), { setting: "LTD (Fixed)", value: "Fixed" });
  assert.deepEqual(splitSettingLine("INST (1.5-10 x LTPU) 8 (23520A)"), { setting: "INST (1.5-10 x LTPU)", value: "8 (23520A)" });
  assert.deepEqual(splitSettingLine("Ir 125 (125A)"), { setting: "Ir", value: "125 (125A)" });
  assert.deepEqual(splitSettingLine("tsd 0.0 (I^2 T Off)"), { setting: "tsd", value: "0.0 (I^2 T Off)" });
  assert.deepEqual(splitSettingLine("INST OR Fixed (2277A)"), { setting: "INST OR", value: "Fixed (2277A)" });
  assert.deepEqual(splitSettingLine("I2T OFF"), { setting: "I2T", value: "OFF" });
});

check("SKM LV Breakers table: nameplate, frame/sensor/plug, settings", () => {
  const skm = [
    ["LV Breakers Name/Type", "BusConnectedName", "Description", "Frame/Model", "Frame/Sensor/Plug", "Settings"],
    ["CB DIESEL GENSET", "DIESEL GENSET", "MERLIN GERIN", "MP30H2", "3000.0A", "LTPU (lo x Ir x S) 1; 0.98 (2940A)"],
    ["Static Trip", "", "", "", "3000.0A", "LTD (Fixed) Fixed"],
    ["", "", "", "", "3000.0A", "INST (1.5-10 x LTPU) 8 (23520A)"],
    ["", "", "", "", "", ""],
    ["CB DP-P1.A1-1 - SPARE (1)", "DP-P1.A1-1", "SQUARE D", "HL", "150.0A", "Ir 50 (50A)"],
    ["Static Trip", "", "", "", "100.0A", "tr 0.5"],
    ["", "", "", "", "100.0A", "Ii 1.5 (150A)"],
    ["", "", "", "", "", "INST OR Fixed (1520A)"],
  ]
    .map((r) => r.join("\t"))
    .join("\n");
  const result = parseBreakerPaste(skm);
  assert.equal(result.layout, "skm");
  assert.equal(result.breakers.length, 2);
  const [genset, spare] = result.breakers;
  assert.deepEqual(
    [genset.title, genset.equipment, genset.breakerType, genset.manufacturer, genset.model, genset.frame, genset.sensor, genset.plug],
    ["CB DIESEL GENSET", "DIESEL GENSET", "Static Trip", "MERLIN GERIN", "MP30H2", "3000", "3000", "3000"],
  );
  assert.equal(genset.erms, false);
  assert.deepEqual(genset.rows.map((r) => [r.setting, r.normal]), [
    ["LTPU (lo x Ir x S)", "1; 0.98 (2940A)"],
    ["LTD (Fixed)", "Fixed"],
    ["INST (1.5-10 x LTPU)", "8 (23520A)"],
  ]);
  assert.deepEqual([spare.frame, spare.sensor, spare.plug], ["150", "100", "100"]);
  // "INST OR Fixed (1520A)" is an override: fixed, so left out.
  assert.deepEqual(spare.rows.map((r) => r.setting), ["Ir", "tr", "Ii"]);
});

check("list layout with the nameplate headings", () => {
  const list =
    "Breaker Identifier\tEquipment Identifier\tBreaker Type\tManufacturer\tModel\tFrame (A)\tSensor (A)\tPlug (A)\tSetting\tNormal\n" +
    "CB X\tSWBD-1\tStatic Trip\tSQUARE D\tHL\t150\t100\t100\tIr\t50 (50A)\n" +
    "CB X\t\t\t\t\t\t\t\ttr\t0.5\n";
  const [block] = parseBreakerPaste(list).breakers;
  assert.deepEqual(
    [block.title, block.equipment, block.breakerType, block.manufacturer, block.model, block.frame, block.sensor, block.plug, block.rows.length],
    ["CB X", "SWBD-1", "Static Trip", "SQUARE D", "HL", "150", "100", "100", 2],
  );
});

check("blank sheet headings use the report's words: nameplate labels, Set A / Set B, no override", () => {
  const h = LIST_TEMPLATE_HEADINGS;
  assert.deepEqual(h.slice(0, 10), [
    "Breaker Identifier", "Equipment Identifier", "Equipment Section", "Breaker Type", "Trip Unit Type",
    "Manufacturer", "Model", "Frame (A)", "Sensor (A)", "Plug (A)",
  ]);
  assert.ok(h.includes("Set A Long Time Setting (A)"));
  assert.ok(h.includes("Set B Short Time I²t"));
  assert.ok(h.includes("Set B Ground Fault Delay"));
  assert.ok(!h.some((x) => /phase|erms|normal|trip type|override/i.test(x)), h.join(", "));
});

check("blank sheet pastes back: settings, amps, delay + I²t, Set B ground fault falls back to Set A", () => {
  const at = (heading: string) => {
    const i = LIST_TEMPLATE_HEADINGS.indexOf(heading);
    assert.ok(i >= 0, heading);
    return i;
  };
  const row = (cells: Record<string, string>) => {
    const r = Array(LIST_TEMPLATE_HEADINGS.length).fill("");
    for (const [heading, value] of Object.entries(cells)) r[at(heading)] = value;
    return r.join("\t");
  };
  const sheet = [
    LIST_TEMPLATE_HEADINGS.join("\t"),
    row({
      "Breaker Identifier": "CB MCBG", "Equipment Identifier": "SEC 1", "Breaker Type": "Static Trip",
      "Trip Unit Type": "Micrologic 6.0X", Manufacturer: "SCHNEIDER", Model: "MTZ3-H",
      "Frame (A)": "5000", "Sensor (A)": "5000", "Plug (A)": "5000",
      "Set A Long Time Setting": "1", "Set A Long Time Setting (A)": "5000", "Set A Long Time Delay": "1",
      "Set A Short Time Setting": "2", "Set A Short Time Setting (A)": "10000",
      "Set A Short Time Delay": "0.4", "Set A Short Time I²t": "on",
      "Set A Instantaneous Setting": "3", "Set A Instantaneous Setting (A)": "15000",
      "Set A Ground Fault Setting": "880A", "Set A Ground Fault Setting (A)": "880",
      "Set A Ground Fault Delay": "0.3", "Set A Ground Fault I²t": "On",
      "Set B Instantaneous Setting": "2", "Set B Instantaneous Setting (A)": "10000",
      Notes: "Kirk key K1",
    }),
    row({ "Breaker Identifier": "CB SPD", "Breaker Type": "Thermal Magnetic", "Set A Long Time Setting": "Fixed" }),
  ].join("\r\n");
  const result = parseBreakerPaste(sheet);
  assert.equal(result.layout, "sheet");
  const [main, spd] = result.breakers;
  assert.deepEqual(
    [main.title, main.equipment, main.breakerType, main.tripUnitType, main.manufacturer, main.model, main.frame, main.erms, main.notes],
    ["CB MCBG", "SEC 1", "Static Trip", "Micrologic 6.0X", "SCHNEIDER", "MTZ3-H", "5000", true, ["Kirk key K1"]],
  );
  assert.deepEqual(main.rows.map((r) => [r.setting, r.normal, r.erms]), [
    ["Long Time Setting", "1 (5000 A)", ""],
    ["Long Time Delay", "1", ""],
    ["Short Time Setting", "2 (10000 A)", ""],
    ["Short Time Delay", "0.4 (I²t On)", ""],
    ["Instantaneous Setting", "3 (15000 A)", "2 (10000 A)"],
    ["Ground Fault Setting", "880 A", "880 A"],
    ["Ground Fault Delay", "0.3 (I²t On)", "0.3 (I²t On)"],
  ]);
  // Each row lands in the right function of the ATS-style tables.
  assert.deepEqual(functionLayout(main).rows.map((r) => [r.label, !!r.pickup, !!r.delay]), [
    ["Long Time", true, true],
    ["Short Time", true, true],
    ["Instantaneous", true, false],
    ["Ground Fault", true, true],
  ]);
  assert.equal(spd.erms, false);
  assert.deepEqual(spd.rows.map((r) => [r.setting, r.normal, r.erms]), [["Long Time Setting", "Fixed", undefined]]);
});

check("study provider's older sheet (Phase / ERMS / GF, Trip Type) still pastes; override dropped", () => {
  const headings = [
    "Breaker", "Bus", "Trip Type", "Phase LT Pickup", "Phase LT Pickup (A)", "Phase ST Delay",
    "Phase Inst Override (A)", "ERMS LT Pickup", "ERMS LT Pickup (A)", "ERMS Inst Override (A)", "GF Pickup", "GF Pickup (A)",
  ];
  const values = ["CB MCBU", "SEC 1", "Static Trip", "1", "5000", "0.1 (I²t On)", "120210", "1", "5000", "120210", "A", "160"];
  const [block] = parseBreakerPaste([headings.join("\t"), values.join("\t")].join("\n")).breakers;
  assert.deepEqual([block.title, block.equipment, block.breakerType, block.erms], ["CB MCBU", "SEC 1", "Static Trip", true]);
  assert.deepEqual(block.rows.map((r) => [r.setting, r.normal, r.erms]), [
    ["Long Time Setting", "1 (5000 A)", "1 (5000 A)"],
    ["Short Time Delay", "0.1 (I²t On)", ""],
    ["Ground Fault Setting", "A (160 A)", "A (160 A)"],
  ]);
});

check("override settings from any paste are left out", () => {
  const skm = [
    ["Name/Type", "BusConnectedName", "Description", "Frame/Model", "Frame/Sensor/Plug", "Settings"],
    ["CB X", "DP-1", "SQUARE D", "HL", "150.0A", "Ir 50 (50A)"],
    ["", "", "", "", "", "INST OR Fixed (1520A)"],
  ]
    .map((r) => r.join("\t"))
    .join("\n");
  const [block] = parseBreakerPaste(skm).breakers;
  assert.deepEqual(block.rows.map((r) => r.setting), ["Ir"]);
});

check("blank sheet ends with Notes, and the Notes column fills the breaker's notes", () => {
  assert.equal(LIST_TEMPLATE_HEADINGS[LIST_TEMPLATE_HEADINGS.length - 1], "Notes");
  const notesAt = LIST_TEMPLATE_HEADINGS.indexOf("Notes");
  const row = Array(LIST_TEMPLATE_HEADINGS.length).fill("");
  row[LIST_TEMPLATE_HEADINGS.indexOf("Breaker Identifier")] = "CB X";
  row[LIST_TEMPLATE_HEADINGS.indexOf("Set A Long Time Setting")] = "1";
  row[notesAt] = "Verify sensor plug before setting";
  const [block] = parseBreakerPaste([LIST_TEMPLATE_HEADINGS.join("\t"), row.join("\t")].join("\n")).breakers;
  assert.deepEqual(block.notes, ["Verify sensor plug before setting"]);
});

check("group by Equipment Identifier: natural order, paste order inside, blanks last", () => {
  const b = (title: string, equipment?: string) =>
    ({ id: title, title, equipment, erms: false, rows: [], notes: [] }) as BreakerBlock;
  const groups = groupByEquipment([b("1", "SEC 10"), b("2"), b("3", "SEC 2"), b("4", "SEC 10"), b("5", " ")]);
  assert.deepEqual(
    groups.map((g) => [g.equipment, g.breakers.map((x) => x.title)]),
    [["SEC 2", ["3"]], ["SEC 10", ["1", "4"]], [NO_EQUIPMENT, ["2", "5"]]],
  );
});

check("Equipment Section: imported, and a second sort level inside each equipment", () => {
  const at = (h: string) => LIST_TEMPLATE_HEADINGS.indexOf(h);
  assert.equal(at("Equipment Section"), at("Equipment Identifier") + 1);
  const row = (title: string, bus: string, section: string) => {
    const r = Array(LIST_TEMPLATE_HEADINGS.length).fill("");
    r[at("Breaker Identifier")] = title;
    r[at("Equipment Identifier")] = bus;
    r[at("Equipment Section")] = section;
    r[at("Set A Long Time Setting")] = "1";
    return r.join("\t");
  };
  const pasted = parseBreakerPaste(
    [LIST_TEMPLATE_HEADINGS.join("\t"), row("A", "SWGR", "Section 10"), row("B", "SWGR", ""), row("C", "SWGR", "Section 2"), row("D", "PNL", "")].join("\n"),
  ).breakers;
  assert.equal(pasted[0].equipmentSection, "Section 10");
  const groups = groupByEquipment(pasted);
  assert.deepEqual(
    groups.map((g) => [g.equipment, g.sections.map((s) => [s.section, s.breakers.map((b) => b.title)])]),
    [
      ["PNL", [["", ["D"]]]],
      ["SWGR", [["Section 2", ["C"]], ["Section 10", ["A"]], [NO_SECTION, ["B"]]]],
    ],
  );
  assert.deepEqual(groups[1].breakers.map((b) => b.title), ["C", "A", "B"]);
});

check("ATS-style layout: settings sort into functions, I²t splits out of delays", () => {
  assert.deepEqual(classifySetting("tsd (STD)"), { fn: "st", part: "delay" });
  assert.deepEqual(classifySetting("LTPU (lo x Ir x S)"), { fn: "lt", part: "pickup" });
  assert.deepEqual(classifySetting("INST OR"), { fn: "inst", part: "override" });
  assert.equal(classifySetting("Trip rating"), null);
  assert.deepEqual(splitI2t("0.4 (I²t On)"), { value: "0.4", i2t: "On" });
  assert.deepEqual(splitI2t("0, I²t OFF"), { value: "0", i2t: "Off" });
  assert.deepEqual(splitI2t("0.5"), { value: "0.5" });

  const row = (setting: string, normal: string) => ({ id: setting, setting, normal });
  const block = {
    id: "b", title: "CB", erms: false, notes: [],
    rows: [row("LT Pickup", "1 (800 A)"), row("ST Delay", "0.2 (I²t Off)"), row("Inst Override", "Fixed (10500 A)"), row("Trip rating", "Verify 30 A")],
  } as BreakerBlock;
  const layout = functionLayout(block);
  assert.deepEqual(layout.rows.map((r) => r.label), ["Long Time", "Short Time"]);
  assert.equal(layout.hasDelay, true);
  assert.deepEqual(layout.hasI2t, { a: true, b: false });
  assert.deepEqual(layout.overrides.map((r) => r.setting), ["Inst Override"]);
  assert.deepEqual(layout.others.map((r) => r.setting), ["Trip rating"]);

  // The delay and its I²t are separate checks; the override isn't checked.
  block.rows[1].asLeftNormal = "0.2";
  block.rows[1].asLeftNormalI2t = "On";
  assert.deepEqual(breakerProgress([block]), { breakers: 1, cells: 4, entered: 2, mismatched: 1 });
});

check("unreadable paste explains both layouts", () => {
  const result = parseBreakerPaste("hello\tworld");
  assert.equal(result.breakers.length, 0);
  assert.match(result.error ?? "", /heading row/);
});

check("progress counts entered and mismatched As-Left cells", () => {
  const [main] = parseBreakerPaste(entryForm).breakers;
  main.rows[0].asLeftNormal = "1";
  main.rows[0].asLeftErms = "2";
  const progress = breakerProgress([main]);
  assert.deepEqual(progress, { breakers: 1, cells: 4, entered: 2, mismatched: 1 });
});

console.log(`\n${checks}/${checks} breaker settings checks passed`);
export const breakerCheckCount = checks;
