import React, { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { toast } from "react-hot-toast";
import { createScheduledTests } from "@/services/scheduledTestsService";
import {
  EQUIPMENT_STATUS_OPTIONS,
  TESTING_STATUS_OPTIONS,
  addWorkingDays,
  formatDateRange,
  nextWorkingDay,
  workingDaysBetween,
  type EquipmentStatus,
  type ScheduledTest,
  type ScheduledTestInput,
  type TestingStatus,
} from "@/lib/types/testScheduling";
import {
  groupReportTemplates,
  useReportTemplateChoices,
  type ReportTemplateChoice,
} from "./useReportTemplateChoices";
import type { EquipmentAssetWithCounts } from "@/lib/types/assetTracking";

interface ScheduleTestDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  /** Job to tag the scheduled tests with, when scheduling from a job's Assets tab. */
  jobId?: string;
  /** The assets being scheduled. One for the row action, many for the bulk bar. */
  assets: EquipmentAssetWithCounts[];
  /**
   * Every asset at the site. Used to find the children of a parent being scheduled, so a
   * switchgear lineup goes in as one action instead of six.
   */
  siteAssets?: EquipmentAssetWithCounts[];
  /** Scheduled tests that already exist, to warn about scheduling the same scope twice. */
  existingTests?: ScheduledTest[];
  userId?: string;
  onScheduled: (created: ScheduledTest[], batchId: string | null) => void;
}

/** The free-text escape hatch, kept at the bottom of the template list. */
const OTHER_KEY = "other";

/**
 * Schedule a test against one asset or a whole selection.
 *
 * The batch path is not a convenience feature here. The pilot site's schedule is eight
 * data halls running the same 29-activity pattern, so scheduling a hall at a time is the
 * normal way to use this, and one-at-a-time is the exception.
 */
