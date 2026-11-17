import { Check } from "lucide-react";
import { useDivisions } from "@/hooks/useDivisions";
import {
  fieldTechDivisionIds,
  jobDivisionOptions,
} from "@/services/divisionsService";

/**
 * Division checkboxes for the opportunity list and calendar. Both views save
 * the picks to the same preference (filters.opportunityList.divisionFilter),
 * so one choice becomes that person's default in both places. Empty = all.
 *
 * "Field Services" is a shortcut that ticks every field tech city at once.
 * It also covers old opportunities tagged with the combined "field_tech" id.
 */
export function DivisionFilterOptions({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const divisions = useDivisions();
  const options = jobDivisionOptions(divisions);
  const fieldIds = [...fieldTechDivisionIds(divisions), "field_tech"];
  const cityIds = fieldIds.filter((id) => id !== "field_tech");
  const allField =
    cityIds.length > 0 && cityIds.every((id) => selected.includes(id));

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((v) => v !== id)
        : [...selected, id],
    );

  const toggleField = () =>
    onChange(
      allField
        ? selected.filter((v) => !fieldIds.includes(v))
        : Array.from(new Set([...selected, ...fieldIds])),
    );

  const row = (
    key: string,
    label: string,
    checked: boolean,
    onClick: () => void,
    indent = false,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-none px-2 py-1 text-left text-sm leading-tight focus:outline-none focus:ring-2 focus:ring-brand ${
        indent ? "pl-6" : ""
      } ${
        checked
          ? "text-brand"
          : "text-neutral-700 hover:bg-neutral-50 dark:text-white dark:hover:bg-dark-100"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-none border ${
          checked
            ? "border-brand bg-brand text-white"
            : "border-neutral-300 dark:border-dark-300"
        }`}
        aria-hidden
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="space-y-0.5">
      {cityIds.length > 0 &&
        row("__field_services", "Field Services", allField, toggleField)}
      {options.map((d) =>
        row(
          d.id,
          d.label,
          selected.includes(d.id),
          () => toggle(d.id),
          d.is_field_tech,
        ),
      )}
    </div>
  );
}

export default DivisionFilterOptions;
