/**
 * "Newer form version" tag on a saved report's toolbar.
 *
 * Unfinished reports get a button to the compare screen. Approved and sent
 * reports only get told: they keep the version they were issued with.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpCircle, Lock } from "lucide-react";
import { toast } from "@/components/ui/toast";
import {
  fetchLatestVersionSummary,
  fetchReportAssetStatus,
  formVersionComparePath,
  type VersionSummary,
} from "@/lib/customForms/formVersionStatus";
import { isFormVersionLocked } from "@/lib/customForms/versionUpgrade";

interface Props {
  jobId: string;
  templateId: string;
  instanceId: string;
  /** The version this report is pinned to; null = not pinned, nothing to say. */
  currentVersion: number | null;
  hasUnsavedChanges: boolean;
}

export const NewerFormVersionNotice: React.FC<Props> = ({
  jobId,
  templateId,
  instanceId,
  currentVersion,
  hasUnsavedChanges,
}) => {
  const navigate = useNavigate();
  const [latest, setLatest] = useState<VersionSummary | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (currentVersion == null) return;
    let cancelled = false;
    const load = async () => {
      const [summary, asset] = await Promise.all([
        fetchLatestVersionSummary(templateId),
        fetchReportAssetStatus(jobId, templateId, instanceId),
      ]);
      if (cancelled) return;
      setLatest(summary && summary.version > currentVersion ? summary : null);
      setLocked(isFormVersionLocked(asset?.status));
    };
    load().catch(() => {
      /* only a hint */
    });
    // Approving or reopening the report changes whether it can move.
    window.addEventListener("assetStatusChanged", load);
    return () => {
      cancelled = true;
      window.removeEventListener("assetStatusChanged", load);
    };
  }, [jobId, templateId, instanceId, currentVersion]);

  if (!latest || currentVersion == null) return null;

  if (locked) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-dark-100 border border-neutral-200 dark:border-neutral-700 rounded-none"
        title={`Form v${latest.version} is published. Approved and sent reports keep the version they were issued with (v${currentVersion}).`}
      >
        <Lock className="w-3 h-3" />
        Newer form version exists (v{latest.version})
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (hasUnsavedChanges) {
          toast({ title: "Save your changes first, then compare versions." });
          return;
        }
        navigate(formVersionComparePath(jobId, templateId, instanceId));
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-none hover:border-brand hover:text-brand"
      title={`This report uses form v${currentVersion}. Compare it with v${latest.version} and update.`}
    >
      <ArrowUpCircle className="w-3.5 h-3.5" />
      Newer form version: v{latest.version} · Compare &amp; update
    </button>
  );
};
