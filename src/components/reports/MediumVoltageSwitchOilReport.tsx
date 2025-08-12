import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';

// Types for form data and measurements
interface InsulationResistance {
  // Corresponds to the columns in the image: A-G, B-G, C-G, A-B, B-C, C-A and Line A, Line B, Line C
  ag: string | number;
  bg: string | number;
  cg: string | number;
  ab: string | number;
  bc: string | number;
  ca: string | number;
  lineA: string | number;
  lineB: string | number;
  lineC: string | number;
  units: string;
  testVoltage: string;
}

interface CorrectedInsulationResistance extends Omit<InsulationResistance, 'tcf' | 'correctedGround' | 'correctedOther'> { 
  // similar structure, but values are corrected
  // removing tcf, correctedGround, correctedOther from original type as they are not per-phase
}

interface ContactResistance {
  // Corresponds to A-Phase, A-G, B-Phase, B-G, C-Phase, C-G
  aPhase: string | number;
  aGround: string | number;
  bPhase: string | number;
  bGround: string | number;
  cPhase: string | number;
  cGround: string | number;
  units: string;
}

interface DielectricTest {
  // Top part: Way Section (e.g., S1-S2), Test Voltage, A-G, B-G, C-G, Units
  waySection: string; // e.g., S1-S2, S1-T1 etc.
  testVoltageApplied: string;
  ag: string | number; // leakage current or PASS/FAIL
  bg: string | number;
  cg: string | number;
  units: string; // units for leakage or result
  duration: number; // Time in seconds, from original type
  result: 'PASS' | 'FAIL' | 'N/A'; // Overall result for this way section test
}

interface VFIData {
  manufacturer: string;
  catalogNo: string; // Changed from serialNumber to catalogNo to match image
  type: string; // Added type to match image
  ratedVoltage: string; // Renamed from ratingVoltage
  ratedCurrent: string; // Renamed from ratingCurrent
  aicRating: string; // Added AIC Rating to match image
  // bIL is present in the Nameplate section, not VFI in the first image.
  // serialNumber is part of the VFI specific dielectric test in the second image.
}

// VFI data specific to dielectric test (from second image)
interface DielectricVFITestData {
  vfiIdentifier: string;
  serialNumber: string;
  counterAsFound: string | number;
  counterAsLeft: string | number;
  vacuumIntegrityA: string;
  vacuumIntegrityB: string;
  resultC: string;
  unitsC: 'mA' | 'µA';
}

interface FormData {
  // Job Information
  customer: string;
  address: string;
  technicians: string;
  date: string;
  jobNumber: string;
  identifier: string;
  substation: string;
  eqptLocation: string;

  // Nameplate Data (Matching image)
  nameplate_manufacturer: string;
  nameplate_catalogNo: string;
  nameplate_serialNumber: string;
  nameplate_dateOfMfg: string;
  nameplate_type: string;
  nameplate_systemVoltage: string;
  nameplate_ratedVoltage: string;
  nameplate_ratedCurrent: string;
  nameplate_aicRating: string;
  nameplate_impulseLevelBIL: string;
  // oilType and oilVolume were from the old structure, not in the image for nameplate

  // VFI Data (single section as per first image)
  vfiData: VFIData;

  // Environmental Data
  temperature: number;
  humidity: number;

  // Visual and Mechanical Inspection Results
  visualInspectionResults: {
    netaSection: string;
    description: string;
    result: string; // Will use 'Select One', 'Satisfactory', etc.
    // notes field was in old structure, not explicitly in image table but good to keep per item if needed implicitly by 'See Comments'
  }[];

  // Measurements per Way Section (S1, S2, T1, T2, T3)
  s1_insulationResistance: InsulationResistance;
  s2_insulationResistance: InsulationResistance;
  t1_insulationResistance: InsulationResistance;
  t2_insulationResistance: InsulationResistance;
  t3_insulationResistance: InsulationResistance;

  s1_correctedInsulationResistance: CorrectedInsulationResistance;
  s2_correctedInsulationResistance: CorrectedInsulationResistance;
  t1_correctedInsulationResistance: CorrectedInsulationResistance;
  t2_correctedInsulationResistance: CorrectedInsulationResistance;
  t3_correctedInsulationResistance: CorrectedInsulationResistance;

  s1_contactResistance: ContactResistance;
  s2_contactResistance: ContactResistance;
  t1_contactResistance: ContactResistance;
  t2_contactResistance: ContactResistance;
  t3_contactResistance: ContactResistance;

  // Dielectric Withstand Tests - Array for multiple way section tests (S1-S2, S1-T1 etc.)
  dielectricWaySectionTests: DielectricTest[];
  // Dielectric Withstand - VFI specific tests (bottom table in image)
  dielectricVFITests: DielectricVFITestData[];

  // Test Equipment
  testEquipment_megohmmeter_megger: string;
  testEquipment_megohmmeter_serialNo: string;
  testEquipment_megohmmeter_ampId: string;
  testEquipment_lowResistance_model: string; // Image says 'Low Resistance', not microhmmeter model
  testEquipment_lowResistance_serialNo: string;
  testEquipment_lowResistance_ampId: string;
  testEquipment_hipot_model: string; // Image says 'Hipot'
  testEquipment_hipot_serialNo: string;
  testEquipment_hipot_ampId: string;

  comments: string;
}

