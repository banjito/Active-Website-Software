/**
 * What each Job Details field starts with on a new report: a value linked from
 * the job overview, a typed value, or nothing.
 *
 * Values are copied once, when the report is created. A report never follows
 * later changes to the job, so a finished report stays as it was issued.
 *
 * Temperature and humidity start blank unless the builder set `jobFill`. Saved
 * templates carry an automatic 68 / 50 in `defaultValue`, which nobody chose, so
 * that value is not treated as a default for these two fields.
 */

import { FieldType, type FieldConfig } from '@/lib/types/customForms';
import { todayISO } from '@/lib/types/testScheduling';
import { formatDivisionDisplay } from '@/lib/utils/divisionDisplay';
import { fahrenheitToCelsius, getRoundedTCF } from '@/lib/utils/temperatureCorrection';

export interface JobFillSource {
  id: string;
  label: string;
  group: 'Job overview' | 'Report';
  kind: 'text' | 'date' | 'number';
}

/** Everything a Job Details field can link to. */
export const JOB_FILL_SOURCES: JobFillSource[] = [
  { id: 'customer.name', label: 'Customer', group: 'Job overview', kind: 'text' },
  { id: 'customer.address', label: 'Customer Address', group: 'Job overview', kind: 'text' },
  { id: 'job.number', label: 'Job #', group: 'Job overview', kind: 'text' },
  { id: 'job.title', label: 'Job Title', group: 'Job overview', kind: 'text' },
  { id: 'site.address', label: 'Job Site', group: 'Job overview', kind: 'text' },
  { id: 'job.endUser', label: 'User', group: 'Job overview', kind: 'text' },
  { id: 'job.division', label: 'Division', group: 'Job overview', kind: 'text' },
  { id: 'job.fireteamLead', label: 'Fireteam Lead', group: 'Job overview', kind: 'text' },
  { id: 'job.description', label: 'Description', group: 'Job overview', kind: 'text' },
  { id: 'job.startDate', label: 'Start Date', group: 'Job overview', kind: 'date' },
  { id: 'job.dueDate', label: 'Due Date', group: 'Job overview', kind: 'date' },
  { id: 'job.estimatedManHours', label: 'Est. Man Hours', group: 'Job overview', kind: 'number' },
  { id: 'report.today', label: "Today's date", group: 'Report', kind: 'date' },
];

const SOURCE_BY_ID = new Map(JOB_FILL_SOURCES.map((source) => [source.id, source]));

/** Fields that have always filled themselves in, before they had a setting. */
const BUILT_IN_SOURCES: Record<string, string> = {
  customer: 'customer.name',
  siteAddress: 'site.address',
  jobNumber: 'job.number',
  date: 'report.today',
  user: 'job.endUser',
};

export type JobFillContext = Record<string, string | number | null | undefined>;

/** The job fields this module reads; a `useJobDetails` result fits. */
export interface JobFillJob {
  job_number?: string | null;
  title?: string | null;
  description?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  division?: string | null;
  site_address?: string | null;
  end_user?: string | null;
  fireteam_lead?: string | null;
  estimated_man_hours?: number | null;
  customer?: { name?: string | null; company_name?: string | null; address?: string | null };
  formattedCustomerName?: string | null;
}

/** Demo mode hides customer details, here as on the job overview. */
export interface JobFillMasks {
  name?: (value: string | null | undefined) => string;
  address?: (value: string | null | undefined) => string;
  hideDescription?: boolean;
}

export function jobFillContext(job: JobFillJob, masks: JobFillMasks = {}): JobFillContext {
  const name = (value: string | null | undefined) => {
    const text = value?.trim();
    return text ? (masks.name ? masks.name(text) : text) : '';
  };
  const address = (value: string | null | undefined) => {
    const text = value?.trim();
    return text ? (masks.address ? masks.address(text) : text) : '';
  };
  return {
    'customer.name': name(job.customer?.company_name || job.formattedCustomerName || job.customer?.name),
    'customer.address': address(job.customer?.address),
    'job.number': job.job_number,
    'job.title': job.title,
    'site.address': address(job.site_address || job.customer?.address),
    'job.endUser': name(job.end_user),
    'job.division': job.division ? formatDivisionDisplay(job.division) : '',
    'job.fireteamLead': job.fireteam_lead,
    'job.description': masks.hideDescription ? '' : job.description,
    'job.startDate': job.start_date,
    'job.dueDate': job.due_date,
    'job.estimatedManHours': job.estimated_man_hours,
    'report.today': todayISO(),
  };
}

