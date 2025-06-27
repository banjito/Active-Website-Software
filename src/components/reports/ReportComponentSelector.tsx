import React from "react";
import { TestingCertificate } from "./TestingCertificate";
// import other report components as needed

// Define the expected report object shape
export interface ReportObject {
  type: string;
  data: any;
}

export const ReportComponentSelector = ({ report, printMode }: { report: ReportObject, printMode: boolean }) => {
  switch (report.type) {
    case "FieldTest":
      return <TestingCertificate data={report.data} printMode={printMode} />;
    // case "RTD":
    //   return <RTDReport data={report.data} printMode={printMode} />;
    // case "Breaker":
    //   return <BreakerReport data={report.data} printMode={printMode} />;
    default:
      return <div>Unsupported report type</div>;
  }
}; 