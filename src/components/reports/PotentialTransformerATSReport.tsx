import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { EquipmentAutocomplete } from '../equipment/EquipmentAutocomplete';
import { formatLocalDateShort } from '@/utils/dateUtils';

type ResultOption = 'Select One' | 'Satisfactory' | 'Unsatisfactory' | 'Cleaned' | 'See Comments' | 'Not Applicable';

interface DeviceData {
  manufacturer: string;
  catalogNo: string;
  serialNumber: string;
  accuracyClass: string;
  manufacturedYear: string;
  voltageRating: string;
  insulationClass: string;
  frequency: string;
}

interface VisualInspection {
  [key: string]: ResultOption;
}

interface FuseData {
  manufacturer: string;
  catalogNo: string;
  class: string;
  voltageRating: string;
  ampacity: string;
  icRating: string;
}

interface FuseResistanceRow {
  asFound: string;
  asLeft: string;
  units: string;
}

interface InsulationRow {
  windingTested: string;
  testVoltage: string;
  results: string;
  units: string;
}

interface InsulationCorrectedRow {
  windingTested: string;
  testVoltage: string;
  results: string;
  units: string;
}

interface TurnsRatioRow {
  tap: string;
  primaryVoltage: string;
  calculatedRatio: string;
  measuredH1H2: string;
  percentDev: string;
  passFail: string;
}

interface EquipmentInfo {
  model: string;
  serial: string;
  ampId: string;
  calDate: string;
}

interface ReportData {
  customer: string;
  address: string;
  user: string;
  date: string;
  jobNumber: string;
  technicians: string;
  temperature: number;
  humidity: number;
  identifier: string;
  substation: string;
  eqptLocation: string;
  
  deviceData: DeviceData;
  visualInspection: VisualInspection;
  fuseData: FuseData;
  fuseResistance: FuseResistanceRow;
  insulationResistance: {
    rows: InsulationRow[];
  };
  insulationCorrected: {
    rows: InsulationCorrectedRow[];
  };
  turnsRatio: {
    rows: TurnsRatioRow[];
    secondaryVoltage: string;
  };
  equipment: {
    megohmmeter: EquipmentInfo;
    lowResOhmmeter: EquipmentInfo;
    ttrTestSet: EquipmentInfo;
  };
  comments: string;
}

// Temperature conversion data (Fahrenheit to Celsius)
const TEMP_CONVERSION_DATA: { fahrenheit: number; celsius: number }[] = [
  { fahrenheit: -11.2, celsius: -24 }, { fahrenheit: -9.4, celsius: -23 }, { fahrenheit: -7.6, celsius: -22 },
  { fahrenheit: -5.8, celsius: -21 }, { fahrenheit: -4, celsius: -20 }, { fahrenheit: -2.2, celsius: -19 },
  { fahrenheit: -0.4, celsius: -18 }, { fahrenheit: 1.4, celsius: -17 }, { fahrenheit: 3.2, celsius: -16 },
  { fahrenheit: 5, celsius: -15 }, { fahrenheit: 6.8, celsius: -14 }, { fahrenheit: 8.6, celsius: -13 },
  { fahrenheit: 10.4, celsius: -12 }, { fahrenheit: 12.2, celsius: -11 }, { fahrenheit: 14, celsius: -10 },
  { fahrenheit: 15.8, celsius: -9 }, { fahrenheit: 17.6, celsius: -8 }, { fahrenheit: 19.4, celsius: -7 },
  { fahrenheit: 21.2, celsius: -6 }, { fahrenheit: 23, celsius: -5 }, { fahrenheit: 24.8, celsius: -4 },
  { fahrenheit: 26.6, celsius: -3 }, { fahrenheit: 28.4, celsius: -2 }, { fahrenheit: 30.2, celsius: -1 },
  { fahrenheit: 32, celsius: 0 }, { fahrenheit: 33.8, celsius: 1 }, { fahrenheit: 35.6, celsius: 2 },
  { fahrenheit: 37.4, celsius: 3 }, { fahrenheit: 39.2, celsius: 4 }, { fahrenheit: 41, celsius: 5 },
  { fahrenheit: 42.8, celsius: 6 }, { fahrenheit: 44.6, celsius: 7 }, { fahrenheit: 46.4, celsius: 8 },
  { fahrenheit: 48.2, celsius: 9 }, { fahrenheit: 50, celsius: 10 }, { fahrenheit: 51.8, celsius: 11 },
  { fahrenheit: 53.6, celsius: 12 }, { fahrenheit: 55.4, celsius: 13 }, { fahrenheit: 57.2, celsius: 14 },
  { fahrenheit: 59, celsius: 15 }, { fahrenheit: 60.8, celsius: 16 }, { fahrenheit: 62.6, celsius: 17 },
  { fahrenheit: 64.4, celsius: 18 }, { fahrenheit: 66.2, celsius: 19 }, { fahrenheit: 68, celsius: 20 },
  { fahrenheit: 69.8, celsius: 21 }, { fahrenheit: 71.6, celsius: 22 }, { fahrenheit: 73.4, celsius: 23 },
  { fahrenheit: 75.2, celsius: 24 }, { fahrenheit: 77, celsius: 25 }, { fahrenheit: 78.8, celsius: 26 },
  { fahrenheit: 80.6, celsius: 27 }, { fahrenheit: 82.4, celsius: 28 }, { fahrenheit: 84.2, celsius: 29 },
  { fahrenheit: 86, celsius: 30 }, { fahrenheit: 87.8, celsius: 31 }, { fahrenheit: 89.6, celsius: 32 },
  { fahrenheit: 91.4, celsius: 33 }, { fahrenheit: 93.2, celsius: 34 }, { fahrenheit: 95, celsius: 35 },
  { fahrenheit: 96.8, celsius: 36 }, { fahrenheit: 98.6, celsius: 37 }, { fahrenheit: 100.4, celsius: 38 },
  { fahrenheit: 102.2, celsius: 39 }, { fahrenheit: 104, celsius: 40 }, { fahrenheit: 105.8, celsius: 41 },
  { fahrenheit: 107.6, celsius: 42 }, { fahrenheit: 109.4, celsius: 43 }, { fahrenheit: 111.2, celsius: 44 },
  { fahrenheit: 113, celsius: 45 }, { fahrenheit: 114.8, celsius: 46 }, { fahrenheit: 116.6, celsius: 47 },
  { fahrenheit: 118.4, celsius: 48 }, { fahrenheit: 120.2, celsius: 49 }, { fahrenheit: 122, celsius: 50 },
  { fahrenheit: 123.8, celsius: 51 }, { fahrenheit: 125.6, celsius: 52 }, { fahrenheit: 127.4, celsius: 53 },
  { fahrenheit: 129.2, celsius: 54 }, { fahrenheit: 131, celsius: 55 }, { fahrenheit: 132.8, celsius: 56 },
  { fahrenheit: 134.6, celsius: 57 }, { fahrenheit: 136.4, celsius: 58 }, { fahrenheit: 138.2, celsius: 59 },
  { fahrenheit: 140, celsius: 60 }, { fahrenheit: 141.8, celsius: 61 }, { fahrenheit: 143.6, celsius: 62 },
  { fahrenheit: 145.4, celsius: 63 }, { fahrenheit: 147.2, celsius: 64 }, { fahrenheit: 149, celsius: 65 },
  { fahrenheit: 150.8, celsius: 66 }, { fahrenheit: 152.6, celsius: 67 }, { fahrenheit: 154.4, celsius: 68 },
  { fahrenheit: 156.2, celsius: 69 }, { fahrenheit: 158, celsius: 70 }, { fahrenheit: 159.8, celsius: 71 },
  { fahrenheit: 161.6, celsius: 72 }, { fahrenheit: 163.4, celsius: 73 }, { fahrenheit: 165.2, celsius: 74 },
  { fahrenheit: 167, celsius: 75 }, { fahrenheit: 168.8, celsius: 76 }, { fahrenheit: 170.6, celsius: 77 },
  { fahrenheit: 172.4, celsius: 78 }, { fahrenheit: 174.2, celsius: 79 }, { fahrenheit: 176, celsius: 80 },
  { fahrenheit: 177.8, celsius: 81 }, { fahrenheit: 179.6, celsius: 82 }, { fahrenheit: 181.4, celsius: 83 },
  { fahrenheit: 183.2, celsius: 84 }, { fahrenheit: 185, celsius: 85 }, { fahrenheit: 186.8, celsius: 86 },
  { fahrenheit: 188.6, celsius: 87 }, { fahrenheit: 190.4, celsius: 88 }, { fahrenheit: 192.2, celsius: 89 },
  { fahrenheit: 194, celsius: 90 }, { fahrenheit: 195.8, celsius: 91 }, { fahrenheit: 197.6, celsius: 92 },
  { fahrenheit: 199.4, celsius: 93 }, { fahrenheit: 201.2, celsius: 94 }, { fahrenheit: 203, celsius: 95 },
  { fahrenheit: 204.8, celsius: 96 }, { fahrenheit: 206.6, celsius: 97 }, { fahrenheit: 208.4, celsius: 98 },
  { fahrenheit: 210.2, celsius: 99 }, { fahrenheit: 212, celsius: 100 }, { fahrenheit: 213.8, celsius: 101 },
  { fahrenheit: 215.6, celsius: 102 }, { fahrenheit: 217.4, celsius: 103 }, { fahrenheit: 219.2, celsius: 104 },
  { fahrenheit: 221, celsius: 105 }, { fahrenheit: 222.8, celsius: 106 }, { fahrenheit: 224.6, celsius: 107 },
  { fahrenheit: 226.4, celsius: 108 }, { fahrenheit: 228.2, celsius: 109 }, { fahrenheit: 230, celsius: 110 }
];

