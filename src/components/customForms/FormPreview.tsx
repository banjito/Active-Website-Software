/**
 * Form Preview shell
 *
 * The builder's preview tab. It draws the document chrome and hands the
 * shared runtime a placeholder chrome, so what you see here is the same
 * structure the technician gets in the filler, minus live inputs.
 */

import React from "react";
import { Plus, Minus } from "lucide-react";
import {
  CustomFormTemplate,
  SectionConfig,
} from "@/lib/types/customForms";
import {
  canAddRow,
  canRemoveRow,
  classifySection,
  isTableKind,
  type SectionChrome,
  type SectionRowInfo,
} from "@/lib/customForms/runtime";
import { SectionBody } from "./runtime/SectionBody";
import { DocumentBody } from "./runtime/SectionFrame";
import { createPlaceholderControlRenderer } from "./runtime/PlaceholderControl";
import { useLocalSectionSettings } from "./runtime/useLocalSectionSettings";

/** Add/Remove row affordances, shown but inert: nothing is being filled in. */
function PreviewRowControls({
  section,
  info,
}: {
  section: SectionConfig;
  info: SectionRowInfo;
}) {
  const kind = classifySection(section);
  if (!isTableKind(kind)) return null;
  const showAdd = canAddRow(section, info.rowCount);
  const showRemove = canRemoveRow(section, info.rowCount);
  if (!showAdd && !showRemove) return null;

  const shown = info.shownRowCount;
  return (
    <div className="flex items-center gap-2 mt-2 print:hidden">
      {showAdd && (
        <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand border border-brand rounded opacity-60 cursor-default">
          <Plus className="w-3 h-3" /> Add Row
        </span>
      )}
      {showRemove && (
        <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded opacity-60 cursor-default">
          <Minus className="w-3 h-3" /> Remove Row
        </span>
      )}
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        {shown} row{shown !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

/** The preview-mode chrome. */
function usePreviewChrome(): SectionChrome {
  const { getSettingValue, setSettingValue, conditionValues } =
    useLocalSectionSettings();
  const renderControl = React.useMemo(
    () => createPlaceholderControlRenderer({ density: "normal" }),
    [],
  );
  return {
    mode: "preview",
    density: "normal",
    renderControl,
    getSettingValue,
    setSettingValue,
    conditionValues,
    renderSectionFooter: (section, info) => (
      <PreviewRowControls section={section} info={info} />
    ),
  };
}

/**
 * One section's content, without the frame. Used by the saved-components
 * dialog, which draws its own heading.
 */
export const SectionContent: React.FC<{ section: SectionConfig }> = ({
  section,
}) => {
  const chrome = usePreviewChrome();
  return <SectionBody section={section} chrome={chrome} />;
};

interface FormPreviewProps {
  template: CustomFormTemplate;
}

export const FormPreview: React.FC<FormPreviewProps> = ({ template }) => {
  const chrome = usePreviewChrome();

  return (
    <div className="max-w-5xl mx-auto bg-white dark:bg-dark-150 rounded-none shadow-lg p-8">
      <div className="mb-6 pb-6 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex justify-between items-start">
          <div>
            {/* No description here: a report has a title, not a subtitle. The
                description is for telling templates apart in the list. */}
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
              {template.name}
            </h1>
          </div>
          {template.netaSection && (
            <div className="text-right">
              <div className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                NETA Standard
              </div>
              <div className="text-xl font-bold text-brand">
                {template.netaSection}
              </div>
            </div>
          )}
        </div>
      </div>

      <DocumentBody
        template={template}
        chrome={chrome}
        emptyMessage="No sections to display in preview"
      />
    </div>
  );
};
