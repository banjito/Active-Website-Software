import React from "react";
import { ReportComponentSelector } from "./ReportComponentSelector";

// Define the expected report object shape
export interface ReportObject {
  type: string;
  data: any;
}

export const PrintBatchReports = ({ reports }: { reports: ReportObject[] }) => {
  const [printMode, setPrintMode] = React.useState(false);

  React.useEffect(() => {
    if (printMode) {
      setTimeout(() => {
        window.print();
        setPrintMode(false);
      }, 100);
    }
  }, [printMode]);

  return (
    <>
      <button onClick={() => setPrintMode(true)} className="no-print">
        Print All Reports
      </button>

      {printMode && (
        <div className="print-report-container">
          {reports.map((report, idx) => (
            <div key={idx} className="print-report page-break">
              <ReportComponentSelector report={report} printMode />
            </div>
          ))}
        </div>
      )}
    </>
  );
}; 