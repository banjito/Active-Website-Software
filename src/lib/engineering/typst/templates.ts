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
  name: "Arc Flash Hazard Analysis",
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