// TCF data (Temperature Correction Factor) - Insulation Correction Factors (20C)
const TCF_DATA: { celsius: number; multiplier: number }[] = [
  { celsius: -24, multiplier: 0.054 }, { celsius: -23, multiplier: 0.068 }, { celsius: -22, multiplier: 0.082 },
  { celsius: -21, multiplier: 0.096 }, { celsius: -20, multiplier: 0.11 }, { celsius: -19, multiplier: 0.124 },
  { celsius: -18, multiplier: 0.138 }, { celsius: -17, multiplier: 0.152 }, { celsius: -16, multiplier: 0.166 },
  { celsius: -15, multiplier: 0.18 }, { celsius: -14, multiplier: 0.194 }, { celsius: -13, multiplier: 0.208 },
  { celsius: -12, multiplier: 0.222 }, { celsius: -11, multiplier: 0.236 }, { celsius: -10, multiplier: 0.25 },
  { celsius: -9, multiplier: 0.264 }, { celsius: -8, multiplier: 0.278 }, { celsius: -7, multiplier: 0.292 },
  { celsius: -6, multiplier: 0.306 }, { celsius: -5, multiplier: 0.32 }, { celsius: -4, multiplier: 0.336 },
  { celsius: -3, multiplier: 0.352 }, { celsius: -2, multiplier: 0.368 }, { celsius: -1, multiplier: 0.384 },
  { celsius: 0, multiplier: 0.4 }, { celsius: 1, multiplier: 0.42 }, { celsius: 2, multiplier: 0.44 },
  { celsius: 3, multiplier: 0.46 }, { celsius: 4, multiplier: 0.48 }, { celsius: 5, multiplier: 0.5 },
  { celsius: 6, multiplier: 0.526 }, { celsius: 7, multiplier: 0.552 }, { celsius: 8, multiplier: 0.578 },
  { celsius: 9, multiplier: 0.604 }, { celsius: 10, multiplier: 0.63 }, { celsius: 11, multiplier: 0.666 },
  { celsius: 12, multiplier: 0.702 }, { celsius: 13, multiplier: 0.738 }, { celsius: 14, multiplier: 0.774 },
  { celsius: 15, multiplier: 0.81 }, { celsius: 16, multiplier: 0.848 }, { celsius: 17, multiplier: 0.886 },
  { celsius: 18, multiplier: 0.924 }, { celsius: 19, multiplier: 0.962 }, { celsius: 20, multiplier: 1 },
  { celsius: 21, multiplier: 1.05 }, { celsius: 22, multiplier: 1.1 }, { celsius: 23, multiplier: 1.15 },
  { celsius: 24, multiplier: 1.2 }, { celsius: 25, multiplier: 1.25 }, { celsius: 26, multiplier: 1.316 },
  { celsius: 27, multiplier: 1.382 }, { celsius: 28, multiplier: 1.448 }, { celsius: 29, multiplier: 1.514 },
  { celsius: 30, multiplier: 1.58 }, { celsius: 31, multiplier: 1.664 }, { celsius: 32, multiplier: 1.748 },
  { celsius: 33, multiplier: 1.832 }, { celsius: 34, multiplier: 1.872 }, { celsius: 35, multiplier: 2 },
  { celsius: 36, multiplier: 2.1 }, { celsius: 37, multiplier: 2.2 }, { celsius: 38, multiplier: 2.3 },
  { celsius: 39, multiplier: 2.4 }, { celsius: 40, multiplier: 2.5 }, { celsius: 41, multiplier: 2.628 },
  { celsius: 42, multiplier: 2.756 }, { celsius: 43, multiplier: 2.884 }, { celsius: 44, multiplier: 3.012 },
  { celsius: 45, multiplier: 3.15 }, { celsius: 46, multiplier: 3.316 }, { celsius: 47, multiplier: 3.482 },
  { celsius: 48, multiplier: 3.648 }, { celsius: 49, multiplier: 3.814 }, { celsius: 50, multiplier: 3.98 },
  { celsius: 51, multiplier: 4.184 }, { celsius: 52, multiplier: 4.388 }, { celsius: 53, multiplier: 4.592 },
  { celsius: 54, multiplier: 4.796 }, { celsius: 55, multiplier: 5 }, { celsius: 56, multiplier: 5.26 },
  { celsius: 57, multiplier: 5.52 }, { celsius: 58, multiplier: 5.78 }, { celsius: 59, multiplier: 6.04 },
  { celsius: 60, multiplier: 6.3 }, { celsius: 61, multiplier: 6.62 }, { celsius: 62, multiplier: 6.94 },
  { celsius: 63, multiplier: 7.26 }, { celsius: 64, multiplier: 7.58 }, { celsius: 65, multiplier: 7.9 },
  { celsius: 66, multiplier: 8.32 }, { celsius: 67, multiplier: 8.74 }, { celsius: 68, multiplier: 9.16 },
  { celsius: 69, multiplier: 9.58 }, { celsius: 70, multiplier: 10 }, { celsius: 71, multiplier: 10.52 },
  { celsius: 72, multiplier: 11.04 }, { celsius: 73, multiplier: 11.56 }, { celsius: 74, multiplier: 12.08 },
  { celsius: 75, multiplier: 12.6 }, { celsius: 76, multiplier: 13.24 }, { celsius: 77, multiplier: 13.88 },
  { celsius: 78, multiplier: 14.52 }, { celsius: 79, multiplier: 15.16 }, { celsius: 80, multiplier: 15.8 },
  { celsius: 81, multiplier: 16.64 }, { celsius: 82, multiplier: 17.48 }, { celsius: 83, multiplier: 18.32 },
  { celsius: 84, multiplier: 19.16 }, { celsius: 85, multiplier: 20 }, { celsius: 86, multiplier: 21.04 },
  { celsius: 87, multiplier: 22.08 }, { celsius: 88, multiplier: 23.12 }, { celsius: 89, multiplier: 24.16 },
  { celsius: 90, multiplier: 25.2 }, { celsius: 91, multiplier: 26.45 }, { celsius: 92, multiplier: 27.7 },
  { celsius: 93, multiplier: 28.95 }, { celsius: 94, multiplier: 30.2 }, { celsius: 95, multiplier: 31.6 },
  { celsius: 96, multiplier: 33.28 }, { celsius: 97, multiplier: 34.96 }, { celsius: 98, multiplier: 36.64 },
  { celsius: 99, multiplier: 38.32 }, { celsius: 100, multiplier: 40 }, { celsius: 101, multiplier: 42.08 },
  { celsius: 102, multiplier: 44.16 }, { celsius: 103, multiplier: 46.24 }, { celsius: 104, multiplier: 48.32 },
  { celsius: 105, multiplier: 50.4 }, { celsius: 106, multiplier: 52.96 }, { celsius: 107, multiplier: 55.52 },
  { celsius: 108, multiplier: 58.08 }, { celsius: 109, multiplier: 60.64 }, { celsius: 110, multiplier: 63.2 }
];

const INSPECTION_ITEMS = [
  { id: '7.10.2.A.1', description: 'Compare equipment nameplate data with drawings and specifications.' },
  { id: '7.10.2.A.2', description: 'Inspect physical and mechanical condition.' },
  { id: '7.10.2.A.3', description: 'Verify proper connection of transformers with system requirements.' },
  { id: '7.10.2.A.4', description: 'Verify that adequate clearances exist between primary and secondary circuit wiring.' },
  { id: '7.10.2.A.5', description: 'Verify the unit is clean.' },
  { id: '7.10.2.A.6.1', description: 'Use of low-resistance ohmmeter in accordance with Section 7.10.2.B.1.' },
  { id: '7.10.2.A.7', description: 'Verify that all required grounding and connections provide good electrical contact.' },
  { id: '7.10.2.A.8', description: 'Verify correct primary and secondary fuse sizes for voltage transformers.' },
  { id: '7.10.2.A.9', description: 'Verify appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.' }
];

