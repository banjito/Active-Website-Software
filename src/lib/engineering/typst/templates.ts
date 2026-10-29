// Report templates that ship with ampOS. Each is a folder of Typst files plus
// pictures, filled from a job and turned into a PDF by the report builder.

export interface ReportTemplate {
  id: string;
  name: string;
  /** Typst files, keyed by path from the template folder ("/main.typ"). */
  sources: Record<string, string>;
  /** Pictures and other binary files: path from the template folder -> URL. */
  assets: Record<string, string>;
  /** Friendly names for the fields in project.typ; others show their key. */
  fieldLabels: Record<string, string>;
}

const fromFolder = (files: Record<string, unknown>, folder: string) =>
  Object.fromEntries(
    Object.entries(files).map(([path, value]) => [path.slice(folder.length), value as string]),
  );

export const POWER_SYSTEM_STUDY: ReportTemplate = {
  id: "power-system-study",
  name: "Arc Flash Hazard Analysis - AMP Report",
  sources: fromFolder(
    import.meta.glob("./power-system-study/*.typ", { query: "?raw", import: "default", eager: true }),
    "./power-system-study",
  ),
  assets: fromFolder(
    import.meta.glob("./power-system-study/Pictures/*", { query: "?url", import: "default", eager: true }),
    "./power-system-study",
  ),
  fieldLabels: {
    reporttypetitle: "Report title",
    projectnumber: "Project number",
    mydate: "Report date",
    sitename: "Site name",
    sitelocation: "Site location",
    preparedfor: "Prepared for",
    preparedby: "Prepared by",
    preparedbyaddress: "Prepared by address",
    utilityprovider: "Utility provider",
    busescat0: "Buses in PPE category 0",
    busescat3: "Buses in PPE category 3",
    busescat4: "Buses in PPE category 4",
    busesdanger: "Buses rated DANGER",
  },
};

/** The same report in C&E Design's logo and colors. Its folder holds only the
 *  files that differ (brand.typ, project.typ, the logo); the rest is shared. */
export const CE_POWER_SYSTEM_STUDY: ReportTemplate = {
  id: "ce-power-system-study",
  name: "Arc Flash Hazard Analysis - C&E Design Report",
  sources: {
    ...POWER_SYSTEM_STUDY.sources,
    ...fromFolder(
      import.meta.glob("./ce-power-system-study/*.typ", { query: "?raw", import: "default", eager: true }),
      "./ce-power-system-study",
    ),
  },
  assets: {
    ...POWER_SYSTEM_STUDY.assets,
    ...fromFolder(
      import.meta.glob("./ce-power-system-study/Pictures/*", { query: "?url", import: "default", eager: true }),
      "./ce-power-system-study",
    ),
  },
  fieldLabels: POWER_SYSTEM_STUDY.fieldLabels,
};

/** The fields a template reads from the job: `field("key", "sample")` in project.typ. */
export const templateFields = (projectTyp: string) =>
  [...projectTyp.matchAll(/field\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/g)].map((m) => ({
    key: m[1],
    sample: m[2].replace(/\\(.)/g, "$1"),
  }));

/** The SKM PDFs a template pulls in: `attachment("Title", "/PDF/file.pdf", ...)`. */
export const templatePdfSlots = (sources: Record<string, string>) =>
  Object.values(sources).flatMap((text) =>
    [...text.matchAll(/attachment\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"([^"]+\.pdf)"/g)].map((m) => ({
      title: m[1],
      path: m[2],
    })),
  );

/** Templates bundled with ampOS. Saved templates start from one of these. */
export const BUILT_IN_TEMPLATES: ReportTemplate[] = [POWER_SYSTEM_STUDY, CE_POWER_SYSTEM_STUDY];

/** The bundled template that supplies a saved template's pictures and field labels. */
export const baseTemplateFor = (id: string | null | undefined) =>
  BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? POWER_SYSTEM_STUDY;

/** Starting files for a "Blank" new template: a title block and a few job fields. */
export const BLANK_SOURCES: Record<string, string> = {
  "/main.typ": `#import "project.typ": *

#set page(paper: "us-letter", margin: 1in)
#set text(font: ("Helvetica", "Arimo"), size: 11pt)

#align(center)[
  #text(20pt, weight: "bold")[#reporttypetitle]
  #v(6pt)
  #sitename · Project #projectnumber
  #v(2pt)
  Prepared for #preparedfor · #mydate
]

= Introduction

Write the report here.
`,
  "/project.typ": `// PROJECT DEFINITIONS
// ampOS fills these in from the job when it builds the PDF. The values after
// each name are only used when this template is compiled by hand.

#let field(key, fallback) = sys.inputs.at(key, default: fallback)

#let reporttypetitle = field("reporttypetitle", "Report title")
#let projectnumber = field("projectnumber", "00000")
#let mydate = field("mydate", "January 1, 2026")
#let sitename = field("sitename", "Site name")
#let preparedfor = field("preparedfor", "Customer")
`,
};
