/**
 * The binding registry.
 *
 * A template may populate a field from report context, and only from this
 * list. Templates never name a table, a column or a query: they name a binding
 * id, and this module decides what that resolves to. A template author cannot
 * reach data the registry does not expose, and adding a new source is a code
 * change with a typed output rather than a string in a JSON blob.
 */

export type BindingType = "string" | "number" | "date" | "boolean";

export type BindingCategory =
  | "job"
  | "customer"
  | "site"
  | "technician"
  | "asset"
  | "equipment"
  | "company"
  | "environment"
  | "testEquipment";

export interface BindingDefinition {
  id: string;
  category: BindingCategory;
  label: string;
  type: BindingType;
  description: string;
  /**
   * True when the value only exists once a row is chosen, e.g. the calibration
   * date of the test equipment picked in this table row.
   */
  rowScoped?: boolean;
}

/** Everything a template is allowed to bind to. */
export const BINDING_REGISTRY: BindingDefinition[] = [
  // Job
  { id: "job.number", category: "job", label: "Job Number", type: "string", description: "The job's number, e.g. 24-0113." },
  { id: "job.title", category: "job", label: "Job Title", type: "string", description: "The job's title." },
  { id: "job.startDate", category: "job", label: "Job Start Date", type: "date", description: "The date work started." },
  { id: "job.division", category: "job", label: "Division", type: "string", description: "The division the job belongs to." },

  // Customer
  { id: "customer.name", category: "customer", label: "Customer", type: "string", description: "Customer company name." },
  { id: "customer.address", category: "customer", label: "Customer Address", type: "string", description: "Customer's mailing address." },

  // Site
  { id: "site.address", category: "site", label: "Site Address", type: "string", description: "Address of the site the work happened at." },
  { id: "site.name", category: "site", label: "Site Name", type: "string", description: "Name of the site." },
  { id: "site.substation", category: "site", label: "Substation", type: "string", description: "Substation identifier." },
  { id: "site.equipmentLocation", category: "site", label: "Equipment Location", type: "string", description: "Where in the site the equipment sits." },

  // Technician
  { id: "technician.name", category: "technician", label: "Technician", type: "string", description: "Name of the technician filling the report." },
  { id: "technician.email", category: "technician", label: "Technician Email", type: "string", description: "Email of the technician filling the report." },

  // Asset
  { id: "asset.name", category: "asset", label: "Asset Name", type: "string", description: "Name of the asset under test." },
  { id: "asset.identifier", category: "asset", label: "Asset Identifier", type: "string", description: "The asset's tag or identifier." },

  // Equipment nameplate
  { id: "equipment.manufacturer", category: "equipment", label: "Manufacturer", type: "string", description: "Nameplate manufacturer." },
  { id: "equipment.model", category: "equipment", label: "Model", type: "string", description: "Nameplate model or catalog number." },
  { id: "equipment.serialNumber", category: "equipment", label: "Serial Number", type: "string", description: "Nameplate serial number." },
  { id: "equipment.ratedVoltage", category: "equipment", label: "Rated Voltage", type: "string", description: "Nameplate rated voltage." },
  { id: "equipment.ratedCurrent", category: "equipment", label: "Rated Current", type: "string", description: "Nameplate rated current." },

  // Company branding
  { id: "company.name", category: "company", label: "Company Name", type: "string", description: "The company issuing the report." },
  { id: "company.logoUrl", category: "company", label: "Company Logo", type: "string", description: "URL of the report logo." },

  // Environment
  { id: "environment.temperatureF", category: "environment", label: "Temperature (°F)", type: "number", description: "Ambient temperature in Fahrenheit." },
  { id: "environment.temperatureC", category: "environment", label: "Temperature (°C)", type: "number", description: "Ambient temperature in Celsius, derived." },
  { id: "environment.tcf", category: "environment", label: "TCF", type: "number", description: "Temperature correction factor, derived from the Celsius reading." },
  { id: "environment.humidity", category: "environment", label: "Humidity (%)", type: "number", description: "Relative humidity." },

  // Test equipment, resolved per row
  { id: "testEquipment.name", category: "testEquipment", label: "Test Equipment", type: "string", description: "Name of the test equipment chosen in this row.", rowScoped: true },
  { id: "testEquipment.serialNumber", category: "testEquipment", label: "Test Equipment Serial", type: "string", description: "Serial number of the test equipment chosen in this row.", rowScoped: true },
  { id: "testEquipment.ampId", category: "testEquipment", label: "Test Equipment AMP ID", type: "string", description: "AMP asset id of the test equipment chosen in this row.", rowScoped: true },
  { id: "testEquipment.calibrationDate", category: "testEquipment", label: "Calibration Date", type: "date", description: "Calibration date of the test equipment chosen in this row.", rowScoped: true },
];

