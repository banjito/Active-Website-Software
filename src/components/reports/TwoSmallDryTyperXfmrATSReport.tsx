import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';

// Temperature conversion and correction factor lookup tables
const tcfTable: { [key: string]: number } = {
  '-24': 0.054, '-23': 0.068, '-22': 0.082, '-21': 0.096, '-20': 0.11,
  '-19': 0.124, '-18': 0.138, '-17': 0.152, '-16': 0.166, '-15': 0.18,
  '-14': 0.194, '-13': 0.208, '-12': 0.222, '-11': 0.236, '-10': 0.25,
  '-9': 0.264, '-8': 0.278, '-7': 0.292, '-6': 0.306, '-5': 0.32,
  '-4': 0.336, '-3': 0.352, '-2': 0.368, '-1': 0.384, '0': 0.4,
  '1': 0.42, '2': 0.44, '3': 0.46, '4': 0.48, '5': 0.5,
  '6': 0.526, '7': 0.552, '8': 0.578, '9': 0.604, '10': 0.63,
  '11': 0.666, '12': 0.702, '13': 0.738, '14': 0.774, '15': 0.81,
  '16': 0.848, '17': 0.886, '18': 0.924, '19': 0.962, '20': 1,
  '21': 1.05, '22': 1.1, '23': 1.15, '24': 1.2, '25': 1.25,
  '26': 1.316, '27': 1.382, '28': 1.448, '29': 1.514, '30': 1.58,
  '31': 1.664, '32': 1.748, '33': 1.832, '34': 1.872, '35': 2,
  '36': 2.1, '37': 2.2, '38': 2.3, '39': 2.4, '40': 2.5,
  '41': 2.628, '42': 2.756, '43': 2.884, '44': 3.012, '45': 3.15,
  '46': 3.316, '47': 3.482, '48': 3.648, '49': 3.814, '50': 3.98,
  '51': 4.184, '52': 4.388, '53': 4.592, '54': 4.796, '55': 5,
  '56': 5.26, '57': 5.52, '58': 5.78, '59': 6.04, '60': 6.3,
  '61': 6.62, '62': 6.94, '63': 7.26, '64': 7.58, '65': 7.9,
  '66': 8.32, '67': 8.74, '68': 9.16, '69': 9.58, '70': 10,
  '71': 10.52, '72': 11.04, '73': 11.56, '74': 12.08, '75': 12.6,
  '76': 13.24, '77': 13.88, '78': 14.52, '79': 15.16, '80': 15.8,
  '81': 16.64, '82': 17.48, '83': 18.32, '84': 19.16, '85': 20,
  '86': 21.04, '87': 22.08, '88': 23.12, '89': 24.16, '90': 25.2,
  '91': 26.45, '92': 27.7, '93': 28.95, '94': 30.2, '95': 31.6,
  '96': 33.28, '97': 34.96, '98': 36.64, '99': 38.32, '100': 40,
  '101': 42.08, '102': 44.16, '103': 46.24, '104': 48.32, '105': 50.4,
  '106': 52.96, '107': 55.52, '108': 58.08, '109': 60.64, '110': 63.2
};

const getTCF = (celsius: number): number => {
  const roundedCelsius = Math.round(celsius);
  const key = roundedCelsius.toString();
  return tcfTable[key] !== undefined ? tcfTable[key] : 1;
};

const visualInspectionOptions = [
  "Select One", "Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"
];

const insulationResistanceUnitsOptions = ["kΩ", "MΩ", "GΩ"];
const testVoltageOptions = ["250V", "500V", "1000V", "2500V", "5000V"];
const passFailOptions = ["PASS", "FAIL", "N/A"];
const connectionOptions = ["Delta", "Wye", "Single Phase"];
const materialOptions = ["Aluminum", "Copper"];


interface FormData {
  // Job Information
  customer: string;
  address: string;
  user: string;
  date: string;
  identifier: string;
  jobNumber: string;
  technicians: string;
  temperature: {
    fahrenheit: number;
    celsius: number;
    tcf: number;
    humidity: number;
  };
  substation: string;
  eqptLocation: string;

  // Nameplate Data
  nameplate: {
    manufacturer: string;
    kvaBase: string;
    kvaCooling: string; 
    voltsPrimary: string;
    voltsPrimaryInternal: string;
    voltsSecondary: string;
    voltsSecondaryInternal: string;
    connectionsPrimary: string; 
    connectionsSecondary: string; 
    windingMaterialPrimary: string; 
    windingMaterialSecondary: string; 
    catalogNumber: string;
    tempRise: string;
    serialNumber: string;
    impedance: string;
    tapVoltages: string[]; 
    tapPosition: string; 
    tapPositionLeftVolts: string;
    tapPositionLeftPercent: string;
  };



  // Visual and Mechanical Inspection
  visualInspectionItems: Array<{
    netaSection: string;
    description: string;
    result: string;
    comments?: string;
  }>;
  visualInspectionComments: string;

  // Electrical Tests - Measured Insulation Resistance
  insulationResistance: {
    tests: Array<{
      winding: string;
      testVoltage: string;
      measured0_5Min: string;
      measured1Min: string;
      units: string;
      corrected0_5Min: string;
      corrected1Min: string;
      correctedUnits: string; 
      tableMinimum: string;
      tableMinimumUnits: string;
    }>;
    dielectricAbsorptionRatio: {
      calculatedAs: string;
      priToGnd: string;
      secToGnd: string;
      priToSec: string;
      passFail: string;
      minimumDAR: string;
    };
  };

  // Electrical Tests - Turns Ratio
  turnsRatio: {
    secondaryWindingVoltage: string;
    tests: Array<{
      tap: string; 
      nameplateVoltage: string;
      calculatedRatio: string;
      measuredH1H2: string;
      devH1H2: string;
      passFailH1H2: string;
      measuredH2H3: string;
      devH2H3: string;
      passFailH2H3: string;
      measuredH3H1: string;
      devH3H1: string;
      passFailH3H1: string;
    }>;
  };
  
  // Test Equipment Used
  testEquipment: {
    megohmmeter: { name: string; serialNumber: string; ampId: string };
    ttrTestSet: { name: string; serialNumber: string; ampId: string };
  };

  comments: string;
  status: 'PASS' | 'FAIL';
}

const initialVisualInspectionItems = [
  { netaSection: '7.2.1.1.A.1', description: 'Inspect physical and mechanical condition.', result: '' },
  { netaSection: '7.2.1.1.A.2', description: 'Inspect anchorage, alignment, and grounding.', result: '' },
  { netaSection: '7.2.1.1.A.3', description: '*Prior to cleaning the unit, perform as-found tests.', result: '' },
  { netaSection: '7.2.1.1.A.4', description: 'Clean the unit.', result: '' },
  { netaSection: '7.2.1.1.A.5', description: 'Inspect bolted electrical connections for high resistance using a low-resistance ohmmeter', result: '' },
  { netaSection: '7.2.1.1.A.6.1', description: 'Perform as-left tests.', result: '' },
  { netaSection: '7.2.1.1.A.7', description: 'Verify that as-left tap connections are as specified.', result: '' },
];

