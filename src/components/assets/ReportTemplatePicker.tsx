import React, { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import Input from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { supabase } from "@/lib/supabase";
import { REPORT_NAMES } from "@/components/reports/reportMappings";

interface CustomFormTemplate {
  id: string;
  name: string;
  neta_section?: string | null;
}

export interface ReportTemplateChoice {
  /** Route slug for a built-in report, or undefined for a custom form. */
  slug?: string;
  /** Template id for a custom form. */
  customFormTemplateId?: string;
  name: string;
}

interface ReportTemplatePickerProps {
  open: boolean;
  onClose: () => void;
  /** Identifier of the asset the report will be created for — shown in the header. */
  assetLabel: string;
  onPick: (choice: ReportTemplateChoice) => void;
}

/**
 * Choose which report form to fill in for a given asset.
 *
 * Reads REPORT_NAMES (the canonical slug -> title map) rather than keeping its own list,
 * so a new report type shows up here as soon as it is registered there. Equipment type
 * does not filter this list — it's free text, and we don't want it locking anyone out of
 * a form they need.
 */
export function ReportTemplatePicker({
  open,
  onClose,
  assetLabel,
  onPick,
}: ReportTemplatePickerProps) {
  const [search, setSearch] = useState("");
  const [customForms, setCustomForms] = useState<CustomFormTemplate[]>([]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    (async () => {
      try {
        const { data, error } = await supabase
          .schema("neta_ops")
          .from("custom_form_templates")
          .select("id, name, neta_section")
          .eq("is_active", true)
          .eq("is_published", true)
          .order("name");
        setCustomForms(error ? [] : (data ?? []));
      } catch {
        setCustomForms([]);
      }
    })();
  }, [open]);

  /** ATS/MTS is carried in the report title itself, so group off that. */
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const ats: ReportTemplateChoice[] = [];
    const mts: ReportTemplateChoice[] = [];
    const other: ReportTemplateChoice[] = [];

    for (const [slug, name] of Object.entries(REPORT_NAMES)) {
      if (term && !name.toLowerCase().includes(term)) continue;
      const choice: ReportTemplateChoice = { slug, name };
      if (/\bATS\b/.test(name)) ats.push(choice);
      else if (/\bMTS\b/.test(name)) mts.push(choice);
      else other.push(choice);
    }

    const custom = customForms
      .filter((t) => !term || t.name.toLowerCase().includes(term))
      .map((t) => ({
        customFormTemplateId: t.id,
        name: t.neta_section ? `${t.name} (${t.neta_section})` : t.name,
      }));

    const byName = (a: ReportTemplateChoice, b: ReportTemplateChoice) =>
      a.name.localeCompare(b.name);

    return [
      { label: "ATS Reports", items: ats.sort(byName) },
      { label: "MTS Reports", items: mts.sort(byName) },
      { label: "Other Reports", items: other.sort(byName) },
      { label: "Custom Forms", items: custom.sort(byName) },
    ].filter((g) => g.items.length > 0);
  }, [search, customForms]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Create report for {assetLabel}</DialogTitle>
          <DialogDescription>
            The report will open pre-filled with this asset's identifier, substation and
            location.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search report types…"
        />

        <div className="mt-2 max-h-[55vh] overflow-y-auto border border-neutral-200 dark:border-neutral-700">
          {groups.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No report types match "{search}".
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-500 dark:bg-neutral-900 dark:text-neutral-300">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.slug ?? item.customFormTemplateId}
                    type="button"
                    onClick={() => {
                      onPick(item);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ReportTemplatePicker;
