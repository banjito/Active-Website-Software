import React, { useEffect } from "react";

const JOB_INFO_PRINT_STYLE_ID = "job-info-print-table-print-css";

function ensureJobInfoPrintStylesInHead() {
  if (typeof document === "undefined") return;
  if (document.getElementById(JOB_INFO_PRINT_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = JOB_INFO_PRINT_STYLE_ID;
  el.textContent = `
@media print {
  /* Head injection wins cascade order over report-injected print CSS; ID beats .max-w-7xl table td nowrap */
  #report-container .job-info-print-table,
  #report-container .job-info-print-table colgroup,
  #report-container .job-info-print-table col {
    table-layout: fixed !important;
  }
  #report-container .job-info-print-table td,
  #report-container .job-info-print-table td > div,
  #report-container .job-info-print-table td.job-info-print-address-cell,
  #report-container .job-info-print-table td.job-info-print-address-cell > div {
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-wrap: break-word !important;
    word-break: break-word !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
  }
  #report-container .job-info-print-table tbody tr {
    page-break-inside: auto !important;
    break-inside: auto !important;
  }
  #report-container .job-info-print-table .job-info-print-address-value {
    display: block !important;
    width: 100% !important;
  }
  /* Fallback when JobInfoPrintTable is not under #report-container */
  .job-info-print-table td,
  .job-info-print-table td > div {
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-wrap: break-word !important;
    word-break: break-word !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
  }
}
`;
  document.head.appendChild(el);
}

// Map full US state names to USPS abbreviations
const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

export interface JobInfoData {
  customer?: string;
  address?: string;
  jobNumber?: string;
  technicians?: string;
  date?: string;
  identifier?: string;
  user?: string;
  substation?: string;
  eqptLocation?: string;
  temperature?:
    | {
        fahrenheit?: number | "";
        celsius?: number | "";
        tcf?: number;
        humidity?: number | "";
      }
    | number;
}

interface Props {
  data: JobInfoData;
}

/**
 * Print-only 2x6 job information table. Hidden on screen, visible in print.
 * Renders gracefully if some fields are missing.
 */
const JobInfoPrintTable: React.FC<Props> = ({ data }) => {
  useEffect(() => {
    ensureJobInfoPrintStylesInHead();
  }, []);

  const temp =
    typeof data.temperature === "number"
      ? { fahrenheit: data.temperature }
      : data.temperature || {};
  const formatDate = (value?: string) => {
    if (!value) return "";
    // Handle YYYY-MM-DD dates (from <input type="date">) in local time to avoid off-by-one
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      const local = new Date(y, (m || 1) - 1, d || 1);
      return local.toLocaleDateString();
    }
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? value : dt.toLocaleDateString();
  };
  const dateText = formatDate(data.date);
  const formatCommaSpace = (text?: string) =>
    (text || "").replace(/,\s*/g, ", ");
  const formatAddress = (text?: string) => {
    const withSpaces = formatCommaSpace(text);
    // Replace full state names with USPS abbreviations where they appear after a comma or at word boundary
    const withStateAbbr = withSpaces.replace(
      /\b([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/g,
      (match) => {
        const lower = match.toLowerCase();
        return STATE_NAME_TO_ABBR[lower] || match;
      },
    );
    // Remove occurrences of "United States" with optional preceding comma/space and trailing period
    const withoutCountry = withStateAbbr.replace(
      /,?\s*\bUnited States\b\.?/gi,
      "",
    );
    // Normalize duplicate commas/spaces and trim trailing punctuation/space
    return withoutCountry
      .replace(/,\s*,+/g, ", ")
      .replace(/\s+,/g, ", ")
      .replace(/[\s,]+$/g, "")
      .trim();
  };
  const addressText = formatAddress(data.address);

  const cellWrap =
    "mt-1 text-center whitespace-normal break-words [overflow-wrap:anywhere] max-w-full leading-snug";

  return (
    <div className="hidden print:block job-info-print">
      <table
        className="job-info-print-table w-full table-fixed border-collapse border border-neutral-300 print:border-black print:border"
        style={{ marginLeft: 0, tableLayout: "fixed" }}
      >
        <colgroup>
          {Array.from({ length: 6 }).map((_, i) => (
            <col key={i} style={{ width: `${100 / 6}%` }} />
          ))}
        </colgroup>
        <tbody>
          <tr>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Customer:</div>
              <div className={cellWrap}>{data.customer || ""}</div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Temp:</div>
              <div className={cellWrap}>
                {temp?.fahrenheit !== undefined || temp?.celsius !== undefined
                  ? `${temp?.fahrenheit ?? ""}°F ${temp?.celsius !== undefined ? `(${temp.celsius}°C)` : ""}`
                  : ""}
              </div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Job #:</div>
              <div className={cellWrap}>{data.jobNumber || ""}</div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Technicians:</div>
              <div className={cellWrap}>{data.technicians || ""}</div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Date:</div>
              <div className={cellWrap}>{dateText}</div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Identifier:</div>
              <div className={cellWrap}>{data.identifier || ""}</div>
            </td>
          </tr>
          <tr>
            <td className="job-info-print-address-cell p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Address:</div>
              <div className={`job-info-print-address-value ${cellWrap}`}>
                {addressText}
              </div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">TCF:</div>
              <div className={cellWrap}>{temp?.tcf ?? ""}</div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Humidity:</div>
              <div className={cellWrap}>
                {temp?.humidity !== undefined ? `${temp.humidity}%` : ""}
              </div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Substation:</div>
              <div className={cellWrap}>{data.substation || ""}</div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">Eqpt. Location:</div>
              <div className={cellWrap}>{data.eqptLocation || ""}</div>
            </td>
            <td className="p-3 align-top text-center border border-neutral-300 print:border-black print:border min-w-0">
              <div className="font-semibold text-center">User:</div>
              <div className={cellWrap}>{data.user || ""}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default JobInfoPrintTable;