// Constants for dropdowns and options
const VISUAL_INSPECTION_DEFINITIONS = [
  { netaSection: '7.1.1.1', description: 'Physical and mechanical condition' },
  { netaSection: '7.1.1.2', description: 'Anchorage, alignment, grounding' },
  { netaSection: '7.1.1.3', description: 'Bolted electrical connections' },
  { netaSection: '7.1.1.4', description: 'Cleanliness' },
  { netaSection: '7.1.1.5', description: 'Shipping braces and circuit-switcher removable supports' },
  { netaSection: '7.1.1.6', description: 'Arc chute assemblies' },
  { netaSection: '7.1.1.7', description: 'Blade alignment and blade penetration' },
  { netaSection: '7.1.1.8', description: 'Mechanical operator' },
  { netaSection: '7.1.1.9', description: 'Fuse linkage and fuse carriers' },
  { netaSection: '7.1.1.10', description: 'Auxiliary devices' },
  { netaSection: '7.1.1.11', description: 'Mechanical interlocking systems' },
  { netaSection: '7.1.1.12', description: 'Lubrication of moving current-carrying parts' },
  { netaSection: '7.1.1.13', description: 'Lubrication of moving and sliding surfaces' },
  { netaSection: '7.1.1.14', description: 'Oil level' },
  { netaSection: '7.1.1.15', description: 'Oil leaks' },
  { netaSection: '7.1.1.16', description: 'Oil condition' }
];

const VISUAL_RESULTS_OPTIONS = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable"
];

const TEST_VOLTAGE_OPTIONS = [
  '250V',
  '500V',
  '1000V',
  '2500V',
  '5000V'
];

const DIELECTRIC_TEST_VOLTAGE_OPTIONS = [
  '1.6 kVAC',
  '2.2 kVAC',
  '14 kVAC',
  '25 kVAC',
  '27 kVAC',
  '30 kVAC',
  '37 kVAC',
  '45 kVAC',
  '60 kVAC',
  '120 kVAC',
  '2.3 kVDC',
  '3.1 kVDC',
  '20 kVDC',
  '30.5 kVDC',
  '37.5 kVDC'
];

const INSULATION_UNITS_OPTIONS = ['kΩ', 'MΩ', 'GΩ'];
const CONTACT_RESISTANCE_UNITS_OPTIONS = ['μΩ', 'mΩ', 'Ω'];
const DIELECTRIC_UNITS_OPTIONS = ['μA', 'mA'];
const EQUIPMENT_EVALUATION_OPTIONS = ['PASS', 'FAIL', 'LIMITED SERVICE'];

// Complete TCF table with all values
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
  // Round to nearest integer since our table uses whole numbers
  const roundedCelsius = Math.round(celsius);
  
  // Convert to string for table lookup
  const key = roundedCelsius.toString();
  
  // If exact temperature exists in table, return that value
  if (tcfTable[key] !== undefined) {
    return tcfTable[key];
  }
  
  // If temperature is outside our table range, return closest value
  if (roundedCelsius < -24) return tcfTable['-24'];
  if (roundedCelsius > 110) return tcfTable['110'];
  
  // If temperature is between table values, interpolate
  const lowerKey = Math.floor(celsius).toString();
  const upperKey = Math.ceil(celsius).toString();
  
  if (tcfTable[lowerKey] !== undefined && tcfTable[upperKey] !== undefined) {
    const lowerValue = tcfTable[lowerKey];
    const upperValue = tcfTable[upperKey];
    const fraction = celsius - Math.floor(celsius);
    return lowerValue + (upperValue - lowerValue) * fraction;
  }
  
  // Fallback to 1.0 if something goes wrong
  return 1.0;
};

// Temperature conversion
const fahrenheitToCelsius = (fahrenheit: number): number => {
  return (fahrenheit - 32) * (5 / 9);
};

// Initial state setup
const initialWaySectionInsulation: InsulationResistance = {
  ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: 'MΩ', testVoltage: '5000V'
};
const initialCorrectedWaySectionInsulation: CorrectedInsulationResistance = {
  ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: 'MΩ', testVoltage: '5000V'
};
const initialWaySectionContact: ContactResistance = {
  aPhase: '', aGround: '', bPhase: '', bGround: '', cPhase: '', cGround: '', units: 'µΩ'
};

// Add these CSS classes near the top of the file, after the interfaces and before the component
const tableStyles = {
  container: "w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700",
  table: "w-full min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700",
  headerCell: "px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-normal",
  cell: "px-2 py-2 text-sm text-gray-900 dark:text-white whitespace-normal",
  input: "w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white",
  select: "w-full text-sm rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white"
};