export function ScheduleTestDialog({
  open,
  onClose,
  siteId,
  jobId,
  assets,
  siteAssets,
  existingTests,
  userId,
  onScheduled,
}: ScheduleTestDialogProps) {
  const { choices } = useReportTemplateChoices(open);

  const [templateKey, setTemplateKey] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [finishDate, setFinishDate] = useState("");
  const [equipmentStatus, setEquipmentStatus] = useState("");
  const [testingStatus, setTestingStatus] = useState<TestingStatus>("not_started");
  const [notes, setNotes] = useState("");
  const [includeChildren, setIncludeChildren] = useState(true);
  const [saving, setSaving] = useState(false);

  const isBatch = assets.length > 1;

  /**
   * Sub-assets of the selected assets that aren't themselves selected. Scheduling a
   * switchgear almost always means scheduling what's inside it, so this is offered
   * checked — but as a checkbox, because "test the lineup only" is a real scope.
   */
  const children = useMemo(() => {
    if (!siteAssets || siteAssets.length === 0) return [];
    const selectedIds = new Set(assets.map((a) => a.id));
    return siteAssets.filter(
      (a) => a.parent_asset_id && selectedIds.has(a.parent_asset_id) && !selectedIds.has(a.id),
    );
  }, [siteAssets, assets]);

  useEffect(() => {
    if (!open) return;
    const start = nextWorkingDay();
    setTemplateKey("");
    setTemplateSearch("");
    setTemplateOpen(false);
    setOtherText("");
    setStartDate(start);
    // Default window is a single working day. The P6 export's typical activity is five
    // days, but guessing five here would silently overstate every hand-entered test.
    setFinishDate(start);
    setEquipmentStatus(singleAssetStatus(assets, existingTests));
    setTestingStatus("not_started");
    setNotes("");
    setIncludeChildren(true);
    setSaving(false);
  }, [open, assets, existingTests]);

  const selectedTemplate: ReportTemplateChoice | undefined = useMemo(
    () => choices.find((c) => c.key === templateKey),
    [choices, templateKey],
  );

  const templateGroups = useMemo(
    () => groupReportTemplates(choices, templateSearch),
    [choices, templateSearch],
  );

  /** All the assets this save will create a row for, parents plus opted-in children. */
  const targets = useMemo(
    () => (includeChildren ? [...assets, ...children] : assets),
    [assets, children, includeChildren],
  );

  /**
   * Warn — never block — when the same scope is already scheduled on an asset. Re-testing
   * after a failure is normal, so a second row is often exactly what's wanted.
   */
  const duplicateWarning = useMemo(() => {
    if (!existingTests || !templateKey || templateKey === OTHER_KEY) return null;
    const template = selectedTemplate;
    if (!template) return null;

    const targetIds = new Set(targets.map((a) => a.id));
    const clash = existingTests.find(
      (t) =>
        targetIds.has(t.equipment_asset_id) &&
        ((template.slug && t.report_slug === template.slug) ||
          (template.customFormTemplateId &&
            t.custom_form_template_id === template.customFormTemplateId)),
    );
    if (!clash) return null;

    const asset = targets.find((a) => a.id === clash.equipment_asset_id);
    return `${asset?.identifier ?? "This asset"} already has ${template.name} scheduled ${formatDateRange(clash.start_date, clash.finish_date)}. Schedule another?`;
  }, [existingTests, templateKey, selectedTemplate, targets]);

  /** Typing a start with no finish fills the finish in, in working days. */
  const handleStartChange = (value: string) => {
    setStartDate(value);
    if (!value) return;
    if (!finishDate || finishDate < value) setFinishDate(value);
  };

  const duration =
    startDate && finishDate ? workingDaysBetween(startDate, finishDate) : 0;

  const typeSummary = useMemo(() => summarizeTypes(targets), [targets]);

  const workIsSet = templateKey === OTHER_KEY ? otherText.trim().length > 0 : !!templateKey;
  const datesValid = !startDate || !finishDate || finishDate >= startDate;

  const save = async () => {
    if (!workIsSet || !datesValid || targets.length === 0) return;
    setSaving(true);
    try {
      const work =
        templateKey === OTHER_KEY
          ? { work_scheduled_text: otherText.trim() }
          : {
              report_slug: selectedTemplate?.slug ?? null,
              custom_form_template_id: selectedTemplate?.customFormTemplateId ?? null,
            };

      const inputs: ScheduledTestInput[] = targets.map((asset) => ({
        site_id: siteId,
        equipment_asset_id: asset.id,
        job_id: jobId ?? null,
        start_date: startDate || null,
        finish_date: finishDate || null,
        equipment_status: (equipmentStatus || null) as EquipmentStatus | null,
        testing_status: testingStatus,
        notes: notes.trim() || null,
        ...work,
      }));

      const label =
        templateKey === OTHER_KEY ? otherText.trim() : (selectedTemplate?.name ?? "test");
      const { created, batchId } = await createScheduledTests(
        inputs,
        userId,
        `Scheduled ${label} on ${inputs.length} item${inputs.length === 1 ? "" : "s"}`,
      );

      toast.success(
        created.length === 1
          ? `${targets[0].identifier} scheduled`
          : `${created.length} items scheduled`,
      );
      onScheduled(created, batchId);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to schedule");
    } finally {
      setSaving(false);
    }
  };

  const templateLabel =
    templateKey === OTHER_KEY
      ? "Other — describe"
      : (selectedTemplate?.name ?? "Choose what work is scheduled…");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            {isBatch ? `Schedule test — ${assets.length} assets` : "Schedule test"}
          </DialogTitle>
          <DialogDescription>
            {isBatch
              ? `One scope of work and one date window applied to all of them. ${typeSummary}`
              : "This adds a row to the Project Tracker. Completing its report closes it out."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {!isBatch && assets[0] && (
            <div className="border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
              <span className="font-medium">{assets[0].identifier}</span>
              {assets[0].substation && (
                <span className="text-neutral-500 dark:text-neutral-400">
                  {" "}
                  · {assets[0].substation}
                </span>
              )}
              {assets[0].equipment_type && (
                <span className="text-neutral-500 dark:text-neutral-400">
                  {" "}
                  · {assets[0].equipment_type}
                </span>
              )}
            </div>
          )}

          {/* ── Work scheduled ── */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-dark-primary dark:text-dark-secondary">
              Work scheduled <span className="text-destructive">*</span>
            </label>
            <button
              type="button"
              onClick={() => setTemplateOpen((o) => !o)}
              className="flex w-full items-center justify-between border-2 border-dark-accent/30 bg-white px-4 py-2.5 text-left text-sm dark:border-dark-300 dark:bg-dark-150"
              aria-expanded={templateOpen}
            >
              <span
                className={
                  templateKey ? "" : "text-dark-primary/40 dark:text-dark-secondary/40"
                }
              >
                {templateLabel}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
            </button>

            {templateOpen && (
              <div className="mt-1 border border-neutral-200 dark:border-neutral-700">
                <div className="border-b border-neutral-200 p-2 dark:border-neutral-700">
                  <Input
                    autoFocus
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search report types…"
                    leftIcon={<Search className="h-4 w-4" />}
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {templateGroups.map((group) => (
                    <div key={group.label}>
                      <div className="bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-500 dark:bg-neutral-900 dark:text-neutral-300">
                        {group.label}
                      </div>
                      {group.items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setTemplateKey(item.key);
                            setTemplateOpen(false);
                          }}
                          className="block w-full truncate px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateKey(OTHER_KEY);
                      setTemplateOpen(false);
                    }}
                    className="block w-full border-t border-neutral-200 px-4 py-2 text-left text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-700"
                  >
                    Other — describe
                  </button>
                </div>
              </div>
            )}

            {templateKey === OTHER_KEY && (
              <Input
                autoFocus
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="e.g. Primary injection, functional trip test"
                className="mt-2"
              />
            )}
          </div>

          {duplicateWarning && (
            <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              {duplicateWarning}
            </p>
          )}

          {/* ── Dates ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="date"
              label="Start date"
              value={startDate}
              onChange={(e) => handleStartChange(e.target.value)}
            />
            <Input
              type="date"
              label="Finish date"
              value={finishDate}
              min={startDate || undefined}
              onChange={(e) => setFinishDate(e.target.value)}
              error={datesValid ? undefined : "Finish can't be before start"}
            />
          </div>

          {startDate && finishDate && datesValid && (
            <p className="-mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              {formatDateRange(startDate, finishDate)} · {duration} working day
              {duration === 1 ? "" : "s"}
              {duration === 0 && " (weekend — pick a weekday)"}
              <button
                type="button"
                onClick={() => setFinishDate(addWorkingDays(startDate, 4))}
                className="ml-2 text-brand hover:underline"
              >
                Make it a 5-day window
              </button>
            </p>
          )}

          {/* ── Statuses ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Equipment status"
              value={equipmentStatus}
              onChange={(e) => setEquipmentStatus(e.target.value)}
              options={[
                { value: "", label: "Not set" },
                ...EQUIPMENT_STATUS_OPTIONS,
              ]}
              hint="Blank is fine — it means nobody has said yet."
            />
            <Select
              label="Testing status"
              value={testingStatus}
              onChange={(e) => setTestingStatus(e.target.value as TestingStatus)}
              options={TESTING_STATUS_OPTIONS}
            />
          </div>

          <Textarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything the crew needs to know before they walk up to it"
          />

          {children.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2 border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={includeChildren}
                onChange={(e) => setIncludeChildren(e.target.checked)}
              />
              <span>
                Also schedule the {children.length} item
                {children.length === 1 ? "" : "s"} inside{" "}
                {assets.length === 1 ? assets[0].identifier : "the selected assets"}
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  Switches, CTs and relays in a lineup are usually tested with it.
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !workIsSet || !datesValid}>
            {saving
              ? "Scheduling…"
              : `Schedule ${targets.length} item${targets.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Seed Equipment status from what this asset was last scheduled with, so re-scheduling a
 * breaker that's already Ready for Testing doesn't quietly reset it to blank.
 */
function singleAssetStatus(
  assets: EquipmentAssetWithCounts[],
  existingTests?: ScheduledTest[],
): string {
  if (assets.length !== 1 || !existingTests) return "";
  const previous = existingTests
    .filter((t) => t.equipment_asset_id === assets[0].id && t.equipment_status)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0];
  return previous?.equipment_status ?? "";
}

/** "8 Medium Voltage Circuit Breaker, 4 Switchgear." — what the batch header shows. */
function summarizeTypes(assets: EquipmentAssetWithCounts[]): string {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const type = asset.equipment_type?.trim() || "Untyped";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const parts = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${count} ${type}`);
  return parts.join(", ") + ".";
}

export default ScheduleTestDialog;
