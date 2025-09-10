import React from 'react';

interface Props {
  data: {
    manufacturer?: string;
    catalogNumber?: string;
    serialNumber?: string;
    type?: string;
    systemVoltage?: string;
    ratedVoltage?: string;
    ratedCurrent?: string;
    phaseConfiguration?: string;
    aicRating?: string;
    series?: string;
  };
}

// Print-only 4x2 table for Panelboard and Switchgear reports (8 fields total)
const NameplatePrintTable: React.FC<Props> = ({ data }) => {
  const cell = (label: string, value?: string) => (
    <td className="p-2 align-top border border-gray-300 print:border-black print:border">
      <div className="font-semibold">{label}</div>
      <div className="mt-0">{value || ''}</div>
    </td>
  );

  return (
    <div className="hidden print:block">
      <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem]">
        <colgroup>
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <tbody>
          <tr>
            {cell('Manufacturer:', data.manufacturer)}
            {cell('Catalog No.:', data.catalogNumber)}
            {cell('Serial Number:', data.serialNumber)}
            {cell('Type:', data.type)}
          </tr>
          <tr>
            {cell('System Voltage:', data.systemVoltage)}
            {cell('Rated Voltage:', data.ratedVoltage)}
            {cell('Rated Current:', data.ratedCurrent)}
            {cell('Phase Configuration:', data.phaseConfiguration)}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default NameplatePrintTable;


