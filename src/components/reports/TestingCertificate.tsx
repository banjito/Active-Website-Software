import React from "react";

export interface ReportData {
  testingDate: string;
  renewalDate: string;
  customer: string;
  asset: string;
  pageCount: number;
  // Add other fields as needed
}

export const TestingCertificate = ({ data, printMode }: { data: ReportData, printMode?: boolean }) => {
  return (
    <div className={printMode ? "print-report" : "screen-report"}>
      <div className="flex justify-between text-xs">
        <span>AMP FIELD SERVICES</span>
        <span>COMMITTED TO YOUR SUCCESS</span>
      </div>

      <div className="flex justify-center my-4">
        <img src="/amp-logo.png" className="h-12" alt="AMP Logo" />
      </div>

      <h2 className="text-center font-semibold uppercase">TESTING CERTIFICATE FROM AMP FIELD SERVICES</h2>

      <div className="text-center text-xs mb-6">
        AMP Quality Energy Services<br />
        616 Church ST NE<br />
        Decatur AL, 35601
      </div>

      <div className="grid grid-cols-2 text-xs mb-2">
        <div><strong>Testing Date:</strong> {data.testingDate}</div>
        <div className="text-red-600 font-semibold">
          <strong>Renewal Date:</strong> {data.renewalDate}
        </div>
      </div>

      {/* Example table */}
      <table className="w-full border border-black text-xs mb-4">
        <thead><tr><th>Label</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Customer</td><td>{data.customer}</td></tr>
          <tr><td>Asset</td><td>{data.asset}</td></tr>
        </tbody>
      </table>

      <div className="text-center text-xs mt-10">Page 1 of {data.pageCount}</div>
    </div>
  );
}; 