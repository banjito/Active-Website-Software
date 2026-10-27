import React, { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { baseTemplateFor } from "@/lib/engineering/typst/templates";
import {
  createJobReport,
  deleteJobReport,
  getJobReport,
  getTemplate,
  isMissingTable,
  listJobReports,
  listTemplates,
  saveJobReport,
  STORAGE_NOT_SET_UP,
  type JobReportDoc,
  type JobReportSummary,
  type TemplateSummary,
} from "@/lib/engineering/reportStore";
import { ce } from "./engineeringTheme";
import { ENGINEERING_BUILDER_PATH } from "./EngineeringReportBuilderTab";
import { CardGrid, NewCard, ReportCard, shortDate } from "./report-builder/ReportCards";

// Loaded on demand: the editor pulls in the Typst PDF engine and pdf.js.
const ReportEditor = lazy(() => import("./report-builder/ReportEditor"));

const spinner = (
  <div className="flex justify-center py-16">
    <LoadingSpinner />
  </div>
);

interface Props {
  jobId: string;
  /** What the job fills into a new report (jobFieldValues). */
  jobValues: Record<string, string>;
  /** The open report's id, "new" for the template picker, or null for the list. */
  openId: string | null;
  onOpen: (id: string | null) => void;
}

/**
 * A job's engineering reports: cards plus "New report", which picks a
 * template from the Report builder. Each report keeps its own copy of the
 * template's files.
 */
export default function EngineeringJobReports({ jobId, jobValues, openId, onOpen }: Props) {
  if (openId === "new") {
    return <TemplatePicker jobId={jobId} jobValues={jobValues} onOpen={onOpen} />;
  }
  if (openId) return <ReportView key={openId} id={openId} onOpen={onOpen} />;
  return <ReportList jobId={jobId} onOpen={onOpen} />;
}

function ReportList({ jobId, onOpen }: { jobId: string; onOpen: (id: string | null) => void }) {
  const [reports, setReports] = useState<JobReportSummary[] | null>(null);
  const [setUp, setSetUp] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listJobReports(jobId)
      .then((r) => {
        setReports(r.reports);
        setSetUp(r.setUp);
      })
      .catch((err) => {
        console.error("Error loading job reports:", err);
        setLoadError("Could not load reports.");
      });
  }, [jobId]);

  if (loadError) return <p className={`py-16 text-center text-sm ${ce.muted}`}>{loadError}</p>;
  if (!reports) return spinner;

  return (
    <div className="flex flex-col gap-4">
      {!setUp && <p className={`m-0 border p-3 text-sm ${ce.border} ${ce.accentInk}`}>{STORAGE_NOT_SET_UP}</p>}
      <CardGrid>
        {reports.map((r) => (
          <ReportCard
            key={r.id}
            title={r.name}
            meta={`Updated ${shortDate(r.updatedAt)}`}
            onClick={() => onOpen(r.id)}
          />
        ))}
        <NewCard label="New report" onClick={() => onOpen("new")} disabled={!setUp} />
      </CardGrid>
    </div>
  );
}

function TemplatePicker({
  jobId,
  jobValues,
  onOpen,
}: {
  jobId: string;
  jobValues: Record<string, string>;
  onOpen: (id: string | null) => void;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTemplates()
      .then((r) => setTemplates(r.templates))
      .catch((err) => {
        console.error("Error loading report templates:", err);
        setError("Could not load templates.");
      });
  }, []);

  const pick = async (templateId: string) => {
    setBusyId(templateId);
    setError(null);
    try {
      const template = await getTemplate(templateId);
      if (!template) throw new Error("Template not found");
      onOpen(await createJobReport(jobId, template, jobValues));
    } catch (err) {
      console.error("Error creating report:", err);
      setError(isMissingTable(err) ? STORAGE_NOT_SET_UP : "Couldn't make the report. Please try again.");
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onOpen(null)} className={`${ce.ghostButton} h-10 px-3`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Reports
          </button>
          <h2 className="m-0 text-base font-bold">Choose a template from the builder</h2>
        </div>
        <Link
          to={ENGINEERING_BUILDER_PATH}
          className={`inline-flex items-center gap-1.5 text-sm font-semibold no-underline ${ce.accentInk}`}
        >
          Manage templates
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      {error && <p className="m-0 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {!templates ? (
        !error && spinner
      ) : (
        <CardGrid>
          {templates.map((t) => (
            <ReportCard
              key={t.id}
              title={t.name}
              meta={busyId === t.id ? "Making the report…" : t.builtIn ? "Built in" : `Updated ${shortDate(t.updatedAt)}`}
              onClick={() => pick(t.id)}
              disabled={busyId !== null}
            />
          ))}
        </CardGrid>
      )}
    </div>
  );
}

function ReportView({ id, onOpen }: { id: string; onOpen: (id: string | null) => void }) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<JobReportDoc | null | undefined>(undefined);

  useEffect(() => {
    getJobReport(id)
      .then(setDoc)
      .catch((err) => {
        console.error("Error loading report:", err);
        setDoc(null);
      });
  }, [id]);

  if (doc === undefined) return spinner;
  if (!doc) {
    return (
      <div className="py-16 text-center">
        <p className={`text-sm ${ce.muted}`}>This report doesn't exist or was deleted.</p>
        <button type="button" onClick={() => onOpen(null)} className={`${ce.ghostButton} mt-4 h-10 px-4`}>
          Back to reports
        </button>
      </div>
    );
  }

  const remove = async () => {
    if (!window.confirm(`Delete "${doc.name}" from this job?`)) return;
    try {
      await deleteJobReport(doc.id);
      onOpen(null);
    } catch (err) {
      console.error("Error deleting report:", err);
      window.alert("Couldn't delete the report. Please try again.");
    }
  };

  return (
    <Suspense fallback={spinner}>
      <ReportEditor
        kind="Report"
        name={doc.name}
        nameEditable
        base={baseTemplateFor(doc.baseTemplate)}
        sources={doc.sources}
        values={doc.values}
        onBack={() => onOpen(null)}
        backLabel="Reports"
        onSave={({ name, sources, values }) => saveJobReport(doc.id, { name, sources, values }, user?.id)}
        actions={
          <button type="button" onClick={remove} className={`${ce.ghostButton} h-10 px-4`}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </button>
        }
      />
    </Suspense>
  );
}
