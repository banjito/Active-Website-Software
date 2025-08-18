import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';

// Temperature conversion and correction factor lookup tables (from PanelboardReport)
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
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Not Applicable",
  "Repaired",
  "Cleaned",
  "See Comments"
];

const insulationResistanceUnits = ["kΩ", "MΩ", "GΩ"];
const testVoltageOptions = ["250V", "500V", "1000V", "2500V", "5000V", "Other"];


interface InsulationTestEntry {
  testVoltage: string;
  values: { halfMin: string; oneMin: string; tenMin: string; };
  units: string;
  correctedValues: { halfMin: string; oneMin: string; tenMin: string; };
}

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
    humidity: string; // Changed to string to allow empty input
  };
  substation: string;
  eqptLocation: string;

  // Nameplate Data
  nameplate: {
    manufacturer: string;
    kVA: string;
    catalogNumber: string;
    tempRise: string;
    fluidType: string;
    serialNumber: string;
    impedance: string;
    fluidVolume: string;
    primaryVolts1: string;
    primaryVolts2: string;
    secondaryVolts1: string;
    secondaryVolts2: string;
    primaryConnectionDelta: boolean;
    primaryConnectionWye: boolean;
    primaryConnectionSinglePhase: boolean;
    secondaryConnectionDelta: boolean;
    secondaryConnectionWye: boolean;
    secondaryConnectionSinglePhase: boolean;
    primaryWindingMaterialAluminum: boolean;
    primaryWindingMaterialCopper: boolean;
    secondaryWindingMaterialAluminum: boolean;
    secondaryWindingMaterialCopper: boolean;
    tapVoltages: string[]; // Array of 7
    tapPositions: string[]; // Array of 7
    tapPositionLeft1: string;
    tapPositionLeft2: string;
    tapVoltsSpecific: string;
    tapPercentSpecific: string;
  };

  // Indicator Gauge Values
  indicatorGaugeValues: {
    oilLevel: string;
    tankPressure: string;
    oilTemperature: string;
    windingTemperature: string;
    oilTempRange: string;
    windingTempRange: string;
  };

  // Visual and Mechanical Inspection
  visualMechanicalInspection: Array<{
    netaSection: string;
    description: string;
    result: string;
  }>;
  visualMechanicalInspectionComments: string;

  // Electrical Tests - Insulation Resistance
  electricalTestsInsulationResistance: {
    primaryToGround: InsulationTestEntry;
    secondaryToGround: InsulationTestEntry;
    primaryToSecondary: InsulationTestEntry;
    dielectricAbsorption: {
      primary: string;
      secondary: string;
      primaryToSecondary: string;
    };
    polarizationIndex: {
      primary: string;
      secondary: string;
      primaryToSecondary: string;
    };
    acceptableDAPI: string; // Single field for both DA and PI
  };

  // Test Equipment Used
  testEquipmentUsed: {
    megohmmeter: string;
    serialNumber: string;
    ampId: string;
  };
  electricalTestComments: string;
  status: 'PASS' | 'FAIL';
}

const initialVisualMechanicalItems = [
  { netaSection: '7.2.2.A.1', description: 'Inspect physical and mechanical condition.', result: '' },
  { netaSection: '7.2.2.A.2', description: 'Inspect anchorage, alignment, and grounding.', result: '' },
  { netaSection: '7.2.2.A.3', description: 'Verify the presence of PCB labeling.', result: '' },
  { netaSection: '7.2.2.A.4*', description: 'Prior to cleaning the unit, perform as-found tests. *Optional', result: '' },
  { netaSection: '7.2.2.A.5', description: 'Clean bushings and control cabinets.', result: '' },
  { netaSection: '7.2.2.A.6', description: 'Verify operation of alarm, control, and trip circuits from temperature and level indicators, pressure-relief device, gas accumulator, and fault-pressure relay.', result: '' },
  { netaSection: '7.2.2.A.7', description: 'Verify that cooling fans and pumps operate correctly.', result: '' },
  { netaSection: '7.2.2.A.8.1', description: 'Inspect Bolted connections for high resistance: Use of a low-resistance ohmmeter in accordance with Section 7.2.2.B.1.', result: '' },
  { netaSection: '7.2.2.A.9', description: 'Verify correct liquid level in tanks and bushings.', result: '' },
  { netaSection: '7.2.2.A.10', description: 'Verify that positive pressure is maintained on gas-blanketed transformers.', result: '' },
  { netaSection: '7.2.2.A.11', description: 'Perform inspections and mechanical tests as recommended by the manufacturer.', result: '' },
  { netaSection: '7.2.2.A.12', description: 'Test load tap-changer in accordance with Section 7.12.', result: '' },
  { netaSection: '7.2.2.A.13', description: 'Verify the presence of transformer surge arresters.', result: '' },
  { netaSection: '7.2.2.A.15', description: 'Verify de-energized tap-changer position is left as specified.', result: '' }
];

const initialInsulationEntry = (): InsulationTestEntry => ({
  testVoltage: '5000V',
  values: { halfMin: '', oneMin: '', tenMin: '' },
  units: 'MΩ',
  correctedValues: { halfMin: '', oneMin: '', tenMin: '' },
});

const LiquidXfmrVisualMTSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
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
  const reportSlug = 'liquid-xfmr-visual-mts-report'; // This component handles the liquid-xfmr-visual-mts-report route
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
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: '' },
    substation: '',
    eqptLocation: '',
    nameplate: {
      manufacturer: '', kVA: '', catalogNumber: '', tempRise: '', fluidType: '', serialNumber: '', impedance: '', fluidVolume: '',
      primaryVolts1: '', primaryVolts2: '', secondaryVolts1: '', secondaryVolts2: '',
      primaryConnectionDelta: false, primaryConnectionWye: false, primaryConnectionSinglePhase: false,
      secondaryConnectionDelta: false, secondaryConnectionWye: false, secondaryConnectionSinglePhase: false,
      primaryWindingMaterialAluminum: false, primaryWindingMaterialCopper: false,
      secondaryWindingMaterialAluminum: false, secondaryWindingMaterialCopper: false,
      tapVoltages: Array(7).fill(''), tapPositions: Array(7).fill(''),
      tapPositionLeft1: '', tapPositionLeft2: '', tapVoltsSpecific: '', tapPercentSpecific: '',
    },
    indicatorGaugeValues: {
      oilLevel: '', tankPressure: '', oilTemperature: '', windingTemperature: '', oilTempRange: '', windingTempRange: '',
    },
    visualMechanicalInspection: JSON.parse(JSON.stringify(initialVisualMechanicalItems)),
    visualMechanicalInspectionComments: '',
    electricalTestsInsulationResistance: {
      primaryToGround: initialInsulationEntry(),
      secondaryToGround: initialInsulationEntry(),
      primaryToSecondary: initialInsulationEntry(),
      dielectricAbsorption: { primary: '', secondary: '', primaryToSecondary: '' },
      polarizationIndex: { primary: '', secondary: '', primaryToSecondary: '' },
      acceptableDAPI: '',
    },
    testEquipmentUsed: { megohmmeter: '', serialNumber: '', ampId: '' },
    electricalTestComments: '',
    status: 'PASS',
  });

  const calculateRatio = useCallback((numeratorStr: string, denominatorStr: string): string => {
    const numerator = parseFloat(numeratorStr);
    const denominator = parseFloat(denominatorStr);
    if (isNaN(numerator) || isNaN(denominator) || denominator === 0) return '';
    return (numerator / denominator).toFixed(2);
  }, []);

  const calculateCorrectedValue = useCallback((valueStr: string, tcf: number): string => {
    const value = parseFloat(valueStr);
    if (isNaN(value)) return '';
    return (value * tcf).toFixed(2);
  }, []);

  const updateCalculations = useCallback((testKey: keyof FormData['electricalTestsInsulationResistance']) => {
    if (testKey === 'primaryToGround' || testKey === 'secondaryToGround' || testKey === 'primaryToSecondary') {
      const testEntry = formData.electricalTestsInsulationResistance[testKey];
      const tcf = formData.temperature.tcf;

      const correctedHalfMin = calculateCorrectedValue(testEntry.values.halfMin, tcf);
      const correctedOneMin = calculateCorrectedValue(testEntry.values.oneMin, tcf);
      const correctedTenMin = calculateCorrectedValue(testEntry.values.tenMin, tcf);

      const da = calculateRatio(correctedOneMin, correctedHalfMin);
      const pi = calculateRatio(correctedTenMin, correctedOneMin);
      
      setFormData(prev => {
        const labelKey = testKey === 'primaryToGround'
          ? 'primary'
          : testKey === 'secondaryToGround'
          ? 'secondary'
          : 'primaryToSecondary';

        // Build updated DA/PI objects first so we can compute Acceptable reliably
        const nextDA = {
          ...prev.electricalTestsInsulationResistance.dielectricAbsorption,
          [labelKey]: da,
        } as FormData['electricalTestsInsulationResistance']['dielectricAbsorption'];

        const nextPI = {
          ...prev.electricalTestsInsulationResistance.polarizationIndex,
          [labelKey]: pi,
        } as FormData['electricalTestsInsulationResistance']['polarizationIndex'];

        const allValues = [
          nextDA.primary, nextDA.secondary, nextDA.primaryToSecondary,
          nextPI.primary, nextPI.secondary, nextPI.primaryToSecondary,
        ]
          .map(v => parseFloat(String(v)))
          .filter(v => !Number.isNaN(v));
        const acceptableDAPI = allValues.length > 0 && allValues.every(v => v > 1.0) ? 'Yes' : 'No';

        return ({
          ...prev,
          electricalTestsInsulationResistance: {
            ...prev.electricalTestsInsulationResistance,
            [testKey]: {
              ...prev.electricalTestsInsulationResistance[testKey],
              correctedValues: { halfMin: correctedHalfMin, oneMin: correctedOneMin, tenMin: correctedTenMin },
            },
            dielectricAbsorption: nextDA,
            polarizationIndex: nextPI,
            acceptableDAPI,
          }
        });
      });
    }
  }, [formData.electricalTestsInsulationResistance, formData.temperature.tcf, calculateCorrectedValue, calculateRatio]);


  useEffect(() => {
    updateCalculations('primaryToGround');
  }, [formData.electricalTestsInsulationResistance.primaryToGround.values, formData.temperature.tcf, updateCalculations]);

  useEffect(() => {
    updateCalculations('secondaryToGround');
  }, [formData.electricalTestsInsulationResistance.secondaryToGround.values, formData.temperature.tcf, updateCalculations]);

  useEffect(() => {
    updateCalculations('primaryToSecondary');
  }, [formData.electricalTestsInsulationResistance.primaryToSecondary.values, formData.temperature.tcf, updateCalculations]);


  const loadJobInfo = useCallback(async () => {
    if (!jobId) return;
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('title, job_number, customer_id')
        .eq('id', jobId)
        .single();
      if (jobError) throw jobError;

      if (jobData) {
        let customerName = '';
        let customerAddress = '';
        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('name, company_name, address')
            .eq('id', jobData.customer_id)
            .single();
          if (!customerError && customerData) {
            customerName = customerData.company_name || customerData.name || '';
            customerAddress = customerData.address || '';
          }
        }
        setFormData(prev => ({
          ...prev,
          jobNumber: jobData.job_number || '',
          customer: customerName,
          address: customerAddress,
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      setError(`Failed to load job info: ${(error as Error).message}`);
    }
  }, [jobId]);

  const loadReport = useCallback(async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }
    setLoading(true);
    try {
      console.log(`Loading report from low_voltage_cable_test_3sets with ID: ${reportId}`);
      
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('liquid_xfmr_visual_mts_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Not found
          setIsEditing(true);
        } else {
          throw error;
        }
      }
      
      if (data) {
        console.log('Loaded report row:', data);
        
        // Support both legacy `data` and current `report_data` columns
        const importedData = (data as any).report_data || (data as any).data;
        if (importedData) {
          console.log('Using imported report payload:', importedData);
          console.log('🚀 Processing imported data:', importedData);
          console.log('📋 reportInfo:', importedData.reportInfo);
          console.log('🔍 visualInspection:', importedData.visualInspection);
          console.log('⚡ testEquipment:', importedData.testEquipment);
          console.log('💬 comments:', importedData.reportInfo?.comments);
          
          // Debug specific sections
          console.log('🏭 nameplateData:', importedData.reportInfo?.nameplateData);
          console.log('🌡️ temperature:', importedData.reportInfo?.temperature);
          console.log('🔌 insulationResistance:', importedData.reportInfo?.insulationResistance);
          
          setFormData(prev => {
            const updatedData = {
              ...prev, // Preserve all existing properties
              // Job Information
              customer: importedData.reportInfo?.customer ?? prev.customer,
              address: importedData.reportInfo?.address ?? prev.address,
              user: importedData.reportInfo?.userName ?? prev.user,
              date: importedData.reportInfo?.date ?? prev.date,
              jobNumber: importedData.reportInfo?.jobNumber ?? prev.jobNumber,
              technicians: importedData.reportInfo?.technicians ?? prev.technicians,
              
              // Temperature and Location
              temperature: {
                ...prev.temperature,
                fahrenheit: importedData.reportInfo?.temperature?.fahrenheit ?? prev.temperature.fahrenheit,
                celsius: importedData.reportInfo?.temperature?.celsius ?? prev.temperature.celsius,
                tcf: (() => {
                  const c = importedData.reportInfo?.temperature?.celsius;
                  return typeof c === 'number' ? getTCF(c) : (importedData.reportInfo?.temperature?.correctionFactor ?? prev.temperature.tcf);
                })()
              },
              substation: importedData.reportInfo?.substation ?? prev.substation,
              eqptLocation: importedData.reportInfo?.eqptLocation ?? prev.eqptLocation,
              identifier: importedData.reportInfo?.identifier ?? prev.identifier,
              
              // Nameplate Data
              nameplate: {
                ...prev.nameplate,
                manufacturer: importedData.reportInfo?.nameplateData?.manufacturer ?? prev.nameplate.manufacturer,
                catalogNumber: importedData.reportInfo?.nameplateData?.catalogNumber ?? prev.nameplate.catalogNumber,
                serialNumber: importedData.reportInfo?.nameplateData?.serialNumber ?? prev.nameplate.serialNumber,
                kVA: importedData.reportInfo?.nameplateData?.kva ?? prev.nameplate.kVA,
                tempRise: importedData.reportInfo?.nameplateData?.tempRise ?? prev.nameplate.tempRise,
                impedance: importedData.reportInfo?.nameplateData?.impedance ?? prev.nameplate.impedance,
                fluidType: importedData.reportInfo?.nameplateData?.fluidType ?? prev.nameplate.fluidType,
                fluidVolume: importedData.reportInfo?.nameplateData?.fluidVolume ?? prev.nameplate.fluidVolume,
                // Voltages
                primaryVolts1: importedData.reportInfo?.nameplateData?.primary?.volts ?? prev.nameplate.primaryVolts1,
                primaryVolts2: importedData.reportInfo?.nameplateData?.primary?.voltsSecondary ?? prev.nameplate.primaryVolts2,
                secondaryVolts1: importedData.reportInfo?.nameplateData?.secondary?.volts ?? prev.nameplate.secondaryVolts1,
                secondaryVolts2: importedData.reportInfo?.nameplateData?.secondary?.voltsSecondary ?? prev.nameplate.secondaryVolts2,
                // Connections (as radio booleans)
                primaryConnectionDelta: importedData.reportInfo?.nameplateData?.primary?.connection === 'Delta',
                primaryConnectionWye: importedData.reportInfo?.nameplateData?.primary?.connection === 'Wye',
                primaryConnectionSinglePhase: importedData.reportInfo?.nameplateData?.primary?.connection === 'Single Phase' || importedData.reportInfo?.nameplateData?.primary?.connection === 'SinglePhase',
                secondaryConnectionDelta: importedData.reportInfo?.nameplateData?.secondary?.connection === 'Delta',
                secondaryConnectionWye: importedData.reportInfo?.nameplateData?.secondary?.connection === 'Wye',
                secondaryConnectionSinglePhase: importedData.reportInfo?.nameplateData?.secondary?.connection === 'Single Phase' || importedData.reportInfo?.nameplateData?.secondary?.connection === 'SinglePhase',
                // Winding materials (as radio booleans)
                primaryWindingMaterialAluminum: importedData.reportInfo?.nameplateData?.primary?.material === 'Aluminum',
                primaryWindingMaterialCopper: importedData.reportInfo?.nameplateData?.primary?.material === 'Copper',
                secondaryWindingMaterialAluminum: importedData.reportInfo?.nameplateData?.secondary?.material === 'Aluminum',
                secondaryWindingMaterialCopper: importedData.reportInfo?.nameplateData?.secondary?.material === 'Copper',
                // Tap configuration
                tapVoltages: Array.isArray(importedData.reportInfo?.nameplateData?.tapConfiguration?.voltages)
                  ? importedData.reportInfo.nameplateData.tapConfiguration.voltages
                  : prev.nameplate.tapVoltages,
                tapPositions: Array.isArray(importedData.reportInfo?.nameplateData?.tapConfiguration?.positions)
                  ? importedData.reportInfo.nameplateData.tapConfiguration.positions.map((p: any) => String(p))
                  : prev.nameplate.tapPositions,
                tapPositionLeft1: importedData.reportInfo?.nameplateData?.tapConfiguration?.currentPosition ?? prev.nameplate.tapPositionLeft1,
                tapPositionLeft2: importedData.reportInfo?.nameplateData?.tapConfiguration?.currentPositionSecondary ?? prev.nameplate.tapPositionLeft2,
                tapVoltsSpecific: importedData.reportInfo?.nameplateData?.tapConfiguration?.tapVoltsSpecific ?? prev.nameplate.tapVoltsSpecific,
                tapPercentSpecific: importedData.reportInfo?.nameplateData?.tapConfiguration?.tapPercentSpecific ?? prev.nameplate.tapPercentSpecific
              },
              
              // Indicator Gauge Values
              indicatorGaugeValues: {
                ...prev.indicatorGaugeValues,
                oilLevel: importedData.reportInfo?.oilLevel ?? prev.indicatorGaugeValues.oilLevel,
                tankPressure: importedData.reportInfo?.tankPressure ?? prev.indicatorGaugeValues.tankPressure,
                oilTemperature: importedData.reportInfo?.oilTemperature ?? prev.indicatorGaugeValues.oilTemperature,
                windingTemperature: importedData.reportInfo?.windingTemperature ?? prev.indicatorGaugeValues.windingTemperature,
                oilTempRange: importedData.reportInfo?.oilTempRange ?? prev.indicatorGaugeValues.oilTempRange,
                windingTempRange: importedData.reportInfo?.windingTempRange ?? prev.indicatorGaugeValues.windingTempRange
              },
              
              // Visual Inspection - map the visualInspection data to the visualMechanicalInspection array
              visualMechanicalInspection: prev.visualMechanicalInspection.map(item => {
                const raw = importedData.visualInspection?.[item.netaSection];
                const normalized = typeof raw === 'string' ? raw.trim() : '';
                const lower = normalized.toLowerCase();
                const mapped = (
                  lower === 's' || lower === 'satisfactory' ? 'Satisfactory'
                  : lower === 'u' || lower === 'unsatisfactory' ? 'Unsatisfactory'
                  : lower === 'na' || lower === 'not applicable' ? 'Not Applicable'
                  : lower === 'r' || lower === 'repaired' ? 'Repaired'
                  : lower === 'c' || lower === 'cleaned' ? 'Cleaned'
                  : lower === 'sc' || lower === 'see comments' ? 'See Comments'
                  : item.result
                );
                console.log(`🔍 Mapping ${item.netaSection}: ${normalized} -> ${mapped}`);
                return {
                  ...item,
                  result: mapped
                };
              }),
              
              // Test Equipment
              testEquipmentUsed: {
                ...prev.testEquipmentUsed,
                megohmmeter: importedData.testEquipment?.megohmmeter?.name ?? prev.testEquipmentUsed.megohmmeter,
                serialNumber: importedData.testEquipment?.megohmmeter?.serialNumber ?? prev.testEquipmentUsed.serialNumber,
                ampId: importedData.testEquipment?.megohmmeter?.ampId ?? prev.testEquipmentUsed.ampId
              },
              
              // Comments
              visualMechanicalInspectionComments: importedData.reportInfo?.comments ?? prev.visualMechanicalInspectionComments,
              electricalTestComments: importedData.reportInfo?.comments ?? prev.electricalTestComments,
              
              // Electrical Tests - map the insulationResistance data to the correct form structure
              electricalTestsInsulationResistance: {
                ...prev.electricalTestsInsulationResistance,
                primaryToGround: {
                  ...prev.electricalTestsInsulationResistance.primaryToGround,
                  testVoltage: importedData.reportInfo?.insulationResistance?.primaryToGround?.testVoltage ?? prev.electricalTestsInsulationResistance.primaryToGround.testVoltage,
                  units: importedData.reportInfo?.insulationResistance?.primaryToGround?.unit ?? prev.electricalTestsInsulationResistance.primaryToGround.units,
                  values: {
                    halfMin: importedData.reportInfo?.insulationResistance?.primaryToGround?.readings?.halfMinute ?? prev.electricalTestsInsulationResistance.primaryToGround.values.halfMin,
                    oneMin: importedData.reportInfo?.insulationResistance?.primaryToGround?.readings?.oneMinute ?? prev.electricalTestsInsulationResistance.primaryToGround.values.oneMin,
                    tenMin: importedData.reportInfo?.insulationResistance?.primaryToGround?.readings?.tenMinute ?? prev.electricalTestsInsulationResistance.primaryToGround.values.tenMin
                  }
                },
                secondaryToGround: {
                  ...prev.electricalTestsInsulationResistance.secondaryToGround,
                  testVoltage: importedData.reportInfo?.insulationResistance?.secondaryToGround?.testVoltage ?? prev.electricalTestsInsulationResistance.secondaryToGround.testVoltage,
                  units: importedData.reportInfo?.insulationResistance?.secondaryToGround?.unit ?? prev.electricalTestsInsulationResistance.secondaryToGround.units,
                  values: {
                    halfMin: importedData.reportInfo?.insulationResistance?.secondaryToGround?.readings?.halfMinute ?? prev.electricalTestsInsulationResistance.secondaryToGround.values.halfMin,
                    oneMin: importedData.reportInfo?.insulationResistance?.secondaryToGround?.readings?.oneMinute ?? prev.electricalTestsInsulationResistance.secondaryToGround.values.oneMin,
                    tenMin: importedData.reportInfo?.insulationResistance?.secondaryToGround?.readings?.tenMinute ?? prev.electricalTestsInsulationResistance.secondaryToGround.values.tenMin
                  }
                },
                primaryToSecondary: (() => {
                  const pts = importedData.reportInfo?.insulationResistance?.primaryToSecondary;
                  return {
                    ...prev.electricalTestsInsulationResistance.primaryToSecondary,
                    testVoltage: pts?.testVoltage ?? prev.electricalTestsInsulationResistance.primaryToSecondary.testVoltage,
                    units: pts?.unit ?? prev.electricalTestsInsulationResistance.primaryToSecondary.units,
                    values: {
                      halfMin: pts?.readings?.halfMinute ?? pts?.r05 ?? prev.electricalTestsInsulationResistance.primaryToSecondary.values.halfMin,
                      oneMin: pts?.readings?.oneMinute ?? pts?.r1 ?? prev.electricalTestsInsulationResistance.primaryToSecondary.values.oneMin,
                      tenMin: pts?.readings?.tenMinute ?? pts?.r10 ?? prev.electricalTestsInsulationResistance.primaryToSecondary.values.tenMin
                    }
                  };
                })(),
                dielectricAbsorption: {
                  primary: importedData.reportInfo?.insulationResistance?.dielectricAbsorption?.primary ?? prev.electricalTestsInsulationResistance.dielectricAbsorption.primary,
                  secondary: importedData.reportInfo?.insulationResistance?.dielectricAbsorption?.secondary ?? prev.electricalTestsInsulationResistance.dielectricAbsorption.secondary,
                  primaryToSecondary: importedData.reportInfo?.insulationResistance?.dielectricAbsorption?.primaryToSecondary ?? importedData.reportInfo?.insulationResistance?.dielectricAbsorption?.priToSec ?? prev.electricalTestsInsulationResistance.dielectricAbsorption.primaryToSecondary
                },
                polarizationIndex: {
                  primary: importedData.reportInfo?.insulationResistance?.polarizationIndex?.primary ?? prev.electricalTestsInsulationResistance.polarizationIndex.primary,
                  secondary: importedData.reportInfo?.insulationResistance?.polarizationIndex?.secondary ?? prev.electricalTestsInsulationResistance.polarizationIndex.secondary,
                  primaryToSecondary: importedData.reportInfo?.insulationResistance?.polarizationIndex?.primaryToSecondary ?? importedData.reportInfo?.insulationResistance?.polarizationIndex?.priToSec ?? prev.electricalTestsInsulationResistance.polarizationIndex.primaryToSecondary
                },
                acceptableDAPI: importedData.reportInfo?.insulationResistance?.acceptable ?? prev.electricalTestsInsulationResistance.acceptableDAPI
              }
            };
            
            console.log('✅ Final updated form data:', updatedData);
            console.log('🏭 Nameplate data mapped:', updatedData.nameplate);
            console.log('🌡️ Indicator gauge values mapped:', updatedData.indicatorGaugeValues);
            console.log('🔍 Test equipment mapped:', updatedData.testEquipmentUsed);
            console.log('💬 Comments mapped:', updatedData.visualMechanicalInspectionComments);
            console.log('⚡ Electrical tests mapped:', updatedData.electricalTestsInsulationResistance);
            console.log('🔍 Visual inspection mapped:', updatedData.visualMechanicalInspection);
            
            return updatedData;
          });
        }
        
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      setError(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    const initializeReport = async () => {
      setLoading(true);
      setError(null);
      try {
        await loadJobInfo();
        if (reportId) {
          await loadReport();
        } else {
          setIsEditing(true);
          // Ensure TCF is correct for default temperature
          const initialCelsius = ((68 - 32) * 5) / 9;
          const initialTcf = getTCF(initialCelsius);
          setFormData(prev => ({
            ...prev,
            temperature: { ...prev.temperature, celsius: Math.round(initialCelsius), tcf: initialTcf }
          }));
        }
      } catch (error) {
        console.error('Error initializing report:', error);
        setError(`Failed to initialize report: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    initializeReport();
  }, [jobId, reportId, loadJobInfo, loadReport]);

  // Debug effect to monitor formData changes
  useEffect(() => {
    console.log('🔄 FormData changed - Visual inspection:', formData.visualMechanicalInspection);
    console.log('🔄 FormData changed - Customer:', formData.customer);
    console.log('🔄 FormData changed - Job number:', formData.jobNumber);
  }, [formData]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;
    
    // Prepare the data in the format expected by the importer
    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_data: {
        reportInfo: {
          customer: formData.customer,
          address: formData.address,
          userName: formData.user,
          date: formData.date,
          identifier: formData.identifier,
          jobNumber: formData.jobNumber,
          technicians: formData.technicians,
          temperature: {
            ambient: formData.temperature.fahrenheit,
            fahrenheit: formData.temperature.fahrenheit,
            celsius: formData.temperature.celsius,
            correctionFactor: formData.temperature.tcf,
            humidity: formData.temperature.humidity
          },
          substation: formData.substation,
          eqptLocation: formData.eqptLocation,
          nameplateData: {
            manufacturer: formData.nameplate.manufacturer,
            kva: formData.nameplate.kVA,
            kvaSecondary: (formData as any).nameplate.kVASecondary || '',
            catalogNumber: formData.nameplate.catalogNumber,
            serialNumber: formData.nameplate.serialNumber,
            tempRise: formData.nameplate.tempRise,
            impedance: formData.nameplate.impedance,
            fluidType: formData.nameplate.fluidType,
            fluidVolume: formData.nameplate.fluidVolume,
            primary: {
              volts: formData.nameplate.primaryVolts1,
              voltsSecondary: formData.nameplate.primaryVolts2,
              connection: formData.nameplate.primaryConnectionDelta ? 'Delta' : (formData.nameplate.primaryConnectionWye ? 'Wye' : ''),
              material: formData.nameplate.primaryWindingMaterialAluminum ? 'Aluminum' : (formData.nameplate.primaryWindingMaterialCopper ? 'Copper' : '')
            },
            secondary: {
              volts: formData.nameplate.secondaryVolts1,
              voltsSecondary: formData.nameplate.secondaryVolts2,
              connection: formData.nameplate.secondaryConnectionDelta ? 'Delta' : (formData.nameplate.secondaryConnectionWye ? 'Wye' : ''),
              material: formData.nameplate.secondaryWindingMaterialAluminum ? 'Aluminum' : (formData.nameplate.secondaryWindingMaterialCopper ? 'Copper' : '')
            },
            tapConfiguration: {
              voltages: formData.nameplate.tapVoltages,
              positions: formData.nameplate.tapPositions,
              currentPosition: formData.nameplate.tapPositionLeft1,
              currentPositionSecondary: formData.nameplate.tapPositionLeft2,
              tapVoltsSpecific: formData.nameplate.tapVoltsSpecific,
              tapPercentSpecific: formData.nameplate.tapPercentSpecific
            }
          },
          oilLevel: formData.indicatorGaugeValues.oilLevel,
          tankPressure: formData.indicatorGaugeValues.tankPressure,
          oilTemperature: formData.indicatorGaugeValues.oilTemperature,
          windingTemperature: formData.indicatorGaugeValues.windingTemperature,
          oilTempRange: formData.indicatorGaugeValues.oilTempRange,
          windingTempRange: formData.indicatorGaugeValues.windingTempRange,
          insulationResistance: {
            primaryToGround: {
              testVoltage: formData.electricalTestsInsulationResistance.primaryToGround.testVoltage,
              unit: formData.electricalTestsInsulationResistance.primaryToGround.units,
              readings: {
                halfMinute: formData.electricalTestsInsulationResistance.primaryToGround.values.halfMin,
                oneMinute: formData.electricalTestsInsulationResistance.primaryToGround.values.oneMin,
                tenMinute: formData.electricalTestsInsulationResistance.primaryToGround.values.tenMin
              }
            },
            secondaryToGround: {
              testVoltage: formData.electricalTestsInsulationResistance.secondaryToGround.testVoltage,
              unit: formData.electricalTestsInsulationResistance.secondaryToGround.units,
              readings: {
                halfMinute: formData.electricalTestsInsulationResistance.secondaryToGround.values.halfMin,
                oneMinute: formData.electricalTestsInsulationResistance.secondaryToGround.values.oneMin,
                tenMinute: formData.electricalTestsInsulationResistance.secondaryToGround.values.tenMin
              }
            },
            primaryToSecondary: {
              testVoltage: formData.electricalTestsInsulationResistance.primaryToSecondary.testVoltage,
              unit: formData.electricalTestsInsulationResistance.primaryToSecondary.units,
              readings: {
                halfMinute: formData.electricalTestsInsulationResistance.primaryToSecondary.values.halfMin,
                oneMinute: formData.electricalTestsInsulationResistance.primaryToSecondary.values.oneMin,
                tenMinute: formData.electricalTestsInsulationResistance.primaryToSecondary.values.tenMin
              }
            },
            dielectricAbsorption: {
              primary: formData.electricalTestsInsulationResistance.dielectricAbsorption.primary,
              secondary: formData.electricalTestsInsulationResistance.dielectricAbsorption.secondary,
              primaryToSecondary: formData.electricalTestsInsulationResistance.dielectricAbsorption.primaryToSecondary
            },
            polarizationIndex: {
              primary: formData.electricalTestsInsulationResistance.polarizationIndex.primary,
              secondary: formData.electricalTestsInsulationResistance.polarizationIndex.secondary,
              primaryToSecondary: formData.electricalTestsInsulationResistance.polarizationIndex.primaryToSecondary
            },
            acceptable: formData.electricalTestsInsulationResistance.acceptableDAPI
          },
          comments: formData.visualMechanicalInspectionComments
        },
        visualInspection: formData.visualMechanicalInspection.reduce((acc, item) => {
          acc[item.netaSection] = item.result;
          return acc;
        }, {} as Record<string, string>),
        testEquipment: {
          megohmmeter: {
            name: formData.testEquipmentUsed.megohmmeter,
            serialNumber: formData.testEquipmentUsed.serialNumber,
            ampId: formData.testEquipmentUsed.ampId
          }
        },
        status: formData.status,
        isLiquidType: true,
        reportType: 'liquid-xfmr-visual-mts-report'
      }
    };

    try {
      let result;
      if (reportId) {
        result = await supabase
          .schema('neta_ops')
          .from('liquid_xfmr_visual_mts_reports')
          .update(reportPayload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema('neta_ops')
          .from('liquid_xfmr_visual_mts_reports')
          .insert(reportPayload)
          .select()
          .single();

        if (result.data) {
          const newReportId = result.data.id;
          const assetData = {
            name: "2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test MTS",
            file_url: `report:/jobs/${jobId}/liquid-xfmr-visual-mts-report/${newReportId}`,
            user_id: user.id,
          };
          const { data: assetResult, error: assetError } = await supabase.schema('neta_ops').from('assets').insert(assetData).select('id').single();
          if (assetError) throw assetError;
          if (assetResult) {
             await supabase.schema('neta_ops').from('job_assets').insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });
          }
        }
      }
      if (result.error) throw result.error;
      setIsEditing(false);
      alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, jobId, location);
    } catch (error: any) {
      console.error('Error saving report:', error);
      alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleFahrenheitChange = (fahrenheit: number) => {
    const celsius = ((fahrenheit - 32) * 5) / 9;
    const tcf = getTCF(celsius);
    setFormData(prev => ({
      ...prev,
      temperature: { ...prev.temperature, fahrenheit, celsius: Math.round(celsius), tcf }
    }));
  };
  
  const handleChange = (path: string, value: any) => {
    setFormData(prev => {
      const keys = path.split('.');
      let current: any = prev;
      for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] === undefined) current[keys[i]] = {}; // Ensure path exists
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return { ...prev };
    });
  };

  const handleCheckboxChange = (path: string, field: string) => {
    setFormData(prev => {
      const keys = path.split('.');
      let current: any = prev;
      for (let i = 0; i < keys.length; i++) {
         if (current[keys[i]] === undefined) current[keys[i]] = {}; // Ensure path exists
        current = current[keys[i]];
      }
      current[field] = !current[field];
      return { ...prev };
    });
  };

  // Make connection selections behave like radios (single selection)
  const setConnectionSelection = (which: 'primary' | 'secondary', value: 'Delta' | 'Wye' | 'SinglePhase') => {
    setFormData(prev => {
      const updated = { ...prev };
      if (which === 'primary') {
        updated.nameplate.primaryConnectionDelta = value === 'Delta';
        updated.nameplate.primaryConnectionWye = value === 'Wye';
        updated.nameplate.primaryConnectionSinglePhase = value === 'SinglePhase';
      } else {
        updated.nameplate.secondaryConnectionDelta = value === 'Delta';
        updated.nameplate.secondaryConnectionWye = value === 'Wye';
        updated.nameplate.secondaryConnectionSinglePhase = value === 'SinglePhase';
      }
      return updated;
    });
  };

  // Make winding material selections behave like radios (single selection)
  const setMaterialSelection = (which: 'primary' | 'secondary', value: 'Aluminum' | 'Copper') => {
    setFormData(prev => {
      const updated = { ...prev };
      if (which === 'primary') {
        updated.nameplate.primaryWindingMaterialAluminum = value === 'Aluminum';
        updated.nameplate.primaryWindingMaterialCopper = value === 'Copper';
      } else {
        updated.nameplate.secondaryWindingMaterialAluminum = value === 'Aluminum';
        updated.nameplate.secondaryWindingMaterialCopper = value === 'Copper';
      }
      return updated;
    });
  };
  
  const handleVisualInspectionChange = (index: number, value: string) => {
    setFormData(prev => {
      const newItems = [...prev.visualMechanicalInspection];
      newItems[index].result = value;
      return { ...prev, visualMechanicalInspection: newItems };
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-[#f26722]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-600 text-center">
          <p className="text-xl font-semibold mb-2">Error Loading Report</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Create header function
  const renderHeader = () => (
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
      <div className="flex items-center space-x-4">
        <button
          onClick={() => {
            if (isEditing) setFormData(prev => ({ ...prev, status: prev.status === 'PASS' ? 'FAIL' : 'PASS' }))
          }}
          className={`px-4 py-2 rounded-md text-white font-medium ${
            formData.status === 'PASS' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
          } ${!isEditing ? 'opacity-70 cursor-not-allowed' : ''}`}
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
            disabled={!isEditing}
            className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700 disabled:opacity-50'}`}
          >
            {reportId ? 'Update Report' : 'Save Report'}
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
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - MTS 7.2.2
          <div className="mt-2">
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
                border: formData.status === 'PASS' ? '2px solid #16a34a' : '2px solid #dc2626',
                backgroundColor: formData.status === 'PASS' ? '#22c55e' : '#ef4444',
                color: 'white',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
                boxSizing: 'border-box',
                minWidth: '50px',
              }}
            >
              {formData.status}
            </div>
          </div>
        </div>
      </div>
      {/* End Print Header */}
      
      <div className="p-6 flex justify-center bg-gray-50 dark:bg-dark-200">
        <div className="max-w-7xl w-full space-y-2">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            {renderHeader()}
          </div>
          
          <div className="space-y-8">
            {/* Job Information - standardized compact horizontal layout */}
            <section className="mb-6 job-info-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2">
                <div><label className="form-label">Customer:</label><input type="text" value={formData.customer} readOnly className="form-input bg-gray-200 dark:bg-dark-200 w-full text-gray-900 dark:text-white" /></div>
                <div><label className="form-label">Job #:</label><input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-200 dark:bg-dark-200 w-full text-gray-900 dark:text-white" /></div>
                <div><label className="form-label">Technicians:</label><input type="text" value={formData.technicians} onChange={(e) => handleChange('technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-200 dark:bg-dark-200 text-gray-900 dark:text-white' : ''}`} /></div>
                <div><label className="form-label">Date:</label><input type="date" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-200 dark:bg-dark-200 text-gray-900 dark:text-white' : ''}`} /></div>
                <div><label className="form-label">Identifier:</label><input type="text" value={formData.identifier} onChange={(e) => handleChange('identifier', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-200 dark:bg-dark-200 text-gray-900 dark:text-white' : ''}`} /></div>
                <div className="flex items-center space-x-1">
                  <div>
                    <label className="form-label">Temp:</label>
                    <input type="number" value={formData.temperature.fahrenheit} onChange={(e) => handleFahrenheitChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    <span className="ml-1 text-xs">°F</span>
                  </div>
                  <div>
                    <label className="form-label sr-only">Celsius</label>
                    <input type="number" value={formData.temperature.celsius} readOnly className="form-input w-16 bg-gray-100 dark:bg-dark-200" />
                    <span className="ml-1 text-xs">°C</span>
                  </div>
                </div>
                <div><label className="form-label">TCF:</label><input type="number" value={formData.temperature.tcf} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-16" /></div>
                <div><label className="form-label">Humidity:</label><input type="text" value={formData.temperature.humidity} onChange={(e) => handleChange('temperature.humidity', e.target.value)} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /><span className="ml-1 text-xs">%</span></div>
                <div><label className="form-label">Substation:</label><input type="text" value={formData.substation} onChange={(e) => handleChange('substation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label className="form-label">Eqpt. Location:</label><input type="text" value={formData.eqptLocation} onChange={(e) => handleChange('eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div className="md:col-span-2"><label className="form-label">User:</label><input type="text" value={formData.user} onChange={(e) => handleChange('user', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              </div>
            </section>

            {/* Nameplate Data - standardized */}
            <section className="mb-6 nameplate-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Nameplate Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                {/* Column 1 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Manufacturer:</label>
                  <input type="text" value={formData.nameplate.manufacturer} onChange={e => handleChange('nameplate.manufacturer', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">KVA:</label>
                  <input type="text" value={formData.nameplate.kVA} onChange={e => handleChange('nameplate.kVA', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                </div>
                 <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fluid Type:</label>
                  <input type="text" value={formData.nameplate.fluidType} onChange={e => handleChange('nameplate.fluidType', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                </div>
                {/* Column 2 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Catalog Number:</label>
                  <input type="text" value={formData.nameplate.catalogNumber} onChange={e => handleChange('nameplate.catalogNumber', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Temp. Rise (°C):</label>
                  <input type="text" value={formData.nameplate.tempRise} onChange={e => handleChange('nameplate.tempRise', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                </div>
                 <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fluid Volume (gal):</label>
                  <input type="text" value={formData.nameplate.fluidVolume} onChange={e => handleChange('nameplate.fluidVolume', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                </div>
                {/* Column 3 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number:</label>
                  <input type="text" value={formData.nameplate.serialNumber} onChange={e => handleChange('nameplate.serialNumber', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Impedance (%):</label>
                  <input type="text" value={formData.nameplate.impedance} onChange={e => handleChange('nameplate.impedance', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                </div>
              </div>
              
              {/* Volts, Connections, Winding Material */}
              <div className="mt-6">
                  <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-center">
                      <div></div> {/* Empty cell for alignment */}
                      <div className="text-center text-sm font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">Volts</div>
                      <div className="text-center text-sm font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">Connections</div>
                      <div className="text-center text-sm font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700">Winding Material</div>

                      {/* Primary Row */}
                      <div className="text-sm font-medium text-gray-700 dark:text-white border-b dark:border-gray-700">Primary</div>
                      <div className="flex justify-center items-center space-x-2">
                          <input type="text" value={formData.nameplate.primaryVolts1} onChange={e => handleChange('nameplate.primaryVolts1', e.target.value)} readOnly={!isEditing} className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                          <span className="text-gray-500 dark:text-gray-400">/</span>
                          <input type="text" value={formData.nameplate.primaryVolts2} onChange={e => handleChange('nameplate.primaryVolts2', e.target.value)} readOnly={!isEditing} className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                      </div>
                      <div className="flex justify-center space-x-4">
                          <label className="inline-flex items-center"><input type="radio" name="primary-connection" checked={formData.nameplate.primaryConnectionDelta} onChange={() => setConnectionSelection('primary', 'Delta')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Delta</span></label>
                          <label className="inline-flex items-center"><input type="radio" name="primary-connection" checked={formData.nameplate.primaryConnectionWye} onChange={() => setConnectionSelection('primary', 'Wye')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Wye</span></label>
                          <label className="inline-flex items-center"><input type="radio" name="primary-connection" checked={formData.nameplate.primaryConnectionSinglePhase} onChange={() => setConnectionSelection('primary', 'SinglePhase')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Single Phase</span></label>
                      </div>
                       <div className="flex justify-center space-x-4">
                           <label className="inline-flex items-center"><input type="radio" name="primary-material" checked={formData.nameplate.primaryWindingMaterialAluminum} onChange={() => setMaterialSelection('primary', 'Aluminum')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Aluminum</span></label>
                           <label className="inline-flex items-center"><input type="radio" name="primary-material" checked={formData.nameplate.primaryWindingMaterialCopper} onChange={() => setMaterialSelection('primary', 'Copper')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Copper</span></label>
                      </div>

                      {/* Secondary Row */}
                      <div className="text-sm font-medium text-gray-700 dark:text-white border-b dark:border-gray-700">Secondary</div>
                       <div className="flex justify-center items-center space-x-2">
                          <input type="text" value={formData.nameplate.secondaryVolts1} onChange={e => handleChange('nameplate.secondaryVolts1', e.target.value)} readOnly={!isEditing} className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                          <span className="text-gray-500 dark:text-gray-400">/</span>
                          <input type="text" value={formData.nameplate.secondaryVolts2} onChange={e => handleChange('nameplate.secondaryVolts2', e.target.value)} readOnly={!isEditing} className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                      </div>
                      <div className="flex justify-center space-x-4">
                           <label className="inline-flex items-center"><input type="radio" name="secondary-connection" checked={formData.nameplate.secondaryConnectionDelta} onChange={() => setConnectionSelection('secondary', 'Delta')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Delta</span></label>
                           <label className="inline-flex items-center"><input type="radio" name="secondary-connection" checked={formData.nameplate.secondaryConnectionWye} onChange={() => setConnectionSelection('secondary', 'Wye')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Wye</span></label>
                           <label className="inline-flex items-center"><input type="radio" name="secondary-connection" checked={formData.nameplate.secondaryConnectionSinglePhase} onChange={() => setConnectionSelection('secondary', 'SinglePhase')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Single Phase</span></label>
                      </div>
                      <div className="flex justify-center space-x-4">
                           <label className="inline-flex items-center"><input type="radio" name="secondary-material" checked={formData.nameplate.secondaryWindingMaterialAluminum} onChange={() => setMaterialSelection('secondary', 'Aluminum')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Aluminum</span></label>
                           <label className="inline-flex items-center"><input type="radio" name="secondary-material" checked={formData.nameplate.secondaryWindingMaterialCopper} onChange={() => setMaterialSelection('secondary', 'Copper')} disabled={!isEditing} className="h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-600 focus:ring-[#f26722]" /> <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Copper</span></label>
                      </div>
                  </div>
              </div>

              {/* Tap Configuration */}
              <div className="mt-6 border-t dark:border-gray-700 pt-4 tap-configuration-section">
                <h3 className="text-md font-semibold mb-4 text-gray-800 dark:text-white">Tap Configuration</h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">Tap Voltages</label>
                    <div className="grid grid-cols-7 gap-2 flex-1">
                      {formData.nameplate.tapVoltages.map((voltage, index) => (
                        <input
                          key={`tap-volt-${index}`}
                          type="text"
                          value={voltage}
                          onChange={e => { const newTaps = [...formData.nameplate.tapVoltages]; newTaps[index] = e.target.value; handleChange('nameplate.tapVoltages', newTaps); }}
                          readOnly={!isEditing}
                          className={`w-full text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}
                          placeholder={index > 4 ? '-' : ''}
                        />
                      ))}
                    </div>
                  </div>
                   <div className="flex items-center">
                      <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">Tap Position</label>
                      <div className="grid grid-cols-7 gap-2 flex-1">
                          {formData.nameplate.tapPositions.map((_, index) => (
                          <div key={`tap-pos-label-${index}`} className="text-center text-sm text-gray-700 dark:text-white font-medium bg-gray-100 dark:bg-dark-200 py-1 rounded-md">
                              {index + 1}
                          </div>
                          ))}
                      </div>
                  </div>
                  

                  <div className="flex items-center pt-2">
                    <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">Tap Position Left</label>
                    <div className="flex items-center space-x-2">
                      <input type="text" value={formData.nameplate.tapPositionLeft1} onChange={e => handleChange('nameplate.tapPositionLeft1', e.target.value)} readOnly={!isEditing} className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                      <span className="text-gray-500 dark:text-gray-400">/</span>
                      <input type="text" value={formData.nameplate.tapPositionLeft2} onChange={e => handleChange('nameplate.tapPositionLeft2', e.target.value)} readOnly={!isEditing} className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                    </div>
                    <div className="flex items-center space-x-2 ml-8">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Volts</span>
                      <input type="text" value={formData.nameplate.tapVoltsSpecific} onChange={e => handleChange('nameplate.tapVoltsSpecific', e.target.value)} readOnly={!isEditing} className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                    </div>
                    <div className="flex items-center space-x-2 ml-8">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Percent</span>
                      <input type="text" value={formData.nameplate.tapPercentSpecific} onChange={e => handleChange('nameplate.tapPercentSpecific', e.target.value)} readOnly={!isEditing} className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Indicator Gauge Values */}
            <section className="mb-6 indicator-gauges-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Indicator Gauge Values</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Oil Level:</label>
                      <input type="text" value={formData.indicatorGaugeValues.oilLevel} onChange={e => handleChange('indicatorGaugeValues.oilLevel', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Oil Temperature (°C):</label>
                      <input type="text" value={formData.indicatorGaugeValues.oilTemperature} onChange={e => handleChange('indicatorGaugeValues.oilTemperature', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                  </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Oil Temp. Range:</label>
                      <input type="text" value={formData.indicatorGaugeValues.oilTempRange} onChange={e => handleChange('indicatorGaugeValues.oilTempRange', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tank Pressure:</label>
                      <input type="text" value={formData.indicatorGaugeValues.tankPressure} onChange={e => handleChange('indicatorGaugeValues.tankPressure', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Winding Temperature (°C):</label>
                      <input type="text" value={formData.indicatorGaugeValues.windingTemperature} onChange={e => handleChange('indicatorGaugeValues.windingTemperature', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Winding Temp. Range:</label>
                      <input type="text" value={formData.indicatorGaugeValues.windingTempRange} onChange={e => handleChange('indicatorGaugeValues.windingTempRange', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} />
                  </div>
              </div>
            </section>

            {/* Visual and Mechanical Inspection */}
            <section className="mb-6 visual-mechanical-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Visual and Mechanical Inspection</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-dark-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">NETA Section</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-40">Result</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                    {formData.visualMechanicalInspection.map((item, index) => (
                      <tr key={item.netaSection}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">{item.netaSection}</td>
                        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{item.description}</td>
                        <td className="px-4 py-2">
                          <select 
                            value={item.result} 
                            onChange={e => handleVisualInspectionChange(index, e.target.value)} 
                            disabled={!isEditing} 
                            className={`w-full text-sm rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${
                              !isEditing 
                                ? 'bg-gray-200 dark:bg-dark-200 text-gray-900 dark:text-white cursor-not-allowed' 
                                : 'bg-white dark:bg-dark-100'
                            }`}
                          >
                            {visualInspectionOptions.map(opt => <option key={opt} value={opt} className="dark:bg-dark-100 dark:text-white">{opt}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            
            {/* Visual and Mechanical Inspection Comments */}
            <section className="mb-6 visual-mechanical-comments">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Visual & Mechanical Inspection Comments</h2>
              <textarea 
                  value={formData.visualMechanicalInspectionComments} 
                  onChange={e => handleChange('visualMechanicalInspectionComments', e.target.value)} 
                  readOnly={!isEditing} 
                  rows={4} 
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} 
              />
            </section>

            {/* Electrical Tests - Insulation Resistance */}
            <section className="mb-6 insulation-resistance-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests - Insulation Resistance</h2>
              <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Insulation Resistance Values Table */}
                      <div>
                          <table className="w-full border border-gray-300 dark:border-gray-700">
                              <thead className="bg-gray-50 dark:bg-dark-200">
                                  <tr><th colSpan={6} className="px-2 py-2 text-center text-sm font-medium text-gray-700 dark:text-white border-b dark:border-gray-700">Insulation Resistance Values</th></tr>
                                  <tr>
                                      <th className="th-cell-small w-1/4">Test</th>
                                      <th className="th-cell-small w-1/6">kV</th>
                                      <th className="th-cell-small">0.5 Min.</th>
                                      <th className="th-cell-small">1 Min.</th>
                                      <th className="th-cell-small">10 Min.</th>
                                      <th className="th-cell-small w-1/6 border-r-0">Unit</th>
                                  </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-300 dark:divide-gray-700">
                                  {['primaryToGround', 'secondaryToGround', 'primaryToSecondary'].map(testKey => {
                                      const key = testKey as keyof Pick<FormData['electricalTestsInsulationResistance'], 'primaryToGround' | 'secondaryToGround' | 'primaryToSecondary'>;
                                      const testData = formData.electricalTestsInsulationResistance[key];
                                      const title = testKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                      return (
                                          <tr key={testKey}>
                                              <td className="td-cell-small font-medium">{title}</td>
                                              <td className="td-cell-small">
                                                  <select value={testData.testVoltage} onChange={e => handleChange(`electricalTestsInsulationResistance.${key}.testVoltage`, e.target.value)} disabled={!isEditing} className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}>
                                                      {testVoltageOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                  </select>
                                              </td>
                                              <td className="td-cell-small"><input type="text" value={testData.values.halfMin} onChange={e => handleChange(`electricalTestsInsulationResistance.${key}.values.halfMin`, e.target.value)} readOnly={!isEditing} className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-200 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} /></td>
                                              <td className="td-cell-small"><input type="text" value={testData.values.oneMin} onChange={e => handleChange(`electricalTestsInsulationResistance.${key}.values.oneMin`, e.target.value)} readOnly={!isEditing} className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-200 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} /></td>
                                              <td className="td-cell-small"><input type="text" value={testData.values.tenMin} onChange={e => handleChange(`electricalTestsInsulationResistance.${key}.values.tenMin`, e.target.value)} readOnly={!isEditing} className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-200 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} /></td>
                                              <td className="td-cell-small border-r-0">
                                                  <select value={testData.units} onChange={e => handleChange(`electricalTestsInsulationResistance.${key}.units`, e.target.value)} disabled={!isEditing} className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}>
                                                      {insulationResistanceUnits.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                  </select>
                                              </td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>
                      {/* Temperature Corrected Values Table */}
                      <div>
                          <table className="w-full border border-gray-300 dark:border-gray-700">
                              <thead className="bg-gray-50 dark:bg-dark-200">
                                  <tr><th colSpan={4} className="px-2 py-2 text-center text-sm font-medium text-gray-700 dark:text-white border-b dark:border-gray-700">Temperature Corrected Values</th></tr>
                                   <tr>
                                      <th className="th-cell-small">0.5 Min.</th>
                                      <th className="th-cell-small">1 Min.</th>
                                      <th className="th-cell-small">10 Min.</th>
                                      <th className="th-cell-small border-r-0">Unit</th>
                                  </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-300 dark:divide-gray-700">
                                  {['primaryToGround', 'secondaryToGround', 'primaryToSecondary'].map(testKey => {
                                      const key = testKey as keyof Pick<FormData['electricalTestsInsulationResistance'], 'primaryToGround' | 'secondaryToGround' | 'primaryToSecondary'>;
                                      const testData = formData.electricalTestsInsulationResistance[key];
                                      return (
                                          <tr key={`${testKey}-corr`}>
                                              <td className="td-cell-small"><input type="text" value={testData.correctedValues.halfMin} readOnly className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed" /></td>
                                              <td className="td-cell-small"><input type="text" value={testData.correctedValues.oneMin} readOnly className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed" /></td>
                                              <td className="td-cell-small"><input type="text" value={testData.correctedValues.tenMin} readOnly className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed" /></td>
                                              <td className="td-cell-small border-r-0"><input type="text" value={testData.units} readOnly className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed`} /></td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>
                  </div>
                  {/* Calculated Values Table (DA & PI) */}
                  <div className="mt-6">
                      <table className="w-full border border-gray-300 dark:border-gray-700">
                          <thead className="bg-gray-50 dark:bg-dark-200">
                              <tr>
                                  <th className="th-cell-small w-1/3">Calculated Values</th>
                                  <th className="th-cell-small">Primary</th>
                                  <th className="th-cell-small">Secondary</th>
                                  <th className="th-cell-small">Pri-Sec</th>
                                  <th className="th-cell-small border-r-0">Acceptable</th>
                              </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-300 dark:divide-gray-700">
                              <tr>
                                  <td className="td-cell-small font-medium">Dielectric Absorption <br /><span className="text-xs font-normal">(Ratio of 1 Min. to 0.5 Minute Result)</span></td>
                                  <td className="td-cell-small"><input type="text" value={formData.electricalTestsInsulationResistance.dielectricAbsorption.primary} readOnly className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed"/></td>
                                  <td className="td-cell-small"><input type="text" value={formData.electricalTestsInsulationResistance.dielectricAbsorption.secondary} readOnly className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed"/></td>
                                  <td className="td-cell-small"><input type="text" value={formData.electricalTestsInsulationResistance.dielectricAbsorption.primaryToSecondary} readOnly className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed"/></td>
                                   <td className="td-cell-small border-r-0">
                                      {/* Acceptable field is shared, already rendered above or could be repeated if needed */}
                                      <input type="text" value={formData.electricalTestsInsulationResistance.acceptableDAPI} onChange={e => handleChange('electricalTestsInsulationResistance.acceptableDAPI', e.target.value)} readOnly={!isEditing} className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed`}/>
                                  </td>
                              </tr>
                              <tr>
                                  <td className="td-cell-small font-medium">Polarization Index <br /><span className="text-xs font-normal">(Ratio of 10 Min. to 1 Min. Result)</span></td>
                                  <td className="td-cell-small"><input type="text" value={formData.electricalTestsInsulationResistance.polarizationIndex.primary} readOnly className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed"/></td>
                                  <td className="td-cell-small"><input type="text" value={formData.electricalTestsInsulationResistance.polarizationIndex.secondary} readOnly className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed"/></td>
                                  <td className="td-cell-small"><input type="text" value={formData.electricalTestsInsulationResistance.polarizationIndex.primaryToSecondary} readOnly className="w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed"/></td>
                                   <td className="td-cell-small border-r-0">
                                      {/* Acceptable field is shared, already rendered above or could be repeated if needed */}
                                      <input type="text" value={formData.electricalTestsInsulationResistance.acceptableDAPI} readOnly className={`w-full text-sm text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-dark-200 shadow-sm text-gray-900 dark:text-white cursor-not-allowed`} />
                                  </td>
                              </tr>
                          </tbody>
                      </table>
                  </div>
              </div>
            </section>

            {/* Test Equipment Used */}
            <section className="mb-6 test-equipment-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Test Equipment Used</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Megohmmeter:</label><input type="text" value={formData.testEquipmentUsed.megohmmeter} onChange={e => handleChange('testEquipmentUsed.megohmmeter', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number:</label><input type="text" value={formData.testEquipmentUsed.serialNumber} onChange={e => handleChange('testEquipmentUsed.serialNumber', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID:</label><input type="text" value={formData.testEquipmentUsed.ampId} onChange={e => handleChange('testEquipmentUsed.ampId', e.target.value)} readOnly={!isEditing} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} /></div>
              </div>
            </section>

            {/* Electrical Test Comments */}
            <section className="mb-6 electrical-comments-section">
              <div className="w-full h-1 bg-[#f26722] mb-4"></div>
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Comments</h2>
              <textarea 
                  value={formData.electricalTestComments} 
                  onChange={e => handleChange('electricalTestComments', e.target.value)} 
                  readOnly={!isEditing} 
                  rows={4} 
                  className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`} 
              />
            </section>
          </div>
        </div>
      </div>
    </ReportWrapper>
  );
};

export default LiquidXfmrVisualMTSReport;

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    .insulation-resistance-section table { table-layout: fixed; width: 100%; }
    .insulation-resistance-section th, .insulation-resistance-section td { white-space: normal; word-break: break-word; line-height: 1.15; vertical-align: middle; }
    .insulation-resistance-section table input, .insulation-resistance-section table select { width: 100%; }
    
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
      
      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }
      
      /* Text inputs/selects/textarea styling (exclude checkboxes/radios) */
      input:not([type="checkbox"]):not([type="radio"]), select, textarea { 
        background-color: white !important; 
        border: 1px solid black !important; 
        color: black !important;
        padding: 2px !important; 
        font-size: 11px !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
      }
      input[type="checkbox"], input[type="radio"] { -webkit-appearance: auto !important; -moz-appearance: auto !important; appearance: auto !important; width: 12px !important; height: 12px !important; }
      
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
      
      /* Preserve table structure */
      table { 
        border-collapse: collapse !important; 
        width: 100% !important; 
        font-size: 12px !important;
      }
      
      th, td { 
        border: 1px solid black !important; 
        padding: 4px !important; 
        font-size: 11px !important;
      }
      
      th { 
        background-color: #f0f0f0 !important; 
        font-weight: bold !important; 
      }
      
      /* Preserve grid layouts - don't override to block */
      .grid {
        display: grid !important;
      }
      
      /* Preserve flexbox layouts */
      .flex {
        display: flex !important;
      }
      
      /* Section styling */
      section { 
        break-inside: avoid !important; 
        margin-bottom: 20px !important; 
        page-break-inside: avoid !important;
      }
      
      /* Preserve spacing classes */
      .space-x-2 > * + * { margin-left: 0.5rem !important; }
      .space-x-4 > * + * { margin-left: 1rem !important; }
      .space-y-3 > * + * { margin-top: 0.75rem !important; }
      .space-y-4 > * + * { margin-top: 1rem !important; }
      .space-y-6 > * + * { margin-top: 1.5rem !important; }
      .space-y-8 > * + * { margin-top: 2rem !important; }
      
      /* Preserve gap classes */
      .gap-2 { gap: 0.5rem !important; }
      .gap-4 { gap: 1rem !important; }
      .gap-6 { gap: 1.5rem !important; }
      
      /* Preserve width classes */
      .w-16 { width: 4rem !important; }
      .w-20 { width: 5rem !important; }
      .w-24 { width: 6rem !important; }
      .w-32 { width: 8rem !important; }
      .w-full { width: 100% !important; }
      
      /* Preserve text alignment */
      .text-center { text-align: center !important; }
      .text-left { text-align: left !important; }
      .text-right { text-align: right !important; }
      
      /* Preserve borders */
      .border-b { border-bottom: 1px solid black !important; }
      .border-r { border-right: 1px solid black !important; }
      .border { border: 1px solid black !important; }
      
      /* Preserve padding and margins */
      .p-1 { padding: 0.25rem !important; }
      .p-2 { padding: 0.5rem !important; }
      .p-3 { padding: 0.75rem !important; }
      .p-4 { padding: 1rem !important; }
      .p-6 { padding: 1.5rem !important; }
      .px-2 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
      .px-3 { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
      .px-4 { padding-left: 1rem !important; padding-right: 1rem !important; }
      .py-1 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
      .py-2 { padding-top: 0.5rem !important; padding-bottom: 0.5rem !important; }
      .py-3 { padding-top: 0.75rem !important; padding-bottom: 0.75rem !important; }
      
      .mb-2 { margin-bottom: 0.5rem !important; }
      .mb-4 { margin-bottom: 1rem !important; }
      .mb-6 { margin-bottom: 1.5rem !important; }
      .mt-1 { margin-top: 0.25rem !important; }
      .mt-6 { margin-top: 1.5rem !important; }
      .ml-2 { margin-left: 0.5rem !important; }
      .ml-8 { margin-left: 2rem !important; }
      
      /* Preserve font sizes */
      .text-xs { font-size: 0.75rem !important; }
      .text-sm { font-size: 0.875rem !important; }
      .text-lg { font-size: 1.125rem !important; }
      .text-xl { font-size: 1.25rem !important; }
      .text-2xl { font-size: 1.5rem !important; }
      .text-3xl { font-size: 1.875rem !important; }
      
      /* Preserve font weights */
      .font-medium { font-weight: 500 !important; }
      .font-semibold { font-weight: 600 !important; }
      .font-bold { font-weight: 700 !important; }
      
      /* Page break controls */
      .print\\:page-break-before { page-break-before: always !important; }
      .print\\:page-break-after { page-break-after: always !important; }
      .print\\:page-break-inside-avoid { page-break-inside: avoid !important; }
    }
  `;
  document.head.appendChild(style);
}

// Add custom styles for table cells
const tableStyles = `
  .th-cell-small { 
    @apply px-2 py-2 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-700 dark:text-white border-b dark:border-gray-700 border-r dark:border-gray-700;
  }
  .td-cell-small { 
    @apply px-2 py-1 text-sm text-gray-900 dark:text-white border-r dark:border-gray-700;
  }
`;

if (typeof document !== 'undefined') {
  const tableStyle = document.createElement('style');
  tableStyle.textContent = tableStyles;
  document.head.appendChild(tableStyle);
}