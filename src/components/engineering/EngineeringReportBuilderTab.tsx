import React from "react";
import { FileCode } from "lucide-react";
import { ce } from "./engineeringTheme";

export const ENGINEERING_BUILDER_PATH = "/engineering/report-builder";

/**
 * Engineering's report builder: LaTeX templates compiled to PDF. Kept fully
 * separate from the custom form builder (/custom-forms); neither shows the
 * other's templates. Not built yet.
 */
export default function EngineeringReportBuilderTab() {
  return (
    <div
      className={`flex flex-col items-center gap-3 border border-dashed px-6 py-16 text-center ${ce.borderStrong}`}
    >
      <FileCode className={`h-8 w-8 ${ce.muted}`} aria-hidden />
      <h2 className="m-0 text-xl font-bold">LaTeX report builder</h2>
      <p className={`m-0 max-w-md text-sm leading-[22px] ${ce.muted}`}>
        Engineering report templates will be written in LaTeX and compiled to PDF
        here. Coming soon.
      </p>
    </div>
  );
}
