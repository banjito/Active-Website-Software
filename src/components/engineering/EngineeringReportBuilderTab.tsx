import React, { Suspense, lazy, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BLANK_SOURCES, baseTemplateFor, POWER_SYSTEM_STUDY } from "@/lib/engineering/typst/templates";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  isMissingTable,
  listTemplates,
  saveTemplate,
  STORAGE_NOT_SET_UP,
  type TemplateDoc,
  type TemplateSummary,
} from "@/lib/engineering/reportStore";
import { ce } from "./engineeringTheme";
import {
  CardGrid,
  NewCard,
  NewTemplateDialog,
  ReportCard,
  shortDate,
} from "./report-builder/ReportCards";

export const ENGINEERING_BUILDER_PATH = "/engineering/report-builder";
/** ?template=<id> opens a template in the editor. */
const TEMPLATE_PARAM = "template";

// Loaded on demand: the editor pulls in the Typst PDF engine and pdf.js.
const ReportEditor = lazy(() => import("./report-builder/ReportEditor"));

const spinner = (
  <div className="flex justify-center py-16">
    <LoadingSpinner />
  </div>
);

/**
 * Engineering's report builder: template cards (built-in and saved) plus a
 * "New template" card; opening one shows the Typst editor. Jobs make their
 * reports from these. Kept fully separate from the custom form builder
 * (/custom-forms); neither shows the other's templates.
 */
export default function EngineeringReportBuilderTab() {
  const [params, setParams] = useSearchParams();
  const openId = params.get(TEMPLATE_PARAM);
  const open = (id: string | null) => setParams(id ? { [TEMPLATE_PARAM]: id } : {});

  return openId ? (
    <TemplateEditor key={openId} id={openId} onOpen={open} />
  ) : (
    <TemplateGallery onOpen={open} />
  );
}

function TemplateGallery({ onOpen }: { onOpen: (id: string) => void }) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [setUp, setSetUp] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listTemplates()
      .then((r) => {
        setTemplates(r.templates);
        setSetUp(r.setUp);
      })
      .catch((err) => {
        console.error("Error loading report templates:", err);
        setLoadError("Could not load templates.");
      });
  }, []);

  const create = async (name: string, startFrom: string) => {
    try {
      const from = startFrom === "blank" ? null : await getTemplate(startFrom);
      const id = await createTemplate(
        name,
        from?.baseTemplate ?? POWER_SYSTEM_STUDY.id,
        from?.sources ?? BLANK_SOURCES,
      );
      onOpen(id);
    } catch (err) {
      console.error("Error creating template:", err);
      throw new Error(isMissingTable(err) ? STORAGE_NOT_SET_UP : "Couldn't create the template.");
    }
  };

  if (loadError) return <p className={`py-16 text-center text-sm ${ce.muted}`}>{loadError}</p>;
  if (!templates) return spinner;

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-1 py-4 sm:px-4">
      <div>
        <h2 className="m-0 text-lg font-bold">Report templates</h2>
        <p className={`m-0 mt-1 text-sm ${ce.muted}`}>
          Jobs make their reports from these. Changing a template never changes a report already made.
        </p>
      </div>
      {!setUp && <p className={`m-0 border p-3 text-sm ${ce.border} ${ce.accentInk}`}>{STORAGE_NOT_SET_UP}</p>}
      <CardGrid>
        {templates.map((t) => (
          <ReportCard
            key={t.id}
            title={t.name}
            meta={t.builtIn ? "Built in" : `Updated ${shortDate(t.updatedAt)}`}
            onClick={() => onOpen(t.id)}
          />
        ))}
        <NewCard label="New template" onClick={() => setCreating(true)} disabled={!setUp} />
      </CardGrid>
      {creating && (
        <NewTemplateDialog options={templates} onCreate={create} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function TemplateEditor({ id, onOpen }: { id: string; onOpen: (id: string | null) => void }) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<TemplateDoc | null | undefined>(undefined);

  useEffect(() => {
    getTemplate(id)
      .then(setDoc)
      .catch((err) => {
        console.error("Error loading template:", err);
        setDoc(null);
      });
  }, [id]);

  if (doc === undefined) return spinner;
  if (!doc) {
    return (
      <div className="py-16 text-center">
        <p className={`text-sm ${ce.muted}`}>This template doesn't exist or was deleted.</p>
        <button type="button" onClick={() => onOpen(null)} className={`${ce.ghostButton} mt-4 h-10 px-4`}>
          Back to templates
        </button>
      </div>
    );
  }

  const remove = async () => {
    if (!window.confirm(`Delete "${doc.name}"? Reports already made from it keep their copy.`)) return;
    try {
      await deleteTemplate(doc.id);
      onOpen(null);
    } catch (err) {
      console.error("Error deleting template:", err);
      window.alert("Couldn't delete the template. Please try again.");
    }
  };

  return (
    <Suspense fallback={spinner}>
      <ReportEditor
        kind={doc.builtIn ? "Built-in template" : "Template"}
        name={doc.name}
        nameEditable={!doc.builtIn}
        base={baseTemplateFor(doc.baseTemplate)}
        sources={doc.sources}
        jobPicker
        saveValues={false}
        onBack={() => onOpen(null)}
        backLabel="Templates"
        // Built-in templates ship with ampOS, so changes become a new saved template.
        saveLabel={doc.builtIn ? "Save as new template" : "Save"}
        saveWhenClean={doc.builtIn}
        onSave={async ({ name, sources }) => {
          if (doc.builtIn) {
            const copyName = window.prompt("Name for the new template", `${doc.name} (copy)`)?.trim();
            if (!copyName) return false;
            onOpen(await createTemplate(copyName, doc.baseTemplate, sources));
          } else {
            await saveTemplate(doc.id, { name, sources }, user?.id);
          }
        }}
        actions={
          !doc.builtIn && (
            <button type="button" onClick={remove} className={`${ce.ghostButton} h-10 px-4`}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          )
        }
      />
    </Suspense>
  );
}
