import React, { Suspense, lazy } from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const ENGINEERING_BUILDER_PATH = "/engineering/report-builder";

// Loaded on demand: the editor pulls in the Typst PDF engine and pdf.js.
const ReportEditor = lazy(() => import("./report-builder/ReportEditor"));

/**
 * Engineering's report builder: Typst templates, filled from each job and
 * compiled to PDF in the browser. Kept fully separate from the custom form
 * builder (/custom-forms); neither shows the other's templates.
 */
export default function EngineeringReportBuilderTab() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      }
    >
      <ReportEditor />
    </Suspense>
  );
}
