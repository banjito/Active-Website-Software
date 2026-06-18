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
  mode?: '4x2' | '5x2'; // default '4x2' to preserve other reports
}

// Print-only table for Panelboard and Switchgear reports
const NameplatePrintTable: React.FC<Props> = ({ data, mode = '4x2' }) => {
  const cell = (label: string, value?: string) => (
    <td className="p-2 align-middle text-center border border-zinc-300 print:border-black print:border">
      <div className="font-semibold text-center">{label}</div>
      <div className="mt-0 text-center">{value || ''}</div>
    </td>
  );

  return (
    <div className="hidden print:block">
      {mode === '5x2' ? (
        <table className="w-full table-fixed border-collapse border border-zinc-300 print:border-black print:border text-[0.85rem]">
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <tbody>
            <tr>
              {cell('Manufacturer:', data.manufacturer)}
              {cell('Catalog No.:', data.catalogNumber)}
              {cell('Serial Number:', data.serialNumber)}
              {cell('Series:', data.series)}
              {cell('Type:', data.type)}
            </tr>
            <tr>
              {cell('System Voltage:', data.systemVoltage)}
              {cell('Rated Voltage:', data.ratedVoltage)}
              {cell('Rated Current:', data.ratedCurrent)}
              {cell('Phase Configuration:', data.phaseConfiguration)}
              {cell('SCCR:', data.aicRating)}
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="w-full table-fixed border-collapse border border-zinc-300 print:border-black print:border text-[0.85rem]">
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
      )}
    </div>
  );
};

export default NameplatePrintTable;