const BY_ID = new Map(BINDING_REGISTRY.map((b) => [b.id, b]));

export function getBinding(id: string): BindingDefinition | undefined {
  return BY_ID.get(id);
}

export function isKnownBinding(id: string): boolean {
  return BY_ID.has(id);
}

export function bindingsByCategory(): Map<BindingCategory, BindingDefinition[]> {
  const grouped = new Map<BindingCategory, BindingDefinition[]>();
  for (const binding of BINDING_REGISTRY) {
    const list = grouped.get(binding.category) ?? [];
    list.push(binding);
    grouped.set(binding.category, list);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** The context a shell hands the runtime so bindings can resolve. */
export interface BindingContext {
  job?: {
    number?: string | null;
    title?: string | null;
    startDate?: string | null;
    division?: string | null;
  };
  customer?: { name?: string | null; address?: string | null };
  site?: {
    name?: string | null;
    address?: string | null;
    substation?: string | null;
    equipmentLocation?: string | null;
  };
  technician?: { name?: string | null; email?: string | null };
  asset?: { name?: string | null; identifier?: string | null };
  equipment?: Record<string, string | null | undefined>;
  company?: { name?: string | null; logoUrl?: string | null };
  environment?: {
    temperatureF?: number | string | null;
    temperatureC?: number | string | null;
    tcf?: number | string | null;
    humidity?: number | string | null;
  };
  /** Values for row-scoped bindings, keyed by the row's state key. */
  rows?: Record<string, Record<string, unknown>>;
}

const RESOLVERS: Record<
  string,
  (context: BindingContext) => unknown
> = {
  "job.number": (c) => c.job?.number,
  "job.title": (c) => c.job?.title,
  "job.startDate": (c) => c.job?.startDate,
  "job.division": (c) => c.job?.division,

  "customer.name": (c) => c.customer?.name,
  "customer.address": (c) => c.customer?.address,

  "site.address": (c) => c.site?.address,
  "site.name": (c) => c.site?.name,
  "site.substation": (c) => c.site?.substation,
  "site.equipmentLocation": (c) => c.site?.equipmentLocation,

  "technician.name": (c) => c.technician?.name,
  "technician.email": (c) => c.technician?.email,

  "asset.name": (c) => c.asset?.name,
  "asset.identifier": (c) => c.asset?.identifier,

  "equipment.manufacturer": (c) => c.equipment?.manufacturer,
  "equipment.model": (c) => c.equipment?.model,
  "equipment.serialNumber": (c) => c.equipment?.serialNumber,
  "equipment.ratedVoltage": (c) => c.equipment?.ratedVoltage,
  "equipment.ratedCurrent": (c) => c.equipment?.ratedCurrent,

  "company.name": (c) => c.company?.name,
  "company.logoUrl": (c) => c.company?.logoUrl,

  "environment.temperatureF": (c) => c.environment?.temperatureF,
  "environment.temperatureC": (c) => c.environment?.temperatureC,
  "environment.tcf": (c) => c.environment?.tcf,
  "environment.humidity": (c) => c.environment?.humidity,
};

/**
 * Resolve one binding. Row-scoped bindings need the state key of the row being
 * rendered; without it they resolve to undefined rather than to another row's
 * value, which would be worse than blank.
 */
export function resolveBinding(
  bindingId: string,
  context: BindingContext,
  rowStateKey?: string,
): unknown {
  const definition = BY_ID.get(bindingId);
  if (!definition) return undefined;

  if (definition.rowScoped) {
    if (!rowStateKey) return undefined;
    const field = bindingId.split(".")[1];
    return context.rows?.[rowStateKey]?.[field];
  }

  return RESOLVERS[bindingId]?.(context);
}

/** Every non-row-scoped binding, for condition evaluation. */
export function resolveAllBindings(
  context: BindingContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const binding of BINDING_REGISTRY) {
    if (binding.rowScoped) continue;
    out[binding.id] = RESOLVERS[binding.id]?.(context);
  }
  return out;
}
