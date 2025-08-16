import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';

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
    correctionFactor: number;
  };
  substation: string;
  eqptLocation: string;

  // Nameplate Data
  nameplate: {
    manufacturer: string;
    kvaBase: string;
    kvaCooling: string;
    voltsPrimary: string;
    voltsPrimarySecondary: string;
    voltsSecondary: string;
    voltsSecondarySecondary: string;
    connectionsPrimary: 'Delta' | 'Wye' | 'Single Phase';
    connectionsSecondary: 'Delta' | 'Wye' | 'Single Phase';
    windingMaterialPrimary: 'Aluminum' | 'Copper';
    windingMaterialSecondary: 'Aluminum' | 'Copper';
    catalogNumber: string;
    tempRise: string;
    serialNumber: string;
    impedance: string;
    tapVoltages: string[];
    tapPosition: string;
    tapPositionLeftVolts: string;
    tapPositionLeftPercent: string;
  };

  // Indicator Gauge Values
  indicatorGauges: {
    liquidLevel: string;
    temperature: string;
    pressureVacuum: string;
  };

  // Visual and Mechanical Inspection
  visualInspectionItems: Array<{
    netaSection: string;
    description: string;
    result: string;
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
      dielectricAbsorption: string;
    }>;
    dielectricAbsorptionAcceptable: string;
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
  { winding: 'Primary to Ground', testVoltage: '1000V', measured0_5Min: '', measured1Min: '', units: 'GΩ', corrected0_5Min: '', corrected1Min: '', correctedUnits: 'GΩ', tableMinimum: '100.5', tableMinimumUnits: 'GΩ', dielectricAbsorption: '' },
  { winding: 'Secondary to Ground', testVoltage: '500V', measured0_5Min: '', measured1Min: '', units: 'GΩ', corrected0_5Min: '', corrected1Min: '', correctedUnits: 'GΩ', tableMinimum: '', tableMinimumUnits: 'GΩ', dielectricAbsorption: '' },
  { winding: 'Primary to Secondary', testVoltage: '1000V', measured0_5Min: '', measured1Min: '', units: 'GΩ', corrected0_5Min: '', corrected1Min: '', correctedUnits: 'GΩ', tableMinimum: '', tableMinimumUnits: 'GΩ', dielectricAbsorption: '' },
];

const TwoSmallDryTyperXfmrMTSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  
  // Print Mode Detection
  const isPrintMode = searchParams.get('print') === 'true';
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'two-small-dry-typer-xfmr-mts-report'; // This component handles the two-small-dry-typer-xfmr-mts-report route
  const reportName = getReportName(reportSlug);
  const [error, setError] = useState<string | null>(null);
  const isUpdatingTemp = useRef<boolean>(false);

  const [formData, setFormData] = useState<FormData>({
    customer: '',
    address: '',
    user: '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 50, correctionFactor: 1 },
    substation: '',
    eqptLocation: '',
    nameplate: {
      manufacturer: '',
      kvaBase: '',
      kvaCooling: '',
      voltsPrimary: '',
      voltsPrimarySecondary: '',
      voltsSecondary: '',
      voltsSecondarySecondary: '',
      connectionsPrimary: 'Delta',
      connectionsSecondary: 'Wye',
      windingMaterialPrimary: 'Aluminum',
      windingMaterialSecondary: 'Copper',
      catalogNumber: '',
      tempRise: '',
      serialNumber: '',
      impedance: '',
      tapVoltages: Array(7).fill(''),
      tapPosition: '1',
      tapPositionLeftVolts: '',
      tapPositionLeftPercent: ''
    },
    indicatorGauges: { liquidLevel: '', temperature: '', pressureVacuum: '' },
    visualInspectionItems: JSON.parse(JSON.stringify(initialVisualInspectionItems)),
    visualInspectionComments: '',
    insulationResistance: {
      tests: JSON.parse(JSON.stringify(initialInsulationResistanceTests)),
      dielectricAbsorptionAcceptable: 'Yes'
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

  const loadReport = async () => {
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('two_small_dry_type_xfmr_mts_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) throw error;

      if (data && data.report_data) {
        // Parse the saved data and merge with current formData structure
        setFormData(prev => ({
          ...prev,
          ...data.report_data,
          // Ensure nested objects are properly structured
          nameplate: {
            ...prev.nameplate,
            ...(data.report_data.nameplate || {})
          },
          temperature: {
            ...prev.temperature,
            ...(data.report_data.temperature || {})
          },
          indicatorGauges: {
            ...prev.indicatorGauges,
            ...(data.report_data.indicatorGauges || {})
          },
          insulationResistance: {
            tests: data.report_data.insulationResistance?.tests || JSON.parse(JSON.stringify(initialInsulationResistanceTests)),
            dielectricAbsorptionAcceptable: data.report_data.insulationResistance?.dielectricAbsorptionAcceptable || 'Yes'
          },
          turnsRatio: {
            secondaryWindingVoltage: data.report_data.turnsRatio?.secondaryWindingVoltage || '',
            tests: data.report_data.turnsRatio?.tests || Array(1).fill(null).map(() => ({
              tap: '3', nameplateVoltage: '', calculatedRatio: '',
              measuredH1H2: '', devH1H2: '', passFailH1H2: '',
              measuredH2H3: '', devH2H3: '', passFailH2H3: '',
              measuredH3H1: '', devH3H1: '', passFailH3H1: ''
            }))
          },
          testEquipment: {
            ...prev.testEquipment,
            ...(data.report_data.testEquipment || {})
          },
          visualInspectionItems: data.report_data.visualInspectionItems || JSON.parse(JSON.stringify(initialVisualInspectionItems)),
          status: data.report_data.status || 'PASS'
        }));
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      setError(`Failed to load report: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

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
  }, [loadJobInfo, reportId]);

  useEffect(() => {
    if (!isEditing || isUpdatingTemp.current) return;
    
    isUpdatingTemp.current = true;
    
    if (formData.temperature.fahrenheit) {
      const newCelsius = (formData.temperature.fahrenheit - 32) * 5 / 9;
      const newTcf = getTCF(newCelsius);
      
      setFormData(prev => ({
        ...prev,
        temperature: {
          ...prev.temperature,
          celsius: parseFloat(newCelsius.toFixed(2)),
          tcf: newTcf,
        }
      }));
    }
    
    setTimeout(() => {
      isUpdatingTemp.current = false;
    }, 0);
  }, [formData.temperature.fahrenheit, isEditing]);

  useEffect(() => {
    const tcf = formData.temperature.correctionFactor;

    // Calculate corrected values for each test
    const nextTests = formData.insulationResistance.tests.map(test => {
      const corrected0_5Min = test.measured0_5Min && tcf ? (parseFloat(test.measured0_5Min) * tcf).toFixed(2) : '';
      const corrected1Min = test.measured1Min && tcf ? (parseFloat(test.measured1Min) * tcf).toFixed(2) : '';

      // Calculate dielectric absorption ratio (1 min / 0.5 min)
      let dielectricAbsorption = '';
      if (test.measured1Min && test.measured0_5Min) {
        const ratio = parseFloat(test.measured1Min) / parseFloat(test.measured0_5Min);
        if (!isNaN(ratio) && isFinite(ratio)) {
          dielectricAbsorption = ratio.toFixed(2);
        }
      }

      return {
        ...test,
        corrected0_5Min,
        corrected1Min,
        dielectricAbsorption
      };
    });

    // Prevent update loops: only set if values actually changed
    const prevTests = formData.insulationResistance.tests;
    const changed = JSON.stringify(nextTests) !== JSON.stringify(prevTests);
    if (!changed) return;

    // Determine if all DA values are acceptable (> 1)
    const daValues = nextTests.map(test => parseFloat(test.dielectricAbsorption));
    const daAcceptable = daValues.every(v => !isNaN(v) && v > 1) ? 'Yes' : 'No';

    setFormData(prev => ({
      ...prev,
      insulationResistance: {
        ...prev.insulationResistance,
        tests: nextTests,
        dielectricAbsorptionAcceptable: daAcceptable
      }
    }));
  }, [
    formData.insulationResistance.tests,
    formData.temperature.correctionFactor
  ]);

  // Add new effect to update nameplate voltage ratios
  useEffect(() => {
    if (!isEditing) return;

    setFormData(prev => {
      const newTurnsRatioTests = prev.turnsRatio.tests.map(test => {
        const tapIndex = parseInt(test.tap) - 1;
        if (tapIndex >= 0 && tapIndex < prev.nameplate.tapVoltages.length) {
          const tapVoltage = prev.nameplate.tapVoltages[tapIndex];
          if (tapVoltage) {
            return { ...test, nameplateVoltage: tapVoltage };
          }
        }
        return test;
      });

      return {
        ...prev,
        turnsRatio: {
          ...prev.turnsRatio,
          tests: newTurnsRatioTests
        }
      };
    });
  }, [formData.nameplate.tapVoltages, isEditing]);

  // Update the turns ratio calculation effect
  useEffect(() => {
    if (!isEditing) return;

    setFormData(prev => {
      const newTurnsRatioTests = prev.turnsRatio.tests.map(test => {
        // Get the nameplate voltage for this tap
        const tapIndex = parseInt(test.tap) - 1;
        const tapVoltage = prev.nameplate.tapVoltages[tapIndex];

        // Calculate the ratio
        let calculatedRatio = '';
        const secondaryVoltage = parseFloat(prev.turnsRatio.secondaryWindingVoltage);
        
        if (secondaryVoltage && !isNaN(secondaryVoltage)) {
          // If primary connection is Delta and secondary is Wye
          if (prev.nameplate.connectionsPrimary === 'Delta' && prev.nameplate.connectionsSecondary === 'Wye') {
            const primaryVoltage = parseFloat(tapVoltage);
            if (primaryVoltage && !isNaN(primaryVoltage)) {
              calculatedRatio = (primaryVoltage / secondaryVoltage).toFixed(3);
            }
          } else {
            // For all other cases, use the nameplate voltage directly
            const nameplateVoltage = parseFloat(test.nameplateVoltage);
            if (nameplateVoltage && !isNaN(nameplateVoltage)) {
              calculatedRatio = (nameplateVoltage / secondaryVoltage).toFixed(3);
            }
          }
        }

        // Calculate deviations and pass/fail for each measurement
        const calculateDeviationAndResult = (measured: string, calculated: string) => {
          if (!measured || !calculated) return { deviation: '', passFail: '' };
          
          const measuredValue = parseFloat(measured);
          const calculatedValue = parseFloat(calculated);
          
          if (isNaN(measuredValue) || isNaN(calculatedValue)) return { deviation: '', passFail: '' };
          
          const deviation = ((measuredValue - calculatedValue) / calculatedValue * 100).toFixed(3);
          const deviationValue = parseFloat(deviation);
          
          // Determine pass/fail based on ±0.5% threshold
          const passFail = (deviationValue > -0.501 && deviationValue < 0.501) ? 'PASS' : 'FAIL';
          
          return { deviation, passFail };
        };

        // Calculate for H1-H2
        const h1h2Results = calculateDeviationAndResult(test.measuredH1H2, calculatedRatio);
        // Calculate for H2-H3
        const h2h3Results = calculateDeviationAndResult(test.measuredH2H3, calculatedRatio);
        // Calculate for H3-H1
        const h3h1Results = calculateDeviationAndResult(test.measuredH3H1, calculatedRatio);

        return {
          ...test,
          calculatedRatio,
          devH1H2: h1h2Results.deviation,
          passFailH1H2: h1h2Results.passFail,
          devH2H3: h2h3Results.deviation,
          passFailH2H3: h2h3Results.passFail,
          devH3H1: h3h1Results.deviation,
          passFailH3H1: h3h1Results.passFail
        };
      });

      return {
        ...prev,
        turnsRatio: {
          ...prev.turnsRatio,
          tests: newTurnsRatioTests
        }
      };
    });
  }, [
    formData.nameplate.tapVoltages,
    formData.turnsRatio.secondaryWindingVoltage,
    formData.nameplate.connectionsPrimary,
    formData.nameplate.connectionsSecondary,
    formData.turnsRatio.tests.map(t => t.measuredH1H2).join(','), // Add dependencies for measured values
    formData.turnsRatio.tests.map(t => t.measuredH2H3).join(','),
    formData.turnsRatio.tests.map(t => t.measuredH3H1).join(','),
    isEditing
  ]);

  const handleFahrenheitChange = (fahrenheit: number) => {
    if (!isEditing) return;
    setFormData(prev => ({
      ...prev,
      temperature: { 
        ...prev.temperature, 
        fahrenheit 
      }
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    if (!isEditing) return;
    const newFahrenheit = (celsius * 9 / 5) + 32;
    const newTcf = getTCF(celsius);
    
    setFormData(prev => ({
      ...prev,
      temperature: { 
        ...prev.temperature, 
        celsius,
        fahrenheit: parseFloat(newFahrenheit.toFixed(2)),
        tcf: newTcf
      }
    }));
  };

  const getTableMinimum = (voltage: string): string => {
    if (!voltage) return '';
    const volts = parseFloat(voltage);
    if (isNaN(volts)) return '';
    
    if (volts <= 600) return '0.5';
    if (volts <= 5000) return '5';
    return '25';
  };

  const handleChange = (field: string, value: any) => {
    if (!isEditing) return;

    setFormData(prev => {
      const newData = { ...prev };
      
      // Handle nested fields
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        (newData as any)[parent] = {
          ...(newData as any)[parent],
          [child]: value
        };

        // Auto-fill secondary winding voltage when nameplate secondary voltage changes
        if (field === 'nameplate.voltsSecondary') {
          newData.turnsRatio.secondaryWindingVoltage = value;
        }
      } else {
        (newData as any)[field] = value;
      }

      // Calculate table minimum values based on voltage
      if (field === 'nameplate.voltsPrimary' || field === 'nameplate.voltsSecondary') {
        const primaryVoltage = parseFloat(newData.nameplate.voltsPrimary) || 0;
        const secondaryVoltage = parseFloat(newData.nameplate.voltsSecondary) || 0;

        // Update table minimum values based on voltage ranges for each test
        newData.insulationResistance.tests = newData.insulationResistance.tests.map((test, index) => {
          let tableMinimum = '0.5'; // Default for 0-600V
          let tableMinimumUnits = 'GΩ';

          // Primary to Ground (index 0) - use primary voltage
          if (index === 0) {
            if (primaryVoltage > 5000) {
              tableMinimum = '25';
            } else if (primaryVoltage > 600) {
              tableMinimum = '5';
            }
          }
          // Secondary to Ground (index 1) - use secondary voltage
          else if (index === 1) {
            if (secondaryVoltage > 5000) {
              tableMinimum = '25';
            } else if (secondaryVoltage > 600) {
              tableMinimum = '5';
            }
          }
          // Primary to Secondary (index 2) - use primary voltage
          else if (index === 2) {
            if (primaryVoltage > 5000) {
              tableMinimum = '25';
            } else if (primaryVoltage > 600) {
              tableMinimum = '5';
            }
          }

          return {
            ...test,
            tableMinimum,
            tableMinimumUnits
          };
        });
      }

      return newData;
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

      // Auto-fill nameplate voltage ratio when tap changes in turns ratio section
      if (sectionKey === 'turnsRatio' && field === 'tap') {
        const tapIndex = parseInt(value) - 1;
        if (tapIndex >= 0 && tapIndex < prev.nameplate.tapVoltages.length) {
          const tapVoltage = prev.nameplate.tapVoltages[tapIndex];
          if (tapVoltage) {
            newTests[testIndex].nameplateVoltage = tapVoltage;
          }
        }
      }

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
          .from('two_small_dry_type_xfmr_mts_reports')
          .update(reportPayload)
          .eq('id', reportId);
        if (error) throw error;
      } else {
        const { data: insertData, error: insertError } = await supabase
          .schema('neta_ops')
          .from('two_small_dry_type_xfmr_mts_reports')
          .insert(reportPayload)
          .select('id')
          .single();
        if (insertError) throw insertError;
        if (!insertData) throw new Error("Failed to retrieve ID for new report.");
        currentReportId = insertData.id;

        const assetData = {
          name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
          file_url: `report:/jobs/${jobId}/two-small-dry-typer-xfmr-mts-report/${currentReportId}`,
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
      navigateAfterSave(navigate, jobId, location);
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
            disabled={loading || !isEditing}
            className="bg-[#f26722] hover:bg-[#e55611] text-white font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>NETA</div>
      </div>
      {/* End Print Header */}
      
      <div className="p-6 flex justify-center dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-6">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            {renderHeader()}
          </div>
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2">
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
        </section>

        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Nameplate Data</h2>
          <div className="space-y-4">

            {/* Row 1: Manufacturer, Catalog, Serial */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Manufacturer</label>
                <input
                  type="text"
                  value={formData.nameplate.manufacturer}
                  onChange={(e) => handleChange('nameplate.manufacturer', e.target.value)}
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Catalog Number</label>
                <input
                  type="text"
                  value={formData.nameplate.catalogNumber}
                  onChange={(e) => handleChange('nameplate.catalogNumber', e.target.value)}
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
                <input
                  type="text"
                  value={formData.nameplate.serialNumber}
                  onChange={(e) => handleChange('nameplate.serialNumber', e.target.value)}
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            </div>

            {/* Row 2: KVA, Temp Rise, Impedance */}
            <div className="grid grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">KVA</label>
                <div className="flex items-center space-x-1 mt-1">
                  <input
                    type="text"
                    value={formData.nameplate.kvaBase}
                    onChange={(e) => handleChange('nameplate.kvaBase', e.target.value)}
                    readOnly={!isEditing}
                    className={`w-20 rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                  <span className="text-gray-500">/</span>
                  <input
                    type="text"
                    value={formData.nameplate.kvaCooling}
                    onChange={(e) => handleChange('nameplate.kvaCooling', e.target.value)}
                    readOnly={!isEditing}
                    className={`w-20 rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Temp. Rise (°C)</label>
                <input
                  type="text"
                  value={formData.nameplate.tempRise}
                  onChange={(e) => handleChange('nameplate.tempRise', e.target.value)}
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Impedance (%)</label>
                <input
                  type="text"
                  value={formData.nameplate.impedance}
                  onChange={(e) => handleChange('nameplate.impedance', e.target.value)}
                  readOnly={!isEditing}
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            </div>

            {/* Row 3: Headers */}
            <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-4 mt-4">
              <div>{/* Empty cell for alignment */}</div>
              <div className="text-center font-medium text-sm text-gray-700 dark:text-gray-300">Volts</div>
              <div className="text-center font-medium text-sm text-gray-700 dark:text-gray-300">Connections</div>
              <div className="text-center font-medium text-sm text-gray-700 dark:text-gray-300">Winding Material</div>
            </div>

            {/* Row 4: Primary */}
            <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-center">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Primary</div>
              {/* Volts */}
              <div className="flex items-center justify-center space-x-1">
                <input
                  type="text"
                  value={formData.nameplate.voltsPrimary}
                  onChange={(e) => handleChange('nameplate.voltsPrimary', e.target.value)}
                  readOnly={!isEditing}
                  className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
                <span className="text-gray-500">/</span>
                <input
                  type="text"
                  value={formData.nameplate.voltsPrimarySecondary}
                  onChange={(e) => handleChange('nameplate.voltsPrimarySecondary', e.target.value)}
                  readOnly={!isEditing}
                  className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              {/* Connections */}
              <div className="flex justify-center space-x-4">
                {['Delta', 'Wye', 'Single Phase'].map(conn => (
                  <label key={`pri-${conn}`} className="inline-flex items-center">
                    <input
                      type="radio"
                      name="primary-connection"
                      value={conn}
                      checked={formData.nameplate.connectionsPrimary === conn}
                      onChange={() => handleChange('nameplate.connectionsPrimary', conn)}
                      disabled={!isEditing}
                      className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{conn}</span>
                  </label>
                ))}
              </div>
              {/* Winding Material */}
              <div className="flex justify-center space-x-4">
                {['Aluminum', 'Copper'].map(mat => (
                  <label key={`pri-${mat}`} className="inline-flex items-center">
                    <input
                      type="radio"
                      name="primary-material"
                      value={mat}
                      checked={formData.nameplate.windingMaterialPrimary === mat}
                      onChange={() => handleChange('nameplate.windingMaterialPrimary', mat)}
                      disabled={!isEditing}
                      className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{mat}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Row 5: Secondary */}
            <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-center">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Secondary</div>
              {/* Volts */}
              <div className="flex items-center justify-center space-x-1">
                <input
                  type="text"
                  value={formData.nameplate.voltsSecondary}
                  onChange={(e) => handleChange('nameplate.voltsSecondary', e.target.value)}
                  readOnly={!isEditing}
                  className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
                <span className="text-gray-500">/</span>
                <input
                  type="text"
                  value={formData.nameplate.voltsSecondarySecondary}
                  onChange={(e) => handleChange('nameplate.voltsSecondarySecondary', e.target.value)}
                  readOnly={!isEditing}
                  className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              {/* Connections */}
              <div className="flex justify-center space-x-4">
                {['Delta', 'Wye', 'Single Phase'].map(conn => (
                  <label key={`sec-${conn}`} className="inline-flex items-center">
                    <input
                      type="radio"
                      name="secondary-connection"
                      value={conn}
                      checked={formData.nameplate.connectionsSecondary === conn}
                      onChange={() => handleChange('nameplate.connectionsSecondary', conn)}
                      disabled={!isEditing}
                      className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{conn}</span>
                  </label>
                ))}
              </div>
              {/* Winding Material */}
              <div className="flex justify-center space-x-4">
                {['Aluminum', 'Copper'].map(mat => (
                  <label key={`sec-${mat}`} className="inline-flex items-center">
                    <input
                      type="radio"
                      name="secondary-material"
                      value={mat}
                      checked={formData.nameplate.windingMaterialSecondary === mat}
                      onChange={() => handleChange('nameplate.windingMaterialSecondary', mat)}
                      disabled={!isEditing}
                      className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{mat}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Row 6: Tap Configuration */}
            <div className="space-y-2">
              {/* Tap Voltages */}
              <div className="flex items-center">
                <label className="w-[130px] text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">Tap Voltages</label>
                <div className="grid grid-cols-7 gap-2 flex-grow">
                  {formData.nameplate.tapVoltages.map((voltage, index) => (
                    <input
                      key={index}
                      type="text"
                      value={voltage}
                      onChange={(e) => {
                        const newVoltages = [...formData.nameplate.tapVoltages];
                        newVoltages[index] = e.target.value;
                        handleChange('nameplate.tapVoltages', newVoltages);
                      }}
                      readOnly={!isEditing}
                      className={`block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  ))}
                </div>
              </div>

              {/* Tap Position Numbers */}
              <div className="flex items-center">
                <label className="w-[130px] text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">Tap Position</label>
                <div className="grid grid-cols-7 gap-2 flex-grow">
                  {[1, 2, 3, 4, 5, 6, 7].map((position) => (
                    <div key={position} className="text-center text-sm text-gray-700 dark:text-gray-300 font-medium">
                      {position}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tap Position Left */}
              <div className="flex items-center">
                <label className="w-[130px] text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">Tap Position Left</label>
                {/* First pair of inputs */}
                <div className="flex items-center space-x-1 mr-4">
                  <input
                    type="text"
                    value={formData.nameplate.tapPosition}
                    onChange={(e) => handleChange('nameplate.tapPosition', e.target.value)}
                    readOnly={!isEditing}
                    className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                  <span className="text-gray-500">/</span>
                  <input
                    type="text"
                    value={formData.nameplate.tapPosition}
                    readOnly
                    className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white bg-gray-100 dark:bg-dark-200`}
                  />
                </div>
                {/* Separate Volts input */}
                <div className="flex items-center space-x-1 mr-4">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Volts</span>
                  <input
                    type="text"
                    value={formData.nameplate.tapPositionLeftVolts}
                    onChange={(e) => handleChange('nameplate.tapPositionLeftVolts', e.target.value)}
                    readOnly={!isEditing}
                    className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
                {/* Separate Percent input */}
                <div className="flex items-center space-x-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Percent</span>
                  <input
                    type="text"
                    value={formData.nameplate.tapPositionLeftPercent}
                    onChange={(e) => handleChange('nameplate.tapPositionLeftPercent', e.target.value)}
                    readOnly={!isEditing}
                    className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-dark-200">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    NETA Section
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                {formData.visualInspectionItems.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.netaSection}</td>
                    <td className="px-6 py-4 whitespace-normal text-sm text-gray-900 dark:text-white">{item.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <select
                        value={item.result}
                        onChange={(e) => handleArrayChange('visualInspectionItems', index, 'result', e.target.value)}
                        disabled={!isEditing}
                        className={`form-select w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200 cursor-not-allowed' : 'dark:bg-dark-100'}`}
                      >
                        {visualInspectionOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
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
                      Dielectric Absorption : (Ratio of 1 Minute to 0.5 Minute Result)
                    </div>
                  </td>
                  {formData.insulationResistance.tests.map((test, index) => (
                    <td key={index} className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                      <input
                        type="text"
                        value={test.dielectricAbsorption}
                        readOnly
                        className="form-input text-center text-sm bg-gray-100 dark:bg-dark-200 w-full"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                    <input
                      type="text"
                      value={formData.insulationResistance.dielectricAbsorptionAcceptable}
                      readOnly
                      className={`form-input text-center text-sm bg-gray-100 dark:bg-dark-200 w-full ${
                        formData.insulationResistance.dielectricAbsorptionAcceptable === 'Yes' ? 'text-green-600 font-medium' :
                        formData.insulationResistance.dielectricAbsorptionAcceptable === 'No' ? 'text-red-600 font-medium' : ''
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 border border-gray-300 dark:border-gray-600">
                    <input type="text" value="1.0" readOnly className="form-input text-center text-sm bg-gray-100 dark:bg-dark-200 w-full"/>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Turns Ratio</h2>
          <div className="flex justify-end mb-4">
              <label htmlFor="turnsRatio.secondaryWindingVoltage" className="form-label mr-2">Secondary Winding Voltage (L-N for Wye, L-L for Delta):</label>
              <input id="turnsRatio.secondaryWindingVoltage" type="text" name="turnsRatio.secondaryWindingVoltage" value={formData.turnsRatio.secondaryWindingVoltage} onChange={e => handleChange(e.target.name, e.target.value)} readOnly={!isEditing} className={`form-input w-24 text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /> <span className="ml-1">V</span>
          </div>
          <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
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
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="min-w-[120px] font-medium text-gray-900 dark:text-white">Megohmmeter:</div>
              <div className="flex-1">
                <input
                  type="text"
                  name="testEquipment.megohmmeter.name"
                  value={formData.testEquipment.megohmmeter.name}
                  onChange={e => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap font-medium text-gray-900 dark:text-white">Serial Number:</span>
                <input
                  type="text"
                  name="testEquipment.megohmmeter.serialNumber"
                  value={formData.testEquipment.megohmmeter.serialNumber}
                  onChange={e => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-48 text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap font-medium text-gray-900 dark:text-white">AMP ID:</span>
                <input
                  type="text"
                  name="testEquipment.megohmmeter.ampId"
                  value={formData.testEquipment.megohmmeter.ampId}
                  onChange={e => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-32 text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="min-w-[120px] font-medium text-gray-900 dark:text-white">TTR Test Set:</div>
              <div className="flex-1">
                <input
                  type="text"
                  name="testEquipment.ttrTestSet.name"
                  value={formData.testEquipment.ttrTestSet.name}
                  onChange={e => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap font-medium text-gray-900 dark:text-white">Serial Number:</span>
                <input
                  type="text"
                  name="testEquipment.ttrTestSet.serialNumber"
                  value={formData.testEquipment.ttrTestSet.serialNumber}
                  onChange={e => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-48 text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap font-medium text-gray-900 dark:text-white">AMP ID:</span>
                <input
                  type="text"
                  name="testEquipment.ttrTestSet.ampId"
                  value={formData.testEquipment.ttrTestSet.ampId}
                  onChange={e => handleChange(e.target.name, e.target.value)}
                  readOnly={!isEditing}
                  className={`form-input w-32 text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
          <textarea 
              name="comments" 
              value={formData.comments} 
              onChange={(e) => handleChange(e.target.name, e.target.value)} 
              readOnly={!isEditing} 
              rows={4} 
              className={`form-textarea w-full text-sm ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
          />
        </section>
      </div>
    </div>
    </ReportWrapper>
  );
};

export default TwoSmallDryTyperXfmrMTSReport;

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
      * { color: black !important; }
      
      /* Hide all navigation and header elements */
      header, nav, .navigation, [class*="nav"], [class*="header"], 
      .sticky, [class*="sticky"], .print\\:hidden { 
        display: none !important; 
      }
      
      /* Hide Back to Job button and division headers specifically */
      button[class*="Back"], 
      *[class*="Back to Job"], 
      h2[class*="Division"],
      .mobile-nav-text,
      [class*="formatDivisionName"] {
        display: none !important;
      }
      
      /* Form elements - ensure text shows in boxes */
      input, select, textarea { 
        background-color: white !important; 
        border: 1px solid black !important; 
        color: black !important;
        padding: 3px 4px !important; 
        font-size: 12px !important;
        font-family: Arial, sans-serif !important;
        min-height: 18px !important;
        line-height: 1 !important;
        vertical-align: top !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Ensure text values are visible in form elements */
      input[type="text"], input[type="number"], input[type="date"], 
      select, textarea {
        background: white !important;
        color: black !important;
        border: 1px solid black !important;
        font-weight: normal !important;
        text-align: left !important;
        min-width: 60px !important;
        vertical-align: top !important;
      }
      
      /* Center-aligned inputs stay centered */
      input.text-center, select.text-center {
        text-align: center !important;
        vertical-align: top !important;
      }
      
      /* Ensure table center-aligned inputs are properly aligned */
      table input.text-center, table select.text-center {
        text-align: center !important;
        vertical-align: top !important;
        padding: 1px 3px !important;
        width: 95% !important;
        max-width: 95% !important;
      }
      
      /* Hide dropdown arrows and form control indicators */
      select {
        background-image: none !important;
        padding-right: 8px !important;
      }
      
      /* Hide spin buttons on number inputs */
      input[type="number"]::-webkit-outer-spin-button,
      input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      input[type="number"] {
        -moz-appearance: textfield !important;
      }
      
      /* Radio buttons - show selected state */
      input[type="radio"] {
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
        width: 12px !important;
        height: 12px !important;
        border: 1px solid black !important;
        border-radius: 50% !important;
        background: white !important;
        margin-right: 4px !important;
      }
      
      input[type="radio"]:checked {
        background: black !important;
        border: 2px solid black !important;
      }
      
      input[type="radio"]:checked::after {
        content: "●" !important;
        color: white !important;
        font-size: 8px !important;
        text-align: center !important;
        display: block !important;
        line-height: 8px !important;
      }
      
      /* Table styling */
      table { 
        border-collapse: collapse; 
        width: 100%; 
        font-size: 12px !important;
        page-break-inside: avoid;
      }
      th, td { 
        border: 1px solid black !important; 
        padding: 3px !important; 
        page-break-inside: avoid;
        min-height: 24px !important;
        vertical-align: top !important;
      }
      th { 
        background-color: #f0f0f0 !important; 
        font-weight: bold !important; 
        font-size: 12px !important;
        text-align: center !important;
      }
      
      /* Table inputs need proper sizing */
      table input, table select {
        width: 95% !important;
        max-width: 95% !important;
        min-width: 40px !important;
        height: 18px !important;
        padding: 1px 3px !important;
        font-size: 11px !important;
        margin: 0 !important;
        line-height: 1 !important;
        vertical-align: top !important;
        box-sizing: border-box !important;
        border: 1px solid black !important;
      }
      
      /* Remove conflicting width classes in print */
      table input.w-16, table input.w-20, table input.w-24,
      table input.w-full, table input.w-32 {
        width: 95% !important;
        max-width: 95% !important;
      }
      
      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }
      
      /* Section styling */
      section { 
        page-break-inside: avoid !important; 
        margin-bottom: 20px !important; 
      }
      
      /* Page break utilities */
      .print\\:break-before-page { page-break-before: always; }
      .print\\:break-after-page { page-break-after: always; }
      .print\\:break-inside-avoid { page-break-inside: avoid; }
      .print\\:text-black { color: black !important; }
      .print\\:bg-white { background-color: white !important; }
      .print\\:border-black { border-color: black !important; }
      .print\\:font-bold { font-weight: bold !important; }
      .print\\:text-center { text-align: center !important; }
      
      /* Improve table borders and spacing */
      .table-border {
        border: 1px solid black !important;
      }
      
      /* Better page break handling */
      .bg-white, .dark\\:bg-dark-150 {
        background-color: white !important;
        page-break-inside: avoid;
      }
      
      /* Ensure proper spacing */
      .space-y-6 > * + * {
        margin-top: 1.5rem !important;
      }
      
      /* Grid layouts for print */
      .grid {
        display: grid !important;
      }
      
      /* Flex layouts for print */
      .flex {
        display: flex !important;
      }
    }
  `;
  document.head.appendChild(style);
} 