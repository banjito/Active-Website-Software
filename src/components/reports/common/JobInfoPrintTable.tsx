import React from 'react';

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
    fahrenheit?: number;
    celsius?: number;
    tcf?: number;
    humidity?: number;
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
  const dateText = data.date ? new Date(data.date).toLocaleDateString() : '';

  return (
    <div className="hidden print:block">
      <table className="w-full border-collapse border border-gray-300 print:border-black print:border">
        <tbody>
          <tr>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Customer:</div>
              <div className="mt-1">{data.customer || ''}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Temp:</div>
              <div className="mt-1">{temp?.fahrenheit !== undefined || temp?.celsius !== undefined ? `${temp?.fahrenheit ?? ''}°F ${temp?.celsius !== undefined ? `(${temp.celsius}°C)` : ''}` : ''}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Job #:</div>
              <div className="mt-1">{data.jobNumber || ''}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Technicians:</div>
              <div className="mt-1">{data.technicians || ''}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Date:</div>
              <div className="mt-1">{dateText}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Identifier:</div>
              <div className="mt-1">{data.identifier || ''}</div>
            </td>
          </tr>
          <tr>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Address:</div>
              <div className="mt-1">{data.address || ''}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">TCF:</div>
              <div className="mt-1">{temp?.tcf ?? ''}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Humidity:</div>
              <div className="mt-1">{temp?.humidity !== undefined ? `${temp.humidity}%` : ''}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Substation:</div>
              <div className="mt-1">{data.substation || ''}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">Eqpt. Location:</div>
              <div className="mt-1">{data.eqptLocation || ''}</div>
            </td>
            <td className="p-3 align-top border border-gray-300 print:border-black print:border">
              <div className="font-semibold">User:</div>
              <div className="mt-1">{data.user || ''}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default JobInfoPrintTable;