const isTemperature = (field: FieldConfig) => field.type === FieldType.TEMPERATURE || field.id === 'temperature';
const isEnvironment = (field: FieldConfig) => isTemperature(field) || field.id === 'humidity';

/** Calculated and drawn fields have nothing to start with. */
export function canHaveJobFill(field: FieldConfig): boolean {
  if (field.id === 'tcf' || field.calculation) return false;
  const excluded: FieldType[] = [
    FieldType.TEMPERATURE_HUMIDITY,
    FieldType.CALCULATED,
    FieldType.CHECKBOX,
    FieldType.SIGNATURE,
    FieldType.PHOTO,
  ];
  return !excluded.includes(field.type);
}

/** The sources that make sense for a field: a date box can only hold a date. */
export function jobFillSourcesFor(field: FieldConfig): JobFillSource[] {
  if (isEnvironment(field)) return [];
  if (field.type === FieldType.DATE) return JOB_FILL_SOURCES.filter((s) => s.kind === 'date');
  if (field.type === FieldType.NUMBER) return JOB_FILL_SOURCES.filter((s) => s.kind === 'number');
  return JOB_FILL_SOURCES;
}

/** The field's setting, including what a template saved before the setting existed means. */
export function jobFillSetting(field: FieldConfig): NonNullable<FieldConfig['jobFill']> {
  if (field.jobFill) return field.jobFill;
  const source = BUILT_IN_SOURCES[field.id];
  if (source) return { source };
  if (isEnvironment(field)) return {};
  const value = field.defaultValue;
  return value === undefined || value === null || value === '' ? {} : { value: String(value) };
}

function printedDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : iso;
}

function startText(field: FieldConfig, context: JobFillContext): string {
  const { source: sourceId, value } = jobFillSetting(field);
  if (!sourceId) return value ?? '';
  // A field whose type changed after it was linked can no longer hold the value.
  const source = jobFillSourcesFor(field).find((s) => s.id === sourceId);
  if (!source) return '';
  const raw = context[sourceId];
  const text = raw === undefined || raw === null ? '' : String(raw).trim();
  if (source.kind !== 'date') return text;
  return field.type === FieldType.DATE ? text.slice(0, 10) : printedDate(text);
}

/**
 * The saved values a new report's Job Details block starts with.
 *
 * A blank is written out only where a stored default would otherwise show
 * through, since a saved "" stays blank and a missing value uses the default.
 */
export function jobInfoStartValues(
  fields: readonly FieldConfig[],
  context: JobFillContext,
): Record<string, string> {
  const out: Record<string, string> = {};
  const setTemperature = (text: string) => {
    const fahrenheit = parseFloat(text);
    if (isNaN(fahrenheit)) {
      out.temperature = '';
      out.temperatureCelsius = '';
      out.tcf = '';
      return;
    }
    const celsius = fahrenheitToCelsius(fahrenheit);
    out.temperature = String(fahrenheit);
    out.temperatureCelsius = celsius.toFixed(2);
    out.tcf = getRoundedTCF(celsius).toFixed(3);
  };

  for (const field of fields) {
    if (field.type === FieldType.TEMPERATURE_HUMIDITY) {
      setTemperature('');
      out.humidity = '';
    } else if (!canHaveJobFill(field)) {
      continue;
    } else if (isTemperature(field)) {
      setTemperature(startText(field, context));
    } else {
      const text = startText(field, context);
      const hasStoredDefault = field.defaultValue !== undefined && field.defaultValue !== null;
      if (text !== '' || hasStoredDefault) out[field.id] = text;
    }
  }
  return out;
}

/** Short builder label for where a field starts, or "" when it starts blank. */
export function jobFillLabel(field: FieldConfig): string {
  const { source, value } = jobFillSetting(field);
  if (source) {
    const found = SOURCE_BY_ID.get(source);
    if (!found) return '';
    return found.group === 'Report' ? found.label : `Job: ${found.label}`;
  }
  return value ? `Starts: ${value}` : '';
}