const initialInsulationResistanceTests = [
  { winding: 'Primary to Ground', testVoltage: '1000V', measured0_5Min: '', measured1Min: '', units: 'GΩ', corrected0_5Min: '', corrected1Min: '', correctedUnits: 'GΩ', tableMinimum: '100.5', tableMinimumUnits: 'GΩ' },
  { winding: 'Secondary to Ground', testVoltage: '500V', measured0_5Min: '', measured1Min: '', units: 'GΩ', corrected0_5Min: '', corrected1Min: '', correctedUnits: 'GΩ', tableMinimum: '', tableMinimumUnits: 'GΩ' },
  { winding: 'Primary to Secondary', testVoltage: '1000V', measured0_5Min: '', measured1Min: '', units: 'GΩ', corrected0_5Min: '', corrected1Min: '', correctedUnits: 'GΩ', tableMinimum: '', tableMinimumUnits: 'GΩ' },
];

const TwoSmallDryTyperXfmrATSReport: React.FC = (): JSX.Element | null => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  
  // Print Mode Detection
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'two-small-dry-typer-xfmr-ats-report'; // This component handles the two-small-dry-typer-xfmr-ats-report route
  const reportName = getReportName(reportSlug);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    customer: '',
    address: '',
    user: '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 50 },
    substation: '',
    eqptLocation: '',
    nameplate: {
      manufacturer: '', kvaBase: '', kvaCooling: '', voltsPrimary: '', voltsSecondary: '',
      voltsPrimaryInternal: '', voltsSecondaryInternal: '',
      connectionsPrimary: 'Delta', connectionsSecondary: 'Wye',
      windingMaterialPrimary: 'Aluminum', windingMaterialSecondary: 'Copper',
      catalogNumber: '', tempRise: '', serialNumber: '', impedance: '',
      tapVoltages: Array(7).fill(''), tapPosition: '1',
      tapPositionLeftVolts: '', tapPositionLeftPercent: ''
    },

    visualInspectionItems: JSON.parse(JSON.stringify(initialVisualInspectionItems)),
    visualInspectionComments: '',
    insulationResistance: {
      tests: JSON.parse(JSON.stringify(initialInsulationResistanceTests)),
      dielectricAbsorptionRatio: {
        calculatedAs: '1 Min. / 0.5 Min. Values', priToGnd: '', secToGnd: '', priToSec: '', passFail: '', minimumDAR: '1.0'
      }
    },
    turnsRatio: {
      secondaryWindingVoltage: '',
      tests: Array(1).fill(null).map(() => ({ 
        tap: '3', nameplateVoltage: '', calculatedRatio: '',
        measuredH1H2: '', devH1H2: '', passFailH1H2: '',
        measuredH2H3: '', devH2H3: '', passFailH2H3: '',
        measuredH3H1: '', devH3H1: '', passFailH3H1: ''
      }))
    },
    testEquipment: {
      megohmmeter: { name: '', serialNumber: '', ampId: '' },
      ttrTestSet: { name: '', serialNumber: '', ampId: '' }
    },
    comments: '',
    status: 'PASS',
  });

  const loadJobInfo = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('title, job_number, customer_id')
        .eq('id', jobId)
        .single();
      if (jobError) throw jobError;

      let customerName = '';
      let customerAddress = '';
      if (jobData?.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .schema('common')
          .from('customers')
          .select('name, company_name, address')
          .eq('id', jobData.customer_id)
          .single();
        if (customerError) throw customerError;
        customerName = customerData?.company_name || customerData?.name || '';
        customerAddress = customerData?.address || '';
      }
      setFormData(prev => ({
        ...prev,
        jobNumber: jobData?.job_number || '',
        customer: customerName,
        address: customerAddress,
        user: prev.user || '',
      }));
    } catch (error) {
      console.error('Error loading job info:', error);
      setError(`Failed to load job information: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [jobId, user]);

  const loadReport = useCallback(async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('two_small_dry_type_xfmr_ats_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) throw error;

      if (data && data.report_data) {
        const loadedFormData = JSON.parse(JSON.stringify(data.report_data));
        
        setFormData(prev => ({
          ...prev,
          ...loadedFormData,
          user: data.user_id || loadedFormData.user || prev.user,
          temperature: {
            ...(prev.temperature),
            ...(loadedFormData.temperature || {}),
          },
          nameplate: {
            ...(prev.nameplate),
            ...(loadedFormData.nameplate || {}),
            tapVoltages: loadedFormData.nameplate?.tapVoltages || Array(7).fill(''),
          },
          visualInspectionItems: loadedFormData.visualInspectionItems || JSON.parse(JSON.stringify(initialVisualInspectionItems)),
          insulationResistance: {
            ...(prev.insulationResistance),
            ...(loadedFormData.insulationResistance || {}),
            tests: loadedFormData.insulationResistance?.tests || JSON.parse(JSON.stringify(initialInsulationResistanceTests)),
            dielectricAbsorptionRatio: {
              ...(prev.insulationResistance.dielectricAbsorptionRatio),
              ...(loadedFormData.insulationResistance?.dielectricAbsorptionRatio || {}),
            }
          },
          turnsRatio: {
            ...(prev.turnsRatio),
            ...(loadedFormData.turnsRatio || {}),
            tests: loadedFormData.turnsRatio?.tests || Array(1).fill(null).map(() => ({
              tap: '3', nameplateVoltage: '', calculatedRatio: '',
              measuredH1H2: '', devH1H2: '', passFailH1H2: '',
              measuredH2H3: '', devH2H3: '', passFailH2H3: '',
              measuredH3H1: '', devH3H1: '', passFailH3H1: ''
            }))
          },
          testEquipment: {
            ...(prev.testEquipment),
            ...(loadedFormData.testEquipment || {}),
            megohmmeter: {
                ...(prev.testEquipment.megohmmeter),
                ...(loadedFormData.testEquipment?.megohmmeter || {}),
            },
            ttrTestSet: {
                ...(prev.testEquipment.ttrTestSet),
                ...(loadedFormData.testEquipment?.ttrTestSet || {}),
            }
          }
        }));

        if (data.report_data.status) {
          setFormData(prev => ({ ...prev, status: data.report_data.status }));
        }
        setIsEditing(false);
      } else {
        setIsEditing(true); 
        console.warn(`No report data found for reportId: ${reportId}`);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      setError(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  }, [reportId, jobId, user]);

  useEffect(() => {
    loadJobInfo();
    if (reportId) {
      loadReport();
    } else {
      setLoading(false);
      setIsEditing(true);
      const initialCelsius = (formData.temperature.fahrenheit - 32) * 5 / 9;
      const initialTcf = getTCF(initialCelsius);
      setFormData(prev => ({
        ...prev,
        temperature: {
          ...prev.temperature,
          celsius: parseFloat(initialCelsius.toFixed(2)),
          tcf: initialTcf,
        }
      }));
    }
  }, [loadJobInfo, reportId, loadReport]);

  useEffect(() => {
    if (!isEditing && !reportId && reportId !== undefined) return;
    const newCelsius = (formData.temperature.fahrenheit - 32) * 5 / 9;
    const newTcf = getTCF(newCelsius);
    if (newCelsius !== formData.temperature.celsius || newTcf !== formData.temperature.tcf) {
      setFormData(prev => ({
        ...prev,
        temperature: {
          ...prev.temperature,
          celsius: parseFloat(newCelsius.toFixed(2)),
          tcf: newTcf,
        }
      }));
    }
  }, [formData.temperature.fahrenheit, isEditing, reportId]);

  useEffect(() => {
    if (!isEditing && !reportId && reportId !== undefined) return;
    const newFahrenheit = (formData.temperature.celsius * 9 / 5) + 32;
    const newTcf = getTCF(formData.temperature.celsius);
     if (newFahrenheit !== formData.temperature.fahrenheit || newTcf !== formData.temperature.tcf) {
        setFormData(prev => ({
        ...prev,
        temperature: {
            ...prev.temperature,
            fahrenheit: parseFloat(newFahrenheit.toFixed(2)),
            tcf: newTcf,
        }
        }));
    }
  }, [formData.temperature.celsius, isEditing, reportId]);

  useEffect(() => {
    const cf = (formData.temperature as any).correctionFactor ?? formData.temperature.tcf;
    const correction = typeof cf === 'number' && isFinite(cf) ? cf : undefined;
    if (correction === undefined) return;

    const nextTests = formData.insulationResistance.tests.map(test => ({
      ...test,
      corrected0_5Min: test.measured0_5Min && correction ? (parseFloat(test.measured0_5Min) * correction).toFixed(2) : '',
      corrected1Min: test.measured1Min && correction ? (parseFloat(test.measured1Min) * correction).toFixed(2) : '',
    }));

    const changed = JSON.stringify(nextTests) !== JSON.stringify(formData.insulationResistance.tests);
    if (!changed) return;

    setFormData(prev => ({
      ...prev,
      insulationResistance: {
        ...prev.insulationResistance,
        tests: nextTests
      }
    }));
  }, [formData.temperature.tcf, (formData.temperature as any).correctionFactor, formData.insulationResistance.tests]);

  // Sync tcf from correctionFactor if importer only provided correctionFactor
  useEffect(() => {
    const cf = (formData.temperature as any).correctionFactor;
    if (typeof cf === 'number' && isFinite(cf) && cf !== formData.temperature.tcf) {
      setFormData(prev => ({
        ...prev,
        temperature: { ...prev.temperature, tcf: cf }
      }));
    }
  }, [(formData.temperature as any).correctionFactor, formData.temperature.tcf]);

  // Sync Tap Position Left volts/percent based on selected tap and primary volts
  useEffect(() => {
    if (!isEditing && reportId) return;
    const tapIndex = Math.max(0, (parseInt(formData.nameplate.tapPosition) || 1) - 1);
    const tapVolt = formData.nameplate.tapVoltages[tapIndex] || '';
    const primaryNominal = parseFloat(formData.nameplate.voltsPrimary) || NaN;
    const percent = isFinite(primaryNominal) && primaryNominal !== 0 && tapVolt
      ? ((parseFloat(tapVolt) / primaryNominal) * 100).toFixed(1)
      : '';

    const changed = tapVolt !== formData.nameplate.tapPositionLeftVolts || percent !== formData.nameplate.tapPositionLeftPercent;
    if (!changed) return;

    setFormData(prev => ({
      ...prev,
      nameplate: {
        ...prev.nameplate,
        tapPositionLeftVolts: tapVolt,
        tapPositionLeftPercent: percent
      }
    }));
  }, [
    isEditing,
    reportId,
    formData.nameplate.tapPosition,
    formData.nameplate.tapVoltages,
    formData.nameplate.voltsPrimary,
    formData.nameplate.tapPositionLeftVolts,
    formData.nameplate.tapPositionLeftPercent
  ]);

  // Calculate Turns Ratio table values based on selected tap voltages and secondary winding voltage
  useEffect(() => {
    if (!isEditing && reportId) return;
    const secVolt = parseFloat(formData.turnsRatio.secondaryWindingVoltage);

    const nextTests = formData.turnsRatio.tests.map(test => {
      const tapIdx = Math.max(0, (parseInt(test.tap) || 1) - 1);
      const tapVolt = formData.nameplate.tapVoltages[tapIdx];
      const nameplateVoltage = test.nameplateVoltage && test.nameplateVoltage.trim() !== '' ? test.nameplateVoltage : (tapVolt || '');
      let calculatedRatio = '';
      const np = parseFloat(nameplateVoltage);
      if (isFinite(np) && isFinite(secVolt) && secVolt !== 0) {
        calculatedRatio = (np / secVolt).toFixed(3);
      }
      const computeDev = (measured: string, calculated: string) => {
        if (!measured || !calculated) return { deviation: '', passFail: '' };
        const measuredValue = parseFloat(measured);
        const calculatedValue = parseFloat(calculated);
        if (!isFinite(measuredValue) || !isFinite(calculatedValue) || calculatedValue === 0) return { deviation: '', passFail: '' };
        const deviation = ((measuredValue - calculatedValue) / calculatedValue * 100).toFixed(3);
        const dv = parseFloat(deviation);
        const passFail = (dv > -0.501 && dv < 0.501) ? 'PASS' : 'FAIL';
        return { deviation, passFail };
      };

      const d1 = computeDev(test.measuredH1H2, calculatedRatio);
      const d2 = computeDev(test.measuredH2H3, calculatedRatio);
      const d3 = computeDev(test.measuredH3H1, calculatedRatio);

      return {
        ...test,
        nameplateVoltage,
        calculatedRatio,
        devH1H2: d1.deviation,
        passFailH1H2: d1.passFail,
        devH2H3: d2.deviation,
        passFailH2H3: d2.passFail,
        devH3H1: d3.deviation,
        passFailH3H1: d3.passFail
      };
    });

    const changed = JSON.stringify(nextTests) !== JSON.stringify(formData.turnsRatio.tests);
    if (!changed) return;

    setFormData(prev => ({
      ...prev,
      turnsRatio: {
        ...prev.turnsRatio,
        tests: nextTests
      }
    }));
  }, [
    isEditing,
    reportId,
    formData.nameplate.tapVoltages,
    formData.turnsRatio.secondaryWindingVoltage,
    formData.turnsRatio.tests
  ]);

  // Compute Dielectric Absorption Ratio (1 min / 0.5 min) like MTS and update Calculated As section
  useEffect(() => {
    const tests = formData.insulationResistance.tests || [];
    const getRatio = (idx: number): string => {
      const row = tests[idx];
      if (!row) return '';
      const a = parseFloat(row.measured1Min);
      const b = parseFloat(row.measured0_5Min);
      if (!isFinite(a) || !isFinite(b) || b === 0) return '';
      const ratio = a / b;
      return isFinite(ratio) ? ratio.toFixed(2) : '';
    };

    const priToGnd = getRatio(0);
    const secToGnd = getRatio(1);
    const priToSec = getRatio(2);

    const minDAR = parseFloat(formData.insulationResistance.dielectricAbsorptionRatio.minimumDAR) || 1.0;
    const pass = [priToGnd, secToGnd, priToSec]
      .map(v => parseFloat(v))
      .every(v => isFinite(v) && v >= minDAR) ? 'PASS' : 'FAIL';

    const current = formData.insulationResistance.dielectricAbsorptionRatio;
    if (
      current.priToGnd === priToGnd &&
      current.secToGnd === secToGnd &&
      current.priToSec === priToSec &&
      current.passFail === pass
    ) {
      return;
    }

    setFormData(prev => ({
      ...prev,
      insulationResistance: {
        ...prev.insulationResistance,
        dielectricAbsorptionRatio: {
          ...prev.insulationResistance.dielectricAbsorptionRatio,
          priToGnd,
          secToGnd,
          priToSec,
          passFail: pass
        }
      }
    }));
  }, [
    formData.insulationResistance.tests,
    formData.insulationResistance.dielectricAbsorptionRatio.minimumDAR
  ]);

  const handleFahrenheitChange = (fahrenheit: number) => {
    if (!isEditing) return;
    setFormData(prev => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit }
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    if (!isEditing) return;
    setFormData(prev => ({
      ...prev,
      temperature: { ...prev.temperature, celsius }
    }));
  };

  const handleChange = (path: string, value: any) => {
    if (!isEditing) return;
    setFormData(prev => {
      const keys = path.split('.');
      const newState = JSON.parse(JSON.stringify(prev)) as FormData;
      let currentLevel = newState as any;

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!currentLevel[key] || typeof currentLevel[key] !== 'object') {
          currentLevel[key] = {};
        }
        currentLevel = currentLevel[key];
      }
      currentLevel[keys[keys.length - 1]] = value;
      return newState;
    });
  };

  const handleArrayChange = (section: keyof FormData, index: number, field: string, value: any) => {
    if (!isEditing) return;
    setFormData(prev => {
      const newArray = [...(prev[section] as any[])];
      newArray[index] = { ...newArray[index], [field]: value };
      return { ...prev, [section]: newArray };
    });
  };

  const handleNestedArrayChange = (
    sectionKey: keyof Pick<FormData, 'insulationResistance' | 'turnsRatio'>,
    testIndex: number,
    field: string,
    value: any
  ) => {
    if (!isEditing) return;
    setFormData(prev => {
      const section = prev[sectionKey] as any;
      const newTests = [...section.tests];
      newTests[testIndex] = { ...newTests[testIndex], [field]: value };
      return { ...prev, [sectionKey]: { ...section, tests: newTests } };
    });
  };

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_data: formData,
      created_at: reportId ? undefined : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let currentReportId = reportId;

    try {
      if (reportId) {
        const { error } = await supabase
          .schema('neta_ops')
          .from('two_small_dry_type_xfmr_ats_reports')
          .update(reportPayload)
          .eq('id', reportId);
        if (error) throw error;
      } else {
        const { data: insertData, error: insertError } = await supabase
          .schema('neta_ops')
          .from('two_small_dry_type_xfmr_ats_reports')
          .insert(reportPayload)
          .select('id')
          .single();
        if (insertError) throw insertError;
        if (!insertData) throw new Error("Failed to retrieve ID for new report.");
        currentReportId = insertData.id;

        const assetData = {
          name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
          file_url: `report:/jobs/${jobId}/two-small-dry-typer-xfmr-ats-report/${currentReportId}`,
          user_id: user.id,
        };
        const { data: assetResult, error: assetError } = await supabase
          .schema('neta_ops')
          .from('assets')
          .insert(assetData)
          .select('id')
          .single();

        if (assetError) throw assetError;
        if (!assetResult) throw new Error("Failed to retrieve ID for new asset.");

        await supabase
          .schema('neta_ops')
          .from('job_assets')
          .insert({
            job_id: jobId,
            asset_id: assetResult.id,
            user_id: user.id
          });
      }
      
      setIsEditing(false);
      alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      if (!reportId && currentReportId) {
        navigate(`/jobs/${jobId}/two-small-dry-typer-xfmr-ats-report/${currentReportId}`, { replace: true });
      } else {
        navigateAfterSave(navigate, jobId, location);
      }
    } catch (error: any) {
      console.error('Error saving report:', error);
      alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl font-semibold dark:text-white">Loading Report...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl font-semibold text-red-500">Error: {error}</div>
      </div>
    );
  }

  const renderHeader = () => (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => { if (isEditing) setFormData(prev => ({ ...prev, status: prev.status === 'PASS' ? 'FAIL' : 'PASS' })); }}
          className={`px-4 py-2 rounded-md text-white font-medium transition-colors
                        ${formData.status === 'PASS' ? 'bg-green-600' : 'bg-red-600'}
                        ${isEditing ? (formData.status === 'PASS' ? 'hover:bg-green-700' : 'hover:bg-red-700') : 'opacity-70 cursor-not-allowed'}`}
          disabled={!isEditing}
        >
          {formData.status}
        </button>
        {reportId && !isEditing ? (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Edit Report
            </button>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Print Report
            </button>
          </>
        ) : (
          <button
            onClick={handleSave}
            disabled={!isEditing || loading}
            className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700 disabled:opacity-50'}`}
          >
            {loading ? 'Saving...' : (reportId ? 'Update Report' : 'Save Report')}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <div style={{ width: '120px', display: 'flex', justifyContent: 'flex-start' }}>
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 35, marginLeft: '5px', marginTop: '2px' }} />
        </div>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c', width: '120px' }}>
          NETA - ATS 7.2.1.1
          <div className="hidden print:block mt-2">
            <div
              className="pass-fail-status-box"
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                width: 'fit-content',
                borderRadius: '6px',
                border: '2px solid #16a34a',
                backgroundColor: '#22c55e',
                color: 'white',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
                boxSizing: 'border-box',
                minWidth: '50px',
              }}
            >
              {formData.status || 'PASS'}
            </div>
          </div>
        </div>
      </div>
      {/* End Print Header */}
      
      <div className="p-6 flex justify-center bg-gray-50 dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-6">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            {renderHeader()}
          </div>
          
          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print-divider"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2 print:hidden job-info-onscreen">
               <div>
                 <label htmlFor="customer" className="form-label">Customer:</label>
                 <input id="customer" type="text" name="customer" value={formData.customer} onChange={(e) => handleChange("customer", e.target.value)} readOnly className={`form-input text-sm bg-gray-100 dark:bg-dark-200 cursor-not-allowed`} />
               </div>
               <div>
                 <label htmlFor="address" className="form-label">Address:</label>
                 <input id="address" type="text" name="address" value={formData.address} onChange={(e) => handleChange("address", e.target.value)} readOnly className={`form-input text-sm bg-gray-100 dark:bg-dark-200 cursor-not-allowed`} />
               </div>
               <div>
                 <label htmlFor="jobNumber" className="form-label">Job Number:</label>
                 <input id="jobNumber" type="text" name="jobNumber" value={formData.jobNumber} onChange={(e) => handleChange("jobNumber", e.target.value)} readOnly className={`form-input text-sm bg-gray-100 dark:bg-dark-200 cursor-not-allowed`} />
               </div>
               <div>
                 <label htmlFor="date" className="form-label">Date:</label>
                 <input id="date" type="date" name="date" value={formData.date} onChange={(e) => handleChange("date", e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
               </div>
                <div>
                 <label htmlFor="technicians" className="form-label">Technicians:</label>
                 <input id="technicians" type="text" name="technicians" value={formData.technicians} onChange={(e) => handleChange("technicians", e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
               </div>
                <div>
                 <label htmlFor="identifier" className="form-label">Identifier:</label>
                 <input id="identifier" type="text" name="identifier" value={formData.identifier} onChange={(e) => handleChange("identifier", e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
               </div>
               <div className="grid grid-cols-2 gap-x-2">
                 <div>
                     <label htmlFor="tempF" className="form-label">Temp (°F):</label>
                     <div className="flex items-center">
                     <input id="tempF" type="number" value={formData.temperature.fahrenheit} onChange={(e) => handleFahrenheitChange(parseFloat(e.target.value))} readOnly={!isEditing} className={`form-input text-sm w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                     </div>
                 </div>
                 <div>
                     <label htmlFor="tempC" className="form-label">Temp (°C):</label>
                     <div className="flex items-center">
                     <input id="tempC" type="number" value={formData.temperature.celsius} onChange={(e) => handleCelsiusChange(parseFloat(e.target.value))} readOnly={!isEditing} className={`form-input text-sm w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                     </div>
                 </div>
               </div>
               <div>
                 <label htmlFor="user" className="form-label">User:</label>
                 <input id="user" type="text" name="user" value={formData.user} onChange={(e) => handleChange("user", e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
               </div>
                <div>
                     <label htmlFor="humidity" className="form-label">Humidity (%):</label>
                     <div className="flex items-center">
                     <input id="humidity" type="number" name="temperature.humidity" value={formData.temperature.humidity} onChange={(e) => handleChange("temperature.humidity", parseFloat(e.target.value))} readOnly={!isEditing} className={`form-input text-sm w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                     </div>
                 </div>
                 <div className="flex items-center mt-auto mb-1">
                   <label className="form-label mr-2">TCF:</label>
                   <span className="font-medium text-gray-900 dark:text-white">{formData.temperature.tcf}</span>
               </div>
               <div>
                 <label htmlFor="substation" className="form-label">Substation:</label>
                 <input id="substation" type="text" name="substation" value={formData.substation} onChange={(e) => handleChange("substation", e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
               </div>
               <div>
                 <label htmlFor="eqptLocation" className="form-label">Eqpt. Location:</label>
                 <input id="eqptLocation" type="text" name="eqptLocation" value={formData.eqptLocation} onChange={(e) => handleChange("eqptLocation", e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
               </div>
             </div>
             
             {/* Print-only Job Information table */}
             <div className="hidden print:block">
               <JobInfoPrintTable
                 data={{
                   customer: formData.customer,
                   address: formData.address,
                   jobNumber: formData.jobNumber,
                   technicians: formData.technicians,
                   date: formData.date,
                   identifier: formData.identifier,
                   user: formData.user,
                   substation: formData.substation,
                   eqptLocation: formData.eqptLocation,
                   temperature: { ...formData.temperature }
                 }}
               />
             </div>
           </section>

          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print-divider"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Nameplate Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mb-4 print:hidden nameplate-onscreen">
                <div>
                    <label htmlFor="nameplate.manufacturer" className="form-label">Manufacturer</label>
                    <input id="nameplate.manufacturer" type="text" name="nameplate.manufacturer" value={formData.nameplate.manufacturer} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div>
                    <label htmlFor="nameplate.catalogNumber" className="form-label">Catalog Number</label>
                    <input id="nameplate.catalogNumber" type="text" name="nameplate.catalogNumber" value={formData.nameplate.catalogNumber} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div>
                    <label htmlFor="nameplate.serialNumber" className="form-label">Serial Number</label>
                    <input id="nameplate.serialNumber" type="text" name="nameplate.serialNumber" value={formData.nameplate.serialNumber} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mb-6 print:hidden nameplate-onscreen">
                <div>
                    <label htmlFor="nameplate.kvaBase" className="form-label">KVA</label>
                    <div className="flex items-center">
                        <input id="nameplate.kvaBase" type="text" name="nameplate.kvaBase" placeholder="Base" value={formData.nameplate.kvaBase} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm w-1/2 mr-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                        <span className="text-gray-500 dark:text-gray-400">/</span>
                        <input id="nameplate.kvaCooling" type="text" name="nameplate.kvaCooling" placeholder="Cooling" value={formData.nameplate.kvaCooling} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm w-1/2 ml-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    </div>
                </div>
                 <div>
                    <label htmlFor="nameplate.tempRise" className="form-label">Temp. Rise (°C)</label>
                    <input id="nameplate.tempRise" type="text" name="nameplate.tempRise" value={formData.nameplate.tempRise} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div>
                    <label htmlFor="nameplate.impedance" className="form-label">Impedance (%)</label>
                    <input id="nameplate.impedance" type="text" name="nameplate.impedance" value={formData.nameplate.impedance} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
            </div>

            <div className="grid grid-cols-12 gap-x-2 mb-2 print:hidden nameplate-onscreen">
              <div className="col-span-2">{/* Spacer */}</div>
              <div className="col-span-3 text-center form-label font-medium">Volts</div>
              <div className="col-span-4 text-center form-label font-medium">Connections</div>
              <div className="col-span-3 text-center form-label font-medium">Winding Material</div>
            </div>

            <div className="grid grid-cols-12 gap-x-2 mb-4 items-center print:hidden nameplate-onscreen">
              <div className="col-span-2 form-label self-center">Primary</div>
              <div className="col-span-3 flex items-center">
                <input type="text" name="nameplate.voltsPrimary" placeholder="Primary" value={formData.nameplate.voltsPrimary} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm w-1/2 mr-1 text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                <span className="text-gray-500 dark:text-gray-400">/</span>
                <input type="text" name="nameplate.voltsPrimaryInternal" placeholder="Secondary" value={formData.nameplate.voltsPrimaryInternal} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm w-1/2 ml-1 text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
              </div>
              <div className="col-span-4 flex justify-around items-center">
                {connectionOptions.map(opt => (
                  <label key={`pri-${opt}`} className="inline-flex items-center">
                    <input type="radio" name="nameplate.connectionsPrimary" value={opt} checked={formData.nameplate.connectionsPrimary === opt} onChange={(e) => handleChange(e.target.name, e.target.value)} disabled={!isEditing} className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]" />
                    <span className="ml-1 text-sm text-gray-700 dark:text-gray-300">{opt}</span>
                  </label>
                ))}
              </div>
              <div className="col-span-3 flex justify-around items-center">
                {materialOptions.map(opt => (
                  <label key={`pri-mat-${opt}`} className="inline-flex items-center">
                    <input type="radio" name="nameplate.windingMaterialPrimary" value={opt} checked={formData.nameplate.windingMaterialPrimary === opt} onChange={(e) => handleChange(e.target.name, e.target.value)} disabled={!isEditing} className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]" />
                    <span className="ml-1 text-sm text-gray-700 dark:text-gray-300">{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-x-2 mb-6 items-center print:hidden nameplate-onscreen">
              <div className="col-span-2 form-label self-center">Secondary</div>
              <div className="col-span-3 flex items-center">
                <input type="text" name="nameplate.voltsSecondary" placeholder="Secondary" value={formData.nameplate.voltsSecondary} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm w-1/2 mr-1 text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                <span className="text-gray-500 dark:text-gray-400">/</span>
                <input type="text" name="nameplate.voltsSecondaryInternal" placeholder="Internal" value={formData.nameplate.voltsSecondaryInternal} onChange={(e) => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm w-1/2 ml-1 text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
              </div>
              <div className="col-span-4 flex justify-around items-center">
                {connectionOptions.map(opt => (
                  <label key={`sec-${opt}`} className="inline-flex items-center">
                    <input type="radio" name="nameplate.connectionsSecondary" value={opt} checked={formData.nameplate.connectionsSecondary === opt} onChange={(e) => handleChange(e.target.name, e.target.value)} disabled={!isEditing} className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]" />
                    <span className="ml-1 text-sm text-gray-700 dark:text-gray-300">{opt}</span>
                  </label>
                ))}
              </div>
              <div className="col-span-3 flex justify-around items-center">
                {materialOptions.map(opt => (
                  <label key={`sec-mat-${opt}`} className="inline-flex items-center">
                    <input type="radio" name="nameplate.windingMaterialSecondary" value={opt} checked={formData.nameplate.windingMaterialSecondary === opt} onChange={(e) => handleChange(e.target.name, e.target.value)} disabled={!isEditing} className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]" />
                    <span className="ml-1 text-sm text-gray-700 dark:text-gray-300">{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            <h3 className="text-lg font-medium mb-4 text-gray-900 dark:text-white border-t dark:border-gray-700 pt-4 print:hidden nameplate-onscreen">Tap Configuration</h3>
            <div className="print:hidden nameplate-onscreen">
              <label className="form-label mb-1">Tap Voltages</label>
              <div className="grid grid-cols-7 gap-2">
                {formData.nameplate.tapVoltages.map((_, index) => (
                  <div key={`tap-label-${index}`} className="text-center form-label text-sm">{index + 1}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2 mb-4">
                {formData.nameplate.tapVoltages.map((tv, index) => (
                  <input 
                    key={`tapVoltage-${index}`} 
                    id={`tapVoltage-${index}`} 
                    type="text" 
                    value={tv} 
                    onChange={(e) => {
                      const newTaps = [...formData.nameplate.tapVoltages];
                      newTaps[index] = e.target.value;
                      handleChange('nameplate.tapVoltages', newTaps);
                    }}
                    readOnly={!isEditing} 
                    className={`form-input text-sm text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} 
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 items-end print:hidden nameplate-onscreen">
              <div>
                <label htmlFor="nameplate.tapPosition" className="form-label">Tap Position</label>
                <select 
                  id="nameplate.tapPosition" 
                  name="nameplate.tapPosition" 
                  value={formData.nameplate.tapPosition} 
                  onChange={(e) => handleChange(e.target.name, e.target.value)} 
                  disabled={!isEditing} 
                  className={`form-select text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                >
                  {Array.from({length: 7}, (_, i) => i + 1).map(num => <option key={num} value={num.toString()}>{num}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="nameplate.tapPositionLeftVolts" className="form-label">Tap Position Left</label>
                <div className="flex items-center">
                  <input 
                    id="nameplate.tapPositionLeftNumber" 
                    type="number"
                    name="nameplate.tapPositionLeftNumberPlaceholder"
                    value={formData.nameplate.tapPosition}
                    readOnly
                    className={`form-input text-sm w-16 text-center mr-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} 
                  />
                  <span className="text-gray-500 dark:text-gray-400 mx-1">/</span>
                  <input 
                    id="nameplate.tapPositionLeftVolts" 
                    type="text" 
                    name="nameplate.tapPositionLeftVolts" 
                    placeholder="Volts"
                    value={formData.nameplate.tapPositionLeftVolts} 
                    onChange={(e) => handleChange(e.target.name, e.target.value)} 
                    readOnly={!isEditing} 
                    className={`form-input text-sm w-1/2 mr-2 text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} 
                  />
                  <input 
                    id="nameplate.tapPositionLeftPercent" 
                    type="text" 
                    name="nameplate.tapPositionLeftPercent" 
                    placeholder="Percent"
                    value={formData.nameplate.tapPositionLeftPercent} 
                    onChange={(e) => handleChange(e.target.name, e.target.value)} 
                    readOnly={!isEditing} 
                    className={`form-input text-sm w-1/2 text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} 
                  />
                </div>
              </div>
            </div>

            {/* Print-only Nameplate Data tables */}
            <div className="hidden print:block space-y-4">
              {/* Table 1: Basic Information */}
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                <colgroup>
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">Manufacturer:</span> {formData.nameplate.manufacturer || ''}
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">Catalog Number:</span> {formData.nameplate.catalogNumber || ''}
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">Serial Number:</span> {formData.nameplate.serialNumber || ''}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">KVA:</span> {formData.nameplate.kvaBase || ''} / {formData.nameplate.kvaCooling || ''}
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">Temp. Rise °C:</span> {formData.nameplate.tempRise || ''}
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">Impedance:</span> {formData.nameplate.impedance || ''}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Table 2: Primary/Secondary Details */}
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"></th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" colSpan={1}>
                      Volts
                    </th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" colSpan={3}>
                      Connections
                    </th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600" colSpan={2}>
                      Winding Materials
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Primary</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">{formData.nameplate.voltsPrimary || ''} / {formData.nameplate.voltsPrimaryInternal || ''}</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.connectionsPrimary === 'Delta' ? '☒' : '☐'} Delta
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.connectionsPrimary === 'Wye' ? '☒' : '☐'} Wye
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.connectionsPrimary === 'Single Phase' ? '☒' : '☐'} Single Phase
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.windingMaterialPrimary === 'Aluminum' ? '☒' : '☐'} Aluminum
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.windingMaterialPrimary === 'Copper' ? '☒' : '☐'} Copper
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Secondary</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">{formData.nameplate.voltsSecondary || ''} / {formData.nameplate.voltsSecondaryInternal || ''}</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.connectionsSecondary === 'Delta' ? '☒' : '☐'} Delta
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.connectionsSecondary === 'Wye' ? '☒' : '☐'} Wye
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.connectionsSecondary === 'Single Phase' ? '☒' : '☐'} Single Phase
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.windingMaterialSecondary === 'Aluminum' ? '☒' : '☐'} Aluminum
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                      {formData.nameplate.windingMaterialSecondary === 'Copper' ? '☒' : '☐'} Copper
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Table 3: Tap Configuration */}
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Tap Position</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">1</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">2</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">3</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">4</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">5</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">6</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">7</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Tap Voltages</td>
                    {formData.nameplate.tapVoltages.map((voltage, index) => (
                      <td key={index} className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">{voltage || ''}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Tap Position Left</td>
                    <td colSpan={7} className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                      Position: {formData.nameplate.tapPosition || ''} / {formData.nameplate.tapPosition || ''} |
                      Volts: {formData.nameplate.tapPositionLeftVolts || ''} |
                      Percent: {formData.nameplate.tapPositionLeftPercent || ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>



          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print-divider"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 visual-mechanical-table table-fixed">
                <colgroup>
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '70%' }} />
                  <col style={{ width: '24%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">NETA Section</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Description</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Results</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.visualInspectionItems.map((item, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm">{item.netaSection}</td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm">{item.description}</td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                        <div className="print:hidden">
                        <select
                          value={item.result}
                          onChange={(e) => handleArrayChange('visualInspectionItems', index, 'result', e.target.value)}
                          disabled={!isEditing}
                          className={`form-select w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        >
                          {visualInspectionOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        </div>
                        <div className="hidden print:block text-center">{item.result || ''}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 print:hidden">
              <label htmlFor="visualInspectionComments" className="form-label">Comments:</label>
              <textarea
                id="visualInspectionComments"
                value={formData.visualInspectionComments}
                onChange={(e) => handleChange('visualInspectionComments', e.target.value)}
                readOnly={!isEditing}
                rows={3}
                className={`form-textarea w-full mt-1 text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            
            {/* Print-only Visual Inspection Comments table */}
            <div className="hidden print:block">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Visual Inspection Comments</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm min-h-[60px] align-top">
                      {formData.visualInspectionComments || ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print-divider"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Measured Insulation Resistance</h2>
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Winding Tested</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Test Voltage (VDC)</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">0.5 Min.</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">1 Min.</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Units</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">0.5 Min.</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">1 Min.</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Units</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Value</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Units</th>
                  </tr>
                  <tr>
                    <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"></th>
                    <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"></th>
                    <th colSpan={3} className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Measured Insulation Resistance</th>
                    <th colSpan={3} className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Corrected Insulation Resistance to 20° C</th>
                    <th colSpan={2} className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Table 100.5 Min. Value</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.insulationResistance.tests.map((test, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">{test.winding}</td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                        <select value={test.testVoltage} onChange={(e) => handleNestedArrayChange('insulationResistance', index, 'testVoltage', e.target.value)} disabled={!isEditing} className={`form-select w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                          {testVoltageOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.measured0_5Min} onChange={(e) => handleNestedArrayChange('insulationResistance', index, 'measured0_5Min', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.measured1Min} onChange={(e) => handleNestedArrayChange('insulationResistance', index, 'measured1Min', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                        <select value={test.units} onChange={(e) => handleNestedArrayChange('insulationResistance', index, 'units', e.target.value)} disabled={!isEditing} className={`form-select w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                          {insulationResistanceUnitsOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.corrected0_5Min} readOnly className="form-input w-full text-center text-sm bg-gray-100 dark:bg-dark-200" /></td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.corrected1Min} readOnly className="form-input w-full text-center text-sm bg-gray-100 dark:bg-dark-200" /></td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"> 
                        <select value={test.correctedUnits} onChange={(e) => handleNestedArrayChange('insulationResistance', index, 'correctedUnits', e.target.value)} disabled={!isEditing} className={`form-select w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                          {insulationResistanceUnitsOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.tableMinimum} onChange={(e) => handleNestedArrayChange('insulationResistance', index, 'tableMinimum', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                      <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                        <select value={test.tableMinimumUnits} onChange={(e) => handleNestedArrayChange('insulationResistance', index, 'tableMinimumUnits', e.target.value)} disabled={!isEditing} className={`form-select w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                          {insulationResistanceUnitsOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Calculated As:</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Pri to Gnd</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Sec to Gnd</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Pri to Sec</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Pass/Fail</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Min. D.A.R.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 text-left border border-gray-300 dark:border-gray-600">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formData.insulationResistance.dielectricAbsorptionRatio.calculatedAs}
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                      <input type="text" name="insulationResistance.dielectricAbsorptionRatio.priToGnd" value={formData.insulationResistance.dielectricAbsorptionRatio.priToGnd} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-center text-sm w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/>
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                      <input type="text" name="insulationResistance.dielectricAbsorptionRatio.secToGnd" value={formData.insulationResistance.dielectricAbsorptionRatio.secToGnd} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-center text-sm w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/>
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                      <input type="text" name="insulationResistance.dielectricAbsorptionRatio.priToSec" value={formData.insulationResistance.dielectricAbsorptionRatio.priToSec} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-center text-sm w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/>
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                      <select name="insulationResistance.dielectricAbsorptionRatio.passFail" value={formData.insulationResistance.dielectricAbsorptionRatio.passFail} onChange={e => handleChange(e.target.name, e.target.value)} disabled={!isEditing} className={`form-select text-center text-sm w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                        {passFailOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                      <input type="text" name="insulationResistance.dielectricAbsorptionRatio.minimumDAR" value={formData.insulationResistance.dielectricAbsorptionRatio.minimumDAR} readOnly className="form-input text-center text-sm bg-gray-100 dark:bg-dark-200 w-full"/>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print-divider"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Turns Ratio</h2>
            <div className="flex justify-end mb-4">
                <label htmlFor="turnsRatio.secondaryWindingVoltage" className="form-label mr-2">Secondary Winding Voltage (L-N for Wye, L-L for Delta):</label>
                <input id="turnsRatio.secondaryWindingVoltage" type="text" name="turnsRatio.secondaryWindingVoltage" value={formData.turnsRatio.secondaryWindingVoltage} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input w-24 text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /> <span className="ml-1">V</span>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 turns-ratio-table">
                    <colgroup>
                      <col className="tr-tap" />
                      <col className="tr-nameplate" />
                      <col className="tr-calc" />
                      <col className="tr-h1-meas" />
                      <col className="tr-h1-dev" />
                      <col className="tr-h1-pf" />
                      <col className="tr-h2-meas" />
                      <col className="tr-h2-dev" />
                      <col className="tr-h2-pf" />
                      <col className="tr-h3-meas" />
                      <col className="tr-h3-dev" />
                      <col className="tr-h3-pf" />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Tap</th>
                            <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Nameplate Voltage Ratio</th>
                            <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Calculated Ratio</th>
                            <th colSpan={3} className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">H1-H2 / X1-X2(X0)</th>
                            <th colSpan={3} className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">H2-H3 / Y1-Y2(Y0)</th>
                            <th colSpan={3} className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">H3-H1 / Z1-Z2(Z0)</th>
                        </tr>
                        <tr>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"></th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"></th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"></th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Measured</th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">% Dev.</th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Pass/Fail</th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Measured</th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">% Dev.</th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Pass/Fail</th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Measured</th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">% Dev.</th>
                            <th className="px-3 py-1 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Pass/Fail</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formData.turnsRatio.tests.map((test, index) => (
                            <tr key={index}>
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                                    <select value={test.tap} onChange={e => handleNestedArrayChange('turnsRatio', index, 'tap', e.target.value)} disabled={!isEditing} className={`form-select w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                        {Array.from({length: 7}, (_, i) => i + 1).map(num => <option key={num} value={num.toString()}>{num}</option>)}
                                    </select>
                                </td>
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.nameplateVoltage} onChange={e => handleNestedArrayChange('turnsRatio', index, 'nameplateVoltage', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.calculatedRatio} readOnly className="form-input w-full text-center text-sm bg-gray-100 dark:bg-dark-200" /></td>
                                
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.measuredH1H2} onChange={e => handleNestedArrayChange('turnsRatio', index, 'measuredH1H2', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.devH1H2} readOnly className="form-input w-full text-center text-sm bg-gray-100 dark:bg-dark-200" /></td>
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                                    <select value={test.passFailH1H2} onChange={e => handleNestedArrayChange('turnsRatio', index, 'passFailH1H2', e.target.value)} disabled={!isEditing} className={`form-select w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                        {passFailOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </td>

                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.measuredH2H3} onChange={e => handleNestedArrayChange('turnsRatio', index, 'measuredH2H3', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.devH2H3} readOnly className="form-input w-full text-center text-sm bg-gray-100 dark:bg-dark-200" /></td>
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                                    <select value={test.passFailH2H3} onChange={e => handleNestedArrayChange('turnsRatio', index, 'passFailH2H3', e.target.value)} disabled={!isEditing} className={`form-select w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                        {passFailOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </td>

                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.measuredH3H1} onChange={e => handleNestedArrayChange('turnsRatio', index, 'measuredH3H1', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600"><input type="text" value={test.devH3H1} readOnly className="form-input w-full text-center text-sm bg-gray-100 dark:bg-dark-200" /></td>
                                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                                    <select value={test.passFailH3H1} onChange={e => handleNestedArrayChange('turnsRatio', index, 'passFailH3H1', e.target.value)} disabled={!isEditing} className={`form-select w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                        {passFailOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </section>

          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print-divider"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden test-eqpt-onscreen">
                <div>
                    <h3 className="font-medium mb-1 text-gray-900 dark:text-white">Megohmmeter:</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <input type="text" name="testEquipment.megohmmeter.name" placeholder="Name" value={formData.testEquipment.megohmmeter.name} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                        <input type="text" name="testEquipment.megohmmeter.serialNumber" placeholder="Serial Number" value={formData.testEquipment.megohmmeter.serialNumber} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                        <input type="text" name="testEquipment.megohmmeter.ampId" placeholder="AMP ID" value={formData.testEquipment.megohmmeter.ampId} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    </div>
                </div>
                 <div>
                    <h3 className="font-medium mb-1 text-gray-900 dark:text-white">TTR Test Set:</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <input type="text" name="testEquipment.ttrTestSet.name" placeholder="Name" value={formData.testEquipment.ttrTestSet.name} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                        <input type="text" name="testEquipment.ttrTestSet.serialNumber" placeholder="Serial Number" value={formData.testEquipment.ttrTestSet.serialNumber} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                        <input type="text" name="testEquipment.ttrTestSet.ampId" placeholder="AMP ID" value={formData.testEquipment.ttrTestSet.ampId} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    </div>
                </div>
            </div>
            
            {/* Print-only Test Equipment Used table */}
            <div className="hidden print:block">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Equipment</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Name</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Serial Number</th>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">AMP ID</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm font-medium">Megohmmeter</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm">{formData.testEquipment.megohmmeter.name || ''}</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm">{formData.testEquipment.megohmmeter.serialNumber || ''}</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm">{formData.testEquipment.megohmmeter.ampId || ''}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm font-medium">TTR Test Set</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm">{formData.testEquipment.ttrTestSet.name || ''}</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm">{formData.testEquipment.ttrTestSet.serialNumber || ''}</td>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm">{formData.testEquipment.ttrTestSet.ampId || ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4 print-divider"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
            <textarea 
                name="comments" 
                value={formData.comments} 
                onChange={(e) => handleChange(e.target.name, e.target.value)} 
                readOnly={!isEditing} 
                rows={4} 
                className={`form-textarea w-full text-sm print:hidden ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
            
            {/* Print-only Comments table */}
            <div className="hidden print:block">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead>
                  <tr>
                    <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm min-h-[80px] align-top">
                      {formData.comments || ''}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </ReportWrapper>
  );
};

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      * { color: black !important; background: white !important; box-sizing: border-box !important; }
      body { margin: 0 !important; padding: 20px !important; font-family: Arial, sans-serif !important; font-size: 12px !important; }

      /* Remove shadows only; keep borders for structure */
      .shadow, .shadow-md, .shadow-lg { box-shadow: none !important; }

      /* Section headers */
      section > h2 { border-bottom: 1px solid black !important; padding-bottom: 2px !important; margin-bottom: 6px !important; font-weight: bold !important; }

      /* Ensure orange dividers render in print even when background printing is disabled */
      .print-divider {
        background: transparent !important; /* Avoid reliance on background-color in print */
        height: 0 !important;
        border-top: 2px solid black !important;
        margin: 0 0 12px 0 !important;
        display: block !important;
      }

      /* Ensure Tailwind print:flex headers render in print (match Panelboard) */
      .print\\:flex { display: flex !important; }

      /* Job info grid: force compact columns */
      section:has(> h2:contains('Job Information')) .grid { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; gap: 8px !important; }
      section:has(> h2:contains('Job Information')) input { font-size: 10px !important; height: 22px !important; }

      /* Tables */
      table { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; }
      th, td { border: 1px solid black !important; padding: 3px !important; font-size: 10px !important; }
      th { background-color: #f0f0f0 !important; }

      /* Turns Ratio column sizing for print */
      table.turns-ratio-table col.tr-tap { width: 6% !important; }
      table.turns-ratio-table col.tr-nameplate { width: 10% !important; }
      table.turns-ratio-table col.tr-calc { width: 10% !important; }
      table.turns-ratio-table col.tr-h1-meas,
      table.turns-ratio-table col.tr-h2-meas,
      table.turns-ratio-table col.tr-h3-meas { width: 11% !important; }
      table.turns-ratio-table col.tr-h1-dev,
      table.turns-ratio-table col.tr-h2-dev,
      table.turns-ratio-table col.tr-h3-dev { width: 7% !important; }
      table.turns-ratio-table col.tr-h1-pf,
      table.turns-ratio-table col.tr-h2-pf,
      table.turns-ratio-table col.tr-h3-pf { width: 7% !important; }

      /* Tighten small fields inside Turns Ratio */
      table.turns-ratio-table input, table.turns-ratio-table select { font-size: 10px !important; padding: 1px 2px !important; }
      table.turns-ratio-table td { padding: 2px !important; }

      /* Turns Ratio: allow header text to wrap and stay readable */
      table.turns-ratio-table th { 
        white-space: normal !important; 
        word-break: break-word !important; 
        hyphens: auto !important; 
        line-height: 1.1 !important; 
        font-size: 9px !important; 
        padding: 2px !important; 
        text-align: center !important;
      }

      /* Center and slightly shrink inputs/selects for better fit */
      table.turns-ratio-table input, 
      table.turns-ratio-table select { 
        width: 88% !important; 
        margin: 0 auto !important; 
        text-align: center !important; 
      }

      /* First three narrow columns: make fields even smaller */
      table.turns-ratio-table td:nth-child(1) select,
      table.turns-ratio-table td:nth-child(2) input,
      table.turns-ratio-table td:nth-child(3) input { 
        width: 75% !important; 
      }

      /* Inputs inside tables */
      table input, table select { width: 95% !important; height: 18px !important; border: 1px solid black !important; font-size: 10px !important; padding: 1px 2px !important; background: transparent !important; }

      /* Avoid page breaks mid-section */
      section { page-break-inside: avoid !important; margin-bottom: 14px !important; }
      
      /* Hide on-screen grids in print to avoid duplication */
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }

      .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
      .nameplate-onscreen, .nameplate-onscreen * { display: none !important; }
      
      /* Ensure print-only tables are visible */
      .hidden.print\\:block { display: block !important; }
      .hidden.print\\:block * { display: revert !important; }
      
      /* Visual & Mechanical table widths for readability */
      table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
      table.visual-mechanical-table thead { display: table-header-group !important; }
      table.visual-mechanical-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      table.visual-mechanical-table th, table.visual-mechanical-table td { font-size: 8px !important; padding: 2px 3px !important; vertical-align: middle !important; }
      table.visual-mechanical-table colgroup col:nth-child(1) { width: 6% !important; }
      table.visual-mechanical-table colgroup col:nth-child(2) { width: 70% !important; }
      table.visual-mechanical-table colgroup col:nth-child(3) { width: 24% !important; }
      table.visual-mechanical-table td:nth-child(2) { white-space: normal !important; word-break: break-word !important; }

      /* Nameplate Details table - optimize column widths */
      table:has(colgroup col[style*="33.33%"]) { table-layout: fixed !important; width: 100% !important; }
      table:has(colgroup col[style*="33.33%"]) td:nth-child(1) { width: 33.33% !important; min-width: 33.33% !important; max-width: 33.33% !important; }
      table:has(colgroup col[style*="33.33%"]) td:nth-child(2) { width: 33.33% !important; min-width: 33.33% !important; max-width: 33.33% !important; }
      table:has(colgroup col[style*="33.33%"]) td:nth-child(3) { width: 33.33% !important; min-width: 33.33% !important; max-width: 33.33% !important; }
      
      table:has(colgroup col[style*="12%"]) { table-layout: fixed !important; width: 100% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(1) { width: 12% !important; min-width: 12% !important; max-width: 12% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(2) { width: 18% !important; min-width: 18% !important; max-width: 18% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(3) { width: 16% !important; min-width: 16% !important; max-width: 16% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(4) { width: 16% !important; min-width: 16% !important; max-width: 16% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(5) { width: 16% !important; min-width: 16% !important; max-width: 16% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(6) { width: 9% !important; min-width: 9% !important; max-width: 9% !important; }
      table:has(colgroup col[style*="12%"]) td:nth-child(7) { width: 9% !important; min-width: 9% !important; max-width: 9% !important; }

      /* PASS/FAIL status styles */
      .pass-fail-status-box {
        display: inline-block !important;
        padding: 4px 10px !important;
        font-size: 12px !important;
        font-weight: bold !important;
        text-align: center !important;
        width: fit-content !important;
        border-radius: 6px !important;
        box-sizing: border-box !important;
        min-width: 60px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color: #fff !important;
        border: 2px solid transparent !important;
        float: right !important;
      }
      .pass-fail-status-box.pass { background-color: #22c55e !important; border-color: #16a34a !important; }
      .pass-fail-status-box.fail { background-color: #ef4444 !important; border-color: #dc2626 !important; }

      button { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

export default TwoSmallDryTyperXfmrATSReport; 