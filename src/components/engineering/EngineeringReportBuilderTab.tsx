import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Copy, Eye, Globe, Lock, Pencil, Search, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import GenerateFromFileDialog from "@/components/customForms/GenerateFromFileDialog";
import { getComponentDefinition } from "@/lib/customForms/componentLibrary";
import type { CustomFormStructure, SectionConfig } from "@/lib/types/customForms";
import {
  fetchActiveTemplates,
  duplicateTemplate,
  deactivateTemplate,
  unpublishTemplate,
  publishTemplate,
  saveImportedDraft,
} from "@/lib/customForms/templateActions";
import { ce, chipClass } from "./engineeringTheme";

export const ENGINEERING_BUILDER_PATH = "/engineering/report-builder";
/** Router state that sends the builder's and preview's Back here. */
export const RETURN_TO_ENGINEERING = { state: { returnTo: ENGINEERING_BUILDER_PATH } };

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  neta_section: string | null;
  updated_at: string;
  is_published: boolean;
  structure: CustomFormStructure | null;
}

type Filter = "all" | "published" | "draft";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Drafts" },
];

const COLUMNS = "grid grid-cols-[minmax(0,2.6fr)_100px_120px_130px]";

const sectionsOf = (t: TemplateRow): SectionConfig[] =>
  [...(t.structure?.sections ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

function sectionSize(s: SectionConfig): string {
  if (s.fields?.length) return `${s.fields.length} fields`;
  if (s.columns?.length) return `${s.columns.length} columns`;
  if (s.field) return "1 field";
  return "";
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

function StatusTag({ published }: { published: boolean }) {
  return published ? (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-[3px] text-xs font-semibold ${ce.border} ${ce.surface}`}
    >
      <span aria-hidden className={`h-[7px] w-[7px] ${ce.marker}`} />
      Published
    </span>
  ) : (
    <span
      className={`inline-flex items-center gap-1.5 border border-dashed px-2 py-[3px] text-xs font-semibold ${ce.borderStrong} ${ce.muted}`}
    >
      <span aria-hidden className="h-[5px] w-[5px] border border-current" />
      Draft
    </span>
  );
}

export default function EngineeringReportBuilderTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const loadTemplates = async () => {
    try {
      setTemplates(await fetchActiveTemplates());
    } catch (error) {
      console.error("Error loading templates:", error);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const counts = useMemo(
    () => ({
      all: templates.length,
      published: templates.filter((t) => t.is_published).length,
      draft: templates.filter((t) => !t.is_published).length,
    }),
    [templates],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (filter === "published" && !t.is_published) return false;
      if (filter === "draft" && t.is_published) return false;
      if (!q) return true;
      return [t.name, t.description, t.neta_section]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [templates, filter, search]);

  const selected = visible.find((t) => t.id === selectedId) ?? visible[0] ?? null;

  /** Runs one action, then reloads the list. */
  const run = async (action: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    try {
      toast.success(await action());
      await loadTemplates();
    } catch (error) {
      console.error("Template action failed:", error);
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = (t: TemplateRow) =>
    run(async () => {
      await duplicateTemplate(t.id, user?.id);
      return "Template duplicated";
    });

  const handleTogglePublish = (t: TemplateRow) =>
    run(async () => {
      if (!t.is_published) return publishTemplate(t.id, user?.id);
      await unpublishTemplate(t.id);
      return "Template unpublished";
    });

  const handleDelete = (t: TemplateRow) => {
    if (!confirm(`Are you sure you want to delete "${t.name}"?`)) return;
    run(async () => {
      await deactivateTemplate(t.id);
      return "Template deleted";
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  const outline = selected ? sectionsOf(selected) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={chipClass(filter === f.id)}
            >
              {f.label}
              <span className="font-mono text-xs font-medium">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex items-center">
            <Search className={`pointer-events-none absolute left-3 h-4 w-4 ${ce.muted}`} aria-hidden />
            <input
              type="search"
              aria-label="Search templates"
              placeholder="Search templates"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${ce.field} w-[300px] max-w-full pl-[38px] pr-3`}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            title="Rebuild a spreadsheet as a draft template, step by step."
            className={`${ce.ghostButton} h-10 px-4`}
          >
            <Upload className="h-4 w-4" aria-hidden />
            Generate from file
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div
          className={`min-w-0 flex-[999_1_560px] overflow-x-auto border ${ce.border} ${ce.surface} ${ce.shadow}`}
        >
          <div className="min-w-[680px]">
            <div
              className={`${COLUMNS} border-b ${ce.border} ${ce.surfaceAlt} text-xs font-semibold uppercase tracking-[0.1em] ${ce.muted}`}
            >
              <div className="px-4 py-3">Template</div>
              <div className="px-4 py-3">Sections</div>
              <div className="px-4 py-3">Updated</div>
              <div className="px-4 py-3">Status</div>
            </div>
            {visible.map((t) => {
              const on = selected?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelectedId(t.id)}
                  className={`${COLUMNS} w-full items-center border-b text-left last:border-b-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${ce.border} ${
                    on ? `${ce.surfaceAlt} shadow-[inset_0_0_0_1px_#8f8aae]` : ce.hoverAlt
                  }`}
                >
                  <span className="flex min-w-0 flex-col gap-0.5 px-4 py-3.5">
                    <span className="truncate text-[15px] font-semibold leading-[22px]">{t.name}</span>
                    {t.description && (
                      <span className={`truncate text-[13px] ${ce.muted}`}>{t.description}</span>
                    )}
                  </span>
                  <span className="px-4 py-3.5 font-mono text-[13px]">{sectionsOf(t).length}</span>
                  <span className="px-4 py-3.5 font-mono text-[13px]">{formatDate(t.updated_at)}</span>
                  <span className="px-4 py-3.5">
                    <StatusTag published={t.is_published} />
                  </span>
                </button>
              );
            })}
            {visible.length === 0 && (
              <div className={`px-4 py-12 text-center text-sm ${ce.muted}`}>
                {templates.length === 0
                  ? "No templates yet. Use New template to build one."
                  : "No templates match."}
              </div>
            )}
          </div>
        </div>

        {selected && (
          <div
            className={`flex min-w-0 flex-[1_1_380px] flex-col border ${ce.border} ${ce.surface} ${ce.shadow}`}
          >
            <div className={`flex flex-col gap-2 border-b p-6 ${ce.border}`}>
              <div className="flex items-center justify-between gap-3">
                <span className={`font-mono text-xs ${ce.accentInk}`}>
                  {selected.neta_section || "Custom template"}
                </span>
                <StatusTag published={selected.is_published} />
              </div>
              <h2 className="m-0 text-xl font-bold leading-[26px]">{selected.name}</h2>
              {selected.description && (
                <p className={`m-0 whitespace-pre-line text-sm leading-[22px] ${ce.muted}`}>
                  {selected.description}
                </p>
              )}
              <span className={`font-mono text-xs ${ce.muted}`}>
                {outline.length} sections · updated {formatDate(selected.updated_at)}
              </span>
            </div>

            <div className={`p-6 ${ce.surfaceAlt}`}>
              <div className={`flex flex-col border p-5 ${ce.border} ${ce.surface}`}>
                <div className="flex flex-col gap-2 pb-2">
                  <span className={`${ce.eyebrow} ${ce.muted}`}>Form outline</span>
                  <div aria-hidden className={`h-[3px] w-10 ${ce.spark}`} />
                </div>
                {outline.length === 0 && (
                  <p className={`py-3 text-sm ${ce.muted}`}>No sections yet.</p>
                )}
                {outline.map((s, i) => (
                  <div
                    key={s.id}
                    className={`grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 border-b py-3 last:border-b-0 ${ce.border}`}
                  >
                    <span className={`font-mono text-xs leading-5 ${ce.muted}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold leading-5">{s.title || "Untitled section"}</span>
                      <span className={`text-[13px] ${ce.muted}`}>
                        {getComponentDefinition(s.componentType)?.name ?? s.componentType}
                      </span>
                    </span>
                    <span className={`font-mono text-xs leading-5 ${ce.muted}`}>{sectionSize(s)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`flex flex-wrap items-center gap-2 border-t px-6 py-5 ${ce.border}`}>
              <button
                type="button"
                onClick={() => navigate(`/custom-forms/builder/${selected.id}`, RETURN_TO_ENGINEERING)}
                className={`${ce.primaryButton} h-11 px-[18px]`}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Open in builder
              </button>
              <button
                type="button"
                onClick={() => navigate(`/custom-forms/preview/${selected.id}`, RETURN_TO_ENGINEERING)}
                className={`${ce.ghostButton} h-11 px-4`}
              >
                <Eye className="h-4 w-4" aria-hidden />
                Preview
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleTogglePublish(selected)}
                className={`${ce.ghostButton} h-11 px-4`}
              >
                {selected.is_published ? (
                  <Lock className="h-4 w-4" aria-hidden />
                ) : (
                  <Globe className="h-4 w-4" aria-hidden />
                )}
                {selected.is_published ? "Unpublish" : "Publish"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDuplicate(selected)}
                aria-label="Duplicate template"
                title="Duplicate template"
                className={`${ce.ghostButton} h-11 w-11`}
              >
                <Copy className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(selected)}
                aria-label="Delete template"
                title="Delete template"
                className={`${ce.ghostButton} h-11 w-11 !text-red-600 dark:!text-red-400`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>

      {showImport && (
        <GenerateFromFileDialog
          onClose={() => setShowImport(false)}
          onSave={(draft) => saveImportedDraft(draft, user?.id)}
          onOpenTemplate={(id) => {
            setShowImport(false);
            toast.success("Draft created. Check the review notes before publishing.", {
              duration: 6000,
            });
            navigate(`/custom-forms/builder/${id}`, RETURN_TO_ENGINEERING);
          }}
        />
      )}
    </div>
  );
}
