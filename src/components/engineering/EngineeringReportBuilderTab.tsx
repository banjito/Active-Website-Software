import React from "react";
import { FileCode } from "lucide-react";
import { ce } from "./engineeringTheme";

export const ENGINEERING_BUILDER_PATH = "/engineering/report-builder";

/**
 * Engineering's report builder: Typst templates, filled from each job and
 * compiled to PDF in the browser. Kept fully
 * separate from the custom form builder (/custom-forms); neither shows the
 * other's templates. Not built yet.
 */
export default function EngineeringReportBuilderTab() {
  return (
    <div
      className={`flex flex-col items-center gap-3 border border-dashed px-6 py-16 text-center ${ce.borderStrong}`}
    >
      <FileCode className={`h-8 w-8 ${ce.muted}`} aria-hidden />
      <h2 className="m-0 text-xl font-bold">Report builder</h2>
      <p className={`m-0 max-w-md text-sm leading-[22px] ${ce.muted}`}>
        Report templates filled in from each job and turned into PDFs right here.
        Coming soon.
      </p>
    </div>
  );
}
