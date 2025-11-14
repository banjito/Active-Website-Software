import React from 'react';

// Map full US state names to USPS abbreviations
const STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama': 'AL',
  'alaska': 'AK',
  'arizona': 'AZ',
  'arkansas': 'AR',
  'california': 'CA',
  'colorado': 'CO',
  'connecticut': 'CT',
  'delaware': 'DE',
  'district of columbia': 'DC',
  'florida': 'FL',
  'georgia': 'GA',
  'hawaii': 'HI',
  'idaho': 'ID',
  'illinois': 'IL',
  'indiana': 'IN',
  'iowa': 'IA',
  'kansas': 'KS',
  'kentucky': 'KY',
  'louisiana': 'LA',
  'maine': 'ME',
  'maryland': 'MD',
  'massachusetts': 'MA',
  'michigan': 'MI',
  'minnesota': 'MN',
  'mississippi': 'MS',
  'missouri': 'MO',
  'montana': 'MT',
  'nebraska': 'NE',
  'nevada': 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  'ohio': 'OH',
  'oklahoma': 'OK',
  'oregon': 'OR',
  'pennsylvania': 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  'tennessee': 'TN',
  'texas': 'TX',
  'utah': 'UT',
  'vermont': 'VT',
  'virginia': 'VA',
  'washington': 'WA',
  'west virginia': 'WV',
  'wisconsin': 'WI',
  'wyoming': 'WY'
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
  temperature?: {
    fahrenheit?: number | '';
    celsius?: number | '';
    tcf?: number;
    humidity?: number | '';
  } | number;
}

interface Props {
  data: JobInfoData;
}

/**
 * Print-only 2x6 job information table. Hidden on screen, visible in print.
 * Renders gracefully if some fields are missing.
 */
const JobInfoPrintTable: React.FC<Props> = ({ data }) => {
  const temp = typeof data.temperature === 'number' ? { fahrenheit: data.temperature } : (data.temperature || {});
  const formatDate = (value?: string) => {
    if (!value) return '';
    // Handle YYYY-MM-DD dates (from <input type="date">) in local time to avoid off-by-one
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      const local = new Date(y, (m || 1) - 1, d || 1);
      return local.toLocaleDateString();
    }
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? value : dt.toLocaleDateString();
  };
  const dateText = formatDate(data.date);
  const formatCommaSpace = (text?: string) => (text || '').replace(/,\s*/g, ', ');
  const formatAddress = (text?: string) => {
    const withSpaces = formatCommaSpace(text);
    // Replace full state names with USPS abbreviations where they appear after a comma or at word boundary
    const withStateAbbr = withSpaces.replace(/\b([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/g, (match) => {
      const lower = match.toLowerCase();
      return STATE_NAME_TO_ABBR[lower] || match;
    });
    // Remove occurrences of "United States" with optional preceding comma/space and trailing period
    const withoutCountry = withStateAbbr.replace(/,?\s*\bUnited States\b\.?/gi, '');
    // Normalize duplicate commas/spaces and trim trailing punctuation/space
    return withoutCountry
      .replace(/,\s*,+/g, ', ')
      .replace(/\s+,/g, ', ')
      .replace(/[\s,]+$/g, '')
      .trim();
  };
  const addressText = formatAddress(data.address);

  return (
    <div className="hidden print:block job-info-print">
      <table className="w-full border-collapse border border-gray-300 print:border-black print:border" style={{ marginLeft: 0 }}>
        <tbody>
          <tr>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Customer:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{data.customer || ''}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Temp:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{temp?.fahrenheit !== undefined || temp?.celsius !== undefined ? `${temp?.fahrenheit ?? ''}°F ${temp?.celsius !== undefined ? `(${temp.celsius}°C)` : ''}` : ''}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Job #:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{data.jobNumber || ''}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Technicians:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{data.technicians || ''}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Date:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{dateText}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Identifier:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{data.identifier || ''}</div>
            </td>
          </tr>
          <tr>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Address:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{addressText}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">TCF:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{temp?.tcf ?? ''}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Humidity:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{temp?.humidity !== undefined ? `${temp.humidity}%` : ''}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Substation:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{data.substation || ''}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">Eqpt. Location:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{data.eqptLocation || ''}</div>
            </td>
            <td className="p-3 align-middle text-center border border-gray-300 print:border-black print:border">
              <div className="font-semibold text-center">User:</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-center">{data.user || ''}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default JobInfoPrintTable;


