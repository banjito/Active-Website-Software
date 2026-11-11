/**
 * Substation and equipment identifier of a saved custom form, read from its
 * `custom_form_instances.data`. Section ids differ per template, so every
 * section is scanned. Used by the job's Reports tab and the approvals list to
 * group custom forms by substation and name them by identifier, like built-in
 * reports.
 */
export interface CustomFormInstanceSummary {
  substation: string;
  identifier: string;
  templateName: string;
}

export function summarizeCustomFormInstance(rawData: unknown): CustomFormInstanceSummary {
  const summary: CustomFormInstanceSummary = { substation: "", identifier: "", templateName: "" };
  let data: any = rawData;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return summary;
    }
  }
  if (typeof data?.templateName === "string") summary.templateName = data.templateName.trim();
  const sections = data?.sections;
  if (!sections || typeof sections !== "object") return summary;

  let location = "";
  for (const sec of Object.values(sections)) {
    if (!sec || typeof sec !== "object") continue;
    const s = sec as Record<string, unknown>;
    if (!summary.substation && typeof s.substation === "string") summary.substation = s.substation.trim();
    if (!summary.identifier && typeof s.identifier === "string") summary.identifier = s.identifier.trim();
    if (!location && typeof s.eqptLocation === "string") location = s.eqptLocation.trim();
  }
  if (!summary.identifier) summary.identifier = location;
  return summary;
}
