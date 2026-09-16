import React from "react";
import {
  getPath,
  type ReportAssetProfile,
  type ReportField,
} from "@/lib/reportAssetProfiles";

// The on-screen Job Information and Nameplate Data fields of a report, drawn from its
// profile in src/lib/reportAssetProfiles.ts.
//
// Both the report form and the asset editor render these, so an asset looks and fills in
// exactly like the report it is meant for, and a field added to the profile shows up in
// both places at once. Section headings and the print-only tables stay in each report.

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

interface SectionFieldsProps {
  profile: ReportAssetProfile;
  /** The report's form state (or the asset editor's copy of it). */
  values: unknown;
  onChange: (path: string, value: any) => void;
  isEditing: boolean;
  /**
   * "asset": per-visit fields are shown blank and disabled, because they are filled on each
   * report rather than stored on the equipment.
   */
  mode?: "report" | "asset";
  /** What to show instead of the stored value, e.g. a demo-masked customer name. */
  displayValues?: Record<string, string>;
  /** Extra input attributes per path: onBlur handlers, datalist ids. */
  fieldProps?: Record<string, InputProps>;
}

interface JobInfoFieldsProps extends SectionFieldsProps {
  /** The report's own temperature handlers, which keep °C and TCF in step. */
  onFahrenheitChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCelsiusChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const READ_ONLY_BG = "bg-neutral-100 dark:bg-dark-150";
const UNDERLINE_LABEL =
  "inline-block w-24 font-medium text-neutral-700 dark:text-neutral-300";
const UNDERLINE_BOX = "border-b border-neutral-300 dark:border-neutral-600";

/** Numbers the report stores as 0 until someone types one read better as blank. */
const numberText = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value !== 0 ? value : "";

const labelText = (profile: ReportAssetProfile, field: ReportField) =>
  profile.labelColon ? `${field.label}:` : field.label;

interface FieldState {
  readOnly: boolean;
  /** A per-visit field in the asset editor. */
  perVisit: boolean;
  value: unknown;
}

function fieldState(props: SectionFieldsProps, field: ReportField): FieldState {
  const perVisit = props.mode === "asset" && field.scope === "job";
  return {
    perVisit,
    readOnly: perVisit || !!field.locked || !props.isEditing,
    value: perVisit
      ? ""
      : (props.displayValues?.[field.path] ?? getPath(props.values, field.path) ?? ""),
  };
}

const perVisitProps = (state: FieldState): InputProps =>
  state.perVisit ? { placeholder: "Per report", tabIndex: -1 } : {};

function SelectInput({
  field,
  state,
  onChange,
  className,
}: {
  field: ReportField;
  state: FieldState;
  onChange: (value: string) => void;
  className: string;
}) {
  const value = String(state.value ?? "");
  const options = field.options ?? [];
  // A value from before the dropdown existed still shows instead of reading as unset.
  const unlisted = value && !options.some((o) => o.value === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={state.readOnly}
      className={className}
    >
      {!options.some((o) => o.value === "") && <option value="">Select...</option>}
      {unlisted && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.value ? o.label : "Select..."}
        </option>
      ))}
    </select>
  );
}

/** Humidity is optional; clearing it stores null rather than 0. */
const humidityValue = (raw: string) => (raw === "" ? null : Number(raw));

// ── Job Information ───────────────────────────────────────────────────────────

export function ReportJobInfoFields(props: JobInfoFieldsProps) {
  const { profile } = props;
  if (profile.jobInfoLayout === "grid-5") return <GridFiveJobInfo {...props} />;
  if (profile.jobInfoLayout === "two-column") return <TwoColumnJobInfo {...props} />;
  return <GridSixJobInfo {...props} />;
}

const TEMPERATURE_KINDS = new Set(["fahrenheit", "celsius", "tcf", "humidity"]);

function temperatureOnChange(
  props: JobInfoFieldsProps,
  field: ReportField,
): ((e: React.ChangeEvent<HTMLInputElement>) => void) | undefined {
  switch (field.kind) {
    case "fahrenheit":
      return props.onFahrenheitChange;
    case "celsius":
      return props.onCelsiusChange;
    case "humidity":
      return (e) => props.onChange(field.path, humidityValue(e.target.value));
    default:
      return undefined;
  }
}