const RESULT_OPTIONS: ResultOption[] = ['Select One', 'Satisfactory', 'Unsatisfactory', 'Cleaned', 'See Comments', 'Not Applicable'];

// Dropdown options
const INSULATION_RESISTANCE_UNITS = ['kΩ', 'MΩ', 'GΩ'];
const INSULATION_RESISTANCE_TEST_VOLTAGES = ['250V', '500V', '1000V', '2500V', '5000V'];
const CONTACT_RESISTANCE_UNITS = ['μΩ', 'mΩ', 'Ω'];
const DIELECTRIC_WITHSTAND_UNITS = ['μA', 'mA'];
const VLF_WITHSTAND_TEST_VOLTAGES = [
  { cableRating: '5', testVoltage: '10' },
  { cableRating: '8', testVoltage: '13' },
  { cableRating: '15', testVoltage: '21' },
  { cableRating: '20', testVoltage: '26' },
  { cableRating: '25', testVoltage: '32' },
  { cableRating: '28', testVoltage: '36' },
  { cableRating: '30', testVoltage: '38' },
  { cableRating: '35', testVoltage: '44' },
  { cableRating: '46', testVoltage: '57' },
  { cableRating: '69', testVoltage: '84' }
];
const CABLE_SIZES = ['#18', '#16', '#12', '#10', '#8', '#6', '#4', '#2', '#1', '1/0', '2/0', '3/0', '4/0', '250', '300', '350', '400', '500', '600', '750', '1000'];
const EQUIPMENT_EVALUATION_RESULTS = ['PASS', 'FAIL', 'LIMITED SERVICE'];

const convertFahrenheitToCelsius = (fahrenheit: number): number => {
  const exactMatch = TEMP_CONVERSION_DATA.find(data => Math.abs(data.fahrenheit - fahrenheit) < 0.01);
  if (exactMatch) return exactMatch.celsius;
  
  // Linear interpolation if no exact match
  const sortedData = TEMP_CONVERSION_DATA.sort((a, b) => a.fahrenheit - b.fahrenheit);
  
  if (fahrenheit <= sortedData[0].fahrenheit) return sortedData[0].celsius;
  if (fahrenheit >= sortedData[sortedData.length - 1].fahrenheit) return sortedData[sortedData.length - 1].celsius;
  
  for (let i = 0; i < sortedData.length - 1; i++) {
    const curr = sortedData[i];
    const next = sortedData[i + 1];
    
    if (fahrenheit >= curr.fahrenheit && fahrenheit <= next.fahrenheit) {
      const ratio = (fahrenheit - curr.fahrenheit) / (next.fahrenheit - curr.fahrenheit);
      return curr.celsius + ratio * (next.celsius - curr.celsius);
    }
  }
  
  return fahrenheit; // fallback
};

const getTCF = (celsius: number): number => {
  const exactMatch = TCF_DATA.find(data => data.celsius === celsius);
  if (exactMatch) return exactMatch.multiplier;
  
  // Linear interpolation
  const sortedData = TCF_DATA.sort((a, b) => a.celsius - b.celsius);
  
  if (celsius <= sortedData[0].celsius) return sortedData[0].multiplier;
  if (celsius >= sortedData[sortedData.length - 1].celsius) return sortedData[sortedData.length - 1].multiplier;
  
  for (let i = 0; i < sortedData.length - 1; i++) {
    const curr = sortedData[i];
    const next = sortedData[i + 1];
    
    if (celsius >= curr.celsius && celsius <= next.celsius) {
      const ratio = (celsius - curr.celsius) / (next.celsius - curr.celsius);
      return curr.multiplier + ratio * (next.multiplier - curr.multiplier);
    }
  }
  
  return 1.0; // fallback
};

const applyTCF = (reading: string, tcf: number): string => {
  if (!reading || reading.trim() === '') return '';
  
  const numericValue = parseFloat(reading);
  if (isNaN(numericValue)) return reading;
  
  const correctedValue = numericValue * tcf;
  
  // Return with appropriate precision
  if (correctedValue >= 1000) {
    return correctedValue.toFixed(0);
  } else if (correctedValue >= 100) {
    return correctedValue.toFixed(1);
  } else if (correctedValue >= 10) {
    return correctedValue.toFixed(2);
  } else {
    return correctedValue.toFixed(3);
  }
};