export default function MediumVoltageSwitchOilReport() {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // Print Mode Detection
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  
  const [isEditMode, setIsEditMode] = useState(!reportId);

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'medium-voltage-switch-oil-report'; // This component handles the medium-voltage-switch-oil-report route
  const reportName = getReportName(reportSlug);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<'PASS' | 'FAIL' | 'LIMITED SERVICE'>('PASS');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    // Job Information
    customer: '',
    address: '',
    technicians: '',
    date: new Date().toISOString().split('T')[0],
    jobNumber: '',
    identifier: '',
    substation: '',
    eqptLocation: '',

    // Nameplate Data
    nameplate_manufacturer: '',
    nameplate_catalogNo: '',
    nameplate_serialNumber: '',
    nameplate_dateOfMfg: '',
    nameplate_type: '',
    nameplate_systemVoltage: '',
    nameplate_ratedVoltage: '',
    nameplate_ratedCurrent: '',
    nameplate_aicRating: '',
    nameplate_impulseLevelBIL: '',

    // VFI Data
    vfiData: { manufacturer: '', catalogNo: '', type: '', ratedVoltage: '', ratedCurrent: '', aicRating: '' },

    // Environmental Data
    temperature: 68,
    humidity: 50,

    // Visual Inspection Results - Initialize with default values
    visualInspectionResults: VISUAL_INSPECTION_DEFINITIONS.map(def => ({
      netaSection: def.netaSection,
      description: def.description,
      result: 'Select One'
    })),

    s1_insulationResistance: { ...initialWaySectionInsulation },
    s2_insulationResistance: { ...initialWaySectionInsulation },
    t1_insulationResistance: { ...initialWaySectionInsulation },
    t2_insulationResistance: { ...initialWaySectionInsulation },
    t3_insulationResistance: { ...initialWaySectionInsulation },

    s1_correctedInsulationResistance: { ...initialCorrectedWaySectionInsulation },
    s2_correctedInsulationResistance: { ...initialCorrectedWaySectionInsulation },
    t1_correctedInsulationResistance: { ...initialCorrectedWaySectionInsulation },
    t2_correctedInsulationResistance: { ...initialCorrectedWaySectionInsulation },
    t3_correctedInsulationResistance: { ...initialCorrectedWaySectionInsulation },

    s1_contactResistance: { ...initialWaySectionContact },
    s2_contactResistance: { ...initialWaySectionContact },
    t1_contactResistance: { ...initialWaySectionContact },
    t2_contactResistance: { ...initialWaySectionContact },
    t3_contactResistance: { ...initialWaySectionContact },

    dielectricWaySectionTests: [
      { waySection: 'S1-S2', testVoltageApplied: '30 KVAC', ag: '', bg: '', cg: '', units: 'mA', duration: 60, result: 'N/A' },
      { waySection: 'S1-T1', testVoltageApplied: '30 KVAC', ag: '', bg: '', cg: '', units: 'mA', duration: 60, result: 'N/A' },
      { waySection: 'S1-T2', testVoltageApplied: '30 KVAC', ag: '', bg: '', cg: '', units: 'mA', duration: 60, result: 'N/A' },
      { waySection: 'S1-T3', testVoltageApplied: '30 KVAC', ag: '', bg: '', cg: '', units: 'mA', duration: 60, result: 'N/A' }
    ],
    dielectricVFITests: [
      {
        vfiIdentifier: '',
        serialNumber: '',
        counterAsFound: '',
        counterAsLeft: '',
        vacuumIntegrityA: '',
        vacuumIntegrityB: '',
        resultC: '',
        unitsC: 'mA'
      }
    ],

    testEquipment_megohmmeter_megger: '',
    testEquipment_megohmmeter_serialNo: '',
    testEquipment_megohmmeter_ampId: '',
    testEquipment_lowResistance_model: '',
    testEquipment_lowResistance_serialNo: '',
    testEquipment_lowResistance_ampId: '',
    testEquipment_hipot_model: '',
    testEquipment_hipot_serialNo: '',
    testEquipment_hipot_ampId: '',

    comments: ''
  });

  // Load existing report data
  useEffect(() => {
    const loadReport = async () => {
      if (!reportId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('medium_voltage_switch_oil_reports')
          .select('*')
          .eq('id', reportId)
          .single();

        if (error) throw error;

        if (data && data.report_info) {
          // Initialize form data with loaded report data
          setFormData({
            ...formData,  // Keep default values as fallback
            ...data.report_info,  // Spread the loaded data
            // Ensure visual inspection results exist
            visualInspectionResults: data.report_info.visualInspectionResults || VISUAL_INSPECTION_DEFINITIONS.map(def => ({
              netaSection: def.netaSection,
              description: def.description,
              result: 'Select One'
            }))
          });
        }
      } catch (error) {
        console.error('Error loading report:', error);
        setError(`Failed to load report: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [reportId]);

  // Load job information
  useEffect(() => {
    const loadJobInfo = async () => {
      if (!jobId) return;

      try {
        const { data: jobData, error: jobError } = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select(`
            title,
            job_number,
            customer_id
          `)
          .eq('id', jobId)
          .single();

        if (jobError) throw jobError;

        if (jobData?.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select(`
              name,
              company_name,
              address
            `)
            .eq('id', jobData.customer_id)
            .single();

          if (!customerError && customerData) {
            setFormData(prev => ({
              ...prev,
              customer: customerData.company_name || customerData.name,
              address: customerData.address,
              jobNumber: jobData.job_number
            }));
          }
        }
      } catch (error) {
        console.error('Error loading job info:', error);
        setError('Failed to load job information');
      }
    };

    loadJobInfo();
  }, [jobId]);

  // Handle form field changes
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle nested field changes for simple object properties
  const handleNestedObjectFieldChange = <K extends keyof FormData>(
    sectionName: K,
    field: keyof FormData[K], // Ensures field is a key of the object sectionName points to
    value: any // FormData[K][keyof FormData[K]]
  ) => {
    setFormData(prev => {
      const sectionData = prev[sectionName];
      // Ensure the section is an object and not null before trying to spread it
      if (typeof sectionData === 'object' && sectionData !== null) {
        return {
          ...prev,
          [sectionName]: {
            ...(sectionData as object), // Type assertion to satisfy spread
            [field]: value,
          },
        };
      }
      // Optionally, handle cases where sectionData is not an object as expected
      console.warn(`Attempted to set field '''${String(field)}''' on a non-object section '''${String(sectionName)}'''.`);
      return prev;
    });
  };

  // Handle saving the report
  const handleSave = async () => {
    console.log('Save button clicked');
    console.log('Current state:', { jobId, user, isEditMode, isSaving });
    
    if (!jobId || !user?.id || !isEditMode) {
      console.log('Save prevented due to:', { jobId, userId: user?.id, isEditMode });
      return;
    }

    setIsSaving(true);
    try {
      console.log('Preparing report data...');
      const reportData = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          customer: formData.customer,
          address: formData.address,
          technicians: formData.technicians,
          date: formData.date,
          jobNumber: formData.jobNumber,
          identifier: formData.identifier,
          substation: formData.substation,
          eqptLocation: formData.eqptLocation,
          temperature: formData.temperature,
          humidity: formData.humidity,
          // Nameplate data
          manufacturer: formData.nameplate_manufacturer,
          catalogNo: formData.nameplate_catalogNo,
          serialNumber: formData.nameplate_serialNumber,
          dateOfMfg: formData.nameplate_dateOfMfg,
          type: formData.nameplate_type,
          systemVoltage: formData.nameplate_systemVoltage,
          ratedVoltage: formData.nameplate_ratedVoltage,
          ratedCurrent: formData.nameplate_ratedCurrent,
          aicRating: formData.nameplate_aicRating,
          impulseLevelBIL: formData.nameplate_impulseLevelBIL,
          vfiData: formData.vfiData,
          visualInspectionResults: formData.visualInspectionResults
        },
        visual_mechanical_inspection: {
          items: formData.visualInspectionResults
        },
        insulation_resistance_measured: {
          s1: formData.s1_insulationResistance,
          s2: formData.s2_insulationResistance,
          t1: formData.t1_insulationResistance,
          t2: formData.t2_insulationResistance,
          t3: formData.t3_insulationResistance
        },
        temp_corrected_insulation: {
          s1: formData.s1_correctedInsulationResistance,
          s2: formData.s2_correctedInsulationResistance,
          t1: formData.t1_correctedInsulationResistance,
          t2: formData.t2_correctedInsulationResistance,
          t3: formData.t3_correctedInsulationResistance
        },
        contact_resistance: {
          s1: formData.s1_contactResistance,
          s2: formData.s2_contactResistance,
          t1: formData.t1_contactResistance,
          t2: formData.t2_contactResistance,
          t3: formData.t3_contactResistance
        },
        dielectric_s1s2: formData.dielectricWaySectionTests.find(t => t.waySection === 'S1-S2'),
        dielectric_s1t1: formData.dielectricWaySectionTests.find(t => t.waySection === 'S1-T1'),
        dielectric_s1t2: formData.dielectricWaySectionTests.find(t => t.waySection === 'S1-T2'),
        dielectric_s1t3: formData.dielectricWaySectionTests.find(t => t.waySection === 'S1-T3'),
        vfi_test_rows: formData.dielectricVFITests,
        test_equipment: {
          megohmmeter: {
            model: formData.testEquipment_megohmmeter_megger,
            serialNumber: formData.testEquipment_megohmmeter_serialNo,
            ampId: formData.testEquipment_megohmmeter_ampId
          },
          lowResistance: {
            model: formData.testEquipment_lowResistance_model,
            serialNumber: formData.testEquipment_lowResistance_serialNo,
            ampId: formData.testEquipment_lowResistance_ampId
          },
          hipot: {
            model: formData.testEquipment_hipot_model,
            serialNumber: formData.testEquipment_hipot_serialNo,
            ampId: formData.testEquipment_hipot_ampId
          }
        },
        comments: formData.comments,
        status: status
      };

      console.log('Attempting to save report...', { isUpdate: !!reportId });
      let result;
      if (reportId) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from('medium_voltage_switch_oil_reports')
          .update(reportData)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        // Create new report
        result = await supabase
          .schema('neta_ops')
          .from('medium_voltage_switch_oil_reports')
          .insert(reportData)
          .select()
          .single();

        console.log('New report created:', result);

        // Create asset entry for the report
        if (result.data) {
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/medium-voltage-switch-oil-report/${result.data.id}`,
            user_id: user.id
          };

          console.log('Creating asset entry:', assetData);
          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();

          if (assetError) throw assetError;

          console.log('Asset created:', assetResult);

          // Link asset to job
          await supabase
            .schema('neta_ops')
            .from('job_assets')
            .insert({
              job_id: jobId,
              asset_id: assetResult.id,
              user_id: user.id
            });
          
          console.log('Asset linked to job');
        }
      }

      if (result.error) throw result.error;

      setIsEditMode(false);
      alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, jobId, location);
    } catch (error: any) {
      console.error('Error saving report:', error);
      alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Recalculate corrected insulation resistance values when temperature or measured values change
  useEffect(() => {
    const tempC = fahrenheitToCelsius(formData.temperature);
    const currentTcf = getTCF(tempC);

    const wayKeys = ['s1', 's2', 't1', 't2', 't3'] as const;
    const updates: Partial<FormData> = {};

    wayKeys.forEach(wayKey => {
      const measuredKey = `${wayKey}_insulationResistance` as const;
      const correctedKey = `${wayKey}_correctedInsulationResistance` as const;
      const measuredData = formData[measuredKey];

      if (measuredData) {
        const calculateCorrectedValue = (value: string | number): string | number => {
          // If the value is a number or can be converted to a number, apply TCF
          const numValue = typeof value === 'number' ? value : Number(value);
          if (!isNaN(numValue)) {
            return (numValue * currentTcf).toFixed(3); // Format to 3 decimal places
          }
          return value; // Return original value if not a number
        };

        updates[correctedKey] = {
          ...measuredData,
          ag: calculateCorrectedValue(measuredData.ag),
          bg: calculateCorrectedValue(measuredData.bg),
          cg: calculateCorrectedValue(measuredData.cg),
          ab: calculateCorrectedValue(measuredData.ab),
          bc: calculateCorrectedValue(measuredData.bc),
          ca: calculateCorrectedValue(measuredData.ca),
          lineA: calculateCorrectedValue(measuredData.lineA),
          lineB: calculateCorrectedValue(measuredData.lineB),
          lineC: calculateCorrectedValue(measuredData.lineC),
          units: measuredData.units,
          testVoltage: measuredData.testVoltage
        } as CorrectedInsulationResistance;
      }
    });

    if (Object.keys(updates).length > 0) {
      setFormData(prev => ({ ...prev, ...updates }));
    }
  }, [formData.temperature, 
      formData.s1_insulationResistance, formData.s2_insulationResistance, 
      formData.t1_insulationResistance, formData.t2_insulationResistance, 
      formData.t3_insulationResistance]);

  // Render header function
  const renderHeader = () => (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (isEditMode) {
              const nextStatus = status === 'PASS' ? 'FAIL' : status === 'FAIL' ? 'LIMITED SERVICE' : 'PASS';
              setStatus(nextStatus);
            }
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            status === 'PASS'
              ? 'bg-green-600 text-white focus:ring-green-500 hover:bg-green-700'
              : status === 'FAIL'
              ? 'bg-red-600 text-white focus:ring-red-500 hover:bg-red-700'
              : 'bg-yellow-500 text-black focus:ring-yellow-400 hover:bg-yellow-600'
          } ${!isEditMode ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {status}
        </button>

        {reportId && !isEditMode ? (
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
            disabled={!isEditMode || isSaving}
            className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditMode ? 'hidden' : 'hover:bg-orange-700 disabled:opacity-50'}`}
          >
            {isSaving ? 'Saving...' : reportId ? 'Update Report' : 'Save Report'}
          </button>
        )}
      </div>
    </div>
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA
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
                border: status === 'PASS' ? '2px solid #16a34a' : status === 'FAIL' ? '2px solid #dc2626' : '2px solid #ca8a04',
                backgroundColor: status === 'PASS' ? '#22c55e' : status === 'FAIL' ? '#ef4444' : '#eab308',
                color: 'white',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
                boxSizing: 'border-box',
                minWidth: '50px',
              }}
            >
              {status || 'PASS'}
            </div>
          </div>
        </div>
      </div>
      {/* End Print Header */}
      
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            {renderHeader()}
          </div>

        {/* Job Information */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            Job Information
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Customer
              </label>
              <input
                type="text"
                value={formData.customer}
                onChange={(e) => handleChange('customer', e.target.value)}
                readOnly={!isEditMode}
                className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Job #
              </label>
              <input
                type="text"
                value={formData.jobNumber}
                onChange={(e) => handleChange('jobNumber', e.target.value)}
                readOnly={!isEditMode}
                className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                readOnly={!isEditMode}
                className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Identifier
              </label>
              <input
                type="text"
                value={formData.identifier}
                onChange={(e) => handleChange('identifier', e.target.value)}
                readOnly={!isEditMode}
                className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Technicians
              </label>
              <input
                type="text"
                value={formData.technicians}
                onChange={(e) => handleChange('technicians', e.target.value)}
                readOnly={!isEditMode}
                className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Substation
              </label>
              <input
                type="text"
                value={formData.substation}
                onChange={(e) => handleChange('substation', e.target.value)}
                readOnly={!isEditMode}
                className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => handleChange('date', e.target.value)}
                readOnly={!isEditMode}
                className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Eqpt. Location
              </label>
              <input
                type="text"
                value={formData.eqptLocation}
                onChange={(e) => handleChange('eqptLocation', e.target.value)}
                readOnly={!isEditMode}
                className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div className="flex gap-4 items-start">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Temperature
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={formData.temperature}
                    onChange={(e) => handleChange('temperature', Number(e.target.value))}
                    readOnly={!isEditMode}
                    className={`block w-20 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                  <span className="text-gray-600 dark:text-gray-400">°F</span>
                  <input
                    type="number"
                    value={((formData.temperature - 32) * 5/9).toFixed(0)}
                    readOnly
                    className="block w-16 rounded-md border-gray-300 dark:border-gray-700 shadow-sm bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-gray-400 text-base"
                  />
                  <span className="text-gray-600 dark:text-gray-400">°C</span>
                  <span className="text-gray-600 dark:text-gray-400 ml-4">TCF</span>
                  <input
                    type="number"
                    value={getTCF(fahrenheitToCelsius(formData.temperature))}
                    readOnly
                    className="block w-16 rounded-md border-gray-300 dark:border-gray-700 shadow-sm bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-gray-400 text-base"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Humidity
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={formData.humidity}
                    onChange={(e) => handleChange('humidity', Number(e.target.value))}
                    readOnly={!isEditMode}
                    className={`block w-20 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white text-base ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                  <span className="text-gray-600 dark:text-gray-400">%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Nameplate Data Section */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            Nameplate Data
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label className="form-label">Manufacturer</label>
              <input type="text" value={formData.nameplate_manufacturer} onChange={(e) => handleChange('nameplate_manufacturer', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">System Voltage (kV)</label>
              <input type="text" value={formData.nameplate_systemVoltage} onChange={(e) => handleChange('nameplate_systemVoltage', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Catalog No.</label>
              <input type="text" value={formData.nameplate_catalogNo} onChange={(e) => handleChange('nameplate_catalogNo', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Rated Voltage (kV)</label>
              <input type="text" value={formData.nameplate_ratedVoltage} onChange={(e) => handleChange('nameplate_ratedVoltage', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Serial Number</label>
              <input type="text" value={formData.nameplate_serialNumber} onChange={(e) => handleChange('nameplate_serialNumber', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Rated Current (A)</label>
              <input type="text" value={formData.nameplate_ratedCurrent} onChange={(e) => handleChange('nameplate_ratedCurrent', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Date of Mfg.</label>
              <input type="text" value={formData.nameplate_dateOfMfg} onChange={(e) => handleChange('nameplate_dateOfMfg', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">AIC Rating (kA)</label>
              <input type="text" value={formData.nameplate_aicRating} onChange={(e) => handleChange('nameplate_aicRating', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Type</label>
              <input type="text" value={formData.nameplate_type} onChange={(e) => handleChange('nameplate_type', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Impulse Level (BIL)</label>
              <input type="text" value={formData.nameplate_impulseLevelBIL} onChange={(e) => handleChange('nameplate_impulseLevelBIL', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
          </div>
        </section>

        {/* VFI Data Section */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            VFI Data
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label className="form-label">Manufacturer</label>
              <input type="text" value={formData.vfiData.manufacturer} onChange={(e) => handleChange('vfiData', { ...formData.vfiData, manufacturer: e.target.value })} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Rated Voltage (kV)</label>
              <input type="text" value={formData.vfiData.ratedVoltage} onChange={(e) => handleChange('vfiData', { ...formData.vfiData, ratedVoltage: e.target.value })} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Catalog No.</label>
              <input type="text" value={formData.vfiData.catalogNo} onChange={(e) => handleChange('vfiData', { ...formData.vfiData, catalogNo: e.target.value })} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Rated Current (A)</label>
              <input type="text" value={formData.vfiData.ratedCurrent} onChange={(e) => handleChange('vfiData', { ...formData.vfiData, ratedCurrent: e.target.value })} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Type</label>
              <input type="text" value={formData.vfiData.type} onChange={(e) => handleChange('vfiData', { ...formData.vfiData, type: e.target.value })} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">AIC Rating (kA)</label>
              <input type="text" value={formData.vfiData.aicRating} onChange={(e) => handleChange('vfiData', { ...formData.vfiData, aicRating: e.target.value })} readOnly={!isEditMode} className="form-input" />
            </div>
          </div>
        </section>

        {/* Insulation Resistance Section */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          {/* Measured Values Table */}
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            Electrical Tests - Measured Insulation Resistance Values
          </h2>
          <div className="mb-4">
            <div className="flex items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">INSULATION RESISTANCE TEST VOLTAGE:</span>
              <input 
                type="text" 
                          value={formData.s1_insulationResistance.testVoltage}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            const wayKeys = ['s1', 's2', 't1', 't2', 't3'] as const;
                            const updates: Partial<FormData> = {};
                            wayKeys.forEach(wayKey => {
                              const key = `${wayKey}_insulationResistance` as const;
                              updates[key] = {
                                ...formData[key],
                                testVoltage: newValue
                              };
                            });
                            setFormData(prev => ({ ...prev, ...updates }));
                          }}
                readOnly={!isEditMode}
                className="w-20 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm"
              />
                      </div>
                    </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '60px' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: '50px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">WAY SECTION</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A-G</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B-G</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C-G</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A-B</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B-C</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C-A</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">UNITS</th>
                </tr>
              </thead>
              <tbody>
                {(['s1', 's2', 't1', 't2', 't3'] as const).map((wayKey) => {
                  const dataKey = `${wayKey}_insulationResistance` as const;
                  const currentData = formData[dataKey];
                  const handleInsulationChange = (field: keyof InsulationResistance, value: string | number) => {
                    handleChange(dataKey, { ...currentData, [field]: value });
                  };
                  return (
                    <tr key={wayKey}>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs font-medium">{wayKey.toUpperCase()}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.ag} onChange={(e) => handleInsulationChange('ag', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.bg} onChange={(e) => handleInsulationChange('bg', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.cg} onChange={(e) => handleInsulationChange('cg', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.ab} onChange={(e) => handleInsulationChange('ab', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.bc} onChange={(e) => handleInsulationChange('bc', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.ca} onChange={(e) => handleInsulationChange('ca', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.lineA} onChange={(e) => handleInsulationChange('lineA', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.lineB} onChange={(e) => handleInsulationChange('lineB', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.lineC} onChange={(e) => handleInsulationChange('lineC', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs">{currentData.units}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Temperature Corrected Values Table */}
          <h2 className="text-xl font-semibold my-6 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            Electrical Tests - Temperature Corrected Insulation Resistance Values
          </h2>
          <div className="mb-4">
            <div className="flex items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">INSULATION RESISTANCE TEST VOLTAGE: {formData.s1_insulationResistance.testVoltage}</span>
                      </div>
                    </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '60px' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: '50px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">WAY SECTION</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A-G</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B-G</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C-G</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A-B</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B-C</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C-A</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">UNITS</th>
                </tr>
              </thead>
              <tbody>
                {(['s1', 's2', 't1', 't2', 't3'] as const).map((wayKey) => {
                  const dataKey = `${wayKey}_correctedInsulationResistance` as const;
                  const currentData = formData[dataKey];
                  return (
                    <tr key={wayKey}>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs font-medium">{wayKey.toUpperCase()}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-sm">{currentData.ag}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-sm">{currentData.bg}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-sm">{currentData.cg}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-sm">{currentData.ab}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-sm">{currentData.bc}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-sm">{currentData.ca}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-sm">{currentData.lineA}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-sm">{currentData.lineB}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-sm">{currentData.lineC}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs">{currentData.units}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Contact Resistance Section */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            Contact Resistance μΩ
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '60px' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: '50px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">WAY SECTION</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A-PHASE</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A-GROUND</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B-PHASE</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B-GROUND</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C-PHASE</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C-GROUND</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">UNITS</th>
                </tr>
              </thead>
              <tbody>
                {(['s1', 's2', 't1', 't2', 't3'] as const).map((wayKey) => {
                  const dataKey = `${wayKey}_contactResistance` as const;
                  const currentData = formData[dataKey];
                  const handleContactResistanceChange = (field: keyof ContactResistance, value: string | number) => {
                    handleChange(dataKey, { ...currentData, [field]: value });
                  };
                  return (
                    <tr key={wayKey}>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs font-medium">{wayKey.toUpperCase()}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.aPhase} onChange={(e) => handleContactResistanceChange('aPhase', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                        </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.aGround} onChange={(e) => handleContactResistanceChange('aGround', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.bPhase} onChange={(e) => handleContactResistanceChange('bPhase', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.bGround} onChange={(e) => handleContactResistanceChange('bGround', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.cPhase} onChange={(e) => handleContactResistanceChange('cPhase', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input type="text" value={currentData.cGround} onChange={(e) => handleContactResistanceChange('cGround', e.target.value)} readOnly={!isEditMode} className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm" />
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs">{currentData.units}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Dielectric Withstand Tests Section */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            Electrical Tests - Dielectric Withstand
          </h2>
          
          {/* Part 1: Way Section Tests */}
          <h3 className="text-lg font-semibold my-3 text-gray-800 dark:text-gray-200">Dielectric Withstand</h3>
          <div className="mb-4">
            <div className="flex items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">DIELECTRIC WITHSTAND TEST VOLTAGE:</span>
              <input 
                type="text" 
                          value={formData.dielectricWaySectionTests[0]?.testVoltageApplied || '30 KVAC'}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            const updatedTests = formData.dielectricWaySectionTests.map(test => ({
                              ...test,
                              testVoltageApplied: newValue
                            }));
                            handleChange('dielectricWaySectionTests', updatedTests);
                          }}
                readOnly={!isEditMode}
                className="w-20 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm"
              />
                      </div>
                    </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '60px' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: '50px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">WAY SECTION</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A-G</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B-G</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C-G</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">UNITS</th>
                </tr>
              </thead>
              <tbody>
                {formData.dielectricWaySectionTests.map((test, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs font-medium">{test.waySection}</td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={test.ag}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricWaySectionTests];
                          newTests[index].ag = e.target.value;
                          handleChange('dielectricWaySectionTests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={test.bg}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricWaySectionTests];
                          newTests[index].bg = e.target.value;
                          handleChange('dielectricWaySectionTests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={test.cg}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricWaySectionTests];
                          newTests[index].cg = e.target.value;
                          handleChange('dielectricWaySectionTests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs">{test.units}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Dielectric Withstand - VFI specific tests (bottom table in image) */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            Electrical Tests - Dielectric Withstand - VFI specific tests
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '80px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '60px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700"></th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700"></th>
                  <th colSpan={2} className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">Counter</th>
                  <th colSpan={3} className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">Vacuum Integrity (VFI Open)</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700"></th>
                </tr>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">VFI</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">Serial Number</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">As-Found</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">As-Left</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">A</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">B</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">C</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">Units</th>
                </tr>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700"></th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700"></th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700"></th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700"></th>
                  <th colSpan={3} className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700">Test Voltage: 30 KVAC</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-sm font-medium bg-gray-100 dark:bg-gray-700"></th>
                </tr>
              </thead>
              <tbody>
                {formData.dielectricVFITests.map((vfiTest, index) => (
                  <tr key={index}>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={vfiTest.vfiIdentifier}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricVFITests];
                          newTests[index].vfiIdentifier = e.target.value;
                          handleChange('dielectricVFITests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={vfiTest.serialNumber}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricVFITests];
                          newTests[index].serialNumber = e.target.value;
                          handleChange('dielectricVFITests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={vfiTest.counterAsFound}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricVFITests];
                          newTests[index].counterAsFound = e.target.value;
                          handleChange('dielectricVFITests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={vfiTest.counterAsLeft}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricVFITests];
                          newTests[index].counterAsLeft = e.target.value;
                          handleChange('dielectricVFITests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={vfiTest.vacuumIntegrityA}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricVFITests];
                          newTests[index].vacuumIntegrityA = e.target.value;
                          handleChange('dielectricVFITests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={vfiTest.vacuumIntegrityB}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricVFITests];
                          newTests[index].vacuumIntegrityB = e.target.value;
                          handleChange('dielectricVFITests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input
                        type="text"
                        value={vfiTest.resultC}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricVFITests];
                          newTests[index].resultC = e.target.value;
                          handleChange('dielectricVFITests', newTests);
                        }}
                        readOnly={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <select
                        value={vfiTest.unitsC}
                        onChange={(e) => {
                          const newTests = [...formData.dielectricVFITests];
                          newTests[index].unitsC = e.target.value as 'mA' | 'µA';
                          handleChange('dielectricVFITests', newTests);
                        }}
                        disabled={!isEditMode}
                        className="w-full h-6 text-center border-none bg-transparent focus:outline-none text-sm"
                      >
                        <option value="mA">mA</option>
                        <option value="µA">µA</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isEditMode && (
              <button
                type="button"
                onClick={() => {
                  const newVFITestEntry: DielectricVFITestData = {
                    vfiIdentifier: '',
                    serialNumber: '',
                    counterAsFound: '',
                    counterAsLeft: '',
                    vacuumIntegrityA: '',
                    vacuumIntegrityB: '',
                    resultC: '',
                    unitsC: 'mA'
                  };
                  handleChange('dielectricVFITests', [...formData.dielectricVFITests, newVFITestEntry]);
                }}
                className="mt-2 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md"
              >
                Add VFI Test Entry
              </button>
            )}
          </div>
        </section>

        {/* Test Equipment Section */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            Test Equipment Used
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mb-4">
            <div>
              <label className="form-label">Megohmmeter - Megger</label>
              <input type="text" value={formData.testEquipment_megohmmeter_megger} onChange={(e) => handleChange('testEquipment_megohmmeter_megger', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Serial Number</label>
              <input type="text" value={formData.testEquipment_megohmmeter_serialNo} onChange={(e) => handleChange('testEquipment_megohmmeter_serialNo', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">AMP ID</label>
              <input type="text" value={formData.testEquipment_megohmmeter_ampId} onChange={(e) => handleChange('testEquipment_megohmmeter_ampId', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mb-4">
            <div>
              <label className="form-label">Low Resistance - Model</label>
              <input type="text" value={formData.testEquipment_lowResistance_model} onChange={(e) => handleChange('testEquipment_lowResistance_model', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Serial Number</label>
              <input type="text" value={formData.testEquipment_lowResistance_serialNo} onChange={(e) => handleChange('testEquipment_lowResistance_serialNo', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">AMP ID</label>
              <input type="text" value={formData.testEquipment_lowResistance_ampId} onChange={(e) => handleChange('testEquipment_lowResistance_ampId', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div>
              <label className="form-label">Hipot - Model</label>
              <input type="text" value={formData.testEquipment_hipot_model} onChange={(e) => handleChange('testEquipment_hipot_model', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">Serial Number</label>
              <input type="text" value={formData.testEquipment_hipot_serialNo} onChange={(e) => handleChange('testEquipment_hipot_serialNo', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
            <div>
              <label className="form-label">AMP ID</label>
              <input type="text" value={formData.testEquipment_hipot_ampId} onChange={(e) => handleChange('testEquipment_hipot_ampId', e.target.value)} readOnly={!isEditMode} className="form-input" />
            </div>
          </div>
        </section>

        {/* Comments Section */}
        <section className="mb-6">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">
            Comments
          </h2>
          <textarea
            value={formData.comments}
            onChange={(e) => handleChange('comments', e.target.value)}
            readOnly={!isEditMode}
            rows={4}
            className="form-input w-full"
            placeholder="Enter any comments here..."
          />
        </section>
        </div>
      </div>
    </ReportWrapper>
  );
}

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
      
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
      
      .print\\:break-before-page { page-break-before: always; }
      .print\\:break-after-page { page-break-after: always; }
      .print\\:break-inside-avoid { page-break-inside: avoid; }
      .print\\:text-black { color: black !important; }
      .print\\:bg-white { background-color: white !important; }
      .print\\:border-black { border-color: black !important; }
      .print\\:font-bold { font-weight: bold !important; }
      .print\\:text-center { text-align: center !important; }
      
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid black !important; padding: 4px !important; }
      th { background-color: #f0f0f0 !important; font-weight: bold !important; }
      
      input, select, textarea { 
        background-color: white !important; 
        border: 1px solid black !important; 
        color: black !important;
        padding: 2px !important; 
        font-size: 10px !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
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
      
      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }
      
      /* Section styling */
      section { break-inside: avoid !important; margin-bottom: 20px !important; }
      
      /* Table column sizing for print */
      table {
        table-layout: fixed !important;
        width: 100% !important;
      }

      /* WAY SECTION column - make it narrow */
      table th:first-child,
      table td:first-child {
        width: 80px !important;
        max-width: 80px !important;
        min-width: 80px !important;
      }

      /* Reading input fields - make them wider */
      table td:not(:first-child):not(:last-child) input {
        width: 100% !important;
        max-width: none !important;
        min-width: 60px !important;
      }

      /* UNITS column - keep it narrow */
      table th:last-child,
      table td:last-child {
        width: 60px !important;
        max-width: 60px !important;
        min-width: 60px !important;
      }
      
      /* Ensure all text is black for maximum readability */
      * { color: black !important; }
    }
  `;
  document.head.appendChild(style);
} 