const UNIT: Record<string, string> = { fahrenheit: "°F", celsius: "°C", humidity: "%" };

/** LV breaker 25: five across, temperature on its own row of four. */
function GridFiveJobInfo(props: JobInfoFieldsProps) {
  const { profile } = props;
  const main = profile.jobInfo.filter((f) => !TEMPERATURE_KINDS.has(f.kind ?? ""));
  const temperature = profile.jobInfo.filter((f) => TEMPERATURE_KINDS.has(f.kind ?? ""));

  return (
    <div className="grid grid-cols-5 gap-x-10 gap-y-5 print:hidden job-info-onscreen">
      {main.map((field) => {
        const state = fieldState(props, field);
        return (
          <div key={field.path} className="flex flex-col min-w-0">
            <label className="form-label">{labelText(profile, field)}</label>
            <input
              {...(state.perVisit ? {} : props.fieldProps?.[field.path])}
              {...perVisitProps(state)}
              type={field.kind === "date" ? "date" : "text"}
              value={String(state.value)}
              onChange={(e) => props.onChange(field.path, e.target.value)}
              readOnly={state.readOnly}
              className={`form-input w-full min-w-0 ${state.readOnly ? READ_ONLY_BG : ""}`}
            />
          </div>
        );
      })}
      <div className="col-span-5 grid grid-cols-4 gap-x-10 gap-y-0 pt-1">
        {temperature.map((field) => {
          const state = fieldState(props, field);
          const unit = UNIT[field.kind ?? ""];
          const input = (
            <input
              {...perVisitProps(state)}
              type="number"
              value={field.kind === "tcf" ? String(state.value) : numberText(state.value)}
              onChange={temperatureOnChange(props, field)}
              readOnly={state.readOnly}
              className={`form-input w-10 text-sm py-1 ${state.readOnly ? READ_ONLY_BG : ""}`}
            />
          );
          return (
            <div key={field.path} className="flex flex-col min-w-0">
              <label className="form-label">{labelText(profile, field)}</label>
              {unit ? (
                <div className="flex items-center gap-1">
                  {input}
                  <span className="text-xs">{unit}</span>
                </div>
              ) : (
                input
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** LV assemblies ATS 25: two columns of underlined label/value rows. */
function TwoColumnJobInfo(props: JobInfoFieldsProps) {
  const { profile } = props;
  const inputClass = (state: FieldState) =>
    `w-full bg-transparent border-none focus:ring-0 ${state.readOnly ? "cursor-default" : ""}`;

  const row = (field: ReportField) => {
    const state = fieldState(props, field);

    if (field.kind === "temperature-line") {
      const temperature = (state.perVisit ? {} : (state.value ?? {})) as {
        fahrenheit?: number;
        celsius?: number;
        tcf?: number;
      };
      return (
        <div key={field.path} className="mb-4 flex items-center">
          <label className={UNDERLINE_LABEL}>{labelText(profile, field)}</label>
          <div className="flex-1 flex items-center">
            <div className={`w-16 ${UNDERLINE_BOX}`}>
              <input
                tabIndex={state.perVisit ? -1 : undefined}
                type="number"
                value={numberText(temperature.fahrenheit)}
                onChange={props.onFahrenheitChange}
                readOnly={state.readOnly}
                className={inputClass(state)}
              />
            </div>
            <span className="mx-2">°F</span>
            <span className="mx-2">{state.perVisit ? "" : temperature.celsius}</span>
            <span className="mx-2">°C</span>
            <span className="mx-5">TCF</span>
            <div className={`w-16 ${UNDERLINE_BOX}`}>
              <input
                type="text"
                tabIndex={state.perVisit ? -1 : undefined}
                value={
                  typeof temperature.tcf === "number" ? temperature.tcf.toFixed(3) : ""
                }
                readOnly
                className={inputClass({ ...state, readOnly: true })}
              />
            </div>
          </div>
        </div>
      );
    }

    if (field.kind === "humidity") {
      return (
        <div key={field.path} className="mb-4 flex">
          <label className={UNDERLINE_LABEL}>{labelText(profile, field)}</label>
          <div className="flex items-center flex-1">
            <div className={`flex-1 ${UNDERLINE_BOX}`}>
              <input
                {...perVisitProps(state)}
                type="number"
                value={numberText(state.value)}
                onChange={temperatureOnChange(props, field)}
                readOnly={state.readOnly}
                className={inputClass(state)}
              />
            </div>
            <span className="ml-2">%</span>
          </div>
        </div>
      );
    }

    return (
      <div key={field.path} className="mb-4 flex">
        <label className={UNDERLINE_LABEL}>{labelText(profile, field)}</label>
        <div className={`flex-1 ${UNDERLINE_BOX}`}>
          <input
            {...(state.perVisit ? {} : props.fieldProps?.[field.path])}
            {...perVisitProps(state)}
            type={field.kind === "date" ? "date" : "text"}
            value={String(state.value)}
            onChange={(e) => props.onChange(field.path, e.target.value)}
            readOnly={state.readOnly}
            className={inputClass(state)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-6 print:hidden job-info-onscreen">
      <div>{profile.jobInfo.filter((f) => f.side !== "right").map(row)}</div>
      <div>{profile.jobInfo.filter((f) => f.side === "right").map(row)}</div>
    </div>
  );
}

/** Switchgear/panelboard MTS: a six-wide grid of labelled inputs. */
function GridSixJobInfo(props: JobInfoFieldsProps) {
  const { profile } = props;
  const WIDTH: Record<string, string> = {
    fahrenheit: "w-20",
    celsius: "w-32 min-w-[7rem]",
    tcf: "w-16",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden job-info-onscreen">
      {profile.jobInfo.map((field) => {
        const state = fieldState(props, field);
        const kind = field.kind ?? "text";
        const bg = state.readOnly ? READ_ONLY_BG : "";

        let input: React.ReactNode;
        if (kind === "fahrenheit" || kind === "celsius" || kind === "tcf") {
          const shown =
            kind === "tcf"
              ? typeof state.value === "number"
                ? state.value.toFixed(3)
                : ""
              : numberText(state.value);
          input = (
            <>
              <input
                {...perVisitProps(state)}
                type="number"
                value={shown}
                onChange={temperatureOnChange(props, field)}
                readOnly={state.readOnly}
                className={`form-input ${WIDTH[kind]} ${bg}`}
              />
              {kind === "fahrenheit" && <span className="ml-1">°F</span>}
            </>
          );
        } else if (kind === "humidity") {
          input = (
            <input
              {...perVisitProps(state)}
              type="number"
              value={numberText(state.value)}
              onChange={temperatureOnChange(props, field)}
              readOnly={state.readOnly}
              placeholder={state.perVisit ? "Per report" : "Optional"}
              className={`form-input w-full ${bg}`}
            />
          );
        } else {
          input = (
            <input
              {...(state.perVisit ? {} : props.fieldProps?.[field.path])}
              {...perVisitProps(state)}
              type={kind === "date" ? "date" : "text"}
              value={String(state.value)}
              onChange={(e) => props.onChange(field.path, e.target.value)}
              readOnly={state.readOnly}
              className={`form-input w-full ${bg}`}
            />
          );
        }

        return (
          <div key={field.path} className={field.className}>
            <label className="form-label">{labelText(profile, field)}</label>
            {input}
          </div>
        );
      })}
    </div>
  );
}

// ── Nameplate Data ────────────────────────────────────────────────────────────

export function ReportNameplateFields(props: SectionFieldsProps) {
  const { profile } = props;
  return (
    <div className={`${profile.nameplateGridClassName} print:hidden nameplate-onscreen`}>
      {profile.nameplate.map((field) => {
        const state = fieldState(props, field);
        const className = `form-input w-full ${state.readOnly ? READ_ONLY_BG : ""}`;
        return (
          <div key={field.path}>
            <label className="form-label">{labelText(profile, field)}</label>
            {field.kind === "select" ? (
              <SelectInput
                field={field}
                state={state}
                className={className}
                onChange={(value) => props.onChange(field.path, value)}
              />
            ) : (
              <input
                {...props.fieldProps?.[field.path]}
                type="text"
                value={String(state.value)}
                onChange={(e) => props.onChange(field.path, e.target.value)}
                readOnly={state.readOnly}
                className={className}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The brand bar and heading every report puts above a section. */
export function ReportSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="w-full h-1 bg-brand mb-4"></div>
      <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white border-b dark:border-neutral-700 pb-2">
        {children}
      </h2>
    </>
  );
}