const PotentialTransformerATSReport: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{ id: string; reportId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(initialReportId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'PASS' | 'FAIL'>('PASS');
  const [isEditMode, setIsEditMode] = useState<boolean>(!initialReportId); // Edit mode by default for new reports
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(initialReportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);

  const [formData, setFormData] = useState<ReportData>({
    customer: '',
    address: '',
    user: '',
    date: new Date().toLocaleDateString(),
    jobNumber: '',
    technicians: '',
    temperature: 72,
    humidity: 72,
    identifier: '',
    substation: '',
    eqptLocation: '',
    
    deviceData: {
      manufacturer: '',
      catalogNo: '',
      serialNumber: '',
      accuracyClass: '',
      manufacturedYear: '',
      voltageRating: '',
      insulationClass: '',
      frequency: ''
    },
    
    visualInspection: INSPECTION_ITEMS.reduce((acc, item) => {
      acc[item.id] = 'Select One';
      return acc;
    }, {} as VisualInspection),
    
    fuseData: {
      manufacturer: '',
      catalogNo: '',
      class: '',
      voltageRating: '',
      ampacity: '',
      icRating: ''
    },
    
    fuseResistance: {
      asFound: '',
      asLeft: '',
      units: 'μΩ'
    },
    
    insulationResistance: {
      rows: [
        { windingTested: 'Primary to Ground', testVoltage: '250V', results: '', units: 'kΩ' },
        { windingTested: 'Secondary to Ground', testVoltage: '250V', results: '', units: 'kΩ' },
        { windingTested: 'Primary to Secondary', testVoltage: '250V', results: '', units: 'kΩ' }
      ]
    },
    
    insulationCorrected: {
      rows: [
        { windingTested: 'Primary to Ground', testVoltage: '250V', results: '', units: 'kΩ' },
        { windingTested: 'Secondary to Ground', testVoltage: '250V', results: '', units: 'kΩ' },
        { windingTested: 'Primary to Secondary', testVoltage: '250V', results: '', units: 'kΩ' }
      ]
    },
    
    turnsRatio: {
      rows: [
        { tap: 'N/A', primaryVoltage: '480', calculatedRatio: '4.0', measuredH1H2: '', percentDev: '', passFail: '' }
      ],
      secondaryVoltage: '120.0'
    },
    
    equipment: {
      megohmmeter: { model: '', serial: '', ampId: '', calDate: '' },
      lowResOhmmeter: { model: '', serial: '', ampId: '', calDate: '' },
      ttrTestSet: { model: '', serial: '', ampId: '', calDate: '' }
    },
    
    comments: ''
  });

  // Calculate temperature conversions and TCF
  // Handle both number and object formats for temperature (desktop app sends object, web app uses number)
  const temperatureValue = (typeof formData.temperature === 'object' && formData.temperature !== null)
    ? ((formData.temperature as { fahrenheit?: number })?.fahrenheit ?? 68) 
    : (formData.temperature as number ?? 68);
  
  const celsiusTemperature = useMemo(() => 
    Math.round(convertFahrenheitToCelsius(temperatureValue) * 10) / 10, 
    [temperatureValue]
  );
  
  const tcf = useMemo(() => getTCF(celsiusTemperature), [celsiusTemperature]);

  // Auto-calculate temperature corrected insulation resistance values
  useEffect(() => {
    // Safety check: ensure rows is an array
    const insulationRows = Array.isArray(formData.insulationResistance?.rows) 
      ? formData.insulationResistance.rows 
      : [];
    
    if (insulationRows.length === 0) return;
    
    const updatedInsulationCorrectedRows = insulationRows.map((measuredRow) => {
      const correctedRow: InsulationCorrectedRow = { 
        ...measuredRow,
        results: applyTCF(measuredRow.results, tcf)
      };
      return correctedRow;
    });
    
    setFormData(prev => ({
      ...prev,
      insulationCorrected: {
        ...prev.insulationCorrected,
        rows: updatedInsulationCorrectedRows,
      },
    }));
  }, [formData.temperature, tcf, formData.insulationResistance?.rows]);

  // Add comprehensive print styles matching PanelboardReport
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Hide navigation bar and scrollbar */
      nav, header, .navigation, [class*="nav"], [class*="header"] {
        display: none !important;
      }
      html { height: 100%; }
      body { overflow-x: hidden; min-height: 100vh; padding-bottom: 100px; }
      textarea { min-height: 200px !important; }

      /* Section headers with orange dividers for fillable report */
      h2 {
        border-top: 2px solid #f26722 !important;
        padding-top: 8px !important;
        margin-top: 16px !important;
      }

      @media print {
        /* Hide on-screen job info grid entirely in print */
        .job-info-onscreen, .job-info-onscreen * { display: none !important; }
        /* Hide on-screen nameplate grid in print */
        .nameplate-onscreen, .nameplate-onscreen * { display: none !important; }
        /* Hide on-screen fuse data grid in print */
        .fuse-data-onscreen, .fuse-data-onscreen * { display: none !important; }
        /* Hide on-screen test equipment grid in print */
        .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }

        * { 
          color: black !important;
          background: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        html, body {
          margin: 0;
          padding: 0;
          font-family: Arial, Helvetica, sans-serif !important;
          font-size: 9px !important;
          background: white !important;
          line-height: 1 !important;
        }
        
        /* Standard portrait page size with minimal margins */
        @page { 
          size: 8.5in 11in; 
          margin: 0.2in;
        }
        
        /* Hide all non-print elements */
        .print\\:hidden { display: none !important; }
        
        /* Hide second title and back button in print only */
        .flex.justify-between.items-center.mb-6 { display: none !important; }
        .flex.items-center.gap-4 { display: none !important; }
        button { display: none !important; }
        
        /* Section headers with orange line above - ultra compact */
        h2 {
          font-size: 9px !important;
          font-weight: bold !important;
          margin: 0 !important;
          margin-top: 0 !important;
          padding: 1px 0 !important;
          background-color: transparent !important;
          color: black !important;
          text-transform: none !important;
          border: none !important;
          border-bottom: 1px solid black !important;
          line-height: 1.2 !important;
          padding-bottom: 2px !important;
          padding-top: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          position: relative !important;
        }
        
        /* Remove pseudo-element - not working properly */
        h2::before {
          display: none !important;
        }
        
        /* Create actual section dividers */
        .mb-6 {
          margin-top: 12px !important;
          border-top: 1px solid #f26722 !important;
          padding-top: 8px !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        /* First section shouldn't have top border */
        .mb-6:first-of-type {
          border-top: none !important;
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        
        /* Add extra spacing after tables to prevent overlap */
        table {
          margin-bottom: 8px !important;
        }

        /* Force PASS/FAIL colors to print */
        .status-pass {
          background-color: #22c55e !important;
          border: 2px solid #16a34a !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        .status-fail {
          background-color: #ef4444 !important;
          border: 2px solid #dc2626 !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        /* Remove all card styling and shadows */
        .bg-white, .dark\\:bg-dark-150, .rounded-lg, .shadow {
          background: white !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
          margin-bottom: 3px !important;
          border: none !important;
        }
        
        /* Remove ALL section styling - no boxes */
        section {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          margin: 0 !important;
          margin-bottom: 2px !important;
        }
        
        /* FORCE remove all borders and boxes from everything except tables */
        * {
          border: none !important;
          box-shadow: none !important;
          outline: none !important;
        }
        
        /* Only allow borders on table elements */
        table, th, td, thead, tbody, tr {
          border: 1px solid black !important;
        }
        
        /* Form grid layout - ultra compact */
        .grid {
          display: grid !important;
          gap: 1px !important;
          margin-bottom: 2px !important;
        }
        
        /* Labels and inputs - ultra compact */
        label {
          font-size: 8px !important;
          font-weight: normal !important;
          margin: 0 !important;
          display: inline-block !important;
          margin-right: 2px !important;
        }
        
        input, select, textarea {
          width: auto !important;
          border: none !important;
          background: transparent !important;
          padding: 0 1px !important;
          margin: 0 !important;
          font-size: 8px !important;
          height: 12px !important;
          display: inline-block !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }
        
        textarea {
          width: 100% !important;
          height: auto !important;
          min-height: 20px !important;
          border: 1px solid black !important;
          display: block !important;
          margin-top: 1px !important;
          font-size: 8px !important;
          padding: 2px !important;
        }
        
        /* Table styles - ultra compact */
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin: 1px 0 !important;
          font-size: 8px !important;
          page-break-inside: avoid !important;
          margin-bottom: 16px !important;
        }
        
        th, td {
          border: 0.5px solid black !important;
          padding: 0px 1px !important;
          text-align: center !important;
          font-size: 8px !important;
          height: 12px !important;
          line-height: 1 !important;
        }
        
        th {
          background-color: #f0f0f0 !important;
          font-weight: bold !important;
        }
        
        /* Specific input styling in tables */
        table input, table select {
          border: none !important;
          padding: 0 !important;
          margin: 0 !important;
          height: 10px !important;
          text-align: center !important;
          width: 100% !important;
          font-size: 8px !important;
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
        
        /* Force table cell inputs to not interfere with table borders */
        td input, td select, td textarea {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          outline: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }
        
        /* Remove all input styling completely in print */
        input[class*="border-0"], select[class*="border-0"], textarea[class*="border-0"] {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          outline: none !important;
          padding: 0 !important;
          margin: 0 !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }
        
        /* Remove ALL input boxes in electrical test tables */
        table input, table select, table textarea {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          outline: none !important;
          padding: 0 !important;
          margin: 0 !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          width: auto !important;
          display: inline !important;
        }
        
        /* Ensure all form inputs are invisible */
        input, select, textarea {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          outline: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        
        /* Target ALL input fields regardless of class or location */
        input[type="text"], input[type="number"], input[type="date"], 
        select, textarea, 
        .form-input, .form-select, .form-textarea {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          outline: none !important;
          padding: 0 !important;
          margin: 0 !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          background-image: none !important;
        }
        
        /* Remove any remaining visual artifacts from form elements */
        * {
          box-shadow: none !important;
          text-shadow: none !important;
          border-radius: 0 !important;
        }
        
        /* Override any Tailwind classes that might add styling */
        [class*="border"], [class*="shadow"], [class*="ring"], [class*="rounded"] {
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
        
        /* Specifically target common form styling classes */
        .border, .border-gray-300, .shadow-sm, .rounded-md,
        .focus\\:ring-2, .focus\\:border-blue-500, .focus\\:outline-none {
          border: none !important;
          box-shadow: none !important;
          outline: none !important;
          border-radius: 0 !important;
        }
        
        /* Force PASS/FAIL colors to print */
        .status-pass {
          background-color: #22c55e !important;
          border: 2px solid #16a34a !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        .status-fail {
          background-color: #ef4444 !important;
          border: 2px solid #dc2626 !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        /* Specific class for PASS/FAIL status box */
        .pass-fail-status-box {
          background-color: #22c55e !important;
          border: 2px solid #16a34a !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          display: inline-block !important;
          padding: 4px 10px !important;
          font-size: 12px !important;
          font-weight: bold !important;
          text-align: center !important;
          width: fit-content !important;
          border-radius: 6px !important;
          box-sizing: border-box !important;
          min-width: 50px !important;
        }
        
        /* Remove all spacing classes */
        .space-y-4 > * + *, .space-y-6 > * + * { margin-top: 2px !important; }
        .mb-4 { margin-bottom: 2px !important; }
        .mb-6 { margin-bottom: 3px !important; }
        .mb-8 { margin-bottom: 3px !important; }
        .p-6 { padding: 0 !important; }
        
        /* Comments section */
        .min-h-[250px] {
          min-height: 20px !important;
        }
        
        /* Page break control */
        section { page-break-inside: avoid !important; }
        
        /* Ensure everything fits properly */
        .max-w-7xl { max-width: 100% !important; }
        
        /* Visual & Mechanical table widths for readability */
        table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
        table.visual-mechanical-table thead { display: table-header-group !important; }
        table.visual-mechanical-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        table.visual-mechanical-table th, table.visual-mechanical-table td { font-size: 8px !important; padding: 2px 3px !important; vertical-align: middle !important; }
        table.visual-mechanical-table colgroup col:nth-child(1) { width: 12% !important; }
        table.visual-mechanical-table colgroup col:nth-child(2) { width: 58% !important; }
        table.visual-mechanical-table colgroup col:nth-child(3) { width: 15% !important; }
        table.visual-mechanical-table colgroup col:nth-child(4) { width: 15% !important; }
        table.visual-mechanical-table td:nth-child(2) { white-space: normal !important; word-break: break-word !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Load job information
  useEffect(() => {
    const loadJobInfo = async () => {
      if (!jobId || currentReportId) return; // Skip if editing existing report
      
      try {
        setLoading(true);
        
        // Fetch job data
        const { data: jobData, error: jobError } = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select(`title, job_number, customer_id, site_address`)
          .eq('id', jobId)
          .single();

        if (jobError) throw jobError;

        // Fetch customer data if job has customer_id
        if (jobData?.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select(`name, company_name, address`)
            .eq('id', jobData.customer_id)
            .single();
            
          if (!customerError && customerData) {
            setFormData(prev => ({
              ...prev,
              customer: maskCustomerName(customerData.company_name || customerData.name || ''),
              address: maskCustomerAddress(customerData.address || ''),
              jobNumber: jobData.job_number || '',
              user: user?.email || ''
            }));
          }
        }
      } catch (error) {
        console.error('Error loading job info:', error);
        setError(`Failed to load job info: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    loadJobInfo();
  }, [jobId, currentReportId, user?.email]);

  // Load existing report data
  useEffect(() => {
      const loadExistingReport = async () => {
    if (!currentReportId) {
      setLoading(false);
      setIsEditMode(true); // New reports start in edit mode
      return;
    }

      // Don't reload if we just created the report via autosave
      if (isAutoSaveCreatedRef.current) {
        isAutoSaveCreatedRef.current = false;
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('potential_transformer_ats_reports')
          .select('*')
          .eq('id', currentReportId)
          .single();
        
        if (error) throw error;
        
        if (data) {
          // Populate form data from database
          setFormData(prev => ({
            ...prev,
            ...data.report_info,
            deviceData: data.device_data,
            visualInspection: data.visual_inspection,
            fuseData: data.fuse_data,
            fuseResistance: data.fuse_resistance,
            insulationResistance: data.insulation_resistance,
            insulationCorrected: data.insulation_corrected,
            turnsRatio: data.turns_ratio,
            equipment: data.equipment_used,
            comments: data.comments
          }));
          
          if (data.status) {
            setStatus(data.status);
          }
          
          setIsEditMode(false); // Start in view mode for existing reports
        }
      } catch (error) {
        console.error('Error loading existing report:', error);
        setError(`Failed to load report: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    loadExistingReport();
  }, [currentReportId]);

  // Print styles
  useEffect(() => {
    const styleId = 'potential-transformer-print-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @media print {
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        * { color: black !important; }
        
        /* Form elements – render as plain text in print (no boxes/underlines) */
        input, select, textarea { 
          background-color: transparent !important; 
          border: none !important; 
          color: black !important;
          padding: 0 !important; 
          font-size: 10px !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          background-image: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          outline: none !important;
        }
        
        /* Strengthen input styling inside table cells */
        table input, table select, table textarea {
          border: none !important;
          background: transparent !important;
          padding: 1px !important;
          margin: 0 !important;
          width: 100% !important;
          font-size: 9px !important;
        }
        
        /* Aggressively remove any remaining input chrome inside electrical sections */
        .section-electrical-tests input, .section-electrical-tests select, .section-electrical-tests textarea,
        .section-test-equipment input, .section-test-equipment select, .section-test-equipment textarea,
        .ir-table input, .ir-table select, .ir-table textarea,
        .ir-corrected-table input, .ir-corrected-table select, .ir-corrected-table textarea,
        .contact-resistance-table input, .contact-resistance-table select, .contact-resistance-table textarea,
        .turns-ratio-table input, .turns-ratio-table select, .turns-ratio-table textarea {
          border: 0 !important;
          border-color: transparent !important;
          background: transparent !important;
          box-shadow: none !important;
          outline: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        
        /* Hide dropdown arrows and form control indicators */
        select {
          background-image: none !important;
          padding-right: 4px !important;
        }
        select::-ms-expand { display: none !important; }
        
        /* Hide spin buttons on number inputs */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none !important;
          margin: 0 !important;
        }
        input[type="number"] {
          -moz-appearance: textfield !important;
        }
        
        /* Table styling */
        table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
        th, td { border: 1px solid black !important; padding: 4px !important; }
        th { background-color: #f0f0f0 !important; font-weight: bold !important; text-align: center; }
        
        /* Hide interactive elements */
        button:not(.print-visible) { display: none !important; }
        
        /* Print header */
        .print\\:flex.hidden { display: flex !important; }
        
        /* Page break management */
        .max-w-7xl { page-break-inside: auto !important; }
        .mb-6 { page-break-inside: auto !important; }
        table { page-break-inside: auto !important; }
        tr { page-break-inside: auto !important; }
        .space-y-6 { page-break-inside: auto !important; }
        .comments-section { page-break-inside: auto !important; }
        div, section, article { page-break-inside: auto !important; break-inside: auto !important; }
        
        /* Remove any height restrictions */
        html { height: auto !important; }
        body { min-height: auto !important; }
        * { max-height: none !important; orphans: 1 !important; widows: 1 !important; }
        
        /* Ensure the main container doesn't limit height */
        #report-container { height: auto !important; min-height: auto !important; max-height: none !important; }
        
        /* Ensure sections are visible */
        .section-device-data, .section-visual-inspection, .section-fuse-data, 
        .section-electrical-tests, .section-test-equipment, .section-comments { 
          display: block !important; visibility: visible !important; 
        }
        
        /* Make sure these sections don't get hidden */
        h2.section-device-data, h2.section-visual-inspection, h2.section-fuse-data,
        h2.section-electrical-tests, h2.section-test-equipment, h2.section-comments { 
          display: block !important; 
        }
        
        /* Nuclear option: strip any inner element borders inside table cells */
        td *, th * {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          outline: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }

        /* Ensure textarea in comments shows properly */
        textarea { display: block !important; width: 100% !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDeviceDataChange = (field: keyof DeviceData, value: string) => {
    setFormData(prev => ({
      ...prev,
      deviceData: {
        ...prev.deviceData,
        [field]: value
      }
    }));
  };

  const handleInspectionChange = (itemId: string, value: ResultOption) => {
    setFormData(prev => ({
      ...prev,
      visualInspection: {
        ...prev.visualInspection,
        [itemId]: value
      }
    }));
  };

  const handleFuseDataChange = (field: keyof FuseData, value: string) => {
    setFormData(prev => ({
      ...prev,
      fuseData: {
        ...prev.fuseData,
        [field]: value
      }
    }));
  };

  const handleFuseResistanceChange = (field: keyof FuseResistanceRow, value: string) => {
    setFormData(prev => ({
      ...prev,
      fuseResistance: {
        ...prev.fuseResistance,
        [field]: value
      }
    }));
  };

  const handleInsulationChange = (index: number, field: keyof InsulationRow, value: string) => {
    setFormData(prev => {
      const rows = Array.isArray(prev.insulationResistance?.rows) ? prev.insulationResistance.rows : [];
      return {
        ...prev,
        insulationResistance: {
          ...prev.insulationResistance,
          rows: rows.map((row, i) => 
            i === index ? { ...row, [field]: value } : row
          )
        }
      };
    });
  };

  const handleInsulationCorrectedChange = (index: number, field: keyof InsulationCorrectedRow, value: string) => {
    setFormData(prev => {
      const rows = Array.isArray(prev.insulationCorrected?.rows) ? prev.insulationCorrected.rows : [];
      return {
        ...prev,
        insulationCorrected: {
          ...prev.insulationCorrected,
          rows: rows.map((row, i) => 
            i === index ? { ...row, [field]: value } : row
          )
        }
      };
    });
  };

  const calculateDeviation = (calculatedRatio: string, measuredH1H2: string): string => {
    if (!calculatedRatio || !measuredH1H2 || calculatedRatio.trim() === '' || measuredH1H2.trim() === '') {
      return '';
    }
    
    const calculated = parseFloat(calculatedRatio);
    const measured = parseFloat(measuredH1H2);
    
    if (isNaN(calculated) || isNaN(measured) || calculated === 0) {
      return '';
    }
    
    const deviation = ((calculated - measured) / calculated) * 100;
    return deviation.toFixed(2);
  };

  const calculatePassFail = (percentDev: string): string => {
    if (!percentDev || percentDev.trim() === '') {
      return '';
    }
    
    const deviation = parseFloat(percentDev);
    if (isNaN(deviation)) {
      return '';
    }
    
    return (deviation < 1.2 && deviation > -1.2) ? 'Pass' : 'Fail';
  };

  const handleTurnsRatioChange = (index: number, field: keyof TurnsRatioRow, value: string) => {
    setFormData(prev => {
      const rows = Array.isArray(prev.turnsRatio?.rows) ? prev.turnsRatio.rows : [];
      const updatedRows = rows.map((row, i) => {
        if (i === index) {
          const updatedRow = { ...row, [field]: value };
          
          // Auto-calculate deviation and pass/fail when calculated ratio or measured values change
          if (field === 'calculatedRatio' || field === 'measuredH1H2') {
            const deviation = calculateDeviation(updatedRow.calculatedRatio, updatedRow.measuredH1H2);
            updatedRow.percentDev = deviation;
            updatedRow.passFail = calculatePassFail(deviation);
          }
          
          return updatedRow;
        }
        return row;
      });
      
      return {
        ...prev,
        turnsRatio: {
          ...prev.turnsRatio,
          rows: updatedRows
        }
      };
    });
  };

  const handleEquipmentChange = (equipment: keyof typeof formData.equipment, field: keyof EquipmentInfo, value: string) => {
    setFormData(prev => ({
      ...prev,
      equipment: {
        ...prev.equipment,
        [equipment]: {
          ...prev.equipment[equipment],
          [field]: value
        }
      }
    }));
  };

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      status,
      report_info: {
        customer: maskCustomerName(formData.customer),
        address: maskCustomerAddress(formData.address),
        user: formData.user,
        date: formData.date,
        jobNumber: formData.jobNumber,
        technicians: formData.technicians,
        temperature: formData.temperature,
        humidity: formData.humidity,
        identifier: formData.identifier,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation
      },
      device_data: formData.deviceData,
      visual_inspection: formData.visualInspection,
      fuse_data: formData.fuseData,
      fuse_resistance: formData.fuseResistance,
      insulation_resistance: formData.insulationResistance,
      insulation_corrected: formData.insulationCorrected,
      turns_ratio: formData.turnsRatio,
      equipment_used: formData.equipment,
      comments: formData.comments
    };

    try {
      setIsAutoSaving(true);

      if (reportIdRef.current) {
        await supabase
          .schema('neta_ops')
          .from('potential_transformer_ats_reports')
          .update(payload)
          .eq('id', reportIdRef.current);
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const result = await supabase
            .schema('neta_ops')
            .from('potential_transformer_ats_reports')
            .insert(payload)
            .select()
            .single();

          if (result.data) {
            const newReportId = result.data.id;
            reportIdRef.current = newReportId;

            const assetData = {
              name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || formData.location || ''),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${newReportId}`,
              user_id: user.id
            };

            const { data: assetResult } = await supabase
              .schema('neta_ops')
              .from('assets')
              .insert(assetData)
              .select()
              .single();

            if (assetResult) {
              await supabase.schema('neta_ops').from('job_assets').insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });
            }

            setCurrentReportId(newReportId);
            isAutoSaveCreatedRef.current = true;
            window.history.replaceState({}, '', `/jobs/${jobId}/${reportSlug}/${newReportId}`);
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    } finally {
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [jobId, user?.id, formData, status]);

  // Auto-save effect with debounce (placed after autoSave function definition)
  useEffect(() => {
    if (!isEditMode || loading) return;
    
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 500); // 500ms debounce

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, status, isEditMode, loading, autoSave]);

  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditMode) return;

    try {
      const reportPayload = {
        job_id: jobId,
        user_id: user.id,
        status,
        report_info: {
          customer: formData.customer,
          address: formData.address,
          user: formData.user,
          date: formData.date,
          jobNumber: formData.jobNumber,
          technicians: formData.technicians,
          temperature: formData.temperature,
          humidity: formData.humidity,
          identifier: formData.identifier,
          substation: formData.substation,
          eqptLocation: formData.eqptLocation
        },
        device_data: formData.deviceData,
        visual_inspection: formData.visualInspection,
        fuse_data: formData.fuseData,
        fuse_resistance: formData.fuseResistance,
        insulation_resistance: formData.insulationResistance,
        insulation_corrected: formData.insulationCorrected,
        turns_ratio: formData.turnsRatio,
        equipment_used: formData.equipment,
        comments: formData.comments
      };

      let result;
      if (reportIdRef.current) {
        result = await supabase
          .schema('neta_ops')
          .from('potential_transformer_ats_reports')
          .update(reportPayload)
          .eq('id', reportIdRef.current)
          .select()
          .single();
      } else if (creatingRef.current) {
        const deadline = Date.now() + 5000;
        while (creatingRef.current && !reportIdRef.current && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (reportIdRef.current) {
          result = await supabase
            .schema('neta_ops')
            .from('potential_transformer_ats_reports')
            .update(reportPayload)
            .eq('id', reportIdRef.current)
            .select()
            .single();
        } else {
          throw new Error('Report creation is still in progress. Please try again.');
        }
      } else {
        creatingRef.current = true;
        try {
          result = await supabase
            .schema('neta_ops')
            .from('potential_transformer_ats_reports')
            .insert(reportPayload)
            .select()
            .single();

          if (result.data) {
            reportIdRef.current = result.data.id;
            setCurrentReportId(result.data.id);

            const assetData = {
              name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || formData.location || ''),
              file_url: `report:/jobs/${jobId}/${reportSlug}/${result.data.id}`,
              user_id: user.id,
            };
            const { data: assetResult, error: assetError } = await supabase
              .schema('neta_ops')
              .from('assets')
              .insert(assetData)
              .select('id')
              .single();

            if (assetError) throw assetError;

            await supabase
              .schema('neta_ops')
              .from('job_assets')
              .insert({
                job_id: jobId,
                asset_id: assetResult.id,
                user_id: user.id,
              });
          } else {
            creatingRef.current = false;
          }
        } catch (saveError) {
          creatingRef.current = false;
          throw saveError;
        }
      }

      if (result?.error) throw result.error;

      setIsEditMode(false); // Exit editing mode
      // Report saved silently
      navigate(`/jobs/${jobId}`);
    } catch (error: any) {
      console.error('Error saving report:', error);
      alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 flex justify-center" id="report-container">
      <div className="max-w-7xl w-full space-y-6">
        {/* Print-only Header */}
        <div className="hidden print:flex justify-between items-center mb-6 pb-4 border-b-2 border-black">
          <img 
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" 
            alt="AMP Logo" 
            className="h-12"
          />
          <div className="text-center">
            <h1 className="text-xl font-bold">Potential Transformer ATS</h1>
          </div>
          <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c', width: '120px' }}>
            ATS 7.5.4
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
                  border: status === 'PASS' ? '2px solid #16a34a' : '2px solid #dc2626',
                  backgroundColor: status === 'PASS' ? '#22c55e' : '#ef4444',
                  color: 'white',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                  boxSizing: 'border-box',
                  minWidth: '50px',
                }}
              >
                {status}
              </div>
            </div>
          </div>
        </div>

        {/* Header with title and buttons - hidden in print */}
        <div className="flex justify-between items-center mb-6 print:hidden">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Potential Transformer ATS
          </h1>
          <div className="flex gap-2 items-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              ✓ Auto Saving Enabled
            </span>
            {/* Status Button - Always visible, only interactive in edit mode */}
            <button
              onClick={() => {
                if (isEditMode) { // Only allow status change if editing
                  setStatus(status === 'PASS' ? 'FAIL' : 'PASS');
                }
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                status === 'PASS'
                  ? 'bg-green-600 text-white focus:ring-green-500'
                  : 'bg-red-600 text-white focus:ring-red-500'
              } ${!isEditMode ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
            >
              {status === 'PASS' ? 'PASS' : 'FAIL'}
            </button>
            {/* Conditional Edit/Save Buttons */}
            {currentReportId && !isEditMode ? (
              <>
                <button
                  onClick={() => setIsEditMode(true)}
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
                disabled={!isEditMode}
                className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditMode ? 'hidden' : 'hover:bg-orange-700'}`}
              >
                Save Report
              </button>
            )}
          </div>
        </div>

        {/* Job Information */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Job Information</h2>
          
          {/* On-screen form - hidden in print */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden job-info-onscreen">
            <div className="space-y-4">
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Customer:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.customer} onChange={(e) => handleChange('customer', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Address:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={maskCustomerAddress(formData.address)} onChange={(e) => handleChange('address', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">User:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.user} onChange={(e) => handleChange('user', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Date:</label>
                <input className={`form-input w-40 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.date} onChange={(e) => handleChange('date', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Identifier:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.identifier} onChange={(e) => handleChange('identifier', e.target.value)} readOnly={!isEditMode} />
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Job #:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.jobNumber} onChange={(e) => handleChange('jobNumber', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Technicians:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.technicians} onChange={(e) => handleChange('technicians', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Substation:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.substation} onChange={(e) => handleChange('substation', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Eqpt. Location:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.eqptLocation} onChange={(e) => handleChange('eqptLocation', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Temp:</label>
                <input type="number" className={`form-input w-20 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={temperatureValue} onChange={(e) => handleChange('temperature', Number(e.target.value))} readOnly={!isEditMode} />
                <span className="mx-2">°F</span>
                <span className="mx-2">{celsiusTemperature}</span>
                <span>°C</span>
                <span className="mx-5">TCF</span>
                <span>{tcf}</span>
              </div>
            </div>
          </div>

          {/* Print-only Job Information table */}
          <div className="hidden print:block">
            <table className="w-full border-collapse border border-black">
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Customer:</div>
                    <div className="mt-1">{formData.customer}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Job #:</div>
                    <div className="mt-1">{formData.jobNumber}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Date:</div>
                    <div className="mt-1">{formData.date}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Technicians:</div>
                    <div className="mt-1">{formData.technicians}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">User:</div>
                    <div className="mt-1">{formData.user}</div>
                  </td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Address:</div>
                    <div className="mt-1">{maskCustomerAddress(formData.address)}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Substation:</div>
                    <div className="mt-1">{formData.substation}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Eqpt. Location:</div>
                    <div className="mt-1">{formData.eqptLocation}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Identifier:</div>
                    <div className="mt-1">{formData.identifier}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Temp/TCF:</div>
                    <div className="mt-1">{temperatureValue}°F / {tcf}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Device Data */}
        <div className="mb-6">
          <h2 className="section-device-data text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Device Data</h2>
          
          {/* On-screen form - hidden in print */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden nameplate-onscreen">
            <div className="space-y-4">
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Manufacturer:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.deviceData.manufacturer} onChange={(e) => handleDeviceDataChange('manufacturer', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Catalog No:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.deviceData.catalogNo} onChange={(e) => handleDeviceDataChange('catalogNo', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Serial Number:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.deviceData.serialNumber} onChange={(e) => handleDeviceDataChange('serialNumber', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Accuracy Class:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.deviceData.accuracyClass} onChange={(e) => handleDeviceDataChange('accuracyClass', e.target.value)} readOnly={!isEditMode} />
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center">
                <label className="form-label inline-block w-40">Manufactured Year:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.deviceData.manufacturedYear} onChange={(e) => handleDeviceDataChange('manufacturedYear', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-40">Voltage Rating:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.deviceData.voltageRating} onChange={(e) => handleDeviceDataChange('voltageRating', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-40">Insulation Class:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.deviceData.insulationClass} onChange={(e) => handleDeviceDataChange('insulationClass', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-40">Frequency:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.deviceData.frequency} onChange={(e) => handleDeviceDataChange('frequency', e.target.value)} readOnly={!isEditMode} />
              </div>
            </div>
          </div>

          {/* Print-only Device Data table */}
          <div className="hidden print:block">
            <table className="w-full border-collapse border border-black">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Manufacturer:</div>
                    <div className="mt-1">{formData.deviceData.manufacturer}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Catalog No:</div>
                    <div className="mt-1">{formData.deviceData.catalogNo}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Serial Number:</div>
                    <div className="mt-1">{formData.deviceData.serialNumber}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Accuracy Class:</div>
                    <div className="mt-1">{formData.deviceData.accuracyClass}</div>
                  </td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Manufactured Year:</div>
                    <div className="mt-1">{formData.deviceData.manufacturedYear}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Voltage Rating:</div>
                    <div className="mt-1">{formData.deviceData.voltageRating}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Insulation Class:</div>
                    <div className="mt-1">{formData.deviceData.insulationClass}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Frequency:</div>
                    <div className="mt-1">{formData.deviceData.frequency}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Visual and Mechanical Inspection */}
        <div className="mb-6">
          <h2 className="section-visual-inspection text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Visual and Mechanical Inspection</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 dark:border-gray-700 print:border-black visual-mechanical-table table-fixed">
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '58%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">NETA Section</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Description</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Results</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Comments</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                {INSPECTION_ITEMS.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                    <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.id}</td>
                    <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 text-sm text-gray-900 dark:text-white whitespace-normal break-words">{item.description}</td>
                    <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 whitespace-nowrap">
                      <div className="print:hidden">
                        <select 
                          value={formData.visualInspection[item.id]} 
                          onChange={(e) => handleInspectionChange(item.id, e.target.value as ResultOption)} 
                          disabled={!isEditMode} 
                          className={`block w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                        >
                          {RESULT_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div className="hidden print:block text-center">{formData.visualInspection[item.id] || ''}</div>
                    </td>
                    <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                      <div className="print:hidden">
                        <input 
                          type="text"
                          value={formData.visualInspection[`${item.id}_comments`] || ''} 
                          onChange={(e) => handleInspectionChange(`${item.id}_comments`, e.target.value as any)} 
                          readOnly={!isEditMode} 
                          className={`block w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                        />
                      </div>
                      <div className="hidden print:block">{formData.visualInspection[`${item.id}_comments`] || ''}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Fuse Data */}
        <div className="mb-6">
          <h2 className="section-fuse-data text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Fuse Data</h2>
          
          {/* On-screen form - hidden in print */}
          <div className="fuse-data-onscreen grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
            <div className="space-y-4">
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Manufacturer:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.fuseData.manufacturer} onChange={(e) => handleFuseDataChange('manufacturer', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Catalog No:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.fuseData.catalogNo} onChange={(e) => handleFuseDataChange('catalogNo', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-32">Class:</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.fuseData.class} onChange={(e) => handleFuseDataChange('class', e.target.value)} readOnly={!isEditMode} />
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center">
                <label className="form-label inline-block w-40">Voltage Rating (kV):</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.fuseData.voltageRating} onChange={(e) => handleFuseDataChange('voltageRating', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-40">Ampacity (A):</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.fuseData.ampacity} onChange={(e) => handleFuseDataChange('ampacity', e.target.value)} readOnly={!isEditMode} />
              </div>
              <div className="flex items-center">
                <label className="form-label inline-block w-40">I.C. Rating (kA):</label>
                <input className={`form-input flex-1 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.fuseData.icRating} onChange={(e) => handleFuseDataChange('icRating', e.target.value)} readOnly={!isEditMode} />
              </div>
            </div>
          </div>

          {/* Print-only Fuse Data table */}
          <div className="hidden print:block">
            <table className="w-full border-collapse border border-black">
              <colgroup>
                <col style={{ width: '33.33%' }} />
                <col style={{ width: '33.33%' }} />
                <col style={{ width: '33.33%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Manufacturer:</div>
                    <div className="mt-1">{formData.fuseData.manufacturer}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Catalog No:</div>
                    <div className="mt-1">{formData.fuseData.catalogNo}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Class:</div>
                    <div className="mt-1">{formData.fuseData.class}</div>
                  </td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Voltage Rating (kV):</div>
                    <div className="mt-1">{formData.fuseData.voltageRating}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">Ampacity (A):</div>
                    <div className="mt-1">{formData.fuseData.ampacity}</div>
                  </td>
                  <td className="border border-black px-2 py-1 align-top">
                    <div className="font-semibold">I.C. Rating (kA):</div>
                    <div className="mt-1">{formData.fuseData.icRating}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Electrical Tests */}
        <div className="mb-6">
          <h2 className="section-electrical-tests text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests</h2>
          
          {/* Fuse Resistance */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-white"></h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-700 print:border-black">
                <thead>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider"></th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">As Found</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">As Left</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Units</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                      <span className="text-gray-900 dark:text-white font-medium">Fuse Resistance</span>
                    </td>
                    <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                      <input 
                        className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                        value={formData.fuseResistance.asFound} 
                        onChange={(e) => handleFuseResistanceChange('asFound', e.target.value)} 
                        readOnly={!isEditMode} 
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                      <input 
                        className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                        value={formData.fuseResistance.asLeft} 
                        onChange={(e) => handleFuseResistanceChange('asLeft', e.target.value)} 
                        readOnly={!isEditMode} 
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                      <select 
                        value={formData.fuseResistance.units} 
                        onChange={(e) => handleFuseResistanceChange('units', e.target.value)} 
                        disabled={!isEditMode} 
                        className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      >
                        {CONTACT_RESISTANCE_UNITS.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Insulation Resistance & Ratio */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-white">Insulation Resistance & Ratio</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-700 print:border-black">
                <thead>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Winding Tested</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Test Voltage</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Results</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(formData.insulationResistance?.rows) ? formData.insulationResistance.rows : []).map((row, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                          value={row.windingTested} 
                          onChange={(e) => handleInsulationChange(index, 'windingTested', e.target.value)} 
                          readOnly={!isEditMode} 
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <select 
                          value={row.testVoltage} 
                          onChange={(e) => handleInsulationChange(index, 'testVoltage', e.target.value)} 
                          disabled={!isEditMode} 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                        >
                          {INSULATION_RESISTANCE_TEST_VOLTAGES.map(voltage => (
                            <option key={voltage} value={voltage}>{voltage}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                          value={row.results} 
                          onChange={(e) => handleInsulationChange(index, 'results', e.target.value)} 
                          readOnly={!isEditMode} 
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <select 
                          value={row.units} 
                          onChange={(e) => handleInsulationChange(index, 'units', e.target.value)} 
                          disabled={!isEditMode} 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                        >
                          {INSULATION_RESISTANCE_UNITS.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Temperature Corrected Insulation Resistance */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-white">Temperature Corrected Insulation Resistance</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-700 print:border-black">
                <thead>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Winding Tested</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Test Voltage</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Results</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(formData.insulationCorrected?.rows) ? formData.insulationCorrected.rows : []).map((row, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                          value={row.windingTested} 
                          onChange={(e) => handleInsulationCorrectedChange(index, 'windingTested', e.target.value)} 
                          readOnly={!isEditMode} 
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <select 
                          value={row.testVoltage} 
                          onChange={(e) => handleInsulationCorrectedChange(index, 'testVoltage', e.target.value)} 
                          disabled={!isEditMode} 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                        >
                          {INSULATION_RESISTANCE_TEST_VOLTAGES.map(voltage => (
                            <option key={voltage} value={voltage}>{voltage}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-150 cursor-not-allowed`}
                          value={row.results} 
                          readOnly
                          title="Auto-calculated from measured values and TCF"
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <select 
                          value={row.units} 
                          onChange={(e) => handleInsulationCorrectedChange(index, 'units', e.target.value)} 
                          disabled={!isEditMode} 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                        >
                          {INSULATION_RESISTANCE_UNITS.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Turns Ratio Test */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-white">Turns Ratio Test</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-700 print:border-black">
                <thead>
                  <tr>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Tap</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Primary Voltage</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Calculate d Ratio</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Measured H1-H2</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">% Dev.</th>
                    <th className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 text-center text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Pass/ Fail</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(formData.turnsRatio?.rows) ? formData.turnsRatio.rows : []).map((row, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                          value={row.tap} 
                          onChange={(e) => handleTurnsRatioChange(index, 'tap', e.target.value)} 
                          readOnly={!isEditMode} 
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                          value={row.primaryVoltage} 
                          onChange={(e) => handleTurnsRatioChange(index, 'primaryVoltage', e.target.value)} 
                          readOnly={!isEditMode} 
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                          value={row.calculatedRatio} 
                          onChange={(e) => handleTurnsRatioChange(index, 'calculatedRatio', e.target.value)} 
                          readOnly={!isEditMode} 
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                          value={row.measuredH1H2} 
                          onChange={(e) => handleTurnsRatioChange(index, 'measuredH1H2', e.target.value)} 
                          readOnly={!isEditMode} 
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-150 cursor-not-allowed`}
                          value={row.percentDev} 
                          readOnly
                          title="Auto-calculated: ((Calculated Ratio - Measured H1-H2) / Calculated Ratio) * 100"
                        />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-700 print:border-black px-3 py-2">
                        <input 
                          className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-150 cursor-not-allowed ${row.passFail === 'Pass' ? 'text-green-600 dark:text-green-400' : row.passFail === 'Fail' ? 'text-red-600 dark:text-red-400' : ''}`}
                          value={row.passFail} 
                          readOnly
                          title="Auto-calculated: Pass if deviation is between -1.2% and +1.2%, otherwise Fail"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center">
              <span className="text-sm text-gray-700 dark:text-white mr-4">Secondary Voltage at as-found tap:</span>
              <input 
                className={`form-input w-24 ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                value={formData.turnsRatio.secondaryVoltage} 
                onChange={(e) => setFormData(prev => ({ ...prev, turnsRatio: { ...prev.turnsRatio, secondaryVoltage: e.target.value } }))} 
                readOnly={!isEditMode} 
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-white">V</span>
            </div>
          </div>
        </div>

        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Test Equipment Used */}
        <div className="mb-6">
          <h2 className="section-test-equipment text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Test Equipment Used</h2>
          
          {/* Test Equipment table - visible on screen and print */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 dark:border-gray-700 print:border-black">
              <thead>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">Equipment</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">Model</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">Serial Number</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">AMP ID</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">Cal Date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 font-semibold text-gray-900 dark:text-white">Megohmmeter</td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <EquipmentAutocomplete
                      value={formData.equipment?.megohmmeter?.model || ''}
                      onChange={(value) => handleEquipmentChange('megohmmeter', 'model', value)}
                      onSelect={(equipment) => {
                        const formatDate = (dateString: string | null): string => {
                          if (!dateString) return '';
                          try {
                            const date = new Date(dateString);
                            return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                          } catch {
                            return dateString;
                          }
                        };
                        handleEquipmentChange('megohmmeter', 'model', equipment.equipment_name);
                        handleEquipmentChange('megohmmeter', 'serial', equipment.serial_number || '');
                        handleEquipmentChange('megohmmeter', 'ampId', equipment.amp_id || '');
                        handleEquipmentChange('megohmmeter', 'calDate', formatLocalDateShort(equipment.calibration_date));
                      }}
                      readOnly={!isEditMode}
                      className="w-full border-0 bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment?.megohmmeter?.serial || ''} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('megohmmeter', 'serial', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment?.megohmmeter?.ampId || ''} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('megohmmeter', 'ampId', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment?.megohmmeter?.calDate || ''} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('megohmmeter', 'calDate', e.target.value)} 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 font-semibold text-gray-900 dark:text-white">Low-Resistance Ohmmeter</td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <EquipmentAutocomplete
                      value={formData.equipment?.lowResOhmmeter?.model || ''}
                      onChange={(value) => handleEquipmentChange('lowResOhmmeter', 'model', value)}
                      onSelect={(equipment) => {
                        const formatDate = (dateString: string | null): string => {
                          if (!dateString) return '';
                          try {
                            const date = new Date(dateString);
                            return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                          } catch {
                            return dateString;
                          }
                        };
                        handleEquipmentChange('lowResOhmmeter', 'model', equipment.equipment_name);
                        handleEquipmentChange('lowResOhmmeter', 'serial', equipment.serial_number || '');
                        handleEquipmentChange('lowResOhmmeter', 'ampId', equipment.amp_id || '');
                        handleEquipmentChange('lowResOhmmeter', 'calDate', formatLocalDateShort(equipment.calibration_date));
                      }}
                      readOnly={!isEditMode}
                      className="w-full border-0 bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment?.lowResOhmmeter?.serial || ''} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('lowResOhmmeter', 'serial', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment?.lowResOhmmeter?.ampId || ''} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('lowResOhmmeter', 'ampId', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment?.lowResOhmmeter?.calDate || ''} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('lowResOhmmeter', 'calDate', e.target.value)} 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 font-semibold text-gray-900 dark:text-white">TTR Test Set</td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <EquipmentAutocomplete
                      value={formData.equipment?.ttrTestSet?.model || ''}
                      onChange={(value) => handleEquipmentChange('ttrTestSet', 'model', value)}
                      onSelect={(equipment) => {
                        const formatDate = (dateString: string | null): string => {
                          if (!dateString) return '';
                          try {
                            const date = new Date(dateString);
                            return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                          } catch {
                            return dateString;
                          }
                        };
                        handleEquipmentChange('ttrTestSet', 'model', equipment.equipment_name);
                        handleEquipmentChange('ttrTestSet', 'serial', equipment.serial_number || '');
                        handleEquipmentChange('ttrTestSet', 'ampId', equipment.amp_id || '');
                        handleEquipmentChange('ttrTestSet', 'calDate', formatLocalDateShort(equipment.calibration_date));
                      }}
                      readOnly={!isEditMode}
                      className="w-full border-0 bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment?.ttrTestSet?.serial || ''} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('ttrTestSet', 'serial', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment?.ttrTestSet?.ampId || ''} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('ttrTestSet', 'ampId', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment?.ttrTestSet?.calDate || ''} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('ttrTestSet', 'calDate', e.target.value)} 
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Comments */}
        <div className={`mb-6 print:mb-2 print:break-inside-avoid ${!formData.comments?.trim() ? 'print:hidden' : ''}`}>
          <h2 className="section-comments text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Comments</h2>
          <textarea rows={10} className={`w-full form-textarea resize-vertical min-h-[250px] print:hidden ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.comments} onChange={(e) => handleChange('comments', e.target.value)} readOnly={!isEditMode} />

          {formData.comments?.trim() && (
          <div className="hidden print:block">
            <table className="w-full border-collapse border border-black">
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-2 align-top">
                    <div className="font-semibold mb-1">Comments:</div>
                    <div className="whitespace-pre-wrap">{formData.comments}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PotentialTransformerATSReport;
